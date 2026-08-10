/**
 * THE REPORT AND FINAL-REPORT CONTRACT TESTS (kernel plan M3, M3-P4 step 6).
 *
 * WITNESS DISCIPLINE (section 2.3 rules 2 and 3), restated here because this
 * file is where it is spent:
 *
 *   Kind A rules are schema keywords and the thing removed and restored is
 *   THE KEYWORD. Every schema is re-read from disk per arm and never mutated
 *   in place, because `compileSchema` caches by object IDENTITY and a defanged
 *   copy of an already-compiled object keeps the old validator. M3-P1
 *   measured exactly that and its first witness read like a keyword doing
 *   nothing when the keyword was doing its job.
 *
 *   Kind B rules are derived checks and the thing removed and restored is THE
 *   CHECK, through `deregisterCheck` and `registerCheck`.
 *
 * ONE WITNESS IS NOT A CLASS. Where a rule covers a class, at least two
 * STRUCTURALLY DIFFERENT members redden, and the two are named at the site so
 * a reader can judge whether they are really different rather than one shape
 * written twice.
 *
 * EVERY FIXTURE HERE IS A DANGEROUS INSTANCE, not a malformed one. The
 * baseline is the shipped example, which validates; each fixture perturbs
 * exactly the property under test and leaves the document otherwise
 * plausible, because a fixture that is merely malformed is the "test against
 * the absent feature" T-003 names as worthless.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const schemasDir = join(repoRoot, "schemas");
const templatesDir = join(repoRoot, "templates");
const fixturesDir = join(repoRoot, "test", "fixtures");

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
};

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  validateToLines: (
    schema: Record<string, unknown>,
    instance: unknown,
    companions?: readonly Record<string, unknown>[],
  ) => string[];
};

interface DerivedCheck {
  id: string;
  type: string;
  alsoTypes?: readonly string[];
  guards?: readonly string[];
  requiresContext: boolean;
  run: (
    instance: unknown,
    contextDirectory: string | undefined,
  ) => { violations: { pointer: string; message: string }[]; reports: string[] };
}

const checksModule = (await import(
  new URL("../src/checks.ts", import.meta.url).href
)) as {
  runChecks: (
    type: string,
    instance: unknown,
    contextDirectory: string | undefined,
  ) => { lines: string[]; failed: boolean };
  registerCheck: (check: DerivedCheck) => void;
  deregisterCheck: (id: string) => boolean;
  registeredChecks: () => readonly DerivedCheck[];
  typesOf: (check: DerivedCheck) => readonly string[];
  reportParityArithmetic: DerivedCheck;
  finalReportFindingParity: DerivedCheck;
  reportNoFindingsStatement: DerivedCheck;
};

const suiteModule = (await import(
  new URL("../src/gates/suite.ts", import.meta.url).href
)) as { MAPPING_STATEMENT: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** A FRESH schema object per call: identity is what compileSchema caches on. */
function readSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(schemasDir, name), "utf8")) as Record<
    string,
    unknown
  >;
}

/** A fresh decode of a shipped template, safe to mutate. */
function readTemplate(name: string): Record<string, unknown> {
  return yamlModule.parse(readFileSync(join(templatesDir, name), "utf8")) as Record<
    string,
    unknown
  >;
}

function reportLines(
  instance: unknown,
  schema: Record<string, unknown> = readSchema("report.schema.json"),
): string[] {
  return validateModule.validateToLines(schema, instance);
}

function finalReportLines(
  instance: unknown,
  schema: Record<string, unknown> = readSchema("final-report.schema.json"),
): string[] {
  return validateModule.validateToLines(schema, instance);
}

/** Walk a `/`-separated path into a decoded document and return the parent. */
function nodeAt(root: unknown, path: readonly (string | number)[]): Record<string, unknown> {
  let node = root as Record<string, unknown>;
  for (const step of path) {
    node = (node as Record<string, unknown>)[String(step)] as Record<string, unknown>;
  }
  return node;
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** Write a YAML document to a scratch file and validate it through the CLI. */
function validateThroughCli(
  t: { after(fn: () => void): void },
  type: string,
  document: unknown,
): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-m3p4-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const path = join(dir, "instance.yaml");
  writeFileSync(path, yamlModule.stringify(document));
  return runCli(["validate", "--type", type, path]);
}

/** Run one derived check over an instance, through the registry. */
function checkLines(type: string, instance: unknown): { lines: string[]; failed: boolean } {
  return checksModule.runChecks(type, instance, undefined);
}

/* ------------------------------------------------------------------ */
/* Criterion 1: the shipped examples validate                           */
/* ------------------------------------------------------------------ */

