/**
 * THE BRIEF-COMPOSITION TESTS (kernel plan M3, M3-P5 criteria 2, 3, 3b, 6c).
 *
 * Carries: the ordering of the composed brief; the unknown-phase-id refusal;
 * the mandated-reading resolution in both directions; the PATH-TYPE refusal
 * with a real named pipe, which is a different state from a missing path and
 * is tested as one; and the completeness of the rendered phase, driven from
 * `schemas/plan.schema.json` rather than from a list this file maintains.
 *
 * A STAGED KERNEL ROOT IS NECESSARY AND NOT A CONVENIENCE. Criterion 2 needs
 * a brief whose frontmatter names a path that does NOT exist, and criterion
 * 6c needs one naming a named pipe; neither may be committed to `roles/`,
 * because both would make every shipped brief fail its own contract. The
 * staging copies `src/`, `bin/` and `roles/` into a scratch directory and
 * symlinks `node_modules`, so `kernelRoot()`'s walk up from the module lands
 * on the STAGED `roles/` and the command under test is the real CLI with a
 * real exit code rather than a function call.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const PLAN = "templates/plan.example.yaml";
const PHASE_ID = "M9-P1";

/** Wall-clock ceiling for the named-pipe arm. A block would exceed any of these. */
const BOUNDED_MS = 30_000;

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCliAt(entry: string, args: string[], cwd: string): Run {
  const run = spawnSync(process.execPath, [entry, ...args], {
    encoding: "utf8",
    cwd,
    timeout: BOUNDED_MS,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function compose(args: string[] = []): Run {
  return runCliAt(
    cliEntry,
    ["brief", "compose", "--role", "plan-writer", "--phase", PLAN, "--phase-id", PHASE_ID, ...args],
    repoRoot,
  );
}

/**
 * A scratch kernel root: enough of the tree for the CLI to run and for
 * `kernelRoot()` to resolve to the COPY rather than to this repository.
 */
function stageKernel(): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-compose-"));
  for (const entry of ["src", "bin", "roles", "schemas", "templates"]) {
    cpSync(join(repoRoot, entry), join(dir, entry), { recursive: true });
  }
  cpSync(join(repoRoot, "gate-registry.yaml"), join(dir, "gate-registry.yaml"));
  /* Dependencies are resolved by walking UP from the importing file, and a
     scratch directory under the system temp root has nothing above it, so the
     link is what makes `yaml` and `ajv` resolvable at all. */
  symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}

function composeIn(dir: string, role = "plan-writer", phaseId = PHASE_ID): Run {
  return runCliAt(
    join(dir, "bin", "tiphys.ts"),
    ["brief", "compose", "--role", role, "--phase", PLAN, "--phase-id", phaseId],
    dir,
  );
}

/** Add one mandated-reading entry to a staged brief's frontmatter. */
function mandate(dir: string, role: string, path: string): void {
  const file = join(dir, "roles", `${role}.md`);
  const text = readFileSync(file, "utf8");
  writeFileSync(
    file,
    text.replace("mandated-reading:\n", `mandated-reading:\n  - ${path}\n`),
  );
}

/* ------------------------------------------------------------------ */
/* Criterion 3: order, and the unknown phase id                         */
/* ------------------------------------------------------------------ */

test("brief compose emits the resolved mandated-reading list, the brief body and the named phase's rendered text in that order", () => {
  const run = compose();
  assert.equal(run.status, 0, run.stderr);

  const reading = run.stdout.indexOf("## Mandated reading, in order");
  const body = run.stdout.indexOf("# Brief body");
  const phase = run.stdout.indexOf(`# Phase ${PHASE_ID}`);
  assert.ok(reading !== -1, "no mandated-reading list in the composed brief");
  assert.ok(body !== -1, "no brief body in the composed brief");
  assert.ok(phase !== -1, "no rendered phase in the composed brief");
  assert.ok(
    reading < body && body < phase,
    `order is wrong: reading ${String(reading)}, body ${String(body)}, phase ${String(phase)}`,
  );

  /* The list is RESOLVED, in the frontmatter's order, and every entry is
     present. Order is the semantic of mandated reading, so a set comparison
     would be the wrong assertion here. */
  const brief = readFileSync(join(repoRoot, "roles", "plan-writer.md"), "utf8");
  const after = brief.split("\n").slice(brief.split("\n").indexOf("mandated-reading:") + 1);
  const end = after.findIndex((line) => !line.startsWith("  - "));
  const declared = (end === -1 ? after : after.slice(0, end)).map((line) => line.slice(4));
  assert.ok(declared.length > 0, "the plan-writer brief declares no mandated reading");
  const listed = run.stdout
    .slice(reading, body)
    .split("\n")
    .filter((line) => /^[0-9]+\. /.test(line))
    .map((line) => line.replace(/^[0-9]+\. /, ""));
  assert.deepEqual(listed, declared);
});

test("brief compose with a phase id absent from the plan exits nonzero naming the id", () => {
  const green = compose();
  assert.equal(green.status, 0, green.stderr);

  const red = runCliAt(
    cliEntry,
    ["brief", "compose", "--role", "plan-writer", "--phase", PLAN, "--phase-id", "M9-P404"],
    repoRoot,
  );
  assert.notEqual(red.status, 0);
  assert.match(red.stderr, /declares no phase with id M9-P404/);
});

/* ------------------------------------------------------------------ */
/* Criterion 2: mandated reading resolves, both directions              */
/* ------------------------------------------------------------------ */

test("brief compose exits nonzero naming a mandated-reading path that does not exist and exits 0 with the path present", () => {
  const dir = stageKernel();
  try {
    assert.equal(composeIn(dir).status, 0, "the staged kernel does not compose at all");

    const missing = "roles/absent-required-reading.md";
    mandate(dir, "plan-writer", missing);
    const red = composeIn(dir);
    assert.notEqual(red.status, 0, "a missing mandated-reading path composed cleanly");
    assert.ok(
      red.stderr.includes(missing),
      `the refusal does not name the path: ${red.stderr}`,
    );

    /* THE OTHER DIRECTION, and it is the same brief and the same command:
       only the path's existence changed. */
    writeFileSync(join(dir, missing), "Required reading.\n");
    const green = composeIn(dir);
    assert.equal(green.status, 0, green.stderr);
    assert.ok(green.stdout.includes(missing), "the now-present path is not listed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 6c: a named pipe is a different state from a missing path  */
/* ------------------------------------------------------------------ */

test("brief compose refuses a named pipe at a mandated-reading path in bounded time naming the path and the entry type", () => {
  const dir = stageKernel();
  try {
    const fifo = "roles/reading-fifo.md";
    const fifoPath = join(dir, fifo);
    const made = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
    assert.equal(made.status, 0, `mkfifo failed: ${made.stderr}`);
    mandate(dir, "plan-writer", fifo);

    /* THE DANGEROUS STATE IS A BLOCK, NOT AN ERROR. A composer that opened
       the path would hang here with no reader on the other end, so the
       assertion is on BOUNDED TIME as well as on the exit code: a test that
       only checked the exit code would pass a run that took forever, because
       it would never get to the check. */
    const started = Date.now();
    const red = runCliAt(
      join(dir, "bin", "tiphys.ts"),
      ["brief", "compose", "--role", "plan-writer", "--phase", PLAN, "--phase-id", PHASE_ID],
      dir,
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed < BOUNDED_MS, `composition took ${String(elapsed)}ms and did not return`);
    assert.notEqual(red.status, null, "composition was killed by the timeout, so it blocked");
    assert.notEqual(red.status, 0, "a named pipe at a mandated-reading path composed cleanly");
    assert.ok(red.stderr.includes(fifo), `the refusal does not name the path: ${red.stderr}`);
    assert.match(red.stderr, /is a named pipe, not a regular file/);

    /* THE OTHER DIRECTION: a REGULAR file at the same path composes. */
    unlinkSync(fifoPath);
    writeFileSync(fifoPath, "Required reading.\n");
    const green = composeIn(dir);
    assert.equal(green.status, 0, green.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3b: the rendered phase is a COMPLETE projection            */
/* ------------------------------------------------------------------ */

/**
 * DRIVEN FROM THE SCHEMA, NEVER FROM A LIST HERE. The renderer's field order
 * is hand-written in `src/roles.ts`; this assertion reads
 * `schemas/plan.schema.json`'s phase `required` array. The two are
 * independent on purpose, so a later phase adding a required phase field
 * reddens this test until the renderer handles it, rather than silently
 * shrinking every brief a dispatched agent reads.
 */
function requiredPhaseFields(): string[] {
  const schema = JSON.parse(
    readFileSync(join(repoRoot, "schemas", "plan.schema.json"), "utf8"),
  ) as { $defs: { phase: { required: string[] } } };
  return schema.$defs.phase.required;
}

test("brief compose renders every required field of the plan schema's phase definition", () => {
  const run = compose();
  assert.equal(run.status, 0, run.stderr);
  const rendered = run.stdout.slice(run.stdout.indexOf(`# Phase ${PHASE_ID}`));

  const fields = requiredPhaseFields();
  assert.ok(fields.length > 0, "the plan schema's phase declares no required fields");
  const missing = fields.filter((field) => !rendered.includes(`### ${field}`));
  assert.deepEqual(
    missing,
    [],
    `the rendered phase drops required field(s): ${missing.join(", ")}`,
  );
});

test("brief compose renders the named phase's hazard-classes array", () => {
  const run = compose();
  assert.equal(run.status, 0, run.stderr);
  const rendered = run.stdout.slice(run.stdout.indexOf(`# Phase ${PHASE_ID}`));
  assert.ok(rendered.includes("### hazard-classes"), "no hazard-classes section");

  /* PRESENCE OF THE HEADING IS NOT PRESENCE OF THE CONTENT. Each hazard's id,
     its statement and the criterion it is addressed by all have to survive
     the projection, because the hazard-review contract M3-P6, M3-P7 and
     M3-P9 build has nothing to work from otherwise, and this is the one place
     it is actually consumed by a dispatched agent. */
  const flat = rendered.replace(/\s+/g, " ");
  for (const fragment of [
    "id: H1",
    "A retry that masks a permanent failure",
    "addressed-by: criterion 2",
    "id: H2",
    "state-not-entered: M10",
  ]) {
    assert.ok(flat.includes(fragment), `the rendered hazard-classes drop: ${fragment}`);
  }
});

test("brief compose renders the named phase's acceptance array", () => {
  const run = compose();
  assert.equal(run.status, 0, run.stderr);
  const rendered = run.stdout.slice(run.stdout.indexOf(`# Phase ${PHASE_ID}`));
  assert.ok(rendered.includes("### acceptance"), "no acceptance section");

  const flat = rendered.replace(/\s+/g, " ");
  for (const fragment of [
    "criterion: node --test test/importer.test.ts exits 0 and reports 4 tests, 0 failing.",
    "A staged 429 response is retried exactly twice",
  ]) {
    assert.ok(flat.includes(fragment), `the rendered acceptance criteria drop: ${fragment}`);
  }
});

/* ------------------------------------------------------------------ */
/* Usage surface                                                        */
/* ------------------------------------------------------------------ */

test("brief compose without a required flag exits 64 and prints the usage line", () => {
  const run = runCliAt(cliEntry, ["brief", "compose", "--role", "plan-writer"], repoRoot);
  assert.equal(run.status, 64);
  assert.match(run.stderr, /usage: tiphys brief compose/);
});

test("brief compose with a role no brief exists for exits nonzero naming the role", () => {
  const run = runCliAt(
    cliEntry,
    ["brief", "compose", "--role", "not-a-role", "--phase", PLAN, "--phase-id", PHASE_ID],
    repoRoot,
  );
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /unknown role not-a-role/);
});
