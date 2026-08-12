/**
 * THE VERDICT CONTRACT TESTS (kernel plan M3, M3-P7 criteria 4, 4b and 4e).
 *
 * TWO WITNESS DISCIPLINES, and section 2.3 keeps them apart on purpose.
 * Criterion 4 is KIND A: the dangerous instance is rejected by a SCHEMA
 * KEYWORD, and the witness is removing that keyword from a decoded copy of
 * the shipped schema and seeing the same instance accepted.
 * Criteria 4b and 4e are KIND B: the rule compares this document against a
 * DIFFERENT one, so the witness is deregistering and restoring the CHECK. A
 * Kind B criterion offering a keyword witness would have misclassified
 * itself, and a Kind A one offering a check witness would be claiming the
 * schema does less than it does.
 *
 * EVERY DANGEROUS INSTANCE HERE IS STRUCTURALLY PLAUSIBLE (section 2.3 rule
 * 1): well formed YAML, every other field present and correct, violating
 * precisely the property the contract exists to enforce and nothing else. A
 * fixture that broke two rules at once could not tell which keyword caught it.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const schemasDir = join(repoRoot, "schemas");

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
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
  verdictCriteriaComplete: DerivedCheck;
  verdictDeviationsJudged: DerivedCheck;
  verdictHazardClassesAddressed: DerivedCheck;
};

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  validateToLines: (schema: Record<string, unknown>, instance: unknown) => string[];
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-verdict-"));
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function verdictSchema(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(schemasDir, "verdict.schema.json"), "utf8"),
  ) as Record<string, unknown>;
}

function loadPlan(): Record<string, unknown> {
  return yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
}

/**
 * The shipped work-history template, re-pointed at the example plan's phase.
 *
 * THE TWO TEMPLATES NAME DIFFERENT PHASES (`M3-P4` and `M9-P1`), and a
 * verdict joins them, so a staged context has to be internally consistent or
 * `verdict-deviations-judged` reddens on the wrong-phase rule and every other
 * assertion in the test becomes unreachable. The re-point is done HERE, once,
 * rather than per test, and the wrong-phase rule keeps its own dedicated test
 * where the mismatch is the thing under examination.
 */
