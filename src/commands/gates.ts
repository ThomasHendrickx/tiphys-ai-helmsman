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
import { readRegularFileIfPresent, refuseOpenForWrite, runStep } from "../task.ts";
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
  "usage: tiphys gates <run --manifest <file> --evidence <dir> " +
  "[--base <ref>] [--head <ref>] [--phase <id>] [--only <id>] | " +
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
  evidence?: string;
  result?: string;
  base?: string;
  head?: string;
  phase?: string;
  only: string[];
}

const VALUE_FLAGS = ["--manifest", "--evidence", "--result", "--base", "--head", "--phase"];

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

function cmdRun(args: string[]): number {
  const flags = parseFlags(args);
  if (flags === undefined) {
    return usageError();
  }
  if (flags.manifest === undefined || flags.evidence === undefined) {
    return usageError("run requires --manifest and --evidence");
  }
  if (flags.result !== undefined) {
    return usageError("--result is a gate flag, not a runner flag");
  }
  const outcome = runGates({
    manifestPath: flags.manifest,
    evidenceDir: resolve(flags.evidence),
    base: flags.base,
    head: flags.head,
    phase: flags.phase,
    only: flags.only,
  });
  if (outcome.summary === undefined) {
    process.stderr.write(`tiphys gates run: ${outcome.reason ?? "failed"}\n`);
    return outcome.exitCode;
  }
  const counts = outcome.summary.counts;
  process.stdout.write(
    `gates: declared ${String(counts.declared)} applicable ${String(counts.applicable)} ` +
      `green ${String(counts.green)} red ${String(counts.red)} ` +
      `not-applicable ${String(counts["not-applicable"])} error ${String(counts.error)} ` +
      `vacuous ${String(counts.vacuous)}\n`,
  );
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
  validated += 1;

  return emit(flags.result, {
    ...base,
    status: "green",
    units: validated,
    endedAt: new Date().toISOString(),
    detail: `validated ${schemaDocumentPaths().join(", ")} against the closed keyword set and ${flags.manifest} against gate-manifest.schema.json`,
  });
}

export function cmdGates(args: string[]): number {
  const [subcommand, ...rest] = args;
  if (subcommand === "run") {
    return cmdRun(rest);
  }
  if (subcommand === "self-check") {
    return cmdSelfCheck(rest);
  }
  return usageError();
}
