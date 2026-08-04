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
  assert.notEqual(renewResult.status, 0, "both operations won");
  assert.match(renewResult.stderr, /lost/);
  assert.equal(readLease(fleet).raw, winnerRaw, "winner lease was altered");
  assert.equal(readLease(fleet).lease.holderId, winner.holderId);

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
  const takeover = runCli(["lock", "acquire", "--take-over"], { cwd: fleet });
  assert.equal(takeover.status, 0, takeover.stderr);
  const winnerRaw = readLease(fleet).raw;
  writeFileSync(barrier, "");
  const releaseResult = await heldRelease;
  assert.notEqual(releaseResult.status, 0, "expired former holder removed the new lease");
  assert.match(releaseResult.stderr, /lost/);
  assert.equal(readLease(fleet).raw, winnerRaw, "winner lease removed or altered");
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
  const release = runCli(["lock", "release", "--holder", holderId], { cwd: fleet });
  assert.equal(release.status, 0, release.stderr);
  assert.ok(!existsSync(lockFile(fleet)), "release left the lock file behind");
  writeFileSync(barrier, "");
  const takeoverResult = await heldTakeover;
  assert.notEqual(takeoverResult.status, 0, "takeover won against a completed release");
  assert.match(takeoverResult.stderr, /gone|lost/);
  assert.ok(!existsSync(lockFile(fleet)), "the losing takeover left a lease behind");
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
