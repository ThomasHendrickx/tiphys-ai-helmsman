/**
 * ROLE BRIEFS: frontmatter, the shared clause include, the clause round trip,
 * and the phase projection `tiphys brief compose` emits (kernel plan M3,
 * M3-P5 step 6).
 *
 * A role brief is markdown with YAML frontmatter, which section 1.5 of the
 * plan grants as a JUSTIFIED EXCEPTION to the structured-artifact rule: a
 * brief's effect comes from argument, ordering and emphasis, and splitting it
 * into fields produces either one giant string or a set of fragments no agent
 * reads as an argument. The frontmatter carries everything enumerable and is
 * schema-validated; this module is what makes the BODY checkable in the one
 * respect a machine can reach.
 *
 * THREE MECHANISMS LIVE HERE AND THEY ARE DELIBERATELY SEPARATE.
 *
 *   1. Frontmatter split. A brief is decoded before it is validated, exactly
 *      as `tiphys validate` decodes before it validates: a malformed
 *      frontmatter block names the decode, a failing contract names the
 *      pointer, and neither produces a stack trace.
 *   2. The include. `$include: <name>` on a line of its own is resolved
 *      against the brief's own directory. It exists because M3-P5's three
 *      briefs and M3-P6's two carry the SAME dispatch-contract clause text,
 *      and five independently editable copies of a rule drift into five
 *      different rules. There is one copy, `roles/_shared-dispatch-contract.md`.
 *   3. The clause round trip. Every id in `clauses[]` occurs exactly once as a
 *      body heading anchor of the include-expanded body, and every anchor
 *      occurs in `clauses[]`. This is what stops a clause id being a label
 *      with nothing behind it, which would make the clause map a rubber stamp.
 *      It proves PRESENCE and never content: whether the text under a heading
 *      says the opposite of the row it discharges is judgment, and the phase's
 *      own hazard-class table records that no criterion reaches it.
 *
 * D-M3-27 BINDS EVERY PATH THIS MODULE TOUCHES. Composition's whole job is
 * resolving and reading paths it did not create, so every one of them goes
 * through `classifyEntry` and `refuseOpenForWrite` in src/task.ts. A named
 * pipe at a mandated-reading path is a reported refusal naming the path and
 * the observed entry type, never a blocked open. This module adds no bare
 * `readFileSync` and does not patch `src/brief.ts`, which is M1-P4's and
 * carries its own open instance of that class.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyEntry, readRegularFileIfPresent } from "./task.ts";
import type { Diagnostic } from "./validate.ts";

/**
 * The six roles of blueprint section 6 and of the process document's role
 * table. Identical to `schemas/role-brief.schema.json`'s `role` enum and to
 * `role-model-config.yaml`'s `role` values; test/roles.test.ts asserts the
 * three agree rather than trusting this comment.
 */
export const ROLE_IDS: readonly string[] = [
  "orchestrator",
  "investigator",
  "plan-writer",
  "adversarial-plan-reviewer",
  "implementer",
  "clean-room-reviewer",
];

/** The fence a role brief's YAML frontmatter block is delimited by. */
export const FRONTMATTER_FENCE = "---";

/** The include directive, on a line of its own. */
export const INCLUDE_PATTERN = /^\$include:[ \t]+(\S+)[ \t]*$/;

/**
 * A body heading anchor: `## clause <id>` with an optional `: title`.
 *
 * DELIBERATELY EXPLICIT. An anchor form that guessed (say, "a heading whose
 * text looks like an identifier") would classify ordinary headings such as
 * `## Scope` as anchors and redden every brief that has one. The word
 * `clause` is the marker, and a heading without it is prose.
 */
export const CLAUSE_ANCHOR_PATTERN =
  /^#{1,6}[ \t]+clause[ \t]+([A-Za-z][A-Za-z0-9-]*)[ \t]*(?::[^\n]*)?$/;

export type RoleBriefSplit =
  | { ok: true; frontmatter: string; body: string }
  | { ok: false; reason: string };

/**
 * Split a role brief into its frontmatter text and its body.
 *
 * The document must OPEN with the fence. A markdown file with a `---` rule
 * somewhere in the middle is not a role brief with frontmatter, and reading
 * it as one is how a horizontal rule becomes a contract.
 */
export function splitFrontmatter(text: string, label: string): RoleBriefSplit {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_FENCE) {
    return {
      ok: false,
      reason: `${label} does not open with a ${FRONTMATTER_FENCE} frontmatter fence, so it has no role-brief frontmatter to validate`,
    };
  }
  for (let index = 1; index < lines.length; index += 1) {
    if ((lines[index] as string).trim() === FRONTMATTER_FENCE) {
      return {
        ok: true,
        frontmatter: lines.slice(1, index).join("\n"),
        body: lines.slice(index + 1).join("\n"),
      };
    }
  }
  return {
    ok: false,
    reason: `${label} opens a ${FRONTMATTER_FENCE} frontmatter fence that is never closed`,
  };
}

