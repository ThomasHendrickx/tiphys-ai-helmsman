import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p4-spawn-"));
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
  assert.equal(readFileSync(cwdFile, "utf8").trim(), realpathSync(worktree));

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
  assert.equal(meta.worktree, worktree);
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
  assert.match(second.stderr, /task id already used: t-dup/);
  assert.deepEqual(snapshot(taskDirOf(scratch, "t-dup")), before);
  assert.deepEqual(readdirSync(join(scratch.fleet, "worktrees")).sort(), worktreesBefore);
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
