/**
 * THE WORK-HISTORY AND ENVIRONMENT-WARNINGS TESTS (kernel plan M3, M3-P4
 * step 6, criteria 2(d), 2e, 3 and 5).
 *
 * Three things live here that do not live in `test/report-contract.test.ts`:
 *
 *   1. The work-history schema's own rules (R-035's contradiction-requires-
 *      escalation coupling), witnessed by removing and restoring the keyword.
 *   2. THE SHARED-DEFINITION PROPERTY. The work history reaches the report
 *      schema's `claims`, `fix-round` and `gate-results` definitions by
 *      `$ref`, and the test asserts the two documents resolve to the SAME
 *      definition object rather than to two equal ones. Deep equality would
 *      pass over two copies that happen to agree today, which is the drift
 *      hole the $ref exists to close.
 *   3. Criterion 5: `templates/warnings.md` placed as a fleet `warnings.md`
 *      and consumed by a REAL `tiphys spawn`, so the shipped template cannot
 *      drift out of usability while a text assertion stays green.
 *
 * Every schema is re-read from disk per arm: `compileSchema` caches by object
 * identity and a defanged copy of an already-compiled object keeps the old
 * validator.
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

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Work History Test",
  GIT_AUTHOR_EMAIL: "work-history-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Work History Test",
  GIT_COMMITTER_EMAIL: "work-history-test@tiphys.invalid",
};

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
  reportParityArithmetic: DerivedCheck;
};

const validateCommand = (await import(
  new URL("../src/commands/validate.ts", import.meta.url).href
)) as {
  loadTypeSchema: (type: string) => Record<string, unknown>;
  companionsFor: (type: string) => Record<string, unknown>[];
  TYPE_TABLE: ReadonlyMap<string, string>;
  COMPANION_TABLE: ReadonlyMap<string, readonly string[]>;
};

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

function readTemplate(name: string): Record<string, unknown> {
  return yamlModule.parse(readFileSync(join(templatesDir, name), "utf8")) as Record<
    string,
    unknown
  >;
}

function nodeAt(root: unknown, path: readonly (string | number)[]): Record<string, unknown> {
  let node = root as Record<string, unknown>;
  for (const step of path) {
    node = (node as Record<string, unknown>)[String(step)] as Record<string, unknown>;
  }
  return node;
}

/**
 * Validate against the work-history schema. The COMPANION is passed on every
 * arm, including the defanged ones, because without it the document does not
 * compile at all and every arm would be red for the wrong reason.
 */
function workHistoryLines(
  instance: unknown,
  schema: Record<string, unknown> = readSchema("work-history.schema.json"),
  companion: Record<string, unknown> = readSchema("report.schema.json"),
): string[] {
  return validateModule.validateToLines(schema, instance, [companion]);
}

function runCli(
  args: string[],
  options: { cwd?: string } = {},
): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env };
  delete env["TIPHYS_HOLDER_ID"];
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: options.cwd ?? repoRoot,
    env,
  });
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

