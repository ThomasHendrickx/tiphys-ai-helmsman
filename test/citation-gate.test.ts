import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M2-P5: the citation linter (kernel plan M2 section 3, "M2-P5: Citation
 * linter"), fix round one. Unit import through a computed URL (CLAUDE.md
 * warning 4).
 *
 * FIX ROUND ONE, per `delivery/review/arbitration-m2-p5.md` and
 * `delivery/review/clean-room-m2-p5-hazard.md`: this file replaces the
 * round-zero suite. Every test below stages the DANGEROUS state, not the
 * absent feature: the red witnesses for M2-D-21 (hunk scope) and M2-D-22
 * (quoted vs made) construct real scratch git repositories with real
 * commits, never hand-written strings standing in for git's own diff
 * output; the CR-1017 witness constructs the exact `--head BROKEN` with a
 * `FIXED` working tree shape the hazard review used; the CR-1018 witness
 * places a real file outside the scratch checkout and cites it with a
 * real `..` traversal string.
 */

interface CitationRoot {
  name: string;
  description?: string;
  match: string[];
}
interface CitationConfig {
  version: number;
  roots: CitationRoot[];
  externalRoots: CitationRoot[];
  documents: string[];
  citationRequired: string[];
}
interface CitationToken {
  raw: string;
  path: string;
  startLine: number;
  endLine: number;
  hash?: string;
  hashMalformed: boolean;
  trailingMalformed?: string;
  offset: number;
}
type RootClassification =
  | { kind: "external"; root: string }
  | { kind: "local"; root: string }
  | { kind: "unmatched" }
  | { kind: "ambiguous"; roots: string[] };
type GitObjectRead =
  | { kind: "blob"; body: string }
  | { kind: "missing" }
  | { kind: "irregular"; reason: string }
  | { kind: "error"; reason: string };
type TargetReader = (path: string) => GitObjectRead;
type CitationResolution =
  | { kind: "resolved"; detail: string }
  | { kind: "unresolved"; detail: string }
  | { kind: "unverifiable-external"; root: string; detail: string }
  | { kind: "read-error"; path: string; reason: string };
interface GateResultFields {
  gate: string;
  status: string;
  units: number;
  unitLabel: string;
  startedAt: string;
  endedAt: string;
  detail: string;
  evidence?: string[];
}

const citationsModule = (await import(
  new URL("../src/gates/citations.ts", import.meta.url).href
)) as {
  DEFAULT_CITATION_CONFIG: CitationConfig;
  matchesGlob: (pattern: string, path: string) => boolean;
  matchesAny: (globs: string[], path: string) => boolean;
  classifyPathAgainstRoots: (config: CitationConfig, path: string) => RootClassification;
  extractCitations: (text: string) => CitationToken[];
  splitLines: (body: string) => string[];
  computeQuotedRanges: (body: string) => Array<[number, number]>;
  filesystemTargetReader: (repoRoot: string) => TargetReader;
  gitTargetReader: (cwd: string, rev: string) => TargetReader;
  readGitBlob: (cwd: string, rev: string, path: string) => GitObjectRead;
  gitObjectType: (
    cwd: string,
    rev: string,
    path: string,
  ) => { kind: "type"; type: string } | { kind: "missing" } | { kind: "error"; reason: string };
  resolveCitation: (
    config: CitationConfig,
    token: CitationToken,
    readTarget: TargetReader,
  ) => CitationResolution;
  analyzeDocument: (
    config: CitationConfig,
    body: string,
    relativePath: string,
    touched: { kind: "all" } | { kind: "ranges"; ranges: Array<[number, number]> },
    readTarget: TargetReader,
  ) =>
    | {
        kind: "analyzed";
        analysis: {
          substantiveCount: number;
          totalNonQuoted: number;
          resolved: number;
          selfResolved: number;
          unverifiableExternal: number;
          unresolvedDetails: string[];
        };
      }
    | { kind: "read-error"; path: string; reason: string };
  findAmbiguousGlobs: (config: CitationConfig) => { glob: string; roots: string[] }[];
  findOrphanCitationRequired: (config: CitationConfig) => string[];
  runCitationsGate: (options: {
    cwd: string;
    base?: string;
    head?: string;
    config?: CitationConfig;
  }) => GateResultFields;
  listConfiguredDocuments: (repoRoot: string, config?: CitationConfig, startDir?: string) => string[];
  inventoryDeliveryTree: (
    repoRoot: string,
    config?: CitationConfig,
    startDir?: string,
  ) => { path: string; total: number; resolved: number; unresolved: number; unverifiableExternal: number }[];
};

const {
  DEFAULT_CITATION_CONFIG,
  matchesGlob,
  matchesAny,
  classifyPathAgainstRoots,
  extractCitations,
  splitLines,
  computeQuotedRanges,
  filesystemTargetReader,
  gitTargetReader,
  readGitBlob,
  gitObjectType,
  resolveCitation,
  analyzeDocument,
  findAmbiguousGlobs,
  findOrphanCitationRequired,
  runCitationsGate,
  listConfiguredDocuments,
  inventoryDeliveryTree,
} = citationsModule;

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const citationsEntry = fileURLToPath(new URL("../src/gates/citations.ts", import.meta.url));
const repoReadTarget = filesystemTargetReader(repoRoot);

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Citation Test",
  GIT_AUTHOR_EMAIL: "citation-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Citation Test",
  GIT_COMMITTER_EMAIL: "citation-test@tiphys.invalid",
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-citations-"));
}

