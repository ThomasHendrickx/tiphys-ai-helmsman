import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runReleaseGate } from "./release.ts";

/**
 * THE DEPLOY GATE ENTRY (kernel plan M2, M2-P7 step 4). A thin entry point
 * that names the declared `deploy` verification and calls the one contract
 * module, `src/gates/release.ts`. The manifest keeps its two static entries
 * exactly as section 1.4 declares them, so no gate-runner or exit-test
 * arithmetic changes, and M2 deliberately does not generalize to N
 * charter-declared verifications (section 2 item 12; that is M3's).
 *
 * Release verification is structurally NOT a pull-request gate: it runs
 * after a merge, against a commit that exists only once the merge has
 * happened, so a pre-merge bundle can only ever report not-applicable, on
 * every repository (investigation section 1.3, observation O-3). The real
 * call site is the orchestrator's post-merge step with the merged sha as
 * `--base`, deferred to M4 by M2-D-11.
 */

function isMain(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) {
    return false;
  }
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = await runReleaseGate("deploy", process.argv.slice(2));
}
