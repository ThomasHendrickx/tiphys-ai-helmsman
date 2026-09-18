import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M4-P21: THE SHARED EXCLUSION REGISTER (kernel plan M4,
 * delivery/plan/kernel-plan-m4.md:2982).
 *
 * Every test below drives REAL fleet homes built by the kernel's own `init`,
 * published to a real bare repository, and cloned. Nothing is simulated: the
 * register is a git ref on that remote, the compare-and-swap is
 * `git push --force-with-lease=<ref>:<exact sha>`, and the verdicts asserted
 * here are git's.
 *
 * TWO CLOCKS ARE INJECTED AND NO SYSTEM CLOCK IS TOUCHED. The skew arrives
 * through TIPHYS_LOCK_TEST_NOW_MS, which src/commands/lock.ts feeds into the
 * `nowMs` option `acquireLease` already takes, which is the seam the plan
 * names (src/lock.ts:568). A test that changed a machine's clock would be
 * measuring the container instead of the code (hazard H-K).
 *
 * C-2 (binding): nothing here reads a run identifier of a running program,
 * probes liveness or sends a signal. Every observation is a file, a git exit
 * code, a git ref value, or a line the CLI printed.
 *
 * Standing warning 9 (CLAUDE.md): `-C` changes where git RESOLVES, not where
 * the shell stands, so every filesystem path handed to git here is absolute.
 * Standing warning 5: git identity is command-scoped, never global.
 */

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));
const exclusionSource = fileURLToPath(new URL("../src/exclusion.ts", import.meta.url));
const initSource = fileURLToPath(new URL("../src/commands/init.ts", import.meta.url));

/**
 * The register contract captured from REAL git, committed at
 * `witness/captures/m4-p21-shared-register-git-contract.txt`. The tests
 * below assert a live scratch repository reproduces it rather than trusting
 * a hand-written expectation, which is what red-witness rule (c) and T-003
 * require of a behaviour that consumes another program's output.
 */
const capturePath = fileURLToPath(
  new URL("../witness/captures/m4-p21-shared-register-git-contract.txt", import.meta.url),
);

const REGISTER_REF = "refs/heads/tiphys/lease";
const MINUTE_MS = 60_000;

interface Ctx {
  after(fn: () => void): void;
}

function makeTempDir(t: Ctx): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-xlock-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], options: { cwd?: string; nowMs?: number } = {}): RunResult {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.nowMs !== undefined) {
    env.TIPHYS_LOCK_TEST_NOW_MS = String(options.nowMs);
    /* THE SEAM IS GATED SINCE THE DR-0047 SWEEP (src/commands/lock.ts:120).
       A shipped CLI that decides cross-environment exclusion against a clock
       its caller supplies, while printing the verdict an honest run prints,
       was reproduced taking a live lease over instantly. Declaring the
       allowance here is what makes THIS run a measurement, and the verdict
       lines these tests read now carry `(injected-clock)` so a capture of one
       can never be quoted as a capture of the other. */
    env.TIPHYS_ALLOW_TEST_CLOCK = "1";
  }
  const spawnOptions: Parameters<typeof spawnSync>[2] = { encoding: "utf8", env };
  if (options.cwd !== undefined) {
    spawnOptions.cwd = options.cwd;
  }
  const result = spawnSync(process.execPath, [sourceEntry, ...args], spawnOptions);
  return {
    status: result.status,
    stdout: (result.stdout as string | null) ?? "",
    stderr: (result.stderr as string | null) ?? "",
  };
}

/**
 * Command-scoped git settings, copied from test/cross-environment.test.ts so
 * both files measure the same configuration. `push.negotiate` is forced off
 * because this container's global config sets it true, which makes git
 * 2.43.0 print a negotiation failure as the FIRST stderr line of every
 * file-transport push, accepted and refused alike; the committed capture
 * shows exactly that, and it is why the shipped module selects git's own
 * `! [rejected]` marker rather than the first line.
 */
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

