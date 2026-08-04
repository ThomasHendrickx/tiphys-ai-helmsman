import { readFileSync, readdirSync } from "node:fs";
import type { Fleet } from "./fleet.ts";
import { readTaskMeta } from "./task.ts";

/**
 * Liveness guard and the one cadence configuration both halves of this
 * phase share (kernel plan v1, M1-P5 step 2; R-079, R-095; PR-009,
 * PR-206; plan constraint C-2).
 *
 * WHAT LIVENESS MEANS HERE. Freshness of the beacon FILE, and nothing
 * else. This module never asks the operating system about any running
 * program, never inspects a process table, and holds no identity of any
 * kind (plan constraint C-2, FM-053). "Supervision is alive" means "a
 * watcher evaluation wrote state/watcher.beacon recently enough", which
 * is true in exactly the same way for a resident watcher and for an
 * external scheduler driving watch --once (DR-0007, PR-206).
 *
 * WHAT THE GUARD IS FOR (R-079). Supervision must never silently
 * disappear while work is in flight. So the predicate has TWO halves and
 * both are load-bearing: at least one OPEN task (read from the C-1 state
 * authority, tasks/<id>/meta.json status, never from a log tail) AND a
 * beacon that is absent or older than the threshold. A fleet with no
 * open task cannot be stale, because there is nothing to supervise; a
 * fleet with open tasks and a silent watcher is exactly the T-002
 * incident shape, and the guard says so.
 *
 * THE PR-009 INVARIANT, enforced at load. A healthy resident watcher
 * writes the beacon on its heartbeat schedule, which backs off by
 * doubling up to a cap, and it notices that a heartbeat is due only at
 * its next poll tick. The oldest a healthy beacon can therefore be is
 * one backoff cap plus one poll interval. The stale threshold must be
 * strictly greater than that sum or a perfectly healthy idle watcher
 * reads as stale, so loadCadence refuses any configuration that
 * violates it, naming both values. In --once-only operation the same
 * threshold additionally bounds the acceptable external trigger period:
 * a scheduler must fire at least as often as the threshold to keep the
 * fleet fresh (PR-206), which is an operator setting, not something the
 * kernel can enforce.
 *
 * WARN, NEVER BLOCK (blueprint liveness-guard contract). The guard's
 * consumers (spawn, teardown, doctor) print one stderr line containing
 * "watcher stale" and then do exactly what they would have done anyway.
 * Because of that, guard() is TOTAL: every filesystem read it performs
 * is wrapped, and a raised error is classified as "this file is not
 * readable", never propagated. A raise inside an advisory must not be
 * able to take down the command it is advising, and this project has
 * already paid twice for raises walking past handlers that only
 * understood returned failures (M1-P4 F-1 and F-2). The classification
 * is deliberate in both directions and is stated where it happens.
 */

/** Cadence and freshness, in milliseconds. One authority for both. */
export interface WatchCadence {
  /** First heartbeat interval; it doubles from here (FM-044). */
  baseIntervalMs: number;
  /** How often a resident watcher re-checks its wake sources. */
  pollIntervalMs: number;
  /** Ceiling the doubling heartbeat interval stops at. */
  backoffCapMs: number;
  /** Beacon age at which supervision counts as stale. */
  staleThresholdMs: number;
}

/**
 * Defaults, in seconds. FM-044 is a calibration starting point, not a
 * measured optimum, and these are chosen so the PR-009 invariant holds
 * with room to spare (900 + 15 = 915 < 1200).
 */
export const DEFAULT_BASE_INTERVAL_SECONDS = 60;
export const DEFAULT_POLL_INTERVAL_SECONDS = 15;
export const DEFAULT_BACKOFF_CAP_SECONDS = 900;
export const DEFAULT_STALE_THRESHOLD_SECONDS = 1200;

/**
 * Environment overrides. The watch command also carries --interval,
 * --poll and --backoff-cap flags for a single invocation (the M1-P6
 * harness needs the cadence short); these variables exist because the
 * guard runs inside spawn, teardown and doctor, which have no watch
 * flags, and because a fleet's cadence and its freshness threshold have
 * to agree across all four commands.
 */
