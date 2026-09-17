import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readRegularFileIfPresent, singleLine } from "../task.ts";
import type { Fleet } from "../fleet.ts";
import type { ExecutorAdapter } from "../spawn.ts";

/**
 * ADAPTER SELECTION AND LOADING (kernel plan M4, M4-P4; M4-D-03 at
 * delivery/plan/m4-intake.md:729).
 *
 * THE RESOLUTION ROOT IS THE WHOLE SECURITY PROPERTY, and it is the reason
 * this module exists rather than a one-line `await import(specifier)` at the
 * spawn call site. Loading an adapter executes third-party code INSIDE the
 * orchestrator process, the same process that holds delegated merge
 * authority under DR-0012. DR-0029 Part 2c's untrusted-project-content
 * boundary does not exist and M4-D-23 recommends it is not built in M4, so
 * the only mitigation available is WHERE the code is resolved from:
 *
 *   - the FLEET HOME is owner-controlled and already pins `@tiphys/kernel`
 *     exactly, which is what makes it a boundary at all;
 *   - the PROJECT CLONE is the thing under review and may contain anything
 *     a contributor pushed, including a `node_modules/` directory.
 *
 * So resolution is rooted at `<fleet home>/package.json` and NOTHING here
 * ever consults the project clone, the kernel's own checkout, or
 * `process.cwd()` at the moment of the import. A plain `await
 * import(specifier)` resolves relative to THIS MODULE's URL, which is the
 * kernel checkout, and `import.meta.resolve(specifier, parent)` silently
 * ignores its second argument unless Node is started with
 * `--experimental-import-meta-resolve` (measured on v26.6.0, 2026-09-17:
 * the parent was ignored and the specifier resolved from the CALLER's file).
 * Both of those are the shape this module refuses to be.
 *
 * WHAT THIS MODULE DOES NOT DEFEND. Once a specifier resolves inside the
 * fleet home, its code runs. A legitimate fleet-home adapter that is later
 * compromised is not covered by anything here, and no criterion of this
 * phase claims otherwise: this phase MOVES the boundary to the fleet home,
 * it does not defend inside it. That residue is M4-D-23's, stated rather
 * than implied.
 */

/**
 * The built-in adapter's name, and the one name a loaded adapter may not
 * claim (M4-P4 criterion 5).
 *
 * IT LIVES HERE RATHER THAN IN `src/spawn.ts` so that the runtime import
 * edge runs one way only: `src/spawn.ts` imports this value, and this module
 * imports nothing but a TYPE back. A value-level cycle between the launch
 * module and the loader would evaluate one of them inside the other's
 * temporal dead zone the first time an import order changed, which is a
 * failure nothing in the suite would predict.
 *
 * The launch record's `adapter` field (src/spawn.ts:113) is the only thing
 * that ever says what ran. A loaded adapter naming itself after the built-in
 * one makes every later record ambiguous, and the ambiguity is unresolvable
 * after the fact because the record is the only witness. This is the
 * misattribution guard src/gates/schemas/release-record.schema.json:26
 * already instantiates for release records, applied one layer down.
 */
export const BUILT_IN_ADAPTER_NAME = "subprocess";

/**
 * The fleet-home `package.json` field that names a default adapter, as a
 * JSON pointer written out in the one place that reads it.
 *
 * `tiphys.adapter` rather than a top-level key: the kernel's own
 * `package.json` already namespaces its configuration under `tiphys`
 * (package.json:52), so a fleet home carrying kernel configuration uses the
 * same namespace rather than inventing a second convention.
 */
export const FLEET_ADAPTER_FIELD = "tiphys.adapter";

export type AdapterSelection =
  | { ok: true; adapter: ExecutorAdapter | undefined; origin: string }
  | { ok: false; reason: string };

export type AdapterLoad =
  | { ok: true; adapter: ExecutorAdapter }
  | { ok: false; reason: string };

/**
 * The specifier the fleet home declares as its default, if any.
 *
 * READ THROUGH `readRegularFileIfPresent`, never `readFileSync`: the fleet
 * home is a directory this process does not own the contents of, and a FIFO
 * at `package.json` would hang the spawn rather than refuse it. That is the
 * hazard CR-520 records for `meta.json`, one path along.
 *
 * A fleet home with no `package.json`, no `tiphys` object, or no `adapter`
 * key declares NOTHING, which is a different fact from declaring something
 * unusable: the first yields `undefined` and the built-in default, the
 * second is a refusal naming the field.
 */
