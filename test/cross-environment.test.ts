import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M4-P20: the CROSS-ENVIRONMENT DOUBLE-ACQUIRE WITNESSES (kernel plan M4,
 * section 4.2, M4-P20 criteria 4 and 5).
 *
 * WHAT THIS FILE IS, AND WHY IT EXISTS BEFORE THE MECHANISM.
 *
 * `src/lock.ts` states its own exclusion domain honestly at src/lock.ts:63:
 * the lease excludes within ONE filesystem and ONE clock, and
 * cross-environment exclusion for a fleet shared through a git remote is M4
 * residue and is NOT claimed. There is no defect in `lock.ts` to fix here.
 * M4-P21 adds a second layer above it.
 *
 * The red-witness rule's stronger form says a test must be red against the
 * DANGEROUS STATE, not merely against an absent feature. The dangerous
 * state here EXISTS TODAY and is reachable, so this phase builds the
 * witnesses FIRST, against today's code, before any exclusion layer exists
 * to make them green for the wrong reason.
 *
 * THE DANGEROUS STATE, in one sentence: two environments cloning one fleet
 * remote each get their OWN `state/orchestrator.lock`, and BOTH acquire
 * successfully, because `state/` is gitignored (src/fleet.ts:28) so the
 * lease artifact never travels.
 *
 * THE FOUR GROUPS IN THIS FILE, and the trade-off is stated rather than
 * left to be inferred.
 *
 *   1. THE PRECONDITION and its two failure members. A prior probe of this
 *      same question reported that both environments held the lease at a
 *      moment when neither lock directory existed, because it never
 *      asserted the setup it depended on. Nothing below trusts a result
 *      until `sameFleetPrecondition` has said the two homes really are two
 *      clones of one remote at one head, and that predicate is itself
 *      demonstrated FAILING under two structurally different mismatches
 *      before any witness relies on it.
 *
 *   2. THE DANGEROUS-STATE PINS, members A and B. These are GREEN TODAY.
 *      They assert that the double acquire really does happen, with both
 *      holder ids, both lock files on disk and both leases unexpired. They
 *      are not the guard: they are the measurement, and they are written as
 *      assertions so that the day the mechanism lands they go RED and force
 *      the change to be acknowledged rather than absorbed.
 *
 *   3. THE PROPERTY WITNESSES, members A and B. These assert what must
 *      become true: at most ONE of the two environments ends up holding a
 *      live lease.
 *
 *      M4-P21 LANDED AND THEY ARE NOW GREEN, WHICH IS WHY THE GATE AND ITS
 *      EXPIRY GUARD ARE GONE. They ran SKIPPED while `src/exclusion.ts` did
 *      not exist, and a fourth group existed solely to redden the day the
 *      module landed so the skip could not outlive the thing it waited for.
 *      That day came: the gate, the `skip: witnessGate` options and the
 *      expiry guard were removed together in the phase that built the
 *      mechanism, and the two witnesses below now run on every suite.
 *
 *      WHAT CHANGED IN THEM, and it is the only change: each environment is
 *      made to DECLARE the shared exclusion layer, because M4-P21 criterion
 *      1 makes it opt-in per fleet home. A witness for an opt-in mechanism
 *      has to opt in, and group 2 is what asserts that the DEFAULT is still
 *      today's behaviour. So the two groups now measure the two sides of
 *      one switch rather than the same side twice.
 *
 * C-2 (binding): nothing in this file reads a pid, probes process liveness,
 * sends a signal, or reads /proc. Every observation is a file on disk, a
 * git exit code, or a value returned by `lock.ts`.
 *
 * Standing warning 9 (CLAUDE.md): `-C` changes where git RESOLVES, not where
 * the shell stands. Every FILESYSTEM path handed to git here is absolute. The
 * two relative strings below, `state/orchestrator.lock` and
 * `charter/divergence.md`, are repository-relative PATHSPECS, which is the
 * form `check-ignore` and `add` want, and they are correct precisely because
 * git resolves them against the repository the `-C` names.
 *
 * Standing warning 5: git identity is command-scoped, never global.
 */

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