function git(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function commit(cwd: string, message: string): string {
  const add = git(cwd, ["add", "-A"]);
  assert.equal(add.status, 0, `git add failed: ${add.stderr}`);
  const made = git(cwd, ["commit", "-m", message, "--allow-empty"]);
  assert.equal(made.status, 0, `git commit failed: ${made.stderr}`);
  const sha = git(cwd, ["rev-parse", "HEAD"]);
  assert.equal(sha.status, 0);
  return sha.stdout.trim();
}

function initRepo(dir: string): void {
  const init = git(dir, ["init", "-q"]);
  assert.equal(init.status, 0, `git init failed: ${init.stderr}`);
}

function runGateCli(
  args: string[],
  cwd: string,
): { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [citationsEntry, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 15_000,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function mkfifo(path: string): void {
  const made = spawnSync("mkfifo", [path], { encoding: "utf8" });
  assert.equal(made.status, 0, `mkfifo ${path} failed: ${made.stderr}`);
}

function readResult(path: string): GateResultFields {
  return JSON.parse(readFileSync(path, "utf8")) as GateResultFields;
}

/* ------------------------------------------------------------------ */
/* Glob matching, root classification (CR-1022)                         */
/* ------------------------------------------------------------------ */

test("matchesGlob supports literal segments, single-segment * and multi-segment **", () => {
  assert.equal(matchesGlob("src/**", "src/gates/citations.ts"), true);
  assert.equal(matchesGlob("src/**", "src"), true);
  assert.equal(matchesGlob("src/**", "source/x.ts"), false);
  assert.equal(matchesGlob("bin/fm-*.sh", "bin/fm-lock.sh"), true);
  assert.equal(matchesGlob("bin/fm-*.sh", "bin/tiphys.ts"), false);
  assert.equal(matchesGlob("bin/*.ts", "bin/tiphys.ts"), true);
  assert.equal(matchesGlob("bin/*.ts", "bin/fm-lock.sh"), false);
  assert.equal(matchesGlob("delivery/plan/**/*.md", "delivery/plan/kernel-plan-v1.md"), true);
  assert.equal(matchesGlob("*.md", "README.md"), true);
  assert.equal(matchesGlob("*.md", "delivery/STATE.md"), false);
});

test("classifyPathAgainstRoots checks every root and never returns on the first match (CR-1022)", () => {
  assert.deepEqual(
    classifyPathAgainstRoots(DEFAULT_CITATION_CONFIG, "bin/fm-lock.sh"),
    { kind: "external", root: "firstmate" },
  );
  assert.deepEqual(
    classifyPathAgainstRoots(DEFAULT_CITATION_CONFIG, "bin/tiphys.ts"),
    { kind: "local", root: "kernel" },
  );
  assert.deepEqual(
    classifyPathAgainstRoots(DEFAULT_CITATION_CONFIG, "not/a/configured/area.txt"),
    { kind: "unmatched" },
  );
  // The realistic ambiguity CR-1022 named: a NEW external root whose glob
  // overlaps an existing local one for a concrete path. Caught, not
  // silently resolved by declaration order.
  const overlapping: CitationConfig = {
    version: 1,
    roots: [{ name: "kernel", match: ["src/**"] }],
    externalRoots: [{ name: "other", match: ["src/gates/*.ts"] }],
    documents: ["delivery/plan/**/*.md"],
    citationRequired: [],
  };
  const ambiguous = classifyPathAgainstRoots(overlapping, "src/gates/run.ts");
  assert.equal(ambiguous.kind, "ambiguous");
  assert.deepEqual((ambiguous as { roots: string[] }).roots, ["kernel", "other"]);
  // A path outside the overlap still resolves cleanly (the ambiguity is
  // per concrete path, not a blanket refusal of the whole config).
  assert.deepEqual(classifyPathAgainstRoots(overlapping, "src/task.ts"), { kind: "local", root: "kernel" });
});

test("the shipped default config's local and external match lists are disjoint (CR-1022's structural fix)", () => {
  assert.deepEqual(findAmbiguousGlobs(DEFAULT_CITATION_CONFIG), []);
  // Every real file this checkout ships in bin/ classifies unambiguously.
  assert.deepEqual(
    classifyPathAgainstRoots(DEFAULT_CITATION_CONFIG, "bin/tiphys.ts"),
    { kind: "local", root: "kernel" },
  );
});

test("a glob declared under two DIFFERENT local roots is a config error (findAmbiguousGlobs, unchanged mechanism)", () => {
  const config: CitationConfig = {
    version: 1,
    roots: [
      { name: "kernel-a", match: ["src/**"] },
      { name: "kernel-b", match: ["src/**"] },
    ],
    externalRoots: [],
    documents: ["delivery/plan/**/*.md"],
    citationRequired: [],
  };
  const ambiguous = findAmbiguousGlobs(config);
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0]?.glob, "src/**");
});

/* ------------------------------------------------------------------ */
/* Grammar: recognition, and the malformed / fabrication hardening      */
/* (CR-1019, CR-1023, CR-1024, CR-1025)                                  */
/* ------------------------------------------------------------------ */

test("extractCitations recognizes path:line, path:start-end, and a valid content-hash suffix", () => {
  const text =
    "See src/cli.ts:1 and bin/fm-lock.sh:47-85, plus " +
    "src/task.ts:118-149@sha256:" + "a".repeat(64) + " for detail.";
  const tokens = extractCitations(text);
  assert.equal(tokens.length, 3);
  assert.equal(tokens[0]?.path, "src/cli.ts");
  assert.equal(tokens[0]?.startLine, 1);
  assert.equal(tokens[1]?.path, "bin/fm-lock.sh");
  assert.equal(tokens[1]?.startLine, 47);
  assert.equal(tokens[1]?.endLine, 85);
  assert.equal(tokens[2]?.hash, "a".repeat(64));
  assert.equal(tokens[2]?.hashMalformed, false);
  for (const token of tokens) {
    assert.equal(token.trailingMalformed, undefined);
  }
});

test("leading zeros in the line/range numbers are an intentional, documented relaxation (CR-1025)", () => {
  const tokens = extractCitations("src/ten.ts:007 and src/ten.ts:0003-0005");
  assert.equal(tokens[0]?.startLine, 7);
  assert.equal(tokens[1]?.startLine, 3);
  assert.equal(tokens[1]?.endLine, 5);
});

test("a malformed @sha256 suffix (wrong case, wrong length) is captured but flagged malformed, never silently dropped (CR-1019)", () => {
  const upper = extractCitations(`src/ten.ts:1@sha256:${"A".repeat(64)}`)[0] as CitationToken;
  assert.equal(upper.hash, undefined);
  assert.equal(upper.hashMalformed, true);
  assert.match(upper.raw, /@sha256:A{64}/);

  const truncated = extractCitations(`src/ten.ts:1@sha256:${"a".repeat(63)}`)[0] as CitationToken;
  assert.equal(truncated.hash, undefined);
  assert.equal(truncated.hashMalformed, true);
});

test("a malformed trailing continuation is flagged rather than silently narrowed (CR-1024)", () => {
  const dangling = extractCitations("src/ten.ts:3- end")[0] as CitationToken;
  assert.equal(dangling.endLine, 3);
  assert.equal(dangling.trailingMalformed, "-");
  assert.equal(dangling.raw, "src/ten.ts:3-");

  const decimal = extractCitations("src/ten.ts:3.5 end")[0] as CitationToken;
  assert.equal(decimal.trailingMalformed, ".5");

  // An ordinary sentence-ending period is NOT flagged.
  const sentence = extractCitations("see src/cli.ts:1. Next sentence.")[0] as CitationToken;
  assert.equal(sentence.trailingMalformed, undefined);
  // Ordinary closing punctuation is not flagged either.
  const parenthesized = extractCitations("(see src/cli.ts:1)")[0] as CitationToken;
  assert.equal(parenthesized.trailingMalformed, undefined);
});

test("a token cannot be fabricated by resuming a match after a colon, backslash, or a non-ASCII letter (CR-1023)", () => {
  assert.deepEqual(extractCitations("src/wei:rd.ts:2"), []);
  assert.deepEqual(extractCitations("src\\ten.ts:3"), []);
  // Cyrillic "es" (U+0441) immediately before "li.ts:1"; written as an
  // escape so this authored file itself stays pure ASCII (CLAUDE.md).
  assert.deepEqual(extractCitations("src/\u0441li.ts:1"), []);
});

test("a content hash strips trailing carriage returns before hashing, so CRLF and LF checkouts of the same content agree (CR-1026)", () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    const lfPath = join(dir, "src", "lf.ts");
    writeFileSync(lfPath, "a\nb\nc\n");
    const digest = createHash("sha256").update("a\nb", "utf8").digest("hex");
    const token = extractCitations(`src/lf.ts:1-2@sha256:${digest}`)[0] as CitationToken;
    const reader = filesystemTargetReader(dir);
    const lfOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, token, reader);
    assert.equal(lfOutcome.kind, "resolved", JSON.stringify(lfOutcome));

    const crlfPath = join(dir, "src", "crlf.ts");
    writeFileSync(crlfPath, "a\r\nb\r\nc\r\n");
    const crlfToken = extractCitations(`src/crlf.ts:1-2@sha256:${digest}`)[0] as CitationToken;
    const crlfOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, crlfToken, reader);
    assert.equal(crlfOutcome.kind, "resolved", JSON.stringify(crlfOutcome));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M2-D-22: quoted vs made                                               */
