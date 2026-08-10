/**
 * THE ASSURANCE MODE TESTS (kernel plan M3, M3-P3 step 7).
 *
 * WITNESS DISCIPLINE, which is what most of this file is about (section 2.3
 * rules 2 and 3):
 *
 *   Kind A rules are schema keywords, and the thing removed and restored is
 *   THE KEYWORD. The schema is re-read from disk per arm, never mutated in
 *   place, because `compileSchema` caches by object IDENTITY and a defanged
 *   copy of an already-compiled object keeps the old validator: M3-P1
 *   measured exactly that and its first witness read like a keyword doing
 *   nothing when the keyword was doing its job.
 *
 *   Kind B rules are derived checks, and the thing removed and restored is
 *   THE CHECK. A Kind B criterion offered a schema-keyword witness would have
 *   misclassified itself.
 *
 * ONE WITNESS IS NOT A CLASS. Every check here whose rule covers a CLASS is
 * reddened under at least two structurally different members, and each pair is
 * named at its site so a reader can judge whether the two are really different
 * rather than one shape written twice.
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const schemasDir = join(repoRoot, "schemas");
const modesPath = join(repoRoot, "assurance-modes.yaml");
const rolesPath = join(repoRoot, "role-model-config.yaml");

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
};

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  validateToLines: (schema: Record<string, unknown>, instance: unknown) => string[];
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
  charterModeEnumMatchesModes: DerivedCheck;
  modeConditionsQuoteGrantedBy: DerivedCheck;
  quotableUnits: (text: string) => Set<string>;
  modeGateSetsResolve: DerivedCheck;
  modeIdsAreUnique: DerivedCheck;
  modeNoUndeclaredDowngrade: DerivedCheck;
  modeStageOrder: DerivedCheck;
  roleIdsAreUnique: DerivedCheck;
};

const modesModule = (await import(
  new URL("../src/modes.ts", import.meta.url).href
)) as {
  readModes: (path?: string) => { ok: boolean };
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-modes-"));
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** A FRESH schema object per call. See the header: identity is what compileSchema caches on. */
function readSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(schemasDir, name), "utf8")) as Record<string, unknown>;
}

/** A fresh decode of the shipped mode definitions, safe to mutate. */
function loadModes(): Record<string, unknown> {
  return yamlModule.parse(readFileSync(modesPath, "utf8")) as Record<string, unknown>;
}

function modesOf(document: Record<string, unknown>): Record<string, unknown>[] {
  return document["modes"] as Record<string, unknown>[];
}

function modeNamed(document: Record<string, unknown>, id: string): Record<string, unknown> {
  const found = modesOf(document).find((mode) => mode["id"] === id);
  assert.ok(found !== undefined, `the shipped document declares no mode ${id}`);
  return found as Record<string, unknown>;
}

function writeDocument(dir: string, document: unknown, name = "assurance-modes.yaml"): string {
  const path = join(dir, name);
  writeFileSync(path, yamlModule.stringify(document));
  return path;
}

/**
 * A context directory the cross-document checks can resolve against: a copy of
 * the registry and of the shipped schemas, so a test may edit either without
 * touching the working tree. `git checkout --` is never used to undo anything
 * here; in a tree holding uncommitted work it is destructive even when it
 * names one path (CLAUDE.md warning 8).
 */
function stageContext(): string {
  const dir = scratch();
  cpSync(join(repoRoot, "gate-registry.yaml"), join(dir, "gate-registry.yaml"));
  cpSync(schemasDir, join(dir, "schemas"), { recursive: true });
  /* The decision records too, since fix round 1: `mode-conditions-quote-granted-by`
     resolves `granted-by` against them, and a staged context without them would
     make that check fail for the staging rather than for the document. */
  cpSync(join(repoRoot, "delivery", "decisions"), join(dir, "delivery", "decisions"), {
    recursive: true,
  });
  return dir;
}

/** The lines a Kind B check produces for an instance, run in process. */
function checkLines(instance: unknown, context: string | undefined): {
  lines: string[];
  failed: boolean;
} {
  return checksModule.runChecks("assurance-modes", instance, context);
}

/* ------------------------------------------------------------------ */
/* Criterion 1: the shipped documents validate                          */
/* ------------------------------------------------------------------ */

test("the shipped assurance-modes.yaml and role-model-config.yaml validate and resolve through --type auto", () => {
  /* CRITERION 1 AS THE PLAN WORDS IT NAMES NO --context, AND THE COMMAND IT
     WORDS EXITS 1. That is not a defect in either half: criterion 3(d) and the
     hazard map require `mode-gate-sets-resolve` to be a context-requiring
     check precisely so a cross-document rule cannot pass by not running, and
     M3-P1 criterion 4c's standing rule is that such a check without --context
     prints SKIPPED and exits nonzero. The two sentences cannot both hold for
     the same invocation. The context-bearing form is asserted here and the
     bare form is asserted, with its SKIPPED lines, in the gate-set test below;
     delivery/work-history/m3-p3.md records the discrepancy rather than
     choosing one and staying quiet. */
  const modes = runCli(["validate", "--type", "assurance-modes", "--context", ".", modesPath]);
  assert.equal(modes.status, 0, modes.stdout + modes.stderr);

  const roles = runCli(["validate", "--type", "role-model-config", rolesPath]);
  assert.equal(roles.status, 0, roles.stdout + roles.stderr);

  /* --type auto, which is the second half of registering a type (M3R-001): a
     document whose schema ships but which the resolver cannot name is not a
     state this command may be in. */
  const autoModes = runCli(["validate", "--type", "auto", "--context", ".", modesPath]);
  assert.equal(autoModes.status, 0, autoModes.stdout + autoModes.stderr);
  const autoRoles = runCli(["validate", "--type", "auto", rolesPath]);
  assert.equal(autoRoles.status, 0, autoRoles.stdout + autoRoles.stderr);
});

/* ------------------------------------------------------------------ */
/* Criterion 2: mode show                                               */
/* ------------------------------------------------------------------ */

/** Items of one section of `mode show` output: the two-space-indented lines beneath a header. */
function section(stdout: string, name: string): string[] {
  const lines = stdout.split("\n");
  const start = lines.indexOf(`${name}:`);
  assert.notEqual(start, -1, `no ${name} section in:\n${stdout}`);
  const items: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (!line.startsWith("  ")) {
      break;
    }
    items.push(line.slice(2));
  }
  return items;
}

