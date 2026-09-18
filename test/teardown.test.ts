import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Teardown-guard tests (kernel plan v1, M1-P4 criteria 6 to 10 and 13)
 * against scratch git repositories created per test. Every
 * commit-producing git call carries command-scoped identity environment
 * variables because CI runners have no git identity (EXT-F-02 pattern).
 */

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

const SALVAGE_PREFIX = "WIP-UNREVIEWED (do not treat as reviewed):";

/**
 * THE SPAWN BOUND ON THE CHILD. Sibling of the constant of the same name
 * in test/pool.test.ts, and carrying the same value for the same reason:
 * it is not the bound under test, it is what makes a FAILURE of the bound
 * under test show up as a killed child rather than as a suite that never
 * finishes. Twenty seconds is the shipped NETWORK_TIMEOUT_MS
 * (src/pool.ts:111), and the tests that pass it override the shipped
 * bound down to 1500ms, so the margin is more than ten times the value
 * being waited on.
 */
const SPAWN_BOUND_MS = 20_000;

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Teardown Test",
  GIT_AUTHOR_EMAIL: "teardown-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Teardown Test",
  GIT_COMMITTER_EMAIL: "teardown-test@tiphys.invalid",
};

interface CliResult {
  status: number | null;
  stdout: string;
  /** The command's own stderr, with the guard advisory separated out. */
  stderr: string;
  /** The liveness guard's advisory line, if it fired (M1-P5). */
  advisory: string;
}

function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TIPHYS_HOLDER_ID;
  return env;
}

/**
 * M1-P5 wired the liveness guard into teardown, and every scratch fleet
 * in this file is exactly the state the guard fires on: work in flight
 * and no watcher, so no beacon. The plan mandates BOTH that advisory
 * line (M1-P5 criterion 10) and teardown's own single-reason-line
 * contract (CR-303), so this helper separates them: stderr carries the
 * command's own output, which is what the assertions in this file are
 * about, and advisory carries the guard's line. The separation cannot
 * hide anything, because the helper asserts the guard produced at most
 * one line and everything else still lands in stderr.
 */
/**
 * `timeout` is a SPAWN BOUND ON THE CHILD, and it exists so that a test
 * over a command that must RETURN can fail rather than hang (M4-P19 fix
 * round). Without it, a defect that makes teardown wait forever makes the
 * witness for that defect wait forever too, which is a guard that cannot
 * go red in the most literal way available. A killed child reports
 * `status: null`, and the tests that pass this assert on the status.
 */
function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): CliResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: opts.env ?? baseEnv(),
    ...(opts.timeout === undefined ? {} : { timeout: opts.timeout }),
  });
  const raw = result.stderr ?? "";
  const lines = raw.split("\n");
  const advisory = lines.filter((line) => line.includes("watcher stale"));
  assert.ok(
    advisory.length <= 1,
    `the liveness guard wrote ${String(advisory.length)} lines: ${raw}`,
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: lines.filter((line) => !line.includes("watcher stale")).join("\n"),
    advisory: advisory.join("\n"),
  };
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
    advisory: "",
  };
}