/* ------------------------------------------------------------------ */

test("a citation inside a backtick span or a fenced code block is quoted, not made, and is excluded from analysis (M2-D-22)", () => {
  const body = [
    "made: src/cli.ts:1",
    "quoted inline: `src/nope.ts:1`",
    "fenced:",
    "```",
    "src/nope2.ts:1",
    "```",
    "made again: src/task.ts:1",
  ].join("\n");
  const ranges = computeQuotedRanges(body);
  const tokens = extractCitations(body);
  const quotedPaths = tokens
    .filter((t) => ranges.some(([s, e]) => t.offset >= s && t.offset < e))
    .map((t) => t.path);
  const madePaths = tokens
    .filter((t) => !ranges.some(([s, e]) => t.offset >= s && t.offset < e))
    .map((t) => t.path);
  assert.deepEqual(quotedPaths.sort(), ["src/nope.ts", "src/nope2.ts"]);
  assert.deepEqual(madePaths.sort(), ["src/cli.ts", "src/task.ts"]);
});

test("a document that both MAKES and QUOTES a bad citation reds only on the made one (arbitration's red witness)", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "target.ts"), "a\nb\nc\n");
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "baseline\n");
    const base = commit(dir, "base");
    const body = [
      "made (real, resolves): src/target.ts:1",
      "made (bad, must red): src/does-not-exist-made.ts:1",
      "quoted (bad, must NOT red): `src/does-not-exist-quoted.ts:1`",
    ].join("\n");
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), body);
    const head = commit(dir, "head");
    const fields = runCitationsGate({ cwd: dir, base, head });
    assert.equal(fields.status, "red");
    assert.match(fields.detail, /does-not-exist-made\.ts/);
    assert.doesNotMatch(fields.detail, /does-not-exist-quoted\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criteria 1-3: line, range, hash resolution against real repo files   */
/* ------------------------------------------------------------------ */

test("a citation to an existing line is resolved, past the file's line count is unresolved naming the count, and a missing file is unresolved naming it", () => {
  const cliPath = join(repoRoot, "src", "cli.ts");
  const lineCount = splitLines(readFileSync(cliPath, "utf8")).length;
  assert.ok(lineCount > 0);

  const good = extractCitations("src/cli.ts:1")[0] as CitationToken;
  assert.equal(resolveCitation(DEFAULT_CITATION_CONFIG, good, repoReadTarget).kind, "resolved");

  const pastEnd = extractCitations(`src/cli.ts:${String(lineCount + 1)}`)[0] as CitationToken;
  const pastEndOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, pastEnd, repoReadTarget);
  assert.equal(pastEndOutcome.kind, "unresolved");
  assert.match((pastEndOutcome as { detail: string }).detail, new RegExp(String(lineCount)));

  const missing = extractCitations("src/nope.ts:1")[0] as CitationToken;
  const missingOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, missing, repoReadTarget);
  assert.equal(missingOutcome.kind, "unresolved");
  assert.match((missingOutcome as { detail: string }).detail, /src\/nope\.ts/);
});

