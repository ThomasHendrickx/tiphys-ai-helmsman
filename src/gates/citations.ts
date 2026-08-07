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
 * FIX ROUND ONE (2026-08-06). The round-one hazard review (`delivery/review/
 * clean-room-m2-p5-hazard.md`) found the delivered gate exits RED on the
 * head that delivered it (CR-1015) and reds on pre-existing content a PR did
 * not touch (CR-1016). Both trace to ONE mechanism: the gate lints the
 * WHOLE BODY of every changed file, and cannot tell a citation a document
 * MAKES from one it QUOTES, nor a line the PR wrote from a line that was
 * already there. The arbitration (`delivery/review/arbitration-m2-p5.md`)
 * settles two design questions that this round implements rather than
 * re-litigates:
 *
 *   M2-D-21 (diff-read scope): a citation is resolved only when it was
 *   ADDED or MODIFIED in the diff `base...head`, computed per changed HUNK.
 *   The `citationRequired` vacuous guard still asks whether the document AS
 *   A WHOLE makes at least one citation (not hunk-scoped).
 *
 *   M2-D-22 (made vs quoted): a citation inside an inline code span
 *   (backticks) or a fenced code block is QUOTED, not made, and is never
 *   resolved. This is the convention the repository already follows
 *   (writing `src/nope.ts:1` in prose to mean "this does not resolve").
 *
 * The same round also closes, at the mechanism rather than the instance:
 *
 *   CR-1017: every content read (the document under lint, and every cited
 *   target) is now taken from the GIT OBJECT at the `--head` revision via
 *   `git cat-file`, never from the working tree / `cwd`. A gate told to
 *   judge revision X now judges X regardless of what is checked out.
 *   Structural side effect, verified rather than assumed (see the module's
 *   `readGitBlob`/`gitObjectType` doc comment): this ALSO closes CR-1018,
 *   because a git tree has no ".." entry and cannot be escaped by a
 *   traversal string, and CR-1021 (the vanish race), because the file list
 *   and the content it names now come from the SAME fixed git objects
 *   instead of two different clocks (a commit graph and a live filesystem).
 *
 *   CR-1019: a `@sha256:` suffix that is present but does not match the
 *   64-lowercase-hex shape is `red` naming the malformed suffix, never
 *   silently dropped to a hash-free citation.
 *
 *   CR-1020: the vacuous guard counts SUBSTANTIVE citations (not quoted,
 *   not a citation to the document's own path), so a document that only
 *   cites itself no longer satisfies it.
 *
 *   CR-1022: root classification checks EVERY declared root for the
 *   concrete path under test (never returns on the first match); a path
 *   matching more than one root is `ambiguous`, refused rather than
 *   guessed. The shipped default config's local and external match lists
 *   are DISJOINT (the local `bin` pattern is narrowed to `bin/*.ts`, the
 *   real files this checkout ships there, rather than `bin/**`, which used
 *   to overlap `bin/fm-*.sh` and depended on undocumented array order to
 *   resolve correctly), so the ambiguity check has nothing to silently
 *   paper over in the shipped configuration.
 *
 *   CR-1023/1024/1025/1026: the grammar's token boundary is Unicode-aware
 *   (a token cannot be fabricated by resuming a match after a colon,
 *   backslash or a non-ASCII letter), a malformed trailing continuation
 *   (`:3-`, `:3.5`, a non-ASCII hyphen) is `red` naming the leftover text
 *   rather than silently truncated, leading zeros are an explicitly
 *   documented and intentional relaxation, and a content hash is computed
 *   over the cited lines with any trailing `\r` stripped, so a CRLF
 *   checkout does not red on a normalization difference.
 *
 * HAZARD CLASS (T-007, M2-D-18), restated because it still drives every
 * design choice below: "a linter over documents it does not own, walking a
 * tree supplied by configuration." M2-C-6 IS OBEYED BY REUSE, NOT
 * REIMPLEMENTATION, adapted to the substrate this round moves reads onto:
 * the config schema document (the one remaining filesystem read) still goes
 * through the delivered `classifyEntry`/`readRegularFileIfPresent` from
 * `src/task.ts`; every git-object read goes through `readGitBlob`/
 * `gitObjectType`, this module's ONE answer to "may this git path be
 * treated as file content", which establishes the object's TYPE (blob,
 * tree, commit, or missing) before ever treating its output as text, the
 * same probe-then-open shape `classifyEntry` uses for the filesystem. The
 * one-shot inventory (unrelated to any `--head`, a live report over the
 * actual checkout) is UNCHANGED by this round and still walks the
 * filesystem through `classifyEntry`, because that is genuinely what it
 * examines.
 *
 * THE RECOGNIZED GRAMMAR (step 2), stated once here and nowhere else:
 *
 *   path:LINE                  a single line
 *   path:START-END              an inclusive line range
 *   (either form) + @sha256:<64 lowercase hex>
 *                               content-hash suffix: the cited line(s),
 *                               joined by "\n" with any trailing "\r"
 *                               stripped per line and no trailing newline,
 *                               must hash to the given digest
 *
 * `path` is one or more `[A-Za-z0-9_./-]` characters ending in a recognized
 * extension (ts, tsx, js, mjs, cjs, sh, md, json, yaml, yml). The token
 * boundary is Unicode-aware on BOTH sides: a match cannot start immediately
 * after a letter (any script), digit, `_`, `.`, `/`, `:` or `\`, and cannot
 * end immediately before anything other than whitespace, end of text, a
 * closing bracket/quote, or a `.` not itself followed by a digit (CR-1023,
 * CR-1024). Leading zeros in the line/range numbers are accepted and
 * normalized by decimal parsing (`:007` means line 7); this is an
 * intentional relaxation, not an oversight (CR-1025).
 *
 * SECOND CALL SITE (R-025), grammar and mechanism UNCHANGED by this round:
 * a plan review invokes the SAME executable, `node src/gates/citations.ts
 * --result <file> --evidence <dir> --base <ref> [--head <ref>]`. CR-1017's
 * fix is exactly what makes this call site trustworthy: `--head` now
 * selects the CONTENT judged, not only the file list.
 *
 * ESCALATED, NOT THIS PHASE'S TO FIX (arbitration, final section): whether
 * a `required` gate that reaches `not-applicable` should fail the aggregate
 * is an M2-wide policy question for M2-P9, not resolved here. A review
 * citing only an external root (verifying nothing) reaches `not-applicable`
 * rather than `red` for that same, already-escalated reason.
 *
 * CI PRECONDITIONS THIS GATE REQUIRES (delivery/STATE.md's CR-902
 * carry-forward): `fetch-depth: 0` in the checkout step, so `base` and
 * `head` are both fetchable commits, not shallow-clone-absent ones.
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
  /** Local roots: this checkout. */
  roots: CitationRoot[];
  /** Roots naming a repository this checkout does not contain. */
  externalRoots: CitationRoot[];
  /** Path globs identifying the configured document set (M2-D-10: diff-scoped
   * at gate run time; walked in full only by the one-shot inventory). */
  documents: string[];
  /** The subset of `documents` in which zero SUBSTANTIVE citations is red
   * (M2R-014's narrowed vacuous guard; CR-1020: substantive excludes quoted
   * tokens and a citation to the document's own path). */
  citationRequired: string[];
}

/**
 * THE ONE COMMITTED CONFIGURATION (step 2; CR-1022 fix round).
 *
 * `roots[0].match` no longer includes `bin/**`. It used to, and `bin/fm-
 * lock.sh` matched BOTH that pattern and the external `firstmate` root's
 * `bin/fm-*.sh`; the two-root match was resolved correctly only because the
 * code checked external roots before local ones, an implicit, undeclared
 * precedence the hazard review named as fragile (CR-1022). The local
 * pattern is narrowed to `bin/*.ts`, the actual files this checkout ships
 * in `bin/` (today, `bin/tiphys.ts`), which shares no path with any
 * `externalRoots` glob. The two root lists are therefore DISJOINT by
 * construction, and `classifyPathAgainstRoots` needs no precedence rule at
 * all: it checks every root and refuses ambiguity outright (CR-1022).
 *
 * DR-0019 (owner, 2026-08-07): the gate governs FORWARD-CLAIMING delivery
 * docs, NOT the historical delivery RECORD. The `delivery/review/` and
 * `delivery/work-history/` trees are records of what was examined at the
 * time they were written; their `path:line` refs were valid when authored
 * and drift as the code moves. Once the exit harness runs the full gate set
 * on every doc PR, requiring a record's citations to still RESOLVE at head
 * is the wrong policy: it re-litigates settled history against current code.
 * So both trees are removed from `documents`, and review from
 * `citationRequired`. The docs whose claims MUST hold against current code
 * stay gated: the `delivery/plan/`, `delivery/verification/`,
 * `delivery/decisions/`, `delivery/requirements/` trees and `delivery/STATE.md`
 * are documents; the `delivery/plan/` and `delivery/verification/` trees are
 * citationRequired. Anti-fabrication is preserved on every forward-claiming
 * doc; the drift of the historical record is no longer a gate failure.
 */
