import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Fleet } from "./fleet.ts";
import { classifyEntry, readRegularFileIfPresent, readTaskMeta } from "./task.ts";

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
 * A raise inside an advisory must not be able to take down the command it
 * is advising, and this project has already paid twice for raises walking
 * past handlers that only understood returned failures (M1-P4 F-1 and
 * F-2). So guard() classifies rather than propagates: every filesystem
 * read it performs is wrapped, and a raised error becomes "this file is
 * not readable".
 *
 * WHAT THAT SENTENCE DOES NOT SAY, corrected in place (CR-520). An earlier
 * version of this paragraph read "guard() is TOTAL: every filesystem read
 * it performs is wrapped". The wrapping was real and the word TOTAL did
 * not follow from it. Totality against RAISES is not totality against
 * BLOCKS, and open(2) on a named pipe with no writer blocks in the kernel
 * without raising anything. While that sentence stood, a named pipe at
 * state/watcher.beacon hung guard() forever, and with it doctor, spawn,
 * teardown and both watcher entry modes, each producing no output at all.
 * The claim was written without being executed; tuition T-006 is about
 * exactly that habit.
 *
 * What is true now, and only this: guard() reads two kinds of path, task
 * records and the beacon, and BOTH go through readRegularFileIfPresent in
 * src/task.ts, which establishes the type before it opens anything. A
 * non-regular entry at either path is classified as unreadable without
 * being opened, which the guard already treats as "no evidence", so the
 * advisory stays loud instead of stopping. Two syscalls remain between the
 * probe and the open, and that residual is stated at the helper.
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
 * Read the beacon, or undefined when it is absent, is not a regular file,
 * cannot be read, or does not parse. All of those are the same thing to
 * the guard: no evidence that supervision ran. That is the
 * fail-toward-warning direction, and for an advisory that never blocks it
 * is the right one.
 *
 * The type probe is INSIDE this reader (CR-520). It is not enough for
 * judgeBeacon to have lstat'ed the path first: that call establishes
 * PRESENCE, not TYPE, and this reader has a second caller in
 * src/watcher.ts (writeBeacon) which does not lstat at all. A probe in
 * front of one caller protects one caller.
 */
export function readBeacon(beaconPath: string): BeaconRecord | undefined {
  const read = readRegularFileIfPresent(beaconPath);
  if (read.kind !== "read") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
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
  /** Task ids whose meta.json parses and says open, sorted. */
  open: string[];
  /**
   * Task ids where SOMETHING EXISTS at tasks/<id>/meta.json, by any file
   * type, and cannot be read as a task record. Sorted.
   */
  unreadable: string[];
  /**
   * Things this survey could not establish at all (the tasks directory
   * could not be listed, an entry could not be stat'ed), one reason line
   * each. NEITHER CALLER MAY READ AN EMPTY RESULT AS "no work": the
   * watcher reports these loudly and the guard counts them as in flight,
   * because a survey that did not complete is not evidence of an idle
   * fleet.
   */
  problems: string[];
}

/**
 * THE ONE CLASSIFIER OF TASK RECORDS. src/watcher.ts and this module both
 * call it, and neither has a second opinion about what a task record is.
 *
 * This exists because the fix round wrote the same classification twice
 * with different conditions, and the copies disagreed: one asked whether
 * the meta path was a regular FILE, the other only that a stat succeeded,
 * so a meta.json that existed as a directory was surfaced by the watcher
 * and reported by the guard as nothing in flight, which is a
 * counterexample to the very property that round declared (delta review
 * NEW-1, and tuition T-005 on rules that fail to propagate). One property
 * gets one implementation; two that agree today drift the moment someone
 * edits one of them.
 *
 * The rules, in one place:
 *
 * - A TASK IS A DIRECTORY under tasks/. The entry is resolved with stat,
 *   so a symlink to a real task directory is a task; init's own .gitkeep
 *   and any other stray file is not, which is checked by TYPE and never
 *   by name.
 * - A record that PARSES is authoritative: its status decides open or
 *   closed (plan constraint C-1).
 * - THE RECORD IS PROBED BEFORE IT IS READ, AND THE PROBE IS NOT HERE.
 *   Only a path that resolves to a REGULAR FILE is ever opened; anything
 *   else that exists there (a directory, a FIFO, a socket, a device node,
 *   a symlink resolving to any of those, a dangling symlink) is classified
 *   as a record that cannot be read WITHOUT opening it. That ordering is
 *   load-bearing: opening a FIFO with no writer blocks in the kernel and
 *   is not an exception, so a classifier that read first would hang
 *   instead of classifying, and would take the guard's three callers down
 *   with it.
 *
 *   The ordering is enforced INSIDE readTaskMeta (src/task.ts), not in
 *   front of the call below. A fix round put it here instead, which
 *   protected this one call site and left every other caller of
 *   readTaskMeta exposed; src/teardown.ts is one, and a named pipe at a
 *   task record hung teardown forever while this classifier reported the
 *   same file cleanly (CR-520, CR-521). The recorded reason for declining
 *   to protect the other callers was that it would mean a second reader
 *   beside readTaskMeta. That reason was wrong: moving the probe INTO
 *   readTaskMeta is still exactly one implementation of "read a task
 *   record", and it is the shape now shipped. What this classifier keeps
 *   is the finer split it genuinely needs, unreadable versus a survey that
 *   did not complete, computed from the same classifyEntry the reader uses.
 * - A regular file that does not parse is likewise unreadable: it exists
 *   and it is not evidence that the task finished.
 * - NOTHING at the meta.json path is not a record at all: that is the
 *   normal transient shape of a spawn in progress or a rollback residue.
 * - Residual, stated rather than papered over: the probe and the read are
 *   two syscalls, so a path that changes type between them could still be
 *   opened as something other than a regular file. Nothing in this kernel
 *   writes that state. The residual is stated once, at classifyEntry.
 *
 * Total by construction: it never raises, because one of its two callers
 * is an advisory that must not be able to take down the command it is
 * advising. It does not swallow either: what it could not establish comes
 * back in problems, and both callers are required to act on that.
 */
