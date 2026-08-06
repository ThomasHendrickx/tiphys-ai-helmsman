import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

/**
 * THE RELEASE CONTRACT: the kernel-owned loop, the subprocess boundary and
 * the fail-closed rules (kernel plan M2, M2-P7 criteria 1, 2, 4; step 3).
 *
 * Every misbehaving adapter here is PURPOSE-BUILT for one rule and staged
 * against the dangerous state (an adapter that lies in exactly the way the
 * rule forbids), with the corrected inverse reaching its real verdict in
 * the same test. Deadlines are short and explicit; the production default
 * does not exist and could not be used (CLAUDE.md warning 11).
 *
 * Unit import through a computed URL (CLAUDE.md warning 4): a literal
 * relative import from test/ into src/ fails the build with TS2878.
 */

interface Subject {
  repository: string;
  integrationRef: string;
  mergedSha: string;
  mergedAt: string;
  phaseId: string;
}

interface AttemptRecord {
  attempt: number;
  at: string;
  outcome: string;
  detail: string;
  resolved?: unknown;
  transport: {
    exitCode: number | null;
    signal: string | null;
    terminatedByTimeout: boolean;
    httpStatus?: number;
  };
  releaseObjectOlderThanMerge?: boolean;
}

interface Verdict {
  kind: string;
  units?: number;
  reason?: string;
  detail?: string;
  lastOutcome?: string;
  declared?: boolean;
  preconditionId?: string;
}

interface Run {
  verdict: Verdict;
  attempts: AttemptRecord[];
  evidence: string[];
}

interface Clock {
  intervalMs: number;
  deadlineMs: number;
  attemptTimeoutMs: number;
  maxAttempts?: number;
}

const release = (await import(
  new URL("../src/gates/release.ts", import.meta.url).href
)) as {
  runVerification: (options: {
    verification: string;
    subject: Subject;
    adapter: string[];
    config: unknown;
    clock: Clock;
    evidenceDir: string;
    secrets?: readonly { name: string; value: string }[];
  }) => Promise<Run>;
  validateAdapterResponse: (
    body: string,
    subject: Subject,
  ) => { ok: boolean; rule?: number; reason?: string };
  OUTCOME_TO_STATUS: Record<string, string>;
  VERIFICATION_OUTCOMES: string[];
  DEADLINE_REASON_ABSENT: string;
  deadlineReasonPending: (lastObserved: string) => string;
};

const NODE = process.execPath;

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-release-"));
}

const SUBJECT: Subject = {
  repository: "example/app",
  integrationRef: "main",
  mergedSha: "1111111111111111111111111111111111111111",
  mergedAt: "2026-08-06T10:00:00Z",
  phaseId: "test-phase",
};

/**
 * Stub adapters are ordinary executables using the same boundary a third
 * party would: argv carries the request file path, the response goes to the
 * kernel-supplied recordPath. `respond` echoes the passed subject verbatim;
 * a misbehaving stub writes its own JSON instead.
 */
function writeStub(dir: string, name: string, body: string): string {
  const path = join(dir, `${name}.mjs`);
  const script = `import { readFileSync, writeFileSync } from "node:fs";
const req = JSON.parse(readFileSync(process.argv[2], "utf8"));
const respond = (extra) => writeFileSync(req.recordPath, JSON.stringify({
  contractVersion: "1", adapter: "stub", subject: req.subject,
  observedAt: new Date().toISOString(), ...extra }));
${body}
`;
  writeFileSync(path, script);
  return path;
}

const OK_SATISFIED = `respond({ outcome: "satisfied",
  resolved: { kind: "stub-object", id: "stub-1" },
  observation: { raw: { state: "ok" }, detail: "stub-state satisfied" } });`;

function clock(overrides?: Partial<Clock>): Clock {
  // Generous bounds by default: this machine runs several sibling suites
  // concurrently, and a node child can take most of a second to start
  // under contention (CLAUDE.md warning 11: budget harness timeouts,
  // never shorten the waits). Tests that exercise the deadline conversion
  // override deadlineMs downward deliberately, and assert on outcomes and
  // reasons, not on how many polls fit into a contended window.
  return {
    intervalMs: 20,
    deadlineMs: 10000,
    attemptTimeoutMs: 5000,
    ...overrides,
  };
}

