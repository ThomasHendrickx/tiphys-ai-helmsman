import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
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

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Teardown Test",
  GIT_AUTHOR_EMAIL: "teardown-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Teardown Test",
  GIT_COMMITTER_EMAIL: "teardown-test@tiphys.invalid",
};

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TIPHYS_HOLDER_ID;
  return env;
}

function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): CliResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: opts.env ?? baseEnv(),
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
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
): CliResult {
  return runCli(["teardown", "--task", taskId, ...extra], {
    cwd: scratch.fleet,
    env,
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
  assert.ok(existsSync(worktreeOf(scratch, "t-nofetch")));
  assert.equal(metaStatus(scratch, "t-nofetch"), "open");
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
