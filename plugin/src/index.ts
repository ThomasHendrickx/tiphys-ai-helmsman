/**
 * THE PLUGIN'S ENTRY POINT (kernel plan M4, M4-P5 criterion 7).
 *
 * THE DEFAULT EXPORT IS THE WHOLE CONTRACT WITH THE LOADER. The kernel's
 * adapter loader refuses a module with no `default` export, a default that is
 * not an object, a default with no `launch`, a `launch` that is not callable,
 * and a default with no usable `name` (src/adapters/load.ts:241 onward). Each
 * of those refusals exists because the alternative is a `TypeError` thrown out
 * of `spawnTask` AFTER a worktree, a branch and a pool record have been
 * created. So the default export is the adapter object itself and nothing is
 * wrapped around it.
 *
 * THE NAMED EXPORTS ARE THE SAME OBJECT, not a second surface. A consumer that
 * wants the adapter by name gets the identical reference; there is no factory,
 * no configuration argument and no state, because an adapter the kernel loads
 * into its own process is the last place to put any.
 */
export { ADAPTER_NAME, ADAPTER_REQUIRES, claudeCodeAdapter } from "./adapter.ts";

/* THE PULL-REQUEST CAPABILITY (M4-P24, M4-D-09). Exported as NAMED exports
   only: the default export stays the adapter object, because that is the whole
   of the loader contract and a default that became a bag of surfaces would
   change what `src/adapters/load.ts` receives. */
export {
  PR_CREDENTIAL_NAMES,
  PR_EX_NO_CREDENTIAL,
  PR_EX_USAGE,
  PR_MERGE_COMMAND,
  PR_OPEN_COMMAND,
  mergeArgv,
  openArgv,
  prChildEnv,
  resolveCredential,
  runPr,
} from "./pr.ts";

import { claudeCodeAdapter } from "./adapter.ts";

export default claudeCodeAdapter;
