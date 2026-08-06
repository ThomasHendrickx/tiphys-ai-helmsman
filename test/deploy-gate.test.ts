import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { test } from "node:test";

/**
 * THE DEPLOY VERIFICATION AND THE DECLARATION SEMANTICS (kernel plan M2,
 * M2-P7 criteria 3, 5, 9, 10, 11).
 *
 * The http-json adapter is exercised against an in-process node:http stub
 * on loopback with an ephemeral port, replaying the appendix A captures
 * committed under test/fixtures/release/ (provenance in PROVENANCE.md).
 * No external network is touched. Deadlines are short and explicit; no
 * production default exists to be used (CLAUDE.md warning 11).
 */

interface Subject {
  repository: string;
  integrationRef: string;
  mergedSha: string;
  mergedAt: string;
  phaseId: string;
}

interface Run {
  verdict: {
    kind: string;
    units?: number;
    reason?: string;
    detail?: string;
    lastOutcome?: string;
    resolved?: { kind: string; id: string; createdAt?: unknown };
  };
  attempts: {
    outcome: string;
    detail: string;
    transport: { httpStatus?: number };
    releaseObjectOlderThanMerge?: boolean;
  }[];
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
  }) => Promise<Run>;
  DEADLINE_REASON_ABSENT: string;
};

const NODE = process.execPath;
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const HTTP_JSON = join(REPO_ROOT, "src", "gates", "adapters", "http-json.ts");
const DEPLOY_GATE = join(REPO_ROOT, "src", "gates", "deploy.ts");
const MIGRATIONS_GATE = join(REPO_ROOT, "src", "gates", "migrations.ts");
const TIPHYS = join(REPO_ROOT, "bin", "tiphys.ts");
const FIXTURES = join(REPO_ROOT, "test", "fixtures", "release");

const IN_PROGRESS = readFileSync(join(FIXTURES, "github-actions-run-in-progress.json"), "utf8");
const SUCCESS = readFileSync(join(FIXTURES, "github-actions-run-success.json"), "utf8");
const CANCELLED = readFileSync(join(FIXTURES, "github-actions-run-cancelled.json"), "utf8");
const VERCEL_LIST = readFileSync(join(FIXTURES, "vercel-deployments.json"), "utf8");

/** The captured sha that appears on BOTH a preview and a production deployment. */
const DOUBLE_SHA = "929d387be1fc2d1c9464d172b9610947076ccf9e";

const SUBJECT: Subject = {
  repository: "example/app",
  integrationRef: "main",
  mergedSha: DOUBLE_SHA,
  mergedAt: "2026-08-06T10:00:00Z",
  phaseId: "test-phase",
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-deploy-"));
}

interface Stub {
  url: string;
  close: () => Promise<void>;
}

/**
 * Loopback stub on an ephemeral port, run in its OWN child process.
 *
 * It cannot live in this process: the kernel's loop spawns each adapter
 * attempt with spawnSync (foreground, C-3), which blocks this process's
 * event loop, and an in-process server would then never accept the
 * adapter's connection. Measured before being believed: the in-process
 * form deadlocked every http-json test into its per-attempt timeout.
 *
 * The stub serves responses[n-1] to the nth request, clamping to the last
 * entry, so a sequence like [in-progress, in-progress, success] replays a
 * platform state machine advancing between polls.
 */
async function startStub(
  responses: { status: number; text: string }[],
): Promise<Stub> {
  const dir = scratch();
  const configPath = join(dir, "stub-config.json");
  writeFileSync(configPath, JSON.stringify(responses));
  const scriptPath = join(dir, "stub-server.mjs");
  writeFileSync(
    scriptPath,
    `import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const responses = JSON.parse(readFileSync(${JSON.stringify(configPath)}, "utf8"));
let served = 0;
const server = createServer((request, response) => {
  const entry = responses[Math.min(served, responses.length - 1)];
  served += 1;
  response.writeHead(entry.status, { "content-type": "application/json" });
  response.end(entry.text);
});
server.listen(0, "127.0.0.1", () => {
  process.stdout.write("PORT " + String(server.address().port) + "\\n");
});
`,
  );
  const child: ChildProcess = spawn(NODE, [scriptPath], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const port = await new Promise<number>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(
      () => reject(new Error("stub server did not report a port")),
      10000,
    );
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const match = /PORT (\d+)/.exec(buffer);
      if (match !== null) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on("error", reject);
    child.on("exit", () =>
      reject(new Error("stub server exited before reporting a port")),
    );
  });
  return {
    url: `http://127.0.0.1:${String(port)}/`,
    close: () =>
      new Promise<void>((resolve) => {
        child.on("exit", () => resolve());
        child.kill("SIGKILL");
      }),
  };
}