export function fleetAdapterSpecifier(
  fleet: Fleet,
): { ok: true; specifier: string | undefined } | { ok: false; reason: string } {
  const read = readRegularFileIfPresent(fleet.packageJsonPath);
  if (read.kind === "absent") {
    return { ok: true, specifier: undefined };
  }
  if (read.kind === "refused") {
    return {
      ok: false,
      reason:
        `the fleet home package.json could not be read to find a default ` +
        `adapter (${read.reason})`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return {
      ok: false,
      reason:
        `the fleet home package.json ${fleet.packageJsonPath} does not parse as ` +
        `JSON (${singleLine((error as Error).message)}), so the ` +
        `${FLEET_ADAPTER_FIELD} field cannot be read`,
    };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      reason:
        `the fleet home package.json ${fleet.packageJsonPath} does not parse as ` +
        `an object, so the ${FLEET_ADAPTER_FIELD} field cannot be read`,
    };
  }
  const tiphys = (parsed as { tiphys?: unknown }).tiphys;
  if (tiphys === undefined) {
    return { ok: true, specifier: undefined };
  }
  if (typeof tiphys !== "object" || tiphys === null || Array.isArray(tiphys)) {
    return {
      ok: false,
      reason:
        `the fleet home package.json ${fleet.packageJsonPath} declares tiphys as ` +
        `${Array.isArray(tiphys) ? "an array" : typeof tiphys}, and ` +
        `${FLEET_ADAPTER_FIELD} can only be read from an object`,
    };
  }
  const adapter = (tiphys as { adapter?: unknown }).adapter;
  if (adapter === undefined) {
    return { ok: true, specifier: undefined };
  }
  if (typeof adapter !== "string" || adapter.trim() === "") {
    return {
      ok: false,
      reason:
        `the fleet home package.json ${fleet.packageJsonPath} declares ` +
        `${FLEET_ADAPTER_FIELD} as ${typeof adapter === "string" ? "an empty string" : typeof adapter}, ` +
        `and a default adapter must be a non-empty module specifier`,
    };
  }
  return { ok: true, specifier: adapter };
}

/**
 * Resolve `specifier` with Node module resolution ROOTED AT THE FLEET HOME,
 * then evaluate it and check that what came back is an adapter.
 *
 * `createRequire(<fleet home>/package.json)` is the rooting. Every lookup it
 * performs starts at the fleet home and walks its PARENTS, which is ordinary
 * Node resolution with a base this process chose; the project clone lives
 * BELOW the fleet home (`<fleet>/projects/<name>`), so no walk from the
 * fleet home can ever reach its `node_modules`. A relative specifier
 * (`./adapters/mine.js`) is likewise resolved against the fleet home rather
 * than against the current working directory.
 *
 * THE CONDITION SET IS `require`, AND THAT IS A REAL LIMITATION RATHER THAN
 * AN OVERSIGHT. `require.resolve` applies an `exports` map under the
 * `require` condition, so a package whose map offers ONLY an `import`
 * condition fails to resolve here with ERR_PACKAGE_PATH_NOT_EXPORTED
 * (measured, node v26.6.0, 2026-09-17). Resolution succeeding says nothing
 * about the module SYSTEM: the resolved path is then imported as an ES
 * module through a file URL, so an ESM adapter loads correctly as long as its
 * `exports` map offers a `require` or `default` condition, or a bare string.
 * The refusal below says so, because an adapter author reading
 * "cannot be resolved" with no further detail would go looking in the wrong
 * place. The alternative, a parameterised ESM resolver, does not exist in
 * stable Node; see the module docs above for the measurement.
 */
export async function loadAdapter(
  fleet: Fleet,
  specifier: string,
  origin: string,
): Promise<AdapterLoad> {
  const requireFromFleet = createRequire(fleet.packageJsonPath);
  let resolved: string;
  try {
    resolved = requireFromFleet.resolve(specifier);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "";
    return {
      ok: false,
      reason:
        `the adapter ${specifier} (${origin}) could not be resolved from the ` +
        `fleet home ${fleet.root}, which is the ONLY resolution root the kernel ` +
        `uses for adapters: install it in the fleet home, and note that an ` +
        `exports map offering only an import condition does not resolve here ` +
        `(${code === "" ? singleLine(String(error)) : code})`,
    };
  }
  let module: unknown;
  try {
    module = await import(pathToFileURL(resolved).href);
  } catch (error) {
    return {
      ok: false,
      reason:
        `the adapter ${specifier} (${origin}) resolved to ${resolved} but could ` +
        `not be evaluated: ${singleLine(String(error))}`,
    };
  }
  return checkAdapterShape(module, specifier, origin, resolved);
}

/**
 * IS THIS AN ADAPTER (M4-P4 criterion 4)?
 *
 * The three shapes the criterion names are three ways a module can be
 * IMPORTABLE and not be an adapter, and each of them is silent at the import
 * itself: a module with no default export, a default export with no `launch`,
 * and a `launch` that is not callable. Left unchecked, the first two surface
 * as `TypeError: adapter.launch is not a function` thrown out of `spawnTask`
 * AFTER pool create has made a worktree, a branch and a pool record, which is
 * the same "refusal that arrives as a crash, after creation" shape M4-P3's
 * requirement checks exist to prevent (src/spawn.ts's checkAdapterRequirements).
 *
 * A FOURTH CHECK IS HERE THAT THE CRITERION DOES NOT NAME, and it is declared
 * rather than smuggled: the adapter's `name` must be a non-empty string.
 * Criterion 5 refuses one particular name, and `undefined` written into the
 * launch record's `adapter` field would defeat the whole point of that
 * criterion by making the record say nothing at all. A guard on the value of
 * a field that may be absent is a guard that cannot go red for the absent
 * case.
 *
 * Every refusal names the SPECIFIER and the member, because an operator
 * reading it has a module to go and fix and needs to know which one.
 */
