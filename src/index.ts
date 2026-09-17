/**
 * THE KERNEL'S PUBLIC ENTRY POINT (kernel plan M4, M4-P4 criteria 7 and 8).
 *
 * Until this phase `@tiphys/kernel` declared `bin` and nothing else
 * (package.json:14): no `main`, no `exports`, no `types`, and no
 * `src/index.ts`. A separately published plugin could therefore not import
 * `ExecutorAdapter` at all, which made the executor seam unreachable from
 * outside this repository however well the interface was written.
 *
 * WHAT IS PUBLISHED HERE IS A COMMITMENT AND IS DELIBERATELY SMALL. An
 * `exports` map is a semver promise and a patch release cannot take one back,
 * so this file names the adapter CONTRACT and nothing else. In particular it
 * does not export `spawnTask`, the fleet accessors, the gate runner or
 * anything under `src/exec/`: those are the kernel's internals, they change
 * without notice, and `package.json`'s `exports` map has no wildcard subpath
 * precisely so that they stay unreachable through the package name
 * (criterion 8, whose dangerous state is an `exports` map written
 * `"./*": "./dist/src/*"`, which satisfies criterion 7 and publishes the
 * entire kernel as API).
 *
 * THE TWO VALUES ARE PART OF THE CONTRACT, not a convenience. An adapter
 * author has to answer two questions that types cannot answer at runtime:
 * which names may appear in `requires` (the closed set the kernel checks
 * against, src/spawn.ts's `requirableRequestFields`), and which name is
 * reserved for the built-in adapter (`BUILT_IN_ADAPTER_NAME`, refused by the
 * loader). Publishing the answers is cheaper than publishing a document that
 * drifts from them.
 */

export type {
  ExecutorAdapter,
  ExecutorRecord,
  ExecutorRequest,
  LaunchOutcome,
} from "./spawn.ts";

export { requirableRequestFields } from "./spawn.ts";

export { BUILT_IN_ADAPTER_NAME } from "./adapters/load.ts";
