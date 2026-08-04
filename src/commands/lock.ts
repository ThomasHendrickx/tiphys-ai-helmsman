import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { EX_USAGE } from "../cli.ts";
import { loadFleet } from "../fleet.ts";
import {
  acquireLease,
  leaseStatus,
  observeLease,
  releaseLease,
  renewLease,
} from "../lock.ts";
import type { ObservedLease } from "../lock.ts";

/**
 * tiphys lock <acquire [--take-over] [--duration <seconds>] | renew
 * --holder <id> [--duration <seconds>] | release --holder <id> | status>
 * (kernel plan v1, M1-P3 step 2). Runs in a fleet home (cwd). The holder
 * identity for renew and release is the opaque holderId that acquire
 * printed; it outlives any one command invocation (FM-022) and is never
 * derived from the running program (plan constraint C-2).
 */

const USAGE =
  "usage: tiphys lock <acquire [--take-over] [--duration <seconds>] | " +
  "renew --holder <id> [--duration <seconds>] | " +
  "release --holder <id> | status>";

interface LockArgs {
  takeover: boolean;
  holder: string | undefined;
  durationSeconds: number | undefined;
}

/**
 * Deterministic race-witness hold point (the plan's test determinism
 * rule: scripted interleaves over sleep-based timing). When
 * TIPHYS_LOCK_TEST_HOLD names a barrier path, the mutating subcommands
 * observe the lease and freeze their decision clock first, write
 * <barrier>.observed as a ready marker, then wait for the barrier file
 * to appear before deciding and applying through the one mutation
 * primitive. A test can thereby interleave two real CLI invocations at
 * the exact compare-and-swap point. Inert unless the variable is set.
 *
 * The seam is LOUD about not holding (D-3). It previously had two exits
 * from its wait and only one of them meant "held": on the other the
 * command walked into the mutation carrying a stale observation and
 * told nobody, so a witness could score a compare-and-swap it never
 * staged and still pass. Both exits are now closed with a throw, the
 * bound is monotonic (process.hrtime.bigint, not Date.now, because a
 * realtime bound mixed with monotonic test durations is precisely what
 * made "it failed fast" look like proof the bound was not reached), and
 * the reason the wait ended is written to <barrier>.released so the
 * test can assert the interleave actually happened. This is a test
 * integrity fix; it is NOT a fix for the unattributed U-2 flake, whose
 * trigger remains unexplained.
 */
const HOLD_WAIT_LIMIT_MS = 30_000;

async function maybeHoldForTest(
  lockPath: string,
): Promise<{ observed: ObservedLease; nowMs: number } | undefined> {
  const barrier = process.env.TIPHYS_LOCK_TEST_HOLD;
  if (barrier === undefined || barrier === "") {
    return undefined;
  }
  if (existsSync(barrier)) {
    throw new Error(
      `lock test hold point: barrier ${barrier} already existed before the ` +
        `hold; this interleave was never staged and the run is not evidence`,
    );
  }
  const observed = observeLease(lockPath);
  const nowMs = Date.now();
  writeFileSync(`${barrier}.observed`, "");
  const startNs = process.hrtime.bigint();
  const limitNs = BigInt(HOLD_WAIT_LIMIT_MS) * 1_000_000n;
  let held = false;
  for (;;) {
    if (existsSync(barrier)) {
      held = true;
      break;
    }
    if (process.hrtime.bigint() - startNs >= limitNs) {
      break;
    }
    await sleep(10);
  }
  const waitedMs = Number((process.hrtime.bigint() - startNs) / 1_000_000n);
  if (!held) {
    throw new Error(
      `lock test hold point: barrier ${barrier} never appeared within ` +
        `${String(HOLD_WAIT_LIMIT_MS)}ms (waited ${String(waitedMs)}ms on the ` +
        `monotonic clock); this interleave was never staged and the run is ` +
        `not evidence`,
    );
  }
  // Record that the hold really held, and why the wait ended, so the
  // witness can assert the interleave rather than assume it.
  writeFileSync(
    `${barrier}.released`,
    `held after ${String(waitedMs)}ms (monotonic), barrier observed\n`,
  );
  return { observed, nowMs };
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys lock: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

/**
 * The one failure emitter for acquire, renew, and release (CR-204).
 * When the library classified the failure as a stale mutation claim,
 * the operator is pointed at the claim file rather than at a holder
 * that may not exist; the remedy text lives here, so a CLI that
 * ignored the classification would visibly lose it. Operational
 * failures exit 1 (usage errors alone use EX_USAGE).
 */
function failure(outcome: { reason: string; claimTimeout?: boolean }): number {
  // D-2: the claim file is the sole serializer of lock mutations, so
  // deleting one that is actually live lets a second mutation enter the
  // critical section and can produce two live holders. The remedy text
  // therefore states that cost instead of inviting the deletion, and it
  // names the safe order: make sure no tiphys process is running first.
  const remedy =
    outcome.claimTimeout === true
      ? "; a crashed mutation can leave this file behind, but deleting it while a mutation is genuinely in flight can produce two lock holders, so confirm no tiphys process is running against this fleet before removing it"
      : "";
  process.stderr.write(`tiphys lock: ${outcome.reason}${remedy}\n`);
  return 1;
}

function parseFlags(rest: string[]): LockArgs | undefined {
  const parsed: LockArgs = {
    takeover: false,
    holder: undefined,
    durationSeconds: undefined,
  };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === "--take-over") {
      parsed.takeover = true;
    } else if (flag === "--holder" && i + 1 < rest.length) {
      parsed.holder = rest[i + 1];
      i += 1;
    } else if (flag === "--duration" && i + 1 < rest.length) {
      const seconds = Number(rest[i + 1]);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return undefined;
      }
      parsed.durationSeconds = seconds;
      i += 1;
    } else {
      return undefined;
    }
  }
  return parsed;
}

