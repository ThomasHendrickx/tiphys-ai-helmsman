import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
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

/**
 * OPEN NOTHING WHOSE TYPE HAS NOT BEEN ESTABLISHED (fix round 4, CR-520).
 *
 * THE MECHANISM AND ITS RULE. Opening a path is not a total operation.
 * open(2) on a named pipe with no peer BLOCKS IN THE KERNEL, for reading
 * and for writing, until a peer appears. A block is not an exception, so
 * no try/catch sees it, no "this function never raises" reasoning touches
 * it, and no error classification reaches it. Every process that reaches
 * such an open stops forever with no output at all.
 *
 * This project has now paid for that mechanism three times in one phase:
 * once at tasks/<id>/meta.json (delta review NEW-2), then on six further
 * paths after the first fix was applied at ONE CALL SITE instead of at the
 * read (CR-520), then on four more this round found by deriving the
 * inventory again rather than inheriting it. The lesson recorded in
 * tuition T-005 is that a rule fixed at a call site does not travel; the
 * rule has to be a property of the operation.
 *
 * So the probe lives HERE, in the readers and in one classifier, and every
 * caller is protected by construction rather than by remembering:
 *
 *   - lstat the path (the link itself), then stat (what it resolves to),
 *     and open ONLY when that is a regular file;
 *   - a directory, FIFO, socket, device node, or a symlink resolving to
 *     any of those is classified WITHOUT being opened;
 *   - nothing at the path is not an error, because absence is the normal
 *     transient shape of most of this kernel's state files.
 *
 * WHY THIS LIVES IN src/task.ts. It is a general filesystem rule and not a
 * task rule, and a dedicated module would be its right home. This module
 * is the lowest one in the import graph that the fix round authorized to
 * touch (src/liveness.ts imports it, src/watcher.ts imports it, and it
 * imports neither), and it already carries one cross-cutting helper for
 * the same reason (runStep, below). Moving both to their own module is
 * recorded as an M2 item rather than done here without authorization.
 *
 * RESIDUAL, stated rather than papered over: the probe and the open are
 * two syscalls, so a path that changes type between them can still be
 * opened as something other than a regular file. Closing that needs
 * open(O_NONBLOCK) followed by fstat, which Node's synchronous fs API
 * does not expose for reads. Nothing in this kernel writes that state, and
 * the window is now the only way to reach the block rather than the
 * default path to it.
 */
export type EntryClass =
  /** Nothing at the path. */
  | { kind: "absent" }
  /** A link is there and resolves to nothing: it exists, and it is empty of evidence. */
  | { kind: "dangling" }
  /** Safe to open. */
  | { kind: "regular" }
  /** Present, and opening it is not safe: never opened, always named. */
  | { kind: "irregular"; reason: string }
  /** Neither lstat nor stat could answer the question. */
  | { kind: "unexaminable"; reason: string };

function describeType(stats: Stats): string {
  if (stats.isDirectory()) {
    return "a directory";
  }
  if (stats.isFIFO()) {
    return "a named pipe";
  }
  if (stats.isSocket()) {
    return "a socket";
  }
  if (stats.isCharacterDevice()) {
    return "a character device";
  }
  if (stats.isBlockDevice()) {
    return "a block device";
  }
  return "an entry of an unrecognized type";
}

/**
 * THE ONE ANSWER TO "may this path be opened". Every reader and every
 * writer of a path this kernel does not itself guarantee to be a regular
 * file goes through this, so there is one implementation of the question
 * and not one per call site.
 */
export function classifyEntry(path: string): EntryClass {
  try {
    lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "absent" };
    }
    return {
      kind: "unexaminable",
      reason: `${path} could not be examined: ${String(error)}`,
    };
  }
  let stats: Stats;
  try {
    stats = statSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "dangling" };
    }
    return {
      kind: "unexaminable",
      reason: `${path} could not be examined: ${String(error)}`,
    };
  }
  if (stats.isFile()) {
    return { kind: "regular" };
  }
  return {
    kind: "irregular",
    reason: `${path} is ${describeType(stats)}, not a regular file, so it was not opened`,
  };
}

/**
 * Refuse an open-for-WRITE of a path that is not a regular file. The
 * hazard is symmetric: open(2) for writing on a FIFO with no reader blocks
 * exactly as reading one with no writer does, so a staged write and an
 * append are as dangerous as a read. Returns the reason, or undefined when
 * the path may be opened (absent included: creating it is the point).
 */