async function run(
  adapterPath: string,
  options?: {
    clock?: Clock;
    subject?: Subject;
    secrets?: { name: string; value: string }[];
    evidenceDir?: string;
  },
): Promise<{ run: Run; evidenceDir: string }> {
  const evidenceDir = options?.evidenceDir ?? scratch();
  const result = await release.runVerification({
    verification: "deploy",
    subject: options?.subject ?? SUBJECT,
    adapter: [NODE, adapterPath],
    config: {},
    clock: options?.clock ?? clock(),
    evidenceDir,
    secrets: options?.secrets,
  });
  return { run: result, evidenceDir };
}

test("release loop reaches satisfied after two pending attempts with exactly three attempt records", async () => {
  const dir = scratch();
  const stub = writeStub(
    dir,
    "pending-twice",
    `if (req.attempt.number <= 2) respond({ outcome: "pending",
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: { state: "waiting" }, detail: "stub-state pending" } });
     else ${OK_SATISFIED}`,
  );
  const { run: outcome, evidenceDir } = await run(stub);
  assert.equal(outcome.verdict.kind, "satisfied");
  assert.equal(outcome.verdict.units, 1);
  assert.equal(outcome.attempts.length, 3);
  for (const [index, attempt] of outcome.attempts.entries()) {
    assert.equal(attempt.attempt, index + 1);
    assert.match(attempt.at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(attempt.outcome, index < 2 ? "pending" : "satisfied");
    assert.deepEqual(attempt.resolved, { kind: "stub-object", id: "stub-1" });
    assert.equal(attempt.transport.exitCode, 0);
    assert.equal(attempt.transport.terminatedByTimeout, false);
  }
  // The attempt records are durable evidence, not only in-memory state.
  const files = readdirSync(evidenceDir);
  assert.equal(files.filter((f) => /^deploy-attempt-\d+\.json$/.test(f)).length, 3);
  assert.equal(files.filter((f) => /^deploy-request-\d+\.json$/.test(f)).length, 3);
});

test("release loop converts endless pending to red at the deadline naming the last observed value", async () => {
  const dir = scratch();
  const stub = writeStub(
    dir,
    "pending-forever",
    `respond({ outcome: "pending",
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: { state: "waiting" }, detail: "stub-state pending" } });`,
  );
  const deadlineMs = 300;
  const before = Date.now();
  const { run: outcome } = await run(stub, {
    clock: clock({ intervalMs: 40, deadlineMs }),
  });
  const elapsed = Date.now() - before;
  assert.equal(outcome.verdict.kind, "deadline");
  assert.equal(outcome.verdict.lastOutcome, "pending");
  assert.equal(
    outcome.verdict.reason,
    release.deadlineReasonPending("stub-state pending"),
  );
  assert.ok(
    elapsed >= deadlineMs,
    `elapsed ${String(elapsed)} ms must be at least the ${String(deadlineMs)} ms deadline`,
  );
  // At least one attempt was recorded; under CPU contention a single
  // child spawn can consume the whole short deadline, so a two-poll
  // minimum here would flake (observed once on this shared machine). The
  // multi-poll property is witnessed deterministically by the
  // pending-twice-then-satisfied test above.
  assert.ok(outcome.attempts.length >= 1, "at least one attempt was recorded");
});

test("release loop treats absent as distinct from pending and satisfies after late object creation", async () => {
  const dir = scratch();
  const stub = writeStub(
    dir,
    "absent-twice",
    `if (req.attempt.number <= 2) respond({ outcome: "absent",
       reason: "no release object for subject yet" });
     else ${OK_SATISFIED}`,
  );
  const { run: outcome } = await run(stub);
  assert.equal(outcome.verdict.kind, "satisfied");
  assert.equal(outcome.attempts.length, 3);
  assert.equal(outcome.attempts[0]?.outcome, "absent");
});

test("release loop converts endless absent to red naming no release object for subject", async () => {
  const dir = scratch();
  const stub = writeStub(
    dir,
    "absent-forever",
    `respond({ outcome: "absent", reason: "no release object for subject yet" });`,
  );
  const { run: outcome } = await run(stub, {
    clock: clock({ intervalMs: 40, deadlineMs: 300 }),
  });
  assert.equal(outcome.verdict.kind, "deadline");
  assert.equal(outcome.verdict.lastOutcome, "absent");
  assert.equal(outcome.verdict.reason, release.DEADLINE_REASON_ABSENT);
  // Criterion 2: the two deadline reasons are TEXTUALLY DISTINCT. A gate
  // that cannot distinguish them cannot detect "deploys silently not
  // spawning".
  assert.notEqual(
    release.DEADLINE_REASON_ABSENT,
    release.deadlineReasonPending("stub-state pending"),
  );
  assert.match(release.DEADLINE_REASON_ABSENT, /no release object for subject/);
});

test("release rule 1 adapter exiting zero without writing a response is error and the corrected adapter satisfies", async () => {
  const dir = scratch();
  const bad = writeStub(dir, "writes-nothing", `/* exits 0, writes nothing */`);
  const { run: outcome } = await run(bad);
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /fail-closed rule 1/);
  assert.match(outcome.verdict.reason ?? "", /without writing a response record/);
  const good = writeStub(dir, "writes-nothing-corrected", OK_SATISFIED);
  const { run: inverse } = await run(good);
  assert.equal(inverse.verdict.kind, "satisfied");
});

