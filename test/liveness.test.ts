import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Liveness-guard tests (kernel plan v1, M1-P5 criteria 10, 11 and 12).
 *
 * EVERY GUARD TEST HERE HAS WORK IN FLIGHT where the predicate is meant
 * to fire. A guard evaluated on a fleet with no open task cannot fail,
 * so a test built that way witnesses nothing (the strengthened
 * red-witness rule, T-003). The one test that deliberately has NO open
 * task is the one asserting that the in-flight half of the predicate is
 * load-bearing.
 *
 * The library-level probes import src/liveness.ts through a computed URL
 * because a literal relative import from test/ into src/ fails the build
 * under rewriteRelativeImportExtensions (TS2878, inherited warning 4).
 */

interface FleetPaths {
  root: string;
  beaconPath: string;
  tasksDir: string;
}

interface GuardReport {
  inFlight: number;
  unreadable: number;
  beaconAgeMs: number | undefined;
  stale: boolean;
  detail: string;
}

interface WatchCadence {
  baseIntervalMs: number;
  pollIntervalMs: number;
  backoffCapMs: number;
  staleThresholdMs: number;
}

const livenessUrl = new URL("../src/liveness.ts", import.meta.url).href;
const { CADENCE, guard } = (await import(livenessUrl)) as {
  CADENCE: WatchCadence;
  guard: (fleet: FleetPaths, nowMs?: number, cadence?: WatchCadence) => GuardReport;
};
const { loadFleet } = (await import(
  new URL("../src/fleet.ts", import.meta.url).href
)) as { loadFleet: (dir: string) => FleetPaths };

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Liveness Test",
  GIT_AUTHOR_EMAIL: "liveness-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Liveness Test",
  GIT_COMMITTER_EMAIL: "liveness-test@tiphys.invalid",
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

