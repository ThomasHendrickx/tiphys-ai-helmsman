/**
 * Cutover state and rollback (kernel plan M4, M4-P26; D-19's second limb at
 * delivery/plan/kernel-plan-v1.md:394).
 *
 * WHAT THIS MODULE IS. The freeze point is not one event. It is FIVE
 * independently flippable switches, taken from the list the current delivery
 * process retains at
 * delivery/decisions/DR-0025-controlled-pre-m4-local-pilot.md:45 and read
 * against DR-0036's authority condition. Five switches rather than one event
 * is what makes rollback PARTIAL rather than all-or-nothing, and it is why
 * `credentials-and-refs`, the one switch with owner latency, is separable
 * from the four that are not.
 *
 * THE SPLIT THAT KEEPS THIS HONEST, and it runs through every function here.
 * Rollback of the FILES is cheap: everything under the retirement roots is
 * git-tracked and revertible from history. Rollback of AUTHORITY is the
 * expensive half: the branch-protection ruleset is owner-configured, the
 * orchestrator cannot change it, and
 * delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:15
 * prices the revert at "whatever phases ran under it". Nothing in this module
 * flips authority. It PREPARES the request an owner acts on, and it refuses
 * loudly rather than pretending the preparation is the act.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO. It does not print
 * `tiphys cutover status`, does not write switches to `kernel`, and does not
 * ship a state schema. Those are M4-P25's acceptance criteria and M4-P25's
 * files. This phase was dispatched ahead of its stated dependency because the
 * conflict pre-pass holds `src/commands/cutover.ts` for exactly one unit at a
 * time, so the state MODEL is created here and the status SURFACE is left
 * where the plan put it. The boundary is recorded in
 * delivery/work-history/m4-p26.md:1 rather than left to be discovered.
 *
 * PLAN CONSTRAINTS. C-1: current state comes from `cutover.json` and from
 * meta.json plus the turn-end file, never from the tail of a log. C-2: no pid,
 * no signal, no /proc and no process probing appears here; a live worktree is
 * a DIRECTORY and an open task is a FILE STATE. C-3: nothing is backgrounded.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Fleet } from "./fleet.ts";
import {
  classifyEntry,
  readRegularFileIfPresent,
  turnEndPath,
  type GuardResult,
} from "./task.ts";

/* -------------------------------------------------------------------- */
/* The five switches                                                     */
/* -------------------------------------------------------------------- */

/**
 * The five retained items of DR-0025, in the order section 4.3 of the M4
 * plan tabulates them. This list is CLOSED. A sixth name is a plan revision,
 * not a code edit, because every rollback trigger enumerates it.
 */
export const CUTOVER_SWITCHES = [
  "planning-and-scope",
  "review-and-arbitration",
  "credentials-and-refs",
  "salvage-and-recovery",
  "closeout",
] as const;

export type CutoverSwitchName = (typeof CUTOVER_SWITCHES)[number];

/** Which process holds the authority a switch governs. */
export type SwitchState = "current" | "kernel";

export const SWITCH_STATES: readonly SwitchState[] = ["current", "kernel"];

/**
 * The switch with owner latency. Named as a constant because three separate
 * places have to treat it differently and a repeated string literal is how
 * one of them ends up not doing so.
 */
export const OWNER_LATENCY_SWITCH: CutoverSwitchName = "credentials-and-refs";

/**
 * One switch's record. `restoreTo` is the value the switch held BEFORE the
 * flip. It is what makes freeze-point restore a matter of reading a recorded
 * value rather than reconstructing an intent, and a record without it cannot
 * be rolled back at all, which is why every read here refuses one.
 */
export interface SwitchRecord {
  state: SwitchState;
  flippedAt: string;
  flippedBy: string;
  reason: string;
  restoreTo: SwitchState;
}

export interface CutoverState {
  switches: Record<CutoverSwitchName, SwitchRecord>;
}

/**
 * `cutover.json` sits at the FLEET ROOT and not under `state/`, because
 * `state/` is gitignored (src/fleet.ts:29) and trigger 2 step 1 identifies a
 * flip with `git log` over this exact path. A switch history that is not
 * committed is not a history.
 */
export function cutoverStatePath(fleet: Fleet): string {
  return join(fleet.root, "cutover.json");
}

/**
 * The document as it was parsed, keys and all. It is carried beside the typed
 * state because the typed view is NARROWER than the file: `CutoverState` names
 * `switches` and nothing else, so a writer that serialises the typed view
 * DELETES every other key the file held. A rollback is a change to the
 * switches, not a rewrite of the document, and this is what lets the two be
 * different sizes.
 */
export type CutoverDocument = Record<string, unknown>;

export type CutoverRead =
  | { kind: "read"; state: CutoverState; document: CutoverDocument }
  | { kind: "absent" }
  | { kind: "refused"; reason: string };

function isSwitchState(value: unknown): value is SwitchState {
  return typeof value === "string" && SWITCH_STATES.includes(value as SwitchState);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate a parsed document into a CutoverState, returning every reason at
 * once rather than the first.
 *
 * FAIL CLOSED ON `restoreTo`. A record missing it, or carrying it as a word
 * outside the two-value vocabulary, is REFUSED rather than defaulted to
 * `current`. Defaulting would make rollback silently guess, and a guess that
 * happens to be right most of the time is the guard that cannot go red.
 */
export function validateCutoverDocument(document: unknown): string[] {
  const reasons: string[] = [];
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return ["cutover state is not a JSON object"];
  }
  const switches = (document as { switches?: unknown }).switches;
  if (typeof switches !== "object" || switches === null || Array.isArray(switches)) {
    return ["cutover state has no switches object"];
  }
  const table = switches as Record<string, unknown>;
  for (const name of CUTOVER_SWITCHES) {
    const record = table[name];
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      reasons.push(`switch ${name} is missing`);
      continue;
    }
    const row = record as Record<string, unknown>;
    if (!isSwitchState(row["state"])) {
      reasons.push(`switch ${name} has no state of current or kernel`);
    }
    if (!isSwitchState(row["restoreTo"])) {
      reasons.push(`switch ${name} has no restoreTo of current or kernel`);
    }
    for (const field of ["flippedAt", "flippedBy", "reason"]) {
      if (!nonEmptyString(row[field])) {
        reasons.push(`switch ${name} has no ${field}`);
      }
    }
  }
  const unknown = Object.keys(table).filter(
    (key) => !(CUTOVER_SWITCHES as readonly string[]).includes(key),
  );
  for (const key of unknown) {
    reasons.push(`switch ${key} is not one of the five`);
  }
  return reasons;
}

