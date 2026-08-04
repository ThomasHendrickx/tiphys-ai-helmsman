import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Fleet } from "./fleet.ts";

/**
 * Worktree pool over a project clone (kernel plan v1, M1-P3 step 3).
 * BUILD from the contract (plan decision D-1, FM-026): a clean disposable
 * worktree per task at <fleet>/worktrees/<task-id>, parallel-safe through
 * unique paths, O_EXCL record creation, and git worktree add's own
 * locking. Substrate-neutral: pure filesystem and git (DR-0007).
 *
 * Base resolution is the five binding steps of EXT-F-03: resolve the
 * project's configured remote and its default branch, fetch that branch,
 * record the fetched base SHA in the pool record (and the CLI emits it on
 * stdout; M1-P4 spawn copies it into tasks/<id>/meta.json as baseSha),
 * create the task branch and worktree directly from that exact SHA, and
 * on fetch failure fail rather than silently use a stale local branch,
 * unless --offline was explicitly passed, in which case the last fetched
 * remote-tracking SHA is used and offline: true is recorded. The clone's
 * local branches are never consulted: a stale local branch is never the
 * base, whether behind or ahead of the remote.
 *
 * The pool record lives BESIDE the worktree (worktrees/<task-id>.pool.json,
 * plain JSON per D-3), never inside it, so the record can never dirty the
 * destroy-time cleanliness check (FM-059: no exemption list, ever).
 *
 * Destroy refuses a dirty worktree (uncommitted changes or untracked
 * files) unless --discard, which is reserved for the teardown scout path
 * (PR-010). A transient git index.lock during destroy is retried; the
 * lock file is removed only under a fail-safe staleness proof (provably
 * no holder via lsof plus mtime age beyond a threshold; any uncertainty
 * means leave it and fail loudly), per FM-036 and FM-051.
 */

/** Task branch created by the pool at the fetched base SHA. */
export function taskBranchName(taskId: string): string {
  return `task/${taskId}`;
}

/** Task ids are single safe path segments. */
export const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface PoolRecord {
  taskId: string;
  project: string;
  remote: string;
  branch: string;
  baseSha: string;
  branchName: string;
  offline: boolean;
  createdAt: string;
}

export type PoolResult<T> = { ok: true; value: T } | { ok: false; reason: string };

interface GitRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runGit(cwd: string, args: string[]): GitRun {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.error !== undefined) {
    return { status: null, stdout: "", stderr: String(result.error) };
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * Signature of transient git lock contention (a concurrent operation
 * holds a .lock file); retried with backoff. Everything else fails fast.
 */
const LOCK_CONTENTION = /index\.lock|Unable to create .*\.lock|cannot lock ref|File exists/;

async function runGitRetrying(
  cwd: string,
  args: string[],
  attempts = 5,
): Promise<GitRun> {
  let result = runGit(cwd, args);
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (result.status === 0 || !LOCK_CONTENTION.test(result.stderr)) {
      return result;
    }
    await sleep(100 * attempt);
    result = runGit(cwd, args);
  }
  return result;
}

export function recordPath(fleet: Fleet, taskId: string): string {
  return join(fleet.worktreesDir, `${taskId}.pool.json`);
}

export function worktreePath(fleet: Fleet, taskId: string): string {
  return join(fleet.worktreesDir, taskId);
}

export function readPoolRecord(fleet: Fleet, taskId: string): PoolRecord | undefined {
  try {
    return JSON.parse(readFileSync(recordPath(fleet, taskId), "utf8")) as PoolRecord;
  } catch {
    return undefined;
  }
}

/**
 * EXT-F-03 step 1: resolve the project's configured remote. origin when
 * present; otherwise the single configured remote; otherwise fail.
 */
function resolveRemote(project: string): PoolResult<string> {
  const result = runGit(project, ["remote"]);
  if (result.status !== 0) {
    return { ok: false, reason: `${project} is not a git repository (git remote failed: ${result.stderr.trim()})` };
  }
  const remotes = result.stdout.split("\n").filter((line) => line !== "");
  if (remotes.includes("origin")) {
    return { ok: true, value: "origin" };
  }
  if (remotes.length === 1) {
    return { ok: true, value: remotes[0] as string };
  }
  if (remotes.length === 0) {
    return { ok: false, reason: `${project} has no configured remote` };
  }
  return {
    ok: false,
    reason: `${project} has ${String(remotes.length)} remotes and none is origin; cannot pick one`,
  };
}

/**
 * EXT-F-03 step 1: resolve the remote's default branch. origin/HEAD when
 * set locally (no network); otherwise the remote's advertised default
 * via ls-remote --symref. The clone's own HEAD is never consulted, so a
 * detached HEAD in the clone is irrelevant.
 */
