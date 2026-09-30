import { resolve } from "node:path";
import { EX_USAGE } from "../cli.ts";
import { EXIT_GATE_ERROR } from "../gates/result.ts";
import { GATE_EVENTS, runGates } from "../gates/run.ts";
import { singleLine } from "../task.ts";

/**
 * tiphys gates run: run the gates a registry selects and write an evidence
 * bundle.
 *
 * `--registry <file>` names the gate registry (gate-registry.yaml), which is
 * the only gate list (DR-0061, M6-P3). `--mode <mode>` selects the entries
 * whose `modes[]` contains it, and `--event <event>` further selects the
 * entries whose `events[]` contains it, so CI runs exactly the gates the
 * registry declares for its event.
 */

const USAGE =
  "usage: tiphys gates run --registry <file> [--mode <mode>] [--event <pull_request|push>] " +
  "--evidence <dir> [--base <ref>] [--head <ref>] [--phase <id>] [--only <id>]";

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys gates: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

interface Flags {
  registry?: string;
  mode?: string;
  event?: string;
  evidence?: string;
  base?: string;
  head?: string;
  phase?: string;
  only: string[];
}

const VALUE_FLAGS = [
  "--registry",
  "--mode",
  "--event",
  "--evidence",
  "--base",
  "--head",
  "--phase",
];

function parseFlags(args: string[]): Flags | undefined {
  const flags: Flags = { only: [] };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag === "--only") {
      if (value === undefined || value.startsWith("--")) {
        return undefined;
      }
      flags.only.push(value);
      i += 1;
      continue;
    }
    if (flag === undefined || !VALUE_FLAGS.includes(flag)) {
      return undefined;
    }
    if (value === undefined || value.startsWith("--")) {
      return undefined;
    }
    if (flag === "--registry") {
      flags.registry = value;
    } else if (flag === "--mode") {
      flags.mode = value;
    } else if (flag === "--event") {
      flags.event = value;
    } else if (flag === "--evidence") {
      flags.evidence = value;
    } else if (flag === "--base") {
      flags.base = value;
    } else if (flag === "--head") {
      flags.head = value;
    } else {
      flags.phase = value;
    }
    i += 1;
  }
  return flags;
}

/**
 * One gate's `detail`, made safe to print as ONE line of this stream.
 *
 * `singleLine` folds newlines, which was the claim the original comment on
 * the print loop made ("cannot forge additional `gates:` lines"). A clean-
 * room hazard reviewer measured that claim as true for `\n` and silently
 * narrower than it reads: `"a\rb".trim()` only trims the ends, so a bare
 * carriage return survives into the printed line and can cosmetically
 * overwrite its start on a real terminal. A gate's `detail` is already-
 * trusted manifest content rather than an external input, so that is
 * defense in depth, not a live exploit; it is fixed here because a comment
 * that claims more than it delivers is the shape this repository keeps
 * paying for. Every C0 control character and DEL becomes a visible escape,
 * so nothing in a detail can move the cursor and nothing is silently
 * dropped either.
 */
function printableDetail(detail: string): string {
  let printable = "";
  for (const character of singleLine(detail)) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      printable += `\\x${code.toString(16).padStart(2, "0")}`;
      continue;
    }
    printable += character;
  }
  return printable;
}