/** Read and validate the fleet's cutover state. */
export function readCutoverState(fleet: Fleet): CutoverRead {
  const path = cutoverStatePath(fleet);
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return { kind: "absent" };
  }
  if (read.kind === "refused") {
    return { kind: "refused", reason: read.reason };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body) as unknown;
  } catch (error) {
    return { kind: "refused", reason: `${path} is not valid JSON: ${String(error)}` };
  }
  const reasons = validateCutoverDocument(parsed);
  if (reasons.length > 0) {
    return { kind: "refused", reason: `${path}: ${reasons.join("; ")}` };
  }
  return {
    kind: "read",
    state: parsed as CutoverState,
    document: parsed as CutoverDocument,
  };
}

export function renderCutoverState(state: CutoverState | CutoverDocument): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/**
 * Put a new switch table into the document the file actually held, leaving
 * every other key exactly as it was read.
 *
 * WHY THIS EXISTS AS A NAMED FUNCTION. `validateCutoverDocument` refuses an
 * unknown SWITCH NAME because the five are a closed list, and that made it
 * look as though the whole document were closed. It is not: M4-P25 owns the
 * schema and may add top-level keys, so a rollback that serialises only what
 * this module's interface names would silently delete them. Refusing them
 * instead would be this phase deciding M4-P25's schema, which is not its to
 * decide, so the document is CARRIED rather than narrowed or refused.
 */
export function withSwitches(
  document: CutoverDocument,
  switches: Record<CutoverSwitchName, SwitchRecord>,
): CutoverDocument {
  return { ...document, switches };
}

/**
 * Publish a whole cutover state ATOMICALLY: serialise everything, write it to
 * a sibling temporary file, fsync that file, then rename over the
 * destination. Nothing partial is ever visible at the destination path,
 * because rename(2) within one directory is atomic.
 *
 * THE MECHANISM THIS EXISTS AGAINST is not "a crash". It is WRITING STATE
 * PER ITEM WHILE ITERATING, which leaves a file that is internally valid and
 * factually wrong: three switches saying `kernel` and two saying `current`
 * describes a process that has no owner for three of its five authorities.
 * Every caller in this module builds the complete next state first and calls
 * this once.
 */
export function publishCutoverState(
  path: string,
  state: CutoverState | CutoverDocument,
): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  /* The suffix is random, never a pid. C-2 forbids a pid as an identity, and
     a temp-file name is an identity for exactly as long as the rename takes. */
  const temporary = join(directory, `.cutover.${randomBytes(8).toString("hex")}.tmp`);
  const body = renderCutoverState(state);
  let handle: number | undefined;
  try {
    handle = openSync(temporary, "wx");
    writeSync(handle, body);
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    renameSync(temporary, path);
  } catch (error) {
    if (handle !== undefined) {
      try {
        closeSync(handle);
      } catch {
        /* the write already failed; the close outcome adds nothing */
      }
    }
    try {
      rmSync(temporary, { force: true });
    } catch {
      /* best effort: a leftover temp file is not the destination */
    }
    throw error;
  }
}

/* -------------------------------------------------------------------- */
/* Rollback of the switches                                              */
/* -------------------------------------------------------------------- */

export interface SwitchChange {
  name: CutoverSwitchName;
  from: SwitchState;
  to: SwitchState;
}

export interface RollbackPlan {
  changes: SwitchChange[];
  next: CutoverState;
}

/**
 * Observer called once per switch as the next state is assembled IN MEMORY,
 * before anything reaches disk. It exists so a caller can report progress,
 * and it is also the seam criterion 2's red witness uses: an observer that
 * throws on the third call aborts the assembly, and the destination file must
 * still hold the five values it held before.
 */
export type SwitchObserver = (change: SwitchChange, index: number) => void;

export interface RollbackOptions {
  now: string;
  by: string;
  reason: string;
  onSwitch?: SwitchObserver;
}

export type RollbackTrigger =
  | "drain-reversal"
  | "freeze-point-restore"
  | "retirement-unmet";

export const ROLLBACK_TRIGGERS: readonly RollbackTrigger[] = [
  "drain-reversal",
  "freeze-point-restore",
  "retirement-unmet",
];

/**
 * The target value a trigger moves a switch to.
 *
 * Trigger 1 (drain reversal) hands every authority back to the current
 * process, so the target is `current` for all five: in-flight work has to be
 * handled by the process that started it.
 *
 * Trigger 2 (freeze-point restore) reads each switch's own `restoreTo`. That
 * is the difference between the two, and it is why M4-P25 criterion 4 refuses
 * a write that omits the field.
 *
 * ROLLBACK IS MONOTONE AND THE CLAMP BELOW IS WHAT MAKES THE MODULE HEADER
 * TRUE. `restoreTo` is the value a switch held BEFORE its last flip, and
 * `planRollback` sets it to the value the switch is leaving. So a switch that
 * has already been rolled back to `current` carries `restoreTo: "kernel"`, and
 * returning that value would move the switch FORWARD on the second run of the
 * same command. The failure arm of trigger 1 step 1 exits nonzero after the
 * local write has already happened, and the natural response to that is to run
 * the command again, so the second run is not a hypothetical. A rollback never
 * hands authority to the kernel: `current` is a floor, and a switch already at
 * it is a no-op rather than a flip.
 */
