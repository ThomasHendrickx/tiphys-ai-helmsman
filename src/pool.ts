import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
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
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    // The transient-contention classification below reads git's English
    // message text, so the locale is pinned rather than inherited
    // (U-8). Without this a translated git silently stops retrying.
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
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
 * Signature of transient git lock contention, derived from real
 * captured stderr rather than from a general rule (CR-203, corrected by
 * V-2 and U-8). Two distinct shapes are transient, and it is a mistake
 * to assume either one generalizes:
 *
 * 1. A held lock file, which names the lock path: "Unable to create
 *    '<path>.lock': File exists." (index locks and ref locks alike).
 * 2. A refused ref transaction under concurrent update, which names NO
 *    lock file: "cannot lock ref '<ref>': is at <sha> but expected
 *    <sha>". This is the dominant real transient for the concurrent
 *    fetch that pool create runs: in a measured campaign of concurrent
 *    fetches against a behind tracking ref, every single contention
 *    failure had this shape and none named a lock file. An immediate
 *    retry succeeds because the ref already holds the new value.
 * 3. A fetch that trips over another worktree being created in the same
 *    clone at that moment: "fatal: bad object worktrees/<id>/HEAD",
 *    followed by "did not send all necessary objects". git fetch
 *    enumerates every worktree's HEAD during negotiation, and a
 *    worktree mid-creation has one that does not resolve yet. Measured
 *    by racing worktree add against fetch (the exact pair pool create
 *    performs concurrently): 11 occurrences, and an immediate retry
 *    succeeded in all 11. The anchor is deliberately the worktrees/
 *    admin path, because a bare "bad object" is usually permanent.
 *
 * A fourth concurrent-worktree failure exists and is deliberately NOT
 * listed here: see WORKTREE_ADD_CONTENTION below. It cannot be retried
 * by this generic helper, because the failed attempt leaves the new
 * branch behind and an identical retry then fails on the branch name.
 *
 * The bare phrases "File exists" and "cannot lock ref" must NOT be used
 * on their own: permanent failures emit them too. A directory/file ref
 * conflict reports "cannot lock ref 'refs/x': 'refs/x/y' exists; cannot
 * create 'refs/x'", which is permanent and retrying it only wastes
 * about a second before the same error surfaces.
 *
 * Maintenance rule, learned the hard way: this classification is
 * message-text-only. Do not re-derive it from a plausible general
 * property of git; a previous revision assumed "a genuine transient
 * always names a lock file", which is false, and parallel pool create
 * began failing hard. If git's ref backend changes (reftable) or a new
 * contention class appears, capture real stderr from a real race first
 * and extend the alternatives from that evidence.
 */
