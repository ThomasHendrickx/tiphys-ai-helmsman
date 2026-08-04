import { randomUUID } from "node:crypto";
import {
  linkSync,
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
 * What the token confirmation is and is NOT (corrected per D-2; the
 * previous wording here claimed a second safety net that does not
 * exist). The confirmation read asserts only "my bytes are in the file
 * now". That is last-writer-wins: it catches an intruder who applied
 * AFTER this mutation, and it does NOT catch one who applied before and
 * merely lost the race to write last. The O_EXCL claim file is
 * therefore the sole serializer, and it is advisory: no handle is held
 * on it and nothing checks ownership when it is unlinked. The apply is
 * preceded by a second read-and-compare (stillMatches) so that a lost
 * claim degrades to a clean loss instead of a double win, but that
 * narrows the window rather than closing it. Deleting a live claim file
 * can still produce two holders; that is why the CLI's remedy text now
 * says so instead of inviting it.
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
  | {
      ok: false;
      reason: string;
      /**
       * True when the operation failed because a mutation claim file
       * was still present after the bounded wait (CR-204). A stale
       * claim is NOT an active lease: reporting it as "lock held"
       * sends an operator hunting for a holder that does not exist.
       * Every lease operation (acquire, renew, release) sets this, and
       * the CLI consumes it to emit the claim-file remedy.
       */
      claimTimeout?: boolean;
    };

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

/**
 * Re-read the lock file and re-compare it against the state a mutation
 * was decided on. Used immediately before every apply (D-2).
 */
function stillMatches(lockPath: string, observed: ObservedLease): boolean {
  const current = readCurrent(lockPath);
  if (observed.kind === "absent") {
    return !current.present;
  }
  return current.present && current.raw === observed.raw;
}

export type MutationResult =
  | { won: true }
  | { won: false; reason: string; claimTimeout?: boolean };

/**
 * The single staging path a lease rename goes through (CR-202). One
 * fixed name is safe because staging only ever happens inside the
 * mutation claim, and it makes strand cleanup deterministic.
 */
export function stagePathFor(lockPath: string): string {
  return `${lockPath}.stage`;
}

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
        // CR-204: name the lease situation first, so an operator is not
        // nudged toward a takeover when the obstacle is a claim file and
        // there is no lease at all.
        // The remedy sentence is deliberately NOT part of this reason:
        // the CLI appends it from the claimTimeout flag, so the
        // classification is load-bearing at every layer rather than
        // carried along as prose (CR-204).
        // U-6: an expired lease is not a held one. Saying "lock held"
        // here contradicted lock status in the same fleet, which calls
        // the same lease expired, and reads as "the holder is alive"
        // when the truth is the opposite.
        const holder =
          observed.kind === "present" && observed.lease !== undefined
            ? isExpired(observed.lease, Date.now())
              ? `expired lease from ${observed.lease.holderId}`
              : `lock held by ${observed.lease.holderId}`
            : "no lease, no live holder";
        return {
          won: false,
          claimTimeout: true,
          reason:
            `${holder}; stale claim file ${mutexPath} blocking after ` +
            `${String(MUTEX_WAIT_TOTAL_MS)}ms`,
        };
      }
      await sleep(MUTEX_WAIT_POLL_MS);
    }
  }
  try {
    // CR-202: clear any stranded stage left by a mutation that died
    // between its stage write and its rename. This runs inside the
    // claim, so it provably cannot race a live mutation (a live one
    // would hold the claim), which is why no age heuristic is needed
    // or wanted. It is unconditional because the release path (unlink)
    // and the absent-lock acquire path (O_EXCL create) never touch the
    // stage: cleaning only in the rename branch would let a strand
    // survive a release/acquire-only sequence indefinitely.
    try {
      unlinkSync(stagePathFor(lockPath));
    } catch {
      // No strand present, which is the normal case.
    }

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

    // D-2: re-read and re-compare immediately before every apply. The
    // claim file is the ONLY serializer, and it is advisory: no handle
    // is held on it, and the operator remedy this CLI prints tells a
    // human to delete it. If a claim is lost that way, another mutation
    // can enter this section concurrently; without this second compare
    // both could apply and both could believe they won. With it, the
    // loser sees changed bytes and degrades to a clean loss. This
    // narrows the window to the syscall gap; it does not remove it, and
    // the module docs say so rather than claiming a guarantee.
    if (!stillMatches(lockPath, observed)) {
      return {
        won: false,
        reason: "lost: the lease changed while this mutation held the claim",
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
      // D-1: publish the initial lease atomically. writeFileSync with
      // flag "wx" is openSync(O_EXCL) followed by a SEPARATE writeSync,
      // so the lock file's NAME becomes visible at length zero before
      // the lease bytes land. observeLease, leaseStatus and doctor all
      // read outside the claim, so a reader landing in that window sees
      // an empty file and reports a healthy fleet as corrupt; it turned
      // acceptance criterion 3's own witness red on pristine code.
      //
      // linkSync gives both properties at once: the stage file already
      // holds the complete lease, and link fails with EEXIST if the
      // lock path exists, which is exactly the atomic exclusive-create
      // test PR-006 asks for. So exclusion is preserved and the name
      // never exists half-published. renew and takeover were already
      // immune because they stage then rename; this makes the absent
      // lock path use the same discipline, which is the asymmetry the
      // module previously left unjustified.
      const stagePath = stagePathFor(lockPath);
      writeFileSync(stagePath, next);
      try {
        linkSync(stagePath, lockPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          return {
            won: false,
            reason: "lost: a lease appeared after this mutation observed none",
          };
        }
        throw error;
      } finally {
        try {
          unlinkSync(stagePath);
        } catch {
          // The stage sweep at the top of the claim also covers this.
        }
      }
    } else {
      // The stage is ONE fixed path beside the lock (CR-202). Every
      // stage write happens inside the claim, so no two stages can ever
      // coexist and a fixed name needs no uniqueness to be safe; the
      // claim-held sweep above then makes cleanup of a crash strand
      // deterministic (exactly one possible strand path, removed
      // unconditionally) instead of an age-based guess over a family of
      // unique names. The CAS is untouched by this choice: the
      // byte-compare against the observed state and the token
      // confirmation read both still happen inside the claim, and the
      // rename remains atomic within one directory.
      const stagePath = stagePathFor(lockPath);
      writeFileSync(stagePath, next);
      try {
        renameSync(stagePath, lockPath);
      } catch (error) {
        try {
          unlinkSync(stagePath);
        } catch {
          // Stage cleanup is best effort; the original error surfaces.
        }
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          // Another mutation swept this stage, which means it entered
          // the critical section concurrently, which means this claim
          // was lost (D-2). Report it as a loss rather than letting a
          // raw ENOENT stack out of the CLI.
          return {
            won: false,
            reason:
              "lost: the staged lease disappeared before it was published, " +
              "which means another mutation held the claim concurrently",
          };
        }
        throw error;
      }
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
    // CR-204: a claim-file timeout is not a held lease. Its reason
    // already states the lease situation, so it is never re-prefixed
    // with "lock held", and the classification travels to the caller.
    if (result.claimTimeout === true) {
      return { ok: false, reason: result.reason, claimTimeout: true };
    }
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
    if (result.claimTimeout === true) {
      return { ok: false, reason: result.reason, claimTimeout: true };
    }
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
    if (result.claimTimeout === true) {
      return { ok: false, reason: result.reason, claimTimeout: true };
    }
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
