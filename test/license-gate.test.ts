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
  return (JSON.parse(result.stdout) as { files: { path: string }[] }[])[0].files.map((entry) =>
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

/** The parsed release workflow, and its steps. */
function releaseWorkflow(): {
  on: Record<string, unknown>;
  jobs: Record<string, { permissions?: Record<string, string>; steps: WorkflowStepShape[] }>;
} {
  const parsed = spawnSync(
    process.execPath,
    [
      "-e",
      "const {parse}=require(process.argv[1]);process.stdout.write(JSON.stringify(parse(require('node:fs').readFileSync(process.argv[2],'utf8'))));",
      join(repoRoot, "node_modules", "yaml"),
      join(repoRoot, ".github", "workflows", "release.yml"),
    ],
    { encoding: "utf8", env: cleanEnv(), cwd: repoRoot },
  );
  assert.equal(parsed.status, 0, `${parsed.stdout ?? ""}${parsed.stderr ?? ""}`);
  return JSON.parse(parsed.stdout);
}

interface WorkflowStepShape {
  name?: string;
  id?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
}

test("the release workflow is manually dispatched only, authenticates by OIDC, and holds no npm token", () => {
  /* WHY THIS IS ASSERTED AT ALL. The plan requires "it never runs on push"
     (delivery/plan/kernel-plan-m3.md:4877) and DR-0024 requires OIDC with no
     stored credential. Both are properties of the file that no run can witness,
     because the correct number of runs of this workflow during M3-P10 is zero.
     A structural assertion is the only witness available for THESE two and is
     labelled as that rather than as a behavioural one. The publish DECISION is
     a different matter and is executed, two tests below. */
  const workflow = readFileSync(join(repoRoot, ".github", "workflows", "release.yml"), "utf8");
  const document = releaseWorkflow();

  /* THE TRIGGER SET IS EXACT. Asserting that `push` is absent is weaker than
     asserting the whole set, because a `schedule` or a `pull_request` trigger
     added later would pass the first and is the same defect. */
  assert.deepEqual(Object.keys(document.on), ["workflow_dispatch"]);

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
/* M1: the guard is EVALUATED, not read                                 */
/* ------------------------------------------------------------------ */

test("no Actions expression is interpolated into any run: body of the release workflow", () => {
  /* HRB-11's MECHANISM, closed at class level rather than at its two instances.
     `${{ }}` inside a `run:` body is substituted TEXTUALLY before the shell
     parses the line, so an operator-supplied value is not a string to compare,
     it is shell source. Measured by the clean-room reviewer against the old
     version-agreement step: a value of `$declared` made the guard agree with
     whatever package.json held, and a `$(...)` value executed, inside a job
     holding `id-token: write`.

     Fixing the two sites would leave the mechanism live for the next step
     anybody adds. This asserts the property over EVERY step, so a reintroduced
     interpolation reddens wherever it is written. Operator input reaches the
     shell through `env:`, which the runner sets rather than pastes. */
  const document = releaseWorkflow();
  const offenders: string[] = [];
  for (const step of document.jobs["release"].steps) {
    if (typeof step.run === "string" && step.run.includes("${{")) {
      offenders.push(`${step.name ?? step.id ?? "<unnamed>"}: ${/\$\{\{[^}]*\}\}/.exec(step.run)?.[0] ?? ""}`);
    }
  }
  assert.deepEqual(offenders, [], `Actions expressions interpolated into run: bodies: ${offenders.join("; ")}`);

  /* AND THE OPERATOR INPUTS DO REACH THE SHELL, so this is not satisfied by a
     workflow that simply stopped reading them. Both operator-supplied inputs
     are referenced from some step's `env:`. */
  const envValues = document.jobs["release"].steps.flatMap((step) => Object.values(step.env ?? {}));
  assert.ok(envValues.some((value) => value.includes("inputs.version")), "inputs.version reaches no step's env:");
  assert.ok(envValues.some((value) => value.includes("inputs.confirm")), "inputs.confirm reaches no step's env:");
});

test("the publish and rehearsal guards are exact complements, so an inverted guard reddens", () => {
  /* HRB-3. The previous assertion here was `assert.match(publish.if, /dry-run/)`,
     a substring match on the guard's TEXT, and the clean-room reviewer measured
     three separately inverted guards passing it exit 0, one of which published
     on every dispatch. A test that greps a condition is not a test of the
     condition.

     Exact string equality reddens on every one of those mutants, and asserting
     the two guards as COMPLEMENTS is what stops a rewrite that quietly makes
     both arms run or neither. */
  const document = releaseWorkflow();
  const steps = document.jobs["release"].steps;
  const publish = steps.find((step) => (step.run ?? "").includes("npm publish"));
  assert.ok(publish !== undefined, "the workflow has no npm publish step");
  assert.equal(String(publish.if), "${{ steps.decide.outputs.publish == 'yes' }}");

  const rehearsal = steps.find((step) => (step.name ?? "").startsWith("Rehearsal only"));
  assert.ok(rehearsal !== undefined, "the workflow has no rehearsal notice step");
  assert.equal(String(rehearsal.if), "${{ steps.decide.outputs.publish != 'yes' }}");

  /* THE PRE-PUBLISH VERIFICATION CARRIES NO GUARD AT ALL (HRB-5). A rehearsal
     that skips the one check which installs and runs the artifact is a
     rehearsal that cannot catch what it exists for. */
  const preflight = steps.find((step) => (step.name ?? "").startsWith("Install and RUN the packed artifact"));
  assert.ok(preflight !== undefined, "the workflow does not install and run the artifact before publishing");
  assert.equal(preflight.if, undefined, "the pre-publish verification is conditional; a rehearsal must run it too");

  /* AND IT COMES BEFORE THE PUBLISH. Order is the whole finding: the same step
     after the publish can only report the damage. */
  assert.ok(
    steps.indexOf(preflight) < steps.indexOf(publish),
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
  const decide = document.jobs["release"].steps.find((step) => step.id === "decide");
  assert.ok(decide !== undefined, "the workflow has no step with id `decide`");
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