export function targetFor(trigger: RollbackTrigger, record: SwitchRecord): SwitchState {
  if (trigger === "drain-reversal") {
    return "current";
  }
  if (record.state === "current") {
    return "current";
  }
  return record.restoreTo;
}

/**
 * Assemble the complete next state. Throws rather than returning a partial
 * plan, and touches no file at all: publishing is a separate call.
 */
export function planRollback(
  state: CutoverState,
  trigger: RollbackTrigger,
  options: RollbackOptions,
): RollbackPlan {
  const changes: SwitchChange[] = [];
  const nextSwitches = {} as Record<CutoverSwitchName, SwitchRecord>;
  let index = 0;
  for (const name of CUTOVER_SWITCHES) {
    const record = state.switches[name];
    const to = targetFor(trigger, record);
    const change: SwitchChange = { name, from: record.state, to };
    options.onSwitch?.(change, index);
    if (change.from === change.to) {
      /* A SWITCH THIS ROLLBACK DOES NOT MOVE IS NOT REWRITTEN. The record is
         carried through unchanged, `flippedAt`, `flippedBy`, `reason` and
         `restoreTo` included. Stamping the current run over an unmoved switch
         would destroy the one fact freeze-point restore depends on, which is
         what that switch left, and it would do it while reporting zero
         changes: a write whose scope is wider than the sentence describing
         it. */
      nextSwitches[name] = record;
    } else {
      nextSwitches[name] = {
        /* Spread the record as it was READ. The interface names five fields;
           the file may carry more, and a rollback that rebuilds the record
           from the interface deletes whatever it did not know about. */
        ...record,
        state: to,
        flippedAt: options.now,
        flippedBy: options.by,
        reason: options.reason,
        /* The rolled-back switch can be flipped forward again, and the value
           it would return to is the one it is leaving now. Carrying the OLD
           restoreTo forward would make a second rollback restore a state two
           flips old. */
        restoreTo: record.state,
      };
      changes.push(change);
    }
    index += 1;
  }
  return { changes, next: { switches: nextSwitches } };
}

export type RollbackOutcome =
  | { ok: true; changes: SwitchChange[]; next: CutoverState }
  | { ok: false; reason: string };

/**
 * Plan and publish in one call: validate the whole input, assemble the whole
 * next state, then write once.
 *
 * ORDER IS THE PROPERTY. Every refusal reachable from a bad input happens
 * before `publishCutoverState` is called, so a refusal leaves the file
 * byte-identical. That is asserted directly rather than trusted: see
 * test/cutover.test.ts.
 */
