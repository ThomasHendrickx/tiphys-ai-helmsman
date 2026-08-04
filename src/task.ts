import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Fleet } from "./fleet.ts";
import { leaseStatus } from "./lock.ts";

/**
 * Task state (kernel plan v1, M1-P4 step 1). A task's durable state is
 * <fleet>/tasks/<id>/, holding plain JSON per plan decision D-3:
 *
 *   meta.json    the task record written by spawn and closed by teardown
 *   brief.md     the assembled brief (src/brief.ts)
 *   turn-end     the payload's completion record (src/hooks.ts)
 *   executor.json the launch record written by the executor adapter
 *   report.md    a scout's report, the teardown gate for shape scout
 *
 * PLAN CONSTRAINT C-1 (FM-052, FM-049), binding on every consumer: the
 * ONE current-state authority for a task is meta.json's status plus the
 * turn-end file's recorded exit code. Currency is never derived from the
 * tail of an event or status log, and the turn-end file is a completion
 * NOTIFICATION, not the task's state: a missing turn-end never means
 * success (tuition T-002).
 *
 * The task directory deliberately sits OUTSIDE the worktree (FM-059), so
 * the pool's dirty check never needs an exemption list for the kernel's
 * own injected files. That invariant is absolute: nothing this phase
 * writes may ever land inside <fleet>/worktrees/<id>.
 */

export type TaskShape = "ship" | "scout";
export type TaskStatus = "open" | "closed";

export const TASK_SHAPES: readonly TaskShape[] = ["ship", "scout"];

/**
 * Task meta (the plan's field set, M1-P4 step 1).
 *
 * - id: the task id, a safe path segment (pool's TASK_ID_PATTERN).
 * - project: absolute path of the project clone the worktree came from.
 * - shape: ship or scout; it selects teardown's refusal rules.
 * - branch: the TASK branch (task/<id>), the branch teardown judges for
 *   landedness. Note the deliberate naming difference from the pool
 *   record, whose "branch" is the project's default branch and whose
 *   "branchName" is this one; meta records the branch the task works on.
 * - worktree: absolute path of the task worktree.
 * - baseSha: the fetched base SHA pool create emitted (EXT-F-03).
 * - baseOffline: provenance, COPIED from the pool record's offline field
 *   and never recomputed (PR-212). It is true only when the fetch failed
 *   and --offline authorized falling back to the last fetched
 *   remote-tracking SHA. A spawn that recomputed it from its own flags
 *   would report a fetched base as offline whenever a contended fetch
 *   succeeded on retry, which is exactly the provenance inversion V-2
 *   produced in M1-P3.
 * - status: open at spawn, closed by a successful teardown.
 * - createdAt: ISO-8601 timestamp of the spawn.
 */
export interface TaskMeta {
  id: string;
  project: string;
  shape: TaskShape;
  branch: string;
  worktree: string;
  baseSha: string;
  baseOffline: boolean;
  status: TaskStatus;
  createdAt: string;
}

export function taskDir(fleet: Fleet, taskId: string): string {
  return join(fleet.tasksDir, taskId);
}

export function metaPath(fleet: Fleet, taskId: string): string {
  return join(taskDir(fleet, taskId), "meta.json");
}

export function briefPath(fleet: Fleet, taskId: string): string {
  return join(taskDir(fleet, taskId), "brief.md");
}

export function turnEndPath(fleet: Fleet, taskId: string): string {
  return join(taskDir(fleet, taskId), "turn-end");
}

export function executorRecordPath(fleet: Fleet, taskId: string): string {
  return join(taskDir(fleet, taskId), "executor.json");
}

export function reportPath(fleet: Fleet, taskId: string): string {
  return join(taskDir(fleet, taskId), "report.md");
}

/** Serialize meta the way every kernel JSON state file is written. */
export function renderTaskMeta(meta: TaskMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

export function writeTaskMeta(fleet: Fleet, meta: TaskMeta): void {
  writeFileSync(metaPath(fleet, meta.id), renderTaskMeta(meta));
}

/** Read meta.json, or undefined when it is absent or does not parse. */
export function readTaskMeta(fleet: Fleet, taskId: string): TaskMeta | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metaPath(fleet, taskId), "utf8"));
  } catch {
    return undefined;
  }
  const candidate = parsed as Partial<TaskMeta>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.project !== "string" ||
    (candidate.shape !== "ship" && candidate.shape !== "scout") ||
    typeof candidate.branch !== "string" ||
    typeof candidate.worktree !== "string" ||
    typeof candidate.baseSha !== "string" ||
    typeof candidate.baseOffline !== "boolean" ||
    (candidate.status !== "open" && candidate.status !== "closed") ||
    typeof candidate.createdAt !== "string"
  ) {
    return undefined;
  }
  return candidate as TaskMeta;
}

/** Set meta.json status (teardown's last step; C-1's state authority). */
export function setTaskStatus(
  fleet: Fleet,
  meta: TaskMeta,
  status: TaskStatus,
): void {
  writeTaskMeta(fleet, { ...meta, status });
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

/**
 * Holdership guard for the task-mutating commands (PR-203), shared by
 * spawn and teardown so there is exactly one implementation of the rule.
 * It lives here rather than in a guard module of its own because this
 * phase's files-to-touch list has no shared-guard file and the rule is a
 * precondition of every task mutation.
 *
 * The transport is M1-P3's, unchanged and not re-invented: lock acquire
 * PRINTS the opaque holderId, the operator carries it, and here it
 * arrives as the TIPHYS_HOLDER_ID environment variable. No second
 * identity mechanism exists, and nothing about the holder is derived
 * from the running program (plan constraint C-2): this reads the lease
 * FILE and nothing else.
 *
 * With no lease file present the command proceeds (the plan's M1 test
 * contexts). A lease that exists but is unreadable, expired, or held by
 * a different holder refuses: fail closed, because every one of those
 * states means this caller cannot prove it is the one orchestrator.
 */
export function checkHoldership(fleet: Fleet): GuardResult {
  const status = leaseStatus(fleet.lockPath);
  if (status.state === "free") {
    return { ok: true };
  }
  if (status.state === "corrupt") {
    return {
      ok: false,
      reason: `lease file ${fleet.lockPath} exists but does not parse; refusing without provable holdership`,
    };
  }
  const holder = process.env.TIPHYS_HOLDER_ID;
  if (status.state === "expired") {
    return {
      ok: false,
      reason:
        `lease ${fleet.lockPath} expired ${status.lease.expiresAt} (holder ` +
        `${status.lease.holderId}); re-acquire or take over before mutating tasks`,
    };
  }
  if (holder === undefined || holder === "") {
    return {
      ok: false,
      reason:
        `lease ${fleet.lockPath} is held by ${status.lease.holderId} and ` +
        `TIPHYS_HOLDER_ID is not set; set it to the holder id lock acquire printed`,
    };
  }
  if (holder !== status.lease.holderId) {
    return {
      ok: false,
      reason:
        `lease ${fleet.lockPath} is held by ${status.lease.holderId}, not by ` +
        `TIPHYS_HOLDER_ID ${holder}`,
    };
  }
  return { ok: true };
}

/** True when the task directory already exists (spawn's rollback scope). */
export function taskDirExists(fleet: Fleet, taskId: string): boolean {
  return existsSync(taskDir(fleet, taskId));
}
