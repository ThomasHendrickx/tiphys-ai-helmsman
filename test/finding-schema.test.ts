/**
 * THE FINDING-SET SCHEMA TESTS (kernel plan M3, M3-P5 criterion 5), AND
 * CRITERION 6's REPORT-CONTRACT TESTS.
 *
 * Three Kind A DANGEROUS-INSTANCE rejections, each witnessed in BOTH
 * directions by removing and restoring the guarding keyword: a high-severity
 * finding with no `concrete-edit`, an empty finding list with no
 * `no-findings-statement`, and a set with no `produced-by`.
 *
 * WHY CRITERION 6's TESTS ARE IN THIS FILE AND NOT IN
 * `test/report-contract.test.ts`, which is where a reader would look for them.
 * Criterion 6 constrains `schemas/report.schema.json`, and that file was
 * M3-P4's until M3-P5's declaration was amended to add it; the amendment added
 * the SCHEMA and not a fourth test file. The scope auditor reads the
 * declaration from the merge base and audits every changed path against it, so
 * creating `test/report-contract.test.ts` edits from this phase would be an
 * undeclared change and a red gate. This file is the phase's schema-test file
 * and criterion 6 is a schema criterion, so the tests live here and this
 * paragraph is the pointer for the reader who looked in the other place first.
 *
 * THE SCHEMA IS RE-READ FROM DISK PER ARM AND THAT IS LOAD-BEARING.
 * `compileSchema` caches by schema OBJECT IDENTITY, so a test that defanged a
 * keyword in place would keep the old validator and the diagnostics would not
 * move, which reads exactly like a keyword that was doing nothing. That was
 * measured once already and is recorded in src/validate.ts's own comment.
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
const schemaPath = join(repoRoot, "schemas", "finding.schema.json");
const reportSchemaPath = join(repoRoot, "schemas", "report.schema.json");

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  validateToLines: (
    schema: Record<string, unknown>,
    instance: unknown,
  ) => string[];
};

/** A fresh schema OBJECT per arm; see the header for why this matters. */
function schema(): Record<string, unknown> {
  return JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
}

type Json = Record<string, unknown>;

function findingSet(overrides: Json = {}): Json {
  return {
    kind: "finding",
    verdict: "changes requested",
    "produced-by": "a model family, recorded per T-001",
    findings: [
      {
        id: "PR-001",
        severity: "high",
        evidence: ["delivery/plan/kernel-plan-m3.md:2975"],
        "concrete-edit": "Replace criterion 3 with the sentence quoted above.",
      },
    ],
    ...overrides,
  };
}

function lines(document: Json, instance: unknown): string[] {
  return validateModule.validateToLines(document, instance);
}

/** Drop `name` from a `required` array reached by a JSON pointer path. */
function dropRequired(document: Json, path: string[], name: string): Json {
  let node: Json = document;
  for (const step of path) {
    node = node[step] as Json;
  }
  node["required"] = (node["required"] as string[]).filter((entry) => entry !== name);
  return document;
}

/* ------------------------------------------------------------------ */
/* The instance that must be accepted                                   */
/* ------------------------------------------------------------------ */