function git(cwd: string, args: string[], input?: string): RunResult {
  const result = spawnSync("git", ["-C", cwd, ...GIT_FLAGS, ...args], {
    encoding: "utf8",
    input,
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
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitOk(cwd: string, args: string[], input?: string): string {
  const result = git(cwd, args, input);
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} in ${cwd} exited ${String(result.status)}: ${result.stderr}`,
  );
  return result.stdout.trim();
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

/** The register's current value, or "" when the ref is absent. */
function registerSha(remote: string): string {
  const result = git(remote, ["rev-parse", "--verify", "--quiet", `${REGISTER_REF}^{commit}`]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function registerDocument(remote: string): Record<string, unknown> {
  const sha = registerSha(remote);
  assert.notEqual(sha, "", `${REGISTER_REF} must exist on ${remote}`);
  return JSON.parse(gitOk(remote, ["cat-file", "-p", `${sha}:lease.json`])) as Record<string, unknown>;
}

/**
 * Build a real fleet home with the kernel's own `init` and publish it. The
 * declaration is the kernel's too when `shared` is set, so the opt-in field
 * under test is the one `tiphys init --shared-exclusion` writes.
 */
function publishFleet(root: string, remote: string, shared: boolean): string {
  const source = join(root, "fleet-source");
  const init = runCli(shared ? ["init", source, "--shared-exclusion"] : ["init", source]);
  assert.equal(init.status, 0, init.stderr);
  gitOk(source, ["remote", "add", "origin", remote]);
  gitOk(source, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
  return source;
}

/**
 * Clone the fleet and rebuild the three gitignored directories a clone does
 * not carry, asserting first that `state/` really was absent. The absence is
 * the evidence that the local lease cannot travel, which is the whole reason
 * this second layer exists.
 */
function cloneFleetHome(root: string, remote: string, name: string): string {
  const target = join(root, name);
  const result = spawnSync(
    "git",
    ["-C", root, ...GIT_FLAGS, "clone", "--quiet", remote, target],
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

function lockPathFor(home: string): string {
  return join(home, "state", "orchestrator.lock");
}

function envIdOf(home: string): string {
  const raw = JSON.parse(readFileSync(join(home, "tiphys-environment.json"), "utf8")) as {
    envId?: unknown;
  };
  assert.equal(typeof raw.envId, "string");
  return raw.envId as string;
}

/** One stderr line, asserted as one line rather than assumed to be one. */
function soleLine(stderr: string): string {
  const lines = stderr.trim().split("\n").filter((line) => line.trim() !== "");
  assert.equal(lines.length, 1, `expected exactly one stderr line, got:\n${stderr}`);
  return lines[0] as string;
}

/* ================================================================== */
/* Criterion 1: declaration, not inference.                            */
/* ================================================================== */

test("a fleet home without the shared exclusion field runs the existing lock behaviors unchanged against an unreachable remote", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, false);
  const home = cloneFleetHome(root, remote, "env-a");

  /* THE ANTI-VACUITY OF THIS TEST IS THE BROKEN REMOTE. `origin` is pointed
     at a path that is not a repository, so if the new code path were entered
     at all the acquire below would fail closed (criterion 7). It exits 0, so
     the path was not entered. */
  gitOk(home, ["remote", "set-url", "origin", join(root, "not-a-repository.git")]);

  const acquired = runCli(["lock", "acquire", "--duration", "300"], { cwd: home });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const holder = (acquired.stdout.split("\n")[0] as string).split(" ")[1] as string;
  assert.equal(acquired.stdout.includes("shared exclusion"), false, acquired.stdout);
  assert.equal(existsSync(lockPathFor(home)), true);

  const second = runCli(["lock", "acquire"], { cwd: home });
  assert.equal(second.status, 1);
  assert.match(second.stderr, /lock held by /);

  const renewed = runCli(["lock", "renew", "--holder", holder], { cwd: home });
  assert.equal(renewed.status, 0, `${renewed.stdout}${renewed.stderr}`);

  const status = runCli(["lock", "status"], { cwd: home });
  assert.equal(status.status, 0);
  assert.match(status.stdout, /^held holder /);

  const released = runCli(["lock", "release", "--holder", holder], { cwd: home });
  assert.equal(released.status, 0, `${released.stdout}${released.stderr}`);
  assert.equal(existsSync(lockPathFor(home)), false);

  // Nothing was written anywhere near the register, and no identity file was
  // created: the layer really was never entered.
  assert.equal(registerSha(remote), "");
  assert.equal(existsSync(join(home, "tiphys-environment.json")), false);
  assert.equal(existsSync(join(home, "state", "shared-lease.observed.json")), false);
});

/* ================================================================== */
/* Criterion 2: one holder across two environments.                    */
/* ================================================================== */

test("the shared register refuses a second environment with one line naming the holder and leaves the register sha unchanged", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, true);
  const homeA = cloneFleetHome(root, remote, "env-a");
  const homeB = cloneFleetHome(root, remote, "env-b");

  const acquired = runCli(["lock", "acquire", "--duration", "300"], { cwd: homeA });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const envA = envIdOf(homeA);
  const shaAfterA = registerSha(remote);
  assert.notEqual(shaAfterA, "", "A's acquire must publish the register");

  const document = registerDocument(remote);
  assert.equal(document["state"], "held");
  assert.equal(document["envId"], envA);
  assert.equal(document["counter"], 1);
  assert.equal(document["ref"], REGISTER_REF);

  const before = registerSha(remote);
  const refused = runCli(["lock", "acquire"], { cwd: homeB });
  const after = registerSha(remote);

  assert.equal(refused.status, 1, refused.stdout);
  const line = soleLine(refused.stderr);
  assert.ok(line.includes(envA), `the refusal must name A's environment id: ${line}`);
  assert.ok(
    line.includes(document["expiresAt"] as string),
    `the refusal must name the expiry: ${line}`,
  );
  assert.ok(line.includes("signal=counter"), line);
  assert.equal(after, before, "the register sha must be byte-identical after a refused acquire");
  assert.equal(
    existsSync(lockPathFor(homeB)),
    false,
    "a refused environment must not hold a local lease either",
  );
});

/* ================================================================== */
/* Criterion 3: identity is not the machine.                           */
/* ================================================================== */

test("the exclusion module names no machine identity source", () => {
  const source = readFileSync(exclusionSource, "utf8");
  for (const forbidden of ["hostname", "process.pid", "/proc", "kill("]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `src/exclusion.ts must not mention ${forbidden} (plan constraint C-2)`,
    );
  }
  // The control: the grep is capable of finding these tokens, demonstrated
  // against a file that really carries one. src/lock.ts builds its local
  // lease with the machine's hostname, which is exactly the kind of value
  // this layer must not use.
  assert.equal(readFileSync(fileURLToPath(new URL("../src/lock.ts", import.meta.url)), "utf8").includes("hostname"), true);
});