test("release rule 2 schema-invalid adapter response is error naming the field", async () => {
  const dir = scratch();
  // Dangerous state one: a structurally invalid response (no observedAt).
  const bad = writeStub(
    dir,
    "schema-invalid",
    `writeFileSync(req.recordPath, JSON.stringify({
       contractVersion: "1", adapter: "stub", subject: req.subject,
       outcome: "satisfied",
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: {}, detail: "d" } }));`,
  );
  const { run: outcome } = await run(bad);
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /fail-closed rule 2/);
  assert.match(outcome.verdict.reason ?? "", /observedAt/);
  // Dangerous state two, structurally different: not JSON at all.
  const badParse = writeStub(
    dir,
    "not-json",
    `writeFileSync(req.recordPath, "this is not json");`,
  );
  const { run: outcomeTwo } = await run(badParse);
  assert.equal(outcomeTwo.verdict.kind, "error");
  assert.match(outcomeTwo.verdict.reason ?? "", /fail-closed rule 2/);
  assert.match(outcomeTwo.verdict.reason ?? "", /does not parse as JSON/);
  const good = writeStub(dir, "schema-corrected", OK_SATISFIED);
  const { run: inverse } = await run(good);
  assert.equal(inverse.verdict.kind, "satisfied");
});

test("release rule 3 subject echo mismatch is error before the outcome is read", async () => {
  const dir = scratch();
  // Member one: a different mergedSha carrying a claimed satisfied outcome.
  const badSha = writeStub(
    dir,
    "wrong-sha",
    `respond({ outcome: "satisfied",
       subject: { ...req.subject, mergedSha: "2222222222222222222222222222222222222222" },
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: {}, detail: "for someone else" } });`,
  );
  const { run: outcome } = await run(badSha);
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /fail-closed rule 3/);
  assert.match(outcome.verdict.reason ?? "", /mergedSha/);
  // Member two, structurally different field AND a garbage outcome: the
  // subject check fires FIRST, so the reason names rule 3, not rule 7.
  const badRef = writeStub(
    dir,
    "wrong-ref",
    `respond({ outcome: "NOT-AN-OUTCOME",
       subject: { ...req.subject, integrationRef: "other-branch" },
       reason: "r" });`,
  );
  const { run: outcomeTwo } = await run(badRef);
  assert.equal(outcomeTwo.verdict.kind, "error");
  assert.match(outcomeTwo.verdict.reason ?? "", /fail-closed rule 3/);
  assert.match(outcomeTwo.verdict.reason ?? "", /integrationRef/);
  assert.match(outcomeTwo.verdict.reason ?? "", /the outcome was not read/);
  const good = writeStub(dir, "echo-corrected", OK_SATISFIED);
  const { run: inverse } = await run(good);
  assert.equal(inverse.verdict.kind, "satisfied");
});

test("release rule 4 satisfied without resolved identity is error", async () => {
  const dir = scratch();
  const bad = writeStub(
    dir,
    "no-resolved",
    `respond({ outcome: "satisfied",
       observation: { raw: {}, detail: "looked at nothing" } });`,
  );
  const { run: outcome } = await run(bad);
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /fail-closed rule 4/);
  assert.match(outcome.verdict.reason ?? "", /resolved/);
  const good = writeStub(dir, "resolved-corrected", OK_SATISFIED);
  const { run: inverse } = await run(good);
  assert.equal(inverse.verdict.kind, "satisfied");
});

