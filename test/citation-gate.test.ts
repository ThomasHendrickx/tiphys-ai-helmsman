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
 * linter"). Unit import through a computed URL: a literal relative import
 * from test/ into src/ crosses the project-reference boundary and fails the
 * build under rewriteRelativeImportExtensions (TS2878, CLAUDE.md warning 4).
 *
 * Every dangerous state staged below is the dangerous state, not the absent
 * feature (CLAUDE.md red-witness rule, strong form): the mkfifo is a real
 * named pipe, the ambiguous config is a real duplicate glob string, and the
 * hash mismatch is a real one-character mutation of a computed digest.
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
  offset: number;
}
type CitationResolution =
  | { kind: "resolved"; detail: string }
  | { kind: "unresolved"; detail: string }
  | { kind: "unverifiable-external"; root: string; detail: string }
  | { kind: "read-error"; path: string; reason: string };
type DocumentLint =
  | {
      kind: "linted";
      total: number;
      resolved: number;
      unverifiableExternal: number;
      unresolvedDetails: string[];
    }
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
  classifyPathAgainstRoots: (
    config: CitationConfig,
    path: string,
  ) => { kind: "external"; root: string } | { kind: "local"; root: string } | { kind: "unmatched" };
  extractCitations: (text: string) => CitationToken[];
  splitLines: (body: string) => string[];
  resolveCitation: (
    config: CitationConfig,
    repoRoot: string,
    token: CitationToken,
  ) => CitationResolution;
  lintDocumentBody: (config: CitationConfig, repoRoot: string, body: string) => DocumentLint;
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
  resolveCitation,
  lintDocumentBody,
  findAmbiguousGlobs,
  findOrphanCitationRequired,
  runCitationsGate,
  listConfiguredDocuments,
  inventoryDeliveryTree,
} = citationsModule;

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const citationsEntry = fileURLToPath(new URL("../src/gates/citations.ts", import.meta.url));

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
    timeout: 10_000,
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
/* Glob matching and root classification, the mechanism criterion 4/5   */
/* depend on                                                            */
/* ------------------------------------------------------------------ */

test("matchesGlob supports literal segments, single-segment * and multi-segment **", () => {
  assert.equal(matchesGlob("src/**", "src/gates/citations.ts"), true);
  // "**" matches zero or more whole segments, so "src/**" also matches "src"
  // itself; a DIFFERENT top segment is the negative case.
  assert.equal(matchesGlob("src/**", "src"), true);
  assert.equal(matchesGlob("src/**", "source/x.ts"), false);
  assert.equal(matchesGlob("bin/fm-*.sh", "bin/fm-lock.sh"), true);
  assert.equal(matchesGlob("bin/fm-*.sh", "bin/tiphys.ts"), false);
  assert.equal(matchesGlob("bin/fm-*.sh", "bin/nested/fm-lock.sh"), false);
  assert.equal(matchesGlob("delivery/plan/**/*.md", "delivery/plan/kernel-plan-v1.md"), true);
  assert.equal(
    matchesGlob("delivery/plan/**/*.md", "delivery/plan/phase-declarations/m2-p5.json"),
    false,
  );
  assert.equal(matchesGlob("*.md", "README.md"), true);
  assert.equal(matchesGlob("*.md", "delivery/STATE.md"), false);
});

test("classifyPathAgainstRoots matches external roots before local roots and reports unmatched otherwise", () => {
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
});

test("extractCitations recognizes path:line, path:start-end, and the content-hash suffix", () => {
  const text =
    "See src/cli.ts:1 and bin/fm-lock.sh:47-85, plus " +
    "src/task.ts:118-149@sha256:" + "a".repeat(64) + " for detail.";
  const tokens = extractCitations(text);
  assert.equal(tokens.length, 3);
  assert.equal(tokens[0]?.path, "src/cli.ts");
  assert.equal(tokens[0]?.startLine, 1);
  assert.equal(tokens[0]?.endLine, 1);
  assert.equal(tokens[1]?.path, "bin/fm-lock.sh");
  assert.equal(tokens[1]?.startLine, 47);
  assert.equal(tokens[1]?.endLine, 85);
  assert.equal(tokens[2]?.path, "src/task.ts");
  assert.equal(tokens[2]?.hash, "a".repeat(64));
});

