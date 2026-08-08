/**
 * THE SCHEMA TESTS (kernel plan M3, M3-P1 step 11).
 *
 * Carries: the dialect declaration over every shipped schema (step 8b),
 * the vocabulary coverage of DR-0013 criterion 2 (both a positive and a
 * negative test per keyword), the DISCRIMINATING pairs of criterion 3
 * (`oneOf`, `if`/`then`, `contains`), and the Kind A dangerous-instance
 * rejections of criteria 3, 5b, 5c and 5e.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const schemasDir = join(repoRoot, "schemas");
const fixturesDir = join(repoRoot, "test", "fixtures");

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
  ) => string[];
  AUTHORING_VOCABULARY: readonly string[];
  TIPHYS_DIALECT: string;
};

function shippedSchemaFiles(): string[] {
  return readdirSync(schemasDir)
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
}

function readSchema(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/* ------------------------------------------------------------------ */
/* Step 8(b): every shipped schema declares the dialect                 */
/* ------------------------------------------------------------------ */

test("every file in schemas/ declares the 2020-12 dialect explicitly", () => {
  const files = shippedSchemaFiles();
  assert.ok(files.length >= 4, `expected the four M3-P1 schemas, saw ${String(files.length)}`);
  const wrong: string[] = [];
  for (const name of files) {
    const document = readSchema(join(schemasDir, name));
    if (document["$schema"] !== validateModule.TIPHYS_DIALECT) {
      wrong.push(`${name}: ${String(document["$schema"])}`);
    }
  }
  /* Enumerated by READDIR, not by a hand-written list. A fixed list here
     would name the four documents that exist today and keep returning
     exactly those forever, so a schema a later phase drops into this
     directory without the declaration would pass by not being looked at.
     That is the same defect M2-P1's own self-check had to fix (CR-812). */
  assert.deepEqual(wrong, []);
});

/* ------------------------------------------------------------------ */
/* DR-0013 criterion 2: a positive AND a negative test per keyword      */
/* ------------------------------------------------------------------ */

interface KeywordCase {
  keyword: string;
  schema: Record<string, unknown>;
  /** An instance the schema ACCEPTS. */
  accepted: unknown;
  /** An instance the schema REJECTS, and the exact line it produces. */
  rejected: unknown;
  expected: string[];
}

const DIALECT = { $schema: "https://json-schema.org/draft/2020-12/schema" };

