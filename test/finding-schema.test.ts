/**
 * THE FINDING-SET SCHEMA TESTS (kernel plan M3, M3-P5 criterion 5).
 *
 * Three Kind A DANGEROUS-INSTANCE rejections, each witnessed in BOTH
 * directions by removing and restoring the guarding keyword: a high-severity
 * finding with no `concrete-edit`, an empty finding list with no
 * `no-findings-statement`, and a set with no `produced-by`.
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
