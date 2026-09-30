import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

/**
 * M6-P8 (DR-0066): the runner hands the red-witness gate the CI event, as a
 * declared run parameter `event`, so the gate can take its pull-request arm.
 * A run naming no `--event` hands a gate declaring `event` nothing and is not
 * an error; every other declared parameter still is (M2-C-3).
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");

/** A gate that reports, as its detail, the parameters it was handed. */
const ECHO_GATE = `import { writeFileSync } from "node:fs";
const argv = process.argv.slice(2);
const handed = [];
for (let index = 0; index < argv.length; index += 2) {
  if (argv[index] !== "--result" && argv[index] !== "--evidence") handed.push(argv[index], argv[index + 1]);
}
writeFileSync(argv[argv.indexOf("--result") + 1], JSON.stringify({
  gate: "event-echo",
  status: "green",
  units: 1,
  unitLabel: "fixture units",
  startedAt: "2026-09-30T00:00:00.000Z",
  endedAt: "2026-09-30T00:00:01.000Z",
  detail: "handed " + handed.join(" "),
  evidence: [],
}) + "\\n");
`;

test("the runner hands a gate that declares event the run's --event, hands it nothing when the run names no event, and still errors a missing --base", () => {
  const dir = mkdtempSync(join(tmpdir(), "p8-event-"));
  try {
    writeFileSync(join(dir, "echo-gate.mjs"), ECHO_GATE);
    const registry = join(dir, "registry.json");
    writeFileSync(
      registry,
      `${JSON.stringify({
        kind: "gate-registry",
        version: 1,
        preflight: [{ command: ["npm", "ci"], note: "install exactly the lockfile" }],
        gates: [
          {
            id: "event-echo",
            prevents: "a fixture failure",
            command: ["node", join(dir, "echo-gate.mjs")],
            unitLabel: "fixture units",
            applicability: "required",
            "verified-by": "script",
            modes: ["full"],
            events: ["pull_request", "push"],
            parameters: ["base", "event"],
          },
        ],
        destructiveCommands: [],
      })}\n`,
    );
    let runs = 0;
    const ran = (extra: string[]): { status: number | null; out: string } => {
      runs += 1;
      const result = spawnSync(
        process.execPath,
        [cliEntry, "gates", "run", "--registry", registry, "--evidence", join(dir, `evidence-${String(runs)}`), ...extra],
        { cwd: dir, encoding: "utf8" },
      );
      return { status: result.status, out: `${result.stdout}${result.stderr}` };
    };

    const push = ran(["--event", "push", "--base", "fixture-base"]);
    assert.equal(push.status, 0, push.out);
    assert.match(push.out, /gates: event-echo: green: handed --base fixture-base --event push\n/);

    const pullRequest = ran(["--event", "pull_request", "--base", "fixture-base"]);
    assert.equal(pullRequest.status, 0, pullRequest.out);
    assert.match(pullRequest.out, /gates: event-echo: green: handed --base fixture-base --event pull_request\n/);

    const none = ran(["--base", "fixture-base"]);
    assert.equal(none.status, 0, none.out);
    assert.match(none.out, /gates: event-echo: green: handed --base fixture-base\n/);

    const noBase = ran(["--event", "push"]);
    assert.notEqual(noBase.status, 0, noBase.out);
    assert.match(noBase.out, /gates: event-echo: error: gate event-echo requires --base, which was not supplied/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
