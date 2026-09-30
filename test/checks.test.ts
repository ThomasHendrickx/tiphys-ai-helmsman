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
  existsSync,
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
  ) => { lines: string[]; failed: boolean; violated: boolean };
  registerCheck: (check: DerivedCheck) => void;
  deregisterCheck: (id: string) => boolean;
  checksFor: (type: string) => DerivedCheck[];
  planVerificationFirstPresent: DerivedCheck;
  planHazardClassesAddressedByResolves: DerivedCheck;
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
    /* Kernel 0.2.1: a skip is not a violation, and `violated` is what the
       validate command exits on. */
    assert.equal(withoutContext.violated, false, withoutContext.lines.join("\n"));
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