export const ENV_BASE_INTERVAL = "TIPHYS_WATCH_INTERVAL_SECONDS";
export const ENV_POLL_INTERVAL = "TIPHYS_WATCH_POLL_SECONDS";
export const ENV_BACKOFF_CAP = "TIPHYS_WATCH_BACKOFF_CAP_SECONDS";
export const ENV_STALE_THRESHOLD = "TIPHYS_WATCH_STALE_SECONDS";

function secondsFromEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallbackSeconds: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") {
    return fallbackSeconds * 1000;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `${key}="${raw}" is not a positive number of seconds`,
    );
  }
  return value * 1000;
}

/**
 * The PR-009 invariant, enforced wherever a cadence is built (at module
 * load for the process-wide one, and again for every set of watch
 * flags). The message names both sides because the operator has to know
 * which of the two to change.
 */
export function assertCadenceInvariant(cadence: WatchCadence): void {
  const floorMs = cadence.backoffCapMs + cadence.pollIntervalMs;
  if (cadence.staleThresholdMs > floorMs) {
    return;
  }
  throw new Error(
    `invalid watcher cadence: stale threshold ${String(cadence.staleThresholdMs)}ms ` +
      `is not strictly greater than backoff cap ${String(cadence.backoffCapMs)}ms plus ` +
      `one poll interval ${String(cadence.pollIntervalMs)}ms (${String(floorMs)}ms), so a ` +
      `watcher idling at maximum backoff would read as stale (PR-009)`,
  );
}

/** Build a cadence from environment overrides, validated. */
export function loadCadence(env: NodeJS.ProcessEnv): WatchCadence {
  const cadence: WatchCadence = {
    baseIntervalMs: secondsFromEnv(env, ENV_BASE_INTERVAL, DEFAULT_BASE_INTERVAL_SECONDS),
    pollIntervalMs: secondsFromEnv(env, ENV_POLL_INTERVAL, DEFAULT_POLL_INTERVAL_SECONDS),
    backoffCapMs: secondsFromEnv(env, ENV_BACKOFF_CAP, DEFAULT_BACKOFF_CAP_SECONDS),
    staleThresholdMs: secondsFromEnv(
      env,
      ENV_STALE_THRESHOLD,
      DEFAULT_STALE_THRESHOLD_SECONDS,
    ),
  };
  assertCadenceInvariant(cadence);
  return cadence;
}

/**
 * Apply per-invocation overrides (the watch flags) and re-validate, so
 * a short --backoff-cap or a long one can never quietly break the
 * invariant the guard depends on.
 */
export function withCadenceOverrides(
  base: WatchCadence,
  overrides: Partial<WatchCadence>,
): WatchCadence {
  const cadence: WatchCadence = { ...base, ...overrides };
  assertCadenceInvariant(cadence);
  return cadence;
}

/**
 * The process-wide cadence. Building it at module load is what makes
 * criterion 12's second clause real: importing this module under a
 * configuration that violates the invariant FAILS, with both values in
 * the message, instead of running on with a guard that cries wolf.
 */
export const CADENCE: WatchCadence = loadCadence(process.env);

/** The beacon record (JSON per DR-0006, plan decision D-3). */
export interface BeaconRecord {
  /** ISO-8601 instant of the evaluation that wrote it. */
  writtenAt: string;
  /** Backoff streak at that moment, so a reader can see the cadence. */
  backoffStreak: number;
  /** The heartbeat interval in force at that moment, milliseconds. */
  intervalMs: number;
}

