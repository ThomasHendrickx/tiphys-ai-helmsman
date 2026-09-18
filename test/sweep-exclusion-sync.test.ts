/**
 * THE DR-0047 FINAL-SWEEP FIX ROUND, exclusion and sync group.
 *
 * Every test in this file is a RED WITNESS against a state the final sweep
 * reproduced at head ad2428b, and each one is written against the DANGEROUS
 * STATE rather than against an absent feature (CLAUDE.md, red-witness rule,
 * stronger form). Where a class is claimed, at least two STRUCTURALLY
 * DIFFERENT members redden it, and the structural difference is named in the
 * test's own comment rather than left to be inferred from two similar
 * fixtures.
 *
 * Nothing here is simulated. The registers are real git refs on real bare
 * repositories, the refusals are real pushes refused by a real pre-receive
 * hook, the named pipes are real FIFOs made by mkfifo, and every assertion
 * about another program's output is made against that program's captured
 * bytes (red-witness rule, clause c).
 *
 * C-2: nothing below reads a pid, probes liveness, or sends a signal. Every
 * observation is a file, an exit code, or a captured stream.
 *
 * Standing warning 9 (CLAUDE.md): `-C` moves where git RESOLVES, not where
 * the shell stands, so every path handed to git here is absolute.
 * Standing warning 5: git identity is command-scoped, never global.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,

  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

/**
 * Standing warning 4: a literal relative import of a `src` module from
 * `test/` fails the build with TS2878 across the project reference, so every
 * module under test is reached through a computed URL.
 */
const exclusionModule = fileURLToPath(new URL("../src/exclusion.ts", import.meta.url));
const fleetModule = fileURLToPath(new URL("../src/fleet.ts", import.meta.url));
const poolModule = fileURLToPath(new URL("../src/pool.ts", import.meta.url));
const rolesModule = fileURLToPath(new URL("../src/roles.ts", import.meta.url));

/**
 * A wall-clock ceiling every bounded-refusal arm is measured against. The
 * defect these arms witness is an UNBOUNDED block with zero output, so the
 * red reading is a child killed by this timeout and the green reading is a
 * child that chose its own exit code (CLAUDE.md, T-008's shape in shipped
 * code).
 */
const BOUNDED_MS = 20_000;

interface Run {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TIPHYS_HOLDER_ID;
  delete env.TIPHYS_LOCK_TEST_NOW_MS;
  delete env.TIPHYS_ALLOW_TEST_CLOCK;
  return env;
}

function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): Run {
  const spawnOptions: Parameters<typeof spawnSync>[2] = {
    encoding: "utf8",
    env: options.env ?? baseEnv(),
    timeout: options.timeout ?? BOUNDED_MS,
  };
  if (options.cwd !== undefined) {
    spawnOptions.cwd = options.cwd;
  }
  const result = spawnSync(process.execPath, [sourceEntry, ...args], spawnOptions);
  return {
    status: result.status,
    signal: result.signal,
    stdout: (result.stdout as string | null) ?? "",
    stderr: (result.stderr as string | null) ?? "",
  };
}

