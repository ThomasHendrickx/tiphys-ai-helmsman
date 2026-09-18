/**
 * `tiphys cutover status|rollback|restore-files|restore-request` (kernel plan
 * M4, M4-P26 and M4-P25). The executable half of D-19's second limb, plus the
 * freeze-point status surface.
 *
 * REGISTERED IN `src/cli.ts` BY M4-P25. The header that stood here said this
 * module was deliberately unregistered because `src/cli.ts` belonged to
 * M4-P16 for the duration of wave 1 of the M4 conflict pre-pass
 * (delivery/plan/m4-conflict-pre-pass.md:60), and that wave is closed: the
 * `cutover` verb is on this phase's files-to-touch list and is now wired, so
 * the rollback document's command lines resolve.
 *
 * Exit codes:
 *   0   the step completed and its observation is printed
 *   1   the step refused, with one reason line naming what was not done
 *   3   `status` only: the question was answered and the answer is that WORK
 *       REMAINS (a switch still reads `current`, drain is not clean, or a
 *       retirement row is unported)
 *   64  usage error (BSD sysexits EX_USAGE)
 *
 * A REFUSAL IS 1 AND NOT 64 even when the input file is malformed, because a
 * malformed pre-freeze capture is a well-formed question with a negative
 * answer. A caller that cannot tell those apart cannot script a rollback.
 *
 * 3 IS SEPARATE FROM 1 FOR THE SAME REASON, one level along, and it is the
 * code `tiphys next` already uses for the same meaning
 * (delivery/plan/kernel-plan-m4.md:3234, criterion 1: "distinct from 0 and
 * from 1 so a caller can tell work remains from the command failed"). A
 * cutover that has not completed is not a failure of this command.
 */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadFleet } from "../fleet.ts";
import {
  CANNOT_SEE,
  CUTOVER_SWITCHES,
  PRE_FREEZE_RULESET_PATH,
  RETIREMENT_INVENTORY_PATH,
  ROLLBACK_TRIGGERS,
  UNREHEARSABLE_REASON,
  applyRollback,
  cutoverStatePath,
  evaluateRetirementInventory,
  generateRestoreRequest,
  inFlightItems,
  preFreezeGuard,
  readCutoverState,
  restoreRetirementRoots,
  syncFleetState,
  unmergedBranchCount,
  type CutoverState,
  type CutoverSwitchName,
  type RollbackTrigger,
} from "../cutover.ts";
import { readRegularFileIfPresent, refuseOpenForWrite } from "../task.ts";

/** Exit code for usage errors, per BSD sysexits EX_USAGE. */
export const EX_USAGE = 64;

function usage(): string {
  return [
    "usage: tiphys cutover status --fleet <dir> [--repo <dir>] [--json]",
    "       tiphys cutover status --retirement [--repo <dir>] [--inventory <path>] [--json]",
    "       tiphys cutover rollback --trigger <drain-reversal|retirement-unmet> --fleet <dir> [--reason <text>] [--allow-no-remote] [--json]",
    "       tiphys cutover restore-files --repo <dir> --from <sha> --root <path> [--root <path>]",
    "       tiphys cutover restore-request --ruleset <path> [--out <path>]",
  ].join("\n");
}

function fail(reason: string, code: number): number {
  process.stderr.write(`tiphys cutover: ${reason}\n`);
  if (code === EX_USAGE) {
    process.stderr.write(`${usage()}\n`);
  }
  return code;
}

interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  repeated: Map<string, string[]>;
  usageError?: string;
}

const VALUE_ARGS = new Set([
  "--trigger",
  "--fleet",
  "--reason",
  "--repo",
  "--from",
  "--root",
  "--ruleset",
  "--out",
  "--inventory",
]);
const FLAG_ARGS = new Set(["--json", "--allow-no-remote", "--retirement"]);

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const repeated = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (FLAG_ARGS.has(argument)) {
      flags.add(argument);
      continue;
    }
    if (VALUE_ARGS.has(argument)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { flags, values, repeated, usageError: `${argument} requires a value` };
      }
      values.set(argument, value);
      const list = repeated.get(argument) ?? [];
      list.push(value);
      repeated.set(argument, list);
      index += 1;
      continue;
    }
    return { flags, values, repeated, usageError: `unknown argument ${argument}` };
  }
  return { flags, values, repeated };
}

