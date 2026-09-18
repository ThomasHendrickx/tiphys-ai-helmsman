// Real-output capture script for the child-environment refusal witnesses.
// Run from the repository root with a floor-satisfying node:
//
//   node witness/captures/credential-vocabulary-walk.mjs <scrub-dir> \
//     > witness/captures/credential-vocabulary-walk.txt
//
// It prints, from a SEPARATE PROCESS, what the kernel's own modules say about
// every member of every declared credential vocabulary: whether the audited
// route refuses it, which vocabulary claimed it, what the default scrubbed
// child actually carries, and what the gate's environment probe reports for a
// child carrying an egress name and for one carrying the ssh agent socket.
// The witnesses' tests read the captured text and assert the live modules
// still agree with it, so a later narrowing of the walk diverges from a
// recorded real run rather than from a hand-written string.
import { mkdirSync } from "node:fs";

const scrubDir = process.argv[2];
if (typeof scrubDir !== "string" || scrubDir.length === 0) {
  process.stderr.write("usage: credential-vocabulary-walk.mjs <scrub-dir>\n");
  process.exit(64);
}
mkdirSync(scrubDir, { recursive: true });

const env = await import(new URL("../../src/exec/env.ts", import.meta.url).href);
const credentials = await import(
  new URL("../../src/gates/credentials.ts", import.meta.url).href
);

const built = env.buildChildEnv({ parentEnv: process.env, scrubDir });
if (built.ok !== true) {
  process.stderr.write(`buildChildEnv refused: ${built.reason}\n`);
  process.exit(1);
}
process.stdout.write(`DEFAULT-CHILD-NAMES ${Object.keys(built.env).sort().join(" ")}\n`);

for (const row of credentials.REFUSED_CHILD_ENV_VOCABULARIES) {
  const members = credentials[row.constantName];
  process.stdout.write(`VOCABULARY ${row.id} ${row.constantName} ${members.length}\n`);
  for (const name of members) {
    const refusal = env.refuseExtraAllowlist(
      [{ name, reason: "capture: a plausible-sounding reason" }],
      "reason-required",
    );
    const claimed = credentials.refusedEnvVocabulary(name);
    process.stdout.write(
      `MEMBER ${row.constantName} ${name} ` +
        `${typeof refusal === "string" ? "REFUSED" : "ACCEPTED"} ` +
        `${claimed === undefined ? "none" : claimed.id}\n`,
    );
  }
}

const probeOf = (extra) => {
  const probes = credentials.probeCredentialSources(
    { ...built.env, ...extra },
    { permittedNames: env.permittedChildEnvNames() },
  );
  const environment = probes.find((probe) => probe.source === "environment");
  return `${environment.outcome} ${environment.detail}`;
};
process.stdout.write(`PROBE default ${probeOf({})}\n`);
process.stdout.write(`PROBE egress ${probeOf({ HTTPS_PROXY: "http://127.0.0.1:1" })}\n`);
process.stdout.write(`PROBE ssh ${probeOf({ SSH_AUTH_SOCK: "/tmp/agent.sock" })}\n`);
