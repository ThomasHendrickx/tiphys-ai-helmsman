/**
 * VALIDATOR CRITERION 11: applicable cases from the OFFICIAL JSON Schema Test
 * Suite pass for every keyword in the declared authoring vocabulary.
 *
 * This is a separate file because it is the one test set imported from
 * outside this repository, and a reviewer must be able to see its provenance
 * without reading past the kernel's own tests
 * (`test/fixtures/json-schema-test-suite/PROVENANCE.md` records the suite
 * revision and every exclusion with its reason).
 *
 * A vocabulary claim with no external suite behind it is the hand-written
 * subset risk DR-0013 rejected, wearing different clothes.
 *
 * ---------------------------------------------------------------------------
 * WHAT FIX ROUND 1 CHANGED HERE, AND WHY (finding A-001, high)
 * ---------------------------------------------------------------------------
 *
 * The first version of this file asserted a TOTAL case count and, separately,
 * that every vocabulary keyword had a vendored FILE. Both were green while
 * SEVEN of the sixteen declared keywords executed ZERO cases:
 * `additionalProperties`, `contains`, `minItems`, `minLength`, `properties`,
 * `required` and `uniqueItems`. The suite writes schemas like
 * `{"properties": {...}}` with no sibling `type`, Ajv's `strictTypes` refuses
 * those, the skip predicate dropped the whole group, and the guard meant to
 * notice looked at the filesystem instead of at the run. So the phase's
 * headline external-conformance evidence covered less than half the
 * vocabulary it claimed, and nothing said so.
 *
 * That is the guard-whose-condition-does-not-test-the-property mechanism this
 * repository has already paid for twice (T-008's own postscript: the first
 * watchdog tested whether a file EXISTED). The fix is the same both times:
 * make the guard measure the thing that matters. It now counts EXECUTED CASES
 * PER KEYWORD and pins each count.
 *
 * ---------------------------------------------------------------------------
 * THE ONE POLICY THIS FILE RELAXES, DECLARED RATHER THAN QUIET
 * ---------------------------------------------------------------------------
 *
 * Suite groups are compiled with every shipped DR-0013 clause 4 policy except
 * `strictTypes` and `strictRequired`. Those two are AUTHORING policies: they
 * constrain how a Tiphys schema may be WRITTEN, not what a keyword MEANS. The
 * suite is a third party's corpus written in a different house style, and
 * refusing it on style grounds measures the style, not the semantics.
 *
 * The relaxation is not taken on trust. `the shipped policies refuse the
 * suite's untyped style` below asserts that the SHIPPED configuration really
 * does reject a representative group, so the difference between the two
 * configurations is witnessed rather than assumed, and a future change that
 * quietly dropped `strictTypes` from the shipped engine would redden it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";

const requireDependency = createRequire(import.meta.url);

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  compileSchema: (schema: Record<string, unknown>) =>
    | { ok: true; validator: (instance: unknown) => boolean }
    | { ok: false; diagnostics: { pointer: string; message: string }[]; reason: string };
  AUTHORING_VOCABULARY: readonly string[];
};

const suiteDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "json-schema-test-suite",
);
const schemasDir = join(dirname(dirname(fileURLToPath(import.meta.url))), "schemas");

interface SuiteTest {
  description: string;
  data: unknown;
  valid: boolean;
}

interface SuiteGroup {
  description: string;
  schema: unknown;
  tests: SuiteTest[];
}

/**
 * Compile a suite group. Shipped policies, minus the two AUTHORING policies
 * named in the header. Written out in full rather than spread from a shared
 * object, so a diff that changes one is visible as a policy change.
 */
function compileSuiteSchema(schema: unknown): ((data: unknown) => boolean) | undefined {
  const { Ajv2020 } = requireDependency("ajv/dist/2020.js") as {
    Ajv2020: new (options: Record<string, unknown>) => {
      compile: (schema: unknown) => (data: unknown) => boolean;
    };
  };
  try {
    return new Ajv2020({
      strict: true,
      allErrors: true,
      validateSchema: true,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
      strictTypes: false,
      strictRequired: false,
    }).compile(schema);
  } catch {
    return undefined;
  }
}