const GH_OBSERVE = {
  statusPointer: "/conclusion",
  satisfiedValue: "success",
  terminalPointer: "/status",
  terminalValue: "completed",
};

async function runHttp(
  url: string,
  config: Record<string, unknown>,
  clockOverrides?: Partial<Clock>,
  subject?: Subject,
): Promise<Run> {
  return release.runVerification({
    verification: "deploy",
    subject: subject ?? SUBJECT,
    adapter: [NODE, HTTP_JSON],
    config: { url, ...config },
    // Generous defaults: sibling suites share this machine and a node
    // child can start slowly under contention (warning 11). Deadline
    // conversions override deadlineMs downward deliberately.
    clock: {
      intervalMs: 30,
      deadlineMs: 12000,
      attemptTimeoutMs: 6000,
      ...clockOverrides,
    },
    evidenceDir: scratch(),
  });
}

test("http-json reports pending for the captured in-progress run and satisfied once it completes", async () => {
  // Criterion 3 directions (a) and (b), replaying the captured shapes: the
  // in-progress run carries NO conclusion key at all, and an absent pointer
  // on a healthy in-flight run is pending, never error (observation O-2).
  const stub = await startStub([
    { status: 200, text: IN_PROGRESS },
    { status: 200, text: IN_PROGRESS },
    { status: 200, text: SUCCESS },
  ]);
  try {
    const outcome = await runHttp(stub.url, { observe: GH_OBSERVE });
    assert.equal(outcome.verdict.kind, "satisfied");
    assert.equal(outcome.attempts.length, 3);
    assert.equal(outcome.attempts[0]?.outcome, "pending");
    assert.match(outcome.attempts[0]?.detail ?? "", /in_progress/);
    assert.equal(outcome.attempts[1]?.outcome, "pending");
    assert.equal(outcome.attempts[2]?.outcome, "satisfied");
    assert.match(outcome.attempts[2]?.detail ?? "", /success/);
    assert.equal(outcome.attempts[0]?.transport.httpStatus, 200);
  } finally {
    await stub.close();
  }
});

test("http-json reports failed for the captured cancelled run naming the observed value verbatim", async () => {
  // Criterion 3 direction (c): completed is the captured terminal marker,
  // cancelled is the captured non-satisfying value, and NO failure
  // vocabulary exists anywhere: the value is named verbatim, not matched
  // against a list.
  const stub = await startStub([{ status: 200, text: CANCELLED }]);
  try {
    const outcome = await runHttp(stub.url, { observe: GH_OBSERVE });
    assert.equal(outcome.verdict.kind, "failed");
    assert.match(outcome.verdict.reason ?? "", /"cancelled"/);
    assert.match(outcome.verdict.reason ?? "", /terminal state reached/);
    assert.equal(outcome.attempts.length, 1, "a terminal failure is not polled");
  } finally {
    await stub.close();
  }
});

test("http-json reports error for a body that does not parse as JSON", async () => {
  // Criterion 3 direction (d).
  const stub = await startStub([{ status: 200, text: "<<<this is not json>>>" }]);
  try {
    const outcome = await runHttp(stub.url, { observe: GH_OBSERVE });
    assert.equal(outcome.verdict.kind, "error");
    assert.match(outcome.verdict.reason ?? "", /does not parse as JSON/);
  } finally {
    await stub.close();
  }
});

test("http-json reports error on a non-success transport status and on an unreachable endpoint", async () => {
  // An unauthenticated 401 must never read as pending: no verdict was
  // reached (M2-C-3; the expired-token permanent-soft-pass hazard).
  const stub = await startStub([
    { status: 401, text: `{"message":"unauthorized"}` },
  ]);
  const stubUrl = stub.url;
  try {
    const outcome = await runHttp(stubUrl, { observe: GH_OBSERVE });
    assert.equal(outcome.verdict.kind, "error");
    assert.match(outcome.verdict.reason ?? "", /HTTP 401/);
  } finally {
    await stub.close();
  }
  // The same port, now closed: unreachable is error, not pending.
  const outcome = await runHttp(stubUrl, { observe: GH_OBSERVE });
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /could not be completed/);
});