function git(dir: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

function gitOk(dir: string, args: string[]): string {
  const result = git(dir, args);
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/* ------------------------------------------------------------------ */
/* The companion registration itself                                    */
/* ------------------------------------------------------------------ */

test("the work-history type is registered with report.schema.json as its declared companion, and without it the schema does not compile", () => {
  assert.equal(validateCommand.TYPE_TABLE.get("work-history"), "work-history.schema.json");
  assert.deepEqual([...(validateCommand.COMPANION_TABLE.get("work-history") ?? [])], [
    "report",
  ]);

  /* THE DANGEROUS STATE: the same document compiled with NO companion. It
     fails CLOSED with the existing unresolved-reference diagnostic, which is
     what shows the companion is a declared registration rather than an
     automatic fetch: a reference to a document nobody declared still fails. */
  const alone = validateModule.validateToLines(
    readSchema("work-history.schema.json"),
    readTemplate("work-history.example.yaml"),
  );
  assert.deepEqual(alone, [
    "INVALID # schema reference report.schema.json#/$defs/gateResult does not resolve",
  ]);

  /* AND WITH IT: accepted. */
  assert.deepEqual(workHistoryLines(readTemplate("work-history.example.yaml")), []);
});

test("the work-history and report schemas resolve to the same claims, fix-round and gate-result definition objects", () => {
  /* THE PROPERTY THE PLAN NAMES: the SAME definition object, not two equal
     ones. Two equal copies would satisfy a deepEqual and would drift the
     moment one is edited, which is the whole reason the reference exists.
     Resolution is done here the way a reader would do it: follow the $ref
     string from the work-history document and see where it lands. */
  const workHistory = readSchema("work-history.schema.json");
  const report = readSchema("report.schema.json");

  for (const [property, definition] of [
    ["claims", "claim"],
    ["fix-round", "fixRound"],
    ["gate-evidence", "gateResult"],
  ] as const) {
    const reference = nodeAt(workHistory, ["properties", property, "items"])["$ref"];
    assert.equal(
      reference,
      `report.schema.json#/$defs/${definition}`,
      `${property} does not reference the report schema`,
    );
    /* The work-history document carries NO definition of its own under that
       name, so there is nothing here that could drift. */
    const ownDefs = (workHistory["$defs"] ?? {}) as Record<string, unknown>;
    assert.equal(
      ownDefs[definition],
      undefined,
      `${definition} is restated in the work-history schema instead of referenced`,
    );
    /* And the target exists in the one document that owns it. */
    assert.notEqual(nodeAt(report, ["$defs"])[definition], undefined);
  }

  /* THE SAME OBJECT, by identity, through the loader both the CLI and the
     gates use. `loadTypeSchema` caches per type, so the companion the
     work-history compilation is given IS the report document, not a second
     parse of it. */
  const reportDocument = validateCommand.loadTypeSchema("report");
  const companions = validateCommand.companionsFor("work-history");
  assert.equal(companions.length, 1);
  assert.ok(
    Object.is(companions[0], reportDocument),
    "the companion is a second parse of report.schema.json rather than the same document",
  );
  const claimDefinition = nodeAt(reportDocument, ["$defs"])["claim"];
  assert.ok(
    Object.is(nodeAt(companions[0] as Record<string, unknown>, ["$defs"])["claim"], claimDefinition),
    "the two resolutions are equal objects rather than the same object",
  );
});

/* ------------------------------------------------------------------ */
/* R-035: a contradiction requires a stop                                */
/* ------------------------------------------------------------------ */

test("a work history whose verification-first entry contradicts the plan and names no escalation is rejected", () => {
  const document = readTemplate("work-history.example.yaml");
  const entries = document["verification-first"] as Record<string, unknown>[];
  delete (entries[0] as Record<string, unknown>)["stopped-and-reported"];
  assert.deepEqual(workHistoryLines(document), [
    "INVALID #/verification-first/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/verification-first/0/stopped-and-reported required property stopped-and-reported is missing",
  ]);

  /* THE GUARDING KEYWORD REMOVED: the if/then coupling, removed as a pair
     because Ajv's strict policy refuses one without the other. */
  const defanged = readSchema("work-history.schema.json");
  const verificationFirst = nodeAt(defanged, ["$defs", "verificationFirst"]);
  delete verificationFirst["if"];
  delete verificationFirst["then"];
  assert.deepEqual(workHistoryLines(document, defanged), []);
  assert.ok(workHistoryLines(document).length > 0);

  /* THE SECOND MEMBER, structurally different: `contradicts-plan` ABSENT
     rather than true-with-no-reference. The boolean is required so the
     question cannot be skipped, which is a different guard from the coupling
     and would survive the coupling being removed. */
  const unanswered = readTemplate("work-history.example.yaml");
  delete (
    (unanswered["verification-first"] as Record<string, unknown>[])[1] as Record<
      string,
      unknown
    >
  )["contradicts-plan"];
  assert.deepEqual(workHistoryLines(unanswered), [
    "INVALID #/verification-first/1/contradicts-plan required property contradicts-plan is missing",
  ]);
  assert.deepEqual(workHistoryLines(unanswered, defanged).length > 0, true);

  /* AND ITS OWN REMOVAL ARM (M3-P4 round-1 finding CR-1520). The line above
     asserts the instance is STILL red under the if/then-defanged schema,
     which is a weaker and different property: it shows the two guards are
     independent, not that this one is load-bearing. The witness table named
     the `required` entry for this row and nothing removed it, so the column
     overstated. Removing it is what turns the instance green. */
  const withoutRequired = readSchema("work-history.schema.json");
  const verificationFirstDefinition = nodeAt(withoutRequired, [
    "$defs",
    "verificationFirst",
  ]);
  verificationFirstDefinition["required"] = (
    verificationFirstDefinition["required"] as string[]
  ).filter((name) => name !== "contradicts-plan");
  assert.deepEqual(workHistoryLines(unanswered, withoutRequired), []);
  assert.ok(workHistoryLines(unanswered).length > 0);

  /* THE CONVERSE, ASKED AND ANSWERED: an entry with
     `contradicts-plan: false` that names an escalation anyway is ACCEPTED.
     Recording an escalation you did not owe is not a misdeclaration, and a
     schema that forbade it would price honesty rather than protect it. */
  const volunteered = readTemplate("work-history.example.yaml");
  (
    (volunteered["verification-first"] as Record<string, unknown>[])[1] as Record<
      string,
      unknown
    >
  )["stopped-and-reported"] = "Reported to the orchestrator anyway.";
  assert.deepEqual(workHistoryLines(volunteered), []);
});

/* ------------------------------------------------------------------ */
/* Criterion 2e's array-element member, over the SHARED definition       */
/* ------------------------------------------------------------------ */

test("a work history fix-round entry with an empty not-covered is rejected, and the guard is the report schema's own keyword", () => {
  const document = readTemplate("work-history.example.yaml");
  (
    (document["fix-round"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["not-covered"] = "";
  assert.deepEqual(workHistoryLines(document), [
    'INVALID #/fix-round/0/not-covered value "" does not match the required pattern \\S',
    'INVALID #/fix-round/0/not-covered value "" is shorter than the required minimum length 1',
  ]);

  /* THE KEYWORD REMOVED FROM THE REPORT SCHEMA, which is the point: the
     work-history document has no copy to defang, so the arm both witnesses
     the guard and demonstrates that the definition really is shared. */
  const defangedCompanion = readSchema("report.schema.json");
  const notCovered = nodeAt(defangedCompanion, [
    "$defs",
    "fixRound",
    "properties",
    "not-covered",
  ]);
  delete notCovered["minLength"];
  delete notCovered["pattern"];
  assert.deepEqual(
    workHistoryLines(document, readSchema("work-history.schema.json"), defangedCompanion),
    [],
  );
  assert.ok(workHistoryLines(document).length > 0);

  /* SECOND MEMBER, structurally different: a whitespace-only block scalar,
     which minLength alone accepts. */
  const whitespace = readTemplate("work-history.example.yaml");
  (
    (whitespace["fix-round"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["not-covered"] = "\n   \n";
  assert.deepEqual(workHistoryLines(whitespace), [
    'INVALID #/fix-round/0/not-covered value "\\n   \\n" does not match the required pattern \\S',
  ]);
});

test("a work history claim filed under a kind the schema does not question is rejected through the shared definition", () => {
  const document = readTemplate("work-history.example.yaml");
  (document["claims"] as Record<string, unknown>[]).push({
    id: "K-9",
    kind: "note",
    statement: "This arm cannot be forced here.",
  });
  const lines = workHistoryLines(document);
  assert.deepEqual(lines, [
    "INVALID #/claims/2 value matches no permitted alternative here",
    'INVALID #/claims/2/kind value "note" is not one of the permitted values "universal", "impossibility", "coverage", "remedy", "open-question"',
  ]);

  /* The enum lives in report.schema.json and nowhere else, so removing it
     THERE is what changes the answer HERE. */
  const defangedCompanion = readSchema("report.schema.json");
  delete nodeAt(defangedCompanion, ["$defs", "claim", "properties", "kind"])["enum"];
  const stillRejected = workHistoryLines(
    document,
    readSchema("work-history.schema.json"),
    defangedCompanion,
  );
  assert.deepEqual(stillRejected, [
    "INVALID #/claims/2 value matches no permitted alternative here",
  ]);
});

/* ------------------------------------------------------------------ */
/* Criterion 5: the shipped warnings template reaches a brief            */
/* ------------------------------------------------------------------ */

test("the shipped warnings template placed as a fleet warnings file reaches an assembled brief verbatim", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "tiphys-m3p4-warnings-"));
  t.after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  const fleet = join(tmp, "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);

  const upstream = join(tmp, "upstream");
  gitOk(tmp, ["init", "--initial-branch=main", upstream]);
  writeFileSync(join(upstream, "readme.md"), "upstream\n");
  gitOk(upstream, ["add", "-A"]);
  gitOk(upstream, ["commit", "-m", "commit one"]);
  const clone = join(fleet, "projects", "demo");
  gitOk(tmp, ["clone", "--quiet", upstream, clone]);

  const briefFile = join(tmp, "brief.md");
  writeFileSync(briefFile, "# Brief\n\nDo the thing.\n");

  /* THE SHIPPED TEMPLATE, UNCHANGED, placed where src/brief.ts looks for the
     fleet's environment-warnings file (R-083b). Copied byte for byte: if the
     template were rewritten on the way in, this test would prove nothing
     about the template. */
  const template = readFileSync(join(templatesDir, "warnings.md"), "utf8");
  writeFileSync(join(fleet, "warnings.md"), template);

  const payload = join(tmp, "payload.sh");
  writeFileSync(payload, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const spawned = runCli(
    [
      "spawn",
      "--task",
      "t-warnings",
      "--project",
      clone,
      "--brief",
      briefFile,
      "--shape",
      "ship",
      "--exec",
      payload,
    ],
    { cwd: fleet },
  );
  assert.equal(spawned.status, 0, spawned.stderr);

  const brief = readFileSync(join(fleet, "tasks", "t-warnings", "brief.md"), "utf8");
  assert.ok(brief.includes("Do the thing."), "the operator brief is missing");
  assert.ok(
    brief.includes(template),
    "the shipped warnings template did not reach the brief verbatim",
  );
  /* And it is the WHOLE text, not a prefix that happens to match: the last
     entry of the template is present, which a truncating consumer would
     drop. */
  assert.ok(
    brief.includes("GIT_AUTHOR_"),
    "the tail of the warnings template is missing from the brief",
  );
});

/* ==================================================================== */
/* FIX ROUND 2: the derived-check half of the sharing                    */
/* ==================================================================== */

test("the parity check runs on a work history's gate-evidence, through the shared definition it guards", () => {
  /* CR-001, AND THE INSTANCE IS THE REVIEWER'S OWN: a work history claiming a
     green suite that discovered 9999 tests and ran one. The KEYWORD half of
     the sharing always worked; the DERIVED-CHECK half did not, because a
     check is registered per artifact TYPE and reads a type-specific KEY
     (`gate-evidence` here, `gate-results` in a report), so neither half of
     the registration followed the `$ref`. */
  const document = readTemplate("work-history.example.yaml");
  const evidence = (document["gate-evidence"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  evidence["discovered"] = 9999;
  evidence["passed"] = 1;
  evidence["skipped"] = 0;

  /* THE KEYWORDS ACCEPT IT, which is why the check is the only thing between
     this record and a green. Without this line the arm would not show that
     the schema half is not the guard. */
  assert.deepEqual(workHistoryLines(document), []);

  const run = checksModule.runChecks("work-history", document, undefined);
  assert.equal(run.failed, true);
  assert.deepEqual(run.lines, [
    "INVALID #/gate-evidence/0 discovered 9999 does not equal passed + failed + skipped + todo + did-not-run = 1 (check: report-parity-arithmetic)",
  ]);

  /* THE POINTER NAMES THIS DOCUMENT'S OWN KEY rather than the report's, so
     the check is reading the work history and not a coincidence. */
  assert.ok(run.lines.every((line) => !line.includes("#/gate-results/")));

  /* THE CHECK DEREGISTERED (Kind B witness), and restored. */
  assert.equal(checksModule.deregisterCheck("report-parity-arithmetic"), true);
  try {
    assert.deepEqual(
      checksModule.runChecks("work-history", document, undefined).lines,
      [],
    );
  } finally {
    checksModule.registerCheck(checksModule.reportParityArithmetic);
  }
  assert.equal(
    checksModule.runChecks("work-history", document, undefined).failed,
    true,
  );

  /* AND THE SHIPPED EXAMPLE IS CLEAN under the same check, so the arm above
     is the perturbation and not the baseline. */
  assert.deepEqual(
    checksModule.runChecks("work-history", readTemplate("work-history.example.yaml"), undefined)
      .lines,
    [],
  );
});

test("a work history gate-evidence entry obeys the same green-and-todo keywords as a report, through the shared definition", () => {
  /* THE POINT OF THE CONTRAST WITH THE TEST ABOVE: these two rules are
     KEYWORDS, so they travel through the `$ref` with no registration at all,
     while the parity rule needed `alsoTypes`. The asymmetry is the mechanism
     CR-001 named, and it is witnessed here rather than asserted in a
     comment. */
  const failing = readTemplate("work-history.example.yaml");
  const entry = (failing["gate-evidence"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;
  entry["passed"] = 105;
  entry["failed"] = 400;
  assert.deepEqual(workHistoryLines(failing), [
    "INVALID #/gate-evidence/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/gate-evidence/0/failed value 400 does not equal the required constant 0",
  ]);

  const missingTodo = readTemplate("work-history.example.yaml");
  delete (
    (missingTodo["gate-evidence"] as Record<string, unknown>[])[0] as Record<string, unknown>
  )["todo"];
  assert.deepEqual(workHistoryLines(missingTodo), [
    "INVALID #/gate-evidence/0 value does not satisfy the requirements its own shape triggers here",
    "INVALID #/gate-evidence/0/todo required property todo is missing",
  ]);

  /* THE KEYWORDS REMOVED FROM THE REPORT SCHEMA, which is the whole content
     of "shared": the work-history document has no copy to defang. */
  const defangedCompanion = readSchema("report.schema.json");
  const then = nodeAt(defangedCompanion, ["$defs", "gateResult", "then"]);
  delete nodeAt(then, ["properties", "failed"])["const"];
  then["required"] = (then["required"] as string[]).filter((name) => name !== "todo");
  assert.deepEqual(
    workHistoryLines(failing, readSchema("work-history.schema.json"), defangedCompanion),
    [],
  );
  assert.deepEqual(
    workHistoryLines(missingTodo, readSchema("work-history.schema.json"), defangedCompanion),
    [],
  );
  assert.ok(workHistoryLines(failing).length > 0);
});

test("an impossibility filed as an open question is rejected in a work history too, through the shared definition", () => {
  /* CR-002's fix is a KEYWORD, so it travels here with no registration. That
     is the same asymmetry from the other side, and it is the reason the
     remedy was required to be inside the declared authoring vocabulary
     rather than a fourth derived check. */
  const document = readTemplate("work-history.example.yaml");
  (document["claims"] as Record<string, unknown>[]).push({
    id: "K-8",
    kind: "open-question",
    statement: "This arm cannot be forced here; there is no way to reach it.",
  });
  assert.deepEqual(workHistoryLines(document), [
    "INVALID #/claims/2 value matches no permitted alternative here",
  ]);

  /* THE HONEST FORM IS STILL FREE. */
  const honest = readTemplate("work-history.example.yaml");
  (honest["claims"] as Record<string, unknown>[]).push({
    id: "K-9",
    kind: "open-question",
    statement: "I did not find a way to reach this arm from the CLI.",
  });
  assert.deepEqual(workHistoryLines(honest), []);

  /* THE KEYWORD REMOVED FROM THE REPORT SCHEMA. */
  const defangedCompanion = readSchema("report.schema.json");
  const branches = nodeAt(defangedCompanion, ["$defs", "claim", "oneOf"]) as unknown as Record<
    string,
    unknown
  >[];
  delete nodeAt(branches[2] as Record<string, unknown>, ["properties", "statement"])[
    "pattern"
  ];
  assert.deepEqual(
    workHistoryLines(document, readSchema("work-history.schema.json"), defangedCompanion),
    [],
  );
  assert.ok(workHistoryLines(document).length > 0);
});
