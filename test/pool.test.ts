import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Worktree-pool tests (kernel plan v1, M1-P3 criteria 11 to 16) against
 * scratch git repositories created per test. Every commit-producing git
 * call carries command-scoped identity environment variables because CI
 * runners have no git identity (EXT-F-02 pattern).
 */

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

/**
 * Unit import through a computed URL (TS2878 boundary, same pattern as
 * test/doctor.test.ts).
 */
interface LsofProbe {
  available: boolean;
  exitCode: number | null;
  stdout: string;
}
const poolLib = (await import(
  new URL("../src/pool.ts", import.meta.url).href
)) as {
  provablyStaleLock(
    lockFile: string,
    opts?: {
      nowMs?: number;
      ageThresholdMs?: number;
      runLsof?: (path: string) => LsofProbe;
    },
  ): boolean;
  isTransientGitLockError(stderr: string): boolean;
};

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Pool Test",
  GIT_AUTHOR_EMAIL: "pool-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Pool Test",
  GIT_COMMITTER_EMAIL: "pool-test@tiphys.invalid",
};

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): CliResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    ...opts,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function spawnCli(
  args: string[],
  opts: { cwd?: string } = {},
): Promise<CliResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [sourceEntry, ...args], {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ status: code, stdout, stderr });
    });
  });
}

function git(dir: string, args: string[]): CliResult {
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitOk(dir: string, args: string[]): string {
  const result = git(dir, args);
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p3-pool-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

interface Scratch {
  fleet: string;
  upstream: string;
  clone: string;
}

/** Fleet home plus an upstream repo and a clone of it under projects/. */
function makeScratch(t: { after(fn: () => void): void }): Scratch {
  const tmp = makeTempDir(t);
  const fleet = join(tmp, "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  const upstream = join(tmp, "upstream");
  gitOk(tmp, ["init", "--initial-branch=main", upstream]);
  writeFileSync(join(upstream, "readme.md"), "upstream\n");
  gitOk(upstream, ["add", "-A"]);
  gitOk(upstream, ["commit", "-m", "commit one"]);
  const clone = join(fleet, "projects", "demo");
  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
  return { fleet, upstream, clone };
}

function upstreamCommit(upstream: string, name: string): string {
  writeFileSync(join(upstream, `${name}.md`), `${name}\n`);
  gitOk(upstream, ["add", "-A"]);
  gitOk(upstream, ["commit", "-m", name]);
  return gitOk(upstream, ["rev-parse", "HEAD"]);
}

function poolCreate(scratch: Scratch, taskId: string, extra: string[] = []): CliResult {
  return runCli(
    ["pool", "create", "--task", taskId, "--project", scratch.clone, ...extra],
    { cwd: scratch.fleet },
  );
}

function worktreeOf(scratch: Scratch, taskId: string): string {
  return join(scratch.fleet, "worktrees", taskId);
}

function recordOf(scratch: Scratch, taskId: string): string {
  return join(scratch.fleet, "worktrees", `${taskId}.pool.json`);
}

test("pool create bases on the fetched remote head when the local default branch is behind", (t) => {
  const scratch = makeScratch(t);
  const remoteHead = upstreamCommit(scratch.upstream, "advance");
  // The clone has not fetched: its local main is behind the remote.
  assert.notEqual(gitOk(scratch.clone, ["rev-parse", "main"]), remoteHead);
  const result = poolCreate(scratch, "t-behind");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), remoteHead, "emitted base is not the remote head");
  const worktree = worktreeOf(scratch, "t-behind");
  assert.equal(gitOk(worktree, ["rev-parse", "HEAD"]), remoteHead);
  assert.equal(gitOk(worktree, ["status", "--porcelain"]), "");
  const record = JSON.parse(readFileSync(recordOf(scratch, "t-behind"), "utf8")) as {
    baseSha: string;
    offline: boolean;
  };
  assert.equal(record.baseSha, remoteHead);
  assert.equal(record.offline, false);
});

test("pool create bases on the fetched remote head when the local default branch is ahead", (t) => {
  const scratch = makeScratch(t);
  const remoteHead = gitOk(scratch.upstream, ["rev-parse", "HEAD"]);
  // Advance the clone's local main past the remote.
  writeFileSync(join(scratch.clone, "local-only.md"), "local\n");
  gitOk(scratch.clone, ["add", "-A"]);
  gitOk(scratch.clone, ["commit", "-m", "local only"]);
  assert.notEqual(gitOk(scratch.clone, ["rev-parse", "main"]), remoteHead);
  const result = poolCreate(scratch, "t-ahead");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), remoteHead, "a stale (ahead) local branch became the base");
  assert.equal(gitOk(worktreeOf(scratch, "t-ahead"), ["rev-parse", "HEAD"]), remoteHead);
});