test("a clone of a fleet home observes the same tracked environment id", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, true);
  const homeA = cloneFleetHome(root, remote, "env-a");

  const acquired = runCli(["lock", "acquire", "--duration", "300"], { cwd: homeA });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const envA = envIdOf(homeA);

  // The file is TRACKABLE: it sits outside the gitignored set, so an
  // environment that commits it keeps its identity across a reclaim.
  const ignored = git(homeA, ["check-ignore", "--quiet", "tiphys-environment.json"]);
  assert.notEqual(ignored.status, 0, "the environment id file must not be gitignored");
  gitOk(homeA, ["add", "tiphys-environment.json"]);
  gitOk(homeA, ["commit", "--quiet", "-m", "record this environment identity"]);
  gitOk(homeA, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);

  const reclaimed = cloneFleetHome(root, remote, "reclaimed");
  assert.ok(gitOk(reclaimed, ["ls-files", "tiphys-environment.json"]).length > 0);
  assert.equal(
    envIdOf(reclaimed),
    envA,
    "a clone of a fleet home that committed its identity observes the same id",
  );

  // And an environment that never received one generates its own, so two
  // environments are distinguishable when the id was not published.
  const fresh = cloneFleetHome(root, remote, "fresh");
  rmSync(join(fresh, "tiphys-environment.json"));
  const freshRun = runCli(["lock", "acquire"], { cwd: fresh });
  assert.equal(freshRun.status, 1, freshRun.stdout);
  assert.notEqual(envIdOf(fresh), envA);
});