export function applyRollback(
  fleet: Fleet,
  trigger: RollbackTrigger,
  options: RollbackOptions,
): RollbackOutcome {
  const read = readCutoverState(fleet);
  if (read.kind === "absent") {
    return { ok: false, reason: `${cutoverStatePath(fleet)} is absent` };
  }
  if (read.kind === "refused") {
    return { ok: false, reason: read.reason };
  }
  let plan: RollbackPlan;
  try {
    plan = planRollback(read.state, trigger, options);
  } catch (error) {
    return {
      ok: false,
      reason: `rollback assembly failed before any write: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  try {
    /* Publish the DOCUMENT with the new switch table in it, not the typed
       view. `read.document` is what the file held; `plan.next.switches` is the
       only part this rollback decided. Publishing `plan.next` alone would
       delete every top-level key this module does not name. */
    publishCutoverState(
      cutoverStatePath(fleet),
      withSwitches(read.document, plan.next.switches),
    );
  } catch (error) {
    return {
      ok: false,
      reason: `rollback could not be published: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  return { ok: true, changes: plan.changes, next: plan.next };
}

/* -------------------------------------------------------------------- */
/* Drain: the computed predicate                                         */
/* -------------------------------------------------------------------- */

/**
 * `unexaminable` is a THIRD kind and not an error channel. A drain predicate
 * that cannot decide an entry has not found it clean, and folding the
 * undecidable into "nothing here" is how a guard reads quiet at full speed.
 */
export type InFlightKind = "worktree" | "task" | "unexaminable";

export interface InFlightItem {
  kind: InFlightKind;
  id: string;
  detail: string;
}

/**
 * WHAT DRAIN COUNTS, and the omission is the decision.
 *
 * In-flight work only: live worktrees and open tasks with no turn-end. Pushed
 * unmerged BRANCHES are deliberately NOT counted (M4-D-15, decided at
 * delivery/plan/kernel-plan-m4.md:3279). This container cannot delete a remote
 * ref and the delete dry run exits 0 either way, and the probes generalised
 * that further: a dry run does not probe push authorization at all
 * (delivery/verification/m4-prototype-probes.md:165). A drain predicate over
 * branches therefore blocks cutover on an owner action with no local
 * pre-check, which is a predicate that can never read clean.
 *
 * C-2 is load-bearing here. A live worktree is a DIRECTORY on disk and an
 * open task is meta.json's status plus the absence of the turn-end file. No
 * process is probed, no pid is read, and nothing asks whether an agent is
 * still breathing.
 */
export function inFlightItems(fleet: Fleet): InFlightItem[] {
  const items: InFlightItem[] = [];

  /* ABSENT IS UNDECIDABLE HERE AND NOT EMPTY. `loadFleet` refuses a fleet
     whose `worktrees/` or `tasks/` is not a directory (src/fleet.ts:65), so a
     Fleet value that reaches this function had both when it was loaded. One
     that is gone now was removed since, which says nothing about what was in
     it, and reading that as a clean drain is the same fall-through as reading
     an unreadable directory as an empty one. */
  const worktrees = listDirectory(fleet.worktreesDir);
  if (worktrees.kind !== "listed") {
    items.push({
      kind: "unexaminable",
      id: fleet.worktreesDir,
      detail:
        worktrees.kind === "absent"
          ? `${fleet.worktreesDir} is gone, and the fleet had it when it was loaded`
          : worktrees.reason,
    });
  }
  for (const id of worktrees.kind === "listed" ? worktrees.names : []) {
    const path = join(fleet.worktreesDir, id);
    const probe = probeDirectory(path);
    if (probe.kind === "directory") {
      items.push({ kind: "worktree", id, detail: path });
    } else if (probe.kind === "unexaminable") {
      items.push({ kind: "unexaminable", id, detail: probe.reason });
    }
  }

  const tasks = listDirectory(fleet.tasksDir);
  if (tasks.kind !== "listed") {
    items.push({
      kind: "unexaminable",
      id: fleet.tasksDir,
      detail:
        tasks.kind === "absent"
          ? `${fleet.tasksDir} is gone, and the fleet had it when it was loaded`
          : tasks.reason,
    });
  }
  for (const id of tasks.kind === "listed" ? tasks.names : []) {
    const metaRead = readRegularFileIfPresent(join(fleet.tasksDir, id, "meta.json"));
    if (metaRead.kind === "refused") {
      /* Present and not readable. A meta.json that is a named pipe, a
         directory, or a path this process may not stat says NOTHING about
         whether the task finished, and the T-003 hazard shape is exactly a
         FIFO where a regular file was expected. */
      items.push({ kind: "task", id, detail: `meta.json could not be examined: ${metaRead.reason}` });
      continue;
    }
    if (metaRead.kind === "absent") {
      items.push({ kind: "task", id, detail: "meta.json is absent, so the task has no recorded status" });
      continue;
    }
    let status: unknown;
    try {
      status = (JSON.parse(metaRead.body) as { status?: unknown }).status;
    } catch {
      /* An unparseable meta.json is not evidence that the task finished, so
         it counts as in flight rather than being skipped. */
      items.push({ kind: "task", id, detail: "meta.json is unparseable" });
      continue;
    }
    /* `closed` is the ONLY positive evidence that a task is finished. The
       previous form tested `status !== "open"`, which made every value that is
       not the word `open` - a missing field, a typo, a number - read as
       finished. The vocabulary is closed (src/task.ts, TaskStatus), so a value
       outside it is undecided and undecided counts. */
    if (status === "closed") {
      continue;
    }
    if (status !== "open") {
      items.push({
        kind: "task",
        id,
        detail: `meta.json status ${JSON.stringify(status)} is not one of open or closed`,
      });
      continue;
    }
    const turnEnd = classifyEntry(turnEndPath(fleet, id));
    /* Symmetrically: a REGULAR turn-end file is the only positive evidence
       that the turn ended. `irregular` and `unexaminable` are undecided, not
       finished, and the previous form counted only `absent` and `dangling`,
       so a turn-end that was a named pipe read as a finished task. */
    if (turnEnd.kind === "regular") {
      continue;
    }
    items.push({
      kind: "task",
      id,
      detail:
        turnEnd.kind === "absent" || turnEnd.kind === "dangling"
          ? "open with no turn-end"
          : `open and the turn-end could not be examined: ${turnEnd.reason}`,
    });
  }
  return items.sort((a, b) => `${a.kind}/${a.id}`.localeCompare(`${b.kind}/${b.id}`));
}

/**
 * Is this path a directory, and SAY SO WHEN THE QUESTION COULD NOT BE ANSWERED.
 *
 * `classifyEntry` deliberately answers one question, "may this be opened", and
 * calls a directory irregular; a worktree IS a directory, so the two need
 * separating. stat(2) does not block on a FIFO the way open(2) does, so this
 * is safe on exactly the paths src/task.ts:118 exists to protect.
 *
 * The tri-state is the fix rather than a refinement. A boolean forces an
 * unreadable path to be reported as "not a directory", which in a drain
 * predicate means "no work here", which is the answer a caller cannot tell
 * from the true one.
 */
type DirectoryProbe =
  | { kind: "directory" }
  | { kind: "other" }
  | { kind: "absent" }
  | { kind: "unexaminable"; reason: string };

function probeDirectory(path: string): DirectoryProbe {
  let stats;
  try {
    stats = statSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "absent" };
    }
    return { kind: "unexaminable", reason: `${path} could not be examined: ${String(error)}` };
  }
  return stats.isDirectory() ? { kind: "directory" } : { kind: "other" };
}

type DirectoryListing =
  | { kind: "listed"; names: string[] }
  | { kind: "absent" }
  | { kind: "unexaminable"; reason: string };

/**
 * Enumerate a directory, distinguishing "it is not there" from "it could not
 * be enumerated". An empty list and a failed listing are the same value to a
 * caller that returns `[]` for both, and in this module the caller is the
 * drain predicate: a `tasks/` that cannot be read would have reported a clean
 * drain over an unknown number of open tasks.
 */
function listDirectory(path: string): DirectoryListing {
  const probe = probeDirectory(path);
  if (probe.kind === "absent") {
    return { kind: "absent" };
  }
  if (probe.kind === "unexaminable") {
    return { kind: "unexaminable", reason: probe.reason };
  }
  if (probe.kind === "other") {
    return {
      kind: "unexaminable",
      reason: `${path} is not a directory, so its contents could not be enumerated`,
    };
  }
  try {
    return { kind: "listed", names: readdirSync(path).sort() };
  } catch (error) {
    return { kind: "unexaminable", reason: `${path} could not be enumerated: ${String(error)}` };
  }
}

/**
 * The named list of things no local command can see. It is printed with every
 * drain report and is NOT abbreviated when the network is unreachable: a
 * command that silently degrades to a shorter answer is indistinguishable
 * from one reporting a quiet system, which is the shape standing warning 6
 * records for watchers.
 */