test("pool create resolves the base from a clone at a detached HEAD", (t) => {
  const scratch = makeScratch(t);
  const remoteHead = gitOk(scratch.upstream, ["rev-parse", "HEAD"]);
  gitOk(scratch.clone, ["checkout", "--detach", "HEAD"]);
  const result = poolCreate(scratch, "t-detached");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), remoteHead);
});

test("pool create resolves the remote default branch when origin/HEAD is unset", (t) => {
  const scratch = makeScratch(t);
  const remoteHead = gitOk(scratch.upstream, ["rev-parse", "HEAD"]);
  gitOk(scratch.clone, ["remote", "set-head", "origin", "--delete"]);
  const result = poolCreate(scratch, "t-nohead");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), remoteHead);
});

test("pool create with an unreachable remote fails and creates nothing", (t) => {
  const scratch = makeScratch(t);
  gitOk(scratch.clone, ["remote", "set-url", "origin", join(scratch.fleet, "no-such-remote")]);
  const before = gitOk(scratch.clone, ["worktree", "list", "--porcelain"]);
  const result = poolCreate(scratch, "t-offline");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fetch.*failed|refusing/i);
  assert.ok(!existsSync(worktreeOf(scratch, "t-offline")), "worktree created despite failure");
  assert.ok(!existsSync(recordOf(scratch, "t-offline")), "record created despite failure");
  assert.equal(gitOk(scratch.clone, ["worktree", "list", "--porcelain"]), before);
});

test("pool create --offline uses the last fetched remote-tracking sha and records offline true", (t) => {
  const scratch = makeScratch(t);
  const lastFetched = gitOk(scratch.clone, ["rev-parse", "refs/remotes/origin/main"]);
  // The remote advances, then becomes unreachable: the last fetched
  // remote-tracking sha (from clone time) is the only honest base.
  upstreamCommit(scratch.upstream, "unseen");
  gitOk(scratch.clone, ["remote", "set-url", "origin", join(scratch.fleet, "no-such-remote")]);
  const result = poolCreate(scratch, "t-offline", ["--offline"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), lastFetched);
  assert.equal(gitOk(worktreeOf(scratch, "t-offline"), ["rev-parse", "HEAD"]), lastFetched);
  const record = JSON.parse(readFileSync(recordOf(scratch, "t-offline"), "utf8")) as {
    baseSha: string;
    offline: boolean;
  };
  assert.equal(record.baseSha, lastFetched);
  assert.equal(record.offline, true);
});

test("pool create with an already-used task id is refused naming the id", (t) => {
  const scratch = makeScratch(t);
  assert.equal(poolCreate(scratch, "t-dup").status, 0);
  const second = poolCreate(scratch, "t-dup");
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /t-dup/);
});

test("two concurrent pool creates for distinct task ids both succeed", async (t) => {
  const scratch = makeScratch(t);
  const results = await Promise.all([
    spawnCli(["pool", "create", "--task", "t-p1", "--project", scratch.clone], {
      cwd: scratch.fleet,
    }),
    spawnCli(["pool", "create", "--task", "t-p2", "--project", scratch.clone], {
      cwd: scratch.fleet,
    }),
  ]);
  for (const result of results) {
    assert.equal(result.status, 0, result.stderr);
  }
  const list = gitOk(scratch.clone, ["worktree", "list", "--porcelain"]);
  assert.ok(list.includes(worktreeOf(scratch, "t-p1")), list);
  assert.ok(list.includes(worktreeOf(scratch, "t-p2")), list);
});

