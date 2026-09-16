/* DERIVATION: every route by which a file under <context>/delivery/review/
   fails to reach the decorrelation comparison.
   Usage: node derive-doors.mjs <repoRoot>

   Two kinds of door are printed separately because they are different facts:

     ENUMERATION  a `return` that ends the whole listing (the directory itself
                  is absent, or could not be opened). These always carry a
                  reason to the caller.
     CANDIDATE    a `continue;` inside the per-file loop, which drops ONE file.
                  This is the kind the finding is about.

   A CANDIDATE door is NAMED when the block that encloses the `continue;`
   pushes a diagnostic onto one of the arrays the callers seed their violations
   with, and SILENT otherwise. The enclosing block is found by walking
   BACKWARDS with a brace counter, not by a fixed lookback window, so a push
   belonging to a previous sibling block is not miscredited. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = process.argv[2];

const REGIONS = [
  ["src/checks.ts", "loadCommittedVerdicts", "function loadCommittedVerdicts("],
  ["src/checks.ts", "headGroupFor", "function headGroupFor("],
  ["scripts/check-dual-review.mjs", "committedVerdictPaths", "export function committedVerdictPaths("],
];

const DIAGNOSTIC = /(unexaminable|unkeyed)\.push\(/;

/* strip strings and line comments so braces inside them are not counted */
function bare(line) {
  return line
    .replace(/`[^`]*`/g, "``")
    .replace(/"(\\.|[^"\\])*"/g, '""')
    .replace(/'(\\.|[^'\\])*'/g, "''")
    .replace(/\/\/.*$/, "")
    .replace(/\/\*.*?\*\//g, "");
}

let enumeration = 0;
let candidate = 0;
let silent = 0;

for (const [file, name, opener] of REGIONS) {
  const lines = readFileSync(join(repo, file), "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes(opener));
  if (start < 0) throw new Error(`opener not found: ${opener}`);
  let end = start + 1;
  while (end < lines.length && lines[end] !== "}") end += 1;
  console.log(`\n=== ${file} :: ${name}  (lines ${String(start + 1)}-${String(end + 1)}) ===`);
  for (let i = start; i <= end; i += 1) {
    const text = bare(lines[i]);
    if (/(^|\s)continue;\s*$/.test(text)) {
      /* walk back to the `{` that opens the block holding this continue */
      let depth = 0;
      let open = i;
      for (let j = i - 1; j >= start; j -= 1) {
        const b = bare(lines[j]);
        depth += (b.match(/\}/g) ?? []).length;
        depth -= (b.match(/\{/g) ?? []).length;
        if (depth < 0) { open = j; break; }
      }
      const block = lines.slice(open, i + 1).join("\n");
      const named = DIAGNOSTIC.test(block);
      candidate += 1;
      if (!named) silent += 1;
      console.log(`${String(i + 1).padStart(5)}  CANDIDATE  ${named ? "NAMED " : "SILENT"}  opened at ${String(open + 1)}: ${lines[open].trim()}`);
      continue;
    }
    if (/^\s*return\s/.test(text) && /ok:\s*false|ok:\s*true/.test(text + lines.slice(i, i + 4).join("\n"))) {
      /* the final success return is not a door */
      if (/verdicts,\s*unexaminable|paths,\s*unexaminable/.test(lines.slice(i, i + 2).join(" "))) continue;
      enumeration += 1;
      console.log(`${String(i + 1).padStart(5)}  ENUMERATION  reason carried  ${lines[i].trim().slice(0, 78)}`);
    }
    if (/^\s*return\s*\{\s*members/.test(text)) continue;
  }
}
console.log(`\n--- enumeration doors: ${String(enumeration)}; candidate doors: ${String(candidate)}; SILENT candidate doors: ${String(silent)} ---`);
