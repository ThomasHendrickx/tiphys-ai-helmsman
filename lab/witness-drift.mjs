/* Every mutation member of every stored witness spec, with the occurrence
   count of its `find` string in the file it points at, at two commits.
   Usage: node witness-drift.mjs <repo> <baseRef> <headRef> */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const repo = process.argv[2];
const base = process.argv[3];
const head = process.argv[4];
const cache = new Map();
function at(ref, file) {
  const key = `${ref}:${file}`;
  if (!cache.has(key)) {
    try {
      cache.set(key, execFileSync("git", ["-C", repo, "show", `${ref}:${file}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
    } catch {
      cache.set(key, null);
    }
  }
  return cache.get(key);
}

const dir = join(repo, "witness");
const specs = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
let members = 0;
let mutation = 0;
const rows = [];
for (const name of specs) {
  const data = JSON.parse(readFileSync(join(dir, name), "utf8"));
  for (const [index, ds] of (data.dangerousStates ?? []).entries()) {
    members += 1;
    if (ds.kind !== "mutation") continue;
    mutation += 1;
    const b = at(base, ds.file);
    const h = at(head, ds.file);
    const bc = b === null ? "absent" : String(b.split(ds.find).length - 1);
    const hc = h === null ? "absent" : String(h.split(ds.find).length - 1);
    if (hc !== "1" || bc !== hc) {
      const label = hc === "0" ? "BROKEN-ZERO" : hc === "absent" ? "FILE-ABSENT" : `AMBIGUOUS-${hc}`;
      rows.push(`${label}\t${data.id}\tmember ${String(index)}\t${ds.file}\tbase=${bc} head=${hc}`);
    }
  }
}
console.log(`specs=${String(specs.length)} members=${String(members)} mutation-members=${String(mutation)}`);
console.log(`base=${base} head=${head}`);
console.log("--- every mutation member whose find-count at HEAD is not exactly 1, or whose count changed ---");
for (const r of rows) console.log(r);
console.log(`--- ${String(members)} rows total; non-mutation members: ${String(members - mutation)} ---`);
