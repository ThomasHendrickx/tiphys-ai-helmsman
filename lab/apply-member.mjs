/* Apply ONE mutation member of a stored witness spec to a COPY of the tree, so
   the defang can be re-run by hand rather than only through the red-witness
   gate. This is the script section 13.9 of delivery/work-history/m4-p10.md used
   under the name `apply-member-0.mjs`; that copy was not recovered, and this is
   a re-runnable equivalent written for the correction round.

   It prints the find-count of EVERY mutation member first, because a member
   whose count is not exactly 1 is ambiguous and applying it is meaningless.

   Usage: node lab/apply-member.mjs <repoRoot> <witnessId> <memberIndex> <destDir>
   Then:  cd <destDir> && node --test ... to see the guarded test redden. */
import { readFileSync, writeFileSync, cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const [repo, id, indexText, dest] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(join(repo, "witness", `${id}.json`), "utf8"));
const members = spec.dangerousStates ?? [];

for (const [index, member] of members.entries()) {
  if (member.kind !== "mutation") {
    console.log(`member ${String(index)}: kind ${member.kind}, not a mutation`);
    continue;
  }
  const body = readFileSync(join(repo, member.file), "utf8");
  const count = body.split(member.find).length - 1;
  console.log(`member ${String(index)}: find occurs ${String(count)} time(s) in ${member.file}`);
}

const wanted = Number(indexText);
const member = members[wanted];
if (member === undefined || member.kind !== "mutation") {
  throw new Error(`member ${indexText} is not a mutation member of ${id}`);
}

/* EVERY TRACKED FILE, from git, never a hand-written directory list. This
   repository has recorded what a hand-listed staging set costs: a test helper
   listed the four directories it staged and missed a file at the repository
   root, and no grep could see the gap (CLAUDE.md's append-only-registry
   entry). Asking git removes the judgment. */
mkdirSync(dest, { recursive: true });
const tracked = execFileSync("git", ["-C", repo, "ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\n")
  .filter((line) => line !== "");
for (const relative of tracked) {
  mkdirSync(dirname(join(dest, relative)), { recursive: true });
  cpSync(join(repo, relative), join(dest, relative));
}
console.log(`staged ${String(tracked.length)} tracked file(s) into ${dest}`);
const target = join(dest, member.file);
const body = readFileSync(target, "utf8");
const count = body.split(member.find).length - 1;
if (count !== 1) {
  throw new Error(`member ${indexText} of ${id} matches ${String(count)} times in the copy, so applying it is ambiguous`);
}
writeFileSync(target, body.replace(member.find, member.replace));
console.log(`member ${indexText} applied to ${target}`);