const VERCEL_LOCATE = {
  listPointer: "",
  match: [
    { pointer: "/meta/githubCommitSha", subjectField: "mergedSha" },
    { pointer: "/target", equals: "production" },
  ],
  idPointer: "/id",
  kind: "deployment",
  createdAtPointer: "/createdAt",
};

const VERCEL_OBSERVE = {
  statusPointer: "/readyState",
  satisfiedValue: "READY",
};

test("http-json locates the production deployment by sha and target from the captured list", async () => {
  // Criterion 5 direction one, staged on the REAL capture: the subject sha
  // appears on two deployments, one preview (target null) and one
  // production, so the match is (sha AND target), never sha alone.
  const stub = await startStub([{ status: 200, text: VERCEL_LIST }]);
  try {
    const outcome = await runHttp(stub.url, {
      locate: VERCEL_LOCATE,
      observe: VERCEL_OBSERVE,
    });
    assert.equal(outcome.verdict.kind, "satisfied");
    assert.equal(outcome.verdict.resolved?.kind, "deployment");
    assert.equal(outcome.verdict.resolved?.id, "dpl_PLACEHOLDER_PRODUCTION_929D387");
  } finally {
    await stub.close();
  }
});

test("http-json reports absent when the subject sha exists only on a preview deployment", async () => {
  // Criterion 5 direction two: the same sha, present only on the
  // target-null preview record, is ABSENT for production, not satisfied.
  // The fooling this defeats is proven by the capture itself. The variant
  // list is derived mechanically from the committed capture by removing
  // the production record carrying the subject sha.
  const list = JSON.parse(VERCEL_LIST) as {
    id: string;
    target: string | null;
    meta: { githubCommitSha: string };
  }[];
  const withoutProduction = list.filter(
    (d) => !(d.meta.githubCommitSha === DOUBLE_SHA && d.target === "production"),
  );
  assert.equal(withoutProduction.length, 2, "the preview record must remain");
  const stub = await startStub([
    { status: 200, text: JSON.stringify(withoutProduction) },
  ]);
  try {
    const outcome = await runHttp(
      stub.url,
      { locate: VERCEL_LOCATE, observe: VERCEL_OBSERVE },
      { deadlineMs: 250, intervalMs: 40 },
    );
    assert.equal(outcome.attempts[0]?.outcome, "absent");
    assert.equal(outcome.verdict.kind, "deadline");
    assert.equal(outcome.verdict.lastOutcome, "absent");
    assert.match(outcome.verdict.reason ?? "", /no release object for subject/);
  } finally {
    await stub.close();
  }
});

/* ---------------------------------------------------------------------- *
 * The declaration: three distinguishable not-applicable states, the      *
 * anti-widening merge-base read, credentials, and the runner integration *
 * (criteria 9, 10, 11).                                                  *
 * ---------------------------------------------------------------------- */

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "tiphys-test",
  GIT_AUTHOR_EMAIL: "tiphys-test@example.invalid",
  GIT_COMMITTER_NAME: "tiphys-test",
  GIT_COMMITTER_EMAIL: "tiphys-test@example.invalid",
};

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return (result.stdout ?? "").trim();
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-decl-"));
  git(dir, "init", "-q", ".");
  return dir;
}

function commitDeclaration(dir: string, declaration: unknown): { sha: string; blobSha256: string } {
  const body = `${JSON.stringify(declaration, null, 2)}\n`;
  writeFileSync(join(dir, "release-verification.json"), body);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "declaration");
  return {
    sha: git(dir, "rev-parse", "HEAD"),
    blobSha256: createHash("sha256").update(body).digest("hex"),
  };
}

interface GateOutcome {
  status: number | null;
  stdout: string;
  stderr: string;
  record: Record<string, unknown> | undefined;
}

