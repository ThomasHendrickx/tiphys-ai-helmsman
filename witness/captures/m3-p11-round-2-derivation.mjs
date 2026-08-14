// M3-P11 fix round 2 derivation. For every real command declared in this
// repository (gates.manifest.json and gate-registry.yaml, mode full), print
// the OLD path-candidate set (round 1: every element containing "/") and the
// NEW one (round 2), and mark every candidate that this process cannot open.
// A candidate that cannot be opened is what turns a nonzero exit into `error`.
import { readFileSync } from "node:fs";
import { accessSync, statSync, constants } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const repo = process.argv[2];
const runUrl = new URL("file://" + repo + "/src/gates/run.ts");
const { commandPathCandidates, commandPathOperands, attributionGaps, probeCommandRunnable } =
  await import(runUrl.href);

const oldCandidates = (command) => [
  ...new Set(command.filter((element) => element.includes("/"))),
];

function openable(element) {
  const absolute = isAbsolute(element) ? element : resolve(repo, element);
  try {
    const stat = statSync(absolute);
    if (!stat.isFile()) return `NOT-A-REGULAR-FILE(${absolute})`;
    accessSync(absolute, constants.R_OK);
    return null;
  } catch (error) {
    return `CANNOT-OPEN(${absolute}: ${String(error.code ?? error)})`;
  }
}

const commands = [];
const manifest = JSON.parse(readFileSync(repo + "/gates.manifest.json", "utf8"));
for (const gate of manifest.gates) {
  commands.push([`manifest ${gate.id} command`, gate.command]);
  if (gate.precondition?.command) {
    commands.push([`manifest ${gate.id} precondition`, gate.precondition.command]);
  }
}

// gate-registry.yaml is scanned textually for `command:` / `command: [..]`
// rows rather than parsed, so this derivation does not depend on the loader
// it is meant to be independent of.
const registry = readFileSync(repo + "/gate-registry.yaml", "utf8");
let currentId = "?";
for (const line of registry.split("\n")) {
  const idMatch = /^\s*-?\s*id:\s*(\S+)/.exec(line);
  if (idMatch) currentId = idMatch[1];
  const cmdMatch = /^\s*command:\s*\[(.*)\]\s*$/.exec(line);
  if (cmdMatch) {
    const parts = [];
    let rest = cmdMatch[1];
    const re = /"([^"]*)"|'([^']*)'|([^,]+)/g;
    let m;
    while ((m = re.exec(rest)) !== null) {
      const value = (m[1] ?? m[2] ?? m[3]).trim();
      if (value !== "") parts.push(value);
    }
    commands.push([`registry ${currentId}`, parts]);
  }
}

let total = 0;
let oldGaps = 0;
let newGaps = 0;
let differing = 0;
for (const [label, command] of commands) {
  total += 1;
  const before = oldCandidates(command);
  const after = commandPathCandidates(command);
  // `beforeBad` re-implements round 1's probe (regular file, readable);
  // `afterBad` calls the SHIPPED round-2 function, so the new column is a
  // measurement of the code rather than of a paraphrase of it.
  const beforeBad = before.map(openable).filter((r) => r !== null);
  const afterBad = attributionGaps(command, repo);
  oldGaps += beforeBad.length;
  newGaps += afterBad.length;
  const same =
    JSON.stringify(before) === JSON.stringify(after) &&
    beforeBad.length === 0 &&
    afterBad.length === 0;
  if (!same) differing += 1;
  console.log(
    `${same ? "  " : "**"} ${label}\n` +
      `     argv     ${JSON.stringify(command)}\n` +
      `     strict   ${JSON.stringify(commandPathOperands(command))}\n` +
      `     old-wide ${JSON.stringify(before)}  gaps=${JSON.stringify(beforeBad)}\n` +
      `     new-wide ${JSON.stringify(after)}  gaps=${JSON.stringify(afterBad)}`,
  );
}
console.log(
  `TOTAL commands ${total} | old-rule gaps ${oldGaps} | new-rule gaps ${newGaps} | rows where the two rules differ or a gap exists ${differing}`,
);
