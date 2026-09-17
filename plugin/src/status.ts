import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { statSync } from "node:fs";

/**
 * STATUS-LINE DELIVERY (kernel plan M4, M4-P6 criteria 7 and 8).
 *
 * M3 BUILT THE TRANSPORT AND DEFERRED THE DELIVERY. `emitStatus`
 * (src/status.ts:98) composes a record, appends one line to the append-only
 * stream and rewrites the current document atomically; `tiphys status show`
 * reads the current document and never opens the stream (constraint C-1).
 * What M3 did not build is anything that CALLS it during a turn, which the
 * intake assigns to this workstream (delivery/plan/m4-intake.md:685). This
 * module is that call.
 *
 * THIS MODULE HOLDS NO STATUS PATH, AND THAT IS THE WHOLE DESIGN. The
 * kernel's split between a durable current-state document and an append-only
 * stream is being MOVED while this phase is written: M4-D-13 takes the
 * current document out of the gitignored `state/` prefix and leaves the
 * stream where it is. A plugin carrying either spelling would be a second
 * copy of a decision it does not own, and it would be wrong the day the move
 * lands, silently, because writing to the old path succeeds. So delivery goes
 * through the kernel's own command line: `status emit` decides where the two
 * documents live and `status show` decides which of them is the read path.
 * The plugin names neither.
 *
 * DELIVERY IS BEST-EFFORT AND NEVER FAILS A TURN (criterion 8). Telemetry
 * that can fail a delivery is a hazard with a long record: the status line
 * exists to tell a supervisor what happened, and a status line that can
 * PREVENT what happened from being recorded has inverted its own purpose.
 * Every function here returns its failure as data and none of them throws.
 */

/** The five states `schemas/status-line.schema.json` permits, as the kernel
 * spells them. Only two are reachable from a finished turn, and they are the
 * two below; the closed vocabulary itself is enforced by the kernel, which
 * validates the composed record against the shipped schema BEFORE writing
 * anything (src/commands/status.ts:126). So a wrong state here is refused by
 * the kernel rather than written, and the delivery reports it undelivered. */
export const STATE_DONE = "done";
export const STATE_FAILED = "failed";

/** The state a finished turn reports, from the payload's exit code. */
export function stateForExitCode(exitCode: number): string {
  return exitCode === 0 ? STATE_DONE : STATE_FAILED;
}

/**
 * The fleet home that owns a path inside `tasks/<id>/`.
 *
 * The kernel hands an adapter `recordPath` and `hookPath`, both inside the
 * task directory (src/task.ts:242), and hands it no fleet root, because an
 * adapter has never needed one before. Three levels up from a file in
 * `<fleet>/tasks/<id>/` is the fleet home. Derived rather than guessed from
 * the process's cwd: `tiphys spawn` happens to run in the fleet home today,
 * and an adapter resting on that would break the first time the kernel is
 * driven from anywhere else.
 */
export function fleetRootFromTaskPath(taskPath: string): string {
  return dirname(dirname(dirname(taskPath)));
}

export type KernelCliResolution =
  | { ok: true; path: string }
  | { ok: false; reason: string };

/** True when the path is an existing regular file. Never throws. */
function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Where the kernel's command line is, resolved through the PACKAGE NAME.
 *
 * `@tiphys/kernel` publishes `./package.json` in its exports map deliberately
 * (package.json:22), which is the one subpath a consumer may resolve, so the
 * `bin` entry is readable without reaching into the package's internals. That
 * matters more than it looks: the kernel's exports map has no wildcard
 * subpath ON PURPOSE (src/index.ts:16), so there is no supported spelling for
 * importing `emitStatus` directly, and a relative import climbing out of this
 * package would compile in this workspace and break for everyone who installs
 * the two packages from npm.
 *
 * THE SOURCE FALLBACK IS FOR A CHECKOUT, NOT FOR A CONSUMER. An installed
 * `@tiphys/kernel` ships `dist/` and the `bin` entry resolves; a git checkout
 * that has not been built has `bin/tiphys.ts` and nothing else, and Node runs
 * it natively via type stripping, which is this repository's whole premise.
 * Without the fallback every test of this module would depend on a prior
 * `npm run build`, and a test that skips when `dist/` is absent is a test that
 * cannot go red in the red-witness harness, which clones source and builds
 * nothing.
 */