export function refuseOpenForWrite(path: string): string | undefined {
  const entry = classifyEntry(path);
  if (entry.kind === "irregular" || entry.kind === "unexaminable") {
    return entry.reason;
  }
  return undefined;
}

/** What a guarded read of a possibly-absent path produced. */
export type RegularRead =
  | { kind: "read"; body: string }
  | { kind: "absent" }
  /** Present and not readable, with a reason naming the path. */
  | { kind: "refused"; reason: string };

/**
 * THE ONE READ of a file that might not be there and might not be a file.
 * src/task.ts, src/liveness.ts, src/watcher.ts and src/commands/doctor.ts
 * all read fleet state through this, so "probe before open" is a property
 * of the read and cannot be forgotten by a new caller.
 */
export function readRegularFileIfPresent(path: string): RegularRead {
  const entry = classifyEntry(path);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { kind: "absent" };
  }
  if (entry.kind === "irregular" || entry.kind === "unexaminable") {
    return { kind: "refused", reason: entry.reason };
  }
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Removed between the probe and the read.
      return { kind: "absent" };
    }
    return {
      kind: "refused",
      reason: `${path} could not be read: ${String(error)}`,
    };
  }
  return { kind: "read", body };
}

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

/**
 * Read meta.json, or undefined when it is absent, is not a regular file,
 * or does not parse. All three mean the same thing to every caller: this
 * is not a readable record, and it is not evidence that the task finished.
 *
 * The type probe is INSIDE this function and not in front of one of its
 * callers (CR-520, CR-521). There is exactly one implementation of "read a
 * task record", every caller of it is protected, and adding a caller
 * cannot reopen the hole: src/teardown.ts reaches this directly, without
 * going through the liveness classifier, and a named pipe here used to
 * hang it forever.
 */
export function readTaskMeta(fleet: Fleet, taskId: string): TaskMeta | undefined {
  const read = readRegularFileIfPresent(metaPath(fleet, taskId));
  if (read.kind !== "read") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
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

/**
 * True when tasks/<id>/ already holds a previous incarnation of the task
 * id, which spawn refuses (CR-301).
 *
 * The task directory is the DURABLE record: teardown removes the worktree
 * and the pool record but deliberately leaves tasks/<id>/ behind, so the
 * id is free from the pool's point of view and occupied from the task
 * state's. Spawning into it would overwrite the closed task's records,
 * hand the launch-failure rollback files it did not create, and leave the
 * previous incarnation's turn-end file readable while the new
 * incarnation's meta says open, which is a completion that did not happen
 * sitting under the C-1 state authority.
 *
 * A path that exists but is not a directory counts as occupied too: it is
 * not a state this kernel may write into, and refusing costs the operator
 * one rename while guessing could cost the record.
 */
export function taskDirOccupied(fleet: Fleet, taskId: string): boolean {
  const dir = taskDir(fleet, taskId);
  if (!existsSync(dir)) {
    return false;
  }
  try {
    if (!statSync(dir).isDirectory()) {
      return true;
    }
    return readdirSync(dir).length > 0;
  } catch {
    // Unreadable is not empty: fail closed.
    return true;
  }
}

/**
 * Collapse captured git or error output to ONE line (CR-303). Plan step 5 ends
 * "every refusal is exit nonzero plus a single reason line", and git's
 * own stderr is routinely five lines, so any interpolation of it must be
 * flattened rather than trusted to be short. The M1-P6 harness reads
 * these reason lines as evidence.
 */
export function singleLine(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("; ");
}

export type StepResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Run one step that may signal failure by THROWING, and fold a raised
 * error into the same ok/reason shape every other step in spawn and
 * teardown returns (F-1, F-2).
 *
 * This exists because the modules were written as a result type end to
 * end while the Node fs calls underneath them are not: writeFileSync and
 * mkdirSync raise. Every returned failure was handled correctly and every
 * THROWN one walked straight past the handler, out of the command, and
 * onto stderr as a stack trace, taking spawn's rollback and teardown's
 * state update with it. Wrapping is therefore not defensive decoration
 * for a state M1 never reaches: it is the difference between a rollback
 * that runs and an orphaned worktree, and between a task marked closed
 * and a meta.json that lies about a worktree that is already gone.
 *
 * It never swallows: the caller still gets a reason naming the step, and
 * still decides whether to roll back, report a partial failure, or refuse.
 */
export function runStep<T>(what: string, step: () => T): StepResult<T> {
  try {
    return { ok: true, value: step() };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `${what} failed: ${detail}` };
  }
}
