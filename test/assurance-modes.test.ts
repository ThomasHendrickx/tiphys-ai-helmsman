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

/* ------------------------------------------------------------------ */
/* CR-002 (round 9): skips[] is checked in BOTH directions, Kind B      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* V-1 + CRB9-02 (round 10): skips[] is measured against the REFERENCE  */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Criterion 3(b): mode-stage-order, Kind B                             */
/* ------------------------------------------------------------------ */

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
     presence: a bound whose limits do not match the decisions in force records
     a regime nobody granted.
     THE FIX-ROUND LIMIT IS 3, NOT 2, SINCE M4-P30. DR-0012's bound was two
     rounds after the first dual review; DR-0035 replaced the single bound with
     a table running from one round to three, so the number this file ships is
     that table's CEILING and 2 would be wrong for a large subject at high
     impact. The recurrence limit is untouched: DR-0035 says nothing about it
     and DR-0012 still treats any recurrence as the trigger. */
  const bounds = modeNamed(loadModes(), "full")["escalation-bounds"] as Record<string, unknown>;
  assert.equal(bounds["max-fix-rounds-after-review"], 3);
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

test("a mode running clean-room-review with no review contract is rejected naming the pointer, and full's one hazard contract is accepted", () => {
  const schemaName = "assurance-modes.schema.json";
  const document = loadModes();
  modeNamed(document, "full")["review-contracts"] = [];
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), document), [
    "INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/modes/0/review-contracts array has 0 items, fewer than the required minimum 1",
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

  /* THE OTHER DIRECTION, with the id asserted: DR-0064 dropped the criteria
     contract, and the hazard contract is the one T-007 measured finding the
     defect (M6-P2). */
  const shipped = loadModes();
  assert.deepEqual(modeNamed(shipped, "full")["review-contracts"], ["hazard"]);
  assert.deepEqual(validateModule.validateToLines(readSchema(schemaName), shipped), []);
});

