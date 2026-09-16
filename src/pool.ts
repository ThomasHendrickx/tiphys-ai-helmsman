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
import { metaPath, readTaskMeta } from "./task.ts";
import type { Fleet } from "./fleet.ts";

/**
 * Worktree pool over a project clone (kernel plan v1, M1-P3 step 3).
 * BUILD from the contract (plan decision D-1, FM-026): a clean disposable
 * worktree per task at <fleet>/worktrees/<task-id>, parallel-safe through
 * unique paths, O_EXCL record creation, and git worktree add's own
 * locking. That safety is claimed only at the width M1 actually uses:
 * criterion 15's two concurrent creates, which are witnessed. This
 * phase's own verification measured failures above roughly six-way
 * concurrency on both the fetch and the worktree add, and hardening
 * for that width is deferred to M5 (see the deferral list in
 * delivery/work-history/m1-p3.md). Do not read this as a guarantee at
 * arbitrary concurrency. Substrate-neutral: pure filesystem and git
 * (DR-0007).
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

/**
 * THE BOUND ON A NETWORK-REACHING GIT SUBPROCESS (M4-P19 fix round).
 *
 * `spawnSync` with no `timeout` waits for the child forever. For a local
 * git command that is harmless: it either answers or fails. For one that
 * opens a socket it is not, and the failure mode is not a slow command,
 * it is a command that NEVER RETURNS. Measured by the clean-room
 * reviewer against head abde402: a remote pointed at a TCP listener that
 * accepts and never speaks made `tiphys pool list` and `tiphys doctor`
 * run until killed (exit 124 under `timeout 25`), where the same fixture
 * on the phase base exited 0 in about a second.
 *
 * This bound is applied to `ls-remote --symref <remote> HEAD` only, and
 * the reason it is safe THERE and not elsewhere is a property of the
 * command rather than a judgement about it: that invocation transfers a
 * ref advertisement and nothing else, so a legitimate one is bounded by
 * round-trip latency. `git fetch` (src/pool.ts, src/teardown.ts) and
 * `git push` (src/teardown.ts) transfer objects, so their legitimate
 * duration IS unbounded and a wall-clock cap on them would abort real
 * work. They are left unbounded deliberately, and they are reached only
 * from a command the operator invoked to do that work, never from a
 * reporting path; keeping reporting paths off the network entirely is
 * the other half of this fix (see `reconstructPoolRecord`).
 *
 * TIPHYS_GIT_NETWORK_TIMEOUT_MS is a TEST SEAM in the style of
 * TIPHYS_WATCH_TEST_HOLD (src/watcher.ts) and TIPHYS_LOCK_TEST_HOLD
 * (src/commands/lock.ts): a test cannot afford to wait out the shipped
 * bound, and a shipped bound short enough for a test would abort a
 * legitimate ls-remote over a slow link. A value that is not a positive
 * integer is IGNORED rather than honoured, so a malformed environment
 * cannot silently remove the bound.
 */
export const NETWORK_TIMEOUT_MS = 20_000;

/**
 * Exported as a PURE function so the validation has a witness that does
 * not have to wait out a twenty-second bound to observe it. The
 * end-to-end bound is witnessed separately, against a real remote that
 * never answers; this is the arm that says a malformed environment
 * cannot silently switch the bound off.
 *
 * `Number("")` is 0 and `Number("0x10")` is 16, so neither a blank value
 * nor a hexadecimal one is passed through: the accepted set is exactly
 * the positive integers, and everything else falls back.
 */
export function resolveNetworkTimeoutMs(raw: string | undefined): number {
  if (raw === undefined) {
    return NETWORK_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return NETWORK_TIMEOUT_MS;
  }
  return parsed;
}

function networkTimeoutMs(): number {
  return resolveNetworkTimeoutMs(process.env["TIPHYS_GIT_NETWORK_TIMEOUT_MS"]);
}