function gitOk(dir: string, args: string[]): string {
  const result = git(dir, args);
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p4-teardown-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

interface Scratch {
  tmp: string;
  fleet: string;
  upstream: string;
  clone: string;
  briefFile: string;
  stub: string;
}

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
  const briefFile = join(tmp, "brief.md");
  writeFileSync(briefFile, "# Brief\n\nDo the thing.\n");
  const stub = join(tmp, "payload.sh");
  writeFileSync(stub, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return { tmp, fleet, upstream, clone, briefFile, stub };
}

function worktreeOf(scratch: Scratch, taskId: string): string {
  return join(scratch.fleet, "worktrees", taskId);
}

function taskDirOf(scratch: Scratch, taskId: string): string {
  return join(scratch.fleet, "tasks", taskId);
}

function metaStatus(scratch: Scratch, taskId: string): string {
  return (
    JSON.parse(readFileSync(join(taskDirOf(scratch, taskId), "meta.json"), "utf8")) as {
      status: string;
    }
  ).status;
}

/** Spawn a task through the real CLI, which is how one ever exists. */
function spawnTask(
  scratch: Scratch,
  taskId: string,
  shape: "ship" | "scout" = "ship",
  env?: NodeJS.ProcessEnv,
): CliResult {
  return runCli(
    [
      "spawn",
      "--task",
      taskId,
      "--project",
      scratch.clone,
      "--brief",
      scratch.briefFile,
      "--shape",
      shape,
      "--exec",
      scratch.stub,
    ],
    { cwd: scratch.fleet, env },
  );
}

function teardown(
  scratch: Scratch,
  taskId: string,
  extra: string[] = [],
  env?: NodeJS.ProcessEnv,
  timeout?: number,
): CliResult {
  return runCli(["teardown", "--task", taskId, ...extra], {
    cwd: scratch.fleet,
    env,
    timeout,
  });
}

/** Commit a file in the task worktree and return the new head sha. */
function commitInWorktree(scratch: Scratch, taskId: string, name: string): string {
  const worktree = worktreeOf(scratch, taskId);
  writeFileSync(join(worktree, name), `${name}\n`);
  gitOk(worktree, ["add", "-A"]);
  gitOk(worktree, ["commit", "-m", `work ${name}`]);
  return gitOk(worktree, ["rev-parse", "HEAD"]);
}

function pushTaskBranch(scratch: Scratch, taskId: string): void {
  gitOk(worktreeOf(scratch, taskId), [
    "push",
    "origin",
    `HEAD:refs/heads/task/${taskId}`,
  ]);
}

/** Squash-merge the task branch into the upstream default branch. */
function squashLand(scratch: Scratch, taskId: string): string {
  gitOk(scratch.upstream, ["merge", "--squash", `task/${taskId}`]);
  gitOk(scratch.upstream, ["commit", "-m", `squash land ${taskId}`]);
  return gitOk(scratch.upstream, ["rev-parse", "HEAD"]);
}

test("teardown refuses a ship task whose branch is not landed", (t) => {
  // Criterion 6: the refusal is evaluated against freshly fetched remote
  // state, and it leaves the worktree alone.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-unlanded").status, 0);
  commitInWorktree(scratch, "t-unlanded", "work.md");
  pushTaskBranch(scratch, "t-unlanded");

  const result = teardown(scratch, "t-unlanded");
  assert.notEqual(result.status, 0, "an unlanded branch was torn down");
  assert.equal(
    result.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${result.stderr}`,
  );
  assert.match(result.stderr, /task\/t-unlanded/);
  assert.ok(existsSync(worktreeOf(scratch, "t-unlanded")), "the refusal removed the worktree");
  assert.equal(metaStatus(scratch, "t-unlanded"), "open");
});

test("teardown recognizes a squash merge as landed against freshly fetched state", (t) => {
  // Criterion 7: two commits, squash-merged on the remote, with the
  // teardown-side clone's local default ref deliberately stale. A
  // per-commit patch-id implementation cannot pass this.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-squash").status, 0);
  commitInWorktree(scratch, "t-squash", "one.md");
  commitInWorktree(scratch, "t-squash", "two.md");
  assert.equal(
    gitOk(worktreeOf(scratch, "t-squash"), ["rev-list", "--count", "HEAD", "^refs/remotes/origin/main"]),
    "2",
    "precondition: the branch carries two commits",
  );
  pushTaskBranch(scratch, "t-squash");
  const landedHead = squashLand(scratch, "t-squash");

  // The clone knows nothing of the squash yet, locally or in its
  // remote-tracking ref: only teardown's own fetch can find it.
  assert.notEqual(gitOk(scratch.clone, ["rev-parse", "refs/heads/main"]), landedHead);
  assert.notEqual(
    gitOk(scratch.clone, ["rev-parse", "refs/remotes/origin/main"]),
    landedHead,
    "precondition: the tracking ref is stale before teardown",
  );

  const result = teardown(scratch, "t-squash");
  assert.equal(result.status, 0, `a squash-landed branch was refused: ${result.stderr}`);
  assert.ok(!existsSync(worktreeOf(scratch, "t-squash")));
  assert.equal(metaStatus(scratch, "t-squash"), "closed");
});

test("teardown refuses a dirty tree and salvage never overrides the unlanded refusal", (t) => {
  // Criterion 8, all three directions, in the order a real task meets
  // them.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-salvage").status, 0);
  const worktree = worktreeOf(scratch, "t-salvage");
  commitInWorktree(scratch, "t-salvage", "one.md");
  const committed = commitInWorktree(scratch, "t-salvage", "two.md");
  pushTaskBranch(scratch, "t-salvage");
  writeFileSync(join(worktree, "leavings.txt"), "uncommitted work\n");

  const plain = teardown(scratch, "t-salvage");
  assert.notEqual(plain.status, 0, "a dirty ship worktree was torn down");
  assert.match(plain.stderr, /uncommitted changes or untracked files/);

  const salvageUnlanded = teardown(scratch, "t-salvage", ["--salvage"]);
  assert.notEqual(salvageUnlanded.status, 0, "--salvage overrode the unlanded refusal");
  assert.match(salvageUnlanded.stderr, /not landed/);
  // The refusal is a true no-op: nothing was committed and nothing pushed.
  assert.equal(gitOk(worktree, ["rev-parse", "HEAD"]), committed);
  assert.equal(
    gitOk(scratch.upstream, ["rev-parse", "refs/heads/task/t-salvage"]),
    committed,
  );
  assert.ok(existsSync(join(worktree, "leavings.txt")));

  squashLand(scratch, "t-salvage");
  const salvaged = teardown(scratch, "t-salvage", ["--salvage"]);
  assert.equal(salvaged.status, 0, `salvage on a landed dirty tree failed: ${salvaged.stderr}`);
  const tipMessage = gitOk(scratch.upstream, [
    "log",
    "-1",
    "--format=%s",
    "refs/heads/task/t-salvage",
  ]);
  assert.ok(
    tipMessage.startsWith(SALVAGE_PREFIX),
    `the salvaged commit is not labelled: ${tipMessage}`,
  );
  // The rescued content really is in that commit, on the remote.
  assert.match(
    gitOk(scratch.upstream, [
      "show",
      "--name-only",
      "--format=",
      "refs/heads/task/t-salvage",
    ]),
    /leavings\.txt/,
  );
  assert.ok(!existsSync(worktree));
  assert.equal(metaStatus(scratch, "t-salvage"), "closed");
});

test("teardown refuses a scout without a report and discards its scratch worktree with one", (t) => {
  // Criterion 9: scouts are judged by their report, their scratch tree
  // is discarded, and they never push.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-scout", "scout").status, 0);
  const worktree = worktreeOf(scratch, "t-scout");
  writeFileSync(join(worktree, "scratch.txt"), "scratch\n");
  const remoteBefore = gitOk(scratch.clone, ["ls-remote", "origin"]);

  const refused = teardown(scratch, "t-scout");
  assert.notEqual(refused.status, 0, "a scout without a report was torn down");
  assert.match(refused.stderr, /report/);
  assert.ok(existsSync(worktree), "the refusal removed the scratch worktree");

  writeFileSync(join(taskDirOf(scratch, "t-scout"), "report.md"), "# Scout report\n");
  const done = teardown(scratch, "t-scout");
  assert.equal(done.status, 0, `a reported scout was refused: ${done.stderr}`);
  assert.ok(!existsSync(worktree), "the scratch worktree survived teardown");
  assert.equal(metaStatus(scratch, "t-scout"), "closed");
  assert.equal(
    gitOk(scratch.clone, ["ls-remote", "origin"]),
    remoteBefore,
    "the scout teardown changed remote refs; scouts never push",
  );
});

test("a scout that committed to its scratch branch is refused, not silently discarded", (t) => {
  // The scout carve-out is the DIRTY-TREE override only (--discard).
  // Passing the branch-force flag here as well would make the scout path
  // delete commits without a word, which is exactly the M1-P3 V-1
  // data-loss defect in a new place. The pool's branch gate must be the
  // one that speaks, and the commit must survive.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-scoutwork", "scout").status, 0);
  const sha = commitInWorktree(scratch, "t-scoutwork", "found.md");
  writeFileSync(join(taskDirOf(scratch, "t-scoutwork"), "report.md"), "# Scout report\n");

  const result = teardown(scratch, "t-scoutwork");
  assert.notEqual(result.status, 0, "committed scout work was destroyed without a word");
  assert.match(result.stderr, /task\/t-scoutwork/);
  assert.equal(
    gitOk(scratch.clone, ["rev-parse", "refs/heads/task/t-scoutwork"]),
    sha,
    "the scout branch was deleted",
  );
  assert.equal(metaStatus(scratch, "t-scoutwork"), "open");

  // CR-304: the advice must be performable through the command that
  // printed it. Passing the pool's own reason through told the operator
  // to use --delete-branch-force, which teardown does not accept, so the
  // task could never reach closed.
  assert.doesNotMatch(
    result.stderr,
    /--delete-branch-force/,
    `the refusal advises a flag teardown does not accept: ${result.stderr}`,
  );
  assert.equal(result.stderr.trim().split("\n").length, 1, result.stderr);
  const base = JSON.parse(
    readFileSync(join(scratch.fleet, "worktrees", "t-scoutwork.pool.json"), "utf8"),
  ) as { baseSha: string };
  assert.ok(result.stderr.includes(base.baseSha), result.stderr);

  // Follow the printed route exactly, and it must work: push the
  // findings somewhere durable, release the branch, re-run.
  gitOk(worktreeOf(scratch, "t-scoutwork"), [
    "push",
    "origin",
    "HEAD:refs/heads/scout-findings",
  ]);
  gitOk(scratch.clone, ["update-ref", "refs/heads/task/t-scoutwork", base.baseSha]);
  const retried = teardown(scratch, "t-scoutwork");
  assert.equal(retried.status, 0, `the printed route did not work: ${retried.stderr}`);
  assert.equal(metaStatus(scratch, "t-scoutwork"), "closed");
  assert.equal(
    gitOk(scratch.upstream, ["rev-parse", "refs/heads/scout-findings"]),
    sha,
    "the rescued findings did not survive",
  );
});

test("a successful teardown closes the task meta and unregisters the worktree", (t) => {
  // Criterion 10, on the simplest landed case: a branch still at its
  // base is an ancestor of the fetched default head.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-close").status, 0);
  const worktree = worktreeOf(scratch, "t-close");
  assert.ok(
    gitOk(scratch.clone, ["worktree", "list", "--porcelain"]).includes(worktree),
    "precondition: git registers the worktree",
  );

  const result = teardown(scratch, "t-close");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(metaStatus(scratch, "t-close"), "closed");
  assert.ok(
    !gitOk(scratch.clone, ["worktree", "list", "--porcelain"]).includes(worktree),
    "git still lists the torn-down worktree",
  );
  assert.ok(!existsSync(worktree));
});

test("teardown refuses without matching holdership and proceeds with it", (t) => {
  // Criterion 13, falsifiable in both directions, consuming lock
  // acquire's real captured output rather than a hand-written id.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-hold").status, 0);
  const acquired = runCli(["lock", "acquire"], { cwd: scratch.fleet });
  assert.equal(acquired.status, 0, acquired.stderr);
  const match = /^acquired (\S+) expires (\S+)$/m.exec(acquired.stdout.trim());
  assert.ok(match !== null, `unexpected acquire output: ${acquired.stdout}`);
  const holderId = match[1] as string;

  const unset = teardown(scratch, "t-hold");
  assert.notEqual(unset.status, 0, "teardown proceeded with no holder identity");
  assert.match(unset.stderr, /orchestrator\.lock/);
  assert.ok(existsSync(worktreeOf(scratch, "t-hold")), "the refusal removed the worktree");
  assert.equal(metaStatus(scratch, "t-hold"), "open");

  const wrong = teardown(scratch, "t-hold", [], {
    ...baseEnv(),
    TIPHYS_HOLDER_ID: "not-the-holder",
  });
  assert.notEqual(wrong.status, 0, "teardown proceeded with a foreign holder id");
  assert.ok(wrong.stderr.includes(holderId), wrong.stderr);
  assert.ok(existsSync(worktreeOf(scratch, "t-hold")));

  const matching = teardown(scratch, "t-hold", [], {
    ...baseEnv(),
    TIPHYS_HOLDER_ID: holderId,
  });
  assert.equal(matching.status, 0, matching.stderr);
  assert.equal(metaStatus(scratch, "t-hold"), "closed");
});

test("a destroy that fails partway is reported as a partial failure, never as a refusal", (t) => {
  // The M1-P3 destroy contract teardown drives: a stage-2 refusal is a
  // true no-op, while a stage-3 failure has already removed the worktree
  // and must enumerate what survives. This test is red against the
  // DANGEROUS state: teardown describing the second as the first, or
  // implying nothing changed while the worktree is gone.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-partial").status, 0);
  const worktree = worktreeOf(scratch, "t-partial");
  // A sha that exists in the clone and differs from the branch tip.
  writeFileSync(join(scratch.upstream, "moved.md"), "moved\n");
  gitOk(scratch.upstream, ["add", "-A"]);
  gitOk(scratch.upstream, ["commit", "-m", "moved on"]);
  gitOk(scratch.clone, ["fetch", "origin"]);
  const movedTip = gitOk(scratch.clone, ["rev-parse", "refs/remotes/origin/main"]);
  assert.notEqual(movedTip, gitOk(scratch.clone, ["rev-parse", "refs/heads/task/t-partial"]));

  // Open the window for real: move the branch immediately after the
  // worktree removal, which is the one step between the gate and the
  // branch delete.
  const binDir = mkdtempSync(join(tmpdir(), "tiphys-p4-movegit-"));
  t.after(() => {
    rmSync(binDir, { recursive: true, force: true });
  });
  const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" })
    .stdout.trim();
  assert.ok(realGit !== "", "could not locate the real git");
  writeFileSync(
    join(binDir, "git"),
    `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const real = ${JSON.stringify(realGit)};
const r = spawnSync(real, args, { stdio: "inherit" });
if (args.includes("worktree") && args.includes("remove") && r.status === 0) {
  spawnSync(real, ["-C", ${JSON.stringify(scratch.clone)}, "update-ref", "refs/heads/task/t-partial", ${JSON.stringify(movedTip)}], { stdio: "ignore" });
}
process.exit(r.status === null ? 1 : r.status);
`,
    { mode: 0o755 },
  );

  const result = teardown(scratch, "t-partial", [], {
    ...baseEnv(),
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  });
  assert.notEqual(result.status, 0, "teardown reported success on a failed destroy");
  assert.match(
    result.stderr,
    /partial destroy/,
    `a destructive path was not reported as a partial failure: ${result.stderr}`,
  );
  assert.match(result.stderr, /HAS BEEN REMOVED/, "the message hides the worktree removal");
  assert.match(result.stderr, /was NOT deleted/, "the message hides that the branch survives");
  assert.ok(result.stderr.includes(movedTip), result.stderr);
  assert.doesNotMatch(
    result.stderr,
    /nothing was (removed|changed)|left alone|was not touched|no-op|teardown refused|refusing/i,
    `a partial failure was dressed up as a refusal: ${result.stderr}`,
  );
  // The pool's classification arrives first and intact: teardown adds
  // only what it knows for certain, and substitutes no framing of its
  // own for the word "partial".
  assert.ok(
    result.stderr.startsWith("tiphys teardown: pool destroy did not complete: partial destroy"),
    `teardown replaced the destroy's own classification: ${result.stderr}`,
  );
  assert.match(result.stderr, /task t-partial stays open/);
  // The enumeration must agree with the real remaining state.
  assert.ok(!existsSync(worktree), "precondition for this path: the worktree is removed");
  assert.equal(gitOk(scratch.clone, ["rev-parse", "refs/heads/task/t-partial"]), movedTip);
  assert.ok(existsSync(join(scratch.fleet, "worktrees", "t-partial.pool.json")));
  assert.equal(metaStatus(scratch, "t-partial"), "open", "a failed teardown closed the task");
});

test("teardown refuses when the default branch cannot be fetched", (t) => {
  // Fail closed: "I could not check" is not "it is landed" (PR-001).
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-nofetch").status, 0);
  gitOk(scratch.clone, [
    "remote",
    "set-url",
    "origin",
    join(scratch.tmp, "no-such-remote"),
  ]);
  const result = teardown(scratch, "t-nofetch");
  assert.notEqual(result.status, 0, "teardown judged landedness without a fetch");
  assert.match(result.stderr, /fetch of origin\/main failed/);
  // CR-303: git's own stderr for an unreachable remote is five lines;
  // plan step 5 specifies one reason line, and the M1-P6 harness reads it.
  assert.equal(
    result.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${result.stderr}`,
  );
  assert.ok(existsSync(worktreeOf(scratch, "t-nofetch")));
  assert.equal(metaStatus(scratch, "t-nofetch"), "open");
});

test("a meta write that fails after the destroy is a partial teardown, not a crash", (t) => {
  // F-1, red against the dangerous state: the worktree and branch are
  // already gone when meta.json is marked closed, so a raised write there
  // used to crash the CLI with a stack trace and leave the single state
  // authority (C-1) reading "open" for a task whose worktree no longer
  // exists. The failure is forced for real, not mocked: a stub git
  // removes the task directory the instant the worktree removal
  // succeeds, so the meta write raises ENOENT at exactly that point.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-metafail").status, 0);
  const worktree = worktreeOf(scratch, "t-metafail");
  const taskDir = taskDirOf(scratch, "t-metafail");

  const binDir = mkdtempSync(join(tmpdir(), "tiphys-p4-metafail-"));
  t.after(() => {
    rmSync(binDir, { recursive: true, force: true });
  });
  const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" })
    .stdout.trim();
  assert.ok(realGit !== "", "could not locate the real git");
  writeFileSync(
    join(binDir, "git"),
    `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const args = process.argv.slice(2);
const r = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" });
if (args.includes("worktree") && args.includes("remove") && r.status === 0) {
  fs.rmSync(${JSON.stringify(taskDir)}, { recursive: true, force: true });
}
process.exit(r.status === null ? 1 : r.status);
`,
    { mode: 0o755 },
  );

  const result = teardown(scratch, "t-metafail", [], {
    ...baseEnv(),
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  });
  assert.notEqual(result.status, 0, "teardown reported success without closing the task");
  assert.equal(
    result.stderr.trim().split("\n").length,
    1,
    `a raised error escaped as a stack trace: ${result.stderr}`,
  );
  assert.doesNotMatch(result.stderr, /at writeFileSync|at setTaskStatus|node:fs/);
  assert.ok(
    result.stderr.startsWith("tiphys teardown: partial teardown of task id t-metafail"),
    `the outcome was not reported as a partial teardown: ${result.stderr}`,
  );
  assert.match(result.stderr, /HAS BEEN REMOVED/, "the message hides the worktree removal");
  assert.match(
    result.stderr,
    /could not be marked closed/,
    "the message hides that the task record was not updated",
  );
  assert.doesNotMatch(result.stderr, /nothing was (removed|changed)|no-op/i);
  // The enumeration must match the real state.
  assert.ok(!existsSync(worktree), "precondition for this path: the worktree is removed");
});

test("a salvage whose push fails reports the local commit and refuses in one line", (t) => {
  // CR-302 and CR-303 together: this is the ONE nonzero exit that can
  // leave a change behind, so the claim "a refused teardown never
  // commits" is narrowed to refusals that precede the salvage step, and
  // the reason line says what really happened, in one line.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-pushfail").status, 0);
  const worktree = worktreeOf(scratch, "t-pushfail");
  commitInWorktree(scratch, "t-pushfail", "one.md");
  pushTaskBranch(scratch, "t-pushfail");
  squashLand(scratch, "t-pushfail");
  writeFileSync(join(worktree, "leavings.txt"), "uncommitted\n");
  const before = gitOk(worktree, ["rev-parse", "HEAD"]);
  gitOk(scratch.clone, [
    "remote",
    "set-url",
    "--push",
    "origin",
    join(scratch.tmp, "no-such-remote"),
  ]);

  const result = teardown(scratch, "t-pushfail", ["--salvage"]);
  assert.notEqual(result.status, 0, "a failed push was reported as success");
  assert.equal(
    result.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${result.stderr}`,
  );
  assert.match(result.stderr, /the commit is local only/);
  // Nothing destroyed, and the leavings are rescued into a labelled commit.
  assert.ok(existsSync(worktree), "the failed salvage removed the worktree");
  assert.equal(metaStatus(scratch, "t-pushfail"), "open");
  const after = gitOk(worktree, ["rev-parse", "HEAD"]);
  assert.notEqual(after, before, "the salvage did not commit the leavings");
  assert.ok(
    gitOk(worktree, ["log", "-1", "--format=%s"]).startsWith(SALVAGE_PREFIX),
    "the local salvage commit is not labelled",
  );
});

test("the scout teardown path never passes the branch-force flag", () => {
  // N-401. The behavioural witness for this decision (W9: flip the
  // scout path's deleteBranchForce to true) went GREEN once the CR-304
  // pre-check landed, because the pre-check refuses a committed scout
  // before pool destroy is ever called, so the inner flag's value stopped
  // being observable at runtime. That left the phase's live decision 18
  // guarded by one gate while the record claimed two, which is the T-003
  // shape: a registered, green, worthless witness, in the component where
  // V-1 happened.
  //
  // The inner gate is defence in depth and cannot be witnessed
  // behaviourally while the outer one holds, so it is guarded
  // structurally instead, the way C-2 is guarded in test/lock.test.ts.
  // The dangerous edit is precisely a maintainer copying the ship path's
  // deleteBranchForce: true onto the scout path, and that edit fails
  // here.
  const source = readFileSync(
    fileURLToPath(new URL("../src/teardown.ts", import.meta.url)),
    "utf8",
  );
  const start = source.indexOf('if (meta.shape === "scout") {');
  const end = source.indexOf("// (b) ship.");
  assert.ok(start > 0 && end > start, "the scout branch could not be located in src/teardown.ts");
  const scoutBranch = source.slice(start, end);
  assert.match(
    scoutBranch,
    /deleteBranchForce: false/,
    "the scout path no longer passes deleteBranchForce: false explicitly",
  );
  assert.doesNotMatch(
    scoutBranch,
    /deleteBranchForce: true/,
    "the scout path authorizes deleting a branch that carries commits",
  );
});

test("teardown usage errors exit 64 and an unknown task exits 1", (t) => {
  const scratch = makeScratch(t);
  assert.equal(runCli(["teardown"], { cwd: scratch.fleet }).status, 64);
  assert.equal(runCli(["teardown", "--nope"], { cwd: scratch.fleet }).status, 64);
  const unknown = teardown(scratch, "t-missing");
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /no readable task meta/);
  const outside = runCli(["teardown", "--task", "x"], { cwd: makeTempDir(t) });
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /not a fleet home/);
});

