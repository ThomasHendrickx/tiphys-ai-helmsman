import { resolve } from "node:path";
import { EX_USAGE } from "../cli.ts";
import {
  loadManifest,
  schemaDocumentPaths,
} from "../gates/manifest.ts";
import {
  EXIT_GATE_ERROR,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "../gates/result.ts";
import { runGates } from "../gates/run.ts";
import { loadSchema } from "../gates/validate.ts";
import {
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
import { writeFileSync } from "node:fs";
import type { GateResultFields, GateStatus } from "../gates/result.ts";

/**
 * tiphys gates (kernel plan M2, M2-P1 step 7).
 *
 *   gates run        run a manifest's gates and write an evidence bundle
 *   gates self-check the `manifest-self-check` gate itself
 *
 * `self-check` lives here rather than in a script because it is the ONE gate
 * the initial manifest carries, and M2R-012's point is that the first CI run
 * must measure something real rather than report a green bundle over an
 * empty gate set. It validates both shipped schema documents against the
 * closed keyword set and the manifest against its own schema, so a schema
 * document that grows an unimplemented keyword, or a manifest that drifts
 * from its shape, turns the bundle red on the run that introduced it.
 */

const USAGE =
  "usage: tiphys gates <run (--manifest <file> | --registry <file> [--mode <mode>]) " +
  "--evidence <dir> [--base <ref>] [--head <ref>] [--phase <id>] [--only <id>] | " +
  "self-check --manifest <file> --result <file> --evidence <dir>>";

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys gates: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

interface Flags {
  manifest?: string;
  /* M3-P2 step 4. `--registry <file>` names a canonical gate registry
     (gate-registry.yaml) instead of an M2 gate manifest, and `--mode <mode>`
     selects the entries whose `modes[]` contains it. They are separate flags
     rather than a `--manifest` that guesses at its argument's shape, because
     deciding what a document is by pattern-matching it is the mechanism
     MECHANISMS.md forbids and the runner's own header already refuses. */
  registry?: string;
  mode?: string;
  evidence?: string;
  result?: string;
  base?: string;
  head?: string;
  phase?: string;
  only: string[];
}

const VALUE_FLAGS = [
  "--manifest",
  "--registry",
  "--mode",
  "--evidence",
  "--result",
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
    if (flag === "--manifest") {
      flags.manifest = value;
    } else if (flag === "--registry") {
      flags.registry = value;
    } else if (flag === "--mode") {
      flags.mode = value;
    } else if (flag === "--evidence") {
      flags.evidence = value;
    } else if (flag === "--result") {
      flags.result = value;
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
  if (flags.manifest !== undefined && flags.registry !== undefined) {
    // Two source documents is not a stronger run, it is an ambiguous one, and
    // an ambiguous run's summary would name a document that governed half of
    // it. Refuse rather than pick (M2-C-3, fail closed).
    return usageError("--manifest and --registry are mutually exclusive; pass one");
  }
  if (flags.mode !== undefined && flags.registry === undefined) {
    // A mode with nothing to select from is silently ignored otherwise, and a
    // caller who believed the run was mode-scoped would read a wider bundle as
    // a narrower one.
    return usageError("--mode selects registry entries and requires --registry");
  }
  const source = flags.manifest ?? flags.registry;
  if (source === undefined || flags.evidence === undefined) {
    return usageError("run requires --manifest or --registry, and --evidence");
  }
  if (flags.result !== undefined) {
    return usageError("--result is a gate flag, not a runner flag");
  }
  const outcome = runGates({
    manifestPath: source,
    registry: flags.registry !== undefined,
    mode: flags.mode,
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
  if (outcome.summary.registry === true) {
    process.stdout.write(
      `gates: registry ${outcome.summary.manifest} mode ${String(outcome.summary.mode)}\n`,
    );
  }
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
  // reading the terminal saw `1 gate(s) reported error: manifest-self-check`
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

/** Write a gate's own record, then exit with the code its status maps to. */
function emit(path: string, fields: GateResultFields): number {
  const result = makeGateResult(fields);
  const refusal = refuseOpenForWrite(path);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys gates self-check: ${refusal}\n`);
    return EXIT_GATE_ERROR;
  }
  const written = runStep(`writing ${path}`, () =>
    writeFileSync(path, renderGateResult(result)),
  );
  if (!written.ok) {
    process.stderr.write(`tiphys gates self-check: ${written.reason}\n`);
    return EXIT_GATE_ERROR;
  }
  const status: GateStatus = result.status;
  process.stdout.write(`${result.gate}: ${status} (${String(result.units)} ${result.unitLabel})\n`);
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  return exitCodeForStatus(status);
}

function cmdSelfCheck(args: string[]): number {
  const flags = parseFlags(args);
  if (flags === undefined) {
    return usageError();
  }
  if (flags.manifest === undefined || flags.result === undefined) {
    return usageError("self-check requires --manifest and --result");
  }
  const startedAt = new Date().toISOString();
  const base = {
    gate: "manifest-self-check",
    unitLabel: "schema documents validated",
    startedAt,
    evidence: [] as string[],
  };

  // Every shipped schema document, loaded through the closed keyword check.
  // A keyword this validator does not implement is a LOAD failure, which is
  // this gate's red: the document would otherwise be validating less than it
  // appears to.
  let validated = 0;
  for (const path of schemaDocumentPaths()) {
    const read = readRegularFileIfPresent(path);
    if (read.kind !== "read") {
      return emit(flags.result, {
        ...base,
        status: "error",
        units: validated,
        endedAt: new Date().toISOString(),
        detail:
          read.kind === "absent"
            ? `schema document ${path} is missing from this installation`
            : read.reason,
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(read.body);
    } catch (error) {
      return emit(flags.result, {
        ...base,
        status: "red",
        units: validated,
        endedAt: new Date().toISOString(),
        detail: `${path} does not parse as JSON: ${(error as Error).message}`,
      });
    }
    const loaded = loadSchema(parsed, path);
    if (!loaded.ok) {
      return emit(flags.result, {
        ...base,
        status: "red",
        units: validated,
        endedAt: new Date().toISOString(),
        detail: loaded.reason,
      });
    }
    validated += 1;
  }

  const manifest = loadManifest(flags.manifest);
  if (!manifest.ok) {
    // Diagnostics mean the document WAS validated and found wanting: red.
    // No diagnostics means validation could not happen at all (absent, not a
    // regular file, unparseable): error, fail closed (M2-C-3).
    const invalid = manifest.diagnostics.length > 0;
    return emit(flags.result, {
      ...base,
      status: invalid ? "red" : "error",
      units: validated,
      endedAt: new Date().toISOString(),
      detail: [manifest.reason, ...manifest.diagnostics].join("; "),
    });
  }
  // CR-812. `units` used to be 3, counting the manifest as a "schema document
  // validated". Section 1.4 fixes the unitLabel, `units` is the entire
  // anti-vacuity device of M2-C-2, and the one gate this milestone ships was
  // reporting a count that did not match its own declared unit. The manifest
  // validation is real work and is reported in `detail`, where it belongs.
  return emit(flags.result, {
    ...base,
    status: "green",
    units: validated,
    endedAt: new Date().toISOString(),
    detail:
      `validated ${String(validated)} schema document(s) against the closed keyword set ` +
      `(${schemaDocumentPaths().join(", ")}), and ${flags.manifest} against gate-manifest.schema.json`,
  });
}

/**
 * The outer backstop for CR-801. Node's uncaught-exception exit code is 1,
 * which is this phase's own EXIT_RED, so a throw escaping anywhere under
 * `gates` used to be indistinguishable to a consumer from a gate reporting
 * red. `runGates` folds its own throws; this catches everything else the
 * subcommand can reach, including the schema loads that `self-check`
 * performs outside the runner.
 */
export function cmdGates(args: string[]): number {
  try {
    const [subcommand, ...rest] = args;
    if (subcommand === "run") {
      return cmdRun(rest);
    }
    if (subcommand === "self-check") {
      return cmdSelfCheck(rest);
    }
    return usageError();
  } catch (error) {
    process.stderr.write(
      `tiphys gates: ${singleLine((error as Error).message ?? String(error))}\n`,
    );
    return EXIT_GATE_ERROR;
  }
}
