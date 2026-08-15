/* E1.9: the M2-P6 coverage checker run in finding-to-outcome parity mode over
   the final report. The checker has no CLI flag reaching that mode (M3-P4
   recorded the same), so its exported function is invoked here and this
   process's exit code IS the parity result. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [repo, reportPath] = process.argv.slice(2);
const { checkFindingOutcomeParity } = await import(
  new URL("src/gates/coverage.ts", pathToFileURL(repo + "/")).href
);
const { decodeDocument } = await import(
  new URL("src/validate.ts", pathToFileURL(repo + "/")).href
);
const decoded = decodeDocument(readFileSync(reportPath, "utf8"), reportPath);
if (!decoded.ok) { console.error(decoded.reason); process.exit(2); }
const doc = decoded.value;
const result = checkFindingOutcomeParity(doc["inputs"], doc["input-findings"]);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
