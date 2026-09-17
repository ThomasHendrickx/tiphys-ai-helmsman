import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Spawn tests (kernel plan v1, M1-P4 criteria 1 to 5, 11, 12 and the
 * M1-P3 criterion 13 baseOffline clause) against scratch git
 * repositories created per test. Every commit-producing git call carries
 * command-scoped identity environment variables because CI runners have
 * no git identity (EXT-F-02 pattern, inherited warning 5).
 */

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Spawn Test",
  GIT_AUTHOR_EMAIL: "spawn-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Spawn Test",
  GIT_COMMITTER_EMAIL: "spawn-test@tiphys.invalid",
};

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** The CLI's environment, with any ambient holder identity removed. */
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
  /*
   * CANONICAL, not merely absolute, and that is the whole point of the
   * realpathSync. `os.tmpdir()` returns a SPELLING of the temp directory and
   * makes no promise that it is the canonical one. On macOS it is not: the
   * platform hands back a path under /var/folders and /var is a symlink to
   * /private/var, so every scratch root this helper produced there was
   * already reached through a symlink before any test created one.
   *
   * That matters because this file composes paths from the returned root and
   * then compares them, as STRINGS, against paths another program produced,
   * or asserts that they are canonical. Git canonicalises every worktree path
   * it records, so a composed path and the path git prints are two spellings
   * of one directory, and a string comparison answers "different object" for
   * the same object. The macOS runner of pull request #155 failed on exactly
   * that, twice in one test (work history, round 4).
   *
   * Resolving ONCE here is the repair at the mechanism rather than at the two
   * assertions that happened to notice: it makes every scratch path in this
   * file mean the same thing on every platform, and the next test added to
   * the file inherits it without having to know any of this.
   *
   * It takes nothing away from what the tests exercise. The symlinks that
   * matter here are the ones a test builds for ITSELF, deliberately, on every
   * platform: see the launch-failed rollback test's two arms, which construct
   * a symlinked fleet root and a symlinked worktrees directory. Leaning on
   * the platform to supply a symlink by accident is the weaker arrangement,
   * because it makes the dangerous state depend on which runner is executing,
   * and it is what let arm B stop being a different arm from arm A on macOS
   * without any assertion in the file noticing until one was added.
   */
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tiphys-p4-spawn-")));
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
  const briefFile = join(tmp, "brief.md");
  writeFileSync(briefFile, "# Brief\n\nDo the thing.\n");
  return { tmp, fleet, upstream, clone, briefFile };
}

/** An executable stub payload. Returns its absolute path. */
function writeStub(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, body, { mode: 0o755 });
  return path;
}

function spawnCli(
  scratch: Scratch,
  taskId: string,
  exec: string,
  extra: string[] = [],
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
      "ship",
      "--exec",
      exec,
      ...extra,
    ],
    { cwd: scratch.fleet, env },
  );
}

function worktreeOf(scratch: Scratch, taskId: string): string {
  return join(scratch.fleet, "worktrees", taskId);
}

function taskDirOf(scratch: Scratch, taskId: string): string {
  return join(scratch.fleet, "tasks", taskId);
}

function poolRecordOf(scratch: Scratch, taskId: string): { baseSha: string; offline: boolean } {
  return JSON.parse(
    readFileSync(join(scratch.fleet, "worktrees", `${taskId}.pool.json`), "utf8"),
  ) as { baseSha: string; offline: boolean };
}

interface Meta {
  id: string;
  project: string;
  shape: string;
  branch: string;
  worktree: string;
  baseSha: string;
  baseOffline: boolean;
  status: string;
  createdAt: string;
}

function metaOf(scratch: Scratch, taskId: string): Meta {
  return JSON.parse(
    readFileSync(join(taskDirOf(scratch, taskId), "meta.json"), "utf8"),
  ) as Meta;
}

/** Every file under dir with its bytes, for byte-identity comparisons. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(dir)) {
    return out;
  }
  for (const name of readdirSync(dir).sort()) {
    out[name] = readFileSync(join(dir, name), "utf8");
  }
  return out;
}

/**
 * A stub `git` earlier on PATH that fails the FIRST fetch with real
 * captured contention stderr and then delegates every call to the real
 * git (the pattern from test/pool.test.ts, whose stderr string was
 * captured verbatim from concurrent fetches of a behind tracking ref).
 */
function stubGitFailingFirstFetch(
  t: { after(fn: () => void): void },
  stderrText: string,
): string {
  const binDir = mkdtempSync(join(tmpdir(), "tiphys-p4-stubgit-"));
  t.after(() => {
    rmSync(binDir, { recursive: true, force: true });
  });
  const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" })
    .stdout.trim();
  assert.ok(realGit !== "", "could not locate the real git");
  const markerPath = join(binDir, "fetch-failed-once");
  const script = `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const args = process.argv.slice(2);
const marker = ${JSON.stringify(markerPath)};
if (args.includes("fetch") && !fs.existsSync(marker)) {
  fs.writeFileSync(marker, "");
  process.stderr.write(${JSON.stringify(stderrText)});
  process.exit(1);
}
const r = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" });
process.exit(r.status === null ? 1 : r.status);
`;
  writeFileSync(join(binDir, "git"), script, { mode: 0o755 });
  return binDir;
}

test("spawn runs the payload in the task worktree and writes meta and brief", (t) => {
  const scratch = makeScratch(t);
  const warnings = "# Fleet warnings\n\nNever push to main.\n";
  writeFileSync(join(scratch.fleet, "warnings.md"), warnings);
  const cwdFile = join(scratch.tmp, "payload-cwd");
  const marker = join(scratch.tmp, "payload-marker");
  // The payload sleeps before writing its completion marker: if spawn
  // ever returned before the payload exited (a C-3 violation), the
  // marker would be absent at the moment the assertion below runs.
  const stub = writeStub(
    scratch.tmp,
    "payload.sh",
    `#!/bin/sh\npwd -P > ${JSON.stringify(cwdFile)}\nsleep 0.3\nprintf 'done\\n' > ${JSON.stringify(marker)}\nexit 0\n`,
  );
  const upstreamHead = gitOk(scratch.upstream, ["rev-parse", "HEAD"]);

  const result = spawnCli(scratch, "t-run", stub);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(marker), "spawn returned before the payload had exited");

  const worktree = worktreeOf(scratch, "t-run");
  const payloadPhysicalCwd = readFileSync(cwdFile, "utf8").trim();
  assert.equal(realpathSync(payloadPhysicalCwd), realpathSync(worktree));

  const meta = metaOf(scratch, "t-run");
  assert.deepEqual(Object.keys(meta).sort(), [
    "baseOffline",
    "baseSha",
    "branch",
    "createdAt",
    "id",
    "project",
    "shape",
    "status",
    "worktree",
  ]);
  assert.equal(meta.id, "t-run");
  assert.equal(meta.project, scratch.clone);
  assert.equal(meta.shape, "ship");
  assert.equal(meta.branch, "task/t-run");
  assert.equal(realpathSync(meta.worktree), realpathSync(worktree));
  assert.equal(meta.worktree.startsWith("/"), true, "meta worktree remains an absolute diagnostic path");
  assert.equal(meta.status, "open");
  assert.equal(meta.baseSha, upstreamHead, "meta baseSha is not the fetched base");
  assert.equal(meta.baseSha, poolRecordOf(scratch, "t-run").baseSha);
  assert.equal(meta.baseOffline, false, "a normal fetched path recorded an offline base");
  assert.ok(!Number.isNaN(Date.parse(meta.createdAt)));

  const brief = readFileSync(join(taskDirOf(scratch, "t-run"), "brief.md"), "utf8");
  assert.ok(brief.includes("Do the thing."), brief);
  assert.ok(brief.includes(warnings), "the fleet warnings file was not appended verbatim");

  // FM-059: nothing the kernel injects may live inside the worktree.
  assert.equal(gitOk(worktree, ["status", "--porcelain"]), "");
});

test("spawn writes exactly the brief text when the fleet has no warnings file", (t) => {
  const scratch = makeScratch(t);
  assert.ok(!existsSync(join(scratch.fleet, "warnings.md")), "precondition");
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
  assert.equal(spawnCli(scratch, "t-nowarn", stub).status, 0);
  assert.equal(
    readFileSync(join(taskDirOf(scratch, "t-nowarn"), "brief.md"), "utf8"),
    readFileSync(scratch.briefFile, "utf8"),
  );
});

test("the turn-end record carries the payload exit code and a parseable timestamp", (t) => {
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 7\n");
  const result = spawnCli(scratch, "t-turnend", stub);
  // A nonzero payload is a completed task with a failing payload, not a
  // failed spawn: the outcome lives in the turn-end record (C-1).
  assert.equal(result.status, 0, result.stderr);
  const turnEnd = JSON.parse(
    readFileSync(join(taskDirOf(scratch, "t-turnend"), "turn-end"), "utf8"),
  ) as { endedAt: string; exitCode: number };
  assert.equal(turnEnd.exitCode, 7);
  assert.ok(!Number.isNaN(Date.parse(turnEnd.endedAt)), turnEnd.endedAt);
  assert.equal(new Date(turnEnd.endedAt).toISOString(), turnEnd.endedAt);
});

test("spawn without --exec exits 64 with usage and creates nothing", (t) => {
  const scratch = makeScratch(t);
  const result = runCli(
    [
      "spawn",
      "--task",
      "t-noexec",
      "--project",
      scratch.clone,
      "--brief",
      scratch.briefFile,
      "--shape",
      "ship",
    ],
    { cwd: scratch.fleet },
  );
  assert.equal(result.status, 64);
  assert.match(result.stderr, /usage: tiphys spawn /);
  assert.equal(result.stdout, "");
  assert.ok(!existsSync(worktreeOf(scratch, "t-noexec")));
  assert.ok(!existsSync(taskDirOf(scratch, "t-noexec")));
  assert.ok(!existsSync(join(scratch.fleet, "worktrees", "t-noexec.pool.json")));
});