/* ================================================================== */
/* Criteria 4 and 5: the two clock-skew members, and the control.      */
/* ================================================================== */

/**
 * Both members declare a SHORT stale window so the window is reachable in a
 * test, and a lease duration shorter than the ten-minute skew so the skewed
 * clock really does disagree about expiry. Written into the clone's own
 * package.json, which is the same field `tiphys init --shared-exclusion`
 * writes, with the values a fleet operator would edit.
 */
function declareShortWindow(home: string, staleWindowSeconds: number): void {
  const path = join(home, "package.json");
  const document = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  document["tiphys"] = {
    sharedExclusion: { remote: "origin", ref: REGISTER_REF, staleWindowSeconds },
  };
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

test("a takeover is refused by the fencing counter when the challenger clock runs ten minutes ahead", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, true);
  const homeA = cloneFleetHome(root, remote, "env-a");
  const homeB = cloneFleetHome(root, remote, "env-b");
  declareShortWindow(homeA, 5);
  declareShortWindow(homeB, 5);

  const base = Date.now();
  const acquired = runCli(["lock", "acquire", "--duration", "60"], { cwd: homeA, nowMs: base });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const envA = envIdOf(homeA);
  const document = registerDocument(remote);
  const expiresAt = document["expiresAt"] as string;

  // THE DANGEROUS STATE, asserted rather than assumed: A's lease is
  // unexpired by A's clock and expired by B's, which is ten minutes ahead.
  const challengerNow = base + 10 * MINUTE_MS;
  assert.equal(Date.parse(expiresAt) > base, true, "A's lease must be live by A's clock");
  assert.equal(
    Date.parse(expiresAt) <= challengerNow,
    true,
    "A's lease must read as expired by the challenger's clock, or this witness is vacuous",
  );

  const before = registerSha(remote);
  const refused = runCli(["lock", "acquire", "--take-over"], {
    cwd: homeB,
    nowMs: challengerNow,
  });
  const after = registerSha(remote);

  assert.equal(refused.status, 1, refused.stdout);
  const line = soleLine(refused.stderr);
  assert.ok(line.includes("signal=counter"), `the refusal must name the signal it used: ${line}`);
  assert.ok(line.includes("fencing counter 1"), line);
  assert.ok(line.includes("no clock comparison was made"), line);
  assert.ok(line.includes(envA), line);
  assert.equal(after, before, "a refused takeover leaves the register byte-identical");
  assert.equal(existsSync(lockPathFor(homeB)), false);
});

test("a renewal by a holder whose clock runs ten minutes behind is not treated as stale by the other environment", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, true);
  const homeA = cloneFleetHome(root, remote, "env-a");
  const homeB = cloneFleetHome(root, remote, "env-b");
  declareShortWindow(homeA, 5);
  declareShortWindow(homeB, 5);

  const base = Date.now();
  const laggingNow = base - 10 * MINUTE_MS;

  // B holds the register, and its clock is ten minutes BEHIND A's.
  const acquired = runCli(["lock", "acquire", "--duration", "60"], { cwd: homeB, nowMs: laggingNow });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const holderB = (acquired.stdout.split("\n")[0] as string).split(" ")[1] as string;
  const envB = envIdOf(homeB);

  // A observes the register once, which is what arms its own stale clock.
  const observed = runCli(["lock", "acquire"], { cwd: homeA, nowMs: base });
  assert.equal(observed.status, 1, observed.stdout);

  // B RENEWS, on its own lagging clock. The register's counter advances.
  const renewed = runCli(["lock", "renew", "--holder", holderB, "--duration", "60"], {
    cwd: homeB,
    nowMs: laggingNow + 1000,
  });
  assert.equal(renewed.status, 0, `${renewed.stdout}${renewed.stderr}`);
  const afterRenew = registerDocument(remote);
  assert.equal(afterRenew["counter"], 2, "a renewal must advance the fencing counter");

  // THE DANGEROUS STATE: by A's clock the renewed lease is already expired,
  // because it was written ten minutes in the past. A clock rule would take
  // it over. The counter rule sees an increment and refuses.
  const takeoverNow = base + 6000;
  assert.equal(
    Date.parse(afterRenew["expiresAt"] as string) <= takeoverNow,
    true,
    "the renewed lease must read as expired by the other environment's clock",
  );

  const before = registerSha(remote);
  const refused = runCli(["lock", "acquire", "--take-over"], { cwd: homeA, nowMs: takeoverNow });
  const after = registerSha(remote);

  assert.equal(refused.status, 1, refused.stdout);
  const line = soleLine(refused.stderr);
  assert.ok(line.includes("signal=counter"), line);
  assert.ok(line.includes("fencing counter 2"), line);
  assert.ok(line.includes(envB), line);
  assert.equal(after, before);
  assert.equal(existsSync(lockPathFor(homeA)), false);
});