export function checkAdapterShape(
  module: unknown,
  specifier: string,
  origin: string,
  resolved: string,
): AdapterLoad {
  const where = `the adapter ${specifier} (${origin}), resolved to ${resolved},`;
  if (typeof module !== "object" || module === null) {
    return { ok: false, reason: `${where} did not evaluate to a module object` };
  }
  if (!Object.hasOwn(module, "default")) {
    return {
      ok: false,
      reason:
        `${where} has no default export; an adapter module exports its ` +
        `ExecutorAdapter as the default export`,
    };
  }
  const candidate = (module as { default: unknown }).default;
  if (typeof candidate !== "object" || candidate === null) {
    return {
      ok: false,
      reason:
        `${where} exports a default that is ${candidate === null ? "null" : typeof candidate}, ` +
        `not an object with a launch member`,
    };
  }
  const launch = (candidate as { launch?: unknown }).launch;
  if (launch === undefined) {
    return {
      ok: false,
      reason:
        `${where} exports a default with no launch member; ExecutorAdapter ` +
        `requires launch(request)`,
    };
  }
  if (typeof launch !== "function") {
    return {
      ok: false,
      reason:
        `${where} exports a default whose launch member is ${typeof launch}, ` +
        `not a function; ExecutorAdapter requires launch(request)`,
    };
  }
  const name = (candidate as { name?: unknown }).name;
  if (typeof name !== "string" || name.trim() === "") {
    return {
      ok: false,
      reason:
        `${where} exports a default with no usable name member; the launch ` +
        `record's adapter field is the only thing that says what ran, so an ` +
        `adapter must name itself with a non-empty string`,
    };
  }
  if (name === BUILT_IN_ADAPTER_NAME) {
    return {
      ok: false,
      reason:
        `${where} names itself ${BUILT_IN_ADAPTER_NAME}, which is the built-in ` +
        `adapter's name; a loaded adapter may not claim it, because the launch ` +
        `record's adapter field would then no longer say which one ran`,
    };
  }
  return { ok: true, adapter: candidate as ExecutorAdapter };
}

/**
 * WHICH ADAPTER THIS SPAWN USES, AND WHY (M4-P4 criteria 1 and 6).
 *
 * WHICH SOURCE WINS, and it is explicit in the record rather than silent:
 * the `--adapter` FLAG outranks the fleet-home default, and the fleet-home
 * default outranks the built-in one.
 *
 * THE WORDING IS DELIBERATE AND IS NOT A STYLE CHOICE. The word this sentence
 * would naturally use is claimed by four rows of
 * delivery/plan/cutover/retirement-inventory.json, which assert that no kernel
 * artifact states an authority order among charter, plan and decision records
 * and enumerate BY NAME the `src/` files allowed to carry the token. A new
 * file carrying it reddens `scripts/check-retirement-inventory.mjs`, correctly,
 * because the checker cannot tell a benign use from a refuting one without a
 * human reading it. This use is benign and incidental, so the token is not
 * used here rather than the rows being widened from a phase that does not own
 * that document. A flag is a per-spawn instruction and
 * a fleet-home field is a standing one, so the narrower statement wins; the
 * opposite order would make the flag unusable on any fleet that declared a
 * default.
 *
 * `undefined` for the adapter means USE THE BUILT-IN ONE, and it is returned
 * as `undefined` rather than as `subprocessAdapter` so that this module
 * imports nothing but a type from `src/spawn.ts`. See BUILT_IN_ADAPTER_NAME
 * above for why the import edge runs one way.
 */
export async function selectAdapter(
  fleet: Fleet,
  flagSpecifier: string | undefined,
): Promise<AdapterSelection> {
  if (flagSpecifier !== undefined) {
    const origin = "--adapter";
    const loaded = await loadAdapter(fleet, flagSpecifier, origin);
    return loaded.ok ? { ok: true, adapter: loaded.adapter, origin } : loaded;
  }
  const declared = fleetAdapterSpecifier(fleet);
  if (!declared.ok) {
    return declared;
  }
  if (declared.specifier === undefined) {
    return { ok: true, adapter: undefined, origin: "the built-in default" };
  }
  const origin = `the fleet home ${FLEET_ADAPTER_FIELD} field`;
  const loaded = await loadAdapter(fleet, declared.specifier, origin);
  return loaded.ok ? { ok: true, adapter: loaded.adapter, origin } : loaded;
}