function runGate(
  gatePath: string,
  cwd: string,
  extraArgs: string[] = [],
  env?: Record<string, string | undefined>,
): GateOutcome {
  const evidence = scratch();
  const resultPath = join(evidence, "result.json");
  const child = spawnSync(
    NODE,
    [gatePath, "--result", resultPath, "--evidence", evidence, ...extraArgs],
    { cwd, encoding: "utf8", env: (env ?? process.env) as NodeJS.ProcessEnv },
  );
  let record: Record<string, unknown> | undefined;
  try {
    record = JSON.parse(readFileSync(resultPath, "utf8")) as Record<string, unknown>;
  } catch {
    record = undefined;
  }
  return {
    status: child.status,
    stdout: child.stdout ?? "",
    stderr: child.stderr ?? "",
    record,
  };
}

/** A committed stub adapter that always reports absent. */
function writeAbsentAdapter(dir: string): string {
  const path = join(dir, "absent-adapter.mjs");
  writeFileSync(
    path,
    `import { readFileSync, writeFileSync } from "node:fs";
const req = JSON.parse(readFileSync(process.argv[2], "utf8"));
writeFileSync(req.recordPath, JSON.stringify({
  contractVersion: "1", adapter: "stub", subject: req.subject,
  outcome: "absent", reason: "no release object for subject yet",
  observedAt: new Date().toISOString() }));
`,
  );
  return path;
}

test("deploy gate reports not-applicable with declared true reason and merge-base blob sha for a declaration of none", () => {
  const dir = initRepo();
  const { blobSha256 } = commitDeclaration(dir, {
    version: 1,
    repository: "example/app",
    integrationRef: "main",
    verifications: {
      deploy: { mode: "none", reason: "this project has no remote deployment" },
      migrations: { mode: "none", reason: "this project has no database" },
    },
  });
  const outcome = runGate(DEPLOY_GATE, dir);
  assert.equal(outcome.status, 20);
  assert.equal(outcome.record?.["status"], "not-applicable");
  const detail = String(outcome.record?.["detail"]);
  assert.match(detail, /declared: true/);
  assert.match(detail, /this project has no remote deployment/);
  assert.ok(detail.includes(blobSha256), "the record carries the declaration blob sha256");
  const precondition = outcome.record?.["precondition"] as {
    id: string;
    met: boolean;
    evidence: string[];
  };
  assert.equal(precondition.met, false);
  assert.match(precondition.id, /declared-none/);
  assert.ok(precondition.evidence.some((e) => e.includes(blobSha256)));
  assert.ok(precondition.evidence.includes("declared: true"));
});