test("the stale window is reachable when the fencing counter does not advance", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, true);
  const homeA = cloneFleetHome(root, remote, "env-a");
  const homeB = cloneFleetHome(root, remote, "env-b");
  declareShortWindow(homeA, 5);
  declareShortWindow(homeB, 5);

  /* THE CONTROL FOR THE TWO MEMBERS ABOVE. They both assert a REFUSAL, so a
     stale window that could never be reached would make them pass while
     proving nothing. This is the same sequence with the renewal removed:
     the counter stands still, the window elapses on A's own clock, and the
     takeover is ALLOWED. So what refuses in the member above is the
     renewal, not an unreachable window. */
  const base = Date.now();
  const acquired = runCli(["lock", "acquire", "--duration", "60"], {
    cwd: homeB,
    nowMs: base - 10 * MINUTE_MS,
  });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);

  const observed = runCli(["lock", "acquire"], { cwd: homeA, nowMs: base });
  assert.equal(observed.status, 1, observed.stdout);

  const takeover = runCli(["lock", "acquire", "--take-over"], { cwd: homeA, nowMs: base + 6000 });
  assert.equal(takeover.status, 0, `${takeover.stdout}${takeover.stderr}`);
  assert.ok(takeover.stdout.includes("signal=counter"), takeover.stdout);
  assert.ok(takeover.stdout.includes("taking over"), takeover.stdout);
  const document = registerDocument(remote);
  assert.equal(document["counter"], 2);
  assert.equal(document["envId"], envIdOf(homeA));
});

/* ================================================================== */
/* Criteria 6 and 7: the signal is printed, and an unreachable         */
/* register fails closed instead of falling back.                      */
/* ================================================================== */

test("lock acquire names the clock signal and fails closed when the shared register is unreachable", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, true);
  const home = cloneFleetHome(root, remote, "env-a");

  // The reachable arm first, so both values of the signal are witnessed by
  // one test and the pair is comparable.
  const reachable = runCli(["lock", "acquire", "--duration", "300"], { cwd: home });
  assert.equal(reachable.status, 0, `${reachable.stdout}${reachable.stderr}`);
  assert.ok(reachable.stdout.includes("signal=counter"), reachable.stdout);
  const holder = (reachable.stdout.split("\n")[0] as string).split(" ")[1] as string;
  const released = runCli(["lock", "release", "--holder", holder], { cwd: home });
  assert.equal(released.status, 0, `${released.stdout}${released.stderr}`);
  assert.equal(existsSync(lockPathFor(home)), false);

  gitOk(home, ["remote", "set-url", "origin", join(root, "not-a-repository.git")]);
  const refused = runCli(["lock", "acquire"], { cwd: home });

  assert.notEqual(refused.status, 0, refused.stdout);
  const line = soleLine(refused.stderr);
  assert.ok(line.includes("signal=clock"), `the run must say which signal it used: ${line}`);
  assert.ok(line.includes("unreachable"), line);
  assert.equal(
    existsSync(lockPathFor(home)),
    false,
    "an unreachable register must not leave a local lease behind, which would be " +
      "a silent fall back to local-only exclusion",
  );
});