function runGit(cwd: string, args: string[], timeoutMs?: number): GitRun {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    // The transient-contention classification below reads git's English
    // message text, so the locale is pinned rather than inherited
    // (U-8). Without this a translated git silently stops retrying.
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
  });
  if (result.error !== undefined) {
    // A killed-on-timeout child arrives here with an ETIMEDOUT error. It
    // is named in terms rather than passed through as
    // "Error: spawnSync git ETIMEDOUT", because the operator's remedy
    // (an unreachable remote) is not readable from that string.
    const timedOut =
      timeoutMs !== undefined &&
      (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
    return {
      status: null,
      stdout: "",
      stderr: timedOut
        ? `git ${args.join(" ")} did not answer within ${String(timeoutMs)}ms and was killed`
        : String(result.error),
    };
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * The ONE signature of transient git contention, derived from real
 * captured stderr rather than from a general rule about git. Every
 * alternative below was observed in a real race on git 2.43 and proved
 * transient by an immediate retry succeeding:
 *
 * 1. A held lock file, which names the lock path: "Unable to create
 *    '<path>.lock': File exists." (index locks and ref locks alike).
 * 2. A refused ref transaction under concurrent update, which names NO
 *    lock file: "cannot lock ref '<ref>': is at <sha> but expected
 *    <sha>". This is the dominant transient of concurrent fetches of
 *    the same tracking ref.
 * 3. Two concurrent worktree operations colliding on a half-written
 *    admin file: "bad object worktrees/<id>/HEAD" on a fetch, and
 *    "failed to read .git/worktrees/<id>/commondir: Success" on an add.
 *
 * One signature is used at every call site. An earlier revision split
 * these by call site, reasoning about which path was allowed to retry
 * which shape; that distinction existed only to protect a rollback that
 * no longer exists, and the splitting itself produced defects. If the
 * add's retry finds the branch already there, create refuses with its
 * existing clear message, which is the correct outcome.
 *
 * The bare phrases "File exists" and "cannot lock ref" must NOT be used
 * on their own: permanent failures emit them too. A directory/file ref
 * conflict reports "cannot lock ref 'refs/x': 'refs/x/y' exists; cannot
 * create 'refs/x'", which is permanent, and retrying it only wastes
 * about a second before the same error surfaces.
 *
 * Known trade, stated rather than hidden (U-11): the worktrees admin
 * shapes also match a permanent condition (an admin HEAD holding a
 * nonexistent object), indistinguishable by message, so that
 * out-of-contract case burns all attempts and fails in about 1.25s
 * instead of about 0.29s.
 *
 * Maintenance rule, learned the hard way: this classification is
 * message-text-only. Do not re-derive it from a plausible general
 * property of git; a previous revision assumed "a genuine transient
 * always names a lock file", which is false, and parallel pool create
 * began failing hard. Capture real stderr from a real race first.
 */
const GIT_CONTENTION =
  /index\.lock|Unable to create '[^']*\.lock'|cannot lock ref '[^']*': (is at [0-9a-f]+ but expected|reference already exists|reference is missing but expected)|bad object worktrees\/|failed to read .*worktrees\/[^/]*\/commondir/;

/** Exported for the contention-classification test. */
export function isTransientGitLockError(stderr: string): boolean {
  return GIT_CONTENTION.test(stderr);
}

async function runGitRetrying(
  cwd: string,
  args: string[],
  attempts = 5,
): Promise<GitRun> {
  let result = runGit(cwd, args);
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (result.status === 0 || !GIT_CONTENTION.test(result.stderr)) {
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
 *
 * `network` IS A REQUIRED PARAMETER AND HAS NO DEFAULT (M4-P19 fix
 * round). Every caller must state whether it is allowed to open a
 * socket, because the two callers that exist have opposite answers and a
 * default would hand the wrong one to whichever caller is added next
 * without anybody having to decide. `false` stops at the local
 * `origin/HEAD` lookup and refuses, naming the fact that the network was
 * not consulted, so a caller reading the refusal can tell "this remote
 * has no default branch" from "I was not permitted to ask".
 */
function resolveDefaultBranch(
  project: string,
  remote: string,
  network: boolean,
): PoolResult<string> {
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
  if (!network) {
    return {
      ok: false,
      reason:
        `cannot resolve the default branch of remote ${remote} without the ` +
        `network: ${remote}/HEAD is unset locally, and this caller reports ` +
        `rather than writes, so it does not contact ${remote} to ask`,
    };
  }
  const advertised = runGit(
    project,
    ["ls-remote", "--symref", remote, "HEAD"],
    networkTimeoutMs(),
  );
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
 * POST-RECLAIM RECONSTRUCTION (M4-D-12, kernel plan M4 section M4-P19).
 *
 * THE RULE, and it is the whole design: RECONSTRUCT FOR REPORTING, NEVER
 * FOR DESTRUCTION. A reconstructed record exists in memory for the life
 * of one command and is NEVER written to worktrees/<id>.pool.json, so a
 * later reader can never mistake a reconstruction for an original.
 *
 * THE DEFECT IT CLOSES, measured rather than assumed. tasks/<id>/meta.json
 * is TRACKED and survives a reclaim; worktrees/<id>.pool.json cannot,
 * because it sits beside the worktree BY DESIGN so it can never dirty the
 * destroy-time cleanliness check (see the module header above, FM-059).
 * Teardown then refuses without a pool record and says so in terms
 * (src/teardown.ts), so the plan's stated fallback of "recovery is manual
 * teardown" does not work post-reclaim: the manual path is itself blocked.
 *
 * WHAT IS DERIVED AND WHAT IS NOT. meta.json carries six of the eight
 * PoolRecord fields directly (taskId, project, baseSha, branchName,
 * offline, createdAt). It carries NEITHER `remote` NOR `branch`, which are
 * the project's configured remote and that remote's default branch. Those
 * two are re-derived from git through the SAME two resolvers poolCreate
 * uses, so a reconstruction is a repeat of the original derivation and
 * never a remembered value.
 *
 * WHEN EITHER OF THOSE TWO CANNOT BE DERIVED THE RESULT IS INCOMPLETE AND
 * NAMES THE FIELD. It is never filled with a plausible default. "origin"
 * and "main" are right often enough to look harmless and wrong often
 * enough to destroy work: a guessed default branch sends the landed-ness
 * judgement at a ref that is not the project's default, and teardown's
 * authorization to delete a task branch comes from exactly that judgement
 * (V-1, the defect src/spawn.ts was rewritten to prevent). An unresolvable
 * field is therefore a refusal, not a gap to fill.
 */
export type ReconstructResult =
  /** Every field derived. Safe to report, and safe to pass to a GATED path. */
  | { kind: "complete"; record: PoolRecord }
  /** meta.json read, but git could not answer for the named fields. */
  | { kind: "incomplete"; unresolved: string[]; detail: string }
  /** No readable task meta, so there is nothing to reconstruct from. */
  | { kind: "absent"; reason: string };

/**
 * What a caller of `reconstructPoolRecord` is permitted to do to answer.
 *
 * THE FIELD IS REQUIRED AND THE TYPE IS WHY (M4-P19 fix round). The
 * reconstruction rebuilds `branch` through `resolveDefaultBranch`, which
 * falls back to `git ls-remote` when `<remote>/HEAD` is unset locally,
 * and that fallback opens a socket. `<remote>/HEAD` unset is not an
 * exotic state: it is the NORMAL state of a clone made by `git init` +
 * `git remote add` + `git fetch`, which is how this kernel's own tests
 * and fixtures build one. So the fallback is reached on ordinary fleets,
 * and a caller that must return, such as `pool list` or `doctor`, must
 * not reach it.
 *
 * Measured against head abde402, where this option did not exist and
 * every caller got the network: with the remote pointed at a TCP
 * listener that accepts and never speaks, `tiphys pool list` and
 * `tiphys doctor` ran until killed. Making the decision a required field
 * rather than a defaulted one is the part of the fix that survives the
 * next caller: adding one without choosing does not compile.
 */
export interface ReconstructOptions {
  /**
   * True only for a caller the operator invoked to CHANGE something and
   * which may therefore wait on a remote. False for every reporting
   * path, which then reports `unreconstructable (unresolved: branch)`
   * rather than blocking.
   */
  network: boolean;
}

/**
 * Rebuild a pool record for taskId from tasks/<id>/meta.json and git.
 * Reads only; writes nothing anywhere, ever.
 */
export function reconstructPoolRecord(
  fleet: Fleet,
  taskId: string,
  options: ReconstructOptions,
): ReconstructResult {
  if (!TASK_ID_PATTERN.test(taskId)) {
    return { kind: "absent", reason: `task id "${taskId}" is not a safe path segment` };
  }
  const meta = readTaskMeta(fleet, taskId);
  if (meta === undefined) {
    return {
      kind: "absent",
      reason:
        `no readable task meta at ${metaPath(fleet, taskId)}, so there is ` +
        `nothing to reconstruct a pool record from`,
    };
  }

  const unresolved: string[] = [];
  const details: string[] = [];
  let remote: string | undefined;
  let branch: string | undefined;
  if (!existsSync(meta.project)) {
    // Both fields live in the clone, so losing the clone loses both. They
    // are reported together rather than one at a time, because a caller
    // that repaired only the first would be told about the second on the
    // next run and learn nothing it could not have been told now.
    unresolved.push("remote", "branch");
    details.push(`the project clone ${meta.project} recorded in meta.json is absent`);
  } else {
    const resolvedRemote = resolveRemote(meta.project);
    if (resolvedRemote.ok) {
      remote = resolvedRemote.value;
      const resolvedBranch = resolveDefaultBranch(
        meta.project,
        remote,
        options.network,
      );
      if (resolvedBranch.ok) {
        branch = resolvedBranch.value;
      } else {
        unresolved.push("branch");
        details.push(resolvedBranch.reason);
      }
    } else {
      unresolved.push("remote", "branch");
      details.push(resolvedRemote.reason);
    }
  }

  if (remote === undefined || branch === undefined) {
    return { kind: "incomplete", unresolved, detail: details.join("; ") };
  }
  return {
    kind: "complete",
    record: {
      taskId,
      project: meta.project,
      remote,
      branch,
      baseSha: meta.baseSha,
      branchName: meta.branch,
      offline: meta.baseOffline,
      createdAt: meta.createdAt,
    },
  };
}

export interface CreateOptions {
  taskId: string;
  project: string;
  offline: boolean;
}

/**
 * pool create (EXT-F-03 five steps; see module doc). Returns the pool
 * record on success.
 *
 * On failure NOTHING IS REMOVED. The pool record, the worktree
 * directory and the task branch may each survive, depending on how far
 * the attempt got, and the reason line names exactly which of them did
 * and the command that clears them. The automatic rollback this
 * docstring used to promise was deleted deliberately: it served a
 * concurrent-create path M1 never enters (parallelism is off until M5)
 * and produced four consecutive rounds of defects, including deleting
 * state it had not validated. Failing loudly and leaving state is the
 * chosen contract, not an oversight.
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
  // U-12: the opposite collision direction. A ref UNDER
  // refs/heads/task/<id>/ (for example task/foo/bar when creating
  // task/foo) makes the branch equally uncreatable, and the exact-ref
  // and strict-prefix checks both miss it, so it used to reach git
  // worktree add and surface as the raw two-line git error the
  // pre-check exists to eliminate.
  const nested = runGit(project, [
    "for-each-ref",
    "--count=1",
    "--format=%(refname)",
    `refs/heads/${branchName}/`,
  ]);
  if (nested.status === 0 && nested.stdout.trim() !== "") {
    return {
      ok: false,
      reason:
        `ref ${nested.stdout.trim()} already exists in ${project} and blocks ` +
        `${branchName} (a ref cannot be both a branch and a directory); ` +
        `delete or rename it before using task id ${taskId}`,
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
  // poolCreate is a write the operator invoked and it is about to fetch
  // from this remote anyway, so it may ask the remote for its default.
  const branch = resolveDefaultBranch(project, remote.value, true);
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
  // fetched SHA. Transient contention is retried by the one signature.
  //
  // There is deliberately NO automatic cleanup on failure. Parallelism
  // is off until M5 (plan section 1.4), so nothing in M1 drives the
  // concurrent-create path this machinery existed for, and four rounds
  // of defects came out of it: a global prune that could kill another
  // create, an unvalidated recursive delete of an admin directory, and
  // a rollback that broke under the very contention it existed to
  // handle. Failing loudly and leaving state is strictly better than
  // cleanup code that deletes the wrong thing. The operator is told
  // exactly what was left and exactly how to clear it.
  const add = await runGitRetrying(project, [
    "worktree",
    "add",
    "-b",
    poolRecord.branchName,
    worktree,
    baseSha,
  ]);
  if (add.status !== 0) {
    const leftovers: string[] = [`pool record ${record}`];
    if (existsSync(worktree)) {
      leftovers.push(`worktree directory ${worktree}`);
    }
    const branchProbe = runGit(project, [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${poolRecord.branchName}^{commit}`,
    ]);
    if (branchProbe.status === 0) {
      leftovers.push(`branch ${poolRecord.branchName}`);
    }
    return {
      ok: false,
      reason:
        `git worktree add failed: ${add.stderr.trim()}; nothing was removed, ` +
        `left behind: ${leftovers.join(", ")}; clear it with "tiphys pool ` +
        `destroy --task ${taskId} --discard --delete-branch-force" run in the fleet home`,
    };
  }

  return { ok: true, value: poolRecord };
}

/**
 * Where an entry's pool record came from. `record` is an original read
 * from worktrees/<id>.pool.json; the other two exist only after a reclaim
 * has taken worktrees/ with it, and are computed fresh on every call.
 */
export type PoolEntryOrigin = "record" | "reconstructed" | "unreconstructable";

export interface PoolListEntry {
  taskId: string;
  headSha: string;
  origin: PoolEntryOrigin;
  /** Set only for `unreconstructable`: the PoolRecord fields git could not answer for. */
  unresolved?: string[];
}

/** The worktree's current HEAD SHA, or "missing" when there is no worktree. */
function headShaOf(fleet: Fleet, taskId: string): string {
  const worktree = worktreePath(fleet, taskId);
  const head = existsSync(worktree)
    ? runGit(worktree, ["rev-parse", "HEAD"])
    : undefined;
  return head !== undefined && head.status === 0 ? head.stdout.trim() : "missing";
}

/**
 * One entry per pool record, with the worktree's current HEAD SHA, PLUS
 * one per OPEN task that has no pool record beside it (M4-P19).
 *
 * The second group is what a reclaim leaves behind: tasks/ is tracked and
 * survives, worktrees/ is gitignored and does not, so a task can be open
 * with its record gone. Reporting only the first group makes those tasks
 * invisible to `pool list` and to doctor, which is the state the plan
 * calls a defect. Every such entry is marked, never silently blended in
 * with the originals, and NOTHING here is written to disk.
 *
 * Closed tasks are excluded: a closed task is not in the pool, and
 * listing every task this fleet ever finished as a missing worktree would
 * make the report useless within a week.
 *
 * THIS FUNCTION OPENS NO SOCKET (M4-P19 fix round). It reads the
 * filesystem and runs local git commands, and its reconstruction is
 * asked for with `{ network: false }`. An entry whose default branch
 * cannot be established from the clone alone is reported
 * `unreconstructable (unresolved: branch)` rather than waited on. See
 * `ReconstructOptions` for the measured hang that this closes.
 */
export function poolList(fleet: Fleet): PoolListEntry[] {
  const entries: PoolListEntry[] = [];
  const seen = new Set<string>();
  const names = readdirSync(fleet.worktreesDir)
    .filter((name) => name.endsWith(".pool.json"))
    .sort();
  for (const name of names) {
    const taskId = name.slice(0, -".pool.json".length);
    seen.add(taskId);
    entries.push({ taskId, headSha: headShaOf(fleet, taskId), origin: "record" });
  }

  let taskIds: string[];
  try {
    taskIds = readdirSync(fleet.tasksDir).sort();
  } catch {
    // No tasks/ at all: nothing to reconstruct from, and the layout check
    // in doctor is what reports a missing fleet directory.
    taskIds = [];
  }
  for (const taskId of taskIds) {
    if (seen.has(taskId) || !TASK_ID_PATTERN.test(taskId)) {
      continue;
    }
    const meta = readTaskMeta(fleet, taskId);
    if (meta === undefined || meta.status !== "open") {
      continue;
    }
    // REPORTING, so NO NETWORK. `pool list` and doctor's CHECK worktrees
    // both arrive here, and both must return. A task whose `branch`
    // needs the network to resolve is reported `unreconstructable`,
    // which is a true statement about what this path can establish.
    const rebuilt = reconstructPoolRecord(fleet, taskId, { network: false });
    if (rebuilt.kind === "absent") {
      continue;
    }
    entries.push(
      rebuilt.kind === "complete"
        ? { taskId, headSha: headShaOf(fleet, taskId), origin: "reconstructed" }
        : {
            taskId,
            headSha: headShaOf(fleet, taskId),
            origin: "unreconstructable",
            unresolved: rebuilt.unresolved,
          },
    );
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
  /**
   * An IN-MEMORY reconstructed record (M4-P19), used ONLY when no record
   * exists on disk. It is never written: `haveRecord` still comes from
   * the file, so nothing here creates worktrees/<id>.pool.json and
   * nothing unlinks a file that is not there.
   *
   * WHY THIS EXISTS AT ALL, since the whole design is "never for
   * destruction". Without it, stage 2's base-sha gate has no base to
   * compare against and returns its "pool record missing or unreadable"
   * refusal, so the post-reclaim path would be blocked at the one gate
   * that was ALREADY going to do the right thing. Passing the
   * reconstruction in makes that gate WORK rather than abstain, which is
   * strictly safer than the alternative of relaxing it. The caller is
   * responsible for having derived it (src/teardown.ts's
   * --from-reconstructed path is the only one), and `pool destroy` on
   * the command line never sets it.
   */
  reconstructed?: PoolRecord;
}

async function destroyGitStep(
  contextDir: string,
  args: string[],
  worktree: string,
): Promise<GitRun> {
  let result = await runGitRetrying(contextDir, args);
  if (result.status !== 0 && GIT_CONTENTION.test(result.stderr)) {
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
 * pool destroy, in three explicit stages.
 *
 * THE INVARIANT, stated narrowly because the broad version was not
 * true: NO POLICY DECISION MAY BE TAKEN AFTER A DESTRUCTIVE ACTION HAS
 * BEGUN. That yields two outcomes with two different meanings, and one
 * word must never cover both:
 *
 *   REFUSAL (stage 2). A true no-op. The worktree, its git
 *   registration, the pool record and the branch are all byte-identical
 *   afterwards, the refusal is always retryable, and the remedy it
 *   prints ("land them", "pass --delete-branch-force") is performable in
 *   the place it names. This is fully enforced: stage 2 performs no IO.
 *
 *   PARTIAL FAILURE (stage 3). Stage 3 is destructive and can fail
 *   partway, and no ordering can make it otherwise: git will not delete
 *   a branch that is checked out, so the worktree MUST come out before
 *   the branch can, and a failure after that point cannot un-remove it.
 *   Such a failure is reported as an operational partial failure that
 *   enumerates what was removed and what survives, never as a refusal
 *   and never with any wording implying nothing changed.
 *
 * The earlier, broader claim ("a refused destroy leaves everything
 * byte-identical", full stop) was false for exactly one path: the tip
 * recheck that used to sit after the worktree removal returned what
 * looked like a refusal when the worktree was already gone. The fix was
 * not to move that check, which is impossible, but to stop calling that
 * outcome a refusal and to make the branch delete's safety claim
 * enforceable by git itself rather than by a check that races.
 *
 * This was got wrong twice by patching the order of statements, most
 * recently when the branch gate was added after the worktree removal:
 * a refused destroy then deleted the worktree it was refusing to
 * destroy, taking every git-ignored file with it, and with an
 * unreadable record it destroyed the only remaining way to resolve the
 * git context, wedging the task id permanently. The invariant is
 * therefore expressed structurally rather than by the statements
 * happening to be in the right order:
 *
 *   stage 1, resolveDestroy: READ ONLY. Gathers every fact a decision
 *            needs (context directory, record, worktree state,
 *            cleanliness, branch tip). Mutates nothing.
 *   stage 2, evaluateDestroy: PURE. Decides over those facts alone and
 *            returns a refusal reason or undefined. Performs no IO, so
 *            it cannot destroy anything even by accident.
 *   stage 3, applyDestroy: DESTRUCTIVE, and reached only when stage 2
 *            returned no refusal. It evaluates no policy; its only
 *            failures are operational (a git command failing), and it
 *            reports them as partial failures that enumerate the
 *            remaining state.
 *
 * Adding a new rule means adding a fact in stage 1 and a clause in
 * stage 2. A rule added to stage 3 is a bug by construction.
 */

/** Branch-tip fact, with "cannot tell" kept distinct from "absent". */
type BranchTip =
  | { kind: "absent" }
  | { kind: "present"; sha: string }
  | { kind: "indeterminate"; detail: string };

interface DestroyFacts {
  taskId: string;
  contextDir: string;
  record: PoolRecord | undefined;
  recordFile: string;
  haveRecord: boolean;
  worktree: string;
  haveWorktree: boolean;
  /** Undefined when there is no worktree to inspect. */
  dirty: boolean | undefined;
  /** Set when cleanliness could not be determined. */
  dirtyProbeError: string | undefined;
  branchName: string;
  branchTip: BranchTip;
  /**
   * Path of another worktree that has this branch checked out, if any.
   * git branch -D refuses that case for good reason (it would strand
   * that worktree on a dangling HEAD), and update-ref does not check
   * it, so the condition is carried as a FACT and decided in stage 2
   * where it belongs: it is policy, and its refusal is a true no-op.
   */
  branchCheckedOutAt: string | undefined;
}

/** Stage 1: gather facts. Read only; mutates nothing. */
async function resolveDestroy(
  fleet: Fleet,
  taskId: string,
  reconstructed: PoolRecord | undefined,
): Promise<PoolResult<DestroyFacts>> {
  const worktree = worktreePath(fleet, taskId);
  const recordFile = recordPath(fleet, taskId);
  const onDisk = readPoolRecord(fleet, taskId);
  // The on-disk record always wins. The reconstruction is a FALLBACK, so
  // a present-but-different record can never be overridden by one.
  const record = onDisk ?? reconstructed;
  // Deliberately the FILE, not the record: this is what authorizes the
  // unlink in stage 3, and a reconstruction has no file to unlink.
  const haveRecord = existsSync(recordFile);
  const haveWorktree = existsSync(worktree);
  if (!haveRecord && !haveWorktree) {
    return { ok: false, reason: `no pool worktree for task id ${taskId}` };
  }

  // The git context must be resolved while the worktree still exists,
  // because the worktree is one of only two ways to find it.
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
        `cannot resolve the project repository for task id ${taskId}: the ` +
        `pool record ${recordFile} is missing or unreadable and there is no ` +
        `usable worktree. Nothing was removed; repair or delete that record ` +
        `file to release the id`,
    };
  }

  let dirty: boolean | undefined;
  let dirtyProbeError: string | undefined;
  if (haveWorktree) {
    const status = await destroyGitStep(worktree, ["status", "--porcelain"], worktree);
    if (status.status !== 0) {
      dirtyProbeError = status.stderr.trim();
    } else {
      dirty = status.stdout.trim() !== "";
    }
  }

  const branchName = record?.branchName ?? taskBranchName(taskId);
  const tip = runGit(contextDir, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${branchName}^{commit}`,
  ]);
  let branchTip: BranchTip;
  if (tip.status === 0) {
    branchTip = { kind: "present", sha: tip.stdout.trim() };
  } else if (tip.status === 1) {
    branchTip = { kind: "absent" };
  } else {
    branchTip = {
      kind: "indeterminate",
      detail: tip.stderr.trim() === "" ? `git exited ${String(tip.status)}` : tip.stderr.trim(),
    };
  }

  let branchCheckedOutAt: string | undefined;
  const listed = runGit(contextDir, ["worktree", "list", "--porcelain"]);
  if (listed.status === 0) {
    let currentPath: string | undefined;
    for (const line of listed.stdout.split("\n")) {
      if (line.startsWith("worktree ")) {
        currentPath = line.slice("worktree ".length).trim();
      } else if (line.trim() === `branch refs/heads/${branchName}`) {
        if (currentPath !== undefined && resolve(currentPath) !== resolve(worktree)) {
          branchCheckedOutAt = currentPath;
        }
      }
    }
  }

  return {
    ok: true,
    value: {
      taskId,
      contextDir,
      record,
      recordFile,
      haveRecord,
      worktree,
      haveWorktree,
      dirty,
      dirtyProbeError,
      branchName,
      branchTip,
      branchCheckedOutAt,
    },
  };
}

/**
 * Stage 2: decide. Pure over the facts, no IO, so no gate can destroy
 * anything. Returns a refusal reason, or undefined to proceed.
 */
function evaluateDestroy(
  facts: DestroyFacts,
  options: DestroyOptions,
): string | undefined {
  if (facts.haveWorktree && !options.discard) {
    if (facts.dirtyProbeError !== undefined) {
      return `cannot verify worktree cleanliness: ${facts.dirtyProbeError}`;
    }
    if (facts.dirty === true) {
      return (
        `worktree ${facts.worktree} has uncommitted changes or untracked ` +
        `files; commit or land them first, or pass --discard to remove anyway`
      );
    }
  }

  if (facts.branchTip.kind === "indeterminate") {
    return (
      `cannot determine whether branch ${facts.branchName} exists in ` +
      `${facts.contextDir} (${facts.branchTip.detail}); refusing to finish ` +
      `destroy for task id ${facts.taskId}`
    );
  }

  if (
    facts.branchTip.kind === "present" &&
    facts.branchCheckedOutAt !== undefined
  ) {
    // Policy, and therefore a stage-2 refusal: a true no-op. Deleting a
    // branch another worktree has checked out would strand it on a
    // dangling HEAD. git branch -D enforces this; update-ref, which
    // stage 3 uses for its atomic compare-and-delete, does not, so the
    // rule is enforced here rather than relied on downstream.
    return (
      `cannot delete branch ${facts.branchName}: it is checked out at ` +
      `${facts.branchCheckedOutAt}; remove that worktree first`
    );
  }

  if (facts.branchTip.kind === "present" && !options.deleteBranchForce) {
    const baseSha = facts.record?.baseSha;
    if (baseSha === undefined) {
      return (
        `cannot verify branch ${facts.branchName} against its recorded base ` +
        `(pool record missing or unreadable), tip ${facts.branchTip.sha}; land ` +
        `it or pass --delete-branch-force to delete it anyway`
      );
    }
    if (facts.branchTip.sha !== baseSha) {
      return (
        `branch ${facts.branchName} carries commits beyond its base ` +
        `${baseSha} (tip ${facts.branchTip.sha}); land them or pass ` +
        `--delete-branch-force to delete it anyway`
      );
    }
  }

  return undefined;
}

/**
 * Stage 3: perform. Reached only with every gate passed, so there is
 * nothing left to refuse; failures here are operational, not policy.
 */
async function applyDestroy(
  facts: DestroyFacts,
  options: DestroyOptions,
): Promise<PoolResult<DestroyOutcome>> {
  if (facts.haveWorktree) {
    // F-1: --discard means "remove anyway" (plan step 3), and git's own
    // documented way to say that for a LOCKED working tree is a second
    // --force. An interrupted git worktree add leaves
    // .git/worktrees/<id>/locked = "initializing", which a single
    // --force refuses, so the remedy this kernel prints on a failed
    // create used to exit 1 and clear nothing, wedging the task id. No
    // concurrency is needed to reach that state: Ctrl-C, a crash, a
    // full disk or an OOM kill during a large checkout produces it.
    // The default path is deliberately unchanged: without --discard
    // nothing here is forced at all.
    const removeArgs = options.discard
      ? ["worktree", "remove", "--force", "--force", facts.worktree]
      : ["worktree", "remove", facts.worktree];
    const removed = await destroyGitStep(facts.contextDir, removeArgs, facts.worktree);
    if (removed.status !== 0) {
      return {
        ok: false,
        reason: `git worktree remove failed: ${removed.stderr.trim()}`,
      };
    }
  } else {
    const pruned = await runGitRetrying(facts.contextDir, ["worktree", "prune"]);
    if (pruned.status !== 0) {
      return {
        ok: false,
        reason: `git worktree prune failed: ${pruned.stderr.trim()}`,
      };
    }
  }

  const outcome: DestroyOutcome = {};
  if (facts.branchTip.kind === "present") {
    // Stage 2 approved a SPECIFIC tip. Rather than re-read the tip and
    // then delete (two steps with a window between them, which is what
    // a check-then-act race is), hand the comparison to git: with an
    // old-value argument, update-ref -d deletes the ref ONLY if it is
    // still exactly that sha and fails atomically otherwise. The safety
    // claim is therefore enforced by the ref transaction, not by a
    // recheck that can be overtaken between checking and acting.
    // Deliberately NOT runGitRetrying. git reports a failed old-value
    // comparison as "cannot lock ref '<ref>': is at X but expected Y",
    // which the contention signature treats as transient because on a
    // FETCH it means another process already advanced the ref and a
    // retry succeeds. Here the same text means the branch is no longer
    // what stage 2 approved, which no amount of retrying will change:
    // same shape, different call site, different meaning.
    const deleted = runGit(facts.contextDir, [
      "update-ref",
      "-d",
      `refs/heads/${facts.branchName}`,
      facts.branchTip.sha,
    ]);
    if (deleted.status !== 0) {
      // The worktree is already gone by this point and cannot be put
      // back, so this is a PARTIAL FAILURE, not a refusal. Enumerate
      // the real remaining state rather than implying nothing changed.
      const detail = deleted.stderr.trim().split("\n")[0] ?? "";
      const nowTip = runGit(facts.contextDir, [
        "rev-parse",
        "--verify",
        "--quiet",
        `refs/heads/${facts.branchName}^{commit}`,
      ]);
      const currentTip = nowTip.status === 0 ? nowTip.stdout.trim() : "absent";
      const worktreeState = facts.haveWorktree
        ? `worktree ${facts.worktree} HAS BEEN REMOVED (with any git-ignored files in it) and its registration pruned`
        : `no worktree directory was present`;
      return {
        ok: false,
        reason:
          `partial destroy of task id ${facts.taskId}: ${worktreeState}; branch ` +
          `${facts.branchName} was NOT deleted and is left at ${currentTip} ` +
          `(the delete was approved for ${facts.branchTip.sha} and git refused: ` +
          `${detail}); the pool record ${facts.recordFile} is left in place; ` +
          `re-run "tiphys pool destroy --task ${facts.taskId} ` +
          `--delete-branch-force" to finish once you have checked that branch`,
      };
    }
    outcome.deletedBranch = facts.branchName;
    // The recovery handle: without it a mistaken destroy leaves the sha
    // discoverable only through git fsck --lost-found, until gc.
    outcome.deletedSha = facts.branchTip.sha;
  }

  if (facts.haveRecord) {
    unlinkSync(facts.recordFile);
  }
  return { ok: true, value: outcome };
}

export async function poolDestroy(
  fleet: Fleet,
  options: DestroyOptions,
): Promise<PoolResult<DestroyOutcome>> {
  const { taskId } = options;
  if (!TASK_ID_PATTERN.test(taskId)) {
    return { ok: false, reason: `task id "${taskId}" is not a safe path segment` };
  }

  // Stage 1: read only.
  const resolved = await resolveDestroy(fleet, taskId, options.reconstructed);
  if (!resolved.ok) {
    return resolved;
  }

  // Stage 2: pure decision. Every refusal returns here, before stage 3
  // has touched anything.
  const refusal = evaluateDestroy(resolved.value, options);
  if (refusal !== undefined) {
    return { ok: false, reason: refusal };
  }

  // Stage 3: destructive, and no longer able to refuse.
  return applyDestroy(resolved.value, options);
}