function isRollbackTrigger(value: string): value is RollbackTrigger {
  return (ROLLBACK_TRIGGERS as readonly string[]).includes(value);
}

/** Exit code for "the question was answered and work remains". */
export const EX_WORK_REMAINS = 3;

/**
 * The five switch lines, ALWAYS FIVE AND ALWAYS IN THE CLOSED ORDER.
 *
 * Iterating `CUTOVER_SWITCHES` rather than the document's own keys is the
 * contract: `Object.keys` would print whatever happened to be in the file, in
 * whatever order it happened to be written, and criterion 1 pins the shape.
 */
function switchLines(state: CutoverState): string[] {
  return CUTOVER_SWITCHES.map((name) => `SWITCH ${name} ${state.switches[name].state}`);
}

/**
 * The state a fleet with no `cutover.json` is in.
 *
 * ABSENT IS NOT UNDECIDABLE HERE, and it is worth saying why this differs from
 * `inFlightItems`, where an absent directory IS undecidable. A fleet that was
 * loaded had its `worktrees/` and `tasks/` when it was loaded, so one that is
 * gone now was removed since and says nothing about what was in it. Nothing
 * creates `cutover.json` at init: its absence is the ORIGINAL state, in which
 * no switch has ever been written and every authority is still the current
 * process's. Reporting five `current` lines and exiting 3 is therefore the
 * measured answer and not a fallthrough, and `flippedAt` is the epoch so that
 * the criterion-5 comparison has an instant to compare against rather than a
 * special case.
 */
function unflippedState(): CutoverState {
  const switches = {} as CutoverState["switches"];
  for (const name of CUTOVER_SWITCHES) {
    switches[name] = {
      state: "current",
      flippedAt: new Date(0).toISOString(),
      flippedBy: "(never written)",
      reason: "cutover.json is absent, so no switch has ever been flipped",
      restoreTo: "current",
    };
  }
  return { switches };
}

/**
 * `tiphys cutover status --retirement`: one line per PORT row of the M4-P23
 * inventory.
 *
 * THE VACUOUS VERDICT IS WHAT THIS EXISTS AGAINST. `ported` requires the named
 * kernel artifact to exist AND that row's negative witness to be RED under it.
 * A verdict derived from the file existing alone is green and worthless: a
 * file can exist and say nothing, and the negative witness is what turns
 * "verify not weaker" from a phrase into a command.
 */
