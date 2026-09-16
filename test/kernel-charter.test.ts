/**
 * THE KERNEL'S ROOT CHARTER (kernel plan M4, M4-P15).
 *
 * WHY THIS FILE EXISTS, and it is not "the charter should be valid". The gate
 * that consumes the root charter is CONDITIONAL on at least one verdict
 * document existing under `delivery/review/`, and this repository has never had
 * one (test/dual-review.test.ts:687 asserts that as a present-tense fact). So
 * every property of the root charter was, until this phase, guarded by a gate
 * that does not run. The moment a phase commits its two clean-room verdicts the
 * precondition passes, `check-dual-review` runs, and whatever the charter says
 * becomes load-bearing for every merge
 * (delivery/plan/m4-charter-blocks-every-merge.md:1).
 *
 * MEASURED, and it is the dangerous state these tests are red against: with two
 * verdict fixtures staged under the real `delivery/review/` and no root
 * charter, `node scripts/check-dual-review.mjs .` exits 21 with "charter.yaml
 * does not exist, so the declared mode's merge-authority is unknown". That is
 * the CI error, not the absent file, and it is what the first phase to land its
 * reviews would have hit.
 *
 * AND A SECOND, QUIETER DANGEROUS STATE. `check-dual-review` reads exactly two
 * things out of the charter: that it decodes, and its `delivery-mode`. It does
 * NOT validate the charter against `schemas/charter.schema.json`, and nothing
 * on the CI path does either. Measured: a root charter with its whole
 * `retention` block deleted is rejected by `tiphys validate --type charter`
 * with exit 1, and the SAME file drives `check-dual-review` to exit 0 green.
 * So "present but invalid" is loud on the fields the gate reads and SILENT on
 * every other required field, and the schema arm below is what closes that.
 *
 * NO COUNTS ANYWHERE. Every assertion here names a string, a mode id or a
 * required property; nothing pins how many verdicts, modes or fields exist,
 * because those registries grow (binding convention 5).
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const scriptPath = join(repoRoot, "scripts", "check-dual-review.mjs");
const fixturesDir = join(repoRoot, "witness", "fixtures", "dual-review");
const charterPath = join(repoRoot, "charter.yaml");

/** The two halves of a properly decorrelated pair, by name, not by count. */
const DECORRELATED_PAIR = ["decorrelated-criteria.yaml", "decorrelated-hazard.yaml"];

/** The sentence the fail-closed regime check prints. Quoted from its own source. */
const REGIME_UNKNOWN = /does not exist, so the declared mode's merge-authority is unknown/;

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
};