test("pool destroy refuses a dirty worktree and --discard removes it", (t) => {
  const scratch = makeScratch(t);
  assert.equal(poolCreate(scratch, "t-dirty").status, 0);
  const worktree = worktreeOf(scratch, "t-dirty");
  writeFileSync(join(worktree, "uncommitted.txt"), "dirt\n");
  const refused = runCli(["pool", "destroy", "--task", "t-dirty"], { cwd: scratch.fleet });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /uncommitted changes or untracked files/);
  assert.ok(existsSync(worktree), "refused destroy still removed the worktree");
  const discarded = runCli(["pool", "destroy", "--task", "t-dirty", "--discard"], {
    cwd: scratch.fleet,
  });
  assert.equal(discarded.status, 0, discarded.stderr);
  assert.ok(!existsSync(worktree), "--discard left the worktree behind");
  assert.ok(!existsSync(recordOf(scratch, "t-dirty")), "--discard left the record behind");
  const list = gitOk(scratch.clone, ["worktree", "list", "--porcelain"]);
  assert.ok(!list.includes(worktree), "git still registers the discarded worktree");
});

test("pool destroy removes a clean worktree without flags", (t) => {
  const scratch = makeScratch(t);
  assert.equal(poolCreate(scratch, "t-clean").status, 0);
  const worktree = worktreeOf(scratch, "t-clean");
  const result = runCli(["pool", "destroy", "--task", "t-clean"], { cwd: scratch.fleet });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!existsSync(worktree));
  assert.ok(!existsSync(recordOf(scratch, "t-clean")));
  const list = gitOk(scratch.clone, ["worktree", "list", "--porcelain"]);
  assert.ok(!list.includes(worktree));
});

test("pool list prints one line per worktree with task id and HEAD sha", (t) => {
  const scratch = makeScratch(t);
  assert.equal(poolCreate(scratch, "t-l1").status, 0);
  assert.equal(poolCreate(scratch, "t-l2").status, 0);
  const head = gitOk(scratch.upstream, ["rev-parse", "HEAD"]);
  const result = runCli(["pool", "list"], { cwd: scratch.fleet });
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    `t-l1 ${head}`,
    `t-l2 ${head}`,
  ]);
});

test("a git lock file is treated as stale only under the full fail-safe proof", (t) => {
  // FM-036/FM-051: the destroy path may remove an index.lock only when
  // it exists, is old beyond the threshold, and lsof proves no holder;
  // every uncertain reading refuses.
  const dir = makeTempDir(t);
  const lockFile = join(dir, "index.lock");
  writeFileSync(lockFile, "");
  const nowMs = Date.now();
  const noHolders = (): LsofProbe => ({ available: true, exitCode: 1, stdout: "" });
  // Fresh lock: refused regardless of lsof.
  assert.equal(
    poolLib.provablyStaleLock(lockFile, { nowMs, runLsof: noHolders }),
    false,
  );
  // Age the lock past the threshold.
  const old = new Date(nowMs - 3_600_000);
  utimesSync(lockFile, old, old);
  // lsof unavailable: uncertainty, refused.
  assert.equal(
    poolLib.provablyStaleLock(lockFile, {
      nowMs,
      runLsof: () => ({ available: false, exitCode: null, stdout: "" }),
    }),
    false,
  );
  // lsof shows a holder: refused.
  assert.equal(
    poolLib.provablyStaleLock(lockFile, {
      nowMs,
      runLsof: () => ({ available: true, exitCode: 0, stdout: "12345\n" }),
    }),
    false,
  );
  // lsof errored: refused.
  assert.equal(
    poolLib.provablyStaleLock(lockFile, {
      nowMs,
      runLsof: () => ({ available: true, exitCode: 2, stdout: "" }),
    }),
    false,
  );
  // Old lock, lsof available, provably no holder: stale.
  assert.equal(
    poolLib.provablyStaleLock(lockFile, { nowMs, runLsof: noHolders }),
    true,
  );
  // Missing lock file: nothing to prove.
  assert.equal(
    poolLib.provablyStaleLock(join(dir, "no-such.lock"), { nowMs, runLsof: noHolders }),
    false,
  );
});

test("pool destroy deletes the task branch and the id can then be created again", (t) => {
  // CR-201: destroy leaves nothing of the task behind, so re-creating
  // the same id succeeds cleanly instead of failing inside git.
  const scratch = makeScratch(t);
  assert.equal(poolCreate(scratch, "t-recreate").status, 0);
  assert.equal(
    git(scratch.clone, ["rev-parse", "--verify", "--quiet", "refs/heads/task/t-recreate"]).status,
    0,
    "pool create did not make the task branch",
  );
  const destroyed = runCli(["pool", "destroy", "--task", "t-recreate"], { cwd: scratch.fleet });
  assert.equal(destroyed.status, 0, destroyed.stderr);
  assert.notEqual(
    git(scratch.clone, ["rev-parse", "--verify", "--quiet", "refs/heads/task/t-recreate"]).status,
    0,
    "destroy left the task branch behind",
  );
  const recreated = poolCreate(scratch, "t-recreate");
  assert.equal(recreated.status, 0, recreated.stderr);
  assert.equal(
    gitOk(worktreeOf(scratch, "t-recreate"), ["rev-parse", "HEAD"]),
    recreated.stdout.trim(),
  );
});