/**
 * The module M4-P21 added (kernel plan M4, M4-P21's files-to-touch list).
 * Group 3 was gated on its absence and is no longer gated on anything; the
 * constant remains so the two witnesses below can state, in the assertion
 * message a failure prints, which mechanism they are measuring.
 */
const exclusionModule = fileURLToPath(
  new URL("../src/exclusion.ts", import.meta.url),
);

interface LeaseShape {
  holderId: string;
  hostname: string;
  acquiredAt: string;
  expiresAt: string;
  durationSeconds: number;
  token: string;
}

interface OutcomeShape {
  ok: boolean;
  reason?: string;
  lease?: LeaseShape | null;
}

/**
 * Unit import through a computed URL: a literal relative import from test/
 * into src/ crosses the project-reference boundary and fails the build
 * under rewriteRelativeImportExtensions (TS2878, CLAUDE.md standing
 * warning 4). The runtime module is the same source file either way.
 */
const lockLib = (await import(
  new URL("../src/lock.ts", import.meta.url).href
)) as {
  acquireLease(
    lockPath: string,
    options?: { durationSeconds?: number; nowMs?: number },
  ): Promise<OutcomeShape>;
  isExpired(lease: LeaseShape, nowMs: number): boolean;
};

interface Ctx {
  after(fn: () => void): void;
}

function makeTempDir(t: Ctx): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-xenv-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): RunResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * Command-scoped git identity and transport settings. CI runners carry no
 * git identity (standing warning 5) and this suite must never touch user or
 * global config. `push.negotiate` is forced off because this container's
 * global config sets it true, which makes git 2.43.0 print a negotiation
 * failure on every file-transport push, accepted or refused alike.
 */
const GIT_FLAGS = [
  "-c",
  "user.name=tiphys-test",
  "-c",
  "user.email=test@tiphys.invalid",
  "-c",
  "commit.gpgsign=false",
  "-c",
  "protocol.file.allow=always",
  "-c",
  "push.negotiate=false",
];