test("release rule 5 satisfied without observation is error", async () => {
  const dir = scratch();
  const bad = writeStub(
    dir,
    "no-observation",
    `respond({ outcome: "satisfied",
       resolved: { kind: "stub-object", id: "stub-1" } });`,
  );
  const { run: outcome } = await run(bad);
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /fail-closed rule 5/);
  assert.match(outcome.verdict.reason ?? "", /observation/);
  const good = writeStub(dir, "observation-corrected", OK_SATISFIED);
  const { run: inverse } = await run(good);
  assert.equal(inverse.verdict.kind, "satisfied");
});

test("release rule 6 unrecognized contract version is error naming accepted versions", async () => {
  const dir = scratch();
  const bad = writeStub(
    dir,
    "bad-version",
    `writeFileSync(req.recordPath, JSON.stringify({
       contractVersion: "999", adapter: "stub", subject: req.subject,
       outcome: "satisfied", observedAt: new Date().toISOString(),
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: {}, detail: "d" } }));`,
  );
  const { run: outcome } = await run(bad);
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /fail-closed rule 6/);
  assert.match(outcome.verdict.reason ?? "", /"999"/);
  assert.match(outcome.verdict.reason ?? "", /accepts 1/);
  const good = writeStub(dir, "version-corrected", OK_SATISFIED);
  const { run: inverse } = await run(good);
  assert.equal(inverse.verdict.kind, "satisfied");
});

test("release rule 7 out-of-enum outcome is error and never coerced", async () => {
  const dir = scratch();
  // Member one: a value that LOOKS like success vocabulary.
  const bad = writeStub(
    dir,
    "enum-success",
    `respond({ outcome: "success",
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: {}, detail: "d" } });`,
  );
  const { run: outcome } = await run(bad);
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /fail-closed rule 7/);
  assert.match(outcome.verdict.reason ?? "", /"success"/);
  // Member two, structurally different: a soft state the vocabulary
  // deliberately does not contain (M2-C-3: no unknown, no skipped, no warn).
  const badWarn = writeStub(
    dir,
    "enum-warn",
    `respond({ outcome: "warn",
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: {}, detail: "d" } });`,
  );
  const { run: outcomeTwo } = await run(badWarn);
  assert.equal(outcomeTwo.verdict.kind, "error");
  assert.match(outcomeTwo.verdict.reason ?? "", /fail-closed rule 7/);
  const good = writeStub(dir, "enum-corrected", OK_SATISFIED);
  const { run: inverse } = await run(good);
  assert.equal(inverse.verdict.kind, "satisfied");
});

test("release hanging adapter attempt is error while the kernel returns", { timeout: 15000 }, async () => {
  const dir = scratch();
  const bad = writeStub(
    dir,
    "hangs",
    `setInterval(() => {}, 1000); /* never writes, never exits */`,
  );
  // Short per-attempt timeout ONLY for the hanging members: a hanging
  // child overruns any bound, so a short one just keeps the test fast.
  // The corrected inverse below uses the generous default, because a
  // HEALTHY child that merely starts slowly under CPU contention must not
  // be killed by the harness (observed once on this shared machine).
  const attemptTimeoutMs = 300;
  const { run: outcome } = await run(bad, {
    clock: clock({ deadlineMs: 5000, attemptTimeoutMs }),
  });
  // The kernel RETURNED: this assertion executing is itself the witness,
  // and the test-level timeout above makes a block report as a failure
  // code rather than an unexplained wait.
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /overran the per-attempt timeout of 300 ms/);
  assert.equal(outcome.attempts.length, 1);
  assert.equal(outcome.attempts[0]?.transport.terminatedByTimeout, true);
  // Second structurally different member of the hang class, and the
  // reason the kill signal is 9: MEASURED in this phase, a child that
  // traps the default termination signal makes spawnSync never return, so
  // a bound that only asked politely would be advisory exactly here.
  const trapping = writeStub(
    dir,
    "hangs-trapping",
    `process.on("SIGTERM", () => {});
     setInterval(() => {}, 1000); /* traps, never writes, never exits */`,
  );
  const { run: trapped } = await run(trapping, {
    clock: clock({ deadlineMs: 5000, attemptTimeoutMs }),
  });
  assert.equal(trapped.verdict.kind, "error");
  assert.match(trapped.verdict.reason ?? "", /overran the per-attempt timeout/);
  assert.equal(trapped.attempts[0]?.transport.terminatedByTimeout, true);
  const good = writeStub(dir, "hang-corrected", OK_SATISFIED);
  const { run: inverse } = await run(good);
  assert.equal(inverse.verdict.kind, "satisfied");
});

