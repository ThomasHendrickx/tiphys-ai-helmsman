// Real-output capture script for the handover-provenance witness.
//
//   node witness/captures/handover-turn-end-arms.mjs <work-dir> \
//     > witness/captures/handover-turn-end-arms.txt
//
// TWO ARMS, ONE RECORD SHAPE. Arm HOOK runs the kernel's own generated
// turn-end hook AS A CHILD PROCESS, with an environment in which HOME has
// been reverted, and prints the bytes that child wrote. Arm ADAPTER writes
// the same path the way an adapter that never invokes the hook would: one
// writeFileSync carrying the values the kernel handed over. The captured
// bytes are what the witness's test reads, so the claim that the kernel
// cannot tell the two apart rests on a real run of the hook rather than on a
// hand-written string chosen to match the implementation.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const workDir = process.argv[2];
if (typeof workDir !== "string" || workDir.length === 0) {
  process.stderr.write("usage: handover-turn-end-arms.mjs <work-dir>\n");
  process.exit(64);
}
mkdirSync(workDir, { recursive: true });

const hooks = await import(new URL("../../src/hooks.ts", import.meta.url).href);
const env = await import(new URL("../../src/exec/env.ts", import.meta.url).href);
const pointerNames = env.CREDENTIAL_STORE_REDIRECTIONS.map((r) => r.name);

const handed = Object.fromEntries(
  env.CREDENTIAL_STORE_REDIRECTIONS.map((r) => [r.name, join("/task/scrub-env", r.relativePath)]),
);

// ARM HOOK: the kernel's generated script, run as a child, in a reverted env.
const hookTurnEnd = join(workDir, "hook-turn-end");
const hookPath = join(workDir, "turn-end-hook.mjs");
writeFileSync(hookPath, hooks.renderTurnEndHook(hookTurnEnd, pointerNames), { mode: 0o755 });
const ran = spawnSync(process.execPath, [hookPath, "0"], {
  env: { ...handed, HOME: "/root", PATH: process.env.PATH ?? "" },
  encoding: "utf8",
});
process.stdout.write(`ARM hook exit ${ran.status}\n`);
process.stdout.write(`ARM hook bytes ${readFileSync(hookTurnEnd, "utf8").replace(/\n/g, "\\n")}\n`);

// ARM ADAPTER: one writeFileSync, no hook, values as handed over.
const forgedTurnEnd = join(workDir, "adapter-turn-end");
writeFileSync(
  forgedTurnEnd,
  `${JSON.stringify(
    {
      endedAt: new Date(0).toISOString(),
      exitCode: 0,
      env: Object.fromEntries(pointerNames.map((name) => [name, handed[name] ?? null])),
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(
  `ARM adapter bytes ${readFileSync(forgedTurnEnd, "utf8").replace(/\n/g, "\\n")}\n`,
);
process.stdout.write(`HOOK-NAMES-ITS-OWN-OUTPUT ${readFileSync(hookPath, "utf8").includes(hookTurnEnd)}\n`);