test("pool destroy refuses with one reason line when the task branch cannot be deleted", (t) => {
  // CR-201 refusal half: the branch is checked out in another worktree,
  // so git refuses the delete and destroy reports one reason line and
  // keeps the record, making the refusal retryable.
  const scratch = makeScratch(t);
  assert.equal(poolCreate(scratch, "t-stuck").status, 0);
  const parked = join(scratch.fleet, "parked");
  gitOk(scratch.clone, ["worktree", "add", "--force", parked, "task/t-stuck"]);
  const refused = runCli(["pool", "destroy", "--task", "t-stuck"], { cwd: scratch.fleet });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /cannot delete branch task\/t-stuck: /);
  assert.equal(
    refused.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${refused.stderr}`,
  );
  assert.ok(existsSync(recordOf(scratch, "t-stuck")), "record dropped despite refusal");
  // Retryable: free the branch and the same command now succeeds.
  gitOk(scratch.clone, ["worktree", "remove", "--force", parked]);
  const retried = runCli(["pool", "destroy", "--task", "t-stuck"], { cwd: scratch.fleet });
  assert.equal(retried.status, 0, retried.stderr);
  assert.ok(!existsSync(recordOf(scratch, "t-stuck")));
});

test("pool create refuses a pre-existing task branch with a reason naming it", (t) => {
  // CR-201: a branch the pool did not create surfaces as a clean
  // refusal, not a raw git error from inside worktree add.
  const scratch = makeScratch(t);
  gitOk(scratch.clone, ["branch", "task/t-foreign"]);
  const result = poolCreate(scratch, "t-foreign");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /branch task\/t-foreign already exists/);
  assert.ok(!existsSync(worktreeOf(scratch, "t-foreign")));
  assert.ok(!existsSync(recordOf(scratch, "t-foreign")));
});

test("only genuine git lock contention is retried", () => {
  // CR-203: git names the lock path when a lock is actually held; the
  // permanent cases below were retried by the previous generic phrases.
  const transientIndex =
    "fatal: Unable to create '/repo/.git/index.lock': File exists.\n\nAnother git process seems to be running";
  const transientRef =
    "error: cannot lock ref 'refs/remotes/origin/main': Unable to create '/repo/.git/refs/remotes/origin/main.lock': File exists.";
  assert.equal(poolLib.isTransientGitLockError(transientIndex), true);
  assert.equal(poolLib.isTransientGitLockError(transientRef), true);
  const permanentDirFileConflict =
    "error: cannot lock ref 'refs/remotes/up/main': 'refs/remotes/up/main/deep' exists; cannot create 'refs/remotes/up/main'";
  const permanentExists =
    "fatal: could not create work tree dir 'x': File exists";
  assert.equal(poolLib.isTransientGitLockError(permanentDirFileConflict), false);
  assert.equal(poolLib.isTransientGitLockError(permanentExists), false);
  assert.equal(poolLib.isTransientGitLockError("fatal: 'occupied' already exists"), false);
});

test("pool subcommand usage errors exit 64 and non-fleet cwd exits 1", (t) => {
  const scratch = makeScratch(t);
  assert.equal(runCli(["pool"], { cwd: scratch.fleet }).status, 64);
  assert.equal(runCli(["pool", "no-such"], { cwd: scratch.fleet }).status, 64);
  assert.equal(runCli(["pool", "create", "--task", "x"], { cwd: scratch.fleet }).status, 64);
  assert.equal(runCli(["pool", "destroy"], { cwd: scratch.fleet }).status, 64);
  const outside = runCli(["pool", "list"], { cwd: makeTempDir(t) });
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /not a fleet home/);
  const badId = runCli(
    ["pool", "create", "--task", "../evil", "--project", scratch.clone],
    { cwd: scratch.fleet },
  );
  assert.equal(badId.status, 1);
  assert.match(badId.stderr, /not a safe path segment/);
});
