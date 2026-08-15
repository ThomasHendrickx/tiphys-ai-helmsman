import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  classifyEntry,
  readRegularFileIfPresent,
  refuseOpenForWrite,
  singleLine,
} from "../task.ts";
import { comparePins, describePinDifference, takePin } from "../gates/pin.ts";
import type { Pin } from "../gates/pin.ts";
import { describeMember, memberTouchedFiles } from "./spec.ts";
import type { DangerousStateMember, WitnessSpec } from "./spec.ts";

/**
 * THE RED-WITNESS HARNESS (kernel plan M2, M2-P2 step 3, step 4, step 5).
 *
 * A test guards a behavior only when it has been demonstrated RED against a
 * dangerous state that intersects the phase diff and GREEN at head, in a
 * pinned isolated run. This module evaluates one witness spec: refusal
 * rules (a) to (g) first, each producing `red` with a reason naming its
 * source, then per-member execution in a scratch clone the harness owns.
 *
 * ISOLATION (M2-C-4). Every member is evaluated in its own scratch clone
 * under a directory this run created with mkdtemp. The caller's repository
 * is only ever READ (git read commands and file reads through the delivered
 * probes); after any run its HEAD and working tree are untouched.
 *
 * PINS (M2-C-5, and work-history decision D-P2-1). The delivered pin is
 * five fields including ctimeMs, which userspace cannot restore, so pins
 * bracket EACH TEST EXECUTION rather than the mutate-restore cycle: the red
 * runs are bracketed by a pin pair over the dangerous tree they actually
 * execute, and the green head run by a pair over the head tree. A
 * difference inside either pair is `error` naming the path and the fields.
 *
 * REPORTER PIN (MECHANISMS.md, "Parsing another program's reporter
 * output"). The child is always invoked with an explicit
 * `--test-reporter tap`; a stream that does not open with `TAP version` is
 * an error naming the expected and observed formats, never a widened parse.
 *
 * C-2 and C-3: children run in the foreground via spawnSync with a
 * timeout; nothing here probes a process, detaches, or touches /proc.
 */

export interface WitnessHooks {
  /**
   * DOCUMENTED IN-HARNESS TEST HOOK (M2-P2 criterion 7, M2R-009). Called
   * once per member, between the green run's start and end pins, with the
   * clone's absolute path. Exists so a pin witness can rewrite a file
   * byte-identically inside the pinned window and prove the five-field pin
   * catches it. Never set outside tests.
   */
  betweenPins?: (cloneDir: string) => void;
}

export interface DiffFile {
  path: string;
  /** git name-status letter (A, M, D, R...). */
  status: string;
  /** New-side [start, end] line ranges of changed hunks, 1-based inclusive. */
  hunks: Array<[number, number]>;
}

export interface PhaseDiff {
  baseSha: string;
  headSha: string;
  /**
   * The merge base of base and head, which is the revision the `base...head`
   * three-dot diff below is actually taken against. Anything asking "what did
   * this phase change" must read the old side HERE and not at `baseSha`: on a
   * branch that has fallen behind, `baseSha` carries commits the branch never
   * saw, and reading them as the branch's own starting point reproduces the
   * two-dot misreading of standing warning 13. Falls back to `baseSha` when
   * git cannot compute one.
   */
  mergeBaseSha: string;
  files: Map<string, DiffFile>;
}

export interface EvaluationInputs {
  repoRoot: string;
  headSha: string;
  /**
   * The ref or sha resolved per clone against the FETCHED remote (M2-P2
   * step 7: merge-time re-verification is the `--baseline` parameter).
   */
  baselineRef: string;
  diff: PhaseDiff;
  destructiveCommands: string[];
  behaviors: Set<string>;
  /** Repo-relative test file path -> source at the audited head. */
  testFiles: Map<string, string>;
  /** Changed files the spawn grep matched (rule (f) derivation). */
  spawningChangedFiles: string[];
  scratchRoot: string;
  /**
   * Indices into `spec.dangerousStates` that THIS PHASE AUTHORED, which is
   * the exact scope of rule (d). Empty for a stored witness the phase did not
   * touch, and empty is the whole of "rule (d) does not apply here".
   *
   * This replaced a file-granular `phaseOwn: boolean`. The boolean was decided
   * by the spec FILE appearing in the diff and then gated a PER MEMBER
   * obligation, so any edit to any member imposed rule (d) on every sibling
   * member of the same file. See `phaseOwnedMemberIndices` in ../witness/spec.ts
   * for the derivation and for why an unreadable baseline owns everything.
   */
  phaseOwnedMembers: ReadonlySet<number>;
  hooks?: WitnessHooks;
}

export interface MemberRun {
  exitCode: number;
  red: boolean;
  failedNamedTests: string[];
  passedNamedTests: string[];
  missingNamedTests: string[];
}

export interface PinPairRecord {
  start: Pin;
  end: Pin;
  equal: boolean;
}

export interface MemberRecord {
  index: number;
  member: DangerousStateMember;
  description: string;
  baselineSha?: string;
  /** The applied dangerous-state diff, verbatim (git diff output). */
  appliedDiff?: string;
  mutatedLines?: { file: string; lines: number[] };
  preservesAssertedText?: boolean;
  rate?: { red: number; total: number };
  runs: MemberRun[];
  redPins?: PinPairRecord;
  greenPins?: PinPairRecord;
  headGreen?: boolean;
  unreachedArm?: { file: string; lines: number[]; greenTests: string[] };
  problem?: string;
}

export type WitnessStatus = "green" | "red" | "error";

export interface WitnessEvaluation {
  witness: string;
  specPath: string;
  behavior: string;
  status: WitnessStatus;
  reasons: string[];
  textAsserting: boolean;
  assertedPatterns: string[];
  testFiles: string[];
  captures?: Array<{ path: string; sha256: string; provenance: string }>;
  members: MemberRecord[];
}

interface GitResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  reason: string;
}

/**
 * Run git with a pinned C locale (verification-m1-p3-fix-round.md U-8: a
 * message-text classification with no locale pin silently stops matching in
 * a localized environment).
 */