function runCli(args: string[], opts: { cwd?: string } = {}): CliResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: baseEnv(),
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitOk(dir: string, args: string[]): string {
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr ?? ""}`);
  return (result.stdout ?? "").trim();
}

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p5-liveness-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function initFleet(t: { after(fn: () => void): void }): string {
  const fleet = join(makeTempDir(t), "fleet");
  const result = runCli(["init", fleet]);
  assert.equal(result.status, 0, result.stderr);
  return fleet;
}

function openTask(fleet: string, taskId: string): void {
  const dir = join(fleet, "tasks", taskId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "meta.json"),
    `${JSON.stringify(
      {
        id: taskId,
        project: join(fleet, "projects", "demo"),
        shape: "ship",
        branch: `task/${taskId}`,
        worktree: join(fleet, "worktrees", taskId),
        baseSha: "0".repeat(40),
        baseOffline: false,
        status: "open",
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

function closeTask(fleet: string, taskId: string): void {
  const path = join(fleet, "tasks", taskId, "meta.json");
  const meta = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  meta.status = "closed";
  writeFileSync(path, `${JSON.stringify(meta, null, 2)}\n`);
}

/** Write a beacon whose recorded instant is ageMs in the past. */
function writeBeacon(fleet: string, ageMs: number): void {
  writeFileSync(
    join(fleet, "state", "watcher.beacon"),
    `${JSON.stringify(
      {
        writtenAt: new Date(Date.now() - ageMs).toISOString(),
        backoffStreak: 4,
        intervalMs: CADENCE.backoffCapMs,
      },
      null,
      2,
    )}\n`,
  );
}

function staleLines(stderr: string): string[] {
  return stderr.split("\n").filter((line) => line.includes("watcher stale"));
}

interface Scenario {
  spawn: CliResult;
  teardown: CliResult;
  doctor: CliResult;
}

/**
 * The three guard-carrying commands, run over one scratch fleet that has
 * a task in flight throughout. Returns their results so the stale and
 * fresh runs of the SAME scenario can be compared exit code for exit
 * code (criteria 10 and 11).
 */
function runGuardScenario(
  t: { after(fn: () => void): void },
  beaconAgeMs: number,
): Scenario {
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
  writeFileSync(briefFile, "# Brief\n");
  const payload = join(tmp, "payload.sh");
  writeFileSync(payload, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const spawnArgs = (taskId: string): string[] => [
    "spawn",
    "--task",
    taskId,
    "--project",
    clone,
    "--brief",
    briefFile,
    "--shape",
    "ship",
    "--exec",
    payload,
  ];

  // Task "held" stays open for the whole scenario, so the guard's
  // in-flight half is satisfied at every probe below.
  const held = runCli(spawnArgs("held"), { cwd: fleet });
  assert.equal(held.status, 0, held.stderr);

  writeBeacon(fleet, beaconAgeMs);

  const spawned = runCli(spawnArgs("probe"), { cwd: fleet });
  const tornDown = runCli(["teardown", "--task", "probe"], { cwd: fleet });
  const doctored = runCli(["doctor"], { cwd: fleet });
  return { spawn: spawned, teardown: tornDown, doctor: doctored };
}

test("a stale beacon warns on spawn teardown and doctor without changing them", (t) => {
  // Criteria 10 and 11 together: the same scenario is run with a stale
  // beacon and with a fresh one, and the difference is exactly the
  // warning line.
  const stale = runGuardScenario(t, CADENCE.staleThresholdMs + 60_000);
  const fresh = runGuardScenario(t, 1_000);

  for (const [name, result] of [
    ["spawn", stale.spawn],
    ["teardown", stale.teardown],
    ["doctor", stale.doctor],
  ] as const) {
    assert.equal(
      staleLines(result.stderr).length,
      1,
      `${name} did not emit exactly one stale line: ${JSON.stringify(result.stderr)}`,
    );
  }
  for (const [name, result] of [
    ["spawn", fresh.spawn],
    ["teardown", fresh.teardown],
    ["doctor", fresh.doctor],
  ] as const) {
    assert.equal(
      staleLines(result.stderr).length,
      0,
      `${name} warned with a fresh beacon: ${JSON.stringify(result.stderr)}`,
    );
  }

  // Normal function is unchanged: the same exit codes, the same stdout
  // for the command that has any, and teardown still refusing for its
  // own reason rather than for the watcher's.
  assert.equal(stale.spawn.status, fresh.spawn.status);
  assert.equal(stale.spawn.status, 0, stale.spawn.stderr);
  assert.match(stale.spawn.stdout, /^spawned probe worktree /);
  assert.equal(stale.teardown.status, fresh.teardown.status);
  assert.equal(stale.teardown.status, 0, stale.teardown.stderr);
  assert.match(stale.teardown.stdout, /^torn down probe/);
  assert.equal(stale.doctor.status, fresh.doctor.status);
  assert.equal(
    stale.doctor.stdout.split("\n").length,
    fresh.doctor.stdout.split("\n").length,
  );

  // R-095, the beacon check doctor left for this phase: the same
  // threshold the guard uses, reported as a check line in its own right.
  assert.match(
    stale.doctor.stdout,
    /^CHECK beacon WARN beacon present but \d+s old, past the \d+s freshness threshold$/m,
  );
  assert.match(
    fresh.doctor.stdout,
    /^CHECK beacon PASS beacon present, age \d+s \(freshness threshold \d+s\)$/m,
  );
});

test("the guard reports fresh across the whole gap between two heartbeats", (t) => {
  // Criterion 12, first clause (PR-009). Probed deterministically with
  // an injected clock instead of waiting out a real backoff cap: the
  // invariant is about arithmetic, so the arithmetic is what is probed,
  // at 21 points across the entire worst-case gap.
  const fleetDir = initFleet(t);
  openTask(fleetDir, "t1");
  const fleet = loadFleet(fleetDir);
  const writtenMs = Date.now();
  writeFileSync(
    fleet.beaconPath,
    `${JSON.stringify(
      {
        writtenAt: new Date(writtenMs).toISOString(),
        backoffStreak: 40,
        intervalMs: CADENCE.backoffCapMs,
      },
      null,
      2,
    )}\n`,
  );

  const worstCaseGapMs = CADENCE.backoffCapMs + CADENCE.pollIntervalMs;
  for (let step = 0; step <= 20; step += 1) {
    const at = writtenMs + Math.round((worstCaseGapMs * step) / 20);
    const report = guard(fleet, at);
    assert.equal(report.inFlight, 1);
    assert.equal(
      report.stale,
      false,
      `a healthy watcher read as stale ${String(at - writtenMs)}ms after its beacon: ` +
        report.detail,
    );
  }
  // Falsifiable in the other direction: past the threshold it IS stale.
  const past = guard(fleet, writtenMs + CADENCE.staleThresholdMs + 1);
  assert.equal(past.stale, true);
  assert.match(past.detail, /watcher stale/);
});

test("a cadence that would make a healthy watcher stale fails at load", (t) => {
  // Criterion 12, second clause. The module is imported in a child
  // process so the failure is observed as a real load failure.
  void t;
  const load = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(livenessUrl)});`],
    {
      encoding: "utf8",
      env: {
        ...baseEnv(),
        TIPHYS_WATCH_BACKOFF_CAP_SECONDS: "900",
        TIPHYS_WATCH_POLL_SECONDS: "15",
        TIPHYS_WATCH_STALE_SECONDS: "915",
      },
    },
  );
  assert.notEqual(load.status, 0, "a violating cadence loaded successfully");
  const stderr = load.stderr ?? "";
  assert.match(stderr, /not strictly greater/);
  assert.match(stderr, /900000ms/, "the backoff cap is not named");
  assert.match(stderr, /915000ms/, "the threshold is not named");
  assert.match(stderr, /15000ms/, "the poll interval is not named");

  // One second more and the same configuration loads, so the failure is
  // the invariant and not the override mechanism.
  const ok = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(livenessUrl)});`],
    {
      encoding: "utf8",
      env: {
        ...baseEnv(),
        TIPHYS_WATCH_BACKOFF_CAP_SECONDS: "900",
        TIPHYS_WATCH_POLL_SECONDS: "15",
        TIPHYS_WATCH_STALE_SECONDS: "916",
      },
    },
  );
  assert.equal(ok.status, 0, ok.stderr ?? "");
});

