import { spawnSync } from "node:child_process";
import { constants } from "node:os";

/**
 * THE TURN-END INVOCATION (kernel plan M4, M4-P6 criteria 1, 2 and 3).
 *
 * THE HOOK IS INVOKED BY THE ADAPTER, NOT BY A `Stop` HOOK, and criterion 3
 * is a design consequence rather than a preference. A `Stop` hook receives
 * static JSON on stdin and has no exit code to carry
 * (delivery/plan/m4-intake.md:1001), so a design that routed the payload's
 * exit code through one would have nothing to route: the number this module
 * exists to deliver does not exist inside a `Stop` payload. The adapter owns
 * the child, so the adapter is the only party that ever sees the number.
 *
 * WHY THIS IS A MODULE AND NOT THREE LINES INSIDE `launch`. The generated
 * kernel hook REFUSES a non-integer argument: it exits 64
 * (src/hooks.ts:47), and `spawnTask` then reports "the turn-end record could
 * not be written", which surfaces as `incomplete` with a plumbing reason and
 * the payload's real outcome nowhere. So the conversion from a spawn result
 * to an integer is the single most consequential line in the adapter, and it
 * is the line a second adapter would most plausibly reimplement. It lives in
 * one named place so a witness can mutate it and so a reader can find it.
 *
 * `128 + signal` IS THE SHELL'S CONVENTION AND THE KERNEL'S OWN
 * (src/spawn.ts:359). It is reimplemented here rather than imported because
 * the kernel does not publish it: `src/index.ts` exports the adapter CONTRACT
 * and nothing else, and reaching past the published surface with a relative
 * import that climbs out of this package compiles inside this workspace and
 * breaks for every consumer who installs the two packages from npm.
 */

/**
 * The integer the generated hook must be handed, from a `spawnSync` result.
 *
 * BOTH NULLS IS A REAL INPUT, not a defensive flourish. `SpawnSyncReturns`
 * types `status` and `signal` as nullable independently, so the degenerate
 * pair is expressible at this seam, and the only wrong answer here is a
 * non-integer: an unmapped signal name yields `128 + 0`, which is a number a
 * reader can interpret, where `128 + undefined` is `NaN` and `NaN` is exactly
 * what makes the generated hook exit 64.
 *
 * WHAT A `status ?? 0` WOULD DO, stated because it is the plausible wrong
 * implementation and criterion 2 is aimed at it: it returns an INTEGER for
 * every input, so a test that asserts only integer-ness passes, and it
 * reports exit code 0, SUCCESS, for a payload that was killed. The watcher
 * then wakes on a turn-end record saying the agent finished cleanly.
 */
export function payloadExitCode(
  status: number | null,
  signal: NodeJS.Signals | null,
): number {
  if (status !== null) {
    return status;
  }
  const signals = constants.signals as unknown as Record<string, number | undefined>;
  const number = signal === null ? undefined : signals[signal];
  return 128 + (number ?? 0);
}

/** What the adapter hands this module after its payload child has settled. */
export interface PayloadTermination {
  status: number | null;
  signal: NodeJS.Signals | null;
}

/** The invocation the adapter is about to make, resolved to its arguments. */
export interface TurnEndInvocation {
  /** The integer the hook is handed. */
  exitCode: number;
  /** The single command-line argument, which is that integer as text. */
  argument: string;
}

/**
 * Resolve a payload termination to the hook's one argument.
 *
 * SPLIT OUT FROM THE SPAWN so the conversion is observable without a child.
 * The end-to-end witnesses drive a real payload and read the real turn-end
 * record; this function is what lets the degenerate both-null termination,
 * which no real `spawnSync` produces on this platform, be exercised at all.
 */
export function turnEndInvocation(termination: PayloadTermination): TurnEndInvocation {
  const exitCode = payloadExitCode(termination.status, termination.signal);
  return { exitCode, argument: String(exitCode) };
}

export type TurnEndOutcome =
  | { ok: true; exitCode: number }
  | { ok: false; exitCode: number; detail: string };

export interface TurnEndRequest {
  hookPath: string;
  termination: PayloadTermination;
  /** The kernel-built child environment, passed through UNWIDENED (M2-P8). */
  env: Record<string, string> | undefined;
}

/**
 * Invoke the generated hook with the payload's exit code.
 *
 * THIS FUNCTION NEVER THROWS. `spawnSync` reports a failure to start through
 * its own `error` field, and a THROW from it is something else entirely; from
 * inside one there is no way to tell whether a process was created. The
 * adapter's caller has already passed the point where `launch-failed` is
 * legal, so every failure here is reported to the caller as data and the
 * caller turns it into `incomplete`.
 */
export function invokeTurnEndHook(request: TurnEndRequest): TurnEndOutcome {
  const { exitCode, argument } = turnEndInvocation(request.termination);
  let hooked;
  try {
    hooked = spawnSync(process.execPath, [request.hookPath, argument], {
      stdio: "inherit",
      // Spread rather than `env: request.env` so an undefined env means "no
      // env option at all", which is Node's documented full-inheritance form.
      ...(request.env === undefined ? {} : { env: request.env }),
    });
  } catch (error) {
    return { ok: false, exitCode, detail: singleLine(error) };
  }
  if (hooked.error !== undefined) {
    return { ok: false, exitCode, detail: singleLine(hooked.error) };
  }
  if (hooked.status !== 0) {
    return { ok: false, exitCode, detail: `exit ${String(hooked.status)}` };
  }
  return { ok: true, exitCode };
}

/** One line of a caught error, so a reason never spans a log line. */
function singleLine(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}