/** A group excluded for a REASON that is printed and counted. */
function skipReason(group: SuiteGroup, file: string): string | undefined {
  const text = JSON.stringify(group.schema);
  if (/"\$ref"\s*:\s*"https?:/.test(text) || /"\$id"\s*:\s*"https?:/.test(text)) {
    return "resolves or declares an absolute http(s) identifier, which DR-0013 clause 4 configures this engine to refuse rather than fetch";
  }
  if (typeof group.schema === "boolean") {
    return "the whole schema is a boolean, which is Draft 2020-12 but is outside the declared authoring vocabulary";
  }
  if (file === "ref.json" && /"\$dynamic|"\$anchor|"\$recursive/.test(text)) {
    return "uses $anchor, $dynamicRef or $recursiveRef, none of which is in the declared authoring vocabulary";
  }
  return undefined;
}

/**
 * THE KNOWN FAILURES, pinned exactly.
 *
 * These five cases FAIL against Ajv 8.20.0 and they are a real unsoundness in
 * the shipped engine, not an artifact of this harness: `required` treats a
 * name that resolves through `Object.prototype` as PRESENT, so
 * `{"required": ["toString"]}` accepts `{}`. It is the same prototype-chain
 * class M2's own validator was fixed for at CR-808, one keyword along.
 *
 * They are PINNED rather than skipped. A skip would let the set grow in
 * silence; an exact set means a sixth failure fails this test, and it means
 * the four-line list below is the honest statement of what the engine does
 * not do. `no shipped schema declares a prototype-chain property name` bounds
 * the exposure with a test rather than with a sentence.
 */
const KNOWN_FAILURES = [
  "properties.json :: properties whose names are Javascript object property names :: none of the properties mentioned",
  "required.json :: required properties whose names are Javascript object property names :: none of the properties mentioned",
  "required.json :: required properties whose names are Javascript object property names :: __proto__ present",
  "required.json :: required properties whose names are Javascript object property names :: toString present",
  "required.json :: required properties whose names are Javascript object property names :: constructor present",
];

/**
 * EXECUTED CASES PER KEYWORD, pinned against the vendored revision.
 *
 * This is the assertion A-001 asked for: it measures the RUN, not the
 * filesystem. A zero here is impossible to write down without noticing, which
 * is the whole point.
 */
const EXPECTED_CASES: Record<string, number> = {
  additionalProperties: 21,
  const: 54,
  contains: 21,
  enum: 45,
  "if-then-else": 22,
  items: 12,
  minItems: 6,
  minLength: 7,
  oneOf: 27,
  pattern: 12,
  properties: 20,
  ref: 47,
  required: 18,
  type: 80,
  uniqueItems: 43,
};

interface RunResult {
  perFile: Record<string, number>;
  failures: string[];
  skipped: string[];
  executed: number;
}

function runSuite(): RunResult {
  const files = readdirSync(suiteDir).filter((n) => n.endsWith(".json")).sort();
  const perFile: Record<string, number> = {};
  const failures: string[] = [];
  const skipped: string[] = [];
  let executed = 0;
  for (const file of files) {
    const key = file.replace(/\.json$/, "");
    perFile[key] = 0;
    const groups = JSON.parse(readFileSync(join(suiteDir, file), "utf8")) as SuiteGroup[];
    for (const group of groups) {
      const reason = skipReason(group, file);
      if (reason !== undefined) {
        skipped.push(`${file}: ${group.description}: ${reason}`);
        continue;
      }
      const validator = compileSuiteSchema(group.schema);
      if (validator === undefined) {
        skipped.push(
          `${file}: ${group.description}: the schema did not compile under the suite configuration`,
        );
        continue;
      }
      for (const one of group.tests) {
        executed += 1;
        perFile[key] = (perFile[key] as number) + 1;
        if (validator(one.data) !== one.valid) {
          failures.push(`${file} :: ${group.description} :: ${one.description}`);
        }
      }
    }
  }
  return { perFile, failures, skipped, executed };
}

