/**
 * THE DETERMINISTIC LICENSE GATE (kernel plan M3, M3-P10 step 2; EXT-F-09,
 * DR-0013 clause 5, plan v1 D-1's license note).
 *
 * EXT-F-09 names five checks and this script is all five, in one command with
 * one exit code (delivery/plan/kernel-plan-v1.md:360):
 *
 *   1. INVENTORY the production dependencies, and not the declared ones. The
 *      distinction is the whole point and it is the hazard the plan names:
 *      "a license gate that inventories `dependencies` while the TRANSITIVE
 *      production set is what actually ships"
 *      (delivery/plan/kernel-plan-m3.md:4819). `package.json` declares three
 *      names; ten packages ship. So the walk is transitive, from each declared
 *      dependency through its own `dependencies` in `node_modules`, which is
 *      the same traversal `npm run build:runtime-deps` uses to decide what to
 *      vendor and is therefore the set that actually reaches a consumer.
 *   2. LICENSE METADATA IS PRESENT on every inventoried package.
 *   3. EVERY LICENSE IS ON A DECLARED ALLOWLIST. Unknown is refused the same
 *      as prohibited, because a license nobody has classified is not a license
 *      anybody has cleared.
 *   4. `THIRD-PARTY-NOTICES` EXISTS WHENEVER COPIED THIRD-PARTY CODE IS
 *      DECLARED. D-1's license note is what makes this a DECLARATION-driven
 *      check rather than a scan: firstmate is MIT and compatible one-way into
 *      Apache-2.0, and a notice entry is required only if code is literally
 *      copied, which protocol reimplementation is not
 *      (delivery/plan/kernel-plan-v1.md:376).
 *   5. `LICENSE` AND ANY REQUIRED NOTICES ARE IN THE `npm pack` OUTPUT. A
 *      repository that has a LICENSE file and a package that ships one are two
 *      different facts, and check 5 is about the second.
 *
 * WHY THE DECLARATION LIVES IN `package.json` AND ABSENCE IS FAIL-CLOSED.
 * Checks 3 and 4 both consume a declaration: an allowlist and a list of copied
 * third-party code. The obvious shape is a separate file that the gate reads
 * IF PRESENT, and that shape is a vacuous pass by construction: delete the
 * file and the gate goes green over a tree it has classified nothing in. This
 * project has paid for that shape repeatedly (CLAUDE.md's "a guard whose
 * condition does not test the property that matters is green and worthless").
 * So the declaration is `tiphys.licenseAllowlist` and `tiphys.thirdPartyCode`
 * in the root `package.json`, an ABSENT declaration is a finding rather than
 * an empty one, and an EMPTY `thirdPartyCode` is a positive statement that no
 * code was copied rather than the absence of a statement.
 *
 * THE INVENTORY IS ALSO AN OUTPUT, not only an input to the other checks
 * (criterion 1b). `--inventory` prints it as JSON, and
 * `test/license-gate.test.ts` compares that set against the one M3-P1's work
 * history recorded at the moment the pins were taken
 * (delivery/work-history/m3-p1.md:479). DR-0013 clause 5 makes that recorded
 * set a REQUIRED INPUT here, and the plan says a difference is a FINDING and
 * not a routine update, because a silently grown production tree between M3-P1
 * and M3-P10 is exactly the supply-chain surface DR-0013 marked the decision
 * costly for (delivery/plan/kernel-plan-m3.md:4862).
 *
 * IT IS A GATE SUBPROCESS UNDER M2-P1's CONTRACT (D-M3-34, section 2.2a), so
 * it emits a `GateResult` on `--result` and its exit code is the status, the
 * same as `scripts/check-agents-references.mjs`. It is declared in
 * `gate-registry.yaml` as `license`; what EXECUTES it in CI is a step in
 * `.github/workflows/gates.yml`, because `scripts/m2-exit-test.sh` invokes the
 * runner with `--manifest gates.manifest.json` and that file is on no M3
 * phase's declaration. `test/gate-registry.test.ts` records the divergence.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

/* The computed-URL dynamic import pattern of standing warning 4: a literal
   relative path into `src` fails the build with TS2878 across the project
   reference. */
const resultModule = await import(
  pathToFileURL(join(repoRoot, "src/gates/result.ts")).href
);
const taskModule = await import(
  pathToFileURL(join(repoRoot, "src/task.ts")).href
);

