import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/**
 * Watcher tests (kernel plan v1, M1-P5 criteria 1 to 9, 13 and 14), plus
 * the tuition T-002 abandoned-task witness.
 *
 * TIMING. The watcher's behavior IS timing, so the cadence flags this
 * phase ships (--interval, --poll, --backoff-cap) are used to run it at
 * test timescales. Where a real clock wait is unavoidable it is stated
 * at the test and bounded; everything else is staged deterministically
 * (a barrier file for the concurrency witness, a pre-dated deadline for
 * the stale witness, a pre-dated beacon for the guard).
 *
 * WHAT A BUDGET COSTS HERE (standalone fix round, 2026-08-12, and the
 * rule this file now follows). A REAL-CLOCK BUDGET is a duration written
 * in this source that an assertion's OUTCOME turns on: a sampling window
 * that must contain N events, a sleep that must contain a tick, an
 * interval that a later spawn must still be inside. Every such budget is
 * silently spent by things this file does not measure: the spawn and
 * module load of a child CLI, the watcher's own poll granularity, and
 * whatever else the machine is doing. When the remainder goes negative
 * the assertion reddens without any behavior having changed, and the
 * `suite` gate is a REQUIRED gate, so that is a nondeterministic gate.
 *
 * Three rules, applied to every timing assertion in this file:
 *
 *   1. START A WINDOW AT AN OBSERVED EVENT, never at a call to spawn. A
 *      window opened before the child exists pays for the child's
 *      startup out of the events' budget.
 *   2. WAIT FOR THE FACT, do not sleep for it. Where a test needs "a
 *      heartbeat has ticked", it polls the fleet's own cadence file with
 *      a generous bound, so the bound is an upper bound on a hang rather
 *      than the thing the assertion depends on.
 *   3. WHERE A BUDGET CANNOT BE REMOVED, make it large against what it
 *      must contain, and assert the property DIRECTLY as well, so the
 *      widening does not also widen the defect's escape route. Staging
 *      elapsed time on disk (a pre-dated cadence file) is how a schedule
 *      test buys sixty seconds of margin instead of eight hundred
 *      milliseconds.
 *
 * Measured on this box at the head this round branched from: a
 * `tiphys watch --once` spawn costs a median 51ms (min 44, max 68) on an
 * idle machine, and the failing site had 700ms of total slack.
 *
 * WHY THIS FILE STOPS A PROCESS. The T-002 witness has to produce the
 * state "task open, no turn-end, worktree dirty", and M1-P4 established
 * that in M1 it can arise in exactly one way: the spawn process itself
 * stops while the payload is running. So the test stops a real spawn
 * mid-payload rather than writing the resulting files by hand. That is
 * the TEST creating a failure state; nothing in the kernel asks the
 * operating system about any running program, which criterion 14's
 * structural test asserts over the shipped sources.
 */

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));
const srcDir = fileURLToPath(new URL("../src/", import.meta.url));

/**
 * Library-level probes for the fix round. Imported through computed URLs
 * because a literal relative import from test/ into src/ fails the build
 * under rewriteRelativeImportExtensions (TS2878, inherited warning 4).
 */
interface CadenceSnapshot {
  lastHeartbeatAt: string;
  backoffStreak: number;
}
interface FleetPaths {
  root: string;
  beaconPath: string;
  tasksDir: string;
  stateDir: string;
}
const { heartbeatTick } = (await import(
  new URL("../src/watcher.ts", import.meta.url).href
)) as {
  heartbeatTick: (
    fleet: FleetPaths,
    state: CadenceSnapshot,
    cadence: unknown,
    nowMs: number,
  ) => number;
};
const { CADENCE: cadence } = (await import(
  new URL("../src/liveness.ts", import.meta.url).href
)) as { CADENCE: unknown };
const { loadFleet } = (await import(
  new URL("../src/fleet.ts", import.meta.url).href
)) as { loadFleet: (dir: string) => FleetPaths };

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Watcher Test",
  GIT_AUTHOR_EMAIL: "watcher-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Watcher Test",
  GIT_COMMITTER_EMAIL: "watcher-test@tiphys.invalid",
};

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TIPHYS_HOLDER_ID;
  delete env.TIPHYS_WATCH_TEST_HOLD;
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

interface RunningCli {
  proc: ChildProcess;
  stdout: () => string;
  stderr: () => string;
  exitCode: () => number | null;
  waitForExit: (limitMs: number) => Promise<number | null>;
  stop: () => void;
}

