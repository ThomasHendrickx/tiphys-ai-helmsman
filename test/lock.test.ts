import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/**
 * Session-lock tests (kernel plan v1, M1-P3 criteria 1 to 10). The race
 * witnesses follow the determinism rule: scripted interleaves through
 * the CLI's documented hold point (TIPHYS_LOCK_TEST_HOLD) or the
 * primitive's own staging seam (the observed option), plus true
 * multi-process runs whose single-winner postcondition is
 * interleave-independent.
 */

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));
const lockSourcePath = fileURLToPath(new URL("../src/lock.ts", import.meta.url));

interface LeaseShape {
  holderId: string;
  hostname: string;
  acquiredAt: string;
  expiresAt: string;
  durationSeconds: number;
  token: string;
}

interface ObservedShape {
  kind: string;
  raw?: string;
  lease?: LeaseShape;
}

interface OutcomeShape {
  ok: boolean;
  reason?: string;
  lease?: LeaseShape | null;
}

/**
 * Unit import of the lock library through a computed URL: a literal
 * relative import from test/ into src/ crosses the project-reference
 * boundary and fails the build under rewriteRelativeImportExtensions
 * (TS2878); the runtime module is the same source file either way.
 */
const lockLib = (await import(
  new URL("../src/lock.ts", import.meta.url).href
)) as {
  observeLease(lockPath: string): ObservedShape;
  acquireLease(
    lockPath: string,
    options?: {
      takeover?: boolean;
      durationSeconds?: number;
      nowMs?: number;
      observed?: ObservedShape;
    },
  ): Promise<OutcomeShape>;
  renewLease(
    lockPath: string,
    holderId: string,
    options?: {
      durationSeconds?: number;
      nowMs?: number;
      observed?: ObservedShape;
    },
  ): Promise<OutcomeShape>;
  releaseLease(lockPath: string, holderId: string): Promise<OutcomeShape>;
};

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): CliResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    ...opts,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Concurrent CLI invocation for real multi-process race witnesses. */
function spawnCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<CliResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [sourceEntry, ...args], {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ status: code, stdout, stderr });
    });
  });
}

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p3-lock-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function initFleet(t: { after(fn: () => void): void }): string {
  const fleet = join(makeTempDir(t), "fleet");
  const result = runCli(["init", fleet]);
  assert.equal(result.status, 0, result.stderr);
  return fleet;
}

function lockFile(fleet: string): string {
  return join(fleet, "state", "orchestrator.lock");
}

function readLease(fleet: string): { raw: string; lease: LeaseShape } {
  const raw = readFileSync(lockFile(fleet), "utf8");
  return { raw, lease: JSON.parse(raw) as LeaseShape };
}

function parseAcquired(stdout: string): { holderId: string; expiresAt: string } {
  const match = /^acquired (\S+) expires (\S+)$/m.exec(stdout);
  assert.ok(match !== null, `unexpected acquire output: ${stdout}`);
  return { holderId: match[1] as string, expiresAt: match[2] as string };
}

function acquire(fleet: string, extra: string[] = []): { holderId: string; expiresAt: string } {
  const result = runCli(["lock", "acquire", ...extra], { cwd: fleet });
  assert.equal(result.status, 0, result.stderr);
  return parseAcquired(result.stdout);
}

async function waitPastExpiry(fleet: string): Promise<void> {
  const { lease } = readLease(fleet);
  const expiresMs = Date.parse(lease.expiresAt);
  while (Date.now() <= expiresMs + 25) {
    await sleep(25);
  }
}

async function waitForFile(path: string, boundMs = 15_000): Promise<void> {
  const deadline = Date.now() + boundMs;
  while (!existsSync(path)) {
    assert.ok(Date.now() < deadline, `file ${path} never appeared`);
    await sleep(10);
  }
}

/**
 * Guard 3: the hold seam now records that it really held, and why the
 * wait ended, at <barrier>.released. A witness that does not assert
 * this can silently degrade into a no-op test that scores a
 * compare-and-swap it never staged.
 */
function assertHeld(barrier: string, label: string): void {
  assert.ok(
    existsSync(`${barrier}.released`),
    `${label}: the held child never observed the barrier, so this interleave was never staged and the run is not evidence`,
  );
}