export type IncludeExpansion =
  | { ok: true; text: string; included: string[] }
  | { ok: false; reason: string };

/**
 * Resolve every `$include:` directive in a body against `baseDirectory`.
 *
 * ONE LEVEL, NOT RECURSIVE, and that is a decision rather than an omission: a
 * nested include is a second place the shared text could come from, and the
 * whole point of the shared block is that there is exactly one. An include
 * inside an included file is refused by name.
 */
export function expandIncludes(
  body: string,
  baseDirectory: string,
  label: string,
): IncludeExpansion {
  const included: string[] = [];
  const out: string[] = [];
  for (const line of body.split("\n")) {
    const match = INCLUDE_PATTERN.exec(line);
    if (match === null) {
      out.push(line);
      continue;
    }
    const name = match[1] as string;
    const path = join(baseDirectory, name);
    const read = readRegularFileIfPresent(path);
    if (read.kind === "absent") {
      return {
        ok: false,
        reason: `${label} includes ${name}, and ${path} does not exist`,
      };
    }
    if (read.kind === "refused") {
      return { ok: false, reason: `${label} includes ${name}: ${read.reason}` };
    }
    if (read.body.split("\n").some((candidate) => INCLUDE_PATTERN.test(candidate))) {
      return {
        ok: false,
        reason: `${label} includes ${name}, which itself carries an include directive; includes are one level deep so the shared text has exactly one source`,
      };
    }
    included.push(name);
    out.push(read.body.replace(/\n$/, ""));
  }
  return { ok: true, text: out.join("\n"), included };
}

/** Every clause anchor in a body, in the order they occur, duplicates kept. */
export function clauseAnchors(body: string): string[] {
  const found: string[] = [];
  for (const line of body.split("\n")) {
    const match = CLAUSE_ANCHOR_PATTERN.exec(line);
    if (match !== null) {
      found.push(match[1] as string);
    }
  }
  return found;
}

/**
 * The round trip, in both directions, as diagnostics in the same
 * `INVALID <pointer> <message>` contract the schema validator emits.
 *
 * A frontmatter clause with no anchor is ORPHANED: the id is declared, the
 * clause map resolves it because the id occurs somewhere in the file, and
 * there is no text behind it. A stray anchor is the mirror failure: text
 * exists under a clause id nothing declared, so nothing tracks it.
 */
export function clauseRoundTripDiagnostics(
  clauses: readonly string[],
  body: string,
): Diagnostic[] {
  const anchors = clauseAnchors(body);
  const counts = new Map<string, number>();
  for (const anchor of anchors) {
    counts.set(anchor, (counts.get(anchor) ?? 0) + 1);
  }
  const diagnostics: Diagnostic[] = [];
  const declared = new Set<string>();
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index] as string;
    declared.add(clause);
    const count = counts.get(clause) ?? 0;
    if (count === 0) {
      diagnostics.push({
        pointer: `#/clauses/${String(index)}`,
        message: `clause id ${clause} is declared in frontmatter and has no body heading anchor, so the clause is orphaned`,
      });
      continue;
    }
    if (count > 1) {
      diagnostics.push({
        pointer: `#/clauses/${String(index)}`,
        message: `clause id ${clause} has ${String(count)} body heading anchors and must have exactly one`,
      });
    }
  }
  for (const anchor of [...counts.keys()].sort()) {
    if (!declared.has(anchor)) {
      diagnostics.push({
        pointer: "#/clauses",
        message: `body heading anchor ${anchor} is not declared in frontmatter`,
      });
    }
  }
  return diagnostics;
}

/**
 * Locate the installed kernel root by walking UP from this module and testing
 * for a `roles/` directory holding at least one brief.
 *
 * Counting `..` would be right in exactly one of the two layouts this code
 * runs in (`src/` from source, `dist/src/` from the built entry), which is
 * the layout-dependent break `schemasDirectory` in src/commands/validate.ts
 * already documents. Walking up and TESTING is right in both, and in a
 * relocated copy as well.
 */
export function kernelRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const entries = readdirSync(join(directory, "roles"));
      if (entries.some((name) => name.endsWith(".md"))) {
        return directory;
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
    "the shipped roles/ directory was not found above this module; the installation is incomplete",
  );
}

export type ReadingResolution =
  | { ok: true; paths: string[] }
  | { ok: false; reason: string };

