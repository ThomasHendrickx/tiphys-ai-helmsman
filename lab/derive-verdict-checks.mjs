/* DERIVATION: which checks registered for artifact type `verdict` assemble a
   SET of sibling documents out of delivery/review, and therefore could carry
   the same silent-exclusion mechanism.

   Transitive, not a single-level grep: it builds a call graph over the
   top-level function and const-arrow names in src/checks.ts and walks it from
   each check's `run` body, so a check that reaches the loader through a helper
   is still reported.

   Usage: node derive-verdict-checks.mjs <repoRoot> */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const text = readFileSync(join(process.argv[2], "src", "checks.ts"), "utf8");
const lines = text.split("\n");

/* every top-level declaration and its [start,end) line range */
const decls = [];
for (let i = 0; i < lines.length; i += 1) {
  const m =
    /^(?:export )?(?:async )?function ([A-Za-z0-9_]+)\s*[(<]/.exec(lines[i]) ??
    /^(?:export )?const ([A-Za-z0-9_]+)(?::[^=]*)?= (?:\(|async|function)/.exec(lines[i]) ??
    /^export const ([A-Za-z0-9_]+): DerivedCheck = \{/.exec(lines[i]);
  if (!m) continue;
  decls.push({ name: m[1], start: i });
}
for (let i = 0; i < decls.length; i += 1) {
  decls[i].end = i + 1 < decls.length ? decls[i + 1].start : lines.length;
  decls[i].body = lines.slice(decls[i].start, decls[i].end).join("\n");
}
const byName = new Map(decls.map((d) => [d.name, d]));

const SET_ASSEMBLERS = /loadCommittedVerdicts|readdirSync|REVIEW_DIRECTORY|headGroupFor/;

function reaches(name, seen = new Set()) {
  if (seen.has(name)) return false;
  seen.add(name);
  const d = byName.get(name);
  if (!d) return false;
  if (SET_ASSEMBLERS.test(d.body)) return true;
  for (const other of byName.keys()) {
    if (other === name) continue;
    if (new RegExp(`\\b${other}\\s*\\(`).test(d.body) && reaches(other, seen)) return true;
  }
  return false;
}

const checks = decls.filter((d) => /\n?\s*type: "verdict",/.test(d.body) && /\bid: "/.test(d.body));
console.log(`checks registered for type "verdict": ${String(checks.length)}`);
for (const c of checks) {
  const id = /id: "([^"]+)"/.exec(c.body)[1];
  const hit = SET_ASSEMBLERS.test(c.body) ? "DIRECTLY" : reaches(c.name) ? "TRANSITIVELY" : "NO";
  console.log(`  ${id.padEnd(34)} line ${String(c.start + 1).padEnd(6)} assembles a sibling set: ${hit}`);
}