test("the guard is silent when nothing is in flight and loud when something is", (t) => {
  // The in-flight half of the predicate, in both directions. Without
  // this, a guard that ignored open tasks would pass every other test in
  // this file.
  const fleet = initFleet(t);
  const fleetPaths = loadFleet(fleet);

  const empty = guard(fleetPaths);
  assert.equal(empty.inFlight, 0);
  assert.equal(empty.stale, false, "an empty fleet read as stale");
  assert.equal(empty.beaconAgeMs, undefined);

  openTask(fleet, "t1");
  const inFlight = guard(fleetPaths);
  assert.equal(inFlight.inFlight, 1);
  assert.equal(inFlight.stale, true, "an unsupervised open task read as fresh");
  assert.match(inFlight.detail, /no readable beacon/);

  // A closed task is not in flight either: the predicate reads meta.json
  // status, which is the C-1 state authority.
  closeTask(fleet, "t1");
  const closed = guard(fleetPaths);
  assert.equal(closed.inFlight, 0);
  assert.equal(closed.stale, false);
});

test("a task whose record cannot be read still counts as in flight", (t) => {
  // FIX ROUND, second reviewer finding 2 (HIGH), guard half. The
  // dangerous state is a genuinely open, unsupervised task whose
  // meta.json was left torn by an interrupted write: the guard used to
  // drop it from the count and announce "nothing is in flight to
  // supervise", which is the T-002 shape with the guard manufacturing
  // the "nobody noticed" half itself.
  const fleet = initFleet(t);
  const fleetPaths = loadFleet(fleet);
  openTask(fleet, "torn");
  writeFileSync(
    join(fleet, "tasks", "torn", "meta.json"),
    '{"id":"torn","status":"open", "branch": "task/torn"',
  );

  const report = guard(fleetPaths);
  assert.equal(report.inFlight, 1, "an unreadable task record was treated as absent");
  assert.equal(report.unreadable, 1);
  assert.equal(report.stale, true, "an unsupervised unreadable task read as healthy");
  assert.match(report.detail, /watcher stale/);
  assert.match(report.detail, /unreadable meta\.json/);

  // A task directory with no meta.json at all is not a torn record.
  rmSync(join(fleet, "tasks", "torn", "meta.json"));
  const empty = guard(fleetPaths);
  assert.equal(empty.inFlight, 0);
  assert.equal(empty.stale, false);
});

