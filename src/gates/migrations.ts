import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runReleaseGate } from "./release.ts";

/**
 * THE MIGRATIONS GATE ENTRY (kernel plan M2, M2-P7 step 4). A thin entry
 * point that names the declared `migrations` verification and calls the one
 * contract module, `src/gates/release.ts`. Deploy verification and
 * migration verification are two INSTANCES of one post-merge verification
 * contract, not two contracts (DR-0014, investigation section 1): the two
 * registry entries exist so that a project can declare one and not the
 * other, and so the evidence bundle shows two lines rather than one
 * aggregate that hides which half was skipped.
 *
 * The two inventories are not symmetric (plan criterion 8): a declared
 * REPOSITORY migrations location containing zero migrations is
 * not-applicable, but a non-empty repository inventory with an EMPTY
 * applied inventory is red, never not-applicable, because that is the
 * recorded incident exactly ("migrations skipped by a flake while the code
 * deployed anyway"). The asymmetry lives in the migrations-command adapter;
 * this entry is shape-identical to deploy's.
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
  process.exitCode = await runReleaseGate("migrations", process.argv.slice(2));
}