test("release adapter leaving a named pipe at the record path is error not a hang", { timeout: 15000 }, async () => {
  const dir = scratch();
  const bad = writeStub(
    dir,
    "fifo",
    `import { execFileSync } from "node:child_process";
     execFileSync("mkfifo", [req.recordPath]);`,
  );
  const { run: outcome } = await run(bad);
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /named pipe/);
  assert.match(outcome.verdict.reason ?? "", /not a regular file/);
});

test(
  "release kernel-side evidence writes refuse a planted FIFO and return bounded",
  { timeout: 15000 },
  async () => {
    // CR-P7H-1, at the MECHANISM: every path in the evidence directory the
    // KERNEL opens for write is a block hazard if an untrusted adapter can
    // pre-create it. The per-attempt spawnSync timeout bounds only the CHILD;
    // these writes happen after it returns and, unguarded, a writeFileSync on
    // a reader-less FIFO blocks the kernel forever. The attempt-file names are
    // fully deterministic and the adapter is handed a recordPath inside the
    // evidence directory, so it can derive and plant the next attempt's paths.
    //
    // Staged against the DANGEROUS state (T-003 strong form): a REAL FIFO at a
    // real deterministic kernel-side write path, where a bare write WOULD
    // block. Demonstrated red against the pre-fix kernel out of band (an
    // external `timeout` killed the probe at 15s against a 5s deadline for
    // BOTH members; see delivery/work-history/m2-p7.md fix round one). The
    // 15000ms test-level timeout here makes a regression report as a failure
    // code, not an unexplained wait: this assertion executing is the witness
    // that the kernel returned.
    //
    // TWO structurally different members of the write class (one witness is
    // not a class): the next attempt's STDOUT path, and the next attempt's
    // ATTEMPT-RECORD path. They reach the guard through different call sites.
    const members: { target: string; plant: string }[] = [
      { target: "stdout", plant: "deploy-attempt-2-stdout.txt" },
      { target: "attempt record", plant: "deploy-attempt-2.json" },
    ];
    for (const member of members) {
      const dir = scratch();
      const evidenceDir = scratch();
      // Attempt 1 returns a valid pending AND plants a FIFO at the next
      // attempt's kernel-side write path; attempt 2 would satisfy.
      const attacker = writeStub(
        dir,
        `fifo-kernel-write-${member.target.replace(/\s+/g, "-")}`,
        `import { execFileSync } from "node:child_process";
         import { dirname, join } from "node:path";
         const dir = dirname(req.recordPath);
         if (req.attempt.number === 1) {
           execFileSync("mkfifo", [join(dir, ${JSON.stringify(member.plant)})]);
           respond({ outcome: "pending",
             resolved: { kind: "stub-object", id: "stub-1" },
             observation: { raw: { state: "waiting" }, detail: "stub pending" } });
         } else { ${OK_SATISFIED} }`,
      );
      const { run: outcome } = await run(attacker, {
        evidenceDir,
        clock: clock({ intervalMs: 20, deadlineMs: 5000, attemptTimeoutMs: 5000 }),
      });
      // Bounded return, error naming the path and the observed type; never a
      // silent green and never a block.
      assert.equal(
        outcome.verdict.kind,
        "error",
        `${member.target}: a planted FIFO at a kernel-side write path is error`,
      );
      assert.match(
        outcome.verdict.reason ?? "",
        new RegExp(member.plant.replace(/[.]/g, "\\.")),
        `${member.target}: the refusal names the exact path`,
      );
      assert.match(
        outcome.verdict.reason ?? "",
        /named pipe/,
        `${member.target}: the refusal names the observed type`,
      );
      assert.match(outcome.verdict.reason ?? "", /not a regular file/);
      // The planted entry was NAMED, never opened: still a FIFO afterwards.
      assert.equal(
        statSync(join(evidenceDir, member.plant)).isFIFO(),
        true,
        `${member.target}: the FIFO was never opened for write`,
      );
    }
    // Inverse (green with the behavior): the same paths as regular files reach
    // the real verdict. The kernel writes its own attempt/stdout/stderr files
    // and the loop satisfies.
    const dir = scratch();
    const good = writeStub(
      dir,
      "fifo-kernel-write-corrected",
      `if (req.attempt.number === 1) respond({ outcome: "pending",
         resolved: { kind: "stub-object", id: "stub-1" },
         observation: { raw: { state: "waiting" }, detail: "stub pending" } });
       else { ${OK_SATISFIED} }`,
    );
    const { run: inverse, evidenceDir } = await run(good, {
      clock: clock({ intervalMs: 20, deadlineMs: 5000, attemptTimeoutMs: 5000 }),
    });
    assert.equal(inverse.verdict.kind, "satisfied");
    // The kernel's own evidence writes landed as regular files.
    const written = readdirSync(evidenceDir);
    assert.ok(written.includes("deploy-attempt-2-stdout.txt"));
    assert.ok(written.includes("deploy-attempt-2.json"));
  },
);