test("mode show prints full's twelve stage ids in order and a non-empty skips list for the other two modes", () => {
  const full = runCli(["mode", "show", "--mode", "full"]);
  assert.equal(full.status, 0, full.stdout + full.stderr);
  /* THE TWELVE OF STEP 2, WRITTEN OUT HERE rather than read back from the
     document under test. A test that derived the expected list from
     assurance-modes.yaml would pass for any twelve stages in any order, which
     is R-096 asserted against itself. */
  assert.deepEqual(section(full.stdout, "pipeline"), [
    "intake",
    "verification-pass",
    "plan",
    "adversarial-plan-review",
    "implement",
    "clean-room-review",
    "fix-round",
    "fix-round-verification",
    "merge-on-green",
    "deploy-verify",
    "migration-verify",
    "final-report",
  ]);

  for (const id of ["direct-pr", "local-only"]) {
    const run = runCli(["mode", "show", "--mode", id]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const skips = section(run.stdout, "skips");
    assert.ok(skips.length > 0, `${id} printed no skips:\n${run.stdout}`);
    assert.ok(
      !skips.includes("(none)"),
      `${id} printed an empty skips list, so it declares no downgrade:\n${run.stdout}`,
    );
  }

  /* CONTROL, and it is what stops the three assertions above from being
     satisfied by a command that prints the same thing for everything: an id no
     mode carries is a well-formed question with a negative answer, so 1 and
     not 64, and the message names what IS declared. */
  const unknown = runCli(["mode", "show", "--mode", "yolo"]);
  assert.equal(unknown.status, 1, unknown.stdout + unknown.stderr);
  assert.match(unknown.stderr, /declares no mode yolo; it declares direct-pr, full, local-only/);
  assert.equal(runCli(["mode", "show"]).status, 64);
  assert.equal(modesModule.readModes().ok, true);
});

/* ------------------------------------------------------------------ */
/* Criterion 3(a): mode-no-undeclared-downgrade, Kind B                 */
/* ------------------------------------------------------------------ */

test("a mode omitting a stage full runs without declaring it in skips is rejected, and is accepted with the check deregistered", () => {
  const dir = scratch();
  try {
    /* MEMBER 1: the plan's own dangerous instance. A mode drops clean-room
       review and declares nothing at all, which is the improvisation blueprint
       section 8 forbids in its purest form. */
    const bare = loadModes();
    const directPr = modeNamed(bare, "direct-pr");
    directPr["pipeline"] = ["intake", "plan", "implement", "merge-on-green", "final-report"];
    directPr["skips"] = [];
    const barePath = writeDocument(dir, bare, "downgrade-empty-skips.yaml");
    const bareRun = runCli(["validate", "--type", "assurance-modes", "--context", ".", barePath]);
    assert.equal(bareRun.status, 1, bareRun.stdout + bareRun.stderr);
    assert.match(
      bareRun.stdout,
      /^INVALID #\/modes\/1\/skips mode direct-pr omits stage clean-room-review, which mode full runs, and does not declare it in skips \(check: mode-no-undeclared-downgrade\)$/m,
      bareRun.stdout,
    );

    /* MEMBER 2, STRUCTURALLY DIFFERENT: the mode declares SOME of what it
       dropped. An empty skips list is visible to a careless reader; a list
       that is present, plausible and one entry short is not, and it is the
       shape a real downgrade would take. A witness that only ever reddened
       against member 1 would leave this whole half green. */
    const partial = loadModes();
    const partialMode = modeNamed(partial, "direct-pr");
    partialMode["skips"] = (partialMode["skips"] as string[]).filter(
      (stage) => stage !== "fix-round-verification",
    );
    partialMode["pipeline"] = ["intake", "plan", "implement", "merge-on-green", "final-report"];
    const partialPath = writeDocument(dir, partial, "downgrade-partial-skips.yaml");
    const partialRun = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      ".",
      partialPath,
    ]);
    assert.equal(partialRun.status, 1, partialRun.stdout + partialRun.stderr);
    assert.match(
      partialRun.stdout,
      /mode direct-pr omits stage fix-round-verification, .*\(check: mode-no-undeclared-downgrade\)/,
      partialRun.stdout,
    );
    /* And ONLY that one, so the fixture really is the valid document with
       exactly one thing changed. */
    assert.equal(
      partialRun.stdout.split("\n").filter((line) => line.startsWith("INVALID")).length,
      1,
      partialRun.stdout,
    );

    /* MEMBER 3: deleting the reference mode disables the comparison for every
       remaining mode at once, which is a third way to make a downgrade
       invisible and the reason the absent reference fails closed. */
    const noReference = loadModes();
    noReference["modes"] = modesOf(noReference).filter((mode) => mode["id"] !== "full");
    const referenceLines = checkLines(noReference, undefined);
    assert.ok(
      referenceLines.lines.some((line) =>
        line.includes("no mode declares id full") &&
        line.includes("(check: mode-no-undeclared-downgrade)"),
      ),
      referenceLines.lines.join("\n"),
    );

    /* THE OTHER DIRECTION: the SAME member-1 instance with the CHECK removed.
       Removing the check rather than a schema keyword is what makes this a
       Kind B witness. */
    assert.equal(checksModule.deregisterCheck("mode-no-undeclared-downgrade"), true);
    const withoutCheck = checkLines(bare, undefined);
    assert.ok(
      !withoutCheck.lines.some((line) => line.includes("mode-no-undeclared-downgrade")),
      withoutCheck.lines.join("\n"),
    );

    /* RESTORED, and red again. */
    checksModule.registerCheck(checksModule.modeNoUndeclaredDowngrade);
    const restored = checkLines(bare, undefined);
    assert.ok(
      restored.lines.some((line) => line.includes("(check: mode-no-undeclared-downgrade)")),
      restored.lines.join("\n"),
    );

    /* CONTROL: the shipped document, whose three modes each declare what they
       drop, is green. Without it the check could be rejecting everything. */
    assert.equal(
      checkLines(loadModes(), undefined).lines.filter((line) =>
        line.includes("mode-no-undeclared-downgrade"),
      ).length,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* CR-002 (round 9): skips[] is checked in BOTH directions, Kind B      */
/* ------------------------------------------------------------------ */

test("a mode declaring a stage in skips that its own pipeline runs is rejected, and the shipped document is green", () => {
  /* THE MECHANISM, NOT THE INSTANCE. `mode-no-undeclared-downgrade` asked only
     whether every omitted stage is DECLARED. It never asked whether every
     DECLARED stage is omitted, so `skips[]` was constrained in one direction
     and unconstrained in the other, and it is shipped DATA. The reviewer
     measured three members, all at exit 0 with every registry gate green
     (delivery/review/clean-room-m3-p3-r8-criteria.md:318).

     TWO STRUCTURALLY DIFFERENT MEMBERS, because one witness is not a class,
     and the difference is a real branch and not a relabelling: member 1 is the
     REFERENCE mode `full`, which the completeness loop `continue`s past
     entirely, and member 2 is a non-reference mode, which that loop does
     traverse. A soundness predicate written inside the completeness loop would
     pass member 2 and be green against member 1, which is the sharper of the
     two. */
  const dir = scratch();
  try {
    /* MEMBER 1, THE SHARP ONE: `full` keeps its whole twelve-stage pipeline,
       still runs `deploy-verify`, and gains one bogus `skips[]` entry. Before
       this check that document validated at exit 0 and `tiphys mode show
       --mode full` then reported that no phase had ever been delivered under
       the mode this project has delivered every phase under. */
    const referenceContradiction = loadModes();
    modeNamed(referenceContradiction, "full")["skips"] = ["deploy-verify"];
    const referencePath = writeDocument(dir, referenceContradiction, "skips-contradict-full.yaml");
    const referenceRun = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      ".",
      referencePath,
    ]);
    assert.equal(referenceRun.status, 1, referenceRun.stdout + referenceRun.stderr);
    assert.match(
      referenceRun.stdout,
      /^INVALID #\/modes\/0\/skips mode full declares stage deploy-verify in skips while its own pipeline runs it, so skips does not describe what this mode omits \(check: mode-no-undeclared-downgrade\)$/m,
      referenceRun.stdout,
    );
    /* AND ONLY THAT ONE, so the fixture is the shipped document with exactly
       one thing changed and the diagnostic is attributable. */
    assert.equal(
      referenceRun.stdout.split("\n").filter((line) => line.startsWith("INVALID")).length,
      1,
      referenceRun.stdout,
    );

    /* MEMBER 2, A NON-REFERENCE MODE: `local-only` declares `implement` in
       skips while `implement` is in its own pipeline. Before this check
       `tiphys mode show --mode local-only` printed `implement` under BOTH
       `pipeline:` and `skips:`, at exit 0. */
    const memberContradiction = loadModes();
    const localOnly = modeNamed(memberContradiction, "local-only");
    localOnly["skips"] = ["implement", ...(localOnly["skips"] as string[])];
    const memberPath = writeDocument(dir, memberContradiction, "skips-contradict-local.yaml");
    const memberRun = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      ".",
      memberPath,
    ]);
    assert.equal(memberRun.status, 1, memberRun.stdout + memberRun.stderr);
    assert.match(
      memberRun.stdout,
      /^INVALID #\/modes\/2\/skips mode local-only declares stage implement in skips while its own pipeline runs it, so skips does not describe what this mode omits \(check: mode-no-undeclared-downgrade\)$/m,
      memberRun.stdout,
    );

    /* THE PREDICATE NEEDS NO REFERENCE MODE, so deleting `full` reports BOTH
       facts rather than the absent reference swallowing the contradiction. A
       soundness check placed after the reference early-return would report only
       the first line here, and the contradictory mode would ride out on a
       document that had also deleted the reference. */
    const both = loadModes();
    const strandedLocal = modeNamed(both, "local-only");
    strandedLocal["skips"] = ["implement", ...(strandedLocal["skips"] as string[])];
    both["modes"] = modesOf(both).filter((mode) => mode["id"] !== "full");
    const bothLines = checkLines(both, undefined).lines;
    assert.ok(
      bothLines.some((line) => line.includes("no mode declares id full")),
      bothLines.join("\n"),
    );
    assert.ok(
      bothLines.some((line) =>
        line.includes("mode local-only declares stage implement in skips while its own pipeline runs it"),
      ),
      bothLines.join("\n"),
    );

    /* THE OTHER DIRECTION, which is what makes this a Kind B witness: the SAME
       member-1 instance with the CHECK removed is accepted. */
    assert.equal(checksModule.deregisterCheck("mode-no-undeclared-downgrade"), true);
    const withoutCheck = checkLines(referenceContradiction, undefined);
    assert.ok(
      !withoutCheck.lines.some((line) => line.includes("mode-no-undeclared-downgrade")),
      withoutCheck.lines.join("\n"),
    );

    /* RESTORED, and red again. */
    checksModule.registerCheck(checksModule.modeNoUndeclaredDowngrade);
    assert.ok(
      checkLines(referenceContradiction, undefined).lines.some((line) =>
        line.includes("declares stage deploy-verify in skips while its own pipeline runs it"),
      ),
    );

    /* THE CONTROL, AND IT IS THE ASSERTION THE DATA DANGEROUS STATES REDDEN:
       the SHIPPED document is green on this check. Without it the predicate
       could be rejecting everything, and with it a one-line edit to
       assurance-modes.yaml that makes `skips[]` contradict `pipeline[]` fails
       this test, which is the guard the old witness did not have. */
    assert.equal(
      checkLines(loadModes(), undefined).lines.filter((line) =>
        line.includes("mode-no-undeclared-downgrade"),
      ).length,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3(b): mode-stage-order, Kind B                             */
/* ------------------------------------------------------------------ */

test("a mode that builds before its adversarial plan review is rejected, and is accepted with the check deregistered", () => {
  const dir = scratch();
  try {
    /* MEMBER 1: the two stages are both present and in the wrong ORDER. This
       is R-024 evaded by reordering, and it is the one no schema keyword can
       see: `contains` proves both are there and says nothing about which
       comes first. */
    const reordered = loadModes();
    const full = modeNamed(reordered, "full");
    full["pipeline"] = [
      "intake",
      "verification-pass",
      "plan",
      "implement",
      "adversarial-plan-review",
      "clean-room-review",
      "fix-round",
      "fix-round-verification",
      "merge-on-green",
      "deploy-verify",
      "migration-verify",
      "final-report",
    ];
    const reorderedPath = writeDocument(dir, reordered, "order-inverted.yaml");
    const reorderedRun = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      ".",
      reorderedPath,
    ]);
    assert.equal(reorderedRun.status, 1, reorderedRun.stdout + reorderedRun.stderr);
    assert.match(
      reorderedRun.stdout,
      /^INVALID #\/modes\/0\/pipeline mode full places implement at position 3 and adversarial-plan-review at position 4, so building starts before the review \(R-024\) \(check: mode-stage-order\)$/m,
      reorderedRun.stdout,
    );

    /* MEMBER 2, STRUCTURALLY DIFFERENT: the review is DELETED rather than
       moved, and not declared in skips. Reordering and deleting are two
       different ways to reach the same state (a build with no prior
       adversarial review), and a witness that only reddened on the ordering
       arm would leave the deletion arm green. The plan states both arms of
       this rule for exactly that reason. */
    const deleted = loadModes();
    const deletedMode = modeNamed(deleted, "direct-pr");
    deletedMode["skips"] = (deletedMode["skips"] as string[]).filter(
      (stage) => stage !== "adversarial-plan-review",
    );
    const deletedPath = writeDocument(dir, deleted, "order-deleted.yaml");
    const deletedRun = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      ".",
      deletedPath,
    ]);
    assert.equal(deletedRun.status, 1, deletedRun.stdout + deletedRun.stderr);
    assert.match(
      deletedRun.stdout,
      /^INVALID #\/modes\/1\/skips mode direct-pr runs implement without adversarial-plan-review and does not declare that stage in skips \(R-024\) \(check: mode-stage-order\)$/m,
      deletedRun.stdout,
    );

    /* THE OTHER DIRECTION, on member 1. */
    assert.equal(checksModule.deregisterCheck("mode-stage-order"), true);
    const withoutCheck = checkLines(reordered, undefined);
    assert.ok(
      !withoutCheck.lines.some((line) => line.includes("mode-stage-order")),
      withoutCheck.lines.join("\n"),
    );

    checksModule.registerCheck(checksModule.modeStageOrder);
    assert.ok(
      checkLines(reordered, undefined).lines.some((line) =>
        line.includes("(check: mode-stage-order)"),
      ),
    );

    /* CONTROL: the shipped document is green under this check. */
    assert.equal(
      checkLines(loadModes(), undefined).lines.filter((line) =>
        line.includes("mode-stage-order"),
      ).length,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3(c): full requires fix-round-verification, Kind A         */
/* ------------------------------------------------------------------ */

test("a full mode with no fix-round-verification stage is rejected, and is accepted with the contains keyword removed", () => {
  /* T-003's structural consequence: full mode REQUIRES a delta review or
     verification of every fix round rather than leaving it to orchestrator
     discretion. The evidence is delivery/review/verification-m1-p3-fix-round.md
     and this is the schema half of it. */
  const document = loadModes();
  const full = modeNamed(document, "full");
  full["pipeline"] = (full["pipeline"] as string[]).filter(
    (stage) => stage !== "fix-round-verification",
  );

  /* THE MESSAGE NAMES THE MISSING STAGE (CR-004, fix round 1). It used to read
     "array contains no item matching the required shape", which told an author
     that something was absent and not WHAT, on the one stage T-003 made
     structural. The generic wording survives for every `contains` whose
     subschema is not a bare `const`, and `test/schemas.test.ts`'s fixture is
     exactly that case, which is why its two assertions are untouched. */
  assert.deepEqual(validateModule.validateToLines(readSchema("assurance-modes.schema.json"), document), [
    "INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here",
    'INVALID #/modes/0/pipeline array contains no item equal to "fix-round-verification", and 1 is required',
  ]);

  /* THE KEYWORD REMOVED. A FRESH schema object, because compileSchema caches
     by identity and a defanged copy of an already-compiled object would keep
     the old validator and read exactly like a keyword doing nothing. */
  const defanged = readSchema("assurance-modes.schema.json");
  const then = ((defanged["$defs"] as Record<string, Record<string, unknown>>)["mode"] as Record<
    string,
    Record<string, Record<string, Record<string, unknown>>>
  >)["then"] as unknown as Record<string, Record<string, Record<string, unknown>>>;
  delete (then["properties"] as Record<string, Record<string, unknown>>)["pipeline"]?.["contains"];
  assert.deepEqual(validateModule.validateToLines(defanged, document), []);

  /* RESTORED: a fresh read is the restoration, and it is red again. */
  assert.ok(
    validateModule
      .validateToLines(readSchema("assurance-modes.schema.json"), document)
      .some((line) => line.includes("array contains no item equal to")),
  );

  /* CONTROL: the shipped document, which carries the stage, is accepted. */
  assert.deepEqual(
    validateModule.validateToLines(readSchema("assurance-modes.schema.json"), loadModes()),
    [],
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 3(d): mode-gate-sets-resolve, Kind B, with --context       */
/* ------------------------------------------------------------------ */

test("a mode naming a gate set the registry does not declare is rejected, and the same check without --context is SKIPPED and fails", () => {
  const dir = scratch();
  try {
    /* MEMBER 1: a reference to a gate id that is in no registry at all. */
    const invented = loadModes();
    const inventedMode = modeNamed(invented, "full");
    (inventedMode["gate-sets"] as string[]).push("performance-budget");
    const inventedPath = writeDocument(dir, invented, "gate-set-invented.yaml");
    const inventedRun = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      ".",
      inventedPath,
    ]);
    assert.equal(inventedRun.status, 1, inventedRun.stdout + inventedRun.stderr);
    assert.match(
      inventedRun.stdout,
      /^INVALID #\/modes\/0\/gate-sets\/14 gate set performance-budget is not declared in .*gate-registry\.yaml \(check: mode-gate-sets-resolve\)$/m,
      inventedRun.stdout,
    );

    /* MEMBER 2, STRUCTURALLY DIFFERENT: a reference that RESOLVES to a real
       registry entry whose own `modes` list does not name this mode. The id
       exists, a grep for it succeeds, and the gate still never runs here, so
       the mode's assurance is a name with nothing behind it. That is the
       hazard as the plan words it, and it is invisible to any check that only
       asked whether the id exists. */
    const excluded = loadModes();
    (modeNamed(excluded, "local-only")["gate-sets"] as string[]).push("red-witness");
    const excludedPath = writeDocument(dir, excluded, "gate-set-mode-excluded.yaml");
    const excludedRun = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      ".",
      excludedPath,
    ]);
    assert.equal(excludedRun.status, 1, excludedRun.stdout + excludedRun.stderr);
    assert.match(
      excludedRun.stdout,
      /gate set red-witness is declared in .*gate-registry\.yaml and its modes list does not name local-only, so it never runs in this mode \(check: mode-gate-sets-resolve\)/,
      excludedRun.stdout,
    );

    /* THE STANDING RULE (M3-P1 criterion 4c): the same check invoked WITHOUT
       --context does not quietly pass. This is the arm that makes the whole
       cross-document mechanism worth having. */
    const noContext = runCli(["validate", "--type", "assurance-modes", modesPath]);
    assert.equal(noContext.status, 1, noContext.stdout + noContext.stderr);
    assert.match(noContext.stdout, /^SKIPPED mode-gate-sets-resolve no context$/m);
    assert.ok(
      !noContext.stdout.includes("INVALID"),
      `a skip is not a violation and must not be reported as one:\n${noContext.stdout}`,
    );

    /* A CONTEXT THAT EXISTS AND HAS NO REGISTRY IN IT is also a failure, not a
       pass: "the rule could not be evaluated" and "the rule found nothing" are
       different facts. */
    const empty = scratch();
    try {
      const emptyRun = runCli([
        "validate",
        "--type",
        "assurance-modes",
        "--context",
        empty,
        modesPath,
      ]);
      assert.equal(emptyRun.status, 1, emptyRun.stdout);
      assert.match(emptyRun.stdout, /the gate registry could not be read/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }

    /* THE OTHER DIRECTION, on member 1. */
    assert.equal(checksModule.deregisterCheck("mode-gate-sets-resolve"), true);
    const withoutCheck = checkLines(invented, repoRoot);
    assert.ok(
      !withoutCheck.lines.some((line) => line.includes("mode-gate-sets-resolve")),
      withoutCheck.lines.join("\n"),
    );

    checksModule.registerCheck(checksModule.modeGateSetsResolve);
    assert.ok(
      checkLines(invented, repoRoot).lines.some((line) =>
        line.includes("(check: mode-gate-sets-resolve)"),
      ),
    );

    /* CONTROL: every gate set the shipped document names resolves. */
    assert.equal(
      checkLines(loadModes(), repoRoot).lines.filter((line) =>
        line.includes("mode-gate-sets-resolve"),
      ).length,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4: the charter's mode enum                                 */
/* ------------------------------------------------------------------ */

function charterFromTemplate(): Record<string, unknown> {
  return yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
}

test("a charter declaring delivery-mode yolo is rejected naming the enum and a charter declaring full is accepted", () => {
  const charter = charterFromTemplate();
  charter["delivery-mode"] = "yolo";
  assert.deepEqual(
    validateModule.validateToLines(readSchema("charter.schema.json"), charter),
    [
      'INVALID #/delivery-mode value "yolo" is not one of the permitted values "full", "direct-pr", "local-only"',
    ],
  );

  /* THE KEYWORD REMOVED, on a fresh schema object. */
  const defanged = readSchema("charter.schema.json");
  delete ((defanged["properties"] as Record<string, Record<string, unknown>>)[
    "delivery-mode"
  ] as Record<string, unknown>)["enum"];
  assert.deepEqual(validateModule.validateToLines(defanged, charter), []);

  /* RESTORED, and red again. */
  assert.equal(
    validateModule.validateToLines(readSchema("charter.schema.json"), charter).length,
    1,
  );

  /* THE OTHER DIRECTION, which is what stops the enum from rejecting
     everything: the shipped template declares `full` and is accepted, end to
     end through the command. */
  assert.deepEqual(
    validateModule.validateToLines(readSchema("charter.schema.json"), charterFromTemplate()),
    [],
  );
  const accepted = runCli([
    "validate",
    "--type",
    "charter",
    join(repoRoot, "templates", "charter.example.yaml"),
  ]);
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
});

test("a fourth mode id added without updating the charter schema enum is rejected naming both files, and updating the enum returns exit 0", () => {
  const dir = stageContext();
  try {
    /* MEMBER 1: the modes document gains an id the charter enum does not
       carry. It is driven through `runChecks` rather than the command because
       the mode `id` enum is CLOSED in the schema, so a fourth id never reaches
       the derived checks through `tiphys validate`: schema validation rejects
       it first. Driving the check directly is the only way to redden the
       ADDED-MODE case the hazard map names as this criterion's dangerous
       state. */
    const added = loadModes();
    modesOf(added).push({
      id: "shadow",
      "declared-by": "nobody",
      pipeline: ["implement"],
      skips: [],
      "gate-sets": ["suite"],
      "merge-authority": "owner",
    });
    const addedLines = checkLines(added, repoRoot);
    assert.ok(
      addedLines.lines.some(
        (line) =>
          line.includes("(check: charter-mode-enum-matches-modes)") &&
          line.includes("assurance-modes.yaml") &&
          line.includes("charter.schema.json") &&
          line.includes("shadow"),
      ),
      addedLines.lines.join("\n"),
    );

    /* MEMBER 2, STRUCTURALLY DIFFERENT AND END TO END: the drift in the OTHER
       direction, a mode REMOVED while the charter enum still offers it. A
       charter may then select a delivery mode with no definition behind it,
       which is the same fact from the other side and is schema-valid, so it
       runs through the command exactly as an operator would meet it. */
    const removed = loadModes();
    removed["modes"] = modesOf(removed).filter((mode) => mode["id"] !== "local-only");
    const removedPath = writeDocument(dir, removed, "modes-without-local-only.yaml");
    const removedRun = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      ".",
      removedPath,
    ]);
    assert.equal(removedRun.status, 1, removedRun.stdout + removedRun.stderr);
    assert.match(
      removedRun.stdout,
      /assurance-modes\.yaml declares mode ids \[direct-pr, full\] and the delivery-mode enum in .*charter\.schema\.json is \[direct-pr, full, local-only\]; the two must be equal \(check: charter-mode-enum-matches-modes\)/,
      removedRun.stdout,
    );
    /* BOTH fields, because M3-P1 shipped the same placeholder enum on
       `assurance-tier` and a check watching one of the two leaves the other
       free to drift. */
    assert.match(removedRun.stdout, /the assurance-tier enum in .*charter\.schema\.json/);

    /* UPDATING THE ENUM RETURNS EXIT 0. The staged context carries an edited
       copy of the charter schema, so nothing in the working tree is touched. */
    const charterPath = join(dir, "schemas", "charter.schema.json");
    const staged = JSON.parse(readFileSync(charterPath, "utf8")) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    for (const field of ["delivery-mode", "assurance-tier"]) {
      (staged["properties"] as Record<string, Record<string, unknown>>)[field]!["enum"] = [
        "full",
        "direct-pr",
      ];
    }
    writeFileSync(charterPath, JSON.stringify(staged, undefined, 2));
    const updated = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      dir,
      removedPath,
    ]);
    assert.equal(updated.status, 0, updated.stdout + updated.stderr);

    /* THE OTHER DIRECTION AS A KIND B WITNESS: the check removed and restored
       on member 1. */
    assert.equal(checksModule.deregisterCheck("charter-mode-enum-matches-modes"), true);
    assert.ok(
      !checkLines(added, repoRoot).lines.some((line) =>
        line.includes("charter-mode-enum-matches-modes"),
      ),
    );
    checksModule.registerCheck(checksModule.charterModeEnumMatchesModes);
    assert.ok(
      checkLines(added, repoRoot).lines.some((line) =>
        line.includes("(check: charter-mode-enum-matches-modes)"),
      ),
    );

    /* CONTROL: the shipped pair agrees. */
    assert.equal(
      checkLines(loadModes(), repoRoot).lines.filter((line) =>
        line.includes("charter-mode-enum-matches-modes"),
      ).length,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4b: delegated authority, Kind A                            */
/* ------------------------------------------------------------------ */

test("delegated merge authority with an empty conditions list or no granted-by is rejected, and DR-0012's six conditions with its record reference are accepted", () => {
  const schemaName = "assurance-modes.schema.json";

  /* MEMBER 1: the grant with its conditions emptied. This is "downgrades are
     declared, never improvised" applied to AUTHORITY: an artifact claiming a
     delegated regime while recording none of what the delegation was
     conditional on. */
  const emptied = loadModes();
  modeNamed(emptied, "full")["conditions"] = [];
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), emptied), [
    "INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/modes/0/conditions array has 0 items, fewer than the required minimum 1",
  ]);

  /* MEMBER 2, STRUCTURALLY DIFFERENT: the conditions are all there and the
     RECORD REFERENCE is gone, so nothing connects the six sentences to a grant
     anyone made. The two members fail different keywords on different fields
     and one witness would not have covered the other. */
  const unreferenced = loadModes();
  delete modeNamed(unreferenced, "full")["granted-by"];
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), unreferenced), [
    "INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/modes/0/granted-by required property granted-by is missing",
  ]);

  /* THE KEYWORDS REMOVED, one per member, each on a fresh schema object. */
  const withoutMinItems = readSchema(schemaName);
  const authorityThen = (
    (withoutMinItems["$defs"] as Record<string, Record<string, unknown>>)[
      "modeAuthorityRule"
    ] as Record<string, Record<string, Record<string, Record<string, unknown>>>>
  )["then"] as unknown as Record<string, Record<string, Record<string, unknown>>>;
  delete (authorityThen["properties"] as Record<string, Record<string, unknown>>)[
    "conditions"
  ]!["minItems"];
  assert.deepEqual(validateModule.validateToLines(withoutMinItems, emptied), []);

  const withoutRequired = readSchema(schemaName);
  const authorityThen2 = (
    (withoutRequired["$defs"] as Record<string, Record<string, unknown>>)[
      "modeAuthorityRule"
    ] as Record<string, unknown>
  )["then"] as Record<string, unknown>;
  authorityThen2["required"] = ["conditions"];
  assert.deepEqual(validateModule.validateToLines(withoutRequired, unreferenced), []);

  /* RESTORED, both red again. */
  assert.notDeepEqual(validateModule.validateToLines(readSchema(schemaName), emptied), []);
  assert.notDeepEqual(validateModule.validateToLines(readSchema(schemaName), unreferenced), []);

  /* THE OTHER DIRECTION: the shipped `full`, which carries DR-0012's six
     conditions verbatim and names the record, is accepted. The count is
     asserted because a grant recorded with five of six conditions is the
     artifact and the grant differing, which is the hazard this criterion is
     matched to. */
  const shipped = loadModes();
  const full = modeNamed(shipped, "full");
  /* THE COUNT IS GONE (B-003, fix round 1). This assertion read
     `(full["conditions"] as string[]).length === 6`, which is cardinality
     standing in for content: the hazard reviewer replaced all six conditions
     with fabricated one-liners, kept the count at six, and this test plus the
     schema plus every check stayed green. Content is asserted by the two tests
     at the end of this file, one per direction, and neither counts. */
  assert.equal(full["granted-by"], "DR-0012");
  assert.equal(full["merge-authority"], "delegated-under-conditions");
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), shipped), []);
});