function runScript(directory: string): { status: number; output: string } {
  const run = spawnSync(process.execPath, [scriptPath, directory], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
}

function runValidate(path: string): { status: number; output: string } {
  const run = spawnSync(process.execPath, [cliEntry, "validate", "--type", "charter", path], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
}

/**
 * A context directory carrying the REAL root charter and the REAL mode
 * document, plus a decorrelated pair of verdicts.
 *
 * The charter is COPIED rather than rebuilt from the template, because the
 * subject of this file is the document actually at the repository root. A
 * fixture that stands in for it would be testing the template again, which
 * test/dual-review.test.ts already does.
 */
function stageRealCharterContext(): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-kernel-charter-"));
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  copyFileSync(charterPath, join(dir, "charter.yaml"));
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  for (const fixture of DECORRELATED_PAIR) {
    copyFileSync(join(fixturesDir, fixture), join(dir, "delivery", "review", fixture));
  }
  return dir;
}

test("the repository root carries a charter, so the merge check can determine the regime", () => {
  /* THE EXACT COMMAND THE GATE REGISTRY RUNS, against the real repository root,
     from the real repository root. Staging a copy would prove something about a
     copy; the location of this file is the property under test, because
     `gate-registry.yaml` passes `.` and the script resolves `charter.yaml`
     inside whatever directory it is given.

     The regime check runs BEFORE the verdict count, so this assertion holds
     today, with zero verdicts committed, and keeps holding on the day a phase
     commits two. That is what makes it a guard rather than a description of a
     state that has not arrived. */
  assert.ok(existsSync(charterPath), "charter.yaml is absent from the repository root");
  const run = runScript(".");
  assert.doesNotMatch(run.output, REGIME_UNKNOWN, run.output);
  assert.notEqual(run.status, 21, `the merge check errored: ${run.output}`);
});

test("with a committed pair of verdicts the root charter is what lets the check reach a verdict", () => {
  const dir = stageRealCharterContext();
  try {
    /* `are distinct on` is printed ONLY after the declared mode has been found
       in `assurance-modes.yaml` and its `merge-authority` has been read as the
       delegated grant, so this line is evidence that the delegated path was
       taken and not that the check shrugged. A mode whose authority is not
       delegated prints `is not a delegated grant` instead, which is why the two
       sentences are asserted apart. */
    const reached = runScript(dir);
    assert.equal(reached.status, 0, reached.output);
    assert.match(reached.output, /registered check\(s\) named dual-review-decorrelation ran over/);
    assert.match(reached.output, /are distinct on/, reached.output);
    assert.doesNotMatch(reached.output, /is not a delegated grant/, reached.output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("removing the root charter from that same context makes the merge check error rather than green", () => {
  /* THE RED ARM OF THE TEST ABOVE, ONE VARIABLE. The same staging function
     builds the same directory with the same verdicts and the same mode
     document; the charter is removed and nothing else changes. This is the CI
     error the phase exists against, reproduced inside the suite, and it is a
     separate test so that a reader of the suite output sees the dangerous state
     named rather than buried inside a green one. */
  const dir = stageRealCharterContext();
  try {
    const before = runScript(dir);
    assert.equal(before.status, 0, `the control arm was not green: ${before.output}`);
    rmSync(join(dir, "charter.yaml"));
    const refused = runScript(dir);
    assert.equal(refused.status, 21, refused.output);
    assert.match(refused.output, REGIME_UNKNOWN, refused.output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a root charter that is present and unusable fails loudly, and two different members do", () => {
  /* ONE WITNESS IS NOT A CLASS. The class is "present but unusable", and its
     two members are structurally different: one never decodes, the other
     decodes perfectly and names a mode that does not exist. They travel
     different branches of the check and must print different sentences, so
     "could not be read" and "does not define" never collapse into one. */
  const undecodable = stageRealCharterContext();
  try {
    writeFileSync(join(undecodable, "charter.yaml"), "kind: charter\ndelivery-mode: [unclosed\n");
    const run = runScript(undecodable);
    assert.notEqual(run.status, 0, run.output);
    assert.match(run.output, /the charter is present and could not be read/, run.output);
  } finally {
    rmSync(undecodable, { recursive: true, force: true });
  }

  const undefinedMode = stageRealCharterContext();
  try {
    const text = readFileSync(join(undefinedMode, "charter.yaml"), "utf8");
    const retargeted = text.replace(/^delivery-mode: .*$/m, "delivery-mode: not-a-declared-mode");
    assert.notEqual(retargeted, text, "the charter declares no delivery-mode line to retarget");
    writeFileSync(join(undefinedMode, "charter.yaml"), retargeted);
    const run = runScript(undefinedMode);
    assert.notEqual(run.status, 0, run.output);
    assert.match(run.output, /declares delivery mode not-a-declared-mode/, run.output);
    assert.match(run.output, /does not define, so its merge-authority is unknown/, run.output);
    assert.doesNotMatch(run.output, /could not be read/, run.output);
  } finally {
    rmSync(undefinedMode, { recursive: true, force: true });
  }
});

test("the root charter validates, and a copy missing any one required key does not", () => {
  /* THE SCHEMA ARM, which is the half `check-dual-review` deliberately does not
     cover. The required list is READ FROM THE SCHEMA rather than written out
     here, so a field a later phase adds to the schema is exercised without this
     test being edited, and nothing here is a count. */
  const positive = runValidate(charterPath);
  assert.equal(positive.status, 0, positive.output);

  const schema = JSON.parse(
    readFileSync(join(repoRoot, "schemas", "charter.schema.json"), "utf8"),
  ) as { required: string[] };
  const charter = yamlModule.parse(readFileSync(charterPath, "utf8")) as Record<string, unknown>;

  const dir = mkdtempSync(join(tmpdir(), "tiphys-charter-negative-"));
  try {
    /* THE CONTROL FIRST. Re-serialising through the YAML library drops the
       comments and rewrites the block scalars, so a rejection below could
       otherwise be an artifact of the round trip rather than of the deletion.
       This arm establishes that it is not. */
    const roundTrip = join(dir, "round-trip.yaml");
    writeFileSync(roundTrip, yamlModule.stringify(charter));
    const control = runValidate(roundTrip);
    assert.equal(control.status, 0, `the round trip alone broke validation: ${control.output}`);

    for (const key of schema.required) {
      const copy: Record<string, unknown> = { ...charter };
      delete copy[key];
      const path = join(dir, `without-${key}.yaml`);
      writeFileSync(path, yamlModule.stringify(copy));
      const negative = runValidate(path);
      assert.notEqual(negative.status, 0, `deleting ${key} still validated: ${negative.output}`);
      assert.match(
        negative.output,
        new RegExp(`required property ${key} is missing`),
        `deleting ${key} was rejected without naming it: ${negative.output}`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the root charter's declared mode is one assurance-modes.yaml defines, by name", () => {
  /* BY NAME, NEVER BY COUNT. This reads both shipped documents and asserts the
     charter's `delivery-mode` and `assurance-tier` each resolve to a declared
     mode id. It stays true as modes are added and reddens if the charter ever
     names one that was removed, which is the drift `check-dual-review` would
     otherwise only reveal on a pull request that happened to carry verdicts. */
  const charter = yamlModule.parse(readFileSync(charterPath, "utf8")) as Record<string, unknown>;
  const modes = yamlModule.parse(
    readFileSync(join(repoRoot, "assurance-modes.yaml"), "utf8"),
  ) as { modes: { id: string }[] };
  const declared = new Set(modes.modes.map((row) => row.id));
  for (const field of ["delivery-mode", "assurance-tier"]) {
    const value = charter[field];
    assert.equal(typeof value, "string", `charter.yaml declares no ${field}`);
    assert.ok(
      declared.has(value as string),
      `charter.yaml ${field} is ${String(value)}, which assurance-modes.yaml does not declare`,
    );
  }
});

test("this phase's new behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). */
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "charter-root-present-regime-determinable",
    "charter-root-reaches-a-verdict",
    "charter-root-absent-errors-fail-closed",
    "charter-root-unusable-fails-loudly",
    "charter-root-validates-against-the-schema",
    "charter-root-mode-resolves-by-name",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});
