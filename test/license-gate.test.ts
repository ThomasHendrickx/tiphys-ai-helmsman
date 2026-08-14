import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M3-P10: the license gate, the pack shape, and the installed package.
 *
 * WHAT THIS FILE GUARDS, and why the three subjects are together. All three are
 * the same question asked at three distances: what does a consumer actually
 * get. The license gate asks it of the dependency tree, the pack assertions ask
 * it of the tarball, and the install assertions ask it of the unpacked result.
 * The plan's hazard table is explicit that the second does not imply the third:
 * "a `files` list that packs every DIRECTORY and omits one file inside one of
 * them, so the pack listing looks right and a schema `$ref` fails to resolve
 * from inside an installed tree ... Criterion 2's listing assertion alone would
 * not catch it, and the two are kept separate for that reason"
 * (delivery/plan/kernel-plan-m3.md:4843). They are kept separate here.
 *
 * FIXTURES ARE BUILT AT RUN TIME, NOT COMMITTED. Every fixture below is a
 * three-file tree written into a temporary directory: a package.json, one
 * node_modules entry, and a LICENSE. Committing them would put a package.json
 * declaring a fake dependency tree inside this repository, where `npm ci` and
 * the license gate itself would both walk into it.
 *
 * EVERY RED DIRECTION HAS A GREEN CONTROL OF THE SAME SHAPE. A fixture that
 * reddens tells you nothing on its own: the fixture shape might redden for a
 * reason nobody intended, which is the vacuous-witness failure this repository
 * keeps paying for. So `fixtureTree` builds one healthy tree and each red
 * direction is that tree with ONE field changed.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const gate = join(repoRoot, "scripts", "license-gate.mjs");
const releaseVerify = join(repoRoot, "scripts", "release-verify.sh");
const distEntry = join(repoRoot, "dist", "bin", "tiphys.js");

/** A clean env: no NODE_OPTIONS and no NODE_TEST_*, which a nested node inherits
    and misbehaves under (the pattern test/m2-exit-test.ts documents). */
function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      key !== "NODE_OPTIONS" &&
      !key.startsWith("NODE_TEST_")
    ) {
      env[key] = value;
    }
  }
  return env;
}