export const CANNOT_SEE: readonly string[] = [
  "open pull requests",
  "CI conclusions",
  "post-merge push runs",
  "whether the pilot's own fleet is drained (DR-0037: the pilot is not this orchestrator's subject)",
];

/* -------------------------------------------------------------------- */
/* Fleet-state publication                                               */
/* -------------------------------------------------------------------- */

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function runGit(cwd: string, args: string[]): CommandResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "tiphys",
      GIT_AUTHOR_EMAIL: "tiphys@localhost",
      GIT_COMMITTER_NAME: "tiphys",
      GIT_COMMITTER_EMAIL: "tiphys@localhost",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error === undefined ? "" : String(result.error)),
  };
}

/**
 * Commit and push the fleet's rolled-back state.
 *
 * THE FAILURE ARM IS WRITTEN FIRST, and that ordering is the point rather
 * than a style. A rollback that changes `cutover.json` locally and does not
 * land it leaves every other environment believing the switches are still
 * `kernel`, and a push whose failure is swallowed is indistinguishable from a
 * push that worked. Every arm below returns a reason; none returns silence.
 *
 * A fleet with no remote is a REFUSAL, not a skip. The caller may pass
 * `allowNoRemote` to turn it into a reported, non-fatal condition, and when it
 * does the reason is still printed, so a reader can never mistake the local
 * write for a published one.
 *
 * THE COMMIT CARRIES THE NAMED PATHS AND NOTHING ELSE. Staging everything at
 * the fleet root stages whatever is dirty anywhere under it, and the
 * precondition of trigger 1 is that IN-FLIGHT WORK EXISTS: a half-written
 * note, a torn meta.json, an operator scratch file. Committing all of it under
 * the message "cutover rollback" publishes somebody else's unfinished work
 * under this command's name, which is a write whose scope is wider than the
 * sentence describing it. Three checks make the scope exactly the named set:
 * the index must be empty before, the staging names paths, and the staged set
 * is compared with the requested one afterwards.
 */
export type SyncOutcome =
  | { ok: true; pushed: true; head: string; staged: string[] }
  | { ok: true; pushed: false; reason: string; staged: string[] }
  | { ok: false; reason: string };

function nonEmptyLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function syncFleetState(
  fleetRoot: string,
  options: { allowNoRemote?: boolean; message: string; paths: string[] },
): SyncOutcome {
  if (options.paths.length === 0) {
    return {
      ok: false,
      reason:
        "syncFleetState was given no path to stage, and a rollback that stages everything commits work it did not do",
    };
  }
  const remotes = runGit(fleetRoot, ["remote"]);
  if (remotes.status !== 0) {
    return { ok: false, reason: `git remote failed in ${fleetRoot}: ${remotes.stderr.trim()}` };
  }
  const hasOrigin = remotes.stdout.split("\n").some((line) => line.trim() === "origin");
  /* An index that already holds something is refused rather than absorbed: a
     scoped staging does not unstage what somebody else staged, so committing
     here would carry it under this message. */
  const preStaged = runGit(fleetRoot, ["diff", "--cached", "--name-only"]);
  if (preStaged.status !== 0) {
    return { ok: false, reason: `git diff --cached failed: ${preStaged.stderr.trim()}` };
  }
  const already = nonEmptyLines(preStaged.stdout);
  if (already.length > 0) {
    return {
      ok: false,
      reason:
        `${fleetRoot} already holds ${String(already.length)} staged path(s) this rollback did not stage, ` +
        `and nothing was committed: ${already.slice(0, 10).join(", ")}`,
    };
  }
  const add = runGit(fleetRoot, ["add", "--", ...options.paths]);
  if (add.status !== 0) {
    return { ok: false, reason: `git add failed in ${fleetRoot}: ${add.stderr.trim()}` };
  }
  const staged = runGit(fleetRoot, ["diff", "--cached", "--name-only"]);
  if (staged.status !== 0) {
    return { ok: false, reason: `git diff --cached failed: ${staged.stderr.trim()}` };
  }
  const stagedPaths = nonEmptyLines(staged.stdout);
  /* The scope is VERIFIED and not assumed. A named path that turns out to be a
     directory, or a pathspec the caller did not mean, shows up here. */
  const stray = stagedPaths.filter(
    (path) => !options.paths.some((want) => path === want || path.startsWith(`${want}/`)),
  );
  if (stray.length > 0) {
    return {
      ok: false,
      reason:
        `staging ${options.paths.join(", ")} also staged ${String(stray.length)} path(s) outside it, ` +
        `and nothing was committed: ${stray.slice(0, 10).join(", ")}`,
    };
  }
  if (stagedPaths.length > 0) {
    const commit = runGit(fleetRoot, ["commit", "-q", "-m", options.message]);
    if (commit.status !== 0) {
      return { ok: false, reason: `git commit failed: ${commit.stderr.trim()}` };
    }
  }
  if (!hasOrigin) {
    const reason = `${fleetRoot} has no origin remote, so the rollback is committed locally and NOT published`;
    return options.allowNoRemote === true
      ? { ok: true, pushed: false, reason, staged: stagedPaths }
      : { ok: false, reason };
  }
  const push = runGit(fleetRoot, ["push", "origin", "HEAD"]);
  if (push.status !== 0) {
    return {
      ok: false,
      reason: `git push failed: ${(push.stderr + push.stdout).trim().split("\n").join(" ")}`,
    };
  }
  const head = runGit(fleetRoot, ["rev-parse", "HEAD"]);
  if (head.status !== 0) {
    return { ok: false, reason: `git rev-parse HEAD failed: ${head.stderr.trim()}` };
  }
  return { ok: true, pushed: true, head: head.stdout.trim(), staged: stagedPaths };
}