function cmdRetirementStatus(parsed: ParsedArgs): number {
  const repo = resolve(parsed.values.get("--repo") ?? process.cwd());
  const inventory = parsed.values.get("--inventory");
  const inventoryPath =
    inventory === undefined ? join(repo, RETIREMENT_INVENTORY_PATH) : resolve(inventory);
  const read = evaluateRetirementInventory(inventoryPath, repo);
  if (read.kind === "refused") {
    return fail(read.reason, 1);
  }
  const { results, unported } = read.report;
  const lines = results.map(
    (result) => `PORT ${result.id} ${result.verdict} ${result.reason}`,
  );
  lines.push(
    unported === 0
      ? `RETIREMENT complete ${String(results.length)} PORT row(s)`
      : `RETIREMENT ${String(unported)} of ${String(results.length)} PORT row(s) unported`,
  );
  if (parsed.flags.has("--json")) {
    process.stdout.write(
      `${JSON.stringify({ inventory: inventoryPath, results, unported }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  /* A ZERO-ROW INVENTORY IS NOT A COMPLETE RETIREMENT. `unported === 0` over an
     empty list is the vacuous green one level up from the one the row verdict
     guards, so the row count is required to be positive before this reports
     complete. */
  if (results.length === 0) {
    return fail(
      `${inventoryPath} holds no PORT rows, so a complete verdict would assert nothing`,
      1,
    );
  }
  return unported === 0 ? 0 : EX_WORK_REMAINS;
}

/**
 * `tiphys cutover status`: the five switches, the drain predicate, and the
 * pre-freeze precondition.
 *
 * WHAT MAKES THIS EXIT 0. All five switches read `kernel`, drain is clean, and
 * the pre-freeze capture is present and no older than the most recent switch
 * write. Any other combination is nonzero, and the code says WHICH: 1 when the
 * command refused to answer, 3 when it answered and work remains.
 *
 * THE BRANCH COUNT IS PRINTED AND DOES NOT VOTE (M4-D-15,
 * delivery/plan/kernel-plan-m4.md:3279). It is on its own line, after the
 * DRAIN verdict rather than beside it, because a reader who mistakes it for a
 * blocker has the definition of drain that can never read clean.
 */
function cmdStatus(parsed: ParsedArgs): number {
  if (parsed.flags.has("--retirement")) {
    return cmdRetirementStatus(parsed);
  }
  const fleetDir = parsed.values.get("--fleet");
  if (fleetDir === undefined) {
    return fail("--fleet is required", EX_USAGE);
  }
  let fleet;
  try {
    fleet = loadFleet(fleetDir);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 1);
  }
  const repo = resolve(parsed.values.get("--repo") ?? process.cwd());

  const read = readCutoverState(fleet);
  if (read.kind === "refused") {
    return fail(read.reason, 1);
  }
  const state = read.kind === "absent" ? unflippedState() : read.state;
  const items = inFlightItems(fleet);
  const branches = unmergedBranchCount(fleet.root);
  const guard = preFreezeGuard(repo, state);

  const lines: string[] = switchLines(state);
  lines.push(items.length === 0 ? "DRAIN clean" : `DRAIN ${String(items.length)} in flight`);
  lines.push(
    branches.kind === "counted"
      ? `BRANCHES ${String(branches.count)} pushed and unmerged, informational: drain does not count branches (M4-D-15)`
      : `BRANCHES unexaminable ${branches.reason}`,
  );
  for (const item of items) {
    lines.push(`IN-FLIGHT ${item.kind} ${item.id} ${item.detail}`);
  }
  /* ONE REFUSAL LINE PER SWITCH THAT READS `kernel`, not one for the table.
     The criterion says no SWITCH may report `kernel` while the capture is
     absent or stale, so the refusal is attached to each switch that is making
     the claim. A single table-level line would let a reader who greps for a
     switch name see `kernel` and nothing else. */
  const frozen: CutoverSwitchName[] =
    guard.kind === "refused"
      ? CUTOVER_SWITCHES.filter((name) => state.switches[name].state === "kernel")
      : [];
  for (const name of frozen) {
    lines.push(`REFUSED ${name} reports kernel but ${guard.kind === "refused" ? guard.reason : ""}`);
  }
  if (guard.kind === "satisfied") {
    lines.push(`PRE-FREEZE captured ${guard.capturedAt} ${PRE_FREEZE_RULESET_PATH}`);
  } else if (guard.kind === "not-required") {
    lines.push(
      `PRE-FREEZE not-required no switch reads kernel, so there is no freeze to have captured`,
    );
  }
  /* NOT ABBREVIATED WHEN THE ANSWER IS SHORT. A command that prints a shorter
     answer when it has less to say is indistinguishable from one reporting a
     quiet system (standing warning 6). */
  for (const entry of CANNOT_SEE) {
    lines.push(`CANNOT-SEE ${entry}`);
  }

  if (parsed.flags.has("--json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          switches: state.switches,
          drain: { clean: items.length === 0, inFlight: items },
          branches,
          preFreeze: guard,
          cannotSee: CANNOT_SEE,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`${lines.join("\n")}\n`);
  }

  if (guard.kind === "refused") {
    return fail(
      `${PRE_FREEZE_RULESET_PATH}: ${guard.arm}; ${String(frozen.length)} switch(es) report kernel without a usable pre-freeze capture`,
      1,
    );
  }
  const allKernel = CUTOVER_SWITCHES.every((name) => state.switches[name].state === "kernel");
  return allKernel && items.length === 0 ? 0 : EX_WORK_REMAINS;
}

/**
 * Trigger 1 and the flip-back half of trigger 3.
 *
 * `freeze-point-restore` is REFUSED here on purpose. Trigger 2 is not one
 * command: its file half is `restore-files`, its authority half is
 * `restore-request` plus an owner, and collapsing them into one verb would
 * let a green exit code stand for a restoration that has not happened. The
 * refusal names the unrehearsable property in the same sentence.
 */
function cmdRollback(parsed: ParsedArgs): number {
  const triggerValue = parsed.values.get("--trigger");
  if (triggerValue === undefined) {
    return fail("--trigger is required", EX_USAGE);
  }
  if (!isRollbackTrigger(triggerValue)) {
    return fail(
      `unknown trigger ${triggerValue}, expected one of ${ROLLBACK_TRIGGERS.join(", ")}`,
      EX_USAGE,
    );
  }
  if (triggerValue === "freeze-point-restore") {
    return fail(
      "freeze-point-restore is not one command: run restore-files for the file half, then " +
        `restore-request for the authority half, which is an OWNER action because ${UNREHEARSABLE_REASON}`,
      1,
    );
  }
  const fleetDir = parsed.values.get("--fleet");
  if (fleetDir === undefined) {
    return fail("--fleet is required", EX_USAGE);
  }
  let fleet;
  try {
    fleet = loadFleet(fleetDir);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 1);
  }

  /* Step 2 of trigger 1 runs BEFORE step 1's switch write in this command,
     because the in-flight enumeration is the thing that would be lost if the
     rollback crashed, and enumerating costs nothing. The document orders the
     write first; the observation is the same either way and this order cannot
     lose the list. */
  const items = inFlightItems(fleet);
  const before = readCutoverState(fleet);
  if (before.kind !== "read") {
    return fail(
      before.kind === "absent"
        ? `${cutoverStatePath(fleet)} is absent, so there is no cutover to roll back`
        : before.reason,
      1,
    );
  }

  const outcome = applyRollback(fleet, triggerValue, {
    now: new Date().toISOString(),
    by: "tiphys cutover rollback",
    reason: parsed.values.get("--reason") ?? `rollback trigger ${triggerValue}`,
  });
  if (!outcome.ok) {
    return fail(outcome.reason, 1);
  }

  const sync = syncFleetState(fleet.root, {
    allowNoRemote: parsed.flags.has("--allow-no-remote"),
    message: `cutover rollback: ${triggerValue}`,
    /* The ONE file this command changed. Trigger 1 fires precisely when
       in-flight work exists, so the fleet is dirty by construction and a
       rollback that staged everything would commit somebody else's half-done
       work under the rollback's message. */
    paths: ["cutover.json"],
  });
  const lines: string[] = [];
  /* Iterate the CLOSED list rather than the object's keys: the five names and
     their order are the contract, and `Object.keys` would print whatever
     happened to be in the file. */
  for (const name of CUTOVER_SWITCHES) {
    lines.push(`SWITCH ${name} ${outcome.next.switches[name].state}`);
  }
  lines.push(
    items.length === 0 ? "DRAIN clean" : `DRAIN ${String(items.length)} in flight`,
  );
  for (const item of items) {
    lines.push(`IN-FLIGHT ${item.kind} ${item.id} ${item.detail}`);
  }
  for (const entry of CANNOT_SEE) {
    lines.push(`CANNOT-SEE ${entry}`);
  }
  if (sync.ok && sync.pushed) {
    lines.push(`SYNC pushed ${sync.head}`);
  } else if (sync.ok) {
    lines.push(`SYNC not-pushed ${sync.reason}`);
  }
  if (parsed.flags.has("--json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          trigger: triggerValue,
          changes: outcome.changes,
          switches: outcome.next.switches,
          inFlight: items,
          cannotSee: CANNOT_SEE,
          sync,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  if (!sync.ok) {
    return fail(sync.reason, 1);
  }
  return 0;
}

/** Trigger 2 step 2: the cheap half, guarded by the dirty-tree refusal. */
function cmdRestoreFiles(parsed: ParsedArgs): number {
  const repo = parsed.values.get("--repo");
  const from = parsed.values.get("--from");
  const roots = parsed.repeated.get("--root") ?? [];
  if (repo === undefined || from === undefined || roots.length === 0) {
    return fail("--repo, --from and at least one --root are required", EX_USAGE);
  }
  const outcome = restoreRetirementRoots(resolve(repo), from, roots);
  if (!outcome.ok) {
    return fail(outcome.reason, 1);
  }
  /* The removals are printed rather than folded into RESTORED. A restore that
     deleted files is a different event from one that only rewrote them, and a
     reader who cannot tell them apart cannot check the result. */
  for (const path of outcome.removed) {
    process.stdout.write(`REMOVED-AFTER-FREEZE ${path}\n`);
  }
  process.stdout.write(
    `RESTORED ${from} ${outcome.roots.join(" ")} (${String(outcome.removed.length)} post-freeze addition(s) removed)\n`,
  );
  return 0;
}

/** Trigger 2 step 3: prepare the owner request. It does not perform it. */
function cmdRestoreRequest(parsed: ParsedArgs): number {
  const rulesetPath = parsed.values.get("--ruleset");
  if (rulesetPath === undefined) {
    return fail("--ruleset is required", EX_USAGE);
  }
  const read = readRegularFileIfPresent(resolve(rulesetPath));
  if (read.kind === "absent") {
    return fail(`${rulesetPath} is absent, so no pre-freeze value can be restored`, 1);
  }
  if (read.kind === "refused") {
    return fail(read.reason, 1);
  }
  let parsedDocument: unknown;
  try {
    parsedDocument = JSON.parse(read.body) as unknown;
  } catch (error) {
    return fail(`${rulesetPath} is not valid JSON: ${String(error)}`, 1);
  }
  const outcome = generateRestoreRequest(parsedDocument);
  if (!outcome.ok) {
    for (const reason of outcome.reasons) {
      process.stderr.write(`tiphys cutover: ${reason}\n`);
    }
    process.stderr.write(
      `tiphys cutover: the owner request was NOT generated, because an incomplete request looks complete\n`,
    );
    return 1;
  }
  const out = parsed.values.get("--out");
  if (out === undefined) {
    process.stdout.write(outcome.text);
  } else {
    const target = resolve(out);
    /* THE ONE ANSWER TO "may this path be opened" applies to this write too.
       `--out` is an operator-supplied path, and opening a named pipe for
       writing blocks exactly as reading one does (src/task.ts:152). This was
       the only write in the phase that went straight to an unprobed path. */
    const refusal = refuseOpenForWrite(target);
    if (refusal !== undefined) {
      return fail(refusal, 1);
    }
    writeFileSync(target, outcome.text);
    process.stdout.write(`REQUEST ${out} ${String(outcome.fields)} field(s)\n`);
  }
  return 0;
}

export function cmdCutover(argv: string[]): number {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined) {
    return fail("a subcommand is required", EX_USAGE);
  }
  const parsed = parseArgs(rest);
  if (parsed.usageError !== undefined) {
    return fail(parsed.usageError, EX_USAGE);
  }
  if (subcommand === "status") {
    return cmdStatus(parsed);
  }
  if (subcommand === "rollback") {
    return cmdRollback(parsed);
  }
  if (subcommand === "restore-files") {
    return cmdRestoreFiles(parsed);
  }
  if (subcommand === "restore-request") {
    return cmdRestoreRequest(parsed);
  }
  return fail(`unknown subcommand ${subcommand}`, EX_USAGE);
}