/* ------------------------------------------------------------------ */
/* Criterion 4c: escalation bounds, Kind A                              */
/* ------------------------------------------------------------------ */

test("a full mode with no escalation-bounds is rejected naming the field, and is accepted with the required entry removed", () => {
  const schemaName = "assurance-modes.schema.json";
  const document = loadModes();
  delete modeNamed(document, "full")["escalation-bounds"];
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), document), [
    "INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/modes/0/escalation-bounds required property escalation-bounds is missing",
  ]);

  const defanged = readSchema(schemaName);
  const modeThen = (
    (defanged["$defs"] as Record<string, Record<string, unknown>>)["mode"] as Record<
      string,
      unknown
    >
  )["then"] as Record<string, unknown>;
  modeThen["required"] = ["pipeline"];
  assert.deepEqual(validateModule.validateToLines(defanged, document), []);

  assert.notDeepEqual(validateModule.validateToLines(readSchema(schemaName), document), []);

  /* THE OTHER DIRECTION, and the values are asserted rather than only their
     presence: a bound whose limits do not match DR-0012's records a regime
     nobody granted. */
  const bounds = modeNamed(loadModes(), "full")["escalation-bounds"] as Record<string, unknown>;
  assert.equal(bounds["max-fix-rounds-after-review"], 2);
  assert.equal(bounds["recurrence-of-high-in-one-component"], 1);
});

test("escalation-bounds with the two limits and no on-exceeded is rejected, and a value outside the enum is rejected naming the enum", () => {
  const schemaName = "assurance-modes.schema.json";

  /* MEMBER 1: the response is ABSENT. A bound that records the limit and not
     the response encodes DR-0012's stop-and-wait, which is the regime DR-0016
     measured and replaced. */
  const missing = loadModes();
  delete (modeNamed(missing, "full")["escalation-bounds"] as Record<string, unknown>)[
    "on-exceeded"
  ];
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), missing), [
    "INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/modes/0/escalation-bounds/on-exceeded required property on-exceeded is missing",
  ]);

  /* MEMBER 2, STRUCTURALLY DIFFERENT: the response is PRESENT and is a value
     nobody decided. Absence and invention fail different keywords, and the
     second is the likelier one in practice: an author who knows the field
     exists will fill it in with something. */
  const invented = loadModes();
  (modeNamed(invented, "full")["escalation-bounds"] as Record<string, unknown>)["on-exceeded"] =
    "stop-and-wait";
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), invented), [
    "INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here",
    'INVALID #/modes/0/escalation-bounds/on-exceeded value "stop-and-wait" is not one of the permitted values "fresh-implementer-and-third-contract", "escalate-to-owner"',
  ]);

  /* THE KEYWORDS REMOVED, one per member. */
  const withoutRequired = readSchema(schemaName);
  const bounds = (withoutRequired["$defs"] as Record<string, Record<string, unknown>>)[
    "escalationBounds"
  ] as Record<string, unknown>;
  bounds["required"] = ["max-fix-rounds-after-review", "recurrence-of-high-in-one-component"];
  assert.deepEqual(validateModule.validateToLines(withoutRequired, missing), []);

  const withoutEnum = readSchema(schemaName);
  delete (
    (withoutEnum["$defs"] as Record<string, Record<string, unknown>>)["onExceeded"] as Record<
      string,
      unknown
    >
  )["enum"];
  assert.deepEqual(validateModule.validateToLines(withoutEnum, invented), []);

  /* RESTORED, both red again. */
  assert.notDeepEqual(validateModule.validateToLines(readSchema(schemaName), missing), []);
  assert.notDeepEqual(validateModule.validateToLines(readSchema(schemaName), invented), []);
});

test("full's escalation response is the fresh implementer and third contract, not escalation to the owner", () => {
  /* DR-0016, asserted against the SHIPPED data so the kernel's own mode cannot
     silently revert to the regime that was measured and replaced. The negative
     half is asserted explicitly because `escalate-to-owner` is a permitted
     enum value: the schema will never object to it, and this is the only place
     that says which of the two `full` chose. */
  const bounds = modeNamed(loadModes(), "full")["escalation-bounds"] as Record<string, unknown>;
  assert.equal(bounds["on-exceeded"], "fresh-implementer-and-third-contract");
  assert.notEqual(bounds["on-exceeded"], "escalate-to-owner");
});

/* ------------------------------------------------------------------ */
/* Criterion 4d: two review contracts, Kind A                           */
/* ------------------------------------------------------------------ */

test("a mode running clean-room-review with one review contract is rejected naming the pointer, and two named contracts are accepted", () => {
  const schemaName = "assurance-modes.schema.json";
  const document = loadModes();
  modeNamed(document, "full")["review-contracts"] = ["criteria"];
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), document), [
    "INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/modes/0/review-contracts array has 1 items, fewer than the required minimum 2",
  ]);

  const defanged = readSchema(schemaName);
  const reviewThen = (
    (defanged["$defs"] as Record<string, Record<string, unknown>>)[
      "modeReviewContractRule"
    ] as Record<string, unknown>
  )["then"] as Record<string, Record<string, Record<string, unknown>>>;
  delete (reviewThen["properties"] as Record<string, Record<string, unknown>>)[
    "review-contracts"
  ]!["minItems"];
  assert.deepEqual(validateModule.validateToLines(defanged, document), []);

  assert.notDeepEqual(validateModule.validateToLines(readSchema(schemaName), document), []);

  /* THE OTHER DIRECTION, with the ids asserted: T-007's finding is that the
     decorrelation which mattered was in the QUESTION asked, so two contracts
     called `criteria` and `hazard` is the claim, not two entries. */
  const shipped = loadModes();
  assert.deepEqual(modeNamed(shipped, "full")["review-contracts"], ["criteria", "hazard"]);
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), shipped), []);
});

test("two review contracts with the same id are rejected as duplicates and full's two are distinct", () => {
  /* T-007's failure mode reproduced exactly: two entries both named `criteria`
     satisfy `minItems: 2` and give a phase two reviews briefed on the same
     question, which is the state in which both reviewers approved and one
     high-severity live-lock went unfound. */
  const schemaName = "assurance-modes.schema.json";
  const document = loadModes();
  modeNamed(document, "full")["review-contracts"] = ["criteria", "criteria"];
  /* ONE line, not two. `uniqueItems` sits on modeShape rather than inside the
     conditional rule, so no `if`/`then` composite accompanies it; the sibling
     `minItems` test above does produce the composite line, and the difference
     is what shows the two keywords really are at different sites. */
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), document), [
    "INVALID #/modes/0/review-contracts array items 0 and 1 are duplicates and must be unique",
  ]);

  /* THE KEYWORD REMOVED. `uniqueItems` lives on modeShape and `minItems: 2`
     lives on the conditional rule, ONE SITE EACH: a duplicate of either would
     keep rejecting after the other was defanged, and a witness that stayed red
     for the wrong reason would say nothing about the keyword it names. The
     first draft of this file carried both in both places and both witnesses
     came back red, which is how the duplication was found. */
  const defanged = readSchema(schemaName);
  delete (
    (
      (defanged["$defs"] as Record<string, Record<string, unknown>>)["modeShape"] as Record<
        string,
        Record<string, Record<string, unknown>>
      >
    )["properties"]!["review-contracts"] as Record<string, unknown>
  )["uniqueItems"];
  assert.deepEqual(validateModule.validateToLines(defanged, document), []);

  assert.notDeepEqual(validateModule.validateToLines(readSchema(schemaName), document), []);

  const contracts = modeNamed(loadModes(), "full")["review-contracts"] as string[];
  assert.equal(new Set(contracts).size, contracts.length);
  assert.equal(contracts.length, 2);
});

/* ------------------------------------------------------------------ */
/* Criterion 5: the C-2 and C-3 structural constraint                   */
/* ------------------------------------------------------------------ */

/**
 * The four tokens C-2 and C-3 are written in.
 *
 * WRITTEN PLAINLY, and the first version was not (CR-006, fix round 1). It read
 * `["p" + "id", "ki" + "ll", ...]`, which made the four tokens invisible to a
 * grep of this file: a source file that does not contain what it appears to
 * contain, which is the same habit as the NUL bytes one severity up. The
 * concatenation was defending against nothing, because the scan below reads
 * `assurance-modes.yaml` and its schema and never reads this file.
 */
const LIVENESS_TOKENS = ["pid", "kill", "daemon", "background"];

function livenessHits(text: string): string[] {
  const lower = text.toLowerCase();
  return LIVENESS_TOKENS.filter((token) => lower.includes(token));
}

