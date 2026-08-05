import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
 * both are load-bearing: work in flight (read from the C-1 state
 * authority, tasks/<id>/meta.json status, never from a log tail) AND a
 * beacon that is not evidence of recent supervision. A fleet with no
 * open task cannot be stale, because there is nothing to supervise; a
 * fleet with open tasks and a silent watcher is exactly the T-002
 * incident shape, and the guard says so.
 *
 * NO HEALTH FROM AN ABSENCE OF EVIDENCE (fix round). Both halves are
 * evaluated so that the QUIET outcome is the one that needs evidence,
 * never the loud one:
 *
 *   - in flight counts open tasks AND tasks whose meta.json exists and
 *     cannot be read, because an unreadable record is not evidence that
 *     a task finished (second reviewer, finding 2);
 *   - a beacon that is absent, unparseable, or dated in the FUTURE are
 *     one class, no evidence that supervision ran (CR-501);
 *   - the freshness threshold is at least the cadence the watcher itself
 *     declared in the beacon it wrote, so a differently configured
 *     reader cannot call a healthy watcher stale (CR-503).
 *
 * The first draft of this module got each of these the other way round,
 * and every one of them turned into a fleet that reported health it
 * could not support.
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
  /**
   * Work this fleet cannot be shown to be free of: tasks whose meta.json
   * says open, PLUS tasks whose meta.json exists and cannot be read (see
   * surveyTasks).
   */
  inFlight: number;
  /** How many of inFlight are unreadable records rather than open tasks. */
  unreadable: number;
  /** Beacon age in milliseconds, or undefined when there is no evidence. */
  beaconAgeMs: number | undefined;
  /** Open work exists and supervision has not been witnessed recently. */
  stale: boolean;
  /** One line of detail; the warning text when stale. */
  detail: string;
}

/**
 * How far a beacon may sit in the FUTURE before it stops counting as
 * evidence. Nothing legitimate puts it there: writeBeacon stamps the
 * current time and only ever bumps by a millisecond to keep the advance
 * strict. A beacon well ahead of the local clock means the clock moved
 * backwards under a running watcher (an NTP step, a suspend and resume,
 * a session resumed on another host), and until it is rewritten from the
 * present it proves nothing about whether supervision is still running.
 * The allowance absorbs ordinary jitter and the monotonic bump.
 */
export const BEACON_FUTURE_TOLERANCE_MS = 5000;

export interface TaskSurvey {
  open: number;
  unreadable: number;
}

/**
 * Survey the fleet's tasks. TWO counts, because they are two different
 * facts and collapsing them is how the guard learned to reassure:
 *
 * - open: meta.json parses and says open. The C-1 state authority.
 * - unreadable: meta.json EXISTS and does not parse. This is NOT
 *   evidence that the task is closed, and the original implementation
 *   dropped it from the count, so a fleet with a torn meta.json (which
 *   src/task.ts can produce, since it writes meta with a plain
 *   writeFileSync) reported "nothing is in flight to supervise" while a
 *   real task sat open and unsupervised. Counted as in flight now: the
 *   guard warns about work it cannot prove is finished.
 *
 * A task directory with NO meta.json is neither: there is no record to
 * be torn, and that is the normal transient shape of a spawn in progress
 * or a rollback residue.
 */