export async function cmdLock(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand === undefined) {
    return usageError();
  }
  const flags = parseFlags(rest);
  if (flags === undefined) {
    return usageError();
  }

  let lockPath: string;
  try {
    lockPath = loadFleet(process.cwd()).lockPath;
  } catch (error) {
    process.stderr.write(`tiphys lock: ${(error as Error).message}\n`);
    return 1;
  }

  switch (subcommand) {
    case "acquire": {
      if (flags.holder !== undefined) {
        return usageError("acquire does not take --holder");
      }
      const held = await maybeHoldForTest(lockPath);
      const outcome = await acquireLease(lockPath, {
        takeover: flags.takeover,
        durationSeconds: flags.durationSeconds,
        observed: held?.observed,
        nowMs: held?.nowMs,
      });
      if (!outcome.ok) {
        return failure(outcome);
      }
      const lease = outcome.lease;
      if (lease === null) {
        throw new Error("unreachable: acquire produced no lease");
      }
      process.stdout.write(`acquired ${lease.holderId} expires ${lease.expiresAt}\n`);
      return 0;
    }
    case "renew": {
      if (flags.holder === undefined || flags.takeover) {
        return usageError("renew requires --holder <id>");
      }
      const held = await maybeHoldForTest(lockPath);
      const outcome = await renewLease(lockPath, flags.holder, {
        durationSeconds: flags.durationSeconds,
        observed: held?.observed,
        nowMs: held?.nowMs,
      });
      if (!outcome.ok) {
        return failure(outcome);
      }
      const lease = outcome.lease;
      if (lease === null) {
        throw new Error("unreachable: renew produced no lease");
      }
      process.stdout.write(`renewed ${lease.holderId} expires ${lease.expiresAt}\n`);
      return 0;
    }
    case "release": {
      if (flags.holder === undefined || flags.takeover || flags.durationSeconds !== undefined) {
        return usageError("release requires --holder <id> and no other flags");
      }
      const held = await maybeHoldForTest(lockPath);
      const outcome = await releaseLease(lockPath, flags.holder, {
        observed: held?.observed,
      });
      if (!outcome.ok) {
        return failure(outcome);
      }
      process.stdout.write(`released ${flags.holder}\n`);
      return 0;
    }
    case "status": {
      if (flags.holder !== undefined || flags.takeover || flags.durationSeconds !== undefined) {
        return usageError("status takes no flags");
      }
      const status = leaseStatus(lockPath);
      if (status.state === "free") {
        process.stdout.write("free\n");
      } else if (status.state === "corrupt") {
        process.stdout.write(`corrupt ${status.detail}\n`);
      } else {
        process.stdout.write(
          `${status.state} holder ${status.lease.holderId} acquired ` +
            `${status.lease.acquiredAt} expires ${status.lease.expiresAt}\n`,
        );
      }
      // status always exits 0 so a human takeover decision is informed
      // by reading, never blocked by an exit code.
      return 0;
    }
    default:
      return usageError(`unknown lock subcommand "${subcommand}"`);
  }
}