test("a range inside the file is resolved and a range whose end exceeds the file is unresolved naming the end line", () => {
  const cliPath = join(repoRoot, "src", "cli.ts");
  const lineCount = splitLines(readFileSync(cliPath, "utf8")).length;
  assert.ok(lineCount >= 40);

  const inRange = extractCitations("src/cli.ts:12-40")[0] as CitationToken;
  assert.equal(resolveCitation(DEFAULT_CITATION_CONFIG, inRange, repoReadTarget).kind, "resolved");

  const beyond = extractCitations(`src/cli.ts:12-${String(lineCount + 1)}`)[0] as CitationToken;
  const beyondOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, beyond, repoReadTarget);
  assert.equal(beyondOutcome.kind, "unresolved");
  assert.match((beyondOutcome as { detail: string }).detail, new RegExp(String(lineCount)));
});

test("a citation with a matching content hash is resolved, and one character of drift is unresolved", () => {
  const cliPath = join(repoRoot, "src", "cli.ts");
  const lines = splitLines(readFileSync(cliPath, "utf8"));
  assert.ok(lines.length >= 5);
  const cited = lines.slice(0, 5).join("\n");
  const digest = createHash("sha256").update(cited, "utf8").digest("hex");

  const good = extractCitations(`src/cli.ts:1-5@sha256:${digest}`)[0] as CitationToken;
  assert.equal(resolveCitation(DEFAULT_CITATION_CONFIG, good, repoReadTarget).kind, "resolved");

  const flippedChar = digest[0] === "0" ? "1" : "0";
  const wrongDigest = flippedChar + digest.slice(1);
  const bad = extractCitations(`src/cli.ts:1-5@sha256:${wrongDigest}`)[0] as CitationToken;
  const badOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, bad, repoReadTarget);
  assert.equal(badOutcome.kind, "unresolved");
  assert.match((badOutcome as { detail: string }).detail, /content hash mismatch/);
});

/* ------------------------------------------------------------------ */
/* Criterion 4: the real firstmate root-matching case, both directions   */
/* ------------------------------------------------------------------ */

test("against the real text of kernel-plan-v1.md, the firstmate external root classifies bin/fm-* citations as unverifiable-external, and removing the root reds them against this repo's own bin/", () => {
  const planPath = join(repoRoot, "delivery", "plan", "kernel-plan-v1.md");
  const body = readFileSync(planPath, "utf8");
  const firstmateTokens = extractCitations(body).filter((token) => token.path.startsWith("bin/fm-"));
  assert.ok(firstmateTokens.length >= 5);

  for (const token of firstmateTokens) {
    const outcome = resolveCitation(DEFAULT_CITATION_CONFIG, token, repoReadTarget);
    assert.equal(outcome.kind, "unverifiable-external");
    assert.equal((outcome as { root: string }).root, "firstmate");
  }

  const withoutFirstmate: CitationConfig = { ...DEFAULT_CITATION_CONFIG, externalRoots: [] };
  for (const token of firstmateTokens) {
    const outcome = resolveCitation(withoutFirstmate, token, repoReadTarget);
    assert.equal(outcome.kind, "unresolved");
    assert.match((outcome as { detail: string }).detail, /matches no declared root/);
  }
});

/* ------------------------------------------------------------------ */
/* CR-1017 / CR-1018 / CR-1021: reads pinned to the --head git object    */
/* ------------------------------------------------------------------ */