test("release adapter error outcome is terminal with its reason", async () => {
  const dir = scratch();
  const bad = writeStub(
    dir,
    "reports-error",
    `respond({ outcome: "error", reason: "HTTP 401 from stub-platform" });`,
  );
  const { run: outcome } = await run(bad);
  assert.equal(outcome.verdict.kind, "error");
  assert.equal(outcome.verdict.reason, "HTTP 401 from stub-platform");
  assert.equal(outcome.attempts.length, 1);
});

test("release outcome mapping is total and pending and absent are never terminal statuses", () => {
  const outcomes = release.VERIFICATION_OUTCOMES;
  assert.deepEqual(outcomes, [
    "satisfied",
    "failed",
    "pending",
    "absent",
    "not-applicable",
    "error",
  ]);
  // Total: every outcome has a mapping, and nothing else does.
  assert.deepEqual(Object.keys(release.OUTCOME_TO_STATUS).sort(), [...outcomes].sort());
  assert.equal(release.OUTCOME_TO_STATUS["satisfied"], "green");
  assert.equal(release.OUTCOME_TO_STATUS["failed"], "red");
  assert.equal(release.OUTCOME_TO_STATUS["not-applicable"], "not-applicable");
  assert.equal(release.OUTCOME_TO_STATUS["error"], "error");
  // The two loop states map to red and ONLY red: reachable at the deadline,
  // never green, never not-applicable.
  assert.equal(release.OUTCOME_TO_STATUS["pending"], "red");
  assert.equal(release.OUTCOME_TO_STATUS["absent"], "red");
  // And the vocabulary contains no soft state to hide a false green in.
  for (const soft of ["unknown", "skipped", "warn"]) {
    assert.ok(!outcomes.includes(soft), `${soft} must not be an outcome`);
  }
});

test("release credential values are redacted from every file under the evidence directory", async () => {
  const dir = scratch();
  const secret = "tok-3f9a71c2secretvalue";
  // The dangerous state: an adapter that leaks the credential into its
  // stdout, its stderr AND its response record.
  const leaker = writeStub(
    dir,
    "leaker",
    `const value = process.env.TIPHYS_TEST_RELEASE_TOKEN ?? "(unset)";
     process.stdout.write("token is " + value + "\\n");
     process.stderr.write("dbg " + value + "\\n");
     respond({ outcome: "satisfied",
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: { leaked: value }, detail: "stub-state satisfied" } });`,
  );
  process.env["TIPHYS_TEST_RELEASE_TOKEN"] = secret;
  try {
    const { run: outcome, evidenceDir } = await run(leaker, {
      secrets: [{ name: "TIPHYS_TEST_RELEASE_TOKEN", value: secret }],
    });
    assert.equal(outcome.verdict.kind, "satisfied");
    let sawPlaceholder = false;
    for (const name of readdirSync(evidenceDir)) {
      const body = readFileSync(join(evidenceDir, name), "utf8");
      assert.ok(
        !body.includes(secret),
        `credential value must not appear in ${name}`,
      );
      if (body.includes("<redacted:TIPHYS_TEST_RELEASE_TOKEN>")) {
        sawPlaceholder = true;
      }
    }
    assert.ok(sawPlaceholder, "the leak was redacted, not merely absent");
  } finally {
    delete process.env["TIPHYS_TEST_RELEASE_TOKEN"];
  }
});