function loadWorkHistory(): Record<string, unknown> {
  const history = yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "work-history.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
  const phase = (loadPlan()["phases"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  history["phase"] = String(phase["id"]);
  return history;
}

function writeYaml(dir: string, name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, yamlModule.stringify(value));
  return path;
}

/**
 * A valid `criteria` verdict for the shipped example plan's one phase.
 *
 * DERIVED FROM THE PLAN AND THE WORK HISTORY AT RUN TIME rather than
 * hand-listed, so a template that gains a criterion does not silently leave
 * this fixture incomplete and turn a Kind B check's red into a fixture bug.
 */
function baselineVerdict(): Record<string, unknown> {
  const phase = (loadPlan()["phases"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  const history = loadWorkHistory();
  return {
    kind: "verdict",
    phase: String(phase["id"]),
    verdict: "APPROVE",
    "produced-by": "a model family recorded here because DR-0012 compares two reviews on it",
    framing: "criteria-contract",
    "review-contract": "criteria",
    findings: [],
    criteria: (phase["acceptance"] as Record<string, unknown>[]).map((criterion) => ({
      id: String(criterion["id"]),
      quote: String(criterion["criterion"]),
      evidence: ["src/example.ts:1"],
      met: true,
    })),
    "deviations-judged": (history["deviations"] as Record<string, unknown>[]).map(
      (deviation) => ({
        deviation: String(deviation["plan-clause"]),
        "serves-plan-intent": true,
        reasoning: "The deviation stays inside what the plan clause was protecting.",
      }),
    ),
  };
}

/** The same, as a HAZARD verdict, complete against the phase's classes. */
function baselineHazardVerdict(): Record<string, unknown> {
  const phase = (loadPlan()["phases"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  const verdict = baselineVerdict();
  verdict["review-contract"] = "hazard";
  verdict["framing"] = "destructive-paths";
  verdict["hazard-classes-addressed"] = (
    phase["hazard-classes"] as Record<string, unknown>[]
  ).map((hazardClass) => ({
    "class-id": String(hazardClass["id"]),
    probed: "Built the state the class names and ran the code at it.",
    "cleared-because": "The constructed state did not reproduce the hazard.",
  }));
  return verdict;
}

/**
 * A Kind A witness: the dangerous instance is rejected by the shipped schema,
 * and ACCEPTED once the guarding keyword is removed from a decoded copy.
 *
 * The copy is what is mutated. The shipped document is never edited, because
 * an edit-and-restore in a tree holding uncommitted work is how four rounds
 * of work were lost here once already.
 */
function assertKeywordGuards(
  instance: unknown,
  removeKeyword: (schema: Record<string, unknown>) => void,
  expected: RegExp,
): void {
  const shipped = verdictSchema();
  const rejected = validateModule.validateToLines(shipped, instance);
  assert.ok(rejected.length > 0, "the shipped schema accepted the dangerous instance");
  assert.ok(
    rejected.some((line) => expected.test(line)),
    `no line matched ${String(expected)}:\n${rejected.join("\n")}`,
  );

  const defanged = verdictSchema();
  removeKeyword(defanged);
  const accepted = validateModule.validateToLines(defanged, instance);
  assert.deepEqual(
    accepted,
    [],
    `removing the guarding keyword left the instance rejected, so this witness names the wrong keyword:\n${accepted.join("\n")}`,
  );
}

/* ------------------------------------------------------------------ */
/* The control: the shipped schema accepts an honest verdict            */
/* ------------------------------------------------------------------ */

test("a complete criteria verdict validates through the CLI", () => {
  const dir = scratch();
  try {
    const file = writeYaml(dir, "verdict.yaml", baselineVerdict());
    writeYaml(dir, "plan.yaml", loadPlan());
    writeYaml(dir, "work-history.yaml", loadWorkHistory());
    const run = runCli(["validate", "--type", "verdict", "--context", dir, file]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a complete hazard verdict validates through the CLI, and --type auto resolves it", () => {
  const dir = scratch();
  try {
    const file = writeYaml(dir, "verdict.yaml", baselineHazardVerdict());
    writeYaml(dir, "plan.yaml", loadPlan());
    writeYaml(dir, "work-history.yaml", loadWorkHistory());
    assert.equal(
      runCli(["validate", "--type", "verdict", "--context", dir, file]).status,
      0,
    );
    const auto = runCli(["validate", "--type", "auto", "--context", dir, file]);
    assert.equal(auto.status, 0, auto.stdout + auto.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4(a): APPROVE beside a high finding                        */
/* ------------------------------------------------------------------ */

test("APPROVE with a finding of severity high is rejected, and is accepted once the guarding enum inside then is removed", () => {
  /* THE EXACT SHAPE of a review that says yes while recording a reason to say
     no, which is how a fix round gets skipped. */
  const instance = baselineVerdict();
  instance["findings"] = [
    {
      id: "CR-001",
      severity: "high",
      evidence: ["src/lock.ts:120, the renewal path accepts an equal expiry"],
      "concrete-fix": "Compare strictly and reject an equal expiry.",
    },
  ];
  assertKeywordGuards(
    instance,
    (schema) => {
      /* THE GUARDING KEYWORD IS THE `enum` INSIDE `then`, not `then` itself.
         Deleting `then` while `if` remains is refused at COMPILATION by this
         validator's strict policy ("schema is refused by this validator's
         strict policy"), which is a refusal of the SCHEMA rather than an
         acceptance of the instance, so it would witness nothing. Removing the
         enum leaves a well formed `then` that constrains nothing, which is
         exactly the defanged schema this witness needs. */
      delete ((schema["then"] as Record<string, unknown>)["properties"] as Record<
        string,
        unknown
      >)["verdict"];
    },
    /^INVALID #\/verdict value "APPROVE" is not one of the permitted values/,
  );
});

test("APPROVE with a finding of severity critical is rejected too, which is wider than the criterion names", () => {
  /* Criterion 4(a) names `high`. `critical` OUTRANKS it, and a rule that
     stopped at high would let the worse finding through, so the shipped
     `contains` matches both. Stated as a deliberate widening rather than
     discovered later. */
  const instance = baselineVerdict();
  instance["findings"] = [
    {
      id: "CR-002",
      severity: "critical",
      evidence: ["src/teardown.ts:44, the destroy runs before the branch check"],
      "concrete-fix": "Check the branch for unpushed commits before destroying.",
    },
  ];
  const rejected = validateModule.validateToLines(verdictSchema(), instance);
  assert.ok(
    rejected.some((line) => /^INVALID #\/verdict /.test(line)),
    rejected.join("\n"),
  );
});

test("FIX-ROUND-NEEDED with a high finding is accepted, so the rule is about the pairing and not about severity", () => {
  /* THE CONTROL. Without it the two tests above would be green against a
     schema that rejected every high finding, which is a different and wrong
     rule. */
  const instance = baselineVerdict();
  instance["verdict"] = "FIX-ROUND-NEEDED";
  instance["findings"] = [
    {
      id: "CR-003",
      severity: "high",
      evidence: ["src/lock.ts:120"],
      "concrete-fix": "Compare strictly.",
    },
  ];
  assert.deepEqual(validateModule.validateToLines(verdictSchema(), instance), []);
});

test("APPROVE with a low finding is accepted, so the contains subschema discriminates on severity", () => {
  const instance = baselineVerdict();
  instance["findings"] = [
    {
      id: "CR-004",
      severity: "low",
      evidence: ["src/status.ts:12"],
      "concrete-fix": "Rename the local for clarity.",
    },
  ];
  assert.deepEqual(validateModule.validateToLines(verdictSchema(), instance), []);
});

/* ------------------------------------------------------------------ */
/* Criterion 4(b): a finding with no concrete fix                       */
/* ------------------------------------------------------------------ */

test("a FIX-ROUND-NEEDED finding with no concrete-fix is rejected, and is accepted once concrete-fix leaves required", () => {
  const instance = baselineVerdict();
  instance["verdict"] = "FIX-ROUND-NEEDED";
  instance["findings"] = [
    {
      id: "CR-005",
      severity: "medium",
      evidence: ["src/pool.ts:88, two acquirers can both observe a free slot"],
    },
  ];
  assertKeywordGuards(
    instance,
    (schema) => {
      const finding = ((schema["$defs"] as Record<string, unknown>)["finding"] as Record<
        string,
        unknown
      >);
      finding["required"] = (finding["required"] as string[]).filter(
        (name) => name !== "concrete-fix",
      );
    },
    /^INVALID #\/findings\/0\/concrete-fix required property concrete-fix is missing$/,
  );
});

test("a low finding with no concrete-fix is rejected too, which is stronger than the criterion asks", () => {
  /* A low finding with no proposed edit is a remark, and a review made of
     remarks is the empty review with extra steps. Recorded as a deliberate
     strengthening. */
  const instance = baselineVerdict();
  instance["findings"] = [
    { id: "CR-006", severity: "low", evidence: ["src/status.ts:12"] },
  ];
  const rejected = validateModule.validateToLines(verdictSchema(), instance);
  assert.ok(
    rejected.some((line) => line.includes("required property concrete-fix is missing")),
    rejected.join("\n"),
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 4(c): no produced-by, no framing                           */
/* ------------------------------------------------------------------ */

test("a verdict with no produced-by is rejected, and is accepted once produced-by leaves required", () => {
  const instance = baselineVerdict();
  delete instance["produced-by"];
  assertKeywordGuards(
    instance,
    (schema) => {
      schema["required"] = (schema["required"] as string[]).filter(
        (name) => name !== "produced-by",
      );
    },
    /^INVALID #\/produced-by required property produced-by is missing$/,
  );
});

test("a verdict with no framing is rejected, and is accepted once framing leaves required", () => {
  /* TWO STRUCTURALLY DIFFERENT MEMBERS of one class (CLAUDE.md, one witness
     is not a class): both fields are guarded by the same keyword on the same
     object, and a witness that removed only one would leave the other
     unmeasured. They are two entries in the same `required` list, which is
     the weakest kind of difference, so it is stated as such rather than
     claimed as strong decorrelation. */
  const instance = baselineVerdict();
  delete instance["framing"];
  assertKeywordGuards(
    instance,
    (schema) => {
      schema["required"] = (schema["required"] as string[]).filter(
        (name) => name !== "framing",
      );
    },
    /^INVALID #\/framing required property framing is missing$/,
  );
});

test("a verdict outside the two-value vocabulary is rejected", () => {
  const instance = baselineVerdict();
  instance["verdict"] = "APPROVE WITH COMMENTS";
  assertKeywordGuards(
    instance,
    (schema) => {
      delete ((schema["properties"] as Record<string, unknown>)["verdict"] as Record<
        string,
        unknown
      >)["enum"];
    },
    /^INVALID #\/verdict value "APPROVE WITH COMMENTS" is not one of the permitted values/,
  );
});

test("a hazard verdict with no hazard-classes-addressed is rejected by the oneOf", () => {
  const instance = baselineHazardVerdict();
  delete instance["hazard-classes-addressed"];
  const rejected = validateModule.validateToLines(verdictSchema(), instance);
  assert.ok(rejected.length > 0, rejected.join("\n"));
});

test("a hazard-class entry with neither a finding nor a cleared-because is rejected, and one with both is rejected too", () => {
  /* The either-or is a `oneOf`, so an entry carrying BOTH matches both
     branches and is invalid as well. A class both cleared and found is a
     contradiction the reader cannot resolve, so that is deliberate. */
  const neither = baselineHazardVerdict();
  (neither["hazard-classes-addressed"] as Record<string, unknown>[]).forEach((entry) => {
    delete entry["cleared-because"];
  });
  assert.ok(validateModule.validateToLines(verdictSchema(), neither).length > 0);

  const both = baselineHazardVerdict();
  ((both["hazard-classes-addressed"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >)["finding"] = "CR-007";
  assert.ok(validateModule.validateToLines(verdictSchema(), both).length > 0);
});

/* ------------------------------------------------------------------ */
/* Criterion 4b(a): verdict-criteria-complete, Kind B                   */
/* ------------------------------------------------------------------ */

test("a verdict omitting an acceptance criterion of its phase is rejected naming the check, and passes with the check deregistered", () => {
  const dir = scratch();
  try {
    const plan = loadPlan();
    writeYaml(dir, "plan.yaml", plan);
    writeYaml(dir, "work-history.yaml", loadWorkHistory());
    /* THE DANGEROUS INSTANCE: a review that quietly skipped a criterion.
       Every entry present is well formed and the schema is satisfied; the one
       criterion nobody walked is invisible without the other document. */
    const instance = baselineVerdict();
    const walked = instance["criteria"] as Record<string, unknown>[];
    assert.ok(walked.length >= 2, "the example plan has too few criteria to omit one");
    const dropped = String((walked.pop() as Record<string, unknown>)["id"]);
    const file = writeYaml(dir, "verdict.yaml", instance);

    const rejected = runCli(["validate", "--type", "verdict", "--context", dir, file]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      new RegExp(
        `^INVALID #/criteria acceptance criterion ${dropped} of phase .* has no entry, so this review did not walk it \\(check: verdict-criteria-complete\\)$`,
        "m",
      ),
      rejected.stdout,
    );

    /* KIND B WITNESS: the CHECK is removed, not a keyword. */
    assert.equal(checksModule.deregisterCheck("verdict-criteria-complete"), true);
    const withoutCheck = checksModule.runChecks("verdict", instance, dir);
    assert.equal(withoutCheck.failed, false, withoutCheck.lines.join("\n"));
    checksModule.registerCheck(checksModule.verdictCriteriaComplete);
    assert.equal(checksModule.runChecks("verdict", instance, dir).failed, true);

    /* CONTROL: the complete verdict passes against the same plan. */
    const complete = writeYaml(dir, "complete.yaml", baselineVerdict());
    const control = runCli(["validate", "--type", "verdict", "--context", dir, complete]);
    assert.equal(control.status, 0, control.stdout + control.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a verdict walking a criterion the phase does not declare is rejected, which is the other direction", () => {
  const dir = scratch();
  try {
    writeYaml(dir, "plan.yaml", loadPlan());
    writeYaml(dir, "work-history.yaml", loadWorkHistory());
    /* Usually a criterion id left behind by a plan revision: the review walked
       something that is no longer in the contract, and reported it as met. */
    const instance = baselineVerdict();
    (instance["criteria"] as Record<string, unknown>[]).push({
      id: "99",
      quote: "A criterion this plan does not declare.",
      evidence: ["src/example.ts:1"],
      met: true,
    });
    const file = writeYaml(dir, "verdict.yaml", instance);
    const run = runCli(["validate", "--type", "verdict", "--context", dir, file]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(
      run.stdout,
      /criterion 99 is walked here and .* declares no such acceptance criterion on this phase \(check: verdict-criteria-complete\)/,
      run.stdout,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a verdict naming a phase the plan does not declare is rejected rather than passing vacuously", () => {
  const dir = scratch();
  try {
    writeYaml(dir, "plan.yaml", loadPlan());
    writeYaml(dir, "work-history.yaml", loadWorkHistory());
    const instance = baselineVerdict();
    instance["phase"] = "M9-P404";
    const file = writeYaml(dir, "verdict.yaml", instance);
    const run = runCli(["validate", "--type", "verdict", "--context", dir, file]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /declares no phase M9-P404/, run.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the verdict checks require a context and are SKIPPED rather than passing without one", () => {
  const outcome = checksModule.runChecks("verdict", baselineVerdict(), undefined);
  assert.equal(outcome.failed, true);
  for (const id of [
    "verdict-criteria-complete",
    "verdict-deviations-judged",
    "verdict-hazard-classes-addressed",
  ]) {
    assert.ok(
      outcome.lines.includes(`SKIPPED ${id} no context`),
      outcome.lines.join("\n"),
    );
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4b(b): verdict-deviations-judged, Kind B (M3R-005)         */
/* ------------------------------------------------------------------ */

test("a verdict omitting a deviation declared in the work history is rejected naming the check, and passes with the check deregistered", () => {
  const dir = scratch();
  try {
    const history = loadWorkHistory();
    writeYaml(dir, "plan.yaml", loadPlan());
    writeYaml(dir, "work-history.yaml", history);
    /* M3R-005's shape: the reviewer silently skipped judging one of the
       declared deviations, and every criterion still passed. */
    const instance = baselineVerdict();
    const judged = instance["deviations-judged"] as Record<string, unknown>[];
    assert.ok(judged.length >= 2, "the example work history has too few deviations to omit one");
    const dropped = String((judged.pop() as Record<string, unknown>)["deviation"]);
    const file = writeYaml(dir, "verdict.yaml", instance);

    const rejected = runCli(["validate", "--type", "verdict", "--context", dir, file]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.ok(
      rejected.stdout.includes(`deviation ${dropped} is declared in`) &&
        rejected.stdout.includes("(check: verdict-deviations-judged)"),
      rejected.stdout,
    );

    assert.equal(checksModule.deregisterCheck("verdict-deviations-judged"), true);
    const withoutCheck = checksModule.runChecks("verdict", instance, dir);
    assert.equal(withoutCheck.failed, false, withoutCheck.lines.join("\n"));
    checksModule.registerCheck(checksModule.verdictDeviationsJudged);
    assert.equal(checksModule.runChecks("verdict", instance, dir).failed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a work history for a different phase is refused rather than compared", () => {
  const dir = scratch();
  try {
    writeYaml(dir, "plan.yaml", loadPlan());
    const history = loadWorkHistory();
    history["phase"] = "M9-P404";
    writeYaml(dir, "work-history.yaml", history);
    /* THE VACUOUS PASS THIS CLOSES: comparing against the wrong document's
       deviation list would let the check pass while judging nothing. */
    const file = writeYaml(dir, "verdict.yaml", baselineVerdict());
    const run = runCli(["validate", "--type", "verdict", "--context", dir, file]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /is the work history of phase M9-P404 and this verdict reviews /, run.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4e: verdict-hazard-classes-addressed, Kind B (T-007)       */
/* ------------------------------------------------------------------ */

test("a hazard verdict omitting a declared hazard class is rejected naming the class and the check, and passes with the check deregistered", () => {
  const dir = scratch();
  try {
    const plan = loadPlan();
    writeYaml(dir, "plan.yaml", plan);
    writeYaml(dir, "work-history.yaml", loadWorkHistory());
    const instance = baselineHazardVerdict();
    const addressed = instance["hazard-classes-addressed"] as Record<string, unknown>[];
    assert.ok(addressed.length >= 2, "the example phase has too few hazard classes to omit one");
    const dropped = String((addressed.pop() as Record<string, unknown>)["class-id"]);
    const file = writeYaml(dir, "verdict.yaml", instance);

    const rejected = runCli(["validate", "--type", "verdict", "--context", dir, file]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      new RegExp(
        `^INVALID #/hazard-classes-addressed hazard class ${dropped} of phase .* did not address it \\(check: verdict-hazard-classes-addressed\\)$`,
        "m",
      ),
      rejected.stdout,
    );

    assert.equal(checksModule.deregisterCheck("verdict-hazard-classes-addressed"), true);
    const withoutCheck = checksModule.runChecks("verdict", instance, dir);
    assert.equal(withoutCheck.failed, false, withoutCheck.lines.join("\n"));
    checksModule.registerCheck(checksModule.verdictHazardClassesAddressed);
    assert.equal(checksModule.runChecks("verdict", instance, dir).failed, true);

    /* THE COMPLETE HAZARD VERDICT exits 0 against the same plan. */
    const complete = writeYaml(dir, "complete.yaml", baselineHazardVerdict());
    const control = runCli(["validate", "--type", "verdict", "--context", dir, complete]);
    assert.equal(control.status, 0, control.stdout + control.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a criteria verdict is unaffected by the hazard completeness check, so the rule applies exactly where the contract does", () => {
  const dir = scratch();
  try {
    writeYaml(dir, "plan.yaml", loadPlan());
    writeYaml(dir, "work-history.yaml", loadWorkHistory());
    /* ASSERTED RATHER THAN IMPLIED (criterion 4e). A check that reddened the
       criteria arm would push reviewers to fill the array with nothing, which
       is the contract-avoidance shape the hazard checklist itself probes for. */
    const criteria = baselineVerdict();
    const outcome = checksModule.runChecks("verdict", criteria, dir);
    assert.equal(outcome.failed, false, outcome.lines.join("\n"));
    assert.ok(
      !outcome.lines.some((line) => line.includes("verdict-hazard-classes-addressed")),
      outcome.lines.join("\n"),
    );
    /* And the SAME document with only `review-contract` flipped is red, so the
       green above is the contract discriminating rather than the check being
       inert. */
    const flipped = baselineVerdict();
    flipped["review-contract"] = "hazard";
    const flippedOutcome = checksModule.runChecks("verdict", flipped, dir);
    assert.equal(flippedOutcome.failed, true, flippedOutcome.lines.join("\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a hazard verdict addressing a class the phase does not declare is rejected, which is the other direction", () => {
  const dir = scratch();
  try {
    writeYaml(dir, "plan.yaml", loadPlan());
    writeYaml(dir, "work-history.yaml", loadWorkHistory());
    const instance = baselineHazardVerdict();
    (instance["hazard-classes-addressed"] as Record<string, unknown>[]).push({
      "class-id": "H99",
      probed: "Probed a class this plan does not declare.",
      "cleared-because": "There was nothing to clear.",
    });
    const file = writeYaml(dir, "verdict.yaml", instance);
    const run = runCli(["validate", "--type", "verdict", "--context", dir, file]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(
      run.stdout,
      /hazard class H99 is addressed here and .* declares no such class on this phase/,
      run.stdout,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Registration and behaviors                                           */
/* ------------------------------------------------------------------ */

test("verdict is registered in the validator type table and its schema declares the dialect", async () => {
  const validateCommand = (await import(
    new URL("../src/commands/validate.ts", import.meta.url).href
  )) as { TYPE_TABLE: ReadonlyMap<string, string> };
  assert.equal(validateCommand.TYPE_TABLE.get("verdict"), "verdict.schema.json");
  assert.equal(validateCommand.TYPE_TABLE.get("checklist"), "checklist.schema.json");
});

test("this phase's verdict behaviors are registered in test/behaviors.json", () => {
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "verdict-approve-with-high-finding-rejected",
    "verdict-criteria-completeness",
    "verdict-deviations-completeness",
    "verdict-finding-requires-fix",
    "verdict-records-framing",
    "verdict-hazard-classes-completeness",
    "verdict-records-review-contract",
  ]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(behaviors, id),
      `behavior ${id} is not registered`,
    );
  }
});