export function surveyTaskRecords(fleet: Fleet): TaskSurvey {
  const open: string[] = [];
  const unreadable: string[] = [];
  const problems: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(fleet.tasksDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // No tasks directory at all. loadFleet refuses a fleet home
      // missing one, so this is only reachable if it vanished under us,
      // and an absent directory holds no tasks.
      return { open, unreadable, problems };
    }
    problems.push(
      `the task directory ${fleet.tasksDir} could not be listed: ${String(error)}`,
    );
    return { open, unreadable, problems };
  }

  for (const id of entries.sort()) {
    let isTask: boolean;
    try {
      isTask = statSync(join(fleet.tasksDir, id)).isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Removed under us (a concurrent teardown), or a dangling
        // symlink: no task directory here.
        continue;
      }
      problems.push(
        `the task entry ${join(fleet.tasksDir, id)} could not be examined: ${String(error)}`,
      );
      continue;
    }
    if (!isTask) {
      continue;
    }

    // PROBE BEFORE READ, through the shared classifier (src/task.ts
    // classifyEntry) rather than through a copy of it here. This survey
    // needs a FINER answer than a reader does, because it distinguishes
    // "there is something unreadable at this record" from "this survey
    // could not complete", and those go to different counters. It does not
    // need a second opinion about what is safe to open, and the round that
    // wrote the probe here rather than in the reader is why six other
    // paths kept blocking (CR-520).
    const recordPath = join(fleet.tasksDir, id, "meta.json");
    const entry = classifyEntry(recordPath);
    if (entry.kind === "absent") {
      // No record here at all: a spawn in progress, or a rollback residue.
      continue;
    }
    if (entry.kind === "unexaminable") {
      problems.push(`the task record ${entry.reason}`);
      continue;
    }
    if (entry.kind === "dangling" || entry.kind === "irregular") {
      // Present as a link resolving to nothing, or present as something
      // that is not a file: it exists, and it is not evidence that the
      // task finished. Classified WITHOUT being opened.
      unreadable.push(id);
      continue;
    }

    const meta = readTaskMeta(fleet, id);
    if (meta === undefined) {
      unreadable.push(id);
      continue;
    }
    if (meta.status === "open") {
      open.push(id);
    }
  }
  return { open, unreadable, problems };
}

/**
 * THE ONE FRESHNESS THRESHOLD. The configured threshold, raised to the
 * cadence the WATCHER ITSELF declared in the beacon it wrote plus one
 * poll interval (CR-503). Every consumer of beacon freshness calls this,
 * so a single run cannot produce two verdicts about one file.
 */
export function effectiveThresholdMs(
  beacon: BeaconRecord | undefined,
  cadence: WatchCadence,
): number {
  const declaredFloorMs =
    beacon === undefined ? 0 : beacon.intervalMs + cadence.pollIntervalMs;
  return Math.max(cadence.staleThresholdMs, declaredFloorMs);
}

/**
 * What a beacon file is evidence of. THE ONE BEACON VERDICT: the guard
 * and doctor's own beacon check both call this, so they cannot disagree
 * about the same file in the same run (delta review CR-508, where they
 * did). Each caller decides how to PRESENT the verdict; neither decides
 * what it is.
 */