test("a duplicate task id leaves the existing task byte-identical", (t) => {
  // PR-005: rollback must never touch another task's artifacts, and the
  // duplicate refusal happens before anything under tasks/ is written.
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
  assert.equal(spawnCli(scratch, "t-dup", stub).status, 0);
  const before = snapshot(taskDirOf(scratch, "t-dup"));
  const worktreesBefore = readdirSync(join(scratch.fleet, "worktrees")).sort();
  assert.ok(Object.keys(before).length > 0, "precondition: the first spawn wrote files");

  const second = spawnCli(scratch, "t-dup", stub);
  assert.notEqual(second.status, 0);
  // A live task also occupies its task directory, so CR-301's gate is
  // the one that speaks first. The criterion's outcome is unchanged:
  // nonzero, the existing task byte-identical, nothing new created.
  assert.match(second.stderr, /already holds records for task id t-dup/);
  assert.deepEqual(snapshot(taskDirOf(scratch, "t-dup")), before);
  assert.deepEqual(readdirSync(join(scratch.fleet, "worktrees")).sort(), worktreesBefore);

  // The pool's own duplicate gate is still reachable and still creates
  // nothing under tasks/: a pool worktree taken directly, with no task
  // directory, is exactly the case criterion 5's companion describes.
  assert.equal(
    runCli(["pool", "create", "--task", "t-poolonly", "--project", scratch.clone], {
      cwd: scratch.fleet,
    }).status,
    0,
  );
  const viaPool = spawnCli(scratch, "t-poolonly", stub);
  assert.notEqual(viaPool.status, 0);
  assert.match(viaPool.stderr, /task id already used: t-poolonly/);
  assert.ok(
    !existsSync(taskDirOf(scratch, "t-poolonly")),
    "a refused spawn created a task directory",
  );
});

test("a failed executor launch rolls back exactly what that invocation created", (t) => {
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
  // A neighbouring task that must be untouched by the rollback.
  assert.equal(spawnCli(scratch, "t-keep", stub).status, 0);
  const keepBefore = snapshot(taskDirOf(scratch, "t-keep"));

  const missing = join(scratch.tmp, "no-such-binary");
  assert.ok(!existsSync(missing), "precondition: the exec binary does not exist");
  const result = spawnCli(scratch, "t-fail", missing);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /executor launch failed/);

  assert.ok(!existsSync(worktreeOf(scratch, "t-fail")), "the worktree survived the rollback");
  assert.ok(!existsSync(taskDirOf(scratch, "t-fail")), "the task directory survived the rollback");
  assert.ok(!existsSync(join(scratch.fleet, "worktrees", "t-fail.pool.json")));
  assert.notEqual(
    git(scratch.clone, ["rev-parse", "--verify", "--quiet", "refs/heads/task/t-fail"]).status,
    0,
    "the rollback left the task branch behind",
  );
  assert.ok(
    !gitOk(scratch.clone, ["worktree", "list", "--porcelain"]).includes(
      worktreeOf(scratch, "t-fail"),
    ),
  );
  // And only that: the neighbouring task is untouched.
  assert.deepEqual(snapshot(taskDirOf(scratch, "t-keep")), keepBefore);
  assert.ok(existsSync(worktreeOf(scratch, "t-keep")));
  // The id is free again, which is what a clean rollback is for.
  assert.equal(spawnCli(scratch, "t-fail", stub).status, 0);
});

test("spawn writes the executor launch record with the deadline only when asked", (t) => {
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");

  assert.equal(spawnCli(scratch, "t-nodl", stub).status, 0);
  const plain = JSON.parse(
    readFileSync(join(taskDirOf(scratch, "t-nodl"), "executor.json"), "utf8"),
  ) as { adapter: string; launchedAt: string; deadline?: string };
  assert.equal(plain.adapter, "subprocess");
  assert.ok(!Number.isNaN(Date.parse(plain.launchedAt)), plain.launchedAt);
  assert.equal(new Date(plain.launchedAt).toISOString(), plain.launchedAt);
  assert.ok(!("deadline" in plain), "a deadline was recorded without --deadline");

  assert.equal(spawnCli(scratch, "t-dl", stub, ["--deadline", "300"]).status, 0);
  const withDeadline = JSON.parse(
    readFileSync(join(taskDirOf(scratch, "t-dl"), "executor.json"), "utf8"),
  ) as { adapter: string; launchedAt: string; deadline?: string };
  assert.equal(withDeadline.adapter, "subprocess");
  assert.equal(
    withDeadline.deadline,
    new Date(Date.parse(withDeadline.launchedAt) + 300_000).toISOString(),
    "the recorded deadline is not launchedAt plus the requested seconds",
  );
});

test("spawn refuses without matching holdership and proceeds with it", (t) => {
  // PR-203, falsifiable in both directions, and the holder id is taken
  // from lock acquire's REAL captured stdout, not from a hand-written
  // string: this is the M1-P3 transport, consumed as it is published.
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
  const acquired = runCli(["lock", "acquire"], { cwd: scratch.fleet });
  assert.equal(acquired.status, 0, acquired.stderr);
  const match = /^acquired (\S+) expires (\S+)$/m.exec(acquired.stdout.trim());
  assert.ok(match !== null, `unexpected acquire output: ${acquired.stdout}`);
  const holderId = match[1] as string;

  const unset = spawnCli(scratch, "t-hold", stub);
  assert.notEqual(unset.status, 0, "spawn proceeded with no holder identity");
  assert.match(unset.stderr, /orchestrator\.lock/);
  assert.equal(unset.stderr.trim().split("\n").length, 1, unset.stderr);
  assert.ok(!existsSync(worktreeOf(scratch, "t-hold")), "the refusal created a worktree");
  assert.ok(!existsSync(taskDirOf(scratch, "t-hold")), "the refusal created a task directory");

  const wrong = spawnCli(scratch, "t-hold", stub, [], {
    ...baseEnv(),
    TIPHYS_HOLDER_ID: "not-the-holder",
  });
  assert.notEqual(wrong.status, 0, "spawn proceeded with a foreign holder id");
  assert.ok(wrong.stderr.includes(holderId), wrong.stderr);

  const matching = spawnCli(scratch, "t-hold", stub, [], {
    ...baseEnv(),
    TIPHYS_HOLDER_ID: holderId,
  });
  assert.equal(matching.status, 0, matching.stderr);
  assert.equal(metaOf(scratch, "t-hold").status, "open");

  // Expiry is the other half of the rule: the same holder id no longer
  // proves holdership once the lease has run out.
  assert.equal(runCli(["lock", "release", "--holder", holderId], { cwd: scratch.fleet }).status, 0);
  const short = runCli(["lock", "acquire", "--duration", "1"], { cwd: scratch.fleet });
  assert.equal(short.status, 0, short.stderr);
  const shortMatch = /^acquired (\S+) expires (\S+)$/m.exec(short.stdout.trim());
  assert.ok(shortMatch !== null);
  const shortHolder = shortMatch[1] as string;
  const expiresAt = Date.parse(shortMatch[2] as string);
  while (Date.now() <= expiresAt) {
    spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 50)"]);
  }
  const expired = spawnCli(scratch, "t-hold-expired", stub, [], {
    ...baseEnv(),
    TIPHYS_HOLDER_ID: shortHolder,
  });
  assert.notEqual(expired.status, 0, "spawn proceeded on an expired lease");
  assert.match(expired.stderr, /expired/);
  assert.ok(!existsSync(worktreeOf(scratch, "t-hold-expired")));
});

test("spawn copies baseOffline from the pool record for an offline base", (t) => {
  // The M1-P3 criterion 13 clause this phase owns: a worktree created
  // under --offline must reach meta.json as baseOffline true.
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
  const lastFetched = gitOk(scratch.clone, ["rev-parse", "refs/remotes/origin/main"]);
  gitOk(scratch.clone, ["remote", "set-url", "origin", join(scratch.tmp, "no-such-remote")]);

  const result = spawnCli(scratch, "t-offline", stub, ["--offline"]);
  assert.equal(result.status, 0, result.stderr);
  const meta = metaOf(scratch, "t-offline");
  assert.equal(meta.baseOffline, true, "an offline base was recorded as fetched");
  assert.equal(meta.baseSha, lastFetched);
  const record = poolRecordOf(scratch, "t-offline");
  assert.equal(meta.baseOffline, record.offline, "meta and the pool record disagree");
  assert.equal(meta.baseSha, record.baseSha);
});

test("spawn does not recompute baseOffline from its own --offline flag", (t) => {
  // The dangerous state, not the absent feature (V-2's provenance
  // inversion): --offline is passed, the first fetch fails with real
  // captured contention stderr, the retry SUCCEEDS, so the base is
  // freshly fetched. An implementation that derived baseOffline from the
  // flag, or from "did any fetch fail", records true here and lies about
  // the provenance of the base.
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
  writeFileSync(join(scratch.upstream, "advance.md"), "advance\n");
  gitOk(scratch.upstream, ["add", "-A"]);
  gitOk(scratch.upstream, ["commit", "-m", "advance"]);
  const remoteHead = gitOk(scratch.upstream, ["rev-parse", "HEAD"]);
  const binDir = stubGitFailingFirstFetch(
    t,
    "error: cannot lock ref 'refs/remotes/origin/main': is at f54f9fd2e742e73976eb7a3c6355749b54d6b767 but expected b0afe2c86398e3742ed488117e6110ca0bbd7d4e\n",
  );
  const result = spawnCli(scratch, "t-retry", stub, ["--offline"], {
    ...baseEnv(),
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  });
  assert.equal(result.status, 0, result.stderr);
  const meta = metaOf(scratch, "t-retry");
  const record = poolRecordOf(scratch, "t-retry");
  assert.equal(record.offline, false, "precondition: the retried fetch succeeded");
  assert.equal(meta.baseSha, remoteHead);
  assert.equal(
    meta.baseOffline,
    false,
    "baseOffline was recomputed from the flag instead of copied from the pool record",
  );
});

test("a write that THROWS after pool create still rolls the task back", (t) => {
  // F-2, red against the dangerous state: every step in the window
  // between pool create and the launch signals failure by RAISING, not
  // by returning, and an unwrapped raise walked straight past rollback()
  // and out of the process, orphaning the worktree, the branch and the
  // pool record and wedging the task id forever. The failure here is a
  // real one forced by the filesystem, not a mock: a dangling symlink at
  // the task-directory path reads as absent to existsSync and makes
  // mkdirSync raise.
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
  const taskDirPath = taskDirOf(scratch, "t-throw");
  symlinkSync(join(scratch.tmp, "nowhere"), taskDirPath);
  assert.ok(!existsSync(taskDirPath), "precondition: the dangling link reads as absent");

  const result = spawnCli(scratch, "t-throw", stub);
  assert.notEqual(result.status, 0);
  // A stack trace is many lines and does not carry the command's prefix.
  assert.equal(
    result.stderr.trim().split("\n").length,
    1,
    `a raised error escaped as a stack trace: ${result.stderr}`,
  );
  assert.match(result.stderr, /^tiphys spawn: /);
  assert.doesNotMatch(result.stderr, /at writeFileSync|at mkdirSync|node:fs/);
  // The rollback ran: nothing of this invocation survives.
  assert.ok(!existsSync(worktreeOf(scratch, "t-throw")), "the worktree was orphaned");
  assert.ok(
    !existsSync(join(scratch.fleet, "worktrees", "t-throw.pool.json")),
    "the pool record was orphaned",
  );
  assert.notEqual(
    git(scratch.clone, ["rev-parse", "--verify", "--quiet", "refs/heads/task/t-throw"]).status,
    0,
    "the task branch was orphaned",
  );
  // And the id is not wedged: clear the planted link and it works.
  unlinkSync(taskDirPath);
  assert.equal(spawnCli(scratch, "t-throw", stub).status, 0, "the task id was wedged");
});

