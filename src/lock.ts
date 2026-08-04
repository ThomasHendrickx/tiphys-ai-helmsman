import { randomUUID } from "node:crypto";
import {
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * Lease-based session lock (kernel plan v1, M1-P3 step 1; DR-0007; plan
 * constraint C-2). One orchestrator per fleet: the lock file at
 * state/orchestrator.lock holds a JSON lease {holderId, hostname,
 * acquiredAt, expiresAt, durationSeconds, token} where holderId is an
 * opaque value generated at acquire. Liveness is lease freshness only:
 * this module never probes any running program in any way (FM-053), and
 * the death of a holder is deliberately invisible to the lease (an
 * unexpired lease excludes even when its holder is gone; recovery is the
 * explicit --take-over after expiry).
 *
 * Mutation contract (EXT-F-01, adopted verbatim from the plan):
 * - Every mutation (acquire, renew, release, takeover) goes through the
 *   ONE shared atomic mutation primitive, applyLeaseMutation. A mutation
 *   is decided against an observed lease state and applied only if the
 *   file still holds exactly that state; the application is confirmed by
 *   re-reading the unique per-mutation token it wrote. A confirmation
 *   showing another writer's token means the mutation lost and returns
 *   failure without retry. Ownership is not valid until the primitive
 *   completes.
 * - Renew fails on an expired lease and succeeds only while holderId
 *   matches and expiresAt is in the future.
 * - Takeover succeeds only if the observed lease is still the lease being
 *   replaced (compare-and-swap over the lease file content) and
 *   serializes with renew, release, and competing takeovers.
 *
 * Serialization mechanism: mutations are serialized through a claim file
 * beside the lock (<lock>.mutex, created O_EXCL; FM-022's
 * serialize-through-a-claim pattern), and inside that claim the primitive
 * re-reads the lock, byte-compares it with the observed state, applies
 * via O_EXCL create (absent lock, PR-006) or write-temp-then-rename, and
 * confirms by re-reading its own token (FM-022 write-then-verify). No
 * steal protocol exists on purpose (FM-058): a claim file left behind by
 * a crashed mutation makes later mutations fail loudly after a bounded
 * wait, naming the file for manual removal; the critical section is a
 * few file operations, so this window is tiny.
 *
 * Exclusion domain (PR-201, DR-0007 stated honestly): the lease excludes
 * within one filesystem and one clock, the fleet home the lock file lives
 * in. Cross-environment exclusion for a fleet shared through a git remote
 * is M4 residue and is not claimed here. Mutations of the lock file made
 * outside this module (manual edits) are not covered by the contract.
 *
 * Renewal discipline (PR-203): the default lease lasts 900 seconds and
 * the holder renews at or before half-life (renewByMs). Holdership on
 * mutating kernel commands (spawn, teardown) is verified against the
 * lease by M1-P4.
 */

export const DEFAULT_LEASE_DURATION_SECONDS = 900;

/** Bounded wait for the mutation claim file, then fail loudly. */
const MUTEX_WAIT_TOTAL_MS = 5000;
const MUTEX_WAIT_POLL_MS = 10;

export interface Lease {
  holderId: string;
  hostname: string;
  acquiredAt: string;
  expiresAt: string;
  durationSeconds: number;
  /** Unique per-mutation witness written by the mutation that produced this content. */
  token: string;
}

export type ObservedLease =
  | { kind: "absent" }
  | { kind: "present"; raw: string; lease: Lease | undefined };

export type LeaseOutcome =
  | { ok: true; lease: Lease }
  | { ok: true; lease: null }
  | { ok: false; reason: string };

function parseLease(raw: string): Lease | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const candidate = parsed as Partial<Lease>;
  if (
    typeof candidate.holderId !== "string" ||
    candidate.holderId === "" ||
    typeof candidate.hostname !== "string" ||
    typeof candidate.acquiredAt !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    typeof candidate.durationSeconds !== "number" ||
    typeof candidate.token !== "string" ||
    Number.isNaN(Date.parse(candidate.expiresAt))
  ) {
    return undefined;
  }
  return candidate as Lease;
}

export function renderLease(lease: Lease): string {
  return `${JSON.stringify(lease, null, 2)}\n`;
}

/** Read the current lock file state: absent, or present with raw bytes. */
export function observeLease(lockPath: string): ObservedLease {
  let raw: string;
  try {
    raw = readFileSync(lockPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "absent" };
    }
    throw error;
  }
  return { kind: "present", raw, lease: parseLease(raw) };
}

export function isExpired(lease: Lease, nowMs: number): boolean {
  return Date.parse(lease.expiresAt) <= nowMs;
}