export type BeaconVerdict =
  | { kind: "absent" }
  | { kind: "unreadable" }
  | { kind: "ahead"; aheadMs: number; thresholdMs: number }
  | { kind: "fresh"; ageMs: number; thresholdMs: number }
  | { kind: "stale"; ageMs: number; thresholdMs: number };

export function judgeBeacon(
  beaconPath: string,
  nowMs: number = Date.now(),
  cadence: WatchCadence = CADENCE,
): BeaconVerdict {
  // Presence and type are two questions and the shared classifier answers
  // both: absent is the only arm that means "no beacon here". Anything
  // else present (a dangling symlink per CR-513, a directory, a named
  // pipe, an entry that cannot even be examined) exists, so it is not
  // evidence of health, and readBeacon below reduces it to "unreadable"
  // without opening it.
  if (classifyEntry(beaconPath).kind === "absent") {
    return { kind: "absent" };
  }
  const beacon = readBeacon(beaconPath);
  if (beacon === undefined) {
    return { kind: "unreadable" };
  }
  const thresholdMs = effectiveThresholdMs(beacon, cadence);
  const ageMs = nowMs - Date.parse(beacon.writtenAt);
  if (ageMs < -BEACON_FUTURE_TOLERANCE_MS) {
    return { kind: "ahead", aheadMs: -ageMs, thresholdMs };
  }
  if (ageMs > thresholdMs) {
    return { kind: "stale", ageMs, thresholdMs };
  }
  return { kind: "fresh", ageMs, thresholdMs };
}

/** Counts, for the guard. The classification itself is not repeated. */
export function surveyTasks(fleet: Fleet): { open: number; unreadable: number } {
  const survey = surveyTaskRecords(fleet);
  return {
    open: survey.open.length,
    // A survey that could not complete is counted with the records it
    // could not read: both mean "work this fleet cannot be shown to be
    // free of".
    unreadable: survey.unreadable.length + survey.problems.length,
  };
}

/**
 * The guard predicate (plan step 2). Total: it never raises, whatever
 * the filesystem does, because its callers use it as an advisory.
 *
 * NO HEALTH FROM AN ABSENCE OF EVIDENCE. "Not stale" is only said when
 * this function can point at the evidence for it: either nothing is in
 * flight, or a beacon judged fresh. What counts as work in flight comes
 * from surveyTaskRecords and what a beacon is evidence of comes from
 * judgeBeacon; this function decides neither of those questions itself,
 * so doctor and the guard cannot answer them differently.
 */
export function guard(
  fleet: Fleet,
  nowMs: number = Date.now(),
  cadence: WatchCadence = CADENCE,
): GuardReport {
  const survey = surveyTasks(fleet);
  const inFlight = survey.open + survey.unreadable;
  const verdict = judgeBeacon(fleet.beaconPath, nowMs, cadence);
  const beaconAgeMs =
    verdict.kind === "fresh" || verdict.kind === "stale" ? verdict.ageMs : undefined;
  const thresholdSeconds = Math.round(
    (verdict.kind === "absent" || verdict.kind === "unreadable"
      ? cadence.staleThresholdMs
      : verdict.thresholdMs) / 1000,
  );
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
  if (verdict.kind === "absent" || verdict.kind === "unreadable") {
    return {
      inFlight,
      unreadable: survey.unreadable,
      beaconAgeMs,
      stale: true,
      detail:
        `watcher stale: ${flight} in flight and no readable beacon at ` +
        `${fleet.beaconPath}; start "tiphys watch" or schedule ` +
        `"tiphys watch --once" at least every ${String(thresholdSeconds)}s`,
    };
  }
  if (verdict.kind === "ahead") {
    // CR-510: the remediation names the action that actually clears this.
    // Restarting the watcher does not: writeBeacon keeps a beacon that is
    // already ahead of the clock ahead of it, one millisecond per
    // evaluation, so a healthy watcher cannot walk it back.
    return {
      inFlight,
      unreadable: survey.unreadable,
      beaconAgeMs,
      stale: true,
      detail:
        `watcher stale: ${flight} in flight and the beacon at ${fleet.beaconPath} is ` +
        `dated ${String(Math.round(verdict.aheadMs / 1000))}s in the FUTURE, so it is ` +
        `no evidence that supervision ran (the clock moved backwards under it); ` +
        `remove that file and let the next evaluation write it from the present, ` +
        `because restarting the watcher alone will not clear it`,
    };
  }
  if (verdict.kind === "stale") {
    return {
      inFlight,
      unreadable: survey.unreadable,
      beaconAgeMs,
      stale: true,
      detail:
        `watcher stale: ${flight} in flight and ` +
        `${fleet.beaconPath} is ${String(Math.round(verdict.ageMs / 1000))}s old ` +
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
      `${String(Math.round(verdict.ageMs / 1000))}s old`,
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