export const DEFAULT_CITATION_CONFIG: CitationConfig = {
  version: 1,
  roots: [
    {
      name: "kernel",
      description:
        "This checkout: the Tiphys kernel repository (src/, bin/*.ts, " +
        "test/, scripts/, delivery/, schemas/, roles/, tuition/, and " +
        "root-level *.md / *.json).",
      match: [
        "src/**",
        "bin/*.ts",
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
    "delivery/verification/**/*.md",
    "delivery/decisions/**/*.md",
    "delivery/tuition/**/*.md",
    "delivery/requirements/**/*.md",
    "delivery/STATE.md",
  ],
  citationRequired: [
    "delivery/plan/**/*.md",
    "delivery/verification/**/*.md",
  ],
};

/* -------------------------------------------------------------------- */
/* The config schema, loaded and validated through the delivered reader  */
/* -------------------------------------------------------------------- */

const schemaUrl = new URL("./schemas/citation-config.schema.json", import.meta.url);
let cachedSchema: SchemaDocument | undefined;

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

export function validateCitationConfigDocument(document: unknown): string[] {
  return formatDiagnostics(validate(citationConfigSchema(), document));
}

export interface AmbiguousGlob {
  glob: string;
  roots: string[];
}

/**
 * Config-load-time check: the identical glob STRING declared under more
 * than one root. This is separate from, and does not replace,
 * `classifyPathAgainstRoots`'s per-citation check (CR-1022): this one
 * answers "did the config author write the same glob twice", which is
 * decidable from the config alone; that one answers "does THIS concrete
 * path match glob patterns from more than one root", which needs the
 * concrete string and cannot be answered from the config in isolation.
 */
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
/* Root classification (CR-1022): every root checked, ambiguity refused  */
/* -------------------------------------------------------------------- */

export type RootClassification =
  | { kind: "external"; root: string }
  | { kind: "local"; root: string }
  | { kind: "unmatched" }
  | { kind: "ambiguous"; roots: string[] };

/**
 * Checks EVERY declared root (both lists, in full) rather than returning on
 * the first match (CR-1022's named defect). A path matching exactly one
 * root, of either kind, resolves to that root. A path matching two or more
 * roots is `ambiguous`, named with every matching root, and is never
 * guessed by declaration order. The shipped `DEFAULT_CITATION_CONFIG` has
 * no overlap between its local and external match lists (see that
 * constant's own doc comment), so this can only fire on a genuine
 * configuration mistake, not on ordinary use.
 */
export function classifyPathAgainstRoots(
  config: CitationConfig,
  path: string,
): RootClassification {
  const matches: { name: string; kind: "local" | "external" }[] = [];
  for (const root of config.externalRoots) {
    if (matchesAny(root.match, path)) {
      matches.push({ name: root.name, kind: "external" });
    }
  }
  for (const root of config.roots) {
    if (matchesAny(root.match, path)) {
      matches.push({ name: root.name, kind: "local" });
    }
  }
  if (matches.length === 0) {
    return { kind: "unmatched" };
  }
  if (matches.length === 1) {
    const only = matches[0] as { name: string; kind: "local" | "external" };
    return only.kind === "external"
      ? { kind: "external", root: only.name }
      : { kind: "local", root: only.name };
  }
  return { kind: "ambiguous", roots: matches.map((m) => m.name).sort() };
}

/* -------------------------------------------------------------------- */
/* Citation grammar (CR-1019, CR-1023, CR-1024, CR-1025)                 */
/* -------------------------------------------------------------------- */

export interface CitationToken {
  raw: string;
  path: string;
  startLine: number;
  endLine: number;
  /** Set only when a `@sha256:` suffix was present AND valid (64 lowercase hex). */
  hash?: string;
  /** True when a `@sha256:` suffix was attempted but did not validate (CR-1019). */
  hashMalformed: boolean;
  /** Non-undefined when unsafe text immediately follows the recognized token
   * with no separating whitespace (CR-1024): the citation is malformed, not
   * silently narrowed. */
  trailingMalformed?: string;
  offset: number;
}

const CITATION_EXTENSIONS = "ts|tsx|js|mjs|cjs|sh|md|json|ya?ml";
/**
 * The token boundary is Unicode-aware (CR-1023): a match cannot begin
 * immediately after a letter of ANY script (`\p{L}`), a digit (`\p{N}`), or
 * `_`, `.`, `/`, `:`, `\`, `-`. The three CR-1023 members (a colon, a
 * backslash, and a Cyrillic letter immediately before the fabricated
 * token's first character) are all excluded by this one class; none of the
 * three chose which exclusion to add, all three ARE the same rule stated
 * once. Requires the `u` flag (Unicode property escapes).
 */
const CITATION_SOURCE = String.raw`(?<![\p{L}\p{N}_./:\\-])([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:${CITATION_EXTENSIONS})):(\d+)(?:-(\d+))?(?:@sha256:([0-9a-zA-Z]+))?`;

const HASH_SHAPE = /^[0-9a-f]{64}$/;

/**
 * The character(s), if any, that make a recognized citation malformed
 * because something unsafe follows it with no separating whitespace
 * (CR-1024): a bare trailing `-` (`path:3-`), a decimal-looking range
 * (`path:3.5`), or any other non-ASCII or word-forming character glued on
 * (a Unicode dash lookalike glued onto the digits, U+2011 for example). A `.` is safe UNLESS the next
 * character is a digit, so an ordinary end-of-sentence period after a
 * citation is not flagged. Returns `undefined` when nothing unsafe follows
 * (end of text, whitespace, or an ordinary closing/punctuation character).
 */
function trailingJunk(text: string, endIndex: number): string | undefined {
  if (endIndex >= text.length) {
    return undefined;
  }
  const ch = text[endIndex] as string;
  if (/\s/.test(ch)) {
    return undefined;
  }
  if ("])}>,;:'\"`".includes(ch)) {
    return undefined;
  }
  if (ch === ".") {
    const next = text[endIndex + 1];
    if (next === undefined || !/[0-9]/.test(next)) {
      return undefined;
    }
  }
  let end = endIndex;
  while (end < text.length && !/\s/.test(text[end] as string) && end - endIndex < 20) {
    end += 1;
  }
  return text.slice(endIndex, end);
}

/**
 * THE ONE GRAMMAR SCAN. Quoted-range exclusion (M2-D-22) and hunk-scoping
 * (M2-D-21) are separate, composable passes over this function's output,
 * not a second implementation of citation recognition.
 */
export function extractCitations(text: string): CitationToken[] {
  const pattern = new RegExp(CITATION_SOURCE, "gu");
  const tokens: CitationToken[] = [];
  for (const match of text.matchAll(pattern)) {
    const path = match[1] as string;
    const startLine = Number(match[2]);
    const endLine = match[3] === undefined ? startLine : Number(match[3]);
    const hashCaptured = match[4];
    const hashValid = hashCaptured !== undefined && HASH_SHAPE.test(hashCaptured);
    const offset = match.index ?? 0;
    const matchEnd = offset + match[0].length;
    const junk = trailingJunk(text, matchEnd);
    tokens.push({
      raw: match[0] + (junk ?? ""),
      path,
      startLine,
      endLine,
      hash: hashValid ? hashCaptured : undefined,
      hashMalformed: hashCaptured !== undefined && !hashValid,
      trailingMalformed: junk,
      offset,
    });
  }
  return tokens;
}

/**
 * Lines of a file body, 1-indexed by position in the returned array. A
 * single trailing newline is not counted as an extra blank line; a
 * completely empty body has zero lines.
 */
export function splitLines(body: string): string[] {
  if (body === "") {
    return [];
  }
  const withoutTrailingNewline = body.endsWith("\n") ? body.slice(0, -1) : body;
  return withoutTrailingNewline === "" ? [""] : withoutTrailingNewline.split("\n");
}

/**
 * CR-1026: strip a trailing "\r" per line before hashing, so a CRLF
 * checkout of the same logical content hashes identically to an LF one.
 * Line COUNT was already CRLF-insensitive (it counts "\n" occurrences);
 * only the byte content fed to the digest needed this.
 */
function stripCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/* -------------------------------------------------------------------- */
/* Quoted-range detection (M2-D-22): inline code spans and fenced blocks */
/* -------------------------------------------------------------------- */

/**
 * Character ranges (half-open `[start, end)`, sorted) that are QUOTED
 * rather than MADE: fenced code blocks (opened and closed by a line whose
 * first non-space run is 3+ of the same fence character, `` ` `` or `~`,
 * matched by CommonMark's own rule of "same character, at least as long
 * to close") and inline code spans (a run of one or more backticks,
 * matched by the NEXT run of the SAME length on the same line). This is a
 * deliberately LINE-ORIENTED simplification: it does not handle an inline
 * span whose content itself contains a shorter backtick run (needing a
 * longer delimiter per CommonMark), which does not occur anywhere in this
 * repository's corpus (verified by the one-shot inventory finding no
 * citation whose surrounding text uses that construct).
 */
export function computeQuotedRanges(body: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const lines = body.split("\n");
  let offset = 0;
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
  const SPAN_RE = /(`+)([^`]*?)\1/g;
  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1] as string;
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0] as string;
        fenceLen = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLen) {
        inFence = false;
      }
      ranges.push([lineStart, lineEnd]);
    } else if (inFence) {
      ranges.push([lineStart, lineEnd]);
    } else {
      SPAN_RE.lastIndex = 0;
      let spanMatch: RegExpExecArray | null;
      while ((spanMatch = SPAN_RE.exec(line)) !== null) {
        ranges.push([lineStart + spanMatch.index, lineStart + spanMatch.index + spanMatch[0].length]);
      }
    }
    offset = lineEnd + 1;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return ranges;
}