/* -------------------------------------------------------------------- */
/* Trigger 2 step 2: restoring the FILES                                 */
/* -------------------------------------------------------------------- */

/**
 * Refuse to touch a tree that holds uncommitted work.
 *
 * ANY `git checkout --` in such a tree is destructive, INCLUDING when it names
 * a single path, and especially the path being edited. This repository has
 * paid for that twice; the rule is standing warning 8 in the agent-rules file.
 * The guard is a precondition of the restore and not a warning printed beside
 * it, because a warning is advice and this is the only thing standing between
 * a rollback and four rounds of somebody's uncommitted work.
 */
export function refuseIfTreeDirty(repoRoot: string): GuardResult {
  const status = runGit(repoRoot, ["status", "--porcelain"]);
  if (status.status !== 0) {
    return { ok: false, reason: `git status failed in ${repoRoot}: ${status.stderr.trim()}` };
  }
  const dirty = status.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (dirty.length > 0) {
    return {
      ok: false,
      reason:
        `${repoRoot} holds ${dirty.length} uncommitted change(s) and nothing was touched: ` +
        dirty.slice(0, 10).join(", "),
    };
  }
  return { ok: true };
}

export type RestoreFilesOutcome =
  | { ok: true; roots: string[]; removed: string[] }
  | { ok: false; reason: string };

/**
 * Restore the named retirement roots from a pre-freeze sha.
 *
 * The dirty check runs FIRST and returns before any version-control
 * invocation that can write. That order is the whole guarantee, and the test
 * asserts the dirty file is byte-identical afterwards rather than asserting
 * the exit code alone.
 *
 * "RESTORE" IS A CLAIM ABOUT THE WHOLE ROOT, AND CHECKING A TREE OUT OVER A
 * PATH IS NOT ONE. `checkout <sha> -- <root>` writes what the sha held and
 * removes NOTHING, so every file added under the root after the freeze
 * survives the restore untouched. The result is a hybrid tree that the caller
 * prints `RESTORED` over: a verdict wider than the operation that produced it.
 * The post-freeze additions are therefore enumerated and removed, and then the
 * root is COMPARED with the sha. The comparison is the verdict; without it the
 * success arm is an assumption, and a success arm that cannot fail is the
 * guard that cannot go red.
 */
export function restoreRetirementRoots(
  repoRoot: string,
  sha: string,
  roots: string[],
): RestoreFilesOutcome {
  if (roots.length === 0) {
    return { ok: false, reason: "no retirement root was named" };
  }
  const guard = refuseIfTreeDirty(repoRoot);
  if (!guard.ok) {
    return { ok: false, reason: guard.reason };
  }
  const resolved = runGit(repoRoot, ["rev-parse", "--verify", `${sha}^{commit}`]);
  if (resolved.status !== 0) {
    return { ok: false, reason: `${sha} does not resolve to a commit in ${repoRoot}` };
  }
  /* Tracked under a root NOW and absent at the freeze. The tree is clean here,
     because refuseIfTreeDirty has already returned, so HEAD is the tree. */
  const added = runGit(repoRoot, [
    "diff",
    "--name-only",
    "--diff-filter=A",
    /* --no-renames IS LOAD-BEARING AND THE VERIFICATION ARM BELOW IS WHAT
       FOUND IT. With rename detection on, a file renamed after the freeze is
       reported as R rather than A, so its NEW name is not enumerated, the
       removal misses it, and the checkout restores the old name beside it. The
       first version of this function had the flag missing; the residue
       comparison turned the hybrid tree into a refusal naming
       `retired/renamed.md` instead of a green. That is the whole reason the
       verdict is measured rather than assumed. */
    "--no-renames",
    sha,
    "HEAD",
    "--",
    ...roots,
  ]);
  if (added.status !== 0) {
    return {
      ok: false,
      reason: `enumerating the post-freeze additions failed: ${added.stderr.trim()}`,
    };
  }
  const postFreeze = nonEmptyLines(added.stdout);
  const checkout = runGit(repoRoot, ["checkout", sha, "--", ...roots]);
  if (checkout.status !== 0) {
    return { ok: false, reason: `git checkout failed: ${checkout.stderr.trim()}` };
  }
  if (postFreeze.length > 0) {
    const removed = runGit(repoRoot, ["rm", "-q", "-f", "--", ...postFreeze]);
    if (removed.status !== 0) {
      return {
        ok: false,
        reason: `removing the post-freeze additions failed: ${removed.stderr.trim()}`,
      };
    }
  }
  /* THE VERDICT IS MEASURED. Compare the sha with the working tree over the
     same roots; anything printed here is a difference the restore did not
     close, and the caller is told rather than shown a success. */
  const residue = runGit(repoRoot, ["diff", "--name-only", sha, "--", ...roots]);
  if (residue.status !== 0) {
    return {
      ok: false,
      reason: `verifying the restore against ${sha} failed: ${residue.stderr.trim()}`,
    };
  }
  const differing = nonEmptyLines(residue.stdout);
  if (differing.length > 0) {
    return {
      ok: false,
      reason:
        `${String(differing.length)} path(s) under the retirement roots still differ from ${sha} ` +
        `after the restore, so nothing is reported as restored: ${differing.slice(0, 10).join(", ")}`,
    };
  }
  return { ok: true, roots, removed: postFreeze };
}

/* -------------------------------------------------------------------- */
/* Trigger 2 step 3: the owner request that cannot be rehearsed          */
/* -------------------------------------------------------------------- */

/**
 * The property that makes trigger 2 step 3 unrehearsable, in one sentence,
 * exported so the document, the command and the rehearsal script all print
 * the SAME sentence and cannot drift apart.
 */
export const UNREHEARSABLE_REASON =
  "the branch-protection ruleset is a single live object on one owner-owned " +
  "repository: there is no second instance to rehearse against, and no dry " +
  "run distinguishes allowed from refused";