const LOCK_CONTENTION =
  /index\.lock|Unable to create '[^']*\.lock'|cannot lock ref '[^']*': (is at [0-9a-f]+ but expected|reference already exists|reference is missing but expected)|bad object worktrees\//;

/** Exported for the CR-203 and V-2 classification tests. */
export function isTransientGitLockError(stderr: string): boolean {
  return LOCK_CONTENTION.test(stderr);
}

/**
 * Two concurrent "git worktree add" runs in one clone can collide while
 * one is still writing another worktree's admin files: "fatal: failed
 * to read .git/worktrees/<other>/commondir: Success" (errno 0, because
 * the file exists but is still empty). Measured at 2 failures in 72
 * concurrent creates, and 6 in 90 raw concurrent worktree adds.
 *
 * This one is transient but NOT retryable in place: measured on all 6
 * occurrences, the failed attempt had already created the task branch,
 * so an identical retry fails with "a branch named ... already exists"
 * (0 of 6 retries succeeded). It therefore needs the partial state
 * rolled back first, which is what the create path does; putting it in
 * LOCK_CONTENTION would only convert a transient into a confusing
 * permanent error.
 */
const WORKTREE_ADD_CONTENTION = /failed to read .*worktrees\/[^/]*\/commondir/;

/** Exported for the concurrent worktree-add classification test. */
export function isTransientWorktreeAddError(stderr: string): boolean {
  return WORKTREE_ADD_CONTENTION.test(stderr);
}

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

/**
 * Undo whatever a failed "git worktree add" left behind: the worktree
 * directory, its registration, and the task branch when that branch is
 * still sitting exactly at the base commit the attempt used (which is
 * the only state a failed add can produce, so removing it cannot
 * discard work). Used between retries and on final failure.
 */
function rollbackPartialAdd(
  project: string,
  branchName: string,
  worktree: string,
  baseSha: string,
): void {
  if (existsSync(worktree)) {
    rmSync(worktree, { recursive: true, force: true });
  }
  runGit(project, ["worktree", "prune"]);
  const tip = runGit(project, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${branchName}^{commit}`,
  ]);
  if (tip.status === 0 && tip.stdout.trim() === baseSha) {
    runGit(project, ["branch", "-D", branchName]);
  }
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

  // CR-201: a leftover task branch would otherwise surface as a raw git
  // error from deep inside worktree add. Destroy now removes the branch
  // it created, so this only fires when the branch came from elsewhere.
  const branchName = taskBranchName(taskId);
  const existing = runGit(project, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${branchName}`,
  ]);
  if (existing.status === 0) {
    return {
      ok: false,
      reason:
        `branch ${branchName} already exists in ${project}; the pool creates ` +
        `it fresh, so delete or rename it before re-using task id ${taskId}`,
    };
  }
  // U-7: the exact ref can be absent while the branch is still
  // uncreatable, because any strict prefix of refs/heads/task/<id>
  // existing as a ref is a directory/file conflict. Catch it here
  // instead of after a full network fetch, inside git worktree add.
  const segments = branchName.split("/");
  for (let i = 1; i < segments.length; i += 1) {
    const prefix = segments.slice(0, i).join("/");
    const conflict = runGit(project, [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${prefix}`,
    ]);
    if (conflict.status === 0) {
      return {
        ok: false,
        reason:
          `branch ${prefix} already exists in ${project} and blocks ` +
          `${branchName} (a ref cannot be both a branch and a directory); ` +
          `delete or rename it before using task id ${taskId}`,
      };
    }
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
    branchName,
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
  //
  // The concurrent-add collision (WORKTREE_ADD_CONTENTION) needs its
  // partial state rolled back between attempts: a failed add can leave
  // the task branch created, and retrying without clearing it fails on
  // the branch name instead of on the original race. Clearing it is
  // provably lossless, because the branch can only be sitting at the
  // base commit this attempt just passed to worktree add.
  let add = await runGitRetrying(project, [
    "worktree",
    "add",
    "-b",
    poolRecord.branchName,
    worktree,
    baseSha,
  ]);
  for (let attempt = 1; attempt < 5 && add.status !== 0; attempt += 1) {
    if (!WORKTREE_ADD_CONTENTION.test(add.stderr)) {
      break;
    }
    rollbackPartialAdd(project, poolRecord.branchName, worktree, baseSha);
    await sleep(100 * attempt);
    add = await runGitRetrying(project, [
      "worktree",
      "add",
      "-b",
      poolRecord.branchName,
      worktree,
      baseSha,
    ]);
  }
  if (add.status !== 0) {
    // Leave nothing of the failed attempt behind: without this the task
    // id is wedged by its own leftover branch on the next create.
    rollbackPartialAdd(project, poolRecord.branchName, worktree, baseSha);
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
  /** Override the dirty-worktree refusal (plan step 3, PR-010). */
  discard: boolean;
  /**
   * Authorize deleting a task branch that carries commits beyond its
   * recorded base (V-1). Deliberately distinct from discard, whose
   * plan-defined meaning is the dirty-tree override only: conflating
   * them would make the scout path silently destroy committed work.
   * M1-P4 teardown passes this from its ship path after its landedness
   * judgement, which makes the dependency on teardown explicit rather
   * than assumed.
   */
  deleteBranchForce: boolean;
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

/** What a completed destroy removed, for the operator's record. */
export interface DestroyOutcome {
  deletedBranch?: string;
  /** The branch tip at deletion time: the recovery handle (V-1). */
  deletedSha?: string;
}

/**
 * pool destroy: refuse a dirty worktree (unless discard), otherwise
 * remove the directory, prune the git registration, delete the task
 * branch when that is provably lossless (or explicitly forced), and
 * drop the pool record.
 */
export async function poolDestroy(
  fleet: Fleet,
  options: DestroyOptions,
): Promise<PoolResult<DestroyOutcome>> {
  const { taskId, discard, deleteBranchForce } = options;
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

  // The git context for worktree and ref bookkeeping, resolved BEFORE
  // anything is removed (U-3). Using the worktree path itself as a
  // fallback was unsound: once the worktree is gone every later git
  // call there fails to spawn, and an unreadable pool record therefore
  // produced a destroy that reported success while leaving the branch
  // behind and wedging the task id.
  let contextDir: string | undefined;
  if (record !== undefined && existsSync(record.project)) {
    contextDir = record.project;
  } else if (haveWorktree) {
    const common = runGit(worktree, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    if (common.status === 0 && common.stdout.trim() !== "") {
      contextDir = common.stdout.trim();
    }
  }
  if (contextDir === undefined) {
    return {
      ok: false,
      reason:
        `cannot resolve the project repository for task id ${taskId} (pool ` +
        `record missing or unreadable and no usable worktree); nothing was removed`,
    };
  }

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

  // CR-201, corrected by V-1: remove the task branch so a destroyed
  // task id is fully released, but never silently discard commits.
  // Deleting unconditionally was a data-loss defect: committed but
  // unpushed work leaves the worktree clean, so the dirty guard does
  // not fire, and the branch (together with its reflog, which the
  // worktree removal takes too) was the only thing keeping those
  // commits reachable. The gate is the pool's own recorded base: a
  // branch tip still equal to baseSha provably carries no commits, so
  // deleting it is lossless. Anything else needs explicit
  // authorization through deleteBranchForce.
  //
  // Plain -d is not usable as that gate: the clone's local default ref
  // may be behind the fetched base, and a squash-landed branch is not
  // an ancestor of anything, so -d would refuse branches that are in
  // fact landed. The base comparison answers the narrower question the
  // pool can actually answer; landedness stays with M1-P4 teardown,
  // which passes deleteBranchForce once it has made that judgement.
  const branchName = record?.branchName ?? taskBranchName(taskId);
  const tip = runGit(contextDir, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${branchName}^{commit}`,
  ]);
  const outcome: DestroyOutcome = {};
  if (tip.status !== 0 && tip.status !== 1) {
    // Indeterminate probe: fail closed rather than read the failure as
    // "branch absent" and silently skip the deletion (U-3).
    return {
      ok: false,
      reason:
        `cannot determine whether branch ${branchName} exists in ` +
        `${contextDir}; refusing to finish destroy for task id ${taskId}`,
    };
  }
  if (tip.status === 0) {
    const tipSha = tip.stdout.trim();
    const baseSha = record?.baseSha;
    const atBase = baseSha !== undefined && tipSha === baseSha;
    if (!atBase && !deleteBranchForce) {
      return {
        ok: false,
        reason:
          baseSha === undefined
            ? `cannot verify branch ${branchName} against its recorded base ` +
              `(pool record missing or unreadable), tip ${tipSha}; land it or ` +
              `pass --delete-branch-force to delete it anyway`
            : `branch ${branchName} carries commits beyond its base ` +
              `${baseSha} (tip ${tipSha}); land them or pass ` +
              `--delete-branch-force to delete it anyway`,
      };
    }
    const deleted = await runGitRetrying(contextDir, ["branch", "-D", branchName]);
    if (deleted.status !== 0) {
      const detail = deleted.stderr.trim().split("\n")[0] ?? "";
      return {
        ok: false,
        reason: `cannot delete branch ${branchName}: ${detail}`,
      };
    }
    outcome.deletedBranch = branchName;
    // The recovery handle: without it a mistaken destroy leaves the sha
    // discoverable only through git fsck --lost-found, until gc.
    outcome.deletedSha = tipSha;
  }

  if (haveRecord) {
    unlinkSync(recordFile);
  }
  return { ok: true, value: outcome };
}