function resolveDefaultBranch(project: string, remote: string): PoolResult<string> {
  const local = runGit(project, [
    "symbolic-ref",
    "--quiet",
    `refs/remotes/${remote}/HEAD`,
  ]);
  if (local.status === 0) {
    const ref = local.stdout.trim();
    const prefix = `refs/remotes/${remote}/`;
    if (ref.startsWith(prefix)) {
      return { ok: true, value: ref.slice(prefix.length) };
    }
  }
  const advertised = runGit(project, ["ls-remote", "--symref", remote, "HEAD"]);
  if (advertised.status === 0) {
    const match = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(advertised.stdout);
    if (match !== null) {
      return { ok: true, value: match[1] as string };
    }
    return {
      ok: false,
      reason: `remote ${remote} did not advertise a default branch (no symref HEAD)`,
    };
  }
  return {
    ok: false,
    reason:
      `cannot resolve the default branch of remote ${remote}: ` +
      `${remote}/HEAD is unset locally and ls-remote failed: ${advertised.stderr.trim()}`,
  };
}

export interface CreateOptions {
  taskId: string;
  project: string;
  offline: boolean;
}

/**
 * pool create (EXT-F-03 five steps; see module doc). Returns the pool
 * record on success. On any failure before completion, nothing is left
 * behind: the record reservation is rolled back and no worktree exists.
 */
