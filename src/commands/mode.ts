/**
 * `tiphys mode show --mode <id> [--file <path>]` (kernel plan M3, M3-P3
 * step 5; fix round 1 finding B-002).
 *
 * WHY THIS COMMAND EXISTS: a brief or a human has to be able to read what a
 * declared mode requires without parsing YAML by hand. That is the whole
 * scope. It shows; it does not resolve a project into a mode, does not
 * enforce one, and does not run one.
 *
 * IT VALIDATES BEFORE IT SERVES, and that is the point of the fix round.
 * As first shipped this command read the document and printed it, invoking
 * neither the schema nor any registered check, so every guard the phase built
 * was bypassed on the one path built for humans and briefs. The mechanism is
 * A READER THAT DOES NOT VALIDATE WHAT IT READS, and the fix is not "detect
 * one more bad state": it is that this command now runs exactly what
 * `tiphys validate --type assurance-modes --context <dir>` runs, and REFUSES
 * rather than printing when the document fails. A partial answer from an
 * invalid document is worse than an error, because the reader cannot tell.
 *
 * THE CONTEXT IS THE DOCUMENT'S OWN DIRECTORY. The cross-document checks
 * resolve `gate-registry.yaml` and `schemas/charter.schema.json` beside the
 * document, which is where the npm package puts them and where this repository
 * keeps them. That makes the two `requiresContext` checks run here rather than
 * SKIP, which matters: a skip fails the run, and a command that always failed
 * would be a command nobody uses.
 *
 * Exit codes:
 *   0   the document is valid and the mode was found and printed
 *   1   the document could not be read, is invalid, or no mode carries that id
 *   64  usage error (BSD sysexits EX_USAGE)
 *
 * A MODE ID THAT IS NOT DECLARED IS 1, NOT 64, and the difference is not
 * pedantry. 64 means the caller used the command wrongly; 1 means the command
 * worked and the answer is no. `--mode direct-pr` against a document that
 * declares only `full` is a well-formed question with a negative answer, and a
 * caller that cannot tell those apart cannot script this.
 */

import { dirname } from "node:path";
import { runChecks } from "../checks.ts";
import { formatDiagnostics, validateInstance } from "../validate.ts";
import { loadTypeSchema } from "./validate.ts";
import { readModes, renderMode } from "../modes.ts";

/** The artifact type this command reads, and the type its checks are registered for. */
const MODES_TYPE = "assurance-modes";

/** Exit code for usage errors, per BSD sysexits EX_USAGE. */
export const EX_USAGE = 64;

interface Options {
  mode?: string;
  file?: string;
}

function usage(): string {
  return "usage: tiphys mode show --mode <id> [--file <path>]";
}

function parseArgs(argv: string[]): { options?: Options; usageError?: string } {
  const options: Options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--mode" || argument === "--file") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { usageError: `${argument} requires a value` };
      }
      if (argument === "--mode") {
        options.mode = value;
      } else {
        options.file = value;
      }
      index += 1;
      continue;
    }
    return { usageError: `unknown argument ${argument}` };
  }
  if (options.mode === undefined) {
    return { usageError: "--mode is required" };
  }
  return { options };
}

function fail(reason: string, code: number): number {
  process.stderr.write(`tiphys mode: ${reason}\n`);
  if (code === EX_USAGE) {
    process.stderr.write(`${usage()}\n`);
  }
  return code;
}

export function cmdMode(argv: string[]): number {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "show") {
    return fail(
      subcommand === undefined
        ? "a subcommand is required"
        : `unknown subcommand ${subcommand}`,
      EX_USAGE,
    );
  }
  const parsed = parseArgs(rest);
  if (parsed.options === undefined) {
    return fail(parsed.usageError ?? "usage error", EX_USAGE);
  }

  let read;
  try {
    read = parsed.options.file === undefined ? readModes() : readModes(parsed.options.file);
  } catch (error) {
    /* `packageRoot` throws when the shipped document is not above this module,
       which is an incomplete installation rather than a caller error. One line,
       never a stack trace, the same policy `tiphys validate` applies to its own
       operator-supplied input. */
    return fail(String(error instanceof Error ? error.message : error), 1);
  }
  if (!read.ok) {
    return fail(read.reason, 1);
  }

  /* VALIDATE, THEN SERVE. Schema first and derived checks second, in the same
     order and through the same functions `tiphys validate` uses, so the two
     commands cannot drift into disagreeing about what a valid document is. */
  const lines = formatDiagnostics(validateInstance(loadTypeSchema(MODES_TYPE), read.raw));
  const checks = runChecks(MODES_TYPE, read.raw, dirname(read.path));
  if (lines.length > 0 || checks.failed) {
    process.stderr.write(
      `tiphys mode: ${read.path} is not a valid ${MODES_TYPE} document, so it is not served\n`,
    );
    for (const line of [...lines, ...checks.lines]) {
      process.stderr.write(`${line}\n`);
    }
    return 1;
  }

  const wanted = parsed.options.mode as string;
  const mode = read.modes.find((candidate) => candidate.id === wanted);
  if (mode === undefined) {
    const declared = read.modes.map((candidate) => candidate.id).sort();
    return fail(
      `${read.path} declares no mode ${wanted}; it declares ${declared.length === 0 ? "none" : declared.join(", ")}`,
      1,
    );
  }
  /* WHICH DOCUMENT THIS IS, derived from the invocation rather than from the
     path: no `--file` means `readModes()` walked to the package root and read
     the kernel's own document. CR-004 item 2 turns on that distinction, because
     "no phase has been delivered under this mode" is a claim about the kernel's
     own delivery and is not knowable for a document a consumer supplied. */
  for (const line of renderMode(mode, { shippedDocument: parsed.options.file === undefined })) {
    process.stdout.write(`${line}\n`);
  }
  return 0;
}