/* ------------------------------------------------------------------ */
/* Criterion 1: three directions, against a real repository file        */
/* ------------------------------------------------------------------ */

test("a citation to an existing line is resolved, past the file's line count is unresolved naming the count, and a missing file is unresolved naming it", () => {
  const cliPath = join(repoRoot, "src", "cli.ts");
  const lineCount = splitLines(readFileSync(cliPath, "utf8")).length;
  assert.ok(lineCount > 0, "src/cli.ts must have at least one line for this fixture");

  const good = extractCitations(`src/cli.ts:1`)[0] as CitationToken;
  const goodOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, repoRoot, good);
  assert.equal(goodOutcome.kind, "resolved");

  const pastEnd = extractCitations(`src/cli.ts:${String(lineCount + 1)}`)[0] as CitationToken;
  const pastEndOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, repoRoot, pastEnd);
  assert.equal(pastEndOutcome.kind, "unresolved");
  assert.match((pastEndOutcome as { detail: string }).detail, new RegExp(String(lineCount)));

  const missing = extractCitations(`src/nope.ts:1`)[0] as CitationToken;
  const missingOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, repoRoot, missing);
  assert.equal(missingOutcome.kind, "unresolved");
  assert.match((missingOutcome as { detail: string }).detail, /src\/nope\.ts/);
});

/* ------------------------------------------------------------------ */
/* Criterion 2: ranges, both directions                                  */
/* ------------------------------------------------------------------ */

test("a range inside the file is resolved and a range whose end exceeds the file is unresolved naming the end line", () => {
  const cliPath = join(repoRoot, "src", "cli.ts");
  const lineCount = splitLines(readFileSync(cliPath, "utf8")).length;
  assert.ok(lineCount >= 40, "src/cli.ts must have at least 40 lines for this fixture");

  const inRange = extractCitations(`src/cli.ts:12-40`)[0] as CitationToken;
  const inRangeOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, repoRoot, inRange);
  assert.equal(inRangeOutcome.kind, "resolved");

  const beyond = extractCitations(`src/cli.ts:12-${String(lineCount + 1)}`)[0] as CitationToken;
  const beyondOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, repoRoot, beyond);
  assert.equal(beyondOutcome.kind, "unresolved");
  assert.match((beyondOutcome as { detail: string }).detail, new RegExp(String(lineCount)));
});

/* ------------------------------------------------------------------ */
/* Criterion 3: content-hash suffix, both directions                     */
/* ------------------------------------------------------------------ */

test("a citation with a matching content hash is resolved, and one character of drift is unresolved", () => {
  const cliPath = join(repoRoot, "src", "cli.ts");
  const lines = splitLines(readFileSync(cliPath, "utf8"));
  assert.ok(lines.length >= 5);
  const cited = lines.slice(0, 5).join("\n");
  const digest = createHash("sha256").update(cited, "utf8").digest("hex");

  const good = extractCitations(`src/cli.ts:1-5@sha256:${digest}`)[0] as CitationToken;
  const goodOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, repoRoot, good);
  assert.equal(goodOutcome.kind, "resolved");

  const flippedChar = digest[0] === "0" ? "1" : "0";
  const wrongDigest = flippedChar + digest.slice(1);
  assert.notEqual(wrongDigest, digest);
  const bad = extractCitations(`src/cli.ts:1-5@sha256:${wrongDigest}`)[0] as CitationToken;
  const badOutcome = resolveCitation(DEFAULT_CITATION_CONFIG, repoRoot, bad);
  assert.equal(badOutcome.kind, "unresolved");
  assert.match((badOutcome as { detail: string }).detail, /content hash mismatch/);
});

