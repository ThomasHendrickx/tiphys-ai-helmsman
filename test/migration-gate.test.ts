import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * THE MIGRATIONS VERIFICATION (kernel plan M2, M2-P7 criteria 7, 8, 9;
 * step 5's migrations-command adapter).
 *
 * The empty applied inventory in these tests is the CAPTURED
 * `{"migrations":[]}` response, byte for byte
 * (test/fixtures/release/supabase-list-migrations-empty.json, provenance in
 * the sibling PROVENANCE.md): a real, healthy production project produced
 * it, which is why a non-empty repository inventory with an empty applied
 * inventory is red and never not-applicable (the second recorded incident
 * exactly). Non-empty applied inventories are the tests' own stub program
 * output: the applied entry shape is PROJECT-declared configuration
 * (pointers), not platform vocabulary, and no platform's non-empty
 * inventory was captured, so none is imitated.
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
    lastOutcome?: string;
    declared?: boolean;
    preconditionId?: string;
    evidence?: string[];
  };
  attempts: { outcome: string; detail: string }[];
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
const ADAPTER = fileURLToPath(
  new URL("../src/gates/adapters/migrations-command.ts", import.meta.url),
);
const EMPTY_FIXTURE = fileURLToPath(
  new URL("./fixtures/release/supabase-list-migrations-empty.json", import.meta.url),
);

const SUBJECT: Subject = {
  repository: "example/app",
  integrationRef: "main",
  mergedSha: "3333333333333333333333333333333333333333",
  mergedAt: "2026-08-06T10:00:00Z",
  phaseId: "test-phase",
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-migrations-"));
}

/** A stub applied-inventory program that prints EXACTLY the given file. */
function catScript(dir: string, sourcePath: string): string[] {
  const path = join(dir, "applied-cat.mjs");
  writeFileSync(
    path,
    `import { readFileSync } from "node:fs";
process.stdout.write(readFileSync(${JSON.stringify(sourcePath)}, "utf8"));
`,
  );
  return [NODE, path];
}

/** A stub applied-inventory program printing the test's own inventory. */
function appliedScript(dir: string, document: unknown): string[] {
  const source = join(dir, "applied.json");
  writeFileSync(source, JSON.stringify(document));
  return catScript(dir, source);
}

function writeMigrations(dir: string, files: Record<string, string>): string {
  const migrationsDir = join(dir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(migrationsDir, name), body);
  }
  return migrationsDir;
}

function sha256hex(text: string): string {
  return execFileSync("sha256sum", { input: text, encoding: "utf8" }).slice(0, 64);
}

async function run(
  config: unknown,
  clockOverrides?: Partial<Clock>,
): Promise<Run> {
  return release.runVerification({
    verification: "migrations",
    subject: SUBJECT,
    adapter: [NODE, ADAPTER],
    config,
    // Generous defaults: sibling suites share this machine and a node
    // child can start slowly under contention (warning 11). Deadline
    // conversions override deadlineMs downward deliberately.
    clock: {
      intervalMs: 30,
      deadlineMs: 10000,
      attemptTimeoutMs: 5000,
      ...clockOverrides,
    },
    evidenceDir: scratch(),
  });
}

const PATTERN = "^(\\d+)_.*\\.sql$";

test("migrations gate is red at the deadline naming a repository migration the applied inventory lacks", async () => {
  const dir = scratch();
  const migrationsDir = writeMigrations(dir, {
    "001_init.sql": "create table a (id int);\n",
    "002_add_b.sql": "create table b (id int);\n",
  });
  const applied = appliedScript(dir, { migrations: [{ version: "001" }] });
  const outcome = await run(
    {
      migrationsDir,
      pattern: PATTERN,
      appliedCommand: applied,
      appliedPointer: "/migrations",
      idPointer: "/version",
    },
    { deadlineMs: 250, intervalMs: 40 },
  );
  // Not yet applied is PENDING (the apply job may be queued); the kernel's
  // deadline is what turns the wait into red, naming the missing migration.
  assert.equal(outcome.verdict.kind, "deadline");
  assert.equal(outcome.verdict.lastOutcome, "pending");
  assert.match(outcome.verdict.reason ?? "", /migrations not applied: 002/);
});

test("migrations adapter fails immediately on applied drift naming the extra migration", async () => {
  const dir = scratch();
  const migrationsDir = writeMigrations(dir, {
    "001_init.sql": "create table a (id int);\n",
    "002_add_b.sql": "create table b (id int);\n",
  });
  const applied = appliedScript(dir, {
    migrations: [{ version: "001" }, { version: "002" }, { version: "003" }],
  });
  const outcome = await run({
    migrationsDir,
    pattern: PATTERN,
    appliedCommand: applied,
    appliedPointer: "/migrations",
    idPointer: "/version",
  });
  assert.equal(outcome.verdict.kind, "failed");
  assert.match(outcome.verdict.reason ?? "", /003/);
  assert.match(outcome.verdict.reason ?? "", /drift/);
  assert.equal(outcome.attempts.length, 1, "drift is terminal, not polled");
});

test("migrations adapter satisfies equal inventories with units equal to migrations compared", async () => {
  const dir = scratch();
  const migrationsDir = writeMigrations(dir, {
    "001_init.sql": "create table a (id int);\n",
    "002_add_b.sql": "create table b (id int);\n",
  });
  const applied = appliedScript(dir, {
    migrations: [{ version: "001" }, { version: "002" }],
  });
  const outcome = await run({
    migrationsDir,
    pattern: PATTERN,
    appliedCommand: applied,
    appliedPointer: "/migrations",
    idPointer: "/version",
  });
  assert.equal(outcome.verdict.kind, "satisfied");
  assert.equal(outcome.verdict.units, 2);
});

