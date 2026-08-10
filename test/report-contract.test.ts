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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  reportParityArithmetic: DerivedCheck;
  finalReportFindingParity: DerivedCheck;
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
    "INVALID #/gate-results/0 discovered 600 does not equal passed + failed + skipped + did-not-run = 507 (check: report-parity-arithmetic)",
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
    "INVALID #/gate-results/0 discovered 507 does not equal passed + failed + skipped + did-not-run = 902 (check: report-parity-arithmetic)",
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
     all. A check that skipped these would let a green be recorded with four
     of the five counts, which is arithmetic that adds up while a row is
     lost one level down. */
  const partial = readTemplate("report.example.yaml");
  delete (
    (partial["gate-results"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["skipped"];
  assert.deepEqual(checkLines("report", partial).lines, [
    "INVALID #/gate-results/0 gate result records 4 of the 5 counts and omits skipped, so parity cannot be computed (check: report-parity-arithmetic)",
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

  /* The same field with real text is accepted, which is the other direction
     the criterion asks for. */
  const stated = readTemplate("report.example.yaml");
  stated["no-findings-statement"] = "Three findings are recorded above.";
  assert.deepEqual(reportLines(stated), []);

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
     re-test the alternation at every character. */
  const nearMiss = `${"alway neve ever ".repeat(8000)}x`;
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
});
