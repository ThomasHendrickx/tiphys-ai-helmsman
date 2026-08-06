import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyEntry,
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
import {
  EXIT_GATE_ERROR,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "./result.ts";
import { formatDiagnostics, loadSchema, validate } from "./validate.ts";
import type { GateResultFields } from "./result.ts";
import type { SchemaDocument } from "./validate.ts";

/**
 * THE CITATION LINTER (kernel plan M2, M2-P5).
 *
 * HAZARD CLASS (T-007, M2-D-18), restated because it drives every design
 * choice below: "a linter over documents it does not own, walking a tree
 * supplied by configuration." What can defeat it: a path that resolves
 * under two declared roots, guessed rather than refused; a document with
 * zero citations reading as clean; an external root whose match list is
 * implied rather than stated; a whole-corpus scope that reddens merged
 * history and tempts an implementer to edit documents outside the phase;
 * and an entry in the walked tree that is not a regular file (the M1-P5
 * class, CR-520, applied to a gate rather than to the kernel).
 *
 * THE REAL CASE THIS PHASE IS GROUNDED IN. v1 M1-P3 step 1 and M1-P4 step 5
 * cite `bin/fm-lock.sh:47-85` and `bin/fm-teardown.sh:678-712` as bare
 * relative paths into the SCOUTED FIRSTMATE CLONE, which this checkout does
 * not contain. This repository has its own `bin/` directory (`bin/tiphys.ts`
 * today). Without a stated rule the same string resolves two ways: as a
 * dangling reference into firstmate, or as a missing file in this
 * repository's own tree. `externalRoots` exists to make that decision a
 * property of committed configuration rather than a guess (M2R-014).
 *
 * M2-C-6 IS OBEYED BY REUSE, NOT REIMPLEMENTATION. Every read of a path this
 * module did not create -- the linted document, the cited target file, the
 * config schema document, the one-shot inventory's tree walk -- goes through
 * the delivered `classifyEntry` / `readRegularFileIfPresent` from
 * `src/task.ts` (M1-P5). There is no second "may this path be opened"
 * anywhere in this file. A directory LISTING (`readdirSync`, used only by
 * the one-shot inventory walk) is not an open and cannot block; every entry
 * it turns up is classified before its content is ever read, the same
 * split `src/gates/pin.ts`'s own tree walk already uses.
 *
 * THE RECOGNIZED GRAMMAR (step 2), stated once here and nowhere else:
 *
 *   path:LINE                  a single line
 *   path:START-END              an inclusive line range
 *   (either form) + @sha256:<64 lowercase hex>
 *                               content-hash suffix: the cited line(s),
 *                               joined by "\n" with no trailing newline,
 *                               must hash to the given digest
 *
 * `path` is one or more `[A-Za-z0-9_./-]` characters ending in a recognized
 * extension (ts, tsx, js, mjs, cjs, sh, md, json, yaml, yml), matching every
 * real citation in this repository's own delivery/ corpus (verified against
 * the one-shot inventory, recorded in the work history). This is a NEW
 * grammar this phase defines rather than a format belonging to some other
 * program, so MECHANISMS.md's "deciding what another program will do by
 * pattern-matching the text of a file it consumes" does not bind grammar
 * recognition itself -- there is no second function's behaviour being
 * modeled. It DOES bind the ROOT decision (is this path local, external, or
 * neither), which is why that decision reads only committed glob lists and
 * never infers from the string's shape.
 *
 * WHAT REMAINS UNGUARDED, stated rather than chased (fix-round contract,
 * "state what the derivation did not cover"): a path string that happens to
 * end in a recognized extension but is prose rather than a citation (for
 * example a sentence that names a file and, coincidentally, is followed
 * elsewhere on the line by an unrelated colon-number) will be treated as a
 * citation and resolved; the one-shot inventory is where any such
 * false-positive would surface as a spurious unresolved count against a
 * real document, and none did (see the work history's inventory table).
 *
 * SECOND CALL SITE (R-025). This is the ONE executable a plan review runs
 * to re-verify citations, invoked exactly the way the gate runner invokes
 * it: `node src/gates/citations.ts --result <file> --evidence <dir> --base
 * <ref> [--head <ref>]`, typically with `--base` naming the plan's prior
 * reviewed revision and `--head` its current one (or omitted for the
 * working tree). There is no second implementation for that call site: it
 * is this file, run again with different `--base`/`--head` values, and its
 * output is the same `GateResult` JSON a CI consumer reads.
 *
 * CI PRECONDITIONS THIS GATE REQUIRES (recorded here and in the work
 * history, per `delivery/STATE.md`'s CR-902 carry-forward from M2-P1):
 * `fetch-depth: 0` in the checkout step (a shallow clone makes
 * `git diff base...head` fail or under-report), and an EXPLICIT `--head`
 * on `pull_request` events, because the default checkout SHA there is a
 * synthetic merge commit and diffing `base...HEAD` against it does not
 * describe the PR's real content. This module does not own the workflow
 * file (M2-P1's and M2-P9's files-to-touch, not this phase's); the
 * requirement is stated so whichever phase wires the `citations` gate's
 * step supplies both.
 */

/* -------------------------------------------------------------------- */
/* Config shape and the one committed default                            */
/* -------------------------------------------------------------------- */

export interface CitationRoot {
  name: string;
  description?: string;
  /** Explicit path globs. Segments separated by "/"; "*" matches within one
   * segment, "**" matches zero or more whole segments. No other wildcard. */
  match: string[];
}

export interface CitationConfig {
  version: number;
  /** Local roots: this checkout. Matched AFTER externalRoots. */
  roots: CitationRoot[];
  /** Roots naming a repository this checkout does not contain. Matched FIRST. */
  externalRoots: CitationRoot[];
  /** Path globs identifying the configured document set (M2-D-10: diff-scoped
   * at gate run time; walked in full only by the one-shot inventory). */
  documents: string[];
  /** The subset of `documents` in which zero recognized citations is red
   * (M2R-014's narrowed vacuous guard: plans, reviews, verifications). */
  citationRequired: string[];
}

/**
 * THE ONE COMMITTED CONFIGURATION (step 2). Narrowing any of these lists is
 * a scope-audited change (step 4), same as the plan states for `documents`
 * and `citationRequired`.
 *
 * `externalRoots` carries exactly the match list the plan's own grounding
 * names (kernel plan M2 section 3, M2-P5 step 2 and criterion 4):
 * `["bin/fm-*.sh", "bin/fm-session-lock-lib.sh"]`. The second entry is
 * redundant against the first glob today (every real firstmate script this
 * corpus cites matches `bin/fm-*.sh`) and is kept anyway because the plan
 * states it explicitly and a config that silently dropped a stated entry
 * would be narrowing without an audit trail.
 */
export const DEFAULT_CITATION_CONFIG: CitationConfig = {
  version: 1,
  roots: [
    {
      name: "kernel",
      description:
        "This checkout: the Tiphys kernel repository (src/, bin/, test/, " +
        "scripts/, delivery/, schemas/, roles/, tuition/, and root-level " +
        "*.md / *.json).",
      match: [
        "src/**",
        "bin/**",
        "test/**",
        "scripts/**",
        "delivery/**",
        "schemas/**",
        "roles/**",
        "tuition/**",
        "*.md",
        "*.json",
      ],
    },
  ],
  externalRoots: [
    {
      name: "firstmate",
      description:
        "The scouted firstmate clone (delivery/requirements/firstmate-scout-report.md). " +
        "Not present in this checkout: a citation matching this root is recorded " +
        "unverifiable-external with provenance rather than resolved against this " +
        "repository's own bin/ (kernel plan M2, M2-P5 grounding, M2R-014).",
      match: ["bin/fm-*.sh", "bin/fm-session-lock-lib.sh"],
    },
  ],
  documents: [
    "delivery/plan/**/*.md",
    "delivery/review/**/*.md",
    "delivery/verification/**/*.md",
    "delivery/decisions/**/*.md",
    "delivery/work-history/**/*.md",
    "delivery/tuition/**/*.md",
    "delivery/requirements/**/*.md",
    "delivery/STATE.md",
  ],
  citationRequired: [
    "delivery/plan/**/*.md",
    "delivery/review/**/*.md",
    "delivery/verification/**/*.md",
  ],
};

/* -------------------------------------------------------------------- */
/* The config schema, loaded and validated through the delivered reader  */
/* -------------------------------------------------------------------- */

const schemaUrl = new URL("./schemas/citation-config.schema.json", import.meta.url);
let cachedSchema: SchemaDocument | undefined;

/**
 * Load `citation-config.schema.json`. M2-C-6: the schema path is fixed at
 * build time (`import.meta.url`-relative, same resolution `src/gates/
 * manifest.ts` uses for its own schemas), but it is still a path on disk
 * this process did not itself write moments ago, so it is still read
 * through `readRegularFileIfPresent` rather than a bare `readFileSync`.
 */
export function citationConfigSchema(): SchemaDocument {
  if (cachedSchema === undefined) {
    const path = fileURLToPath(schemaUrl);
    const read = readRegularFileIfPresent(path);
    if (read.kind !== "read") {
      throw new Error(
        read.kind === "absent"
          ? `schema document ${path} is missing from this installation`
          : read.reason,
      );
    }
    const parsed = JSON.parse(read.body) as unknown;
    const loaded = loadSchema(parsed, "citation-config.schema.json");
    if (!loaded.ok) {
      throw new Error(loaded.reason);
    }
    cachedSchema = loaded.schema;
  }
  return cachedSchema;
}

export function citationConfigSchemaPath(): string {
  return fileURLToPath(schemaUrl);
}

/** Schema diagnostics for a candidate config document, `INVALID`-formatted. */
export function validateCitationConfigDocument(document: unknown): string[] {
  return formatDiagnostics(validate(citationConfigSchema(), document));
}

/**
 * Criterion 5: a glob string declared under more than one root (local or
 * external) is a config error, named explicitly, never guessed. This is a
 * check on the CONFIGURATION itself (do two roots claim the identical glob
 * string), not an attempt to detect every pair of globs that could ever
 * match an overlapping path -- that second question has no decidable
 * general answer for arbitrary glob pairs, and the plan's own wording
 * ("a path glob listed under two roots") is the narrower, decidable one
 * this function answers.
 */
export interface AmbiguousGlob {
  glob: string;
  roots: string[];
}

export function findAmbiguousGlobs(config: CitationConfig): AmbiguousGlob[] {
  const owners = new Map<string, Set<string>>();
  for (const root of [...config.externalRoots, ...config.roots]) {
    for (const glob of root.match) {
      const set = owners.get(glob) ?? new Set<string>();
      set.add(root.name);
      owners.set(glob, set);
    }
  }
  const ambiguous: AmbiguousGlob[] = [];
  for (const [glob, roots] of owners) {
    if (roots.size > 1) {
      ambiguous.push({ glob, roots: [...roots].sort() });
    }
  }
  ambiguous.sort((a, b) => (a.glob < b.glob ? -1 : a.glob > b.glob ? 1 : 0));
  return ambiguous;
}

/** Every `citationRequired` glob must also appear in `documents` (step 2). */
export function findOrphanCitationRequired(config: CitationConfig): string[] {
  return config.citationRequired.filter((glob) => !config.documents.includes(glob));
}

/* -------------------------------------------------------------------- */
/* Minimal glob matching: "/"-separated segments, "*" and "**" only      */
/* -------------------------------------------------------------------- */

function splitPathSegments(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

function escapeRegExpChar(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

function segmentMatches(pattern: string, segment: string): boolean {
  let source = "";
  for (const ch of pattern) {
    if (ch === "*") {
      source += "[^/]*";
    } else if (ch === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExpChar(ch);
    }
  }
  return new RegExp(`^${source}$`).test(segment);
}

function matchSegments(pattern: string[], path: string[]): boolean {
  if (pattern.length === 0) {
    return path.length === 0;
  }
  const head = pattern[0] as string;
  const restPattern = pattern.slice(1);
  if (head === "**") {
    for (let consumed = 0; consumed <= path.length; consumed += 1) {
      if (matchSegments(restPattern, path.slice(consumed))) {
        return true;
      }
    }
    return false;
  }
  if (path.length === 0) {
    return false;
  }
  if (!segmentMatches(head, path[0] as string)) {
    return false;
  }
  return matchSegments(restPattern, path.slice(1));
}

export function matchesGlob(pattern: string, path: string): boolean {
  return matchSegments(splitPathSegments(pattern), splitPathSegments(path));
}

export function matchesAny(globs: string[], path: string): boolean {
  return globs.some((glob) => matchesGlob(glob, path));
}

/* -------------------------------------------------------------------- */
/* Root classification: external matches first, never a guess (step 2)   */
/* -------------------------------------------------------------------- */

export type RootClassification =
  | { kind: "external"; root: string }
  | { kind: "local"; root: string }
  | { kind: "unmatched" };

export function classifyPathAgainstRoots(
  config: CitationConfig,
  path: string,
): RootClassification {
  for (const root of config.externalRoots) {
    if (matchesAny(root.match, path)) {
      return { kind: "external", root: root.name };
    }
  }
  for (const root of config.roots) {
    if (matchesAny(root.match, path)) {
      return { kind: "local", root: root.name };
    }
  }
  return { kind: "unmatched" };
}

/* -------------------------------------------------------------------- */
/* Citation grammar (step 2)                                             */
/* -------------------------------------------------------------------- */

export interface CitationToken {
  raw: string;
  path: string;
  startLine: number;
  endLine: number;
  hash?: string;
  offset: number;
}

const CITATION_EXTENSIONS = "ts|tsx|js|mjs|cjs|sh|md|json|ya?ml";
const CITATION_SOURCE = String.raw`(?<![A-Za-z0-9_./-])([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:${CITATION_EXTENSIONS})):(\d+)(?:-(\d+))?(?:@sha256:([0-9a-f]{64}))?`;

export function extractCitations(text: string): CitationToken[] {
  const pattern = new RegExp(CITATION_SOURCE, "g");
  const tokens: CitationToken[] = [];
  for (const match of text.matchAll(pattern)) {
    const path = match[1] as string;
    const startLine = Number(match[2]);
    const endLine = match[3] === undefined ? startLine : Number(match[3]);
    tokens.push({
      raw: match[0],
      path,
      startLine,
      endLine,
      hash: match[4],
      offset: match.index ?? 0,
    });
  }
  return tokens;
}

/**
 * Lines of a file body, 1-indexed by position in the returned array. A
 * single trailing newline is not counted as an extra blank line (matching
 * the common editor notion of "how many lines does this file have"); a
 * completely empty body has zero lines.
 */
export function splitLines(body: string): string[] {
  if (body === "") {
    return [];
  }
  const withoutTrailingNewline = body.endsWith("\n") ? body.slice(0, -1) : body;
  return withoutTrailingNewline === "" ? [""] : withoutTrailingNewline.split("\n");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/* -------------------------------------------------------------------- */
/* Citation resolution                                                   */
/* -------------------------------------------------------------------- */

export type CitationResolution =
  | { kind: "resolved"; detail: string }
  | { kind: "unresolved"; detail: string }
  | { kind: "unverifiable-external"; root: string; detail: string }
  /** M2-C-6: the cited target is present and is not a regular file. */
  | { kind: "read-error"; path: string; reason: string };

export function resolveCitation(
  config: CitationConfig,
  repoRoot: string,
  token: CitationToken,
): CitationResolution {
  const classification = classifyPathAgainstRoots(config, token.path);
  if (classification.kind === "external") {
    return {
      kind: "unverifiable-external",
      root: classification.root,
      detail: `${token.raw} matches external root ${classification.root}, not present in this checkout`,
    };
  }
  if (classification.kind === "unmatched") {
    return {
      kind: "unresolved",
      detail: `${token.raw} matches no declared root (local or external)`,
    };
  }
  if (token.endLine < token.startLine) {
    return {
      kind: "unresolved",
      detail: `${token.raw} has an end line before its start line`,
    };
  }
  const absoluteTarget = join(repoRoot, token.path);
  const read = readRegularFileIfPresent(absoluteTarget);
  if (read.kind === "refused") {
    return { kind: "read-error", path: token.path, reason: read.reason };
  }
  if (read.kind === "absent") {
    return {
      kind: "unresolved",
      detail: `${token.raw} cites a file that does not exist (${token.path})`,
    };
  }
  const lines = splitLines(read.body);
  if (token.startLine < 1 || token.endLine > lines.length) {
    return {
      kind: "unresolved",
      detail: `${token.raw} is out of range: ${token.path} has ${String(lines.length)} line(s)`,
    };
  }
  if (token.hash !== undefined) {
    const cited = lines.slice(token.startLine - 1, token.endLine).join("\n");
    const digest = sha256Hex(cited);
    if (digest !== token.hash) {
      return {
        kind: "unresolved",
        detail: `${token.raw} content hash mismatch: recorded ${token.hash}, computed ${digest}`,
      };
    }
  }
  return {
    kind: "resolved",
    detail: `${token.raw} resolved against ${token.path} (${String(lines.length)} line(s))`,
  };
}

/* -------------------------------------------------------------------- */
/* Document linting                                                      */
/* -------------------------------------------------------------------- */

export interface DocumentLint {
  kind: "linted";
  total: number;
  resolved: number;
  unverifiableExternal: number;
  unresolvedDetails: string[];
}

export interface DocumentReadError {
  kind: "read-error";
  path: string;
  reason: string;
}

export function lintDocumentBody(
  config: CitationConfig,
  repoRoot: string,
  body: string,
): DocumentLint | DocumentReadError {
  const tokens = extractCitations(body);
  let resolved = 0;
  let unverifiableExternal = 0;
  const unresolvedDetails: string[] = [];
  for (const token of tokens) {
    const outcome = resolveCitation(config, repoRoot, token);
    if (outcome.kind === "read-error") {
      return outcome;
    }
    if (outcome.kind === "resolved") {
      resolved += 1;
    } else if (outcome.kind === "unverifiable-external") {
      unverifiableExternal += 1;
    } else {
      unresolvedDetails.push(outcome.detail);
    }
  }
  return { kind: "linted", total: tokens.length, resolved, unverifiableExternal, unresolvedDetails };
}

/* -------------------------------------------------------------------- */
/* The one-shot inventory (step 5): reused logic, never a standing gate  */
/* mode. M2-D-10: the KERNEL ENTRY below lints only the diff. This walk  */
/* runs once, by hand, and its result is reported in the work history.  */
/* -------------------------------------------------------------------- */

function isRealDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk `dir` (an absolute path) collecting repo-root-relative, POSIX-style
 * paths that match `config.documents`. M2-C-6: `readdirSync` only LISTS a
 * directory, which cannot block; every entry it returns is classified with
 * `classifyEntry` before this function decides whether to recurse into it
 * (a real directory) or read it (a regular file matched against the
 * documents globs) -- the same split `src/gates/pin.ts`'s `walk` uses.
 * Anything else (a FIFO, a socket, a device node) throws with a reason
 * naming the path and the observed type, exactly as `pin.ts` does; the
 * caller of this walk is a one-shot script, not the standing gate, so
 * failing loudly here is the right shape rather than a silent skip.
 */
function walkDocuments(
  repoRoot: string,
  dir: string,
  config: CitationConfig,
  into: string[],
): void {
  const names = readdirSync(dir).sort();
  for (const name of names) {
    const path = join(dir, name);
    if (isRealDirectory(path)) {
      walkDocuments(repoRoot, path, config, into);
      continue;
    }
    const entry = classifyEntry(path);
    if (entry.kind === "absent" || entry.kind === "dangling") {
      continue;
    }
    if (entry.kind !== "regular") {
      throw new Error(`${entry.reason}; refusing to walk ${repoRoot}`);
    }
    const relativePath = relative(repoRoot, path).split(sep).join("/");
    if (matchesAny(config.documents, relativePath)) {
      into.push(relativePath);
    }
  }
}

/** Every existing document under `startDir` that matches `config.documents`. */
export function listConfiguredDocuments(
  repoRoot: string,
  config: CitationConfig = DEFAULT_CITATION_CONFIG,
  startDir = "delivery",
): string[] {
  const into: string[] = [];
  const root = join(repoRoot, startDir);
  if (!isRealDirectory(root)) {
    return into;
  }
  walkDocuments(repoRoot, root, config, into);
  return into.sort();
}

export interface InventoryRow {
  path: string;
  total: number;
  resolved: number;
  unresolved: number;
  unverifiableExternal: number;
}

/**
 * The one-shot inventory (step 5, criterion 7): every existing document
 * under `startDir` matching `config.documents`, linted with the SAME
 * `lintDocumentBody` the standing diff-scoped gate uses (no second
 * implementation), with per-document counts. Read-only: it reports, and the
 * scope audit's own diff is the proof that nothing outside this phase's
 * files-to-touch was written (M2-D-10: "the corpus is inventoried once...
 * and findings go to the orchestrator").
 */
export function inventoryDeliveryTree(
  repoRoot: string,
  config: CitationConfig = DEFAULT_CITATION_CONFIG,
  startDir = "delivery",
): InventoryRow[] {
  const rows: InventoryRow[] = [];
  for (const path of listConfiguredDocuments(repoRoot, config, startDir)) {
    const read = readRegularFileIfPresent(join(repoRoot, path));
    if (read.kind !== "read") {
      throw new Error(
        read.kind === "absent"
          ? `${path} vanished during the inventory walk`
          : read.reason,
      );
    }
    const lint = lintDocumentBody(config, repoRoot, read.body);
    if (lint.kind === "read-error") {
      throw new Error(`${lint.path}: ${lint.reason}`);
    }
    rows.push({
      path,
      total: lint.total,
      resolved: lint.resolved,
      unresolved: lint.unresolvedDetails.length,
      unverifiableExternal: lint.unverifiableExternal,
    });
  }
  return rows;
}

/* -------------------------------------------------------------------- */
/* The diff, and the kernel gate entry (M2-D-10: diff-scoped only)       */
/* -------------------------------------------------------------------- */

function gitChangedDocuments(
  cwd: string,
  base: string,
  head: string,
): { ok: true; paths: string[] } | { ok: false; reason: string } {
  // --diff-filter=d: a document DELETED between base and head is not linted
  // (there is nothing left to read), which is a normal outcome and not an
  // absence this gate needs to explain.
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=d", `${base}...${head}`],
    { cwd, encoding: "utf8" },
  );
  if (result.error !== undefined) {
    return {
      ok: false,
      reason: `git diff could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `git diff exited ${String(result.status)}: ${singleLine(result.stderr ?? "")}`,
    };
  }
  const paths = (result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return { ok: true, paths };
}

export interface CitationsGateOptions {
  cwd: string;
  base?: string;
  head?: string;
  config?: CitationConfig;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * The kernel gate entry (M2-D-10): lints only the documents CHANGED IN THE
 * DIFF. `--base` absent is `error`, never `not-applicable` (M2-C-3):
 * checked here independently of the runner's own `diff-touches`
 * precondition, because R-025's second call site invokes this function
 * (via the CLI below) directly, outside the runner.
 *
 * THE VACUOUS GUARD, NARROWED (step 4, M2R-014, criterion 6). A
 * `citationRequired` document (a plan, review or verification) with ZERO
 * recognized citation TOKENS -- local, external, or otherwise -- is `red`.
 * Any other configured document with zero tokens contributes zero units
 * and is recorded, never red: `delivery/STATE.md`, tuition entries and work
 * histories legitimately carry none.
 *
 * A STATUS WORD FOR THE CASE THE PLAN NAMES BUT DOES NOT SPELL: a changed
 * set whose only documents are legitimately citation-free (STATE.md,
 * tuition, a work history with no citations this round) resolves ZERO
 * citations and is NOT red (per the paragraph above) and cannot be `green`
 * (M2-C-2: a green record with units 0 is constructed as `error` by
 * `makeGateResult` itself). The remaining, honest word is a GATE-DECLARED
 * `not-applicable` ("nothing in the configured document set needed
 * checking"), the same route `src/gates/run.ts`'s CR-800 commentary
 * documents for a gate that decides its own applicability. Because this
 * gate is registered `required` (section 1.4), that self-declaration still
 * fails the aggregate bundle exactly as a `branch-matches` or `diff-touches`
 * precondition miss would; this is a real, recorded consequence of the
 * table's own applicability choice and is stated in the work history rather
 * than routed around.
 */
export function runCitationsGate(options: CitationsGateOptions): GateResultFields {
  const startedAt = now();
  const config = options.config ?? DEFAULT_CITATION_CONFIG;
  const base = {
    gate: "citations",
    unitLabel: "citations resolved",
    startedAt,
    evidence: [] as string[],
  };

  const schemaDiagnostics = validateCitationConfigDocument(config);
  if (schemaDiagnostics.length > 0) {
    return {
      ...base,
      status: "error",
      units: 0,
      endedAt: now(),
      detail: `citation config is invalid: ${schemaDiagnostics.join("; ")}`,
    };
  }
  const ambiguous = findAmbiguousGlobs(config);
  if (ambiguous.length > 0) {
    return {
      ...base,
      status: "error",
      units: 0,
      endedAt: now(),
      detail:
        "citation config declares glob(s) under more than one root, never guessed: " +
        ambiguous.map((a) => `${JSON.stringify(a.glob)} in ${a.roots.join(", ")}`).join("; "),
    };
  }
  const orphanRequired = findOrphanCitationRequired(config);
  if (orphanRequired.length > 0) {
    return {
      ...base,
      status: "error",
      units: 0,
      endedAt: now(),
      detail: `citationRequired glob(s) not present in documents: ${orphanRequired.join(", ")}`,
    };
  }

  if (options.base === undefined) {
    return {
      ...base,
      status: "error",
      units: 0,
      endedAt: now(),
      detail:
        "gate citations requires --base (M2-C-3: a gate whose required " +
        "invocation parameter is absent is error, never not-applicable)",
    };
  }
  const head = options.head ?? "HEAD";
  const diff = gitChangedDocuments(options.cwd, options.base, head);
  if (!diff.ok) {
    return { ...base, status: "error", units: 0, endedAt: now(), detail: diff.reason };
  }
  const changedDocuments = diff.paths.filter((path) => matchesAny(config.documents, path)).sort();
  if (changedDocuments.length === 0) {
    return {
      ...base,
      status: "not-applicable",
      units: 0,
      endedAt: now(),
      detail: `no changed path under the configured documents globs (${String(diff.paths.length)} changed path(s) total)`,
      evidence: diff.paths,
    };
  }

  let resolved = 0;
  let unverifiableExternal = 0;
  const redDetails: string[] = [];
  for (const relativePath of changedDocuments) {
    const absolutePath = join(options.cwd, relativePath);
    const read = readRegularFileIfPresent(absolutePath);
    if (read.kind === "refused") {
      // M2-C-6, criterion 9. Return immediately, never continue walking:
      // the reason already names the path and the observed type
      // (`describeType` in src/task.ts).
      return {
        ...base,
        status: "error",
        units: resolved,
        endedAt: now(),
        detail: read.reason,
        evidence: [relativePath],
      };
    }
    if (read.kind === "absent") {
      // Raced away between the diff and the read; not this gate's failure.
      continue;
    }
    const lint = lintDocumentBody(config, options.cwd, read.body);
    if (lint.kind === "read-error") {
      return {
        ...base,
        status: "error",
        units: resolved,
        endedAt: now(),
        detail: lint.reason,
        evidence: [lint.path],
      };
    }
    resolved += lint.resolved;
    unverifiableExternal += lint.unverifiableExternal;
    if (lint.total === 0 && matchesAny(config.citationRequired, relativePath)) {
      redDetails.push(`${relativePath} is citationRequired and carries zero recognized citations`);
    }
    for (const detail of lint.unresolvedDetails) {
      redDetails.push(`${relativePath}: ${detail}`);
    }
  }

  if (redDetails.length > 0) {
    return {
      ...base,
      status: "red",
      units: resolved,
      endedAt: now(),
      detail: redDetails.join("; "),
      evidence: changedDocuments,
    };
  }
  if (resolved === 0) {
    return {
      ...base,
      status: "not-applicable",
      units: 0,
      endedAt: now(),
      detail:
        `${String(changedDocuments.length)} changed document(s) linted, ` +
        `${String(unverifiableExternal)} unverifiable-external citation(s), ` +
        "zero local citations resolved: nothing in the configured document set needed checking",
      evidence: changedDocuments,
    };
  }
  return {
    ...base,
    status: "green",
    units: resolved,
    endedAt: now(),
    detail:
      `linted ${String(changedDocuments.length)} changed document(s): ` +
      `${String(resolved)} citation(s) resolved, ${String(unverifiableExternal)} unverifiable-external`,
    evidence: changedDocuments,
  };
}

/* -------------------------------------------------------------------- */
/* CLI entry: the gate subprocess contract (src/gates/run.ts:40-49)      */
/* -------------------------------------------------------------------- */

/** BSD sysexits EX_USAGE, the same value `src/cli.ts` exports; not imported
 * from there because this module is a standalone gate entry (like
 * bin/tiphys.ts) and not a command wired through `src/cli.ts`'s dispatch. */
const EX_USAGE = 64;

const USAGE =
  "usage: node src/gates/citations.ts --result <file> --evidence <dir> " +
  "--base <ref> [--head <ref>]";

interface Flags {
  result?: string;
  evidence?: string;
  base?: string;
  head?: string;
}

const VALUE_FLAGS = ["--result", "--evidence", "--base", "--head"];

function parseFlags(args: string[]): Flags | undefined {
  const flags: Flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag === undefined || !VALUE_FLAGS.includes(flag)) {
      return undefined;
    }
    if (value === undefined || value.startsWith("--")) {
      return undefined;
    }
    if (flag === "--result") {
      flags.result = value;
    } else if (flag === "--evidence") {
      flags.evidence = value;
    } else if (flag === "--base") {
      flags.base = value;
    } else {
      flags.head = value;
    }
    i += 1;
  }
  return flags;
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys gates citations: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

/** Write this gate's own record, then exit with the code its status maps to. */
function writeResult(path: string, fields: GateResultFields): number {
  const result = makeGateResult(fields);
  const refusal = refuseOpenForWrite(path);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys gates citations: ${refusal}\n`);
    return EXIT_GATE_ERROR;
  }
  const written = runStep(`writing ${path}`, () => writeFileSync(path, renderGateResult(result)));
  if (!written.ok) {
    process.stderr.write(`tiphys gates citations: ${written.reason}\n`);
    return EXIT_GATE_ERROR;
  }
  process.stdout.write(`${result.gate}: ${result.status} (${String(result.units)} ${result.unitLabel})\n`);
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  return exitCodeForStatus(result.status);
}

/**
 * The outer backstop (matching `src/commands/gates.ts`'s `cmdGates`): Node's
 * uncaught-exception exit code is 1, which collides with this phase's own
 * red code, so a throw escaping anywhere here would be indistinguishable
 * from a genuine red citation to a consumer reading only the exit code.
 */
export function main(argv: string[]): number {
  try {
    const flags = parseFlags(argv);
    if (flags === undefined) {
      return usageError();
    }
    if (flags.result === undefined || flags.evidence === undefined) {
      return usageError("citations requires --result and --evidence");
    }
    const fields = runCitationsGate({
      cwd: process.cwd(),
      base: flags.base,
      head: flags.head,
    });
    return writeResult(flags.result, fields);
  } catch (error) {
    process.stderr.write(
      `tiphys gates citations: ${singleLine((error as Error).message ?? String(error))}\n`,
    );
    return EXIT_GATE_ERROR;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
