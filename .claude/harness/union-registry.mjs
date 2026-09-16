#!/usr/bin/env node
/**
 * Three-way UNION resolution for an append-only registry, from the git index.
 *
 * WHY. Binding convention 5: `test/behaviors.json`, `gates.manifest.json` and
 * `delivery/requirements/clause-map.json` are append-only and are resolved as a
 * UNION against the merge base; they never re-serialise phases. Measured
 * 2026-09-16: once two M4 phases have merged, EVERY remaining phase conflicts
 * on `test/behaviors.json` and on nothing else. Ten hand resolutions of a
 * 775-key object is ten chances to drop a row silently.
 *
 * WHAT MAKES THIS SAFE RATHER THAN CONVENIENT. A union is only correct while
 * both sides are genuinely APPENDING. Two things break that, and each is a hard
 * refusal here rather than a warning:
 *
 *   1. A key present at the merge base and ABSENT from either side. That is a
 *      REMOVAL, not an append, and silently restoring it from the base would
 *      hide a deliberate deletion; silently honouring it would drop a row the
 *      other side still needs. Neither is this script's call.
 *   2. A key whose value DIFFERS between the two sides, where at least one side
 *      also differs from the base. That is a genuine edit collision. A union
 *      would pick one arbitrarily.
 *
 * A key both sides added with the SAME value is not a conflict; that is two
 * phases registering the same behavior, and it resolves to that value.
 *
 * ORDER. Base order first, then each side's additions in that side's own order.
 * The file stays readable as a history of appends rather than being re-sorted,
 * which would make every future diff enormous.
 *
 * Usage:  node union-registry.mjs <path-inside-the-repo> [--repo <dir>]
 * Reads the three index stages git wrote for the conflict. Exits 0 and writes
 * the merged file; exits nonzero and explains, touching nothing, otherwise.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = process.argv[2];
const repoFlag = process.argv.indexOf("--repo");
const repo = repoFlag !== -1 ? process.argv[repoFlag + 1] : process.cwd();

if (path === undefined || path.startsWith("--")) {
  process.stderr.write("usage: node union-registry.mjs <path> [--repo <dir>]\n");
  process.exit(64);
}

function stage(n) {
  try {
    return execFileSync("git", ["-C", repo, "show", `:${n}:${path}`], { encoding: "utf8" });
  } catch {
    return null;
  }
}

const raw = { base: stage(1), ours: stage(2), theirs: stage(3) };
for (const [name, text] of Object.entries(raw)) {
  if (text === null) {
    process.stderr.write(
      `union-registry: no stage-${name === "base" ? 1 : name === "ours" ? 2 : 3} entry for ${path}. ` +
        `That means this path is not in a three-way conflict, so a union is not the right tool here.\n`,
    );
    process.exit(65);
  }
}

let parsed;
try {
  parsed = {
    base: JSON.parse(raw.base),
    ours: JSON.parse(raw.ours),
    theirs: JSON.parse(raw.theirs),
  };
} catch (error) {
  process.stderr.write(`union-registry: a stage of ${path} is not valid JSON: ${error.message}\n`);
  process.exit(66);
}

for (const [name, value] of Object.entries(parsed)) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    process.stderr.write(
      `union-registry: ${path} stage "${name}" is not a flat JSON object. This script handles the ` +
        `id-to-description shape only, and refuses rather than guessing at another one.\n`,
    );
    process.exit(67);
  }
}

const { base, ours, theirs } = parsed;

const removedByOurs = Object.keys(base).filter((k) => !Object.hasOwn(ours, k));
const removedByTheirs = Object.keys(base).filter((k) => !Object.hasOwn(theirs, k));
if (removedByOurs.length > 0 || removedByTheirs.length > 0) {
  process.stderr.write(
    `union-registry: REFUSING. ${path} is append-only, and a side has REMOVED keys present at the ` +
      `merge base. A union cannot represent a removal.\n` +
      (removedByOurs.length > 0 ? `  removed by ours (the branch):   ${removedByOurs.join(", ")}\n` : "") +
      (removedByTheirs.length > 0 ? `  removed by theirs (main):       ${removedByTheirs.join(", ")}\n` : ""),
  );
  process.exit(68);
}

// THIS LOOP USED TO IGNORE THE BASE, AND THE DOC COMMENT ABOVE IT DESCRIBED THE
// RULE IT DID NOT IMPLEMENT. Item 2 says "a key whose value DIFFERS between the
// two sides, WHERE AT LEAST ONE SIDE ALSO DIFFERS FROM THE BASE". The code read
// only `ours[key] !== theirs[key]`, which is a TWO-way comparison, and a
// two-way comparison cannot tell an edit collision from an ordinary one-sided
// edit. That is the shape this repository keeps paying for: a guard whose
// condition does not test the property it claims.
//
// It failed CLOSED, which is the safe direction and is why it went unnoticed,
// and it still cost a merge. Measured 2026-09-16 on claude/m4-p11: twelve
// behavior descriptions where `ours` equalled `base` exactly and `theirs`
// (main) carried M4-P10's later renames. Nothing collided; main had simply
// moved on. The union refused all twelve and named them as collisions to
// resolve by hand.
//
// The three-way rule, written out so the next reader can check the code against
// it rather than against a paraphrase:
//
//   ours === theirs                      -> agreed, no conflict
//   ours === base, theirs !== base       -> only THEIRS edited it; take theirs
//   theirs === base, ours !== base       -> only OURS edited it; take ours
//   both differ from base, and from each -> a real collision; REFUSE
//   absent from base, both added, differ -> a real add/add collision; REFUSE
//
// `resolved` carries the one-sided edits so the merge block below does not have
// to re-derive which side won.
const collisions = [];
const resolved = new Map();
for (const key of Object.keys(ours)) {
  if (!Object.hasOwn(theirs, key)) continue;
  if (ours[key] === theirs[key]) continue;
  const inBase = Object.hasOwn(base, key);
  const oursIsBase = inBase && ours[key] === base[key];
  const theirsIsBase = inBase && theirs[key] === base[key];
  if (oursIsBase && !theirsIsBase) { resolved.set(key, theirs[key]); continue; }
  if (theirsIsBase && !oursIsBase) { resolved.set(key, ours[key]); continue; }
  collisions.push({ key, ours: ours[key], theirs: theirs[key], base: base[key] });
}
if (resolved.size > 0) {
  process.stderr.write(
    `union-registry: ${resolved.size} key(s) changed on exactly ONE side since the merge base; ` +
      `taking that side. This is not a collision, and each is named rather than applied silently:\n` +
      [...resolved.keys()].map((k) => `  ${k}`).join("\n") + "\n",
  );
}
if (collisions.length > 0) {
  process.stderr.write(
    `union-registry: REFUSING. ${collisions.length} key(s) in ${path} carry DIFFERENT values on the ` +
      `two sides. That is an edit collision, not an append, and a union would pick one arbitrarily. ` +
      `Resolve these by hand:\n` +
      collisions
        .map(
          (c) =>
            `  ${c.key}\n    base:   ${c.base === undefined ? "(absent)" : JSON.stringify(c.base)}\n` +
            `    ours:   ${JSON.stringify(c.ours)}\n    theirs: ${JSON.stringify(c.theirs)}`,
        )
        .join("\n") +
      "\n",
  );
  process.exit(69);
}

const merged = {};
for (const key of Object.keys(base)) {
  merged[key] = resolved.has(key)
    ? resolved.get(key)
    : Object.hasOwn(ours, key) ? ours[key] : theirs[key];
}
let addedOurs = 0;
for (const key of Object.keys(ours)) {
  if (Object.hasOwn(merged, key)) continue;
  merged[key] = ours[key];
  addedOurs += 1;
}
let addedTheirs = 0;
for (const key of Object.keys(theirs)) {
  if (Object.hasOwn(merged, key)) continue;
  merged[key] = theirs[key];
  addedTheirs += 1;
}

writeFileSync(resolve(repo, path), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
process.stdout.write(
  `union-registry: ${path} resolved as a union. base ${Object.keys(base).length}, ` +
    `ours +${addedOurs}, theirs +${addedTheirs}, result ${Object.keys(merged).length}. ` +
    `Zero removals, zero value collisions, ${resolved.size} one-sided edit(s) taken from the side that made them.\n`,
);