test("a beacon dated in the future is no evidence that supervision ran", (t) => {
  // FIX ROUND, CR-501. The dangerous state is a clock that moved
  // backwards under a watcher that has since stopped: a negative age is
  // never greater than the threshold, so the fleet used to read as
  // healthy forever, and doctor rounded the age up to a reassuring 0s.
  const fleet = initFleet(t);
  const fleetPaths = loadFleet(fleet);
  openTask(fleet, "t1");
  writeFileSync(
    fleetPaths.beaconPath,
    `${JSON.stringify(
      {
        writtenAt: new Date(Date.now() + 86_400_000).toISOString(),
        backoffStreak: 4,
        intervalMs: CADENCE.backoffCapMs,
      },
      null,
      2,
    )}\n`,
  );

  const report = guard(fleetPaths);
  assert.equal(report.stale, true, "a future-dated beacon silenced the guard");
  assert.equal(report.beaconAgeMs, undefined);
  assert.match(report.detail, /watcher stale/);
  assert.match(report.detail, /FUTURE/);

  const doctored = runCli(["doctor"], { cwd: fleet });
  assert.equal(
    staleLines(doctored.stderr).length,
    1,
    `doctor did not warn: ${JSON.stringify(doctored.stderr)}`,
  );
  assert.match(
    doctored.stdout,
    /^CHECK beacon WARN beacon present but dated \d+s in the future, so it is no evidence that supervision ran$/m,
  );
  const promoted = runCli(["doctor", "--for", "watch"], { cwd: fleet });
  assert.match(promoted.stdout, /^CHECK beacon FAIL beacon present but dated /m);

  // Small clock jitter is not a future-dated beacon.
  writeFileSync(
    fleetPaths.beaconPath,
    `${JSON.stringify(
      {
        writtenAt: new Date(Date.now() + 1000).toISOString(),
        backoffStreak: 0,
        intervalMs: 60_000,
      },
      null,
      2,
    )}\n`,
  );
  assert.equal(guard(fleetPaths).stale, false, "ordinary clock jitter read as stale");
});

test("the freshness floor follows the cadence the watcher itself declared", (t) => {
  // FIX ROUND, CR-503, the cry-wolf direction of the same class. The
  // dangerous state is a guard configured for a short cadence reading a
  // beacon written by a healthy watcher running a long one: before the
  // fix it called that watcher stale, and a guard that cries wolf is
  // ignored exactly like one that never warns.
  const fleet = initFleet(t);
  const fleetPaths = loadFleet(fleet);
  openTask(fleet, "t1");
  const writtenMs = Date.now();
  writeFileSync(
    fleetPaths.beaconPath,
    `${JSON.stringify(
      { writtenAt: new Date(writtenMs).toISOString(), backoffStreak: 6, intervalMs: 900_000 },
      null,
      2,
    )}\n`,
  );
  const shortCadence = {
    baseIntervalMs: 1000,
    pollIntervalMs: 1000,
    backoffCapMs: 10_000,
    staleThresholdMs: 12_000,
  };

  // 13s old: past the reader's own 12s threshold, well inside the 900s
  // cadence the beacon says the watcher is running.
  const report = guard(fleetPaths, writtenMs + 13_000, shortCadence);
  assert.equal(report.stale, false, `a healthy watcher read as stale: ${report.detail}`);

  // Past the watcher's OWN declared interval plus one poll, it is stale
  // under the same configuration, so the floor is not a blanket silence.
  const past = guard(fleetPaths, writtenMs + 900_000 + 1000 + 1, shortCadence);
  assert.equal(past.stale, true, "the declared-cadence floor never expires");
});

test("a malformed cadence value is refused, never silently defaulted", (t) => {
  // FIX ROUND, CR-502. The dangerous state is an operator or harness
  // whose TIPHYS_WATCH_* value is a typo: falling back to the default
  // would leave them believing a threshold applies that does not. The
  // failure is loud, and it names the variable and the value.
  void t;
  const load = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(livenessUrl)});`],
    {
      encoding: "utf8",
      env: { ...baseEnv(), TIPHYS_WATCH_STALE_SECONDS: "twenty" },
    },
  );
  assert.notEqual(load.status, 0, "a malformed cadence value loaded successfully");
  assert.match(load.stderr ?? "", /TIPHYS_WATCH_STALE_SECONDS="twenty"/);
  assert.match(load.stderr ?? "", /is not a positive number of seconds/);
});

test("an unreadable beacon counts as no supervision", (t) => {
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  const fleetPaths = loadFleet(fleet);
  writeFileSync(fleetPaths.beaconPath, "half a beacon\n");
  const report = guard(fleetPaths);
  assert.equal(report.stale, true);
  assert.equal(report.beaconAgeMs, undefined);
  assert.match(report.detail, /watcher stale/);
});