/* ------------------------------------------------------------------ */
/* Criterion 4: the real firstmate root-matching case, both directions   */
/* ------------------------------------------------------------------ */

test("against the real text of kernel-plan-v1.md, the firstmate external root classifies bin/fm-* citations as unverifiable-external, and removing the root reds them as unmatched", () => {
  const planPath = join(repoRoot, "delivery", "plan", "kernel-plan-v1.md");
  const body = readFileSync(planPath, "utf8");
  const firstmateTokens = extractCitations(body).filter((token) => token.path.startsWith("bin/fm-"));
  assert.ok(
    firstmateTokens.length >= 5,
    `expected several real bin/fm-*.sh citations in kernel-plan-v1.md, found ${String(firstmateTokens.length)}`,
  );

  for (const token of firstmateTokens) {
    const outcome = resolveCitation(DEFAULT_CITATION_CONFIG, repoRoot, token);
    assert.equal(
      outcome.kind,
      "unverifiable-external",
      `expected ${token.raw} to be unverifiable-external, got ${JSON.stringify(outcome)}`,
    );
    assert.equal((outcome as { root: string }).root, "firstmate");
  }

  // Removing the external root does NOT make these paths "unmatched": this
  // repository's own local "kernel" root declares "bin/**", exactly the real
  // collision the plan's grounding names (bin/fm-lock.sh vs this repo's own
  // bin/). Without the external root's precedence, the citation now
  // resolves LOCALLY against this checkout's bin/ and is red because the
  // named firstmate script genuinely does not exist there -- a stronger,
  // more realistic demonstration of "the same string resolves two ways"
  // than a generic "no root matched" would be.
  const withoutFirstmate: CitationConfig = { ...DEFAULT_CITATION_CONFIG, externalRoots: [] };
  for (const token of firstmateTokens) {
    const outcome = resolveCitation(withoutFirstmate, repoRoot, token);
    assert.equal(
      outcome.kind,
      "unresolved",
      `expected ${token.raw} to be unresolved (red) once the external root is removed, got ${JSON.stringify(outcome)}`,
    );
    assert.match((outcome as { detail: string }).detail, /cites a file that does not exist/);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5: an ambiguous glob is a config error, never guessed;      */
/* two structurally different reddening members (one witness rule)      */
/* ------------------------------------------------------------------ */

test("a glob declared under both an external and a local root is a config error naming the glob", () => {
  const config: CitationConfig = {
    version: 1,
    roots: [{ name: "kernel", match: ["bin/fm-*.sh"] }],
    externalRoots: [{ name: "firstmate", match: ["bin/fm-*.sh"] }],
    documents: ["delivery/plan/**/*.md"],
    citationRequired: [],
  };
  const ambiguous = findAmbiguousGlobs(config);
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0]?.glob, "bin/fm-*.sh");
  assert.deepEqual([...(ambiguous[0]?.roots ?? [])].sort(), ["firstmate", "kernel"]);

  const dir = scratch();
  try {
    const fields = runCitationsGate({ cwd: dir, base: "irrelevant", config });
    assert.equal(fields.status, "error");
    assert.match(fields.detail, /bin\/fm-\*\.sh/);
    assert.match(fields.detail, /more than one root/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a glob declared under two DIFFERENT local roots is also a config error (a second, structurally different member)", () => {
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
  assert.deepEqual([...(ambiguous[0]?.roots ?? [])].sort(), ["kernel-a", "kernel-b"]);
});

test("a config with no duplicate globs reports no ambiguity, and the default committed config is one of them", () => {
  assert.deepEqual(findAmbiguousGlobs(DEFAULT_CITATION_CONFIG), []);
  assert.deepEqual(findOrphanCitationRequired(DEFAULT_CITATION_CONFIG), []);
});

/* ------------------------------------------------------------------ */
/* Criterion 6: the narrowed vacuous guard, three directions             */
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

    // Direction 1: a citationRequired document (delivery/plan/**/*.md)
    // changes and still carries zero recognized citations: red.
    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      "no citations here at all, still none after this edit\n",
    );
    const headZero = commit(dir, "head-zero-citations");
    const zeroFields = runCitationsGate({ cwd: dir, base, head: headZero });
    assert.equal(zeroFields.status, "red");
    assert.match(zeroFields.detail, /zero recognized citations/);

    // Direction 2: the same document, now carrying one valid citation: green.
    writeFileSync(
      join(dir, "delivery", "plan", "fixture.md"),
      "cites src/target.ts:1 for real this time\n",
    );
    const headOne = commit(dir, "head-one-citation");
    const oneFields = runCitationsGate({ cwd: dir, base: headZero, head: headOne });
    assert.equal(oneFields.status, "green");
    assert.equal(oneFields.units, 1);

    // Direction 3: STATE.md is configured but not citationRequired; zero
    // citations there is recorded, never red.
    writeFileSync(join(dir, "delivery", "STATE.md"), "state changed, no citations\n");
    const headState = commit(dir, "head-state-only");
    const stateFields = runCitationsGate({ cwd: dir, base: headOne, head: headState });
    assert.notEqual(stateFields.status, "red");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* A gate-declared not-applicable when nothing local needed checking     */
/* (M2-C-2: a green record cannot carry zero units; documented in the    */
/* module next to runCitationsGate).                                     */
/* ------------------------------------------------------------------ */

test("a diff whose only changed documents are legitimately citation-free is not-applicable rather than a fabricated green or an unexplained red", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery"), { recursive: true });
    writeFileSync(join(dir, "delivery", "STATE.md"), "initial\n");
    const base = commit(dir, "base");
    writeFileSync(join(dir, "delivery", "STATE.md"), "updated, still no citations\n");
    const head = commit(dir, "head");
    const fields = runCitationsGate({ cwd: dir, base, head });
    assert.equal(fields.status, "not-applicable");
    assert.equal(fields.units, 0);
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
/* Criterion 7: the one-shot inventory mechanism (real run recorded in  */
/* the work history; this is the red/green witness for the WALK)        */
/* ------------------------------------------------------------------ */

test("listConfiguredDocuments and inventoryDeliveryTree walk a fixture tree and report per-document counts using the same lint logic the standing gate uses", () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "delivery", "review"), { recursive: true });
    mkdirSync(join(dir, "delivery", "decisions"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "target.ts"), "a\nb\nc\n");
    writeFileSync(join(dir, "delivery", "plan", "a.md"), "cites src/target.ts:1\n");
    writeFileSync(join(dir, "delivery", "review", "b.md"), "cites src/target.ts:99 (out of range)\n");
    writeFileSync(join(dir, "delivery", "decisions", "c.md"), "no citations, decisions are not required\n");
    writeFileSync(join(dir, "delivery", "STATE.md"), "no citations, legitimately\n");

    const documents = listConfiguredDocuments(dir);
    assert.deepEqual(documents, [
      "delivery/STATE.md",
      "delivery/decisions/c.md",
      "delivery/plan/a.md",
      "delivery/review/b.md",
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
    assert.deepEqual(byPath.get("delivery/review/b.md"), {
      path: "delivery/review/b.md",
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

test("the one-shot inventory refuses loudly, naming the path and type, when a configured document is a named pipe (RED without the probe: it would hang)", () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    const fifoPath = join(dir, "delivery", "plan", "fifo.md");
    mkfifo(fifoPath);
    assert.throws(
      () => inventoryDeliveryTree(dir),
      /is a named pipe, not a regular file/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 8 is the suite's own exit code and count, asserted by the  */
/* npm test invocation itself; nothing further is asserted here.        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Criterion 9: M2-C-6 over the walked corpus, both directions          */
/* ------------------------------------------------------------------ */

test("a named pipe at a path the diff names inside a configured documents root is error naming the path and type and returns, bounded by a harness timeout; the same path as a regular document lints normally", () => {
  const dir = scratch();
  try {
    initRepo(dir);
    mkdirSync(join(dir, "delivery", "plan"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "target.ts"), "a\nb\nc\n");
    writeFileSync(join(dir, "delivery", "plan", "existing.md"), "unrelated baseline document\n");
    const base = commit(dir, "base");

    const targetPath = join(dir, "delivery", "plan", "changed.md");

    /* --- Direction 1: the path is a REGULAR document. Baseline pass. --- */
    writeFileSync(targetPath, "cites src/target.ts:1\n");
    const headRegular = commit(dir, "head-regular");
    const evidenceOne = join(dir, "ev-1");
    mkdirSync(evidenceOne, { recursive: true });
    const resultOne = join(evidenceOne, "result.json");
    const one = runGateCli(
      ["--result", resultOne, "--evidence", evidenceOne, "--base", base, "--head", headRegular],
      dir,
    );
    assert.equal(one.signal, null, "the regular-document run must not be killed by the harness timeout");
    const recordOne = readResult(resultOne);
    assert.equal(recordOne.status, "green");
    assert.equal(recordOne.units, 1);

    /* --- Direction 2: replace the SAME path with a named pipe and run    */
    /* again with the same base/head. The runner's working tree now holds */
    /* a FIFO exactly where the diff says a document changed.             */
    rmSync(targetPath);
    mkfifo(targetPath);
    const evidenceTwo = join(dir, "ev-2");
    mkdirSync(evidenceTwo, { recursive: true });
    const resultTwo = join(evidenceTwo, "result.json");
    const two = runGateCli(
      ["--result", resultTwo, "--evidence", evidenceTwo, "--base", base, "--head", headRegular],
      dir,
    );
    // Every assertion after this line only executes because the process
    // RETURNED. A gate that opened the pipe would block in the kernel and
    // the harness would report a timeout (a non-null signal) instead of an
    // exit code.
    assert.equal(two.signal, null, "the fifo run must RETURN rather than block; a non-null signal means the harness had to kill it");
    assert.notEqual(two.status, 0);
    const recordTwo = readResult(resultTwo);
    assert.equal(recordTwo.status, "error");
    assert.match(recordTwo.detail, /delivery\/plan\/changed\.md/);
    assert.match(recordTwo.detail, /named pipe/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M2-C-3: --base absent is error, never not-applicable                 */
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
/* An unresolved local citation, or a citation matching no root, reds    */
/* the run naming the reason (step 3, criteria 1 and 5 combined at the  */
/* document level)                                                      */
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

/* ------------------------------------------------------------------ */
/* Basic linting shape: lintDocumentBody's return, unit tested directly  */
/* ------------------------------------------------------------------ */

test("lintDocumentBody separates resolved, unresolved and unverifiable-external counts", () => {
  const config = DEFAULT_CITATION_CONFIG;
  const body = [
    "resolved: src/cli.ts:1",
    "external: bin/fm-lock.sh:47-85",
    "unmatched: nowhere/nope.sh:1",
  ].join("\n");
  const lint = lintDocumentBody(config, repoRoot, body) as {
    kind: "linted";
    total: number;
    resolved: number;
    unverifiableExternal: number;
    unresolvedDetails: string[];
  };
  assert.equal(lint.kind, "linted");
  assert.equal(lint.total, 3);
  assert.equal(lint.resolved, 1);
  assert.equal(lint.unverifiableExternal, 1);
  assert.equal(lint.unresolvedDetails.length, 1);
});

test("matchesAny is true when any glob in the list matches", () => {
  assert.equal(matchesAny(["src/**", "bin/**"], "bin/tiphys.ts"), true);
  assert.equal(matchesAny(["src/**"], "bin/tiphys.ts"), false);
});