const KEYWORD_CASES: KeywordCase[] = [
  {
    keyword: "type",
    schema: { ...DIALECT, type: "string" },
    accepted: "a",
    rejected: 1,
    expected: ["INVALID # expected type string but found integer"],
  },
  {
    keyword: "required",
    schema: {
      ...DIALECT,
      type: "object",
      required: ["a"],
      properties: { a: { type: "string" } },
    },
    accepted: { a: "x" },
    rejected: {},
    expected: ["INVALID #/a required property a is missing"],
  },
  {
    keyword: "properties",
    schema: {
      ...DIALECT,
      type: "object",
      properties: { a: { type: "string" } },
    },
    accepted: { a: "x" },
    rejected: { a: 1 },
    expected: ["INVALID #/a expected type string but found integer"],
  },
  {
    keyword: "additionalProperties",
    schema: {
      ...DIALECT,
      type: "object",
      additionalProperties: false,
      properties: { a: { type: "string" } },
    },
    accepted: { a: "x" },
    rejected: { a: "x", b: 1 },
    expected: ["INVALID #/b property b is not permitted here"],
  },
  {
    keyword: "enum",
    schema: { ...DIALECT, type: "string", enum: ["one", "two"] },
    accepted: "one",
    rejected: "three",
    expected: [
      'INVALID # value "three" is not one of the permitted values "one", "two"',
    ],
  },
  {
    keyword: "const",
    schema: { ...DIALECT, type: "string", const: "fixed" },
    accepted: "fixed",
    rejected: "loose",
    expected: [
      'INVALID # value "loose" does not equal the required constant "fixed"',
    ],
  },
  {
    keyword: "items",
    schema: { ...DIALECT, type: "array", items: { type: "string" } },
    accepted: ["a", "b"],
    rejected: ["a", 2],
    expected: ["INVALID #/1 expected type string but found integer"],
  },
  {
    keyword: "minItems",
    schema: { ...DIALECT, type: "array", minItems: 2 },
    accepted: ["a", "b"],
    rejected: ["a"],
    expected: ["INVALID # array has 1 items, fewer than the required minimum 2"],
  },
  {
    keyword: "minLength",
    schema: { ...DIALECT, type: "string", minLength: 1 },
    accepted: "a",
    rejected: "",
    expected: [
      'INVALID # value "" is shorter than the required minimum length 1',
    ],
  },
  {
    keyword: "pattern",
    schema: { ...DIALECT, type: "string", pattern: "^M[0-9]+-P[0-9]+$" },
    accepted: "M3-P1",
    rejected: "m3-p1",
    expected: [
      'INVALID # value "m3-p1" does not match the required pattern ^M[0-9]+-P[0-9]+$',
    ],
  },
  {
    keyword: "uniqueItems",
    schema: { ...DIALECT, type: "array", uniqueItems: true },
    accepted: ["a", "b"],
    rejected: ["a", "a"],
    expected: [
      "INVALID # array items 0 and 1 are duplicates and must be unique",
    ],
  },
  {
    keyword: "$ref",
    schema: {
      ...DIALECT,
      type: "object",
      properties: { a: { $ref: "#/$defs/named" } },
      $defs: { named: { type: "string" } },
    },
    accepted: { a: "x" },
    rejected: { a: 1 },
    expected: ["INVALID #/a expected type string but found integer"],
  },
  {
    keyword: "oneOf",
    schema: {
      ...DIALECT,
      oneOf: [
        { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" } } },
        { type: "object", additionalProperties: false, required: ["b"], properties: { b: { type: "number" } } },
      ],
    },
    accepted: { a: "x" },
    rejected: { a: "x", b: 1 },
    expected: ["INVALID # value matches no permitted alternative here"],
  },
  {
    keyword: "if",
    schema: {
      ...DIALECT,
      type: "object",
      properties: { mode: { type: "string" }, reason: { type: "string" } },
      if: { type: "object", required: ["mode"], properties: { mode: { const: "none" } } },
      then: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } },
    },
    accepted: { mode: "none", reason: "stated" },
    rejected: { mode: "none" },
    expected: [
      "INVALID # value does not satisfy the requirements its own shape triggers here",
      "INVALID #/reason required property reason is missing",
    ],
  },
  {
    keyword: "then",
    schema: {
      ...DIALECT,
      type: "object",
      properties: { mode: { type: "string" }, note: { type: "string" } },
      if: { type: "object", required: ["mode"], properties: { mode: { const: "reserved" } } },
      then: { type: "object", required: ["note"], properties: { note: { type: "string", minLength: 1 } } },
    },
    accepted: { mode: "reserved", note: "why" },
    rejected: { mode: "reserved", note: "" },
    expected: [
      "INVALID # value does not satisfy the requirements its own shape triggers here",
      'INVALID #/note value "" is shorter than the required minimum length 1',
    ],
  },
  {
    keyword: "contains",
    schema: readSchema(join(fixturesDir, "contains.schema.json")),
    accepted: { gates: [{ id: "a", required: false }, { id: "b", required: true }] },
    rejected: { gates: [{ id: "a", required: false }] },
    expected: [
      "INVALID #/gates array contains no item matching the required shape, and 1 is required",
    ],
  },
];