test("applicable JSON Schema Test Suite cases pass for every keyword in the declared vocabulary", () => {
  const result = runSuite();

  process.stdout.write(
    `# JSON Schema Test Suite: ${String(result.executed)} cases executed, ` +
      `${String(result.skipped.length)} groups skipped, ` +
      `${String(result.failures.length)} known failures\n`,
  );
  for (const [key, count] of Object.entries(result.perFile).sort()) {
    process.stdout.write(`# executed ${key}: ${String(count)}\n`);
  }
  for (const line of result.skipped) {
    process.stdout.write(`# skipped ${line}\n`);
  }

  /* The failure set is EXACT in both directions: a new failure fails here, and
     so does a known one that silently starts passing (which would mean the
     pinned engine changed under us). */
  assert.deepEqual([...result.failures].sort(), [...KNOWN_FAILURES].sort());
});

test("every keyword in the declared vocabulary executes a pinned number of suite cases, none of them zero", () => {
  const result = runSuite();

  /* The suite's filenames differ from the keyword names in four places, and
     those are the only four: `$ref` is `ref.json`, `if` and `then` share
     `if-then-else.json`. Mapping them here rather than silently dropping them
     is the difference between covering the vocabulary and appearing to. */
  const fileFor = new Map<string, string>([
    ["$ref", "ref"],
    ["if", "if-then-else"],
    ["then", "if-then-else"],
  ]);

  const zero: string[] = [];
  for (const keyword of validateModule.AUTHORING_VOCABULARY) {
    const key = fileFor.get(keyword) ?? keyword;
    const count = result.perFile[key];
    if (count === undefined || count === 0) {
      zero.push(`${keyword} (file ${key}.json): ${String(count ?? "no vendored file")}`);
    }
  }
  /* THE ASSERTION A-001 ASKED FOR. It measures executed cases, not file
     presence. Under the first version of this file seven keywords would have
     appeared in this list and the old guard reported success. */
  assert.deepEqual(
    zero,
    [],
    "a keyword in the declared vocabulary executed zero suite cases",
  );

  /* And the exact counts, so coverage cannot shrink quietly either. */
  assert.deepEqual(result.perFile, EXPECTED_CASES);
});

test("the shipped policies refuse the suite's untyped style, so the relaxation is visible", () => {
  /* WITHOUT THIS TEST the relaxation would be invisible: the suite would pass
     and nobody could tell whether it passed because the engine is strict or
     because this file quietly stopped being. It asserts the difference in
     both directions on ONE representative schema. */
  const untyped = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    properties: { a: { type: "string" } },
  };
  const shipped = validateModule.compileSchema(untyped);
  assert.equal(shipped.ok, false, "the shipped engine accepted an untyped schema");
  assert.deepEqual(
    shipped.ok === false ? shipped.diagnostics : [],
    [
      {
        pointer: "#",
        message:
          "schema uses keyword properties without declaring type object, which this validator's strict policy requires",
      },
    ],
  );

  assert.notEqual(
    compileSuiteSchema(untyped),
    undefined,
    "the suite configuration must accept what the shipped configuration refuses",
  );
});

test("no shipped schema declares a prototype-chain property name", () => {
  /* BOUNDS THE KNOWN FAILURE with a test instead of a sentence. Ajv 8.20.0
     mis-handles `required` for names reachable through Object.prototype, so
     the exposure is exactly "a Tiphys schema that uses such a name". This
     walks every shipped schema and asserts none does, and it will redden the
     day a later phase adds one. */
  const dangerous = new Set([
    "__proto__",
    "constructor",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
  ]);
  const offenders: string[] = [];
  const walk = (node: unknown, path: string, file: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, `${path}/${String(index)}`, file);
      });
      return;
    }
    if (typeof node !== "object" || node === null) {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if ((key === "properties" || key === "required") && value !== null) {
        const names = Array.isArray(value) ? value : Object.keys(value as object);
        for (const name of names) {
          if (typeof name === "string" && dangerous.has(name)) {
            offenders.push(`${file}${path}/${key}: ${name}`);
          }
        }
      }
      walk(value, `${path}/${key}`, file);
    }
  };
  for (const file of readdirSync(schemasDir).filter((n) => n.endsWith(".schema.json"))) {
    walk(JSON.parse(readFileSync(join(schemasDir, file), "utf8")), "", file);
  }
  assert.deepEqual(offenders, []);
});