test("release encoded credential forms are redacted from every file under the evidence directory", async () => {
  // CR-P7H-3, at the MECHANISM: redaction that removed only the verbatim bytes
  // let a trivially reversible copy through. An HTTP Basic auth header carries
  // the token as standalone base64, and a URL query carries it percent-encoded.
  // Criterion 11 ("no secret value appears anywhere") is not scoped to verbatim.
  //
  // The value carries characters that make its percent encoding DIFFER from the
  // raw bytes (space, /, +, :), so the url-encoded member is a genuinely
  // distinct string and not a re-test of the verbatim path.
  const dir = scratch();
  const secret = "s3cr3t/tok+en:ABC 123";
  const b64 = Buffer.from(secret, "utf8").toString("base64");
  const urlenc = encodeURIComponent(secret);
  assert.notEqual(b64, secret, "base64 form must differ from the raw value");
  assert.notEqual(urlenc, secret, "url-encoded form must differ from the raw value");
  // The dangerous state: an adapter that emits the credential in its encoded
  // forms (never the raw bytes) into stdout, stderr AND the response record,
  // including a realistic `Authorization: Basic <base64>` header.
  const leaker = writeStub(
    dir,
    "encoded-leaker",
    `const value = process.env.TIPHYS_TEST_RELEASE_TOKEN ?? "(unset)";
     const b64 = Buffer.from(value, "utf8").toString("base64");
     const urlenc = encodeURIComponent(value);
     process.stdout.write("Authorization: Basic " + b64 + "\\n");
     process.stderr.write("query ?token=" + urlenc + "\\n");
     respond({ outcome: "satisfied",
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: { header: "Basic " + b64, q: urlenc }, detail: "stub-state satisfied" } });`,
  );
  process.env["TIPHYS_TEST_RELEASE_TOKEN"] = secret;
  try {
    const { run: outcome, evidenceDir } = await run(leaker, {
      secrets: [{ name: "TIPHYS_TEST_RELEASE_TOKEN", value: secret }],
    });
    assert.equal(outcome.verdict.kind, "satisfied");
    // Two structurally different encoded members, each asserted absent
    // EVERYWHERE, using the real bytes the adapter emitted (not hand-written
    // strings): base64 and percent-encoding.
    for (const [label, form] of [
      ["base64", b64],
      ["url-encoded", urlenc],
    ] as const) {
      for (const name of readdirSync(evidenceDir)) {
        const body = readFileSync(join(evidenceDir, name), "utf8");
        assert.ok(
          !body.includes(form),
          `${label} credential form must not appear in ${name}`,
        );
        // The raw value must not appear either (it never did on the wire here,
        // but redaction of a form must not reconstruct it).
        assert.ok(!body.includes(secret), `raw credential must not appear in ${name}`);
      }
    }
  } finally {
    delete process.env["TIPHYS_TEST_RELEASE_TOKEN"];
  }
});

test("release attempt records flag a release object created before the merge as an observation not an error", async () => {
  const dir = scratch();
  const older = writeStub(
    dir,
    "older-object",
    `respond({ outcome: "satisfied",
       resolved: { kind: "stub-object", id: "stub-1", createdAt: "2026-08-06T09:00:00Z" },
       observation: { raw: {}, detail: "stub-state satisfied" } });`,
  );
  const { run: outcome } = await run(older);
  // Recorded, deliberately NOT promoted to an error (investigation section
  // 8 item 8: one real counter-example settles it, and none exists yet).
  assert.equal(outcome.verdict.kind, "satisfied");
  assert.equal(outcome.attempts[0]?.releaseObjectOlderThanMerge, true);
  const newer = writeStub(
    dir,
    "newer-object",
    `respond({ outcome: "satisfied",
       resolved: { kind: "stub-object", id: "stub-1", createdAt: "2026-08-06T11:00:00Z" },
       observation: { raw: {}, detail: "stub-state satisfied" } });`,
  );
  const { run: inverse } = await run(newer);
  assert.equal(inverse.verdict.kind, "satisfied");
  assert.equal(inverse.attempts[0]?.releaseObjectOlderThanMerge, false);
});

