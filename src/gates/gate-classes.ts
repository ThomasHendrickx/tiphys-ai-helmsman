import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { pathsIdentifySameObject } from "../path-identity.ts";
import { refuseOpenForWrite, runStep, singleLine } from "../task.ts";
import {
  EXIT_GATE_ERROR,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "./result.ts";
import type { GateResultFields, GateStatus } from "./result.ts";

/**
 * THE TYPECHECK GATE (R-041, retargeted by M4-P13 under DR-0028). The kernel
 * ships the gate class and the project ships the command; this repository's
 * registry declares `typecheck` alongside `suite`. M6-P3 deleted the
 * `gate-classes` gate that shared this module (it checked a phase declaration,
 * a process document, DR-0061 (b)); the file keeps its name so the registry
 * command and the stored witnesses stay put.
 *
 * `tsc -b <projects> --force --listFiles`, and both halves of that command
 * are there for a reason.
 *
 *   `--force`   without it the build is incremental and the file list depends
 *               on what happened to be up to date, so the unit count would
 *               vary with the state of `dist/` rather than with the code.
 *   `--listFiles`  the unit count is DERIVED FROM A NUMBER THE COMPILER
 *               PRINTS, never a constant: it is the count of distinct paths
 *               tsc reported it read, so a compiler that checked nothing is
 *               not green.
 *
 * A compiler that prints NO file list is `error`, not green with zero units.
 */

const GATE_IDS = ["typecheck"] as const;

const USAGE =
  "usage: node src/gates/gate-classes.ts typecheck --result <file> " +
  "[--evidence <dir>] --project <tsconfig> [--project <tsconfig> ...]";

interface Flags {
  result?: string;
  evidence?: string;
  project: string[];
}

const SINGLE_VALUE_FLAGS = ["--result", "--evidence"] as const;

function parseFlags(args: string[]): Flags | undefined {
  const flags: Flags = { project: [] };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined) {
      return undefined;
    }
    if (value === undefined || value.startsWith("--")) {
      return undefined;
    }
    if (flag === "--project") {
      flags.project.push(value);
      index += 1;
      continue;
    }
    if (!(SINGLE_VALUE_FLAGS as readonly string[]).includes(flag)) {
      return undefined;
    }
    const key = flag.slice(2) as "result" | "evidence";
    flags[key] = value;
    index += 1;
  }
  return flags;
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys gates typecheck: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

function now(): string {
  return new Date().toISOString();
}

/** Write the record, print the one-line summary, and return the exit code. */
function emit(gateId: string, resultPath: string, fields: GateResultFields): number {
  const result = makeGateResult(fields);
  const refusal = refuseOpenForWrite(resultPath);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys gates ${gateId}: ${refusal}\n`);
    return EXIT_GATE_ERROR;
  }
  const written = runStep(`writing ${resultPath}`, () =>
    writeFileSync(resultPath, renderGateResult(result)),
  );
  if (!written.ok) {
    process.stderr.write(`tiphys gates ${gateId}: ${written.reason}\n`);
    return EXIT_GATE_ERROR;
  }
  const status: GateStatus = result.status;
  process.stdout.write(`${result.gate}: ${status} (${String(result.units)} ${result.unitLabel})\n`);
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  return exitCodeForStatus(status);
}

/* -------------------------------------------------------------------- */
/* The typecheck gate                                                    */
/* -------------------------------------------------------------------- */

const TYPECHECK_UNIT_LABEL = "source files type-checked";
/** `<path>(<line>,<col>): error TS<n>:` is the compiler's own diagnostic shape. */
const TSC_ERROR_LINE = /error TS[0-9]+:/;

interface CompilerReading {
  files: string[];
  errors: string[];
}

/** Split a real `tsc --listFiles` capture into its file list and its errors. */
function readCompilerOutput(text: string): CompilerReading {
  const files: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    if (TSC_ERROR_LINE.test(line)) {
      errors.push(line);
      continue;
    }
    if (!seen.has(line)) {
      seen.add(line);
      files.push(line);
    }
  }
  return { files, errors };
}

function runTypecheckGate(flags: Flags): number {
  const startedAt = now();
  const resultPath = flags.result as string;
  const shared = { gate: "typecheck", unitLabel: TYPECHECK_UNIT_LABEL, startedAt };
  const projects = flags.project;

  const compiler = join(process.cwd(), "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(compiler)) {
    return emit("typecheck", resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail:
        `the TypeScript compiler is not installed at ${compiler}; this gate asserts nothing ` +
        "without it and reports error rather than a green that measured no project",
    });
  }

  const run = spawnSync(
    process.execPath,
    [compiler, "-b", ...projects, "--force", "--listFiles"],
    { encoding: "utf8", cwd: process.cwd() },
  );
  if (run.error !== undefined) {
    return emit("typecheck", resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail: `the compiler could not be run: ${singleLine(String(run.error))}`,
    });
  }
  const reading = readCompilerOutput(`${run.stdout ?? ""}\n${run.stderr ?? ""}`);
  const units = reading.files.length;

  if (reading.errors.length > 0 || run.status !== 0) {
    const named = reading.errors.slice(0, 5);
    return emit("typecheck", resultPath, {
      ...shared,
      status: "red",
      units,
      endedAt: now(),
      detail:
        `tsc -b ${projects.join(" ")} exited ${String(run.status)} with ` +
        `${String(reading.errors.length)} diagnostic(s): ` +
        (named.length === 0
          ? "the compiler printed no diagnostic line, so the nonzero exit is the whole evidence"
          : named.map((line) => singleLine(line)).join(" | ")),
    });
  }
  if (units === 0) {
    // A green with zero units is rewritten by makeGateResult anyway; saying it
    // here makes the CAUSE legible rather than arriving as a vacuity rewrite.
    return emit("typecheck", resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail:
        `tsc -b ${projects.join(" ")} --listFiles printed no file, so nothing was counted and ` +
        "this gate asserts nothing about the code",
    });
  }
  return emit("typecheck", resultPath, {
    ...shared,
    status: "green",
    units,
    endedAt: now(),
    detail:
      `tsc -b ${projects.join(" ")} --force --listFiles exited 0 and reported ${String(units)} ` +
      "distinct file(s); the unit count is those printed paths, not a constant",
  });
}

/* -------------------------------------------------------------------- */
/* Entry point                                                           */
/* -------------------------------------------------------------------- */

export function main(argv: string[]): number {
  const gateId = argv[0];
  if (gateId === undefined || !(GATE_IDS as readonly string[]).includes(gateId)) {
    return usageError(
      `expected a gate id: ${GATE_IDS.join(" or ")}${gateId === undefined ? "" : `, saw ${gateId}`}`,
    );
  }
  const flags = parseFlags(argv.slice(1));
  if (flags === undefined) {
    return usageError();
  }
  if (flags.result === undefined) {
    return usageError(`${gateId} requires --result`);
  }
  if (flags.project.length === 0) {
    return usageError("typecheck requires at least one --project");
  }
  return runTypecheckGate(flags);
}

const entry = process.argv[1];
if (entry !== undefined && pathsIdentifySameObject(fileURLToPath(import.meta.url), entry)) {
  // An uncaught throw would exit 1, which is EXIT_RED, and a crash reported as
  // a red verdict is indistinguishable from a real one to a consumer.
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys gates typecheck: ${singleLine((error as Error).message ?? String(error))}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}

export { readCompilerOutput };
