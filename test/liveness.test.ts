import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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
  /** True when the child was killed by this test's own explicit bound. */
  timedOut: boolean;
}

function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TIPHYS_HOLDER_ID;
  return env;
}

function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): CliResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: opts.env ?? baseEnv(),
    // An explicit bound where the caller asks for one, killed hard, so a
    // command that blocks in the kernel cannot hang the suite.
    ...(opts.timeoutMs === undefined
      ? {}
      : { timeout: opts.timeoutMs, killSignal: "SIGKILL" as const }),
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    timedOut:
      (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT",
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
  // CR-510: the remediation must name the action that actually clears
  // this. Restarting the watcher does not, because writeBeacon keeps a
  // beacon that is ahead of the clock ahead of it, so a detail line that
  // only said "start tiphys watch" would be advice that cannot work.
  assert.match(report.detail, /remove that file/);
  assert.match(report.detail, /restarting the watcher alone will not clear it/);

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

test("the watcher and the guard agree on every task-record shape", (t) => {
  // FINAL ROUND, NEW-1. The dangerous state is the two modules
  // classifying one task record differently: a meta.json that exists as
  // a directory used to surface in the watcher and count as nothing in
  // the guard, which is a counterexample to the property the fix round
  // declared. The assertion is AGREEMENT, so a future edit to either
  // side alone fails this test rather than passing quietly.
  const shapes: Array<{ id: string; plant: (dir: string) => void }> = [
    {
      id: "torn",
      plant: (dir) => {
        writeFileSync(join(dir, "meta.json"), '{"id":"torn","status":"open"');
      },
    },
    {
      id: "dirmeta",
      plant: (dir) => {
        mkdirSync(join(dir, "meta.json"));
      },
    },
    {
      id: "danglemeta",
      plant: (dir) => {
        symlinkSync(join(dir, "nowhere.json"), join(dir, "meta.json"));
      },
    },
    {
      id: "emptymeta",
      plant: (dir) => {
        writeFileSync(join(dir, "meta.json"), "");
      },
    },
  ];

  for (const shape of shapes) {
    const fleet = initFleet(t);
    const fleetPaths = loadFleet(fleet);
    const dir = join(fleet, "tasks", shape.id);
    mkdirSync(dir, { recursive: true });
    shape.plant(dir);

    // Unsupervised (no beacon yet): the guard counts the record as work
    // it cannot show this fleet is free of, and says so.
    const before = guard(fleetPaths);
    assert.equal(
      before.inFlight,
      1,
      `${shape.id}: the guard did not count the record: ${before.detail}`,
    );
    assert.equal(before.unreadable, 1, shape.id);
    assert.equal(before.stale, true, `${shape.id}: ${before.detail}`);

    // The watcher surfaces the very same record, by the same
    // classification.
    const seen = runCli(["watch", "--once"], { cwd: fleet });
    assert.equal(seen.status, 0, `${shape.id}: ${seen.stderr}`);
    assert.equal(seen.stdout, `stale ${shape.id} meta\n`, shape.id);

    // And after that pass the record is still counted: the wake was
    // surfaced, not resolved. Only the beacon changed, so the fleet is
    // in flight and freshly supervised at the same time.
    const after = guard(fleetPaths);
    assert.equal(
      after.inFlight,
      1,
      `${shape.id}: the guard and the watcher disagree: ${after.detail}`,
    );
    assert.equal(after.unreadable, 1, shape.id);
    assert.equal(after.stale, false, `${shape.id}: ${after.detail}`);
  }

  // And the agreement holds in the quiet direction too: a task directory
  // with no meta.json at all is a record to neither of them.
  const fleet = initFleet(t);
  const fleetPaths = loadFleet(fleet);
  mkdirSync(join(fleet, "tasks", "nometa"), { recursive: true });
  const quiet = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(quiet.status, 3, quiet.stderr);
  assert.equal(quiet.stdout, "");
  assert.equal(guard(fleetPaths).inFlight, 0);
});

test("doctor and the guard return one verdict about one beacon", (t) => {
  // FINAL ROUND, CR-508. The dangerous state is the freshness floor
  // applied by one caller and not the other, which produced two
  // contradictory verdicts about the same file in a single doctor run
  // and failed a healthy watcher under --for watch. The assertion is
  // agreement in BOTH directions, so applying the floor in only one
  // place fails this test.
  const fleet = initFleet(t);
  const fleetPaths = loadFleet(fleet);
  openTask(fleet, "t1");
  // A beacon a healthy watcher on a 900s cadence would have written 13s
  // ago, read by a process configured for a 12s threshold.
  writeFileSync(
    fleetPaths.beaconPath,
    `${JSON.stringify(
      {
        writtenAt: new Date(Date.now() - 13_000).toISOString(),
        backoffStreak: 6,
        intervalMs: 900_000,
      },
      null,
      2,
    )}\n`,
  );
  const shortEnv = {
    TIPHYS_WATCH_BACKOFF_CAP_SECONDS: "10",
    TIPHYS_WATCH_POLL_SECONDS: "1",
    TIPHYS_WATCH_STALE_SECONDS: "12",
  };

  const doctored = runCli(["doctor"], { cwd: fleet, env: { ...baseEnv(), ...shortEnv } });
  assert.equal(
    staleLines(doctored.stderr).length,
    0,
    `the guard called a healthy watcher stale: ${doctored.stderr}`,
  );
  assert.match(
    doctored.stdout,
    /^CHECK beacon PASS beacon present, age 13s \(freshness threshold 901s\)$/m,
    `doctor disagreed with the guard about one beacon: ${doctored.stdout}`,
  );
  const promoted = runCli(["doctor", "--for", "watch"], {
    cwd: fleet,
    env: { ...baseEnv(), ...shortEnv },
  });
  assert.match(promoted.stdout, /^CHECK beacon PASS /m, "the watch profile failed a healthy watcher");

  // The other direction: genuinely past the declared cadence, both say so.
  writeFileSync(
    fleetPaths.beaconPath,
    `${JSON.stringify(
      {
        writtenAt: new Date(Date.now() - 902_000).toISOString(),
        backoffStreak: 6,
        intervalMs: 900_000,
      },
      null,
      2,
    )}\n`,
  );
  const late = runCli(["doctor"], { cwd: fleet, env: { ...baseEnv(), ...shortEnv } });
  assert.equal(staleLines(late.stderr).length, 1, `the guard stayed quiet: ${late.stderr}`);
  assert.match(
    late.stdout,
    /^CHECK beacon WARN beacon present but 902s old, past the 901s freshness threshold$/m,
    late.stdout,
  );
});

/**
 * Bound for every child process in the blocking-probe witness. It is
 * EXPLICIT and it is enforced by spawnSync rather than by the test
 * runner, because the dangerous state this witness is red against is an
 * indefinite hang: a regression must fail with a reason line naming the
 * FIFO, never as an unexplained CI timeout.
 */
const BLOCK_PROBE_TIMEOUT_MS = 15_000;

/** Whether this machine can create a named pipe, checked by doing it. */
function fifoUnsupported(): string | false {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p5-fifo-check-"));
  try {
    const made = spawnSync("mkfifo", [join(dir, "probe")]);
    if (made.status === 0) {
      return false;
    }
    return `mkfifo is unavailable here (${String(made.error ?? made.status)}); the blocking-probe witness runs on CI`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const fifoSkip = fifoUnsupported();

test("a named pipe at a task record is classified without blocking", { skip: fifoSkip }, (t) => {
  // FINAL ROUND, NEW-2 (HIGH). The dangerous state is an indefinite hang,
  // not a wrong answer: opening a FIFO with no writer blocks in the
  // kernel, it is not an exception, and the classifier used to read
  // before it probed. That hung guard() and the watcher forever, which
  // live-locks doctor, spawn and teardown.
  //
  // Every child here carries an explicit bound, so a regression fails
  // with the message below instead of making CI look stuck.
  const fleet = initFleet(t);
  openTask(fleet, "healthy");
  const dir = join(fleet, "tasks", "piped");
  mkdirSync(dir, { recursive: true });
  const fifo = join(dir, "meta.json");
  assert.equal(spawnSync("mkfifo", [fifo]).status, 0, "could not create the named pipe");
  assert.equal(lstatSync(fifo).isFIFO(), true, "the planted record is not a named pipe");

  const watched = runCli(["watch", "--once"], {
    cwd: fleet,
    timeoutMs: BLOCK_PROBE_TIMEOUT_MS,
  });
  assert.notEqual(
    watched.timedOut,
    true,
    `the watcher blocked on the named pipe at ${fifo} and was killed after ` +
      `${String(BLOCK_PROBE_TIMEOUT_MS)}ms: the record was read before it was probed`,
  );
  assert.equal(watched.status, 0, watched.stderr);
  assert.equal(watched.stdout, "stale piped meta\n");

  // The guard runs in a child too, because a hang inside this process
  // would hang the whole suite rather than failing this test.
  const probed = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { guard } = await import(${JSON.stringify(livenessUrl)});\n` +
        `const { loadFleet } = await import(${JSON.stringify(
          new URL("../src/fleet.ts", import.meta.url).href,
        )});\n` +
        `process.stdout.write(JSON.stringify(guard(loadFleet(process.argv[1]))));`,
      fleet,
    ],
    { encoding: "utf8", env: baseEnv(), timeout: BLOCK_PROBE_TIMEOUT_MS, killSignal: "SIGKILL" },
  );
  assert.notEqual(
    (probed.error as NodeJS.ErrnoException | undefined)?.code,
    "ETIMEDOUT",
    `the guard blocked on the named pipe at ${fifo} and was killed after ` +
      `${String(BLOCK_PROBE_TIMEOUT_MS)}ms: the record was read before it was probed`,
  );
  const report = JSON.parse(probed.stdout) as GuardReport;
  // Two records in flight: the healthy open task and the pipe, which is
  // not evidence that anything finished.
  assert.equal(report.inFlight, 2, JSON.stringify(report));
  assert.equal(report.unreadable, 1, JSON.stringify(report));
});

test("a task entry that cannot be examined is counted and reported", (t) => {
  // FINAL ROUND, CR-512. The reviewer disproved this phase's claim that
  // the incomplete-survey arm could not practically be witnessed: a
  // self-referential symlink raises ELOOP, which is neither a missing
  // file nor a permission bit and needs no privileges. The dangerous
  // state is a fleet holding an entry nobody can examine being reported
  // as idle and needing no supervision.
  const fleet = initFleet(t);
  const loop = join(fleet, "tasks", "loop");
  symlinkSync(loop, loop);

  const report = guard(loadFleet(fleet));
  assert.equal(report.inFlight, 1, `an unexaminable entry was read as an idle fleet: ${report.detail}`);
  assert.equal(report.unreadable, 1);
  assert.equal(report.stale, true, report.detail);

  const watched = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(watched.status, 1, `the watcher stayed quiet: ${JSON.stringify(watched)}`);
  assert.equal(watched.stdout, "");
  assert.equal(
    watched.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${watched.stderr}`,
  );
  assert.match(watched.stderr, /ELOOP/);
  assert.ok(watched.stderr.includes(loop), watched.stderr);
});

test("a beacon that is a dangling symlink is a failed check, not an absent one", (t) => {
  // FINAL ROUND, CR-513. judgeBeacon probes presence with lstat where
  // doctor's check previously used existsSync, so a beacon path that is a
  // dangling symlink moved from "absent" (WARN, promotable) to
  // "unreadable" (FAIL, terminal), which changes doctor's exit code on a
  // floor-satisfying runner. The new answer is the one the shared rule
  // requires: something exists at that path, so it is not evidence of
  // health. Pinned here so it is a decision rather than an accident.
  const fleet = initFleet(t);
  const fleetPaths = loadFleet(fleet);
  openTask(fleet, "t1");
  symlinkSync(join(fleet, "state", "nowhere.beacon"), fleetPaths.beaconPath);

  const doctored = runCli(["doctor"], { cwd: fleet });
  assert.match(
    doctored.stdout,
    /^CHECK beacon FAIL beacon file .* does not parse as a beacon record$/m,
    doctored.stdout,
  );
  // A FAIL is terminal: no profile promotion applies, and doctor exits
  // nonzero on any runner.
  assert.notEqual(doctored.status, 0);
  assert.match(doctored.stdout, /^CHECK beacon FAIL /m);

  // The guard reads the same file through the same verdict: no evidence
  // that supervision ran, so work in flight is stale.
  const report = guard(fleetPaths);
  assert.equal(report.stale, true, report.detail);
  assert.equal(report.beaconAgeMs, undefined);
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
