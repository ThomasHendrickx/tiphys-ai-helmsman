/**
 * `tiphys validate --type <t> [--context <dir>] <file>` (kernel plan M3,
 * M3-P1 step 8).
 *
 * Exit codes:
 *   0   the instance passed schema validation and every derived check
 *   1   at least one violation, or a derived check that could not run
 *   64  usage error (BSD sysexits EX_USAGE), including `--type auto` on an
 *       instance with no `kind` field
 *
 * TWO STAGES, NEVER CONFLATED (DR-0013 YAML clause 3). The file is DECODED
 * first and the decoded value is VALIDATED second. A decode failure names the
 * decode; a validation failure names the pointer. Neither produces a stack
 * trace on any stream, which is step 8b's policy applied at the site that
 * needs it most: this command's ordinary input is a hand-authored file that
 * will routinely be malformed, and a validator that answers malformed YAML
 * with a stack trace is a validator nobody trusts.
 *
 * THE PATH IS OPERATOR-SUPPLIED (D-M3-27). It is classified before it is
 * opened, so a named pipe is refused with the observed entry type instead of
 * blocking this command forever. Same for the `--context` directory. This is
 * the M1-P5 class (CR-520, twelve paths, four fix rounds) applied to the
 * first kernel command whose ordinary input is a path an operator wrote.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runChecks } from "../checks.ts";
import {
  classifyContextDirectory,
  decodeDocument,
  formatDiagnostics,
  readOperatorPath,
  validateInstance,
} from "../validate.ts";
import type { SchemaDocument } from "../validate.ts";

/** Exit code for usage errors, per BSD sysexits EX_USAGE. */
export const EX_USAGE = 64;

/**
 * The artifact types this milestone's validator knows, and the schema
 * document each resolves to.
 *
 * REGISTERED HERE, EXTENDED BY EVERY LATER PHASE (M3R-001). A phase that
 * introduces an artifact type adds its row here and to the `auto` resolver in
 * the same step, so a type whose schema ships but which `--type` cannot name
 * is not a state this command can be in.
 */
export const TYPE_TABLE: ReadonlyMap<string, string> = new Map([
  ["plan", "plan.schema.json"],
  ["charter", "charter.schema.json"],
  ["decision-record", "decision-record.schema.json"],
  ["status-line", "status-line.schema.json"],
  /* M3-P2 step 6. The registry's own `kind` field is `gate-registry`, so
     adding this row extends `--type` and `resolveAutoType` in one act, which
     is what M3R-001 means by registering the type in the same step that ships
     the schema. */
  ["gate-registry", "gate-registry.schema.json"],
]);

/**
 * Locate the shipped `schemas/` directory by walking UP from this module.
 *
 * The depth differs between the two layouts this code runs in: from source it
 * is `src/commands/` and the directory is two levels up, and from the built
 * entry it is `dist/src/commands/` and the directory is three levels up
 * beside the package root. Counting `..` would therefore be right in exactly
 * one of them, which is the kind of silent, layout-dependent break M2's own
 * schema resolution comment warns about. Walking up and TESTING for the
 * directory is right in both, and in a relocated copy as well.
 */
export function schemasDirectory(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(directory, "schemas");
    try {
      const entries = readdirSync(candidate);
      if (entries.some((name) => name.endsWith(".schema.json"))) {
        return candidate;
      }
    } catch {
      /* not here; keep walking */
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  throw new Error(
    "the shipped schemas/ directory was not found above this module; the installation is incomplete",
  );
}

const schemaCache = new Map<string, SchemaDocument>();

/** Read and decode a shipped schema document. */
export function loadTypeSchema(type: string): SchemaDocument {
  const cached = schemaCache.get(type);
  if (cached !== undefined) {
    return cached;
  }
  const filename = TYPE_TABLE.get(type);
  if (filename === undefined) {
    throw new Error(`no schema is registered for type ${type}`);
  }
  const path = join(schemasDirectory(), filename);
  const read = readOperatorPath(path);
  if (!read.ok) {
    throw new Error(read.reason);
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    throw new Error(decoded.reason);
  }
  const document = decoded.value as SchemaDocument;
  schemaCache.set(type, document);
  return document;
}

/**
 * Resolve `--type auto` from the instance's `kind` field. An instance with no
 * `kind`, or with a `kind` no schema is registered for, is a USAGE error: the
 * caller asked the command to work out which contract applies and it cannot,
 * which is not the same as the document failing that contract.
 */
export function resolveAutoType(instance: unknown): string | undefined {
  if (typeof instance !== "object" || instance === null || Array.isArray(instance)) {
    return undefined;
  }
  const kind = (instance as Record<string, unknown>)["kind"];
  if (typeof kind !== "string" || !TYPE_TABLE.has(kind)) {
    return undefined;
  }
  return kind;
}

interface Options {
  type?: string;
  context?: string;
  file?: string;
}

function usage(): string {
  const types = [...TYPE_TABLE.keys()].sort().join(" | ");
  return `usage: tiphys validate --type <${types} | auto> [--context <dir>] <file>`;
}

function parseArgs(argv: string[]): { options?: Options; usageError?: string } {
  const options: Options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--type" || argument === "--context") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { usageError: `${argument} requires a value` };
      }
      if (argument === "--type") {
        options.type = value;
      } else {
        options.context = value;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) {
      return { usageError: `unknown option ${argument}` };
    }
    if (options.file !== undefined) {
      return { usageError: "exactly one file argument is accepted" };
    }
    options.file = argument;
  }
  if (options.type === undefined) {
    return { usageError: "--type is required" };
  }
  if (options.file === undefined) {
    return { usageError: "a file argument is required" };
  }
  return { options };
}

export function cmdValidate(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (parsed.options === undefined) {
    process.stderr.write(`tiphys validate: ${parsed.usageError ?? "usage error"}\n`);
    process.stderr.write(`${usage()}\n`);
    return EX_USAGE;
  }
  const { type, context, file } = parsed.options;

  if (context !== undefined) {
    const contextProblem = classifyContextDirectory(context);
    if (contextProblem !== undefined) {
      process.stderr.write(`tiphys validate: ${contextProblem}\n`);
      return 1;
    }
  }

  const read = readOperatorPath(file as string);
  if (!read.ok) {
    process.stderr.write(`tiphys validate: ${read.reason}\n`);
    return 1;
  }

  const decoded = decodeDocument(read.body, file as string);
  if (!decoded.ok) {
    process.stderr.write(`tiphys validate: ${decoded.reason}\n`);
    return 1;
  }

  let resolvedType = type as string;
  if (resolvedType === "auto") {
    const automatic = resolveAutoType(decoded.value);
    if (automatic === undefined) {
      process.stderr.write(
        `tiphys validate: --type auto needs a kind field naming a registered type, and ${String(file)} has none\n`,
      );
      return EX_USAGE;
    }
    resolvedType = automatic;
  }
  if (!TYPE_TABLE.has(resolvedType)) {
    process.stderr.write(`tiphys validate: unknown type ${resolvedType}\n`);
    process.stderr.write(`${usage()}\n`);
    return EX_USAGE;
  }

  const schema = loadTypeSchema(resolvedType);
  const diagnostics = validateInstance(schema, decoded.value);
  if (diagnostics.length > 0) {
    for (const line of formatDiagnostics(diagnostics)) {
      process.stdout.write(`${line}\n`);
    }
    return 1;
  }

  const checks = runChecks(resolvedType, decoded.value, context);
  for (const line of checks.lines) {
    process.stdout.write(`${line}\n`);
  }
  return checks.failed ? 1 : 0;
}