test("deploy gate is error when the declaration is absent entirely", () => {
  // Criterion 9: once the gate itself is asked, silence is never
  // permission. (The legitimate evaluation of absence is the manifest's
  // file-exists precondition, which the runner evaluates and records.)
  const dir = initRepo();
  writeFileSync(join(dir, "other.txt"), "x\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "no declaration");
  const outcome = runGate(DEPLOY_GATE, dir);
  assert.equal(outcome.status, 21);
  assert.equal(outcome.record?.["status"], "error");
  assert.match(String(outcome.record?.["detail"]), /no release-verification declaration/);
  assert.match(String(outcome.record?.["detail"]), /silence is never permission/);
});

test("deploy gate is error when none is declared without a reason and when the field is absent", () => {
  const dir = initRepo();
  commitDeclaration(dir, {
    version: 1,
    repository: "example/app",
    integrationRef: "main",
    verifications: {
      deploy: { mode: "none", reason: "" },
    },
  });
  const outcome = runGate(DEPLOY_GATE, dir);
  assert.equal(outcome.status, 21);
  assert.equal(outcome.record?.["status"], "error");
  assert.match(String(outcome.record?.["detail"]), /reason is missing or empty/);
  // Structurally different member of the same defence: the deploy field
  // exists, the MIGRATIONS field does not, and the migrations gate errors
  // rather than skipping.
  const dirTwo = initRepo();
  commitDeclaration(dirTwo, {
    version: 1,
    repository: "example/app",
    integrationRef: "main",
    verifications: {
      deploy: { mode: "none", reason: "no remote deployment" },
    },
  });
  const missingField = runGate(MIGRATIONS_GATE, dirTwo);
  assert.equal(missingField.status, 21);
  assert.equal(missingField.record?.["status"], "error");
  assert.match(
    String(missingField.record?.["detail"]),
    /does not configure verification migrations/,
  );
});

test("deploy gate ignores a head declaration flipped to none and records the merge-base blob", { timeout: 20000 }, () => {
  // Criterion 9's anti-widening direction, staged against the dangerous
  // state exactly as M2-P4 criterion 5 does: the branch flips the
  // declaration to none, and the verdict must come from the merge base.
  const dir = initRepo();
  const adapter = writeAbsentAdapter(dir);
  const base = commitDeclaration(dir, {
    version: 1,
    repository: "example/app",
    integrationRef: "main",
    verifications: {
      deploy: {
        mode: "adapter",
        adapter: [NODE, adapter],
        config: {},
        clock: { intervalMs: 30, deadlineMs: 200, attemptTimeoutMs: 3000 },
      },
    },
  });
  const flipped = commitDeclaration(dir, {
    version: 1,
    repository: "example/app",
    integrationRef: "main",
    verifications: {
      deploy: { mode: "none", reason: "switched off inside the branch that needed it on" },
    },
  });
  assert.notEqual(base.blobSha256, flipped.blobSha256);
  const outcome = runGate(DEPLOY_GATE, dir, ["--base", base.sha]);
  // The head says none; the merge base says verify; the verdict is the
  // merge base's: red at the deadline, absent reason, base blob recorded.
  assert.equal(outcome.status, 1);
  assert.equal(outcome.record?.["status"], "red");
  const detail = String(outcome.record?.["detail"]);
  assert.match(detail, /no release object for subject/);
  assert.ok(detail.includes(base.blobSha256), "the record carries the MERGE BASE blob sha256");
  assert.ok(!detail.includes(flipped.blobSha256), "the head blob does not appear");
  assert.ok(detail.includes(base.sha), "the subject is the merge-base commit sha");
});

test("deploy gate is error when a declared credential variable is not resolvable", () => {
  const dir = initRepo();
  const adapter = writeAbsentAdapter(dir);
  commitDeclaration(dir, {
    version: 1,
    repository: "example/app",
    integrationRef: "main",
    verifications: {
      deploy: {
        mode: "adapter",
        adapter: [NODE, adapter],
        config: {},
        clock: { intervalMs: 30, deadlineMs: 200, attemptTimeoutMs: 3000 },
        credentials: ["TIPHYS_TEST_UNSET_CREDENTIAL"],
      },
    },
  });
  const env = { ...process.env };
  delete env["TIPHYS_TEST_UNSET_CREDENTIAL"];
  const outcome = runGate(DEPLOY_GATE, dir, [], env);
  assert.equal(outcome.status, 21);
  assert.equal(outcome.record?.["status"], "error");
  assert.match(
    String(outcome.record?.["detail"]),
    /TIPHYS_TEST_UNSET_CREDENTIAL is declared and not resolvable/,
  );
  assert.match(String(outcome.record?.["detail"]), /never a silent unauthenticated request/);
});

test("no secret value appears anywhere under the evidence directory when a credential is declared", () => {
  // Criterion 11 at the gate level: a token-shaped value in the configured
  // credential variable, an adapter that leaks it three ways, and an
  // evidence walk that must find only the named placeholder.
  const dir = initRepo();
  const leaker = join(dir, "leaker-adapter.mjs");
  writeFileSync(
    leaker,
    `import { readFileSync, writeFileSync } from "node:fs";
const req = JSON.parse(readFileSync(process.argv[2], "utf8"));
const value = process.env.TIPHYS_TEST_RELEASE_TOKEN ?? "(unset)";
process.stdout.write("token " + value + "\\n");
process.stderr.write("dbg " + value + "\\n");
writeFileSync(req.recordPath, JSON.stringify({
  contractVersion: "1", adapter: "stub", subject: req.subject,
  outcome: "satisfied", observedAt: new Date().toISOString(),
  resolved: { kind: "stub-object", id: "stub-1" },
  observation: { raw: { leaked: value }, detail: "stub-state satisfied" } }));
`,
  );
  commitDeclaration(dir, {
    version: 1,
    repository: "example/app",
    integrationRef: "main",
    verifications: {
      deploy: {
        mode: "adapter",
        adapter: [NODE, leaker],
        config: {},
        clock: { intervalMs: 30, deadlineMs: 3000, attemptTimeoutMs: 2000 },
        credentials: ["TIPHYS_TEST_RELEASE_TOKEN"],
      },
    },
  });
  const secret = "tok-9b1c44e0aa55secret";
  const evidence = scratch();
  const resultPath = join(evidence, "result.json");
  const child = spawnSync(
    NODE,
    [DEPLOY_GATE, "--result", resultPath, "--evidence", evidence],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, TIPHYS_TEST_RELEASE_TOKEN: secret } as NodeJS.ProcessEnv,
    },
  );
  assert.equal(child.status, 0, child.stderr);
  let sawPlaceholder = false;
  for (const name of readdirSync(evidence)) {
    const body = readFileSync(join(evidence, name), "utf8");
    assert.ok(!body.includes(secret), `credential value must not appear in ${name}`);
    if (body.includes("<redacted:TIPHYS_TEST_RELEASE_TOKEN>")) {
      sawPlaceholder = true;
    }
  }
  assert.ok(sawPlaceholder, "the leak was redacted, not merely absent");
  // The gate's own streams carry names only, never the value.
  assert.ok(!(child.stdout ?? "").includes(secret));
  assert.ok(!(child.stderr ?? "").includes(secret));
});