function runGate(args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [gate, ...args], {
    encoding: "utf8",
    env: cleanEnv(),
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

interface FixtureOptions {
  /** The dependency's `license` field. `null` writes no license field at all. */
  dependencyLicense: string | null;
  /** `tiphys.thirdPartyCode`, the declaration D-1's license note makes drive
      the notices check. */
  thirdPartyCode?: unknown[];
  /** Write a THIRD-PARTY-NOTICES file with this content. */
  notices?: string;
  /** Write a LICENSE file. Absent witnesses the pack half of check 5. */
  license?: boolean;
}

/**
 * A REAL npm tree, INSTALLED, not a hand-built directory.
 *
 * ROUND 1 CHANGED THIS AND THE CHANGE IS NOT INCIDENTAL. The fixtures used to
 * be three files written by hand: a manifest, a `node_modules/<name>/package.json`,
 * and a LICENSE. That was possible only because the gate MODELLED the tree from
 * the manifest, so a hand-drawn model was enough to satisfy it. The gate now
 * READS `node_modules/.package-lock.json`, which only npm writes, so a fixture
 * has to be a tree npm actually built. The fixtures got more expensive and more
 * honest in the same act, which is the usual price of a check that stops
 * accepting a model.
 *
 * `--install-links` COPIES `file:` dependencies rather than symlinking them, so
 * the tree on disk is a real installed tree and not a set of links back into the
 * fixture source. Measured cost: about 250ms per fixture.
 */
function installFixture(
  root: string,
  manifest: Record<string, unknown>,
  extraArgs: string[] = [],
): void {
  writeFileSync(join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const installed = spawnSync(
    "npm",
    ["install", "--install-links", "--no-audit", "--no-fund", ...extraArgs],
    { cwd: root, encoding: "utf8", env: cleanEnv(), maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(installed.status, 0, `npm install in the fixture failed: ${installed.stderr ?? ""}`);
  assert.ok(
    existsSync(join(root, "node_modules", ".package-lock.json")),
    "npm did not write node_modules/.package-lock.json, so the fixture is not a real installed tree",
  );
}

/** A package source directory the fixtures depend on through `file:`. */
function packageSource(parent: string, name: string, fields: Record<string, unknown>): string {
  const directory = join(parent, `src-${name}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), `${JSON.stringify({ name, version: "1.0.0", ...fields }, null, 2)}\n`);
  return directory;
}

/** The one-dependency fixture the criterion-1 directions vary one field of. */
function fixtureTree(options: FixtureOptions): string {
  const root = mkdtempSync(join(tmpdir(), "tiphys-license-fixture-"));
  const files = ["LICENSE"];
  if (options.notices !== undefined) {
    files.push("THIRD-PARTY-NOTICES");
  }
  const widget = packageSource(root, "widget", options.dependencyLicense === null ? {} : { license: options.dependencyLicense });
  if (options.license !== false) {
    writeFileSync(join(root, "LICENSE"), "Apache License 2.0\n");
  }
  if (options.notices !== undefined) {
    writeFileSync(join(root, "THIRD-PARTY-NOTICES"), options.notices);
  }
  installFixture(root, {
    name: "license-fixture",
    version: "1.0.0",
    license: "Apache-2.0",
    files,
    dependencies: { widget: `file:${widget}` },
    tiphys: {
      licenseAllowlist: ["Apache-2.0", "MIT"],
      thirdPartyCode: options.thirdPartyCode ?? [],
    },
  });
  return root;
}

/* ------------------------------------------------------------------ */
/* Criterion 1: four directions, each witnessed, plus the control       */
/* ------------------------------------------------------------------ */

test("the license gate exits 0 on this repository as shipped", () => {
  const result = runGate([]);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /^license: green \(\d+ production packages licensed\)/);
  /* M2-C-2 one level up: a green with zero units is the vacuous pass, and this
     gate's unit is a real package it read a real license field out of. */
  const units = Number(/license: green \((\d+) /.exec(result.stdout)?.[1] ?? "0");
  assert.ok(units > 0, `the gate reported ${String(units)} units, which is a vacuous green`);
});

test("the fixture shape itself is green, so a red fixture reddens for the reason it declares", () => {
  const root = fixtureTree({ dependencyLicense: "MIT" });
  try {
    const result = runGate(["--root", root]);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /license: green \(1 production packages licensed\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a production dependency with no license field exits nonzero naming the package", () => {
  const root = fixtureTree({ dependencyLicense: null });
  try {
    const result = runGate(["--root", root]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /LICENSE-METADATA widget@1\.0\.0 at node_modules\/widget declares no license field/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a production dependency whose license is off the allowlist exits nonzero naming the license", () => {
  const root = fixtureTree({ dependencyLicense: "SSPL-1.0" });
  try {
    const result = runGate(["--root", root]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /LICENSE-ALLOWLIST widget@1\.0\.0 at node_modules\/widget declares SSPL-1\.0/);
    /* UNKNOWN IS REFUSED THE SAME AS PROHIBITED, which is the half of EXT-F-09
       that a prohibited-list-only gate would miss: a license nobody has
       classified is not a license anybody has cleared. */
    const unknown = fixtureTree({ dependencyLicense: "NoSuchLicense-9.9" });
    try {
      const second = runGate(["--root", unknown]);
      assert.notEqual(second.status, 0);
      assert.match(second.stdout, /at node_modules\/widget declares NoSuchLicense-9\.9, which is not on tiphys\.licenseAllowlist/);
    } finally {
      rmSync(unknown, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("declared copied third-party code with no THIRD-PARTY-NOTICES exits nonzero, and adding the file clears it", () => {
  const missing = fixtureTree({
    dependencyLicense: "MIT",
    thirdPartyCode: [{ name: "firstmate", license: "MIT", holder: "Kun Chen" }],
  });
  try {
    const result = runGate(["--root", missing]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /LICENSE-NOTICES 1 copied third-party component\(s\) are declared \(firstmate\) and THIRD-PARTY-NOTICES does not exist/);
  } finally {
    rmSync(missing, { recursive: true, force: true });
  }

  /* THE SECOND MEMBER OF THE SAME CLASS, and it is structurally different
     rather than the same test twice: the file EXISTS and does not name the
     declared component. A notices check that only tests for the file's presence
     is satisfied by an empty one, which is the guard-that-does-not-test-the-
     property shape CLAUDE.md records. */
  const silent = fixtureTree({
    dependencyLicense: "MIT",
    thirdPartyCode: [{ name: "firstmate", license: "MIT", holder: "Kun Chen" }],
    notices: "This file exists and names nothing.\n",
  });
  try {
    const result = runGate(["--root", silent]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /THIRD-PARTY-NOTICES does not name the declared copied component firstmate/);
  } finally {
    rmSync(silent, { recursive: true, force: true });
  }

  const satisfied = fixtureTree({
    dependencyLicense: "MIT",
    thirdPartyCode: [{ name: "firstmate", license: "MIT", holder: "Kun Chen" }],
    notices: "firstmate, Kun Chen, MIT.\n",
  });
  try {
    const result = runGate(["--root", satisfied]);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  } finally {
    rmSync(satisfied, { recursive: true, force: true });
  }
});

test("an absent allowlist or an absent third-party-code declaration is a finding, not an empty one", () => {
  /* THE FAIL-CLOSED DIRECTION. The obvious shape for a declaration-driven check
     is to read a declaration if present, and that shape is a vacuous pass by
     construction: delete the declaration and the gate goes green over a tree it
     has classified nothing in. */
  const root = fixtureTree({ dependencyLicense: "MIT" });
  try {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    delete manifest["tiphys"];
    writeFileSync(join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const result = runGate(["--root", root]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /LICENSE-ALLOWLIST package\.json declares no tiphys\.licenseAllowlist array/);
    assert.match(result.stdout, /LICENSE-NOTICES package\.json declares no tiphys\.thirdPartyCode array/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pack listing with no LICENSE entry exits nonzero, and the same tree with one does not", () => {
  /* CHECK 5 IS ABOUT THE PACKAGE, NOT THE REPOSITORY. A repository that has a
     LICENSE file and a package that SHIPS one are different facts. The listing
     is injected here rather than packed, because the direction under test is
     what the gate does with a listing that lacks the entry. */
  const root = fixtureTree({ dependencyLicense: "MIT" });
  const listing = join(root, "listing.txt");
  try {
    writeFileSync(listing, "package.json\nindex.js\n");
    const without = runGate(["--root", root, "--pack-listing", listing]);
    assert.notEqual(without.status, 0);
    assert.match(without.stdout, /LICENSE-PACK the npm pack listing carries no LICENSE entry/);

    writeFileSync(listing, "package.json\nindex.js\nLICENSE\n");
    const with_ = runGate(["--root", root, "--pack-listing", listing]);
    assert.equal(with_.status, 0, `${with_.stdout}${with_.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 1b: the TRANSITIVE production set, both directions         */
/* ------------------------------------------------------------------ */

/**
 * THE PRODUCTION SET M3-P1 RECORDED, on 2026-08-08, at the moment the `ajv` and
 * `yaml` pins were taken (delivery/work-history/m3-p1.md:479). DR-0013 clause 5
 * makes it a REQUIRED INPUT to this gate.
 */
const M3_P1_RECORDED = new Map<string, string>([
  ["ajv", "MIT"],
  ["fast-deep-equal", "MIT"],
  ["fast-uri", "BSD-3-Clause"],
  ["json-schema-traverse", "MIT"],
  ["require-from-string", "MIT"],
  ["yaml", "ISC"],
]);

/**
 * WHAT GREW BETWEEN M3-P1 AND M3-P10, and it is recorded as a FINDING rather
 * than folded silently into the expected set. The plan is explicit: "the gate
 * re-derives the inventory here and a difference from M3-P1's recorded set is a
 * FINDING rather than a routine update, because a silently grown production tree
 * between M3-P1 and M3-P10 is exactly the supply-chain surface DR-0013 marked
 * the decision costly for" (delivery/plan/kernel-plan-m3.md:4861).
 *
 * `commonmark` entered `dependencies` in M3-P3 (commit 1a5b7ba, the round-6
 * salvage) and brought three transitive packages with it. Six production
 * packages became ten and no gate existed yet to notice. The finding, its
 * derivation and its licence review are in
 * delivery/work-history/m3-p10.md:1; this map is the machine-readable half, and
 * a package that appears in neither map reddens the test below.
 */
const M3_P10_ADDED = new Map<string, string>([
  ["commonmark", "BSD-2-Clause"],
  ["entities", "BSD-2-Clause"],
  ["mdurl", "MIT"],
  ["minimist", "MIT"],
]);

test("the inventory is the transitive production set, compared by name against what M3-P1 recorded", () => {
  const result = runGate(["--inventory"]);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const taken = JSON.parse(result.stdout) as {
    packages: { name: string; version: string; license: string }[];
    unresolved: { name: string }[];
  };
  assert.deepEqual(taken.unresolved, [], "a production dependency did not resolve under node_modules");

  const found = new Map(taken.packages.map((entry) => [entry.name, entry.license]));

  /* THE TWO PINS DR-0013 NAMES, by name AND by version, because "ajv is in the
     inventory" and "8.20.0 is in the inventory" are different claims and
     criterion 1b asks for the second. */
  const byName = new Map(taken.packages.map((entry) => [entry.name, entry.version]));
  assert.equal(byName.get("ajv"), "8.20.0");
  assert.equal(byName.get("yaml"), "2.9.0");

  /* BOTH DIRECTIONS, which is what the criterion asks for: a package in one map
     and not the other is named, whichever side it is missing from. Asserting
     only that the expected set is a SUBSET would let the tree grow silently,
     which is the exact event this criterion exists to catch. */
  const expected = new Map([...M3_P1_RECORDED, ...M3_P10_ADDED]);
  const missing = [...expected.keys()].filter((name) => !found.has(name)).sort();
  const unexpected = [...found.keys()].filter((name) => !expected.has(name)).sort();
  assert.deepEqual(
    missing,
    [],
    `recorded as a production dependency and absent from the inventory: ${missing.join(", ")}`,
  );
  assert.deepEqual(
    unexpected,
    [],
    `present in the production tree and in no recorded set; this is a FINDING under DR-0013 clause 5, ` +
      `not a routine update, and belongs in a work history before it belongs in this map: ${unexpected.join(", ")}`,
  );

  /* THE LICENSE OF EACH, not only its presence. A package that changed licence
     between two versions is a supply-chain event and a name-only comparison is
     blind to it. */
  for (const [name, license] of expected) {
    assert.equal(found.get(name), license, `${name} declares ${String(found.get(name))}, recorded as ${license}`);
  }
});

/** A copy of the real gate with one substring replaced, in a scratch tree. */
function defangedGate(find: string, replace: string): { path: string; laboratory: string } {
  const source = readFileSync(gate, "utf8");
  assert.ok(source.includes(find), `the defang target moved; this witness is measuring nothing: ${find}`);
  const laboratory = mkdtempSync(join(tmpdir(), "tiphys-license-defang-"));
  /* The mutation is applied to a COPY. Nothing in this repository is edited, so
     there is no `git checkout --` to undo afterwards, which CLAUDE.md warning 8
     records as having cost this project real work twice with no safe narrow
     form. `src/` comes along because the gate imports two modules out of it. */
  cpSync(join(repoRoot, "src"), join(laboratory, "src"), { recursive: true });
  mkdirSync(join(laboratory, "scripts"), { recursive: true });
  const path = join(laboratory, "scripts", "license-gate.mjs");
  writeFileSync(path, source.replace(find, replace));
  return { path, laboratory };
}

const LOCK_READ_ENTRY =
  "  for (const [entryPath, entry] of Object.entries(lock.packages ?? {})) {";
const DEV_FILTER = "    if (entry?.dev === true) {";

test("dropping the WHOLE inventory walk cannot produce a vacuous green, because M2-C-2 rewrites it to error", () => {
  /* CRITERION 1b's VACUOUS-PASS DIRECTION, ARM 1, AND THE RESULT IS NOT WHAT
     THE CRITERION PREDICTED. The criterion says "Removing `ajv` from the
     inventory logic makes the gate exit 0 over a tree that contains it, which
     is the vacuous pass this criterion exists to catch". Measured, that is
     FALSE for the whole-walk removal: `makeGateResult` rewrites a green with
     zero units to `error` (M2-C-2, never green by omission), so the defanged
     gate exits 21 and not 0. The criterion is satisfied in a stronger way than
     it asked for, and this test asserts the stronger fact rather than the
     predicted one.

     ARM 2 BELOW IS WHY THAT IS NOT THE END OF IT. M2-C-2 only sees a count of
     zero, so it catches the walk being removed entirely and is blind to one
     package being skipped out of several. That is the real vacuous pass and it
     needs a different witness, which is the point of "one witness is not a
     class". */
  const root = fixtureTree({ dependencyLicense: null });
  const { path, laboratory } = defangedGate(LOCK_READ_ENTRY, "  for (const [entryPath, entry] of []) {");
  try {
    const real = runGate(["--root", root]);
    assert.notEqual(real.status, 0, "the fixture must redden under the real gate for the defang to mean anything");

    const defanged = spawnSync(process.execPath, [path, "--root", root], {
      encoding: "utf8",
      env: cleanEnv(),
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(defanged.status, 21, `${defanged.stdout ?? ""}${defanged.stderr ?? ""}`);
    assert.match(defanged.stdout ?? "", /license: error \(0 production packages licensed\)/);
    assert.match(defanged.stdout ?? "", /M2-C-2 \(never green by omission\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(laboratory, { recursive: true, force: true });
  }
});

test("skipping ONE package out of several IS a vacuous green, and the recorded-set comparison is what catches it", () => {
  /* CRITERION 1b's VACUOUS-PASS DIRECTION, ARM 2, and it is the structurally
     different member arm 1 is not. The tree has two production dependencies,
     one of them unlicensed. The defang skips exactly that one by name, which is
     the criterion's own "removing `ajv` from the inventory logic". Units stay
     nonzero, so M2-C-2 sees nothing, and the gate reports GREEN over a tree it
     has a finding in. This is the failure the criterion exists to catch and the
     gate alone does not catch it.

     WHAT DOES: the registered inventory comparison above, which asserts the
     production set BY NAME in both directions against what M3-P1 recorded. A
     skipped package is missing from the inventory, and that test names it. The
     defence is the comparison, not the gate, and this test is what proves the
     comparison is load-bearing rather than decorative. */
  const root = mkdtempSync(join(tmpdir(), "tiphys-license-two-"));
  const { path, laboratory } = defangedGate(
    DEV_FILTER,
    "    if (entry?.dev === true || entryPath.endsWith(\"/widget\")) {",
  );
  try {
    /* A REAL two-dependency install: `widget` with no license field, `gadget`
       with one. Two are needed because with a single dependency this arm
       collapses into arm 1, where the count reaches zero and M2-C-2 fires. */
    const widget = packageSource(root, "widget", {});
    const gadget = packageSource(root, "gadget", { license: "MIT" });
    writeFileSync(join(root, "LICENSE"), "Apache License 2.0\n");
    installFixture(root, {
      name: "two-dep-fixture",
      version: "1.0.0",
      license: "Apache-2.0",
      files: ["LICENSE"],
      dependencies: { widget: `file:${widget}`, gadget: `file:${gadget}` },
      tiphys: { licenseAllowlist: ["Apache-2.0", "MIT"], thirdPartyCode: [] },
    });

    const real = runGate(["--root", root]);
    assert.notEqual(real.status, 0, "the real gate must redden on the unlicensed package");
    assert.match(real.stdout, /LICENSE-METADATA widget@1\.0\.0 at node_modules\/widget/);

    const defanged = spawnSync(process.execPath, [path, "--root", root], {
      encoding: "utf8",
      env: cleanEnv(),
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(defanged.status, 0, `${defanged.stdout ?? ""}${defanged.stderr ?? ""}`);
    assert.match(defanged.stdout ?? "", /license: green \(1 production packages licensed\)/);

    /* AND THE INVENTORY OUTPUT SHOWS THE HOLE, which is the input the recorded-
       set comparison consumes. Without this leg the paragraph above would be a
       claim about a test in another file rather than a measurement. */
    const inventory = spawnSync(process.execPath, [path, "--root", root, "--inventory"], {
      encoding: "utf8",
      env: cleanEnv(),
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    const names = (JSON.parse(inventory.stdout ?? "{}") as { packages: { name: string }[] }).packages.map((entry) => entry.name);
    assert.deepEqual(names, ["gadget"], "the defanged inventory should be missing widget, which is what the comparison names");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(laboratory, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M2, HRB-1: the inventory READS the installed tree, two members       */
/* ------------------------------------------------------------------ */

test("an OPTIONAL production dependency is inventoried, and an unlicensed one reddens", () => {
  /* HRB-1 MEMBER A, reproduced from the clean-room review and now a registered
     test. The old inventory walked only edges spelled `dependencies`, so an
     optional dependency was invisible to it: npm installs one, it ships to
     every consumer, and the gate reported green over a package with no license
     field at all.

     `npm ci --omit=dev` installs optional dependencies too, which the old
     script's own comment denied. That comment was true only because no
     dependency here declared any, and nothing detected the day one did. */
  const root = mkdtempSync(join(tmpdir(), "tiphys-license-optional-"));
  try {
    const evil = packageSource(root, "evil", {});
    const good = packageSource(root, "good", { license: "MIT" });
    /* The optional edge lives on the DEPENDENCY, not on the root, so the
       finding is reached transitively and not by a direct declaration. */
    writeFileSync(
      join(good, "package.json"),
      `${JSON.stringify({ name: "good", version: "1.0.0", license: "MIT", optionalDependencies: { evil: `file:${evil}` } }, null, 2)}\n`,
    );
    writeFileSync(join(root, "LICENSE"), "Apache License 2.0\n");
    installFixture(root, {
      name: "optional-fixture",
      version: "1.0.0",
      license: "Apache-2.0",
      files: ["LICENSE"],
      dependencies: { good: `file:${good}` },
      tiphys: { licenseAllowlist: ["Apache-2.0", "MIT"], thirdPartyCode: [] },
    });

    /* THE PREMISE IS CHECKED, NOT ASSUMED: npm really did install it. A fixture
       whose premise silently failed would make this test green for the wrong
       reason, which is the vacuous witness this repository keeps paying for. */
    assert.ok(existsSync(join(root, "node_modules", "evil", "package.json")), "npm did not install the optional dependency, so this test proves nothing");

    const result = runGate(["--root", root]);
    assert.notEqual(result.status, 0, "an installed, shipped, unlicensed optional dependency was reported green");
    assert.match(result.stdout, /LICENSE-METADATA evil@1\.0\.0 at node_modules\/evil declares no license field/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a package NESTED by a version conflict is inventoried under its own path, and a prohibited licence there reddens", () => {
  /* HRB-1 MEMBER B, structurally different from member A: the edge is an
     ordinary `dependencies` edge that the old walk DID follow, and the defect
     was the visited set being keyed on NAME. npm hoists one copy of `nested`
     and nests the other at `node_modules/parentb/node_modules/nested`; the old
     walk saw the hoisted MIT copy, marked the name visited, and never looked at
     the GPL-3.0-only one that was physically installed and would ship.

     Reading `node_modules/.package-lock.json` keys on PATH, so the two copies
     are two entries. */
  const root = mkdtempSync(join(tmpdir(), "tiphys-license-nested-"));
  try {
    /* Real tarballs, not `file:` directories: npm dedupes two `file:` sources
       of the same name and the conflict never forms, which was measured before
       this fixture was written. */
    const tarballs = join(root, "tgz");
    mkdirSync(tarballs, { recursive: true });
    const pack = (source: string): string => {
      const packed = spawnSync("npm", ["pack", "--pack-destination", tarballs], {
        cwd: source,
        encoding: "utf8",
        env: cleanEnv(),
        maxBuffer: 64 * 1024 * 1024,
      });
      assert.equal(packed.status, 0, `npm pack failed for the fixture: ${packed.stderr ?? ""}`);
      return join(tarballs, (packed.stdout ?? "").trim().split("\n").pop() as string);
    };
    const one = pack(packageSource(root, "nested-one", { license: "MIT" }));
    const two = pack(packageSource(root, "nested-two", { license: "GPL-3.0-only" }));
    /* Both sources are named `nested`; the directory names above only keep the
       fixture sources apart on disk. */
    for (const [directory, version] of [["src-nested-one", "1.0.0"], ["src-nested-two", "2.0.0"]] as const) {
      const meta = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8")) as Record<string, unknown>;
      meta["name"] = "nested";
      meta["version"] = version;
      writeFileSync(join(root, directory, "package.json"), `${JSON.stringify(meta, null, 2)}\n`);
    }
    const oneAgain = pack(join(root, "src-nested-one"));
    const twoAgain = pack(join(root, "src-nested-two"));
    void one;
    void two;

    const parenta = packageSource(root, "parenta", { license: "MIT", dependencies: { nested: `file:${oneAgain}` } });
    const parentb = packageSource(root, "parentb", { license: "MIT", dependencies: { nested: `file:${twoAgain}` } });
    writeFileSync(join(root, "LICENSE"), "Apache License 2.0\n");
    installFixture(root, {
      name: "nested-fixture",
      version: "1.0.0",
      license: "Apache-2.0",
      files: ["LICENSE"],
      dependencies: { parenta: `file:${parenta}`, parentb: `file:${parentb}` },
      tiphys: { licenseAllowlist: ["Apache-2.0", "MIT"], thirdPartyCode: [] },
    });

    /* THE PREMISE, CHECKED: npm really did nest a second copy. Without this the
       test would pass on a tree where the conflict never formed. */
    const nestedPath = join(root, "node_modules", "parentb", "node_modules", "nested", "package.json");
    assert.ok(existsSync(nestedPath), "npm did not nest a second copy, so this test proves nothing");
    assert.equal((JSON.parse(readFileSync(nestedPath, "utf8")) as { license: string }).license, "GPL-3.0-only");

    const result = runGate(["--root", root]);
    assert.notEqual(result.status, 0, "a GPL-3.0-only package physically installed under a nested path was reported green");
    assert.match(
      result.stdout,
      /LICENSE-ALLOWLIST nested@2\.0\.0 at node_modules\/parentb\/node_modules\/nested declares GPL-3\.0-only/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the disk walk sees dot-prefixed and nested containers, so a package planted there is a finding", () => {
  /* DV-6, and it is the same mechanism as DV-1 and DV-2 rather than a third
     thing: THE CHECK'S SEARCH SCOPE WAS NARROWER THAN THE PROPERTY IT ASSERTS.
     The lock-versus-disk cross-check claims to find every package directory the
     lock does not list. Its walk skipped every dot-prefixed directory and
     treated only `@` names as containers, so two of the verifier's six plants
     went green, and both were reachable code that `require.resolve` finds.

     Six plants, one at a time, each a package declaring GPL-3.0-only against an
     allowlist of MIT. The two marked below are the ones that used to pass. */
  const base = mkdtempSync(join(tmpdir(), "tiphys-diskwalk-"));
  try {
    const good = packageSource(base, "good", { license: "MIT" });
    writeFileSync(join(base, "LICENSE"), "x\n");
    installFixture(base, {
      name: "diskwalk-fixture",
      version: "1.0.0",
      license: "MIT",
      files: ["LICENSE"],
      dependencies: { good: `file:${good}` },
      tiphys: { licenseAllowlist: ["MIT"], thirdPartyCode: [] },
    });
    const listing = join(base, "listing.txt");
    writeFileSync(listing, "package.json\nLICENSE\n");

    /* THE CONTROL FIRST, so a red below is attributable to the plant and not to
       the fixture shape. */
    const control = runGate(["--root", base, "--pack-listing", listing]);
    assert.equal(control.status, 0, `${control.stdout}${control.stderr}`);

    const plants = [
      "node_modules/evil",
      "node_modules/.hidden/evil",
      "node_modules/@scope/evil",
      "node_modules/good/node_modules/evil",
      "node_modules/good/node_modules/.deep/evil",
    ];
    for (const relative of plants) {
      const planted = join(base, relative);
      mkdirSync(planted, { recursive: true });
      writeFileSync(
        join(planted, "package.json"),
        `${JSON.stringify({ name: "evil", version: "1.0.0", license: "GPL-3.0-only" })}\n`,
      );
      writeFileSync(join(planted, "index.js"), "module.exports = 1;\n");
      const result = runGate(["--root", base, "--pack-listing", listing]);
      assert.notEqual(result.status, 0, `a package planted at ${relative} was reported green`);
      assert.match(
        result.stdout,
        new RegExp(`LICENSE-INVENTORY ${relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} holds a package\\.json`),
        `${relative}: ${result.stdout}`,
      );
      rmSync(planted, { recursive: true, force: true });
    }

    /* AND ONE THAT IS NOT A DIRECTORY AT ALL, because removing the dot skip
       meant `node_modules/.bin` entries became candidates and the first read
       threw ENOTDIR on this repository's own tree. A symlink to a FILE is not a
       container and must be stepped over rather than crashed on. */
    mkdirSync(join(base, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(base, "node_modules", ".bin", "target.js"), "#!/usr/bin/env node\n");
    symlinkSync(join(base, "node_modules", ".bin", "target.js"), join(base, "node_modules", ".bin", "tool"));
    const withBin = runGate(["--root", base, "--pack-listing", listing]);
    assert.equal(withBin.status, 0, `a symlink to a file broke the walk: ${withBin.stdout}${withBin.stderr}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("a package on disk that npm did not install is a finding, and an absent lock is a finding rather than an empty inventory", () => {
  /* THE TWO DIRECTIONS OF THE LOCK-VERSUS-DISK CROSS-CHECK, which is what stops
     the new read being a new model. Reading only the lock would trust a file
     that can be stale; reading only the disk cannot tell production from dev.
     So both, and a disagreement either way is a finding.

     The under-reporting direction is the dangerous one, because that is how a
     package hides. */
  const root = fixtureTree({ dependencyLicense: "MIT" });
  try {
    mkdirSync(join(root, "node_modules", "smuggled"), { recursive: true });
    writeFileSync(
      join(root, "node_modules", "smuggled", "package.json"),
      `${JSON.stringify({ name: "smuggled", version: "6.6.6", license: "GPL-3.0-only" })}\n`,
    );
    const result = runGate(["--root", root]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /LICENSE-INVENTORY node_modules\/smuggled holds a package\.json and appears nowhere in node_modules\/\.package-lock\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  /* AND NO FALLBACK. A gate that quietly reverted to walking the manifest when
     the lock was missing would have reinstated the whole defect on exactly the
     path where it matters. */
  const bare = mkdtempSync(join(tmpdir(), "tiphys-license-nolock-"));
  try {
    writeFileSync(
      join(bare, "package.json"),
      `${JSON.stringify({ name: "bare", version: "1.0.0", license: "Apache-2.0", files: ["LICENSE"], dependencies: { widget: "1.0.0" }, tiphys: { licenseAllowlist: ["Apache-2.0"], thirdPartyCode: [] } }, null, 2)}\n`,
    );
    writeFileSync(join(bare, "LICENSE"), "x\n");
    const result = runGate(["--root", bare]);
    assert.notEqual(result.status, 0, "a tree with no installed lock was not a finding");
    assert.match(result.stdout, /LICENSE-INVENTORY .*\.package-lock\.json does not exist/);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 2: the pack listing, both halves                           */
/* ------------------------------------------------------------------ */

/* THE CAPTURE THE INVENTORY AND PACK TESTS ARE ANCHORED TO (red-witness rules
   (c) and (f)). scripts/license-gate.mjs spawns `npm pack --dry-run --json` and
   decides check 5 on its stdout, so the shape that parser depends on is real
   captured output rather than an expectation typed here. */
const PACK_CAPTURE = readFileSync(
  fileURLToPath(new URL("../witness/captures/npm-pack-dry-run-json.txt", import.meta.url)),
  "utf8",
);

function packListing(): string[] {
  const result = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: repoRoot, encoding: "utf8", env: cleanEnv(), maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, `npm pack --dry-run failed: ${result.stderr ?? ""}`);
  /* EXACTLY ONE PACK RESULT (round 2). `npm pack --json` returns one entry per
     package packed, and `[0]` would describe one member of a set as though it
     were the package. Found by this round's own derivation, not by the verifier:
     it is the same first-match shape as DV-1, in a helper nobody attacked. */
  const results = JSON.parse(result.stdout) as { files: { path: string }[] }[];
  assert.equal(results.length, 1, `npm pack returned ${String(results.length)} pack results; exactly one is expected`);
  return (results[0] as { files: { path: string }[] }).files.map((entry) =>
    entry.path.replace(/^package\//, ""),
  );
}

test("the pack listing carries every declared kernel artifact, and every FILE inside each shipped directory", () => {
  /* The capture is read before the live listing so a drift in npm's own output
     shape reddens here rather than silently changing what the gate parses. */
  assert.match(PACK_CAPTURE, /"path": "AGENTS\.md"/);
  assert.match(PACK_CAPTURE, /npm 11\.\d+/);
  assert.equal(/"path": "package\//.test(PACK_CAPTURE), false, "npm now prefixes pack paths with package/; the strip in license-gate.mjs is no longer a no-op");
  const files = new Set(packListing());
  for (const name of [
    "AGENTS.md",
    "LICENSE",
    "gate-registry.yaml",
    "gates.manifest.json",
    "assurance-modes.yaml",
    "role-model-config.yaml",
  ]) {
    assert.ok(files.has(name), `${name} is not in the pack listing`);
  }

  /* THE HALF THE PLAN SAYS A LISTING ASSERTION MISSES, made into an assertion.
     "A `files` list that packs every DIRECTORY and omits one file inside one of
     them" passes a per-directory presence check, so the comparison is against
     `git ls-files` for each shipped directory: every TRACKED file in it must be
     in the listing, by name. A directory that is present with a file missing
     reddens here rather than at a consumer's `$ref`. */
  for (const directory of ["schemas", "templates", "roles", "checklists", "tuition"]) {
    const tracked = spawnSync("git", ["ls-files", directory], {
      cwd: repoRoot,
      encoding: "utf8",
      env: cleanEnv(),
    });
    assert.equal(tracked.status, 0, `git ls-files ${directory} failed`);
    const names = (tracked.stdout ?? "").split("\n").filter((line) => line !== "");
    assert.ok(names.length > 0, `${directory} tracks no files, so this assertion is vacuous`);
    const absent = names.filter((name) => !files.has(name));
    assert.deepEqual(absent, [], `tracked under ${directory} and absent from the pack listing: ${absent.join(", ")}`);
  }
  /* THE `dist/` LEG NOW HAS AN ORACLE, and it is conditional on the build state
     rather than unconditional.

     TWO CORRECTIONS LIVE HERE AND THEY ARE DIFFERENT. The first, from the
     original round: this assertion was unconditional and the test FAILED (it
     did not skip) when the suite ran without a prior build, turning a
     documented and expected configuration into a red. The second, from the
     clean-room hazard review (HRB-5): even with a build it was a PRESENCE check,
     `files.some(p => p.startsWith("dist/"))`, which is precisely the shape the
     plan's hazard row defeats and which the five tracked directories above are
     deliberately NOT checked with. Changing `files` from `dist` to `dist/bin`
     was measured to pass it with two entries where 121 were expected, producing
     a package whose bin dies with ERR_MODULE_NOT_FOUND.

     `dist/` is the one shipped directory carrying executable code and it was
     the one getting the weak check, because it is untracked and `git ls-files`
     cannot be its oracle. The built tree itself can: every file under `dist/`
     on disk must be in the listing, name for name, with `dist/node_modules`
     excluded because `package.json`'s files list excludes it explicitly. */
  if (existsSync(distEntry)) {
    const walkDist = (directory: string, prefix: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (prefix === "dist/" && entry.name === "node_modules") {
          continue;
        }
        const here = `${prefix}${entry.name}`;
        if (entry.isDirectory()) {
          out.push(...walkDist(join(directory, entry.name), `${here}/`));
        } else {
          out.push(here);
        }
      }
      return out;
    };
    const onDisk = walkDist(join(repoRoot, "dist"), "dist/");
    assert.ok(onDisk.length > 0, "dist/ holds no files, so this assertion would be vacuous");
    const absent = onDisk.filter((path) => !files.has(path));
    assert.deepEqual(
      absent,
      [],
      `built and absent from the pack listing (${String(absent.length)} of ${String(onDisk.length)}): ${absent.slice(0, 5).join(", ")}`,
    );
  }
});

test("the pack listing carries no delivery, test, sandbox or src entry", () => {
  const files = packListing();
  /* The plan names four; `scripts/`, `witness/` and the two dot-directories are
     added because they are the same class and their absence is the same claim.
     `dist/src/` is NOT a `src/` entry and the predicate says so by anchoring on
     the top-level segment rather than substring-matching, which would report a
     false positive on every compiled file. */
  for (const directory of ["delivery", "test", "sandbox", "src", "scripts", "witness", ".github", ".claude"]) {
    const leaked = files.filter((path) => path === directory || path.startsWith(`${directory}/`));
    assert.deepEqual(leaked, [], `${directory}/ leaked into the pack listing: ${leaked.slice(0, 5).join(", ")}`);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3: the INSTALLED package, which criterion 2 cannot reach   */
/* ------------------------------------------------------------------ */

test(
  "a template copied out of an installed package validates against a schema from the same install, and removing that schema reddens",
  { skip: existsSync(distEntry) ? false : `dist/ is absent (${distEntry}); build first` },
  () => {
    /* THE HAZARD THIS EXISTS FOR, in the plan's words: "a schema `$ref` fails to
       resolve from inside an installed tree ... this is the failure mode that
       would make every M3 artifact invisible to a real consumer"
       (delivery/plan/kernel-plan-m3.md:4947). Both inputs come OUT of the
       install, which is what makes this a statement about the install and not
       about this repository.

       IT IS SKIPPED WITHOUT dist/, and a skip is not a pass: warning 12 records
       that a suite run without a build silently skips nine tests and still exits
       0, so the skip message names the path it wanted. */
    const prefix = mkdtempSync(join(tmpdir(), "tiphys-install-"));
    try {
      const packed = spawnSync("npm", ["pack", "--pack-destination", prefix], {
        cwd: repoRoot,
        encoding: "utf8",
        env: cleanEnv(),
        maxBuffer: 64 * 1024 * 1024,
      });
      assert.equal(packed.status, 0, `npm pack failed: ${packed.stderr ?? ""}`);
      const tarball = join(prefix, (packed.stdout ?? "").trim().split("\n").pop() as string);

      writeFileSync(join(prefix, "package.json"), `${JSON.stringify({ name: "consumer", version: "1.0.0", private: true })}\n`);
      const installed = spawnSync("npm", ["install", "--no-audit", "--no-fund", tarball], {
        cwd: prefix,
        encoding: "utf8",
        env: cleanEnv(),
        maxBuffer: 64 * 1024 * 1024,
      });
      assert.equal(installed.status, 0, `npm install failed: ${installed.stderr ?? ""}`);

      const kernel = join(prefix, "node_modules", "@tiphys", "kernel");
      const bin = join(prefix, "node_modules", ".bin", "tiphys");

      const version = spawnSync(bin, ["version"], { encoding: "utf8", env: cleanEnv(), cwd: prefix });
      assert.equal(version.status, 0, `${version.stdout ?? ""}${version.stderr ?? ""}`);
      assert.equal(
        (version.stdout ?? "").trim(),
        JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version,
        "the installed bin printed a version other than the one package.json declares",
      );

      const copied = join(prefix, "copied-out-of-install");
      mkdirSync(copied, { recursive: true });
      cpSync(join(kernel, "templates", "plan.example.yaml"), join(copied, "plan.example.yaml"));

      const green = spawnSync(bin, ["validate", "--type", "plan", join(copied, "plan.example.yaml")], {
        encoding: "utf8",
        env: cleanEnv(),
        cwd: prefix,
      });
      assert.equal(green.status, 0, `${green.stdout ?? ""}${green.stderr ?? ""}`);

      /* THE DANGEROUS STATE. A green above with nothing to compare it to is
         satisfied by a validator that resolves schemas from anywhere at all,
         including this repository. Removing the schema FROM THE INSTALL is what
         proves the install is what answered, and the diagnostic names the path
         so the tree that answered is visible rather than assumed. */
      const schema = join(kernel, "schemas", "plan.schema.json");
      const saved = readFileSync(schema, "utf8");
      rmSync(schema);
      const red = spawnSync(bin, ["validate", "--type", "plan", join(copied, "plan.example.yaml")], {
        encoding: "utf8",
        env: cleanEnv(),
        cwd: prefix,
      });
      writeFileSync(schema, saved);
      assert.notEqual(red.status, 0, "validate passed with the installed schema removed, so it did not read the install");
      assert.ok(
        (red.stderr ?? "").includes(schema),
        `the diagnostic did not name the removed install path: ${red.stderr ?? ""}`,
      );
    } finally {
      rmSync(prefix, { recursive: true, force: true });
    }
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 5: release verification refuses a contaminated path        */
/* ------------------------------------------------------------------ */

test("release-verify refuses to run where the source tree is on the resolution path, naming that path", () => {
  /* CRITERION 5's FALSIFIABLE HALF. "Clean" is a property of the invoking
     environment, which is why the plan says no assertion inside the script can
     fully own it; what the script CAN do is refuse to produce a green from a
     directory where this repository would answer. The repository root is that
     directory, so this is the red direction run against the real thing.

     IT MUST REFUSE BEFORE INSTALLING. A refusal that arrives after `npm install`
     has already written into the repository would be a correct verdict and a
     destructive one, so the assertion below is about the tree as well as the
     exit code. */
  /* THE CAPTURE IS READ, NOT DESCRIBED (red-witness rule (c) and (f)):
     scripts/release-verify.sh is a shell script that spawns npm and node and
     records their exit codes, and
     witness/captures/release-verify-contaminated-and-clean.txt is the real
     output of both directions. Asserting the refusal's shape against the
     capture rather than against a string typed here is what keeps this test
     from being satisfied by a script that prints the right words for the wrong
     reason (CLAUDE.md warning 10). */
  const capture = readFileSync(
    fileURLToPath(new URL("../witness/captures/release-verify-contaminated-and-clean.txt", import.meta.url)),
    "utf8",
  );
  assert.match(capture, /REFUSED\. \S+\/package\.json declares name @tiphys\/kernel/);
  assert.match(capture, /resolved package path \S+\/node_modules\/@tiphys\/kernel\/package\.json/);

  const records = join(mkdtempSync(join(tmpdir(), "tiphys-rv-")), "records.json");
  const result = spawnSync(
    "bash",
    [releaseVerify, "@tiphys/kernel", "0.1.0", "--records", records],
    { cwd: repoRoot, encoding: "utf8", env: cleanEnv(), maxBuffer: 64 * 1024 * 1024 },
  );
  assert.notEqual(result.status, 0, "release-verify produced a green from inside the source tree");
  assert.match(result.stderr ?? "", /REFUSED\./);
  assert.ok(
    (result.stderr ?? "").includes(join(repoRoot, "package.json")),
    `the refusal did not name the resolved path: ${result.stderr ?? ""}`,
  );

  /* IT REFUSED BEFORE RUNNING ANYTHING, and this is the order-independent form
     of that claim: the run produced EXACTLY ONE record and its step is
     `clean-environment`. A run that had proceeded would have written an
     `install` record, an `import` record and three more, so one record is a
     statement about what the script did rather than about what the filesystem
     looks like afterwards.

     THE TWO WEAKER FORMS THIS REPLACED, both recorded because each was wrong in
     an instructive way rather than merely inconvenient:

       1. `git status --porcelain` before and after. It passed standalone and
          FAILED inside the `suite` gate, because `node --test` runs test FILES
          concurrently and a sibling file transiently dirties the tree. A
          whole-repository assertion inside a concurrent suite is a flake by
          construction.
       2. Asserting `.release-verify-npm-cache/` and `node_modules/@tiphys/`
          are ABSENT from the repository. It passed standalone and FAILED inside
          the RED-WITNESS harness, whose control run re-runs the named tests in
          the SAME clone the mutated runs used. The mutated run is a run with
          the guard removed, so it really does install into the clone and really
          does leave that cache directory behind, and the control then reddened
          on litter the witness itself had created. That made the whole witness
          unusable: every member reported red including the green control, which
          reads exactly like a broken guard.

     Both were assertions about ambient state. This one is about the artifact
     the script produced, so nothing another process did can reach it. */
  const written = readFileSync(records, "utf8").split("\n").filter((line) => line !== "");
  assert.equal(written.length, 1, `expected one record from a refusal, got ${String(written.length)}`);
  const record = JSON.parse(written[0] as string) as Record<string, unknown>;
  assert.equal(record["step"], "clean-environment");
  assert.equal(record["exitCode"], 1);
  assert.equal(record["sourceTreeOnResolutionPath"], join(repoRoot, "package.json"));
});

test("release-verify refuses a contaminated resolution path through the real path, through a symlink, and from a parent node_modules", () => {
  /* HRB-6 AND HRB-8 TOGETHER, and they are one test on purpose.

     HRB-6: the old probe defined contamination as "some ancestor of the LOGICAL
     working directory holds a package.json whose `name` equals the package".
     That is a MODEL of Node's resolution and is neither necessary nor
     sufficient for it. The clean-room reviewer defeated it three ways and the
     symlink one was the worst: the script passed, recorded
     `sourceTreeOnResolutionPath: null`, and INSTALLED INTO THE CHECKOUT it was
     supposed to refuse.

     HRB-8: the witness for this behaviour had two dangerous states that both
     DELETED the same probe, which is two ways of removing one feature, not two
     structurally different members of a class. The dangerous state is the probe
     RUNNING AND ANSWERING WRONG, and that state needs an arm to be visible in.
     Arm 3 below is that arm: nothing in the ancestor chain declares the name,
     so only asking Node finds it.

     THREE ARMS, all against the real script:
       1. a real path inside a checkout, which only the ancestor walk finds;
       2. the SAME directory reached through a symlink, which the ancestor walk
          finds only because the probe now resolves the real path;
       3. a `node_modules/@tiphys/kernel` in a PARENT directory, which no
          ancestor `package.json` mentions and only Node's own resolver finds.

     A stand-in checkout is used, so the tree under review is never written
     into, which is also how the reviewer ran it. */
  const laboratory = mkdtempSync(join(tmpdir(), "tiphys-contaminated-"));
  try {
    const checkout = join(laboratory, "checkout");
    mkdirSync(join(checkout, "sub"), { recursive: true });
    writeFileSync(join(checkout, "package.json"), `${JSON.stringify({ name: "@tiphys/kernel", version: "0.1.0" })}\n`);

    const refuse = (workdir: string, arm: string) => {
      const records = join(laboratory, `records-${arm}.json`);
      const result = spawnSync(
        "bash",
        [releaseVerify, "@tiphys/kernel", "0.1.0", "--records", records],
        { cwd: workdir, encoding: "utf8", env: cleanEnv(), maxBuffer: 64 * 1024 * 1024 },
      );
      assert.notEqual(result.status, 0, `arm ${arm}: release-verify produced a green from a contaminated directory`);
      assert.match(result.stderr ?? "", /REFUSED\./, `arm ${arm}: ${result.stderr ?? ""}`);
      const written = readFileSync(records, "utf8").split("\n").filter((line) => line !== "");
      assert.equal(written.length, 1, `arm ${arm}: expected one record from a refusal, got ${String(written.length)}`);
      const record = JSON.parse(written[0] as string) as Record<string, unknown>;
      assert.equal(record["step"], "clean-environment", `arm ${arm}`);
      assert.notEqual(record["sourceTreeOnResolutionPath"], null, `arm ${arm}: the record reports a clean environment`);
      return String(record["sourceTreeOnResolutionPath"]);
    };

    /* ARM 1, the real path. */
    assert.equal(refuse(join(checkout, "sub"), "real"), join(checkout, "package.json"));

    /* ARM 2, the same physical directory through a symlink. */
    const link = join(laboratory, "link");
    symlinkSync(join(checkout, "sub"), link, "dir");
    assert.equal(refuse(link, "symlink"), join(checkout, "package.json"));

    /* ARM 3, a parent node_modules and NO ancestor package.json naming the
       package. Only Node's resolver finds this, which is why it is the arm
       that makes the wrong-answer dangerous state visible. */
    const parent = join(laboratory, "parent");
    const installed = join(parent, "node_modules", "@tiphys", "kernel");
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(installed, "package.json"), `${JSON.stringify({ name: "@tiphys/kernel", version: "0.0.1" })}\n`);
    const work = join(parent, "work");
    mkdirSync(work, { recursive: true });
    assert.equal(refuse(work, "parent-node-modules"), join(installed, "package.json"));

    /* AND NOTHING WAS INSTALLED INTO ANY OF THEM. The reviewer's symlink member
       did install: `node_modules`, `package-lock.json` and the npm cache all
       appeared inside the checkout it should have refused. */
    for (const path of ["node_modules", "package-lock.json", ".release-verify-npm-cache", "copied-out-of-install"]) {
      assert.equal(existsSync(join(checkout, "sub", path)), false, `release-verify created ${path} in a directory it refused`);
      assert.equal(existsSync(join(parent, "work", path)), false, `release-verify created ${path} in a directory it refused`);
    }

    /* NODE_PATH IS REFUSED OUTRIGHT, which is a different remedy from the three
       above and is recorded as such: it is not that the probe finds something,
       it is that an inherited variable makes the whole run irreproducible. */
    const clean = join(laboratory, "clean");
    mkdirSync(clean, { recursive: true });
    const withNodePath = spawnSync(
      "bash",
      [releaseVerify, "@tiphys/kernel", "0.1.0", "--records", join(laboratory, "records-nodepath.json")],
      { cwd: clean, encoding: "utf8", env: { ...cleanEnv(), NODE_PATH: join(laboratory, "anywhere") }, maxBuffer: 64 * 1024 * 1024 },
    );
    assert.notEqual(withNodePath.status, 0, "release-verify ran with NODE_PATH set");
    assert.match(withNodePath.stderr ?? "", /NODE_PATH is set/);
  } finally {
    rmSync(laboratory, { recursive: true, force: true });
  }
});

test("release-verify from a clean directory passes and records a resolved path inside the install prefix", { skip: existsSync(distEntry) ? false : `dist/ is absent (${distEntry}); build first` }, () => {
  const prefix = mkdtempSync(join(tmpdir(), "tiphys-rv-clean-"));
  try {
    const packed = spawnSync("npm", ["pack", "--pack-destination", prefix], {
      cwd: repoRoot,
      encoding: "utf8",
      env: cleanEnv(),
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(packed.status, 0, `npm pack failed: ${packed.stderr ?? ""}`);
    const tarball = join(prefix, (packed.stdout ?? "").trim().split("\n").pop() as string);
    const workdir = join(prefix, "clean");
    mkdirSync(workdir, { recursive: true });

    const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version as string;
    const result = spawnSync(
      "bash",
      [releaseVerify, "@tiphys/kernel", version, "--tarball", tarball],
      { cwd: workdir, encoding: "utf8", env: cleanEnv(), maxBuffer: 64 * 1024 * 1024 },
    );
    assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);

    const records = readFileSync(join(workdir, "release-verify-records.json"), "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const steps = records.map((entry) => entry["step"]);
    /* BY NAME, NEVER BY COUNT: a later step added to the script must not redden
       a test about which steps ran. */
    for (const step of ["clean-environment", "install", "import", "bin-version", "copy-template", "validate-template"]) {
      assert.ok(steps.includes(step), `no record for step ${step}; recorded ${steps.join(", ")}`);
    }
    for (const entry of records) {
      assert.equal(entry["exitCode"], 0, `step ${String(entry["step"])} exited ${String(entry["exitCode"])}`);
      assert.equal(entry["sourceTreeOnResolutionPath"], null, `step ${String(entry["step"])} saw a source tree on the resolution path`);
    }
    /* THE RESOLVED PATH IS INSIDE THE INSTALL PREFIX, which is criterion 5's
       own words: the bundle shows which tree answered rather than asserting
       which one should have. */
    const resolved = records.filter((entry) => entry["resolvedPackagePath"] !== null);
    assert.ok(resolved.length > 0, "no record carried a resolved package path");
    for (const entry of resolved) {
      assert.ok(
        String(entry["resolvedPackagePath"]).startsWith(join(workdir, "node_modules")),
        `resolved outside the install prefix: ${String(entry["resolvedPackagePath"])}`,
      );
      assert.ok(
        !String(entry["resolvedPackagePath"]).startsWith(repoRoot),
        `resolved inside the repository working tree: ${String(entry["resolvedPackagePath"])}`,
      );
    }
  } finally {
    rmSync(prefix, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* The release workflow: delivered, named, and NOT run                  */
/* ------------------------------------------------------------------ */

interface WorkflowStepShape {
  name?: string;
  id?: string;
  run?: string;
  if?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}

interface WorkflowDocument {
  on: Record<string, unknown>;
  jobs: Record<string, { permissions?: Record<string, string>; steps: WorkflowStepShape[] }>;
}

function parseWorkflow(file: string): WorkflowDocument {
  const parsed = spawnSync(
    process.execPath,
    [
      "-e",
      "const {parse}=require(process.argv[1]);process.stdout.write(JSON.stringify(parse(require('node:fs').readFileSync(process.argv[2],'utf8'))));",
      join(repoRoot, "node_modules", "yaml"),
      file,
    ],
    { encoding: "utf8", env: cleanEnv(), cwd: repoRoot },
  );
  assert.equal(parsed.status, 0, `${parsed.stdout ?? ""}${parsed.stderr ?? ""}`);
  return JSON.parse(parsed.stdout) as WorkflowDocument;
}

const releaseWorkflowPath = join(repoRoot, ".github", "workflows", "release.yml");
function releaseWorkflow(): WorkflowDocument {
  return parseWorkflow(releaseWorkflowPath);
}

/**
 * EVERY STEP OF EVERY JOB OF EVERY WORKFLOW FILE.
 *
 * ROUND 2 ADDED THIS AND THE REASON IS THE MECHANISM THIS ROUND EXISTS FOR: a
 * check's SEARCH SCOPE was narrower than the property it asserted. Round 1's
 * interpolation assertion iterated `jobs["release"].steps` while its comment
 * claimed "every step", and the delta verifier defeated it with a second job
 * carrying two interpolations and an unguarded `npm publish`, passing all four
 * tests (DV-2). Round 1's DERIVATION parsed every job; only the GUARD ships
 * forward, and the guard did not.
 *
 * WHAT THIS SCOPE STILL EXCLUDES, asked before the code was written rather than
 * discovered afterwards, because this repository has recorded four consecutive
 * rounds re-introducing a mechanism inside the code that closed it (T-020):
 *
 *   - workflow files OUTSIDE `.github/workflows/`. GitHub reads only that
 *     directory, so this is a limit of GitHub's own scope, not of the walk.
 *   - reusable workflows called through `jobs.<id>.uses:`, which have no
 *     `steps` here and whose bodies live in another file or another repository.
 *     This repository has none; a future one would be invisible.
 *   - composite actions, whose `steps` live in an `action.yml` that this walk
 *     never opens. DV-3 is the same boundary seen from the other side.
 *   - anything a `run:` body INVOKES: `npm run release`, a shell script, a
 *     `make` target. The predicates below read the body, not what it calls.
 *   - `.yaml` as an extension, which GitHub also accepts. The walk takes both,
 *     and that is asserted below rather than assumed.
 */
function allWorkflowSteps(): { file: string; job: string; index: number; step: WorkflowStepShape }[] {
  const directory = join(repoRoot, ".github", "workflows");
  const out: { file: string; job: string; index: number; step: WorkflowStepShape }[] = [];
  const names = readdirSync(directory).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
  assert.ok(names.length > 0, "no workflow files found, so every assertion over them would be vacuous");
  for (const name of names) {
    const document = parseWorkflow(join(directory, name));
    for (const [job, body] of Object.entries(document.jobs ?? {})) {
      (body.steps ?? []).forEach((step, index) => {
        out.push({ file: name, job, index, step });
      });
    }
  }
  return out;
}

/**
 * A LINE THAT INVOKES A PUBLISH COMMAND, not a line that mentions one.
 *
 * DV-1's mechanism verbatim: round 1 selected the publish step with
 * `steps.find((step) => (step.run ?? "").includes("npm publish"))`, the FIRST
 * step whose body CONTAINS that substring. `release.yml` already has a second
 * step whose body carries the string, because the rehearsal notice says
 * "npm publish did NOT run". The verifier inserted one step before the real one
 * and deleted the real step's `if:` outright; the workflow then published on
 * every dispatch and all three M1 tests passed.
 *
 * Anchoring at the start of a LINE is what separates invocation from prose. The
 * alternation covers the two package managers CLAUDE.md bans as well as npm,
 * because a check should not rest on a convention it does not enforce.
 *
 * WHAT THIS PREDICATE EXCLUDES, stated with the same discipline: a publish
 * reached indirectly (`npm run release`), a publish inside a quoted string
 * passed to another shell (`sh -c "npm publish"`), a publish performed by a
 * `uses:` action, and a publish written with the command split across a line
 * continuation. The first is the widest gap and is why the assertion below also
 * pins the number of steps rather than only their guards.
 */
const PUBLISH_COMMAND = /^[ \t]*(?:npm|pnpm|yarn)[ \t]+publish\b/m;

/**
 * SELECT BY ASSERTING UNIQUENESS, NEVER BY TAKING THE FIRST MATCH.
 *
 * This is the round's one-line correction and it is deliberately a helper, so
 * that every selection in this file goes through it and a future selection has
 * to opt OUT of it rather than in. `Array.prototype.find` returns the first
 * match and says nothing about the rest, which is exactly how a decoy absorbs
 * an assertion. The pattern was already correct at one site in this file, where
 * a record count is asserted to be 1 before the record is read; this generalises
 * that site rather than inventing something.
 */
function exactlyOne<T>(candidates: T[], description: string, show: (item: T) => string): T {
  assert.equal(
    candidates.length,
    1,
    `expected exactly one ${description}, found ${String(candidates.length)}` +
      (candidates.length === 0 ? "" : `: ${candidates.map(show).join(" | ")}`),
  );
  return candidates[0] as T;
}

const describeStep = (entry: { file: string; job: string; index: number; step: WorkflowStepShape }): string =>
  `${entry.file} job ${entry.job} step ${String(entry.index)} ${entry.step.name ?? entry.step.id ?? "<unnamed>"}`;

test("the release workflow is manually dispatched only, authenticates by OIDC, and holds no npm token", () => {
  /* WHY THIS IS ASSERTED AT ALL. The plan requires "it never runs on push"
     (delivery/plan/kernel-plan-m3.md:4877) and DR-0024 requires OIDC with no
     stored credential. Both are properties of the file that no run can witness,
     because the correct number of runs of this workflow during M3-P10 is zero.
     A structural assertion is the only witness available for THESE two and is
     labelled as that rather than as a behavioural one. The publish DECISION is
     a different matter and is executed, three tests below. */
  const workflow = readFileSync(releaseWorkflowPath, "utf8");
  const document = releaseWorkflow();

  /* THE TRIGGER SET IS EXACT. Asserting that `push` is absent is weaker than
     asserting the whole set, because a `schedule` or a `pull_request` trigger
     added later would pass the first and is the same defect. */
  assert.deepEqual(Object.keys(document.on), ["workflow_dispatch"]);

  /* THE JOB SET IS EXACT TOO (DV-2). A second job on a release workflow is an
     ordinary thing to add, and the verifier's mutant was exactly that. This
     assertion makes adding one a deliberate act that reddens here first; the
     assertions below ALSO iterate every job, so relaxing this line does not
     silently reopen the hole. Two guards, because the whole finding is that one
     guard's scope was narrower than its claim.

     M3-P12 IS THE DELIBERATE ACT THE COMMENT ABOVE ANTICIPATED, and the list
     is EXTENDED rather than the assertion WEAKENED. It is still `deepEqual`
     over the whole set in file order, so DV-2's mutant, which prepends a
     `notify` job carrying an unguarded publish, still reddens here: three
     names are not two. What would reopen the hole is turning this into an
     `includes` or a length check, and that is not what happened. The tag job
     also brings its own guards under `M3-P12` below, which iterate every job
     of every workflow rather than this file's two. */
  assert.deepEqual(Object.keys(document.jobs), ["release", "tag"]);

  const job = document.jobs["release"];
  assert.ok(job !== undefined, "the release job is not named `release`");
  assert.equal(job.permissions?.["id-token"], "write", "without id-token: write the OIDC token cannot be minted (DR-0024)");
  assert.equal(job.permissions?.["contents"], "read");

  /* NO CREDENTIAL, which is DR-0024's whole point: it removes the secret rather
     than protecting it.

     COMMENT LINES ARE STRIPPED FIRST, and that is a real finding rather than a
     convenience. Written as a whole-file regex this assertion FIRED, correctly,
     on the workflow's own header comment explaining that the npm auth variable
     is deliberately not set. Prose about a token is not a token. Stripping `#`
     lines is what makes the assertion about the executable half; it also means
     a token hidden in a comment would pass, which is a real limit and is stated
     rather than left for a reader to discover. */
  const executable = workflow
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.equal(
    /NPM_TOKEN|NODE_AUTH_TOKEN|npmAuthToken|_authToken/.test(executable),
    false,
    "the release workflow references an npm token outside its comments",
  );
  assert.equal(/secrets\./.test(executable), false, "the release workflow reads a repository secret; DR-0024 stores none");
});

/* ------------------------------------------------------------------ */
/* M1: the guard is EVALUATED, and its SUBJECT is identified uniquely   */
/* ------------------------------------------------------------------ */

test("no Actions expression is interpolated into any run: body of the release workflow, in any job", () => {
  /* HRB-11's MECHANISM, closed at class level rather than at its two instances,
     and DV-2's correction to the SCOPE of that closure. `${{ }}` inside a `run:`
     body is substituted TEXTUALLY before the shell parses the line, so an
     operator-supplied value is not a string to compare, it is shell source.

     ROUND 1 ITERATED `jobs["release"].steps` AND CLAIMED "every step". Round 2
     iterates every job of this file. `gates.yml` is deliberately NOT included:
     it carries eight such interpolations, all pre-existing, all on no phase's
     declaration, and one of them is a real finding the orchestrator now tracks.
     Widening this assertion to it would redden a file this branch must not
     touch, so the scope is release.yml and that is a choice with a reason
     rather than an oversight. */
  const document = releaseWorkflow();
  const offenders: string[] = [];
  for (const [jobName, body] of Object.entries(document.jobs ?? {})) {
    for (const step of body.steps ?? []) {
      if (typeof step.run === "string" && step.run.includes("${{")) {
        offenders.push(`job ${jobName} step ${step.name ?? step.id ?? "<unnamed>"}: ${/\$\{\{[^}]*\}\}/.exec(step.run)?.[0] ?? ""}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Actions expressions interpolated into run: bodies: ${offenders.join("; ")}`);

  /* AND THE OPERATOR INPUTS DO REACH THE SHELL, so this is not satisfied by a
     workflow that simply stopped reading them. Both operator-supplied inputs
     are referenced from some step's `env:`. */
  const envValues = Object.values(document.jobs ?? {}).flatMap((body) =>
    (body.steps ?? []).flatMap((step) => Object.values(step.env ?? {})),
  );
  assert.ok(envValues.some((value) => value.includes("inputs.version")), "inputs.version reaches no step's env:");
  assert.ok(envValues.some((value) => value.includes("inputs.confirm")), "inputs.confirm reaches no step's env:");
});

test("exactly one step in any workflow invokes a publish command, and it is the guarded step in the release job", () => {
  /* DV-1. Round 1 asserted the publish guard by taking the FIRST step whose run
     body CONTAINED "npm publish" and constraining that step. The verifier
     inserted a decoy step ahead of it carrying the expected `if:`, deleted the
     real publish step's `if:` entirely, and all three M1 tests stayed green over
     a workflow that publishes on every dispatch.

     The correction is two-part and both parts are needed. IDENTIFY by a line
     that INVOKES a publish command rather than a body that mentions one, so the
     rehearsal notice's "npm publish did NOT run" is not a candidate. And assert
     UNIQUENESS rather than taking the first match, so a second publishing step
     is a finding in its own right instead of being ignored.

     The search is over EVERY job of EVERY workflow file, not over the release
     job, because a publish added anywhere is the thing being guarded against. */
  /* CONTINUATIONS ARE JOINED FIRST, added in M3-P12. The comment on
     PUBLISH_COMMAND lists "a publish written with the command split across a
     line continuation" as one of its exclusions, and M3-P12's tagging command
     really is written that way, so the gap stopped being hypothetical. Joining
     WIDENS the search and narrows nothing: measured at this head, both the raw
     and the joined scan of every workflow report the same single invocation. */
  const publishing = allWorkflowSteps().filter((entry) => PUBLISH_COMMAND.test(joinContinuations(entry.step.run ?? "")));
  const publish = exactlyOne(publishing, "step invoking a publish command", describeStep);

  /* AND EXACTLY ONE INVOCATION, NOT MERELY EXACTLY ONE STEP. Found by measuring
     rather than by design: a mutant adding `yarn publish` to the SAME guarded
     step left the step count at one and passed. The step really was guarded, so
     the guard assertion was not wrong; the claim this phase makes is narrower
     than "the publishing step is guarded", it is that ONE artifact is published
     ONCE, and a step body with two publish lines is two publishes however well
     guarded. Counting steps was itself a scope one size too wide, which is this
     round's own mechanism appearing inside this round's own fix. */
  const invocations = allWorkflowSteps().flatMap((entry) =>
    joinContinuations(entry.step.run ?? "").split("\n").filter((line) => PUBLISH_COMMAND.test(line)).map((line) => `${describeStep(entry)}: ${line.trim()}`),
  );
  assert.equal(
    invocations.length,
    1,
    `expected exactly one publish invocation across every workflow, found ${String(invocations.length)}: ${invocations.join(" | ")}`,
  );
  assert.equal(publish.file, "release.yml");
  assert.equal(publish.job, "release");
  assert.equal(String(publish.step.if), "${{ steps.decide.outputs.publish == 'yes' }}");

  /* THE DECOY MUST NOT BE A CANDIDATE, asserted rather than assumed, because the
     rehearsal notice's presence in the file is what made round 1's substring
     match survive in the first place. If a future edit made its body invoke a
     publish, the assertion above would already have failed on the count; this
     leg names the reason so a reader does not have to reconstruct it. */
  const rehearsalText = allWorkflowSteps().filter((entry) => (entry.step.run ?? "").includes("npm publish"));
  assert.ok(
    rehearsalText.length > publishing.length,
    "no step MENTIONS npm publish without invoking it, so this test is not exercising the distinction it exists for",
  );
});

test("the publish and rehearsal guards are exact complements, and the pre-publish verification is unguarded and earlier", () => {
  /* HRB-3. The original assertion here was `assert.match(publish.if, /dry-run/)`,
     a substring match on the guard's TEXT, and the clean-room reviewer measured
     three separately inverted guards passing it exit 0, one of which published
     on every dispatch. A test that greps a condition is not a test of the
     condition.

     Exact string equality reddens on every one of those mutants, and asserting
     the two guards as COMPLEMENTS is what stops a rewrite that quietly makes
     both arms run or neither. Every selection below goes through `exactlyOne`,
     which is DV-1's correction applied to the sites the verifier did not
     attack: a second step named "Rehearsal only ..." would have absorbed the
     round-1 `find` exactly as the decoy did. */
  const steps = releaseWorkflow().jobs["release"].steps.map((step, index) => ({
    file: "release.yml",
    job: "release",
    index,
    step,
  }));

  const publish = exactlyOne(
    steps.filter((entry) => PUBLISH_COMMAND.test(entry.step.run ?? "")),
    "publishing step in the release job",
    describeStep,
  );
  const rehearsal = exactlyOne(
    steps.filter((entry) => (entry.step.name ?? "").startsWith("Rehearsal only")),
    "rehearsal notice step",
    describeStep,
  );
  const preflight = exactlyOne(
    steps.filter((entry) => (entry.step.name ?? "").startsWith("Install and RUN the packed artifact")),
    "pre-publish verification step",
    describeStep,
  );

  assert.equal(String(publish.step.if), "${{ steps.decide.outputs.publish == 'yes' }}");
  assert.equal(String(rehearsal.step.if), "${{ steps.decide.outputs.publish != 'yes' }}");

  /* THE PRE-PUBLISH VERIFICATION CARRIES NO GUARD AT ALL (HRB-5). A rehearsal
     that skips the one check which installs and runs the artifact is a
     rehearsal that cannot catch what it exists for. */
  assert.equal(preflight.step.if, undefined, "the pre-publish verification is conditional; a rehearsal must run it too");

  /* AND IT COMES BEFORE THE PUBLISH. Order is the whole finding: the same step
     after the publish can only report the damage. */
  assert.ok(
    preflight.index < publish.index,
    "the artifact is installed and run AFTER the publish, which is the defect HRB-5 names",
  );
});

test("the publish decision script is EXECUTED against a table of inputs, and only an exact confirm publishes", () => {
  /* THE BEHAVIOURAL HALF OF M1, and the reason the decision was moved out of a
     GitHub expression and into a shell step: a `${{ }}` condition cannot be
     evaluated here, and the correct number of runs of this workflow during
     M3-P10 is zero, so a guard written as an expression can only ever be
     described. Written as shell it can be EXTRACTED AND RUN, which is the
     pattern test/m2-exit-test.test.ts already uses for the exit-test guard.

     The old boolean input is gone with the old expression. `== false` coerces:
     GitHub casts operands of differing types to numbers and `null` and `''`
     both cast to 0 exactly as `false` does, so the two values a malformed
     dispatch is most likely to deliver were the two that failed OPEN. Rows 4
     and 5 below are those values against the replacement, and both rehearse.

     Row 6 is the clean-room reviewer's guard-defeating value. Under the old
     step it made the version check agree with whatever package.json held; here
     it must be eight literal characters that match nothing. */
  const document = releaseWorkflow();
  /* `exactlyOne` HERE TOO, and this site is why the correction is a helper
     rather than three edits. A `find` on `step.id === "decide"` is the same
     first-match shape the verifier defeated, one field along: YAML does not stop
     two steps carrying the same id, and the second would be silently ignored. */
  const decide = exactlyOne(
    document.jobs["release"].steps
      .map((step, index) => ({ file: "release.yml", job: "release", index, step }))
      .filter((entry) => entry.step.id === "decide"),
    "step with id `decide`",
    describeStep,
  ).step;
  assert.ok(typeof decide.run === "string" && decide.run.length > 0, "the decide step has no run body");

  const laboratory = mkdtempSync(join(tmpdir(), "tiphys-decide-"));
  try {
    /* A package.json the script reads, in a directory that is not this
       repository, so the declared version under test is chosen here. */
    writeFileSync(join(laboratory, "package.json"), `${JSON.stringify({ name: "lab", version: "0.1.0" })}\n`);
    const script = join(laboratory, "decide.sh");
    writeFileSync(script, decide.run as string);

    const run = (requested: string, confirm: string) => {
      const output = join(laboratory, `out-${Math.random().toString(36).slice(2)}`);
      writeFileSync(output, "");
      const result = spawnSync("bash", [script], {
        cwd: laboratory,
        encoding: "utf8",
        env: { ...cleanEnv(), REQUESTED: requested, CONFIRM: confirm, GITHUB_OUTPUT: output },
      });
      return { status: result.status, emitted: readFileSync(output, "utf8").trim(), stderr: result.stderr ?? "" };
    };

    const table: { requested: string; confirm: string; status: number; emitted: string; why: string }[] = [
      { requested: "0.1.0", confirm: "0.1.0", status: 0, emitted: "publish=yes", why: "the only publishing combination" },
      { requested: "0.1.0", confirm: "", status: 0, emitted: "publish=no", why: "empty confirm rehearses" },
      { requested: "0.1.0", confirm: "yes", status: 0, emitted: "publish=no", why: "a plausible wrong word rehearses" },
      { requested: "0.1.0", confirm: "false", status: 0, emitted: "publish=no", why: "the old boolean's string form rehearses" },
      { requested: "0.1.0", confirm: "true", status: 0, emitted: "publish=no", why: "and so does its opposite" },
      { requested: "0.1.0", confirm: "$declared", status: 0, emitted: "publish=no", why: "the reviewer's guard-defeating value is eight literal characters here" },
      { requested: "0.1.0", confirm: "0.1.1", status: 0, emitted: "publish=no", why: "a near-miss version rehearses" },
      { requested: "0.1.0", confirm: " 0.1.0", status: 0, emitted: "publish=no", why: "leading whitespace is not a match" },
    ];
    for (const row of table) {
      const outcome = run(row.requested, row.confirm);
      assert.equal(outcome.status, row.status, `${row.why}: exited ${String(outcome.status)}; ${outcome.stderr}`);
      assert.equal(outcome.emitted, row.emitted, `${row.why}: emitted ${outcome.emitted}`);
    }

    /* VERSION DISAGREEMENT IS AN ERROR AND NOT A REHEARSAL, and the difference
       matters: continuing would run every gate against a tree the operator did
       not ask about. */
    const mismatch = run("9.9.9", "9.9.9");
    assert.equal(mismatch.status, 1, `a version the manifest does not declare should exit 1, got ${String(mismatch.status)}`);
    assert.match(mismatch.stderr, /refusing/);
    assert.equal(mismatch.emitted, "", "a refusing decision must emit no publish decision at all");

    /* THE INJECTION DIRECTION, run rather than reasoned about. Under the old
       step the value was pasted into the script before bash parsed it; under
       `env:` it is data. If it were still source, the file below would exist. */
    const canary = join(laboratory, "INJECTED");
    const injected = run("0.1.0", `$(touch ${canary}; echo 0.1.0)`);
    assert.equal(existsSync(canary), false, "the confirm value executed as shell; env: is not being used");
    assert.equal(injected.emitted, "publish=no", "a command-substitution value must not reach a publish");
  } finally {
    rmSync(laboratory, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M3-P12: the tag and the GitHub release, which must never point at    */
/* nothing (DR-0032)                                                    */
/* ------------------------------------------------------------------ */

/**
 * THE HAZARD THESE TESTS ARE SHAPED BY, in the owner's terms rather than in a
 * security frame: "If the GitHub release is the mental model of what exists,
 * then a release or a tag that exists WITHOUT a corresponding published version
 * is worse than having none at all"
 * (delivery/decisions/DR-0032-the-github-release-is-the-owners-mental-model.md:44).
 * A false release does not make the npm package wrong; it makes the OWNER
 * wrong. So every assertion below attacks REACHABILITY of a tag or a release
 * without a publish, and none of them is about the package.
 *
 * TWO MECHANISMS THIS REPOSITORY PAID FOR IN M3-P10 ARE NOT REINTRODUCED HERE,
 * and both are named rather than left to a reader to notice:
 *
 *   - M1: a guard asserted by its TEXT rather than EVALUATED. The tag job's
 *     condition guards a repository write, so it is COMPILED and RUN against a
 *     table of contexts below. `assert.match(job.if, /publish/)` would pass on
 *     an inverted guard, on a truthy bare reference, and on a comparison
 *     against the wrong context path; the table reddens on all three.
 *   - Round 2: a check whose SEARCH SCOPE is narrower than the property it
 *     protects. The subject of these tests is selected as "every job of every
 *     workflow that declares a write grant", not as "the job named tag", and
 *     every selection goes through the existing `exactlyOne` helper.
 */

interface RawJob {
  permissions?: unknown;
  needs?: unknown;
  if?: unknown;
  outputs?: unknown;
}

interface RawWorkflow {
  permissions?: unknown;
  jobs?: Record<string, RawJob>;
}

interface JobGrant {
  file: string;
  job: string;
  raw: RawJob;
  /** Whether the grant is the job's own, inherited from the workflow, or absent. */
  source: "job" | "workflow" | "undeclared";
  /** The scope map as written. Empty for a shorthand grant or an absent one. */
  scopes: Record<string, string>;
  /** `read-all` or `write-all`, the two shorthand forms, or undefined. */
  shorthand?: string;
}

/**
 * A GRANT THIS WALK CANNOT INTERPRET IS A FAILURE, NEVER A SKIP.
 *
 * GitHub accepts `permissions:` as a map OR as one of two shorthand strings,
 * and `write-all` grants `contents: write` and `id-token: write` at once. A
 * normaliser that only understood the map form would read a `write-all` job as
 * holding nothing, which is the "guard that cannot go red" shape: silently
 * green over exactly the state it exists to catch.
 */
function normalizeGrant(declared: unknown, where: string): { scopes: Record<string, string>; shorthand?: string } {
  if (declared === undefined || declared === null) {
    return { scopes: {} };
  }
  if (typeof declared === "string") {
    assert.ok(
      declared === "read-all" || declared === "write-all",
      `${where}: permissions shorthand ${declared} is not one this walk understands, so it must not be read as granting nothing`,
    );
    return { scopes: {}, shorthand: declared };
  }
  assert.equal(typeof declared, "object", `${where}: permissions is neither a map nor a shorthand string`);
  const scopes: Record<string, string> = {};
  for (const [scope, value] of Object.entries(declared as Record<string, unknown>)) {
    scopes[scope] = String(value);
  }
  return { scopes };
}

/**
 * EVERY JOB OF EVERY WORKFLOW FILE, with its EFFECTIVE grant.
 *
 * The sibling of `allWorkflowSteps` one level up, and it exists for the same
 * reason: the property being guarded is about the repository's workflows, not
 * about the file the author had open.
 *
 * WHAT THIS SCAN CANNOT SEE, stated before the assertions rather than
 * discovered afterwards:
 *
 *   - the REPOSITORY or ORGANISATION default grant, which applies to a job
 *     declaring no `permissions:` at either level and which lives in settings
 *     no file in this tree carries. Such jobs are enumerated and named by the
 *     first test below rather than passed over, because a new one is a thing to
 *     look at.
 *   - reusable workflows called through `jobs.<id>.uses:`, whose grant is
 *     declared in another file, and composite actions, which have no grant of
 *     their own. Both are the boundary `allWorkflowSteps` already records.
 *   - `GITHUB_TOKEN` handed to a step through `env:` from a context this walk
 *     does not read, and any credential reaching a step other than through
 *     `permissions:`. The token-absence assertions above are the guard for
 *     that, not this one.
 */
function allWorkflowJobs(): JobGrant[] {
  const directory = join(repoRoot, ".github", "workflows");
  const names = readdirSync(directory).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
  assert.ok(names.length > 0, "no workflow files found, so every assertion over them would be vacuous");
  const out: JobGrant[] = [];
  for (const name of names) {
    const document = parseWorkflow(join(directory, name)) as unknown as RawWorkflow;
    for (const [job, raw] of Object.entries(document.jobs ?? {})) {
      const source: JobGrant["source"] =
        raw.permissions !== undefined ? "job" : document.permissions !== undefined ? "workflow" : "undeclared";
      const declared = raw.permissions !== undefined ? raw.permissions : document.permissions;
      out.push({ file: name, job, raw, source, ...normalizeGrant(declared, `${name} job ${job}`) });
    }
  }
  return out;
}

const describeJob = (grant: JobGrant): string => `${grant.file} job ${grant.job}`;

const grantsRepositoryWrite = (grant: JobGrant): boolean =>
  grant.shorthand === "write-all" || grant.scopes["contents"] === "write";

const grantsIdToken = (grant: JobGrant): boolean =>
  grant.shorthand === "write-all" || grant.scopes["id-token"] !== undefined;

function normalizeNeeds(value: unknown, where: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  assert.ok(Array.isArray(value), `${where}: needs is neither a job id nor a list of them`);
  return (value as unknown[]).map((entry) => String(entry));
}

/**
 * A DELIBERATELY TINY EVALUATOR FOR THE ONLY TWO EXPRESSION SHAPES THESE GATES
 * ARE ALLOWED TO TAKE, and it REFUSES everything else.
 *
 * `${{ a.b.c }}` compiles to a lookup and `${{ a.b.c == 'literal' }}` to a
 * strict string comparison. Anything richer is `assert.fail`, and that is the
 * point rather than a limitation: `always()`, `!= `, `&&`, a function call and a
 * bare literal are all ways to make a repository write reachable on a dispatch
 * that published nothing, and an evaluator that quietly returned `undefined`
 * for them would be green over every one.
 *
 * A BARE REFERENCE IS NOT A BOOLEAN, and that distinction is a real defect
 * rather than pedantry: GitHub treats any non-empty string as truthy, so
 * `if: ${{ needs.release.outputs.publish }}` runs on `publish=no`. The tables
 * below assert booleans, so that shape reddens.
 */
const EXPRESSION_PATH = "[A-Za-z_][A-Za-z0-9_-]*(?:\\.[A-Za-z_][A-Za-z0-9_-]*)*";
const EXPRESSION_REFERENCE = new RegExp(`^\\$\\{\\{\\s*(${EXPRESSION_PATH})\\s*\\}\\}$`);
const EXPRESSION_EQUALITY = new RegExp(`^\\$\\{\\{\\s*(${EXPRESSION_PATH})\\s*==\\s*'([^']*)'\\s*\\}\\}$`);

function lookupContext(context: Record<string, unknown>, path: string): unknown {
  let here: unknown = context;
  for (const part of path.split(".")) {
    if (here === null || typeof here !== "object") {
      return undefined;
    }
    here = (here as Record<string, unknown>)[part];
  }
  return here;
}

function compileExpression(source: unknown, where: string): (context: Record<string, unknown>) => unknown {
  assert.equal(
    typeof source,
    "string",
    `${where}: there is no expression here at all, found ${JSON.stringify(source)}`,
  );
  const text = source as string;
  const equality = EXPRESSION_EQUALITY.exec(text);
  if (equality !== null) {
    const path = equality[1] as string;
    const literal = equality[2] as string;
    return (context) => lookupContext(context, path) === literal;
  }
  const reference = EXPRESSION_REFERENCE.exec(text);
  if (reference !== null) {
    const path = reference[1] as string;
    return (context) => lookupContext(context, path);
  }
  return assert.fail(
    `${where}: ${text} is outside the two shapes this evaluator accepts (a bare reference, or a reference compared to a single-quoted literal). ` +
      "It is refused rather than approximated, because every richer shape is a way to reach a repository write on a dispatch that published nothing.",
  );
}

/**
 * A COMMAND SPLIT ACROSS A LINE CONTINUATION IS STILL ONE COMMAND.
 *
 * `PUBLISH_COMMAND`'s own comment names this as one of its exclusions, and the
 * tag command below IS written with continuations, so the predicates that
 * select it join them first. Applied to the publish scan too, where it widens
 * the search and narrows nothing.
 */
const joinContinuations = (body: string): string => body.replace(/\\\n[ \t]*/g, " ");

/**
 * `git tag` THE SUBCOMMAND, not the three-letter sequence.
 *
 * Measured while writing this: a predicate of `/^\s*git\b.*\btag\b/m` matches
 * `git rev-parse -q --verify "refs/tags/${tag}"`, because `${tag}` is delimited
 * by non-word characters on both sides. Two of the three git lines in the step
 * would have been candidates and `exactlyOne` would have reported three where
 * one was wanted. The `-c` repetition is what lets the identity flags through.
 */
const GIT_TAG_COMMAND = /^[ \t]*git[ \t]+(?:-c[ \t]+\S+[ \t]+)*tag\b/m;
const GH_RELEASE_COMMAND = /^[ \t]*gh[ \t]+release[ \t]+create\b/m;

test("exactly one job in any workflow declares a write grant on the repository, and it holds no id-token", () => {
  /* CRITERION 1 AND CRITERION 4. DR-0032:60 decided two jobs so that each grant
     stays minimal: the publisher keeps `contents: read` plus `id-token: write`,
     and the tagger takes `contents: write` and no `id-token`. The absence is
     asserted AS AN ABSENCE rather than as any particular value, because
     `id-token: none` and `id-token: read` are both "not write" and neither is
     what the decision says. */
  const jobs = allWorkflowJobs();

  const writer = exactlyOne(
    jobs.filter(grantsRepositoryWrite),
    "job declaring a write grant on repository contents",
    describeJob,
  );
  assert.equal(writer.file, "release.yml");
  assert.equal(writer.job, "tag");
  assert.equal(writer.source, "job", "the write grant is inherited from the workflow level rather than being the job's own");
  assert.equal(writer.shorthand, undefined, "a shorthand grant is not a minimal grant; write-all carries id-token with it");
  assert.deepEqual(Object.keys(writer.scopes).sort(), ["contents"]);
  assert.equal(writer.scopes["contents"], "write");
  assert.equal(
    "id-token" in writer.scopes,
    false,
    "the tag job declares id-token; DR-0032:63 gives it contents: write and NO id-token, and the absence is the assertion",
  );

  const minter = exactlyOne(jobs.filter(grantsIdToken), "job able to mint an OIDC token", describeJob);
  assert.equal(minter.file, "release.yml");
  assert.equal(minter.job, "release");
  assert.deepEqual(Object.keys(minter.scopes).sort(), ["contents", "id-token"]);
  assert.equal(minter.scopes["contents"], "read", "the publishing job may write to the repository");
  assert.equal(minter.scopes["id-token"], "write");

  /* THE BLIND SPOT, ENUMERATED RATHER THAN DESCRIBED. A job declaring no
     permissions at either level inherits the repository default, which no file
     here carries, so the two assertions above say nothing about it. Naming the
     set makes a NEW such job redden here, where a reviewer will read this
     comment, rather than pass silently. */
  assert.deepEqual(
    jobs.filter((grant) => grant.source === "undeclared").map(describeJob),
    ["gates.yml job gates"],
    "a job declares no permissions at either level, so its grant is the repository default and this scan cannot see it",
  );
});

test("the job that may write to the repository is gated twice, and both gates are EVALUATED rather than matched as text", () => {
  /* CRITERION 2 AND CRITERION 3. The two gates cover different failures and
     either alone leaves a hole (delivery/plan/m3-p12-phase-spec.md:22):
     `needs:` covers "the publish happened and then something was wrong", and
     the `if:` covers "nothing was published at all", which is the ordinary
     rehearsal and which SUCCEEDS. */
  const writer = exactlyOne(
    allWorkflowJobs().filter(grantsRepositoryWrite),
    "job declaring a write grant on repository contents",
    describeJob,
  );

  /* GATE ONE. `needs: release` is what makes a failed post-publish registry
     verification stop the tag, and it is asserted as the EXACT set: a `needs`
     that also names some always-succeeding job would still satisfy an
     `includes` check while adding nothing. */
  assert.deepEqual(
    normalizeNeeds(writer.raw.needs, describeJob(writer)),
    ["release"],
    "the write-capable job does not depend on the release job, so a failed publish does not stop it",
  );

  /* GATE TWO, COMPILED AND RUN. Row by row, and each row is a dispatch that
     really happens: a publish, a rehearsal, an empty output because the decide
     step never ran, and three near misses. */
  const condition = compileExpression(writer.raw.if, `${describeJob(writer)} if:`);
  const rows: { publish: string | undefined; gated: boolean; why: string }[] = [
    { publish: "yes", gated: true, why: "the only value that may tag" },
    { publish: "no", gated: false, why: "a rehearsal succeeds, and must not tag" },
    { publish: "", gated: false, why: "an empty output must not tag" },
    { publish: undefined, gated: false, why: "an absent output must not tag" },
    { publish: "YES", gated: false, why: "the comparison is not case-insensitive" },
    { publish: " yes", gated: false, why: "leading whitespace is not a match" },
    { publish: "true", gated: false, why: "the old boolean shape must not tag" },
  ];
  for (const row of rows) {
    const outputs = row.publish === undefined ? {} : { publish: row.publish };
    assert.equal(
      condition({ needs: { release: { outputs } } }),
      row.gated,
      `${row.why}: publish=${JSON.stringify(row.publish)}`,
    );
  }
  assert.equal(
    condition({ needs: {} }),
    false,
    "an absent needs context gates open, which is the direction that tags a dispatch that published nothing",
  );

  /* THE PRODUCER IS EVALUATED TOO, and this is the half a text assertion cannot
     reach at all. An output pinned to a literal still MENTIONS the decide step
     in the job that reads it; running it against a table is what separates
     "derived from the decision" from "named after it". */
  const document = parseWorkflow(releaseWorkflowPath) as unknown as RawWorkflow;
  const releaseJob = (document.jobs ?? {})["release"];
  assert.ok(releaseJob !== undefined, "the release job is not named `release`");
  const outputs = releaseJob.outputs as Record<string, unknown> | undefined;
  assert.ok(
    outputs !== undefined,
    "the release job declares no job-level outputs, so `steps.decide.outputs.publish` is invisible to every other job and the gate above reads nothing",
  );
  const produced = compileExpression(outputs["publish"], "the release job's publish output");
  for (const value of ["yes", "no", "", "whatever the decide step wrote"]) {
    assert.equal(
      produced({ steps: { decide: { outputs: { publish: value } } } }),
      value,
      "the job-level output does not carry the decide step's value through unchanged",
    );
  }
  assert.equal(
    produced({ steps: { decide: { outputs: {} } } }),
    undefined,
    "the job-level output produces a value the decide step never wrote",
  );

  /* AND THE TWO COMPOSE, END TO END. Producer then consumer, on the same rows:
     this is the assertion that says a REHEARSAL does not tag, rather than two
     assertions about two expressions that might not be connected. */
  for (const row of rows) {
    const decided = produced({
      steps: { decide: { outputs: row.publish === undefined ? {} : { publish: row.publish } } },
    });
    assert.equal(
      condition({ needs: { release: { outputs: { publish: decided } } } }),
      row.gated,
      `end to end, ${row.why}`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* The tagging command, EXECUTED against a scratch repository           */
/* ------------------------------------------------------------------ */

/**
 * THE LAB VERSION AND PACKAGE NAME ARE NOT THIS REPOSITORY'S.
 *
 * `0.7.3` and `@tiphys-lab/anchor` are chosen so that a value hard-coded in the
 * workflow reddens instead of coinciding. This repository is at `0.1.0` and
 * ships `@tiphys/kernel`; a step that wrote either literal would pass a lab
 * fixture that reused them.
 */
const LAB_VERSION = "0.7.3";
const LAB_PACKAGE = "@tiphys-lab/anchor";

/** CI runners have no git identity, so every lab command carries its own. */
const LAB_IDENTITY: Record<string, string> = {
  GIT_AUTHOR_NAME: "Tiphys tag lab",
  GIT_AUTHOR_EMAIL: "tag-lab@tiphys.invalid",
  GIT_COMMITTER_NAME: "Tiphys tag lab",
  GIT_COMMITTER_EMAIL: "tag-lab@tiphys.invalid",
};

function labGit(cwd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...cleanEnv(), ...LAB_IDENTITY },
  });
  return { status: result.status ?? -1, stdout: (result.stdout ?? "").trim(), stderr: result.stderr ?? "" };
}

interface TagLab {
  root: string;
  /** The working clone the step runs in. */
  work: string;
  /** A bare repository standing in for `origin`, at an ABSOLUTE path. */
  remote: string;
  /** The commit the step is TOLD to tag. Deliberately not HEAD. */
  target: string;
  /** HEAD, which is a LATER commit, so that tagging HEAD is a visible defect. */
  head: string;
}

function makeTagLab(): TagLab {
  const root = mkdtempSync(join(tmpdir(), "tiphys-tag-lab-"));
  const remote = join(root, "remote.git");
  const work = join(root, "work");
  mkdirSync(work);
  assert.equal(labGit(root, ["init", "--bare", "--initial-branch=main", remote]).status, 0);
  assert.equal(labGit(work, ["init", "--initial-branch=main"]).status, 0);
  writeFileSync(join(work, "package.json"), `${JSON.stringify({ name: LAB_PACKAGE, version: LAB_VERSION })}\n`);
  assert.equal(labGit(work, ["add", "."]).status, 0);
  assert.equal(labGit(work, ["commit", "-m", "the commit the release ran from"]).status, 0);
  const target = labGit(work, ["rev-parse", "HEAD"]).stdout;
  /* A SECOND COMMIT, SO THAT HEAD IS NOT THE TARGET. Without it, a step that
     tagged `HEAD` instead of the sha it was given would pass every assertion
     below, which is the vacuous-witness shape the red-witness rule's stronger
     form names. */
  writeFileSync(join(work, "later.txt"), "a commit made after the one that was published\n");
  assert.equal(labGit(work, ["add", "."]).status, 0);
  assert.equal(labGit(work, ["commit", "-m", "a later commit"]).status, 0);
  const head = labGit(work, ["rev-parse", "HEAD"]).stdout;
  assert.notEqual(target, head, "the lab's target and HEAD coincide, so the target assertion would be vacuous");
  /* ABSOLUTE, because git resolves a remote path against the REPOSITORY and not
     against the current directory (standing warning 9). */
  assert.equal(labGit(work, ["remote", "add", "origin", remote]).status, 0);
  assert.equal(labGit(work, ["push", "origin", "main"]).status, 0);
  return { root, work, remote, target, head };
}

/**
 * Run an extracted step body with NO git identity in its environment and no
 * user or system configuration to fall back on, which is what a CI runner
 * looks like. The step's own command-scoped `-c user.name`/`-c user.email` is
 * therefore load-bearing here rather than incidental.
 */
function runStepScript(
  directory: string,
  script: string,
  environment: Record<string, string>,
): { status: number; stdout: string; stderr: string } {
  const path = join(directory, `step-${Math.random().toString(36).slice(2)}.sh`);
  writeFileSync(path, script);
  const base = cleanEnv();
  for (const key of Object.keys(base)) {
    if (key.startsWith("GIT_") || key === "EMAIL") {
      delete base[key];
    }
  }
  const result = spawnSync("bash", [path], {
    cwd: directory,
    encoding: "utf8",
    env: { ...base, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", ...environment },
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function taggingStepScript(): string {
  const tagging = exactlyOne(
    allWorkflowSteps().filter((entry) => GIT_TAG_COMMAND.test(joinContinuations(entry.step.run ?? ""))),
    "step invoking git tag in any workflow",
    describeStep,
  );
  assert.equal(tagging.file, "release.yml");
  assert.equal(tagging.job, "tag", "a step creates a git tag outside the job DR-0032 gave the write grant to");
  const script = tagging.step.run;
  assert.ok(typeof script === "string" && script.length > 0, "the tagging step has no run body");
  return script as string;
}

test("the tagging command, executed against a scratch repository, produces an ANNOTATED tag at the commit it was given", () => {
  /* CRITERION 5, and it is executed rather than grepped for exactly the reason
     the decide step above is: the correct number of runs of this workflow
     during M3-P12 is zero, so a description is all a text assertion can ever
     produce. What is read back is the OBJECT TYPE and the TARGET, both from
     git, in the working clone AND in the remote. */
  const script = taggingStepScript();
  const lab = makeTagLab();
  try {
    const outcome = runStepScript(lab.work, script, { VERSION: LAB_VERSION, SHA: lab.target });
    assert.equal(outcome.status, 0, `${outcome.stdout}${outcome.stderr}`);

    const tag = `v${LAB_VERSION}`;
    assert.equal(
      labGit(lab.work, ["cat-file", "-t", tag]).stdout,
      "tag",
      "the tag is lightweight; an annotated tag is what carries its own object, author and date",
    );
    assert.equal(
      labGit(lab.work, ["rev-parse", `${tag}^{commit}`]).stdout,
      lab.target,
      "the tag points somewhere other than the commit the workflow ran from",
    );
    assert.notEqual(labGit(lab.work, ["rev-parse", `${tag}^{commit}`]).stdout, lab.head);

    /* THE REMOTE IS THE ONE THAT MATTERS. A runner's working clone is thrown
       away at the end of the job, so a tag that was created and not pushed is
       a tag that does not exist. */
    assert.equal(labGit(lab.remote, ["cat-file", "-t", tag]).stdout, "tag", "the annotated tag never reached the remote");
    assert.equal(labGit(lab.remote, ["rev-parse", `${tag}^{commit}`]).stdout, lab.target);

    /* AND IT CARRIES A MESSAGE, which is the difference between an annotation
       and an empty object with a date on it. */
    assert.match(labGit(lab.work, ["tag", "-l", "--format=%(contents)", tag]).stdout, /\S/);
  } finally {
    rmSync(lab.root, { recursive: true, force: true });
  }
});

test("the tagging command fails closed on a pre-existing tag, and does not move, delete or reuse it", () => {
  /* CRITERION 6, witnessed against a scratch repository IN THAT STATE rather
     than argued. Two structurally different states, because a tag can already
     exist in either of two places and only one of them is the checkout: an
     earlier dispatch that pushed and then failed leaves the remote carrying a
     tag this job's fresh checkout has never seen. */
  const script = taggingStepScript();
  const tag = `v${LAB_VERSION}`;

  const local = makeTagLab();
  try {
    assert.equal(labGit(local.work, ["tag", "-a", tag, "-m", "a tag that was already here", local.head]).status, 0);
    const before = labGit(local.work, ["rev-parse", tag]).stdout;
    const outcome = runStepScript(local.work, script, { VERSION: LAB_VERSION, SHA: local.target });
    assert.notEqual(outcome.status, 0, `a pre-existing tag must refuse; stdout ${outcome.stdout}`);
    assert.match(outcome.stderr, /refusing/);
    assert.equal(labGit(local.work, ["rev-parse", tag]).stdout, before, "the pre-existing tag object was replaced");
    assert.equal(
      labGit(local.work, ["rev-parse", `${tag}^{commit}`]).stdout,
      local.head,
      "the pre-existing tag was moved, deleted or reused",
    );
    assert.notEqual(
      labGit(local.remote, ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]).status,
      0,
      "a tag reached the remote on a run that refused",
    );
  } finally {
    rmSync(local.root, { recursive: true, force: true });
  }

  const remote = makeTagLab();
  try {
    /* THE TAG EXISTS ON THE REMOTE AND NOT IN THE CHECKOUT, which is the state
       a fresh `actions/checkout` produces after an earlier dispatch pushed one:
       created here, pushed, then removed locally. */
    assert.equal(labGit(remote.work, ["tag", "-a", tag, "-m", "pushed by an earlier dispatch", remote.head]).status, 0);
    assert.equal(labGit(remote.work, ["push", "origin", `refs/tags/${tag}`]).status, 0);
    assert.equal(labGit(remote.work, ["tag", "-d", tag]).status, 0);
    const before = labGit(remote.remote, ["rev-parse", `refs/tags/${tag}`]).stdout;

    const outcome = runStepScript(remote.work, script, { VERSION: LAB_VERSION, SHA: remote.target });
    assert.notEqual(outcome.status, 0, `a tag already on the remote must refuse; stdout ${outcome.stdout}`);
    assert.match(outcome.stderr, /refusing/);
    assert.equal(labGit(remote.remote, ["rev-parse", `refs/tags/${tag}`]).stdout, before, "the remote tag was moved");
    assert.notEqual(
      labGit(remote.work, ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]).status,
      0,
      "a local tag was created for a tag the remote already carries, so the refusal came after a write rather than before one",
    );
  } finally {
    rmSync(remote.root, { recursive: true, force: true });
  }
});

test("the tagging command refuses rather than assuming, when the remote cannot be read or the version disagrees", () => {
  /* THE THIRD ARM OF THE REMOTE PROBE. `git ls-remote --exit-code` answers 0
     for found and 2 for absent, and ANY OTHER status is an unreadable remote.
     Folding that into the absent branch is the "guard that cannot go red"
     shape: it would tag confidently on exactly the runs where it knows least.
     The version arm is here for the same reason and is the same sentence one
     level up: a tag naming a version that was not published is the anchor
     DR-0032 forbids. */
  const script = taggingStepScript();

  const drift = makeTagLab();
  try {
    const outcome = runStepScript(drift.work, script, { VERSION: "9.9.9", SHA: drift.target });
    assert.notEqual(outcome.status, 0, `a version package.json does not declare must refuse; stdout ${outcome.stdout}`);
    assert.match(outcome.stderr, /refusing/);
    for (const tag of ["v9.9.9", `v${LAB_VERSION}`]) {
      assert.notEqual(
        labGit(drift.work, ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]).status,
        0,
        `${tag} was created on a run whose requested version does not match package.json`,
      );
    }
  } finally {
    rmSync(drift.root, { recursive: true, force: true });
  }

  const unreadable = makeTagLab();
  try {
    /* ABSOLUTE AGAIN (standing warning 9): a relative remote path would resolve
       against the repository and might well exist. */
    const nowhere = join(unreadable.root, "there-is-no-repository-here.git");
    assert.equal(labGit(unreadable.work, ["remote", "set-url", "origin", nowhere]).status, 0);
    const outcome = runStepScript(unreadable.work, script, { VERSION: LAB_VERSION, SHA: unreadable.target });
    assert.notEqual(outcome.status, 0, `an unreadable remote must refuse; stdout ${outcome.stdout}`);
    assert.match(outcome.stderr, /ls-remote/);
    assert.notEqual(
      labGit(unreadable.work, ["rev-parse", "-q", "--verify", `refs/tags/v${LAB_VERSION}`]).status,
      0,
      "a tag was created against a remote whose existing tags could not be read",
    );
  } finally {
    rmSync(unreadable.root, { recursive: true, force: true });
  }
});

test("the release-creation command, executed with a stub gh, names the version, the commit, the npm package and the run", () => {
  /* CRITERION 7, asserted against what the command WOULD HAVE SENT rather than
     against the text that composes it. `gh` is absent locally and present in
     CI (standing warning 6), so the stub is not a convenience: it is the only
     form that runs in both places, and it records its argv so the invocation
     is asserted as well as the body. */
  const step = exactlyOne(
    allWorkflowSteps().filter((entry) => GH_RELEASE_COMMAND.test(joinContinuations(entry.step.run ?? ""))),
    "step invoking gh release create in any workflow",
    describeStep,
  );
  assert.equal(step.file, "release.yml");
  assert.equal(step.job, "tag", "a step creates a GitHub release outside the job DR-0032 gave the write grant to");
  const script = step.step.run as string;
  assert.ok(typeof script === "string" && script.length > 0, "the release-creation step has no run body");

  const laboratory = mkdtempSync(join(tmpdir(), "tiphys-release-lab-"));
  try {
    const bin = join(laboratory, "bin");
    mkdirSync(bin);
    const argvRecord = join(laboratory, "gh-argv.txt");
    writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argvRecord)}\n`, { mode: 0o755 });
    writeFileSync(join(laboratory, "package.json"), `${JSON.stringify({ name: LAB_PACKAGE, version: LAB_VERSION })}\n`);
    const runnerTemp = join(laboratory, "runner-temp");
    mkdirSync(runnerTemp);

    /* Values chosen so that none of the four can be produced by accident from
       another: a sha that is not any real commit, a run id that appears nowhere
       else, and a server URL that is not github.com. */
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const environment: Record<string, string> = {
      PATH: `${bin}:${cleanEnv()["PATH"] ?? ""}`,
      VERSION: LAB_VERSION,
      SHA: sha,
      GH_TOKEN: "this-is-not-a-credential",
      RUNNER_TEMP: runnerTemp,
      GITHUB_SERVER_URL: "https://github.invalid",
      GITHUB_REPOSITORY: "an-owner/a-repository",
      GITHUB_RUN_ID: "8675309",
    };

    const outcome = runStepScript(laboratory, script, environment);
    assert.equal(outcome.status, 0, `${outcome.stdout}${outcome.stderr}`);

    const notes = readFileSync(join(runnerTemp, "release-notes.md"), "utf8");
    assert.match(notes, /^version: 0\.7\.3$/m, "the release body does not name the version");
    assert.match(notes, new RegExp(`^commit: ${sha}$`, "m"), "the release body does not name the commit");
    assert.match(
      notes,
      /^npm: https:\/\/www\.npmjs\.com\/package\/@tiphys-lab\/anchor\/v\/0\.7\.3$/m,
      "the release body does not carry the npm package URL for the package and version it anchors",
    );
    assert.match(
      notes,
      /^workflow run: https:\/\/github\.invalid\/an-owner\/a-repository\/actions\/runs\/8675309$/m,
      "the release body does not link the workflow run that produced it",
    );

    const argv = readFileSync(argvRecord, "utf8").split("\n").filter((line) => line.length > 0);
    assert.deepEqual(argv.slice(0, 3), ["release", "create", `v${LAB_VERSION}`]);
    assert.ok(
      argv.includes("--verify-tag"),
      "without --verify-tag, gh CREATES the missing tag itself, lightweight and by its own hand, which hides a failed push behind a green release",
    );
    assert.ok(argv.includes("--notes-file"), "the composed body is not the body gh was given");
    assert.equal(argv[argv.indexOf("--notes-file") + 1], join(runnerTemp, "release-notes.md"));

    /* AND IT REFUSES BEFORE INVOKING gh when the version disagrees, which is
       the same fail-closed direction as the tagging step's. `gh` recording
       nothing is the assertion; a nonzero exit alone would not distinguish
       "refused" from "created the release and then failed". */
    rmSync(argvRecord, { force: true });
    const drifted = runStepScript(laboratory, script, { ...environment, VERSION: "9.9.9" });
    assert.notEqual(drifted.status, 0, `a version package.json does not declare must refuse; stdout ${drifted.stdout}`);
    assert.equal(existsSync(argvRecord), false, "gh was invoked for a version this package.json does not declare");
  } finally {
    rmSync(laboratory, { recursive: true, force: true });
  }
});

test("this phase's new behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). A count is a claim about
     every future phase and is false the moment the next one appends. */
  const behaviors = JSON.parse(readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8")) as Record<string, string>;
  for (const id of [
    "release-tag-write-permission-minimal",
    "release-tag-gated-on-published-version",
    "release-tag-annotated-at-published-commit",
    "release-tag-refuses-existing-tag",
    "release-tag-refuses-unreadable-remote",
    "release-github-release-body-anchors-the-version",
  ]) {
    assert.ok(Object.hasOwn(behaviors, id), `behavior ${id} does not resolve in test/behaviors.json`);
  }
});
