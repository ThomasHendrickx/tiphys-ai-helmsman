import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  /** True for the phase's own witnesses; rule (d) applies only to them. */
  phaseOwn: boolean;
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
  return { ok: true, diff: { baseSha, headSha, files } };
}

/**
 * The spawn grep of rule (f), over the changed files' head-state contents.
 * Exactly the plan's four tokens (M2-P2 step 4 rule (f)): a wider pattern
 * (for example a bare `exec(`) false-positives on `RegExp.exec` calls and
 * would derive a capture obligation from a file that spawns nothing.
 */
export const SPAWN_GREP = /child_process|execFile|spawnSync|execSync/;

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

const READ_CALL = /readFileSync?\s*\(([^)]*)\)/g;
const STRING_LITERAL = /(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g;
const ASSERT_FORMS = [/assert\.match\s*\(/, /assert\.doesNotMatch\s*\(/, /\.includes\s*\(/, /assert\.ok\s*\(/];
const MATCH_PATTERN = /assert\.match\s*\([^,]+,\s*\/((?:[^/\\]|\\.)+)\//g;
const INCLUDES_LITERAL = /\.includes\s*\(\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g;

/**
 * Rule (g)'s text-assertion detection, DERIVED from the named tests'
 * sources rather than declared: a source that reads a file from a path
 * outside `src/` and `test/` (a workflow, a manifest, a configuration
 * document) and applies one of the four assertion forms is text-asserting.
 * Path detection is syntactic over string literals inside the read call's
 * parentheses; the derivation's limits are stated in the work history.
 */
export function deriveTextAssertions(sources: string[]): TextAssertionDerivation {
  const documents = new Set<string>();
  const patterns = new Set<string>();
  let anyAssertForm = false;
  for (const source of sources) {
    for (const readMatch of source.matchAll(READ_CALL)) {
      const args = readMatch[1] as string;
      for (const literal of args.matchAll(STRING_LITERAL)) {
        const value = literal[2] as string;
        if (!value.includes("/") && !value.includes(".")) {
          continue;
        }
        if (value.startsWith("src/") || value.startsWith("test/")) {
          continue;
        }
        documents.add(value);
      }
    }
    if (ASSERT_FORMS.some((form) => form.test(source))) {
      anyAssertForm = true;
    }
    for (const match of source.matchAll(MATCH_PATTERN)) {
      patterns.add(match[1] as string);
    }
    for (const match of source.matchAll(INCLUDES_LITERAL)) {
      patterns.add(escapeRegExp(match[2] as string));
    }
  }
  const textAsserting = documents.size > 0 && anyAssertForm && patterns.size > 0;
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
  // The child must not inherit the parent's node:test context: when this
  // harness itself runs inside `node --test` (its own suite does), the
  // inherited NODE_TEST_CONTEXT makes the child print "run() is being
  // called recursively" and skip every file while exiting 0, which would
  // read as an empty reporter stream. Scrub every NODE_TEST* variable.
  const env: Record<string, string> = { NO_COLOR: "1", FORCE_COLOR: "0" };
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined || name.startsWith("NODE_TEST")) {
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
function makeClone(
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
        `the spawn grep (${SPAWN_GREP.source}) matched, so consumesExternalOutput ` +
        `is required and this witness omits it`,
    );
  }

  // (d) diff intersection, for the phase's own witnesses.
  if (inputs.phaseOwn) {
    for (let index = 0; index < spec.dangerousStates.length; index += 1) {
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