/* ================================================================== */
/* Criterion 8: release goes through the same compare-and-swap.        */
/* ================================================================== */

test("a release by a non-holding environment is refused and the register sha is byte-identical", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, true);
  const homeA = cloneFleetHome(root, remote, "env-a");
  const homeB = cloneFleetHome(root, remote, "env-b");

  const acquired = runCli(["lock", "acquire", "--duration", "300"], { cwd: homeA });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const holderA = (acquired.stdout.split("\n")[0] as string).split(" ")[1] as string;
  const envA = envIdOf(homeA);

  /* B is given a LOCAL lease under the same holder id A printed, so B's own
     lock file says it is the holder. Without the register the local check
     would pass, which is what makes this a real non-holder release rather
     than one the existing holder-id comparison already refuses. */
  const localLease = readFileSync(lockPathFor(homeA), "utf8");
  writeFileSync(lockPathFor(homeB), localLease, "utf8");
  assert.equal(readFileSync(lockPathFor(homeB), "utf8"), localLease);

  const before = registerSha(remote);
  const refused = runCli(["lock", "release", "--holder", holderA], { cwd: homeB });
  const after = registerSha(remote);

  assert.equal(refused.status, 1, refused.stdout);
  const line = soleLine(refused.stderr);
  assert.ok(line.includes("signal=counter"), line);
  assert.ok(line.includes(envA), line);
  assert.equal(after, before, "a refused release must leave the register byte-identical");
  assert.equal(
    existsSync(lockPathFor(homeB)),
    true,
    "a refused release must not remove the local lease either",
  );
  assert.equal(registerDocument(remote)["state"], "held");
});

test("a release by the holding environment advances the register to free through the same compare-and-swap", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, true);
  const homeA = cloneFleetHome(root, remote, "env-a");
  const homeB = cloneFleetHome(root, remote, "env-b");

  const acquired = runCli(["lock", "acquire", "--duration", "300"], { cwd: homeA });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const holderA = (acquired.stdout.split("\n")[0] as string).split(" ")[1] as string;

  const before = registerSha(remote);
  const released = runCli(["lock", "release", "--holder", holderA], { cwd: homeA });
  assert.equal(released.status, 0, `${released.stdout}${released.stderr}`);
  assert.ok(released.stdout.includes("signal=counter"), released.stdout);
  const after = registerSha(remote);
  assert.notEqual(after, before, "a won release must advance the register");

  const document = registerDocument(remote);
  assert.equal(document["state"], "free");
  assert.equal(document["counter"], 2);

  // And the released register lets the OTHER environment in, which is what
  // a release is for.
  const acquiredB = runCli(["lock", "acquire", "--duration", "300"], { cwd: homeB });
  assert.equal(acquiredB.status, 0, `${acquiredB.stdout}${acquiredB.stderr}`);
  assert.equal(registerDocument(remote)["envId"], envIdOf(homeB));
  assert.equal(registerDocument(remote)["counter"], 3);
});

/* ================================================================== */
/* The captured contract, and the identity drift pin.                  */
/* ================================================================== */