test("--head selects the CONTENT judged, not only the file list: a broken rev reds even with a fixed working tree (CR-1017's decisive witness)", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "fleet.ts"), "l1\n");
    const base = commit(dir, "base");
    writeFileSync(join(dir, "delivery", "plan", "rev.md"), "cites src/does-not-exist-anywhere.ts:1\n");
    const broken = commit(dir, "broken");
    writeFileSync(join(dir, "delivery", "plan", "rev.md"), "cites src/fleet.ts:1\n");
    const fixed = commit(dir, "fixed");

    const a = runCitationsGate({ cwd: dir, base, head: fixed });
    assert.equal(a.status, "green");

    // B: --head names the BROKEN revision. The working tree is UNCHANGED
    // (still at `fixed`'s content). A gate reading the working tree would
    // wrongly report green here; this one must judge `broken` and RED.
    const b = runCitationsGate({ cwd: dir, base, head: broken });
    assert.equal(b.status, "red", JSON.stringify(b));
    assert.match(b.detail, /does-not-exist-anywhere/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a FIFO placed in the working tree at a diff-named path is IGNORED: content is read from the git object, never blocked or misread (M2-C-6, git-object substrate)", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "target.ts"), "a\nb\nc\n");
    const base = commit(dir, "base");
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "cites src/target.ts:1\n");
    const head = commit(dir, "head");

    const evidenceOne = join(dir, "ev-1");
    mkdirSync(evidenceOne, { recursive: true });
    const resultOne = join(evidenceOne, "result.json");
    const one = runGateCli(["--result", resultOne, "--evidence", evidenceOne, "--base", base, "--head", head], dir);
    assert.equal(one.signal, null);
    assert.equal(readResult(resultOne).status, "green");

    const targetPath = join(dir, "delivery", "plan", "fixture.md");
    rmSync(targetPath);
    mkfifo(targetPath);
    const evidenceTwo = join(dir, "ev-2");
    mkdirSync(evidenceTwo, { recursive: true });
    const resultTwo = join(evidenceTwo, "result.json");
    const two = runGateCli(["--result", resultTwo, "--evidence", evidenceTwo, "--base", base, "--head", head], dir);
    assert.equal(two.signal, null, "must RETURN rather than block on the working-tree FIFO");
    const recordTwo = readResult(resultTwo);
    // Immune, not merely refused: the gate never looks at the FIFO at all,
    // so it reads head's real blob content and is GREEN, exactly like the
    // run before the FIFO was staged.
    assert.equal(recordTwo.status, "green", JSON.stringify(recordTwo));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("citing a path that is a git TREE (directory), not a blob, at the reviewed revision is error naming the object type and returns (M2-C-6's mechanism restated for git objects)", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src", "weird.ts"), { recursive: true });
    writeFileSync(join(dir, "src", "weird.ts", "inner.txt"), "x\n");
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "baseline\n");
    const base = commit(dir, "base");
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "cites a directory: src/weird.ts:1\n");
    const head = commit(dir, "head");

    const evidence = join(dir, "ev");
    mkdirSync(evidence, { recursive: true });
    const resultPath = join(evidence, "result.json");
    const result = runGateCli(["--result", resultPath, "--evidence", evidence, "--base", base, "--head", head], dir);
    assert.equal(result.signal, null);
    const record = readResult(resultPath);
    assert.equal(record.status, "error");
    assert.match(record.detail, /src\/weird\.ts/);
    assert.match(record.detail, /tree/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readGitBlob and gitObjectType are the one answer to whether a git path may be read as content", () => {
  assert.deepEqual(gitObjectType(repoRoot, "HEAD", "src"), { kind: "type", type: "tree" });
  assert.deepEqual(gitObjectType(repoRoot, "HEAD", "src/cli.ts"), { kind: "type", type: "blob" });
  assert.deepEqual(gitObjectType(repoRoot, "HEAD", "src/does-not-exist-xyz.ts"), { kind: "missing" });
  const dirRead = readGitBlob(repoRoot, "HEAD", "src");
  assert.equal(dirRead.kind, "irregular");
  assert.match((dirRead as { reason: string }).reason, /tree/);
});

