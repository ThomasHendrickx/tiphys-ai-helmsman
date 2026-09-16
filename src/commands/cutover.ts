/**
 * `tiphys cutover rollback|restore-files|restore-request` (kernel plan M4,
 * M4-P26). The executable half of D-19's second limb.
 *
 * NOT REGISTERED IN `src/cli.ts`, AND THAT IS DELIBERATE. `src/cli.ts` is
 * M4-P16's file for the duration of wave 1 of the M4 conflict pre-pass
 * (delivery/plan/m4-conflict-pre-pass.md:60), and this phase's files-to-touch
 * list does not carry it. M4-P25 registers the `cutover` verb along with
 * `cutover status`. Until then these handlers are reached by import, which is
 * how test/cutover.test.ts drives them, and the rollback document says so
 * rather than printing a command line that does not yet run.
 *
 * Exit codes:
 *   0   the step completed and its observation is printed
 *   1   the step refused, with one reason line naming what was not done
 *   64  usage error (BSD sysexits EX_USAGE)
 *
 * A REFUSAL IS 1 AND NOT 64 even when the input file is malformed, because a
 * malformed pre-freeze capture is a well-formed question with a negative
 * answer. A caller that cannot tell those apart cannot script a rollback.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadFleet } from "../fleet.ts";
import {
  CANNOT_SEE,
  CUTOVER_SWITCHES,
  ROLLBACK_TRIGGERS,
  UNREHEARSABLE_REASON,
  applyRollback,
  cutoverStatePath,
  generateRestoreRequest,
  inFlightItems,
  readCutoverState,
  restoreRetirementRoots,
  syncFleetState,
  type RollbackTrigger,
} from "../cutover.ts";
import { readRegularFileIfPresent, refuseOpenForWrite } from "../task.ts";

/** Exit code for usage errors, per BSD sysexits EX_USAGE. */
export const EX_USAGE = 64;

function usage(): string {
  return [
    "usage: tiphys cutover rollback --trigger <drain-reversal|retirement-unmet> --fleet <dir> [--reason <text>] [--allow-no-remote] [--json]",
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
]);
const FLAG_ARGS = new Set(["--json", "--allow-no-remote"]);

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
