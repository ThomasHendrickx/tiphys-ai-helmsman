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
      /^INVALID #\/modes\/0\/conditions\/0 mode full cites DR-0012 for a condition that record does not contain: "fabricated condition one, unrelated to DR-0012" \(check: mode-conditions-quote-granted-by\)$/m,
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

    /* MEMBER 2, STRUCTURALLY DIFFERENT: the conditions are real and the RECORD
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