function cmdRun(args: string[]): number {
  const flags = parseFlags(args);
  if (flags === undefined) {
    return usageError();
  }
  if (flags.registry === undefined || flags.evidence === undefined) {
    return usageError("run requires --registry and --evidence");
  }
  if (flags.event !== undefined && !GATE_EVENTS.includes(flags.event)) {
    // An event no registry can declare selects nothing; refuse it here, where
    // the caller's typo is still a usage error and not an empty bundle.
    return usageError(`--event must be one of ${GATE_EVENTS.join(", ")}`);
  }
  const outcome = runGates({
    manifestPath: flags.registry,
    mode: flags.mode,
    event: flags.event,
    evidenceDir: resolve(flags.evidence),
    base: flags.base,
    head: flags.head,
    phase: flags.phase,
    only: flags.only,
  });
  // CR-861: THE RUN IDENTIFIES ITSELF, on every outcome, before anything else
  // it has to say. `summary.json` carried a runId and nothing emitted one, so
  // a caller could not tell whether the summary it read was its own. That is
  // what "a bundle is attributable" has to mean to be true, and it is the
  // property the record-level runId decline rests on: the caller compares the
  // id printed here with `summary.json`'s, and a mismatch means the bundle is
  // someone else's. Printed to stdout even when the run fails, so the id is
  // available to a consumer that captures only one stream.
  process.stdout.write(`gates: run ${outcome.runId}\n`);
  if (outcome.summary === undefined) {
    process.stderr.write(`tiphys gates run: ${outcome.reason ?? "failed"}\n`);
    return outcome.exitCode;
  }
  const counts = outcome.summary.counts;
  // The registry can declare a gate this runner cannot execute (D-11: R-043
  // and R-044 are verified by a clean-room checklist probe, not by a script).
  // Printing them is what makes "the report accounts for EVERY gate the mode
  // selected" checkable from the run's own output: executed rows plus these.
  const declared = outcome.summary.declaredByChecklist ?? [];
  if (declared.length > 0) {
    process.stdout.write(
      `gates: ${String(declared.length)} registry gate(s) declared verified-by ` +
        `clean-room-checklist and NOT executed by this runner: ` +
        `${declared.map((entry) => `${entry.id} (probe ${entry.probe})`).join(", ")}\n`,
    );
  }
  process.stdout.write(
    `gates: registry ${outcome.summary.manifest} mode ${String(outcome.summary.mode)}` +
      `${outcome.summary.event === undefined ? "" : ` event ${outcome.summary.event}`}\n`,
  );
  process.stdout.write(
    `gates: declared ${String(counts.declared)} applicable ${String(counts.applicable)} ` +
      `verdict ${String(counts.verdict)} ` +
      `green ${String(counts.green)} red ${String(counts.red)} ` +
      `not-applicable ${String(counts["not-applicable"])} error ${String(counts.error)} ` +
      `vacuous ${String(counts.vacuous)}\n`,
  );
  // M3-P11 criterion 1: STDOUT NAMES THE PATH.
  //
  // The runner separates "the command could not run" from "the precondition
  // is unmet" and puts the reason in each gate's `detail`, but until this
  // change `detail` never left the evidence directory: this function printed
  // bundle counts and one aggregate reason naming gate IDS, so an operator
  // reading the terminal saw `1 gate(s) reported error: <gate id>`
  // and had to open `summary.json` to learn that the cause was a missing
  // `bin/tiphys.ts`. A verdict a reader has to go and look up is one step
  // better than the skip-that-was-a-crash, not two.
  //
  // EVERY ROW, GREEN INCLUDED. Fix round 1, finding C-1, and the reason the
  // rule is now "every row" rather than "every row that looks interesting".
  //
  // As first written this loop skipped green rows, on the stated ground that
  // a green detail is a count the summary line above already carries. That
  // is an ASSUMPTION ABOUT WHAT A GREEN VERDICT CAN CONTAIN, and the scope
  // gate falsified it in the same pull request: M3-P11 change B relaxed a
  // HARD refusal (a head-side declaration addition was impossible) into a
  // VISIBLE one (it is allowed, and NAMED for a reviewer to sign off), which
  // makes the printed line the entire remaining safeguard. A scope gate
  // carrying nothing but an amendment is GREEN, so the note reached stdout
  // only when the gate ALSO had something else to refuse: visible exactly
  // where the gate already says no, invisible where it is the only refusal
  // there is. The evidence directory holds it in `summary.json` and the
  // gate's captured `stdout.txt`, and no workflow in this repository uploads
  // an artifact, so neither leaves the runner.
  //
  // The mechanism, not the instance: a compensating control is worth what it
  // is READ at, so nothing may decide on a gate's behalf that its own
  // sentence is not worth relaying. Matching a marker string here would fix
  // one gate and leave the next author to rediscover this; relaying every
  // row costs one line per gate and closes the class.
  //
  // Bounded by the gate count, and every printed line goes through
  // `printableDetail` so one gate's detail cannot forge additional `gates:`
  // lines in this stream, by newline OR by carriage return.
  for (const row of outcome.summary.gates) {
    const detail = printableDetail(row.detail);
    process.stdout.write(
      detail === ""
        ? `gates: ${row.id}: ${row.status}\n`
        : `gates: ${row.id}: ${row.status}: ${detail}\n`,
    );
  }
  const stream = outcome.exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`gates: ${outcome.reason ?? ""}\n`);
  return outcome.exitCode;
}

/**
 * The outer backstop for CR-801. Node's uncaught-exception exit code is 1,
 * which is the RED exit code, so a throw escaping anywhere under `gates` would
 * be indistinguishable to a consumer from a gate reporting red.
 */
export function cmdGates(args: string[]): number {
  try {
    const [subcommand, ...rest] = args;
    if (subcommand === "run") {
      return cmdRun(rest);
    }
    return usageError();
  } catch (error) {
    process.stderr.write(
      `tiphys gates: ${singleLine((error as Error).message ?? String(error))}\n`,
    );
    return EXIT_GATE_ERROR;
  }
}
