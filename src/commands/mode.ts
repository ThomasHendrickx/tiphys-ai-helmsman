/**
 * `tiphys mode show --mode <id>` (kernel plan M3, M3-P3 step 5).
 *
 * WHY THIS COMMAND EXISTS: a brief or a human has to be able to read what a
 * declared mode requires without parsing YAML by hand. That is the whole
 * scope. It shows; it does not resolve a project into a mode, does not
 * enforce one, and does not run one.
 *
 * Exit codes:
 *   0   the mode was found and printed
 *   1   the document could not be read, or no mode carries that id
 *   64  usage error (BSD sysexits EX_USAGE)
 *
 * A MODE ID THAT IS NOT DECLARED IS 1, NOT 64, and the difference is not
 * pedantry. 64 means the caller used the command wrongly; 1 means the command
 * worked and the answer is no. `--mode direct-pr` against a document that
 * declares only `full` is a well-formed question with a negative answer, and a
 * caller that cannot tell those apart cannot script this.
 */

import { readModes, renderMode } from "../modes.ts";

/** Exit code for usage errors, per BSD sysexits EX_USAGE. */
export const EX_USAGE = 64;

interface Options {
  mode?: string;
}

function usage(): string {
  return "usage: tiphys mode show --mode <id>";
}

function parseArgs(argv: string[]): { options?: Options; usageError?: string } {
  const options: Options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--mode") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { usageError: "--mode requires a value" };
      }
      options.mode = value;
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
    read = readModes();
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

  const wanted = parsed.options.mode as string;
  const mode = read.modes.find((candidate) => candidate.id === wanted);
  if (mode === undefined) {
    const declared = read.modes.map((candidate) => candidate.id).sort();
    return fail(
      `${read.path} declares no mode ${wanted}; it declares ${declared.length === 0 ? "none" : declared.join(", ")}`,
      1,
    );
  }
  for (const line of renderMode(mode)) {
    process.stdout.write(`${line}\n`);
  }
  return 0;
}