export async function poolCreate(
  fleet: Fleet,
  options: CreateOptions,
): Promise<PoolResult<PoolRecord>> {
  const { taskId, offline } = options;
  if (!TASK_ID_PATTERN.test(taskId)) {
    return { ok: false, reason: `task id "${taskId}" is not a safe path segment` };
  }
  const project = resolve(options.project);
  const record = recordPath(fleet, taskId);
  const worktree = worktreePath(fleet, taskId);
  if (existsSync(record) || existsSync(worktree)) {
    return { ok: false, reason: `task id already used: ${taskId}` };
  }

  const remote = resolveRemote(project);
  if (!remote.ok) {
    return remote;
  }
  const branch = resolveDefaultBranch(project, remote.value);
  if (!branch.ok) {
    return branch;
  }
  const trackingRef = `refs/remotes/${remote.value}/${branch.value}`;

  // EXT-F-03 step 2: fetch the default branch, force-updating exactly
  // the remote-tracking ref (so a rewound remote is still mirrored).
  let usedOffline = false;
  const fetch = await runGitRetrying(project, [
    "fetch",
    remote.value,
    `+refs/heads/${branch.value}:${trackingRef}`,
  ]);
  if (fetch.status !== 0) {
    if (!offline) {
      return {
        ok: false,
        reason:
          `fetch of ${remote.value}/${branch.value} failed and --offline was ` +
          `not passed; refusing to base work on a stale ref: ${fetch.stderr.trim()}`,
      };
    }
    usedOffline = true;
  }

  // EXT-F-03 step 3: the base SHA is the (just) fetched remote-tracking
  // ref, never a local branch.
  const base = runGit(project, ["rev-parse", "--verify", `${trackingRef}^{commit}`]);
  if (base.status !== 0) {
    return {
      ok: false,
      reason: usedOffline
        ? `--offline was passed but ${trackingRef} has never been fetched; nothing to base on`
        : `cannot resolve ${trackingRef} after fetch: ${base.stderr.trim()}`,
    };
  }
  const baseSha = base.stdout.trim();

  const poolRecord: PoolRecord = {
    taskId,
    project,
    remote: remote.value,
    branch: branch.value,
    baseSha,
    branchName: taskBranchName(taskId),
    offline: usedOffline,
    createdAt: new Date().toISOString(),
  };

  // O_EXCL record reservation: the atomic duplicate gate for concurrent
  // creates with the same task id.
  try {
    writeFileSync(record, `${JSON.stringify(poolRecord, null, 2)}\n`, {
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return { ok: false, reason: `task id already used: ${taskId}` };
    }
    throw error;
  }

  // EXT-F-03 step 4: task branch and worktree directly from the exact
  // fetched SHA. git worktree add carries its own locking; transient
  // contention with a concurrent create is retried.
  const add = await runGitRetrying(project, [
    "worktree",
    "add",
    "-b",
    poolRecord.branchName,
    worktree,
    baseSha,
  ]);
  if (add.status !== 0) {
    try {
      unlinkSync(record);
    } catch {
      // Rollback is best effort; the reason below names the real failure.
    }
    return {
      ok: false,
      reason: `git worktree add failed: ${add.stderr.trim()}`,
    };
  }
  return { ok: true, value: poolRecord };
}

export interface PoolListEntry {
  taskId: string;
  headSha: string;
}

/** One entry per pool record, with the worktree's current HEAD SHA. */
export function poolList(fleet: Fleet): PoolListEntry[] {
  const entries: PoolListEntry[] = [];
  const names = readdirSync(fleet.worktreesDir)
    .filter((name) => name.endsWith(".pool.json"))
    .sort();
  for (const name of names) {
    const taskId = name.slice(0, -".pool.json".length);
    const worktree = worktreePath(fleet, taskId);
    const head = existsSync(worktree)
      ? runGit(worktree, ["rev-parse", "HEAD"])
      : undefined;
    entries.push({
      taskId,
      headSha:
        head !== undefined && head.status === 0
          ? head.stdout.trim()
          : "missing",
    });
  }
  return entries;
}

export interface LsofProbe {
  available: boolean;
  exitCode: number | null;
  stdout: string;
}

function defaultLsof(path: string): LsofProbe {
  const result = spawnSync("lsof", ["-t", "--", path], { encoding: "utf8" });
  if (result.error !== undefined) {
    return { available: false, exitCode: null, stdout: "" };
  }
  return {
    available: true,
    exitCode: result.status,
    stdout: result.stdout ?? "",
  };
}

/** Age a lock file must reach before a staleness proof is even considered. */
export const STALE_LOCK_AGE_MS = 300_000;

/**
 * Fail-safe staleness proof for a git lock file (FM-036, FM-051): true
 * only when the lock exists, its mtime age exceeds the threshold, and
 * lsof is available and shows provably no holder (exit 1, empty stdout).
 * Any uncertainty (lsof missing, erroring, or listing holders) is false:
 * the lock is left in place and the operation fails loudly.
 */
export function provablyStaleLock(
  lockFile: string,
  opts: {
    nowMs?: number;
    ageThresholdMs?: number;
    runLsof?: (path: string) => LsofProbe;
  } = {},
): boolean {
  const nowMs = opts.nowMs ?? Date.now();
  const threshold = opts.ageThresholdMs ?? STALE_LOCK_AGE_MS;
  const probe = opts.runLsof ?? defaultLsof;
  let mtimeMs: number;
  try {
    mtimeMs = statSync(lockFile).mtimeMs;
  } catch {
    return false;
  }
  if (nowMs - mtimeMs <= threshold) {
    return false;
  }
  const lsof = probe(lockFile);
  if (!lsof.available || lsof.exitCode !== 1 || lsof.stdout.trim() !== "") {
    return false;
  }
  return true;
}

export interface DestroyOptions {
  taskId: string;
  discard: boolean;
}

async function destroyGitStep(
  contextDir: string,
  args: string[],
  worktree: string,
): Promise<GitRun> {
  let result = await runGitRetrying(contextDir, args);
  if (result.status !== 0 && LOCK_CONTENTION.test(result.stderr)) {
    // Retries exhausted on a lock signature: attempt the fail-safe
    // staleness proof on the worktree's index.lock, the one transient
    // lock a destroy can legitimately hit (FM-036).
    const gitDir = runGit(worktree, ["rev-parse", "--absolute-git-dir"]);
    if (gitDir.status === 0) {
      const indexLock = join(gitDir.stdout.trim(), "index.lock");
      if (provablyStaleLock(indexLock)) {
        try {
          unlinkSync(indexLock);
        } catch {
          // Already gone; retry either way.
        }
        result = await runGitRetrying(contextDir, args);
      }
    }
  }
  return result;
}

/**
 * pool destroy: refuse a dirty worktree (unless discard), otherwise
 * remove the directory and prune the git registration, then drop the
 * pool record.
 */
export async function poolDestroy(
  fleet: Fleet,
  options: DestroyOptions,
): Promise<PoolResult<null>> {
  const { taskId, discard } = options;
  if (!TASK_ID_PATTERN.test(taskId)) {
    return { ok: false, reason: `task id "${taskId}" is not a safe path segment` };
  }
  const record = readPoolRecord(fleet, taskId);
  const worktree = worktreePath(fleet, taskId);
  const recordFile = recordPath(fleet, taskId);
  const haveRecord = existsSync(recordFile);
  const haveWorktree = existsSync(worktree);
  if (!haveRecord && !haveWorktree) {
    return { ok: false, reason: `no pool worktree for task id ${taskId}` };
  }

  // The git context for worktree bookkeeping: the recorded project
  // clone, or the worktree itself when the record is unreadable.
  const contextDir =
    record !== undefined && existsSync(record.project) ? record.project : worktree;

  if (haveWorktree) {
    if (!discard) {
      const status = await destroyGitStep(
        worktree,
        ["status", "--porcelain"],
        worktree,
      );
      if (status.status !== 0) {
        return {
          ok: false,
          reason: `cannot verify worktree cleanliness: ${status.stderr.trim()}`,
        };
      }
      if (status.stdout.trim() !== "") {
        return {
          ok: false,
          reason:
            `worktree ${worktree} has uncommitted changes or untracked ` +
            `files; commit or land them first, or pass --discard to remove anyway`,
        };
      }
    }
    const removeArgs = discard
      ? ["worktree", "remove", "--force", worktree]
      : ["worktree", "remove", worktree];
    const removed = await destroyGitStep(contextDir, removeArgs, worktree);
    if (removed.status !== 0) {
      return {
        ok: false,
        reason: `git worktree remove failed: ${removed.stderr.trim()}`,
      };
    }
  } else {
    // Directory already gone by hand: prune the stale registration.
    const pruned = await runGitRetrying(contextDir, ["worktree", "prune"]);
    if (pruned.status !== 0) {
      return {
        ok: false,
        reason: `git worktree prune failed: ${pruned.stderr.trim()}`,
      };
    }
  }

  if (haveRecord) {
    unlinkSync(recordFile);
  }
  return { ok: true, value: null };
}