test("the shipped report, final-report and work-history examples validate through the CLI", () => {
  for (const [type, name] of [
    ["report", "report.example.yaml"],
    ["final-report", "final-report.example.yaml"],
    ["work-history", "work-history.example.yaml"],
  ] as const) {
    const explicit = runCli(["validate", "--type", type, join("templates", name)]);
    assert.equal(explicit.status, 0, `${name}: ${explicit.stdout}${explicit.stderr}`);
    /* `--type auto` and `--type <t>` are registered in the same act
       (M3R-001), so both are asserted rather than the one that happens to be
       used by the criterion's wording. */
    const automatic = runCli(["validate", "--type", "auto", join("templates", name)]);
    assert.equal(automatic.status, 0, `${name} auto: ${automatic.stdout}${automatic.stderr}`);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 2(a): a green gate result requires the wrapper's exit code */
/* ------------------------------------------------------------------ */

test("a green gate result with no wrapper exit code is rejected, and is accepted when the coupling is removed", (t) => {
  const document = readTemplate("report.example.yaml");
  const results = document["gate-results"] as Record<string, unknown>[];
  delete (results[0] as Record<string, unknown>)["wrapper-exit-code"];

  const lines = reportLines(document);
  assert.deepEqual(lines, [
    "INVALID #/gate-results/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/gate-results/0/wrapper-exit-code required property wrapper-exit-code is missing",
  ]);
  const cli = validateThroughCli(t, "report", document);
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /#\/gate-results\/0/);

  /* THE GUARDING KEYWORD REMOVED: the `then` branch that couples `green` to
     the exit code. The document is otherwise untouched, so what the arm
     proves is that the coupling and nothing else was doing the work. */
  const defanged = readSchema("report.schema.json");
  /* `if` and `then` are removed TOGETHER: Ajv's strict policy refuses a
     schema carrying one without the other, so removing only `then` would
     produce a compilation refusal rather than an acceptance, and an arm that
     fails for a different reason is not a witness (M3-P3 round 10 shipped
     exactly that mistake and caught it by reading the failure TEXT). */
  const gateResultDef = nodeAt(defanged, ["$defs", "gateResult"]);
  delete gateResultDef["if"];
  delete gateResultDef["then"];
  assert.deepEqual(reportLines(document, defanged), []);

  /* RESTORED: a fresh read of the shipped file rejects it again. */
  assert.ok(reportLines(document).length > 0);

  /* THE SECOND MEMBER, structurally different: the exit code is PRESENT and
     NONZERO. The first member tests absence, this one tests a value, and a
     guard that only required presence would be green here. */
  const nonzero = readTemplate("report.example.yaml");
  (
    (nonzero["gate-results"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["wrapper-exit-code"] = 1;
  assert.deepEqual(reportLines(nonzero), [
    "INVALID #/gate-results/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/gate-results/0/wrapper-exit-code value 1 does not equal the required constant 0",
  ]);
});

/* ------------------------------------------------------------------ */
/* Criterion 2b(a): the parity arithmetic, Kind B                        */
/* ------------------------------------------------------------------ */

test("the count parity check reddens on both directions of a mismatch and on a negative count, and greens when it is deregistered", () => {
  /* MEMBER 1: discovered EXCEEDS the buckets. This is R-048's
     silently-dropped-tests case and is the one the criterion names. */
  const dropped = readTemplate("report.example.yaml");
  (
    (dropped["gate-results"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["discovered"] = 600;
  const droppedRun = checkLines("report", dropped);
  assert.equal(droppedRun.failed, true);
  assert.deepEqual(droppedRun.lines, [
    "INVALID #/gate-results/0 discovered 600 does not equal passed + failed + skipped + todo + did-not-run = 507 (check: report-parity-arithmetic)",
  ]);

  /* MEMBER 2, STRUCTURALLY DIFFERENT: the buckets exceed discovered. The
     criterion's letter names only member 1; a check written to that letter
     would be green here, which is the one-directional guard this project
     keeps re-buying. */
  const inflated = readTemplate("report.example.yaml");
  (
    (inflated["gate-results"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["passed"] = 900;
  assert.deepEqual(checkLines("report", inflated).lines, [
    "INVALID #/gate-results/0 discovered 507 does not equal passed + failed + skipped + todo + did-not-run = 902 (check: report-parity-arithmetic)",
  ]);

  /* MEMBER 3, STRUCTURALLY DIFFERENT AGAIN: the sum is right and one bucket
     is NEGATIVE, so equality alone is satisfied. No keyword in the declared
     authoring vocabulary reaches this, because there is no `minimum`. */
  const negative = readTemplate("report.example.yaml");
  const negativeResult = (negative["gate-results"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  negativeResult["passed"] = 506;
  negativeResult["failed"] = -1;
  assert.deepEqual(checkLines("report", negative).lines, [
    "INVALID #/gate-results/0 count(s) failed are negative, which no run can produce (check: report-parity-arithmetic)",
  ]);

  /* MEMBER 4: a PARTIAL count record, where parity cannot be computed at
     all. A check that skipped these would let a green be recorded with five
     of the six counts, which is arithmetic that adds up while a row is
     lost one level down. The SIXTH count is `todo`, added in fix round 2:
     the M2-P3 wrapper reports it and the plan's field list did not, so a run
     with `todo > 0` could not be recorded at all without breaking parity. */
  const partial = readTemplate("report.example.yaml");
  delete (
    (partial["gate-results"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["skipped"];
  assert.deepEqual(checkLines("report", partial).lines, [
    "INVALID #/gate-results/0 gate result records 5 of the 6 counts and omits skipped, so parity cannot be computed (check: report-parity-arithmetic)",
  ]);

  /* THE CHECK DEREGISTERED (Kind B witness, section 2.3 rule 3). Not a
     schema keyword: a Kind B criterion offered a keyword witness would have
     misclassified itself. */
  assert.equal(checksModule.deregisterCheck("report-parity-arithmetic"), true);
  try {
    assert.deepEqual(checkLines("report", dropped).lines, []);
    assert.equal(checkLines("report", dropped).failed, false);
    assert.deepEqual(checkLines("report", negative).lines, []);
  } finally {
    checksModule.registerCheck(checksModule.reportParityArithmetic);
  }
  /* RESTORED. */
  assert.equal(checkLines("report", dropped).failed, true);
});

/* ------------------------------------------------------------------ */
/* Criterion 2b(b): the final report's cross-array parity, Kind B        */
/* ------------------------------------------------------------------ */

test("a final report whose input-findings has a hole, a phantom row or a duplicate is rejected by the derived check", () => {
  /* MEMBER 1, the criterion's own: a row deleted, leaving an orphaned id. */
  const orphaned = readTemplate("final-report.example.yaml");
  (orphaned["input-findings"] as unknown[]).splice(2, 1);
  const orphanRun = checkLines("final-report", orphaned);
  assert.equal(orphanRun.failed, true);
  assert.deepEqual(orphanRun.lines, [
    "INVALID #/inputs/2 finding V-3 has no row in input-findings, so the table has a hole (check: final-report-finding-parity)",
  ]);

  /* MEMBER 2, STRUCTURALLY DIFFERENT: a row naming an id `inputs` does not
     carry. This is the renumbering shape, and M2-P6 recorded (CR-988) that
     its own parity mode was blind to it for exactly one round. */
  const phantom = readTemplate("final-report.example.yaml");
  (phantom["input-findings"] as Record<string, unknown>[]).push({
    id: "V-9",
    outcome: "closed",
  });
  assert.deepEqual(checkLines("final-report", phantom).lines, [
    "INVALID #/input-findings/6 input-findings names V-9, which is not in inputs, so the coverage is phantom (check: final-report-finding-parity)",
  ]);

  /* MEMBER 3, STRUCTURALLY DIFFERENT AGAIN: one id with TWO rows. CR-985
     records that a duplicate defeats the orphan and phantom checks TOGETHER,
     because it is neither, while inflating every count. */
  const duplicated = readTemplate("final-report.example.yaml");
  (duplicated["input-findings"] as Record<string, unknown>[]).push({
    id: "V-1",
    outcome: "closed again",
  });
  assert.deepEqual(checkLines("final-report", duplicated).lines, [
    "INVALID #/inputs/0 finding V-1 has 2 rows in input-findings and must have exactly one (check: final-report-finding-parity)",
  ]);

  assert.equal(checksModule.deregisterCheck("final-report-finding-parity"), true);
  try {
    assert.deepEqual(checkLines("final-report", orphaned).lines, []);
    assert.deepEqual(checkLines("final-report", phantom).lines, []);
    assert.deepEqual(checkLines("final-report", duplicated).lines, []);
  } finally {
    checksModule.registerCheck(checksModule.finalReportFindingParity);
  }
  assert.equal(checkLines("final-report", orphaned).failed, true);
});

/* ------------------------------------------------------------------ */
/* Criterion 4: the M2-P6 coverage checker, run for real                 */
/* ------------------------------------------------------------------ */

/**
 * The checker is an EXPORTED FUNCTION and its CLI has no parity-mode flag
 * (`src/gates/coverage.ts` accepts only `--result`, `--evidence` and
 * `--config`), and that module is not on this phase's declaration. So the
 * criterion's "exits 0 / exits nonzero" is discharged by invoking the
 * unmodified checker in a SUBPROCESS whose exit code is a real process exit
 * code, rather than by asserting on a return value in this process.
 */
function runCoverageParity(document: unknown): { status: number | null; stdout: string } {
  const script = `
import { checkFindingOutcomeParity } from ${JSON.stringify(join(repoRoot, "src", "gates", "coverage.ts"))};
const document = JSON.parse(process.argv[1]);
const result = checkFindingOutcomeParity(
  document.inputs,
  document["input-findings"].map((row) => ({ id: row.id, outcome: row.outcome })),
);
process.stdout.write(JSON.stringify(result) + "\\n");
process.exit(result.ok ? 0 : 1);
`;
  const run = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script, JSON.stringify(document)],
    { encoding: "utf8", cwd: repoRoot },
  );
  return { status: run.status, stdout: run.stdout };
}

test("the M2-P6 coverage checker in finding-to-outcome parity mode passes the shipped final report and names the orphan when a row is deleted", () => {
  const shipped = readTemplate("final-report.example.yaml");
  const green = runCoverageParity(shipped);
  assert.equal(green.status, 0, green.stdout);
  assert.match(green.stdout, /"checked":6/);

  const holed = readTemplate("final-report.example.yaml");
  (holed["input-findings"] as unknown[]).splice(2, 1);
  const red = runCoverageParity(holed);
  assert.equal(red.status, 1);
  assert.match(red.stdout, /"missing":\["V-3"\]/);
});

/* ------------------------------------------------------------------ */
/* Criterion 2(b): an environmental claim requires evidence              */
/* ------------------------------------------------------------------ */

test("an environmental claim with an empty evidence array is rejected, and is accepted when minItems is removed", () => {
  const document = readTemplate("report.example.yaml");
  (
    (document["environmental-claims"] as Record<string, unknown>[])[0] as Record<
      string,
      unknown
    >
  )["evidence"] = [];
  assert.deepEqual(reportLines(document), [
    "INVALID #/environmental-claims/0/evidence array has 0 items, fewer than the required minimum 1",
  ]);

  const defanged = readSchema("report.schema.json");
  delete nodeAt(defanged, ["$defs", "environmentalClaim", "properties", "evidence"])[
    "minItems"
  ];
  assert.deepEqual(reportLines(document, defanged), []);
  assert.ok(reportLines(document).length > 0);

  /* SECOND MEMBER: the array is absent entirely rather than empty. Presence
     and non-emptiness are two different guards and both are load-bearing. */
  const absent = readTemplate("report.example.yaml");
  delete (
    (absent["environmental-claims"] as Record<string, unknown>[])[0] as Record<
      string,
      unknown
    >
  )["evidence"];
  assert.deepEqual(reportLines(absent), [
    "INVALID #/environmental-claims/0/evidence required property evidence is missing",
  ]);

  /* AND ITS OWN REMOVAL ARM. Added in fix round 2 (finding CR-1520): the
     witness table's third column is headed "keyword removed", and this row
     named `required` while no arm removed it. The reviewer took the arm and
     it holds, so the table overstated rather than the guard being absent;
     the arm is written here so the column is true by execution. The
     GUARDING KEYWORD IS DIFFERENT from member 1's: `minItems` reaches the
     empty array and says nothing about an absent one. */
  const withoutRequired = readSchema("report.schema.json");
  const environmentalClaim = nodeAt(withoutRequired, ["$defs", "environmentalClaim"]);
  environmentalClaim["required"] = (environmentalClaim["required"] as string[]).filter(
    (name) => name !== "evidence",
  );
  assert.deepEqual(reportLines(absent, withoutRequired), []);
  assert.ok(reportLines(absent).length > 0);
});

/* ------------------------------------------------------------------ */
/* Criterion 2(c): an incident requires its exposure window              */
/* ------------------------------------------------------------------ */

test("an honest failure with a cause and no exposure window is rejected naming the field", () => {
  const document = readTemplate("report.example.yaml");
  delete (
    (document["honest-failures"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["exposure-window"];
  assert.deepEqual(reportLines(document), [
    "INVALID #/honest-failures/0/exposure-window required property exposure-window is missing",
  ]);

  const defanged = readSchema("report.schema.json");
  const honestFailure = nodeAt(defanged, ["$defs", "honestFailure"]);
  honestFailure["required"] = (honestFailure["required"] as string[]).filter(
    (name) => name !== "exposure-window",
  );
  assert.deepEqual(reportLines(document, defanged), []);
  assert.ok(reportLines(document).length > 0);
});

/* ------------------------------------------------------------------ */
/* Criterion 2(e): a universal claim owes a counter-experiment           */
/* ------------------------------------------------------------------ */

test("a finding whose analysis carries a universal quantifier and no counter-experiment is rejected", () => {
  /* MEMBER 1: `always`. */
  const always = readTemplate("report.example.yaml");
  const first = (always["findings"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  first["analysis"] = "The companion table is always consulted before compilation.";
  assert.deepEqual(reportLines(always), [
    "INVALID #/findings/0 value matches no permitted alternative here",
  ]);

  /* MEMBER 2, a different token and a different sentence shape: `never`. One
     token witnessed is not the class the pattern claims to cover. */
  const never = readTemplate("report.example.yaml");
  (
    (never["findings"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["analysis"] = "A reference that leaves the document is never fetched.";
  assert.deepEqual(reportLines(never), [
    "INVALID #/findings/0 value matches no permitted alternative here",
  ]);

  /* THE SAME SENTENCE WITH A COUNTER-EXPERIMENT: accepted. */
  const settled = readTemplate("report.example.yaml");
  const settledFinding = (settled["findings"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  settledFinding["analysis"] = "The companion table is always consulted before compilation.";
  settledFinding["counter-experiment"] =
    "Compile a companion-needing schema without the table and observe the unresolved reference.";
  assert.deepEqual(reportLines(settled), []);

  /* THE GUARDING KEYWORD REMOVED: the finding's `oneOf`. */
  const defanged = readSchema("report.schema.json");
  delete nodeAt(defanged, ["$defs", "finding"])["oneOf"];
  assert.deepEqual(reportLines(always, defanged), []);
  assert.deepEqual(reportLines(never, defanged), []);
  assert.ok(reportLines(always).length > 0);

  /* THE SAME RULE OVER `evidence[].note`, which plan step 1 names beside
     `analysis` and which is a different object at a different depth. Here
     the guarding keyword is the evidence item's `then`. */
  const noted = readTemplate("report.example.yaml");
  const evidence = (
    (noted["findings"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["evidence"] as Record<string, unknown>[];
  (evidence[0] as Record<string, unknown>)["note"] = "Every call site was enumerated.";
  assert.deepEqual(reportLines(noted), [
    "INVALID #/findings/0/evidence/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/findings/0/evidence/0/counter-experiment required property counter-experiment is missing",
  ]);
  const defangedNote = readSchema("report.schema.json");
  const evidenceDef = nodeAt(defangedNote, ["$defs", "evidence"]);
  delete evidenceDef["if"];
  delete evidenceDef["then"];
  assert.deepEqual(reportLines(noted, defangedNote), []);
});

/* ------------------------------------------------------------------ */
/* Criterion 2(f): an unpinned finding is labelled                       */
/* ------------------------------------------------------------------ */

test("a finding with source-pinned true and no pinned evidence is rejected naming the field", () => {
  const document = readTemplate("report.example.yaml");
  delete (
    (document["findings"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["pinned-evidence"];
  assert.deepEqual(reportLines(document), [
    "INVALID #/findings/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/findings/0/pinned-evidence required property pinned-evidence is missing",
  ]);

  const defanged = readSchema("report.schema.json");
  const findingDef = nodeAt(defanged, ["$defs", "finding"]);
  delete findingDef["if"];
  delete findingDef["then"];
  assert.deepEqual(reportLines(document, defanged), []);
  assert.ok(reportLines(document).length > 0);

  /* THE CONVERSE, ASKED AND ANSWERED: `source-pinned: false` with a
     `pinned-evidence` beside it is ACCEPTED, deliberately. T-004's rule is
     that an unpinnable run must be labelled, not that a pin may not be
     recorded; a schema that forbade the second would make an honest record
     of a partial pin unwritable. Stated here so a reader does not read the
     absence of a rule as an oversight. */
  const bothWays = readTemplate("report.example.yaml");
  const second = (bothWays["findings"] as Record<string, unknown>[])[1] as Record<
    string,
    unknown
  >;
  second["pinned-evidence"] = "origin/main at c7a7ce9";
  assert.deepEqual(reportLines(bothWays), []);

  /* AND THE FIELD IS REQUIRED AT ALL: a finding that answers neither way is
     rejected, so the question cannot be skipped. */
  const unanswered = readTemplate("report.example.yaml");
  delete (
    (unanswered["findings"] as Record<string, unknown>[])[1] as Record<string, unknown>
  )["source-pinned"];
  assert.deepEqual(reportLines(unanswered), [
    "INVALID #/findings/1/source-pinned required property source-pinned is missing",
  ]);
});

/* ------------------------------------------------------------------ */
/* Criterion 2c: the claims section                                      */
/* ------------------------------------------------------------------ */

/** Replace the example's claims with one claim under test. */
function withClaim(claim: Record<string, unknown>): Record<string, unknown> {
  const document = readTemplate("report.example.yaml");
  document["claims"] = [claim];
  return document;
}

const CONSTRUCTION = {
  "executed-construction": {
    command: "node --test test/report-contract.test.ts",
    "exit-code": 0,
    output: "# pass 1\n# fail 0\n",
  },
};

function constructionClaim(kind: string): Record<string, unknown> {
  return {
    id: "K-1",
    kind,
    statement: "A statement whose kind demands that someone tried to build the thing.",
    "settled-by": CONSTRUCTION,
  };
}

for (const [article, kind] of [
  ["an", "impossibility"],
  ["a", "coverage"],
  ["a", "remedy"],
] as const) {
  test(`${article} ${kind} claim with no executed construction is rejected, and the same claim carrying one is accepted`, () => {
    /* ACCEPTED with a real construction. */
    assert.deepEqual(reportLines(withClaim(constructionClaim(kind))), []);

    /* MEMBER 1: no settlement at all. */
    const unsettled = constructionClaim(kind);
    delete unsettled["settled-by"];
    assert.deepEqual(reportLines(withClaim(unsettled)), [
      "INVALID #/claims/0 value does not satisfy the requirements its own shape triggers here",
      "INVALID #/claims/0 value matches no permitted alternative here",
      "INVALID #/claims/0/settled-by required property settled-by is missing",
    ]);

    /* MEMBER 2, STRUCTURALLY DIFFERENT: a settlement of the WRONG SHAPE. The
       claim is settled by a counter-experiment, which is what a universal
       claim owes; T-006's whole finding is that these three kinds are
       settled by CONSTRUCTION instead, and a guard that only checked for
       the presence of `settled-by` would be green here. */
    const wrongShape = constructionClaim(kind);
    wrongShape["settled-by"] = { "counter-experiment": "Try to falsify it." };
    assert.deepEqual(reportLines(withClaim(wrongShape)), [
      "INVALID #/claims/0 value matches no permitted alternative here",
      "INVALID #/claims/0/settled-by/counter-experiment property counter-experiment is not permitted here",
      "INVALID #/claims/0/settled-by/executed-construction required property executed-construction is missing",
    ]);

    /* MEMBER 3: a construction missing its output, so the attempt is
       asserted rather than shown. */
    const noOutput = constructionClaim(kind);
    noOutput["settled-by"] = {
      "executed-construction": {
        command: "node --test test/report-contract.test.ts",
        "exit-code": 0,
      },
    };
    assert.deepEqual(reportLines(withClaim(noOutput)), [
      "INVALID #/claims/0 value does not satisfy the requirements its own shape triggers here",
      "INVALID #/claims/0 value matches no permitted alternative here",
      "INVALID #/claims/0/settled-by value matches no permitted alternative here",
      "INVALID #/claims/0/settled-by/counter-experiment required property counter-experiment is missing",
      "INVALID #/claims/0/settled-by/executed-construction property executed-construction is not permitted here",
      "INVALID #/claims/0/settled-by/executed-construction/output required property output is missing",
    ]);

    /* THE GUARDING KEYWORDS REMOVED. The `then` is what requires a
       settlement at all, and the `oneOf` is what requires the right SHAPE of
       one, so the two arms are removed separately and each accepts exactly
       its own member. */
    const withoutThen = readSchema("report.schema.json");
    delete nodeAt(withoutThen, ["$defs", "claim"])["if"];
    delete nodeAt(withoutThen, ["$defs", "claim"])["then"];
    delete nodeAt(withoutThen, ["$defs", "claim"])["oneOf"];
    assert.deepEqual(reportLines(withClaim(unsettled), withoutThen), []);

    const withoutOneOf = readSchema("report.schema.json");
    delete nodeAt(withoutOneOf, ["$defs", "claim"])["oneOf"];
    assert.deepEqual(reportLines(withClaim(wrongShape), withoutOneOf), []);

    /* MEMBER 3's guarding keyword is a DIFFERENT one, and finding that out
       is the point of taking the witness rather than assuming it: removing
       the claim-level `oneOf` leaves member 3 red, because what rejects a
       construction with no output is `executed-construction`'s own
       `required`. The two members are guarded by two keywords, which is
       exactly what "one witness is not a class" is about. */
    const withoutOutputRequired = readSchema("report.schema.json");
    delete nodeAt(withoutOutputRequired, ["$defs", "claim"])["oneOf"];
    const construction = nodeAt(withoutOutputRequired, [
      "$defs",
      "settledByConstruction",
      "properties",
      "executed-construction",
    ]);
    construction["required"] = (construction["required"] as string[]).filter(
      (name) => name !== "output",
    );
    assert.deepEqual(reportLines(withClaim(noOutput), withoutOutputRequired), []);

    /* RESTORED. */
    assert.ok(reportLines(withClaim(wrongShape)).length > 0);
  });
}

test("a claim filed under a kind the schema does not question is rejected naming the permitted values", () => {
  const note = {
    id: "K-2",
    kind: "note",
    statement: "This arm cannot be forced here.",
  };
  const lines = reportLines(withClaim(note));
  assert.deepEqual(lines, [
    "INVALID #/claims/0 value matches no permitted alternative here",
    'INVALID #/claims/0/kind value "note" is not one of the permitted values "universal", "impossibility", "coverage", "remedy", "open-question"',
  ]);

  /* THE ENUM REMOVED: the document is still rejected, by the oneOf, but the
     line that NAMES the vocabulary is gone. That is what the enum buys and
     it is asserted separately from the rejection, because a reader told only
     that nothing matched cannot find out what would have. */
  const withoutEnum = readSchema("report.schema.json");
  delete nodeAt(withoutEnum, ["$defs", "claim", "properties", "kind"])["enum"];
  assert.deepEqual(reportLines(withClaim(note), withoutEnum), [
    "INVALID #/claims/0 value matches no permitted alternative here",
  ]);

  /* THE ENUM AND THE oneOf BOTH REMOVED: accepted. The vocabulary is closed
     by the pair, and this arm is what shows the pair is what closes it. */
  const wideOpen = readSchema("report.schema.json");
  delete nodeAt(wideOpen, ["$defs", "claim", "properties", "kind"])["enum"];
  delete nodeAt(wideOpen, ["$defs", "claim"])["oneOf"];
  delete nodeAt(wideOpen, ["$defs", "claim"])["if"];
  delete nodeAt(wideOpen, ["$defs", "claim"])["then"];
  assert.deepEqual(reportLines(withClaim(note), wideOpen), []);

  /* RESTORED. */
  assert.ok(reportLines(withClaim(note)).length > 0);
});

test("an open question with no settlement is accepted and the same entry carrying a construction is rejected", () => {
  const honest = {
    id: "K-3",
    kind: "open-question",
    statement: "I did not find a way to force this arm.",
  };
  assert.deepEqual(reportLines(withClaim(honest)), []);

  /* THE OPPOSITE MISDECLARATION: a settled question filed as open. */
  const settled = { ...honest, "settled-by": CONSTRUCTION };
  assert.deepEqual(reportLines(withClaim(settled)), [
    "INVALID #/claims/0 value matches no permitted alternative here",
    "INVALID #/claims/0/settled-by/counter-experiment required property counter-experiment is missing",
    "INVALID #/claims/0/settled-by/executed-construction property executed-construction is not permitted here",
  ]);

  /* THE GUARDING KEYWORD REMOVED: the open-question branch's
     `additionalProperties: false`, which is what makes a settlement
     inadmissible there. */
  const defanged = readSchema("report.schema.json");
  const branches = nodeAt(defanged, ["$defs", "claim"])["oneOf"] as Record<
    string,
    unknown
  >[];
  const openBranch = branches.find(
    (branch) =>
      (nodeAt(branch, ["properties", "kind"]) as Record<string, unknown>)["const"] ===
      "open-question",
  ) as Record<string, unknown>;
  openBranch["additionalProperties"] = true;
  assert.deepEqual(reportLines(withClaim(settled), defanged), []);
  assert.ok(reportLines(withClaim(settled)).length > 0);
});

/* ------------------------------------------------------------------ */
/* Criterion 2d: the fix-round contract                                  */
/* ------------------------------------------------------------------ */

test("a fix round with no not-covered is rejected naming the field", () => {
  const document = readTemplate("report.example.yaml");
  delete (document["fix-round"] as Record<string, unknown>)["not-covered"];
  assert.deepEqual(reportLines(document), [
    "INVALID #/fix-round/not-covered required property not-covered is missing",
  ]);

  const defanged = readSchema("report.schema.json");
  const fixRound = nodeAt(defanged, ["$defs", "fixRound"]);
  fixRound["required"] = (fixRound["required"] as string[]).filter(
    (name) => name !== "not-covered",
  );
  assert.deepEqual(reportLines(document, defanged), []);
  assert.ok(reportLines(document).length > 0);

  /* THE SECOND MEMBER of the same class, at a different object: `mechanism`
     absent. Removing one required field and calling the class witnessed is
     the mistake M1-P6 made twice in consecutive rounds. */
  const noMechanism = readTemplate("report.example.yaml");
  delete (noMechanism["fix-round"] as Record<string, unknown>)["mechanism"];
  assert.deepEqual(reportLines(noMechanism), [
    "INVALID #/fix-round/mechanism required property mechanism is missing",
  ]);

  /* THE SECOND MEMBER'S OWN REMOVAL ARM (CR-1520). It is a SEPARATE schema
     copy from the `not-covered` one above, so this arm cannot be green
     because of that removal. */
  const withoutMechanism = readSchema("report.schema.json");
  const mechanismless = nodeAt(withoutMechanism, ["$defs", "fixRound"]);
  mechanismless["required"] = (mechanismless["required"] as string[]).filter(
    (name) => name !== "mechanism",
  );
  assert.deepEqual(reportLines(noMechanism, withoutMechanism), []);
  assert.ok(reportLines(noMechanism).length > 0);
});

test("a fix round whose derivation output is absent or empty is rejected", () => {
  /* MEMBER 1: absent. */
  const absent = readTemplate("report.example.yaml");
  delete (
    (absent["fix-round"] as Record<string, unknown>)["derivation"] as Record<string, unknown>
  )["output"];
  assert.deepEqual(reportLines(absent), [
    "INVALID #/fix-round/derivation/output required property output is missing",
  ]);

  /* MEMBER 1's OWN REMOVAL ARM (CR-1520). The only defang this test carried
     removed `minLength` and `pattern`, which are member 2's keywords and say
     nothing about an ABSENT output; the witness table named `required` for
     this row and nothing removed it. */
  const withoutRequired = readSchema("report.schema.json");
  const derivation = nodeAt(withoutRequired, [
    "$defs",
    "fixRound",
    "properties",
    "derivation",
  ]);
  derivation["required"] = (derivation["required"] as string[]).filter(
    (name) => name !== "output",
  );
  assert.deepEqual(reportLines(absent, withoutRequired), []);
  assert.ok(reportLines(absent).length > 0);

  /* MEMBER 2, STRUCTURALLY DIFFERENT: present and EMPTY. `required` alone is
     satisfied by "" and this is the field where that would matter most. */
  const empty = readTemplate("report.example.yaml");
  (
    (empty["fix-round"] as Record<string, unknown>)["derivation"] as Record<string, unknown>
  )["output"] = "";
  assert.deepEqual(reportLines(empty), [
    'INVALID #/fix-round/derivation/output value "" does not match the required pattern \\S',
    'INVALID #/fix-round/derivation/output value "" is shorter than the required minimum length 1',
  ]);

  const defanged = readSchema("report.schema.json");
  const output = nodeAt(defanged, [
    "$defs",
    "fixRound",
    "properties",
    "derivation",
    "properties",
    "output",
  ]);
  delete output["minLength"];
  delete output["pattern"];
  assert.deepEqual(reportLines(empty, defanged), []);
  assert.ok(reportLines(empty).length > 0);
});

test("the shipped report template's fix-round derivation carries real multi-line captured output", () => {
  /* CRITERION 2d(d), and it is a claim about THIS REPOSITORY'S EXAMPLE, not
     about an arbitrary instance: no keyword can tell full output from a
     summary of it, and this test does not pretend otherwise. What it asserts
     is that the shipped template pays the cost the contract asks for. */
  const document = readTemplate("report.example.yaml");
  const derivation = (document["fix-round"] as Record<string, unknown>)[
    "derivation"
  ] as Record<string, unknown>;
  const output = derivation["output"] as string;
  const lines = output.split("\n").filter((line) => line.trim() !== "");
  assert.ok(
    lines.length >= 3,
    `the template's derivation output has ${String(lines.length)} non-empty line(s), which is a placeholder rather than a capture`,
  );
  /* And it is the output OF THE COMMAND BESIDE IT: every line names a file
     and a line number, which is what the recorded grep produces. */
  for (const line of lines) {
    assert.match(line, /^[a-z/.-]+\.ts:[0-9]+:/, line);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 2e: the empty-string satisfaction class                     */
/* ------------------------------------------------------------------ */

test("an empty string does not satisfy a required field, at a top-level scalar and at a nested one", () => {
  /* MEMBER 1: A TOP-LEVEL SCALAR. */
  const topLevel = readTemplate("report.example.yaml");
  topLevel["no-findings-statement"] = "";
  assert.deepEqual(reportLines(topLevel), [
    'INVALID #/no-findings-statement value "" does not match the required pattern \\S',
    'INVALID #/no-findings-statement value "" is shorter than the required minimum length 1',
  ]);

  /* The same field with real text is accepted BY THE KEYWORDS, which is the
     other direction the criterion asks for and is all this arm asserts.
     THE DOCUMENT ITSELF IS STILL REFUSED END TO END, by the derived check
     `report-no-findings-statement`, because the template carries findings
     and a no-findings statement beside real findings is the opposite
     misdeclaration; that arm is in its own test below. The two facts are
     not in tension: `reportLines` is the KEYWORD half of the contract, and
     conflating them is how a document can be reported valid by one half. */
  const stated = readTemplate("report.example.yaml");
  stated["no-findings-statement"] = "Three findings are recorded above.";
  assert.deepEqual(reportLines(stated), []);
  assert.equal(checkLines("report", stated).failed, true);

  const defanged = readSchema("report.schema.json");
  const statement = nodeAt(defanged, ["properties", "no-findings-statement"]);
  delete statement["minLength"];
  delete statement["pattern"];
  assert.deepEqual(reportLines(topLevel, defanged), []);
  assert.ok(reportLines(topLevel).length > 0);

  /* MEMBER 2, STRUCTURALLY DIFFERENT: A SCALAR INSIDE AN ARRAY ELEMENT. The
     pointer is the difference that matters: a guard written against the
     top-level shape says nothing about a field reached through an index. */
  const nested = readTemplate("report.example.yaml");
  (
    (nested["deviations"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["why"] = "";
  assert.deepEqual(reportLines(nested), [
    'INVALID #/deviations/0/why value "" does not match the required pattern \\S',
    'INVALID #/deviations/0/why value "" is shorter than the required minimum length 1',
  ]);

  /* MEMBER 2'S OWN REMOVAL ARM (CR-1520). The witness table named
     `minLength` and `pattern` for this row and no arm removed them; member
     1's defang above is a different node in a different schema copy. */
  const withoutBoth = readSchema("report.schema.json");
  const why = nodeAt(withoutBoth, ["$defs", "deviation", "properties", "why"]);
  delete why["minLength"];
  delete why["pattern"];
  assert.deepEqual(reportLines(nested, withoutBoth), []);
  assert.ok(reportLines(nested).length > 0);
});

test("a whitespace-only block scalar is rejected where minLength alone would accept it", () => {
  /* MEMBER 3 of the criterion 2e class, and the one that shows WHY the
     pattern sits beside minLength: a YAML block scalar holding a newline and
     two spaces has length 3, so `minLength: 1` is satisfied and the field is
     still empty of content. */
  const document = readTemplate("report.example.yaml");
  (
    (document["honest-failures"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["exposure-window"] = "\n  ";
  assert.deepEqual(reportLines(document), [
    'INVALID #/honest-failures/0/exposure-window value "\\n  " does not match the required pattern \\S',
  ]);

  /* THE PATTERN ALONE REMOVED, minLength left in place: ACCEPTED. This is
     the arm that proves minLength does not reach this member, so the two
     keywords are not redundant. */
  const withoutPattern = readSchema("report.schema.json");
  delete nodeAt(withoutPattern, [
    "$defs",
    "honestFailure",
    "properties",
    "exposure-window",
  ])["pattern"];
  assert.deepEqual(reportLines(document, withoutPattern), []);
  assert.ok(reportLines(document).length > 0);
});

/* ------------------------------------------------------------------ */
/* Criterion 3: the wrapper capture is verbatim, not authored            */
/* ------------------------------------------------------------------ */

test("the stored full-suite wrapper capture is a verbatim capture with its command and exit code recorded", () => {
  const invocation = JSON.parse(
    readFileSync(join(fixturesDir, "wrapper-capture.invocation.json"), "utf8"),
  ) as Record<string, unknown>;
  const counts = JSON.parse(
    readFileSync(join(fixturesDir, "wrapper-capture.counts.json"), "utf8"),
  ) as Record<string, unknown>;
  const stdout = readFileSync(join(fixturesDir, "wrapper-capture.stdout.txt"), "utf8");

  /* THE RECORDED COMMAND AND EXIT CODE, which is what the criterion asks
     for by name. */
  const command = invocation["command"] as string[];
  assert.ok(Array.isArray(command) && command.includes("src/gates/suite.ts"), "no command");
  assert.equal(invocation["exit-code"], 0);
  assert.match(invocation["head"] as string, /^[0-9a-f]{40}$/);

  /* AND THE PART A HAND-WRITTEN FIXTURE WOULD FAIL. The capture carries the
     wrapper's own MAPPING_STATEMENT, a 260-character sentence exported from
     src/gates/suite.ts; a fixture typed to match the schema would not
     reproduce it byte for byte, and a fixture whose program has since
     changed its statement is no longer a capture OF THAT PROGRAM. */
  assert.equal(counts["mapping"], suiteModule.MAPPING_STATEMENT);

  /* The wrapper's own identity statement holds over the captured counts:
     pass + fail + skipped + todo + did-not-run == reported. */
  const numbers = counts["counts"] as Record<string, number>;
  assert.equal(
    numbers["pass"] +
      numbers["fail"] +
      numbers["skipped"] +
      numbers["todo"] +
      numbers["didNotRun"],
    numbers["reported"],
  );

  /* The human-readable line and the machine counts are two renderings of
     one run and must agree; a fixture assembled from two different runs
     would not. */
  assert.match(stdout, new RegExp(`reported ${String(numbers["reported"])} test`));
  assert.match(stdout, new RegExp(`pass ${String(numbers["pass"])},`));
  assert.match(stdout, new RegExp(`skipped ${String(numbers["skipped"])},`));

  /* AND THE REPORT EXAMPLE'S GATE RESULT IS THAT RUN, not numbers chosen to
     add up. This is what ties criterion 3 to criterion 2: the gate-results
     fixture the rejections perturb is the real capture. */
  const example = readTemplate("report.example.yaml");
  const gate = (example["gate-results"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  assert.equal(gate["discovered"], numbers["reported"]);
  assert.equal(gate["passed"], numbers["pass"]);
  assert.equal(gate["failed"], numbers["fail"]);
  assert.equal(gate["skipped"], numbers["skipped"]);
  /* The SIXTH bucket, added in fix round 2. It is asserted against the
     capture like the other five so the field cannot be a number chosen to
     make parity work: the wrapper reported it and the record repeats it. */
  assert.equal(gate["todo"], numbers["todo"]);
  assert.equal(gate["did-not-run"], numbers["didNotRun"]);
  assert.equal(gate["wrapper-exit-code"], counts["childExit"]);
});

/* ------------------------------------------------------------------ */
/* The final report's silence-versus-emptiness rule                      */
/* ------------------------------------------------------------------ */

test("an enumerable final-report section is empty only with an explicit marker, in both directions", () => {
  /* DIRECTION 1: an empty list with no marker. */
  const unmarked = readTemplate("final-report.example.yaml");
  unmarked["infrastructure-left"] = { none: false, entries: [] };
  assert.deepEqual(finalReportLines(unmarked), [
    "INVALID #/infrastructure-left value matches no permitted alternative here",
  ]);

  /* DIRECTION 2, the converse the requirement's letter does not name: a
     `none: true` marker sitting on top of real entries, which claims
     emptiness while carrying content. */
  const contradictory = readTemplate("final-report.example.yaml");
  contradictory["infrastructure-left"] = {
    none: true,
    entries: [{ statement: "a worktree was left behind" }],
  };
  assert.deepEqual(finalReportLines(contradictory), [
    "INVALID #/infrastructure-left value matches no permitted alternative here",
  ]);

  const defanged = readSchema("final-report.schema.json");
  delete nodeAt(defanged, ["$defs", "enumerableSection"])["oneOf"];
  assert.deepEqual(finalReportLines(unmarked, defanged), []);
  assert.deepEqual(finalReportLines(contradictory, defanged), []);
  assert.ok(finalReportLines(unmarked).length > 0);
});

/* ------------------------------------------------------------------ */
/* The universal-quantifier pattern's worst case, measured (T-012)       */
/* ------------------------------------------------------------------ */

test("the universal-quantifier pattern is linear on a long near-miss rather than catastrophic", () => {
  /* T-012, BINDING: any change to a pattern owes a worst-case TIMING
     measurement on a long NEAR-MISS, and a fuzz over well-formed inputs is
     structurally blind to that class. The orchestrator's own regex widening
     measured correctness, the suite and the owner's criterion, all true, and
     shipped a 73-second denial of service on a 269-byte document.

     THE SUBJECT IS A NEAR-MISS, and it is put in `analysis`, which is the
     field the pattern is actually applied to. Putting it in a field guarded
     only by `\\S` would measure nothing while passing, which is a witness
     green for the wrong reason. It is made of the alternation's own prefixes
     with the last letter wrong, so the engine must enter and abandon a branch
     at every position, and the negative-lookahead branch of the `oneOf` must
     re-test the alternation at every character.

     FIX ROUND 2 WIDENED BOTH PATTERNS (case-insensitive character classes,
     and eight impossibility tokens on the open-question branch), so this
     subject is widened with them: T-012 binds a TIMING measurement to any
     pattern change, and a near-miss made only of the old tokens would leave
     the new branches unmeasured while still passing. The prefixes are mixed
     in case for the same reason. */
  const nearMiss = `${"alway neve ever aLwAy cannot bx impossibl no way t guarantee ".repeat(8000)}x`;
  const document = readTemplate("report.example.yaml");
  const finding = (document["findings"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  finding["analysis"] = nearMiss;

  const started = process.hrtime.bigint();
  const lines = reportLines(document);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.deepEqual(lines, [], "the near-miss should not match the quantifier pattern");
  /* The bound is deliberately loose: this asserts the ABSENCE OF A
     CATASTROPHIC CLASS, not a performance target, and a tight bound would be
     flaky on a loaded runner. A backtracking blowup on a subject of this
     length does not return in minutes, so any pass at all falsifies it. The
     measured figure at authoring time is recorded in
     delivery/work-history/m3-p4.md. */
  assert.ok(
    elapsedMs < 5000,
    `validating a ${String(nearMiss.length)}-character near-miss took ${elapsedMs.toFixed(1)}ms`,
  );

  /* AND THE PATTERN STILL WORKS ON THE REAL TOKEN, so the near-miss above is
     a near-miss rather than a subject the pattern cannot see at all. */
  finding["analysis"] = `${nearMiss} always`;
  assert.deepEqual(reportLines(document), [
    "INVALID #/findings/0 value matches no permitted alternative here",
  ]);

  /* THE SECOND PATTERN FIX ROUND 2 ADDED, measured on its own subject: the
     open-question branch's statement. It is a THIRTEEN-branch alternation
     rather than five, so it is the one with the most branches to enter and
     abandon, and leaving it unmeasured would be measuring the cheaper of the
     two and reporting the result of the widening. */
  const claimDocument = readTemplate("report.example.yaml");
  (claimDocument["claims"] as Record<string, unknown>[])[0] = {
    id: "T-12",
    kind: "open-question",
    statement: nearMiss,
  };
  const claimStarted = process.hrtime.bigint();
  const claimLines = reportLines(claimDocument);
  const claimElapsedMs = Number(process.hrtime.bigint() - claimStarted) / 1e6;
  assert.deepEqual(claimLines, [], "the near-miss should not match the settlement pattern");
  assert.ok(
    claimElapsedMs < 5000,
    `validating a ${String(nearMiss.length)}-character near-miss in a claim statement took ${claimElapsedMs.toFixed(1)}ms`,
  );

  /* AND THE REAL TOKEN STILL REDDENS IT. */
  (
    (claimDocument["claims"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["statement"] = `${nearMiss} cannot be forced`;
  assert.deepEqual(reportLines(claimDocument), [
    "INVALID #/claims/0 value matches no permitted alternative here",
  ]);
});

/* ==================================================================== */
/* FIX ROUND 2 (arbitration of round 1)                                  */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* CR-001: a shared $def does not share its derived check               */
/* ------------------------------------------------------------------ */

/**
 * Every cross-document `$ref` in `schemas/`, the artifact types that reach
 * each shared definition, and the derived checks that declare they guard it.
 *
 * Derived from the shipped files rather than from a list written here, so a
 * later phase that adds a `$ref` or a `guards` entry is measured rather than
 * trusted.
 */
function sharedDefinitionUsers(
  schemas: ReadonlyMap<string, Record<string, unknown>>,
): Map<string, Set<string>> {
  const kindOf = new Map<string, string>();
  for (const [file, document] of schemas) {
    const kind = nodeAt(document, ["properties", "kind"])?.["const"];
    kindOf.set(file, typeof kind === "string" ? kind : `(no kind const in ${file})`);
  }
  const refs = (node: unknown, out: string[]): string[] => {
    if (Array.isArray(node)) {
      for (const item of node) refs(item, out);
      return out;
    }
    if (node === null || typeof node !== "object") return out;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$ref" && typeof value === "string") out.push(value);
      else refs(value, out);
    }
    return out;
  };
  const users = new Map<string, Set<string>>();
  for (const [file, document] of schemas) {
    for (const reference of refs(document, [])) {
      if (reference.startsWith("#/")) continue;
      const at = users.get(reference) ?? new Set<string>();
      at.add(kindOf.get(file) as string);
      users.set(reference, at);
    }
  }
  /* The OWNING document reaches its own definitions by a local pointer, so
     its type is a user too and a check registered only for the BORROWER
     would be just as much a hole as the one this test was written for. */
  for (const [pointer, at] of users) {
    const ownerFile = pointer.slice(0, pointer.indexOf("#"));
    const local = pointer.slice(pointer.indexOf("#"));
    const owner = schemas.get(ownerFile);
    assert.ok(owner !== undefined, `${pointer} names a schema that is not in schemas/`);
    if (refs(owner, []).includes(local)) at.add(kindOf.get(ownerFile) as string);
  }
  return users;
}

test("every derived check that guards a shared definition runs on every artifact type that reaches it", () => {
  /* THE MECHANISM, not the instance (M3-P4 round-1 finding CR-001): a derived
     check is registered PER TYPE and reads a TYPE-SPECIFIC KEY, while the
     `$defs` it guards are SHARED ACROSS TYPES by `$ref`. Keywords travel
     through a reference and Kind B rules do not, so `report-parity-arithmetic`
     never ran on a work history while the shared definition's own comment said
     it did. A fix to that one check would leave the mechanism intact, so the
     relation is DERIVED from the schemas here and asserted for every shared
     definition, present and future. */
  const schemas = new Map<string, Record<string, unknown>>();
  for (const name of readdirSync(schemasDir).sort()) {
    if (!name.endsWith(".json")) continue;
    schemas.set(name, readSchema(name));
  }
  assert.ok(schemas.size >= 3, `only ${String(schemas.size)} schemas were enumerated`);

  const users = sharedDefinitionUsers(schemas);
  assert.ok(
    users.has("report.schema.json#/$defs/gateResult"),
    `the enumeration found no cross-document $ref at all: ${[...users.keys()].join(", ")}`,
  );

  const registry = checksModule.registeredChecks();
  const holes: string[] = [];
  for (const [pointer, types] of users) {
    for (const check of registry) {
      if (!(check.guards ?? []).includes(pointer)) continue;
      const runsOn = checksModule.typesOf(check);
      for (const type of [...types].sort()) {
        if (!runsOn.includes(type)) {
          holes.push(
            `${check.id} guards ${pointer} but does not run on ${type} (it runs on ${runsOn.join(", ")})`,
          );
        }
      }
    }
  }
  assert.deepEqual(holes, []);

  /* THE DANGEROUS STATE, and it is the state this branch shipped in round 1
     rather than an invented one: the guarding check registered for the owning
     type alone. The assertion above is green with `alsoTypes` and red without
     it, which is what makes it a witness rather than a restatement. */
  const withoutAlsoTypes: DerivedCheck = {
    ...checksModule.reportParityArithmetic,
    alsoTypes: [],
  };
  const reddened: string[] = [];
  for (const [pointer, types] of users) {
    if (!(withoutAlsoTypes.guards ?? []).includes(pointer)) continue;
    for (const type of [...types].sort()) {
      if (!checksModule.typesOf(withoutAlsoTypes).includes(type)) {
        reddened.push(`${pointer} -> ${type}`);
      }
    }
  }
  assert.deepEqual(reddened, ["report.schema.json#/$defs/gateResult -> work-history"]);
});

/* ------------------------------------------------------------------ */
/* CR-003: a green result cannot report a failure                       */
/* ------------------------------------------------------------------ */

test("a green gate result carrying failures is rejected, and the guard is the same if/then that pins the exit code", () => {
  /* THE DANGEROUS INSTANCE: parity balances, the wrapper exit code is 0, and
     the record says 400 tests failed. The coupling that shipped bound `green`
     to the exit code and left the record free to contradict itself two lines
     below (M3-P4 round-1 finding CR-003). */
  const document = readTemplate("report.example.yaml");
  const result = (document["gate-results"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  result["passed"] = 105;
  result["failed"] = 400;
  assert.deepEqual(reportLines(document), [
    "INVALID #/gate-results/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/gate-results/0/failed value 400 does not equal the required constant 0",
  ]);
  /* AND THE ARITHMETIC IS SATISFIED, so the parity check is not what caught
     it. Without this line the arm would be green for the wrong reason. */
  assert.deepEqual(checkLines("report", document).lines, []);

  /* THE GUARDING KEYWORD REMOVED: the `const` on `failed` inside the `then`.
     Removing it alone leaves the exit-code coupling in place, so this arm
     names the keyword rather than the whole conditional. */
  const defanged = readSchema("report.schema.json");
  delete nodeAt(defanged, ["$defs", "gateResult", "then", "properties", "failed"])["const"];
  assert.deepEqual(reportLines(document, defanged), []);
  assert.ok(reportLines(document).length > 0);

  /* THE DECLARED-OPEN CONVERSE IS UNTOUCHED, and it is asserted rather than
     assumed, because closing it by accident is the way this fix could have
     gone wrong: a NOT-green result carrying `wrapper-exit-code: 0` and real
     failures is still ACCEPTED. A wrapper can exit 0 while the author judges
     the run not green, which is exactly the R-048 shape. */
  const notGreen = readTemplate("report.example.yaml");
  const amber = (notGreen["gate-results"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  amber["result"] = "amber";
  amber["wrapper-exit-code"] = 0;
  amber["passed"] = 105;
  amber["failed"] = 400;
  assert.deepEqual(reportLines(notGreen), []);
});

test("a gate result that ran and is not green must carry the wrapper exit code, while not-applicable owes nothing and the declared-open exit-0 residue survives", () => {
  /* THE MECHANISM (M3-P4 round-2 delta finding DV-003). Round 2 wrote that
     `result: red` owes nothing at all, no exit code and no counts, and called
     the whole thing structurally open. The COUNTS half is right: a red run
     frequently has no counts to give. The EXIT CODE half was not, and the
     distinction is the fix: a gate that RAN has a wrapper exit code by
     construction, so requiring its PRESENCE refuses no honest record, while
     requiring its VALUE would close the residue the schema deliberately
     leaves open. This test asserts both halves of that distinction. */
  const withResult = (record: Record<string, unknown>): Record<string, unknown> => {
    const document = readTemplate("report.example.yaml");
    (document["gate-results"] as Record<string, unknown>[]).push(record);
    return document;
  };

  /* THREE MEMBERS, one per result value that means THE GATE RAN. They are not
     three spellings of one shape: `red` is the value the finding named,
     `error` is a harness failure rather than a gate verdict, and `amber` is
     the partial one an author reaches for when neither fits. */
  for (const result of ["red", "amber", "error"]) {
    assert.deepEqual(
      reportLines(withResult({ gate: "citations", result })),
      ["INVALID #/gate-results/1 value matches no permitted alternative here"],
      result,
    );
  }

  /* THE GUARDING KEYWORD REMOVED: the `oneOf`, which sits BESIDE the if/then
     that pins green rather than replacing it. Removing it leaves every green
     obligation in place, so this arm names the new rule and nothing else. */
  const defanged = readSchema("report.schema.json");
  delete nodeAt(defanged, ["$defs", "gateResult"])["oneOf"];
  for (const result of ["red", "amber", "error"]) {
    assert.deepEqual(reportLines(withResult({ gate: "citations", result }), defanged), []);
  }
  /* RESTORED. */
  assert.ok(reportLines(withResult({ gate: "citations", result: "red" })).length > 0);

  /* THE DECLARED-OPEN RESIDUE, ASSERTED RATHER THAN ASSUMED, because trading
     it away is exactly how this fix could have gone wrong: a NOT-green result
     carrying `wrapper-exit-code: 0` is still accepted. The branch constrains
     presence and never value. */
  assert.deepEqual(
    reportLines(withResult({ gate: "citations", result: "red", "wrapper-exit-code": 0 })),
    [],
  );
  assert.deepEqual(
    reportLines(withResult({ gate: "citations", result: "red", "wrapper-exit-code": 1 })),
    [],
  );

  /* AND THE GATE THAT DID NOT RUN OWES NOTHING, which is the over-rejection
     control: `not-applicable` has no exit code to give and a branch split on
     "is not green" rather than on "ran" would have made that record
     unwritable. */
  assert.deepEqual(reportLines(withResult({ gate: "migrations", result: "not-applicable" })), []);

  /* THE GREEN DIAGNOSTICS ARE UNCHANGED BY THIS RULE, asserted because the
     `oneOf` could have doubled them: a green missing its exit code still
     reports the if/then's two lines and not a third from the alternation. */
  const greenMissing = readTemplate("report.example.yaml");
  delete (
    (greenMissing["gate-results"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["wrapper-exit-code"];
  assert.deepEqual(reportLines(greenMissing), [
    "INVALID #/gate-results/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/gate-results/0/wrapper-exit-code required property wrapper-exit-code is missing",
  ]);
});

test("a green gate result must carry the todo bucket, and parity counts it", () => {
  /* THE SIXTH COUNT. The M2-P3 wrapper's identity is
     `pass + fail + skipped + todo + did-not-run == reported`
     and the plan's field list named five, so a run reporting `todo > 0`
     could not be recorded without breaking parity: a contract that refuses a
     legitimate run. Taken into this round by the round-1 arbitration. */
  const missing = readTemplate("report.example.yaml");
  delete (
    (missing["gate-results"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["todo"];
  assert.deepEqual(reportLines(missing), [
    "INVALID #/gate-results/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/gate-results/0/todo required property todo is missing",
  ]);

  const defanged = readSchema("report.schema.json");
  const then = nodeAt(defanged, ["$defs", "gateResult", "then"]);
  then["required"] = (then["required"] as string[]).filter((name) => name !== "todo");
  assert.deepEqual(reportLines(missing, defanged), []);
  assert.ok(reportLines(missing).length > 0);

  /* AND THE RUN THE OLD VOCABULARY COULD NOT RECORD AT ALL is now
     recordable: one todo test, parity satisfied, accepted by keywords and by
     the derived check. This is the direction the gap actually hurt. */
  const withTodo = readTemplate("report.example.yaml");
  const result = (withTodo["gate-results"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  result["passed"] = 504;
  result["todo"] = 1;
  assert.deepEqual(reportLines(withTodo), []);
  assert.deepEqual(checkLines("report", withTodo).lines, []);

  /* AND `todo` IS IN THE PARITY SUM rather than merely present: the same
     record with the bucket unaccounted for is red. */
  const unbalanced = readTemplate("report.example.yaml");
  (
    (unbalanced["gate-results"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["todo"] = 1;
  assert.deepEqual(checkLines("report", unbalanced).lines, [
    "INVALID #/gate-results/0 discovered 507 does not equal passed + failed + skipped + todo + did-not-run = 508 (check: report-parity-arithmetic)",
  ]);
});

/* ------------------------------------------------------------------ */
/* CR-002: the enum branch that requires nothing                        */
/* ------------------------------------------------------------------ */

test("an impossibility filed as an open question is rejected, while an honest open question still needs nothing", () => {
  /* THE MECHANISM (M3-P4 round-1 finding CR-002): AN ENUM BRANCH THAT
     REQUIRES NOTHING MAKES EVERY SIBLING BRANCH THAT REQUIRES SOMETHING
     OPTIONAL, BECAUSE THE AUTHOR PICKS THE BRANCH. Closing the enum shut the
     route through an INVENTED kind; the route through the cheapest DECLARED
     kind stayed open, and it is the one an author reaches for.

     MEMBER 1: the sentence the shipped schema comment names as the one that
     "needs a construction", filed as open-question. */
  const asserted = readTemplate("report.example.yaml");
  (asserted["claims"] as Record<string, unknown>[])[0] = {
    id: "X-1",
    kind: "open-question",
    statement:
      "This arm cannot be forced here. There is no path that reaches it, and no construction exists that would.",
  };
  assert.deepEqual(reportLines(asserted), [
    "INVALID #/claims/0 value matches no permitted alternative here",
  ]);

  /* MEMBER 2, STRUCTURALLY DIFFERENT: different tokens (`never`, `impossible`,
     `always` rather than `cannot be` and `there is no path`), a different
     sentence shape, and no `no ... that` construction at all. */
  const emphatic = readTemplate("report.example.yaml");
  (emphatic["claims"] as Record<string, unknown>[])[0] = {
    id: "X-2",
    kind: "open-question",
    statement:
      "The lease is never taken twice; it is impossible for two holders to coexist, and this always holds.",
  };
  assert.deepEqual(reportLines(emphatic), [
    "INVALID #/claims/0 value matches no permitted alternative here",
  ]);

  /* THE HONEST USE IS STILL CHEAP, which the plan asks for and this round was
     told not to reverse. `I did not find a way to force this arm` carries
     none of the thirteen tokens and needs nothing. */
  const honest = readTemplate("report.example.yaml");
  (honest["claims"] as Record<string, unknown>[])[0] = {
    id: "X-5",
    kind: "open-question",
    statement:
      "I did not find a way to force the ENOENT arm here, and I did not try a symlink loop.",
  };
  assert.deepEqual(reportLines(honest), []);

  /* AND THE SAME ASSERTION IS FILEABLE, at its own price: as an
     `impossibility` with an executed construction. The rule redirects the
     record rather than forbidding it. */
  const filed = readTemplate("report.example.yaml");
  (filed["claims"] as Record<string, unknown>[])[0] = {
    id: "X-6",
    kind: "impossibility",
    statement: "This arm cannot be forced here.",
    "settled-by": {
      "executed-construction": {
        command: "node -e 'require(\"node:fs\").symlinkSync(p, p)'",
        "exit-code": 1,
        output: "Error: ELOOP: too many symbolic links encountered",
      },
    },
  };
  assert.deepEqual(reportLines(filed), []);

  /* THE GUARDING KEYWORD REMOVED: the `pattern` on the open-question
     branch's `statement`, and nothing else. `minLength` stays, so this arm
     cannot be green because the field became unconstrained. */
  const defanged = readSchema("report.schema.json");
  const branch = nodeAt(defanged, ["$defs", "claim", "oneOf"]) as unknown as Record<
    string,
    unknown
  >[];
  const openQuestion = branch[2] as Record<string, unknown>;
  delete nodeAt(openQuestion, ["properties", "statement"])["pattern"];
  assert.deepEqual(reportLines(asserted, defanged), []);
  assert.deepEqual(reportLines(emphatic, defanged), []);
  assert.ok(reportLines(asserted).length > 0);
});

test("an impossibility filed as a universal claim is rejected, and an ordinary universal claim is not", () => {
  /* THE SECOND MEMBER OF CR-002'S CLASS, and structurally different from the
     first: `open-question` requires NOTHING, so it escapes everything;
     `universal` requires a counter-experiment, which is a SENTENCE, so
     filing an impossibility here downgrades an executed construction to
     prose. Both are the same mechanism and neither witnesses the other. */
  const downgraded = readTemplate("report.example.yaml");
  (downgraded["claims"] as Record<string, unknown>[])[0] = {
    id: "X-3",
    kind: "universal",
    statement: "It is impossible to force the ENOENT arm here.",
    "settled-by": {
      "counter-experiment": "I thought about it and concluded there is nothing to try.",
    },
  };
  const lines = reportLines(downgraded);
  assert.ok(
    lines.includes("INVALID #/claims/0 value matches no permitted alternative here"),
    lines.join("\n"),
  );

  /* AN ORDINARY UNIVERSAL CLAIM IS UNAFFECTED. The universal tokens are
     deliberately NOT in this branch's pattern: `the lease is never held by
     two holders at once` is exactly what this branch is for. */
  const ordinary = readTemplate("report.example.yaml");
  (ordinary["claims"] as Record<string, unknown>[])[0] = {
    id: "X-7",
    kind: "universal",
    statement: "The lease is never held by two holders at once.",
    "settled-by": {
      "counter-experiment":
        "Two writers raced the lease 200 times under forced contention and no pair overlapped.",
    },
  };
  assert.deepEqual(reportLines(ordinary), []);

  const defanged = readSchema("report.schema.json");
  const branches = nodeAt(defanged, ["$defs", "claim", "oneOf"]) as unknown as Record<
    string,
    unknown
  >[];
  delete nodeAt(branches[0] as Record<string, unknown>, ["properties", "statement"])[
    "pattern"
  ];
  assert.deepEqual(reportLines(downgraded, defanged), []);
  assert.ok(reportLines(downgraded).length > 0);
});

/* ------------------------------------------------------------------ */
/* CR-005: the universal quantifier in this repository's own register    */
/* ------------------------------------------------------------------ */

test("an ALL-CAPS universal quantifier is caught, in analysis and in an evidence note", () => {
  /* THE HOLE (M3-P4 round-1 finding CR-005): the alternation admitted the
     lowercase and sentence-initial forms only, so `NEVER` passed while
     `never` was correctly rejected, and 83 occurrences of these tokens in
     CAPITALS sit in 39 tracked files because that is this repository's house
     register for emphasis.

     MEMBER 1: `NEVER` in `findings[].analysis`. */
  const shouted = readTemplate("report.example.yaml");
  const finding = (shouted["findings"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  finding["analysis"] = "This arm can NEVER be reached.";
  assert.deepEqual(reportLines(shouted), [
    "INVALID #/findings/0 value matches no permitted alternative here",
  ]);

  /* MEMBER 2, a different token, a different case pattern and a DIFFERENT
     OBJECT AT A DIFFERENT DEPTH: `ALL CASES` inside an evidence note, whose
     guard is the evidence item's if/then rather than the finding's oneOf. */
  const noted = readTemplate("report.example.yaml");
  const evidence = (
    (noted["findings"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["evidence"] as Record<string, unknown>[];
  (evidence[0] as Record<string, unknown>)["note"] = "In ALL CASES this holds.";
  assert.deepEqual(reportLines(noted), [
    "INVALID #/findings/0/evidence/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/findings/0/evidence/0/counter-experiment required property counter-experiment is missing",
  ]);

  /* MEMBER 3: mixed case, which an ALL-CAPS-only widening would have missed.
     The fix is a character class per letter, not five more literals. */
  const mixed = readTemplate("report.example.yaml");
  (
    (mixed["findings"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["analysis"] = "The lease is AlWaYs held by exactly one holder.";
  assert.deepEqual(reportLines(mixed), [
    "INVALID #/findings/0 value matches no permitted alternative here",
  ]);

  /* THE CONTROL that makes the three credible: the lowercase form was
     ALREADY caught, so these arms measure the case hole and not the guard's
     absence. */
  const lower = readTemplate("report.example.yaml");
  (
    (lower["findings"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["analysis"] = "This arm can never be reached.";
  assert.deepEqual(reportLines(lower), [
    "INVALID #/findings/0 value matches no permitted alternative here",
  ]);

  const defanged = readSchema("report.schema.json");
  delete nodeAt(defanged, ["$defs", "finding"])["oneOf"];
  assert.deepEqual(reportLines(shouted, defanged), []);
  assert.deepEqual(reportLines(mixed, defanged), []);
  assert.ok(reportLines(shouted).length > 0);
});

test("the finding's non-universal branch is the exact complement of the shared quantifier pattern", () => {
  /* The two patterns are written out separately because JSON Schema cannot
     negate a `$ref`, so they can DRIFT: a gap admits a subject matching
     neither branch and an overlap admits one matching both, and either
     breaks the `oneOf` silently. Derived here rather than eyeballed. */
  const schema = readSchema("report.schema.json");
  const positive = nodeAt(schema, ["$defs", "universalQuantifier"])["pattern"] as string;
  const branches = nodeAt(schema, ["$defs", "finding", "oneOf"]) as unknown as Record<
    string,
    unknown
  >[];
  const negative = nodeAt(branches[0] as Record<string, unknown>, [
    "properties",
    "analysis",
  ])["pattern"] as string;
  assert.equal(negative, `^(?:(?!${positive})[\\s\\S])*$`);

  /* AND THE COMMENT'S OWN EXAMPLE LIST IS TRUE (finding CR-006): the shipped
     text once named `in every case` as a token that passes, and it does not,
     because `every` matches under a word boundary. */
  const expression = new RegExp(positive, "u");
  assert.equal(expression.test("This holds in every case."), true);
  assert.equal(expression.test("There is no path that reaches it."), false);
  assert.equal(expression.test("This is guaranteed."), false);
});

/* ------------------------------------------------------------------ */
/* The empty findings array, Kind B                                     */
/* ------------------------------------------------------------------ */

test("a report with no findings and no statement is rejected, and so is a statement beside real findings", () => {
  /* KIND B BY NECESSITY: `maxItems` is absent from the sixteen keywords of
     the declared authoring vocabulary, and no other permitted keyword says
     "this array is empty", so the emptiness of a sibling array is not a
     keyword property. The check exists because the round-1 arbitration
     amended section 2.3's table to three rows for this phase.

     DIRECTION 1, the one the rule is for: silence priced at nothing. */
  const silent = readTemplate("report.example.yaml");
  silent["findings"] = [];
  assert.deepEqual(reportLines(silent), [], "the keywords accept it, which is the point");
  const silentRun = checkLines("report", silent);
  assert.equal(silentRun.failed, true);
  assert.deepEqual(silentRun.lines, [
    "INVALID #/no-findings-statement findings is empty and no-findings-statement is missing, so the report claims nothing was found without saying why (check: report-no-findings-statement)",
  ]);

  /* THE HONEST EMPTY REPORT IS STILL WRITABLE, and cheaply: one sentence. */
  const stated = readTemplate("report.example.yaml");
  stated["findings"] = [];
  stated["no-findings-statement"] =
    "Every criterion was walked and nothing was found; the derivation and its non-coverage are recorded above.";
  assert.deepEqual(checkLines("report", stated).lines, []);

  /* DIRECTION 2, the converse the requirement's letter does not name: a
     no-findings statement sitting beside three real findings. */
  const contradictory = readTemplate("report.example.yaml");
  contradictory["no-findings-statement"] = "Nothing was found.";
  assert.deepEqual(checkLines("report", contradictory).lines, [
    "INVALID #/no-findings-statement no-findings-statement is present beside 3 finding(s), so the report contradicts itself (check: report-no-findings-statement)",
  ]);

  /* THE CHECK DEREGISTERED (Kind B witness), and restored. */
  assert.equal(checksModule.deregisterCheck("report-no-findings-statement"), true);
  try {
    assert.deepEqual(checkLines("report", silent).lines, []);
    assert.equal(checkLines("report", silent).failed, false);
    assert.deepEqual(checkLines("report", contradictory).lines, []);
  } finally {
    checksModule.registerCheck(checksModule.reportNoFindingsStatement);
  }
  assert.equal(checkLines("report", silent).failed, true);
});