export function renderBeacon(record: BeaconRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/**
 * Read the beacon, or undefined when it is absent, unreadable, or does
 * not parse. All three are the same thing to the guard: no evidence
 * that supervision ran. That is the fail-toward-warning direction, and
 * for an advisory that never blocks it is the right one.
 */
export function readBeacon(beaconPath: string): BeaconRecord | undefined {
  let raw: string;
  try {
    raw = readFileSync(beaconPath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const candidate = parsed as Partial<BeaconRecord>;
  if (
    typeof candidate.writtenAt !== "string" ||
    Number.isNaN(Date.parse(candidate.writtenAt)) ||
    typeof candidate.backoffStreak !== "number" ||
    typeof candidate.intervalMs !== "number"
  ) {
    return undefined;
  }
  return candidate as BeaconRecord;
}

/** What the guard reports (the plan's shape, M1-P5 step 2). */
export interface GuardReport {
  /** Open tasks, counted from meta.json status only (C-1). */
  inFlight: number;
  /** Beacon age in milliseconds, or undefined when there is no beacon. */
  beaconAgeMs: number | undefined;
  /** Open work exists and supervision has not been witnessed recently. */
  stale: boolean;
  /** One line of detail; the warning text when stale. */
  detail: string;
}

/**
 * Count open tasks. A meta.json that does not exist or does not parse is
 * NOT counted: meta.json status is the single current-state authority
 * (C-1) and a file that does not parse carries no status, so counting it
 * would be inventing state. The cost of that choice is bounded (a
 * corrupt meta suppresses an advisory warning, it never suppresses a
 * refusal), and doctor is where an unreadable fleet file is reported.
 */
function countOpenTasks(fleet: Fleet): number {
  let entries: string[];
  try {
    entries = readdirSync(fleet.tasksDir);
  } catch {
    return 0;
  }
  let open = 0;
  for (const id of entries) {
    const meta = readTaskMeta(fleet, id);
    if (meta !== undefined && meta.status === "open") {
      open += 1;
    }
  }
  return open;
}

/**
 * The guard predicate (plan step 2). Total: it never raises, whatever
 * the filesystem does, because its callers use it as an advisory.
 */
export function guard(
  fleet: Fleet,
  nowMs: number = Date.now(),
  cadence: WatchCadence = CADENCE,
): GuardReport {
  const inFlight = countOpenTasks(fleet);
  const beacon = readBeacon(fleet.beaconPath);
  const beaconAgeMs =
    beacon === undefined ? undefined : nowMs - Date.parse(beacon.writtenAt);
  const thresholdSeconds = Math.round(cadence.staleThresholdMs / 1000);

  if (inFlight === 0) {
    return {
      inFlight,
      beaconAgeMs,
      stale: false,
      detail: "no open tasks: nothing is in flight to supervise",
    };
  }
  if (beaconAgeMs === undefined) {
    return {
      inFlight,
      beaconAgeMs,
      stale: true,
      detail:
        `watcher stale: ${String(inFlight)} open task(s) in flight and no readable ` +
        `beacon at ${fleet.beaconPath}; start "tiphys watch" or schedule ` +
        `"tiphys watch --once" at least every ${String(thresholdSeconds)}s`,
    };
  }
  if (beaconAgeMs > cadence.staleThresholdMs) {
    return {
      inFlight,
      beaconAgeMs,
      stale: true,
      detail:
        `watcher stale: ${String(inFlight)} open task(s) in flight and ` +
        `${fleet.beaconPath} is ${String(Math.round(beaconAgeMs / 1000))}s old ` +
        `(threshold ${String(thresholdSeconds)}s); supervision may have stopped`,
    };
  }
  return {
    inFlight,
    beaconAgeMs,
    stale: false,
    detail:
      `watcher fresh: ${String(inFlight)} open task(s) in flight, beacon ` +
      `${String(Math.round(beaconAgeMs / 1000))}s old`,
  };
}

/**
 * The one call site shape spawn, teardown and doctor share: evaluate the
 * guard and, when stale, write exactly one stderr line containing
 * "watcher stale". It returns the report so a caller can use it, and it
 * never changes what the caller does next (warn, never block).
 */
export function warnIfWatcherStale(
  fleet: Fleet,
  write: (text: string) => void = (text) => {
    process.stderr.write(text);
  },
): GuardReport {
  const report = guard(fleet);
  if (report.stale) {
    write(`${report.detail}\n`);
  }
  return report;
}