/** Start the CLI as a child process the TEST owns (plan constraint C-3). */
function startCli(
  t: { after(fn: () => void): void },
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): RunningCli {
  const proc = spawn(process.execPath, [sourceEntry, ...args], {
    cwd: opts.cwd,
    env: opts.env ?? baseEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  let code: number | null = null;
  proc.stdout?.setEncoding("utf8");
  proc.stderr?.setEncoding("utf8");
  proc.stdout?.on("data", (chunk: string) => {
    out += chunk;
  });
  proc.stderr?.on("data", (chunk: string) => {
    err += chunk;
  });
  proc.on("exit", (exit) => {
    code = exit;
  });
  const stop = (): void => {
    if (proc.exitCode === null) {
      proc.kill();
    }
  };
  t.after(stop);
  return {
    proc,
    stdout: () => out,
    stderr: () => err,
    exitCode: () => code,
    async waitForExit(limitMs: number): Promise<number | null> {
      const deadline = Date.now() + limitMs;
      while (Date.now() < deadline) {
        if (proc.exitCode !== null || proc.signalCode !== null) {
          await sleep(20);
          return code;
        }
        await sleep(10);
      }
      return null;
    },
    stop,
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
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p5-watch-"));
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

/** An open task record, which is what makes a fleet worth supervising. */
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

function writeTurnEnd(fleet: string, taskId: string, exitCode = 0): void {
  writeFileSync(
    join(fleet, "tasks", taskId, "turn-end"),
    `${JSON.stringify({ endedAt: new Date().toISOString(), exitCode }, null, 2)}\n`,
  );
}

/**
 * A beacon as this file reads it: the stamp AND the schedule the watcher
 * DECLARED when it wrote it. The declared half is what lets a cadence
 * assertion compare an observed gap against the interval the watcher
 * committed to, rather than against a ratio chosen in this source (see
 * WHAT A BUDGET COSTS HERE, above).
 */
interface BeaconSample {
  stampMs: number;
  backoffStreak: number;
  intervalMs: number;
}

function beaconSample(fleet: string): BeaconSample | undefined {
  let parsed: { writtenAt?: unknown; backoffStreak?: unknown; intervalMs?: unknown };
  try {
    parsed = JSON.parse(
      readFileSync(join(fleet, "state", "watcher.beacon"), "utf8"),
    ) as { writtenAt?: unknown; backoffStreak?: unknown; intervalMs?: unknown };
  } catch {
    return undefined;
  }
  if (
    typeof parsed.writtenAt !== "string" ||
    typeof parsed.backoffStreak !== "number" ||
    typeof parsed.intervalMs !== "number"
  ) {
    return undefined;
  }
  const stampMs = Date.parse(parsed.writtenAt);
  return Number.isNaN(stampMs)
    ? undefined
    : {
        stampMs,
        backoffStreak: parsed.backoffStreak,
        intervalMs: parsed.intervalMs,
      };
}

function beaconStampMs(fleet: string): number | undefined {
  return beaconSample(fleet)?.stampMs;
}

/** The fleet's on-disk heartbeat streak, the schedule's own record. */
function cadenceStreak(fleet: string): number | undefined {
  try {
    const parsed = JSON.parse(
      readFileSync(join(fleet, "state", "watcher.cadence.json"), "utf8"),
    ) as { backoffStreak?: unknown };
    return typeof parsed.backoffStreak === "number" ? parsed.backoffStreak : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Wait until the fleet's schedule records at least `wanted` heartbeats.
 * This is a bounded wait for an OBSERVED FACT, which is what replaced
 * "sleep long enough that a tick has surely happened": the bound is an
 * upper bound on a hang and is never the thing an assertion turns on.
 */
async function waitForCadenceStreak(
  fleet: string,
  wanted: number,
  limitMs: number,
  running?: RunningCli,
): Promise<number> {
  const deadline = Date.now() + limitMs;
  let last: number | undefined;
  while (Date.now() < deadline) {
    last = cadenceStreak(fleet);
    if (last !== undefined && last >= wanted) {
      return last;
    }
    // A watcher that EXITED will never reach the streak, and waiting the
    // full bound to say so would report a timeout for what is really a
    // watcher that broke its silence. Measured: with the unbounded-run
    // guard defanged, this arm is what names the defect.
    if (running !== undefined && running.exitCode() !== null) {
      throw new Error(
        `the watcher exited (code ${String(running.exitCode())}) after ` +
          `${String(last)} heartbeats instead of staying silent through ` +
          `${String(wanted)}: stdout ${JSON.stringify(running.stdout())} ` +
          `stderr ${JSON.stringify(running.stderr())}`,
      );
    }
    await sleep(10);
  }
  throw new Error(
    `the fleet's backoff streak was ${String(last)} and never reached ` +
      `${String(wanted)} within ${String(limitMs)}ms`,
  );
}

async function waitForBeacon(fleet: string, limitMs: number): Promise<number> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    const stamp = beaconStampMs(fleet);
    if (stamp !== undefined) {
      return stamp;
    }
    await sleep(10);
  }
  throw new Error(`no beacon within ${String(limitMs)}ms`);
}

async function waitForFile(path: string, limitMs: number): Promise<void> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      return;
    }
    await sleep(10);
  }
  throw new Error(`${path} did not appear within ${String(limitMs)}ms`);
}

test("a resident watcher keeps running and backs off with growing beacon gaps", async (t) => {
  // Criterion 1. Real-clock wait, bounded: base 0.3s doubling to a 10s
  // cap, so heartbeats fall due 300ms, 900ms and 2100ms after the watcher
  // arms itself, and the window is 4000ms.
  //
  // THE WINDOW STARTS AT THE ARMING BEACON (rules 1 and 3 above). The old
  // form opened a 4200ms window BEFORE calling spawn and needed four
  // beacon writes inside it, the last due 3500ms into the watcher's own
  // life; the spawn, the module load and the startup evaluation were all
  // spent out of the 700ms that left. It reddened as "expected at least 4
  // beacon writes, saw 3" (measured: 1 run in 30 on this box, and 5 in 15
  // when three copies of this file ran at once). Starting the window at
  // the beacon the watcher itself wrote removes the child's startup from
  // the budget entirely, and the third heartbeat then has 1900ms of slack.
  //
  // THE CADENCE IS ASSERTED AGAINST THE WATCHER'S OWN DECLARATION. Each
  // beacon carries the interval in force when it was written, so an
  // observed gap is compared with the interval the PREVIOUS beacon
  // declared. A heartbeat is noticed at the loop's next poll, so it can be
  // LATE and can never be EARLY: "gap >= the declared interval" is exact
  // in the only direction that can be violated. The old "gap >= 1.5x the
  // previous gap" was a ratio picked in this source, and its margin was
  // thinnest on the FIRST heartbeat, where one poll interval of lateness
  // is a fifth of the interval being measured.
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  const baseMs = 300;
  const capMs = 10_000;
  const watcher = startCli(
    t,
    ["watch", "--interval", "0.3", "--poll", "0.1", "--backoff-cap", "10"],
    { cwd: fleet },
  );

  const samples: BeaconSample[] = [];
  const armDeadline = Date.now() + 30_000;
  for (;;) {
    const armed = beaconSample(fleet);
    if (armed !== undefined) {
      samples.push(armed);
      break;
    }
    assert.ok(
      Date.now() < armDeadline,
      `the watcher wrote no beacon within 30000ms: ${watcher.stderr()}`,
    );
    await sleep(10);
  }

  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const sample = beaconSample(fleet);
    if (sample !== undefined && !samples.some((s) => s.stampMs === sample.stampMs)) {
      samples.push(sample);
    }
    await sleep(20);
  }

  assert.equal(watcher.exitCode(), null, `watcher exited: ${watcher.stderr()}`);
  assert.equal(watcher.stdout(), "", "an idle watcher printed something");
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(
      (samples[i] as BeaconSample).stampMs > (samples[i - 1] as BeaconSample).stampMs,
      `beacon timestamps are not strictly increasing: ${JSON.stringify(samples)}`,
    );
  }

  // The arming beacon carries streak 0; every later write is a heartbeat.
  const heartbeats = samples.filter((s) => s.backoffStreak >= 1);
  assert.ok(
    heartbeats.length >= 3,
    `expected at least 3 heartbeat beacons within 4000ms of arming, saw ` +
      `${String(heartbeats.length)}: ${JSON.stringify(samples)}`,
  );
  const firstStreak = (heartbeats[0] as BeaconSample).backoffStreak;
  for (let i = 0; i < heartbeats.length; i += 1) {
    const beat = heartbeats[i] as BeaconSample;
    // Consecutive AMONG THE OBSERVED ONES rather than "the first is 1":
    // whether the sampler catches the arming beacon before the first
    // heartbeat overwrites it is itself a race, and the ordinal's absolute
    // value is asserted deterministically by the two single-pass tests
    // below ("heartbeat 1" on a staged fleet, and the exact continued
    // ordinal in the silence test).
    assert.equal(
      beat.backoffStreak,
      firstStreak + i,
      `the heartbeat streak skipped or repeated: ${JSON.stringify(samples)}`,
    );
    // The schedule each beacon DECLARES doubles from the base, capped.
    assert.equal(
      beat.intervalMs,
      Math.min(baseMs * 2 ** beat.backoffStreak, capMs),
      `heartbeat ${String(beat.backoffStreak)} declared ${String(beat.intervalMs)}ms, ` +
        `which is not the doubled interval for that streak: ${JSON.stringify(samples)}`,
    );
  }
  for (let i = 1; i < heartbeats.length; i += 1) {
    const previous = heartbeats[i - 1] as BeaconSample;
    const current = heartbeats[i] as BeaconSample;
    const gap = current.stampMs - previous.stampMs;
    // This is the backoff, observed: with the declared intervals doubling
    // above, the gaps are at least 600ms then 1200ms then 2400ms in turn,
    // so they grow geometrically and cannot be a flat cadence.
    assert.ok(
      gap >= previous.intervalMs,
      `heartbeat ${String(current.backoffStreak)} arrived ${String(gap)}ms after the ` +
        `one before it, EARLIER than the ${String(previous.intervalMs)}ms that one ` +
        `declared: ${JSON.stringify(samples)}`,
    );
  }
  watcher.stop();
});