export function gitIn(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  if (result.error !== undefined) {
    return {
      ok: false,
      status: null,
      stdout: "",
      stderr: "",
      reason: `git ${args.join(" ")} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  const ok = result.status === 0;
  return {
    ok,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    reason: ok
      ? ""
      : `git ${args.join(" ")} exited ${String(result.status)}: ${singleLine(result.stderr ?? "")}`,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&");
}

/**
 * Compute the phase diff base...head: changed files with status and the
 * new-side line ranges of every changed hunk.
 */
export function computePhaseDiff(
  repoRoot: string,
  base: string,
  head: string,
): { ok: true; diff: PhaseDiff } | { ok: false; reason: string } {
  const baseResolved = gitIn(repoRoot, ["rev-parse", "--verify", `${base}^{commit}`]);
  if (!baseResolved.ok) {
    return {
      ok: false,
      reason:
        `the base revision ${base} does not resolve in this repository: ` +
        `${baseResolved.reason}. The red-witness gate requires full history ` +
        `(fetch-depth: 0); see the M2-P2 work history, CI depth requirement.`,
    };
  }
  const headResolved = gitIn(repoRoot, ["rev-parse", "--verify", `${head}^{commit}`]);
  if (!headResolved.ok) {
    return {
      ok: false,
      reason: `the head revision ${head} does not resolve in this repository: ${headResolved.reason}`,
    };
  }
  const baseSha = baseResolved.stdout.trim();
  const headSha = headResolved.stdout.trim();
  const mergeBase = gitIn(repoRoot, ["merge-base", baseSha, headSha]);
  const mergeBaseSha = mergeBase.ok ? mergeBase.stdout.trim() : baseSha;
  const names = gitIn(repoRoot, [
    "diff",
    "--name-status",
    "--no-renames",
    `${baseSha}...${headSha}`,
  ]);
  if (!names.ok) {
    return { ok: false, reason: names.reason };
  }
  const files = new Map<string, DiffFile>();
  for (const line of names.stdout.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const [status, ...rest] = line.split("\t");
    const path = rest.join("\t");
    if (status === undefined || path === "") {
      continue;
    }
    files.set(path, { path, status, hunks: [] });
  }
  const hunkOutput = gitIn(repoRoot, ["diff", "-U0", "--no-renames", `${baseSha}...${headSha}`]);
  if (!hunkOutput.ok) {
    return { ok: false, reason: hunkOutput.reason };
  }
  let current: DiffFile | undefined;
  for (const line of hunkOutput.stdout.split("\n")) {
    const plus = /^\+\+\+ b\/(.+)$/.exec(line);
    if (plus !== null) {
      current = files.get(plus[1] as string);
      continue;
    }
    if (line.startsWith("+++ /dev/null")) {
      current = undefined;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk !== null && current !== undefined) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) {
        current.hunks.push([start, start + count - 1]);
      }
    }
  }
  return { ok: true, diff: { baseSha, headSha, mergeBaseSha, files } };
}

/**
 * The spawn grep of rule (f), over the changed files' head-state contents.
 * Exactly the plan's four tokens (M2-P2 step 4 rule (f)): a wider pattern
 * (for example a bare `exec(`) false-positives on `RegExp.exec` calls and
 * would derive a capture obligation from a file that spawns nothing.
 */
export const SPAWN_GREP = /child_process|execFile|spawnSync|execSync/;

/**
 * The shell form of rule (f)'s derivation (CR-H2). A POSIX shell script that
 * spawns another program and PARSES its output contains none of the four JS
 * tokens, so `SPAWN_GREP` is blind to exactly where M1's V-2 lived
 * (`bin/fm-*.sh` classifying git contention output). A shell spawn-and-parse
 * is derived as the conjunction of two signals over the script text:
 *   - SPAWN: another program's output is captured (a pipeline `|`, a command
 *     substitution `$(...)` or backticks, or stdin consumed by `read`/`while
 *     read`);
 *   - PARSE: that output is classified or transformed (`grep`, `awk`, `sed`,
 *     `cut`, `tr`, a `case` branch, or a `[[ ... =~ ... ]]` regex test).
 * The conjunction is deliberately narrow: a script that only runs a command
 * for its exit status, with no capture and no classifier, is not "in that
 * state" and is not burdened with a capture obligation. What this does NOT
 * cover is stated in the work history (rule (f), shell residue).
 */
export const SHELL_SPAWN = /\|[^|]|\$\(|`|(?:^|\s)read\s/m;
export const SHELL_PARSE = /(?:^|[\s|(])(?:grep|awk|sed|cut|tr)\b|(?:^|\s)case\s|=~/m;

/** True when the shell script text both spawns a program and parses its output. */
export function shellSpawnsAndParses(text: string): boolean {
  return SHELL_SPAWN.test(text) && SHELL_PARSE.test(text);
}

export interface TapTestPoint {
  name: string;
  ok: boolean;
  skipped: boolean;
}

export type TapParse =
  | { ok: true; tests: TapTestPoint[] }
  | { ok: false; reason: string };

/**
 * Parse a PINNED tap stream. The format is a controlled input: the child
 * was invoked with `--test-reporter tap`, so a stream that does not open
 * with `TAP version` is a reporter-pin failure naming both formats, never
 * something to parse anyway.
 */
export function parseTapStream(text: string): TapParse {
  const lines = text.split("\n");
  let first = "";
  for (const line of lines) {
    if (line.trim() !== "") {
      first = line.trim();
      break;
    }
  }
  if (!first.startsWith("TAP version")) {
    return {
      ok: false,
      reason:
        `expected the pinned reporter format tap (a stream opening with ` +
        `"TAP version") but observed a stream opening with ` +
        `${JSON.stringify(first.slice(0, 80))}`,
    };
  }
  const tests: TapTestPoint[] = [];
  for (const line of lines) {
    const match = /^\s*(not )?ok\s+\d+\s+-\s+(.*)$/.exec(line);
    if (match === null) {
      continue;
    }
    let name = match[2] as string;
    let skipped = false;
    const directive = / # (SKIP|TODO)\b/i.exec(name);
    if (directive !== null) {
      skipped = true;
      name = name.slice(0, directive.index);
    }
    tests.push({ name: name.trim(), ok: match[1] === undefined, skipped });
  }
  return { ok: true, tests };
}

export interface TextAssertionDerivation {
  textAsserting: boolean;
  /** Document paths (repo-relative) the named tests' sources read. */
  documents: string[];
  /** Regex sources and literals the assertions apply to those contents. */
  patterns: string[];
}

const STRING_LITERAL = /(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g;
// The read callee the detector targets: `readFile` / `readFileSync`, reached
// either as a bare identifier (a destructured named import) OR through a
// namespace member chain (`fs.readFileSync`, `fs.promises.readFile`, an
// aliased `fsp.readFile`). CR-1500: the namespace-qualified form is the
// DOMINANT real-world idiom and round one recognised only the bare form, so a
// single deleting text-asserting member shipped green under it. The prefix is
// zero or more `<ident>.` segments, which is still the SAME builtin, not an
// idiom widening: it resolves the callee, never the meaning of the read. What
// it deliberately does NOT reach is stated in the work history (a callee bound
// to another variable, `const rf = fs.readFileSync`; callback-style reads).
const READ_CALLEE = String.raw`(?:[A-Za-z_$][\w$]*\s*\.\s*)*readFile(?:Sync)?`;
// A read call whose result is bound to a name, so the assertions ON that
// name can be found: `const body = readFileSync(...)`, `let body = await
// fs.promises.readFile(...)`. Sync AND async, bare AND namespace-qualified,
// are covered. A trailing `.trim()` or similar leaves the binding intact.
const READ_BINDING = new RegExp(
  String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?` +
    READ_CALLEE +
    String.raw`\s*\(([^)]*)\)`,
  "g",
);
// A bare-string binding, so a read whose path is held in a variable
// (`readFileSync(P)` with `const P = "....yml"`, CR-H1 member F) resolves to
// the document rather than vanishing.
const STRING_BINDING =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])((?:(?!\2)[^\\]|\\.)*)\2\s*;?/g;
const EQUAL_FORMS =
  "(?:equal|strictEqual|deepEqual|deepStrictEqual|notEqual|notStrictEqual|notDeepEqual)";

// Extension-less root documents: a CLOSED, named vocabulary of well-known
// files whose path carries neither `/` nor `.` (CR-1501). Without this a
// witness reading `Makefile` or `LICENSE` and asserting its text escaped the
// detector, because the "no slash and no dot" test rejected the path as a
// bare token. This is a denylist-shaped gap, so it is DERIVED from the
// closed set of conventional extension-less root files rather than guessed by
// pattern; any extension-less name OUTSIDE this set stays behaviour and is
// named as residue in the work history rather than chased.
const EXTENSIONLESS_ROOT_DOCS = new Set([
  "Makefile",
  "Dockerfile",
  "Containerfile",
  "Jenkinsfile",
  "Vagrantfile",
  "Rakefile",
  "Gemfile",
  "Procfile",
  "Brewfile",
  "LICENSE",
  "LICENCE",
  "NOTICE",
  "COPYING",
  "AUTHORS",
  "CONTRIBUTORS",
  "CODEOWNERS",
  "README",
  "CHANGELOG",
]);

/** A document read the CR-661 class cares about: a path outside src/ and test/. */
function isDocumentPathLiteral(value: string): boolean {
  if (value.startsWith("src/") || value.startsWith("test/")) {
    return false;
  }
  if (!value.includes("/") && !value.includes(".")) {
    // Extension-less: only a recognised root-document name (the closed set
    // above) counts. Any other bare token (a variable-like word, a scratch
    // label) stays behaviour.
    return EXTENSIONLESS_ROOT_DOCS.has(value);
  }
  return true;
}

/**
 * The document path a read call targets, or undefined when it is not
 * statically resolvable to a document literal. A string literal in the
 * call's arguments wins; failing that, a bare identifier bound earlier to a
 * string literal (member F). A runtime path (a `join(...)`, a `mkdtemp`
 * result) resolves to undefined ON PURPOSE: it cannot be told apart from a
 * scratch temp read, so flagging it would redden legitimate behaviour
 * witnesses (the atomic determinism fixture reads a temp `state.json`).
 */
function documentPathFromArgs(
  args: string,
  varToPath: Map<string, string>,
): string | undefined {
  for (const literal of args.matchAll(STRING_LITERAL)) {
    const value = literal[2] as string;
    if (isDocumentPathLiteral(value)) {
      return value;
    }
  }
  const ident = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(args);
  if (ident !== null) {
    return varToPath.get(ident[1] as string);
  }
  return undefined;
}

/**
 * Whether a read-result variable is TEXT-ASSERTED directly, and any
 * statically extractable pattern. Tied to the variable so a read passed to a
 * project function (`isTransient(body)`, the retry witness) is behaviour, not
 * a text assertion, and does not falsely redden. Covers the assert forms the
 * plan names: `assert.match`/`assert.doesNotMatch` (regex over the body),
 * `body.includes`/`body.indexOf` (membership, `assert.ok` wrapper included by
 * matching the method call itself), and the equality family over the whole
 * body (CR-H1: `assert.equal` over a document is among the strongest text
 * assertions). A form the detector recognises but cannot extract a literal
 * from (a variable regex, `assert.match(body, wanted)`) still marks
 * text-asserting, with no pattern: fail conservative (CR-H1).
 */
function textAssertionsOnVar(
  source: string,
  varName: string,
): { asserted: boolean; patterns: string[] } {
  const v = escapeRegExp(varName);
  const patterns: string[] = [];
  let asserted = false;
  const matchLiteral = new RegExp(
    `assert\\.(?:match|doesNotMatch)\\s*\\(\\s*${v}\\s*,\\s*/((?:[^/\\\\]|\\\\.)+)/`,
    "g",
  );
  for (const m of source.matchAll(matchLiteral)) {
    asserted = true;
    patterns.push(m[1] as string);
  }
  if (new RegExp(`assert\\.(?:match|doesNotMatch)\\s*\\(\\s*${v}\\s*,`).test(source)) {
    asserted = true;
  }
  const membershipLiteral = new RegExp(
    `\\b${v}\\s*\\.\\s*(?:includes|indexOf)\\s*\\(\\s*(["'\`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`,
    "g",
  );
  for (const m of source.matchAll(membershipLiteral)) {
    asserted = true;
    patterns.push(escapeRegExp(m[2] as string));
  }
  if (new RegExp(`\\b${v}\\s*\\.\\s*(?:includes|indexOf)\\s*\\(`).test(source)) {
    asserted = true;
  }
  const equalLiteral = new RegExp(
    `assert\\.${EQUAL_FORMS}\\s*\\(\\s*${v}\\s*,\\s*(["'\`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`,
    "g",
  );
  for (const m of source.matchAll(equalLiteral)) {
    asserted = true;
    patterns.push(escapeRegExp(m[2] as string));
  }
  if (new RegExp(`assert\\.${EQUAL_FORMS}\\s*\\(\\s*${v}\\s*,`).test(source)) {
    asserted = true;
  }
  return { asserted, patterns };
}

/**
 * An inline read asserted without an intermediate variable:
 * `assert.equal(readFileSync(path), EXPECTED)`,
 * `assert.match(readFileSync(path), /re/)`. Only flags when the path
 * resolves to a document literal, so an inline temp read stays behaviour.
 */
function inlineTextAssertedReads(
  source: string,
  varToPath: Map<string, string>,
): Array<{ doc: string; patterns: string[] }> {
  const found: Array<{ doc: string; patterns: string[] }> = [];
  const inline = new RegExp(
    `assert\\.(?:match|doesNotMatch|${EQUAL_FORMS})\\s*\\(\\s*(?:await\\s+)?` +
      READ_CALLEE +
      `\\s*\\(([^)]*)\\)\\s*,\\s*([^)]*)\\)`,
    "g",
  );
  for (const m of source.matchAll(inline)) {
    const doc = documentPathFromArgs(m[1] as string, varToPath);
    if (doc === undefined) {
      continue;
    }
    const patterns: string[] = [];
    const rest = m[2] as string;
    const regexLiteral = /^\s*\/((?:[^/\\]|\\.)+)\//.exec(rest);
    if (regexLiteral !== null) {
      patterns.push(regexLiteral[1] as string);
    } else {
      const stringLiteral = /^\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/.exec(rest);
      if (stringLiteral !== null) {
        patterns.push(escapeRegExp(stringLiteral[2] as string));
      }
    }
    found.push({ doc, patterns });
  }
  return found;
}

/**
 * Rule (g)'s text-assertion detection, DERIVED from the named tests'
 * sources rather than declared: a source that reads a document from a path
 * outside `src/` and `test/` (a workflow, a manifest, a configuration
 * document) and ASSERTS THAT DOCUMENT'S TEXT is text-asserting. The
 * assertion is tied to the read result (a variable binding or an inline
 * read), never a free-floating assert form, so a read consumed by a project
 * function stays behaviour. Detection is syntactic and fails CONSERVATIVELY:
 * a recognised assert form whose pattern is not statically extractable still
 * marks the witness text-asserting (subject to rule (g)) rather than
 * returning false. The derivation's limits are stated in the work history.
 */
export function deriveTextAssertions(sources: string[]): TextAssertionDerivation {
  const documents = new Set<string>();
  const patterns = new Set<string>();
  let textAsserting = false;
  for (const source of sources) {
    const varToPath = new Map<string, string>();
    for (const m of source.matchAll(STRING_BINDING)) {
      const value = m[3] as string;
      if (isDocumentPathLiteral(value)) {
        varToPath.set(m[1] as string, value);
      }
    }
    for (const bind of source.matchAll(READ_BINDING)) {
      const varName = bind[1] as string;
      const doc = documentPathFromArgs(bind[2] as string, varToPath);
      const forms = textAssertionsOnVar(source, varName);
      if (!forms.asserted) {
        continue;
      }
      // The result is text-asserted. Flag only when the document path is a
      // resolvable non-src/test literal (a runtime path cannot be told from
      // a scratch read); patterns are recorded regardless, for the
      // preservation check.
      if (doc !== undefined) {
        textAsserting = true;
        documents.add(doc);
        for (const p of forms.patterns) {
          patterns.add(p);
        }
      }
    }
    for (const hit of inlineTextAssertedReads(source, varToPath)) {
      textAsserting = true;
      documents.add(hit.doc);
      for (const p of hit.patterns) {
        patterns.add(p);
      }
    }
  }
  return {
    textAsserting,
    documents: [...documents].sort(),
    patterns: [...patterns].sort(),
  };
}

/**
 * Resolve named tests to the repo-relative test files whose head-state
 * source contains the name literally. A name found nowhere is a spec
 * defect the caller turns into a red reason.
 */
export function resolveNamedTests(
  tests: string[],
  testFiles: Map<string, string>,
): { files: string[]; missing: string[] } {
  const files = new Set<string>();
  const missing: string[] = [];
  for (const name of tests) {
    let found = false;
    for (const [path, source] of testFiles) {
      if (source.includes(name)) {
        files.add(path);
        found = true;
      }
    }
    if (!found) {
      missing.push(name);
    }
  }
  return { files: [...files].sort(), missing };
}

/**
 * The 1-based line numbers a find text occupies, across every occurrence,
 * multi-line finds included (a single-line scan misses those, and rule (d)
 * plus the unreached-arm report both need the true span).
 */
export function findOccurrenceLines(body: string, find: string): number[] {
  const lines = new Set<number>();
  let from = 0;
  for (;;) {
    const at = body.indexOf(find, from);
    if (at < 0) {
      break;
    }
    const startLine = body.slice(0, at).split("\n").length;
    const spanned = find.split("\n").length;
    for (let offset = 0; offset < spanned; offset += 1) {
      lines.add(startLine + offset);
    }
    from = at + Math.max(find.length, 1);
  }
  return [...lines].sort((a, b) => a - b);
}

interface ApplyOutcome {
  ok: boolean;
  reason?: string;
  baselineSha?: string;
  appliedDiff?: string;
  mutatedLines?: { file: string; lines: number[] };
}

/**
 * Resolve a baseline in a clone from the FETCHED remote, never a stale
 * local ref: `refs/remotes/origin/<ref>` after the fetch wins; a literal
 * sha or tag that resolves to a commit is accepted as itself, because a
 * sha cannot be stale.
 */
function resolveBaseline(cloneDir: string, ref: string): { sha?: string; reason?: string } {
  const remote = gitIn(cloneDir, ["rev-parse", "--verify", `refs/remotes/origin/${ref}^{commit}`]);
  if (remote.ok) {
    return { sha: remote.stdout.trim() };
  }
  const literal = gitIn(cloneDir, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (literal.ok && /^[0-9a-f]{4,40}$/.test(ref)) {
    return { sha: literal.stdout.trim() };
  }
  return {
    reason:
      `baseline ${ref} does not resolve against the fetched remote ` +
      `(refs/remotes/origin/${ref})${literal.ok ? " and is not a sha" : ""}: ${remote.reason}`,
  };
}

function applyMember(
  cloneDir: string,
  member: DangerousStateMember,
  headSha: string,
  namedTestFiles: string[],
): ApplyOutcome {
  if (member.kind === "baseline-ref") {
    const baseline = resolveBaseline(cloneDir, member.ref);
    if (baseline.sha === undefined) {
      return { ok: false, reason: baseline.reason };
    }
    const checkout = gitIn(cloneDir, ["checkout", "--detach", "--force", baseline.sha]);
    if (!checkout.ok) {
      return { ok: false, reason: checkout.reason };
    }
    // The head-authored named tests are what must be red against the
    // baseline (blueprint section 4), so they are restored from head.
    const restore = gitIn(cloneDir, ["checkout", headSha, "--", ...namedTestFiles]);
    if (!restore.ok) {
      return { ok: false, reason: restore.reason };
    }
    const diff = gitIn(cloneDir, ["diff", headSha]);
    return {
      ok: true,
      baselineSha: baseline.sha,
      appliedDiff: diff.ok ? diff.stdout : `git diff failed: ${diff.reason}`,
    };
  }
  if (member.kind === "patch") {
    const body = gitIn(cloneDir, ["show", `${headSha}:${member.patch}`]);
    if (!body.ok) {
      return {
        ok: false,
        reason: `patch ${member.patch} does not exist at the audited head: ${body.reason}`,
      };
    }
    // A unique stage name, per MECHANISMS.md "Atomic file replacement":
    // never a fixed or pid-derived name (C-2 forbids pid identity).
    const patchPath = join(cloneDir, "..", `patch-${randomUUID()}.patch`);
    const refusal = refuseOpenForWrite(patchPath);
    if (refusal !== undefined) {
      return { ok: false, reason: refusal };
    }
    writeFileSync(patchPath, body.stdout);
    const applied = gitIn(cloneDir, ["apply", "--whitespace=nowarn", patchPath]);
    rmSync(patchPath, { force: true });
    if (!applied.ok) {
      return { ok: false, reason: `patch ${member.patch} does not apply: ${applied.reason}` };
    }
    const diff = gitIn(cloneDir, ["diff"]);
    return { ok: true, appliedDiff: diff.ok ? diff.stdout : "" };
  }
  const target = join(cloneDir, member.file);
  const read = readRegularFileIfPresent(target);
  if (read.kind !== "read") {
    return {
      ok: false,
      reason:
        read.kind === "absent"
          ? `mutation target ${member.file} does not exist in the clone`
          : read.reason,
    };
  }
  if (!read.body.includes(member.find)) {
    return {
      ok: false,
      reason:
        `mutation find text ${JSON.stringify(member.find)} does not occur in ` +
        `${member.file}`,
    };
  }
  const lines = findOccurrenceLines(read.body, member.find);
  const mutated = read.body.split(member.find).join(member.replace);
  const refusal = refuseOpenForWrite(target);
  if (refusal !== undefined) {
    return { ok: false, reason: refusal };
  }
  writeFileSync(target, mutated);
  const diff = gitIn(cloneDir, ["diff"]);
  return {
    ok: true,
    appliedDiff: diff.ok ? diff.stdout : "",
    mutatedLines: { file: member.file, lines },
  };
}

/**
 * Roots to pin inside a clone: the source and test roots that exist as REAL
 * directories. lstat is a probe, not an open, the same two syscalls
 * classifyEntry itself performs (the argument src/gates/pin.ts records).
 */
function pinRoots(cloneDir: string): string[] {
  const roots: string[] = [];
  for (const name of ["src", "test", "bin"]) {
    const path = join(cloneDir, name);
    try {
      if (lstatSync(path).isDirectory()) {
        roots.push(path);
      }
    } catch {
      // Absent root: simply not pinned; takePinSafe reports if none exist.
    }
  }
  return roots;
}

const TEST_RUN_TIMEOUT_MS = 120_000;

interface TestRunOutcome {
  run?: MemberRun;
  problem?: string;
}

function runNamedTests(
  cloneDir: string,
  tests: string[],
  testFilePaths: string[],
): TestRunOutcome {
  const argv = ["--test", "--test-reporter", "tap"];
  for (const name of tests) {
    argv.push("--test-name-pattern", `^${escapeRegExp(name)}$`);
  }
  // The pattern flags PRECEDE the positional paths (CLAUDE.md warning 7).
  argv.push(...testFilePaths);
  // The child must not inherit the parent's node:test context OR its
  // reporter selection. Two distinct leaks, one scrub:
  //   NODE_TEST_*: when this harness itself runs inside `node --test` (its
  //   own suite does), the inherited NODE_TEST_CONTEXT makes the child print
  //   "run() is being called recursively" and skip every file while exiting
  //   0, which would read as an empty reporter stream.
  //   NODE_OPTIONS: the suite gate (src/gates/suite.ts) requests its pinned
  //   reporter by setting a child-scoped NODE_OPTIONS
  //   (--test-reporter=<data url> --test-reporter-destination=<its stream>)
  //   on the top-level `npm test` run it spawns. That option is meant for
  //   THAT run alone, but NODE_OPTIONS is inherited by every descendant, so
  //   a nested `node --test` spawned here would pick it up. This child is
  //   already invoked with `--test-reporter tap` in argv; combined with the
  //   inherited reporter it becomes two reporters against one destination,
  //   which node rejects at startup with ERR_INVALID_ARG_VALUE ("--test-
  //   reporter must match the number of --test-reporter-destination"), the
  //   child exits 1 producing no tap stream, and parseTapStream then fails.
  //   The reporter is a top-level-run-scoped input, exactly like
  //   NODE_TEST_CONTEXT, so it is scrubbed the same way. The child's own
  //   reporter is set explicitly in argv and owes nothing to the ambient env.
  const env: Record<string, string> = { NO_COLOR: "1", FORCE_COLOR: "0" };
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined || name.startsWith("NODE_TEST") || name === "NODE_OPTIONS") {
      continue;
    }
    env[name] = value;
  }
  const child = spawnSync(process.execPath, argv, {
    cwd: cloneDir,
    encoding: "utf8",
    timeout: TEST_RUN_TIMEOUT_MS,
    env,
  });
  if (child.error !== undefined) {
    return {
      problem: `the test child could not be run: ${singleLine(String(child.error))}`,
    };
  }
  if (child.signal !== null && child.signal !== undefined) {
    return {
      problem:
        `the test child was terminated by ${child.signal} ` +
        `(harness timeout ${String(TEST_RUN_TIMEOUT_MS)}ms)`,
    };
  }
  const parsed = parseTapStream(child.stdout ?? "");
  if (!parsed.ok) {
    return {
      problem:
        `${parsed.reason} (test child exited ` +
        `${String(child.status)}; stderr: ` +
        `${singleLine((child.stderr ?? "").slice(0, 400))})`,
    };
  }
  const failed: string[] = [];
  const passed: string[] = [];
  const missing: string[] = [];
  for (const name of tests) {
    const points = parsed.tests.filter((point) => point.name === name);
    if (points.some((point) => !point.ok)) {
      failed.push(name);
      continue;
    }
    if (points.some((point) => point.ok && !point.skipped)) {
      passed.push(name);
      continue;
    }
    missing.push(name);
  }
  const exitCode = child.status ?? -1;
  return {
    run: {
      exitCode,
      red: exitCode !== 0 && failed.length === tests.length,
      failedNamedTests: failed,
      passedNamedTests: passed,
      missingNamedTests: missing,
    },
  };
}

function takePinSafe(roots: string[]): { pin?: Pin; problem?: string } {
  if (roots.length === 0) {
    return { problem: "the clone has no src, test or bin root to pin (M2-C-5)" };
  }
  try {
    return { pin: takePin(roots) };
  } catch (error) {
    return { problem: singleLine((error as Error).message ?? String(error)) };
  }
}

function pinPair(start: Pin, end: Pin): PinPairRecord {
  return { start, end, equal: comparePins(start, end).length === 0 };
}

function pinProblem(record: PinPairRecord, phase: string): string | undefined {
  if (record.equal) {
    return undefined;
  }
  const differences = comparePins(record.start, record.end);
  return (
    `the tree changed during the ${phase} run: ` +
    differences.map(describePinDifference).join("; ")
  );
}

interface CloneOutcome {
  dir?: string;
  reason?: string;
}

/**
 * Create a scratch clone of the audited repository at the audited head,
 * with `origin` pointing at the audited repository's own origin when it
 * has one (so baselines resolve against the real remote after a fetch,
 * never a stale local ref), else at the audited repository itself.
 */
export function makeClone(
  repoRoot: string,
  headSha: string,
  scratchRoot: string,
  label: string,
): CloneOutcome {
  const dir = join(scratchRoot, label);
  const cloned = gitIn(scratchRoot, ["clone", "--quiet", repoRoot, dir]);
  if (!cloned.ok) {
    return { reason: `scratch clone failed: ${cloned.reason}` };
  }
  const originUrl = gitIn(repoRoot, ["remote", "get-url", "origin"]);
  if (originUrl.ok) {
    const url = originUrl.stdout.trim();
    const set = gitIn(dir, ["remote", "set-url", "origin", url]);
    if (!set.ok) {
      return { reason: set.reason };
    }
  }
  const fetched = gitIn(dir, ["fetch", "--quiet", "origin"]);
  if (!fetched.ok) {
    return { reason: `fetch of origin failed in the scratch clone: ${fetched.reason}` };
  }
  const checkout = gitIn(dir, ["checkout", "--detach", "--force", "--quiet", headSha]);
  if (!checkout.ok) {
    return { reason: `checkout of the audited head failed: ${checkout.reason}` };
  }
  // A git clone carries SOURCE, never installed dependencies, and this clone is
  // where the audited suite is executed. So the clone must be able to resolve
  // whatever the audited head imports, and `node_modules` is the only part of
  // that which git does not carry.
  //
  // This was latent until it was not. The kernel had ZERO production
  // dependencies through M1 and M2, so a dependency-free clone ran the suite
  // correctly and nothing here was wrong. M3-P1 adds the kernel's first two
  // (`ajv` and `yaml`, DR-0013), and from that commit forward a bare clone
  // cannot even load the test file:
  //
  //   Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yaml' imported from
  //   <clone>/test/validate.test.ts
  //
  // The hazard is worse than a broken run, which is why this fails CLOSED
  // rather than warning. A member is judged by whether the named test is RED
  // under the dangerous state and GREEN without it. A clone that cannot resolve
  // an import is red for EVERY member and every control, so an unresolvable
  // clone does not report "the harness is broken", it reports red, which is the
  // same observation a genuine witness produces. Guessing here would let a
  // witness appear to guard a behavior it never exercised.
  //
  // A SYMLINK rather than `npm ci`: the install is environment state, not
  // source, and every member gets its own clone (M2-C-4 isolation), so paying a
  // network install per member is both slow and a new failure mode on an
  // offline runner. The link is read-only in practice; nothing in a member's
  // evaluation writes through it.
  //
  // Consequence, stated rather than hidden: the clone resolves against the
  // AUDITED REPOSITORY'S installed tree, so a member whose patch edits
  // `package.json` dependencies is evaluated against the parent's modules, not
  // its own. No current witness does that. A member that needs different
  // dependencies is out of scope for this mechanism and would need a real
  // install; the failure would be visible as an unresolved import rather than
  // as a silent wrong answer.
  const parentModules = join(repoRoot, "node_modules");
  // lstat, not stat, and the type is ESTABLISHED before anything is read
  // through it (CLAUDE.md's recorded mechanism: reading a path whose type has
  // not been established). A directory or a symlink to one both serve.
  let parentModulesIsUsable = false;
  try {
    const st = lstatSync(parentModules);
    parentModulesIsUsable = st.isDirectory() || st.isSymbolicLink();
  } catch {
    parentModulesIsUsable = false;
  }
  if (parentModulesIsUsable) {
    try {
      symlinkSync(parentModules, join(dir, "node_modules"), "dir");
    } catch (error) {
      return {
        reason: `linking node_modules into the scratch clone failed: ${singleLine(String(error))}`,
      };
    }
    return { dir };
  }
  // No installed tree in the audited repository. That is only a defect if the
  // audited head actually NEEDS one, so the predicate is "declares runtime
  // dependencies and has none installed", never the bare absence.
  //
  // Getting this wrong in the strict direction is not theoretical: refusing on
  // absence alone breaks this harness's OWN fixtures, which are deliberately
  // minimal repositories with no dependencies and nothing to resolve. Eight
  // tests in test/witness.test.ts reddened on the first attempt at this check,
  // which is the suite doing its job.
  const declared = readRegularFileIfPresent(join(dir, "package.json"));
  let needsModules = false;
  if (declared.kind === "read") {
    try {
      const parsed = JSON.parse(declared.body) as { dependencies?: unknown };
      const deps = parsed.dependencies;
      needsModules =
        typeof deps === "object" && deps !== null && Object.keys(deps).length > 0;
    } catch {
      // An unparseable package.json is not this function's error to raise; the
      // suite that runs in the clone will say so far more precisely.
      needsModules = false;
    }
  }
  if (needsModules) {
    return {
      reason:
        `the audited head declares runtime dependencies but the audited repository ` +
        `has no installed tree at ${parentModules}, so the scratch clone cannot ` +
        "resolve the imports of the suite it must run. Run `npm ci` in the audited " +
        "repository first. Refusing rather than running a clone whose every member " +
        "would be red for the wrong reason",
    };
  }
  return { dir };
}

function restoreHead(cloneDir: string, headSha: string): string | undefined {
  const reset = gitIn(cloneDir, ["reset", "--hard", "--quiet", headSha]);
  if (!reset.ok) {
    return reset.reason;
  }
  const detach = gitIn(cloneDir, ["checkout", "--detach", "--force", "--quiet", headSha]);
  if (!detach.ok) {
    return detach.reason;
  }
  return undefined;
}

/** Patterns that still match some document's content, for rule (g). */
function matchingPatterns(
  patterns: string[],
  documents: string[],
  readDocument: (path: string) => string | undefined,
): Set<string> {
  const matched = new Set<string>();
  const contents = documents
    .map((path) => readDocument(path))
    .filter((body): body is string => body !== undefined);
  for (const source of patterns) {
    let expression: RegExp;
    try {
      expression = new RegExp(source, "m");
    } catch {
      continue;
    }
    if (contents.some((body) => expression.test(body))) {
      matched.add(source);
    }
  }
  return matched;
}

/**
 * Apply a patch member to the asserted documents ALONE, in a throwaway
 * directory, so rule (g)'s preservation check can read the mutated text
 * without a full clone. `git apply` works on plain files outside a
 * repository; the patch is restricted to the documents with `--include`.
 */
function applyPatchToDocuments(
  inputs: EvaluationInputs,
  patchPath: string,
  documents: string[],
  readDocumentAtHead: (path: string) => string | undefined,
): Map<string, string> | undefined {
  const shown = gitIn(inputs.repoRoot, ["show", `${inputs.headSha}:${patchPath}`]);
  if (!shown.ok) {
    return undefined;
  }
  const stage = mkdtempSync(join(inputs.scratchRoot, "rule-g-"));
  try {
    for (const document of documents) {
      const body = readDocumentAtHead(document);
      if (body === undefined) {
        continue;
      }
      const target = join(stage, document);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
    const patchFile = join(stage, "member.patch");
    writeFileSync(patchFile, shown.stdout);
    const args = ["apply", "--whitespace=nowarn"];
    for (const document of documents) {
      args.push(`--include=${document}`);
    }
    args.push(patchFile);
    const applied = gitIn(stage, args);
    if (!applied.ok) {
      return undefined;
    }
    const mutated = new Map<string, string>();
    for (const document of documents) {
      const read = readRegularFileIfPresent(join(stage, document));
      if (read.kind === "read") {
        mutated.set(document, read.body);
      }
    }
    return mutated;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

interface RuleOutcome {
  reasons: string[];
  preservation: Map<number, boolean>;
}

/**
 * Refusal rules (a) to (g), evaluated BEFORE any test runs (M2-P2 step 4).
 * Each produces a red reason naming its source. Rules (d) and (f) are
 * derived from the phase diff (M2R-001, M2-D-15): the gate does not rest on
 * the implementer's own declaration where the fact is derivable.
 */
function evaluateRefusalRules(
  spec: WitnessSpec,
  inputs: EvaluationInputs,
  namedTestFiles: string[],
  derivation: TextAssertionDerivation,
): RuleOutcome {
  const reasons: string[] = [];
  const preservation = new Map<number, boolean>();
  const readPatch = (path: string): string | undefined => {
    const shown = gitIn(inputs.repoRoot, ["show", `${inputs.headSha}:${path}`]);
    return shown.ok ? shown.stdout : undefined;
  };

  // (b) behavior resolution.
  if (!inputs.behaviors.has(spec.behavior)) {
    reasons.push(
      `rule (b): behavior ${spec.behavior} does not resolve in test/behaviors.json`,
    );
  }

  // (a) a bare absent-feature baseline is not the dangerous state (T-003).
  if (spec.class === "destructive" || spec.class === "classification") {
    for (let index = 0; index < spec.dangerousStates.length; index += 1) {
      const member = spec.dangerousStates[index] as DangerousStateMember;
      if (member.kind === "baseline-ref") {
        reasons.push(
          `rule (a): class ${spec.class} with member ${String(index)} of kind ` +
            `baseline-ref; a bare absent-feature baseline is not the dangerous ` +
            `state (T-003)`,
        );
      }
    }
  }

  // (e) derived class from the destructiveCommands list.
  const testSources = namedTestFiles.map(
    (path) => inputs.testFiles.get(path) ?? "",
  );
  const derivedEntries = inputs.destructiveCommands.filter((entry) =>
    testSources.some((source) => source.includes(entry)),
  );
  if (derivedEntries.length > 0 && spec.class !== "destructive") {
    reasons.push(
      `rule (e): the named tests invoke ${derivedEntries.join(", ")} from the ` +
        `manifest destructiveCommands list, so the derived class is destructive ` +
        `and the declared class ${spec.class} is weaker`,
    );
  }

  // (c) capture citations.
  if (spec.consumesExternalOutput !== undefined) {
    const consumes = spec.consumesExternalOutput;
    if (consumes.captures.length === 0) {
      reasons.push("rule (c): consumesExternalOutput declared but no capture cited");
    }
    let referenced = false;
    for (const capture of consumes.captures) {
      const path = join(inputs.repoRoot, capture);
      const read = readRegularFileIfPresent(path);
      if (read.kind === "absent") {
        reasons.push(`rule (c): cited capture ${capture} is missing`);
        continue;
      }
      if (read.kind === "refused") {
        reasons.push(`rule (c): cited capture ${capture}: ${read.reason}`);
        continue;
      }
      if (read.body.trim() === "") {
        reasons.push(`rule (c): cited capture ${capture} is empty`);
        continue;
      }
      const basename = capture.split("/").pop() as string;
      if (testSources.some((source) => source.includes(basename))) {
        referenced = true;
      }
    }
    if (consumes.captures.length > 0 && !referenced) {
      reasons.push(
        "rule (c): no cited capture's basename is referenced from the named tests' sources",
      );
    }
  }

  // (f) derived capture obligation from the spawn grep over changed files.
  const touched = new Set<string>();
  for (const member of spec.dangerousStates) {
    for (const file of memberTouchedFiles(member, readPatch)) {
      touched.add(file);
    }
  }
  const spawningTouched = inputs.spawningChangedFiles.filter((file) =>
    touched.has(file),
  );
  if (spawningTouched.length > 0 && spec.consumesExternalOutput === undefined) {
    reasons.push(
      `rule (f): the phase diff touches ${spawningTouched.join(", ")}, which ` +
        `the spawn/parse derivation (JS: ${SPAWN_GREP.source}; shell *.sh: ` +
        `spawn-and-parse) matched, so consumesExternalOutput is required and ` +
        `this witness omits it`,
    );
  }

  // (d) diff intersection, for the members THIS PHASE AUTHORED.
  //
  // The scope is per MEMBER, never per spec file: `inputs.phaseOwnedMembers`
  // carries the indices the phase added or changed relative to the merge base.
  // A member a sibling edit dragged into the file's diff is not owned and
  // takes no obligation from this rule. The property rule (d) protects is
  // unchanged: a member this phase AUTHORED must intersect this phase's diff,
  // so a phase still cannot add a dangerous state about unrelated code.
  for (let index = 0; index < spec.dangerousStates.length; index += 1) {
    if (!inputs.phaseOwnedMembers.has(index)) {
      continue;
    }
    const member = spec.dangerousStates[index] as DangerousStateMember;
    if (member.kind === "baseline-ref") {
      continue;
    }
    const files = memberTouchedFiles(member, readPatch);
    const changedTouched = files.filter((file) => inputs.diff.files.has(file));
    if (changedTouched.length === 0) {
      reasons.push(
        `rule (d): declared dangerous state does not intersect the phase diff ` +
          `(member ${String(index)}, ${describeMember(member)})`,
      );
      continue;
    }
    if (member.kind === "mutation") {
      const diffFile = inputs.diff.files.get(member.file);
      const shown = gitIn(inputs.repoRoot, [
        "show",
        `${inputs.headSha}:${member.file}`,
      ]);
      let insideHunk = false;
      if (diffFile !== undefined && shown.ok) {
        const occupied = findOccurrenceLines(shown.stdout, member.find);
        insideHunk = occupied.some((lineNo) =>
          diffFile.hunks.some(([start, end]) => lineNo >= start && lineNo <= end),
        );
      }
      if (!insideHunk) {
        reasons.push(
          `rule (d): declared dangerous state does not intersect the phase diff ` +
            `(member ${String(index)}, mutation of ${member.file} touches no ` +
            `line inside a changed hunk)`,
        );
      }
    }
  }

  // (g) one witness is not a class (M2-D-17).
  const needsClassRules = spec.class === "classification" || derivation.textAsserting;
  if (needsClassRules) {
    if (spec.dangerousStates.length < 2) {
      reasons.push(
        `rule (g): ${
          spec.class === "classification"
            ? "a classification witness"
            : "a text-asserting witness"
        } must declare at least two structurally different dangerousStates ` +
          `members and this witness declares ${String(spec.dangerousStates.length)} ` +
          `(single-member collapse; one witness is not a class)`,
      );
    } else {
      // Structural distinctness is DERIVED: two mutations touching the same
      // line, or two byte-identical patches after path normalization, are
      // one member.
      for (let a = 0; a < spec.dangerousStates.length; a += 1) {
        for (let b = a + 1; b < spec.dangerousStates.length; b += 1) {
          const first = spec.dangerousStates[a] as DangerousStateMember;
          const second = spec.dangerousStates[b] as DangerousStateMember;
          if (
            first.kind === "mutation" &&
            second.kind === "mutation" &&
            first.file === second.file &&
            first.find === second.find
          ) {
            reasons.push(
              `rule (g): members ${String(a)} and ${String(b)} mutate the same ` +
                `text of ${first.file} and count as one member (collapse)`,
            );
          }
          if (first.kind === "patch" && second.kind === "patch") {
            const bodyA = readPatch(first.patch) ?? "";
            const bodyB = readPatch(second.patch) ?? "";
            const normalize = (body: string): string =>
              body
                .split("\n")
                .filter((line) => !/^(diff --git|index |--- |\+\+\+ )/.test(line))
                .join("\n");
            if (bodyA !== "" && normalize(bodyA) === normalize(bodyB)) {
              reasons.push(
                `rule (g): members ${String(a)} and ${String(b)} are ` +
                  `byte-identical patches after path normalisation and count as ` +
                  `one member (collapse)`,
              );
            }
          }
        }
      }
    }
  }

  // (g), strong form for text-asserting witnesses: at least one member must
  // PRESERVE every asserted string while inverting the behaviour. Verified
  // mechanically by re-running the assertions' own patterns against the
  // mutated documents.
  if (derivation.textAsserting && spec.dangerousStates.length >= 1) {
    const readDocumentAtHead = (path: string): string | undefined => {
      const shown = gitIn(inputs.repoRoot, ["show", `${inputs.headSha}:${path}`]);
      return shown.ok ? shown.stdout : undefined;
    };
    const headMatched = matchingPatterns(
      derivation.patterns,
      derivation.documents,
      readDocumentAtHead,
    );
    let anyPreserving = false;
    for (let index = 0; index < spec.dangerousStates.length; index += 1) {
      const member = spec.dangerousStates[index] as DangerousStateMember;
      let readMutated: ((path: string) => string | undefined) | undefined;
      if (member.kind === "mutation") {
        readMutated = (path: string): string | undefined => {
          const body = readDocumentAtHead(path);
          if (body === undefined) {
            return undefined;
          }
          return path === member.file ? body.split(member.find).join(member.replace) : body;
        };
      } else if (member.kind === "patch") {
        const patched = applyPatchToDocuments(
          inputs,
          member.patch,
          derivation.documents,
          readDocumentAtHead,
        );
        if (patched !== undefined) {
          readMutated = (path: string): string | undefined => patched.get(path);
        }
      }
      if (readMutated === undefined) {
        // A baseline-ref member replaces the whole tree (it cannot preserve
        // head text while inverting behaviour), and a patch that failed to
        // apply to the documents preserved nothing establishable.
        preservation.set(index, false);
        continue;
      }
      const stillMatched = matchingPatterns(
        derivation.patterns,
        derivation.documents,
        readMutated,
      );
      const preserves = [...headMatched].every((pattern) => stillMatched.has(pattern));
      preservation.set(index, preserves);
      if (preserves) {
        anyPreserving = true;
      }
    }
    if (!anyPreserving) {
      reasons.push(
        "rule (g): every declared member removes the asserted text; none inverts the behaviour",
      );
    }
  }

  return { reasons, preservation };
}

/**
 * Evaluate one witness spec end to end. Refusal rules first; then, per
 * declared dangerous-state member, a scratch clone, the member applied, the
 * named tests run red `repeats` times, head restored, the named tests run
 * green, everything pinned and recorded.
 */
export function evaluateWitness(
  spec: WitnessSpec,
  specPath: string,
  inputs: EvaluationInputs,
): WitnessEvaluation {
  const resolved = resolveNamedTests(spec.tests, inputs.testFiles);
  const derivation = deriveTextAssertions(
    resolved.files.map((path) => inputs.testFiles.get(path) ?? ""),
  );
  const evaluation: WitnessEvaluation = {
    witness: spec.id,
    specPath,
    behavior: spec.behavior,
    status: "green",
    reasons: [],
    textAsserting: derivation.textAsserting,
    assertedPatterns: derivation.patterns,
    testFiles: resolved.files,
    members: [],
  };

  if (resolved.missing.length > 0) {
    evaluation.status = "red";
    evaluation.reasons.push(
      `named test(s) not found in any test file at the audited head: ` +
        resolved.missing.map((name) => JSON.stringify(name)).join(", "),
    );
    return evaluation;
  }

  const rules = evaluateRefusalRules(spec, inputs, resolved.files, derivation);
  if (rules.reasons.length > 0) {
    evaluation.status = "red";
    evaluation.reasons.push(...rules.reasons);
    return evaluation;
  }

  if (spec.consumesExternalOutput !== undefined) {
    evaluation.captures = [];
    for (const capture of spec.consumesExternalOutput.captures) {
      const read = readRegularFileIfPresent(join(inputs.repoRoot, capture));
      if (read.kind === "read") {
        evaluation.captures.push({
          path: capture,
          sha256: createHash("sha256").update(read.body).digest("hex"),
          provenance: spec.consumesExternalOutput.provenance,
        });
      }
    }
  }

  for (let index = 0; index < spec.dangerousStates.length; index += 1) {
    const member = spec.dangerousStates[index] as DangerousStateMember;
    const record = evaluateMember(spec, member, index, inputs, resolved.files, rules);
    evaluation.members.push(record);
    if (record.problem !== undefined) {
      evaluation.status = "error";
      evaluation.reasons.push(
        `member ${String(index)} (${describeMember(member)}): ${record.problem}`,
      );
      continue;
    }
    const rate = record.rate as { red: number; total: number };
    const memberRed = spec.deterministic
      ? rate.red === rate.total
      : rate.red > 0;
    if (!memberRed) {
      if (evaluation.status !== "error") {
        evaluation.status = "red";
      }
      if (record.unreachedArm !== undefined) {
        evaluation.reasons.push(
          `member ${String(index)} (${describeMember(member)}): no named test ` +
            `reaches this arm (${record.unreachedArm.file} line(s) ` +
            `${record.unreachedArm.lines.join(", ")}; stayed green: ` +
            `${record.unreachedArm.greenTests.join(", ")})`,
        );
      } else {
        evaluation.reasons.push(
          `member ${String(index)} (${describeMember(member)}): red in ` +
            `${String(rate.red)} of ${String(rate.total)} repetitions` +
            (spec.deterministic
              ? " where deterministic true requires every repetition red"
              : " where at least one red repetition is required"),
        );
      }
    }
    if (record.headGreen === false) {
      if (evaluation.status !== "error") {
        evaluation.status = "red";
      }
      evaluation.reasons.push(
        `member ${String(index)} (${describeMember(member)}): the named tests ` +
          `are not green at the audited head`,
      );
    }
  }
  return evaluation;
}

function evaluateMember(
  spec: WitnessSpec,
  member: DangerousStateMember,
  index: number,
  inputs: EvaluationInputs,
  namedTestFiles: string[],
  rules: RuleOutcome,
): MemberRecord {
  const record: MemberRecord = {
    index,
    member,
    description: describeMember(member),
    runs: [],
  };
  const preserves = rules.preservation.get(index);
  if (preserves !== undefined) {
    record.preservesAssertedText = preserves;
  }
  const label = `${spec.id}-m${String(index)}`;
  const clone = makeClone(inputs.repoRoot, inputs.headSha, inputs.scratchRoot, label);
  if (clone.dir === undefined) {
    record.problem = clone.reason as string;
    return record;
  }
  const cloneDir = clone.dir;
  try {
    // Record the baseline this run resolved from the fetched remote, for
    // every member kind (M2-P2 criterion 10 asserts the recorded value).
    const baseline = resolveBaseline(cloneDir, inputs.baselineRef);
    if (baseline.sha !== undefined) {
      record.baselineSha = baseline.sha;
    }
    const applied = applyMember(cloneDir, member, inputs.headSha, namedTestFiles);
    if (!applied.ok) {
      record.problem = applied.reason as string;
      return record;
    }
    if (applied.baselineSha !== undefined) {
      record.baselineSha = applied.baselineSha;
    }
    record.appliedDiff = applied.appliedDiff ?? "";
    if (applied.mutatedLines !== undefined) {
      record.mutatedLines = applied.mutatedLines;
    }

    const roots = pinRoots(cloneDir);
    const startRed = takePinSafe(roots);
    if (startRed.pin === undefined) {
      record.problem = startRed.problem as string;
      return record;
    }
    const total = spec.repeats;
    let redCount = 0;
    // "Stayed green": passed in EVERY repetition (M2-P2 criterion 4a).
    const stayedGreen = new Set<string>(spec.tests);
    for (let repetition = 0; repetition < total; repetition += 1) {
      const outcome = runNamedTests(cloneDir, spec.tests, namedTestFiles);
      if (outcome.run === undefined) {
        record.problem = outcome.problem as string;
        return record;
      }
      record.runs.push(outcome.run);
      if (outcome.run.red) {
        redCount += 1;
      }
      for (const name of spec.tests) {
        if (!outcome.run.passedNamedTests.includes(name)) {
          stayedGreen.delete(name);
        }
      }
    }
    const endRed = takePinSafe(roots);
    if (endRed.pin === undefined) {
      record.problem = endRed.problem as string;
      return record;
    }
    record.redPins = pinPair(startRed.pin, endRed.pin);
    const redPinProblem = pinProblem(record.redPins, "dangerous-state");
    if (redPinProblem !== undefined) {
      record.problem = redPinProblem;
      return record;
    }
    record.rate = { red: redCount, total };
    if (redCount === 0 && member.kind === "mutation" && record.mutatedLines !== undefined) {
      record.unreachedArm = {
        file: record.mutatedLines.file,
        lines: record.mutatedLines.lines,
        greenTests: [...stayedGreen].sort(),
      };
    }

    const restore = restoreHead(cloneDir, inputs.headSha);
    if (restore !== undefined) {
      record.problem = restore;
      return record;
    }
    const startGreen = takePinSafe(roots);
    if (startGreen.pin === undefined) {
      record.problem = startGreen.problem as string;
      return record;
    }
    const greenOutcome = runNamedTests(cloneDir, spec.tests, namedTestFiles);
    if (greenOutcome.run === undefined) {
      record.problem = greenOutcome.problem as string;
      return record;
    }
    record.runs.push(greenOutcome.run);
    if (inputs.hooks?.betweenPins !== undefined) {
      inputs.hooks.betweenPins(cloneDir);
    }
    const endGreen = takePinSafe(roots);
    if (endGreen.pin === undefined) {
      record.problem = endGreen.problem as string;
      return record;
    }
    record.greenPins = pinPair(startGreen.pin, endGreen.pin);
    const greenPinProblem = pinProblem(record.greenPins, "head");
    if (greenPinProblem !== undefined) {
      record.problem = greenPinProblem;
      return record;
    }
    record.headGreen =
      greenOutcome.run.exitCode === 0 &&
      greenOutcome.run.passedNamedTests.length === spec.tests.length;
    return record;
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
  }
}

/** Create the scratch root this harness owns; the caller removes it. */
export function makeScratchRoot(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-witness-"));
}

/** Remove a scratch root created by makeScratchRoot. */
export function removeScratchRoot(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

/**
 * Read the head-state sources of every test file under `test/`, from git
 * rather than the working tree, because on pull_request events the checkout
 * is a synthetic merge commit and the audited head is `--head`.
 */
export function readTestFilesAtHead(
  repoRoot: string,
  headSha: string,
): { ok: true; files: Map<string, string> } | { ok: false; reason: string } {
  const listed = gitIn(repoRoot, [
    "ls-tree",
    "-r",
    "--name-only",
    headSha,
    "--",
    "test/",
  ]);
  if (!listed.ok) {
    return { ok: false, reason: listed.reason };
  }
  const files = new Map<string, string>();
  for (const path of listed.stdout.split("\n")) {
    if (!path.endsWith(".test.ts")) {
      continue;
    }
    const shown = gitIn(repoRoot, ["show", `${headSha}:${path}`]);
    if (!shown.ok) {
      return { ok: false, reason: shown.reason };
    }
    files.set(path, shown.stdout);
  }
  return { ok: true, files };
}

/** Resolve the absolute path of a repository root, refusing a non-directory. */
export function resolveRepoRoot(path: string): { root?: string; reason?: string } {
  const absolute = resolve(path);
  const probe = gitIn(absolute, ["rev-parse", "--show-toplevel"]);
  if (!probe.ok) {
    return { reason: `${absolute} is not a git repository: ${probe.reason}` };
  }
  return { root: probe.stdout.trim() };
}
