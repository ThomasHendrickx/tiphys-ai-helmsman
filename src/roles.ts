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
import { dirname, join, posix as posixPath } from "node:path";
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
 * THE OUTPUT CONTRACT CHECK (M3-P5 fix round 1, clean-room finding 1).
 *
 * Every artifact type a brief declares in `outputs[]` has a schema document
 * that governs it, and the brief must put that document on its
 * `mandated-reading` list. A brief that does not is a brief whose agent is
 * never told where the shape of its own deliverable is written.
 *
 * THE MECHANISM, NOT THE INSTANCE. The instance found in review was
 * `roles/investigator.md` declaring `outputs: [report]` while its reading list
 * carried `schemas/finding.schema.json`, the contract of a DIFFERENT role's
 * artifact. Repairing that one list leaves the method that produced it, and
 * three correct lists that can drift are worth less than one check that cannot
 * be forgotten. M3-P6 ships two more briefs; this runs on them the day they
 * land, with nobody having to remember it.
 *
 * WHY A CHECK AND NOT A DERIVATION, which was the alternative considered.
 * `resolveMandatedReading` could have INJECTED `schemas/<type>.schema.json`
 * into the list from `outputs[]`, making the omission impossible rather than
 * merely refused. Rejected, for three reasons that are properties of the
 * artifact rather than preferences. (1) It would split the truth in two: the
 * brief file on disk would say one thing and the composed brief another, so a
 * reader of `roles/investigator.md` could no longer see what its agent reads,
 * and `tiphys validate --type role-brief` (which reads the file) and
 * `tiphys brief compose` (which would read the file plus an injection) would
 * hold two different opinions about one property. (2) The list is ORDERED and
 * the order is authored; an injected entry has no authored position, and
 * criterion 3 asserts the composed output's ordering. (3) Injection makes the
 * defect invisible instead of absent: the wrong entry that pointed the
 * investigator at the wrong document would still be sitting on the list,
 * silently, with the right one bolted on beside it. The check makes the author
 * fix the file, which is the artifact a consumer of the kernel reads.
 *
 * WHAT IT DOES NOT REACH, stated at the definition site. An `outputs` entry
 * naming a type NO schema is registered for is SKIPPED rather than refused:
 * there is no document to mandate, and schemas/role-brief.schema.json declares
 * that residue deliberately (an enum there would serialise M3-P6, M3-P7 and
 * M3-P8 against one file). It reaches the FRONTMATTER only: a brief whose body
 * prose describes the wrong output shape passes this, and that is the judgment
 * case the plan's hazard table hands to M3-P7's `clause-text-matches-row`
 * probe. And it is one sub-case of the hazard row at
 * delivery/plan/kernel-plan-m3.md:3021 ("nothing can compute which document a
 * role NEEDS"); the output contract is the part of that which IS computable,
 * and the rest of the row stands.
 */
/**
 * THE ONE CANONICAL FORM OF A MANDATED-READING ENTRY (fix round 2, D-3).
 *
 * Entries are kernel-root-relative by definition
 * (schemas/role-brief.schema.json:60 says resolution is "against the kernel
 * root"), so `schemas/report.schema.json`, `./schemas/report.schema.json` and
 * `schemas/../schemas/report.schema.json` are three spellings of one document.
 *
 * IT EXISTS BECAUSE TWO COMMANDS WERE COMPARING THE SAME ENTRY DIFFERENTLY.
 * `outputContractDiagnostics` tested raw string membership while
 * `resolveMandatedReading` resolved with `join`, which normalises; so a brief
 * writing `./schemas/report.schema.json` COMPOSED cleanly and was REFUSED by
 * `tiphys validate --type role-brief`. That divergence is fail-safe (the
 * refusal is the strict side) and it is still the shape this round's own
 * argument against injecting the entry rejected: two commands holding two
 * opinions about one property. Both now ask this function.
 *
 * A LEADING `/` IS STRIPPED rather than treated as an absolute path, because
 * `join(root, "/schemas/x")` already resolves to `<root>/schemas/x`: stripping
 * makes the comparison agree with the resolution that was always happening,
 * instead of introducing a form the two commands read differently. This
 * function changes what is COMPARED; it changes nothing about what is OPENED.
 */
export function canonicalReadingEntry(entry: string): string {
  return posixPath.normalize(entry).replace(/^\/+/, "");
}

export function outputContractDiagnostics(
  outputs: readonly string[],
  reading: readonly string[],
  schemaFileForType: (type: string) => string | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declared = new Set(reading.map(canonicalReadingEntry));
  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index] as string;
    const file = schemaFileForType(output);
    if (file === undefined) {
      continue;
    }
    const wanted = `schemas/${file}`;
    if (!declared.has(wanted)) {
      diagnostics.push({
        pointer: `#/outputs/${String(index)}`,
        message: `output type ${output} is governed by ${wanted}, which is not on mandated-reading, so this brief never tells its agent where the contract for its own output is written`,
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
    /* THE SAME CANONICAL FORM THE OUTPUT-CONTRACT CHECK COMPARES (D-3). It is
       a no-op for resolution, because `join` already normalises and already
       treats a leading `/` as root-relative; asking the shared function here
       is what makes "one opinion, two commands" a property of the code rather
       than a claim in a comment. The AUTHORED string is what is reported and
       what `brief compose` renders, so the brief on disk stays readable as
       written. */
    const path = join(root, canonicalReadingEntry(declared));
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
/* M3-P6: the six required sections of the implementer brief            */
/* ------------------------------------------------------------------ */

/**
 * A body SECTION anchor: `## section <id>` with an optional `: title`.
 *
 * A SECOND MARKER RATHER THAN A REUSE OF THE CLAUSE ONE, and the separation is
 * the point. A clause discharges a requirement row and round-trips against
 * `clauses[]`; a section is a structural part of the brief that R-033a
 * enumerates, and it has no frontmatter list to round-trip against. Marking
 * both with `clause` would mean either declaring six section ids in `clauses[]`
 * (where the clause map would then try to resolve them as rows) or exempting
 * six anchors from the round trip, which is a hole in the check that exists to
 * stop labels with nothing behind them.
 */
export const SECTION_ANCHOR_PATTERN =
  /^#{1,6}[ \t]+section[ \t]+([A-Za-z][A-Za-z0-9-]*)[ \t]*(?::[^\n]*)?$/;

/**
 * The six sections R-033a enumerates, IN THE ORDER THE ROW GIVES THEM.
 *
 * HAND-WRITTEN, and there is nowhere to derive it from: R-033a is a row of a
 * markdown table in a plan document, and parsing a requirement row's prose to
 * recover six section names would be the "deciding what another program will
 * do by pattern-matching the text of a file" mechanism, applied to a file that
 * is not even machine-readable. The list is short, closed, and named in the
 * plan; a phase that changes it changes this line and the criterion that
 * witnesses it.
 */
export const R033A_SECTIONS: readonly string[] = [
  "mandated-reading",
  "phase-scope",
  "push-protocol",
  "gate-list",
  "environment-warnings",
  "reporting-contract",
];

/** Every section anchor in a body, in order, duplicates kept. */
export function sectionAnchors(body: string): string[] {
  const found: string[] = [];
  for (const line of body.split("\n")) {
    const match = SECTION_ANCHOR_PATTERN.exec(line);
    if (match !== null) {
      found.push(match[1] as string);
    }
  }
  return found;
}

/**
 * The text under one section anchor: everything from the line after the anchor
 * up to the next heading of any level, or the end of the body.
 */
export function sectionBody(body: string, section: string): string | undefined {
  const lines = body.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = SECTION_ANCHOR_PATTERN.exec(lines[index] as string);
    if (match === null || match[1] !== section) {
      continue;
    }
    const rest = lines.slice(index + 1);
    const end = rest.findIndex((line) => /^#{1,6}[ \t]/.test(line));
    return (end === -1 ? rest : rest.slice(0, end)).join("\n");
  }
  return undefined;
}

/**
 * Why an include-expanded implementer body does not satisfy R-033a, or the
 * empty list when it does.
 *
 * NON-EMPTY IS CHECKED, NOT ONLY PRESENT, and criterion 2 says so in as many
 * words. A section reduced to its heading is the dangerous state here rather
 * than a deleted one: the brief still has six anchors, still composes, still
 * looks complete, and instructs nobody. A check that only counted anchors
 * would be green against exactly that.
 */
export function missingRequiredSections(body: string): string[] {
  const problems: string[] = [];
  const seen = sectionAnchors(body);
  for (const section of R033A_SECTIONS) {
    if (!seen.includes(section)) {
      problems.push(
        `required section ${section} is missing from the brief body, and R-033a requires all six of ${R033A_SECTIONS.join(", ")}`,
      );
      continue;
    }
    if ((sectionBody(body, section) ?? "").trim() === "") {
      problems.push(
        `required section ${section} is present and empty, so the brief carries the heading and none of the instruction`,
      );
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* M3-P6: the generated gate-list block                                 */
/* ------------------------------------------------------------------ */

/**
 * The markers delimiting the generated gate list inside a brief.
 *
 * THE MODE IS IN THE BEGIN MARKER, which is where the brief DECLARES which
 * mode's gate set it carries. It cannot go in the frontmatter: the frontmatter
 * schema is closed (`additionalProperties: false`) and belongs to M3-P5, and a
 * phase that needed a new frontmatter key would be editing another phase's
 * merged contract. The marker is body text, it is visible to a reader of the
 * brief, and `scripts/check-brief-drift.mjs` reads the mode back out of it, so
 * the declaration and the rendering cannot disagree about which mode was meant.
 *
 * HTML comments, so they are invisible in rendered markdown and unambiguous to
 * a line scanner, and they name the producing script so the next person to edit
 * the block by hand is told what to edit instead. The same shape M3-P2 used for
 * CLAUDE.md, deliberately: two drift checks that look different are two things
 * to learn.
 */
export function briefGateBlockBeginMarker(mode: string): string {
  return (
    `<!-- BEGIN GENERATED GATE LIST (mode: ${mode}): rendered from gate-registry.yaml ` +
    "by scripts/check-brief-drift.mjs. Do not edit by hand; edit the registry. -->"
  );
}

export const BRIEF_GATE_BLOCK_END_MARKER = "<!-- END GENERATED GATE LIST -->";

/**
 * THE MODE THE SHIPPED BRIEF'S GATE BLOCK MUST DECLARE, pinned HERE and not in
 * the brief (M3-P6 fix round 1, CV-1).
 *
 * The mechanism this closes, stated as a mechanism rather than as the instance
 * that exposed it: A CHECK WHOSE SUBJECT IS SELECTED BY A VALUE READ FROM THE
 * ARTIFACT IT AUDITS CAN BE SILENTLY NARROWED BY EDITING THAT ARTIFACT. The
 * mode above is read out of the brief's own begin marker, deliberately, so that
 * no CALLER can point the comparison at a mode the brief never claimed. That
 * left the EDITOR of the brief holding the same power: switching the marker to
 * a narrower mode and re-rendering produces a brief advertising five gates
 * instead of fifteen with the drift check green, which is an instruction-surface
 * defect every future implementer reads.
 *
 * Two clean-room contracts reached this from different directions on the same
 * head, one by forcing the narrowing and one by deriving it from the unit
 * arithmetic below, and neither was pointed at it.
 *
 * WHY IT IS A CONSTANT HERE AND NOT A REGISTRY KEY. `gate-registry.yaml` is
 * closed (`additionalProperties: false`) and its schema belongs to M3-P2, so a
 * registry key would be this phase editing another phase's merged contract, the
 * same reasoning that put the mode in the marker rather than in the frontmatter.
 * WHY `full` IS THE RIGHT VALUE is not asserted here as a bare literal: the
 * registered test derives from the registry that this mode selects every gate
 * any mode selects, so narrowing is the only direction the value can move.
 */
export const BRIEF_GATE_BLOCK_MODE = "full";

/** The begin marker's shape, with the mode captured. */
const BEGIN_MARKER_PATTERN =
  /<!-- BEGIN GENERATED GATE LIST \(mode: ([a-z][a-z0-9-]*)\): rendered from gate-registry\.yaml by scripts\/check-brief-drift\.mjs\. Do not edit by hand; edit the registry\. -->/;

export type GateBlockLocation =
  | { ok: true; mode: string; block: string; begin: number; end: number }
  | { ok: false; reason: string };

/**
 * Locate the generated block in a brief, or say why it cannot be located.
 *
 * A MISSING MARKER IS A REFUSAL AND NEVER A SILENT "NO DRIFT". A check that
 * reports clean because it could not find the thing it compares is the
 * guard-condition failure this repository has recorded twice: the watchdog that
 * tested existence instead of freshness, and the byte check that could not see
 * the one byte it existed to catch.
 */
export function locateGateBlock(text: string, path: string): GateBlockLocation {
  const match = BEGIN_MARKER_PATTERN.exec(text);
  if (match === null) {
    return {
      ok: false,
      reason: `${path} carries no generated gate-list begin marker naming a mode`,
    };
  }
  const mode = match[1] as string;
  const begin = match.index;
  if (BEGIN_MARKER_PATTERN.exec(text.slice(begin + 1)) !== null) {
    return { ok: false, reason: `${path} carries more than one gate-list begin marker` };
  }
  const end = text.indexOf(BRIEF_GATE_BLOCK_END_MARKER, begin);
  if (end === -1) {
    return {
      ok: false,
      reason: `${path} carries a gate-list begin marker with no matching ${BRIEF_GATE_BLOCK_END_MARKER}`,
    };
  }
  return {
    ok: true,
    mode,
    block: text.slice(begin, end + BRIEF_GATE_BLOCK_END_MARKER.length),
    begin,
    end,
  };
}

interface RegistryPreflightEntry {
  command: string[];
  note: string;
}

interface RegistryGateEntry {
  id: string;
  applicability: string;
  unitLabel: string;
  modes: string[];
  "verified-by": string;
  probe?: string;
}

export interface GateRegistryDocument {
  preflight: RegistryPreflightEntry[];
  gates: RegistryGateEntry[];
}

export interface GateBlockRendering {
  text: string;
  /**
   * How many GATE ROWS the rendering produced. The gate's `units`, so M2-C-2
   * bites, and it counts the thing the gate's `unitLabel` names.
   *
   * IT USED TO INCLUDE THE PREFLIGHT STEPS AND THAT MADE THE VACUITY GUARD
   * UNREACHABLE (M3-P6 fix round 1, CV-1's second face). `preflight` is
   * mode-independent and always non-empty, so `preflight.length + selected.length`
   * had a floor it could never fall below: a rendering that selected ZERO gates
   * still reported three units, and M2-C-2 rewrites green-with-zero-units and
   * nothing else. The check could therefore report `green (3 generated brief
   * gate rows compared)` over a gate table holding a header, a separator and
   * NOTHING ELSE, and the header's promise that "a run that compared ZERO rows
   * becomes error with vacuous: true" was true of the plumbing and false of the
   * behaviour.
   *
   * The general shape is the one this repository keeps paying for: a count that
   * does not measure what its label names cannot make a guard fire.
   */
  units: number;
}

/**
 * Render the brief's gate-list block from the registry ALONE, for one mode.
 *
 * IT DERIVES, IT DOES NOT READ THE BLOCK. The hazard the plan names for this
 * criterion by name is "a generated gate-list block whose drift check compares
 * the block TO ITSELF rather than to the registry", and that check is green
 * forever. This function takes the decoded registry and a mode string, and
 * nothing else; the brief file is opened only to compare against or write into.
 *
 * ONE RENDERER, TWO CALLERS. `scripts/check-brief-drift.mjs` calls it to
 * compare and to write, and the registered test calls it to assert the composed
 * brief is byte-identical to the registry's rendering. A second copy of this
 * table in the test would be the test asserting agreement with itself.
 */
export function renderBriefGateBlock(
  registry: GateRegistryDocument,
  mode: string,
): GateBlockRendering {
  const selected = registry.gates.filter((gate) => (gate.modes ?? []).includes(mode));
  const lines: string[] = [];
  lines.push(briefGateBlockBeginMarker(mode));
  lines.push("");
  lines.push("Every change must pass these, in order:");
  lines.push("");
  let step = 0;
  for (const entry of registry.preflight) {
    step += 1;
    lines.push(`${String(step)}. \`${entry.command.join(" ")}\` (${entry.note})`);
  }
  lines.push("");
  lines.push(
    `Then the gates \`${mode}\` mode selects, run by ` +
      `\`tiphys gates run --registry gate-registry.yaml --mode ${mode}\`:`,
  );
  lines.push("");
  lines.push("| Gate | Verified by | Applicability | One unit is |");
  lines.push("|---|---|---|---|");
  for (const gate of selected) {
    lines.push(
      `| \`${gate.id}\` | ${gate["verified-by"]}` +
        `${gate.probe === undefined ? "" : ` (probe \`${gate.probe}\`)`}` +
        ` | ${gate.applicability} | ${gate.unitLabel} |`,
    );
  }
  lines.push("");
  lines.push(BRIEF_GATE_BLOCK_END_MARKER);
  return { text: lines.join("\n"), units: selected.length };
}

/* ------------------------------------------------------------------ */
/* M3-P6: the clean-room reviewer's two review contracts (T-007)        */
/* ------------------------------------------------------------------ */

/**
 * The two review contracts of `assurance-modes.yaml`'s `review-contracts`.
 *
 * TWO CONTRACTS, NOT TWO REVIEWERS, and the two are different axes that full
 * mode requires both of. The measured evidence is that both reviews of one
 * phase walked all fifteen acceptance criteria and agreed on every mechanical
 * fact, and the one briefed on hazards found a high-severity defect the other's
 * report does not name.
 */
export const REVIEW_CONTRACTS: readonly string[] = ["criteria", "hazard"];

/** The clause id carrying one contract's instructions. */
export function reviewContractClause(contract: string): string {
  return `review-contract-${contract}`;
}

/**
 * The role whose brief carries a contract per value. Named rather than assumed,
 * because `--review-contract` on any other role is a usage error and the check
 * that says so needs something to compare against.
 */
export const REVIEW_CONTRACT_ROLE = "clean-room-reviewer";

export type ContractSelection = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Keep the selected contract's clause block and DROP the others.
 *
 * The composed brief is what a dispatched reviewer reads, and a brief carrying
 * both contracts has told the reviewer to start from the criteria and not to
 * start from the criteria. Dropping happens at COMPOSE time and never in the
 * file: the file declares both clause ids and carries both blocks, so the
 * clause round trip still sees a complete brief and `tiphys validate` still
 * checks both texts. A design that split the two into two files would have put
 * the shared four-fifths of the brief in two places.
 */
export function selectReviewContract(body: string, contract: string): ContractSelection {
  const keep = reviewContractClause(contract);
  const anchors = clauseAnchors(body);
  if (!anchors.includes(keep)) {
    return {
      ok: false,
      reason: `review contract ${contract} selects clause ${keep}, which the brief body does not carry`,
    };
  }
  const drop = new Set(
    REVIEW_CONTRACTS.filter((other) => other !== contract).map(reviewContractClause),
  );
  const lines = body.split("\n");
  const out: string[] = [];
  let dropping = false;
  for (const line of lines) {
    const match = CLAUSE_ANCHOR_PATTERN.exec(line);
    if (match !== null) {
      dropping = drop.has(match[1] as string);
    } else if (dropping && /^#{1,6}[ \t]/.test(line)) {
      dropping = false;
    }
    if (!dropping) {
      out.push(line);
    }
  }
  return { ok: true, text: out.join("\n") };
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