export function resolveKernelCli(): KernelCliResolution {
  const resolve = createRequire(import.meta.url);
  let manifestPath: string;
  try {
    manifestPath = resolve.resolve("@tiphys/kernel/package.json");
  } catch (error) {
    return {
      ok: false,
      reason: `@tiphys/kernel could not be resolved from the plugin: ${singleLine(error)}`,
    };
  }
  const root = dirname(manifestPath);
  let declared: unknown;
  try {
    declared = resolve(manifestPath) as unknown;
  } catch (error) {
    return { ok: false, reason: `${manifestPath} could not be read: ${singleLine(error)}` };
  }
  const bin = (declared as { bin?: Record<string, string> }).bin;
  const entry = bin === undefined ? undefined : bin["tiphys"];
  if (entry !== undefined) {
    const built = join(root, entry);
    if (isRegularFile(built)) {
      return { ok: true, path: built };
    }
  }
  const source = join(root, "bin", "tiphys.ts");
  if (isRegularFile(source)) {
    return { ok: true, path: source };
  }
  return {
    ok: false,
    reason:
      `neither the declared bin entry nor ${source} is a regular file under ` +
      `${root}, so the kernel command line could not be located`,
  };
}

export interface StatusEmission {
  /** The kernel command line, from `resolveKernelCli` or from a caller. */
  cliPath: string;
  /** The fleet home the record belongs to; the command runs there. */
  fleetRoot: string;
  run: string;
  state: string;
  detail?: string;
  refs?: string[];
  /** The kernel-built child environment, passed through UNWIDENED. */
  env?: Record<string, string> | undefined;
}

export type StatusDelivery =
  | { delivered: true; line: string }
  | { delivered: false; reason: string };

/**
 * Emit one status record through the kernel, and swallow every failure.
 *
 * THE SWALLOW IS THE FEATURE, and it is the half criterion 8 witnesses. The
 * caller is an adapter in the middle of finishing a turn; a throw from here
 * would travel out of `launch`, and `spawnTask` would report that the adapter
 * did not say whether the payload started, over a worktree that may hold real
 * work. A status line is not worth that, so nothing here is allowed to leave
 * this function as an exception.
 */
export function deliverStatus(emission: StatusEmission): StatusDelivery {
  const argv = [
    emission.cliPath,
    "status",
    "emit",
    "--run",
    emission.run,
    "--state",
    emission.state,
  ];
  if (emission.detail !== undefined) {
    argv.push("--detail", emission.detail);
  }
  for (const ref of emission.refs ?? []) {
    argv.push("--ref", ref);
  }
  let emitted;
  try {
    emitted = spawnSync(process.execPath, argv, {
      cwd: emission.fleetRoot,
      encoding: "utf8",
      // The status child gets the NARROWER environment of the two available,
      // never the parent's. M2-P8's contract names the payload and the
      // turn-end hook and does not name a third child, so this module takes
      // the safe direction rather than inventing a permission.
      ...(emission.env === undefined ? {} : { env: emission.env }),
    });
  } catch (error) {
    return { delivered: false, reason: singleLine(error) };
  }
  if (emitted.error !== undefined) {
    return { delivered: false, reason: singleLine(emitted.error) };
  }
  if (emitted.status !== 0) {
    return {
      delivered: false,
      reason:
        `tiphys status emit exited ${String(emitted.status)}: ` +
        `${singleLine(emitted.stderr ?? "")}`,
    };
  }
  return { delivered: true, line: (emitted.stdout ?? "").trim() };
}

export type StatusRead =
  | { ok: true; line: string }
  | { ok: false; reason: string };

/**
 * The CURRENT status, through `tiphys status show`, which is C-1's read path.
 *
 * This function does not take a stream path, does not fall back to one, and
 * has no code path that opens one, for the same reason the kernel's
 * `readCurrent` does not (src/status.ts:123): a truncated or half-written
 * history must not be able to change what a supervisor is told.
 */
export function showStatus(
  cliPath: string,
  fleetRoot: string,
  env?: Record<string, string> | undefined,
): StatusRead {
  let shown;
  try {
    shown = spawnSync(process.execPath, [cliPath, "status", "show"], {
      cwd: fleetRoot,
      encoding: "utf8",
      ...(env === undefined ? {} : { env }),
    });
  } catch (error) {
    return { ok: false, reason: singleLine(error) };
  }
  if (shown.error !== undefined) {
    return { ok: false, reason: singleLine(shown.error) };
  }
  if (shown.status !== 0) {
    return {
      ok: false,
      reason: `tiphys status show exited ${String(shown.status)}: ${singleLine(shown.stderr ?? "")}`,
    };
  }
  return { ok: true, line: (shown.stdout ?? "").trim() };
}

/** One line of a caught error, so a reason never spans a log line. */
function singleLine(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}