test("the captured git compare-and-swap contract is reproduced by a live scratch repository", (t) => {
  const capture = readFileSync(capturePath, "utf8");
  assert.ok(capture.includes("! [rejected]"), "the capture must carry git's own rejection marker");
  assert.ok(capture.includes("(stale info)"), capture.slice(0, 200));
  assert.ok(
    capture.includes("fatal: empty ident name"),
    "the capture must record that commit-tree refuses without an identity",
  );

  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote, true);
  const homeA = cloneFleetHome(root, remote, "env-a");
  const homeB = cloneFleetHome(root, remote, "env-b");

  const acquired = runCli(["lock", "acquire", "--duration", "300"], { cwd: homeA });
  assert.equal(acquired.status, 0, `${acquired.stdout}${acquired.stderr}`);
  const held = registerSha(remote);

  // A stale expectation, forced for real, exactly as the capture records it.
  const blob = gitOk(homeB, ["hash-object", "-w", "--stdin"], '{"state":"held"}\n');
  const tree = gitOk(homeB, ["mktree"], `100644 blob ${blob}\tlease.json\n`);
  const commit = gitOk(homeB, ["commit-tree", tree, "-m", "challenger"]);
  const stale = git(homeB, [
    "push",
    `--force-with-lease=${REGISTER_REF}:`,
    remote,
    `${commit}:${REGISTER_REF}`,
  ]);
  assert.equal(stale.status, 1, stale.stderr);
  assert.match(stale.stderr, /! \[rejected\][^\n]*\(stale info\)/);
  assert.equal(registerSha(remote), held);

  // And the exact-sha form naming the value the register really holds is
  // accepted, so the mandate is not vacuous in the other direction.
  const exact = git(homeB, [
    "push",
    `--force-with-lease=${REGISTER_REF}:${held}`,
    remote,
    `${commit}:${REGISTER_REF}`,
  ]);
  assert.equal(exact.status, 0, exact.stderr);
  assert.equal(registerSha(remote), commit);
});

test("the register commit identity matches the fleet bootstrap identity", () => {
  const exclusion = readFileSync(exclusionSource, "utf8");
  const init = readFileSync(initSource, "utf8");
  for (const [exclusionName, initName] of [
    ["REGISTER_IDENTITY_NAME", "MACHINE_IDENTITY_NAME"],
    ["REGISTER_IDENTITY_EMAIL", "MACHINE_IDENTITY_EMAIL"],
  ]) {
    const from = (source: string, name: string): string => {
      const match = new RegExp(`${name} = "([^"]+)"`).exec(source);
      assert.notEqual(match, null, `${name} must be a string constant`);
      return (match as RegExpExecArray)[1] as string;
    };
    assert.equal(
      from(exclusion, exclusionName as string),
      from(init, initName as string),
      "the register write and the fleet bootstrap must use one identity, or a " +
        "runner with no git identity fails in only one of them",
    );
  }
});

/* ================================================================== */
/* The opt-in is written by init, and only when asked.                 */
/* ================================================================== */

test("tiphys init writes the shared exclusion declaration only when it is asked for", (t) => {
  const root = makeTempDir(t);

  const plain = join(root, "plain");
  const plainRun = runCli(["init", plain]);
  assert.equal(plainRun.status, 0, plainRun.stderr);
  const plainPackage = JSON.parse(readFileSync(join(plain, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  assert.equal(
    Object.prototype.hasOwnProperty.call(plainPackage, "tiphys"),
    false,
    "a fleet home created without the flag carries no declaration at all",
  );
  assert.equal(plainRun.stdout.includes("sharedExclusion"), false, plainRun.stdout);

  const declared = join(root, "declared");
  const declaredRun = runCli(["init", declared, "--shared-exclusion"]);
  assert.equal(declaredRun.status, 0, declaredRun.stderr);
  const declaredPackage = JSON.parse(readFileSync(join(declared, "package.json"), "utf8")) as {
    tiphys?: { sharedExclusion?: { remote?: string; ref?: string } };
  };
  assert.equal(declaredPackage.tiphys?.sharedExclusion?.remote, "origin");
  assert.equal(
    declaredPackage.tiphys?.sharedExclusion?.ref,
    REGISTER_REF,
    "the declared ref must be a BRANCH: only refs/heads/* is pushable against the " +
      "remote this kernel is built for (CLAUDE.md standing warning 14)",
  );
  assert.match(declaredRun.stdout, /declared tiphys\.sharedExclusion on origin at refs\/heads\/tiphys\/lease/);

  // The declaration is COMMITTED by the bootstrap commit, so it travels to
  // every clone of the fleet, which is how a second environment opts in.
  assert.ok(gitOk(declared, ["ls-files", "package.json"]).length > 0);
  assert.match(
    gitOk(declared, ["show", "HEAD:package.json"]),
    /"sharedExclusion"/,
  );
});
