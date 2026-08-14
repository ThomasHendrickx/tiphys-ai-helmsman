// M3-P11 fix round 2, per-member two-arm capture. Runs the REAL packed CLI
// from a given tree against one one-gate manifest per member, and prints the
// verdict, the bundle exit code and the bundle error count. Run once with the
// previous head's tree and once with the fix round's tree; the two outputs are
// the red and green arms, member by member, so "one witness is not a class"
// is answered per member rather than per test.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tree = process.argv[2];
const cli = join(tree, "bin", "tiphys.ts");
const lab = mkdtempSync(join(tmpdir(), "p11-r2-"));

function script(name, body) {
  const path = join(lab, name);
  writeFileSync(path, body);
  return path;
}

const greenGate = script(
  "green-gate.mjs",
  [
    'import { writeFileSync } from "node:fs";',
    'const a = process.argv.slice(2); const at = a.indexOf("--result");',
    'if (at >= 0) writeFileSync(a[at + 1], JSON.stringify({gate: "companion", status: "green",',
    '  units: 1, unitLabel: "u", startedAt: "2026-08-06T00:00:00.000Z",',
    '  endedAt: "2026-08-06T00:00:01.000Z", detail: "companion", evidence: []}));',
    "process.exit(0);",
    "",
  ].join("\n"),
);
const probeGate = script(
  "probe-gate.mjs",
  [
    'import { writeFileSync } from "node:fs";',
    'const a = process.argv.slice(2); const at = a.indexOf("--result");',
    'if (at >= 0) writeFileSync(a[at + 1], JSON.stringify({gate: "probe", status: "green",',
    '  units: 1, unitLabel: "u", startedAt: "2026-08-06T00:00:00.000Z",',
    '  endedAt: "2026-08-06T00:00:01.000Z", detail: "probe", evidence: []}));',
    "process.exit(0);",
    "",
  ].join("\n"),
);
const refuse = script("refuses.mjs", "process.exit(1);\n");
const realDir = join(lab, "a-real-directory");
mkdirSync(realDir, { recursive: true });

function oneShot(name) {
  return script(
    name,
    [
      'import { unlinkSync } from "node:fs";',
      'import { fileURLToPath } from "node:url";',
      "unlinkSync(fileURLToPath(import.meta.url));",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
}
function consumer(name, target) {
  return script(
    name,
    [
      'import { unlinkSync } from "node:fs";',
      `unlinkSync(${JSON.stringify(target)});`,
      "process.exit(1);",
      "",
    ].join("\n"),
  );
}

const members = [
  // CLASS A: not a path. Every one contains a slash; none is a path.
  ["A1 inline-code after -e", ["node", "-e", 'process.exit(require("node:fs").existsSync("/tiphys-no-such-marker-9f3a") ? 0 : 1)'], "not-applicable", undefined],
  ["A2 inline-code after --eval", ["node", "--eval", "process.exit(10/2 === 5 ? 1 : 0)"], "not-applicable", undefined],
  ["A3 url operand", ["node", refuse, "https://example.invalid/some/resource"], "not-applicable", undefined],
  ["A4 --opt=/value", ["node", refuse, "--out=/tiphys-no-such-dir-4c1/report.txt"], "not-applicable", undefined],
  ["A5 existing directory operand", ["node", refuse, "--declarations", realDir], "not-applicable", undefined],
  // CLASS B: the moment. Every path was there when the command was launched.
  ["B1 script deletes itself", ["node", oneShot("one-shot-a.mjs")], "not-applicable", undefined],
  ["B2 script deletes a data operand", null, "not-applicable", "consumer"],
  // CLASS C: the bare, directory-less operand (the residue round 1 declared).
  ["C1 node check.mjs, absent", ["node", "check.mjs"], "error", "cwd-lab"],
  ["C2 bash verify.sh, absent", ["bash", "verify.sh"], "error", "cwd-lab"],
  // CONTROLS: the fail-closed direction, and the real declaration shape.
  ["D1 absent operand after a flag", ["node", "--no-warnings", join(lab, "absent-after-flag.mjs")], "error", undefined],
  ["D2 absent operand carrying whitespace", ["node", join(lab, "a dir with spaces", "absent.mjs")], "error", undefined],
  ["D3 bare words . and src", ["node", refuse, "--precondition", ".", "src"], "not-applicable", undefined],
  ["D4 credential-token's real command", ["node", "-e", "process.exit(process.env.TIPHYS_NEVER_SET === undefined ? 1 : 0)"], "not-applicable", undefined],
];

console.log(`tree ${tree}`);
for (const [label, rawCommand, expected, mode] of members) {
  let command = rawCommand;
  if (mode === "consumer") {
    const input = join(lab, `queued-${label.slice(0, 2)}.json`);
    writeFileSync(input, "{}\n");
    command = ["node", consumer(`consume-${label.slice(0, 2)}.mjs`, input), input];
  }
  const evidence = join(lab, `ev-${label.slice(0, 2)}`);
  rmSync(evidence, { recursive: true, force: true });
  const manifest = join(lab, `m-${label.slice(0, 2)}.json`);
  writeFileSync(
    manifest,
    JSON.stringify(
      {
        version: 1,
        destructiveCommands: ["pool destroy", "teardown"],
        gates: [
          {
            id: "probe",
            command: [process.execPath, probeGate],
            unitLabel: "u",
            applicability: "conditional",
            precondition: { id: "p", kind: "command-exit-zero", command },
          },
          {
            id: "companion",
            command: [process.execPath, greenGate],
            unitLabel: "u",
            applicability: "required",
          },
        ],
      },
      null,
      2,
    ),
  );
  const cwd = mode === "cwd-lab" ? lab : tree;
  const run = spawnSync(
    process.execPath,
    [cli, "gates", "run", "--manifest", manifest, "--evidence", evidence],
    { encoding: "utf8", cwd },
  );
  const recordPath = join(evidence, "probe", "result.json");
  const status = existsSync(recordPath)
    ? JSON.parse(readFileSync(recordPath, "utf8")).status
    : "NO-RECORD";
  const summaryPath = join(evidence, "summary.json");
  const counts = existsSync(summaryPath)
    ? JSON.parse(readFileSync(summaryPath, "utf8")).counts
    : {};
  console.log(
    `${status === expected ? "PASS" : "FAIL"} ${label}\n` +
      `       verdict=${status} expected=${expected} bundle-exit=${String(run.status)} ` +
      `errors=${String(counts.error)} green=${String(counts.green)}`,
  );
}