/* ================================================================== *
 * M4-P19: post-reclaim teardown on a RECONSTRUCTED pool record.
 *
 * THE MECHANISM THESE GUARD, stated once here rather than per test:
 * DESTRUCTION AUTHORIZED BY A FIELD THAT WAS GUESSED RATHER THAN DERIVED,
 * and its twin, DESTRUCTION AUTHORIZED BY THE PRESENCE OF A FLAG RATHER
 * THAN BY A GATE.
 *
 * meta.json survives a reclaim and carries six of the eight PoolRecord
 * fields. It does NOT carry `remote` or `branch`, and those two are what
 * `defaultRef` is built from, which is what landed-ness is judged against,
 * which is what authorizes deleting the task branch. So a guess there is
 * not a cosmetic inaccuracy: it is the V-1 defect reached from the reclaim
 * side.
 *
 * TWO STRUCTURALLY DIFFERENT DANGEROUS STATES are reddened below, and the
 * captures of each mutant are in delivery/work-history/m4-p19.md:
 *
 *   D1, "the flag is a destruction override". The natural mis-read of
 *       "mirrors the existing explicit-destruction pattern": pass
 *       discard: true and deleteBranchForce: true, because there is no
 *       record so nothing can be checked. Reddened by the dirty-worktree
 *       member (UNCOMMITTED loss, through discard) and by the unlanded
 *       member (COMMITTED loss, through deleteBranchForce). Those two are
 *       structurally different: different gate, different thing lost, and
 *       an implementation can defeat one while passing the other.
 *   D2, "fill the two missing fields with plausible defaults" (origin and
 *       main). Reddened by the non-default-branch member, where the guess
 *       RESOLVES and says landed while the real default branch has none
 *       of the work.
 * ================================================================== */