test("a resident watcher wakes on a turn-end file with one signal line", async (t) => {
  // Criterion 2. The reason is asserted, not merely the wake: a watcher
  // that exited for any other cause fails this test.
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  const watcher = startCli(
    t,
    ["watch", "--interval", "30", "--poll", "0.1", "--backoff-cap", "60"],
    { cwd: fleet },
  );
  await waitForBeacon(fleet, 30_000);

  writeTurnEnd(fleet, "t1");
  const code = await watcher.waitForExit(30_000);
  assert.equal(code, 0, `watcher did not exit 0: ${watcher.stderr()}`);
  assert.equal(watcher.stdout(), "signal t1 turn-end\n");
  assert.equal(watcher.stderr(), "");
});

test("a resident watcher is silent on heartbeats unless bounded", async (t) => {
  // Criterion 3. Three 0.4s base intervals with doubling is 2.8s, and the
  // old form slept a flat 3000ms and then required the ordinal to have
  // moved past 1. That is a wall-clock budget standing in for a fact the
  // fleet records on disk, and the 200ms it had left over had to cover the
  // watcher's spawn (rule 2 above). It now WAITS FOR THE FACT: three
  // heartbeats have ticked, bounded at 30s, and the watcher stayed silent
  // across all three. The wait is also the stronger statement, because the
  // old form never asserted that any heartbeat had happened at all.
  const fleet = initFleet(t);
  const idle = startCli(
    t,
    ["watch", "--interval", "0.4", "--poll", "0.1", "--backoff-cap", "10"],
    { cwd: fleet },
  );
  const ticked = await waitForCadenceStreak(fleet, 3, 30_000, idle);
  assert.ok(ticked >= 3, `the idle watcher ticked only ${String(ticked)} times`);
  assert.equal(idle.exitCode(), null, `watcher exited: ${idle.stderr()}`);
  assert.equal(idle.stdout(), "", "an unbounded watcher exited on a heartbeat");
  idle.stop();
  // Wait for it to be GONE before reading the schedule it left behind: two
  // watchers on one fleet would make the ordinal below a race, and kill(2)
  // returning is not the process having exited.
  await idle.waitForExit(20_000);
  const streakAfterIdle = cadenceStreak(fleet);
  assert.notEqual(streakAfterIdle, undefined, "the idle watcher left no cadence file");

  // The bound is on THIS RUN, and the schedule it reports is the fleet's
  // on-disk one: this second run continues the streak the idle run left
  // behind (FM-006) while still stopping after one tick of its own.
  const continued = startCli(
    t,
    [
      "watch",
      "--interval",
      "0.3",
      "--poll",
      "0.1",
      "--backoff-cap",
      "10",
      "--max-heartbeats",
      "1",
    ],
    { cwd: fleet },
  );
  const continuedCode = await continued.waitForExit(30_000);
  assert.equal(continuedCode, 0, `bounded watcher did not exit 0: ${continued.stderr()}`);
  // EXACT, not "some number above one": the streak this run continues from
  // was read off the fleet a moment ago, with the previous watcher already
  // dead, so the ordinal it must print is known rather than bounded.
  assert.equal(
    continued.stdout(),
    `heartbeat ${String((streakAfterIdle as number) + 1)}\n`,
    "the heartbeat ordinal restarted instead of continuing the fleet's schedule",
  );

  const virgin = initFleet(t);
  const bounded = startCli(
    t,
    [
      "watch",
      "--interval",
      "0.3",
      "--poll",
      "0.1",
      "--backoff-cap",
      "10",
      "--max-heartbeats",
      "2",
    ],
    { cwd: virgin },
  );
  const code = await bounded.waitForExit(30_000);
  assert.equal(code, 0, `bounded watcher did not exit 0: ${bounded.stderr()}`);
  assert.equal(bounded.stdout(), "heartbeat 2\n");
});

test("watch --once on a virgin fleet is silent and single-pass parity holds", (t) => {
  // Criterion 4, both halves.
  const fleet = initFleet(t);
  openTask(fleet, "t1");

  const virgin = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(virgin.status, 3, virgin.stderr);
  assert.equal(virgin.stdout, "");
  assert.equal(virgin.stderr, "");

  writeTurnEnd(fleet, "t1");
  const pending = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(pending.status, 0, pending.stderr);
  assert.equal(pending.stdout, "signal t1 turn-end\n");
});

test("the heartbeat schedule is on disk and shared by single passes", (t) => {
  // Criterion 5. NO REAL-CLOCK WAIT (rule 3 above), and removing it is
  // most of the point of this round. The old form slept 500ms past a 400ms
  // base interval and then required the pass AFTER the heartbeat to still
  // be inside an 800ms window that contained a whole CLI spawn, an exit
  // and another CLI spawn. Nothing measured that cost; when it exceeded
  // 800ms the third pass surfaced "heartbeat 2" and the assertion read
  // `actual: 0`.
  //
  // The elapsed time is STAGED ON DISK instead of waited for, which
  // exercises the same comparison (nextHeartbeatDueMs parses
  // lastHeartbeatAt out of the cadence file and adds the interval), and
  // the base interval is 30 seconds, so the not-due pass carries about
  // sixty seconds of margin instead of eight hundred milliseconds.
  //
  // WIDENING THE BUDGET WOULD ALSO WIDEN THE DEFECT'S ESCAPE, so the
  // property the not-due pass was standing in for is asserted directly at
  // the end: the heartbeat MOVED lastHeartbeatAt off the staged timestamp.
  // A heartbeat that left the schedule where it found it reddens there
  // with 240 seconds of margin, and reddens the not-due pass too.
  const fleet = initFleet(t);
  const cadenceFile = join(fleet, "state", "watcher.cadence.json");

  // A virgin fleet initializes the schedule and is not immediately due.
  // Both halves are decided inside one process against one `now`, so this
  // pass carries no clock budget at all.
  const init = runCli(["watch", "--once", "--interval", "30"], { cwd: fleet });
  assert.equal(init.status, 3, init.stderr);
  assert.equal(init.stdout, "");
  const initialised = JSON.parse(readFileSync(cadenceFile, "utf8")) as CadenceSnapshot;
  assert.equal(initialised.backoffStreak, 0);

  // Five minutes of elapsed time, staged rather than waited for.
  const stagedAt = new Date(Date.now() - 300_000).toISOString();
  writeFileSync(
    cadenceFile,
    `${JSON.stringify({ lastHeartbeatAt: stagedAt, backoffStreak: 0 }, null, 2)}\n`,
  );

  const due = runCli(["watch", "--once", "--interval", "30"], { cwd: fleet });
  assert.equal(due.status, 0, due.stderr);
  assert.equal(due.stdout, "heartbeat 1\n");

  const immediate = runCli(["watch", "--once", "--interval", "30"], { cwd: fleet });
  assert.equal(immediate.status, 3, immediate.stderr);
  assert.equal(immediate.stdout, "");

  // The schedule survived three separate processes, so it is not in
  // process memory (FM-006, FM-045).
  const cadence = JSON.parse(readFileSync(cadenceFile, "utf8")) as CadenceSnapshot;
  assert.equal(cadence.backoffStreak, 1);
  assert.ok(
    Date.parse(cadence.lastHeartbeatAt) > Date.parse(stagedAt) + 240_000,
    `the heartbeat did not advance lastHeartbeatAt off the staged ${stagedAt}: ` +
      `${cadence.lastHeartbeatAt}`,
  );
});