test("a path traversal citation never escapes the checkout: git's tree model has no '..' entry to walk (CR-1018, verified against a real outside file)", () => {
  const dir = scratch();
  const parent = join(dir, "..");
  const outsideMarker = `outside-marker-${String(Date.now())}.md`;
  const outsidePath = join(parent, outsideMarker);
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "real.ts"), "a\nb\nc\n");
    writeFileSync(outsidePath, "SECRET OUTSIDE CONTENT\nline two\nline three\n");
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "baseline, no citations yet\n");
    const base = commit(dir, "base");
    // Both citation lines are genuinely NEW content in this commit (not a
    // mere shift of unchanged lines), so both land inside the diff's hunk
    // and are in scope under M2-D-21.
    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      `traversal: src/../../${outsideMarker.replace(".md", ".ts")}:1\nreal: src/real.ts:1\n`,
    );
    const head = commit(dir, "head");
    const fields = runCitationsGate({ cwd: dir, base, head });
    // The traversal citation must never resolve GREEN against the outside
    // file, and must never inflate units beyond the one real citation.
    assert.equal(fields.status, "red", JSON.stringify(fields));
    assert.match(fields.detail, /does not exist/);
    assert.equal(fields.units, 1, "units must count only the real citation, never the escaped one");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outsidePath, { force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M2-D-21: hunk scope, both directions                                  */
/* ------------------------------------------------------------------ */

test("a pre-existing bad citation the PR does not touch is never the PR's failure (M2-D-21, dissolves CR-1016)", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "baseline\n");
    const base = commit(dir, "base");
    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      "baseline\nPre-existing bad citation: src/does-not-exist.ts:1\n",
    );
    const withBad = commit(dir, "with-bad");
    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      "baseline\nPre-existing bad citation: src/does-not-exist.ts:1\nan unrelated new line\n",
    );
    const unrelatedEdit = commit(dir, "unrelated-edit");

    const fields = runCitationsGate({ cwd: dir, base: withBad, head: unrelatedEdit });
    assert.notEqual(fields.status, "red", JSON.stringify(fields));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("touching the SAME line as a bad citation reds it (M2-D-21's other direction)", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "baseline\n");
    const base = commit(dir, "base");
    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      "baseline\nPre-existing bad citation: src/does-not-exist.ts:1\n",
    );
    const withBad = commit(dir, "with-bad");
    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      "baseline\nPre-existing bad citation: src/does-not-exist.ts:1 (touched now)\n",
    );
    const touched = commit(dir, "touched");

    const fields = runCitationsGate({ cwd: dir, base: withBad, head: touched });
    assert.equal(fields.status, "red", JSON.stringify(fields));
    assert.match(fields.detail, /does-not-exist\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a newly added document's citations are entirely in scope (a new file's whole content is 'this PR')", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "target.ts"), "a\nb\n");
    const base = commit(dir, "base");
    writeFileSync(join(dir, "delivery", "plan", "brand-new.md"), "cites src/target.ts:1\n");
    const head = commit(dir, "add-new-file");
    const fields = runCitationsGate({ cwd: dir, base, head });
    assert.equal(fields.status, "green");
    assert.equal(fields.units, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* CR-1020: the vacuous guard excludes quoted and self-referential       */
/* citations; three directions plus the self-citation and external-only */
/* dispositions                                                          */
/* ------------------------------------------------------------------ */

test("a citationRequired document with zero citations is red, the same document with one valid citation is green, and a configured non-required document with zero citations is not red", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "target.ts"), "line one\nline two\nline three\n");
    writeFileSync(join(dir, "delivery", "STATE.md"), "initial state\n");
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "no citations here at all\n");
    const base = commit(dir, "base");

    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      "no citations here at all, still none after this edit\n",
    );
    const headZero = commit(dir, "head-zero-citations");
    const zeroFields = runCitationsGate({ cwd: dir, base, head: headZero });
    assert.equal(zeroFields.status, "red");
    assert.match(zeroFields.detail, /zero substantive citations/);

    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      "cites src/target.ts:1 for real this time\n",
    );
    const headOne = commit(dir, "head-one-citation");
    const oneFields = runCitationsGate({ cwd: dir, base: headZero, head: headOne });
    assert.equal(oneFields.status, "green");
    assert.equal(oneFields.units, 1);

    writeFileSync(join(dir, "delivery", "STATE.md"), "state changed, no citations\n");
    const headState = commit(dir, "head-state-only");
    const stateFields = runCitationsGate({ cwd: dir, base: headOne, head: headState });
    assert.notEqual(stateFields.status, "red");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a document that cites only itself does not satisfy the vacuous guard (CR-1020)", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    writeFileSync(join(dir, "delivery", "plan", "self.md"), "placeholder\n");
    const base = commit(dir, "base");
    writeFileSync(join(dir, "delivery", "plan", "self.md"), "delivery/plan/self.md:1 is this line.\n");
    const head = commit(dir, "self-cite");
    const fields = runCitationsGate({ cwd: dir, base, head });
    assert.equal(fields.status, "red", JSON.stringify(fields));
    assert.match(fields.detail, /zero substantive citations/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a citationRequired document citing only an external root verifies nothing and reaches not-applicable, not red (disposition unchanged; the required/not-applicable policy question is escalated, not this gate's to answer)", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    writeFileSync(join(dir, "delivery", "plan", "ext.md"), "placeholder\n");
    const base = commit(dir, "base");
    writeFileSync(join(dir, "delivery", "plan", "ext.md"), "cites bin/fm-lock.sh:1-5\n");
    const head = commit(dir, "external-only");
    const fields = runCitationsGate({ cwd: dir, base, head });
    assert.equal(fields.status, "not-applicable", JSON.stringify(fields));
    assert.notEqual(fields.status, "red");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Orchestrator scope decision (2026-08-07): the gate governs FORWARD-      */
/* claiming docs, not the historical RECORD. delivery/review/** and         */
/* delivery/work-history/** are records whose citations were valid when     */
/* written and drift (bare filenames, ranges, reviewer shorthand); they are */
/* no longer configured documents. The class has TWO structurally different */
/* members (review, work-history), and the co-located forward doc proves    */
/* the gate is scoped, not gutted. Rationale and the 139-reason measured    */
/* evidence: delivery/work-history/m2-citations-scope.md.                    */
/* ------------------------------------------------------------------ */

test("a record doc (delivery/review, delivery/work-history) carrying an unresolving MADE citation is not gated (not-applicable, not red), while an identical forward doc still reds", () => {
  // First, anchor the resolution mechanism to REAL external-program output.
  // src/gates/citations.ts resolves a MADE citation by spawning
  // `git cat-file -t <rev>:<path>`; this witness covers that spawning module,
  // so red-witness rule (f) requires a real capture and the assertions must
  // consume it, not a hand-written string (CLAUDE.md warning 10). The capture
  // records that a present path returns exit 0 / "blob" and an absent path
  // exits 128 with "does not exist"; a live scratch repo must reproduce it.
  const captureName = "citation-git-cat-file-resolution.txt";
  const captured = readFileSync(
    join(repoRoot, "witness", "captures", captureName),
    "utf8",
  );
  assert.match(captured, /present-path:.*\n\s*exit 0\n\s*stdout: blob/);
  assert.match(captured, /absent-path:.*\n\s*exit 128/);
  assert.match(captured, /stderr: fatal: path 'src\/nope\.ts' does not exist/);
  {
    const probe = scratch();
    try {
      initRepo(probe);
      mkdirSync(join(probe, "src"), { recursive: true });
      writeFileSync(join(probe, "src", "real.ts"), "a\nb\nc\n");
      const rev = commit(probe, "probe base");
      const present = git(probe, ["cat-file", "-t", `${rev}:src/real.ts`]);
      assert.equal(present.status, 0, `present path: ${present.stderr}`);
      assert.equal(present.stdout.trim(), "blob", "captured contract: present path is a blob");
      const absent = git(probe, ["cat-file", "-t", `${rev}:src/nope.ts`]);
      assert.equal(absent.status, 128, `absent path exit: ${absent.stdout}`);
      assert.match(
        absent.stderr,
        /does not exist/,
        `captured contract: absent path errors, live git said: ${absent.stderr}`,
      );
    } finally {
      rmSync(probe, { recursive: true, force: true });
    }
  }

  // Two structurally different record members, one dangerous shape each: a
  // MADE citation that does not resolve at head. Under the pre-exclusion
  // config both reddened; under the new scope neither is a configured
  // document, so the diff touches nothing gated and reaches not-applicable.
  for (const recordDir of ["review", "work-history"]) {
    const dir = scratch();
    try {
      initRepo(dir);
      mkdirSync(join(dir, "delivery", recordDir), { recursive: true });
      writeFileSync(join(dir, "delivery", recordDir, "rec.md"), "placeholder\n");
      const base = commit(dir, "base");
      writeFileSync(
        join(dir, "delivery", recordDir, "rec.md"),
        "examined src/nope.ts:999 at the time this was written\n",
      );
      const head = commit(dir, "record-with-drifted-citation");
      const fields = runCitationsGate({ cwd: dir, base, head });
      assert.equal(fields.status, "not-applicable", `${recordDir}: ${JSON.stringify(fields)}`);
      assert.notEqual(fields.status, "red", `${recordDir} must not red`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // The gate is scoped, not gutted: the SAME dangerous shape in a forward-
  // claiming doc (delivery/plan, still configured and citationRequired) reds.
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    writeFileSync(join(dir, "delivery", "plan", "fwd.md"), "placeholder\n");
    const base = commit(dir, "base");
    writeFileSync(
      join(dir, "delivery", "plan", "fwd.md"),
      "claims src/nope.ts:999 resolves at head\n",
    );
    const head = commit(dir, "forward-with-bad-citation");
    const fields = runCitationsGate({ cwd: dir, base, head });
    assert.equal(fields.status, "red", JSON.stringify(fields));
    assert.match(fields.detail, /src\/nope\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a diff touching no configured document is not-applicable naming zero matched paths", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    writeFileSync(join(dir, "notes.txt"), "hello\n");
    const base = commit(dir, "base");
    writeFileSync(join(dir, "notes.txt"), "hello again\n");
    const head = commit(dir, "head");
    const fields = runCitationsGate({ cwd: dir, base, head });
    assert.equal(fields.status, "not-applicable");
    assert.equal(fields.units, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* The one-shot inventory: reuses analyzeDocument, filesystem read       */
/* strategy, still fail-closed on a non-regular filesystem entry.       */
/* ------------------------------------------------------------------ */

test("listConfiguredDocuments and inventoryDeliveryTree walk a fixture tree and report per-document counts using the same analysis the standing gate uses", () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "delivery", "verification"), { recursive: true });
    mkdirSync(join(dir, "delivery", "decisions"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "target.ts"), "a\nb\nc\n");
    writeFileSync(join(dir, "delivery", "plan", "a.md"), "cites src/target.ts:1\n");
    writeFileSync(join(dir, "delivery", "verification", "b.md"), "cites src/target.ts:99 (out of range)\n");
    writeFileSync(join(dir, "delivery", "decisions", "c.md"), "no citations, decisions are not required\n");
    writeFileSync(join(dir, "delivery", "STATE.md"), "no citations, legitimately\n");

    const documents = listConfiguredDocuments(dir);
    assert.deepEqual(documents, [
      "delivery/STATE.md",
      "delivery/decisions/c.md",
      "delivery/plan/a.md",
      "delivery/verification/b.md",
    ]);

    const rows = inventoryDeliveryTree(dir);
    const byPath = new Map(rows.map((row) => [row.path, row]));
    assert.deepEqual(byPath.get("delivery/plan/a.md"), {
      path: "delivery/plan/a.md",
      total: 1,
      resolved: 1,
      unresolved: 0,
      unverifiableExternal: 0,
    });
    assert.deepEqual(byPath.get("delivery/verification/b.md"), {
      path: "delivery/verification/b.md",
      total: 1,
      resolved: 0,
      unresolved: 1,
      unverifiableExternal: 0,
    });
    assert.deepEqual(byPath.get("delivery/decisions/c.md"), {
      path: "delivery/decisions/c.md",
      total: 0,
      resolved: 0,
      unresolved: 0,
      unverifiableExternal: 0,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the one-shot inventory excludes quoted citations from its counts (M2-D-22 applies uniformly)", () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "target.ts"), "a\nb\n");
    writeFileSync(
      join(dir, "delivery", "plan", "a.md"),
      "made: src/target.ts:1\nquoted: `src/does-not-exist.ts:1`\n",
    );
    const rows = inventoryDeliveryTree(dir);
    const row = rows.find((r) => r.path === "delivery/plan/a.md");
    assert.deepEqual(row, {
      path: "delivery/plan/a.md",
      total: 1,
      resolved: 1,
      unresolved: 0,
      unverifiableExternal: 0,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the one-shot inventory refuses loudly, naming the path and type, when a configured document is a named pipe", () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    const fifoPath = join(dir, "delivery", "plan", "fifo.md");
    mkfifo(fifoPath);
    assert.throws(() => inventoryDeliveryTree(dir), /is a named pipe, not a regular file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M2-C-3: --base absent is error; CLI usage errors                     */
/* ------------------------------------------------------------------ */

test("--base absent is error both through the library entry and through the CLI", () => {
  const dir = scratch();
  try {
    const fields = runCitationsGate({ cwd: dir });
    assert.equal(fields.status, "error");
    assert.match(fields.detail, /requires --base/);

    initRepo(dir);
    mkdirSync(join(dir, "delivery"), { recursive: true });
    writeFileSync(join(dir, "delivery", "STATE.md"), "x\n");
    const evidence = join(dir, "ev");
    mkdirSync(evidence, { recursive: true });
    const resultPath = join(evidence, "result.json");
    const cli = runGateCli(["--result", resultPath, "--evidence", evidence], dir);
    assert.notEqual(cli.status, 0);
    const record = readResult(resultPath);
    assert.equal(record.status, "error");
    assert.match(record.detail, /requires --base/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an invalid --base or --head ref is error naming the ref, never silently treated as absent", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery"), { recursive: true });
    writeFileSync(join(dir, "delivery", "STATE.md"), "x\n");
    commit(dir, "base");
    const fields = runCitationsGate({ cwd: dir, base: "not-a-real-ref-xyz" });
    assert.equal(fields.status, "error");
    assert.match(fields.detail, /--base/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI reports a usage error when --result or --evidence is missing", () => {
  const dir = scratch();
  try {
    const missingResult = runGateCli(["--evidence", dir, "--base", "x"], dir);
    assert.equal(missingResult.status, 64);
    assert.match(missingResult.stderr, /usage:/);

    const missingEvidence = runGateCli(["--result", join(dir, "r.json"), "--base", "x"], dir);
    assert.equal(missingEvidence.status, 64);
    assert.match(missingEvidence.stderr, /usage:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Unmatched-root, malformed-in-flow, and analyzeDocument bucketing      */
/* ------------------------------------------------------------------ */

test("a changed document citing a path under no declared root is red naming the citation", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "baseline\n");
    const base = commit(dir, "base");
    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      "cites scratch/not-configured.sh:1 which is nowhere declared\n",
    );
    const head = commit(dir, "head");
    const fields = runCitationsGate({ cwd: dir, base, head });
    assert.equal(fields.status, "red");
    assert.match(fields.detail, /scratch\/not-configured\.sh/);
    assert.match(fields.detail, /matches no declared root/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a malformed content-hash suffix reds end to end through the registered gate", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "target.ts"), "a\nb\nc\n");
    writeFileSync(join(dir, "delivery", "plan", "fixture.md"), "baseline\n");
    const base = commit(dir, "base");
    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      `cites src/target.ts:1@sha256:${"A".repeat(64)}\n`,
    );
    const head = commit(dir, "head");
    const fields = runCitationsGate({ cwd: dir, base, head });
    assert.equal(fields.status, "red", JSON.stringify(fields));
    assert.match(fields.detail, /malformed content-hash suffix/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyzeDocument separates resolved, self-resolved, unresolved and unverifiable-external counts, hunk-scoped by the touched parameter", () => {
  const config = DEFAULT_CITATION_CONFIG;
  const body = [
    "resolved: src/cli.ts:1",
    "external: bin/fm-lock.sh:47-85",
    "unmatched: nowhere/nope.sh:1",
  ].join("\n");
  const all = analyzeDocument(config, body, "delivery/plan/x.md", { kind: "all" }, repoReadTarget);
  assert.equal(all.kind, "analyzed");
  const a = (all as { kind: "analyzed"; analysis: { substantiveCount: number; totalNonQuoted: number; resolved: number; unverifiableExternal: number; unresolvedDetails: string[] } }).analysis;
  assert.equal(a.totalNonQuoted, 3);
  assert.equal(a.resolved, 1);
  assert.equal(a.unverifiableExternal, 1);
  assert.equal(a.unresolvedDetails.length, 1);

  // Scoped to line 1 only (the resolved citation): the other two lines are
  // out of scope and are not resolved at all, but STILL counted toward
  // substantiveCount (the whole-document vacuous question).
  const scoped = analyzeDocument(config, body, "delivery/plan/x.md", { kind: "ranges", ranges: [[1, 1]] }, repoReadTarget);
  const s = (scoped as { kind: "analyzed"; analysis: { substantiveCount: number; resolved: number; unverifiableExternal: number; unresolvedDetails: string[] } }).analysis;
  assert.equal(s.substantiveCount, 3);
  assert.equal(s.resolved, 1);
  assert.equal(s.unverifiableExternal, 0);
  assert.equal(s.unresolvedDetails.length, 0);
});

test("matchesAny is true when any glob in the list matches, and findOrphanCitationRequired is empty for the default config", () => {
  assert.equal(matchesAny(["src/**", "bin/**"], "bin/tiphys.ts"), true);
  assert.equal(matchesAny(["src/**"], "bin/tiphys.ts"), false);
  assert.deepEqual(findOrphanCitationRequired(DEFAULT_CITATION_CONFIG), []);
});

test("gitTargetReader reads the same content readGitBlob does, at a given rev", () => {
  const reader = gitTargetReader(repoRoot, "HEAD");
  const read = reader("src/cli.ts");
  assert.equal(read.kind, "blob");
  const direct = readGitBlob(repoRoot, "HEAD", "src/cli.ts");
  assert.deepEqual(read, direct);
});
