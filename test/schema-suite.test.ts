/**
 * VALIDATOR CRITERION 11: applicable cases from the OFFICIAL JSON Schema Test
 * Suite pass for every keyword in the declared authoring vocabulary.
 *
 * This is a separate file because it is the one test set imported from
 * outside this repository, and a reviewer must be able to see its provenance
 * without reading past the kernel's own tests
 * (`test/fixtures/json-schema-test-suite/PROVENANCE.md` records the suite
 * revision and every file-level exclusion with its reason).
 *
 * A vocabulary claim with no external suite behind it is the hand-written
 * subset risk DR-0013 rejected, wearing different clothes: a kernel-authored
 * test asserts what the kernel's author believed `oneOf` means, and the suite
 * asserts what it means.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  compileSchema: (schema: Record<string, unknown>) =>
    | { ok: true; validator: (instance: unknown) => boolean }
    | { ok: false; reason: string };
  AUTHORING_VOCABULARY: readonly string[];
};

const suiteDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "json-schema-test-suite",
);

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

/** A case is skipped only for a REASON that is printed and counted. */
function skipReason(group: SuiteGroup, file: string): string | undefined {
  const text = JSON.stringify(group.schema);
  if (/"\$ref"\s*:\s*"https?:/.test(text) || /"\$id"\s*:\s*"https?:/.test(text)) {
    return "resolves or declares an absolute http(s) identifier, which DR-0013 clause 4 configures this engine to refuse rather than fetch";
  }
  if (typeof group.schema === "boolean") {
    return "the whole schema is a boolean, which is Draft 2020-12 but is outside the declared authoring vocabulary (schemas/README.md)";
  }
  if (file === "ref.json" && /"\$dynamic|"\$anchor|"\$recursive/.test(text)) {
    return "uses $anchor, $dynamicRef or $recursiveRef, none of which is in the declared authoring vocabulary";
  }
  return undefined;
}

test("applicable JSON Schema Test Suite cases pass for every keyword in the declared vocabulary", () => {
  const files = readdirSync(suiteDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert.ok(files.length > 0, "no suite files were vendored");

  const skipped: string[] = [];
  let executed = 0;
  const failures: string[] = [];

  for (const file of files) {
    const groups = JSON.parse(
      readFileSync(join(suiteDir, file), "utf8"),
    ) as SuiteGroup[];
    for (const group of groups) {
      const reason = skipReason(group, file);
      if (reason !== undefined) {
        skipped.push(`${file}: ${group.description}: ${reason}`);
        continue;
      }
      const compilation = validateModule.compileSchema(
        group.schema as Record<string, unknown>,
      );
      if (!compilation.ok) {
        skipped.push(
          `${file}: ${group.description}: the schema did not compile under the decided policies: ${compilation.reason}`,
        );
        continue;
      }
      for (const one of group.tests) {
        executed += 1;
        const observed = compilation.validator(one.data);
        if (observed !== one.valid) {
          failures.push(
            `${file}: ${group.description}: ${one.description}: expected valid=${String(one.valid)}, got ${String(observed)}`,
          );
        }
      }
    }
  }

  /* Printed, not swallowed: a skip list that nobody sees is a skip list that
     grows. The count is asserted below so a silently widening skip is a
     failure and not a quieter pass. */
  process.stdout.write(
    `# JSON Schema Test Suite: ${String(executed)} cases executed, ${String(skipped.length)} groups skipped\n`,
  );
  for (const line of skipped) {
    process.stdout.write(`# skipped ${line}\n`);
  }

  assert.deepEqual(failures, []);
  /* AN EXACT COUNT, not a floor. The vendored files are pinned to one suite
     revision (PROVENANCE.md records it), so this number is deterministic, and
     a floor would let the skip rule quietly swallow cases while staying
     green: "more than four hundred ran" is satisfied by a run that stopped
     covering a keyword entirely. Any change to it is a deliberate edit here
     with a reason.

     WHY SO MANY GROUPS ARE SKIPPED, and why it is not a weakening. Almost
     every skip is one class: the suite writes schemas like
     `{"properties": {...}}` with no sibling `type`, and Ajv STRICT MODE
     refuses that (`strictTypes`). Strict mode is DR-0013 clause 4, decided
     rather than defaulted. A Tiphys schema must declare its types, so those
     groups describe documents this project cannot author. The skips are
     printed above, one line each, so the class is visible rather than
     inferred. */
  assert.equal(
    executed,
    200,
    `expected exactly 200 suite cases against the pinned revision; got ${String(executed)}`,
  );
});

test("every keyword in the declared vocabulary has vendored suite coverage", () => {
  const files = new Set(readdirSync(suiteDir));
  /* The suite's filenames differ from the keyword names in three places, and
     those are the only three: `$ref` is `ref.json`, and `if`/`then` share
     `if-then-else.json`. Mapping them here rather than silently dropping them
     is the difference between covering the vocabulary and appearing to. */
  const filenameFor = new Map<string, string>([
    ["$ref", "ref.json"],
    ["if", "if-then-else.json"],
    ["then", "if-then-else.json"],
  ]);
  const missing: string[] = [];
  for (const keyword of validateModule.AUTHORING_VOCABULARY) {
    const filename = filenameFor.get(keyword) ?? `${keyword}.json`;
    if (!files.has(filename)) {
      missing.push(`${keyword} (expected ${filename})`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    "a keyword is in the declared vocabulary with no vendored suite file",
  );
});