test("two review contracts with the same id are rejected as duplicates and full's contract list is distinct", () => {
  /* T-007's failure mode reproduced exactly: two entries both named `criteria`
     satisfy `minItems: 2` and give a phase two reviews briefed on the same
     question, which is the state in which both reviewers approved and one
     high-severity live-lock went unfound. */
  const schemaName = "assurance-modes.schema.json";
  const document = loadModes();
  modeNamed(document, "full")["review-contracts"] = ["hazard", "hazard"];
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
  assert.ok(contracts.length >= 1);
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

/* ------------------------------------------------------------------ */
/* Fix round 1, mechanism 4: the comparison that needed a separator     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Fix round 2: containment is not equality (the short-string class)    */
/* ------------------------------------------------------------------ */

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

/* CR-001, ROUND 9: THE BOUND IS WALL-CLOCK AND THE BOX IS NOT ALWAYS QUIET.
   The reviewer could not force the green arm red and said so honestly, but
   noted that two OTHER wall-clock tests in this repository failed on this box
   at load average 10.8, and declined to leave that unrecorded. Measured here at
   load average 12.94, which is HIGHER than the load that broke those two, nine
   samples per member per arm:

     quiet   loadavg 0.24  bullet min 0.28 median 0.42 max  2.62 ms
                           ordered min 0.11 median 0.20 max  1.15 ms
     loaded  loadavg 12.94 bullet min 0.25 median 0.31 max 12.68 ms
                           ordered min 0.08 median 0.21 max 32.79 ms
     loaded  (repeat)      bullet min 0.25 median 0.40 max 17.91 ms
                           ordered min 0.16 median 0.21 max 29.18 ms

   Worst single sample under six-times CPU oversubscription is 32.79 ms, which
   is 3.3% of the budget: a 30x margin remains AFTER the load. Load inflated the
   worst sample by about 12x and would need another 30x on top of that to breach
   the bound. The two tests that did flake are structurally different: they wait
   a fixed wall-clock window and count events that must arrive inside it, so
   descheduling removes events, whereas this one measures the DURATION of one
   CPU-bound call.

   THE HARDENING, AND WHY TAKING A MINIMUM CANNOT MANUFACTURE A GREEN. The
   argument does NOT rest on load making samples slower. The table thirteen
   lines above measures the opposite in one cell: the loaded bullet minimum is
   0.25 ms and the quiet bullet minimum is 0.28 ms, so a loaded run produced a
   faster sample than any quiet one. An earlier revision of this comment said
   "Load can only make a sample SLOWER, never faster", contradicting the
   measurement printed immediately above it; that is the absolute CLAUDE.md's
   claim grep exists to catch, and it is corrected here (round 10, V-3).

   What actually carries the argument needs no claim about load at all, and is
   true by construction: every sample is a real execution of the real
   deterministic workload, so if the MINIMUM is under budget then some run of
   that workload really did complete under budget. Taking the minimum can
   therefore remove false REDS and cannot produce a green that no single run
   earned. Samples varying in either direction is consistent with that; only a
   sample that was not a real run of the real workload would break it.

   RESAMPLING IS GATED BY TIME, NOT BY A COUNT, so the red arm costs exactly
   what it costs today. A sample four times over budget is not a scheduling
   artifact, it is a pathological workload, and it is accepted as decisive
   without resampling. The dangerous states of this test's witness measure 11.2 s
   and 12.6 s, far above the ceiling, so they take ONE sample and fail
   immediately exactly as before; only a marginal overrun, which is what a
   preemption produces, buys the extra samples, and those cost about 0.3 ms
   each. */
const NEAR_MISS_RESAMPLE_CEILING_MS = NEAR_MISS_BUDGET_MS * 4;
const NEAR_MISS_MAX_SAMPLES = 3;

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


/* ------------------------------------------------------------------ */
/* M6-P3: a mode's gates are derived from the registry, never copied    */
/* ------------------------------------------------------------------ */

test("mode show lists exactly the gates the registry beside the document selects for the mode, and refuses when that registry cannot be read", () => {
  const dir = scratch();
  try {
    cpSync(schemasDir, join(dir, "schemas"), { recursive: true });
    const modesPath = writeDocument(dir, loadModes());
    const gate = (id: string, modes: string[]): Record<string, unknown> => ({
      id,
      command: ["node", "gate.mjs"],
      unitLabel: "units",
      applicability: "required",
      "verified-by": "script",
      modes,
      events: ["pull_request"],
    });
    writeFileSync(
      join(dir, "gate-registry.yaml"),
      `${JSON.stringify(
        {
          kind: "gate-registry",
          version: 1,
          preflight: [{ command: ["npm", "ci"], note: "fixture" }],
          gates: [gate("only-full", ["full"]), gate("full-and-direct", ["full", "direct-pr"])],
          destructiveCommands: [],
        },
        null,
        2,
      )}\n`,
    );

    const direct = runCli(["mode", "show", "--mode", "direct-pr", "--file", modesPath]);
    assert.equal(direct.status, 0, direct.stdout + direct.stderr);
    assert.deepEqual(section(direct.stdout, "gates"), ["full-and-direct"]);
    const full = runCli(["mode", "show", "--mode", "full", "--file", modesPath]);
    assert.equal(full.status, 0, full.stdout + full.stderr);
    assert.deepEqual(section(full.stdout, "gates"), ["only-full", "full-and-direct"]);

    /* No registry beside the document: refused, never an empty gate list. */
    rmSync(join(dir, "gate-registry.yaml"));
    const missing = runCli(["mode", "show", "--mode", "full", "--file", modesPath]);
    assert.equal(missing.status, 1, missing.stdout + missing.stderr);
    assert.equal(missing.stdout, "");
    assert.match(missing.stderr, /gate-registry\.yaml, which could not be read/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