interface RulesetField {
  path: string;
  value: unknown;
}

/**
 * Flatten the captured ruleset into the fields the owner request must carry.
 * The shape is fixed here rather than schema-loaded because M4-P25 owns the
 * schema; what this phase needs is the COMPLETENESS check over whatever that
 * capture holds.
 */
const REQUIRED_TOP_LEVEL = [
  "capturedAt",
  "repository",
  "rulesetName",
  "rules",
  "credentialGrants",
] as const;

export type RestoreRequestOutcome =
  | { ok: true; text: string; fields: number }
  | { ok: false; reasons: string[] };

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * Generate the owner request for trigger 2 step 3.
 *
 * TWO STRUCTURALLY DIFFERENT REFUSALS, and the second is the one a field
 * check is green on. An ABSENT key is caught by asking whether the key is
 * there. A key that is PRESENT and EMPTY passes that question and produces a
 * request with a blank where a pre-flip value belongs, which the owner would
 * have to fill in from memory. Both are refused, and the refusal names the
 * field, because an owner request with a hole in it is worse than no request:
 * it looks complete.
 */
export function generateRestoreRequest(document: unknown): RestoreRequestOutcome {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return { ok: false, reasons: ["pre-freeze ruleset is not a JSON object"] };
  }
  const capture = document as Record<string, unknown>;
  const reasons: string[] = [];
  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in capture)) {
      reasons.push(`field ${key} is absent from the captured ruleset`);
      continue;
    }
    if (isEmptyValue(capture[key])) {
      reasons.push(`field ${key} is present but empty, so it carries no pre-flip value`);
    }
  }
  const fields: RulesetField[] = [];
  for (const [listName, idKey] of [
    ["rules", "id"],
    ["credentialGrants", "name"],
  ] as const) {
    const list = capture[listName];
    if (!Array.isArray(list)) {
      /* PRESENT, NON-EMPTY AND NOT A LIST. The top-level loop above asks only
         whether the key is there and whether it is empty, and a string such as
         "see the wiki" passes both. Falling through here would generate an
         owner request carrying zero fields from that key while reporting
         success, which is the present-but-useless arm criterion 6 member B
         exists for, one level up from a single field. Absence is already
         reported above, so only presence is reported here. */
      if (listName in capture) {
        reasons.push(
          `field ${listName} is present but is not a list, so no pre-flip value could be read from it`,
        );
      }
      continue;
    }
    list.forEach((row, index) => {
      if (typeof row !== "object" || row === null || Array.isArray(row)) {
        reasons.push(`${listName}[${index}] is not an object`);
        return;
      }
      const entry = row as Record<string, unknown>;
      const label = nonEmptyString(entry[idKey]) ? (entry[idKey] as string) : `[${index}]`;
      if (!nonEmptyString(entry[idKey])) {
        reasons.push(`${listName}[${index}] has no ${idKey}`);
      }
      if (!("preFlipValue" in entry)) {
        reasons.push(`${listName}.${label} has no preFlipValue`);
        return;
      }
      if (isEmptyValue(entry["preFlipValue"])) {
        reasons.push(
          `${listName}.${label} has a preFlipValue that is present but empty`,
        );
        return;
      }
      fields.push({ path: `${listName}.${label}`, value: entry["preFlipValue"] });
    });
  }
  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  const lines: string[] = [];
  lines.push("OWNER ACTION: restore the pre-freeze branch protection and credential grants");
  lines.push("");
  lines.push(`repository: ${String(capture["repository"])}`);
  lines.push(`ruleset: ${String(capture["rulesetName"])}`);
  lines.push(`captured at: ${String(capture["capturedAt"])}`);
  lines.push("");
  lines.push("Restore each field below to its pre-flip value:");
  for (const field of fields) {
    lines.push(`  ${field.path} = ${JSON.stringify(field.value)}`);
  }
  lines.push("");
  lines.push("THIS STEP CANNOT BE REHEARSED. " + UNREHEARSABLE_REASON + ".");
  lines.push(
    "A green rehearsal of this request says the REQUEST is complete. It says " +
      "nothing about whether the change will be accepted.",
  );
  lines.push("");
  lines.push(
    "Request an A-n id from delivery/STATE.md, which is the sole allocator, " +
      "and record this action there before sending it.",
  );
  return { ok: true, text: `${lines.join("\n")}\n`, fields: fields.length };
}

/* -------------------------------------------------------------------- */
/* Trigger 3: retirement criteria                                        */
/* -------------------------------------------------------------------- */

export type Disposition = "PORT" | "DELETE" | "KEEP";

export interface RetirementRow {
  id: string;
  disposition: Disposition;
  /** For PORT: the kernel artifact the rule moves to, relative to the repo. */
  destination?: string;
  /**
   * For PORT: a command that was RED under the OLD rule. Retirement is
   * refused until it is red under the NEW artifact too. This is what turns
   * "PORT, verify not weaker" from a judgment into a command.
   */
  negativeWitness?: string[];
}

export type PortVerdict = "ported" | "unported";

export interface PortResult {
  id: string;
  verdict: PortVerdict;
  reason: string;
}

/**
 * Decide one PORT row.
 *
 * `ported` needs BOTH halves and the second is the one that matters. A verdict
 * derived only from the destination file existing is the vacuous version: a
 * file can exist and say nothing. The negative witness was RED under the old
 * rule, so a witness that exits 0 under the new artifact means the new
 * artifact does not catch what the old one caught, which is precisely
 * "WEAKER". Exit 0 from the witness is therefore `unported`, not a pass.
 *
 * `ported` IS REACHED FROM A POSITIVE TEST AND NEVER FROM A FALLTHROUGH, and
 * that is what the first three checks below are. `readRetirementInventory`
 * casts whatever the fixture's `rows` array holds, so a row may be a string, a
 * number, or an object whose `disposition` is misspelt; the earlier form asked
 * only whether the disposition was NOT the word `PORT`, so every one of those
 * returned `ported`, which is a verdict of "this retirement is complete" over
 * a row nobody could read. The vocabulary is closed, so a value outside it is
 * `unported` and names itself.
 */