/** The renew-by deadline (half-life of the current term), for holders. */
export function renewByMs(lease: Lease): number {
  return Date.parse(lease.expiresAt) - (lease.durationSeconds * 1000) / 2;
}

function readCurrent(lockPath: string): { present: boolean; raw: string } {
  try {
    return { present: true, raw: readFileSync(lockPath, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { present: false, raw: "" };
    }
    throw error;
  }
}

export type MutationResult =
  | { won: true }
  | { won: false; reason: string };

/**
 * The one shared atomic mutation primitive (EXT-F-01). Applies next (new
 * file content, or null to remove the lock) only if the lock file still
 * holds exactly the observed state, and confirms the application by
 * re-reading the mutation's own token. Loses without retry otherwise.
 */
export async function applyLeaseMutation(
  lockPath: string,
  observed: ObservedLease,
  next: string | null,
  token: string,
): Promise<MutationResult> {
  const mutexPath = `${lockPath}.mutex`;
  const deadline = Date.now() + MUTEX_WAIT_TOTAL_MS;
  for (;;) {
    try {
      writeFileSync(mutexPath, token, { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        return {
          won: false,
          reason:
            `mutation claim file ${mutexPath} stayed held past ` +
            `${String(MUTEX_WAIT_TOTAL_MS)}ms; if no mutation is in flight ` +
            `it was left by a crashed one, inspect and remove it manually`,
        };
      }
      await sleep(MUTEX_WAIT_POLL_MS);
    }
  }
  try {
    const current = readCurrent(lockPath);
    if (observed.kind === "absent") {
      if (current.present) {
        return {
          won: false,
          reason: "lost: a lease appeared after this mutation observed none",
        };
      }
    } else if (!current.present) {
      return {
        won: false,
        reason: "lost: the observed lease is gone",
      };
    } else if (current.raw !== observed.raw) {
      return {
        won: false,
        reason: "lost: the lease changed after this mutation observed it",
      };
    }

    if (next === null) {
      unlinkSync(lockPath);
      const confirm = readCurrent(lockPath);
      if (confirm.present) {
        return { won: false, reason: "lost: removal did not stick" };
      }
      return { won: true };
    }

    if (observed.kind === "absent") {
      // O_EXCL creation for acquire on an absent lock file (PR-006).
      try {
        writeFileSync(lockPath, next, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          return {
            won: false,
            reason: "lost: a lease appeared after this mutation observed none",
          };
        }
        throw error;
      }
    } else {
      const stagePath = `${lockPath}.tx-${token}`;
      writeFileSync(stagePath, next);
      renameSync(stagePath, lockPath);
    }

    const confirm = readCurrent(lockPath);
    const confirmedLease = confirm.present ? parseLease(confirm.raw) : undefined;
    if (confirmedLease === undefined || confirmedLease.token !== token) {
      return {
        won: false,
        reason: "lost: confirmation read shows another writer's token",
      };
    }
    return { won: true };
  } finally {
    try {
      unlinkSync(mutexPath);
    } catch {
      // Claim file already gone; nothing to release.
    }
  }
}

export interface AcquireOptions {
  takeover?: boolean;
  durationSeconds?: number;
  nowMs?: number;
  /**
   * Staging seam for deterministic race witnesses: the decision is made
   * against this pre-observed state instead of a fresh read, and the
   * primitive then refuses if the file moved on. Normal callers omit it.
   */
  observed?: ObservedLease;
}

function buildLease(nowMs: number, durationSeconds: number): Lease {
  return {
    holderId: randomUUID(),
    hostname: hostname(),
    acquiredAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + durationSeconds * 1000).toISOString(),
    durationSeconds,
    token: randomUUID(),
  };
}

/**
 * Acquire the lease, or take over an expired one when takeover is set.
 * Refusals (lock held, expired without takeover, unexpired takeover)
 * never mutate the file; only won mutations do.
 */
export async function acquireLease(
  lockPath: string,
  options: AcquireOptions = {},
): Promise<LeaseOutcome> {
  const nowMs = options.nowMs ?? Date.now();
  const durationSeconds =
    options.durationSeconds ?? DEFAULT_LEASE_DURATION_SECONDS;
  const observed = options.observed ?? observeLease(lockPath);

  if (observed.kind === "present") {
    if (observed.lease === undefined) {
      return {
        ok: false,
        reason: `lease file ${lockPath} is corrupt; inspect it manually`,
      };
    }
    if (!isExpired(observed.lease, nowMs)) {
      return {
        ok: false,
        reason: options.takeover === true
          ? `takeover refused: lock held by ${observed.lease.holderId}, unexpired until ${observed.lease.expiresAt}`
          : `lock held by ${observed.lease.holderId}, expires ${observed.lease.expiresAt}`,
      };
    }
    if (options.takeover !== true) {
      return {
        ok: false,
        reason:
          `lease expired (holder ${observed.lease.holderId}, expired ` +
          `${observed.lease.expiresAt}); acquire refused, takeover is ` +
          `explicit: lock acquire --take-over`,
      };
    }
  }

  const lease = buildLease(nowMs, durationSeconds);
  const result = await applyLeaseMutation(
    lockPath,
    observed,
    renderLease(lease),
    lease.token,
  );
  if (!result.won) {
    return { ok: false, reason: `lock held (${result.reason})` };
  }
  return { ok: true, lease };
}

export interface RenewOptions {
  durationSeconds?: number;
  nowMs?: number;
  /** Staging seam for deterministic race witnesses; see AcquireOptions. */
  observed?: ObservedLease;
}

/**
 * Renew the lease held by holderId. Fails on an expired lease even when
 * holderId matches (EXT-F-01: a paused holder whose lease expired cannot
 * renew), fails on a holder mismatch, and never mutates the file on any
 * failure. The new expiry strictly increases (a renew that does not
 * extend the lease would be useless).
 */
export async function renewLease(
  lockPath: string,
  holderId: string,
  options: RenewOptions = {},
): Promise<LeaseOutcome> {
  const nowMs = options.nowMs ?? Date.now();
  const observed = options.observed ?? observeLease(lockPath);
  if (observed.kind === "absent") {
    return { ok: false, reason: "renew refused: no lease present" };
  }
  if (observed.lease === undefined) {
    return {
      ok: false,
      reason: `lease file ${lockPath} is corrupt; inspect it manually`,
    };
  }
  if (observed.lease.holderId !== holderId) {
    return {
      ok: false,
      reason: `renew refused: lease is held by ${observed.lease.holderId}, not ${holderId}`,
    };
  }
  if (isExpired(observed.lease, nowMs)) {
    return {
      ok: false,
      reason:
        `renew refused: lease expired ${observed.lease.expiresAt}; an ` +
        `expired lease cannot be renewed, re-acquire or take over instead`,
    };
  }
  const durationSeconds =
    options.durationSeconds ?? observed.lease.durationSeconds;
  const newExpiresMs = Math.max(
    nowMs + durationSeconds * 1000,
    Date.parse(observed.lease.expiresAt) + 1,
  );
  const lease: Lease = {
    ...observed.lease,
    expiresAt: new Date(newExpiresMs).toISOString(),
    durationSeconds,
    token: randomUUID(),
  };
  const result = await applyLeaseMutation(
    lockPath,
    observed,
    renderLease(lease),
    lease.token,
  );
  if (!result.won) {
    return { ok: false, reason: `renew ${result.reason}` };
  }
  return { ok: true, lease };
}

export interface ReleaseOptions {
  /** Staging seam for deterministic race witnesses; see AcquireOptions. */
  observed?: ObservedLease;
}

/**
 * Release the lease held by holderId. Expiry does not block a release
 * (an expired former holder may clean up its own lease), but a holder
 * mismatch refuses, so a losing holder can never remove the winner's
 * lease; and the compare-and-swap in the primitive means a release
 * staged before a takeover completes loses to it.
 */
export async function releaseLease(
  lockPath: string,
  holderId: string,
  options: ReleaseOptions = {},
): Promise<LeaseOutcome> {
  const observed = options.observed ?? observeLease(lockPath);
  if (observed.kind === "absent") {
    return { ok: false, reason: "release refused: no lease present" };
  }
  if (observed.lease === undefined) {
    return {
      ok: false,
      reason: `lease file ${lockPath} is corrupt; inspect it manually`,
    };
  }
  if (observed.lease.holderId !== holderId) {
    return {
      ok: false,
      reason: `release refused: lease is held by ${observed.lease.holderId}, not ${holderId}`,
    };
  }
  const result = await applyLeaseMutation(
    lockPath,
    observed,
    null,
    randomUUID(),
  );
  if (!result.won) {
    return { ok: false, reason: `release ${result.reason}` };
  }
  return { ok: true, lease: null };
}

export type LeaseStatus =
  | { state: "free" }
  | { state: "held" | "expired"; lease: Lease }
  | { state: "corrupt"; detail: string };

/** Report the lock state; reading only, never mutating (always safe). */
export function leaseStatus(lockPath: string, nowMs = Date.now()): LeaseStatus {
  const observed = observeLease(lockPath);
  if (observed.kind === "absent") {
    return { state: "free" };
  }
  if (observed.lease === undefined) {
    return {
      state: "corrupt",
      detail: `lease file ${lockPath} does not parse as a lease`,
    };
  }
  return {
    state: isExpired(observed.lease, nowMs) ? "expired" : "held",
    lease: observed.lease,
  };
}