test("a surfaced turn-end is not surfaced again by the next pass", (t) => {
  // Criterion 6.
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  writeTurnEnd(fleet, "t1");

  const first = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, "signal t1 turn-end\n");

  const second = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(second.status, 3, second.stderr);
  assert.equal(second.stdout, "");

  // The suppression is the seen record, and it carries the identity of
  // the file that was surfaced: a NEW turn-end for the same task is a
  // new wake, not a duplicate.
  writeTurnEnd(fleet, "t1", 7);
  const third = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(third.status, 0, third.stderr);
  assert.equal(third.stdout, "signal t1 turn-end\n");
});

test("two passes racing on one turn-end surface it exactly once", async (t) => {
  // Criterion 7, in two parts.
  //
  // Part A stages the interleave deterministically with the hold seam:
  // pass A stops after deciding to surface and before touching the seen
  // state, pass B runs to completion inside that window, and A is then
  // released. This is the only way to place the two passes inside the
  // window on purpose rather than by luck.
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  writeTurnEnd(fleet, "t1");
  const barrier = join(fleet, "state", "race-barrier");

  const held = startCli(t, ["watch", "--once"], {
    cwd: fleet,
    env: { ...baseEnv(), TIPHYS_WATCH_TEST_HOLD: barrier },
  });
  await waitForFile(`${barrier}.observed`, 10_000);

  const other = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(other.status, 0, other.stderr);
  assert.equal(other.stdout, "signal t1 turn-end\n");

  writeFileSync(barrier, "");
  const heldCode = await held.waitForExit(10_000);
  assert.equal(
    readFileSync(`${barrier}.released`, "utf8").trim(),
    "barrier appeared",
    "the hold seam did not actually hold, so no interleave was staged",
  );
  assert.equal(heldCode, 3, `the loser did not report no-wake: ${held.stderr()}`);
  assert.equal(held.stdout(), "", "the same turn-end was surfaced twice");
});

test("a resident watcher and a concurrent single pass never drop a wake", async (t) => {
  // Criterion 7, part B: the plan's literal shape, a resident watcher
  // and a concurrent --once. This one is a real race and its result is
  // reported as a rate, not as a proof.
  //
  // The GUARANTEED property under this real (unstaged) race is
  // duplicate-not-drop (FM-046): the turn-end MUST reach at least one
  // channel and no pass may lose it to a loud failure. STRICT exclusivity
  // (exactly one channel) is NOT guaranteed here and asserting it flaked
  // under load. The turn-end file is written non-atomically (src/hooks.ts:
  // a plain writeFileSync, no stage-then-rename), so a resident poll can
  // read it MID-WRITE (size 0 or partial) and compute a SignalIdentity
  // {size, mtimeMs, signature} distinct from the completed file's. The
  // seen-state then legitimately admits the transient and the completed
  // file as two different turn-end EDGES (the at-most-once rule is per
  // identity, src/watcher.ts), so both channels can surface the wake. That
  // is a safe duplicate, not a dropped wake, and the O_EXCL seen mutex is
  // working exactly as designed. Exactly-once for a STABLE identity is
  // proven deterministically by the staged hold-seam test above ("two
  // passes racing on one turn-end surface it exactly once").
  const rounds = 5;
  let residentSurfacings = 0;
  let onceSurfacings = 0;
  let dropRounds = 0;
  let duplicateRounds = 0;
  for (let round = 0; round < rounds; round += 1) {
    const fleet = initFleet(t);
    openTask(fleet, "t1");
    const watcher = startCli(
      t,
      ["watch", "--interval", "30", "--poll", "0.05", "--backoff-cap", "60"],
      { cwd: fleet },
    );
    await waitForBeacon(fleet, 30_000);

    writeTurnEnd(fleet, "t1");
    const once = runCli(["watch", "--once"], { cwd: fleet });
    let residentCode = await watcher.waitForExit(3000);
    if (once.status === 3 && watcher.stdout() === "") {
      // --once ceded, so the resident is the only channel left and it must
      // be about to surface. Reading an empty stdout here merely because a
      // 3000ms budget expired would report a DROP that did not happen, so
      // the wait gets a real bound in exactly the case that needs one.
      // When --once WON, the resident never exits at all and the short
      // budget is what keeps this test's five rounds cheap.
      residentCode = await watcher.waitForExit(30_000);
    }
    const residentLine = watcher.stdout();
    watcher.stop();

    const onceSurfaced = once.stdout === "signal t1 turn-end\n";
    const residentSurfaced = residentLine === "signal t1 turn-end\n";

    // No DROP: the wake must reach at least one channel. This is the arm
    // that reddens against the historical suppression bug where both passes
    // died between advancing the seen state and printing, so NEITHER
    // surfaced it (src/watcher.ts, the atomicWrite unique-stage fix).
    assert.ok(
      onceSurfaced || residentSurfaced,
      `round ${String(round)}: the turn-end was DROPPED, surfaced by neither ` +
        `pass: once=${JSON.stringify(once.stdout)} (exit ${String(once.status)}) ` +
        `resident=${JSON.stringify(residentLine)} (exit ${String(residentCode)})`,
    );

    // No wake lost to a loud failure: --once is either a clean surface (0)
    // or a clean no-wake because it ceded to the resident (3), never a
    // stuck/error exit (1).
    assert.ok(
      once.status === 0 || once.status === 3,
      `round ${String(round)}: --once failed loudly (exit ${String(once.status)}) ` +
        `instead of surfacing or ceding: ${once.stderr}`,
    );
    assert.equal(
      once.status === 0,
      onceSurfaced,
      `round ${String(round)}: --once exit ${String(once.status)} disagreed ` +
        `with its stdout ${JSON.stringify(once.stdout)}`,
    );
    if (residentSurfaced) {
      // A resident that surfaced a wake prints the one line and exits 0.
      assert.equal(
        residentCode,
        0,
        `round ${String(round)}: resident surfaced but exited ${String(residentCode)}: ` +
          watcher.stderr(),
      );
    }

    if (onceSurfaced) {
      onceSurfacings += 1;
    }
    if (residentSurfaced) {
      residentSurfacings += 1;
    }
    if (onceSurfaced && residentSurfaced) {
      duplicateRounds += 1;
    }
    if (!onceSurfaced && !residentSurfaced) {
      dropRounds += 1;
    }
  }
  // Every round surfaced the wake somewhere; none was dropped. The
  // duplicate count is informational (the safe direction) and carries no
  // assertion of its own.
  assert.equal(
    dropRounds,
    0,
    `${String(dropRounds)} of ${String(rounds)} rounds dropped the wake entirely`,
  );
  assert.ok(
    onceSurfacings + residentSurfacings >= rounds,
    `fewer surfacings (${String(onceSurfacings + residentSurfacings)}) than ` +
      `rounds (${String(rounds)}); duplicates=${String(duplicateRounds)}`,
  );
});