export function surveyTasks(fleet: Fleet): TaskSurvey {
  let entries: string[];
  try {
    entries = readdirSync(fleet.tasksDir);
  } catch {
    return { open: 0, unreadable: 0 };
  }
  let open = 0;
  let unreadable = 0;
  for (const id of entries) {
    // A task is a DIRECTORY under tasks/; init's own .gitkeep and any
    // other stray file there is not a task record.
    try {
      if (!statSync(join(fleet.tasksDir, id)).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }
    const meta = readTaskMeta(fleet, id);
    if (meta !== undefined) {
      if (meta.status === "open") {
        open += 1;
      }
      continue;
    }
    try {
      if (statSync(join(fleet.tasksDir, id, "meta.json")).isFile()) {
        unreadable += 1;
      }
    } catch {
      // No meta.json at all, or unstattable: not a torn record.
    }
  }
  return { open, unreadable };
}

/**
 * The guard predicate (plan step 2). Total: it never raises, whatever
 * the filesystem does, because its callers use it as an advisory.
 *
 * NO HEALTH FROM AN ABSENCE OF EVIDENCE. "Not stale" is only said when
 * this function can point at the evidence for it: either nothing is in
 * flight, or a beacon whose recorded instant is in the past and recent
 * enough. A beacon that is absent, unreadable or dated in the future is
 * the same thing here, no evidence that supervision ran, and it is
 * reported as stale whenever work is in flight.
 */
export function guard(
  fleet: Fleet,
  nowMs: number = Date.now(),
  cadence: WatchCadence = CADENCE,
): GuardReport {
  const survey = surveyTasks(fleet);
  const inFlight = survey.open + survey.unreadable;
  const beacon = readBeacon(fleet.beaconPath);
  const rawAgeMs =
    beacon === undefined ? undefined : nowMs - Date.parse(beacon.writtenAt);
  const ahead = rawAgeMs !== undefined && rawAgeMs < -BEACON_FUTURE_TOLERANCE_MS;
  const beaconAgeMs = ahead ? undefined : rawAgeMs;

  /**
   * CR-503: the watcher's OWN declared cadence, recorded in the beacon it
   * wrote, sets the floor for what counts as stale. Without this the
   * threshold is whatever the READING process happens to be configured
   * with, so a guard configured for a short cadence can call a healthy
   * watcher running at a long one stale, which trains an operator to
   * ignore the warning and ends in the same place as a guard that never
   * warns at all.
   */
  const declaredFloorMs =
    beacon === undefined ? 0 : beacon.intervalMs + cadence.pollIntervalMs;
  const thresholdMs = Math.max(cadence.staleThresholdMs, declaredFloorMs);
  const thresholdSeconds = Math.round(thresholdMs / 1000);
  const flight =
    survey.unreadable === 0
      ? `${String(inFlight)} open task(s)`
      : `${String(inFlight)} task(s) (${String(survey.unreadable)} with an ` +
        `unreadable meta.json, which is not evidence they are finished)`;

  if (inFlight === 0) {
    return {
      inFlight,
      unreadable: survey.unreadable,
      beaconAgeMs,
      stale: false,
      detail: "no open tasks: nothing is in flight to supervise",
    };
  }
  if (beaconAgeMs === undefined) {
    const why =
      ahead
        ? `the beacon at ${fleet.beaconPath} is dated ` +
          `${String(Math.round(-(rawAgeMs as number) / 1000))}s in the FUTURE, so it is ` +
          `no evidence that supervision ran (the clock moved backwards under it)`
        : `no readable beacon at ${fleet.beaconPath}`;
    return {
      inFlight,
      unreadable: survey.unreadable,
      beaconAgeMs,
      stale: true,
      detail:
        `watcher stale: ${flight} in flight and ${why}; start "tiphys watch" or ` +
        `schedule "tiphys watch --once" at least every ${String(thresholdSeconds)}s`,
    };
  }
  if (beaconAgeMs > thresholdMs) {
    return {
      inFlight,
      unreadable: survey.unreadable,
      beaconAgeMs,
      stale: true,
      detail:
        `watcher stale: ${flight} in flight and ` +
        `${fleet.beaconPath} is ${String(Math.round(beaconAgeMs / 1000))}s old ` +
        `(threshold ${String(thresholdSeconds)}s); supervision may have stopped`,
    };
  }
  return {
    inFlight,
    unreadable: survey.unreadable,
    beaconAgeMs,
    stale: false,
    detail:
      `watcher fresh: ${flight} in flight, beacon ` +
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
