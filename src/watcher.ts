import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  watch,
  writeFileSync,
  writeSync,
} from "node:fs";
import type { FSWatcher, Stats } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Fleet } from "./fleet.ts";
import { CADENCE, renderBeacon, readBeacon } from "./liveness.ts";
import type { WatchCadence } from "./liveness.ts";
import { executorRecordPath, readTaskMeta, runStep, turnEndPath } from "./task.ts";

/**
 * The watcher (kernel plan v1, M1-P5 step 1; R-078, R-079; DR-0007;
 * plan constraints C-1, C-2 and C-3).
 *
 * ONE CORE, TWO ENTRY MODES (DR-0007). Resident mode (tiphys watch) is a
 * plain foreground process the caller owns. Single-pass mode (tiphys
 * watch --once) performs exactly one evaluation of the same wake sources
 * and exits, for external triggers on reclaimable substrates. Both modes
 * run the same evaluation function over the same on-disk state; there is
 * no adapter and no second implementation.
 *
 * C-3, and why there is nothing here to guard: the kernel never runs a
 * watcher outside the caller's own foreground process. No flag exists
 * that would make it outlive its caller, this module launches no child
 * process of any kind, and arming is explicit: the operator starts it
 * and the beacon is what proves it ran (FM-054, where about 30 minutes
 * of supervision were lost to a shell that helpfully detached one).
 *
 * C-2: nothing here has any notion of a running program. Wake sources
 * are FILES, currency comes from files, and the only clock question ever
 * asked is "is this timestamp older than that one".
 *
 * C-1: task currency is read from tasks/<id>/meta.json status and the
 * turn-end file, never from a log tail. state/last-wake.json is written
 * and never read back by any code path in this kernel; deleting it or
 * filling it with garbage changes no decision this module makes.
 *
 * REASON LINES (grammar harvested from firstmate, FM-002):
 *
 *   signal <task-id> turn-end   a turn-end file appeared for an open task
 *   stale <task-id> deadline    an open task passed its executor.json
 *                               deadline with no turn-end (PR-207)
 *   check <name>                a one-shot check was requested through
 *                               state/check-request
 *   heartbeat <n>               the nth heartbeat since the last reset
 *
 * A wake is ONE line on stdout and then exit 0. The watcher surfaces
 * wakes and never classifies, triages or absorbs them (FM-057:
 * firstmate's absorb-triage grew to most of its 1126 lines because its
 * completion signals were weak; a proposal to add classification here is
 * a signal-design red flag, not a feature request).
 *
 * THE STALE ENUMERATION IS EXACTLY ONE ENTRY IN M1, deliberately. The
 * plan adds "stale <task-id> deadline" (PR-207) and the plan's own
 * not-proven list states that abandonment of a task launched WITHOUT a
 * deadline is not auto-detected in M1 (recovery is manual teardown).
 * Tuition T-002 asked for "task open, no turn-end, worktree dirty" as a
 * wake condition; the declared-deadline half of that is what this module
 * detects, from file evidence alone, and it is witnessed against a spawn
 * that was genuinely stopped mid-payload rather than against a
 * hand-built file state. The deadline-less half is not invented here.
 *
 * WHAT AN EVALUATION IS, and why it matters for the beacon (PR-206,
 * PR-009). An EVALUATION is a pass over the wake sources that also
 * rewrites state/watcher.beacon: it happens when a resident watcher
 * starts, on every heartbeat tick, whenever a wake is surfaced, and on
 * every watch --once pass including a no-wake one. Between heartbeats a
 * resident watcher SCANS its wake sources every poll interval (and
 * immediately on a filesystem change); a scan that surfaces nothing
 * writes nothing. That is what makes the beacon mean "supervision
 * executed on schedule" rather than "a process is alive", and it is what
 * puts the oldest healthy beacon age at one backoff cap plus one poll
 * interval, which is the bound the guard's threshold has to clear
 * (PR-009, enforced in src/liveness.ts).
 *
 * CADENCE LIVES ON DISK (FM-006, FM-045), never in process memory, so a
 * resident restart and a single pass share one schedule:
 * state/watcher.cadence.json holds {lastHeartbeatAt, backoffStreak}. On
 * a virgin fleet the first evaluation initializes it to the current time
 * and surfaces no heartbeat; the first heartbeat falls due one base
 * interval later (PR-205).
 *
 * Turn-end currency (PR-204). A turn-end wake is surfaced at most once
 * across both modes. state/watcher.seen.json records, per task, the
 * identity of the last surfaced turn-end (size, modification time and a
 * content signature, FM-005). The record is advanced under a claim file,
 * written stage-then-rename and confirmed by reading it back, which is
 * the discipline src/lock.ts established (it is mirrored rather than
 * reused: the lock's primitive is lease-shaped and src/lock.ts is not in
 * this phase's edit scope). The wake is appended to state/last-wake.json
 * BEFORE the seen record advances (enqueue-before-suppress, FM-046: a
 * stop between the two duplicates a wake rather than dropping it). Two
 * passes racing on the same turn-end therefore resolve to exactly one
 * surfacing; the loser reports no-wake.
 *
 * HOW A RAISED ERROR IS CLASSIFIED, decided once and applied
 * structurally, because this module does filesystem work in a loop and
 * the previous phase's two worst defects were raises walking past
 * handlers that only understood returned failures (M1-P4 F-1 and F-2):
 *
 *   - A file that is ABSENT is not an error. Task directories appear and
 *     vanish under a concurrent teardown, so every read of task state
 *     goes through a helper that turns ENOENT into "not there" and
 *     rethrows everything else.
 *   - Any OTHER raise ends the pass with a reason line and a nonzero
 *     exit. The watcher stops loudly instead of looping blind: a stopped
 *     watcher stops advancing the beacon, and the liveness guard then
 *     tells the operator on the next spawn, teardown or doctor.
 *   - The whole pass is wrapped by runStep (src/task.ts), so this holds
 *     for every site in it without depending on remembering it at each.
 */