const { makeGateResult, renderGateResult, exitCodeForStatus } = resultModule;
const { refuseOpenForWrite } = taskModule;

const GATE_ID = "license";
const UNIT_LABEL = "production packages licensed";
const EXIT_GATE_ERROR = 21;

const USAGE = `usage: node scripts/license-gate.mjs [--root <dir>] [--inventory]
                                     [--pack-listing <file>] [--result <file>]
                                     [--evidence <dir>]`;

function parseArguments(argv) {
  const options = {
    root: process.cwd(),
    inventory: false,
    packListing: undefined,
    result: undefined,
    evidence: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new Error(`${argument} needs a value\n${USAGE}`);
      }
      index += 1;
      return next;
    };
    switch (argument) {
      case "--root":
        options.root = resolve(value());
        break;
      case "--inventory":
        options.inventory = true;
        break;
      case "--pack-listing":
        options.packListing = resolve(value());
        break;
      case "--result":
        options.result = resolve(value());
        break;
      case "--evidence":
        options.evidence = resolve(value());
        break;
      default:
        throw new Error(`unrecognised argument ${argument}\n${USAGE}`);
    }
  }
  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * THE TRANSITIVE PRODUCTION SET, READ OUT OF THE TREE npm ACTUALLY BUILT.
 *
 * ROUND 1 REWROTE THIS FUNCTION AND THE REASON IS THE WHOLE POINT OF THE
 * CHANGE. The first version MODELLED the tree: it read the root manifest's
 * `dependencies` and recursed through each package's own `dependencies`,
 * resolving every name against the ROOT `node_modules` with a visited set keyed
 * on NAME. The installer does not build trees that way, so two ordinary npm
 * outcomes were invisible to it and both were measured going green over a
 * genuinely unlicensed package (clean-room finding HRB-1):
 *
 *   - an OPTIONAL dependency, which `npm install` and `npm ci --omit=dev` both
 *     install and which the manifest walk never followed; and
 *   - a package NESTED because of a version conflict, at
 *     `node_modules/<parent>/node_modules/<name>`, which the name-keyed visited
 *     set skipped because the HOISTED copy of the same name had already been
 *     seen. A GPL-3.0-only package physically installed, reported green.
 *
 * The mechanism was not "optional dependencies are skipped". It was that the
 * gate answered a question ABOUT A MODEL and reported the answer as though it
 * were about the tree. So it now READS, from two sources that are each
 * authoritative for a different half, and it cross-checks them against each
 * other rather than trusting either alone:
 *
 *   1. `node_modules/.package-lock.json`, which npm WRITES when it installs and
 *      which lists EVERY installed package by PATH, with `dev` and `optional`
 *      flags. Keying on path is what makes nesting visible, because
 *      `node_modules/parentb/node_modules/nested` is a different key from
 *      `node_modules/nested`. This gives the SET and the dev/production
 *      classification, which is not derivable from the filesystem.
 *   2. Each package's own `package.json` ON DISK, which gives the LICENSE. The
 *      lock file carries a `license` field too and it is deliberately NOT used:
 *      it is registry metadata, and the file that actually ships to a consumer
 *      is the one on disk. Where the two disagree the disk is right.
 *
 * BOTH DIRECTIONS OF THE CROSS-CHECK ARE FINDINGS, because a stale lock is
 * exactly the state where one source alone lies:
 *
 *   - a path in the lock that is not on disk (the lock over-reports), and
 *   - a package directory on disk that the lock does not list (the lock
 *     under-reports, which is the direction that hides a package).
 *
 * ABSENCE OF THE LOCK IS A FINDING, NOT AN EMPTY INVENTORY. Falling back to the
 * old walk when the lock is missing would have reinstated the defect on exactly
 * the path where it matters, so there is no fallback: run `npm ci` or
 * `npm install` first, and the gate says so.
 *
 * OPTIONAL PRODUCTION DEPENDENCIES ARE INCLUDED, deliberately. They are
 * installed and they ship, so a licence gate that excluded them would be
 * excluding packages a consumer receives. Only `dev: true` is excluded.
 */