test("release attempt budget exhaustion is red naming the budget and the last observed state", async () => {
  const dir = scratch();
  const stub = writeStub(
    dir,
    "pending-budget",
    `respond({ outcome: "pending",
       resolved: { kind: "stub-object", id: "stub-1" },
       observation: { raw: {}, detail: "stub-state pending" } });`,
  );
  const { run: outcome } = await run(stub, {
    clock: clock({ deadlineMs: 10000, maxAttempts: 2 }),
  });
  assert.equal(outcome.verdict.kind, "deadline");
  assert.equal(outcome.attempts.length, 2);
  assert.match(outcome.verdict.reason ?? "", /attempt budget of 2 exhausted/);
  assert.match(outcome.verdict.reason ?? "", /stub-state pending/);
});

test("release response validation requires a reason for every non-observing outcome", () => {
  const base = {
    contractVersion: "1",
    adapter: "stub",
    subject: SUBJECT,
    observedAt: "2026-08-06T10:00:01Z",
  };
  for (const outcome of ["failed", "absent", "not-applicable", "error"]) {
    const missing = release.validateAdapterResponse(
      JSON.stringify({ ...base, outcome }),
      SUBJECT,
    );
    assert.equal(missing.ok, false, `${outcome} without reason must fail`);
    assert.match(missing.reason ?? "", /reason/);
    const empty = release.validateAdapterResponse(
      JSON.stringify({ ...base, outcome, reason: "" }),
      SUBJECT,
    );
    assert.equal(empty.ok, false, `${outcome} with empty reason must fail`);
    const ok = release.validateAdapterResponse(
      JSON.stringify({ ...base, outcome, reason: "a real reason" }),
      SUBJECT,
    );
    assert.equal(ok.ok, true, `${outcome} with a reason must pass validation`);
  }
});

test("release contract modules contain no backgrounding no process probing and no pid identity", () => {
  // Criterion 6, structural, over CODE with comments stripped: the one
  // place a kill (or the words naming the prohibition) may appear is the
  // module documentation, which carries the C-2 exemption note naming
  // C-2's actual prohibition (pid as identity or exclusion). The
  // per-attempt termination is a spawnSync timeout option on a child the
  // kernel itself spawned; no process.kill call exists anywhere.
  const roots = [
    "../src/gates/release.ts",
    "../src/gates/deploy.ts",
    "../src/gates/migrations.ts",
    "../src/gates/adapters/http-json.ts",
    "../src/gates/adapters/migrations-command.ts",
  ];
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const root of roots) {
    const raw = readFileSync(new URL(root, import.meta.url), "utf8");
    const body = stripComments(raw);
    assert.ok(!body.includes("detached"), `${root} must not detach a child`);
    assert.ok(!body.includes("unref"), `${root} must not unref a child`);
    assert.ok(!body.includes("process.kill"), `${root} must not call process.kill`);
    assert.ok(!body.includes("/proc"), `${root} must not read /proc`);
    assert.ok(!/\.pid\b/.test(body), `${root} must not read a pid`);
    assert.ok(!/\bpid\s*[:=]/.test(body), `${root} must not record a pid`);
    // The stripping above must not have eaten the whole file: the modules
    // are real code, and an over-broad strip would make this test vacuous.
    assert.ok(body.includes("function"), `${root} still contains code after stripping`);
  }
});

test("release loop run is synchronous end to end asserted after the call returned", async () => {
  // C-3: the loop is a foreground await; when the returned promise settles
  // every child has already exited. Witnessed by spawning a stub that
  // records its own exit into a file BEFORE writing the response, then
  // asserting the file is complete the moment the call returns.
  const dir = scratch();
  const marker = join(dir, "order-marker.txt");
  const stub = writeStub(
    dir,
    "marker",
    `import { appendFileSync } from "node:fs";
     appendFileSync(${JSON.stringify(marker)}, "observed\\n");
     ${OK_SATISFIED}`,
  );
  const { run: outcome } = await run(stub);
  assert.equal(outcome.verdict.kind, "satisfied");
  assert.equal(readFileSync(marker, "utf8"), "observed\n");
});
