/**
 * `tiphys conflicts [--append-only <path>]... <declaration.json> <declaration.json> [...]`
 * (value-delivery plan, M5-P6 step 2; requirement R-026a; DR-0011).
 *
 * THE CONFLICT PRE-PASS, MECHANISED. Every parallel dispatch in this delivery
 * so far rested on a pre-pass computed by hand (delivery/plan/m2-conflict-pre-pass.md
 * and its successors): the pairwise intersection of the phases' declared edit
 * lists. This command computes exactly that and nothing more.
 *
 * WHAT IT READS. Two or more phase declarations, the documents the scope
 * auditor reads (src/gates/schemas/phase-declaration.schema.json). A phase's
 * edit set is `filesToTouch` plus `declaredExtras`. An entry is a literal
 * path, or a literal directory written with a trailing slash, which is the
 * same grammar the scope auditor matches (`isAllowed` in src/gates/scope.ts).
 * So two entries overlap when they are equal, or when one is a directory that
 * contains the other.
 *
 * APPEND-ONLY REGISTRIES ARE NOT OVERLAPS, AND THAT RULE IS PRINTED, NEVER
 * SILENT. CLAUDE.md binding convention 5: `test/behaviors.json`,
 * `gates.manifest.json` and `delivery/requirements/clause-map.json` are
 * append-only and resolved as a union against the merge base; they never
 * re-serialise phases. A shared entry on that list is reported on its own
 * `APPEND-ONLY` line, so a reader sees that it was shared and why it did not
 * count. `--append-only` replaces the default list (repeat it for several);
 * the effective list is printed on every run.
 *
 * WHAT IT DOES NOT DO, AND SAYS SO ON EVERY RUN. Zero literal overlap is not
 * zero semantic coupling (the plan's false-disjointness hazard): a test in one
 * phase may assert on text another phase changes, or two phases may change
 * related behaviour in disjoint files. The command cannot see that, so it
 * prints the reviewer obligation as its last stdout line on EVERY run,
 * including a disjoint result, an input error and a usage error. A disjoint
 * verdict without that line would be the hazard itself.
 *
 * EXIT CODES, each distinct so a caller cannot mistake one for another:
 *   0   every pair is literally disjoint (outside the append-only list)
 *   1   at least one pair overlaps; every overlapping path is named
 *   2   a declaration could not be used (missing, unreadable, not a regular
 *       file, not JSON, wrong shape, or a duplicated phase id). NO verdict
 *       is printed, because a declaration that was not read has not been
 *       shown disjoint from anything.
 *   64  usage error
 *
 * Every declaration path is operator-supplied, so it is read through
 * `readOperatorPath`, which establishes the entry type before the open
 * (D-M3-27): a FIFO is refused rather than blocking the command forever.
 */

import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { formatDiagnostics, loadSchema, validate } from "../gates/validate.ts";
import type { SchemaDocument } from "../gates/validate.ts";
import { readRegularFileIfPresent } from "../task.ts";
import { readOperatorPath } from "../validate.ts";

const USAGE =
  "usage: tiphys conflicts [--append-only <path>]... " +
  "<declaration.json> <declaration.json> [<declaration.json>...]";

/** Exit code when at least one pair of declarations overlaps. */
export const EXIT_OVERLAP = 1;
/** Exit code when a declaration could not be read or is not a declaration. */
export const EXIT_INPUT = 2;

/** CLAUDE.md binding convention 5: append-only, union-resolved registries. */
export const DEFAULT_APPEND_ONLY: readonly string[] = [
  "test/behaviors.json",
  "gates.manifest.json",
  "delivery/requirements/clause-map.json",
];

/**
 * The reviewer obligation. Printed as the LAST stdout line of every run,
 * whatever the outcome, so no result of this command can be read as proof of
 * independence.
 */
export const SEMANTIC_COUPLING_OBLIGATION =
  "semantic coupling: NOT CHECKED. Literal file overlap is the only thing " +
  "this command computes; zero overlap is not proof of independence. A " +
  "reviewer must still judge semantic coupling for EVERY pair, disjoint " +
  "ones included (a test in one phase asserting on what another phase " +
  "changes, related behaviour in disjoint files, merge order).";

interface Declaration {
  id: string;
  path: string;
  entries: string[];
}

interface Args {
  appendOnly: string[];
  paths: string[];
}

function parseArgs(argv: string[]): { args?: Args; usageError?: string } {
  const explicit: string[] = [];
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (token === "--append-only") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--") || value === "") {
        return { usageError: "--append-only requires a path" };
      }
      explicit.push(value);
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      return { usageError: `unknown option ${token}` };
    }
    paths.push(token);
  }
  if (paths.length < 2) {
    return {
      usageError: `at least two declarations are required, got ${String(paths.length)}`,
    };
  }
  return {
    args: {
      appendOnly: explicit.length > 0 ? explicit : [...DEFAULT_APPEND_ONLY],
      paths,
    },
  };
}

const schemaUrl = new URL("../gates/schemas/phase-declaration.schema.json", import.meta.url);
let cachedSchema: SchemaDocument | undefined;

function declarationSchema(): SchemaDocument {
  if (cachedSchema !== undefined) {
    return cachedSchema;
  }
  const path = fileURLToPath(schemaUrl);
  const read = readRegularFileIfPresent(path);
  if (read.kind !== "read") {
    throw new Error(
      read.kind === "absent"
        ? `schema document ${path} is missing from this installation`
        : read.reason,
    );
  }
  const loaded = loadSchema(JSON.parse(read.body) as unknown, "phase-declaration.schema.json");
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  cachedSchema = loaded.schema;
  return cachedSchema;
}