test("a complete finding set validates and tiphys validate --type finding exits 0 on it", () => {
  assert.deepEqual(lines(schema(), findingSet()), []);

  const dir = mkdtempSync(join(tmpdir(), "tiphys-finding-"));
  try {
    const file = join(dir, "finding-set.json");
    writeFileSync(file, `${JSON.stringify(findingSet(), null, 2)}\n`);
    const run = spawnSync(process.execPath, [cliEntry, "validate", "--type", "finding", file], {
      encoding: "utf8",
      cwd: repoRoot,
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);

    /* The type also resolves under `--type auto`, because a finding set is a
       structured document and carries its own `kind` (M3R-001). */
    const auto = spawnSync(process.execPath, [cliEntry, "validate", "--type", "auto", file], {
      encoding: "utf8",
      cwd: repoRoot,
    });
    assert.equal(auto.status, 0, auto.stdout + auto.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* 5(a) a high finding with no concrete-edit                            */
/* ------------------------------------------------------------------ */

test("a finding set with a high-severity finding carrying no concrete-edit is rejected and accepted once the guarding required keyword is removed", () => {
  const dangerous = findingSet({
    findings: [
      {
        id: "PR-002",
        severity: "high",
        evidence: ["src/roles.ts:1"],
      },
    ],
  });

  const rejected = lines(schema(), dangerous);
  assert.notDeepEqual(rejected, []);
  assert.ok(
    rejected.some((line) => line.includes("concrete-edit")),
    `no diagnostic names concrete-edit: ${rejected.join("; ")}`,
  );

  /* THE GUARDING KEYWORD REMOVED: the same instance is accepted, which is
     what proves the rejection came from this keyword and not from something
     else in the document. */
  const defanged = dropRequired(schema(), ["$defs", "finding"], "concrete-edit");
  assert.deepEqual(lines(defanged, dangerous), []);

  /* RESTORED (a fresh read), and rejected again. */
  assert.notDeepEqual(lines(schema(), dangerous), []);
});

/* ------------------------------------------------------------------ */
/* 5(b) an empty review that does not say it is one                     */
/* ------------------------------------------------------------------ */

test("a finding set with an empty findings array and no no-findings-statement is rejected and accepted once the guarding oneOf is removed", () => {
  const silentEmpty = findingSet({ findings: [] });
  const declaredEmpty = findingSet({
    findings: [],
    "no-findings-statement":
      "Walked all nine acceptance criteria and both hazard rows against the diff; found nothing.",
  });

  /* THE DANGEROUS ONE. A silent empty review is indistinguishable from a
     thorough one, which is exactly the failure this guards. */
  assert.notDeepEqual(lines(schema(), silentEmpty), []);
  /* The declared empty review is accepted, so the rule is about the STATEMENT
     and not about emptiness. */
  assert.deepEqual(lines(schema(), declaredEmpty), []);

  const defanged = schema();
  delete defanged["oneOf"];
  assert.deepEqual(
    lines(defanged, silentEmpty),
    [],
    "removing oneOf did not accept the silent empty review, so oneOf is not the guard",
  );

  assert.notDeepEqual(lines(schema(), silentEmpty), []);

  /* THE CONSEQUENCE BEYOND THE CRITERION, asserted rather than left as a
     comment: a set carrying BOTH findings and a no-findings statement matches
     both branches of the oneOf and is invalid too. */
  const contradictory = findingSet({
    "no-findings-statement": "Nothing was found.",
  });
  assert.notDeepEqual(lines(schema(), contradictory), []);
});

/* ------------------------------------------------------------------ */
/* 5(c) no produced-by                                                  */
/* ------------------------------------------------------------------ */

test("a finding set with no produced-by is rejected and accepted once the guarding required keyword is removed", () => {
  const dangerous = findingSet();
  delete dangerous["produced-by"];

  const rejected = lines(schema(), dangerous);
  assert.notDeepEqual(rejected, []);
  assert.ok(
    rejected.some((line) => line.includes("produced-by")),
    `no diagnostic names produced-by: ${rejected.join("; ")}`,
  );

  const defanged = dropRequired(schema(), [], "produced-by");
  assert.deepEqual(lines(defanged, dangerous), []);

  assert.notDeepEqual(lines(schema(), dangerous), []);
});

/* ------------------------------------------------------------------ */
/* The fields whose VALUE is the point                                  */
/* ------------------------------------------------------------------ */

test("a finding set whose required strings are present and empty is rejected, because required alone is satisfied by the empty string", () => {
  for (const [pointer, instance] of [
    ["verdict", findingSet({ verdict: "" })],
    ["produced-by", findingSet({ "produced-by": "  " })],
    [
      "concrete-edit",
      findingSet({
        findings: [
          {
            id: "PR-003",
            severity: "low",
            evidence: ["src/roles.ts:1"],
            "concrete-edit": " ",
          },
        ],
      }),
    ],
    [
      "evidence",
      findingSet({
        findings: [
          {
            id: "PR-004",
            severity: "medium",
            evidence: [],
            "concrete-edit": "Add the missing row.",
          },
        ],
      }),
    ],
  ] as [string, Json][]) {
    assert.notDeepEqual(
      lines(schema(), instance),
      [],
      `an empty ${pointer} was accepted`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* CRITERION 6: an investigator report's verdict costs a repro (R-015a) */
/* ------------------------------------------------------------------ */

/** A fresh report-schema OBJECT per arm; see the header for why. */
function reportSchema(): Json {
  return JSON.parse(readFileSync(reportSchemaPath, "utf8")) as Json;
}

/**
 * A minimal investigator report. The repro is branch 1 of `$defs/repro`, the
 * outcome R-015a describes, and every other field is what the document has
 * required since M3-P4.
 */
function investigatorReport(overrides: Json = {}): Json {
  return {
    kind: "report",
    role: "investigator",
    task: "Find why the suite gate reddened once and stayed green on rerun.",
    verdict:
      "The red run was CPU contention: the per-test timeout elapsed while four other processes held the cores.",
    repro: {
      command: "taskset -c 0 node --test test/lock.test.ts",
      "exit-code": 1,
      "red-against":
        "A single-core cgroup with three busy-loop children already running; /proc/loadavg read above 4 before the run.",
      "not-covered":
        "Only the lease tests were driven; the wrapper's own timeout path was untouched.",
    },
    findings: [],
    "no-findings-statement": "The verdict is the output; nothing separable was found.",
    claims: [],
    deviations: [],
    "honest-failures": [],
    "environmental-claims": [],
    "gate-results": [],
    ...overrides,
  };
}

/**
 * THE WITNESSED TEST. Both dangerous members of the class live here on
 * purpose: `witness/investigator-report-requires-repro.json` names ONE test,
 * and src/witness/run.ts:886 counts a member red only when EVERY named test
 * fails, so a member whose mutation reddens a different test would not count.
 */
test("an investigator report with a verdict is rejected without a repro and with a hollow one, and accepted with a real one", () => {
  /* THE ACCEPTING DIRECTION FIRST, so the rejections below cannot be a
     property of the fixture rather than of the keyword. */
  assert.deepEqual(lines(reportSchema(), investigatorReport()), []);

  /* MEMBER 1: THE OMISSION. The same report with the reference removed, which
     is criterion 6's second direction word for word. */
  const missing = investigatorReport();
  delete missing["repro"];
  const rejectedMissing = lines(reportSchema(), missing);
  assert.notDeepEqual(rejectedMissing, []);
  assert.ok(
    rejectedMissing.some((line) => line.includes("repro")),
    `no diagnostic names repro: ${rejectedMissing.join("; ")}`,
  );

  /* THE GUARDING KEYWORD REMOVED: `then.required`. The same instance is
     accepted, which is what proves the rejection came from this keyword. */
  const defangedThen = reportSchema();
  const thenBlock = defangedThen["then"] as Json;
  thenBlock["required"] = (thenBlock["required"] as string[]).filter(
    (entry) => entry !== "repro",
  );
  assert.deepEqual(lines(defangedThen, missing), []);

  /* RESTORED (a fresh read), and rejected again. */
  assert.notDeepEqual(lines(reportSchema(), missing), []);

  /* MEMBER 2, STRUCTURALLY DIFFERENT: THE HOLLOW PRESENCE. `repro` is there,
     so `then.required` is satisfied and a guard that tested only for the
     field's presence would be green here. What refuses it is the referenced
     definition's own required set, one level down, which is a different
     keyword in a different subschema failing in a different way. */
  const hollow = investigatorReport({
    repro: { command: "node --test test/lock.test.ts" },
  });
  assert.notDeepEqual(lines(reportSchema(), hollow), []);
  assert.deepEqual(
    (reportSchema()["then"] as Json)["required"],
    ["repro"],
    "the presence guard is unchanged, so member 2 passes it and is refused elsewhere",
  );

  /* THE GUARDING KEYWORD FOR MEMBER 2 REMOVED: branch 1's `required` narrowed
     to the one field the hollow instance carries. */
  const defangedBranch = reportSchema();
  const branchOne = (
    ((defangedBranch["$defs"] as Json)["repro"] as Json)["oneOf"] as Json[]
  )[0] as Json;
  branchOne["required"] = ["command"];
  assert.deepEqual(lines(defangedBranch, hollow), []);

  /* RESTORED, and rejected again. */
  assert.notDeepEqual(lines(reportSchema(), hollow), []);
});

test("the honest investigator records stay writable: no verdict at all, and a verdict whose investigation did not reproduce", () => {
  /* THE REPORT THIS SCHEMA MUST NOT MAKE UNWRITABLE. An investigator that has
     not concluded owes no repro, because the conditional keys on the verdict
     and there is none. */
  const noVerdict = investigatorReport();
  delete noVerdict["verdict"];
  delete noVerdict["repro"];
  assert.deepEqual(lines(reportSchema(), noVerdict), []);

  /* R-092: it would not reproduce, so the harness is the deliverable. This is
     branch 2 of `$defs/repro` and it is the reason the definition is a oneOf:
     a one-branch repro would have made this record unwritable while leaving a
     fabricated one valid. */
  const didNotReproduce = investigatorReport({
    repro: {
      "did-not-reproduce":
        "I did not find a way to force the timeout outside the contended run.",
      harness:
        "scripts/contend.sh, which pins a cgroup to one core and spawns N busy loops, plus the exact invocation for each arm below.",
      "arms-that-stayed-green": [
        "taskset -c 0-3 node --test test/lock.test.ts, 40 consecutive runs, exit 0 each",
        "one busy loop instead of three, 20 runs, exit 0 each",
      ],
    },
  });
  assert.deepEqual(lines(reportSchema(), didNotReproduce), []);

  /* A non-reproduction naming no arm it tried has reported nothing, and
     `minItems` refuses it. */
  const noArms = investigatorReport({
    repro: {
      "did-not-reproduce": "It would not reproduce.",
      harness: "scripts/contend.sh",
      "arms-that-stayed-green": [],
    },
  });
  assert.notDeepEqual(lines(reportSchema(), noArms), []);

  /* THE CROSS-ROLE CONTROL, which is why the condition names the role. The
     repository's own shipped example is `role: implementer` with a verdict and
     no repro, and it must keep validating. Asserted against the FILE rather
     than a copy of it, so an edit to the template reddens this. */
  const templateRole = readFileSync(
    join(repoRoot, "templates", "report.example.yaml"),
    "utf8",
  ).match(/^role:\s*(\S+)\s*$/m);
  assert.ok(templateRole, "the shipped report example declares no role");
  const otherRole = investigatorReport({ role: templateRole[1] });
  delete otherRole["repro"];
  assert.notEqual(templateRole[1], "investigator");
  assert.deepEqual(lines(reportSchema(), otherRole), []);
});

test("tiphys validate --type report exits 0 on an investigator report with a repro and nonzero without one", () => {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-repro-"));
  try {
    const withRepro = join(dir, "with-repro.json");
    writeFileSync(withRepro, `${JSON.stringify(investigatorReport(), null, 2)}\n`);
    const green = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "report", withRepro],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.equal(green.status, 0, green.stdout + green.stderr);

    const stripped = investigatorReport();
    delete stripped["repro"];
    const withoutRepro = join(dir, "without-repro.json");
    writeFileSync(withoutRepro, `${JSON.stringify(stripped, null, 2)}\n`);
    const red = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "report", withoutRepro],
      { encoding: "utf8", cwd: repoRoot },
    );
    assert.notEqual(red.status, 0);
    assert.ok(
      red.stdout.includes("repro"),
      `the CLI diagnostic does not name repro: ${red.stdout}${red.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