test("assurance-modes.yaml and its schema carry no process-liveness vocabulary", () => {
  /* C-2 and C-3. A stage whose completion could be detected by process
     liveness is the constraint the kernel is being built to remove, and T-008
     measured what its absence costs: two agents died and nine hours and eleven
     minutes passed before anyone noticed, because the supervision was "wait
     for a notification" and a dead process sends none.

     WHAT THIS CHECK IS AND IS NOT. It is a fixed-token presence scan over two
     files. A stage that were liveness-detected WITHOUT using any of the four
     words would pass it, and the plan's hazard map names that residue rather
     than implying the check is stronger. The second line is the hazard review
     contract, which reads prose. */
  for (const path of [modesPath, join(schemasDir, "assurance-modes.schema.json")]) {
    assert.deepEqual(livenessHits(readFileSync(path, "utf8")), [], path);
  }

  /* THE SCAN IS NOT VACUOUS, which is the only thing that makes the two empty
     results above worth anything: a scan that always returned nothing would
     produce the same green. Each token is shown to be found in a stage
     definition that carries it. */
  for (const token of LIVENESS_TOKENS) {
    assert.deepEqual(
      livenessHits(`  - id: watch-until-the-${token}-clears\n`),
      [token],
      token,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3 and 5: the role-model configuration's own content        */
/* ------------------------------------------------------------------ */

test("the role-model configuration covers the six roles, puts every review role at the strongest tier, and names no model", () => {
  /* R-075's rule, asserted over the shipped data rather than over the schema:
     the schema permits `cheaper` on any role, so only this says which roles
     took which tier. */
  const document = yamlModule.parse(readFileSync(rolesPath, "utf8")) as {
    roles: Record<string, unknown>[];
  };
  assert.deepEqual(
    document.roles.map((entry) => entry["role"]).sort(),
    [
      "adversarial-plan-reviewer",
      "clean-room-reviewer",
      "implementer",
      "investigator",
      "orchestrator",
      "plan-writer",
    ],
  );
  for (const id of ["adversarial-plan-reviewer", "clean-room-reviewer", "investigator"]) {
    const entry = document.roles.find((candidate) => candidate["role"] === id);
    assert.equal(entry?.["tier"], "strongest", id);
  }
  /* T-001's ask, which was for the OPTION to exist at all: both review roles
     carry a family constraint and neither is `unconstrained`. */
  for (const id of ["adversarial-plan-reviewer", "clean-room-reviewer"]) {
    const entry = document.roles.find((candidate) => candidate["role"] === id);
    assert.notEqual(entry?.["review-model-family"], undefined, id);
    assert.notEqual(entry?.["review-model-family"], "unconstrained", id);
  }
  /* The implementer is the one role R-075 scopes by phase class, so a flat
     tier alone would drop half the rule. */
  const implementer = document.roles.find((entry) => entry["role"] === "implementer");
  assert.deepEqual(implementer?.["strongest-for"], ["money-path", "architecture"]);
});

/* ------------------------------------------------------------------ */
/* Fix round 1, mechanism 1: identity uniqueness (B-002, B-004)         */
/* ------------------------------------------------------------------ */

test("two modes sharing an id are rejected by id, whether their bodies differ or match", () => {
  const dir = stageContext();
  try {
    /* MEMBER 1, THE DANGEROUS ONE: same id, DIFFERENT bodies. `uniqueItems` is
       deep-object equality, so this array is uniqueItems-clean and the schema
       has nothing to say. It is the reviewer's own reproduction: the crippled
       entry FIRST, with clean-room review dropped and skips emptied, which is
       what `mode show` then served with exit 0. */
    const differing = loadModes();
    const crippled = JSON.parse(JSON.stringify(modeNamed(differing, "full"))) as Record<
      string,
      unknown
    >;
    crippled["pipeline"] = (crippled["pipeline"] as string[]).filter(
      (stage) => stage !== "clean-room-review",
    );
    delete crippled["review-contracts"];
    crippled["skips"] = [];
    modesOf(differing).unshift(crippled);

    /* THE TRAP, ASSERTED RATHER THAN ASSUMED: this member is genuinely outside
       `uniqueItems`' reach. If the schema were already rejecting it, a witness
       resting on it would prove nothing about the new check. */
    assert.equal(
      validateModule
        .validateToLines(readSchema("assurance-modes.schema.json"), differing)
        .filter((line) => line.includes("duplicates and must be unique")).length,
      0,
      "uniqueItems caught a differing-body duplicate, so this member is the wrong witness",
    );

    const differingLines = checkLines(differing, dir);
    assert.ok(
      differingLines.lines.some(
        (line) =>
          line.startsWith("INVALID #/modes/1/id mode id full is declared 2 times, at modes 0, 1") &&
          line.endsWith("(check: mode-ids-are-unique)"),
      ),
      differingLines.lines.join("\n"),
    );

    /* MEMBER 2, STRUCTURALLY DIFFERENT: same id, IDENTICAL bodies. `uniqueItems`
       DOES catch this one at the schema layer, which is exactly why it cannot
       be the only member: a witness resting on it would redden through the old
       keyword and say nothing about the new check. Driven through `runChecks`,
       which runs no schema at all, so the red is attributable to the check. */
    const identical = loadModes();
    modesOf(identical).unshift(
      JSON.parse(JSON.stringify(modeNamed(identical, "full"))) as Record<string, unknown>,
    );
    assert.ok(
      checkLines(identical, dir).lines.some((line) =>
        line.includes("(check: mode-ids-are-unique)"),
      ),
      "the check must catch identical-body duplicates without uniqueItems' help",
    );

    /* THE OTHER DIRECTION, Kind B: the CHECK removed and restored. */
    assert.equal(checksModule.deregisterCheck("mode-ids-are-unique"), true);
    assert.ok(
      !checkLines(differing, dir).lines.some((line) => line.includes("mode-ids-are-unique")),
    );
    checksModule.registerCheck(checksModule.modeIdsAreUnique);
    assert.ok(
      checkLines(differing, dir).lines.some((line) => line.includes("(check: mode-ids-are-unique)")),
    );

    /* CONTROL: the shipped document's three ids are distinct. */
    assert.equal(
      checkLines(loadModes(), dir).lines.filter((line) => line.includes("mode-ids-are-unique"))
        .length,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("two role bindings sharing a role id are rejected by id, whether their bodies differ or match", () => {
  /* B-004: the SAME defect in `role-model-config.yaml`, latent only because
     nothing consumes that document yet. Fixed in the same act, because one
     mechanism is one thing and fixing the instance is what let this class come
     back one phase after M3-P1 closed it on `acceptance[].id`. */
  const load = (): Record<string, unknown> =>
    yamlModule.parse(readFileSync(rolesPath, "utf8")) as Record<string, unknown>;
  const rolesOf = (document: Record<string, unknown>): Record<string, unknown>[] =>
    document["roles"] as Record<string, unknown>[];

  const differing = load();
  const shadow = JSON.parse(
    JSON.stringify(rolesOf(differing).find((entry) => entry["role"] === "clean-room-reviewer")),
  ) as Record<string, unknown>;
  shadow["tier"] = "cheaper";
  delete shadow["review-model-family"];
  rolesOf(differing).unshift(shadow);
  /* DERIVED, NOT PINNED. The shadow is prepended, so the original slides to the
     end and the violation is reported at the LAST index, not at 1. Computing it
     keeps the assertion exact without hard-coding a number that changes the
     moment a seventh role is added. */
  const duplicateAt = rolesOf(differing).length - 1;
  assert.equal(
    validateModule
      .validateToLines(readSchema("role-model-config.schema.json"), differing)
      .filter((line) => line.includes("duplicates and must be unique")).length,
    0,
    "uniqueItems caught a differing-body duplicate, so this member is the wrong witness",
  );
  const differingLines = checksModule.runChecks("role-model-config", differing, undefined);
  assert.ok(
    differingLines.lines.some(
      (line) =>
        line ===
        `INVALID #/roles/${String(duplicateAt)}/role role id clean-room-reviewer is declared 2 times, at roles 0, ${String(duplicateAt)}; an id selects one entry and these select 2 (check: role-ids-are-unique)`,
    ),
    differingLines.lines.join("\n"),
  );
  /* AND THE CONSEQUENCE, not just the shape: the shadow entry cheapens the one
     role DR-0012 made the signature on every merge, and a consumer resolving
     `clean-room-reviewer` by id would take whichever came first. */
  assert.equal(shadow["tier"], "cheaper");

  const identical = load();
  rolesOf(identical).unshift(
    JSON.parse(JSON.stringify(rolesOf(identical)[0])) as Record<string, unknown>,
  );
  assert.ok(
    checksModule
      .runChecks("role-model-config", identical, undefined)
      .lines.some((line) => line.includes("(check: role-ids-are-unique)")),
  );

  assert.equal(checksModule.deregisterCheck("role-ids-are-unique"), true);
  assert.ok(
    !checksModule
      .runChecks("role-model-config", differing, undefined)
      .lines.some((line) => line.includes("role-ids-are-unique")),
  );
  checksModule.registerCheck(checksModule.roleIdsAreUnique);
  assert.ok(
    checksModule
      .runChecks("role-model-config", differing, undefined)
      .lines.some((line) => line.includes("(check: role-ids-are-unique)")),
  );

  assert.equal(
    checksModule
      .runChecks("role-model-config", load(), undefined)
      .lines.filter((line) => line.includes("role-ids-are-unique")).length,
    0,
  );
});

/* ------------------------------------------------------------------ */
/* Fix round 1, mechanism 2: the reader validates before it serves      */
/* ------------------------------------------------------------------ */

test("mode show validates before it serves and refuses a document that is invalid for reasons unrelated to duplicate ids", () => {
  const dir = stageContext();
  try {
    /* THE WITNESS IS DELIBERATELY NOT ABOUT DUPLICATE IDS. Mechanism 1 makes
       one more document state detectable; mechanism 2 is that this command did
       not LOOK. A witness built on a duplicate id would pass through the new
       uniqueness check and tell us nothing about the validation call. */

    /* ARM 1: invalid at the SCHEMA layer, an enum this command never reads. */
    const badEnum = loadModes();
    modeNamed(badEnum, "direct-pr")["merge-authority"] = "nobody";
    const badEnumPath = writeDocument(dir, badEnum, "authority-not-in-enum.yaml");
    const enumRun = runCli(["mode", "show", "--mode", "full", "--file", badEnumPath]);
    assert.equal(enumRun.status, 1, enumRun.stdout + enumRun.stderr);
    assert.equal(enumRun.stdout, "", `an invalid document must not be served:\n${enumRun.stdout}`);
    assert.match(enumRun.stderr, /is not a valid assurance-modes document, so it is not served/);
    assert.match(enumRun.stderr, /INVALID #\/modes\/1\/merge-authority value "nobody" is not one of the permitted values/);

    /* ARM 2, STRUCTURALLY DIFFERENT: valid against the schema and rejected by a
       DERIVED CHECK. The two layers are separate code paths in this command and
       an implementation that called only the first would pass arm 1. */
    const badOrder = loadModes();
    modeNamed(badOrder, "full")["pipeline"] = [
      "intake",
      "verification-pass",
      "plan",
      "implement",
      "adversarial-plan-review",
      "clean-room-review",
      "fix-round",
      "fix-round-verification",
      "merge-on-green",
      "deploy-verify",
      "migration-verify",
      "final-report",
    ];
    const badOrderPath = writeDocument(dir, badOrder, "builds-before-review.yaml");
    assert.deepEqual(
      validateModule.validateToLines(readSchema("assurance-modes.schema.json"), badOrder),
      [],
      "arm 2 must be SCHEMA-VALID, or it does not test the derived-check layer",
    );
    const orderRun = runCli(["mode", "show", "--mode", "full", "--file", badOrderPath]);
    assert.equal(orderRun.status, 1, orderRun.stdout + orderRun.stderr);
    assert.equal(orderRun.stdout, "");
    assert.match(orderRun.stderr, /\(check: mode-stage-order\)/);

    /* THE OTHER DIRECTION: the same command, the same staged directory, a VALID
       document, served with exit 0. Without it the command could be refusing
       everything, which is the failure mode a refusal path invites. */
    const goodPath = writeDocument(dir, loadModes(), "assurance-modes.yaml");
    const good = runCli(["mode", "show", "--mode", "full", "--file", goodPath]);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    assert.deepEqual(section(good.stdout, "pipeline").length, 12);

    /* AND THE SHIPPED DOCUMENT, through the default path with no --file, which
       is the invocation a brief actually makes. */
    assert.equal(runCli(["mode", "show", "--mode", "full"]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Fix round 1, mechanism 3: conditions bound to their grant (B-003)    */
/* ------------------------------------------------------------------ */

test("a delegated grant whose conditions are not in the record it names is rejected naming the condition", () => {
  const dir = stageContext();
  try {
    /* THE HAZARD REVIEWER'S OWN REPRODUCTION: all six conditions replaced by
       fabrications, COUNT KEPT AT SIX so the one count-based guard cannot fire.
       Before this round that document validated, exit 0, with every check and
       the registered test green. */
    const fabricated = loadModes();
    modeNamed(fabricated, "full")["conditions"] = [
      "fabricated condition one, unrelated to DR-0012",
      "fabricated condition two, unrelated to DR-0012",
      "fabricated condition three, unrelated to DR-0012",
      "fabricated condition four, unrelated to DR-0012",
      "fabricated condition five, unrelated to DR-0012",
      "fabricated condition six, unrelated to DR-0012",
    ];
    assert.deepEqual(
      validateModule.validateToLines(readSchema("assurance-modes.schema.json"), fabricated),
      [],
      "the fabrication must be SCHEMA-VALID, or it does not reproduce the finding",
    );
    const path = writeDocument(dir, fabricated, "fabricated-conditions.yaml");
    const run = runCli(["validate", "--type", "assurance-modes", "--context", dir, path]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(
      run.stdout,
      /^INVALID #\/modes\/0\/conditions\/0 mode full cites DR-0012 for a condition that is not a whole quoted item of that record: "fabricated condition one, unrelated to DR-0012" \(check: mode-conditions-quote-granted-by\)$/m,
      run.stdout,
    );
    /* ALL SIX, not just the first: a check that reported one fabrication and
       stopped would let an author fix that line and ship the other five. */
    assert.equal(
      run.stdout.split("\n").filter((line) => line.includes("mode-conditions-quote-granted-by"))
        .length,
      6,
      run.stdout,
    );

    /* MEMBER 2, STRUCTURALLY DIFFERENT AND ADDED IN FIX ROUND 2: a FRAGMENT of
       a real condition. It IS contained in the record, verbatim, so the
       containment predicate this check used to apply accepted it; it is not a
       whole quoted item, so an equality predicate rejects it. This is the arm
       that distinguishes the two predicates on REAL text rather than on
       fabricated text. */
    const fragment = loadModes();
    const realConditions = modeNamed(fragment, "full")["conditions"] as string[];
    const firstClause = (realConditions[0] as string).split(",")[0] as string;
    modeNamed(fragment, "full")["conditions"] = [firstClause, ...realConditions.slice(1)];
    const fragmentPath = writeDocument(dir, fragment, "fragment-condition.yaml");
    const fragmentRun = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      dir,
      fragmentPath,
    ]);
    assert.equal(fragmentRun.status, 1, fragmentRun.stdout + fragmentRun.stderr);
    assert.match(
      fragmentRun.stdout,
      /^INVALID #\/modes\/0\/conditions\/0 mode full cites DR-0012 for a condition that is not a whole quoted item of that record: /m,
      fragmentRun.stdout,
    );
    /* And ONLY that one, so the other five whole quotes still resolve and the
       check is discriminating rather than rejecting the document wholesale. */
    assert.equal(
      fragmentRun.stdout
        .split("\n")
        .filter((line) => line.includes("mode-conditions-quote-granted-by")).length,
      1,
      fragmentRun.stdout,
    );

    /* MEMBER 3, STRUCTURALLY DIFFERENT: the conditions are real and the RECORD
       cannot be resolved, which is the other way the binding can be empty. It
       fails closed rather than passing for want of something to compare with. */
    const noRecords = scratch();
    try {
      cpSync(join(dir, "gate-registry.yaml"), join(noRecords, "gate-registry.yaml"));
      cpSync(join(dir, "schemas"), join(noRecords, "schemas"), { recursive: true });
      const unresolvable = runCli([
        "validate",
        "--type",
        "assurance-modes",
        "--context",
        noRecords,
        modesPath,
      ]);
      assert.equal(unresolvable.status, 1, unresolvable.stdout);
      assert.match(
        unresolvable.stdout,
        /^INVALID #\/modes\/0\/granted-by no decision record DR-0012 was found under .* of the context, so the grant it names cannot be checked \(check: mode-conditions-quote-granted-by\)$/m,
        unresolvable.stdout,
      );
    } finally {
      rmSync(noRecords, { recursive: true, force: true });
    }

    /* THE OTHER DIRECTION, Kind B. */
    assert.equal(checksModule.deregisterCheck("mode-conditions-quote-granted-by"), true);
    assert.ok(
      !checkLines(fabricated, dir).lines.some((line) =>
        line.includes("mode-conditions-quote-granted-by"),
      ),
    );
    checksModule.registerCheck(checksModule.modeConditionsQuoteGrantedBy);
    assert.ok(
      checkLines(fabricated, dir).lines.some((line) =>
        line.includes("(check: mode-conditions-quote-granted-by)"),
      ),
    );

    /* CONTROL: the shipped document's six conditions all resolve. */
    assert.equal(
      checkLines(loadModes(), repoRoot).lines.filter((line) =>
        line.includes("mode-conditions-quote-granted-by"),
      ).length,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("full carries every condition DR-0012 declares, extracted from the record rather than counted", () => {
  /* THE OMISSION DIRECTION, which the shipped check deliberately does not
     cover: "which paragraphs of a prose decision record are its conditions" is
     not derivable without assuming that record's structure, and a kernel check
     that hard-coded one project's heading would redden on formatting. A TEST
     may know the record's shape, because it ships beside the record.

     NOTHING HERE IS A COUNT. The expected list is EXTRACTED from DR-0012, so a
     seventh condition added to the record makes this red without anyone
     editing a number, and six conditions replaced by six others makes it red
     too. */
  const record = readFileSync(
    join(repoRoot, "delivery", "decisions", "DR-0012-delegated-merge-authority.md"),
    "utf8",
  );
  const lines = record.split("\n");
  const start = lines.findIndex((line) => /^## What "clean" means/.test(line));
  assert.notEqual(start, -1, "DR-0012 no longer has the section this test reads");
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const declared = lines
    .slice(start, end === -1 ? lines.length : end)
    .map((line) => /^[0-9]+\.\s+(.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => (match[1] as string).replace(/\s+/g, " ").trim());
  assert.ok(declared.length > 0, "no numbered condition was extracted from DR-0012");

  const carried = (modeNamed(loadModes(), "full")["conditions"] as string[]).map((condition) =>
    condition.replace(/\s+/g, " ").trim(),
  );
  for (const condition of declared) {
    assert.ok(
      carried.includes(condition),
      `assurance-modes.yaml omits a condition DR-0012 declares:\n  ${condition}`,
    );
  }
  /* And no invented extras, which is the same equality from the other side and
     is what the shipped check enforces generally. */
  assert.deepEqual([...carried].sort(), [...declared].sort());
});

/* ------------------------------------------------------------------ */
/* Fix round 1, mechanism 4: the comparison that needed a separator     */
/* ------------------------------------------------------------------ */

test("the charter enum comparison is element-wise, so a mode id containing a separator cannot make two different lists compare equal", () => {
  const dir = stageContext();
  try {
    /* WHY THIS TEST EXISTS. `charter-mode-enum-matches-modes` compared the two
       lists by joining each with a separator, and the separator in the source
       was two LITERAL NUL BYTES (A-001/B-001). Replacing NUL with a space
       would have been the instance fix and would have introduced this bug;
       the comparison is now element-wise and has no separator at all.

       The arm below discriminates: under a space separator the two lists join
       to the same string and the check would stay silent. */
    assert.equal(["a b"].join(" "), ["a", "b"].join(" "));

    const charterPath = join(dir, "schemas", "charter.schema.json");
    const staged = JSON.parse(readFileSync(charterPath, "utf8")) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    for (const field of ["delivery-mode", "assurance-tier"]) {
      (staged["properties"] as Record<string, Record<string, unknown>>)[field]!["enum"] = ["a", "b"];
    }
    writeFileSync(charterPath, JSON.stringify(staged, undefined, 2));

    const separated = checksModule.runChecks(
      "assurance-modes",
      { kind: "assurance-modes", version: 1, modes: [{ id: "a b" }] },
      dir,
    );
    assert.ok(
      separated.lines.some(
        (line) =>
          line.includes("(check: charter-mode-enum-matches-modes)") &&
          line.includes("declares mode ids [a b]") &&
          line.includes("is [a, b]"),
      ),
      separated.lines.join("\n"),
    );

    /* ARM 2, AND IT EXISTS BECAUSE ARM 1 ALONE WAS NOT A WITNESS. The first
       version of this test carried only arm 1, and arm 1 differs in LENGTH, so
       a defang that kept a length comparison and threw the content away stayed
       green: the witness member built on it came back green and proved nothing.
       This arm is length-EQUAL and content-different, so the two arms together
       pin both halves of the comparison and each has a member that breaks it. */
    const contentOnly = checksModule.runChecks(
      "assurance-modes",
      { kind: "assurance-modes", version: 1, modes: [{ id: "a" }, { id: "c" }] },
      dir,
    );
    assert.ok(
      contentOnly.lines.some(
        (line) =>
          line.includes("(check: charter-mode-enum-matches-modes)") &&
          line.includes("declares mode ids [a, c]") &&
          line.includes("is [a, b]"),
      ),
      contentOnly.lines.join("\n"),
    );

    /* CONTROL: the same staged enum against the matching ids is silent, so the
       check is comparing rather than always complaining. */
    const matching = checksModule.runChecks(
      "assurance-modes",
      { kind: "assurance-modes", version: 1, modes: [{ id: "a" }, { id: "b" }] },
      dir,
    );
    assert.equal(
      matching.lines.filter((line) => line.includes("charter-mode-enum-matches-modes")).length,
      0,
      matching.lines.join("\n"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Fix round 2: containment is not equality (the short-string class)    */
/* ------------------------------------------------------------------ */

test("conditions shorter than the record's own words are rejected, because a condition must be a whole quoted item and not a substring", () => {
  /* THE MECHANISM THIS TEST GUARDS: a containment predicate standing in for an
     equality predicate. `mode-conditions-quote-granted-by` first asked whether
     each condition OCCURRED ANYWHERE in the record, as one normalized blob, and
     containment is trivially satisfiable by short strings.

     MEASURED on dd4e906, before the fix: replacing all six of DR-0012's
     merge-authority conditions with `["a", "the", "review", "merge", "is",
     "of"]` produced NO violation and `validate` exited 0. Every one of those
     words occurs in the record.

     THIS ARM IS SEPARATE FROM THE FABRICATED-SENTENCE TEST ABOVE ON PURPOSE.
     Long fabrications are caught by containment too, so a witness resting on
     them stays red when the predicate is reverted and proves nothing about
     which predicate is in force. Only the short-string arm distinguishes them,
     which is why it has its own behavior and its own witness spec. */
  const dir = stageContext();
  try {
    const shortStrings = ["a", "the", "review", "merge", "is", "of"];

    /* THE PREMISE, ASSERTED RATHER THAN ASSUMED: every one of these really does
       occur in DR-0012, so the arm exercises the containment/equality
       difference and not merely "these words are absent". Without this the test
       would pass for the wrong reason on any record. */
    const record = readFileSync(
      join(repoRoot, "delivery", "decisions", "DR-0012-delegated-merge-authority.md"),
      "utf8",
    ).toLowerCase();
    for (const word of shortStrings) {
      assert.ok(record.includes(word), `"${word}" does not occur in DR-0012 at all`);
    }

    const junk = loadModes();
    modeNamed(junk, "full")["conditions"] = shortStrings;
    assert.deepEqual(
      validateModule.validateToLines(readSchema("assurance-modes.schema.json"), junk),
      [],
      "the junk conditions must be SCHEMA-VALID, or this tests the schema and not the check",
    );

    const path = writeDocument(dir, junk, "short-string-conditions.yaml");
    const run = runCli(["validate", "--type", "assurance-modes", "--context", dir, path]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    /* ALL SIX, one per condition, so a check that caught the longest and
       stopped could not pass. */
    for (let position = 0; position < shortStrings.length; position += 1) {
      assert.match(
        run.stdout,
        new RegExp(
          `^INVALID #/modes/0/conditions/${String(position)} mode full cites DR-0012 for a condition that is not a whole quoted item of that record: "${shortStrings[position] as string}" \\(check: mode-conditions-quote-granted-by\\)$`,
          "m",
        ),
        run.stdout,
      );
    }

    /* THE EXTRACTOR IS NOT VACUOUS. If `quotableUnits` returned nothing this
       test would pass for the wrong reason, and so would every condition
       rejection above. The six real conditions ARE units of the record. */
    const units = checksModule.quotableUnits(
      readFileSync(
        join(repoRoot, "delivery", "decisions", "DR-0012-delegated-merge-authority.md"),
        "utf8",
      ),
    );
    assert.ok(units.size > 10, `quotableUnits extracted ${String(units.size)} units`);
    for (const condition of modeNamed(loadModes(), "full")["conditions"] as string[]) {
      assert.ok(
        units.has(condition.replace(/\s+/g, " ").trim()),
        `a shipped condition is not a quotable unit of DR-0012:\n  ${condition}`,
      );
    }
    /* And a unit is a WHOLE item: the first clause of the first condition is in
       the record and is NOT a unit, which is the equality half in one line. */
    const firstCondition = (modeNamed(loadModes(), "full")["conditions"] as string[])[0] as string;
    assert.equal(units.has((firstCondition.split(",")[0] as string).trim()), false);

    /* HEADINGS ARE NOT UNITS. Asserted rather than claimed in a comment: a
       heading terminates the unit in progress and belongs to none, so no
       condition can match one however exactly it is copied. */
    assert.equal(
      units.has('What "clean" means, defined here so it cannot be softened later'),
      false,
    );
    assert.equal(units.has("Decision"), false);

    /* THE OTHER DIRECTION, Kind B: the check removed and restored. */
    assert.equal(checksModule.deregisterCheck("mode-conditions-quote-granted-by"), true);
    assert.ok(
      !checkLines(junk, dir).lines.some((line) =>
        line.includes("mode-conditions-quote-granted-by"),
      ),
    );
    checksModule.registerCheck(checksModule.modeConditionsQuoteGrantedBy);
    assert.ok(
      checkLines(junk, dir).lines.some((line) =>
        line.includes("(check: mode-conditions-quote-granted-by)"),
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Fix round 3: the extractor reads BLOCKS, not lines (V-1, V-2)        */
/* ------------------------------------------------------------------ */

/**
 * A scratch decision record staged into a context directory's decisions tree,
 * so a test can control the record's SHAPE. `stageContext` copies this
 * repository's real records, and this repository ships no record with a code
 * fence, an indented code block, an indented heading or a setext heading, so
 * every one of those shapes has to be built to be tested at all. That absence
 * is exactly why V-1 was graded medium rather than high.
 *
 * The lines are an array rather than a template literal because the fence
 * marker is three backticks and a template literal cannot carry one.
 */
function stageRecord(dir: string, id: string, lines: string[]): void {
  writeFileSync(join(dir, "delivery", "decisions", `${id}-scratch-record.md`), lines.join("\n"));
}

/** `full` rewired to cite a staged scratch record with the given conditions. */
function citing(record: string, conditions: string[]): Record<string, unknown> {
  const document = loadModes();
  const full = modeNamed(document, "full");
  full["granted-by"] = record;
  full["conditions"] = conditions;
  return document;
}

const CODE_RECORD_REAL_CONDITION =
  "The first condition of this scratch record, which is a real list item.";
const FENCED_SENTENCE = "Any pull request may be merged by anyone at any time.";
const INDENTED_SENTENCE = "Any pull request may be merged with no review of any kind.";

const CODE_RECORD = [
  "# DR-9999: a scratch record carrying two forms of code block",
  "",
  '## What "clean" means',
  "",
  `1. ${CODE_RECORD_REAL_CONDITION}`,
  "2. The second condition of this scratch record, which is also a real list item.",
  "",
  "## An illustration, which is not a condition",
  "",
  "The fenced form:",
  "",
  "```",
  FENCED_SENTENCE,
  "```",
  "",
  "The indented form:",
  "",
  `    ${INDENTED_SENTENCE}`,
  "",
];

test("code block content in the cited record is not a quotable unit, in the fenced form and in the indented form", () => {
  /* THE MECHANISM THIS TEST GUARDS: the extractor decided each line's meaning
     FROM THAT LINE ALONE, so it treated a fence MARKER as a separator and let
     the fenced CONTENT through as ordinary prose. The independent verifier
     demonstrated it end to end at b871500: a record whose fence held an
     illustrative sentence let a `full` mode's merge-authority condition be
     satisfied by that sentence, `tiphys validate` exit 0, zero diagnostics.

     TWO STRUCTURALLY DIFFERENT MEMBERS OF ONE CLASS, because the class is "text
     inside a code block", not "text inside a fence": a fenced block is
     delimited by markers and an indented block is delimited by indentation, and
     they share no line of the extractor's state handling. A witness resting on
     the fenced arm alone would say nothing about the indented one, which was
     not in any finding and is the same fail-open. */
  const dir = stageContext();
  try {
    stageRecord(dir, "DR-9999", CODE_RECORD);
    const record = readFileSync(
      join(dir, "delivery", "decisions", "DR-9999-scratch-record.md"),
      "utf8",
    );

    /* AT THE FUNCTION, so the arms below cannot pass for want of any units. */
    const units = checksModule.quotableUnits(record);
    assert.equal(
      units.has(CODE_RECORD_REAL_CONDITION),
      true,
      `the record's own list item is not a unit; extracted ${[...units].join(" | ")}`,
    );
    assert.equal(units.has(FENCED_SENTENCE), false, [...units].join(" | "));
    assert.equal(units.has(INDENTED_SENTENCE), false, [...units].join(" | "));

    /* MEMBER 1, THE FENCED FORM, END TO END THROUGH THE COMMAND. */
    const fencedPath = writeDocument(
      dir,
      citing("DR-9999", [FENCED_SENTENCE]),
      "fenced-condition.yaml",
    );
    const fenced = runCli(["validate", "--type", "assurance-modes", "--context", dir, fencedPath]);
    assert.equal(fenced.status, 1, fenced.stdout + fenced.stderr);
    assert.match(
      fenced.stdout,
      new RegExp(
        `^INVALID #/modes/0/conditions/0 mode full cites DR-9999 for a condition that is not a whole quoted item of that record: "${FENCED_SENTENCE}" \\(check: mode-conditions-quote-granted-by\\)$`,
        "m",
      ),
      fenced.stdout,
    );

    /* MEMBER 2, THE INDENTED FORM, same command and same record. */
    const indentedPath = writeDocument(
      dir,
      citing("DR-9999", [INDENTED_SENTENCE]),
      "indented-condition.yaml",
    );
    const indented = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      dir,
      indentedPath,
    ]);
    assert.equal(indented.status, 1, indented.stdout + indented.stderr);
    assert.match(
      indented.stdout,
      new RegExp(
        `^INVALID #/modes/0/conditions/0 mode full cites DR-9999 for a condition that is not a whole quoted item of that record: "${INDENTED_SENTENCE}" \\(check: mode-conditions-quote-granted-by\\)$`,
        "m",
      ),
      indented.stdout,
    );

    /* THE OTHER DIRECTION, and it is not decoration: an extractor that returned
       an empty set would satisfy both arms above and reject everything. A REAL
       list item of the SAME record still resolves, through the same command,
       exit 0. */
    const realPath = writeDocument(
      dir,
      citing("DR-9999", [CODE_RECORD_REAL_CONDITION]),
      "real-condition.yaml",
    );
    const real = runCli(["validate", "--type", "assurance-modes", "--context", dir, realPath]);
    assert.equal(real.status, 0, real.stdout + real.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const HEADING_RECORD_REAL_CONDITION =
  "The only condition of this scratch record, which is a real list item.";
const INDENTED_HEADING = "# An indented heading, which is not a condition";
const SETEXT_HEADING = "A setext heading, which is not a condition";

const LIST_ENDING_PARAGRAPH = "A top-level paragraph, which ends the list above.";

/**
 * FIX ROUND 5 MOVED THE LIST-ENDING PARAGRAPH IN HERE, and the reason is a trap
 * this phase has now hit twice. Before round 5 the indented heading sat directly
 * under the list item, so once V-4 made an interrupter INSIDE an item stop
 * ending the item, this record's indented `#` became item content rather than a
 * top-level heading. The witness member still reddened, but on a DIFFERENT
 * assertion, so it had stopped demonstrating V-2 while still looking green in
 * the gate. A top-level paragraph closes the list first, so the heading below it
 * is unambiguously at top level and the member means what it says.
 */
const HEADING_RECORD = [
  "# DR-9998: a scratch record carrying two forms of heading",
  "",
  '## What "clean" means',
  "",
  `1. ${HEADING_RECORD_REAL_CONDITION}`,
  "",
  LIST_ENDING_PARAGRAPH,
  "",
  ` ${INDENTED_HEADING}`,
  "",
  "A paragraph under the indented heading.",
  "",
  SETEXT_HEADING,
  "-----------------------------------------",
  "",
  "A paragraph under the setext heading.",
  "",
];

test("heading text in the cited record is not a quotable unit, for an indented ATX heading and for a setext heading", () => {
  /* THE MECHANISM, ONE LEVEL DOWN FROM THE FENCE: the extractor recognised a
     heading only as `^#`, so an indented `#` was prose (V-2), and it could not
     see a setext heading at all, because a setext heading is a property of the
     block ABOVE the underline and no one-line rule can read it.

     TWO STRUCTURALLY DIFFERENT MEMBERS: the ATX form is recognised by the
     line's own first non-space character, the setext form only by what the NEXT
     line does to the block already collected. Nothing in the extractor handles
     both.

     MEASURED at b871500 with the same record text: the indented heading came
     back as the unit "# An indented heading, which is not a condition" (the
     marker still attached) and the setext heading as "A setext heading, which
     is not a condition -----------------------------------------". Both are
     quotable there and neither is here. */
  const dir = stageContext();
  try {
    stageRecord(dir, "DR-9998", HEADING_RECORD);
    const record = readFileSync(
      join(dir, "delivery", "decisions", "DR-9998-scratch-record.md"),
      "utf8",
    );

    const units = checksModule.quotableUnits(record);
    assert.equal(
      units.has(HEADING_RECORD_REAL_CONDITION),
      true,
      `the record's own list item is not a unit; extracted ${[...units].join(" | ")}`,
    );
    assert.equal(units.has(INDENTED_HEADING), false, [...units].join(" | "));
    assert.equal(units.has(SETEXT_HEADING), false, [...units].join(" | "));
    /* And the paragraphs BELOW each heading are still units, so the fix ends
       the heading rather than swallowing what follows it. */
    assert.equal(units.has("A paragraph under the indented heading."), true);
    assert.equal(units.has("A paragraph under the setext heading."), true);
    /* THE PREMISE OF BOTH ARMS, ASSERTED RATHER THAN ASSUMED: the list really
       has ended before either heading, so neither is being judged as content of
       a list item. Without this the arms could pass or fail for V-4's reason
       instead of V-2's, which is what happened before round 5 moved this line
       into the record. */
    assert.equal(units.has(LIST_ENDING_PARAGRAPH), true, [...units].join(" | "));

    /* MEMBER 1, THE INDENTED ATX FORM, end to end. */
    const atxPath = writeDocument(dir, citing("DR-9998", [INDENTED_HEADING]), "atx-condition.yaml");
    const atx = runCli(["validate", "--type", "assurance-modes", "--context", dir, atxPath]);
    assert.equal(atx.status, 1, atx.stdout + atx.stderr);
    assert.match(
      atx.stdout,
      /^INVALID #\/modes\/0\/conditions\/0 mode full cites DR-9998 for a condition that is not a whole quoted item of that record: "# An indented heading, which is not a condition" \(check: mode-conditions-quote-granted-by\)$/m,
      atx.stdout,
    );

    /* MEMBER 2, THE SETEXT FORM. */
    const setextPath = writeDocument(
      dir,
      citing("DR-9998", [SETEXT_HEADING]),
      "setext-condition.yaml",
    );
    const setext = runCli(["validate", "--type", "assurance-modes", "--context", dir, setextPath]);
    assert.equal(setext.status, 1, setext.stdout + setext.stderr);
    assert.match(
      setext.stdout,
      new RegExp(
        `^INVALID #/modes/0/conditions/0 mode full cites DR-9998 for a condition that is not a whole quoted item of that record: "${SETEXT_HEADING}" \\(check: mode-conditions-quote-granted-by\\)$`,
        "m",
      ),
      setext.stdout,
    );

    /* THE OTHER DIRECTION: the record's real list item still resolves, exit 0. */
    const realPath = writeDocument(
      dir,
      citing("DR-9998", [HEADING_RECORD_REAL_CONDITION]),
      "real-condition.yaml",
    );
    const real = runCli(["validate", "--type", "assurance-modes", "--context", dir, realPath]);
    assert.equal(real.status, 0, real.stdout + real.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* CR-004 (DR-0020): the limits are disclosed IN THE SHIPPED ARTIFACTS  */
/* ------------------------------------------------------------------ */

/** The line of `mode show` output that begins with `<name>: `, or undefined. */
function headed(stdout: string, name: string): string | undefined {
  return stdout.split("\n").find((line) => line.startsWith(`${name}: `));
}

test("mode show says which mode is the un-downgraded process and which is a declared downgrade never exercised", () => {
  /* CR-004 MEMBER 1, MEASURED BY THE CONSUMER LENS: `mode show` printed
     `direct-pr` and `local-only` with exactly the formatting and confidence of
     `full`, and the one place that recorded the difference is the plan, which
     `npm pack` excludes. An operator who has not read the plan was given a
     printout that looked equally authoritative for a mode no phase has ever
     been delivered under.

     THE ANNOTATION IS DERIVED, NOT A LIST OF TWO IDS. The two inputs are
     whether the document is the kernel's own (no --file) and whether the mode
     IS the one blueprint section 8 names: "The current proven process is the
     definition of `full`." This test walks every mode the shipped document
     declares and derives the same two facts itself, so a fourth mode added
     later is covered without an edit.

     CR-002, ROUND 9: THIS TEST USED TO DERIVE ITS EXPECTATION FROM THE SAME
     UNSOUND PROXY THE CODE DID, the skip count, so it agreed with the code by
     construction and could not see the defect. It now keys off the NAME, which
     is what blueprint section 8 actually defines, and the skip count becomes
     something ASSERTED ABOUT the shipped data rather than the ground of the
     expectation. The two arms therefore disagree when the data is wrong, which
     is the entire point. */
  const declared = modesOf(loadModes()).map((mode) => String(mode["id"]));
  assert.ok(declared.length >= 2, `only ${String(declared.length)} mode(s) declared`);

  const statuses = new Map<string, string>();
  let downgrades = 0;
  let undowngraded = 0;
  for (const id of declared) {
    const run = runCli(["mode", "show", "--mode", id]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const status = headed(run.stdout, "execution-status");
    assert.ok(status !== undefined, `no execution-status line for ${id}:\n${run.stdout}`);
    statuses.set(id, status);

    const skips = section(run.stdout, "skips").filter((entry) => entry !== "(none)");
    if (id === "full") {
      undowngraded += 1;
      assert.ok(
        !status.includes("NEVER EXERCISED"),
        `${id} is the reference mode and was marked never exercised: ${status}`,
      );
      assert.match(status, /un-downgraded process/);
      /* WHAT MAKES THAT SENTENCE TRUE, ASSERTED RATHER THAN ASSUMED. Keying the
         annotation off the NAME is only honest while the mode carrying that
         name really is un-downgraded, so the burden moves here: the shipped
         `full` declares NO skipped stage. Without this assertion a data edit
         could make `full` a declared downgrade while the CLI kept calling it
         the un-downgraded process, which is the CR-002 hazard re-entering
         through the fix for it. */
      assert.deepEqual(
        skips,
        [],
        `full is annotated as the un-downgraded process while declaring skips: ${skips.join(", ")}`,
      );
      continue;
    }
    downgrades += 1;
    assert.match(status, /DECLARED AND VALIDATED, NEVER EXERCISED/);
    /* THE COUNT IS STILL THE DISCRIMINATING PART for this arm. A constant
       sentence would satisfy the match above; only a line carrying this mode's
       own skip count can satisfy this, so the annotation is still computed from
       the mode and not printed from a template. */
    assert.ok(
      status.includes(`declares ${String(skips.length)} skipped stage(s)`),
      `${id} skips ${String(skips.length)} stage(s) but its status says: ${status}`,
    );
    assert.match(status, /DR-0020/);
  }
  /* BOTH ARMS EXIST IN THE SHIPPED DOCUMENT, so neither branch is vacuous. */
  assert.ok(undowngraded > 0 && downgrades > 0, `${String(undowngraded)}/${String(downgrades)}`);
  /* AND THE TWO ARMS DIFFER, which is what a single constant string cannot do. */
  assert.equal(new Set(statuses.values()).size >= 2, true, [...statuses.values()].join("\n"));

  /* THE THIRD ARM: a document supplied with --file is NOT the kernel's own, so
     the honest answer is that tiphys does not know. Without this the command
     would be asserting things about a consumer's document that nothing here
     can support. */
  const dir = stageContext();
  try {
    const path = writeDocument(dir, loadModes(), "consumer-modes.yaml");
    const supplied = runCli(["mode", "show", "--mode", "full", "--file", path]);
    assert.equal(supplied.status, 0, supplied.stdout + supplied.stderr);
    const status = headed(supplied.stdout, "execution-status");
    assert.ok(status !== undefined, supplied.stdout);
    assert.match(status, /not determinable here/);
    /* The SAME mode, byte-identical content, read the two ways: the annotation
       has to come from the invocation and not from the mode's fields. */
    assert.notEqual(status, statuses.get("full"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the shipped schemas disclose the closed vocabulary at v0.1.0 and the enums really are closed", () => {
  /* CR-004 MEMBER 2, AND THE TRAP THIS REPOSITORY KEEPS PAYING FOR. Half of
     this test asserts that the disclosure is PRESENT; the other half asserts by
     EXECUTION that the enums really do reject a consumer's own id, because a
     $comment that claimed more than its schema does is exactly the failure V-1
     was an instance of (`src/checks.ts` claimed a condition could never match a
     fence, and it could). A disclosure with no behaviour behind it is worse
     than none. */
  const disclosures: [string, string[]][] = [
    ["assurance-modes.schema.json", ["$defs.modeShape.properties.id", "$defs.stageId"]],
    ["role-model-config.schema.json", ["$defs.roleBinding.properties.role"]],
    ["charter.schema.json", ["properties.delivery-mode", "properties.assurance-tier"]],
  ];
  for (const [schemaName, pointers] of disclosures) {
    const schema = readSchema(schemaName);
    for (const pointer of pointers) {
      let node: unknown = schema;
      for (const key of pointer.split(".")) {
        node = (node as Record<string, unknown>)[key];
        assert.ok(node !== undefined, `${schemaName} has no ${pointer}`);
      }
      const comment = (node as Record<string, unknown>)["$comment"];
      assert.equal(typeof comment, "string", `${schemaName} ${pointer} carries no $comment`);
      assert.match(comment as string, /CLOSED VOCABULARY AT v0\.1\.0/);
      assert.match(comment as string, /DR-0020/);
      /* The enum is really there, so the $comment is describing this node. */
      assert.ok(
        Array.isArray((node as Record<string, unknown>)["enum"]),
        `${schemaName} ${pointer} carries the disclosure but no enum`,
      );
    }
  }

  /* THE BEHAVIOUR THE DISCLOSURE CLAIMS, exercised with the consumer lens's own
     three ids: a mode `standard`, a stage `design`, a role `backend-developer`,
     plus a charter selecting `standard`. Each must be REJECTED, or the
     disclosure is the overclaim it warns about. */
  const consumerModes = loadModes();
  modeNamed(consumerModes, "full")["id"] = "standard";
  assert.ok(
    validateModule
      .validateToLines(readSchema("assurance-modes.schema.json"), consumerModes)
      .some((line) => line.includes('value "standard" is not one of the permitted values')),
    "a consumer's own mode id was accepted",
  );

  const consumerStages = loadModes();
  (modeNamed(consumerStages, "full")["pipeline"] as string[])[0] = "design";
  assert.ok(
    validateModule
      .validateToLines(readSchema("assurance-modes.schema.json"), consumerStages)
      .some((line) => line.includes('value "design" is not one of the permitted values')),
    "a consumer's own stage id was accepted",
  );

  const consumerRoles = yamlModule.parse(readFileSync(rolesPath, "utf8")) as Record<
    string,
    unknown
  >;
  ((consumerRoles["roles"] as Record<string, unknown>[])[0] as Record<string, unknown>)["role"] =
    "backend-developer";
  assert.ok(
    validateModule
      .validateToLines(readSchema("role-model-config.schema.json"), consumerRoles)
      .some((line) => line.includes('value "backend-developer" is not one of the permitted values')),
    "a consumer's own role id was accepted",
  );

  const consumerCharter = charterFromTemplate();
  consumerCharter["delivery-mode"] = "standard";
  assert.ok(
    validateModule
      .validateToLines(readSchema("charter.schema.json"), consumerCharter)
      .some((line) => line.includes('value "standard" is not one of the permitted values')),
    "a consumer's own delivery-mode was accepted",
  );

  /* AND THE DISCLOSURE SHIPS, which is the whole reason it is in the schemas
     and not in delivery/. `npm pack` was measured by the consumer reviewer at
     123 files with no delivery/; this asserts the `files` list that produces
     that, so a later edit moving schemas out or delivery in reddens here. */
  const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    files: string[];
  };
  assert.ok(manifest.files.includes("schemas"), manifest.files.join(", "));
  assert.ok(
    !manifest.files.some((entry) => entry.startsWith("delivery")),
    manifest.files.join(", "),
  );
});

test("mode show presents the escalation bounds as data and states the release limits on every mode", () => {
  /* CR-004 ITEM 3. Nothing in this release counts a fix round or detects a
     recurrence, so a bare `escalation-bounds:` header invites a reader to
     assume an enforcement engine that does not exist. */
  const full = runCli(["mode", "show", "--mode", "full"]);
  assert.equal(full.status, 0, full.stdout + full.stderr);
  const lines = full.stdout.split("\n");

  const bounds = lines.find((line) => line.startsWith("escalation-bounds"));
  assert.ok(bounds !== undefined, full.stdout);
  assert.match(bounds, /data an orchestrator brief cites/);
  assert.match(bounds, /nothing in this release counts fix rounds/);
  /* THE DISCRIMINATING HALF: the bare header must not be what is printed. */
  assert.equal(lines.includes("escalation-bounds:"), false, full.stdout);
  /* The values are still there and still indented, so the disclaimer did not
     cost the reader the data. */
  assert.ok(
    lines.some((line) => line.startsWith("  max-fix-rounds-after-review: ")),
    full.stdout,
  );

  /* THE LIMITS LINE, on EVERY declared mode and not only on the one that
     carries bounds, because a consumer reading about a downgraded mode is the
     reader most likely to be misled about what this release can do. */
  for (const mode of modesOf(loadModes())) {
    const run = runCli(["mode", "show", "--mode", String(mode["id"])]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const limits = headed(run.stdout, "limits");
    assert.ok(limits !== undefined, `no limits line for ${String(mode["id"])}:\n${run.stdout}`);
    assert.match(limits, /closed enums/);
    assert.match(limits, /cannot extend them at v0\.1\.0/);
    assert.match(limits, /DR-0020/);
    assert.match(limits, /nothing in this release resolves a project into a mode/);
  }
});

/* ------------------------------------------------------------------ */
/* Fix round 4: a list item's unit is the WHOLE item (V-1, DR-0004)     */
/* ------------------------------------------------------------------ */

const ITEM_FIRST_PARAGRAPH = "Run the first command, which opens this item.";
const ITEM_CONTINUATION = "tiphys gates run --registry gate-registry.yaml --mode full";
const PARENT_ITEM = "The validator uses these policies:";
const NESTED_SUB_ITEM = "strict mode enabled";

/**
 * A record carrying BOTH shapes of list-item content: a continuation paragraph
 * separated by a blank line (DR-0004's shape, which is the live one) and a
 * nested sub-item (DR-0013's shape).
 *
 * The continuation is indented THREE columns, which is the enclosing item's
 * content column, not four past it: that is what makes it a continuation
 * paragraph rather than an indented code block, and it is exactly how DR-0004
 * is written.
 */
const LIST_CONTENT_RECORD = [
  "# DR-9997: a scratch record whose list items carry more than one block",
  "",
  '## What "clean" means',
  "",
  `1. ${ITEM_FIRST_PARAGRAPH}`,
  "",
  `   ${ITEM_CONTINUATION}`,
  "",
  `2. ${PARENT_ITEM}`,
  `   - ${NESTED_SUB_ITEM}`,
  "   - all errors enabled",
  "",
  "3. A flat item with no second block at all.",
  "",
];

test("a list item's continuation paragraph and its nested sub-items are part of the item, not quotable units of their own", () => {
  /* THE MECHANISM, and it is the one the round-3 extractor still had. A blank
     line was treated as a unit boundary unconditionally, and a nested marker
     flushed the item that encloses it. Both leave the item's FIRST PARAGRAPH
     standing as a whole quotable unit while the item itself carries more, which
     is a FRAGMENT passing as a whole quote: precisely the defect
     `mode-conditions-quote-granted-by` exists to prevent, arriving through the
     extractor instead of through the comparison.

     THIS ONE WAS LIVE, which V-1's fenced form never was. Measured at the
     round-3 head against this repository's own records:
     `delivery/decisions/DR-0004-elevated-permissions.md` yielded 22 units, four
     of them command blocks standing alone as independent units and their items
     standing alone without them; at this head it yields 18 and neither half is
     separately quotable. `DR-0013-schema-validator-implementation.md` has the
     nested form. Both are asserted below against the REAL files, not against a
     fixture, because a fixture cannot go stale the way a shipped record can. */
  const dir = stageContext();
  try {
    stageRecord(dir, "DR-9997", LIST_CONTENT_RECORD);
    const record = readFileSync(
      join(dir, "delivery", "decisions", "DR-9997-scratch-record.md"),
      "utf8",
    );
    const units = checksModule.quotableUnits(record);

    /* AT THE FUNCTION. The item is ONE unit carrying both blocks, and neither
       block is a unit by itself. */
    assert.equal(
      units.has(`${ITEM_FIRST_PARAGRAPH} ${ITEM_CONTINUATION}`),
      true,
      [...units].join(" | "),
    );
    assert.equal(units.has(ITEM_FIRST_PARAGRAPH), false, [...units].join(" | "));
    assert.equal(units.has(ITEM_CONTINUATION), false, [...units].join(" | "));
    assert.equal(units.has(PARENT_ITEM), false, [...units].join(" | "));
    assert.equal(units.has(NESTED_SUB_ITEM), false, [...units].join(" | "));
    /* AND THE OTHER DIRECTION: a flat item is still exactly itself, so the fix
       did not simply glue the whole document into one unit. */
    assert.equal(units.has("A flat item with no second block at all."), true, [...units].join(" | "));

    /* MEMBER 1, END TO END, THE DR-0004 SHAPE: a condition equal to the item's
       first paragraph is a fragment and is rejected. */
    const fragmentPath = writeDocument(
      dir,
      citing("DR-9997", [ITEM_FIRST_PARAGRAPH]),
      "item-first-paragraph.yaml",
    );
    const fragment = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      dir,
      fragmentPath,
    ]);
    assert.equal(fragment.status, 1, fragment.stdout + fragment.stderr);
    assert.match(
      fragment.stdout,
      new RegExp(
        `^INVALID #/modes/0/conditions/0 mode full cites DR-9997 for a condition that is not a whole quoted item of that record: "${ITEM_FIRST_PARAGRAPH}" \\(check: mode-conditions-quote-granted-by\\)$`,
        "m",
      ),
      fragment.stdout,
    );

    /* MEMBER 2, END TO END, THE NESTED FORM: a sub-item is content of the item
       above it and is not a whole quoted item either. */
    const nestedPath = writeDocument(
      dir,
      citing("DR-9997", [PARENT_ITEM]),
      "parent-item-only.yaml",
    );
    const nested = runCli(["validate", "--type", "assurance-modes", "--context", dir, nestedPath]);
    assert.equal(nested.status, 1, nested.stdout + nested.stderr);
    assert.match(
      nested.stdout,
      new RegExp(
        `^INVALID #/modes/0/conditions/0 mode full cites DR-9997 for a condition that is not a whole quoted item of that record: "${PARENT_ITEM}" \\(check: mode-conditions-quote-granted-by\\)$`,
        "m",
      ),
      nested.stdout,
    );

    /* THE OTHER DIRECTION, END TO END: the WHOLE item resolves, exit 0. Without
       this the extractor could be returning nothing and both arms above would
       pass for the wrong reason. */
    const wholePath = writeDocument(
      dir,
      citing("DR-9997", [`${ITEM_FIRST_PARAGRAPH} ${ITEM_CONTINUATION}`]),
      "whole-item.yaml",
    );
    const whole = runCli(["validate", "--type", "assurance-modes", "--context", dir, wholePath]);
    assert.equal(whole.status, 0, whole.stdout + whole.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  /* AND AGAINST THE TWO REAL RECORDS THAT CARRY THESE SHAPES TODAY. This is the
     half a fixture cannot give: if either record is reformatted into a shape
     the extractor mishandles, this reddens. */
  const dr0004 = checksModule.quotableUnits(
    readFileSync(
      join(repoRoot, "delivery", "decisions", "DR-0004-elevated-permissions.md"),
      "utf8",
    ),
  );
  assert.ok(dr0004.size > 0, "DR-0004 extracted no units at all");
  const commandBlocks = [...dr0004].filter((unit) => unit.startsWith("gh api "));
  assert.deepEqual(
    commandBlocks,
    [],
    `DR-0004 command blocks are quotable on their own:\n  ${commandBlocks.join("\n  ")}`,
  );
  assert.ok(
    [...dr0004].some((unit) => unit.startsWith("Confirm the default branch") && unit.includes("gh api ")),
    "DR-0004 item 1 did not come back as one unit carrying its commands",
  );

  const dr0013 = checksModule.quotableUnits(
    readFileSync(
      join(repoRoot, "delivery", "decisions", "DR-0013-schema-validator-implementation.md"),
      "utf8",
    ),
  );
  assert.equal(dr0013.has("strict mode enabled"), false, "a DR-0013 sub-bullet is quotable alone");
});

/* ------------------------------------------------------------------ */
/* Fix round 5: an interrupter inside a list item ends nothing (V-4)    */
/* ------------------------------------------------------------------ */

const FENCE_ITEM_OPEN = "The fence item opens here.";
const FENCE_ITEM_CLOSE = "and the fence item ends here.";
const FENCED_ASIDE = "an illustrative command, not a condition";
const ATX_ITEM_OPEN = "The heading item opens here.";
const ATX_ITEM_CLOSE = "and the heading item ends here.";
const ATX_ASIDE = "### An aside heading inside the item";
const SETEXT_ITEM_OPEN = "The setext item opens here.";
const SETEXT_ASIDE = "An aside underlined inside the item";
const SETEXT_ITEM_CLOSE = "and the setext item ends here.";
const BREAK_ITEM_OPEN = "The rule item opens here.";
const BREAK_ITEM_CLOSE = "and the rule item ends here.";

/**
 * ONE ITEM PER INTERRUPTER KIND, on purpose. The four guards are independent
 * lines of the extractor, so four independent items let each witness member
 * break assertions that only IT can break. A single item carrying all four
 * would let one surviving guard hold the item together and make three of the
 * four members look green.
 */
const INTERRUPTER_RECORD = [
  "# DR-9996: a scratch record whose items carry interrupters",
  "",
  '## What "clean" means',
  "",
  `1. ${FENCE_ITEM_OPEN}`,
  "",
  "   ```",
  `   ${FENCED_ASIDE}`,
  "   ```",
  "",
  `   ${FENCE_ITEM_CLOSE}`,
  "",
  `2. ${ATX_ITEM_OPEN}`,
  "",
  `   ${ATX_ASIDE}`,
  "",
  `   ${ATX_ITEM_CLOSE}`,
  "",
  `3. ${SETEXT_ITEM_OPEN}`,
  "",
  `   ${SETEXT_ASIDE}`,
  "   ----------------------------------",
  "",
  `   ${SETEXT_ITEM_CLOSE}`,
  "",
  `4. ${BREAK_ITEM_OPEN}`,
  "",
  "   ***",
  "",
  `   ${BREAK_ITEM_CLOSE}`,
  "",
];

/**
 * What each item's single unit must be once its interrupter ends nothing.
 *
 * THE INTERRUPTER'S OWN TEXT IS NEVER PART OF THE UNIT, in all four rows, and
 * the setext row said otherwise until 2026-08-09. That row demanded
 * `"... opens here. An aside underlined inside the item ... ends here."`, which
 * is an answer NEITHER conformant parser gives, inside a constant whose sibling
 * assertion twelve lines below already says the same aside is not a unit. It
 * survived five fix rounds because the test WAS the specification: the
 * hand-rolled block loop it graded was written to satisfy it, so nothing
 * existed to contradict it until a real parser did (DR-0022, option A2).
 *
 * MEASURED on the item below, `markdown-it` 14.1.0 in its `commonmark` preset
 * and `commonmark` 0.31.2, node v26.6.0. Byte-identical renderings:
 *
 *   <ol start="3">
 *   <li>
 *   <p>The setext item opens here.</p>
 *   <h2>An aside underlined inside the item</h2>
 *   <p>and the setext item ends here.</p>
 *   </li>
 *   </ol>
 *
 * markdown-it's token stream is
 * `list_item_open paragraph_open inline paragraph_close heading_open inline
 * heading_close paragraph_open inline paragraph_close list_item_close`, and
 * commonmark's AST is `item paragraph heading(level=2) paragraph`. The aside is
 * a SETEXT HEADING, and a heading's text belongs to no unit: that is the rule
 * the ATX row on the line above has always encoded, and the setext row is now
 * the same claim about the same block type. The `-----` underline still ends
 * NOTHING, which is what this test is for: the item's two paragraphs remain one
 * unit across it.
 */
const WHOLE_ITEMS: [string, string, string][] = [
  ["fence", FENCE_ITEM_OPEN, `${FENCE_ITEM_OPEN} ${FENCE_ITEM_CLOSE}`],
  ["ATX heading", ATX_ITEM_OPEN, `${ATX_ITEM_OPEN} ${ATX_ITEM_CLOSE}`],
  ["setext heading", SETEXT_ITEM_OPEN, `${SETEXT_ITEM_OPEN} ${SETEXT_ITEM_CLOSE}`],
  ["thematic break", BREAK_ITEM_OPEN, `${BREAK_ITEM_OPEN} ${BREAK_ITEM_CLOSE}`],
];

test("a fence, an ATX heading, a setext underline or a thematic break inside a list item ends no unit, so the item stays whole", () => {
  /* THE MECHANISM, and it is the one rounds 3 and 4 both left half-closed.
     `quotableUnits` ends a unit at six sites in its loop. Rounds 3 and 4 made
     two of them ask whether a list item was open (the blank line and the nested
     marker) and left four calling `flush()` unconditionally. So an interrupter
     INSIDE an item split the item, and each half stood as a whole quotable
     unit: a FRAGMENT passing as a whole quote, which is the defect this check
     exists to prevent.

     MEASURED at 6af8e81, before this round's edit, on the fence item below:
     ["The item opens here.", "and the item continues here.", "A second item."]
     Three units where there should be two, and the first is half an item.

     THE FOUR ITEMS ARE INDEPENDENT so each witness member breaks only its own
     item's assertions. That is the difference between four members of a class
     and one shape written four times. */
  const dir = stageContext();
  try {
    stageRecord(dir, "DR-9996", INTERRUPTER_RECORD);
    const record = readFileSync(
      join(dir, "delivery", "decisions", "DR-9996-scratch-record.md"),
      "utf8",
    );
    const units = checksModule.quotableUnits(record);
    const shown = [...units].join(" | ");

    for (const [kind, half, whole] of WHOLE_ITEMS) {
      assert.equal(units.has(whole), true, `${kind}: the item is not one whole unit; got ${shown}`);
      assert.equal(units.has(half), false, `${kind}: half the item is quotable; got ${shown}`);
    }
    /* The closing halves are not units either, which is the same fragment from
       the other end and is what a fix that merged forwards only would miss. */
    for (const half of [FENCE_ITEM_CLOSE, ATX_ITEM_CLOSE, SETEXT_ITEM_CLOSE, BREAK_ITEM_CLOSE]) {
      assert.equal(units.has(half), false, `a closing half is quotable; got ${shown}`);
    }
    /* THE INTERRUPTERS THEMSELVES STILL BELONG TO NO UNIT OF THEIR OWN, which is
       the property a fix that simply stopped recognising them would break.
       Fenced content in particular must stay excluded (V-1), and this asserts
       the round-3 guarantee has not been traded away for the round-5 one. */
    assert.equal(units.has(FENCED_ASIDE), false, shown);
    assert.equal(units.has(ATX_ASIDE), false, shown);
    assert.equal(units.has(SETEXT_ASIDE), false, shown);
    assert.equal(
      [...units].some((unit) => unit.includes(FENCED_ASIDE)),
      false,
      `fenced content leaked into a unit; got ${shown}`,
    );

    /* END TO END, ALL FOUR FRAGMENTS AT ONCE. Four conditions, four violations,
       each naming its own fragment, so a check that caught one and stopped
       could not pass. */
    const fragmentsPath = writeDocument(
      dir,
      citing(
        "DR-9996",
        WHOLE_ITEMS.map(([, half]) => half),
      ),
      "interrupter-fragments.yaml",
    );
    const fragments = runCli([
      "validate",
      "--type",
      "assurance-modes",
      "--context",
      dir,
      fragmentsPath,
    ]);
    assert.equal(fragments.status, 1, fragments.stdout + fragments.stderr);
    for (let position = 0; position < WHOLE_ITEMS.length; position += 1) {
      const half = (WHOLE_ITEMS[position] as [string, string, string])[1];
      assert.match(
        fragments.stdout,
        new RegExp(
          `^INVALID #/modes/0/conditions/${String(position)} mode full cites DR-9996 for a condition that is not a whole quoted item of that record: "${half}" \\(check: mode-conditions-quote-granted-by\\)$`,
          "m",
        ),
        fragments.stdout,
      );
    }

    /* THE OTHER DIRECTION, and it is what stops all of the above from being
       satisfied by an extractor that returns nothing: the four WHOLE items
       resolve, through the same command, exit 0. */
    const wholePath = writeDocument(
      dir,
      citing(
        "DR-9996",
        WHOLE_ITEMS.map(([, , whole]) => whole),
      ),
      "interrupter-whole-items.yaml",
    );
    const whole = runCli(["validate", "--type", "assurance-modes", "--context", dir, wholePath]);
    assert.equal(whole.status, 0, whole.stdout + whole.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  /* AND THE TOP-LEVEL BEHAVIOUR IS UNCHANGED, asserted because this fix could
     have been made by simply never flushing on these four line types, which
     would have destroyed the round-3 guarantees. At column zero each of them
     still ends the block in progress. */
  const topLevel = checksModule.quotableUnits(
    [
      "A top-level paragraph.",
      "",
      "```",
      "code at top level",
      "```",
      "",
      "# A heading at column zero",
      "",
      "Another top-level paragraph.",
      "",
    ].join("\n"),
  );
  assert.equal(topLevel.has("A top-level paragraph."), true, [...topLevel].join(" | "));
  assert.equal(topLevel.has("Another top-level paragraph."), true, [...topLevel].join(" | "));
  assert.equal(
    topLevel.has("A top-level paragraph. Another top-level paragraph."),
    false,
    [...topLevel].join(" | "),
  );
  assert.equal(topLevel.has("code at top level"), false, [...topLevel].join(" | "));
});

/* ------------------------------------------------------------------ */
/* Round 7: the witnesses CR-002 found missing, and the CR-001 class    */
/* ------------------------------------------------------------------ */

/**
 * WHY THESE THREE TESTS EXIST, and it is worth stating because a reader will
 * ask why a fix round adds tests for code that was already shipped.
 *
 * A clean-room review mutated twenty sites in this phase's extractor and
 * FOURTEEN mutants survived the whole suite. Two of the survivors were the
 * LITERAL PRE-FIX STATE of the two defects round 6 reported fixing: reverting
 * `startOffset` to trust the parser's column, and reverting `carriesProse` to
 * `return true`, each left `npm test` at 501 tests, 501 pass, exit 0. A fix
 * with no red witness is a fix that can be undone in place while every gate
 * stays green.
 *
 * The mechanism, and it generalises past this phase: a behavior can be
 * registered in `test/behaviors.json` and resolve green with NO witness spec
 * naming the code that implements it. The registry couples a NAME to a test,
 * the red-witness rule couples a test to a DANGEROUS STATE, and nothing
 * couples those two automatically, so a round that adds no specs is SILENT
 * rather than red.
 *
 * Each test below carries at least two structurally different members of its
 * class, and each has a witness spec under `witness/` whose `dangerousStates`
 * are the mutations measured to redden it.
 */

const MULTI_MARKER_TWO = "Two list markers open on one line.";
const MULTI_MARKER_QUOTE = "A quote opens after a list marker.";
const MULTI_MARKER_THREE = "Three block markers open on one line.";
const MULTI_MARKER_ORDERED = "An ordered marker nests in an unordered one.";
const MULTI_MARKER_FIVE = "Five markers of four families on one line.";
const MULTI_MARKER_CONTROL = "One marker only, always handled.";

const MULTI_MARKER_RECORD = [
  "# DR-9991: a scratch record whose conditions open two block markers on one line",
  "",
  "## The conditions",
  "",
  `- - ${MULTI_MARKER_TWO}`,
  "",
  `- > ${MULTI_MARKER_QUOTE}`,
  "",
  `- - - ${MULTI_MARKER_THREE}`,
  "",
  `- 1. ${MULTI_MARKER_ORDERED}`,
  "",
  /* THE DEEPEST MEMBER, ADDED IN ROUND 8 (verification finding V-2). Until it
     existed the fixture's deepest member was THREE markers while the test name,
     the registered description and the witness spec all claimed four, and a
     predicate bounded at `{0,3}` reproduced CR-001 verbatim at depth four with
     the whole 504-test suite green. Five markers across FOUR families
     (unordered, quote, ordered, a second unordered glyph, quote again) is past
     any bound a "widen it by one" fix would reach, which is the property the
     production docstring says must hold and the fixture did not test. */
  `- > 1. * > ${MULTI_MARKER_FIVE}`,
  "",
  "## A plain control",
  "",
  `- ${MULTI_MARKER_CONTROL}`,
  "",
];

test("a line opening more than one block marker leaves no marker in the unit, at two, three and five markers and with a quote after a list marker", () => {
  /* THE MECHANISM THIS TEST GUARDS, which is not the shape it exercises.
     `startOffset` verifies the parser's start column instead of trusting it,
     and it verified by testing the skipped span against a model of the block
     prefix. Until round 7 that model allowed AT MOST ONE list marker, so the
     guard had two causes it could not tell apart: the column is LYING, which is
     the hazard it exists for, and the column is CORRECT but describes a prefix
     richer than the model can spell. It took the same recovery on both, and
     that recovery consumes quote markers only; on a line opening with a list
     marker `quoteDepth` is 0, so it returned offset 0 and the slice was the
     ENTIRE RAW LINE.

     BOTH DIRECTIONS ARE LIVE AT ONCE, which is why this asserts both. The unit
     set GAINS a marker-carrying string no document contains, so a fabricated
     condition equal to it is accepted; and it LOSES the real prose unit, so a
     legitimately quoted condition is rejected.

     MEASURED RED at 218fc12, before the fix, on this record:
       "- - Two list markers open on one line."
       "- > A quote opens after a list marker."
       "- - - Three block markers open on one line."
       "- 1. An ordered marker nests in an unordered one."
     Four marker-carrying units, and not one of the four clean strings present.

     FIVE STRUCTURALLY DIFFERENT MEMBERS OF ONE CLASS, not one shape written
     five times: two list markers, a QUOTE opened after a list marker (a
     different marker family, and the one the old recovery path could almost
     handle), THREE markers (which is what distinguishes a completed grammar
     from a boundary moved by one), an ORDERED marker nested in an unordered
     one (a different marker syntax again), and FIVE markers across four
     families. A fix that widened the model by one marker turns the first green
     and leaves the third red.

     THE FIFTH MEMBER IS ROUND 8's, and it exists because the four above did
     not guard what this test's name claimed. Verification finding V-2: the
     deepest member was THREE, so the block-prefix predicate bounded at `{0,3}`
     reproduced CR-001 verbatim at depth four AND SURVIVED THE WHOLE 504-TEST
     SUITE, while the same mutant bounded at TWO was killed. The witness's
     discriminating power stopped exactly one member past the fixture's deepest
     member, which is a boundary the production docstring says must not exist.
     Measured after adding the fifth member: `{0,3}` is killed, `{0,4}` is
     killed, and the numbers are in the work history's fix round 8. */
  const dir = stageContext();
  try {
    stageRecord(dir, "DR-9991", MULTI_MARKER_RECORD);
    const record = readFileSync(
      join(dir, "delivery", "decisions", "DR-9991-scratch-record.md"),
      "utf8",
    );
    const units = checksModule.quotableUnits(record);
    const shown = [...units].join(" | ");

    /* THE CONTROL FIRST, so none of the arms below can pass for want of any
       units at all: the single-marker item was always correct and stays so. */
    assert.equal(units.has(MULTI_MARKER_CONTROL), true, shown);

    const MEMBERS: [string, string][] = [
      ["two list markers", MULTI_MARKER_TWO],
      ["quote after a list marker", MULTI_MARKER_QUOTE],
      ["three block markers", MULTI_MARKER_THREE],
      ["ordered nested in unordered", MULTI_MARKER_ORDERED],
      ["five markers of four families", MULTI_MARKER_FIVE],
    ];
    for (const [name, clean] of MEMBERS) {
      /* FAIL-CLOSED DIRECTION: the real prose IS a unit. */
      assert.equal(units.has(clean), true, `${name}: the prose is not a unit; got ${shown}`);
    }
    /* FAIL-OPEN DIRECTION: no unit carries a leading block marker, asserted
       over the whole set rather than against four hand-written strings, so a
       marker shape nobody thought of also reddens this. */
    const leaking = [...units].filter((unit) => /^(?:>|[0-9]{1,9}[.)]|[-*+])[ \t]/.test(unit));
    assert.deepEqual(leaking, [], `units carry leading block markers; got ${shown}`);

    /* END TO END THROUGH THE COMMAND, both directions. The four clean
       conditions resolve, exit 0. */
    const cleanPath = writeDocument(
      dir,
      citing(
        "DR-9991",
        MEMBERS.map(([, clean]) => clean),
      ),
      "multi-marker-clean.yaml",
    );
    const clean = runCli(["validate", "--type", "assurance-modes", "--context", dir, cleanPath]);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);

    /* And the marker-carrying strings, which are what the defect ADMITTED, are
       rejected one diagnostic each. */
    const fabricated = [
      `- - ${MULTI_MARKER_TWO}`,
      `- > ${MULTI_MARKER_QUOTE}`,
      `- - - ${MULTI_MARKER_THREE}`,
      `- 1. ${MULTI_MARKER_ORDERED}`,
      `- > 1. * > ${MULTI_MARKER_FIVE}`,
    ];
    const leakedPath = writeDocument(
      dir,
      citing("DR-9991", fabricated),
      "multi-marker-leaked.yaml",
    );
    const leaked = runCli(["validate", "--type", "assurance-modes", "--context", dir, leakedPath]);
    assert.equal(leaked.status, 1, leaked.stdout + leaked.stderr);
    for (let position = 0; position < fabricated.length; position += 1) {
      const carrying = fabricated[position] as string;
      assert.match(
        leaked.stdout,
        new RegExp(
          `^INVALID #/modes/0/conditions/${String(position)} mode full cites DR-9991 for a ` +
            `condition that is not a whole quoted item of that record: ` +
            `"${carrying.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" ` +
            `\\(check: mode-conditions-quote-granted-by\\)$`,
          "m",
        ),
        leaked.stdout,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const ADVANCED_QUOTE_UNIT = "epsilon eta and the rest of this sentence.";
const ADVANCED_LIST_UNIT = "lambda mu and the rest of this sentence.";

const ADVANCED_COLUMN_RECORD = [
  "# DR-9990: a scratch record whose paragraphs start past a link reference definition",
  "",
  "## The quote form",
  "",
  "> [eta]: https://example.invalid/theta",
  ADVANCED_QUOTE_UNIT,
  "",
  "## The list form",
  "",
  "- [iota]: https://example.invalid/kappa",
  ADVANCED_LIST_UNIT,
  "",
];

test("the parser start column is verified rather than trusted, so a paragraph advanced past a link reference definition is not truncated, in the quote form and in the list form", () => {
  /* THE MECHANISM: `commonmark` advances a paragraph's sourcepos START LINE
     past leading link reference definitions and DOES NOT advance its START
     COLUMN, so the column describes a line the node no longer starts on. Here
     the column comes from `"> "` on line 1 while the node starts on line 2,
     which carries no marker, and slicing from the trusted index yields
     "silon eta and the rest of this sentence.": a truncated string no
     condition can ever equal, and one character further along it would silently
     make a FRAGMENT quotable.

     THIS TEST EXISTS BECAUSE THE FIX HAD NO WITNESS. A clean-room review
     reverted `startOffset` to the pre-fix `if (offset <= text.length)` and the
     entire suite stayed at 501 pass, exit 0. Measured under that revert on this
     record: ["mbda mu and the rest of this sentence.",
     "silon eta and the rest of this sentence."]. Both units corrupt, nothing
     red.

     TWO STRUCTURALLY DIFFERENT MEMBERS: a QUOTE marker supplies the false
     column in the first, a LIST marker in the second, and the recovery path
     treats those differently (it strips quote markers and never strips list
     markers), so a witness resting on the quote arm alone would say nothing
     about the list arm. */
  const dir = stageContext();
  try {
    stageRecord(dir, "DR-9990", ADVANCED_COLUMN_RECORD);
    const record = readFileSync(
      join(dir, "delivery", "decisions", "DR-9990-scratch-record.md"),
      "utf8",
    );
    const units = checksModule.quotableUnits(record);
    const shown = [...units].join(" | ");

    assert.equal(units.has(ADVANCED_QUOTE_UNIT), true, `quote form truncated; got ${shown}`);
    assert.equal(units.has(ADVANCED_LIST_UNIT), true, `list form truncated; got ${shown}`);
    /* THE TRUNCATIONS THEMSELVES, named, so a partial fix that produced a
       DIFFERENT truncation could not pass by merely adding the right string. */
    assert.equal(units.has("silon eta and the rest of this sentence."), false, shown);
    assert.equal(units.has("mbda mu and the rest of this sentence."), false, shown);
    /* AND NO UNIT IS A PROPER SUFFIX OF EITHER SENTENCE, which is the class
       rather than the two measured offsets. */
    for (const unit of units) {
      for (const whole of [ADVANCED_QUOTE_UNIT, ADVANCED_LIST_UNIT]) {
        assert.equal(
          unit !== whole && whole.endsWith(unit),
          false,
          `a truncated suffix is a unit: ${JSON.stringify(unit)}; got ${shown}`,
        );
      }
    }

    /* END TO END: both whole sentences resolve as conditions, exit 0. A
       truncating extractor cannot satisfy this, because the record's own
       sentence is then absent from the unit set. */
    const path = writeDocument(
      dir,
      citing("DR-9990", [ADVANCED_QUOTE_UNIT, ADVANCED_LIST_UNIT]),
      "advanced-column.yaml",
    );
    const run = runCli(["validate", "--type", "assurance-modes", "--context", dir, path]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const EMPTIED_TOP_LEVEL_DEFINITION = "[zeta]: https://example.invalid/delta";
const EMPTIED_ITEM_DEFINITION = "[omega]: https://example.invalid/psi";
const EMPTIED_REAL_UNIT = "A real paragraph so this record is not empty.";

const EMPTIED_RECORD = [
  "# DR-9989: a scratch record whose paragraphs the parser empties",
  "",
  "## The top-level form",
  "",
  EMPTIED_TOP_LEVEL_DEFINITION,
  "---",
  "",
  "## The list-item form",
  "",
  `- ${EMPTIED_ITEM_DEFINITION}`,
  "  ---",
  "",
  EMPTIED_REAL_UNIT,
  "",
];

test("a paragraph the parser emptied contributes no unit, at top level and inside a list item", () => {
  /* THE MECHANISM: a link reference definition immediately followed by a setext
     `-` underline leaves `commonmark` 0.31.2 holding a paragraph node with NO
     inline children WHOSE SOURCEPOS STILL SPANS THE TEXT THE PARSER REMOVED.
     The setext start rule strips the definitions and then declines to make a
     heading because nothing is left, so the document's reference sweep never
     advances the start line the way it does everywhere else. Slicing that
     paragraph's source yields the definition itself as a quotable unit, which
     is the fail-open direction: a condition fabricated to equal a URL line is
     then accepted as a quote of the record.

     THIS TEST EXISTS BECAUSE THE FIX HAD NO WITNESS. `carriesProse` reduced to
     `return true` left the whole suite at 501 pass, exit 0. Measured under that
     revert on this record, the unit set gains BOTH definition lines.

     TWO STRUCTURALLY DIFFERENT MEMBERS: the two walkers are different code.
     `collectUnits` handles the top-level form and `paragraphsBeneath` the
     in-item form, each with its own `carriesProse` call site, so removing the
     guard from one leaves the other correct. Measured: removing the
     `paragraphsBeneath` guard alone adds the item's definition and NOT the
     top-level one. */
  const dir = stageContext();
  try {
    stageRecord(dir, "DR-9989", EMPTIED_RECORD);
    const record = readFileSync(
      join(dir, "delivery", "decisions", "DR-9989-scratch-record.md"),
      "utf8",
    );
    const units = checksModule.quotableUnits(record);
    const shown = [...units].join(" | ");

    /* NOT VACUOUS: the record's real paragraph is a unit. */
    assert.equal(units.has(EMPTIED_REAL_UNIT), true, shown);
    assert.equal(units.has(EMPTIED_TOP_LEVEL_DEFINITION), false, `top-level form; got ${shown}`);
    assert.equal(units.has(EMPTIED_ITEM_DEFINITION), false, `list-item form; got ${shown}`);
    /* THE CLASS RATHER THAN THE TWO STRINGS: no unit is or contains a link
       reference definition. */
    assert.deepEqual(
      [...units].filter((unit) => unit.includes("https://example.invalid/")),
      [],
      `a link reference definition leaked into a unit; got ${shown}`,
    );

    /* END TO END, THE FAIL-OPEN DIRECTION THE DEFECT OPENED: a condition equal
       to either definition line is rejected, one diagnostic each. */
    const fabricated = [EMPTIED_TOP_LEVEL_DEFINITION, EMPTIED_ITEM_DEFINITION];
    const path = writeDocument(dir, citing("DR-9989", fabricated), "emptied-paragraph.yaml");
    const run = runCli(["validate", "--type", "assurance-modes", "--context", dir, path]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    for (let position = 0; position < fabricated.length; position += 1) {
      const definition = fabricated[position] as string;
      assert.match(
        run.stdout,
        new RegExp(
          `^INVALID #/modes/0/conditions/${String(position)} mode full cites DR-9989 for a ` +
            `condition that is not a whole quoted item of that record: ` +
            `"${definition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" ` +
            `\\(check: mode-conditions-quote-granted-by\\)$`,
          "m",
        ),
        run.stdout,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ROUND 8, verification finding V-1 (HIGH): A TIME WITNESS, and the only one
   in this file, because the defect it guards is invisible to every equality
   assertion in the repository.

   THE MECHANISM. `startOffset` decides whether a span is a block prefix. Round
   7 decided it with an anchored pattern whose iteration could consume the same
   run of whitespace in two places, so every gap between two markers doubled the
   search space and a span that ultimately FAILED had to exhaust all of it.
   Failing is precisely the arm `startOffset` exists to take. Measured at
   `986f58a`, node v26.6.0, through `quotableUnits`: a 151-byte two-line
   document cost 11,177 ms and a 207-byte one cost 12,575 ms, against 3.2 ms and
   0.4 ms after this round's fix, RETURNING THE IDENTICAL UNIT SET both times.
   The verifier measured 73 s on a 269-byte record and 88 s through the shipped
   `tiphys validate`.

   WHY NO EQUALITY ASSERTION CAN SEE IT. The unit sets are identical. That is
   measured, not assumed: the probe in the work history compares both
   implementations on every document below and on the whole family around them.
   So the suite was fully green with the defect present, and the only assertion
   that can distinguish the two is an assertion about TIME.

   WHY THE DOCUMENTS LOOK LIKE THIS, rather than being a hand-made string fed to
   an unexported predicate. Line 1 is a link reference definition behind a deep
   container prefix, so the parser advances the paragraph's START LINE past it
   while leaving the START COLUMN describing line 1: the exact hazard
   `startOffset` was built for. Line 2 is a lazy continuation whose leading TAB
   stops its own markers from interrupting the paragraph, so they are
   continuation TEXT that merely LOOKS like a container prefix. The quote count
   on line 1 is chosen so the offset lands ONE CHARACTER PAST line 2's marker
   run, which is what makes the span a long NEAR MISS. This is reachability
   through the shipped entry point, not a unit test of a private function.

   TWO STRUCTURALLY DIFFERENT MEMBERS, because one witness is not a class: a
   BULLET run and an ORDERED run. They exercise different branches of the
   grammar (`[-*+]` against `[0-9]{1,9}[.)]`) and they are exponential
   independently.

   THE BOUND AND ITS MARGINS, chosen against measurement rather than taste.
   Honest cost here is 0.2 ms to 3.2 ms; pathological cost is 11.2 s and 12.6 s.
   One second sits about 1,400 times above the honest cost and about eleven
   times below the pathological one. Breaking the green arm needs a runner
   ~1,400x SLOWER than this container; breaking the red arm needs one ~11x
   FASTER, and no runner is 11x faster than exponential. The pathological arm
   also GROWS with the marker count while the honest arm does not, so the gap
   widens rather than narrows if the fixture is ever deepened. */
const NEAR_MISS_BUDGET_MS = 1000;

/** A two-line document whose start-column verification is handed a long span
 *  that parses as markers until its very last character. `markers` is the run
 *  on line 2; the quote count on line 1 is derived so the offset lands one
 *  character past that run. */
function nearMissRecord(marker: string, count: number): string {
  const wanted = count * marker.length + 2;
  assert.equal(wanted % 2, 0, `the derivation needs an even offset, got ${String(wanted)}`);
  const opening = "> ".repeat(wanted / 2);
  return `${opening}[r]: https://example.invalid/x\n\t${marker.repeat(count)}tail\n`;
}

test("a long near-miss block prefix is rejected in bounded time, for a bullet run and for an ordered run", () => {
  /* WARM UP FIRST. `quotableUnits` requires `commonmark` lazily, and that one
     require costs about 28 ms on a cold process. Paying it inside a timed
     region would make the measurement depend on which test ran first. */
  checksModule.quotableUnits("warm up\n");

  const MEMBERS: [string, string, number][] = [
    ["bullet run", "* ", 28],
    ["ordered run", "1. ", 28],
  ];
  for (const [name, marker, count] of MEMBERS) {
    const record = nearMissRecord(marker, count);
    const started = process.hrtime.bigint();
    const units = checksModule.quotableUnits(record);
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

    /* THE TIME ASSERTION IS THE WITNESS. Everything else here is a control. */
    assert.ok(
      elapsed < NEAR_MISS_BUDGET_MS,
      `${name}: rejecting a ${String(record.length)}-byte near miss took ` +
        `${elapsed.toFixed(1)} ms, over the ${String(NEAR_MISS_BUDGET_MS)} ms budget; ` +
        `the block-prefix test is backtracking rather than scanning`,
    );

    /* CONTROL, so a "fix" that is fast because it stopped working cannot pass:
       the unit is still the whole continuation text, markers and all, because
       the tab made them text rather than containers. This is the SAME unit the
       backtracking implementation returned, which is the point. */
    const expected = `${marker.repeat(count).trimEnd()} tail`;
    assert.deepEqual([...units], [expected], `${name}: ${[...units].join(" | ")}`);
  }
});