test("migrations adapter fails on a checksum mismatch naming the migration and passes on a match", async () => {
  const dir = scratch();
  const body001 = "create table a (id int);\n";
  const body002 = "create table b (id int);\n";
  const migrationsDir = writeMigrations(dir, {
    "001_init.sql": body001,
    "002_add_b.sql": body002,
  });
  const wrong = appliedScript(dir, {
    migrations: [
      { version: "001", checksum: sha256hex(body001) },
      { version: "002", checksum: "0000000000000000000000000000000000000000000000000000000000000000" },
    ],
  });
  const config = {
    migrationsDir,
    pattern: PATTERN,
    appliedPointer: "/migrations",
    idPointer: "/version",
    checksumPointer: "/checksum",
  };
  const outcome = await run({ ...config, appliedCommand: wrong });
  assert.equal(outcome.verdict.kind, "failed");
  assert.match(outcome.verdict.reason ?? "", /migration 002/);
  assert.match(outcome.verdict.reason ?? "", /content drift/);
  const rightDir = scratch();
  const right = appliedScript(rightDir, {
    migrations: [
      { version: "001", checksum: sha256hex(body001) },
      { version: "002", checksum: sha256hex(body002) },
    ],
  });
  const inverse = await run({ ...config, appliedCommand: right });
  assert.equal(inverse.verdict.kind, "satisfied");
  assert.equal(inverse.verdict.units, 2);
});

test("migrations adapter reports not-applicable for a repository location with zero migrations", async () => {
  // Criterion 8's REPOSITORY side, two structurally different members of
  // the same precondition: an empty directory, and no directory at all.
  const dir = scratch();
  const emptyDir = writeMigrations(dir, {});
  const applied = appliedScript(dir, { migrations: [] });
  const config = {
    pattern: PATTERN,
    appliedCommand: applied,
    appliedPointer: "/migrations",
    idPointer: "/version",
  };
  const empty = await run({ ...config, migrationsDir: emptyDir });
  assert.equal(empty.verdict.kind, "not-applicable");
  assert.equal(empty.verdict.declared, false);
  assert.equal(empty.verdict.preconditionId, "repository-migrations-present");
  assert.match(empty.verdict.reason ?? "", /zero migrations matching/);
  const absent = await run({
    ...config,
    migrationsDir: join(dir, "no-such-directory"),
  });
  assert.equal(absent.verdict.kind, "not-applicable");
  assert.equal(absent.verdict.declared, false);
  assert.match(absent.verdict.reason ?? "", /does not exist/);
});

test("a non-empty repository inventory with the captured empty applied inventory is red never not-applicable", async () => {
  // THE SECOND RECORDED INCIDENT ("migrations skipped by a flake while the
  // code deployed anyway"), staged with the REAL captured response: the
  // fixture is byte-for-byte what a Supabase management API returned for
  // two ACTIVE_HEALTHY production projects.
  const fixtureBytes = readFileSync(EMPTY_FIXTURE, "utf8");
  assert.equal(
    fixtureBytes,
    '{"migrations":[]}',
    "the committed capture must remain byte-identical to appendix A.3",
  );
  const dir = scratch();
  const migrationsDir = writeMigrations(dir, {
    "001_init.sql": "create table a (id int);\n",
    "002_add_b.sql": "create table b (id int);\n",
  });
  const outcome = await run(
    {
      migrationsDir,
      pattern: PATTERN,
      appliedCommand: catScript(dir, EMPTY_FIXTURE),
      appliedPointer: "/migrations",
      idPointer: "/version",
    },
    { deadlineMs: 250, intervalMs: 40 },
  );
  assert.equal(outcome.verdict.kind, "deadline");
  assert.notEqual(outcome.verdict.kind, "not-applicable");
  assert.match(outcome.verdict.reason ?? "", /migrations not applied: 001, 002/);
});

test("migrations adapter reports error naming a named pipe in the migrations directory", { timeout: 15000 }, async () => {
  // M2-C-6 staged with a real mkfifo against the dangerous state: a
  // non-regular entry where a migration file is expected must be NAMED,
  // never opened, never blocked on.
  const dir = scratch();
  const migrationsDir = writeMigrations(dir, {
    "001_init.sql": "create table a (id int);\n",
  });
  execFileSync("mkfifo", [join(migrationsDir, "002_fifo.sql")]);
  const applied = appliedScript(dir, { migrations: [{ version: "001" }] });
  const outcome = await run({
    migrationsDir,
    pattern: PATTERN,
    appliedCommand: applied,
    appliedPointer: "/migrations",
    idPointer: "/version",
  });
  assert.equal(outcome.verdict.kind, "error");
  assert.match(outcome.verdict.reason ?? "", /named pipe/);
  assert.match(outcome.verdict.reason ?? "", /002_fifo\.sql/);
});

test("migrations adapter is error when the applied inventory command fails or emits no array", async () => {
  const dir = scratch();
  const migrationsDir = writeMigrations(dir, {
    "001_init.sql": "create table a (id int);\n",
  });
  const failing = join(dir, "failing.mjs");
  writeFileSync(failing, `process.stderr.write("boom\\n"); process.exit(3);\n`);
  const config = {
    migrationsDir,
    pattern: PATTERN,
    appliedPointer: "/migrations",
    idPointer: "/version",
  };
  const failed = await run({ ...config, appliedCommand: [NODE, failing] });
  assert.equal(failed.verdict.kind, "error");
  assert.match(failed.verdict.reason ?? "", /exited 3/);
  const wrongShape = appliedScript(dir, { migrations: "not-an-array" });
  const shape = await run({ ...config, appliedCommand: wrongShape });
  assert.equal(shape.verdict.kind, "error");
  assert.match(shape.verdict.reason ?? "", /no array at appliedPointer/);
});