function inventory(root) {
  const modules = join(root, "node_modules");
  const lockPath = join(modules, ".package-lock.json");
  if (!existsSync(lockPath)) {
    return { lockMissing: lockPath, packages: [], unresolved: [], untracked: [] };
  }
  const lock = readJson(lockPath);
  const packages = [];
  const unresolved = [];
  const lockPaths = new Set();

  for (const [entryPath, entry] of Object.entries(lock.packages ?? {})) {
    if (entryPath === "" || !entryPath.startsWith("node_modules/")) {
      continue;
    }
    /* `dev: true` is npm's own classification and is the one thing the
       filesystem cannot tell us. Everything else ships, optional included. */
    if (entry?.dev === true) {
      continue;
    }
    lockPaths.add(entryPath);
    /* The name is the segment after the LAST `node_modules/`, which is what
       makes a nested copy carry its real name rather than its parent's. */
    const name = entryPath.slice(entryPath.lastIndexOf("node_modules/") + "node_modules/".length);
    const manifestPath = join(root, entryPath, "package.json");
    if (!existsSync(manifestPath)) {
      unresolved.push({ name, path: entryPath, reason: "listed in node_modules/.package-lock.json and absent from disk" });
      continue;
    }
    const meta = readJson(manifestPath);
    /* `licenses` (plural, an array) is the retired pre-SPDX form. It is read
       so that a package still using it is CLASSIFIED rather than reported as
       having no metadata at all, which would be a true-but-useless finding. */
    const declared =
      typeof meta.license === "string"
        ? meta.license
        : Array.isArray(meta.licenses)
          ? meta.licenses
              .map((item) => (typeof item === "string" ? item : item?.type))
              .filter((item) => typeof item === "string")
              .join(" OR ")
          : undefined;
    packages.push({
      name,
      path: entryPath,
      version: typeof meta.version === "string" ? meta.version : undefined,
      license: declared === "" ? undefined : declared,
      optional: entry?.optional === true,
    });
  }

  /* THE OTHER DIRECTION: every package directory on disk that the lock does not
     list. This is the one that hides a package, so it is not left to the lock's
     honesty. The walk descends through nested `node_modules` and skips the
     dot-directories npm keeps there. */
  const untracked = [];
  const walkDisk = (directory, prefix) => {
    if (!existsSync(directory)) {
      return;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const here = join(directory, entry.name);
      if (entry.name.startsWith("@")) {
        walkDisk(here, `${prefix}${entry.name}/`);
        continue;
      }
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      const packagePath = `${prefix}${entry.name}`;
      if (existsSync(join(here, "package.json")) && !lockPaths.has(packagePath)) {
        /* A dev dependency is legitimately on disk and legitimately absent from
           the production set, so `untracked` means absent from the lock
           ENTIRELY, in either classification. */
        if (lock.packages?.[packagePath] === undefined) {
          untracked.push({ name: entry.name, path: packagePath });
        }
      }
      walkDisk(join(here, "node_modules"), `${packagePath}/node_modules/`);
    }
  };
  walkDisk(modules, "node_modules/");

  const byPath = (a, b) => a.path.localeCompare(b.path);
  return {
    lockMissing: undefined,
    packages: packages.sort(byPath),
    unresolved: unresolved.sort(byPath),
    untracked: untracked.sort(byPath),
  };
}

/**
 * The pack listing, as repository-relative paths.
 *
 * The `package/` strip is a COMPATIBILITY strip and not a description of what
 * this npm emits: measured on npm 11.18.0 (witness/captures/npm-pack-dry-run-json.txt)
 * the `--json` paths are already bare, so the replace is a no-op here and is
 * kept for the older npm that did prefix them. `--ignore-scripts` is LOAD-BEARING, not tidiness: this gate is
 * wired into `prepublishOnly`, so a pack that ran lifecycle scripts would run
 * `prepack` (a full `tsc -b`) from inside the gate that publish already
 * called, once per invocation.
 */
