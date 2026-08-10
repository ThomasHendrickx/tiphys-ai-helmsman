import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [repo, recordsDir, out] = process.argv.slice(2);
const checks = await import(new URL("src/checks.ts", "file://" + repo + "/").href);
const validate = await import(new URL("src/validate.ts", "file://" + repo + "/").href);
const names = readdirSync(recordsDir).filter((n) => n.endsWith(".md")).sort();
const result = {};
for (const name of names) {
  const read = validate.readOperatorPath(join(recordsDir, name));
  if (!read.ok) { result[name] = { error: read.reason }; continue; }
  result[name] = [...checks.quotableUnits(read.body)];
}
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log("records=" + names.length + " total-units=" + Object.values(result).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0));