/** Guard 3: never let a failing child's stderr be invisible. */
function childDetail(label: string, result: CliResult): string {
  return `${label}: exit ${String(result.status)}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;
}

test("lock acquire creates a lease with opaque holder and future expiry and no pid field", (t) => {
  const fleet = initFleet(t);
  const acquired = acquire(fleet);
  const { lease } = readLease(fleet);
  assert.equal(lease.holderId, acquired.holderId);
  assert.ok(lease.holderId.length > 0, "empty holderId");
  assert.ok(Date.parse(lease.expiresAt) > Date.now(), "expiresAt not in the future");
  for (const key of Object.keys(lease)) {
    assert.doesNotMatch(key, /pid/i, `lease carries a pid-like field: ${key}`);
  }
  assert.doesNotMatch(readLease(fleet).raw, /"pid"/i);
});

test("lock acquire while an unexpired lease exists is refused with lock held and the file unchanged", (t) => {
  const fleet = initFleet(t);
  acquire(fleet);
  const before = readLease(fleet).raw;
  const second = runCli(["lock", "acquire"], { cwd: fleet });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /lock held/);
  assert.equal(readLease(fleet).raw, before, "lock file changed on a refused acquire");
});

test("an unexpired lease still excludes after its acquiring holder is gone", (t) => {
  // C-2 and PR-208: the CLI invocation that acquired has exited by
  // construction (runCli waits for it), so its holder is gone; the
  // lease neither knows nor cares, and still excludes until expiry.
  const fleet = initFleet(t);
  const { holderId } = acquire(fleet);
  const again = runCli(["lock", "acquire"], { cwd: fleet });
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /lock held/);
  assert.equal(readLease(fleet).lease.holderId, holderId);
});

test("five concurrent lock acquires yield exactly one winner and the file holds the winner's holder id", async (t) => {
  const fleet = initFleet(t);
  const results = await Promise.all(
    Array.from({ length: 5 }, () => spawnCli(["lock", "acquire"], { cwd: fleet })),
  );
  const winners = results.filter((r) => r.status === 0);
  const losers = results.filter((r) => r.status !== 0);
  assert.equal(winners.length, 1, JSON.stringify(results));
  assert.equal(losers.length, 4);
  const winner = parseAcquired((winners[0] as CliResult).stdout);
  assert.equal(readLease(fleet).lease.holderId, winner.holderId);
  for (const loser of losers) {
    assert.match(loser.stderr, /lock held/, "loser without a diagnostic");
  }
});

test("lock renew by the holder strictly increases expiresAt", (t) => {
  const fleet = initFleet(t);
  const { holderId, expiresAt } = acquire(fleet);
  const renewed = runCli(["lock", "renew", "--holder", holderId], { cwd: fleet });
  assert.equal(renewed.status, 0, renewed.stderr);
  const match = /^renewed \S+ expires (\S+)$/m.exec(renewed.stdout);
  assert.ok(match !== null, renewed.stdout);
  assert.ok(
    Date.parse(match[1] as string) > Date.parse(expiresAt),
    `expiresAt did not strictly increase: ${expiresAt} -> ${match[1] as string}`,
  );
  assert.equal(readLease(fleet).lease.expiresAt, match[1]);
});

test("lock renew on an expired lease is refused even for the matching holder and leaves the file byte-identical", async (t) => {
  // EXT-F-01 witness: paused-holder renewal after expiry fails.
  const fleet = initFleet(t);
  const { holderId } = acquire(fleet, ["--duration", "1"]);
  await waitPastExpiry(fleet);
  const before = readLease(fleet).raw;
  const renewed = runCli(["lock", "renew", "--holder", holderId], { cwd: fleet });
  assert.notEqual(renewed.status, 0);
  assert.match(renewed.stderr, /expired/);
  assert.equal(readLease(fleet).raw, before);
});

test("lock renew with a non-matching holder id is refused and leaves the file byte-identical", (t) => {
  const fleet = initFleet(t);
  acquire(fleet);
  const before = readLease(fleet).raw;
  const renewed = runCli(["lock", "renew", "--holder", "not-the-holder"], { cwd: fleet });
  assert.notEqual(renewed.status, 0);
  assert.equal(readLease(fleet).raw, before);
});

test("lock status on an expired lease exits 0 and reports expired with holder and expiry", async (t) => {
  const fleet = initFleet(t);
  const { holderId } = acquire(fleet, ["--duration", "1"]);
  await waitPastExpiry(fleet);
  const { lease } = readLease(fleet);
  const status = runCli(["lock", "status"], { cwd: fleet });
  assert.equal(status.status, 0);
  assert.match(status.stdout, /expired/);
  assert.ok(status.stdout.includes(holderId), status.stdout);
  assert.ok(status.stdout.includes(lease.expiresAt), status.stdout);
});

test("lock acquire without --take-over on an expired lease is refused and reports expired", async (t) => {
  const fleet = initFleet(t);
  acquire(fleet, ["--duration", "1"]);
  await waitPastExpiry(fleet);
  const before = readLease(fleet).raw;
  const attempt = runCli(["lock", "acquire"], { cwd: fleet });
  assert.notEqual(attempt.status, 0);
  assert.match(attempt.stderr, /expired/);
  assert.equal(readLease(fleet).raw, before);
});

test("lock acquire --take-over on an expired lease succeeds with a fresh holder id and future expiry", async (t) => {
  const fleet = initFleet(t);
  const first = acquire(fleet, ["--duration", "1"]);
  await waitPastExpiry(fleet);
  const takeover = runCli(["lock", "acquire", "--take-over"], { cwd: fleet });
  assert.equal(takeover.status, 0, takeover.stderr);
  const next = parseAcquired(takeover.stdout);
  assert.notEqual(next.holderId, first.holderId);
  const { lease } = readLease(fleet);
  assert.equal(lease.holderId, next.holderId);
  assert.ok(Date.parse(lease.expiresAt) > Date.now());
});

test("lock acquire --take-over on an unexpired lease is refused", (t) => {
  const fleet = initFleet(t);
  acquire(fleet);
  const before = readLease(fleet).raw;
  const attempt = runCli(["lock", "acquire", "--take-over"], { cwd: fleet });
  assert.notEqual(attempt.status, 0);
  assert.match(attempt.stderr, /unexpired|held/);
  assert.equal(readLease(fleet).raw, before);
});

test("a renew and a takeover staged against the same lease serialize to exactly one winner", async (t) => {
  // EXT-F-01 witness, renew versus takeover, applied order takeover
  // first: the renew observes and freezes its clock while the lease is
  // still unexpired (the paused holder), the takeover wins after
  // expiry, the resumed renew loses the compare-and-swap.
  const fleet = initFleet(t);
  const tmp = makeTempDir(t);
  const { holderId, expiresAt } = acquire(fleet, ["--duration", "5"]);
  const barrier = join(tmp, "renew-barrier");
  const heldRenew = spawnCli(["lock", "renew", "--holder", holderId], {
    cwd: fleet,
    env: { ...process.env, TIPHYS_LOCK_TEST_HOLD: barrier },
  });
  await waitForFile(`${barrier}.observed`);
  assert.ok(
    Date.now() < Date.parse(expiresAt),
    "environment too slow: the held renew observed after expiry, rerun",
  );
  await waitPastExpiry(fleet);
  const takeover = runCli(["lock", "acquire", "--take-over"], { cwd: fleet });
  assert.equal(takeover.status, 0, takeover.stderr);
  const winner = parseAcquired(takeover.stdout);
  const winnerRaw = readLease(fleet).raw;
  writeFileSync(barrier, "");
  const renewResult = await heldRenew;
  assertHeld(barrier, "renew versus takeover");
  // Guard 3: the file state is the discriminator, so it is asserted
  // FIRST. On a double win this records which mutation applied last,
  // which is the single measurement that separates "the seam escaped"
  // from "the CAS is holed"; asserting the exit code first threw it
  // away.
  assert.equal(
    readLease(fleet).lease.holderId,
    winner.holderId,
    `applied-last mutation was the renew, not the takeover: ${childDetail("renew", renewResult)}`,
  );
  assert.equal(
    readLease(fleet).raw,
    winnerRaw,
    `winner lease was altered: ${childDetail("renew", renewResult)}`,
  );
  assert.notEqual(
    renewResult.status,
    0,
    `both operations won: ${childDetail("renew", renewResult)}`,
  );
  assert.match(renewResult.stderr, /lost/);

  // Applied order renew first: a takeover staged against the observed
  // pre-renew lease (its clock past that lease's expiry) loses to the
  // renew that applied first (the primitive's own staging seam).
  const fleet2 = initFleet(t);
  const second = acquire(fleet2, ["--duration", "3600"]);
  const observed = lockLib.observeLease(lockFile(fleet2));
  const renewed = runCli(["lock", "renew", "--holder", second.holderId], { cwd: fleet2 });
  assert.equal(renewed.status, 0, renewed.stderr);
  const renewedRaw = readLease(fleet2).raw;
  const stagedTakeover = await lockLib.acquireLease(lockFile(fleet2), {
    takeover: true,
    observed,
    nowMs: Date.parse(second.expiresAt) + 1000,
  });
  assert.equal(stagedTakeover.ok, false);
  assert.match(stagedTakeover.reason ?? "", /lost/);
  assert.equal(readLease(fleet2).raw, renewedRaw, "renewed lease was altered");
});

test("two concurrent takeovers on an expired lease yield exactly one winner", async (t) => {
  // EXT-F-01 witness, takeover versus takeover: the loser fails the
  // compare-and-swap confirmation. Single-winner postcondition is
  // interleave-independent.
  const fleet = initFleet(t);
  acquire(fleet, ["--duration", "1"]);
  await waitPastExpiry(fleet);
  const results = await Promise.all([
    spawnCli(["lock", "acquire", "--take-over"], { cwd: fleet }),
    spawnCli(["lock", "acquire", "--take-over"], { cwd: fleet }),
  ]);
  const winners = results.filter((r) => r.status === 0);
  const losers = results.filter((r) => r.status !== 0);
  assert.equal(winners.length, 1, JSON.stringify(results));
  assert.equal(losers.length, 1);
  const winner = parseAcquired((winners[0] as CliResult).stdout);
  assert.equal(readLease(fleet).lease.holderId, winner.holderId);
  assert.ok(((losers[0] as CliResult).stderr).length > 0, "loser without a diagnostic");
});

test("a release racing a takeover loses when the takeover applies first and the winner lease is untouched", async (t) => {
  // EXT-F-01 witness, release versus takeover, outcome takeover-first.
  const fleet = initFleet(t);
  const tmp = makeTempDir(t);
  const { holderId } = acquire(fleet, ["--duration", "1"]);
  await waitPastExpiry(fleet);
  const barrier = join(tmp, "release-barrier");
  const heldRelease = spawnCli(["lock", "release", "--holder", holderId], {
    cwd: fleet,
    env: { ...process.env, TIPHYS_LOCK_TEST_HOLD: barrier },
  });
  await waitForFile(`${barrier}.observed`);
  // Guard 3: the environment-too-slow guard witness 35 always had, and
  // this one lacked. The staged interleave requires the held child to
  // observe while the lease it observed is still the current one.
  assert.ok(
    existsSync(lockFile(fleet)),
    "environment too slow: the lease vanished before the held release observed it, rerun",
  );
  const takeover = runCli(["lock", "acquire", "--take-over"], { cwd: fleet });
  assert.equal(takeover.status, 0, takeover.stderr);
  const winnerRaw = readLease(fleet).raw;
  writeFileSync(barrier, "");
  const releaseResult = await heldRelease;
  assertHeld(barrier, "release versus takeover");
  // Guard 3: file state first, for the same reason as above.
  assert.ok(
    existsSync(lockFile(fleet)),
    `expired former holder removed the new lease: ${childDetail("release", releaseResult)}`,
  );
  assert.equal(
    readLease(fleet).raw,
    winnerRaw,
    `winner lease removed or altered: ${childDetail("release", releaseResult)}`,
  );
  assert.notEqual(
    releaseResult.status,
    0,
    `expired former holder removed the new lease: ${childDetail("release", releaseResult)}`,
  );
  assert.match(releaseResult.stderr, /lost/);
});

test("a takeover racing a release loses when the release applies first and its observed lease is gone", async (t) => {
  // EXT-F-01 witness, release versus takeover, outcome release-first.
  const fleet = initFleet(t);
  const tmp = makeTempDir(t);
  const { holderId } = acquire(fleet, ["--duration", "1"]);
  await waitPastExpiry(fleet);
  const barrier = join(tmp, "takeover-barrier");
  const heldTakeover = spawnCli(["lock", "acquire", "--take-over"], {
    cwd: fleet,
    env: { ...process.env, TIPHYS_LOCK_TEST_HOLD: barrier },
  });
  await waitForFile(`${barrier}.observed`);
  // Guard 3: environment-too-slow guard, previously absent here too.
  assert.ok(
    existsSync(lockFile(fleet)),
    "environment too slow: the lease vanished before the held takeover observed it, rerun",
  );
  const release = runCli(["lock", "release", "--holder", holderId], { cwd: fleet });
  assert.equal(release.status, 0, release.stderr);
  assert.ok(!existsSync(lockFile(fleet)), "release left the lock file behind");
  writeFileSync(barrier, "");
  const takeoverResult = await heldTakeover;
  assertHeld(barrier, "takeover versus release");
  // Guard 3: file state first.
  assert.ok(
    !existsSync(lockFile(fleet)),
    `the losing takeover left a lease behind: ${childDetail("takeover", takeoverResult)}`,
  );
  assert.notEqual(
    takeoverResult.status,
    0,
    `takeover won against a completed release: ${childDetail("takeover", takeoverResult)}`,
  );
  assert.match(takeoverResult.stderr, /gone|lost/);
});

test("after a takeover any mutation with the losing holder id is refused and the winner lease is byte-identical", async (t) => {
  // EXT-F-01 witness: mutation with the losing holder id.
  const fleet = initFleet(t);
  const first = acquire(fleet, ["--duration", "1"]);
  await waitPastExpiry(fleet);
  const takeover = runCli(["lock", "acquire", "--take-over"], { cwd: fleet });
  assert.equal(takeover.status, 0, takeover.stderr);
  const winnerRaw = readLease(fleet).raw;
  const staleRenew = runCli(["lock", "renew", "--holder", first.holderId], { cwd: fleet });
  assert.notEqual(staleRenew.status, 0);
  assert.equal(readLease(fleet).raw, winnerRaw);
  const staleRelease = runCli(["lock", "release", "--holder", first.holderId], { cwd: fleet });
  assert.notEqual(staleRelease.status, 0);
  assert.equal(readLease(fleet).raw, winnerRaw);
});

test("lock release by the holder removes the lease and frees the lock", (t) => {
  const fleet = initFleet(t);
  const { holderId } = acquire(fleet);
  const release = runCli(["lock", "release", "--holder", holderId], { cwd: fleet });
  assert.equal(release.status, 0, release.stderr);
  assert.ok(!existsSync(lockFile(fleet)));
  const status = runCli(["lock", "status"], { cwd: fleet });
  assert.equal(status.status, 0);
  assert.match(status.stdout, /^free$/m);
  assert.equal(runCli(["lock", "acquire"], { cwd: fleet }).status, 0);
});

test("lock status reports held with holder acquired and expires fields", (t) => {
  const fleet = initFleet(t);
  const { holderId } = acquire(fleet);
  const status = runCli(["lock", "status"], { cwd: fleet });
  assert.equal(status.status, 0);
  assert.match(
    status.stdout,
    new RegExp(`^held holder ${holderId} acquired \\S+ expires \\S+$`, "m"),
  );
});

test("src/lock.ts contains no process probing and no pid identity", () => {
  // C-2 structural inspection (criterion 10): no process.kill, no
  // signal-0 probing, no /proc access, no pid field.
  const source = readFileSync(lockSourcePath, "utf8");
  assert.doesNotMatch(source, /pid/i);
  assert.doesNotMatch(source, /process\.kill/);
  assert.doesNotMatch(source, /\/proc/);
  assert.doesNotMatch(source, /\bkill\b/i);
  assert.doesNotMatch(source, /signal/i);
});

test("a stranded stage file is cleaned by the next mutation of any kind", async (t) => {
  // CR-202: a mutation that dies between its stage write and its rename
  // strands the stage path. The claim-held sweep removes it whatever
  // the next mutation does, including the release and absent-lock
  // acquire paths, which never touch the stage themselves.
  const fleet = initFleet(t);
  const stagePath = `${lockFile(fleet)}.stage`;
  const strand = "stranded stage content that no mutation wrote\n";

  // Rename-branch mutation (renew).
  const first = acquire(fleet);
  writeFileSync(stagePath, strand);
  const renewed = runCli(["lock", "renew", "--holder", first.holderId], { cwd: fleet });
  assert.equal(renewed.status, 0, renewed.stderr);
  assert.ok(!existsSync(stagePath), "strand survived a renew");
  assert.equal(readLease(fleet).lease.holderId, first.holderId, "renew was affected");

  // Removal-path mutation (release): never writes a stage at all.
  writeFileSync(stagePath, strand);
  const released = runCli(["lock", "release", "--holder", first.holderId], { cwd: fleet });
  assert.equal(released.status, 0, released.stderr);
  assert.ok(!existsSync(stagePath), "strand survived a release");
  assert.ok(!existsSync(lockFile(fleet)), "release was affected");

  // Absent-lock O_EXCL path (acquire): likewise never writes a stage.
  writeFileSync(stagePath, strand);
  const reacquired = runCli(["lock", "acquire"], { cwd: fleet });
  assert.equal(reacquired.status, 0, reacquired.stderr);
  assert.ok(!existsSync(stagePath), "strand survived an acquire");
  assert.equal(
    readLease(fleet).lease.holderId,
    parseAcquired(reacquired.stdout).holderId,
    "acquire was affected",
  );

  // The lease never contains strand bytes: a strand is discarded, never
  // renamed into place.
  assert.doesNotMatch(readLease(fleet).raw, /stranded stage content/);
});

test("a stuck claim file reports the lease situation and names the claim file", async (t) => {
  // CR-204: the timeout diagnostic must not say "lock held" when there
  // is no lease, and must name the claim file either way.
  const fleet = initFleet(t);
  const claimPath = `${lockFile(fleet)}.mutex`;

  // No lease present: acquire blocked by a planted claim file.
  writeFileSync(claimPath, "planted by a crashed mutation");
  const noLease = runCli(["lock", "acquire"], { cwd: fleet });
  assert.notEqual(noLease.status, 0);
  assert.match(noLease.stderr, /no lease, no live holder; stale claim file /);
  assert.ok(noLease.stderr.includes(claimPath), noLease.stderr);
  assert.doesNotMatch(noLease.stderr, /lock held/);
  rmSync(claimPath);

  // Lease present and unexpired: the same timeout names the holder.
  const { holderId } = acquire(fleet);
  writeFileSync(claimPath, "planted by a crashed mutation");
  const held = runCli(["lock", "renew", "--holder", holderId], { cwd: fleet });
  assert.notEqual(held.status, 0);
  assert.match(held.stderr, new RegExp(`lock held by ${holderId}; stale claim file `));
  assert.ok(held.stderr.includes(claimPath), held.stderr);
  // U-1: renew is the recurring operation (half-life renewal), so it is
  // the one most likely to meet a stale claim in production, and it had
  // no regression guard at all: deleting renew's claimTimeout branch
  // left the suite green. These two assertions are that guard. The
  // remedy clause only survives if renewLease propagates the flag, and
  // the anchored negative catches the re-wrapped "renew <reason>" form.
  assert.match(
    held.stderr,
    /confirm no tiphys process is running against this fleet before removing it/,
    "renew lost the claim-file remedy: the claimTimeout flag is not propagating",
  );
  assert.doesNotMatch(
    held.stderr,
    /^tiphys lock: renew /m,
    "renew re-wrapped a claim timeout as an ordinary renew failure",
  );
  rmSync(claimPath);
});

test("a stale claim with no lease names the claim file and no live holder in every lease operation", (t) => {
  // CR-204 (owner reviewer): the claim-timeout classification must
  // reach the operator through acquire, renew AND release, never as
  // "lock held", and each must carry the claim-file remedy that the
  // CLI adds from the classification flag.
  const fleet = initFleet(t);
  const claimPath = `${lockFile(fleet)}.mutex`;
  writeFileSync(claimPath, "planted by a crashed mutation");
  t.after(() => {
    rmSync(claimPath, { force: true });
  });

  // Operations that reach the mutation primitive with no lease: the
  // stale claim is what blocks them, and that is what they must say.
  for (const [label, args] of [
    ["acquire", ["lock", "acquire"]],
    ["acquire --take-over", ["lock", "acquire", "--take-over"]],
  ] as [string, string[]][]) {
    const result = runCli(args, { cwd: fleet });
    assert.equal(result.status, 1, `${label}: expected exit 1, got ${String(result.status)}`);
    // The classification, not a phantom holder.
    assert.match(
      result.stderr,
      /no lease, no live holder; stale claim file /,
      `${label} did not report the stale claim: ${result.stderr}`,
    );
    assert.doesNotMatch(result.stderr, /lock held/, `${label} reported a phantom holder`);
    // The claim file itself, so the operator knows what to inspect.
    assert.ok(result.stderr.includes(claimPath), `${label} did not name the claim file`);
    // The remedy the CLI appends from the classification flag.
    assert.match(
      result.stderr,
      /confirm no tiphys process is running against this fleet before removing it/,
      `${label} lost the claim-file remedy`,
    );
    assert.equal(
      result.stderr.trim().split("\n").length,
      1,
      `${label} emitted more than one reason line: ${result.stderr}`,
    );
  }

  // renew and release with no lease refuse before any mutation is
  // attempted, so a claim file is not what stops them. They must still
  // never invent a holder; their refusal names the real reason.
  for (const [label, args] of [
    ["renew", ["lock", "renew", "--holder", "some-holder"]],
    ["release", ["lock", "release", "--holder", "some-holder"]],
  ] as [string, string[]][]) {
    const result = runCli(args, { cwd: fleet });
    assert.equal(result.status, 1, `${label}: expected exit 1`);
    assert.match(result.stderr, /no lease present/, `${label}: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /lock held/, `${label} reported a phantom holder`);
  }

  // The blocked operations changed nothing: still no lease.
  assert.ok(!existsSync(lockFile(fleet)), "a blocked operation created a lease");
  const status = runCli(["lock", "status"], { cwd: fleet });
  assert.equal(status.status, 0);
  assert.match(status.stdout, /^free$/m);
});