test("spawn refuses a task id whose task directory already holds records", (t) => {
  // CR-301, red against the dangerous state: tasks/<id>/ survives every
  // teardown by design, so a re-used id used to overwrite the closed
  // task's records, let the rollback delete files it never created, and
  // leave the previous incarnation's turn-end readable beside a meta
  // saying open, which is a completion that did not happen sitting under
  // the C-1 state authority.
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 3\n");
  assert.equal(spawnCli(scratch, "t-reuse", stub).status, 0);
  assert.equal(
    runCli(["teardown", "--task", "t-reuse"], { cwd: scratch.fleet }).status,
    0,
    "precondition: the task tears down cleanly",
  );
  const before = snapshot(taskDirOf(scratch, "t-reuse"));
  assert.ok(before["meta.json"] !== undefined && before["turn-end"] !== undefined);
  assert.match(before["meta.json"] as string, /"status": "closed"/);

  // (a) A re-spawn whose exec fails: the rollback must never reach the
  // previous incarnation's records.
  const failing = spawnCli(scratch, "t-reuse", join(scratch.tmp, "no-such-binary"));
  assert.notEqual(failing.status, 0);
  assert.match(failing.stderr, /already holds records/);
  assert.ok(failing.stderr.includes(taskDirOf(scratch, "t-reuse")), failing.stderr);
  assert.deepEqual(
    snapshot(taskDirOf(scratch, "t-reuse")),
    before,
    "the re-spawn destroyed or rewrote the previous incarnation's records",
  );
  assert.ok(!existsSync(worktreeOf(scratch, "t-reuse")), "the refusal created a worktree");
  assert.ok(!existsSync(join(scratch.fleet, "worktrees", "t-reuse.pool.json")));

  // (b) A re-spawn whose payload reads the task's own turn-end: no
  // payload of a new incarnation may ever see the previous one's record.
  const copy = join(scratch.tmp, "seen-turn-end");
  const reader = writeStub(
    scratch.tmp,
    "reader.sh",
    `#!/bin/sh\nif [ -f ${JSON.stringify(join(taskDirOf(scratch, "t-reuse"), "turn-end"))} ]; then cp ${JSON.stringify(join(taskDirOf(scratch, "t-reuse"), "turn-end"))} ${JSON.stringify(copy)}; fi\nexit 0\n`,
  );
  const reused = spawnCli(scratch, "t-reuse", reader);
  assert.notEqual(reused.status, 0, "spawn re-used an occupied task id");
  // The fail-closed half: a path that exists but is not a directory is
  // occupied too, and is refused rather than written into.
  writeFileSync(taskDirOf(scratch, "t-notadir"), "not a directory\n");
  const notADir = spawnCli(scratch, "t-notadir", stub);
  assert.notEqual(notADir.status, 0, "spawn wrote into a non-directory task path");
  assert.match(notADir.stderr, /already holds records/);
  assert.ok(!existsSync(worktreeOf(scratch, "t-notadir")));
  assert.ok(
    !existsSync(copy),
    "a new incarnation's payload read the previous incarnation's turn-end record",
  );
  assert.deepEqual(snapshot(taskDirOf(scratch, "t-reuse")), before);
});

test("a deadline the kernel cannot represent is a usage error that creates nothing", (t) => {
  // N-403. --deadline used to be guarded only by "finite and positive",
  // so a value outside the Date range raised inside the adapter AFTER
  // pool create had made a worktree, a branch and a pool record: a
  // mistyped flag turned into an orphaned task id that CR-301's gate
  // then refused to re-use. A deadline this kernel cannot represent is a
  // usage error, and criterion 3's shape applies: exit 64, usage on
  // stderr, nothing created.
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
  for (const bad of ["1e300", "1e13", "8640000000000"]) {
    const result = spawnCli(scratch, "t-deadline", stub, ["--deadline", bad]);
    assert.equal(result.status, 64, `--deadline ${bad}: ${result.stderr}`);
    assert.match(result.stderr, /usage: tiphys spawn /);
    assert.ok(!existsSync(worktreeOf(scratch, "t-deadline")), `--deadline ${bad} created a worktree`);
    assert.ok(!existsSync(taskDirOf(scratch, "t-deadline")));
    assert.ok(!existsSync(join(scratch.fleet, "worktrees", "t-deadline.pool.json")));
  }
  // The representable case still works, so the guard is not a blanket ban.
  assert.equal(spawnCli(scratch, "t-deadline", stub, ["--deadline", "300"]).status, 0);
});

test("a throw out of the executor adapter is reported without rollback and names the route out", async (t) => {
  // N-402. The round-two record claimed this path could not be tested
  // because it needs a seam the CLI does not expose. That was false: it
  // was reachable through --deadline 1e300 until N-403 made that input a
  // usage error, and it is reachable here through the ExecutorAdapter
  // seam the production type already defines. This is the phase's most
  // consequential classification: an adapter that RAISED has told us
  // nothing about whether the payload started, so guessing "it did not"
  // and rolling back would destroy a worktree that may hold real work,
  // which is M1-P3's V-1 defect with a new trigger.
  const scratch = makeScratch(t);
  const spawnLib = (await import(new URL("../src/spawn.ts", import.meta.url).href)) as {
    spawnTask(fleet: unknown, options: Record<string, unknown>): Promise<
      { ok: true } | { ok: false; reason: string }
    >;
  };
  const fleetLib = (await import(new URL("../src/fleet.ts", import.meta.url).href)) as {
    loadFleet(dir: string): unknown;
  };
  const fleet = fleetLib.loadFleet(scratch.fleet);

  const result = await spawnLib.spawnTask(fleet, {
    taskId: "t-adapterthrow",
    project: scratch.clone,
    briefFile: scratch.briefFile,
    shape: "ship",
    exec: "/bin/true",
    deadlineSeconds: undefined,
    offline: false,
    adapter: {
      name: "throwing-test-adapter",
      requires: [],
      launch(): never {
        throw new Error("simulated adapter crash: the payload state is unknown");
      },
    },
  });

  assert.equal(result.ok, false, "a raised adapter error escaped spawnTask");
  const reason = (result as { ok: false; reason: string }).reason;
  assert.match(reason, /throwing-test-adapter/);
  assert.match(reason, /did not report whether the payload started/);
  assert.match(reason, /nothing was rolled back/);
  // N-404: an enumeration without a next step is half a message, and the
  // route it names is the one both reviewers measured working.
  assert.match(
    reason,
    /tiphys teardown --task t-adapterthrow/,
    `the reason enumerates the residue without naming the route out: ${reason}`,
  );
  // The enumeration must match reality: nothing was rolled back.
  assert.ok(existsSync(worktreeOf(scratch, "t-adapterthrow")), "the worktree was rolled back");
  assert.ok(existsSync(join(scratch.fleet, "worktrees", "t-adapterthrow.pool.json")));
  assert.ok(existsSync(taskDirOf(scratch, "t-adapterthrow")));
  assert.equal(
    git(scratch.clone, ["rev-parse", "--verify", "--quiet", "refs/heads/task/t-adapterthrow"]).status,
    0,
    "the task branch was deleted by a rollback that should not have run",
  );
  // And the printed route really closes it, in one command, with no flags.
  const closed = runCli(["teardown", "--task", "t-adapterthrow"], { cwd: scratch.fleet });
  assert.equal(closed.status, 0, `the printed recovery route failed: ${closed.stderr}`);
  assert.equal(metaOf(scratch, "t-adapterthrow").status, "closed");
});

test("spawn usage errors exit 64 and a non-fleet cwd exits 1", (t) => {
  const scratch = makeScratch(t);
  const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
  assert.equal(runCli(["spawn"], { cwd: scratch.fleet }).status, 64);
  assert.equal(
    runCli(["spawn", "--task", "x", "--exec", stub], { cwd: scratch.fleet }).status,
    64,
  );
  const badShape = runCli(
    [
      "spawn",
      "--task",
      "x",
      "--project",
      scratch.clone,
      "--brief",
      scratch.briefFile,
      "--shape",
      "sideways",
      "--exec",
      stub,
    ],
    { cwd: scratch.fleet },
  );
  assert.equal(badShape.status, 64);
  const outside = runCli(
    [
      "spawn",
      "--task",
      "x",
      "--project",
      scratch.clone,
      "--brief",
      scratch.briefFile,
      "--shape",
      "ship",
      "--exec",
      stub,
    ],
    { cwd: makeTempDir(t) },
  );
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /not a fleet home/);
});

/* ------------------------------------------------------------------ */
/* M4-P2: launch is a promise, and completion is checked rather than   */
/* believed. Every test below drives spawnTask through the             */
/* ExecutorAdapter seam the production type already defines, because   */
/* the CLI can only reach the one shipped adapter and the whole point  */
/* is what the kernel does with an adapter it did not write.           */
/* ------------------------------------------------------------------ */

/** Minimal structural view of the request an adapter is handed. */
interface TestRequest {
  taskId: string;
  worktree: string;
  command: string[];
  hookPath: string;
  recordPath: string;
  deadlineSeconds: number | undefined;
  env: Record<string, string> | undefined;
  /* M4-P3: briefPath is not optional, the other three are. */
  briefPath: string;
  role: string | undefined;
  declaredTier: string | undefined;
  phaseId: string | undefined;
}

type TestOutcome =
  | { kind: "completed"; exitCode: number }
  | { kind: "launch-failed"; reason: string }
  | { kind: "incomplete"; reason: string };

