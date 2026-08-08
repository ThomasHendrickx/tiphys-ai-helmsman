/**
 * THE DERIVED-CHECK TESTS (kernel plan M3, section 2.3 Kind B; criteria 4b,
 * 4c, 5f) and the CLAUSE MAP CHECK (criteria 9 and 9b).
 *
 * Kind B witness discipline (section 2.3 rule 3): the thing removed and
 * restored is the CHECK, not a schema keyword. A Kind B criterion that
 * offered a schema-keyword witness would have misclassified itself.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const fixturesDir = join(repoRoot, "test", "fixtures");

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
  checksFor: (type: string) => DerivedCheck[];
  planVerificationFirstPresent: DerivedCheck;
  planHazardClassesAddressedByResolves: DerivedCheck;
};

const clauseMapModule = (await import(
  new URL("../scripts/check-clause-map.mjs", import.meta.url).href
)) as {
  parseInventory: (markdown: string) => { id: string; phase: string }[];
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-checks-"));
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function loadPlan(): Record<string, unknown> {
  return yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
}

function writePlan(dir: string, plan: unknown, name = "plan.yaml"): string {
  const path = join(dir, name);
  writeFileSync(path, yamlModule.stringify(plan));
  return path;
}

/* ------------------------------------------------------------------ */
/* Criterion 4b: plan-verification-first-present, both directions       */
/* ------------------------------------------------------------------ */