test("release and takeover also carry the stale-claim classification to the operator", async (t) => {
  // CR-204 (owner reviewer): renew is witnessed by the diagnostic test
  // above; this covers the other two operations at the point where
  // they actually reach the mutation primitive, so all three carry the
  // classification through their own CLI path.
  const fleet = initFleet(t);
  const claimPath = `${lockFile(fleet)}.mutex`;
  t.after(() => {
    rmSync(claimPath, { force: true });
  });

  // release with a matching, genuinely unexpired holder reaches the
  // primitive; the lease really is held, so that is what it says. The
  // duration must outlast the 5s claim wait, otherwise the lease
  // expires while the release is blocked and the message correctly
  // switches to the expired wording asserted below.
  const held = acquire(fleet, ["--duration", "3600"]);
  writeFileSync(claimPath, "planted by a crashed mutation");
  const released = runCli(["lock", "release", "--holder", held.holderId], { cwd: fleet });
  assert.equal(released.status, 1);
  assert.match(released.stderr, new RegExp(`lock held by ${held.holderId}; stale claim file `));
  assert.match(released.stderr, /confirm no tiphys process is running against this fleet before removing it/);
  assert.ok(released.stderr.includes(claimPath), released.stderr);

  // U-6: once the lease has expired, the diagnostic must not keep
  // calling it held. lock status in the same fleet says "expired", and
  // two commands contradicting each other about the same lease is the
  // weaker form of exactly what CR-204 was raised about.
  rmSync(claimPath);
  assert.equal(runCli(["lock", "release", "--holder", held.holderId], { cwd: fleet }).status, 0);
  const expiring = acquire(fleet, ["--duration", "1"]);
  await waitPastExpiry(fleet);
  const status = runCli(["lock", "status"], { cwd: fleet });
  assert.equal(status.status, 0);
  assert.match(status.stdout, /^expired holder /m);

  writeFileSync(claimPath, "planted by a crashed mutation");
  const takeover = runCli(["lock", "acquire", "--take-over"], { cwd: fleet });
  assert.equal(takeover.status, 1);
  assert.match(
    takeover.stderr,
    new RegExp(`expired lease from ${expiring.holderId}; stale claim file `),
    "an expired lease must not be reported as held while status calls it expired",
  );
  assert.doesNotMatch(
    takeover.stderr,
    /lock held by/,
    "the diagnostic contradicts lock status about the same lease",
  );
  assert.match(takeover.stderr, /confirm no tiphys process is running against this fleet before removing it/);
  assert.doesNotMatch(takeover.stderr, /lock held \(/, "reason was re-wrapped as a held lease");

  // The lease is untouched by either blocked operation.
  assert.equal(readLease(fleet).lease.holderId, expiring.holderId);
});

test("an initial acquire never publishes a half-written lease", async (t) => {
  // D-1: writeFileSync with flag "wx" is an O_EXCL open followed by a
  // SEPARATE write, so the lock file name became visible at length zero
  // before the lease bytes landed. Readers outside the claim (lock
  // status, doctor, and every mutation's own observe) then reported a
  // healthy fleet as corrupt, which turned acceptance criterion 3's own
  // witness red on pristine code. A reader in another process is the
  // only way to see the window, because nothing else runs in this one
  // while writeFileSync is executing.
  const fleet = initFleet(t);
  const lockPath = lockFile(fleet);
  const cycles = 60;
  const readerSource = `
    const fs = require("node:fs");
    const lockPath = process.argv[1];
    const deadline = Date.now() + 25000;
    let corrupt = 0;
    let seen = 0;
    let gone = 0;
    // Stop once the writer has finished its cycles (it removes the lock
    // for the last time and then creates a done marker), or on the cap.
    while (Date.now() < deadline && !fs.existsSync(lockPath + ".done")) {
      let raw;
      try {
        raw = fs.readFileSync(lockPath, "utf8");
      } catch {
        gone += 1;
        continue;
      }
      seen += 1;
      if (raw === "") { corrupt += 1; continue; }
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.holderId !== "string" || parsed.holderId === "") corrupt += 1;
      } catch { corrupt += 1; }
    }
    process.stdout.write(JSON.stringify({ corrupt, seen, gone }));
  `;
  const reader = spawn(process.execPath, ["-e", readerSource, lockPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let readerOut = "";
  reader.stdout.on("data", (c: Buffer) => {
    readerOut += c.toString("utf8");
  });
  const readerDone = new Promise<void>((resolvePromise) => {
    reader.on("close", () => {
      resolvePromise();
    });
  });

  // Churn the absent-lock acquire path, which is the only publish that
  // was not already atomic. Yield between cycles so the reader process
  // actually gets scheduled on a busy box.
  for (let i = 0; i < cycles; i += 1) {
    const acquired = await lockLib.acquireLease(lockPath, { durationSeconds: 3600 });
    assert.equal(acquired.ok, true, acquired.reason ?? "");
    const holderId = (acquired.lease as LeaseShape).holderId;
    // Yield while the lease is published, so the reader is scheduled
    // against a present file and its "seen" count is meaningful.
    await sleep(2);
    const released = await lockLib.releaseLease(lockPath, holderId);
    assert.equal(released.ok, true, released.reason ?? "");
  }
  writeFileSync(`${lockPath}.done`, "");
  t.after(() => {
    rmSync(`${lockPath}.done`, { force: true });
  });
  await readerDone;
  const counts = JSON.parse(
    readerOut === "" ? '{"corrupt":0,"seen":0,"gone":0}' : readerOut,
  ) as { corrupt: number; seen: number; gone: number };
  assert.ok(
    counts.seen > 0,
    `the reader never observed a published lease (gone ${String(counts.gone)}), so this witness proves nothing`,
  );
  assert.equal(
    counts.corrupt,
    0,
    `a concurrent reader saw ${String(counts.corrupt)} half-published leases in ${String(counts.seen)} reads of a published lease`,
  );
});

test("the test hold seam fails loudly when the interleave was never staged", (t) => {
  // D-3: a seam that returns silently on the not-held exit lets a
  // witness score a compare-and-swap it never ran. Pre-creating the
  // barrier forces the never-held state; the command must refuse to
  // pretend it held. This is a test-integrity guard, not a fix for the
  // unattributed U-2 flake.
  const fleet = initFleet(t);
  const barrier = join(makeTempDir(t), "prestaged-barrier");
  writeFileSync(barrier, "");
  const result = runCli(["lock", "acquire"], {
    cwd: fleet,
    env: { ...process.env, TIPHYS_LOCK_TEST_HOLD: barrier },
  });
  assert.notEqual(result.status, 0, "the seam silently proceeded without holding");
  assert.match(result.stderr, /already existed before the hold/);
  assert.match(result.stderr, /not evidence/);
  assert.ok(!existsSync(lockFile(fleet)), "a never-staged run still mutated the lease");
});

test("lock subcommand usage errors exit 64", (t) => {
  const fleet = initFleet(t);
  assert.equal(runCli(["lock"], { cwd: fleet }).status, 64);
  assert.equal(runCli(["lock", "no-such"], { cwd: fleet }).status, 64);
  assert.equal(runCli(["lock", "renew"], { cwd: fleet }).status, 64);
  assert.equal(runCli(["lock", "release"], { cwd: fleet }).status, 64);
  assert.equal(runCli(["lock", "acquire", "--duration", "zero"], { cwd: fleet }).status, 64);
  const outside = runCli(["lock", "status"], { cwd: makeTempDir(t) });
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /not a fleet home/);
});