/**
 * A scratch whose upstream default branch is NOT `main`. The decoy branch
 * is what makes a guessed `branch: "main"` resolve instead of failing
 * safe at the fetch, which is the difference between a witness and a
 * test that would pass against the dangerous state.
 */
function makeScratchWithDefaultBranch(
  t: { after(fn: () => void): void },
  defaultBranch: string,
): Scratch {
  const tmp = makeTempDir(t);
  const fleet = join(tmp, "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  const upstream = join(tmp, "upstream");
  gitOk(tmp, ["init", `--initial-branch=${defaultBranch}`, upstream]);
  writeFileSync(join(upstream, "readme.md"), "upstream\n");
  gitOk(upstream, ["add", "-A"]);
  gitOk(upstream, ["commit", "-m", "commit one"]);
  const clone = join(fleet, "projects", "demo");
  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
  const briefFile = join(tmp, "brief.md");
  writeFileSync(briefFile, "# Brief\n\nDo the thing.\n");
  const stub = join(tmp, "payload.sh");
  writeFileSync(stub, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return { tmp, fleet, upstream, clone, briefFile, stub };
}

function recordOf(scratch: Scratch, taskId: string): string {
  return join(scratch.fleet, "worktrees", `${taskId}.pool.json`);
}

/** Delete the pool record and leave the worktree: the post-reclaim shape. */
function reclaimRecord(scratch: Scratch, taskId: string): void {
  rmSync(recordOf(scratch, taskId));
  assert.equal(existsSync(recordOf(scratch, taskId)), false);
}

/** Criterion 6: every *.pool.json under worktrees/, which must stay empty. */
function recordFilesIn(scratch: Scratch): string[] {
  return readdirSync(join(scratch.fleet, "worktrees"))
    .filter((name) => name.endsWith(".pool.json"))
    .sort();
}

test("teardown without a pool record names --from-reconstructed as the remedy", (t) => {
  // Criterion 2. Asserted on the REMEDY TOKEN, not on the exit code: the
  // exit code is nonzero today, so a test over it alone is green against
  // the state this criterion exists to change.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-noflag").status, 0);
  reclaimRecord(scratch, "t-noflag");

  const refused = teardown(scratch, "t-noflag");
  assert.equal(refused.status, 1, refused.stderr);
  assert.equal(
    refused.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${refused.stderr}`,
  );
  assert.match(refused.stderr, /--from-reconstructed/);
  assert.ok(existsSync(worktreeOf(scratch, "t-noflag")));
  assert.equal(metaStatus(scratch, "t-noflag"), "open");
  assert.deepEqual(recordFilesIn(scratch), []);
});

test("teardown --from-reconstructed closes a landed task whose record did not survive", (t) => {
  // Criterion 3's SUCCESS arm. Without it the other three could all be
  // satisfied by a flag that refuses unconditionally, which would be a
  // guard that cannot go green: the mirror of the one that cannot go red.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-recon-ok").status, 0);
  commitInWorktree(scratch, "t-recon-ok", "work.md");
  pushTaskBranch(scratch, "t-recon-ok");
  squashLand(scratch, "t-recon-ok");
  reclaimRecord(scratch, "t-recon-ok");

  const done = teardown(scratch, "t-recon-ok", ["--from-reconstructed"]);
  assert.equal(done.status, 0, done.stderr);
  assert.equal(done.stdout.trim(), "torn down t-recon-ok");
  assert.equal(existsSync(worktreeOf(scratch, "t-recon-ok")), false);
  assert.equal(metaStatus(scratch, "t-recon-ok"), "closed");
  // Criterion 6 on the one path that could plausibly have written one.
  assert.deepEqual(recordFilesIn(scratch), []);
});

test("teardown --from-reconstructed names the field it could not derive and refuses", (t) => {
  // Criterion 3's FAILURE arm. The message names `remote`, a PoolRecord
  // field, rather than reporting a generic failure: the operator's remedy
  // is different per field, so the field is the useful half.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-noremote").status, 0);
  commitInWorktree(scratch, "t-noremote", "work.md");
  pushTaskBranch(scratch, "t-noremote");
  squashLand(scratch, "t-noremote");
  reclaimRecord(scratch, "t-noremote");
  // The clone's only remote goes, so neither field can be derived. The
  // task is otherwise PERFECTLY tearable-down: the previous test proves
  // this exact fixture exits 0 with the remote in place, so the refusal
  // here is attributable to the unresolvable field and to nothing else.
  gitOk(scratch.clone, ["remote", "remove", "origin"]);

  const refused = teardown(scratch, "t-noremote", ["--from-reconstructed"]);
  assert.equal(refused.status, 1, refused.stdout);
  assert.equal(
    refused.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${refused.stderr}`,
  );
  assert.match(refused.stderr, /unresolved field\(s\) remote, branch/);
  assert.ok(existsSync(worktreeOf(scratch, "t-noremote")), "the refusal removed the worktree");
  assert.equal(metaStatus(scratch, "t-noremote"), "open");
  assert.deepEqual(recordFilesIn(scratch), []);
});

test("teardown --from-reconstructed refuses a dirty worktree and removes nothing", (t) => {
  // Criterion 4. RED WITNESS, dangerous state D1, member A: UNCOMMITTED
  // work lost through a discard the flag was read as authorizing.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-recon-dirty").status, 0);
  commitInWorktree(scratch, "t-recon-dirty", "work.md");
  pushTaskBranch(scratch, "t-recon-dirty");
  squashLand(scratch, "t-recon-dirty");
  const worktree = worktreeOf(scratch, "t-recon-dirty");
  // Both shapes of dirt the cleanliness check covers, so the witness is
  // not specific to one of them.
  writeFileSync(join(worktree, "work.md"), "work\nedited but not committed\n");
  writeFileSync(join(worktree, "untracked.md"), "never added\n");
  reclaimRecord(scratch, "t-recon-dirty");
  const before = gitOk(worktree, ["status", "--porcelain"]);
  assert.notEqual(before, "", "precondition: the worktree is dirty");

  const refused = teardown(scratch, "t-recon-dirty", ["--from-reconstructed"]);
  assert.equal(refused.status, 1, refused.stdout);
  assert.equal(
    refused.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${refused.stderr}`,
  );
  assert.ok(existsSync(worktree), "the refusal removed the worktree");
  assert.equal(
    gitOk(worktree, ["status", "--porcelain"]),
    before,
    "the refusal changed the worktree's status output",
  );
  assert.equal(metaStatus(scratch, "t-recon-dirty"), "open");
  assert.deepEqual(recordFilesIn(scratch), []);
});

test("teardown --from-reconstructed refuses an unlanded branch and names its tip", (t) => {
  // Criterion 5. RED WITNESS, dangerous state D1, member B, structurally
  // different from member A: the worktree is CLEAN, so the dirty gate has
  // nothing to say, and what is at risk is COMMITTED work destroyed by a
  // branch delete. An implementation that passes discard: true but not
  // deleteBranchForce: true is green on A and red here; one that passes
  // deleteBranchForce: true but not discard: true is the reverse. One
  // witness is not a class.
  const scratch = makeScratchWithDefaultBranch(t, "main");
  assert.equal(spawnTask(scratch, "t-recon-unlanded").status, 0);
  const tip = commitInWorktree(scratch, "t-recon-unlanded", "work.md");
  pushTaskBranch(scratch, "t-recon-unlanded");
  // Deliberately NOT landed: the upstream default branch never sees it.
  reclaimRecord(scratch, "t-recon-unlanded");
  const worktree = worktreeOf(scratch, "t-recon-unlanded");
  assert.equal(gitOk(worktree, ["status", "--porcelain"]), "", "precondition: clean");

  const refused = teardown(scratch, "t-recon-unlanded", ["--from-reconstructed"]);
  assert.equal(refused.status, 1, refused.stdout);
  assert.equal(
    refused.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${refused.stderr}`,
  );
  // The TIP SHA, which is the recovery handle. Compared against git's own
  // answer rather than a hand-written string.
  assert.ok(refused.stderr.includes(tip), `${refused.stderr} does not name ${tip}`);
  assert.ok(existsSync(worktree), "the refusal removed the worktree");
  assert.equal(
    gitOk(scratch.clone, ["rev-parse", "refs/heads/task/t-recon-unlanded"]),
    tip,
    "the refusal deleted or moved the task branch",
  );
  assert.equal(metaStatus(scratch, "t-recon-unlanded"), "open");
  assert.deepEqual(recordFilesIn(scratch), []);
});

test("teardown --from-reconstructed derives a non-main default branch instead of guessing", (t) => {
  // RED WITNESS, dangerous state D2, structurally different from D1: the
  // gates are intact and the INPUT to them is wrong.
  //
  // The upstream default branch is `trunk`. A DECOY `main` exists and is
  // fast-forwarded to the task branch's tip, so an implementation that
  // fills the two missing fields with "origin" and "main" fetches
  // successfully, judges the branch LANDED, and destroys the worktree and
  // deletes the branch, while `trunk` carries none of the work. The decoy
  // is load-bearing: without it the guess would fail at the fetch and
  // this test would be green against the dangerous state.
  const scratch = makeScratchWithDefaultBranch(t, "trunk");
  assert.equal(spawnTask(scratch, "t-trunk").status, 0);
  const tip = commitInWorktree(scratch, "t-trunk", "work.md");
  pushTaskBranch(scratch, "t-trunk");
  gitOk(scratch.upstream, ["branch", "main", `task/t-trunk`]);
  assert.equal(
    gitOk(scratch.upstream, ["rev-parse", "refs/heads/main"]),
    tip,
    "precondition: the decoy main carries the task branch tip",
  );
  assert.notEqual(
    gitOk(scratch.upstream, ["rev-parse", "refs/heads/trunk"]),
    tip,
    "precondition: the REAL default branch does not carry the work",
  );
  reclaimRecord(scratch, "t-trunk");

  const refused = teardown(scratch, "t-trunk", ["--from-reconstructed"]);
  assert.equal(refused.status, 1, refused.stdout);
  // The refusal names the REAL default branch, which is the derived value.
  assert.match(refused.stderr, /origin\/trunk/, refused.stderr);
  assert.ok(refused.stderr.includes(tip), `${refused.stderr} does not name ${tip}`);
  assert.ok(existsSync(worktreeOf(scratch, "t-trunk")), "the refusal removed the worktree");
  assert.equal(
    gitOk(scratch.clone, ["rev-parse", "refs/heads/task/t-trunk"]),
    tip,
    "the refusal deleted or moved the task branch",
  );
  assert.equal(metaStatus(scratch, "t-trunk"), "open");
  assert.deepEqual(recordFilesIn(scratch), []);
});

test("no teardown path writes a reconstructed record to worktrees/", (t) => {
  // Criterion 6, as its own guard rather than only as an assertion tacked
  // onto each test above. A reconstruction that reached disk would be
  // indistinguishable from an original to every later reader, including
  // the destroy gate that treats the record as authoritative.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-nowrite").status, 0);
  reclaimRecord(scratch, "t-nowrite");

  // Every command this phase touches, on the reconstructed task.
  runCli(["pool", "list"], { cwd: scratch.fleet });
  runCli(["doctor"], { cwd: scratch.fleet });
  teardown(scratch, "t-nowrite");
  teardown(scratch, "t-nowrite", ["--from-reconstructed"]);
  assert.deepEqual(recordFilesIn(scratch), []);

  // And the source carries no write of a reconstruction, so a future call
  // site cannot reopen the hole without the change being visible here.
  const poolSource = readFileSync(
    fileURLToPath(new URL("../src/pool.ts", import.meta.url)),
    "utf8",
  );
  const start = poolSource.indexOf("export function reconstructPoolRecord(");
  const end = poolSource.indexOf("export interface CreateOptions {");
  assert.ok(start > 0 && end > start, "reconstructPoolRecord could not be located");
  const body = poolSource.slice(start, end);
  assert.equal(body.includes("writeFileSync"), false, "the reconstruction writes a file");
});

test("this phase's new teardown behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). */
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "teardown-no-record-names-the-flag",
    "teardown-from-reconstructed-closes-a-landed-task",
    "teardown-from-reconstructed-names-unresolved-field",
    "teardown-from-reconstructed-refuses-dirty-worktree",
    "teardown-from-reconstructed-refuses-unlanded-branch",
    "teardown-from-reconstructed-derives-the-default-branch",
    "teardown-from-reconstructed-writes-no-record",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});

/* ================================================================== *
 * M4-P19 FIX ROUND: THE REFUSAL SET IS PER SHAPE, AND THE PROSE SAID
 * IT WAS NOT.
 *
 * THE MECHANISM. `teardownTask` forks on `meta.shape` and the two arms
 * do not have the same gates: the ship arm probes cleanliness, the scout
 * arm discards by design (PR-010). This phase opened a NEW WAY IN to
 * both arms, `--from-reconstructed`, and described it with one sentence
 * about "a task" that was true of only one arm. Measured at head
 * abde402: `teardown --task s1 --from-reconstructed` against a scout
 * worktree holding ` M readme.md` and `?? important.md` exited 0, said
 * "torn down s1", and removed the tree; the same fixture on the phase
 * base exited 1 and left it standing. Plan criterion 4 states the
 * refusal with no shape qualifier.
 *
 * The two tests below are the DIFFERENCE, tested rather than asserted.
 * The first is the new refusal. The second is the control that the
 * with-record scout policy is unchanged, so the asymmetry the source
 * comment now declares is a measured fact and not a claim about intent.
 * ================================================================== */

/**
 * Uncommitted work of BOTH shapes the cleanliness probe covers, a tracked
 * modification and an untracked file, so the witness is not carried by
 * one of them. The porcelain is read UNTRIMMED, because a tracked
 * modification's status code is " M" with a leading space and `gitOk`
 * trims it away: criterion 4's register is byte-identical output, and a
 * comparison over trimmed text is not that.
 */
function porcelainOf(scratch: Scratch, taskId: string): string {
  const status = git(worktreeOf(scratch, taskId), ["status", "--porcelain"]);
  assert.equal(status.status, 0, status.stderr);
  return status.stdout;
}

function dirtyWorktree(scratch: Scratch, taskId: string): string {
  const worktree = worktreeOf(scratch, taskId);
  writeFileSync(join(worktree, "readme.md"), "upstream\nedited by the scout\n");
  writeFileSync(join(worktree, "important.md"), "the only copy\n");
  const porcelain = porcelainOf(scratch, taskId);
  // The expected lines are READ from a real recorded run rather than
  // written here: witness/captures/m4-p19-git-status-porcelain-dirty.txt
  // holds `git status --porcelain` output captured against git 2.43.0 in
  // exactly this state. The leading SPACE on the tracked-modification
  // line is the byte a hand-written expectation loses first, and this
  // probe's whole job is to decide whether a worktree may be destroyed.
  const capture = readFileSync(
    fileURLToPath(
      new URL(
        "../witness/captures/m4-p19-git-status-porcelain-dirty.txt",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const lines = porcelain.split("\n").filter((line) => line !== "");
  assert.equal(lines.length, 2, JSON.stringify(porcelain));
  for (const line of lines) {
    assert.ok(
      capture.includes(`\n${line}\n`),
      `live porcelain line ${JSON.stringify(line)} is not in the recorded capture`,
    );
  }
  return porcelain;
}

test("teardown --from-reconstructed refuses a dirty SCOUT worktree and removes nothing", (t) => {
  // Criterion 4, on the shape it was never walked against. The scout arm
  // reaches `finish` with discard: true without probing cleanliness, so a
  // test that only ever uses a ship task is green against this.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "s-recon-dirty", "scout").status, 0);
  writeFileSync(
    join(taskDirOf(scratch, "s-recon-dirty"), "report.md"),
    "# Scout report\n",
  );
  const before = dirtyWorktree(scratch, "s-recon-dirty");
  reclaimRecord(scratch, "s-recon-dirty");

  const refused = teardown(scratch, "s-recon-dirty", ["--from-reconstructed"]);
  assert.equal(refused.status, 1, refused.stdout);
  assert.equal(
    refused.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${refused.stderr}`,
  );
  assert.match(refused.stderr, /uncommitted changes or untracked files/);
  const worktree = worktreeOf(scratch, "s-recon-dirty");
  assert.ok(existsSync(worktree), "the refusal removed the scout worktree");
  assert.ok(
    existsSync(join(worktree, "important.md")),
    "the untracked file was destroyed",
  );
  // Criterion 4's exact register: byte-identical porcelain before and after.
  assert.equal(porcelainOf(scratch, "s-recon-dirty"), before);
  assert.equal(metaStatus(scratch, "s-recon-dirty"), "open");
  assert.deepEqual(recordFilesIn(scratch), []);
});

/* ------------------------------------------------------------------ *
 * SECOND PASS: the two regions the first pass listed as UNCOVERED.
 *
 * Its section 13 named them honestly rather than ticking them: item 4,
 * a SCOUT WITH COMMITS torn down through the reconstructed path, was
 * READ FROM SOURCE and never run; item 5, `--salvage` combined with
 * `--from-reconstructed` on a scout, was read the same way. Both sit
 * BEHIND the new dirty refusal, which is exactly why neither was reached
 * by the tests that pass: the refusal that was just added shadows them.
 * A region behind a new guard is the region most likely to be wrong and
 * least likely to be exercised.
 * ------------------------------------------------------------------ */

test("a clean scout with commits is still refused through the reconstructed path", (t) => {
  // UNCOVERED ITEM 4, now run. The tree is made CLEAN deliberately: the
  // dirty refusal added by the first pass fires before this check, so a
  // dirty fixture would be refused for the WRONG REASON and the test
  // would pass without ever reaching the commits gate. That distinction
  // is the whole point of driving it rather than reading it.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "s-recon-commits", "scout").status, 0);
  writeFileSync(
    join(taskDirOf(scratch, "s-recon-commits"), "report.md"),
    "# Scout report\n",
  );
  const tip = commitInWorktree(scratch, "s-recon-commits", "scratch-finding.md");
  assert.equal(
    porcelainOf(scratch, "s-recon-commits"),
    "",
    "precondition: the worktree is CLEAN, so the dirty refusal cannot fire",
  );
  reclaimRecord(scratch, "s-recon-commits");

  const refused = teardown(scratch, "s-recon-commits", ["--from-reconstructed"]);
  assert.equal(refused.status, 1, refused.stdout);
  assert.match(refused.stderr, /has commits on its scratch branch/, refused.stderr);
  // The tip is NAMED, and it is the tip the test made rather than one the
  // message could have invented: the baseSha it is compared against comes
  // from meta.json on this path, not from a pool record, and that
  // substitution is what the first pass recorded as unverified.
  assert.ok(
    refused.stderr.includes(tip),
    `the refusal does not name the branch tip ${tip}: ${refused.stderr}`,
  );
  assert.ok(existsSync(worktreeOf(scratch, "s-recon-commits")));
  assert.equal(metaStatus(scratch, "s-recon-commits"), "open");
  assert.deepEqual(recordFilesIn(scratch), []);
});

test("--salvage does not open the reconstructed scout path, because a scout never pushes", (t) => {
  // UNCOVERED ITEM 5, now run. `--salvage` is the escape from the SHIP
  // dirty refusal, and the first pass reasoned from source that it is not
  // an escape from the scout one. Reasoning is what this round exists to
  // stop accepting, so the combination is driven.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "s-recon-salv", "scout").status, 0);
  writeFileSync(
    join(taskDirOf(scratch, "s-recon-salv"), "report.md"),
    "# Scout report\n",
  );
  const before = dirtyWorktree(scratch, "s-recon-salv");
  const refsBefore = gitOk(scratch.upstream, ["show-ref"]);
  reclaimRecord(scratch, "s-recon-salv");

  const refused = teardown(scratch, "s-recon-salv", [
    "--from-reconstructed",
    "--salvage",
  ]);
  assert.equal(refused.status, 1, refused.stdout);
  assert.match(refused.stderr, /uncommitted changes or untracked files/, refused.stderr);
  assert.ok(existsSync(join(worktreeOf(scratch, "s-recon-salv"), "important.md")));
  assert.equal(porcelainOf(scratch, "s-recon-salv"), before);
  // AND NOTHING WAS PUSHED. The salvage path's whole action is a commit
  // plus a push, so the upstream's ref list is where its side effect
  // would show; comparing it before and after is what distinguishes
  // "refused" from "refused after pushing".
  assert.equal(
    gitOk(scratch.upstream, ["show-ref"]),
    refsBefore,
    "the refused salvage changed the upstream's refs",
  );
  assert.equal(metaStatus(scratch, "s-recon-salv"), "open");
});

test("this second pass's teardown behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). */
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "teardown-from-reconstructed-refuses-committed-scout",
    "teardown-salvage-never-rescues-a-reconstructed-scout",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});

test("the with-record scout path still discards, so the asymmetry is measured not asserted", (t) => {
  // THE CONTROL for the test above, and the reason the source comment
  // calls the reconstructed path STRICTER rather than equal. PR-010
  // decided that a scout is judged by its report and its scratch tree is
  // discarded; this phase does not own that decision and does not change
  // it. If this test ever starts refusing, the comment in src/teardown.ts
  // is the thing that has gone stale, and it says so there.
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "s-record-dirty", "scout").status, 0);
  writeFileSync(
    join(taskDirOf(scratch, "s-record-dirty"), "report.md"),
    "# Scout report\n",
  );
  dirtyWorktree(scratch, "s-record-dirty");
  assert.ok(
    existsSync(recordOf(scratch, "s-record-dirty")),
    "precondition: the pool record is present",
  );

  const done = teardown(scratch, "s-record-dirty", ["--from-reconstructed"]);
  assert.equal(done.status, 0, done.stderr);
  assert.equal(
    existsSync(worktreeOf(scratch, "s-record-dirty")),
    false,
    "the with-record scout path stopped discarding; src/teardown.ts's asymmetry note is now stale",
  );
  assert.equal(metaStatus(scratch, "s-record-dirty"), "closed");
});

/* ================================================================== *
 * M4-P19 FIX ROUND: THE ONE NETWORK CALL THIS PHASE ADDED IS BOUNDED.
 *
 * Teardown IS allowed to reach the network, so the reporting-path fix in
 * test/pool.test.ts does not cover it. Allowed to reach is not allowed
 * to wait forever: at head abde402 this command was still running when
 * killed at 30s. `git ls-remote --symref <remote> HEAD` transfers a ref
 * advertisement and nothing else, so a wall-clock bound on it cannot
 * abort real work, which is why it gets one and `git fetch` and
 * `git push` on the same paths deliberately do not.
 * ================================================================== */

async function silentListener(t: {
  after(fn: () => void | Promise<void>): void;
}): Promise<number> {
  const net = await import("node:net");
  const sockets: Array<{ destroy(): void }> = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
  });
  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", () => {
      done();
    });
  });
  t.after(
    () =>
      new Promise<void>((done) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => {
          done();
        });
      }),
  );
  const address = server.address();
  assert.ok(
    address !== null && typeof address === "object",
    "the silent listener reported no address",
  );
  return address.port;
}

test("teardown --from-reconstructed gives up on a remote that never answers", async (t) => {
  // The property this rests on is a property of GIT, not of this kernel:
  // git ls-remote does not give up on its own. That is measured rather
  // than assumed, in witness/captures/m4-p19-git-ls-remote-silent-listener.txt,
  // a real run against this same listener shape at two different waits,
  // exit 124 and empty output both times. The assertion below reads that
  // file so the claim is anchored to the capture rather than to belief.
  const hangCapture = readFileSync(
    fileURLToPath(
      new URL(
        "../witness/captures/m4-p19-git-ls-remote-silent-listener.txt",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.match(
    hangCapture,
    /exit: 124 {3}elapsed: 20s {3}stdout and stderr: empty/,
    "the recorded capture no longer shows git waiting unbounded",
  );
  const scratch = makeScratch(t);
  assert.equal(spawnTask(scratch, "t-recon-hang").status, 0);
  reclaimRecord(scratch, "t-recon-hang");
  gitOk(scratch.clone, ["symbolic-ref", "-d", "refs/remotes/origin/HEAD"]);
  const port = await silentListener(t);
  gitOk(scratch.clone, [
    "remote",
    "set-url",
    "origin",
    `git://127.0.0.1:${String(port)}/nope.git`,
  ]);

  // The shipped bound is 20s, which no test can afford to wait out, and a
  // shipped bound short enough for a test would abort a legitimate
  // ls-remote over a slow link. The seam is the same one src/watcher.ts
  // and src/commands/lock.ts already use for exactly this reason.
  // The child carries its own spawn bound so that an UNBOUNDED teardown
  // fails this test instead of hanging the suite that is meant to catch
  // it. 20s is comfortably above the 1500ms the command should take and
  // comfortably below anything a human would call "forever".
  const refused = teardown(
    scratch,
    "t-recon-hang",
    ["--from-reconstructed"],
    { ...baseEnv(), TIPHYS_GIT_NETWORK_TIMEOUT_MS: "1500" },
    SPAWN_BOUND_MS,
  );
  assert.equal(
    refused.status,
    1,
    `teardown did not give up on a silent remote (status ${String(refused.status)})`,
  );
  assert.match(refused.stderr, /unresolved field\(s\) branch/);
  assert.match(refused.stderr, /did not answer within 1500ms and was killed/);
  assert.ok(existsSync(worktreeOf(scratch, "t-recon-hang")), "the refusal removed the worktree");
  assert.equal(metaStatus(scratch, "t-recon-hang"), "open");
  assert.deepEqual(recordFilesIn(scratch), []);
});

test("a malformed network-timeout override is ignored rather than honoured", async () => {
  // A guard a bad environment can switch off is not a guard, and the
  // switch-off here is silent: `Number("")` is 0, and spawnSync reads a
  // timeout of 0 as NO TIMEOUT. So the empty string is not a cosmetic
  // bad value, it is the exact value that would restore the unbounded
  // behaviour this round removed.
  //
  // This arm is a UNIT test rather than an end-to-end one on purpose,
  // and the reason is stated because the choice is a weakening. The
  // shipped bound is 20s; an end-to-end witness for the FALLBACK would
  // have to wait it out on every run, and a bound short enough to test
  // would not be the shipped one. The end-to-end bound has its own
  // witness above, against a remote that really does not answer.
  const pool = (await import(new URL("../src/pool.ts", import.meta.url).href)) as {
    NETWORK_TIMEOUT_MS: number;
    resolveNetworkTimeoutMs(raw: string | undefined): number;
  };
  const shipped = pool.NETWORK_TIMEOUT_MS;
  assert.ok(Number.isInteger(shipped) && shipped > 0, "the shipped bound is not a positive integer");
  for (const bad of [undefined, "", " ", "0", "-1", "1.5", "nonsense", "1e3ms", "Infinity"]) {
    assert.equal(
      pool.resolveNetworkTimeoutMs(bad),
      shipped,
      `override ${JSON.stringify(bad)} was honoured instead of rejected`,
    );
  }
  // And the accepted set is not empty, so the fallback is a decision and
  // not a function that ignores its argument.
  assert.equal(pool.resolveNetworkTimeoutMs("1500"), 1500);
});

test("this fix round's new teardown behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). */
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "teardown-from-reconstructed-refuses-dirty-scout",
    "teardown-with-record-scout-still-discards",
    "teardown-from-reconstructed-bounds-the-remote-probe",
    "teardown-network-timeout-override-is-validated",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});

/* ================================================================== */
/* M4-P22: the shared exclusion register (kernel plan M4,              */
/* delivery/plan/kernel-plan-m4.md:3050).                              */
/* ================================================================== */

const REGISTER_REF = "refs/heads/tiphys/lease";
const MINUTE_MS = 60_000;

/**
 * Command-scoped git settings for the register fixtures, carrying the same
 * values as test/cross-environment-lock.test.ts:100 for the same reasons:
 * `protocol.file.allow=always` is what makes the file transport usable for
 * a fleet remote at all, and `push.negotiate=false` suppresses the
 * negotiation warning this container's global configuration would otherwise
 * put on the FIRST stderr line of every push, accepted and refused alike.
 * Standing warning 5: identity is command-scoped and never global.
 */
const REGISTER_GIT_FLAGS = [
  "-c",
  "user.name=tiphys-test",
  "-c",
  "user.email=test@tiphys.invalid",
  "-c",
  "commit.gpgsign=false",
  "-c",
  "protocol.file.allow=always",
  "-c",
  "push.negotiate=false",
];

function registerGit(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("git", ["-C", cwd, ...REGISTER_GIT_FLAGS, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "tiphys-test",
      GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
      GIT_COMMITTER_NAME: "tiphys-test",
      GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
    },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function registerGitOk(cwd: string, args: string[]): string {
  const result = registerGit(cwd, args);
  assert.equal(result.status, 0, `git ${args.join(" ")} in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

function makeBareRemote(root: string, name: string): string {
  const remote = join(root, name);
  mkdirSync(remote, { recursive: true });
  const init = spawnSync(
    "git",
    ["-C", remote, ...REGISTER_GIT_FLAGS, "init", "--bare", "--initial-branch=main", "--quiet"],
    { encoding: "utf8" },
  );
  assert.equal(init.status, 0, init.stderr ?? "");
  return remote;
}

/** The register's current value, or "" when the ref is absent. */
function registerSha(remote: string): string {
  const result = registerGit(remote, ["rev-parse", "--verify", "--quiet", `${REGISTER_REF}^{commit}`]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function registerDocument(remote: string): Record<string, unknown> {
  const sha = registerSha(remote);
  assert.notEqual(sha, "", `${REGISTER_REF} must exist on ${remote}`);
  return JSON.parse(registerGitOk(remote, ["cat-file", "-p", `${sha}:lease.json`])) as Record<
    string,
    unknown
  >;
}

/** A real fleet home built by the kernel's own init, with the opt-in field. */
function publishSharedFleet(root: string, remote: string): string {
  const source = join(root, "fleet-source");
  const init = runCli(["init", source, "--shared-exclusion"]);
  assert.equal(init.status, 0, init.stderr);
  registerGitOk(source, ["remote", "add", "origin", remote]);
  registerGitOk(source, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
  return source;
}

/**
 * Clone the fleet and rebuild the three gitignored directories a clone does
 * not carry. The absence of `state/` is asserted rather than assumed,
 * because it is the evidence that the LOCAL lease cannot travel, which is
 * the whole reason the second layer exists (src/fleet.ts:29).
 */
function cloneFleetHome(root: string, remote: string, name: string): string {
  const target = join(root, name);
  const result = spawnSync(
    "git",
    ["-C", root, ...REGISTER_GIT_FLAGS, "clone", "--quiet", remote, target],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr ?? "");
  assert.equal(
    existsSync(join(target, "state")),
    false,
    `a freshly cloned fleet home must not carry state/, but ${join(target, "state")} exists`,
  );
  for (const dir of ["state", "worktrees", "projects"]) {
    mkdirSync(join(target, dir), { recursive: true });
  }
  return target;
}

/** Shorten the stale window so a takeover is reachable inside a test. */
function declareShortWindow(home: string, staleWindowSeconds: number): void {
  const path = join(home, "package.json");
  const document = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  document["tiphys"] = {
    sharedExclusion: { remote: "origin", ref: REGISTER_REF, staleWindowSeconds },
  };
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

/** Remove the opt-in field, which is how the control arm turns the layer off. */
function undeclareSharedExclusion(home: string): void {
  const path = join(home, "package.json");
  const document = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  delete document["tiphys"];
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function envIdOf(home: string): string {
  const raw = JSON.parse(readFileSync(join(home, "tiphys-environment.json"), "utf8")) as {
    envId?: unknown;
  };
  assert.equal(typeof raw.envId, "string");
  return raw.envId as string;
}

/** The lease document on this filesystem, which is the only lease the old guard reads. */
function localLease(home: string): { holderId: string; expiresAt: string } {
  return JSON.parse(readFileSync(join(home, "state", "orchestrator.lock"), "utf8")) as {
    holderId: string;
    expiresAt: string;
  };
}

/**
 * THE DANGEROUS STATE, CONSTRUCTED FROM A REAL TAKEOVER RATHER THAN
 * ASSERTED (M4-P22 criteria 2 and 3).
 *
 * The story is the one that actually happens. Environment A holds the fleet.
 * Its counter stands still, so environment B takes the fleet over with the
 * command the kernel ships for it. B's takeover advances the register on the
 * shared remote and CANNOT touch A's local lease file, because that file is
 * on A's filesystem and `state/` is gitignored so it never travels. A is now
 * holding a live local lease over a fleet another environment owns, and
 * `checkHoldership` (src/task.ts:439) answers yes to the only question it
 * can ask.
 *
 * A's lease is written on a clock ten minutes behind with an hour of
 * duration, so it is still LIVE against the real clock when the assertions
 * run: an expired lease would be refused by the old guard and the test would
 * be measuring that instead.
 */
function fleetTakenOverByAnotherEnvironment(
  t: { after(fn: () => void): void },
  makeRoot: (t: { after(fn: () => void): void }) => string,
): { root: string; remote: string; homeA: string; homeB: string; holderA: string; envA: string; envB: string } {
  const root = makeRoot(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishSharedFleet(root, remote);
  const homeA = cloneFleetHome(root, remote, "env-a");
  const homeB = cloneFleetHome(root, remote, "env-b");
  declareShortWindow(homeA, 5);
  declareShortWindow(homeB, 5);

  const base = Date.now();
  const acquired = runCli(["lock", "acquire", "--duration", "3600"], {
    cwd: homeA,
    env: { ...baseEnv(), TIPHYS_LOCK_TEST_NOW_MS: String(base - 10 * MINUTE_MS) },
  });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const holderA = (acquired.stdout.split("\n")[0] as string).split(" ")[1] as string;
  const envA = envIdOf(homeA);
  assert.equal(registerDocument(remote)["envId"], envA);

  // B observes the register once, which is what arms its own stale clock.
  const observed = runCli(["lock", "acquire"], {
    cwd: homeB,
    env: { ...baseEnv(), TIPHYS_LOCK_TEST_NOW_MS: String(base) },
  });
  assert.equal(observed.status, 1, observed.stdout);

  // The counter has not moved, so on B's OWN clock the window elapses.
  const takeover = runCli(["lock", "acquire", "--take-over"], {
    cwd: homeB,
    env: { ...baseEnv(), TIPHYS_LOCK_TEST_NOW_MS: String(base + 6000) },
  });
  assert.equal(takeover.status, 0, `${takeover.stdout}${takeover.stderr}`);
  const envB = envIdOf(homeB);
  const document = registerDocument(remote);
  assert.equal(document["envId"], envB, "the takeover must move the register to B");
  assert.equal(document["counter"], 2);
  assert.notEqual(envA, envB, "the two clones must carry different environment ids");

  // A's LOCAL lease is untouched and still live: the old guard is green here.
  const lease = localLease(homeA);
  assert.equal(lease.holderId, holderA);
  assert.ok(
    Date.parse(lease.expiresAt) > Date.now(),
    `A's local lease must still be live, it expires ${lease.expiresAt}`,
  );

  return { root, remote, homeA, homeB, holderA, envA, envB };
}

/**
 * What `tiphys spawn` and `tiphys teardown` really print in the two states
 * this phase refuses, captured 2026-09-17 from the real commands against a
 * real two-clone fixture and committed at
 * `witness/captures/m4-p22-shared-exclusion-refusals.txt`.
 *
 * THE ASSERTIONS BELOW COMPARE AGAINST THAT FILE RATHER THAN AGAINST A
 * HAND-WRITTEN STRING. Red-witness rule (c) and T-003 both say why: an
 * expectation typed out to match the implementation is indistinguishable
 * from a fabricated one, and this refusal line embeds git's own stderr.
 */
const P22_REFUSAL_CAPTURE = readFileSync(
  fileURLToPath(
    new URL("../witness/captures/m4-p22-shared-exclusion-refusals.txt", import.meta.url),
  ),
  "utf8",
);

/** The stderr line and exit code one capture block recorded. */
function capturedRefusal(
  heading: string,
  subs: { lab: string; envA?: string; envB?: string; expires?: string },
): { line: string; exit: number } {
  const lines = P22_REFUSAL_CAPTURE.split("\n");
  const at = lines.indexOf(`== ${heading} ==`);
  assert.ok(at >= 0, `the capture no longer records "${heading}"`);
  const block: string[] = [];
  for (let index = at + 1; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (line.startsWith("== ") && line.endsWith(" ==")) {
      break;
    }
    if (line !== "") {
      block.push(line);
    }
  }
  const raw = block.find((entry) => entry.startsWith("tiphys "));
  const exit = block.find((entry) => entry.startsWith("exit="));
  assert.ok(raw !== undefined, `no command line recorded under "${heading}"`);
  assert.ok(exit !== undefined, `no exit code recorded under "${heading}"`);
  let line = raw.split("<LAB>").join(subs.lab);
  for (const [token, value] of [
    ["<ENVA>", subs.envA],
    ["<ENVB>", subs.envB],
    ["<EXPIRES>", subs.expires],
  ] as Array<[string, string | undefined]>) {
    if (value !== undefined) {
      line = line.split(token).join(value);
    }
  }
  assert.equal(
    line.includes("<"),
    false,
    `an unsubstituted placeholder survived into the expectation: ${line}`,
  );
  return { line, exit: Number(exit.slice("exit=".length)) };
}

/**
 * CRITERION 3: THE SAME SHAPE FOR TEARDOWN, and the half that matters is
 * NOTHING REMOVED.
 *
 * A teardown that refuses AFTER deleting something has failed in the way
 * that counts, so the assertion is not on the exit code alone: the worktree
 * must still be standing, the task must still read open, and the scratch
 * file inside the worktree must still be there byte for byte.
 *
 * The task is a SCOUT with a report, which is the one shape whose teardown
 * runs to completion inside a test without a landed branch. That makes the
 * control arm decisive: with the layer switched off the very same teardown
 * of the very same task exits 0 and the worktree is gone. So the refusal in
 * arm one is the new layer and nothing else.
 */
test("teardown refuses and removes nothing while the shared register names another environment", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishSharedFleet(root, remote);
  const homeA = cloneFleetHome(root, remote, "env-a");
  const homeB = cloneFleetHome(root, remote, "env-b");
  declareShortWindow(homeA, 5);
  declareShortWindow(homeB, 5);

  const upstream = join(root, "upstream");
  registerGitOk(root, ["init", "--initial-branch=main", upstream]);
  writeFileSync(join(upstream, "readme.md"), "upstream\n");
  registerGitOk(upstream, ["add", "-A"]);
  registerGitOk(upstream, ["commit", "-m", "commit one"]);
  const projectClone = join(homeA, "projects", "demo");
  registerGitOk(root, ["clone", "--quiet", upstream, projectClone]);
  const briefFile = join(root, "brief.md");
  writeFileSync(briefFile, "# Brief\n\nDo the thing.\n");
  const stub = join(root, "payload.sh");
  writeFileSync(stub, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  // A holds the fleet, on a clock ten minutes behind, for an hour: the local
  // lease is still live by the real clock when the register moves under it.
  const base = Date.now();
  const acquired = runCli(["lock", "acquire", "--duration", "3600"], {
    cwd: homeA,
    env: { ...baseEnv(), TIPHYS_LOCK_TEST_NOW_MS: String(base - 10 * MINUTE_MS) },
  });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const holderA = (acquired.stdout.split("\n")[0] as string).split(" ")[1] as string;
  const holderEnv = { ...baseEnv(), TIPHYS_HOLDER_ID: holderA };

  // The scout exists because A spawned it while A still owned the register.
  const spawned = runCli(
    [
      "spawn",
      "--task",
      "s-shared",
      "--project",
      projectClone,
      "--brief",
      briefFile,
      "--shape",
      "scout",
      "--exec",
      stub,
    ],
    { cwd: homeA, env: holderEnv },
  );
  assert.equal(spawned.status, 0, `${spawned.stdout}${spawned.stderr}`);
  const worktree = join(homeA, "worktrees", "s-shared");
  writeFileSync(join(worktree, "scratch.txt"), "scratch\n");
  writeFileSync(join(homeA, "tasks", "s-shared", "report.md"), "# Scout report\n");

  // B observes once, then takes the fleet over. A's local lease is on A's
  // filesystem and cannot be touched by that takeover.
  const observed = runCli(["lock", "acquire"], {
    cwd: homeB,
    env: { ...baseEnv(), TIPHYS_LOCK_TEST_NOW_MS: String(base) },
  });
  assert.equal(observed.status, 1, observed.stdout);
  const takeover = runCli(["lock", "acquire", "--take-over"], {
    cwd: homeB,
    env: { ...baseEnv(), TIPHYS_LOCK_TEST_NOW_MS: String(base + 6000) },
  });
  assert.equal(takeover.status, 0, `${takeover.stdout}${takeover.stderr}`);
  const envB = envIdOf(homeB);
  const envA = envIdOf(homeA);
  const registered = registerDocument(remote);
  assert.equal(registered["envId"], envB);
  const expires = registered["expiresAt"] as string;

  // A's local lease is still live and still A's: the old guard is green.
  const lease = localLease(homeA);
  assert.equal(lease.holderId, holderA);
  assert.ok(Date.parse(lease.expiresAt) > Date.now(), lease.expiresAt);

  /* ARM ONE. */
  const refused = runCli(["teardown", "--task", "s-shared"], { cwd: homeA, env: holderEnv });
  assert.notEqual(
    refused.status,
    0,
    "teardown succeeded while the shared register named another environment as " +
      `holding this fleet: ${refused.stdout}${refused.stderr}`,
  );
  const lines = refused.stderr.split("\n").filter((entry) => entry.trim() !== "");
  assert.equal(lines.length, 1, `expected exactly one reason line, got:\n${refused.stderr}`);
  const expected = capturedRefusal("teardown: the register names another environment", {
    lab: root,
    envA,
    envB,
    expires,
  });
  assert.equal(lines[0], expected.line);
  assert.equal(refused.status, expected.exit);

  /* NOTHING REMOVED. */
  assert.ok(existsSync(worktree), "the refusal removed the worktree");
  assert.equal(readFileSync(join(worktree, "scratch.txt"), "utf8"), "scratch\n");
  assert.ok(existsSync(join(homeA, "worktrees", "s-shared.pool.json")), "the pool record is gone");
  assert.equal(
    (
      JSON.parse(readFileSync(join(homeA, "tasks", "s-shared", "meta.json"), "utf8")) as {
        status: string;
      }
    ).status,
    "open",
  );
  assert.equal(
    registerGitOk(projectClone, ["rev-parse", "refs/heads/task/s-shared"]).length,
    40,
    "the scout branch was deleted by a refused teardown",
  );

  /* ARM TWO, THE CONTROL: the same teardown of the same task with the layer
     switched off runs to completion, so what refused above is this phase's
     guard and not any pre-existing teardown rule. */
  undeclareSharedExclusion(homeA);
  const done = runCli(["teardown", "--task", "s-shared"], { cwd: homeA, env: holderEnv });
  assert.equal(done.status, 0, `${done.stdout}${done.stderr}`);
  assert.equal(existsSync(worktree), false, "the control arm did not remove the worktree");
  assert.equal(
    (
      JSON.parse(readFileSync(join(homeA, "tasks", "s-shared", "meta.json"), "utf8")) as {
        status: string;
      }
    ).status,
    "closed",
  );
});

/**
 * THE SECOND MEMBER OF CRITERION 3's CLASS: an unreachable register, which
 * refuses for a structurally different reason (no comparison could be made)
 * and must still remove nothing.
 */
test("teardown refuses and removes nothing when the declared shared register cannot be read", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishSharedFleet(root, remote);
  const homeA = cloneFleetHome(root, remote, "env-a");

  const upstream = join(root, "upstream");
  registerGitOk(root, ["init", "--initial-branch=main", upstream]);
  writeFileSync(join(upstream, "readme.md"), "upstream\n");
  registerGitOk(upstream, ["add", "-A"]);
  registerGitOk(upstream, ["commit", "-m", "commit one"]);
  const projectClone = join(homeA, "projects", "demo");
  registerGitOk(root, ["clone", "--quiet", upstream, projectClone]);
  const briefFile = join(root, "brief.md");
  writeFileSync(briefFile, "# Brief\n\nDo the thing.\n");
  const stub = join(root, "payload.sh");
  writeFileSync(stub, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const spawned = runCli(
    [
      "spawn",
      "--task",
      "s-unreachable",
      "--project",
      projectClone,
      "--brief",
      briefFile,
      "--shape",
      "scout",
      "--exec",
      stub,
    ],
    { cwd: homeA },
  );
  assert.equal(spawned.status, 0, `${spawned.stdout}${spawned.stderr}`);
  const worktree = join(homeA, "worktrees", "s-unreachable");
  writeFileSync(join(homeA, "tasks", "s-unreachable", "report.md"), "# Scout report\n");

  registerGitOk(homeA, ["remote", "set-url", "origin", join(root, "not-a-repository.git")]);

  const refused = runCli(["teardown", "--task", "s-unreachable"], { cwd: homeA });
  assert.notEqual(
    refused.status,
    0,
    `teardown succeeded with the declared register unreachable: ${refused.stdout}${refused.stderr}`,
  );
  const lines = refused.stderr.split("\n").filter((entry) => entry.trim() !== "");
  assert.equal(lines.length, 1, `expected exactly one reason line, got:\n${refused.stderr}`);
  const expected = capturedRefusal("teardown: the declared register cannot be read", { lab: root });
  assert.equal(lines[0], expected.line);
  assert.equal(refused.status, expected.exit);
  assert.ok(existsSync(worktree), "the refusal removed the worktree");
  assert.equal(
    (
      JSON.parse(readFileSync(join(homeA, "tasks", "s-unreachable", "meta.json"), "utf8")) as {
        status: string;
      }
    ).status,
    "open",
  );
});