/** Exit code of a --once pass that found nothing actionable. */
export const NO_WAKE_EXIT = 3;

/** Wake-source and cadence state files, all under the fleet's state/. */
export const CADENCE_STATE_FILE = join("state", "watcher.cadence.json");
export const SEEN_STATE_FILE = join("state", "watcher.seen.json");
export const LAST_WAKE_FILE = join("state", "last-wake.json");
export const CHECK_REQUEST_FILE = join("state", "check-request");

export function cadencePath(fleet: Fleet): string {
  return join(fleet.root, CADENCE_STATE_FILE);
}

export function seenPath(fleet: Fleet): string {
  return join(fleet.root, SEEN_STATE_FILE);
}

export function lastWakePath(fleet: Fleet): string {
  return join(fleet.root, LAST_WAKE_FILE);
}

export function checkRequestPath(fleet: Fleet): string {
  return join(fleet.root, CHECK_REQUEST_FILE);
}

/** Absent is not an error; anything else is (see the module docs). */
function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function statIfPresent(path: string): Stats | undefined {
  try {
    return statSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function listIfPresent(dir: string): string[] | undefined {
  try {
    return readdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/** Identity of a turn-end file (FM-005), the seen-state's unit. */
export interface SignalIdentity {
  size: number;
  mtimeMs: number;
  signature: string;
}

export type SeenState = Record<string, SignalIdentity>;

export function sameIdentity(a: SignalIdentity, b: SignalIdentity): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.signature === b.signature;
}

function identityOf(path: string): SignalIdentity | undefined {
  const stats = statIfPresent(path);
  if (stats === undefined) {
    return undefined;
  }
  const body = readIfPresent(path);
  if (body === undefined) {
    return undefined;
  }
  return {
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    signature: createHash("sha256").update(body).digest("hex"),
  };
}

export function readSeenState(fleet: Fleet): SeenState {
  const raw = readIfPresent(seenPath(fleet));
  if (raw === undefined) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A seen file that does not parse is treated as empty: the cost is a
    // duplicated wake, and the alternative (refusing to surface) would
    // lose one. Duplicate rather than drop is this phase's standing rule
    // (FM-046).
    return {};
  }
  if (parsed === null || typeof parsed !== "object") {
    return {};
  }
  const out: SeenState = {};
  for (const [taskId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const candidate = value as Partial<SignalIdentity>;
    if (
      typeof candidate.size === "number" &&
      typeof candidate.mtimeMs === "number" &&
      typeof candidate.signature === "string"
    ) {
      out[taskId] = {
        size: candidate.size,
        mtimeMs: candidate.mtimeMs,
        signature: candidate.signature,
      };
    }
  }
  return out;
}

/** Cadence state (JSON per DR-0006, plan decision D-3). */
export interface CadenceState {
  lastHeartbeatAt: string;
  backoffStreak: number;
}

export function readCadenceState(fleet: Fleet): CadenceState | undefined {
  const raw = readIfPresent(cadencePath(fleet));
  if (raw === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const candidate = parsed as Partial<CadenceState>;
  if (
    typeof candidate.lastHeartbeatAt !== "string" ||
    Number.isNaN(Date.parse(candidate.lastHeartbeatAt)) ||
    typeof candidate.backoffStreak !== "number" ||
    !Number.isFinite(candidate.backoffStreak) ||
    candidate.backoffStreak < 0
  ) {
    return undefined;
  }
  return { lastHeartbeatAt: candidate.lastHeartbeatAt, backoffStreak: candidate.backoffStreak };
}

export function writeCadenceState(fleet: Fleet, state: CadenceState): void {
  atomicWrite(cadencePath(fleet), `${JSON.stringify(state, null, 2)}\n`);
}

/** The doubling heartbeat interval, capped (FM-044). */
export function intervalMsFor(streak: number, cadence: WatchCadence): number {
  const exponent = Math.min(streak, 52);
  const raw = cadence.baseIntervalMs * 2 ** exponent;
  return Math.min(raw, cadence.backoffCapMs);
}

/** When the next heartbeat falls due, from on-disk state alone. */
export function nextHeartbeatDueMs(state: CadenceState, cadence: WatchCadence): number {
  return Date.parse(state.lastHeartbeatAt) + intervalMsFor(state.backoffStreak, cadence);
}

/**
 * Write a file through a staged rename, so a reader (doctor, the guard,
 * another pass) never sees a half-written state file.
 */
function atomicWrite(path: string, body: string): void {
  const stage = `${path}.stage`;
  writeFileSync(stage, body);
  renameSync(stage, path);
}

/**
 * Rewrite the beacon. The timestamp STRICTLY increases even when two
 * evaluations land in the same millisecond, because criterion 8 turns on
 * a no-wake pass advancing it and "advanced" has to mean something a
 * reader can compare.
 */
export function writeBeacon(
  fleet: Fleet,
  nowMs: number,
  streak: number,
  cadence: WatchCadence,
): number {
  const previous = readBeacon(fleet.beaconPath);
  const previousMs = previous === undefined ? undefined : Date.parse(previous.writtenAt);
  const stampMs =
    previousMs === undefined || nowMs > previousMs ? nowMs : previousMs + 1;
  atomicWrite(
    fleet.beaconPath,
    renderBeacon({
      writtenAt: new Date(stampMs).toISOString(),
      backoffStreak: streak,
      intervalMs: intervalMsFor(streak, cadence),
    }),
  );
  return stampMs;
}

/** A surfaced wake, or the heartbeat that stands in for one. */
export type Wake =
  | { kind: "signal"; taskId: string; event: "turn-end"; identity: SignalIdentity }
  | { kind: "stale"; taskId: string; what: "deadline" }
  | { kind: "check"; name: string };

export function wakeLine(wake: Wake): string {
  if (wake.kind === "signal") {
    return `signal ${wake.taskId} ${wake.event}`;
  }
  if (wake.kind === "stale") {
    return `stale ${wake.taskId} ${wake.what}`;
  }
  return `check ${wake.name}`;
}

export function heartbeatLine(n: number): string {
  return `heartbeat ${String(n)}`;
}

/** The executor launch record, as far as this module reads it (PR-207). */
function deadlineOf(fleet: Fleet, taskId: string): number | undefined {
  const raw = readIfPresent(executorRecordPath(fleet, taskId));
  if (raw === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const deadline = (parsed as { deadline?: unknown }).deadline;
  if (typeof deadline !== "string") {
    return undefined;
  }
  const ms = Date.parse(deadline);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * One scan of the wake sources, in the grammar's own priority order:
 * turn-end signals first, then stale conditions, then a requested check.
 * Task ids are visited in sorted order so two passes over the same fleet
 * choose the same wake.
 *
 * Stale conditions are NOT suppressed by the seen-state, and that is
 * deliberate: PR-204's at-most-once rule is about turn-end EDGES, while
 * a passed deadline with no turn-end is a standing condition that stays
 * true until an operator acts on it. Reporting it again on the next pass
 * is the correct behavior for something nobody has dealt with yet.
 */
function scanUnsafe(fleet: Fleet, nowMs: number): Wake | undefined {
  const ids = (listIfPresent(fleet.tasksDir) ?? []).sort();
  const open: string[] = [];
  for (const id of ids) {
    const meta = readTaskMeta(fleet, id);
    if (meta !== undefined && meta.status === "open") {
      open.push(id);
    }
  }

  const seen = readSeenState(fleet);
  for (const id of open) {
    const identity = identityOf(turnEndPath(fleet, id));
    if (identity === undefined) {
      continue;
    }
    const previous = seen[id];
    if (previous !== undefined && sameIdentity(previous, identity)) {
      continue;
    }
    return { kind: "signal", taskId: id, event: "turn-end", identity };
  }

  for (const id of open) {
    if (statIfPresent(turnEndPath(fleet, id)) !== undefined) {
      continue;
    }
    const deadlineMs = deadlineOf(fleet, id);
    if (deadlineMs !== undefined && deadlineMs <= nowMs) {
      return { kind: "stale", taskId: id, what: "deadline" };
    }
  }

  const request = statIfPresent(checkRequestPath(fleet));
  if (request !== undefined) {
    return { kind: "check", name: "requested" };
  }
  return undefined;
}

export type ScanResult =
  | { ok: true; wake: Wake | undefined }
  | { ok: false; reason: string };

/** Scan, with the module's raise classification applied structurally. */
export function scanWakeSources(fleet: Fleet, nowMs: number): ScanResult {
  const scanned = runStep("scanning the watcher wake sources", () =>
    scanUnsafe(fleet, nowMs),
  );
  if (!scanned.ok) {
    return { ok: false, reason: scanned.reason };
  }
  return { ok: true, wake: scanned.value };
}

/**
 * Durably append one wake record, one JSON object per line (JSON per
 * DR-0006; the line framing is what makes an append safe without a
 * read-modify-write of the whole file). The plan fixes the file's name
 * and its append discipline, not its internal framing; this is the
 * choice, recorded rather than assumed.
 *
 * NOTHING IN THIS KERNEL READS THIS FILE (plan constraint C-1). It is a
 * durability record for a human and for later milestones, never a source
 * of currency: currency comes from meta.json, the turn-end file, the
 * executor record and the seen state.
 */
function appendWakeRecord(fleet: Fleet, nowMs: number, line: string): void {
  const record = `${JSON.stringify({ at: new Date(nowMs).toISOString(), line })}\n`;
  const handle = openSync(lastWakePath(fleet), "a");
  try {
    writeSync(handle, record);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

const CLAIM_WAIT_TOTAL_MS = 5000;
const CLAIM_WAIT_POLL_MS = 5;

/**
 * Deterministic interleave seam for the concurrency witness, modelled on
 * the one src/commands/lock.ts already carries. When
 * TIPHYS_WATCH_TEST_HOLD names a barrier path, a pass that has DECIDED to
 * surface a turn-end writes <barrier>.observed and then waits for
 * <barrier> to appear before it touches the seen state, so a test can
 * place a second pass exactly inside the window. It is LOUD when it does
 * not actually hold (the M1-P3 lesson): the wait is monotonic and a
 * timeout raises rather than continuing with a stale observation, which
 * is how a witness scores an interleave it never staged.
 */
const HOLD_WAIT_LIMIT_MS = 30_000;

async function maybeHoldForTest(): Promise<void> {
  const barrier = process.env.TIPHYS_WATCH_TEST_HOLD;
  if (barrier === undefined || barrier === "") {
    return;
  }
  writeFileSync(`${barrier}.observed`, "");
  const startNs = process.hrtime.bigint();
  for (;;) {
    if (statIfPresent(barrier) !== undefined) {
      writeFileSync(`${barrier}.released`, "barrier appeared\n");
      return;
    }
    const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    if (elapsedMs >= HOLD_WAIT_LIMIT_MS) {
      writeFileSync(`${barrier}.released`, "timed out without holding\n");
      throw new Error(
        `watcher test hold at ${barrier} timed out after ` +
          `${String(Math.round(elapsedMs))}ms: the interleave was never staged`,
      );
    }
    await sleep(CLAIM_WAIT_POLL_MS);
  }
}

/**
 * Advance the seen state for one surfaced turn-end, under a claim file,
 * stage-then-rename, confirmed by reading it back. Returns false when
 * another pass got there first, which is the loser's cue to report
 * no-wake (PR-204).
 */
async function claimSignal(
  fleet: Fleet,
  taskId: string,
  identity: SignalIdentity,
  nowMs: number,
  line: string,
): Promise<boolean> {
  const claimPath = `${seenPath(fleet)}.mutex`;
  const deadline = Date.now() + CLAIM_WAIT_TOTAL_MS;
  for (;;) {
    try {
      writeFileSync(claimPath, "", { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        // A claim we could not take means another pass is inside the
        // window right now, or one stopped inside it. Both resolve the
        // same way: do not surface, leave the seen state alone, and let
        // the next pass see the turn-end still pending. Duplicate rather
        // than drop, never a wake invented on top of an unknown state.
        return false;
      }
      await sleep(CLAIM_WAIT_POLL_MS);
    }
  }
  try {
    const current = readSeenState(fleet);
    const previous = current[taskId];
    if (previous !== undefined && sameIdentity(previous, identity)) {
      return false;
    }
    // Enqueue before suppress (FM-046): the wake record is durable
    // before anything can suppress the wake.
    appendWakeRecord(fleet, nowMs, line);
    const next: SeenState = { ...current, [taskId]: identity };
    atomicWrite(seenPath(fleet), `${JSON.stringify(next, null, 2)}\n`);
    const confirmed = readSeenState(fleet)[taskId];
    if (confirmed === undefined || !sameIdentity(confirmed, identity)) {
      return false;
    }
    return true;
  } finally {
    try {
      unlinkSync(claimPath);
    } catch {
      // Already gone; nothing to release.
    }
  }
}

/**
 * Take the one-shot check request, atomically: the rename is the
 * exclusion, so two racing passes cannot both surface one request.
 */
function claimCheckRequest(fleet: Fleet): string | undefined {
  const path = checkRequestPath(fleet);
  const taken = `${path}.taken`;
  try {
    renameSync(path, taken);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const body = readIfPresent(taken) ?? "";
  try {
    unlinkSync(taken);
  } catch {
    // Best effort: the request has already been taken by this pass.
  }
  const name = body.trim().split("\n")[0] ?? "";
  return name === "" ? "unnamed" : name;
}

export type SurfaceResult =
  | { surfaced: true; line: string }
  | { surfaced: false };

/**
 * Surface a wake: make it durable, suppress repeats where the plan says
 * repeats are wrong, and return the line to print. A false result means
 * another pass owns this wake and this one must report no-wake.
 */
export async function surfaceWake(
  fleet: Fleet,
  wake: Wake,
  nowMs: number,
): Promise<SurfaceResult> {
  const line = wakeLine(wake);
  if (wake.kind === "signal") {
    await maybeHoldForTest();
    const won = await claimSignal(fleet, wake.taskId, wake.identity, nowMs, line);
    return won ? { surfaced: true, line } : { surfaced: false };
  }
  if (wake.kind === "check") {
    const name = claimCheckRequest(fleet);
    if (name === undefined) {
      return { surfaced: false };
    }
    const named = wakeLine({ kind: "check", name });
    appendWakeRecord(fleet, nowMs, named);
    return { surfaced: true, line: named };
  }
  appendWakeRecord(fleet, nowMs, line);
  return { surfaced: true, line };
}

export interface WatchOptions {
  cadence: WatchCadence;
  /**
   * Resident mode only: exit with a heartbeat line after this many
   * heartbeats HAVE TICKED IN THIS RUN. It is a bound on the run, not a
   * position in the schedule, so a bounded run behaves the same way on a
   * fleet that has been supervised for hours as on a virgin one. The
   * schedule itself stays on disk (FM-006), which is why the number the
   * line reports is the cadence ordinal and can be larger than this
   * bound.
   */
  maxHeartbeats: number | undefined;
  /** Injectable clock; tests use the real one, this is for determinism. */
  now?: () => number;
}

export interface PassOutcome {
  code: number;
  /** stdout line, without its newline; empty means print nothing. */
  line: string;
  /** stderr reason for a nonzero, non-no-wake outcome. */
  reason?: string;
}

/** Read cadence state, initializing a virgin fleet in place (PR-205). */
function loadOrInitCadence(fleet: Fleet, nowMs: number): CadenceState {
  const existing = readCadenceState(fleet);
  if (existing !== undefined) {
    return existing;
  }
  const fresh: CadenceState = {
    lastHeartbeatAt: new Date(nowMs).toISOString(),
    backoffStreak: 0,
  };
  writeCadenceState(fleet, fresh);
  return fresh;
}

/** runStep's shape for an async step (src/task.ts covers the sync one). */
async function runStepAsync<T>(
  what: string,
  step: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  try {
    return { ok: true, value: await step() };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `${what} failed: ${detail}` };
  }
}

/**
 * Scan and, if there is something to surface, surface it. Returns
 * undefined when there was nothing to surface, which includes losing the
 * race for a wake another pass owns. It writes the beacon ONLY when it
 * surfaces (see the module docs on what an evaluation is).
 */
async function scanAndSurface(
  fleet: Fleet,
  options: WatchOptions,
  nowMs: number,
): Promise<PassOutcome | undefined> {
  const scanned = scanWakeSources(fleet, nowMs);
  if (!scanned.ok) {
    return { code: 1, line: "", reason: scanned.reason };
  }
  const wake = scanned.wake;
  if (wake === undefined) {
    return undefined;
  }
  const surfaced = await runStepAsync("surfacing the wake", () =>
    surfaceWake(fleet, wake, nowMs),
  );
  if (!surfaced.ok) {
    return { code: 1, line: "", reason: surfaced.reason };
  }
  const result = surfaced.value;
  if (!result.surfaced) {
    return undefined;
  }
  // Any surfaced non-heartbeat wake resets the backoff (plan step 1).
  writeCadenceState(fleet, {
    lastHeartbeatAt: new Date(nowMs).toISOString(),
    backoffStreak: 0,
  });
  writeBeacon(fleet, nowMs, 0, options.cadence);
  return { code: 0, line: result.line };
}

/**
 * A heartbeat evaluation: advance the streak, record it, rewrite the
 * beacon. Returns the heartbeat ordinal since the last cadence reset,
 * which is the n in "heartbeat <n>".
 */
function heartbeatTick(
  fleet: Fleet,
  state: CadenceState,
  cadence: WatchCadence,
  nowMs: number,
): number {
  const n = state.backoffStreak + 1;
  writeCadenceState(fleet, {
    lastHeartbeatAt: new Date(nowMs).toISOString(),
    backoffStreak: n,
  });
  writeBeacon(fleet, nowMs, n, cadence);
  return n;
}

/**
 * Single-pass mode: exactly one evaluation, then exit. A heartbeat that
 * is due is surfaced (this pass may be the only supervision this fleet
 * gets), and a pass with nothing actionable prints nothing and exits
 * with the documented no-wake code. The beacon is rewritten either way
 * (PR-206).
 */
export async function runOnce(
  fleet: Fleet,
  options: WatchOptions,
): Promise<PassOutcome> {
  const nowMs = (options.now ?? Date.now)();
  const state = loadOrInitCadence(fleet, nowMs);

  const surfaced = await scanAndSurface(fleet, options, nowMs);
  if (surfaced !== undefined) {
    return surfaced;
  }
  if (nowMs >= nextHeartbeatDueMs(state, options.cadence)) {
    const n = heartbeatTick(fleet, state, options.cadence, nowMs);
    appendWakeRecord(fleet, nowMs, heartbeatLine(n));
    return { code: 0, line: heartbeatLine(n) };
  }
  writeBeacon(fleet, nowMs, state.backoffStreak, options.cadence);
  return { code: NO_WAKE_EXIT, line: "" };
}

/**
 * Wait for a filesystem change under the fleet's state/ and tasks/, or
 * for the timeout, whichever comes first. Watching is an optimization
 * over the poll interval, so a platform that cannot watch simply waits.
 */
async function waitForChange(
  fleet: Fleet,
  timeoutMs: number,
): Promise<void> {
  const watchers: FSWatcher[] = [];
  let resolveChange: (() => void) | undefined;
  const changed = new Promise<void>((resolve) => {
    resolveChange = resolve;
  });
  const onEvent = (): void => {
    resolveChange?.();
  };
  for (const [dir, recursive] of [
    [fleet.stateDir, false],
    [fleet.tasksDir, true],
  ] as const) {
    try {
      const handle = watch(dir, { recursive }, onEvent);
      handle.on("error", onEvent);
      watchers.push(handle);
    } catch {
      // No watch on this directory: the poll interval is the fallback,
      // which is exactly what it is for.
    }
  }
  try {
    await Promise.race([changed, sleep(Math.max(0, timeoutMs))]);
  } finally {
    for (const handle of watchers) {
      handle.close();
    }
  }
}

/**
 * Resident mode: a plain foreground loop the caller owns. It evaluates
 * once at startup (so an already-pending wake is surfaced immediately
 * and the beacon proves arming), then alternates cheap scans at the poll
 * interval with heartbeat evaluations on the backoff schedule.
 */
export async function runResident(
  fleet: Fleet,
  options: WatchOptions,
): Promise<PassOutcome> {
  const now = options.now ?? Date.now;

  // Startup evaluation: an already-pending wake is surfaced at once, and
  // the beacon is written whatever happens, so "the watcher is armed" is
  // an observable fact and not a claim (plan step 1, exit test A5).
  const startupState = loadOrInitCadence(fleet, now());
  const startupWake = await scanAndSurface(fleet, options, now());
  if (startupWake !== undefined) {
    return startupWake;
  }
  writeBeacon(fleet, now(), startupState.backoffStreak, options.cadence);

  let ticksThisRun = 0;
  for (;;) {
    const state = readCadenceState(fleet) ?? loadOrInitCadence(fleet, now());
    const dueMs = nextHeartbeatDueMs(state, options.cadence);
    const waitMs = Math.min(options.cadence.pollIntervalMs, Math.max(0, dueMs - now()));
    await waitForChange(fleet, waitMs);

    const surfaced = await scanAndSurface(fleet, options, now());
    if (surfaced !== undefined) {
      return surfaced;
    }

    if (now() >= dueMs) {
      const n = heartbeatTick(fleet, state, options.cadence, now());
      ticksThisRun += 1;
      // Resident mode is SILENT on heartbeats unless the caller asked for
      // a bounded run: a supervisor that exited every heartbeat would be
      // no supervisor at all (criterion 3).
      if (options.maxHeartbeats !== undefined && ticksThisRun >= options.maxHeartbeats) {
        appendWakeRecord(fleet, now(), heartbeatLine(n));
        return { code: 0, line: heartbeatLine(n) };
      }
    }
  }
}