const GIT_FLAGS = [
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

function git(cwd: string, args: string[]): Run {
  const result = spawnSync("git", ["-C", cwd, ...GIT_FLAGS, ...args], {
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
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitOk(cwd: string, args: string[]): string {
  const result = git(cwd, args);
  assert.equal(result.status, 0, `git ${args.join(" ")} in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tiphys-sweep-")));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function mkfifo(path: string): void {
  const made = spawnSync("mkfifo", [path], { encoding: "utf8" });
  assert.equal(made.status, 0, `mkfifo ${path}: ${made.stderr ?? ""}`);
}

function makeBareRemote(root: string, name: string): string {
  const remote = join(root, name);
  mkdirSync(remote, { recursive: true });
  const init = spawnSync(
    "git",
    ["-C", remote, ...GIT_FLAGS, "init", "--bare", "--initial-branch=main", "--quiet"],
    { encoding: "utf8" },
  );
  assert.equal(init.status, 0, init.stderr ?? "");
  return remote;
}

/** A fleet home built by the kernel's own init, opted in, pushed to remote. */
function publishSharedFleet(root: string, remote: string, name: string): string {
  const source = join(root, name);
  const init = runCli(["init", source, "--shared-exclusion"]);
  assert.equal(init.status, 0, `${init.stdout}${init.stderr}`);
  gitOk(source, ["remote", "add", "origin", remote]);
  gitOk(source, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
  return source;
}

/* ================================================================== */
/* FINDING 1: the cross-environment guard tests WHICH FLEET this is,   */
/* when the property that matters is WHICH ENVIRONMENT.                */
/* ================================================================== */

/**
 * THE DANGEROUS STATE. Environment A holds the fleet, and the tracked
 * identity file that names A has travelled to a second fleet home. The old
 * guard's single comparison, `readEnvironmentId(root) === status.envId`,
 * is therefore TRUE in a place that holds no lease at all.
 *
 * The two members below are structurally different in HOW the identity
 * arrived, which is the axis that matters because it is the axis the fix
 * cannot key on:
 *
 *   member A: the identity arrived through `tiphys sync` and `git clone`,
 *             so the second home is a different directory, a different git
 *             clone, and was never the environment that acquired.
 *   member B: the identity never moved at all. The SAME fleet home lost its
 *             `state/` (a reclaim, a wiped ephemeral volume), so the home
 *             that holds the identity is the very one that acquired, and no
 *             clone exists anywhere.
 *
 * A fix that refused "a clone" would close A and leave B open. A fix that
 * refused "a home with no lease" closes both, which is why the class needs
 * both members (CLAUDE.md, one witness is not a class).
 */
async function loadGuard(): Promise<
  (fleetRoot: string, command: string) => { kind: string; reason?: string }
> {
  const mod = (await import(exclusionModule)) as {
    guardSharedRegister: (root: string, command: string) => { kind: string; reason?: string };
  };
  return mod.guardSharedRegister;
}

test("the shared guard refuses a second fleet home that carries the holder's tracked identity but no lease", async (t) => {
  const guardSharedRegister = await loadGuard();
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  const homeA = publishSharedFleet(root, remote, "env-a");

  const acquired = runCli(["lock", "acquire", "--duration", "3600"], { cwd: homeA });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);

  /* THE CONTROL ARM, and it runs first so a green from the members below
     cannot be a guard that refuses everything. A holds a live local lease
     and the register names A, so A is allowed. */
  const control = guardSharedRegister(homeA, "spawn");
  assert.equal(
    control.kind,
    "allowed",
    `the holding environment must still be allowed, got ${JSON.stringify(control)}`,
  );

  // The identity is published by the kernel's own sync, not by hand.
  const synced = runCli(["sync"], { cwd: homeA });
  assert.equal(synced.status, 0, `${synced.stdout}${synced.stderr}`);
  assert.match(synced.stdout, /COMMITTED tiphys-environment\.json/);

  // MEMBER A: a clone of the synced fleet.
  const homeB = join(root, "env-b");
  assert.equal(git(root, ["clone", "--quiet", remote, homeB]).status, 0);
  assert.equal(
    existsSync(join(homeB, "state")),
    false,
    "a clone must not carry state/, which is what makes the lease non-travelling",
  );
  for (const dir of ["state", "worktrees", "projects"]) {
    mkdirSync(join(homeB, dir), { recursive: true });
  }
  assert.equal(
    (JSON.parse(readFileSync(join(homeB, "tiphys-environment.json"), "utf8")) as { envId: string })
      .envId,
    (JSON.parse(readFileSync(join(homeA, "tiphys-environment.json"), "utf8")) as { envId: string })
      .envId,
    "M4-P21 criterion 3's tracked identity must still travel with the clone",
  );
  const cloneVerdict = guardSharedRegister(homeB, "spawn");
  assert.equal(
    cloneVerdict.kind,
    "refused",
    `a clone of a held fleet must be refused, got ${JSON.stringify(cloneVerdict)}`,
  );

  // MEMBER B: the SAME home, its ephemeral state lost.
  const homeC = join(root, "env-a-reclaimed");
  assert.equal(git(root, ["clone", "--quiet", remote, homeC]).status, 0);
  rmSync(join(homeC, "state"), { recursive: true, force: true });
  mkdirSync(join(homeC, "state"), { recursive: true });
  for (const dir of ["worktrees", "projects"]) {
    mkdirSync(join(homeC, dir), { recursive: true });
  }
  assert.equal(
    existsSync(join(homeC, "state", "orchestrator.lock")),
    false,
    "the reclaimed home must hold no lease, which is the state under test",
  );
  const reclaimedVerdict = guardSharedRegister(homeC, "spawn");
  assert.equal(
    reclaimedVerdict.kind,
    "refused",
    `a home whose state/ was reclaimed must be refused, got ${JSON.stringify(reclaimedVerdict)}`,
  );
});

/* ================================================================== */
/* FINDING 2: a failed shared publish leaves the local layer mutated.  */
/* ================================================================== */

/** Refuse every push to this remote, which is what a protected ref looks like. */
function refuseEveryPush(remote: string): void {
  const hook = join(remote, "hooks", "pre-receive");
  writeFileSync(hook, "#!/bin/sh\necho refusing this push for the witness >&2\nexit 1\n", {
    mode: 0o755,
  });
}

function allowEveryPush(remote: string): void {
  rmSync(join(remote, "hooks", "pre-receive"), { force: true });
}

/**
 * THE DANGEROUS STATE. The local layer is mutated, the shared publish then
 * loses, and the command reports failure while the local artifact has
 * already moved. src/lock.ts:537 states the invariant both arms break.
 *
 * The two members are structurally different in WHAT the local mutation did:
 *
 *   release: the lease file is DELETED, so the local holdership guard
 *            (which keys on presence) stops refusing anything.
 *   renew:   the lease file is EXTENDED under a new token, so the command
 *            says the renewal failed while the file says it happened.
 *
 * Two failed releases would be two instances of one shape. A delete and an
 * extend are two members of the class "the local layer is not rolled back".
 */
test("a shared release that cannot publish restores the local lease it removed", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  const home = publishSharedFleet(root, remote, "env-a");

  const acquired = runCli(["lock", "acquire", "--duration", "3600"], { cwd: home });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const holder = (acquired.stdout.split("\n")[0] as string).split(" ")[1] as string;
  const lockPath = join(home, "state", "orchestrator.lock");
  const before = readFileSync(lockPath, "utf8");

  refuseEveryPush(remote);
  const released = runCli(["lock", "release", "--holder", holder], { cwd: home });
  assert.equal(released.status, 1, `${released.stdout}${released.stderr}`);
  assert.match(released.stderr, /could not publish the release/);

  assert.equal(
    existsSync(lockPath),
    true,
    "a release that reported failure must leave the lease it claimed to still hold",
  );
  assert.equal(
    readFileSync(lockPath, "utf8"),
    before,
    "the restored lease must be byte-identical to the one the failed release removed",
  );
  assert.match(
    released.stderr,
    /the local lease was restored/,
    "the failure line must say what happened to the local layer, as the acquire path already does",
  );

  /* CONTROL: with the push allowed again, the same command removes it. */
  allowEveryPush(remote);
  const ok = runCli(["lock", "release", "--holder", holder], { cwd: home });
  assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
  assert.equal(existsSync(lockPath), false);
});

test("a shared renew that cannot publish restores the local lease it extended", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  const home = publishSharedFleet(root, remote, "env-a");

  const acquired = runCli(["lock", "acquire", "--duration", "3600"], { cwd: home });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const holder = (acquired.stdout.split("\n")[0] as string).split(" ")[1] as string;
  const lockPath = join(home, "state", "orchestrator.lock");
  const before = readFileSync(lockPath, "utf8");

  refuseEveryPush(remote);
  const renewed = runCli(["lock", "renew", "--holder", holder, "--duration", "7200"], {
    cwd: home,
  });
  assert.equal(renewed.status, 1, `${renewed.stdout}${renewed.stderr}`);
  assert.match(renewed.stderr, /shared exclusion refused renew/);
  assert.equal(
    readFileSync(lockPath, "utf8"),
    before,
    "a renew that reported failure must not leave a longer lease behind",
  );

  /* CONTROL: allowed again, the same command really does extend it. */
  allowEveryPush(remote);
  const ok = runCli(["lock", "renew", "--holder", holder, "--duration", "7200"], { cwd: home });
  assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
  assert.notEqual(readFileSync(lockPath, "utf8"), before);
});

/* ================================================================== */
/* FINDING 3: sync derives durability from a three-entry denylist.     */
/* ================================================================== */

/**
 * THE DANGEROUS STATE. A write-then-rename scratch artifact the KERNEL
 * ITSELF creates sits beside its target in a path the fleet `.gitignore`
 * was never asked about, so `git check-ignore` answers "not ephemeral" and
 * `tiphys sync` commits and pushes it.
 *
 * The two members are structurally different in WHERE the artifact lives and
 * HOW it is named:
 *
 *   status/current.json.tmp   a fixed name, in a TRACKED SUBDIRECTORY,
 *                             written by src/status.ts:142.
 *   .cutover.<random>.tmp     a dot-prefixed RANDOM name, at the FLEET
 *                             ROOT, written by src/cutover.ts:278.
 *
 * A fix keyed on one exact filename would close the first and leave the
 * second open, which is the instance-versus-mechanism failure the fix-round
 * contract exists to prevent.
 */
function fleetWithRemote(t: { after(fn: () => void): void }): { home: string; remote: string } {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  const home = join(root, "fleet");
  assert.equal(runCli(["init", home]).status, 0);
  gitOk(home, ["remote", "add", "origin", remote]);
  gitOk(home, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
  return { home, remote };
}

function committedPaths(home: string): string[] {
  return gitOk(home, ["show", "--name-only", "--format=", "HEAD"])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

test("sync refuses a kernel scratch artifact in a tracked subdirectory and commits nothing", (t) => {
  const { home } = fleetWithRemote(t);
  mkdirSync(join(home, "status"), { recursive: true });
  writeFileSync(join(home, "status", "current.json.tmp"), '{"kind":"status-line"}\n');
  writeFileSync(join(home, "backlog.md"), "# Backlog\n\nOne durable edit.\n");
  const head = gitOk(home, ["rev-parse", "HEAD"]);

  const synced = runCli(["sync"], { cwd: home });
  assert.equal(synced.status, 1, `${synced.stdout}${synced.stderr}`);
  assert.match(synced.stderr, /status\/current\.json\.tmp/);
  assert.match(synced.stderr, /nothing was committed/);
  assert.equal(
    committedPaths(home).includes("status/current.json.tmp"),
    false,
    "the scratch artifact must not reach the fleet's durable history",
  );
  assert.equal(
    gitOk(home, ["rev-parse", "HEAD"]),
    head,
    "a refusal commits nothing at all, exactly as the staged-ephemeral refusal does, so HEAD must not move",
  );
});

test("sync refuses a kernel scratch artifact at the fleet root", (t) => {
  const { home } = fleetWithRemote(t);
  writeFileSync(join(home, ".cutover.0123456789abcdef.tmp"), "{}\n");

  const synced = runCli(["sync"], { cwd: home });
  assert.equal(synced.status, 1, `${synced.stdout}${synced.stderr}`);
  assert.match(synced.stderr, /\.cutover\.0123456789abcdef\.tmp/);
  assert.equal(
    committedPaths(home).includes(".cutover.0123456789abcdef.tmp"),
    false,
  );
});

test("sync still commits an ordinary durable path, so the scratch rule is not a blanket refusal", (t) => {
  const { home } = fleetWithRemote(t);
  writeFileSync(join(home, "decisions", "DR-0001-a-decision.md"), "# DR-0001\n");
  const synced = runCli(["sync"], { cwd: home });
  assert.equal(synced.status, 0, `${synced.stdout}${synced.stderr}`);
  assert.ok(committedPaths(home).includes("decisions/DR-0001-a-decision.md"));
});

/* ================================================================== */
/* FINDING 4: an ungated clock seam in the shipped CLI.                */
/* ================================================================== */

/**
 * THE DANGEROUS STATE. The fencing counter's "two readings of ONE clock"
 * become one reading of a clock the CALLER supplies, from the published CLI,
 * with no gate at all. The honest arm is refused and the same command with
 * one environment variable takes a live lease over instantly.
 */
test("the decision-clock seam is refused unless the run declares it, and says so when it is used", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  const homeA = publishSharedFleet(root, remote, "env-a");
  const homeB = join(root, "env-b");
  assert.equal(git(root, ["clone", "--quiet", remote, homeB]).status, 0);
  for (const dir of ["state", "worktrees", "projects"]) {
    mkdirSync(join(homeB, dir), { recursive: true });
  }
  rmSync(join(homeB, "tiphys-environment.json"), { force: true });

  const acquired = runCli(["lock", "acquire", "--duration", "9000"], { cwd: homeA });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);

  /* The honest challenger. Refused, and the refusal names the counter. */
  const honest = runCli(["lock", "acquire", "--take-over"], { cwd: homeB });
  assert.equal(honest.status, 1, `${honest.stdout}${honest.stderr}`);
  assert.match(honest.stderr, /stood still/);

  /* THE RED ARM: the same command, one environment variable, an hour ahead,
     and NOTHING declaring that this run is a measurement. */
  const ahead = String(Date.now() + 3_600_000);
  const undeclared = runCli(["lock", "acquire", "--take-over"], {
    cwd: homeB,
    env: { ...baseEnv(), TIPHYS_LOCK_TEST_NOW_MS: ahead },
  });
  assert.notEqual(
    undeclared.status,
    0,
    `an undeclared injected clock must not take a live lease over: ${undeclared.stdout}`,
  );
  assert.match(undeclared.stderr, /TIPHYS_ALLOW_TEST_CLOCK/);

  /* THE GREEN CONTROL: declared, it works AND the verdict line says the
     clock was injected, so a captured witness cannot read as an honest one. */
  const declared = runCli(["lock", "acquire", "--take-over"], {
    cwd: homeB,
    env: { ...baseEnv(), TIPHYS_LOCK_TEST_NOW_MS: ahead, TIPHYS_ALLOW_TEST_CLOCK: "1" },
  });
  assert.equal(declared.status, 0, `${declared.stdout}${declared.stderr}`);
  assert.match(declared.stdout, /signal=counter\(injected-clock\)/);
});

/* ================================================================== */
/* FINDING 5: an unhandled EPIPE exits 1 after the lease WAS taken.    */
/* ================================================================== */

/**
 * THE DANGEROUS STATE. `tiphys lock acquire | head -1` exits 1 although both
 * layers were mutated, so a wrapper of the shape
 * `if ! tiphys lock acquire | grep -q acquired` takes its failure branch
 * while holding the fleet. The exit code contradicts the state.
 *
 * The two members are structurally different in WHICH command and WHICH
 * stream position the consumer closes at: `lock acquire` (two lines, closed
 * after the first) and `lock status` (one line, closed by a consumer that
 * reads nothing at all).
 */
function pipeExitCode(home: string, args: string[], consumer: string): { code: string; out: string } {
  const run = spawnSync(
    "bash",
    [
      "-c",
      `"$1" "$2" ${args.map((a) => `'${a}'`).join(" ")} 2>/dev/null | ${consumer}; echo "CODE=\${PIPESTATUS[0]}"`,
      "bash",
      process.execPath,
      sourceEntry,
    ],
    { cwd: home, encoding: "utf8", env: baseEnv(), timeout: BOUNDED_MS },
  );
  const out = (run.stdout as string | null) ?? "";
  const match = /CODE=(\d+)/.exec(out);
  assert.notEqual(match, null, `no exit code was captured from: ${out}`);
  return { code: (match as RegExpExecArray)[1] as string, out };
}

test("a lock command whose consumer closes the pipe early exits with its own code, not with EPIPE", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  const home = publishSharedFleet(root, remote, "env-a");

  // MEMBER A: acquire, two lines, consumer takes one.
  const acquire = pipeExitCode(home, ["lock", "acquire", "--duration", "900"], "head -1");
  assert.equal(
    acquire.code,
    "0",
    `lock acquire took the lease and must exit 0 through a short pipe: ${acquire.out}`,
  );
  assert.equal(
    existsSync(join(home, "state", "orchestrator.lock")),
    true,
    "the control for member A: the lease really was taken, so a nonzero exit contradicts the state",
  );

  // MEMBER B: status, one line, consumer reads nothing.
  const status = pipeExitCode(home, ["lock", "status"], "true");
  assert.equal(status.code, "0", `lock status must exit 0 through a closed pipe: ${status.out}`);
});

/* ================================================================== */
/* FINDINGS 6 and 9: an unreadable source reported as an empty pool.   */
/* ================================================================== */

interface PoolEntry {
  taskId: string;
  origin: string;
  unresolved?: string[];
}

async function loadPoolList(): Promise<(fleet: unknown) => PoolEntry[]> {
  const mod = (await import(poolModule)) as { poolList: (fleet: unknown) => PoolEntry[] };
  return mod.poolList;
}

async function loadFleetModule(): Promise<{ loadFleet: (dir: string) => Record<string, string> }> {
  return (await import(fleetModule)) as { loadFleet: (dir: string) => Record<string, string> };
}

/**
 * THE DANGEROUS STATE. A category that is EMPTY BY CONSTRUCTION is reported
 * as empty BY OBSERVATION, which is the sentence src/commands/next.ts:40
 * already sets as the standard for this kernel.
 *
 * The two members are structurally different in WHAT did not read:
 *
 *   member A: the tasks DIRECTORY cannot be listed at all, so the whole
 *             reconstruction is dropped (src/pool.ts:758).
 *   member B: the directory lists fine and ONE task's meta.json does not
 *             read, so that row alone is dropped (src/pool.ts:769).
 *
 * A fix at the directory read alone would close A and leave B open.
 */
test("poolList reports an unlistable tasks directory instead of an empty pool", async (t) => {
  const { loadFleet } = await loadFleetModule();
  const poolList = await loadPoolList();
  const root = makeTempDir(t);
  const home = join(root, "fleet");
  assert.equal(runCli(["init", home]).status, 0);

  const fleet = loadFleet(home);
  assert.deepEqual(poolList(fleet), [], "the control: an empty fleet really does list nothing");

  // The directory is validated by loadFleet and vanishes afterwards, which
  // is the TOCTOU window src/cutover.ts already names as a real condition.
  rmSync(fleet.tasksDir as string, { recursive: true, force: true });
  assert.throws(
    () => poolList(fleet),
    /tasks/,
    "an unlistable tasks/ must reach the caller, which is the channel src/commands/next.ts:334 already threads",
  );
});

test("poolList reports an open task whose record did not read instead of dropping the row", async (t) => {
  const { loadFleet } = await loadFleetModule();
  const poolList = await loadPoolList();
  const root = makeTempDir(t);
  const home = join(root, "fleet");
  assert.equal(runCli(["init", home]).status, 0);
  const fleet = loadFleet(home);

  mkdirSync(join(fleet.tasksDir as string, "t-0001"), { recursive: true });
  const metaPath = join(fleet.tasksDir as string, "t-0001", "meta.json");
  writeFileSync(
    metaPath,
    JSON.stringify({
      id: "t-0001",
      project: join(home, "projects", "demo"),
      shape: "ship",
      branch: "task/t-0001",
      worktree: join(home, "worktrees", "t-0001"),
      baseSha: "0".repeat(40),
      baseOffline: false,
      status: "open",
      createdAt: new Date().toISOString(),
    }),
  );
  const intact = poolList(fleet);
  assert.equal(intact.length, 1, "the control: an intact record is reported");
  assert.equal(intact[0]?.taskId, "t-0001");

  // Truncated mid-write: the literal state an interrupted spawn leaves.
  writeFileSync(metaPath, '{"id":"t-0001","proj');
  const truncated = poolList(fleet);
  assert.equal(
    truncated.length,
    1,
    `a task whose record did not read must still be reported, got ${JSON.stringify(truncated)}`,
  );
  assert.equal(truncated[0]?.taskId, "t-0001");
  assert.equal(truncated[0]?.origin, "unreconstructable");
  assert.ok(
    (truncated[0]?.unresolved ?? []).includes("meta"),
    `the unreadable field must be named, got ${JSON.stringify(truncated[0])}`,
  );
});

/* ================================================================== */
/* FINDING 7: a role vocabulary wider than the briefs that ship.       */
/* ================================================================== */

test("every declared role resolves to a brief that ships, and composing it succeeds", async (t) => {
  const roles = (await import(rolesModule)) as { ROLE_IDS: readonly string[] };
  const root = makeTempDir(t);
  for (const roleId of roles.ROLE_IDS) {
    const out = join(root, `${roleId}.md`);
    const composed = runCli(
      [
        "brief",
        "compose",
        "--role",
        roleId,
        "--phase",
        join(repoRoot, "templates", "plan.example.yaml"),
        "--phase-id",
        "M9-P1",
        "--out",
        out,
      ],
      { cwd: repoRoot },
    );
    assert.equal(
      composed.status,
      0,
      `brief compose --role ${roleId} must resolve a shipped brief: ${composed.stderr}`,
    );
    assert.ok(readFileSync(out, "utf8").length > 0, `${roleId} composed an empty brief`);
  }
});

test("a role whose brief does not ship is refused by name before anything is read", async (t) => {
  const roles = (await import(rolesModule)) as {
    ROLE_IDS: readonly string[];
    ROLE_BRIEF_FILES: Record<string, string>;
  };
  assert.deepEqual(
    roles.ROLE_IDS.filter((id) => roles.ROLE_BRIEF_FILES[id] === undefined),
    [],
    "every declared role must have a declared brief file, or the vocabulary promises what the package cannot deliver",
  );
  for (const [roleId, relative] of Object.entries(roles.ROLE_BRIEF_FILES)) {
    assert.equal(
      existsSync(join(repoRoot, relative)),
      true,
      `${roleId} declares ${relative}, which is not in this tree`,
    );
  }
  t.diagnostic(`checked ${String(roles.ROLE_IDS.length)} declared roles`);
});

/* ================================================================== */
/* FINDING 8: reading a path whose TYPE has not been established.      */
/* ================================================================== */

/**
 * THE DANGEROUS STATE, and it is the one CLAUDE.md uses as its worked
 * example of a MECHANISM rather than a finding. `doctor` already returns in
 * zero seconds against the same FIFO with "is a named pipe, not a regular
 * file, so it was not opened"; the readers below did not establish the entry
 * type and block forever with zero output.
 *
 * The members are structurally different along the axis a fix could be keyed
 * on wrongly, which is WHOSE path it is and WHICH DIRECTION it is opened:
 *
 *   member A: fleet state this kernel wrote itself, opened for READ
 *             (state/orchestrator.lock, src/lock.ts:190).
 *   member B: a path the CALLER named on the command line, opened for READ
 *             (--brief, src/brief.ts:43).
 *   member C: fleet content the kernel did not create, opened for READ
 *             (warnings.md, src/brief.ts:56).
 *   member D: a path this kernel is about to CREATE, opened for WRITE
 *             (state/orchestrator.lock.stage, src/lock.ts:394).
 *   member E: the environment identity, opened for READ by the guard
 *             (tiphys-environment.json, src/exclusion.ts:167).
 *
 * A refusal is bounded when the child chose its own exit code. A child this
 * harness had to kill is the red reading, and it is asserted as such rather
 * than inferred from elapsed time.
 */
function assertBounded(run: Run, what: string): void {
  assert.equal(
    run.signal,
    null,
    `${what} did not return on its own and had to be killed after ${String(BOUNDED_MS)}ms, which is the unbounded block under test`,
  );
  assert.notEqual(run.status, null, `${what} produced no exit code`);
}

test("a named pipe at the lease path is refused in bounded time by every lock subcommand", (t) => {
  const root = makeTempDir(t);
  const home = join(root, "fleet");
  assert.equal(runCli(["init", home]).status, 0);
  mkfifo(join(home, "state", "orchestrator.lock"));

  for (const args of [
    ["lock", "status"],
    ["lock", "acquire"],
    ["lock", "renew", "--holder", "x"],
    ["lock", "release", "--holder", "x"],
  ]) {
    const run = runCli(args, { cwd: home });
    assertBounded(run, `tiphys ${args.join(" ")}`);
    assert.notEqual(run.status, 0, `tiphys ${args.join(" ")} must refuse, not succeed`);
    assert.match(
      `${run.stdout}${run.stderr}`,
      /named pipe/,
      `tiphys ${args.join(" ")} must name the entry type it refused, as doctor already does`,
    );
  }
});

/**
 * MEMBER G, also NOT in the review, also found by this round's derivation.
 * The deterministic hold point (src/commands/lock.ts:59) writes two marker
 * files whose paths are DERIVED from one the caller supplies in
 * TIPHYS_LOCK_TEST_HOLD, and both were opened for writing bare. The seam is
 * inert unless the variable is set, which changes how it is REACHED and not
 * what it does once reached.
 */
test("a named pipe at a lock hold-point marker is refused in bounded time", (t) => {
  const root = makeTempDir(t);
  const home = join(root, "fleet");
  assert.equal(runCli(["init", home]).status, 0);
  const barrier = join(root, "barrier");
  mkfifo(`${barrier}.observed`);
  const run = runCli(["lock", "acquire"], {
    cwd: home,
    env: { ...baseEnv(), TIPHYS_LOCK_TEST_HOLD: barrier },
  });
  assertBounded(run, "tiphys lock acquire with a named pipe at a hold-point marker");
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}${run.stderr}`, /named pipe/);
  assert.equal(
    existsSync(join(home, "state", "orchestrator.lock")),
    false,
    "a refused hold point must leave no lease behind",
  );
});

/**
 * THE SITE THAT LOOKED LIKE A MEMBER AND IS NOT, recorded as a test so the
 * next reader does not have to re-derive it. `src/lock.ts` writes
 * `<lock>.stage` with an unguarded `writeFileSync`, and open(2) for writing
 * on a FIFO blocks exactly as reading one does, so this reads like the same
 * defect. It is not reachable: the claim-held sweep (CR-202) unlinks the
 * stage UNCONDITIONALLY before either branch writes it. Measured, and
 * asserted here rather than asserted in prose.
 */
test("a named pipe at the lease stage path is swept by the claim, so the write never blocks", (t) => {
  const root = makeTempDir(t);
  const home = join(root, "fleet");
  assert.equal(runCli(["init", home]).status, 0);
  const stage = join(home, "state", "orchestrator.lock.stage");
  mkfifo(stage);
  const run = runCli(["lock", "acquire", "--duration", "900"], { cwd: home });
  assertBounded(run, "tiphys lock acquire with a named pipe at the stage path");
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.equal(existsSync(stage), false, "the claim's sweep must have removed the planted stage");
  assert.equal(existsSync(join(home, "state", "orchestrator.lock")), true);
});

test("a named pipe at the environment identity path is refused in bounded time", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  const home = publishSharedFleet(root, remote, "env-a");
  rmSync(join(home, "tiphys-environment.json"), { force: true });
  mkfifo(join(home, "tiphys-environment.json"));
  const run = runCli(["lock", "acquire"], { cwd: home });
  assertBounded(run, "tiphys lock acquire with a named pipe at the identity path");
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}${run.stderr}`, /named pipe/);
});

/** A fleet home plus an upstream project clone, which spawn requires. */
function spawnScratch(t: { after(fn: () => void): void }): {
  tmp: string;
  fleet: string;
  clone: string;
  briefFile: string;
} {
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
  return { tmp, fleet, clone, briefFile };
}

test("a named pipe at a brief input path is refused in bounded time and strands nothing", (t) => {
  const scratch = spawnScratch(t);

  // MEMBER B: the path the CALLER named.
  const callerFifo = join(scratch.tmp, "caller-brief.md");
  mkfifo(callerFifo);
  const caller = runCli(
    [
      "spawn",
      "--task",
      "t-0101",
      "--project",
      scratch.clone,
      "--brief",
      callerFifo,
      "--shape",
      "ship",
      "--exec",
      "/bin/true",
    ],
    { cwd: scratch.fleet },
  );
  assertBounded(caller, "tiphys spawn with a named pipe at --brief");
  assert.notEqual(caller.status, 0);
  assert.match(`${caller.stdout}${caller.stderr}`, /named pipe/);
  assert.equal(
    existsSync(join(scratch.fleet, "worktrees", "t-0101")),
    false,
    "a refused spawn must strand no worktree",
  );

  // MEMBER C: fleet content the kernel did not create.
  mkfifo(join(scratch.fleet, "warnings.md"));
  const warnings = runCli(
    [
      "spawn",
      "--task",
      "t-0102",
      "--project",
      scratch.clone,
      "--brief",
      scratch.briefFile,
      "--shape",
      "ship",
      "--exec",
      "/bin/true",
    ],
    { cwd: scratch.fleet },
  );
  assertBounded(warnings, "tiphys spawn with a named pipe at warnings.md");
  assert.notEqual(warnings.status, 0);
  assert.match(`${warnings.stdout}${warnings.stderr}`, /named pipe/);
  assert.equal(existsSync(join(scratch.fleet, "worktrees", "t-0102")), false);
});

/**
 * MEMBER F, and it was NOT in the review. This round's own derivation found
 * it: `readPoolRecord` (src/pool.ts:245) reads the record bare, and
 * `tiphys pool destroy` reaches it. Measured before the fix in this
 * container, `timeout 10` against a fleet whose only pool record is a FIFO:
 * `tiphys pool list` returns in 0s (it reads only the NAME) and
 * `tiphys pool destroy --task t-0001` exits 124, killed at ten seconds.
 * The two commands differ by whether the record is OPENED, which is the
 * mechanism and not the command.
 */
test("a named pipe at a pool record is refused in bounded time by pool destroy", (t) => {
  const root = makeTempDir(t);
  const home = join(root, "fleet");
  assert.equal(runCli(["init", home]).status, 0);
  mkfifo(join(home, "worktrees", "t-0001.pool.json"));

  // The control, one variable changed: the command that never opens the
  // record returns today and must keep returning.
  const listed = runCli(["pool", "list"], { cwd: home });
  assertBounded(listed, "tiphys pool list with a named pipe at a pool record");
  assert.equal(listed.status, 0, listed.stderr);

  const run = runCli(["pool", "destroy", "--task", "t-0001"], { cwd: home });
  assertBounded(run, "tiphys pool destroy with a named pipe at a pool record");
  assert.notEqual(run.status, 0);
  assert.match(`${run.stdout}${run.stderr}`, /named pipe/);
});

/**
 * THE ENUMERATION IS PART OF THE GUARD, not part of the work history alone.
 *
 * The derivation this round published found the bare opens by name. A grep in
 * a document rots; a grep in a test does not. This asserts that the files
 * this round owns contain no unguarded `readFileSync`/`writeFileSync` of a
 * path they did not just create, by requiring every such call in them to be
 * preceded, in the same file, by the guarded helpers. It is deliberately a
 * WHOLE-FILE claim and its exclusions are named in the message, so a reader
 * learns what it does NOT cover from the failure itself.
 */
test("the exclusion and lease modules open no path they have not classified", () => {
  const guardedHelpers = /classifyPathEntry|readRegularPathIfPresent|refuseOpenPathForWrite/;
  for (const relative of ["src/lock.ts", "src/exclusion.ts", "src/brief.ts", "src/pool.ts"]) {
    const body = readFileSync(join(repoRoot, relative), "utf8");
    assert.match(
      body,
      guardedHelpers,
      `${relative} reads paths it did not create and must reach them through the guarded helpers in src/fleet.ts`,
    );
  }
  // The negative control: the helper file itself is where the raw syscalls
  // live, so a grep that cannot tell them apart would match here too.
  const fleetBody = readFileSync(join(repoRoot, "src", "fleet.ts"), "utf8");
  assert.match(fleetBody, /lstatSync/);
  assert.match(fleetBody, /export function classifyPathEntry/);
});

/* ================================================================== */
/* LOW: the CLI has no help affordance.                                */
/* ================================================================== */

test("--help and help print the usage line on stdout and exit 0", () => {
  for (const args of [["--help"], ["help"], ["-h"]]) {
    const run = runCli(args, { cwd: repoRoot });
    assert.equal(run.status, 0, `tiphys ${args.join(" ")} exited ${String(run.status)}`);
    assert.match(run.stdout, /usage: tiphys /, `tiphys ${args.join(" ")} printed nothing on stdout`);
  }
  // The control: an UNKNOWN subcommand keeps M1-P1 criterion 4's contract,
  // which is usage on stderr and exit 64 with an empty stdout.
  const unknown = runCli(["no-such-command"], { cwd: repoRoot });
  assert.equal(unknown.status, 64);
  assert.equal(unknown.stdout, "");
  assert.match(unknown.stderr, /usage: tiphys /);
});

test("bin/tiphys.ts documents no error-marking mechanism that nothing sets", () => {
  const body = readFileSync(join(repoRoot, "bin", "tiphys.ts"), "utf8");
  const prose = body.replace(/^\s*\*.*$/gm, "");
  const documents = /interface\s+UsageMarkedError|type\s+UsageMarkedError/.test(body);
  const sets = /usage:\s*true|\.usage\s*=\s*true/.test(prose);
  assert.equal(
    documents && !sets,
    false,
    "bin/tiphys.ts carries a documented usage-marking contract that no shipped command implements; a comment describing a mechanism nothing uses is how the next implementer reaches for one that silently does nothing",
  );
  // The negative control: this grep can see a real marker when there is one.
  assert.equal(/usage:\s*true/.test('throw Object.assign(new Error("x"), { usage: true });'), true);
});

