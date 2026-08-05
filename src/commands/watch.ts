import { EX_USAGE } from "../cli.ts";
import { loadFleet } from "../fleet.ts";
import { CADENCE, withCadenceOverrides } from "../liveness.ts";
import { singleLine } from "../task.ts";
import { NO_WAKE_EXIT, runOnce, runResident } from "../watcher.ts";
import type { Fleet } from "../fleet.ts";
import type { WatchCadence } from "../liveness.ts";
import type { PassOutcome } from "../watcher.ts";

/**
 * tiphys watch [--once] [--interval <seconds>] [--poll <seconds>]
 * [--backoff-cap <seconds>] [--max-heartbeats <n>] (kernel plan v1,
 * M1-P5 step 1). Runs in a fleet home (cwd).
 *
 * TWO ENTRY MODES, ONE CORE (DR-0007). Without --once this is a resident
 * foreground process: the caller owns it, it exits when it surfaces a
 * wake, and it prints one reason line when it does. With --once it
 * performs exactly one evaluation of the same wake sources and exits,
 * which is what an external scheduler or a reclaimable cloud session
 * uses. A pass that finds nothing actionable prints NOTHING and exits
 * with the documented no-wake code 3.
 *
 * C-3, structurally: there is no flag here that lets a watcher outlive
 * its caller, this command starts no child process, and both modes are
 * ordinary foreground work. Arming is explicit and is verified through
 * the beacon by the liveness guard, never by asking about a running
 * program (C-2).
 *
 * THE CADENCE FLAGS, and who they are for. --interval sets the base
 * heartbeat interval and --poll the wake-source poll interval, both in
 * seconds and both accepting fractions. They exist so a harness can run
 * this component at test timescales instead of waiting out production
 * cadence: the M1-P6 exit-test harness is the first consumer, and it can
 * replace its fixed upper bounds (a beacon within 120s, a wake within
 * 180s) with a short --interval and --poll plus bounds derived from
 * them. --backoff-cap sets the ceiling the doubling stops at.
 * Environment variables (TIPHYS_WATCH_INTERVAL_SECONDS,
 * TIPHYS_WATCH_POLL_SECONDS, TIPHYS_WATCH_BACKOFF_CAP_SECONDS,
 * TIPHYS_WATCH_STALE_SECONDS) set the same values for every command,
 * which is how spawn, teardown and doctor learn the same cadence: they
 * carry the guard, not the watcher, so they have no flags of their own.
 *
 * Every effective cadence, flags included, is re-validated against the
 * PR-009 invariant (stale threshold strictly greater than backoff cap
 * plus one poll interval). A violation is a usage error naming both
 * values, because a guard that calls a healthy watcher stale is worse
 * than no guard.
 */

const USAGE =
  "usage: tiphys watch [--once] [--interval <seconds>] [--poll <seconds>] " +
  "[--backoff-cap <seconds>] [--max-heartbeats <n>]";

interface WatchArgs {
  once: boolean;
  intervalSeconds: number | undefined;
  pollSeconds: number | undefined;
  backoffCapSeconds: number | undefined;
  maxHeartbeats: number | undefined;
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys watch: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

/** A positive, finite number of seconds; anything else is a usage error. */
function positiveNumber(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function parseFlags(args: string[]): WatchArgs | undefined {
  const parsed: WatchArgs = {
    once: false,
    intervalSeconds: undefined,
    pollSeconds: undefined,
    backoffCapSeconds: undefined,
    maxHeartbeats: undefined,
  };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag === "--once") {
      parsed.once = true;
    } else if (flag === "--interval" && value !== undefined) {
      const seconds = positiveNumber(value);
      if (seconds === undefined) {
        return undefined;
      }
      parsed.intervalSeconds = seconds;
      i += 1;
    } else if (flag === "--poll" && value !== undefined) {
      const seconds = positiveNumber(value);
      if (seconds === undefined) {
        return undefined;
      }
      parsed.pollSeconds = seconds;
      i += 1;
    } else if (flag === "--backoff-cap" && value !== undefined) {
      const seconds = positiveNumber(value);
      if (seconds === undefined) {
        return undefined;
      }
      parsed.backoffCapSeconds = seconds;
      i += 1;
    } else if (flag === "--max-heartbeats" && value !== undefined) {
      const count = Number(value);
      if (!Number.isInteger(count) || count <= 0) {
        return undefined;
      }
      parsed.maxHeartbeats = count;
      i += 1;
    } else {
      return undefined;
    }
  }
  return parsed;
}

function cadenceFor(flags: WatchArgs): WatchCadence {
  const overrides: Partial<WatchCadence> = {};
  if (flags.intervalSeconds !== undefined) {
    overrides.baseIntervalMs = flags.intervalSeconds * 1000;
  }
  if (flags.pollSeconds !== undefined) {
    overrides.pollIntervalMs = flags.pollSeconds * 1000;
  }
  if (flags.backoffCapSeconds !== undefined) {
    overrides.backoffCapMs = flags.backoffCapSeconds * 1000;
  }
  return withCadenceOverrides(CADENCE, overrides);
}

export async function cmdWatch(args: string[]): Promise<number> {
  const flags = parseFlags(args);
  if (flags === undefined) {
    return usageError();
  }
  if (flags.maxHeartbeats !== undefined && flags.once) {
    return usageError(
      "--max-heartbeats bounds a resident run and has no meaning with --once",
    );
  }

  let cadence: WatchCadence;
  try {
    cadence = cadenceFor(flags);
  } catch (error) {
    return usageError(singleLine((error as Error).message));
  }

  let fleet: Fleet;
  try {
    fleet = loadFleet(process.cwd());
  } catch (error) {
    process.stderr.write(`tiphys watch: ${singleLine((error as Error).message)}\n`);
    return 1;
  }

  let outcome: PassOutcome;
  try {
    outcome = flags.once
      ? await runOnce(fleet, { cadence, maxHeartbeats: undefined })
      : await runResident(fleet, { cadence, maxHeartbeats: flags.maxHeartbeats });
  } catch (error) {
    // The pass wraps its own steps, so reaching here means something
    // outside them raised. It is still one reason line, never a stack
    // trace out of the CLI.
    process.stderr.write(`tiphys watch: ${singleLine((error as Error).message)}\n`);
    return 1;
  }

  if (outcome.reason !== undefined) {
    process.stderr.write(`tiphys watch: ${singleLine(outcome.reason)}\n`);
    return outcome.code === 0 ? 1 : outcome.code;
  }
  if (outcome.line !== "") {
    process.stdout.write(`${outcome.line}\n`);
  }
  // 0 with a reason line, or the documented no-wake code (NO_WAKE_EXIT).
  return outcome.code;
}