function packListing(options) {
  if (options.packListing !== undefined) {
    return {
      ok: true,
      files: readFileSync(options.packListing, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
      source: options.packListing,
    };
  }
  const child = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: options.root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (child.status !== 0) {
    return {
      ok: false,
      reason: `npm pack --dry-run exited ${String(child.status)}: ${String(child.stderr ?? "").trim().replace(/\s+/g, " ").slice(0, 400)}`,
      source: "npm pack --dry-run --json --ignore-scripts",
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(child.stdout);
  } catch (error) {
    return {
      ok: false,
      reason: `npm pack --dry-run did not print JSON: ${String(error?.message ?? error)}`,
      source: "npm pack --dry-run --json --ignore-scripts",
    };
  }
  const files = (parsed?.[0]?.files ?? []).map((entry) =>
    String(entry.path).replace(/^package\//, ""),
  );
  return { ok: true, files, source: "npm pack --dry-run --json --ignore-scripts" };
}

function writeEvidence(options, lines) {
  if (options.evidence === undefined) {
    return undefined;
  }
  mkdirSync(options.evidence, { recursive: true });
  const path = join(options.evidence, `${GATE_ID}.txt`);
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

function emit(options, fields) {
  const result = makeGateResult({
    gate: GATE_ID,
    status: fields.status,
    units: fields.units,
    unitLabel: UNIT_LABEL,
    startedAt: fields.startedAt,
    endedAt: new Date().toISOString(),
    detail: fields.detail,
    evidence: writeEvidence(options, fields.evidenceLines ?? [fields.detail]),
  });
  process.stdout.write(
    `${GATE_ID}: ${result.status} (${String(result.units)} ${result.unitLabel})\n`,
  );
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  if (options.result !== undefined) {
    const refusal = refuseOpenForWrite(options.result);
    if (refusal !== undefined) {
      process.stderr.write(`tiphys ${GATE_ID}: ${refusal}\n`);
      return EXIT_GATE_ERROR;
    }
    writeFileSync(options.result, renderGateResult(result));
  }
  return exitCodeForStatus(result.status);
}

export function main(argv) {
  const startedAt = new Date().toISOString();
  const options = parseArguments(argv);

  const manifestPath = join(options.root, "package.json");
  if (!existsSync(manifestPath)) {
    process.stderr.write(`tiphys ${GATE_ID}: no package.json under ${options.root}\n`);
    return EXIT_GATE_ERROR;
  }
  const manifest = readJson(manifestPath);
  const taken = inventory(options.root);

  if (options.inventory) {
    process.stdout.write(`${JSON.stringify(taken, null, 2)}\n`);
    return 0;
  }

  const findings = [];
  const declaration = manifest.tiphys ?? {};

  /* CHECK 1: the inventory is a READ of the installed tree, and both directions
     of the lock-versus-disk cross-check are findings. */
  if (taken.lockMissing !== undefined) {
    findings.push(
      `LICENSE-INVENTORY ${taken.lockMissing} does not exist, so npm has not recorded what it installed and the production set cannot be READ; run npm ci or npm install before this gate. There is deliberately no fallback to walking the manifest: that walk is what missed an optional dependency and a version-conflict nesting`,
    );
  }
  for (const entry of taken.unresolved) {
    findings.push(
      `LICENSE-INVENTORY ${entry.name} at ${entry.path} ${entry.reason}, so its license could not be read`,
    );
  }
  for (const entry of taken.untracked) {
    findings.push(
      `LICENSE-INVENTORY ${entry.path} holds a package.json and appears nowhere in node_modules/.package-lock.json, so npm did not install it and nothing classifies it; the lock is stale or the tree was edited by hand`,
    );
  }

  /* CHECK 2: license metadata is present. */
  for (const entry of taken.packages) {
    if (entry.license === undefined) {
      findings.push(
        `LICENSE-METADATA ${entry.name}@${entry.version ?? "?"} at ${entry.path} declares no license field`,
      );
    }
  }

  /* CHECK 3: every license is on the declared allowlist, and the allowlist
     itself must be declared. Absent is a finding, never an empty allowlist
     that passes everything or an empty one that passes nothing quietly. */
  const allowlist = declaration.licenseAllowlist;
  if (!Array.isArray(allowlist)) {
    findings.push(
      "LICENSE-ALLOWLIST package.json declares no tiphys.licenseAllowlist array, so no license can be classified; an absent allowlist is a finding and not an empty one",
    );
  } else {
    const allowed = new Set(allowlist.map((entry) => String(entry)));
    for (const entry of taken.packages) {
      if (entry.license === undefined) {
        continue;
      }
      if (!allowed.has(entry.license)) {
        findings.push(
          `LICENSE-ALLOWLIST ${entry.name}@${entry.version ?? "?"} at ${entry.path} declares ${entry.license}, which is not on tiphys.licenseAllowlist`,
        );
      }
    }
  }

  /* CHECK 4: THIRD-PARTY-NOTICES whenever copied third-party code is declared
     (D-1's license note: protocol reimplementation carries no notice
     obligation, so the DECLARATION drives this and not a scan). */
  const copied = declaration.thirdPartyCode;
  const noticesPath = join(options.root, "THIRD-PARTY-NOTICES");
  let noticesRequired = false;
  if (!Array.isArray(copied)) {
    findings.push(
      "LICENSE-NOTICES package.json declares no tiphys.thirdPartyCode array; an empty array is the positive statement that no third-party code was copied, and its absence is not that statement",
    );
  } else if (copied.length > 0) {
    noticesRequired = true;
    if (!existsSync(noticesPath)) {
      findings.push(
        `LICENSE-NOTICES ${String(copied.length)} copied third-party component(s) are declared (${copied.map((entry) => String(entry?.name ?? entry)).join(", ")}) and THIRD-PARTY-NOTICES does not exist`,
      );
    } else {
      const notices = readFileSync(noticesPath, "utf8");
      for (const entry of copied) {
        const name = String(entry?.name ?? entry);
        if (!notices.includes(name)) {
          findings.push(
            `LICENSE-NOTICES THIRD-PARTY-NOTICES does not name the declared copied component ${name}`,
          );
        }
      }
    }
  }

  /* CHECK 5: LICENSE and any required notices are in the pack output. */
  const listing = packListing(options);
  const packLines = [];
  if (!listing.ok) {
    findings.push(`LICENSE-PACK ${listing.reason}`);
  } else {
    /* THE BUILD STATE BESIDE THE COUNT (HRB-10). `npm pack --dry-run` lists what
       is ON DISK, and `--ignore-scripts` suppresses the `prepack` rebuild, so
       this listing describes whatever `dist/` happened to be. Measured: 181
       entries with dist built, 60 without. A pack number quoted without its
       build state is the standing-warning-12 harm one artifact along, so the
       gate prints the state it observed rather than leaving a reader to assume
       the built one. */
    const built = listing.files.some((path) => path.startsWith("dist/"));
    packLines.push(
      `pack source: ${listing.source}`,
      `pack entries: ${String(listing.files.length)}`,
      `pack build state: dist/ ${built ? "present" : "ABSENT, so this listing carries no executable code"}`,
    );
    const packed = new Set(listing.files);
    if (!packed.has("LICENSE")) {
      findings.push(
        "LICENSE-PACK the npm pack listing carries no LICENSE entry, so the published package would ship without its license text",
      );
    }
    if (noticesRequired && !packed.has("THIRD-PARTY-NOTICES")) {
      findings.push(
        "LICENSE-PACK copied third-party code is declared and the npm pack listing carries no THIRD-PARTY-NOTICES entry",
      );
    }
  }

  const evidenceLines = [
    `root: ${options.root}`,
    `package: ${String(manifest.name)}@${String(manifest.version)}`,
    `production packages: ${String(taken.packages.length)}`,
    ...taken.packages.map(
      (entry) =>
        `  ${entry.name}@${entry.version ?? "?"} ${entry.license ?? "<no license field>"}` +
        ` at ${entry.path}${entry.optional ? " (optional, installed and shipped)" : ""}`,
    ),
    `allowlist: ${Array.isArray(allowlist) ? allowlist.join(", ") : "<not declared>"}`,
    `copied third-party components declared: ${Array.isArray(copied) ? String(copied.length) : "<not declared>"}`,
    ...packLines,
    ...findings,
  ];

  if (findings.length > 0) {
    return emit(options, {
      status: "red",
      units: taken.packages.length,
      startedAt,
      detail: `${String(findings.length)} license finding(s):\n${findings.join("\n")}`,
      evidenceLines,
    });
  }

  return emit(options, {
    status: "green",
    units: taken.packages.length,
    startedAt,
    detail: `${String(taken.packages.length)} production package(s) inventoried, all with license metadata on the declared allowlist; LICENSE present in the pack listing`,
    evidenceLines,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys ${GATE_ID}: ${String(error?.message ?? error).replace(/\s+/g, " ")}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}
