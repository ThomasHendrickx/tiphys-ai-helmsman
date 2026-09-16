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

export type CutoverRead =
  | { kind: "read"; state: CutoverState }
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
  return { kind: "read", state: parsed as CutoverState };
}

export function renderCutoverState(state: CutoverState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
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
export function publishCutoverState(path: string, state: CutoverState): void {
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
 */
export function targetFor(trigger: RollbackTrigger, record: SwitchRecord): SwitchState {
  return trigger === "drain-reversal" ? "current" : record.restoreTo;
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
    nextSwitches[name] = {
      state: to,
      flippedAt: options.now,
      flippedBy: options.by,
      reason: options.reason,
      /* The rolled-back switch can be flipped forward again, and the value it
         would return to is the one it is leaving now. Carrying the OLD
         restoreTo forward would make a second rollback restore a state two
         flips old. */
      restoreTo: record.state,
    };
    if (change.from !== change.to) {
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
    publishCutoverState(cutoverStatePath(fleet), plan.next);
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

export type InFlightKind = "worktree" | "task";

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
  for (const id of listDirectoryNames(fleet.worktreesDir)) {
    const path = join(fleet.worktreesDir, id);
    if (isDirectory(path)) {
      items.push({ kind: "worktree", id, detail: path });
    }
  }
  for (const id of listDirectoryNames(fleet.tasksDir)) {
    const metaRead = readRegularFileIfPresent(join(fleet.tasksDir, id, "meta.json"));
    if (metaRead.kind !== "read") {
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
    if (status !== "open") {
      continue;
    }
    const turnEnd = classifyEntry(turnEndPath(fleet, id));
    if (turnEnd.kind === "absent" || turnEnd.kind === "dangling") {
      items.push({ kind: "task", id, detail: "open with no turn-end" });
    }
  }
  return items.sort((a, b) => `${a.kind}/${a.id}`.localeCompare(`${b.kind}/${b.id}`));
}

/**
 * Directory test that STATS and never opens. `classifyEntry` deliberately
 * answers one question, "may this be opened", and calls a directory
 * irregular; a worktree IS a directory, so the two need separating. stat(2)
 * does not block on a FIFO the way open(2) does, so this is safe on exactly
 * the paths src/task.ts:118 exists to protect.
 */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listDirectoryNames(path: string): string[] {
  if (!isDirectory(path)) {
    return [];
  }
  try {
    return readdirSync(path).sort();
  } catch {
    return [];
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
 */
export type SyncOutcome =
  | { ok: true; pushed: true; head: string }
  | { ok: true; pushed: false; reason: string }
  | { ok: false; reason: string };

export function syncFleetState(
  fleetRoot: string,
  options: { allowNoRemote?: boolean; message: string },
): SyncOutcome {
  const remotes = runGit(fleetRoot, ["remote"]);
  if (remotes.status !== 0) {
    return { ok: false, reason: `git remote failed in ${fleetRoot}: ${remotes.stderr.trim()}` };
  }
  const hasOrigin = remotes.stdout.split("\n").some((line) => line.trim() === "origin");
  const add = runGit(fleetRoot, ["add", "-A"]);
  if (add.status !== 0) {
    return { ok: false, reason: `git add failed in ${fleetRoot}: ${add.stderr.trim()}` };
  }
  const staged = runGit(fleetRoot, ["diff", "--cached", "--name-only"]);
  if (staged.status !== 0) {
    return { ok: false, reason: `git diff --cached failed: ${staged.stderr.trim()}` };
  }
  if (staged.stdout.trim().length > 0) {
    const commit = runGit(fleetRoot, ["commit", "-q", "-m", options.message]);
    if (commit.status !== 0) {
      return { ok: false, reason: `git commit failed: ${commit.stderr.trim()}` };
    }
  }
  if (!hasOrigin) {
    const reason = `${fleetRoot} has no origin remote, so the rollback is committed locally and NOT published`;
    return options.allowNoRemote === true
      ? { ok: true, pushed: false, reason }
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
  return { ok: true, pushed: true, head: head.stdout.trim() };
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
  | { ok: true; roots: string[] }
  | { ok: false; reason: string };

/**
 * Restore the named retirement roots from a pre-freeze sha.
 *
 * The dirty check runs FIRST and returns before any git invocation that can
 * write. That order is the whole guarantee, and the test asserts the dirty
 * file is byte-identical afterwards rather than asserting the exit code alone.
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
  const checkout = runGit(repoRoot, ["checkout", sha, "--", ...roots]);
  if (checkout.status !== 0) {
    return { ok: false, reason: `git checkout failed: ${checkout.stderr.trim()}` };
  }
  return { ok: true, roots };
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
 */
export function evaluatePortRow(
  row: RetirementRow,
  repoRoot: string,
): PortResult {
  if (row.disposition !== "PORT") {
    return { id: row.id, verdict: "ported", reason: `disposition ${row.disposition} needs no port` };
  }
  if (!nonEmptyString(row.destination)) {
    return { id: row.id, verdict: "unported", reason: "PORT row names no destination" };
  }
  const destination = join(repoRoot, row.destination);
  if (classifyEntry(destination).kind !== "regular") {
    return {
      id: row.id,
      verdict: "unported",
      reason: `destination ${row.destination} does not exist as a file`,
    };
  }
  if (row.negativeWitness === undefined || row.negativeWitness.length === 0) {
    return {
      id: row.id,
      verdict: "unported",
      reason: "PORT row carries no negative-witness command",
    };
  }
  const [program, ...args] = row.negativeWitness as [string, ...string[]];
  const run = spawnSync(program, args, { cwd: repoRoot, encoding: "utf8" });
  if (run.error !== undefined) {
    return {
      id: row.id,
      verdict: "unported",
      reason: `negative witness could not be run: ${String(run.error)}`,
    };
  }
  if (run.status === 0) {
    return {
      id: row.id,
      verdict: "unported",
      reason:
        "negative witness exits 0 under the new artifact, so the destination is WEAKER than the rule it replaced",
    };
  }
  return {
    id: row.id,
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
  const rows = (parsed as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) {
    return { kind: "refused", reason: `${path} has no rows array` };
  }
  return { kind: "read", rows: rows as RetirementRow[] };
}