/**
 * Resolve every mandated-reading path against the kernel root, IN ORDER, and
 * stop at the first one that is not a regular file.
 *
 * THE PATH IS NEVER OPENED. Existence and type are established by
 * `classifyEntry`, so a named pipe at a mandated-reading path is refused with
 * its observed type in bounded time instead of blocking this command forever.
 * A MISSING path and a NON-REGULAR path are different states with different
 * failure modes and they are reported differently on purpose (criteria 2 and
 * 6c, which the plan is explicit are not the same criterion).
 */
export function resolveMandatedReading(
  reading: readonly string[],
  root: string,
): ReadingResolution {
  const resolved: string[] = [];
  for (const declared of reading) {
    const path = join(root, declared);
    const entry = classifyEntry(path);
    if (entry.kind === "absent" || entry.kind === "dangling") {
      return {
        ok: false,
        reason: `mandated-reading path ${declared} does not exist (looked for ${path})`,
      };
    }
    if (entry.kind === "irregular" || entry.kind === "unexaminable") {
      return {
        ok: false,
        reason: `mandated-reading path ${declared}: ${entry.reason}`,
      };
    }
    resolved.push(declared);
  }
  return { ok: true, paths: resolved };
}

/* ------------------------------------------------------------------ */
/* The phase projection                                                 */
/* ------------------------------------------------------------------ */

/**
 * THE FIELDS OF A PLAN PHASE THAT `brief compose` RENDERS, in order.
 *
 * HAND-WRITTEN ON PURPOSE, AND THE TEST THAT GUARDS IT IS NOT. Criterion 3b
 * requires the rendered phase text to be a COMPLETE projection of the phase
 * object, and requires the assertion to be driven FROM
 * `schemas/plan.schema.json`'s phase `required` array rather than from a
 * hand-written list. If this list were also derived from the schema the two
 * would move together and the test could never redden, which is the shape of
 * a guard whose condition does not test the property that matters.
 *
 * So: the SCHEMA is the test's source and this list is the renderer's, they
 * are independent, and a later phase adding a required phase field reddens
 * `brief compose renders every required field of the plan schema's phase` until
 * this list is extended. The dangerous state the criterion names is the
 * realistic one, a renderer that silently drops a field while the composed
 * output still contains a mandated-reading list, a body and SOME phase text,
 * and deleting an entry from this list is exactly that state.
 */
export const PHASE_FIELD_ORDER: readonly string[] = [
  "id",
  "branch",
  "intent",
  "grounding",
  "severity",
  "verified-root-cause",
  "steps",
  "files-to-touch",
  "extras",
  "acceptance",
  "hazard-classes",
  "migrations",
  "conflicts-with",
  "parallelizable",
  "citations",
  "fill-in",
];

function renderScalar(value: unknown): string {
  if (typeof value === "string") {
    return value.replace(/\n+$/, "");
  }
  return JSON.stringify(value) ?? String(value);
}

/** Render one field value as markdown lines. */
export function renderFieldValue(value: unknown, indent: string): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${indent}(none)`];
    }
    const lines: string[] = [];
    for (const element of value) {
      if (element !== null && typeof element === "object" && !Array.isArray(element)) {
        const entries = Object.entries(element as Record<string, unknown>);
        const [firstKey, firstValue] = entries[0] as [string, unknown];
        lines.push(`${indent}- ${firstKey}: ${renderScalar(firstValue)}`);
        for (const [key, nested] of entries.slice(1)) {
          if (Array.isArray(nested) || (nested !== null && typeof nested === "object")) {
            lines.push(`${indent}  ${key}:`);
            lines.push(...renderFieldValue(nested, `${indent}    `));
            continue;
          }
          lines.push(`${indent}  ${key}: ${renderScalar(nested)}`);
        }
        continue;
      }
      lines.push(`${indent}- ${renderScalar(element)}`);
    }
    return lines;
  }
  if (value !== null && typeof value === "object") {
    const lines: string[] = [];
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(nested) || (nested !== null && typeof nested === "object")) {
        lines.push(`${indent}${key}:`);
        lines.push(...renderFieldValue(nested, `${indent}  `));
        continue;
      }
      lines.push(`${indent}${key}: ${renderScalar(nested)}`);
    }
    return lines.length === 0 ? [`${indent}(none)`] : lines;
  }
  return [`${indent}${renderScalar(value)}`];
}

/** Render one plan phase as the brief's phase section. */
export function renderPhase(phase: Record<string, unknown>): string[] {
  const lines: string[] = [`# Phase ${String(phase["id"] ?? "(unnamed)")}`, ""];
  for (const field of PHASE_FIELD_ORDER) {
    if (!(field in phase)) {
      continue;
    }
    lines.push(`### ${field}`);
    lines.push(...renderFieldValue(phase[field], ""));
    lines.push("");
  }
  return lines;
}
