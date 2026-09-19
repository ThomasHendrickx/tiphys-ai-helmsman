import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Fleet } from "./fleet.ts";
import { taskDir, turnEndPath } from "./task.ts";

/**
 * Turn-end hook (kernel plan v1, M1-P4 step 3; R-082b, PR-209).
 *
 * The hook is a generated script in the TASK directory (never inside the
 * worktree, FM-059) that the executor invokes when the payload command
 * exits. It writes tasks/<id>/turn-end as JSON:
 *
 *   {"endedAt": "<ISO-8601>", "exitCode": <number>}
 *
 * That file is the M1-P5 watcher's wake signal. It is a notification,
 * not the task's state: meta.json status plus this exit code together
 * are the single current-state authority (plan constraint C-1), and a
 * MISSING turn-end file never means success (tuition T-002: an agent
 * that dies quietly leaves no turn-end and a dirty worktree).
 *
 * The hook takes the payload's exit code as its single argument, so any
 * adapter (the M1 subprocess adapter, and the window or cloud-session
 * adapters of the M4 era) can invoke it without knowing anything else
 * about the task. It is written with the .mjs extension so it parses as
 * ESM regardless of the nearest package.json, since it runs inside the
 * fleet home rather than inside this package.
 */

/** The generated hook script for a task. */
export function turnEndHookPath(fleet: Fleet, taskId: string): string {
  return join(taskDir(fleet, taskId), "turn-end-hook.mjs");
}

/**
 * Generate the hook script. The turn-end path is baked in as a literal,
 * so the hook needs no fleet resolution.
 *
 * THE CHILD-OBSERVED POINTER RECORD (CR-B-001, the half that closes the hole
 * rather than the half that stops mis-asserting it).
 *
 * `observeNames`, when given, is baked in as a literal array and the hook
 * writes an `env` object holding what each of those names ACTUALLY IS in the
 * environment the hook was launched with, or `null` where the name is unset.
 * The kernel compares those against the harness-owned paths it handed over.
 *
 * WHY THIS IS STRONGER THAN AN ADAPTER'S REPORT AND WHY IT IS NOT PROOF.
 * This script is written BY THE KERNEL and, for every adapter that honours
 * the documented contract, runs in the SAME environment as the payload (the
 * built-in adapter spreads the same `request.env` into both spawnSync calls,
 * and M2R-004 edit 4 is the record of why a second unscrubbed launch is
 * itself the leak). Against an adapter that does not invoke this script at
 * all it proves nothing, and the record no longer says otherwise.
 *
 * THE COST SENTENCE THAT STOOD HERE IS WITHDRAWN, BECAUSE IT WAS REFUTED BY
 * MEASUREMENT (CR-F-CRED-001, MEDIUM).
 *
 * It read: an adapter that quietly reverted `HOME` for the payload "has to
 * revert it for the payload and NOT for the hook, which means launching two
 * children with two different environments and is a substantially different
 * act from passing a mutated copy once". Two children is one way to do it and
 * it is not the cheap way. The cheap way is ONE child with the mutated
 * environment plus a single `writeFileSync` of the turn-end path, which is
 * STRICTLY LESS work than the honest path, because the honest path also
 * spawns the hook. The turn-end path is handed to the adapter beside
 * `hookPath`, and this generated script names it as a literal, so an adapter
 * that never runs it can still produce a byte-identical record.
 *
 * WHY A NONCE DOES NOT CLOSE THIS, stated because it is the obvious repair and
 * it was considered and refused rather than overlooked. Baking a per-task
 * secret into this script and requiring it in the record moves the forgery
 * from "know the path" to "read the file", and the adapter is HANDED the path
 * of this file: it runs at the same uid, on the same filesystem, in a
 * directory it must be able to read to invoke the hook at all. A guard whose
 * condition the adversary can satisfy by reading one file is green and
 * worthless, which is this repository's own recorded shape (T-008's
 * postscript, the red-witness rule one level up). No artifact this script can
 * write is unforgeable by a party that can read this script.
 *
 * So the repair is on the RECORD rather than on the check: the value is
 * `turn-end-record`, it names the artifact the values were read from, and
 * `CredentialHandoverRecord` (src/task.ts) says the artifact is
 * adapter-reachable. A dishonest adapter is still not caught here, and that
 * residue is declared at delivery/work-history/m4-p8.md item 3; what changed
 * is that `meta.json` no longer positively asserts a child-side observation
 * that no child made.
 *
 * The hook still reads no environment it was not told to read, and a hook
 * generated with no `observeNames` behaves exactly as it did before.
 */
export function renderTurnEndHook(
  turnEndFile: string,
  observeNames?: readonly string[],
): string {
  const observing = observeNames !== undefined && observeNames.length > 0;
  const envLines = observing
    ? `const observed = {};
for (const name of ${JSON.stringify([...observeNames])}) {
  const value = process.env[name];
  observed[name] = typeof value === "string" ? value : null;
}
record.env = observed;
`
    : "";
  return `#!/usr/bin/env node
// Generated by tiphys spawn (kernel plan v1, M1-P4 step 3). Invoked by the
// executor adapter when the payload command exits, with the payload's exit
// code as its single argument. Writes the turn-end record the M1-P5 watcher
// wakes on. Do not edit: spawn regenerates it.
import { writeFileSync } from "node:fs";

const exitCode = Number(process.argv[2]);
if (!Number.isInteger(exitCode)) {
  process.stderr.write(
    "tiphys turn-end hook: expected one integer exit-code argument\\n",
  );
  process.exit(64);
}
const record = { endedAt: new Date().toISOString(), exitCode };
${envLines}writeFileSync(
  ${JSON.stringify(turnEndFile)},
  \`\${JSON.stringify(record, null, 2)}\\n\`,
);
`;
}

/** Write the hook for a task and return its path. */
export function writeTurnEndHook(
  fleet: Fleet,
  taskId: string,
  observeNames?: readonly string[],
): string {
  const path = turnEndHookPath(fleet, taskId);
  writeFileSync(path, renderTurnEndHook(turnEndPath(fleet, taskId), observeNames), {
    mode: 0o755,
  });
  return path;
}