interface TestAdapter {
  name: string;
  /**
   * M4-P3. Every adapter DECLARES what it cannot launch without, and the
   * kernel refuses before it creates anything. `[]` is the declaration an
   * adapter that needs nothing makes; it is not a default, which is why the
   * production interface makes the field required and why every literal in
   * this file states it.
   */
  requires: readonly string[];
  launch(request: TestRequest): Promise<TestOutcome>;
}

type SpawnOutcome =
  | { ok: true; value: { exitCode: number } }
  | { ok: false; reason: string };

/**
 * Run one spawn in process against a supplied adapter. The computed-URL
 * dynamic import is the pattern inherited warning 4 requires for reaching
 * src/ from test/ across the project reference.
 */
async function spawnWithAdapter(
  scratch: Scratch,
  taskId: string,
  adapter: TestAdapter,
  /* M4-P3: the three caller-supplied request fields, when a test supplies any. */
  extra: Record<string, unknown> = {},
): Promise<SpawnOutcome> {
  const spawnLib = (await import(new URL("../src/spawn.ts", import.meta.url).href)) as {
    spawnTask(fleet: unknown, options: Record<string, unknown>): Promise<SpawnOutcome>;
  };
  const fleetLib = (await import(new URL("../src/fleet.ts", import.meta.url).href)) as {
    loadFleet(dir: string): unknown;
  };
  return spawnLib.spawnTask(fleetLib.loadFleet(scratch.fleet), {
    taskId,
    project: scratch.clone,
    briefFile: scratch.briefFile,
    shape: "ship",
    exec: "/bin/true",
    deadlineSeconds: undefined,
    offline: false,
    ...extra,
    adapter,
  });
}

function reasonOf(result: SpawnOutcome): string {
  assert.equal(result.ok, false, "expected a refusal and got a success");
  return (result as { ok: false; reason: string }).reason;
}

function scrubRootOf(scratch: Scratch, taskId: string): string {
  return join(taskDirOf(scratch, taskId), "scrub-env");
}

/**
 * The five harness-owned redirect targets, named here rather than
 * imported so that a test asserting they SURVIVED does not depend on the
 * module whose behaviour is under test (src/exec/env.ts:110).
 */
const REDIRECT_TARGETS = [
  "home",
  "xdg-config",
  "gh-config",
  "gitconfig-global",
  "gitconfig-system",
];

/**
 * Real captured output from the programs these behaviours consume, read out
 * of witness/captures/ rather than retyped.
 *
 * Every spawn witness mutates src/spawn.ts or src/task.ts, and src/spawn.ts
 * imports spawnSync from node:child_process, so red-witness rule (f)
 * (src/witness/run.ts:1287) requires each of them to declare
 * `consumesExternalOutput`, and rule (c)
 * (src/witness/run.ts:1243) then requires a cited capture's BASENAME to be
 * referenced from this file's own source. That is the mechanical half. The
 * substantive half is CLAUDE.md's red-witness rule: where a behavior consumes
 * another program's output, the assertions must include that program's REAL
 * output rather than a string chosen to match the implementation. So each
 * test below asserts the recorded contract AND reproduces it live, and a
 * divergence between the two reddens rather than passing silently.
 */