function git(cwd: string, args: string[]): RunResult {
  const result = spawnSync("git", ["-C", cwd, ...GIT_FLAGS, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "tiphys-test",
      GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
      GIT_COMMITTER_NAME: "tiphys-test",
      GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitOk(cwd: string, args: string[]): string {
  const result = git(cwd, args);
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} in ${cwd} exited ${String(result.status)}: ${result.stderr}`,
  );
  return result.stdout.trim();
}

/**
 * THE PRECONDITION. Two directories are two environments of ONE fleet only
 * if they name the same origin and stand at the same commit. Returned as a
 * value rather than thrown so the failure members below can assert on the
 * REASON, which is what makes the predicate itself falsifiable.
 */
interface PreconditionResult {
  ok: boolean;
  reason: string;
  originA: string;
  originB: string;
  headA: string;
  headB: string;
}

function sameFleetPrecondition(homeA: string, homeB: string): PreconditionResult {
  const originA = gitOk(homeA, ["remote", "get-url", "origin"]);
  const originB = gitOk(homeB, ["remote", "get-url", "origin"]);
  const headA = gitOk(homeA, ["rev-parse", "HEAD"]);
  const headB = gitOk(homeB, ["rev-parse", "HEAD"]);
  if (originA !== originB) {
    return {
      ok: false,
      reason: `origin url mismatch: ${originA} vs ${originB}`,
      originA,
      originB,
      headA,
      headB,
    };
  }
  if (headA !== headB) {
    return {
      ok: false,
      reason: `head mismatch: ${headA} vs ${headB}`,
      originA,
      originB,
      headA,
      headB,
    };
  }
  return {
    ok: true,
    reason: `same origin ${originA} at head ${headA}`,
    originA,
    originB,
    headA,
    headB,
  };
}

/** A bare repository standing in for the fleet remote, at an absolute path. */
function makeBareRemote(root: string, name: string): string {
  const remote = join(root, name);
  mkdirSync(remote, { recursive: true });
  const init = spawnSync(
    "git",
    ["-C", remote, ...GIT_FLAGS, "init", "--bare", "--initial-branch=main", "--quiet"],
    { encoding: "utf8" },
  );
  assert.equal(init.status, 0, init.stderr ?? "");
  return remote;
}

/**
 * Build a real fleet home with the kernel's own `init`, then publish it to
 * a bare remote. Using the CLI rather than hand-building a repository is
 * deliberate: the `.gitignore` that makes `state/` untravelable is the
 * kernel's (src/fleet.ts:28), not this test's, so the witness measures the
 * shipped layout.
 */
function publishFleet(root: string, remote: string): string {
  const source = join(root, "fleet-source");
  const init = runCli(["init", source]);
  assert.equal(init.status, 0, init.stderr);
  gitOk(source, ["remote", "add", "origin", remote]);
  gitOk(source, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
  return source;
}

function cloneFleet(root: string, remote: string, name: string): string {
  const target = join(root, name);
  const result = spawnSync(
    "git",
    ["-C", root, ...GIT_FLAGS, "clone", "--quiet", remote, target],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr ?? "");
  return target;
}

function lockPathFor(home: string): string {
  return join(home, "state", "orchestrator.lock");
}

/**
 * Create the `state/` directory a cloned fleet home does not receive, and
 * ASSERT that it was absent first. The absence is the evidence that the
 * lease cannot travel; creating the directory without asserting the absence
 * is exactly the step that made an earlier probe of this question report a
 * result about directories that did not exist.
 */
function prepareStateDir(home: string): void {
  const stateDir = join(home, "state");
  assert.equal(
    existsSync(stateDir),
    false,
    `a freshly cloned fleet home must not carry state/, but ${stateDir} exists`,
  );
  const ignored = git(home, ["check-ignore", "--quiet", "state/orchestrator.lock"]);
  assert.equal(
    ignored.status,
    0,
    "state/orchestrator.lock must be gitignored in a real fleet home " +
      `(src/fleet.ts:28); git check-ignore exited ${String(ignored.status)}`,
  );
  mkdirSync(stateDir, { recursive: true });
}

function readLeaseFile(home: string): LeaseShape {
  return JSON.parse(readFileSync(lockPathFor(home), "utf8")) as LeaseShape;
}

/**
 * Assert that a home really does hold a live lease: the outcome said so,
 * the file is on disk, its holder id matches the returned one, and the
 * lease has not expired. Four facts, because "ok: true" alone is what the
 * earlier probe reported while nothing was on disk.
 */
function assertHoldsLiveLease(home: string, outcome: OutcomeShape): string {
  assert.equal(outcome.ok, true, `expected an acquire in ${home} to succeed`);
  const holderId = outcome.lease?.holderId;
  assert.equal(typeof holderId, "string", "a won acquire returns its lease");
  assert.equal(
    existsSync(lockPathFor(home)),
    true,
    `${lockPathFor(home)} must exist after a won acquire`,
  );
  const onDisk = readLeaseFile(home);
  assert.equal(onDisk.holderId, holderId);
  assert.equal(
    lockLib.isExpired(onDisk, Date.now()),
    false,
    "a freshly acquired lease must not already be expired",
  );
  return onDisk.holderId;
}

/* ================================================================== */
/* GROUP 1: the precondition, and both of its failure members.         */
/* ================================================================== */

test("the same-fleet precondition refuses two clones of different remotes", (t) => {
  const root = makeTempDir(t);
  const remoteOne = makeBareRemote(root, "one.git");
  const remoteTwo = makeBareRemote(root, "two.git");
  publishFleet(root, remoteOne);

  // The second remote gets its own fleet, so both clones are valid fleet
  // homes and the ONLY thing wrong is that they are not the same fleet.
  const secondSource = join(root, "fleet-source-two");
  const init = runCli(["init", secondSource]);
  assert.equal(init.status, 0, init.stderr);
  gitOk(secondSource, ["remote", "add", "origin", remoteTwo]);
  gitOk(secondSource, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);

  const homeA = cloneFleet(root, remoteOne, "env-a");
  const homeB = cloneFleet(root, remoteTwo, "env-b");

  const precondition = sameFleetPrecondition(homeA, homeB);
  assert.equal(
    precondition.ok,
    false,
    `the precondition must refuse two different remotes, got: ${precondition.reason}`,
  );
  assert.match(precondition.reason, /^origin url mismatch: /);
  assert.notEqual(precondition.originA, precondition.originB);
});

test("the same-fleet precondition refuses two clones whose heads have diverged", (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote);

  const homeA = cloneFleet(root, remote, "env-a");
  const homeB = cloneFleet(root, remote, "env-b");

  // Same origin, so the first arm of the predicate cannot be what fires.
  const before = sameFleetPrecondition(homeA, homeB);
  assert.equal(before.ok, true, before.reason);

  writeFileSync(join(homeB, "charter", "divergence.md"), "# diverged\n", "utf8");
  gitOk(homeB, ["add", "charter/divergence.md"]);
  gitOk(homeB, ["commit", "--quiet", "-m", "diverge"]);

  const precondition = sameFleetPrecondition(homeA, homeB);
  assert.equal(
    precondition.ok,
    false,
    `the precondition must refuse a diverged head, got: ${precondition.reason}`,
  );
  assert.match(precondition.reason, /^head mismatch: /);
  assert.equal(precondition.originA, precondition.originB);
  assert.notEqual(precondition.headA, precondition.headB);
});

/* ================================================================== */
/* GROUP 2: the dangerous state, pinned. GREEN TODAY.                  */
/* ================================================================== */

test("two clones of one fleet remote both acquire their own orchestrator lease at once", async (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote);

  const homeA = cloneFleet(root, remote, "env-a");
  const homeB = cloneFleet(root, remote, "env-b");

  const precondition = sameFleetPrecondition(homeA, homeB);
  assert.equal(precondition.ok, true, precondition.reason);

  prepareStateDir(homeA);
  prepareStateDir(homeB);

  assert.notEqual(
    lockPathFor(homeA),
    lockPathFor(homeB),
    "the two environments hold two different lock paths, which is the mechanism",
  );

  // Both acquires are in flight before either resolves. The concurrency is
  // real and it is NOT what makes both succeed: they succeed because the
  // two lock paths are unrelated files. Both facts are asserted.
  const [outcomeA, outcomeB] = await Promise.all([
    lockLib.acquireLease(lockPathFor(homeA)),
    lockLib.acquireLease(lockPathFor(homeB)),
  ]);

  const holderA = assertHoldsLiveLease(homeA, outcomeA);
  const holderB = assertHoldsLiveLease(homeB, outcomeB);
  assert.notEqual(
    holderA,
    holderB,
    "two environments produced the same holder id, which would mean the setup collapsed",
  );

  // Neither environment can see the other's lease through the fleet remote.
  assert.equal(gitOk(homeA, ["status", "--porcelain"]), "");
  assert.equal(gitOk(homeB, ["status", "--porcelain"]), "");
});

test("a fleet clone made from a pushed fleet acquires a second live lease invisible to the first", async (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote);

  const homeA = cloneFleet(root, remote, "env-a");
  prepareStateDir(homeA);
  const outcomeA = await lockLib.acquireLease(lockPathFor(homeA));
  const holderA = assertHoldsLiveLease(homeA, outcomeA);

  /* Environment A now publishes EVERYTHING git will let it publish. The
     empty `status --porcelain` after the push is the falsifiable form of
     "there is nothing left it could have shared": the lease is not
     withheld, it is unshareable. */
  writeFileSync(join(homeA, "charter", "held.md"), "# holder note\n", "utf8");
  gitOk(homeA, ["add", "-A"]);
  gitOk(homeA, ["commit", "--quiet", "-m", "publish everything this environment can"]);
  gitOk(homeA, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);
  assert.equal(
    gitOk(homeA, ["status", "--porcelain"]),
    "",
    "after the push the holding environment has nothing left to publish",
  );

  // Environment B is created FROM that push, not alongside it.
  const homeB = cloneFleet(root, remote, "env-b");
  const precondition = sameFleetPrecondition(homeA, homeB);
  assert.equal(precondition.ok, true, precondition.reason);
  assert.equal(
    precondition.headA,
    precondition.headB,
    "environment B stands at exactly the commit environment A published",
  );

  // The published tree carries the holder's own note and not its lease.
  assert.equal(existsSync(join(homeB, "charter", "held.md")), true);
  prepareStateDir(homeB);

  const outcomeB = await lockLib.acquireLease(lockPathFor(homeB));
  const holderB = assertHoldsLiveLease(homeB, outcomeB);

  assert.notEqual(holderA, holderB);
  // Both leases are live at the same instant, in one fleet, at one head.
  const nowMs = Date.now();
  assert.equal(lockLib.isExpired(readLeaseFile(homeA), nowMs), false);
  assert.equal(lockLib.isExpired(readLeaseFile(homeB), nowMs), false);
});

/**
 * Opt in to the shared exclusion register in one environment's own fleet
 * home (M4-P21 criterion 1: declaration, never inference). The field is the
 * one `tiphys init --shared-exclusion` writes and `src/exclusion.ts` reads.
 */
function declareSharedExclusion(home: string): void {
  const path = join(home, "package.json");
  const document = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  document["tiphys"] = { sharedExclusion: true };
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

/* ================================================================== */
/* GROUP 3: the property witnesses. GREEN since M4-P21, ungated.       */
/* ================================================================== */

test(
  "cross-environment exclusion allows at most one live lease when two clones acquire at once",
  async (t) => {
    const root = makeTempDir(t);
    const remote = makeBareRemote(root, "fleet.git");
    publishFleet(root, remote);

    const homeA = cloneFleet(root, remote, "env-a");
    const homeB = cloneFleet(root, remote, "env-b");
    const precondition = sameFleetPrecondition(homeA, homeB);
    assert.equal(precondition.ok, true, precondition.reason);

    prepareStateDir(homeA);
    prepareStateDir(homeB);
    declareSharedExclusion(homeA);
    declareSharedExclusion(homeB);

    const [outcomeA, outcomeB] = await Promise.all([
      lockLib.acquireLease(lockPathFor(homeA)),
      lockLib.acquireLease(lockPathFor(homeB)),
    ]);

    const winners = [outcomeA, outcomeB].filter((outcome) => outcome.ok);
    assert.equal(
      winners.length,
      1,
      `exactly one environment may hold the fleet lease (mechanism ${exclusionModule}); ` +
        `A ok=${String(outcomeA.ok)} B ok=${String(outcomeB.ok)}`,
    );
    // The loser holds no local lease either: the refusal happens before the
    // lock file is written, which is what makes the layer fail closed.
    const loser = outcomeA.ok ? homeB : homeA;
    assert.equal(existsSync(lockPathFor(loser)), false);
  },
);

test(
  "cross-environment exclusion allows at most one live lease for a clone made from a pushed fleet",
  async (t) => {
    const root = makeTempDir(t);
    const remote = makeBareRemote(root, "fleet.git");
    publishFleet(root, remote);

    const homeA = cloneFleet(root, remote, "env-a");
    prepareStateDir(homeA);
    // A declares the layer BEFORE it acquires and then publishes the
    // declaration, so environment B inherits the opt-in the way a real
    // second environment would: from the fleet's own tracked package.json.
    declareSharedExclusion(homeA);
    const outcomeA = await lockLib.acquireLease(lockPathFor(homeA));
    assert.equal(outcomeA.ok, true, "the first environment acquires");

    writeFileSync(join(homeA, "charter", "held.md"), "# holder note\n", "utf8");
    gitOk(homeA, ["add", "-A"]);
    gitOk(homeA, ["commit", "--quiet", "-m", "publish everything this environment can"]);
    gitOk(homeA, ["push", "--quiet", "origin", "HEAD:refs/heads/main"]);

    const homeB = cloneFleet(root, remote, "env-b");
    const precondition = sameFleetPrecondition(homeA, homeB);
    assert.equal(precondition.ok, true, precondition.reason);
    prepareStateDir(homeB);
    // The opt-in travelled in the published package.json, so B does not have
    // to be told: asserted, rather than re-declared here, because a second
    // declaration would hide it if it had not.
    const published = JSON.parse(
      readFileSync(join(homeB, "package.json"), "utf8"),
    ) as { tiphys?: { sharedExclusion?: unknown } };
    assert.equal(published.tiphys?.sharedExclusion, true);

    const outcomeB = await lockLib.acquireLease(lockPathFor(homeB));
    assert.equal(
      outcomeB.ok,
      false,
      `an environment cloned from a fleet whose lease is held must be refused ` +
        `(mechanism ${exclusionModule})`,
    );
    assert.equal(existsSync(lockPathFor(homeB)), false);
  },
);

/**
 * THE ANTI-VACUITY CONTROL FOR GROUP 3, and it is not optional.
 *
 * The two witnesses above are gated and therefore do not run today, so a
 * reader has no way to tell "red because the mechanism is missing" from
 * "red because the assertion is unsatisfiable by any code". This control
 * runs the SAME assertion shape, `exactly one winner`, against the one
 * place where exclusion already holds: two acquires against ONE lock path,
 * inside one filesystem, which is precisely the domain src/lock.ts:63
 * claims. It is GREEN today. So the assertion the gated witnesses make is
 * satisfiable by real code, and what they are waiting for is the mechanism
 * rather than a different assertion.
 */
test("the at-most-one-live-lease assertion is satisfiable within one fleet home", async (t) => {
  const root = makeTempDir(t);
  const remote = makeBareRemote(root, "fleet.git");
  publishFleet(root, remote);

  const home = cloneFleet(root, remote, "env-a");
  prepareStateDir(home);

  const [first, second] = await Promise.all([
    lockLib.acquireLease(lockPathFor(home)),
    lockLib.acquireLease(lockPathFor(home)),
  ]);

  const winners = [first, second].filter((outcome) => outcome.ok);
  assert.equal(
    winners.length,
    1,
    "exactly one of two acquires against one lock path may win; " +
      `first ok=${String(first.ok)} second ok=${String(second.ok)}`,
  );
  assertHoldsLiveLease(home, winners[0] as OutcomeShape);
});

/* ================================================================== */
/* GROUP 4: the expiry guard, AFTER it fired.                          */
/* ================================================================== */

/**
 * THIS TEST KEEPS ITS NAME AND ITS ASSERTION IS NOW THE OPPOSITE ONE, and
 * both halves of that sentence are deliberate.
 *
 * It was written by M4-P20 to assert that `src/exclusion.ts` was still
 * ABSENT, so that the skip gating the two witnesses above could not outlive
 * the thing it waited for. M4-P21 made it fire. The obvious response, and the
 * one taken first, was to delete it and its row from `test/behaviors.json`;
 * the `suite` gate refused that, because the behavior registry is APPEND-ONLY
 * (CLAUDE.md, binding convention 5) and a deleted row is a finding. That rule
 * is right: a phase that may remove rows can retire a guard by deleting the
 * evidence that it ever existed.
 *
 * So the name stays and the guard is re-pointed at the post-expiry state. It
 * now asserts that the module IS present and that nothing in this file skips
 * on it, which is a live property rather than a historical one: re-introduce
 * a `skip:` option here, or delete the mechanism, and this reddens again.
 */
test("the cross-environment exclusion gate expires when the mechanism module lands", () => {
  assert.equal(
    existsSync(exclusionModule),
    true,
    "src/exclusion.ts is the cross-environment exclusion mechanism and the two " +
      "witnesses in group 3 assert its behaviour; if it has been removed, they " +
      "are measuring nothing and this file's history explains why",
  );
  /* The needle is the OPTIONS-OBJECT form, an opening brace then the skip
     key, and not the bare words. This file discusses the retired gate by name
     in its header and in the comment above, so a substring check for those
     words would match this file's own prose and redden forever, which is a
     guard that can only go red. Requiring the brace makes it match
     node:test's option object and nothing written about it, and it is why
     this sentence spells the form out instead of quoting it. */
  const ownSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const skipOption = /\{\s*skip:/;
  assert.equal(
    skipOption.test(ownSource),
    false,
    "the gate this test was written to expire has come back: a witness in this " +
      "file is skipped again, which is a guard that cannot go red",
  );
  /* And the control, so the needle is known to be capable of matching: the
     exact form it looks for, assembled here rather than written as a literal
     option so that this line is not itself the thing being detected. */
  assert.equal(skipOption.test(["{ ", "skip: ", "aReason }"].join("")), true);
});
