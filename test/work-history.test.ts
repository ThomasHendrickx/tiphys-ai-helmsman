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