test("a no-wake single pass strictly advances the beacon", (t) => {
  // Criterion 8, including two passes inside the same millisecond: the
  // advance is strict, so a reader can always compare two beacons.
  const fleet = initFleet(t);
  const first = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(first.status, 3, first.stderr);
  const firstStamp = beaconStampMs(fleet);
  assert.notEqual(firstStamp, undefined);

  for (let i = 0; i < 3; i += 1) {
    const previous = beaconStampMs(fleet) as number;
    const pass = runCli(["watch", "--once"], { cwd: fleet });
    assert.equal(pass.status, 3, pass.stderr);
    assert.equal(pass.stdout, "");
    const current = beaconStampMs(fleet) as number;
    assert.ok(
      current > previous,
      `no-wake pass did not advance the beacon: ${String(previous)} then ${String(current)}`,
    );
  }
});

test("an open task past its executor deadline with no turn-end is stale", (t) => {
  // Criterion 9, staged deterministically: the deadline is written in
  // the past, so no wait is needed.
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  writeFileSync(
    join(fleet, "tasks", "t1", "executor.json"),
    `${JSON.stringify(
      {
        adapter: "subprocess",
        launchedAt: new Date(Date.now() - 120_000).toISOString(),
        deadline: new Date(Date.now() - 60_000).toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  const pass = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(pass.stdout, "stale t1 deadline\n");

  // A deadline in the FUTURE is not stale, so the detector is not just
  // reporting on the presence of a launch record.
  writeFileSync(
    join(fleet, "tasks", "t1", "executor.json"),
    `${JSON.stringify(
      {
        adapter: "subprocess",
        launchedAt: new Date().toISOString(),
        deadline: new Date(Date.now() + 600_000).toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  const future = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(future.status, 3, future.stderr);
  assert.equal(future.stdout, "");

  // A turn-end outranks the deadline: a task that finished late is
  // finished, not abandoned.
  writeFileSync(
    join(fleet, "tasks", "t1", "executor.json"),
    `${JSON.stringify(
      {
        adapter: "subprocess",
        launchedAt: new Date(Date.now() - 120_000).toISOString(),
        deadline: new Date(Date.now() - 60_000).toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  writeTurnEnd(fleet, "t1");
  const finished = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(finished.status, 0, finished.stderr);
  assert.equal(finished.stdout, "signal t1 turn-end\n");
});

test("a spawn stopped mid-payload is detected as an abandoned task", async (t) => {
  // Tuition T-002, and the plan's designed route for it (PR-207). The
  // state under test is the real one, not a hand-built file set: a real
  // spawn is stopped while its payload is running, which in M1 is the
  // only way a task can be left open with no turn-end and a dirty
  // worktree (M1-P4's own note to this phase).
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

  const marker = join(tmp, "payload-started");
  const payload = join(tmp, "payload.sh");
  writeFileSync(
    payload,
    `#!/bin/sh
# Leave real uncommitted work in the worktree, announce that the payload
# is running, then stay alive long enough to be stopped with it.
echo "half-done work" > leavings.txt
: > ${JSON.stringify(marker)}
sleep 5
`,
    { mode: 0o755 },
  );

  const spawning = startCli(
    t,
    [
      "spawn",
      "--task",
      "ab1",
      "--project",
      clone,
      "--brief",
      briefFile,
      "--shape",
      "ship",
      "--exec",
      payload,
      "--deadline",
      "1",
    ],
    { cwd: fleet },
  );
  await waitForFile(marker, 30_000);

  // Stop the spawn process itself, which is the T-002 incident shape:
  // the work is on disk, no turn-end was ever written, and nothing in
  // the fleet knows the task will never finish.
  spawning.proc.kill("SIGKILL");
  await spawning.waitForExit(10_000);

  const taskDir = join(fleet, "tasks", "ab1");
  const worktree = join(fleet, "worktrees", "ab1");
  assert.ok(!existsSync(join(taskDir, "turn-end")), "a turn-end file was written");
  const meta = JSON.parse(readFileSync(join(taskDir, "meta.json"), "utf8")) as {
    status: string;
  };
  assert.equal(meta.status, "open", "the task is not open");
  const dirty = gitOk(worktree, ["status", "--porcelain"]);
  assert.notEqual(dirty, "", "the worktree carries no uncommitted work");
  const record = JSON.parse(readFileSync(join(taskDir, "executor.json"), "utf8")) as {
    deadline?: string;
  };
  assert.notEqual(record.deadline, undefined, "the launch record carries no deadline");

  // Real-clock wait, bounded: the deadline was one second out and it has
  // to actually pass before the condition exists.
  const deadlineMs = Date.parse(record.deadline as string);
  while (Date.now() <= deadlineMs) {
    await sleep(50);
  }

  const pass = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(pass.stdout, "stale ab1 deadline\n");
});

test("a requested one-shot check is surfaced once and consumed", (t) => {
  const fleet = initFleet(t);
  writeFileSync(join(fleet, "state", "check-request"), "gates\n");

  const first = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, "check gates\n");
  assert.ok(
    !existsSync(join(fleet, "state", "check-request")),
    "the request was not consumed",
  );

  const second = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(second.status, 3, second.stderr);
  assert.equal(second.stdout, "");
});

test("watcher currency never comes from the wake log", (t) => {
  // Plan constraint C-1. The wake log is append-only and is written by
  // every surfaced wake; if any decision were read off its tail, garbage
  // in it would change the outcome. It does not.
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  writeTurnEnd(fleet, "t1");
  const lastWake = join(fleet, "state", "last-wake.json");
  writeFileSync(lastWake, "not json at all\n{\"line\":\"signal t1 turn-end\"}\n");

  const surfaced = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(surfaced.status, 0, surfaced.stderr);
  assert.equal(surfaced.stdout, "signal t1 turn-end\n");

  // And with the log deleted, the SUPPRESSION still holds, because it
  // lives in the seen state and not in the log.
  rmSync(lastWake);
  const suppressed = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(suppressed.status, 3, suppressed.stderr);
  assert.equal(suppressed.stdout, "");
});

test("the watcher imports no network client anywhere in its graph", (t) => {
  // Criterion 13: zero tokens idle is structural, not a promise.
  void t;
  const graph = new Set<string>();
  const queue = [join(srcDir, "watcher.ts")];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (graph.has(file)) {
      continue;
    }
    graph.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
      queue.push(resolve(dirname(file), match[1] as string));
    }
  }
  // Anti-vacuity: the walk really did follow the imports.
  assert.ok(graph.size >= 4, `import graph too small: ${[...graph].join(", ")}`);
  assert.ok(graph.has(join(srcDir, "liveness.ts")));
  assert.ok(graph.has(join(srcDir, "task.ts")));

  for (const file of graph) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /from\s+"node:(http|https|http2|net|tls|dgram|dns)"/,
      `${file} imports a network module`,
    );
    assert.doesNotMatch(source, /\bfetch\s*\(/, `${file} calls fetch`);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket/, `${file} opens a socket`);
    assert.doesNotMatch(
      source,
      /require\(\s*["'](node:)?(http|https|net|tls|undici|axios|node-fetch)/,
      `${file} requires a network client`,
    );
  }
});

test("the watcher has no process identity and no way to outlive its caller", (t) => {
  // Criterion 14: C-2 and C-3, structural inspection over the shipped
  // sources of this phase.
  void t;
  for (const name of ["watcher.ts", "liveness.ts", join("commands", "watch.ts")]) {
    const file = join(srcDir, name);
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bpid\b/i, `${name} carries a process identity`);
    assert.doesNotMatch(source, /process\.kill/, `${name} probes a process`);
    assert.doesNotMatch(source, /\bkill\s*\(/, `${name} probes a process`);
    assert.doesNotMatch(source, /\/proc\b/, `${name} reads /proc`);
    assert.doesNotMatch(source, /signal\s*0/, `${name} probes with signal 0`);
    assert.doesNotMatch(source, /SIG[A-Z]{3,}/, `${name} uses a process signal`);
    assert.doesNotMatch(source, /detached\s*:/, `${name} detaches a process`);
    assert.doesNotMatch(source, /\.unref\s*\(/, `${name} unrefs a handle`);
    assert.doesNotMatch(source, /daemon/i, `${name} mentions a daemon flag`);
    assert.doesNotMatch(source, /background/i, `${name} mentions a background flag`);
  }
  // The command's own flag surface: exactly the documented five.
  const command = readFileSync(join(srcDir, "commands", "watch.ts"), "utf8");
  const flags = [...command.matchAll(/flag === "(--[a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(flags)].sort(),
    ["--backoff-cap", "--interval", "--max-heartbeats", "--once", "--poll"],
  );
});

test("a stranded seen-state claim fails loudly instead of reporting no-wake", async (t) => {
  // FIX ROUND, second reviewer finding 1 (CRITICAL). The dangerous state
  // is a claim file left behind by a pass that stopped inside the window:
  // before the fix every later pass, resident or --once, reported the
  // ordinary no-wake exit 3 for a genuinely pending turn-end, forever,
  // while the beacon kept advancing so the guard saw a healthy fleet.
  //
  // Real-clock wait, bounded and stated: each pass below spends the
  // claim's own 5s bounded wait before it can conclude the claim is
  // stuck, so this test costs about ten seconds.
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  writeTurnEnd(fleet, "t1");
  const claimPath = join(fleet, "state", "watcher.seen.json.mutex");

  // Arm the fleet first, so there IS a beacon to compare against.
  assert.equal(runCli(["watch", "--once"], { cwd: fleet }).status, 0);
  writeTurnEnd(fleet, "t1", 3);
  const armedBeacon = beaconStampMs(fleet) as number;

  writeFileSync(claimPath, "");
  const stuck = runCli(["watch", "--once"], { cwd: fleet });
  assert.notEqual(stuck.status, 0, "a stuck claim was reported as a wake");
  assert.notEqual(
    stuck.status,
    3,
    `a stuck claim was reported as an ordinary no-wake: ${JSON.stringify(stuck.stderr)}`,
  );
  assert.equal(stuck.stdout, "");
  assert.equal(
    stuck.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${stuck.stderr}`,
  );
  assert.match(stuck.stderr, /supervision is stuck/);
  assert.ok(
    stuck.stderr.includes(claimPath),
    `the reason does not name the claim file: ${stuck.stderr}`,
  );

  // The turn-end is still pending and the seen state was not advanced,
  // so nothing was consumed by the failure.
  assert.ok(existsSync(join(fleet, "tasks", "t1", "turn-end")));

  // And the beacon did NOT advance: supervision did not execute, so the
  // guard must be able to see it stop. This is the half that makes the
  // failure reachable by an operator who never reads the watcher's
  // stderr.
  assert.equal(
    beaconStampMs(fleet),
    armedBeacon,
    "a pass that could not supervise still refreshed the beacon",
  );

  // Resident mode behaves the same way rather than looping in silence.
  const resident = startCli(t, ["watch", "--interval", "30", "--poll", "0.1"], {
    cwd: fleet,
  });
  const residentCode = await resident.waitForExit(20_000);
  assert.notEqual(residentCode, 0, "the resident watcher treated a stuck claim as a wake");
  assert.notEqual(residentCode, 3);
  assert.equal(resident.stdout(), "");
  assert.match(resident.stderr(), /supervision is stuck/);

  // Removing the debris (the remedy the reason line prints) restores the
  // pending wake: nothing was lost, it was blocked.
  rmSync(claimPath);
  const recovered = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(recovered.stdout, "signal t1 turn-end\n");
});

test("a task record that cannot be read is surfaced, not skipped", (t) => {
  // FIX ROUND, second reviewer finding 2 (HIGH), watcher half. A
  // meta.json that exists and does not parse used to make the task
  // invisible to the watcher: its turn-end would never be surfaced and
  // nothing said so.
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  writeFileSync(
    join(fleet, "tasks", "t1", "meta.json"),
    '{"id":"t1","status":"open", "branch": "task/t1"',
  );

  const pass = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(pass.stdout, "stale t1 meta\n");

  // A task directory with NO meta.json at all is a different state (a
  // spawn in progress or a rollback residue) and is not surfaced.
  rmSync(join(fleet, "tasks", "t1"), { recursive: true, force: true });
  mkdirSync(join(fleet, "tasks", "t2"), { recursive: true });
  const quiet = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(quiet.status, 3, quiet.stderr);
  assert.equal(quiet.stdout, "");
});

test("the heartbeat ordinal is recomputed from the cadence file", async (t) => {
  // FIX ROUND, CR-505. The dangerous state is a resident watcher ticking
  // from a cadence snapshot taken before its wait, which overwrites a
  // backoff reset written inside that window by a concurrent single
  // pass. Staged at the library level because the window is
  // sub-millisecond wide in a real resident loop (see the work history).
  const fleet = initFleet(t);
  const fleetPaths = loadFleet(fleet);
  const cadencePath = join(fleet, "state", "watcher.cadence.json");

  // The snapshot a resident loop would be holding.
  const snapshot = { lastHeartbeatAt: new Date(Date.now() - 60_000).toISOString(), backoffStreak: 5 };
  writeFileSync(cadencePath, `${JSON.stringify(snapshot, null, 2)}\n`);

  // A concurrent pass surfaces a wake and resets the backoff.
  writeFileSync(
    cadencePath,
    `${JSON.stringify({ lastHeartbeatAt: new Date().toISOString(), backoffStreak: 0 }, null, 2)}\n`,
  );

  // The resident then ticks, holding the stale snapshot.
  const n = heartbeatTick(fleetPaths, snapshot, cadence, Date.now());
  assert.equal(n, 1, "the heartbeat ordinal was computed from a stale snapshot");
  const after = JSON.parse(readFileSync(cadencePath, "utf8")) as { backoffStreak: number };
  assert.equal(after.backoffStreak, 1, "a concurrent backoff reset was overwritten");
});

test("watch usage errors exit 64 and a non-fleet cwd exits 1", (t) => {
  const fleet = initFleet(t);
  const unknown = runCli(["watch", "--tail"], { cwd: fleet });
  assert.equal(unknown.status, 64);
  assert.match(unknown.stderr, /^usage: tiphys watch /m);

  const bothModes = runCli(["watch", "--once", "--max-heartbeats", "2"], { cwd: fleet });
  assert.equal(bothModes.status, 64);

  const badInterval = runCli(["watch", "--once", "--interval", "0"], { cwd: fleet });
  assert.equal(badInterval.status, 64);

  // A cadence that would make a healthy watcher read as stale is refused
  // with both values named (criterion 12, through the flags).
  const badCadence = runCli(["watch", "--once", "--backoff-cap", "36000"], { cwd: fleet });
  assert.equal(badCadence.status, 64);
  assert.match(badCadence.stderr, /36000000ms/);
  assert.match(badCadence.stderr, /not strictly greater/);

  const outside = runCli(["watch", "--once"], { cwd: makeTempDir(t) });
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /^tiphys watch: not a fleet home: /m);
});

/**
 * FIX ROUND 4 (CR-520). Bound for every child in the blocking-probe
 * witnesses below. It is EXPLICIT and enforced by spawnSync with SIGKILL
 * rather than by the test runner, because the dangerous state these are
 * red against is an INDEFINITE HANG: a regression must fail naming the
 * path it blocked on, never as an unexplained CI timeout.
 */
const BLOCK_PROBE_TIMEOUT_MS = 15_000;

interface BoundedResult extends CliResult {
  /** True when this test's own bound killed the child. */
  timedOut: boolean;
}

function runCliBounded(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): BoundedResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: opts.env ?? baseEnv(),
    timeout: BLOCK_PROBE_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    timedOut:
      (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT",
  };
}

/** Whether this machine can create a named pipe, checked by doing it. */
function fifoUnsupported(): string | false {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p5-watch-fifo-check-"));
  try {
    const made = spawnSync("mkfifo", [join(dir, "probe")]);
    if (made.status === 0) {
      return false;
    }
    return `mkfifo is unavailable here (${String(made.error ?? made.status)}); the blocking-probe witness runs on CI (ubuntu-latest)`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const fifoSkip = fifoUnsupported();

/** One row of the wake-source and state-file inventory, planted one at a time. */
interface BlockRow {
  /** Path relative to the fleet root. */
  where: string;
  /** Whether the fleet needs a pending turn-end to reach this open. */
  needsPendingWake: boolean;
  /** The reader or writer this path reaches, for the failure message. */
  reaches: string;
}

const BLOCK_ROWS: readonly BlockRow[] = [
  { where: "tasks/t1/turn-end", needsPendingWake: false, reaches: "identityOf -> readIfPresent" },
  { where: "tasks/t1/executor.json", needsPendingWake: false, reaches: "deadlineOf -> readIfPresent" },
  { where: "state/check-request", needsPendingWake: false, reaches: "claimCheckRequest -> readIfPresent" },
  { where: "state/watcher.seen.json", needsPendingWake: false, reaches: "readSeenState -> readIfPresent" },
  { where: "state/watcher.cadence.json", needsPendingWake: false, reaches: "readCadenceState -> readIfPresent" },
  { where: "state/watcher.beacon", needsPendingWake: false, reaches: "writeBeacon -> readBeacon and atomicWrite" },
  { where: "state/last-wake.json", needsPendingWake: true, reaches: "appendWakeRecord openSync append" },
];

test(
  "no watcher wake source or state file blocks a pass when it is a named pipe",
  { skip: fifoSkip },
  (t) => {
    // FIX ROUND 4, CR-520 (HIGH), plus state/last-wake.json, which this
    // round derived and no reviewer inventory listed. The dangerous state
    // is an indefinite hang, not a wrong answer: open(2) on a named pipe with no peer blocks in the
    // kernel, for reading AND for writing, and a block is not an
    // exception, so nothing in the module's raise classification reaches
    // it. A previous round put the probe at ONE call site, which closed
    // one of eight paths.
    //
    // A path that WAS in this list is deliberately absent: the staged
    // write used a fixed `${path}.stage` name, and a named pipe there hung
    // every pass. That name is now unique per write (see atomicWrite), so
    // nothing can be pre-planted at it. The hazard is eliminated rather
    // than classified, which is why it carries no row here: a row nothing
    // can ever make red is the CR-540 mistake, not coverage.
    //
    // EVERY ROW GETS ITS OWN WITNESS and the results are COLLECTED rather
    // than asserted one at a time, so a regression names every path it
    // blocked on instead of stopping at the first.
    // One list, three failure kinds, so a regression reports EVERY row it
    // broke instead of stopping at the first.
    const failures: string[] = [];

    for (const row of BLOCK_ROWS) {
      const fleet = initFleet(t);
      openTask(fleet, "t1");
      if (row.needsPendingWake) {
        writeTurnEnd(fleet, "t1");
      }
      const target = join(fleet, row.where);
      mkdirSync(dirname(target), { recursive: true });
      assert.equal(
        spawnSync("mkfifo", [target]).status,
        0,
        `could not create the named pipe at ${target}`,
      );

      const watched = runCliBounded(["watch", "--once"], { cwd: fleet });
      if (watched.timedOut) {
        failures.push(
          `BLOCKED IN THE KERNEL, killed after ${String(BLOCK_PROBE_TIMEOUT_MS)}ms: ` +
            `${row.where} (${row.reaches}) was opened before it was probed`,
        );
        continue;
      }
      // Loud, and of the same character as the directory case that always
      // worked: nonzero exit, exactly one reason line, and the line names
      // the path so an operator knows what to remove.
      const lines = watched.stderr.trim() === "" ? [] : watched.stderr.trim().split("\n");
      if (watched.status !== 1 || lines.length !== 1 || watched.stdout !== "") {
        failures.push(
          `ABSORBED INSTEAD OF REPORTED: ${row.where}: exit ${String(watched.status)}, ` +
            `stdout ${JSON.stringify(watched.stdout)}, stderr ${JSON.stringify(watched.stderr)}`,
        );
      } else if (!(lines[0] as string).includes(target)) {
        failures.push(`REASON LINE DID NOT NAME THE PATH: ${row.where}: ${lines[0] as string}`);
      }
    }

    assert.deepEqual(
      failures,
      [],
      `a named pipe at a watcher path was not handled loudly and without ` +
        `blocking:\n  ${failures.join("\n  ")}`,
    );
  },
);

test(
  "a check request that cannot be consumed is left in place rather than destroyed",
  { skip: fifoSkip },
  (t) => {
    // FIX ROUND 4, CR-520's ordering half. The rename in claimCheckRequest
    // IS the exclusion, so it is destructive by design: once it has run,
    // nothing else can find the request. Reading after it and probing
    // after that meant a named pipe at state/check-request was first
    // CONSUMED and then blocked forever, so the fleet lost its wake source
    // and reported nothing at all. The probe now precedes the rename.
    const fleet = initFleet(t);
    openTask(fleet, "t1");
    const request = join(fleet, "state", "check-request");
    assert.equal(spawnSync("mkfifo", [request]).status, 0, "could not create the named pipe");

    const watched = runCliBounded(["watch", "--once"], { cwd: fleet });
    assert.equal(
      watched.timedOut,
      false,
      `the watcher blocked on the check request at ${request} and was killed after ` +
        `${String(BLOCK_PROBE_TIMEOUT_MS)}ms`,
    );
    assert.equal(watched.status, 1, watched.stderr);
    assert.ok(watched.stderr.includes(request), watched.stderr);

    assert.equal(
      existsSync(request),
      true,
      "the wake source was consumed by a pass that could not read it",
    );
    assert.equal(
      existsSync(`${request}.taken`),
      false,
      "the request was renamed by a pass that could not read it",
    );
  },
);

test("two single passes released together surface one turn-end", async (t) => {
  // FIX ROUND 4, CR-540 (MEDIUM). Criterion 7's two registered tests stay
  // GREEN when claimSignal's claim file loses its exclusive-open flag
  // ("wx" -> "w"), so neither of them guards the mechanism that actually
  // implements the criterion for two independent processes. Neither
  // reaches the window: the deterministic one holds A while B runs to
  // completion and releases its claim BEFORE A resumes, so A contends
  // with nothing and is saved by the identity comparison instead; the
  // probabilistic one is one-sided because the resident is already armed.
  //
  // This is the construction that DOES reach it: two --once processes both
  // parked at the hold seam, then released by ONE file write, so both
  // attempt the exclusive open at as close to the same instant as the OS
  // schedules them. The shipped source is correct and needs no change;
  // what was missing was a test that would notice if it stopped being.
  //
  // The two processes wait on DIFFERENT barrier paths so each writes its
  // own .observed marker and this test can prove BOTH are parked before
  // releasing either. The second barrier is a symlink to the first, so the
  // single write that creates the first releases both at once.
  //
  // WHY ROUNDS, AND WHAT THAT COSTS. Correct behavior here is
  // deterministic: with the exclusive open in place exactly one pass can
  // ever win, whatever the interleave. The FAILURE is not: two passes
  // duplicate only when both read the seen state before either writes it,
  // and the hold seam's own 5ms poll spreads their resume times across
  // that window, so one round catches the weakened flag about a third of
  // the time (measured: 1 red in 3 runs). Rounds are how the probability
  // of missing it is driven down; the measured rate for this count is
  // recorded in the work history rather than asserted here.
  const rounds = 12;
  for (let round = 0; round < rounds; round += 1) {
    const fleet = initFleet(t);
    openTask(fleet, "t1");
    writeTurnEnd(fleet, "t1");
    const barrierA = join(fleet, "state", "dual-barrier");
    const barrierB = join(fleet, "state", "dual-barrier-link");
    symlinkSync(barrierA, barrierB);

    const first = startCli(t, ["watch", "--once"], {
      cwd: fleet,
      env: { ...baseEnv(), TIPHYS_WATCH_TEST_HOLD: barrierA },
    });
    const second = startCli(t, ["watch", "--once"], {
      cwd: fleet,
      env: { ...baseEnv(), TIPHYS_WATCH_TEST_HOLD: barrierB },
    });
    await waitForFile(`${barrierA}.observed`, 15_000);
    await waitForFile(`${barrierB}.observed`, 15_000);

    // One write. Both passes are already parked, polling for their own
    // barrier path, and barrierB resolves to barrierA.
    writeFileSync(barrierA, "");

    const firstCode = await first.waitForExit(20_000);
    const secondCode = await second.waitForExit(20_000);
    assert.equal(
      readFileSync(`${barrierA}.released`, "utf8").trim(),
      "barrier appeared",
      `round ${String(round)}: the first pass was never held, so no release was staged`,
    );
    assert.equal(
      readFileSync(`${barrierB}.released`, "utf8").trim(),
      "barrier appeared",
      `round ${String(round)}: the second pass was never held, so no release was staged`,
    );

    const surfaced = [first.stdout(), second.stdout()].filter(
      (line) => line === "signal t1 turn-end\n",
    );
    assert.equal(
      surfaced.length,
      1,
      `round ${String(round)}: the same turn-end was surfaced ${String(surfaced.length)} ` +
        `times by two simultaneously released passes: ` +
        `first=${JSON.stringify(first.stdout())} (exit ${String(firstCode)}, ` +
        `${JSON.stringify(first.stderr())}) second=${JSON.stringify(second.stdout())} ` +
        `(exit ${String(secondCode)}, ${JSON.stringify(second.stderr())})`,
    );
    const codes = [firstCode, secondCode].sort((a, b) => Number(a) - Number(b));
    assert.deepEqual(
      codes,
      [0, 3],
      `round ${String(round)}: exactly one pass must win and the other must ` +
        `report no-wake: ${JSON.stringify(codes)}; first stderr ` +
        `${JSON.stringify(first.stderr())} second stderr ${JSON.stringify(second.stderr())}`,
    );
  }
});

test("a pass stages its state writes under a name no other pass can collide with", (t) => {
  // FIX ROUND 4, the defect this round's own CR-540 witness uncovered.
  // atomicWrite used a FIXED `${path}.stage`, so two concurrent passes
  // wrote one temporary: the first renamed it away and the second's rename
  // died with a raw ENOENT. Measured on the pre-round head with two passes
  // released together onto one pending turn-end, the pass that had ALREADY
  // advanced the seen state died on its beacon write before anything was
  // printed, and the other reported no-wake, so NEITHER surfaced the wake
  // and it was suppressed forever.
  //
  // The race itself can only be witnessed probabilistically (the
  // dual-release test above does that, and the work history records the
  // measured rate). THIS test witnesses the property that removes it, and
  // does so deterministically: the old, predictable stage path is no
  // longer used at all, so an entry sitting there cannot stop a pass.
  const fleet = initFleet(t);
  openTask(fleet, "t1");
  const oldStage = join(fleet, "state", "watcher.beacon.stage");
  mkdirSync(oldStage);

  const watched = runCli(["watch", "--once"], { cwd: fleet });
  assert.equal(
    watched.status,
    3,
    `a pass used the predictable stage path ${oldStage}: ${watched.stderr}`,
  );
  assert.equal(watched.stderr, "", watched.stderr);
  assert.notEqual(beaconStampMs(fleet), undefined, "no beacon was written");

  // The stray is left exactly where it was: nothing here reaches for it.
  assert.equal(existsSync(oldStage), true, "the pass touched the stale stage path");
});
