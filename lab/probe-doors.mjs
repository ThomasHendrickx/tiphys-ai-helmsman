/* DERIVATION BY EXECUTION: one staged context per candidate shape.
   Two real decorrelated APPROVE verdicts, plus ONE third document that is a
   GENUINELY REFUSING review (verdict: FIX-ROUND-NEEDED) deformed in one way.
   The dangerous state is therefore present on disk in every row, and the
   question each row answers is whether the shipped gate says so.

   Usage: node probe-doors.mjs <repoRoot> */
import {
  mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, mkdtempSync, chmodSync, symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const repoRoot = process.argv[2];
const fixturesDir = join(repoRoot, "witness", "fixtures", "dual-review");

const REFUSING = [
  "kind: verdict",
  "phase: M3-P9",
  "head: dcbe6704813e861736c8d394dca35f7dc31b4f93",
  "verdict: FIX-ROUND-NEEDED",
  "produced-by: family-c",
  "framing: adversarial",
  "review-contract: hazard",
  "findings: []",
  "criteria: []",
  "deviations-judged: []",
  "",
].join("\n");

/** Replace the kind line. */
function withKind(kindLines) {
  return REFUSING.replace("kind: verdict", kindLines);
}

const ZWSP = "\u200B";

/* name, filename, body (or a staging function) */
const SHAPES = [
  ["prose review, .md extension", "third.md", REFUSING],
  ["unreadable file", "third.yaml", REFUSING, (p) => chmodSync(p, 0o000)],
  ["does not decode", "third.yaml", "kind: verdict\n  bad: [unclosed\n"],
  ["empty file", "third.yaml", ""],
  ["top-level list", "third.yaml", "- kind: verdict\n- verdict: FIX-ROUND-NEEDED\n"],
  ["top-level scalar", "third.yaml", "just a note\n"],
  ["kind absent", "third.yaml", REFUSING.replace("kind: verdict\n", "")],
  ["kind is a one-element list", "third.yaml", withKind("kind:\n  - verdict")],
  ["kind is a map", "third.yaml", withKind("kind:\n  name: verdict")],
  ["kind is null", "third.yaml", withKind("kind:")],
  ["kind is a number", "third.yaml", withKind("kind: 7")],
  ["kind is a boolean", "third.yaml", withKind("kind: true")],
  ["kind is an empty string", "third.yaml", withKind('kind: ""')],
  ["kind is whitespace only", "third.yaml", withKind('kind: "   "')],
  [`kind carries U+200B`, "third.yaml", withKind(`kind: ver${ZWSP}dict`)],
  ["kind differs only by case", "third.yaml", withKind("kind: Verdict")],
  ["kind is padded with spaces", "third.yaml", withKind('kind: "  verdict  "')],
  ["kind is a determinate other type", "third.yaml", withKind("kind: plan")],
  ["a directory named third.yaml", null, null, null, "directory"],
  ["a symlink to a real refusing verdict", null, null, null, "symlink"],
  ["phase absent", "third.yaml", REFUSING.replace("phase: M3-P9\n", "")],
  ["phase differs", "third.yaml", REFUSING.replace("phase: M3-P9", "phase: M9-P9")],
  ["head absent", "third.yaml", REFUSING.replace(/^head: .*$/m, "")],
  ["head differs", "third.yaml", REFUSING.replace(/^head: .*$/m, "head: " + "a".repeat(40))],
  ["undeformed refusing verdict (control)", "third.yaml", REFUSING],
];

function stage(shape) {
  const [, filename, body, mutate, special] = shape;
  const dir = mkdtempSync(join(tmpdir(), "doors-"));
  const review = join(dir, "delivery", "review");
  mkdirSync(review, { recursive: true });
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  writeFileSync(join(dir, "charter.yaml"), charter.replace(/^delivery-mode: .*$/m, "delivery-mode: full"));
  for (const fixture of ["decorrelated-criteria.yaml", "decorrelated-hazard.yaml"]) {
    copyFileSync(join(fixturesDir, fixture), join(review, fixture));
  }
  if (special === "directory") {
    mkdirSync(join(review, "third.yaml"));
  } else if (special === "symlink") {
    writeFileSync(join(dir, "elsewhere.yaml"), REFUSING);
    symlinkSync(join(dir, "elsewhere.yaml"), join(review, "third.yaml"));
  } else {
    const path = join(review, filename);
    writeFileSync(path, body);
    if (mutate) mutate(path);
  }
  return dir;
}

function firstLine(output) {
  const named = /third\.(yaml|md)/.test(output);
  const status = /^check-dual-review: (green|red|error|not-applicable) \(/m.exec(output);
  return { named, status: status ? status[1] : "(none)" };
}

const rows = [];
for (const shape of SHAPES) {
  const dir = stage(shape);
  const run = spawnSync(process.execPath, [join(repoRoot, "scripts", "check-dual-review.mjs"), dir], {
    cwd: repoRoot, encoding: "utf8",
  });
  const out = `${run.stdout}${run.stderr}`;
  const { named, status } = firstLine(out);
  const units = /\((\d+) review verdicts/.exec(out);
  rows.push([shape[0], status, units ? units[1] : "?", String(run.status), named ? "NAMED" : "SILENT"]);
  try { chmodSync(join(dir, "delivery", "review", "third.yaml"), 0o644); } catch {}
  rmSync(dir, { recursive: true, force: true });
}

const head = ["deformation of the third (refusing) document", "status", "units", "exit", "third document"];
const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (cells) => "| " + cells.map((c, i) => c.padEnd(width[i])).join(" | ") + " |";
console.log(line(head));
console.log("|" + width.map((w) => "-".repeat(w + 2)).join("|") + "|");
for (const row of rows) console.log(line(row));
const silent = rows.filter((r) => r[4] === "SILENT" && r[1] === "green").length;
console.log(`\n--- rows: ${String(rows.length)}; rows where the refusing document is SILENT and the gate is GREEN: ${String(silent)} ---`);