export const DISPOSITIONS: readonly Disposition[] = ["PORT", "DELETE", "KEEP"];

function isDisposition(value: unknown): value is Disposition {
  return typeof value === "string" && (DISPOSITIONS as readonly string[]).includes(value);
}

export function evaluatePortRow(
  row: RetirementRow,
  repoRoot: string,
): PortResult {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return {
      id: `(row ${JSON.stringify(row)})`,
      verdict: "unported",
      reason: "inventory row is not an object, so its disposition could not be read",
    };
  }
  const id = nonEmptyString(row.id) ? row.id : "(row with no id)";
  if (!nonEmptyString(row.id)) {
    return { id, verdict: "unported", reason: "inventory row has no id" };
  }
  if (!isDisposition(row.disposition)) {
    return {
      id,
      verdict: "unported",
      reason: `disposition ${JSON.stringify(row.disposition)} is not one of ${DISPOSITIONS.join(", ")}`,
    };
  }
  if (row.disposition !== "PORT") {
    return { id, verdict: "ported", reason: `disposition ${row.disposition} needs no port` };
  }
  if (!nonEmptyString(row.destination)) {
    return { id, verdict: "unported", reason: "PORT row names no destination" };
  }
  const destination = join(repoRoot, row.destination);
  if (classifyEntry(destination).kind !== "regular") {
    return {
      id,
      verdict: "unported",
      reason: `destination ${row.destination} does not exist as a file`,
    };
  }
  /* THE COMMAND'S TYPE IS ESTABLISHED BEFORE IT IS DESTRUCTURED OR SPAWNED,
     and `destination` one line up is why this line looks the way it does: that
     field is tested with `nonEmptyString`, this one was tested with `.length`,
     and `.length` is a property read off a value nobody typed. `42` and `{}`
     are not iterable, so the destructuring below threw
     `TypeError: ... is not iterable` out of a function whose interface is a
     PortResult; `null` threw on `.length` before reaching it; and an ARRAY
     holding a non-string threw inside spawnSync on the "file" argument. Four
     throws where a verdict was owed. An inventory row is data supplied by
     another phase's file, so its fields are unknown in the same way a parsed
     document's are, and a throw carries no reason for the refusal. */
  if (!Array.isArray(row.negativeWitness) || row.negativeWitness.length === 0) {
    return {
      id,
      verdict: "unported",
      reason: "PORT row carries no negative-witness command",
    };
  }
  if (!row.negativeWitness.every((part) => nonEmptyString(part))) {
    return {
      id,
      verdict: "unported",
      reason:
        "PORT row's negative-witness command is not a list of non-empty strings, so it could not be run",
    };
  }
  const [program, ...args] = row.negativeWitness as [string, ...string[]];
  const run = spawnSync(program, args, { cwd: repoRoot, encoding: "utf8" });
  if (run.error !== undefined) {
    return {
      id,
      verdict: "unported",
      reason: `negative witness could not be run: ${String(run.error)}`,
    };
  }
  /* A WITNESS THAT DIED IS NOT A WITNESS THAT WAS RED. `status` is null when a
     child is killed by a signal, and null is not 0, so the nonzero arm at the
     bottom used to accept it and report the row as ported. A witness killed by
     the out-of-memory killer or by a harness timeout has demonstrated nothing
     about the new artifact. */
  if (run.signal !== null && run.signal !== undefined) {
    return {
      id,
      verdict: "unported",
      reason: `negative witness was killed by ${run.signal}, which is not evidence that it is red under the new artifact`,
    };
  }
  if (run.status === null) {
    return {
      id,
      verdict: "unported",
      reason: "negative witness reported no exit status, so it did not demonstrate anything",
    };
  }
  if (run.status === 0) {
    return {
      id,
      verdict: "unported",
      reason:
        "negative witness exits 0 under the new artifact, so the destination is WEAKER than the rule it replaced",
    };
  }
  return {
    id,
    verdict: "ported",
    reason: `negative witness exits ${String(run.status)} under the new artifact`,
  };
}

export type InventoryRead =
  | { kind: "read"; rows: RetirementRow[] }
  | { kind: "absent" }
  | { kind: "refused"; reason: string };

/**
 * Read an M4-P23 retirement inventory. The path is a parameter because that
 * phase runs concurrently with this one and its file does not exist on this
 * branch; the rehearsal supplies a fixture.
 */
export function readRetirementInventory(path: string): InventoryRead {
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return { kind: "absent" };
  }
  if (read.kind === "refused") {
    return { kind: "refused", reason: read.reason };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body) as unknown;
  } catch (error) {
    return { kind: "refused", reason: `${path} is not valid JSON: ${String(error)}` };
  }
  /* THE TYPE IS ESTABLISHED BEFORE A PROPERTY IS READ OFF IT, and this line is
     why. `JSON.parse("null")` succeeds and returns null, so the cast-and-read
     that used to stand here threw a TypeError out of a function whose whole
     interface is a three-way refusal. A read function that throws has no
     refusal REASON, so the caller cannot report what was wrong with the file,
     and the crash is indistinguishable from a defect in the reader. The
     sibling readers both test the type first (validateCutoverDocument at
     src/cutover.ts:154 and generateRestoreRequest at src/cutover.ts:1025);
     this one did not, and the not-covered statement's claim that a malformed
     inventory is refused was false for exactly that member. */
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "refused", reason: `${path} is not a JSON object` };
  }
  const rows = (parsed as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) {
    return { kind: "refused", reason: `${path} has no rows array` };
  }
  return { kind: "read", rows: rows as RetirementRow[] };
}
