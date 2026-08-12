/**
 * `tiphys checklist resolve --checklist <id> [--extra <file>] [--framing <id>]`
 * (kernel plan M3, M3-P7 step 5; R-054, T-001).
 *
 * PROBE INJECTION AS DATA. The orchestrator writes a per-phase probe file and
 * this command merges it into the canonical checklist, so a per-phase probe
 * set is reviewable and reusable instead of living in a dispatch prompt
 * nobody can diff. The AGENTS.md duty to WRITE them is M3-P9's; this is the
 * mechanism they plug into.
 *
 * IT VALIDATES BEFORE IT SERVES. Both documents go through exactly what
 * `tiphys validate --type checklist` runs, schema first and derived checks
 * second, and a document that fails is REFUSED rather than partly printed.
 * That is the M3-P3 `mode show` fix round applied at the site that would
 * otherwise repeat it: as first shipped, that command read a document and
 * printed it, invoking neither the schema nor any registered check, so every
 * guard its phase built was bypassed on the one path built for humans. A
 * partial answer from an invalid checklist is worse than an error, because
 * the reviewer cannot tell.
 *
 * THE CONTEXT FOR THE DERIVED CHECKS IS THE PACKAGE ROOT, which is where
 * `gate-registry.yaml` sits, so `gate-probes-resolve` RUNS here rather than
 * SKIPPING. A skip fails the run, and a command that always failed would be a
 * command nobody uses.
 *
 * Exit codes:
 *   0   both documents are valid, the framing resolved, and the list printed
 *   1   a document could not be read or is invalid, an extra probe collided
 *       or required no evidence, or the named framing is not declared
 *   64  usage error (BSD sysexits EX_USAGE)
 *
 * A FRAMING ID THAT IS NOT DECLARED IS 1, NOT 64, for the reason
 * `tiphys mode show` records for an undeclared mode: 64 means the caller used
 * the command wrongly, 1 means the command worked and the answer is no.
 * `--framing fix-round` against a checklist that declares only
 * `criteria-contract` is a well formed question with a negative answer.
 */

import { runChecks } from "../checks.ts";
import { formatDiagnostics, validateInstance } from "../validate.ts";
import { loadTypeSchema } from "./validate.ts";
import { packageRoot } from "../modes.ts";
import {
  readChecklistFile,
  readShippedChecklist,
  renderResolution,
  resolveChecklist,
  shippedChecklistIds,
} from "../checklists.ts";
import type { Checklist } from "../checklists.ts";

/** The artifact type this command reads, and the type its checks are registered for. */
const CHECKLIST_TYPE = "checklist";

/** Exit code for usage errors, per BSD sysexits EX_USAGE. */
export const EX_USAGE = 64;

interface Options {
  checklist?: string;
  extra?: string;
  framing?: string;
}

function usage(): string {
  return "usage: tiphys checklist resolve --checklist <id> [--extra <file>] [--framing <id>]";
}

function parseArgs(argv: string[]): { options?: Options; usageError?: string } {
  const options: Options = {};
  const known = new Map<string, keyof Options>([
    ["--checklist", "checklist"],
    ["--extra", "extra"],
    ["--framing", "framing"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    const field = known.get(argument);
    if (field === undefined) {
      return { usageError: `unknown argument ${argument}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { usageError: `${argument} requires a value` };
    }
    options[field] = value;
    index += 1;
  }
  if (options.checklist === undefined) {
    return { usageError: "--checklist is required" };
  }
  return { options };
}

function fail(reason: string, code: number): number {
  process.stderr.write(`tiphys checklist: ${reason}\n`);
  if (code === EX_USAGE) {
    process.stderr.write(`${usage()}\n`);
  }
  return code;
}

/**
 * Schema, then derived checks, on ONE document. Returns the lines to print
 * when it is invalid, empty when it is not.
 *
 * The same two calls `tiphys validate` makes, in the same order, so the two
 * commands cannot drift into disagreeing about what a valid checklist is.
 */
function invalidityLines(checklist: Checklist, context: string | undefined): string[] {
  const schemaLines = formatDiagnostics(
    validateInstance(loadTypeSchema(CHECKLIST_TYPE), checklist.raw),
  );
  const checks = runChecks(CHECKLIST_TYPE, checklist.raw, context);
  return schemaLines.length > 0 || checks.failed ? [...schemaLines, ...checks.lines] : [];
}

export function cmdChecklist(argv: string[]): number {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "resolve") {
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
  const { checklist: checklistId, extra: extraPath, framing } = parsed.options;

  const canonical = readShippedChecklist(checklistId as string);
  if (!canonical.ok) {
    return fail(canonical.reason, 1);
  }

  /* The package root holds `gate-registry.yaml`, so the cross-document check
     resolves rather than skipping. `packageRoot()` throws when the shipped
     layout is not above this module, which is an incomplete installation and
     not a caller error: one line, never a stack trace. */
  let context: string;
  try {
    context = packageRoot();
  } catch (error) {
    return fail(String(error instanceof Error ? error.message : error), 1);
  }

  const canonicalProblems = invalidityLines(canonical.value, context);
  if (canonicalProblems.length > 0) {
    process.stderr.write(
      `tiphys checklist: ${canonical.value.path} is not a valid ${CHECKLIST_TYPE} document, so it is not served\n`,
    );
    for (const line of canonicalProblems) {
      process.stderr.write(`${line}\n`);
    }
    return 1;
  }

  let extra: Checklist | undefined;
  if (extraPath !== undefined) {
    const read = readChecklistFile(extraPath, extraPath);
    if (!read.ok) {
      return fail(read.reason, 1);
    }
    /* THE EXTRA FILE IS A CHECKLIST DOCUMENT AND IS HELD TO THE SAME
       CONTRACT. Making it a bespoke fragment shape would give the extension
       mechanism a second, weaker schema, and R-054's whole point is that a
       per-phase probe set is data a reviewer can validate on its own. */
    const extraProblems = invalidityLines(read.value, context);
    if (extraProblems.length > 0) {
      process.stderr.write(
        `tiphys checklist: ${read.value.path} is not a valid ${CHECKLIST_TYPE} document, so it is not merged\n`,
      );
      for (const line of extraProblems) {
        process.stderr.write(`${line}\n`);
      }
      return 1;
    }
    extra = read.value;
  }

  const resolved = resolveChecklist({
    checklist: canonical.value,
    extra,
    framingId: framing,
  });
  if (!resolved.ok) {
    for (const reason of resolved.reasons) {
      process.stderr.write(`tiphys checklist: ${reason}\n`);
    }
    return 1;
  }

  for (const line of renderResolution(canonical.value, resolved.value)) {
    process.stdout.write(`${line}\n`);
  }
  return 0;
}

/** The shipped ids, for the usage line and for tests that must not hand-list them. */
export function declaredChecklistIds(): string[] {
  return shippedChecklistIds();
}