function isWithinRanges(offset: number, ranges: Array<[number, number]>): boolean {
  for (const [start, end] of ranges) {
    if (start > offset) {
      break;
    }
    if (offset >= start && offset < end) {
      return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------- */
/* Line-number index, for hunk-scoping (M2-D-21)                         */
/* -------------------------------------------------------------------- */

function buildLineIndex(body: string): number[] {
  const starts = [0];
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineNumberFor(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  let answer = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lineStarts[mid] as number) <= offset) {
      answer = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return answer + 1;
}

export type TouchedLines =
  | { kind: "all" }
  | { kind: "ranges"; ranges: Array<[number, number]> };

function isTouched(line: number, touched: TouchedLines): boolean {
  if (touched.kind === "all") {
    return true;
  }
  return touched.ranges.some(([start, end]) => line >= start && line <= end);
}

/* -------------------------------------------------------------------- */
/* Git-object reads (CR-1017, CR-1018, CR-1021)                          */
/* -------------------------------------------------------------------- */

const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

export type GitObjectRead =
  | { kind: "blob"; body: string }
  | { kind: "missing" }
  | { kind: "irregular"; reason: string }
  | { kind: "error"; reason: string };

/**
 * THE ONE ANSWER to "may this git path be treated as file content"
 * (M2-C-6, adapted to the git-object substrate CR-1017 moves reads onto).
 * `git cat-file -t <rev>:<path>` establishes the object's TYPE before its
 * content is ever read, the same probe-then-open shape `classifyEntry`
 * uses for the filesystem: `blob` is the only type this function reads;
 * `tree` (a directory) and `commit` (a submodule gitlink) are `irregular`,
 * named with the observed type, never opened as if they were text; a path
 * git reports as not existing at this revision is `missing`, which is not
 * an error (the normal shape of "the diff added a new document," or of a
 * dangling citation).
 *
 * VERIFIED, not assumed (T-006): `git cat-file -t HEAD:src/../../etc/passwd`
 * and `git cat-file -t HEAD:src/../delivery/STATE.md` (a traversal that
 * WOULD land on a real in-repo file if resolved as a filesystem path) both
 * report "does not exist", because git's tree lookup treats the path
 * segment-by-segment against actual tree entries and no tree can contain a
 * `..` entry; there is no filesystem-style traversal to close, because the
 * data structure this function reads from has no parent pointer to walk
 * (CR-1018, closed structurally rather than by a denylist).
 */
export function gitObjectType(
  cwd: string,
  rev: string,
  path: string,
): { kind: "type"; type: string } | { kind: "missing" } | { kind: "error"; reason: string } {
  const result = spawnSync("git", ["cat-file", "-t", `${rev}:${path}`], {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    return {
      kind: "error",
      reason: `git cat-file -t ${rev}:${path} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status === 0) {
    return { kind: "type", type: (result.stdout ?? "").trim() };
  }
  if (result.signal !== null) {
    return {
      kind: "error",
      reason: `git cat-file -t ${rev}:${path} was terminated by ${result.signal}`,
    };
  }
  return { kind: "missing" };
}

export function readGitBlob(cwd: string, rev: string, path: string): GitObjectRead {
  const typed = gitObjectType(cwd, rev, path);
  if (typed.kind === "error") {
    return { kind: "error", reason: typed.reason };
  }
  if (typed.kind === "missing") {
    return { kind: "missing" };
  }
  if (typed.type !== "blob") {
    return {
      kind: "irregular",
      reason: `${rev}:${path} is a git ${typed.type} object, not a blob (regular file), so it was not read`,
    };
  }
  const result = spawnSync("git", ["cat-file", "-p", `${rev}:${path}`], {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
  });
  if (result.error !== undefined) {
    return {
      kind: "error",
      reason: `git cat-file -p ${rev}:${path} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    return {
      kind: "error",
      reason: `git cat-file -p ${rev}:${path} exited ${String(result.status)}: ${singleLine(result.stderr ?? "")}`,
    };
  }
  return { kind: "blob", body: result.stdout ?? "" };
}

function resolveRev(cwd: string, ref: string): { ok: true; sha: string } | { ok: false; reason: string } {
  const result = spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    return { ok: false, reason: `git rev-parse could not be run: ${singleLine(String(result.error))}` };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `ref ${ref} does not resolve to a commit: ${singleLine(result.stderr ?? "")}`,
    };
  }
  return { ok: true, sha: (result.stdout ?? "").trim() };
}

/* -------------------------------------------------------------------- */
/* Citation resolution                                                   */
/* -------------------------------------------------------------------- */

export type CitationResolution =
  | { kind: "resolved"; detail: string }
  | { kind: "unresolved"; detail: string }
  | { kind: "unverifiable-external"; root: string; detail: string }
  /** M2-C-6: the cited target is present and is not a git blob / not a
   * regular file, depending on which read strategy is in use. */
  | { kind: "read-error"; path: string; reason: string };

/** How to fetch a cited target's content: git-object (the registered gate,
 * CR-1017) or filesystem (the one-shot inventory, which examines the live
 * checkout by design). Parameterizing the read is what keeps resolution ONE
 * implementation across both call sites (never a second one). */
export type TargetReader = (path: string) => GitObjectRead;

export function gitTargetReader(cwd: string, rev: string): TargetReader {
  return (path: string) => readGitBlob(cwd, rev, path);
}

export function filesystemTargetReader(repoRoot: string): TargetReader {
  return (path: string): GitObjectRead => {
    const read = readRegularFileIfPresent(join(repoRoot, path));
    if (read.kind === "read") {
      return { kind: "blob", body: read.body };
    }
    if (read.kind === "absent") {
      return { kind: "missing" };
    }
    return { kind: "irregular", reason: read.reason };
  };
}

export function resolveCitation(
  config: CitationConfig,
  token: CitationToken,
  readTarget: TargetReader,
): CitationResolution {
  if (token.hashMalformed) {
    return {
      kind: "unresolved",
      detail: `${token.raw} has a malformed content-hash suffix (expected @sha256: followed by 64 lowercase hex characters)`,
    };
  }
  if (token.trailingMalformed !== undefined) {
    return {
      kind: "unresolved",
      detail: `${token.raw} is not a recognized citation: malformed trailing text follows with no separator`,
    };
  }
  const classification = classifyPathAgainstRoots(config, token.path);
  if (classification.kind === "ambiguous") {
    return {
      kind: "unresolved",
      detail: `${token.raw} matches more than one declared root (${classification.roots.join(", ")}), never guessed`,
    };
  }
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
  const read = readTarget(token.path);
  if (read.kind === "irregular" || read.kind === "error") {
    return { kind: "read-error", path: token.path, reason: read.reason ?? "" };
  }
  if (read.kind === "missing") {
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
    const cited = lines
      .slice(token.startLine - 1, token.endLine)
      .map(stripCr)
      .join("\n");
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
/* Document analysis: the ONE counting mechanism, two read strategies    */
/* -------------------------------------------------------------------- */

export interface DocumentAnalysis {
  /** Non-quoted, non-self tokens: what the vacuous guard asks about,
   * whole-document, never hunk-scoped (arbitration M2-D-21). */
  substantiveCount: number;
  /** Every non-quoted token, self included (for reporting). */
  totalNonQuoted: number;
  resolved: number;
  /** Resolved, but the citation's path equals the citing document's own
   * path (CR-1020): correctness is still checked, but it does not count
   * toward `resolved` units or the vacuous guard. */
  selfResolved: number;
  unverifiableExternal: number;
  unresolvedDetails: string[];
}

export type DocumentAnalysisOutcome =
  | { kind: "analyzed"; analysis: DocumentAnalysis }
  | { kind: "read-error"; path: string; reason: string };

/**
 * THE ONE COUNTING PASS. `touched` selects which tokens are actually
 * RESOLVED (M2-D-21: hunk ranges for the registered gate, `{kind:"all"}`
 * for the one-shot inventory, which has no diff to scope by). The vacuous
 * `substantiveCount` is NEVER hunk-scoped, per the arbitration: a document
 * makes at least one citation, or it does not, independent of what this
 * particular diff touched.
 */
export function analyzeDocument(
  config: CitationConfig,
  body: string,
  relativePath: string,
  touched: TouchedLines,
  readTarget: TargetReader,
): DocumentAnalysisOutcome {
  const quotedRanges = computeQuotedRanges(body);
  const lineStarts = buildLineIndex(body);
  const tokens = extractCitations(body);
  const nonQuoted = tokens.filter((token) => !isWithinRanges(token.offset, quotedRanges));
  const substantiveCount = nonQuoted.filter((token) => token.path !== relativePath).length;
  const inScope = nonQuoted.filter((token) =>
    isTouched(lineNumberFor(lineStarts, token.offset), touched),
  );

  let resolved = 0;
  let selfResolved = 0;
  let unverifiableExternal = 0;
  const unresolvedDetails: string[] = [];
  for (const token of inScope) {
    const isSelf = token.path === relativePath;
    const outcome = resolveCitation(config, token, readTarget);
    if (outcome.kind === "read-error") {
      return outcome;
    }
    if (outcome.kind === "resolved") {
      if (isSelf) {
        selfResolved += 1;
      } else {
        resolved += 1;
      }
    } else if (outcome.kind === "unverifiable-external") {
      unverifiableExternal += 1;
    } else {
      unresolvedDetails.push(outcome.detail);
    }
  }
  return {
    kind: "analyzed",
    analysis: {
      substantiveCount,
      totalNonQuoted: nonQuoted.length,
      resolved,
      selfResolved,
      unverifiableExternal,
      unresolvedDetails,
    },
  };
}

/* -------------------------------------------------------------------- */
/* The one-shot inventory (step 5): reused counting logic, filesystem     */
/* read strategy, unaffected by CR-1017 (there is no --head to pin to). */
/* -------------------------------------------------------------------- */

function isRealDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

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
  /** resolved + selfResolved + unresolved + unverifiableExternal. */
  total: number;
  /** Includes self-resolved citations (folded in for this report; the
   * registered gate's `units` excludes them, see `runCitationsGate`). */
  resolved: number;
  unresolved: number;
  unverifiableExternal: number;
}

export function inventoryDeliveryTree(
  repoRoot: string,
  config: CitationConfig = DEFAULT_CITATION_CONFIG,
  startDir = "delivery",
): InventoryRow[] {
  const rows: InventoryRow[] = [];
  const readTarget = filesystemTargetReader(repoRoot);
  for (const path of listConfiguredDocuments(repoRoot, config, startDir)) {
    const read = readRegularFileIfPresent(join(repoRoot, path));
    if (read.kind !== "read") {
      throw new Error(
        read.kind === "absent"
          ? `${path} vanished during the inventory walk`
          : read.reason,
      );
    }
    const outcome = analyzeDocument(config, read.body, path, { kind: "all" }, readTarget);
    if (outcome.kind === "read-error") {
      throw new Error(`${outcome.path}: ${outcome.reason}`);
    }
    const a = outcome.analysis;
    rows.push({
      path,
      total: a.resolved + a.selfResolved + a.unresolvedDetails.length + a.unverifiableExternal,
      resolved: a.resolved + a.selfResolved,
      unresolved: a.unresolvedDetails.length,
      unverifiableExternal: a.unverifiableExternal,
    });
  }
  return rows;
}

/* -------------------------------------------------------------------- */
/* The diff, and the kernel gate entry (M2-D-10, M2-D-21, CR-1017)       */
/* -------------------------------------------------------------------- */

function gitChangedDocuments(
  cwd: string,
  base: string,
  head: string,
): { ok: true; paths: string[] } | { ok: false; reason: string } {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=d", `${base}...${head}`],
    { cwd, encoding: "utf8", timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
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

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * M2-D-21: the NEW-FILE line ranges a hunk introduces or changes, between
 * `base` and `head`, for exactly one path. `--unified=0` removes context
 * lines, so every hunk's `+start,count` is precisely the touched region; a
 * pure-deletion hunk (`count` 0) contributes nothing (nothing was ADDED to
 * the new file at that point). A brand-new file shows one hunk covering the
 * whole file, which is correct: a newly added document is entirely "this
 * PR's content".
 */
function computeTouchedNewLines(
  cwd: string,
  base: string,
  head: string,
  path: string,
): { ok: true; touched: TouchedLines } | { ok: false; reason: string } {
  const result = spawnSync(
    "git",
    ["diff", "--unified=0", "--no-color", `${base}...${head}`, "--", path],
    { cwd, encoding: "utf8", timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
  );
  if (result.error !== undefined) {
    return {
      ok: false,
      reason: `git diff --unified=0 could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `git diff --unified=0 exited ${String(result.status)}: ${singleLine(result.stderr ?? "")}`,
    };
  }
  const ranges: Array<[number, number]> = [];
  for (const line of (result.stdout ?? "").split("\n")) {
    if (!line.startsWith("@@ ")) {
      continue;
    }
    const match = HUNK_HEADER.exec(line);
    if (match === null) {
      continue;
    }
    const newStart = Number(match[1]);
    const newCount = match[2] === undefined ? 1 : Number(match[2]);
    if (newCount > 0) {
      ranges.push([newStart, newStart + newCount - 1]);
    }
  }
  return { ok: true, touched: { kind: "ranges", ranges } };
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
 * The kernel gate entry. Lints only citations ADDED or MODIFIED in the diff
 * `base...head` (M2-D-21), reading every byte of content -- the document
 * under lint AND every cited local target -- from the git object at `head`
 * (CR-1017), never from `cwd`'s working tree.
 *
 * `--base` absent is `error`, never `not-applicable` (M2-C-3), checked
 * independently of the runner's own `diff-touches` precondition because
 * R-025's second call site invokes this function directly.
 *
 * THE VACUOUS GUARD (M2R-014, M2-D-21, CR-1020): a `citationRequired`
 * document with zero SUBSTANTIVE citation tokens anywhere in the WHOLE
 * document (not quoted, not a citation to its own path) is `red`. This is
 * intentionally NOT hunk-scoped: the arbitration is explicit that "the
 * document as a whole makes at least one citation" is the question, so a
 * PR that edits one unrelated line of an otherwise-empty required document
 * still reds on it, and a PR that adds the document's first real citation
 * still turns it green.
 *
 * NOT-APPLICABLE WHEN NOTHING SUBSTANTIVE WAS VERIFIED: M2-C-2 forbids a
 * green record with zero units, so a changed set whose only in-scope
 * citations are quoted, self-referential, or external resolves
 * `not-applicable` rather than a fabricated green. Because `citations` is
 * registered `required`, this still fails the aggregate; that is the
 * escalated, M2-wide policy question the arbitration assigns to M2-P9, not
 * this gate.
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
  const headRef = options.head ?? "HEAD";
  const headResolved = resolveRev(options.cwd, headRef);
  if (!headResolved.ok) {
    return { ...base, status: "error", units: 0, endedAt: now(), detail: `--head: ${headResolved.reason}` };
  }
  const baseResolved = resolveRev(options.cwd, options.base);
  if (!baseResolved.ok) {
    return { ...base, status: "error", units: 0, endedAt: now(), detail: `--base: ${baseResolved.reason}` };
  }
  const headSha = headResolved.sha;
  const baseSha = baseResolved.sha;

  const diff = gitChangedDocuments(options.cwd, baseSha, headSha);
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

  const readTarget = gitTargetReader(options.cwd, headSha);
  let resolved = 0;
  let selfResolved = 0;
  let unverifiableExternal = 0;
  const redDetails: string[] = [];
  const linted: string[] = [];

  for (const relativePath of changedDocuments) {
    const docRead = readGitBlob(options.cwd, headSha, relativePath);
    if (docRead.kind === "irregular") {
      // M2-C-6, criterion 9's mechanism restated for the git-object
      // substrate: return immediately, never continue.
      return {
        ...base,
        status: "error",
        units: resolved,
        endedAt: now(),
        detail: docRead.reason,
        evidence: [relativePath],
      };
    }
    if (docRead.kind === "error") {
      return { ...base, status: "error", units: resolved, endedAt: now(), detail: docRead.reason, evidence: [relativePath] };
    }
    if (docRead.kind === "missing") {
      // CR-1021: the diff just named this path as present at `headSha`.
      // Both queries read the SAME fixed git objects, so disagreement here
      // is an internal inconsistency, never a benign race to skip past.
      return {
        ...base,
        status: "error",
        units: resolved,
        endedAt: now(),
        detail: `${relativePath} is listed as changed at ${headSha} but git cat-file reports it missing there`,
        evidence: [relativePath],
      };
    }
    const touchedResult = computeTouchedNewLines(options.cwd, baseSha, headSha, relativePath);
    if (!touchedResult.ok) {
      return { ...base, status: "error", units: resolved, endedAt: now(), detail: touchedResult.reason, evidence: [relativePath] };
    }
    const outcome = analyzeDocument(config, docRead.body, relativePath, touchedResult.touched, readTarget);
    if (outcome.kind === "read-error") {
      return {
        ...base,
        status: "error",
        units: resolved,
        endedAt: now(),
        detail: outcome.reason,
        evidence: [outcome.path],
      };
    }
    linted.push(relativePath);
    const a = outcome.analysis;
    resolved += a.resolved;
    selfResolved += a.selfResolved;
    unverifiableExternal += a.unverifiableExternal;
    if (a.substantiveCount === 0 && matchesAny(config.citationRequired, relativePath)) {
      redDetails.push(`${relativePath} is citationRequired and carries zero substantive citations`);
    }
    for (const detail of a.unresolvedDetails) {
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
      evidence: linted,
    };
  }
  if (resolved === 0) {
    return {
      ...base,
      status: "not-applicable",
      units: 0,
      endedAt: now(),
      detail:
        `${String(linted.length)} changed document(s) linted at ${headSha}: ` +
        `${String(selfResolved)} self-citation(s), ${String(unverifiableExternal)} unverifiable-external, ` +
        "zero substantive local citations resolved: nothing in the configured document set needed checking",
      evidence: linted,
    };
  }
  return {
    ...base,
    status: "green",
    units: resolved,
    endedAt: now(),
    detail:
      `linted ${String(linted.length)} changed document(s) at ${headSha}: ` +
      `${String(resolved)} citation(s) resolved, ${String(selfResolved)} self-citation(s), ` +
      `${String(unverifiableExternal)} unverifiable-external`,
    evidence: linted,
  };
}

/* -------------------------------------------------------------------- */
/* CLI entry: the gate subprocess contract (src/gates/run.ts:40-49)      */
/* -------------------------------------------------------------------- */

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