test("every keyword in the declared authoring vocabulary has both a positive and a negative test", () => {
  const covered = new Set(KEYWORD_CASES.map((one) => one.keyword));
  const missing = validateModule.AUTHORING_VOCABULARY.filter(
    (keyword) => !covered.has(keyword),
  );
  /* Derived from the vocabulary rather than from this file's own list: a
     keyword added to the vocabulary with no case here fails, which is the
     only way "every keyword is covered" stays true after the next phase
     extends it. */
  assert.deepEqual(
    missing,
    [],
    "a keyword is in the declared vocabulary with no positive/negative pair",
  );

  for (const one of KEYWORD_CASES) {
    assert.deepEqual(
      validateModule.validateToLines(one.schema, one.accepted),
      [],
      `${one.keyword}: the positive case was rejected`,
    );
    assert.deepEqual(
      validateModule.validateToLines(one.schema, one.rejected),
      one.expected,
      `${one.keyword}: the negative case`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* DR-0013 criterion 3: oneOf, if/then and contains DISCRIMINATE        */
/* ------------------------------------------------------------------ */

test("oneOf, if/then and contains each discriminate: the right branch is accepted and the wrong branch is rejected", () => {
  /* The property under test is that the test would FAIL IF THE KEYWORD WERE
     IGNORED. Each pair below is chosen so that both instances satisfy every
     OTHER keyword in the schema, and only the composite separates them. */

  const oneOfSchema = {
    ...DIALECT,
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["mode", "reason"],
        properties: { mode: { const: "none" }, reason: { type: "string", minLength: 1 } },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["mode", "note"],
        properties: { mode: { const: "reserved" }, note: { type: "string", minLength: 1 } },
      },
    ],
  };
  /* Satisfies EXACTLY ONE branch. */
  assert.deepEqual(
    validateModule.validateToLines(oneOfSchema, { mode: "none", reason: "local only" }),
    [],
  );
  /* Satisfies the WRONG branch's shape: the right keys for `reserved` under
     the `none` mode. An engine ignoring `oneOf` would accept this, because
     every individual keyword it names is satisfiable somewhere. */
  assert.deepEqual(
    validateModule.validateToLines(oneOfSchema, { mode: "none", note: "local only" }),
    ["INVALID # value matches no permitted alternative here"],
  );

  const ifThenSchema = {
    ...DIALECT,
    type: "object",
    additionalProperties: false,
    properties: {
      mode: { type: "string", enum: ["none", "reserved"] },
      reason: { type: "string", minLength: 1 },
    },
    if: { type: "object", required: ["mode"], properties: { mode: { const: "none" } } },
    then: { type: "object", required: ["reason"], properties: { reason: { type: "string", minLength: 1 } } },
  };
  /* The condition does NOT hold, so the consequent must not be applied: an
     engine that ignored `if` and always applied `then` would reject this. */
  assert.deepEqual(
    validateModule.validateToLines(ifThenSchema, { mode: "reserved" }),
    [],
  );
  /* The condition DOES hold, so the consequent must be applied: an engine
     that ignored `if`/`then` entirely would accept this. */
  assert.deepEqual(
    validateModule.validateToLines(ifThenSchema, { mode: "none" }),
    [
      "INVALID # value does not satisfy the requirements its own shape triggers here",
      "INVALID #/reason required property reason is missing",
    ],
  );

  const containsSchema = readSchema(join(fixturesDir, "contains.schema.json"));
  /* Both instances are arrays of the same well-formed item shape and differ
     only in whether ONE member matches, which is the only thing `contains`
     decides. */
  assert.deepEqual(
    validateModule.validateToLines(containsSchema, {
      gates: [{ id: "a", required: false }, { id: "b", required: true }],
    }),
    [],
  );
  assert.deepEqual(
    validateModule.validateToLines(containsSchema, {
      gates: [{ id: "a", required: false }, { id: "b", required: false }],
    }),
    [
      "INVALID #/gates array contains no item matching the required shape, and 1 is required",
    ],
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 3: the four DANGEROUS instances                            */
/* ------------------------------------------------------------------ */

test("each of the four dangerous fixtures is rejected with a message naming the offending pointer", () => {
  const cases: { type: string; fixture: string; pointer: RegExp }[] = [
    {
      type: "plan",
      fixture: "plan-empty-acceptance.yaml",
      pointer: /^INVALID #\/phases\/0\/acceptance array has 0 items, fewer than the required minimum 1$/m,
    },
    {
      type: "charter",
      fixture: "charter-no-escalation.yaml",
      pointer: /^INVALID #\/escalation-contract required property escalation-contract is missing$/m,
    },
    {
      type: "decision-record",
      fixture: "decision-decided-empty.yaml",
      pointer: /^INVALID #\/decided value "" is shorter than the required minimum length 1$/m,
    },
    {
      type: "status-line",
      fixture: "status-done-no-run.yaml",
      pointer: /^INVALID #\/run required property run is missing$/m,
    },
  ];
  for (const one of cases) {
    const run = runCli([
      "validate",
      "--type",
      one.type,
      join(fixturesDir, one.fixture),
    ]);
    assert.equal(run.status, 1, `${one.fixture}: ${run.stdout}${run.stderr}`);
    assert.match(run.stdout, one.pointer, one.fixture);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5b: the reserved release-verification field, all directions */
/* ------------------------------------------------------------------ */

function charterWith(releaseVerification: unknown | undefined): unknown {
  const charter = yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
  if (releaseVerification === undefined) {
    delete charter["release-verification"];
  } else {
    charter["release-verification"] = releaseVerification;
  }
  return charter;
}

test("the charter's release-verification field is reserved: absent, none-without-reason and an invented shape are each rejected naming what is wrong", () => {
  const schema = readSchema(join(schemasDir, "charter.schema.json"));

  /* (1) absent, naming the field. */
  assert.deepEqual(
    validateModule.validateToLines(schema, charterWith(undefined)),
    [
      "INVALID #/release-verification required property release-verification is missing",
    ],
  );

  /* (2) mode none with no reason, naming `reason`. This is the investigation's
     defence 2: silence is never permission, and disabling verification costs
     visibility. */
  const noReason = validateModule.validateToLines(
    schema,
    charterWith({ mode: "none" }),
  );
  assert.ok(
    noReason.some((line) =>
      line.startsWith("INVALID #/release-verification/reason required property reason is missing"),
    ),
    noReason.join("\n"),
  );

  /* (3) mode none WITH a reason: accepted. Without this direction the field
     could be rejecting everything. */
  assert.deepEqual(
    validateModule.validateToLines(
      schema,
      charterWith({ mode: "none", reason: "local-only pilot, no deployment to verify" }),
    ),
    [],
  );

  /* (4) an INVENTED shape, naming the offending property. This is the guard
     that stops a project designing the field before M4's pilot decides it. */
  const invented = validateModule.validateToLines(
    schema,
    charterWith({ mode: "vercel", endpoint: "https://example.invalid/deploy" }),
  );
  assert.ok(
    invented.some((line) =>
      line.startsWith(
        "INVALID #/release-verification/endpoint property endpoint is not permitted here",
      ),
    ),
    invented.join("\n"),
  );
});

test("the release-verification field's $comment cites DR-0014 and the investigation by path", () => {
  const schema = readSchema(join(schemasDir, "charter.schema.json"));
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;
  const comment = String(properties["release-verification"]?.["$comment"] ?? "");
  assert.match(comment, /DR-0014/);
  assert.match(comment, /delivery\/verification\/release-verification-interface\.md/);
});

/* ------------------------------------------------------------------ */
/* Criterion 5c: the shipped stop-for default                           */
/* ------------------------------------------------------------------ */

test("the shipped charter template carries the release-verification stop-for entry", () => {
  /* A PRESENCE ASSERTION OVER PROSE, and it is labelled as one. It proves the
     default is shipped. It does not prove that anyone obeys it, and no test
     in this repository can. */
  const charter = yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8"),
  ) as Record<string, Record<string, unknown>>;
  const stopFor = charter["escalation-contract"]?.["stop-for"] as string[];
  assert.ok(
    stopFor.includes("a change from a declared release verification to `none`"),
    JSON.stringify(stopFor),
  );
  assert.ok(stopFor.includes("any irreversible choice the charter is silent on"));
});

/* ------------------------------------------------------------------ */
/* Criterion 5e: hazard-classes is required and non-empty               */
/* ------------------------------------------------------------------ */

test("a phase with an empty hazard-classes array is rejected naming the pointer, and one entry is accepted", () => {
  const schema = readSchema(join(schemasDir, "plan.schema.json"));
  const source = readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8");

  const empty = yamlModule.parse(source) as Record<string, unknown>;
  ((empty["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>)[
    "hazard-classes"
  ] = [];
  assert.deepEqual(validateModule.validateToLines(schema, empty), [
    "INVALID #/phases/0/hazard-classes array has 0 items, fewer than the required minimum 1",
  ]);

  const one = yamlModule.parse(source) as Record<string, unknown>;
  const phase = (one["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
  phase["hazard-classes"] = [
    {
      id: "H1",
      statement: "A retry that masks a permanent failure.",
      "addressed-by": "criterion 2",
    },
  ];
  assert.deepEqual(validateModule.validateToLines(schema, one), []);
});

test("the shipped plan template carries a real hazard class rather than an empty one", () => {
  const plan = yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
  const hazards = ((plan["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>)[
    "hazard-classes"
  ] as Record<string, string>[];
  assert.ok(hazards.length >= 1);
  for (const hazard of hazards) {
    assert.ok(hazard.statement.length > 20, JSON.stringify(hazard));
    assert.ok(hazard["addressed-by"].length > 0);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5f, Kind A half: the three fields are required             */
/* ------------------------------------------------------------------ */

test("a hazard class missing id, statement or addressed-by is rejected naming the missing field", () => {
  const schema = readSchema(join(schemasDir, "plan.schema.json"));
  const source = readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8");
  for (const field of ["id", "statement", "addressed-by"]) {
    const plan = yamlModule.parse(source) as Record<string, unknown>;
    const phase = (plan["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    const hazards = phase["hazard-classes"] as Record<string, unknown>[];
    delete (hazards[0] as Record<string, unknown>)[field];
    assert.deepEqual(
      validateModule.validateToLines(schema, plan),
      [
        `INVALID #/phases/0/hazard-classes/0/${field} required property ${field} is missing`,
      ],
      field,
    );
  }
});

test("an addressed-by outside the four admissible forms is rejected by the pattern", () => {
  const schema = readSchema(join(schemasDir, "plan.schema.json"));
  const plan = yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
  const phase = (plan["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
  const hazards = phase["hazard-classes"] as Record<string, unknown>[];
  /* "the reviewer will notice" is exactly the non-answer section 2.6 exists
     to refuse: it names no criterion and none of the three admissible
     reasons. */
  (hazards[0] as Record<string, unknown>)["addressed-by"] = "the reviewer will notice";
  const lines = validateModule.validateToLines(schema, plan);
  assert.equal(lines.length, 1);
  assert.match(lines[0] as string, /^INVALID #\/phases\/0\/hazard-classes\/0\/addressed-by value "the reviewer will notice" does not match the required pattern /);
});