function readCapture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../witness/captures/${name}`, import.meta.url)),
    "utf8",
  );
}

/** The basename every turn-end witness cites, named once. */
const HOOK_CAPTURE = "spawn-turn-end-hook-record.txt";

/**
 * The shape the capture records for a record the hook ACTUALLY wrote: a string
 * endedAt that parses as an instant, and an integer exitCode. Read out of the
 * capture rather than restated, so a test cannot assert a contract the capture
 * does not carry.
 */
function assertTurnEndMatchesCapture(turnEndFile: string, expectedExitCode: number): void {
  const captured = readCapture(HOOK_CAPTURE);
  assert.match(captured, /"endedAt": "[0-9]{4}-[0-9]{2}-[0-9]{2}T/, HOOK_CAPTURE);
  assert.match(captured, /"exitCode": [0-9]+/, HOOK_CAPTURE);
  const record = JSON.parse(readFileSync(turnEndFile, "utf8")) as {
    endedAt: unknown;
    exitCode: unknown;
  };
  assert.equal(typeof record.endedAt, "string", "captured contract: endedAt is a string");
  assert.equal(
    Number.isNaN(Date.parse(record.endedAt as string)),
    false,
    "captured contract: endedAt parses as an instant",
  );
  assert.equal(record.exitCode, expectedExitCode, "captured contract: exitCode is the argument");
}

/** Invoke the generated turn-end hook the way an honest adapter must. */
function invokeHook(request: TestRequest, exitCode: number): void {
  const hooked = spawnSync(process.execPath, [request.hookPath, String(exitCode)], {
    encoding: "utf8",
    ...(request.env === undefined ? {} : { env: request.env }),
  });
  assert.equal(hooked.status, 0, `the test adapter could not run the hook: ${hooked.stderr}`);
}

test(
  "an adapter reporting completed without invoking the hook is refused with the scrub root intact, and the same adapter invoking the hook succeeds",
  async (t) => {
    // DANGEROUS STATE: an adapter's self-report of completion believed
    // while its agent is still running. `completed` is the one arm that
    // DELETES something, and the thing it deletes is the redirected HOME
    // of a child that may still be alive. Before M4-P2 the arm was safe
    // only because `launch` was synchronous and the sole adapter wrote
    // the turn-end record itself; an async launch removes both guarantees
    // at once, and nothing else in the kernel looks.
    const scratch = makeScratch(t);

    // FIRST, anchor the thing the precondition reads to the REAL output of
    // the program that writes it. tasks/<id>/turn-end is produced by the
    // GENERATED hook, which spawn runs as a child (src/spawn.ts:232), so the
    // capture is that hook's output and not a description of it. Two arms
    // matter here: an integer argument exits 0 and writes a two-key record,
    // and a NON-integer argument exits 64 and writes NOTHING. The second is
    // the shipped route to the absent record this test is about: an adapter
    // that invoked the hook and ignored its exit code lands in the same state
    // as the fabricating adapter below, `completed` with no record. The
    // SHIPPED adapter does check that status (src/spawn.ts:252) and returns
    // `incomplete`; an adapter the kernel did not write need not, which is
    // the whole reason this precondition exists.
    const captureName = HOOK_CAPTURE;
    const captured = readCapture(captureName);
    assert.match(captured, /bad-argument:[^]*?exit 64/, captureName);
    assert.match(captured, /expected one integer exit-code argument/, captureName);
    assert.match(captured, /integer-argument:[^]*?exit 0/, captureName);
    assert.match(captured, /turn-end file: NOT WRITTEN/, captureName);
    {
      const hooksLib = (await import(new URL("../src/hooks.ts", import.meta.url).href)) as {
        renderTurnEndHook(turnEndFile: string): string;
      };
      const probeTurnEnd = join(scratch.tmp, "capture-probe-turn-end");
      const probeHook = join(scratch.tmp, "capture-probe-hook.mjs");
      writeFileSync(probeHook, hooksLib.renderTurnEndHook(probeTurnEnd), { mode: 0o755 });
      const bad = spawnSync(process.execPath, [probeHook, "not-an-integer"], {
        encoding: "utf8",
      });
      assert.equal(bad.status, 64, `captured contract: bad argument exits 64, got ${bad.stderr}`);
      assert.match(bad.stderr, /expected one integer exit-code argument/, bad.stderr);
      assert.equal(
        existsSync(probeTurnEnd),
        false,
        "captured contract: a refused hook invocation writes no turn-end record",
      );
      const good = spawnSync(process.execPath, [probeHook, "0"], { encoding: "utf8" });
      assert.equal(good.status, 0, `captured contract: integer argument exits 0, got ${good.stderr}`);
      const record = JSON.parse(readFileSync(probeTurnEnd, "utf8")) as {
        endedAt: unknown;
        exitCode: unknown;
      };
      assert.equal(typeof record.endedAt, "string", "captured contract: endedAt is a string");
      assert.equal(record.exitCode, 0, "captured contract: exitCode is the argument");
    }

    const fabricating: TestAdapter = {
      name: "fabricating-test-adapter",
      requires: [],
      // Resolves completed on a later microtask, having invoked nothing.
      launch: async () => ({ kind: "completed", exitCode: 0 }),
    };
    const refused = await spawnWithAdapter(scratch, "t-fabricated", fabricating);
    const reason = reasonOf(refused);
    assert.match(reason, /fabricating-test-adapter/, reason);
    assert.match(reason, /turn-end/, reason);
    assert.match(reason, /was never written/, reason);
    assert.ok(
      reason.includes(join(taskDirOf(scratch, "t-fabricated"), "turn-end")),
      `the refusal does not name the absent turn-end path: ${reason}`,
    );
    // Nothing was rolled back and nothing was removed.
    assert.ok(existsSync(worktreeOf(scratch, "t-fabricated")), "the worktree was destroyed");
    assert.ok(existsSync(taskDirOf(scratch, "t-fabricated")));
    assert.ok(existsSync(join(scratch.fleet, "worktrees", "t-fabricated.pool.json")));
    const scrub = scrubRootOf(scratch, "t-fabricated");
    assert.ok(existsSync(scrub), "the scrub root was deleted under a live child");
    for (const target of REDIRECT_TARGETS) {
      assert.ok(
        existsSync(join(scrub, target)),
        `the redirect target ${target} was deleted under a live child`,
      );
    }

    // THE OTHER DIRECTION, and the adapter differs in exactly one thing:
    // it invokes hookPath first, which is what the ExecutorAdapter
    // contract has always required of it.
    const honest: TestAdapter = {
      name: "honest-test-adapter",
      requires: [],
      launch: async (request) => {
        invokeHook(request, 0);
        return { kind: "completed", exitCode: 0 };
      },
    };
    const accepted = await spawnWithAdapter(scratch, "t-honest", honest);
    assert.equal(accepted.ok, true, accepted.ok ? "" : accepted.reason);
    assert.equal((accepted as { ok: true; value: { exitCode: number } }).value.exitCode, 0);
    assert.equal(
      existsSync(scrubRootOf(scratch, "t-honest")),
      false,
      "the scrub root survived a genuinely completed spawn",
    );
  },
);

test(
  "a turn-end record that is present but does not parse is refused just as an absent one is",
  async (t) => {
    // THE SECOND STRUCTURALLY DIFFERENT MEMBER of the class "the kernel
    // trusts an adapter's account of the payload". The first member is an
    // ABSENCE; this one is a PRESENT-BUT-WRONG artifact, and a completion
    // check written as existsSync passes it green. Two shapes here, both
    // present: bytes that are not JSON at all, and bytes that ARE valid
    // JSON and are not a turn-end record, which a JSON.parse-only check
    // would also pass green.
    const scratch = makeScratch(t);

    // The wrong-shape fixture below is not invented: it INVERTS the two field
    // types the capture shows the real hook writing, a string endedAt and an
    // integer exitCode. Asserting that against the capture is what keeps the
    // fixture anchored to the program's output, so a later change to the
    // hook's record makes this test wrong loudly rather than quietly.
    const shapeCaptured = readCapture(HOOK_CAPTURE);
    assert.match(shapeCaptured, /"endedAt": "[0-9]{4}-[0-9]{2}-[0-9]{2}T/, HOOK_CAPTURE);
    assert.match(shapeCaptured, /"exitCode": [0-9]+/, HOOK_CAPTURE);

    const garbage: TestAdapter = {
      name: "garbage-writing-test-adapter",
      requires: [],
      launch: async (request) => {
        writeFileSync(join(dirname(request.recordPath), "turn-end"), "{;");
        return { kind: "completed", exitCode: 0 };
      },
    };
    const first = await spawnWithAdapter(scratch, "t-garbage", garbage);
    const firstReason = reasonOf(first);
    assert.match(firstReason, /garbage-writing-test-adapter/, firstReason);
    assert.match(firstReason, /does not parse as JSON/, firstReason);
    assert.ok(existsSync(worktreeOf(scratch, "t-garbage")), "the worktree was destroyed");
    assert.ok(existsSync(scrubRootOf(scratch, "t-garbage")), "the scrub root was deleted");

    const wrongShape: TestAdapter = {
      name: "wrong-shape-test-adapter",
      requires: [],
      launch: async (request) => {
        writeFileSync(
          join(dirname(request.recordPath), "turn-end"),
          `${JSON.stringify({ endedAt: 12, exitCode: "0" })}\n`,
        );
        return { kind: "completed", exitCode: 0 };
      },
    };
    const second = await spawnWithAdapter(scratch, "t-wrongshape", wrongShape);
    const secondReason = reasonOf(second);
    assert.match(secondReason, /wrong-shape-test-adapter/, secondReason);
    assert.match(secondReason, /does not parse as a turn-end record/, secondReason);
    assert.ok(existsSync(worktreeOf(scratch, "t-wrongshape")), "the worktree was destroyed");
    assert.ok(existsSync(scrubRootOf(scratch, "t-wrongshape")), "the scrub root was deleted");
  },
);

test(
  "a rejected launch promise rolls nothing back, while a returned launch-failed still rolls everything back",
  async (t) => {
    // DANGEROUS STATE: a rejection destroying a worktree that holds real
    // work, which is M1-P3's V-1 defect with a new cause. The pair below
    // is the structurally different one the plan names: a REJECTION (the
    // adapter told us nothing, so nothing moves) against a RETURNED
    // launch-failed (the adapter asserted the payload never started, so
    // the rollback is authorized). Two differently-timed rejections would
    // be the same arm asserted twice.
    const scratch = makeScratch(t);

    // WHAT DECIDES WHICH ARM IS WHICH is another program's output, so it is
    // anchored on that program before either arm is asserted. The shipped
    // adapter reads spawnSync's `error` field as "the payload never started"
    // (src/spawn.ts:220) and only that state returns launch-failed, the one
    // outcome allowed to destroy the task's records (src/spawn.ts:612). A
    // check written on `status !== 0` instead would fold a payload that never
    // started together with one that ran and failed, which is the whole
    // distinction this test rests on.
    const launchCaptureName = "spawn-launch-failure-vs-payload-exit.txt";
    const launchCaptured = readCapture(launchCaptureName);
    assert.match(launchCaptured, /never-started:[^]*?error\.code: ENOENT/, launchCaptureName);
    assert.match(launchCaptured, /never-started:[^]*?status: null/, launchCaptureName);
    assert.match(launchCaptured, /ran-and-failed:[^]*?error: undefined/, launchCaptureName);
    assert.match(launchCaptured, /ran-and-failed:[^]*?status: 3/, launchCaptureName);
    {
      const missing = spawnSync(join(scratch.tmp, "definitely-not-on-path"), ["--version"], {
        encoding: "utf8",
      });
      assert.notEqual(missing.error, undefined, "captured contract: a missing program errors");
      assert.equal(
        (missing.error as NodeJS.ErrnoException).code,
        "ENOENT",
        "captured contract: the missing-program errno is ENOENT",
      );
      assert.equal(missing.status, null, "captured contract: a program that never ran has no status");
      const ranAndFailed = spawnSync(process.execPath, ["-e", "process.exit(3)"], {
        encoding: "utf8",
      });
      assert.equal(ranAndFailed.error, undefined, "captured contract: a payload that ran does not error");
      assert.equal(ranAndFailed.status, 3, "captured contract: a payload that ran carries its status");
    }

    const rejecting: TestAdapter = {
      name: "rejecting-test-adapter",
      requires: [],
      launch: async (request) => {
        // The payload started and left work behind before the failure.
        writeFileSync(join(request.worktree, "implementer-work.txt"), "four rounds of it\n");
        await new Promise((resolve) => setImmediate(resolve));
        throw new Error("the session died after the agent had been working for an hour");
      },
    };
    const rejected = await spawnWithAdapter(scratch, "t-rejected", rejecting);
    const reason = reasonOf(rejected);
    assert.match(reason, /rejecting-test-adapter/, reason);
    assert.match(reason, /did not report whether the payload started/, reason);
    assert.match(reason, /nothing was rolled back/, reason);
    assert.match(reason, /tiphys teardown --task t-rejected/, reason);
    assert.ok(existsSync(worktreeOf(scratch, "t-rejected")), "the worktree was destroyed");
    assert.equal(
      readFileSync(join(worktreeOf(scratch, "t-rejected"), "implementer-work.txt"), "utf8"),
      "four rounds of it\n",
      "the work in the worktree was destroyed by a rollback that should not have run",
    );
    assert.ok(existsSync(taskDirOf(scratch, "t-rejected")));
    assert.ok(existsSync(join(scratch.fleet, "worktrees", "t-rejected.pool.json")));
    assert.equal(
      git(scratch.clone, ["rev-parse", "--verify", "--quiet", "refs/heads/task/t-rejected"]).status,
      0,
      "the task branch was deleted by a rollback that should not have run",
    );
    // THE ASSERTIONS THAT ACTUALLY DISTINGUISH A ROLLBACK, and the reason
    // the four above do not. Pool destroy is called with discard false, so
    // it REFUSES a dirty worktree, and this adapter deliberately dirtied
    // one. A rollback that ran would therefore leave the worktree, the
    // pool record and the branch in place anyway, and every assertion
    // above would stay green through the defect they are written to
    // catch. What a rollback unlinks unconditionally, before it ever
    // reaches pool destroy, is the files THIS invocation created
    // (src/spawn.ts:452): the brief, meta.json and the turn-end hook.
    // Those are the witness.
    for (const name of ["meta.json", "brief.md", "turn-end-hook.mjs"]) {
      assert.ok(
        existsSync(join(taskDirOf(scratch, "t-rejected"), name)),
        `${name} was unlinked by a rollback that should not have run`,
      );
    }

    // THE COUNTERPART ARM. The adapter ASSERTS the payload never started,
    // which is the one claim that authorizes destroying the worktree.
    const failing: TestAdapter = {
      name: "launch-failing-test-adapter",
      requires: [],
      launch: async () => ({ kind: "launch-failed", reason: "the program is not on PATH" }),
    };
    const failed = await spawnWithAdapter(scratch, "t-launchfailed", failing);
    const failedReason = reasonOf(failed);
    assert.match(failedReason, /executor launch failed/, failedReason);
    assert.match(failedReason, /the program is not on PATH/, failedReason);
    assert.equal(
      existsSync(worktreeOf(scratch, "t-launchfailed")),
      false,
      "launch-failed stopped rolling the worktree back",
    );
    assert.equal(existsSync(taskDirOf(scratch, "t-launchfailed")), false);
    assert.equal(existsSync(join(scratch.fleet, "worktrees", "t-launchfailed.pool.json")), false);
    assert.notEqual(
      git(scratch.clone, [
        "rev-parse",
        "--verify",
        "--quiet",
        "refs/heads/task/t-launchfailed",
      ]).status,
      0,
      "launch-failed left the task branch behind",
    );
  },
);

test(
  "spawnTask returns only after a payload the adapter awaited has written its sentinel",
  async (t) => {
    // C-3 WITNESSED RATHER THAN ASSERTED. The adapter awaits a real child
    // process, so the work happens on a later turn of the event loop and
    // a call site that did not await would return before any of it. The
    // assertion is on FILE EXISTENCE at the moment spawnTask returns and
    // never on elapsed time, because a timing assertion is a flake and a
    // flake in the suite gate is a binary fact CI reads as red.
    const scratch = makeScratch(t);
    const sentinel = join(scratch.tmp, "payload-finished");
    assert.equal(existsSync(sentinel), false, "precondition: no sentinel yet");

    const awaiting: TestAdapter = {
      name: "awaiting-test-adapter",
      requires: [],
      launch: async (request) => {
        const exitCode = await new Promise<number>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ["-e", `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "done\\n")`],
            { stdio: "ignore" },
          );
          child.on("error", reject);
          child.on("exit", (code) => {
            resolve(code ?? 0);
          });
        });
        invokeHook(request, exitCode);
        return { kind: "completed", exitCode };
      },
    };
    const result = await spawnWithAdapter(scratch, "t-sentinel", awaiting);
    assert.ok(
      existsSync(sentinel),
      "spawnTask returned before the payload the adapter awaited had finished",
    );
    assert.equal(result.ok, true, result.ok ? "" : result.reason);
    // The adapter invoked the real hook as a child, so the record spawn read
    // is that child's output; check it against the captured contract rather
    // than against the adapter's report.
    assertTurnEndMatchesCapture(join(taskDirOf(scratch, "t-sentinel"), "turn-end"), 0);
  },
);

test(
  "a launch outcome resolved on a later event-loop turn is read as an outcome, not as a pending promise",
  async (t) => {
    // The narrowest statement of the async change: the kernel AWAITS the
    // adapter. A call site that merely called it would see a pending
    // promise, whose `kind` is undefined, fall past both failure arms and
    // report success with an undefined exit code. So the assertion that
    // distinguishes the two is on the VALUE of exitCode, not on ok alone,
    // and 7 is chosen because it is neither 0 nor undefined.
    const scratch = makeScratch(t);
    const deferred: TestAdapter = {
      name: "deferred-test-adapter",
      requires: [],
      launch: async (request) => {
        await new Promise((resolve) => setImmediate(resolve));
        invokeHook(request, 7);
        await new Promise((resolve) => setImmediate(resolve));
        return { kind: "completed", exitCode: 7 };
      },
    };
    const result = await spawnWithAdapter(scratch, "t-deferred", deferred);
    assert.equal(result.ok, true, result.ok ? "" : result.reason);
    const value = (result as { ok: true; value: { exitCode: number } }).value;
    assert.equal(typeof value.exitCode, "number", "the exit code was not read from the outcome");
    assert.equal(value.exitCode, 7);
    // And the turn-end record the hook wrote carries the same code, so the
    // evidence the kernel checked is the payload's own, not the report's. The
    // record is compared against the CAPTURED contract of the hook that wrote
    // it, so the shape asserted here is the one that program really produces.
    assertTurnEndMatchesCapture(join(taskDirOf(scratch, "t-deferred"), "turn-end"), 7);
  },
);

/**
 * This phase's new behavior ids. They are listed here as IDS, never as
 * descriptions, so the descriptions appear in this file exactly once: as
 * the test titles themselves. The resolution test below depends on that.
 */
const M4_P2_BEHAVIORS = [
  "spawn-async-launch-awaited",
  "spawn-completed-without-turn-end-is-incomplete",
  "spawn-unparseable-turn-end-is-incomplete",
  "spawn-rejected-launch-rolls-nothing-back",
  "spawn-returns-after-payload-sentinel",
  "spawn-launch-failed-rolls-back-through-a-symlink",
];

test("every spawn behavior resolves by name to a test in this file", () => {
  /*
   * BY NAME, NEVER BY COUNT (binding convention 5, the append-only
   * registry rule). The set of behaviors this file owns is DERIVED at run
   * time by matching registry descriptions against the titles in this
   * file's own source, so a later phase appending rows to the registry
   * cannot redden this test, and no number is pinned anywhere in it.
   */
  const behaviors = JSON.parse(
    readFileSync(fileURLToPath(new URL("./behaviors.json", import.meta.url)), "utf8"),
  ) as Record<string, string>;
  for (const id of M4_P2_BEHAVIORS) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }

  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const owned = Object.entries(behaviors)
    .filter(([, description]) => source.includes(`"${description}"`))
    .map(([id]) => id);
  assert.ok(
    owned.length > 0,
    "no registry description resolves to a test title in this file, so this " +
      "check is vacuous and would stay green however the file was renamed",
  );
  for (const id of M4_P2_BEHAVIORS) {
    assert.ok(
      owned.includes(id),
      `behavior ${id} is registered but its description is not a test title in this file`,
    );
  }
  // The spawn behaviors that predate this phase must still resolve, which is
  // the half a rename would break silently. They are read from the registry
  // rather than listed, for the same reason.
  for (const id of ["spawn-launch-failure-rollback", "spawn-adapter-throw-not-classified"]) {
    assert.ok(
      owned.includes(id),
      `pre-existing behavior ${id} no longer resolves to a test title in this file`,
    );
  }
});

test(
  "a launch-failed rolls the worktree back through a symlinked fleet root and through a symlinked worktrees directory",
  async (t) => {
    // DANGEROUS STATE: a launch-failed that LEAVES THE WORKTREE BEHIND,
    // which is the state the macOS smoke job of pull request #155 measured
    // and which every Linux run of the same head reported green. It is not
    // "the feature is absent": the rollback runs, reaches pool destroy, and
    // pool destroy REFUSES, because it decides whether some other worktree
    // holds the task branch by comparing a path git printed against a path
    // the kernel composed. Two spellings of one directory are two strings.
    //
    // WHAT DECIDES IT IS ANOTHER PROGRAM'S OUTPUT, so it is anchored on that
    // program's real output before either arm is asserted, and then
    // reproduced live so a change in git cannot leave the capture asserting
    // a contract git no longer honours.
    const canonicalCapture = "git-worktree-list-canonicalises-paths.txt";
    const captured = readCapture(canonicalCapture);
    assert.match(captured, /asked-for-worktree: \$R\/link\/wt/, canonicalCapture);
    assert.match(captured, /reported-worktree: {2}\$R\/real\/wt/, canonicalCapture);
    assert.match(captured, /^worktree \$R\/real\/wt$/mu, canonicalCapture);
    assert.doesNotMatch(captured, /^worktree \$R\/link\/wt$/mu, canonicalCapture);

    const live = makeScratch(t);
    {
      // The captured contract, re-measured here on this machine's git.
      //
      // THE CONTRACT IS "GIT PRINTS THE REALPATH OF WHAT IT WAS GIVEN", so
      // that is what the comparison below is written against. Composing the
      // expected string out of the fixture's own directory instead is what
      // made this probe fail on the macOS runner of pull request #155: there
      // os.tmpdir() sits under /var/folders and /var is itself a symlink to
      // /private/var, so the fixture's "real" directory was ALREADY a
      // non-canonical spelling before the fixture created any symlink, git
      // printed the /private/var form, and the probe read a correct git as a
      // broken one. Resolving the asked-for path states the contract exactly
      // and is the same sentence on every platform.
      const realDir = join(live.tmp, "canonical-probe");
      mkdirSync(realDir);
      const linkDir = join(live.tmp, "canonical-probe-link");
      symlinkSync(realDir, linkDir);
      const probeClone = join(linkDir, "clone");
      gitOk(live.tmp, ["clone", "--quiet", live.upstream, probeClone]);
      const probeTree = join(linkDir, "wt");
      gitOk(probeClone, ["worktree", "add", "--quiet", "-b", "probe/x", probeTree]);
      // realpathSync is applied to the path GIT WAS GIVEN, never to git's
      // answer, so the symlink the fixture built is still the thing under
      // test. If git stopped canonicalising and echoed the spelling it was
      // handed, this string would be absent from the listing and the next
      // assertion would find probeTree present: two independent reds, and
      // the notEqual below is what stops either passing vacuously.
      const canonicalTree = realpathSync(probeTree);
      const listed = gitOk(probeClone, ["worktree", "list", "--porcelain"]);
      assert.notEqual(
        probeTree,
        canonicalTree,
        "captured contract: the two spellings are different strings",
      );
      assert.ok(
        listed.includes(`worktree ${canonicalTree}\n`),
        `captured contract: git reports the canonical worktree path ` +
          `${canonicalTree} for the worktree it was asked to add at ` +
          `${probeTree}, got:\n${listed}`,
      );
      assert.ok(
        !listed.includes(`worktree ${probeTree}\n`),
        `captured contract: git does not echo the spelling it was given, got:\n${listed}`,
      );
    }

    const failing: TestAdapter = {
      name: "launch-failing-test-adapter",
      requires: [],
      launch: async () => ({ kind: "launch-failed", reason: "the program is not on PATH" }),
    };

    // ARM A. The SPELLING THE CALLER HANDS IN carries the symlink. This is
    // the macOS case and it needs no unusual setup there: os.tmpdir() sits
    // under /var/folders and /var is a symlink to /private/var, so every
    // scratch fleet is reached through one. The CLI is accidentally immune
    // because process.cwd() is canonical already (src/commands/spawn.ts:129
    // passes it), so only a library consumer reaches this.
    const rootLink = join(live.tmp, "fleet-through-a-link");
    symlinkSync(live.fleet, rootLink);
    assert.notEqual(rootLink, live.fleet, "precondition: two different strings");
    assert.equal(
      realpathSync(rootLink),
      realpathSync(live.fleet),
      "precondition: and one directory",
    );
    const viaRootLink: Scratch = {
      ...live,
      fleet: rootLink,
      clone: join(rootLink, "projects", "demo"),
    };
    const failedA = await spawnWithAdapter(viaRootLink, "t-linkedroot", failing);
    const reasonA = reasonOf(failedA);
    assert.match(reasonA, /executor launch failed/, reasonA);
    assert.match(reasonA, /the program is not on PATH/, reasonA);
    // THE ASSERTION THE OLD TEST DID NOT MAKE, and the reason the defect
    // reached a pull request wearing the wrong label. A refused rollback
    // reports itself in a SUFFIX to the same reason, so both matches above
    // stay green through it and only the state assertions move. Asserting
    // the suffix is absent names the cause in the failure message instead
    // of leaving the next reader to derive it from a bare true !== false.
    assert.doesNotMatch(reasonA, /rollback of the worktree did not complete/u, reasonA);
    assert.equal(
      existsSync(worktreeOf(live, "t-linkedroot")),
      false,
      "a symlinked fleet root stopped the launch-failed rollback removing the worktree",
    );
    assert.equal(existsSync(taskDirOf(live, "t-linkedroot")), false);
    assert.equal(existsSync(join(live.fleet, "worktrees", "t-linkedroot.pool.json")), false);
    assert.notEqual(
      git(live.clone, [
        "rev-parse",
        "--verify",
        "--quiet",
        "refs/heads/task/t-linkedroot",
      ]).status,
      0,
      "a symlinked fleet root left the task branch behind",
    );

    // ARM B, AND IT IS STRUCTURALLY DIFFERENT RATHER THAN THE SAME ARM
    // TWICE. Here the fleet root the caller names is ALREADY canonical and
    // the symlink is INSIDE the layout: worktrees/ is a link to a directory
    // elsewhere. Canonicalising the caller's argument, which is the obvious
    // fix for arm A and is what loadFleet would have to do, does nothing at
    // all for this one. The two arms therefore fail under different repairs,
    // which is what stops a single-site patch passing for a class fix.
    const second = makeScratch(t);
    const elsewhere = join(second.tmp, "worktrees-somewhere-else");
    mkdirSync(elsewhere);
    rmSync(join(second.fleet, "worktrees"), { recursive: true });
    symlinkSync(elsewhere, join(second.fleet, "worktrees"));
    // AND THIS PRECONDITION IS LOAD-BEARING, NOT DECORATION. If the fleet
    // root here carries a symlink anywhere in it, the arm stops being
    // structurally different from arm A: canonicalising the caller's
    // argument would repair both, and "one witness is not a class" would be
    // satisfied on paper by two members that fail under the same repair. On
    // macOS that is exactly what happened until round 4, because
    // os.tmpdir() sits under /var and /var is a symlink; makeTempDir now
    // resolves the scratch root once, which is what makes this true on every
    // platform. Failing here means the helper stopped doing that.
    assert.equal(
      realpathSync(second.fleet),
      second.fleet,
      "precondition: this arm's fleet root is already canonical, or it is not " +
        "a different arm from arm A (see makeTempDir)",
    );
    const failedB = await spawnWithAdapter(second, "t-linkedworktrees", failing);
    const reasonB = reasonOf(failedB);
    assert.match(reasonB, /executor launch failed/, reasonB);
    assert.doesNotMatch(reasonB, /rollback of the worktree did not complete/u, reasonB);
    assert.equal(
      existsSync(join(elsewhere, "t-linkedworktrees")),
      false,
      "a symlinked worktrees directory stopped the launch-failed rollback removing the worktree",
    );
    assert.equal(existsSync(taskDirOf(second, "t-linkedworktrees")), false);
    assert.equal(existsSync(join(elsewhere, "t-linkedworktrees.pool.json")), false);
    assert.notEqual(
      git(second.clone, [
        "rev-parse",
        "--verify",
        "--quiet",
        "refs/heads/task/t-linkedworktrees",
      ]).status,
      0,
      "a symlinked worktrees directory left the task branch behind",
    );
  },
);

/* ------------------------------------------------------------------ */
/* M4-P3: the request contract widens, and a declared requirement that  */
/* is unmet creates NOTHING. Every test below drives spawnTask through  */
/* the ExecutorAdapter seam for the reason the M4-P2 block above gives: */
/* `tiphys spawn` reaches exactly one adapter until M4-P4 ships         */
/* --adapter, and the whole subject here is what the kernel does with   */
/* an adapter it did not write.                                         */
/* ------------------------------------------------------------------ */

/** The basename the requirement witnesses cite, named once. */
const GIT_STATE_CAPTURE = "spawn-requirement-refusal-git-state.txt";

/** The basename the executor-record witness cites, named once. */
const VALIDATE_CAPTURE = "executor-record-validate-cli.txt";

/**
 * The project clone's git-visible state: what `git worktree list` and
 * `git branch --list` print, as those two programs print it.
 *
 * TWO OF CRITERION 2's FOUR POST-CONDITIONS ARE NOT FILES, and that is the
 * point of reading them from git rather than from the filesystem. A refusal
 * that left a branch and a worktree behind would still satisfy "the task
 * directory does not exist" and "no pool record exists", which is half a
 * check and the half that has been wrong here before (F-2's orphaned
 * worktree, branch and pool record).
 */
function gitVisibleState(scratch: Scratch): { worktrees: string; branches: string } {
  return {
    worktrees: gitOk(scratch.clone, ["worktree", "list"]),
    branches: gitOk(scratch.clone, ["branch", "--list"]),
  };
}

/**
 * The four post-conditions of criterion 2, asserted together because
 * "exited nonzero" is compatible with having created three of them.
 */
function assertNothingWasCreated(
  scratch: Scratch,
  taskId: string,
  before: { worktrees: string; branches: string },
  label: string,
): void {
  assert.equal(
    existsSync(taskDirOf(scratch, taskId)),
    false,
    `${label}: the task directory was created`,
  );
  assert.equal(
    existsSync(join(scratch.fleet, "worktrees", `${taskId}.pool.json`)),
    false,
    `${label}: a pool record was created`,
  );
  const after = gitVisibleState(scratch);
  assert.equal(after.worktrees, before.worktrees, `${label}: git worktree list changed`);
  assert.equal(after.branches, before.branches, `${label}: git branch --list changed`);
  assert.equal(
    existsSync(worktreeOf(scratch, taskId)),
    false,
    `${label}: the worktree directory was created`,
  );
}

/**
 * The captured contract for the two git programs, read out of
 * witness/captures/ rather than retyped (CLAUDE.md's red-witness rule: where
 * a behavior consumes another program's output, assert on the real output).
 *
 * WHAT IS ASSERTED AGAINST THE CAPTURE. The capture records that a spawned
 * task ADDS one line to each listing, that the added worktree line carries
 * the task's worktree path and a bracketed `[task/<id>]`, and that the added
 * branch line is marked `+` rather than `*` or a bare indent, because the
 * branch is checked out in another worktree. The live control arm below
 * reproduces all three, so the "unchanged" assertions above cannot be
 * vacuous: something demonstrably DOES change these two outputs.
 */
function assertGitStateMatchesCapture(
  before: { worktrees: string; branches: string },
  after: { worktrees: string; branches: string },
  scratch: Scratch,
  taskId: string,
): void {
  const captured = readCapture(GIT_STATE_CAPTURE);
  assert.match(captured, /\+ task\/t-cap/, GIT_STATE_CAPTURE);
  assert.match(captured, /\[task\/t-cap\]/, GIT_STATE_CAPTURE);

  const addedWorktrees = after.worktrees.split("\n").length - before.worktrees.split("\n").length;
  const addedBranches = after.branches.split("\n").length - before.branches.split("\n").length;
  assert.equal(addedWorktrees, 1, `captured contract: one worktree line is added\n${after.worktrees}`);
  assert.equal(addedBranches, 1, `captured contract: one branch line is added\n${after.branches}`);

  const worktreeLine = after.worktrees
    .split("\n")
    .find((line) => line.startsWith(realpathSync(worktreeOf(scratch, taskId))));
  assert.ok(worktreeLine !== undefined, `no worktree line for ${taskId}:\n${after.worktrees}`);
  assert.match(worktreeLine as string, new RegExp(`\\[task/${taskId}\\]$`), worktreeLine);

  const branchLine = after.branches.split("\n").find((line) => line.endsWith(`task/${taskId}`));
  assert.ok(branchLine !== undefined, `no branch line for ${taskId}:\n${after.branches}`);
  assert.equal(
    (branchLine as string).startsWith("+ "),
    true,
    `captured contract: a branch checked out elsewhere is marked +, not: ${String(branchLine)}`,
  );
}

test(
  "an adapter requirement the spawn cannot meet refuses before a worktree, a branch, a task directory or a pool record exists",
  async (t) => {
    /*
     * DANGEROUS STATE: not "an adapter received undefined". It is an adapter
     * DISCOVERING the undefined and failing after pool create has already
     * made a worktree, a branch and a pool record, which is the measured
     * --deadline defect (src/commands/spawn.ts:81, "a usage error creates
     * nothing") with a new field. So the refusal is asserted together with
     * all four post-conditions, because exiting nonzero is compatible with
     * having created three of them.
     */
    const scratch = makeScratch(t);
    const before = gitVisibleState(scratch);

    let launched = false;
    const needsRole: TestAdapter = {
      name: "role-requiring-test-adapter",
      requires: ["role"],
      async launch(): Promise<TestOutcome> {
        launched = true;
        return { kind: "completed", exitCode: 0 };
      },
    };

    const refused = await spawnWithAdapter(scratch, "t-needrole", needsRole);
    const reason = reasonOf(refused);
    assert.match(reason, /role-requiring-test-adapter/, reason);
    assert.match(reason, /requires role/, reason);
    assert.match(reason, /nothing was created/, reason);
    assert.equal(launched, false, "the adapter was reached despite an unmet requirement");
    assertNothingWasCreated(scratch, "t-needrole", before, "unmet requirement");

    /*
     * THE OTHER DIRECTION, and the adapter differs in exactly one thing:
     * the same declaration, with --role supplied, reaches launch. Without
     * this arm the assertions above are satisfied by a kernel that refuses
     * every spawn.
     */
    let seenRole: string | undefined;
    const observing: TestAdapter = {
      name: "role-requiring-test-adapter",
      requires: ["role"],
      async launch(request: TestRequest): Promise<TestOutcome> {
        seenRole = request.role;
        writeFileSync(request.recordPath, `${JSON.stringify({ adapter: "role-requiring-test-adapter", launchedAt: new Date().toISOString() }, null, 2)}\n`);
        invokeHook(request, 0);
        return { kind: "completed", exitCode: 0 };
      },
    };
    const accepted = await spawnWithAdapter(scratch, "t-haverole", observing, {
      role: "implementer",
    });
    assert.equal(accepted.ok, true, accepted.ok ? "" : accepted.reason);
    assert.equal(seenRole, "implementer", "the request did not carry the supplied role");

    /*
     * AND THE CONTROL THAT KEEPS THE FOUR ASSERTIONS FROM BEING VACUOUS: the
     * successful spawn DOES change both git listings, in the shapes the
     * capture records. A test that only ever compared an unchanged state
     * against itself would pass on a kernel that created nothing ever.
     */
    assertGitStateMatchesCapture(before, gitVisibleState(scratch), scratch, "t-haverole");
    assertTurnEndMatchesCapture(join(taskDirOf(scratch, "t-haverole"), "turn-end"), 0);
  },
);

test(
  "an adapter requiring a field the request contract has no name for is refused as a contract defect, not as a missing value",
  async (t) => {
    /*
     * THE SECOND MEMBER OF THE CLASS, and it is structurally different from
     * the one above rather than a second instance of it. There the field
     * EXISTS and is absent; here the field is not in the contract at all.
     * A check written as `request[name] === undefined` cannot tell them
     * apart, because an unknown key also reads undefined, and it would
     * answer an adapter DEFECT with a message about a missing flag, sending
     * an operator to look for a --modelName the kernel can never accept.
     *
     * So this test asserts the two refusals SAY DIFFERENT THINGS, not merely
     * that both refuse. The conflated implementation is green on "it exits
     * nonzero" and red here.
     */
    const scratch = makeScratch(t);
    const before = gitVisibleState(scratch);

    let launched = false;
    const needsUnknown: TestAdapter = {
      name: "model-requiring-test-adapter",
      requires: ["modelName"],
      async launch(): Promise<TestOutcome> {
        launched = true;
        return { kind: "completed", exitCode: 0 };
      },
    };
    const refused = await spawnWithAdapter(scratch, "t-unknownfield", needsUnknown);
    const reason = reasonOf(refused);
    assert.match(reason, /model-requiring-test-adapter/, reason);
    assert.match(reason, /modelName/, reason);
    assert.match(reason, /the executor request contract has no field for/, reason);
    /* The discrimination itself: this is NOT the unmet-value sentence. */
    assert.equal(
      /supplied no value/.test(reason),
      false,
      `an unknown field was reported as a missing value: ${reason}`,
    );
    /* And the refusal names what CAN be required, so the defect is fixable. */
    assert.match(reason, /the requirable fields are .*briefPath/, reason);
    assert.equal(launched, false, "the adapter was reached despite an unknown requirement");
    assertNothingWasCreated(scratch, "t-unknownfield", before, "unknown requirement");

    /*
     * THE CONTRAST ARM, the same spawn one character different: a field that
     * IS in the contract and is absent produces the OTHER sentence. Both
     * arms in one test because the property under test is the distinction,
     * and a distinction needs both sides to be observable at once.
     */
    const needsAbsent: TestAdapter = {
      name: "tier-requiring-test-adapter",
      requires: ["declaredTier"],
      async launch(): Promise<TestOutcome> {
        return { kind: "completed", exitCode: 0 };
      },
    };
    const other = reasonOf(await spawnWithAdapter(scratch, "t-absentfield", needsAbsent));
    assert.match(other, /supplied no value/, other);
    assert.equal(
      /has no field for/.test(other),
      false,
      `an absent value was reported as a contract defect: ${other}`,
    );
    assertNothingWasCreated(scratch, "t-absentfield", before, "absent value");

    /* A malformed declaration is refused too, rather than raised as a
       TypeError out of spawnTask: from M4-P4 the adapter is foreign code. */
    const malformed = reasonOf(
      await spawnWithAdapter(scratch, "t-malformed", {
        name: "malformed-test-adapter",
        requires: undefined as unknown as readonly string[],
        async launch(): Promise<TestOutcome> {
          return { kind: "completed", exitCode: 0 };
        },
      }),
    );
    assert.match(malformed, /does not declare requires as an array/, malformed);
    assertNothingWasCreated(scratch, "t-malformed", before, "malformed declaration");
  },
);

test(
  "the executor request carries the assembled brief path, and the adapter reads a real file at it",
  async (t) => {
    /*
     * DANGEROUS STATE: an adapter reading `undefined` where the brief should
     * be and launching an agent with no input at all. The brief IS the agent
     * payload's entire input, and until this phase the request did not carry
     * it although the call site had it in hand.
     *
     * The assertion is on the FILE at the path, not on the path's shape: a
     * kernel that passed any string would satisfy "briefPath is a string",
     * and a kernel that passed the hook path would satisfy "the file exists".
     */
    const scratch = makeScratch(t);
    let seen: TestRequest | undefined;
    const reader: TestAdapter = {
      name: "brief-reading-test-adapter",
      requires: ["briefPath"],
      async launch(request: TestRequest): Promise<TestOutcome> {
        seen = request;
        writeFileSync(
          request.recordPath,
          `${JSON.stringify({ adapter: "brief-reading-test-adapter", launchedAt: new Date().toISOString() }, null, 2)}\n`,
        );
        invokeHook(request, 0);
        return { kind: "completed", exitCode: 0 };
      },
    };
    const result = await spawnWithAdapter(scratch, "t-brief", reader, {
      role: "implementer",
      declaredTier: "strongest",
      phaseId: "M4-P3",
    });
    assert.equal(result.ok, true, result.ok ? "" : result.reason);
    const request = seen as TestRequest;
    assert.equal(typeof request.briefPath, "string", "briefPath is not a string");
    assert.equal(
      readFileSync(request.briefPath, "utf8").includes("Do the thing."),
      true,
      `the briefPath does not name the assembled brief: ${request.briefPath}`,
    );
    assert.notEqual(request.briefPath, request.hookPath, "briefPath is the hook path");
    assert.equal(request.briefPath, join(taskDirOf(scratch, "t-brief"), "brief.md"));
    /* The three optional fields cross verbatim, including the phase id,
       which is CARRIED and never derived from a branch name (M4-D-22). */
    assert.equal(request.role, "implementer");
    assert.equal(request.declaredTier, "strongest");
    assert.equal(request.phaseId, "M4-P3");
    assertTurnEndMatchesCapture(join(taskDirOf(scratch, "t-brief"), "turn-end"), 0);

    /*
     * THE DRIFT GUARD, and it is the "registered in one place and not the
     * other" shape this repository keeps paying for. `requires` is checked
     * against a closed list of field names; that list and the object an
     * adapter is actually handed are two things that can drift, and the
     * drift is silent in both directions (a request field nobody can
     * require, or a requirable name nothing can satisfy). DERIVED from the
     * real request rather than restated, so a field added to either side
     * reddens here.
     */
    const spawnLib = (await import(new URL("../src/spawn.ts", import.meta.url).href)) as {
      requirableRequestFields(): readonly string[];
    };
    assert.deepEqual(
      [...spawnLib.requirableRequestFields()].sort(),
      Object.keys(request).sort(),
      "the requirable field list and the request an adapter is handed have drifted",
    );
  },
);

test(
  "the launch record echoes the requested tier and role byte for byte from the flags",
  (t) => {
    /*
     * THROUGH THE CLI, deliberately, because the two values travel from a
     * flag through the parser, through SpawnOptions, through the request and
     * into the record, and a test that handed spawnTask the values directly
     * would leave the first two of those four steps unwitnessed. The
     * measured defect shape is a flag that parses and whose value is
     * dropped: the command then exits 0 and the record is silently poorer.
     *
     * BYTE EQUALITY, not equivalence: the kernel holds no tier vocabulary
     * and no role vocabulary, so a value it normalised would be a
     * vocabulary it was not supposed to have. The value below carries mixed
     * case and a hyphen for exactly that reason.
     */
    const scratch = makeScratch(t);
    const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
    const tier = "Strongest-Available";
    const role = "clean-room-Reviewer";

    const run = spawnCli(scratch, "t-echo", stub, [
      "--tier",
      tier,
      "--role",
      role,
      "--phase",
      "M4-P3",
    ]);
    assert.equal(run.status, 0, run.stderr);
    const record = JSON.parse(
      readFileSync(join(taskDirOf(scratch, "t-echo"), "executor.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(record["requestedTier"], tier);
    assert.equal(record["requestedRole"], role);
    assert.equal(record["adapter"], "subprocess");

    /* NO RESOLVED MODEL, and no phase id either: the record is written
       before the payload starts, so a resolved model here would be a value
       nobody could have observed (M4-P7 carries that half). */
    assert.deepEqual(
      Object.keys(record).sort(),
      ["adapter", "launchedAt", "requestedRole", "requestedTier"],
      "the launch record grew a field this phase did not put in it",
    );

    /* The other direction: no flags, no echoed fields, and no key written
       with an undefined value. */
    assert.equal(spawnCli(scratch, "t-noecho", stub).status, 0);
    const bare = JSON.parse(
      readFileSync(join(taskDirOf(scratch, "t-noecho"), "executor.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal("requestedTier" in bare, false, "a tier was recorded without --tier");
    assert.equal("requestedRole" in bare, false, "a role was recorded without --role");

    /* The command ran for real, so the hook wrote the turn-end record this
       file's capture describes. */
    assertTurnEndMatchesCapture(join(taskDirOf(scratch, "t-echo"), "turn-end"), 0);
  },
);

test(
  "the launch record a real spawn wrote validates under --type executor-record, one missing adapter is refused naming the field, and --type auto cannot resolve it",
  (t) => {
    /*
     * CAPTURED FROM A REAL SPAWN, never hand-written (criterion 4). A schema
     * validated only against a fixture an author typed is a schema validated
     * against the author's belief about the writer, and the writer is
     * `subprocessAdapter`, twenty lines of another module.
     */
    const scratch = makeScratch(t);
    const stub = writeStub(scratch.tmp, "payload.sh", "#!/bin/sh\nexit 0\n");
    assert.equal(spawnCli(scratch, "t-valid", stub, ["--deadline", "300"]).status, 0);
    const recordPath = join(taskDirOf(scratch, "t-valid"), "executor.json");

    const good = runCli(["validate", "--type", "executor-record", recordPath]);
    assert.equal(good.status, 0, `${good.stdout}${good.stderr}`);

    /* The captured CLI contract, read rather than retyped. */
    const captured = readCapture(VALIDATE_CAPTURE);
    assert.match(captured, /INVALID #\/adapter required property adapter is missing/, VALIDATE_CAPTURE);

    const broken = JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>;
    delete broken["adapter"];
    const brokenPath = join(scratch.tmp, "executor-no-adapter.json");
    writeFileSync(brokenPath, `${JSON.stringify(broken, null, 2)}\n`);
    const bad = runCli(["validate", "--type", "executor-record", brokenPath]);
    assert.equal(bad.status, 1, `${bad.stdout}${bad.stderr}`);
    assert.match(
      bad.stdout,
      /^INVALID #\/adapter required property adapter is missing$/m,
      `${bad.stdout}${bad.stderr}`,
    );

    /*
     * AND THE HALF THE ROW CANNOT DO, asserted rather than left in a comment.
     * `resolveAutoType` reads `kind` off the decoded instance and looks it up
     * in the same table, so the row IS the auto resolver's registration; what
     * it cannot do is resolve a document that does not say what it is. An
     * executor record carries no `kind`, so --type auto on one is a usage
     * error. A later phase that gives the record a `kind` reddens this and
     * has to come back and read the comment beside the row.
     */
    const auto = runCli(["validate", "--type", "auto", recordPath]);
    assert.equal(auto.status, 64, `${auto.stdout}${auto.stderr}`);
    assert.match(auto.stderr, /needs a kind field naming a registered type/, auto.stderr);
  },
);

test("every spawn behavior in the registry still resolves by name to a test title", () => {
  /*
   * BY NAME, NEVER BY COUNT (criterion 8, binding convention 5). The set is
   * DERIVED from the registry at run time by prefix, and the search covers
   * EVERY test file rather than this one, because three spawn behaviors are
   * implemented in test/credentials-gate.test.ts and a check scoped to this
   * file would have reported them missing. Nothing here pins a number, so a
   * later phase appending spawn rows cannot redden it.
   */
  const testDir = dirname(fileURLToPath(import.meta.url));
  const behaviors = JSON.parse(
    readFileSync(join(testDir, "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  const sources = readdirSync(testDir)
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => readFileSync(join(testDir, name), "utf8"));
  const spawnIds = Object.keys(behaviors).filter((id) => id.startsWith("spawn-"));
  assert.ok(
    spawnIds.length > 0,
    "no spawn behavior was enumerated, so this check is vacuous",
  );
  const unresolved = spawnIds.filter(
    (id) => !sources.some((source) => source.includes(`"${behaviors[id] as string}"`)),
  );
  assert.deepEqual(unresolved, []);
});
