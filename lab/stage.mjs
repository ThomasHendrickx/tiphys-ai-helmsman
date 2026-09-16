/* Stage a dual-review context: two real APPROVE verdicts plus one third
   document supplied on the command line, then run the shipped script. */
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const repoRoot = process.argv[2];
const thirdName = process.argv[3];
const thirdBody = readFileSync(process.argv[4], "utf8");
const fixturesDir = join(repoRoot, "witness", "fixtures", "dual-review");

const dir = mkdtempSync(join(tmpdir(), "nf1-"));
mkdirSync(join(dir, "delivery", "review"), { recursive: true });
copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
writeFileSync(join(dir, "charter.yaml"), charter.replace(/^delivery-mode: .*$/m, "delivery-mode: full"));
for (const fixture of ["decorrelated-criteria.yaml", "decorrelated-hazard.yaml"]) {
  copyFileSync(join(fixturesDir, fixture), join(dir, "delivery", "review", fixture));
}
writeFileSync(join(dir, "delivery", "review", thirdName), thirdBody);

const run = spawnSync(process.execPath, [join(repoRoot, "scripts", "check-dual-review.mjs"), dir], {
  cwd: repoRoot, encoding: "utf8",
});
process.stdout.write(`${run.stdout}${run.stderr}`);
process.stdout.write(`exit=${String(run.status)}\n`);
rmSync(dir, { recursive: true, force: true });