test("the runner reports both release gates not-applicable on this repository naming the structural reason", () => {
  // Criterion 10, first half, and step 1's recorded sentence made
  // machine-visible: on THIS repository, with no declaration, both entries
  // are not-applicable via the manifest's file-exists precondition, and the
  // record itself states that a pre-merge not-applicable is STRUCTURAL.
  const evidence = scratch();
  const child = spawnSync(
    NODE,
    [
      TIPHYS,
      "gates",
      "run",
      "--manifest",
      join(REPO_ROOT, "gates.manifest.json"),
      "--evidence",
      evidence,
      "--only",
      "deploy",
      "--only",
      "migrations",
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  for (const gate of ["deploy", "migrations"]) {
    const record = JSON.parse(
      readFileSync(join(evidence, gate, "result.json"), "utf8"),
    ) as {
      status: string;
      detail: string;
      precondition: { id: string; met: boolean; reason: string; evidence: string[] };
    };
    assert.equal(record.status, "not-applicable", `${gate}: ${child.stderr}`);
    assert.equal(record.precondition.met, false);
    assert.match(record.precondition.reason, /release-verification\.json does not exist/);
    assert.deepEqual(record.precondition.evidence, ["release-verification.json"]);
    assert.match(record.precondition.id, /STRUCTURAL in any pre-merge bundle/);
    assert.match(record.precondition.id, /release verification runs post-merge/);
  }
});

test("a fabricated declaration in a scratch copy makes both entries applicable and red", { timeout: 30000 }, () => {
  // Criterion 10, second half: the not-applicable on this repository is
  // not hardcoded. A scratch copy that DOES declare verification sees the
  // entries become applicable and fail for real: deploy red at the
  // deadline on an adapter reporting absent forever, migrations red on a
  // repository inventory of two with an applied inventory of one.
  const dir = initRepo();
  const absent = writeAbsentAdapter(dir);
  const migrationsDir = join(dir, "migrations");
  mkdirSync(migrationsDir);
  writeFileSync(join(migrationsDir, "001_init.sql"), "create table a (id int);\n");
  writeFileSync(join(migrationsDir, "002_add_b.sql"), "create table b (id int);\n");
  const appliedSource = join(dir, "applied.json");
  writeFileSync(appliedSource, JSON.stringify({ migrations: [{ version: "001" }] }));
  const appliedScript = join(dir, "applied-cat.mjs");
  writeFileSync(
    appliedScript,
    `import { readFileSync } from "node:fs";
process.stdout.write(readFileSync(${JSON.stringify(appliedSource)}, "utf8"));
`,
  );
  commitDeclaration(dir, {
    version: 1,
    repository: "example/app",
    integrationRef: "main",
    verifications: {
      deploy: {
        mode: "adapter",
        adapter: [NODE, absent],
        config: {},
        clock: { intervalMs: 40, deadlineMs: 250, attemptTimeoutMs: 3000 },
      },
      migrations: {
        mode: "adapter",
        adapter: [NODE, join(REPO_ROOT, "src", "gates", "adapters", "migrations-command.ts")],
        config: {
          migrationsDir: "migrations",
          pattern: "^(\\d+)_.*\\.sql$",
          appliedCommand: [NODE, appliedScript],
          appliedPointer: "/migrations",
          idPointer: "/version",
        },
        clock: { intervalMs: 40, deadlineMs: 250, attemptTimeoutMs: 3000 },
      },
    },
  });
  const manifest = {
    version: 1,
    gates: [
      {
        id: "deploy",
        command: [NODE, DEPLOY_GATE],
        unitLabel: "release verifications satisfied",
        applicability: "conditional",
        precondition: {
          id: "release-verification-declared",
          kind: "file-exists",
          path: "release-verification.json",
        },
      },
      {
        id: "migrations",
        command: [NODE, MIGRATIONS_GATE],
        unitLabel: "migrations compared",
        applicability: "conditional",
        precondition: {
          id: "release-verification-declared",
          kind: "file-exists",
          path: "release-verification.json",
        },
      },
    ],
    destructiveCommands: [],
  };
  const manifestPath = join(dir, "scratch-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const evidence = scratch();
  const child = spawnSync(
    NODE,
    [TIPHYS, "gates", "run", "--manifest", manifestPath, "--evidence", evidence],
    { cwd: dir, encoding: "utf8" },
  );
  assert.notEqual(child.status, 0, "a red bundle exits nonzero");
  const deploy = JSON.parse(
    readFileSync(join(evidence, "deploy", "result.json"), "utf8"),
  ) as { status: string; detail: string };
  assert.equal(deploy.status, "red");
  assert.match(deploy.detail, /no release object for subject/);
  const migrations = JSON.parse(
    readFileSync(join(evidence, "migrations", "result.json"), "utf8"),
  ) as { status: string; detail: string };
  assert.equal(migrations.status, "red");
  assert.match(migrations.detail, /migrations not applied: 002/);
});

test("migrations gate is green end to end with units equal to migrations compared", { timeout: 20000 }, () => {
  // Criterion 7's units at the GateResult level, through the real entry.
  const dir = initRepo();
  const migrationsDir = join(dir, "migrations");
  mkdirSync(migrationsDir);
  writeFileSync(join(migrationsDir, "001_init.sql"), "create table a (id int);\n");
  writeFileSync(join(migrationsDir, "002_add_b.sql"), "create table b (id int);\n");
  const appliedSource = join(dir, "applied.json");
  writeFileSync(
    appliedSource,
    JSON.stringify({ migrations: [{ version: "001" }, { version: "002" }] }),
  );
  const appliedScript = join(dir, "applied-cat.mjs");
  writeFileSync(
    appliedScript,
    `import { readFileSync } from "node:fs";
process.stdout.write(readFileSync(${JSON.stringify(appliedSource)}, "utf8"));
`,
  );
  commitDeclaration(dir, {
    version: 1,
    repository: "example/app",
    integrationRef: "main",
    verifications: {
      migrations: {
        mode: "adapter",
        adapter: [NODE, join(REPO_ROOT, "src", "gates", "adapters", "migrations-command.ts")],
        config: {
          migrationsDir: "migrations",
          pattern: "^(\\d+)_.*\\.sql$",
          appliedCommand: [NODE, appliedScript],
          appliedPointer: "/migrations",
          idPointer: "/version",
        },
        // 5000ms per attempt, matching this implementer's own convention for
        // the same subprocess-spawn risk profile in migration-gate.test.ts and
        // release-contract.test.ts. This adapter subprocess itself spawns a
        // second node child to read applied.json, and under heavy shared-host
        // load the earlier 2000ms bound tripped the per-attempt timeout and
        // reported error (criteria review #17, CR-762 class; CLAUDE.md warning
        // 11: budget harness timeouts up, never shorten the waits).
        clock: { intervalMs: 40, deadlineMs: 3000, attemptTimeoutMs: 5000 },
      },
    },
  });
  const outcome = runGate(MIGRATIONS_GATE, dir);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(outcome.record?.["status"], "green");
  assert.equal(outcome.record?.["units"], 2);
  assert.equal(outcome.record?.["unitLabel"], "migrations compared");
});