type DeclarationRead = { ok: true; declaration: Declaration } | { ok: false; reason: string };

/** Read and shape-check one declaration. Never returns an empty edit set silently. */
export function readDeclaration(path: string): DeclarationRead {
  const read = readOperatorPath(path);
  if (!read.ok) {
    return { ok: false, reason: read.reason };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return {
      ok: false,
      reason: `${path} does not parse as JSON: ${(error as Error).message}`,
    };
  }
  const diagnostics = formatDiagnostics(validate(declarationSchema(), parsed));
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: `${path} is not a valid phase declaration: ${diagnostics.join("; ")}`,
    };
  }
  const document = parsed as { id: string; filesToTouch: string[]; declaredExtras: string[] };
  const entries = [...new Set([...document.filesToTouch, ...document.declaredExtras])];
  return { ok: true, declaration: { id: document.id, path, entries } };
}

/** One shared entry between two declarations. */
export interface SharedEntry {
  /** The entry as the first declaration spells it. */
  left: string;
  /** The entry as the second declaration spells it. */
  right: string;
  /** True when the concrete shared path is on the append-only list. */
  appendOnly: boolean;
}

function isDirectory(entry: string): boolean {
  return entry.endsWith("/");
}

/**
 * Every shared entry between two edit sets, in a deterministic order. Two
 * entries are shared when equal or when one is a directory containing the
 * other. A shared FILE on the append-only list is exempt; a shared directory
 * never is, because a directory can hold anything.
 */
export function sharedEntries(
  left: readonly string[],
  right: readonly string[],
  appendOnly: readonly string[],
): SharedEntry[] {
  const exempt = new Set(appendOnly);
  const found: SharedEntry[] = [];
  for (const a of left) {
    for (const b of right) {
      let concrete: string | undefined;
      if (a === b) {
        concrete = a;
      } else if (isDirectory(a) && b.startsWith(a)) {
        concrete = b;
      } else if (isDirectory(b) && a.startsWith(b)) {
        concrete = a;
      }
      if (concrete === undefined) {
        continue;
      }
      found.push({
        left: a,
        right: b,
        appendOnly: !isDirectory(concrete) && exempt.has(concrete),
      });
    }
  }
  found.sort((x, y) =>
    x.left === y.left ? (x.right < y.right ? -1 : 1) : x.left < y.left ? -1 : 1,
  );
  return found;
}

function describe(shared: SharedEntry): string {
  if (shared.left === shared.right) {
    return shared.left;
  }
  return `${shared.left} and ${shared.right} (directory contains path)`;
}

export function cmdConflicts(argv: string[]): number {
  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  const finish = (code: number): number => {
    out(SEMANTIC_COUPLING_OBLIGATION);
    return code;
  };

  const parsed = parseArgs(argv);
  if (parsed.args === undefined) {
    process.stderr.write(
      `tiphys conflicts: ${parsed.usageError ?? "usage error"}\n${USAGE}\n`,
    );
    return finish(EX_USAGE);
  }
  const { appendOnly, paths } = parsed.args;

  const declarations: Declaration[] = [];
  const problems: string[] = [];
  for (const path of paths) {
    const read = readDeclaration(path);
    if (!read.ok) {
      problems.push(read.reason);
      continue;
    }
    const clash = declarations.find((known) => known.id === read.declaration.id);
    if (clash !== undefined) {
      problems.push(
        `phase id ${read.declaration.id} is declared by both ${clash.path} and ${path}`,
      );
      continue;
    }
    declarations.push(read.declaration);
  }
  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`tiphys conflicts: ${problem}\n`);
    }
    out(
      `conflicts: NO VERDICT: ${String(problems.length)} of ${String(paths.length)} ` +
        "declaration(s) could not be used, so no pair has been shown disjoint",
    );
    return finish(EXIT_INPUT);
  }

  out(
    `conflicts: ${String(declarations.length)} declaration(s): ` +
      declarations.map((d) => `${d.id} (${d.path})`).join(", "),
  );
  out(
    `append-only, union-resolved, never an overlap: ${appendOnly.join(", ")}`,
  );

  let overlappingPairs = 0;
  let disjointPairs = 0;
  let overlappingPaths = 0;
  for (let i = 0; i < declarations.length; i += 1) {
    for (let j = i + 1; j < declarations.length; j += 1) {
      const a = declarations[i] as Declaration;
      const b = declarations[j] as Declaration;
      const shared = sharedEntries(a.entries, b.entries, appendOnly);
      const real = shared.filter((entry) => !entry.appendOnly);
      for (const entry of shared.filter((e) => e.appendOnly)) {
        out(`APPEND-ONLY ${a.id} ${b.id} ${describe(entry)}`);
      }
      for (const entry of real) {
        out(`OVERLAP ${a.id} ${b.id} ${describe(entry)}`);
      }
      if (real.length > 0) {
        overlappingPairs += 1;
        overlappingPaths += real.length;
      } else {
        disjointPairs += 1;
        out(`DISJOINT ${a.id} ${b.id}`);
      }
    }
  }
  out(
    `conflicts: ${String(overlappingPairs)} overlapping pair(s), ` +
      `${String(disjointPairs)} disjoint pair(s), ` +
      `${String(overlappingPaths)} overlapping path(s)`,
  );
  return finish(overlappingPairs > 0 ? EXIT_OVERLAP : 0);
}