test("an unverified claim whose owning phase has no verification-first step is rejected naming the check, and is accepted with the check deregistered", () => {
  const dir = scratch();
  try {
    const plan = loadPlan();
    /* THE DANGEROUS INSTANCE, and it is structurally plausible: a plan whose
       phase confidently builds on a claim nobody confirmed. R-012 exists
       because that is how a fix lands on a root cause that was never the
       root cause. */
    const phase = (plan["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    const steps = phase["steps"] as Record<string, unknown>[];
    delete (steps[0] as Record<string, unknown>)["kind"];
    const file = writePlan(dir, plan);

    const rejected = runCli(["validate", "--type", "plan", file]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      /^INVALID #\/report-code-disagreement\/0 .*\(check: plan-verification-first-present\)$/m,
    );

    /* THE OTHER DIRECTION: the SAME fixture with the CHECK deregistered.
       Removing the check, not a schema keyword, is what makes this a Kind B
       witness rather than a misclassified Kind A one. */
    assert.equal(
      checksModule.deregisterCheck("plan-verification-first-present"),
      true,
    );
    const withoutCheck = checksModule.runChecks("plan", plan, undefined);
    assert.equal(withoutCheck.failed, false, withoutCheck.lines.join("\n"));

    /* RESTORED, and red again. */
    checksModule.registerCheck(checksModule.planVerificationFirstPresent);
    const restored = checksModule.runChecks("plan", plan, undefined);
    assert.equal(restored.failed, true);
    assert.ok(
      restored.lines.some((line) =>
        line.includes("(check: plan-verification-first-present)"),
      ),
      restored.lines.join("\n"),
    );

    /* CONTROL: the shipped template, whose phase DOES carry the
       verification-first step, passes. Without it this check could be
       rejecting every plan. */
    assert.equal(
      runCli(["validate", "--type", "plan", join(repoRoot, "templates", "plan.example.yaml")]).status,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4b: plan-dispatchable, both directions                     */
/* ------------------------------------------------------------------ */

test("a plan with an unfilled fill-in reports dispatchable false, and a plan with no fill-in reports dispatchable true", () => {
  const unfilled = runCli([
    "validate",
    "--type",
    "plan",
    join(repoRoot, "templates", "plan.example.yaml"),
  ]);
  assert.equal(unfilled.status, 0, "an unfilled fill-in is valid for REVIEW");
  assert.match(unfilled.stdout, /^dispatchable: false$/m);
  assert.match(unfilled.stdout, /M9-P1/);

  const none = runCli([
    "validate",
    "--type",
    "plan",
    join(fixturesDir, "plan-no-fill-in.yaml"),
  ]);
  assert.equal(none.status, 0, none.stdout + none.stderr);
  assert.match(none.stdout, /^dispatchable: true$/m);
});

/* ------------------------------------------------------------------ */
/* Criterion 4c: a check that needs a context it was not given          */
/* ------------------------------------------------------------------ */

test("a derived check that requires a context it was not given is SKIPPED and the run fails, and succeeds when the context is supplied", () => {
  /* No check M3-P1 SHIPS is cross-document, so the fixture check below is
     what exercises the mechanism. Registering a real cross-document check
     this phase was not asked for would be the undeclared-script move D-M3-22
     forbids; leaving the mechanism unwitnessed would leave a cross-document
     rule able to pass by not running, which is what 4c exists to stop. The
     residue (this arm is witnessed at the registry rather than through the
     command) is declared in the work history. */
  const fixture: DerivedCheck = {
    id: "plan-fixture-cross-document",
    type: "plan",
    requiresContext: true,
    run: (_instance, contextDirectory) => ({
      violations:
        contextDirectory === undefined
          ? [{ pointer: "#", message: "unreachable: the check ran with no context" }]
          : [],
      reports: [`resolved against ${String(contextDirectory)}`],
    }),
  };
  checksModule.registerCheck(fixture);
  try {
    const plan = loadPlan();

    const withoutContext = checksModule.runChecks("plan", plan, undefined);
    assert.ok(
      withoutContext.lines.includes("SKIPPED plan-fixture-cross-document no context"),
      withoutContext.lines.join("\n"),
    );
    assert.equal(
      withoutContext.failed,
      true,
      "a cross-document rule that did not run must not be able to pass",
    );
    /* The SKIP is distinguishable from a violation: they are different facts
       and a reader must be able to tell "this rule found a problem" from
       "this rule never ran". */
    assert.ok(
      !withoutContext.lines.some((line) =>
        line.includes("INVALID # unreachable"),
      ),
      "the check body ran despite having no context",
    );

    const dir = scratch();
    try {
      const withContext = checksModule.runChecks("plan", plan, dir);
      assert.equal(withContext.failed, false, withContext.lines.join("\n"));
      assert.ok(
        withContext.lines.some((line) => line.startsWith("resolved against ")),
        withContext.lines.join("\n"),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    checksModule.deregisterCheck("plan-fixture-cross-document");
  }

  /* And the command's own --context arm, end to end on a valid instance. */
  const dir = scratch();
  try {
    const run = runCli([
      "validate",
      "--type",
      "plan",
      "--context",
      dir,
      join(repoRoot, "templates", "plan.example.yaml"),
    ]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5f: addressed-by resolves, TWO structurally different arms  */
/* ------------------------------------------------------------------ */

test("an addressed-by naming a criterion that does not exist, and one deferring to a phase that does not exist, are each rejected naming the check", () => {
  const dir = scratch();
  try {
    /* MEMBER 1: `criterion 99` with no criterion 99 in the SAME phase's
       acceptance list. */
    const missingCriterion = loadPlan();
    {
      const phase = (missingCriterion["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
      const hazards = phase["hazard-classes"] as Record<string, unknown>[];
      (hazards[0] as Record<string, unknown>)["addressed-by"] = "criterion 99";
    }
    const fileOne = writePlan(dir, missingCriterion, "criterion.yaml");
    const runOne = runCli(["validate", "--type", "plan", fileOne]);
    assert.equal(runOne.status, 1, runOne.stdout + runOne.stderr);
    assert.match(
      runOne.stdout,
      /^INVALID #\/phases\/0\/hazard-classes\/0\/addressed-by criterion 99 is not an acceptance criterion of phase M9-P1 \(check: plan-hazard-classes-addressed-by-resolves\)$/m,
    );

    /* MEMBER 2, structurally different because the two arms of addressed-by
       resolve against DIFFERENT THINGS: a reason form naming a phase id the
       plan does not contain. Member 1 resolves into `acceptance[]`; this one
       resolves into `phases[]`. A single witness would leave one arm
       unguarded, which is the shape one-witness-is-not-a-class names. */
    const missingPhase = loadPlan();
    {
      const phase = (missingPhase["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
      const hazards = phase["hazard-classes"] as Record<string, unknown>[];
      (hazards[1] as Record<string, unknown>)["addressed-by"] = "later-phase: M9-P7";
    }
    const fileTwo = writePlan(dir, missingPhase, "phase.yaml");
    const runTwo = runCli(["validate", "--type", "plan", fileTwo]);
    assert.equal(runTwo.status, 1, runTwo.stdout + runTwo.stderr);
    assert.match(
      runTwo.stdout,
      /^INVALID #\/phases\/0\/hazard-classes\/1\/addressed-by deferred to phase M9-P7, which this plan does not contain \(check: plan-hazard-classes-addressed-by-resolves\)$/m,
    );

    /* THE OTHER DIRECTION for BOTH members: the check deregistered. */
    assert.equal(
      checksModule.deregisterCheck("plan-hazard-classes-addressed-by-resolves"),
      true,
    );
    for (const plan of [missingCriterion, missingPhase]) {
      assert.equal(
        checksModule.runChecks("plan", plan, undefined).failed,
        false,
      );
    }

    /* Restored, and red again for both. */
    checksModule.registerCheck(checksModule.planHazardClassesAddressedByResolves);
    for (const plan of [missingCriterion, missingPhase]) {
      const restored = checksModule.runChecks("plan", plan, undefined);
      assert.equal(restored.failed, true);
      assert.ok(
        restored.lines.some((line) =>
          line.includes("(check: plan-hazard-classes-addressed-by-resolves)"),
        ),
      );
    }

    /* CONTROL: the shipped template, whose two hazard classes resolve, passes
       with the check registered. */
    assert.equal(
      checksModule.runChecks("plan", loadPlan(), undefined).failed,
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criteria 9 and 9b: the clause map check                              */
/* ------------------------------------------------------------------ */

function runClauseMap(cwd: string, args: string[] = []): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const run = spawnSync(
    process.execPath,
    [join(repoRoot, "scripts", "check-clause-map.mjs"), ...args],
    { encoding: "utf8", cwd },
  );
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/**
 * A scratch copy of the repository's clause-map inputs, so a mutation is made
 * to a COPY and the real tree is never left broken. `git checkout --` is not
 * used to undo anything here, because in a tree holding uncommitted work it
 * is destructive even when it names a single path (CLAUDE.md warning 8).
 */
function stageClauseMap(): string {
  const dir = scratch();
  cpSync(join(repoRoot, "delivery"), join(dir, "delivery"), { recursive: true });
  cpSync(join(repoRoot, "schemas"), join(dir, "schemas"), { recursive: true });
  cpSync(join(repoRoot, "scripts"), join(dir, "scripts"), { recursive: true });
  cpSync(join(repoRoot, "src"), join(dir, "src"), { recursive: true });
  return dir;
}

test("the clause map check is green over this phase's rows, and a clause id removed from its artifact makes it red naming the row and the artifact", () => {
  const dir = stageClauseMap();
  try {
    const mapPath = join(dir, "delivery", "requirements", "clause-map.json");
    const map = JSON.parse(readFileSync(mapPath, "utf8")) as Record<string, unknown>;
    assert.equal(
      Object.keys(map).length,
      12,
      "the phase seeds exactly its twelve rows",
    );

    const green = runClauseMap(dir);
    assert.equal(green.status, 0, green.stdout + green.stderr);
    assert.match(green.stdout, /clause-map: green \(12 clause-map rows checked\)/);

    /* CONDITION 4, red: remove the clause id from the artifact it is
       supposed to occur in. */
    const artifact = join(dir, "schemas", "status-line.schema.json");
    const original = readFileSync(artifact, "utf8");
    writeFileSync(artifact, original.replace(/R-084/g, "the status contract"));
    const red = runClauseMap(dir);
    assert.notEqual(red.status, 0);
    assert.match(red.stdout, /R-084 names clause R-084, which does not occur in schemas\/status-line\.schema\.json/);

    /* Restored, and green again. */
    writeFileSync(artifact, original);
    assert.equal(runClauseMap(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deleting a map entry for a row whose phase is in force makes the check red naming the row and the phase", () => {
  /* CONDITION 1, the one that has no witness at all without this test. A
     phase that UNDER-SEEDS its own rows must not produce a green check:
     "exits 0 over all 74 rows" satisfied by a file containing seventy-three
     is a presence check wearing a completeness checker's name. */
  const dir = stageClauseMap();
  try {
    const mapPath = join(dir, "delivery", "requirements", "clause-map.json");
    const original = readFileSync(mapPath, "utf8");
    const missing = JSON.parse(original) as Record<string, unknown>;
    delete missing["R-084"];
    writeFileSync(mapPath, JSON.stringify(missing, undefined, 2));
    const red = runClauseMap(dir);
    assert.notEqual(red.status, 0, red.stdout);
    assert.match(
      red.stdout,
      /R-084 is owned by M3-P1, which is in force, and has no clause-map entry/,
    );

    writeFileSync(mapPath, original);
    assert.equal(runClauseMap(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a map entry naming a row absent from the inventory makes the check red naming the invented row", () => {
  /* CONDITION 2, the reverse direction. */
  const dir = stageClauseMap();
  try {
    const mapPath = join(dir, "delivery", "requirements", "clause-map.json");
    const original = readFileSync(mapPath, "utf8");
    const invented = JSON.parse(original) as Record<string, unknown>;
    invented["R-999"] = {
      phase: "M3-P1",
      artifact: "schemas/plan.schema.json",
      clause: "R-999",
    };
    writeFileSync(mapPath, JSON.stringify(invented, undefined, 2));
    const inventedRun = runClauseMap(dir);
    assert.notEqual(inventedRun.status, 0);
    assert.match(
      inventedRun.stdout,
      /R-999 has a clause-map entry and is not in the inventory/,
    );

    writeFileSync(mapPath, original);
    assert.equal(runClauseMap(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a row whose phase is not yet in force is reported pending and does not fail the check", () => {
  const dir = stageClauseMap();
  try {
    const run = runClauseMap(dir);
    assert.equal(run.status, 0);
    assert.match(run.stdout, /^R-094 pending M3-P2$/m);
    assert.match(run.stdout, /rows checked, 6[0-9] pending a phase not yet in force/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the inventory is parsed from the plan's Appendix A and carries the plan's own stated 74 rows and 12 M3-P1 rows", () => {
  /* The INVENTORY IS A SECOND SOURCE, authored by a different act from the
     map. This asserts the parse actually reaches it rather than returning an
     empty list, which would make condition 1 unfireable and every future
     phase's under-seeding invisible. */
  const rows = clauseMapModule.parseInventory(
    readFileSync(join(repoRoot, "delivery", "plan", "kernel-plan-m3.md"), "utf8"),
  );
  assert.equal(rows.length, 74, "the plan states 74 rows in Appendix A");
  assert.equal(
    rows.filter((row) => row.phase === "M3-P1").length,
    12,
    "the plan states M3-P1 = 12",
  );
});
