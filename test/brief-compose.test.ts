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
  mkdirSync,
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

/* ------------------------------------------------------------------ */
/* M5-P2: the charter's product intent reaches the composed brief       */
/* ------------------------------------------------------------------ */

/**
 * THE CHARTER IS READ FROM THE WORKING DIRECTORY, so every arm below composes
 * with a SCRATCH working directory holding the charter under test, against
 * this repository's own kernel root. The plan is passed by ABSOLUTE path for
 * the same reason: `--phase` resolves against the working directory.
 *
 * THE TWO ROLES ARE THE TWO THE CRITERION NAMES (p2-charter-reaches-brief):
 * the implementer, who does the work, and the clean-room reviewer, who judges
 * it. They are composed through the real CLI, so the assertion is on the text
 * an agent would be handed rather than on a helper's return value.
 */
const yamlParse = ((await import("yaml")) as unknown as { parse: (text: string) => unknown })
  .parse;
const CHARTER_TEMPLATE = join(repoRoot, "templates", "charter.example.yaml");
const INTENT_ROLES = ["implementer", "clean-room-reviewer"] as const;

function charterWorkspace(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-charter-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** Write the template charter into `dir` with its product intent replaced (or deleted). */
function writeCharter(dir: string, productIntent: unknown): void {
  const charter = yamlParse(readFileSync(CHARTER_TEMPLATE, "utf8")) as Record<string, unknown>;
  if (productIntent === undefined) {
    delete charter["product-intent"];
  } else {
    charter["product-intent"] = productIntent;
  }
  /* JSON is YAML, so the charter decodes through the same reader without this
     file depending on a YAML emitter's block-scalar choices. */
  writeFileSync(join(dir, "charter.yaml"), JSON.stringify(charter, null, 2));
}

function composeRoleIn(cwd: string, role: string, extra: string[] = []): Run {
  return runCliAt(
    cliEntry,
    [
      "brief",
      "compose",
      "--role",
      role,
      "--phase",
      join(repoRoot, PLAN),
      "--phase-id",
      PHASE_ID,
      ...extra,
    ],
    cwd,
  );
}

function templateProductIntent(): string {
  const charter = yamlParse(readFileSync(CHARTER_TEMPLATE, "utf8")) as Record<string, unknown>;
  return String(charter["product-intent"]).replace(/\n+$/, "");
}

function planPhaseIntent(): string {
  const plan = yamlParse(readFileSync(join(repoRoot, PLAN), "utf8")) as {
    phases: { id: string; intent: string }[];
  };
  const phase = plan.phases.find((candidate) => candidate.id === PHASE_ID);
  assert.ok(phase !== undefined, `${PLAN} has no phase ${PHASE_ID}`);
  return phase.intent.replace(/\n+$/, "");
}

/** The `# Intent` section of a composed brief, up to the rendered phase. */
function intentSection(stdout: string): string {
  const start = stdout.indexOf("# Intent\n");
  const end = stdout.indexOf(`# Phase ${PHASE_ID}`);
  assert.ok(start !== -1, "the composed brief carries no # Intent section");
  assert.ok(end > start, "the # Intent section does not precede the rendered phase");
  return stdout.slice(start, end);
}

test("a composed implementer brief and a composed reviewer brief each carry the charter's exact product intent and the phase intent, and an inverted charter changes both with no trace of the old value", (t) => {
  const dir = charterWorkspace(t);
  const original = templateProductIntent();
  const phaseIntent = planPhaseIntent();
  assert.ok(
    original.includes("\n"),
    "the template product intent is a single line, so the verbatim-block property is untested",
  );
  writeCharter(dir, `${original}\n`);

  const before = new Map<string, string>();
  for (const role of INTENT_ROLES) {
    const run = composeRoleIn(dir, role);
    assert.equal(run.status, 0, `${role}: ${run.stderr}`);
    const section = intentSection(run.stdout);
    /* EXACT, INCLUDING THE LINE BREAKS: the block scalar is carried verbatim,
       so a composer that reflowed or truncated it is red here. */
    assert.ok(
      section.includes(`\n${original}\n`),
      `${role}: the exact product intent is not in the brief`,
    );
    assert.ok(
      section.includes(`## Phase intent\n\n${phaseIntent}\n`),
      `${role}: the phase intent is not next to it`,
    );
    assert.ok(
      section.indexOf("## Product intent") < section.indexOf("## Phase intent"),
      `${role}: product intent does not precede phase intent`,
    );
    before.set(role, run.stdout);
  }

  /* THE INVERTED FIXTURE. It says the opposite of the original on purpose, so
     a brief that still carried any line of the original would be carrying a
     contradicted intent, which is the stale-charter hazard in the form that
     matters: green, and wrong. */
  const inverted =
    "INVERTED FIXTURE. A service that writes orders to suppliers and sets prices.\n" +
    "Success is measured by orders placed, not by parts found.\n" +
    "Search is out of scope.";
  writeCharter(dir, `${inverted}\n`);
  for (const role of INTENT_ROLES) {
    const run = composeRoleIn(dir, role);
    assert.equal(run.status, 0, `${role} inverted: ${run.stderr}`);
    assert.notEqual(
      run.stdout,
      before.get(role),
      `${role}: the inverted charter left the brief unchanged`,
    );
    assert.ok(
      intentSection(run.stdout).includes(`\n${inverted}\n`),
      `${role}: the inverted intent is not in the brief`,
    );
    for (const line of original.split("\n").filter((entry) => entry.trim() !== "")) {
      assert.ok(
        !run.stdout.includes(line),
        `${role}: a green brief still carries the old product intent line: ${line}`,
      );
    }
  }
});

test("brief compose fails closed when a declared charter cannot be read or declares no product intent, and composes again once it is repaired", (t) => {
  const dir = charterWorkspace(t);
  const path = join(dir, "charter.yaml");

  /* MEMBERS OF ONE CLASS, "a declared charter whose product intent cannot be
     established", chosen to be structurally different: a path that cannot be
     OPENED (a named pipe, which must also be refused in bounded time rather
     than blocking), a path that is NAMED and absent, a document that does not
     DECODE, a document that decodes and LACKS the field, and one whose field
     is present and BLANK. Each must stop composition with no brief written. */
  const members: { name: string; stage: () => string[]; stderr: RegExp }[] = [
    {
      name: "a named pipe at charter.yaml",
      stage: () => {
        const made = spawnSync("mkfifo", [path], { encoding: "utf8" });
        assert.equal(made.status, 0, `mkfifo failed: ${made.stderr}`);
        return [];
      },
      stderr: /is a named pipe, not a regular file/,
    },
    {
      name: "a --charter path that does not exist",
      stage: () => ["--charter", join(dir, "absent-charter.yaml")],
      stderr: /absent-charter\.yaml does not exist/,
    },
    {
      name: "a charter that does not decode",
      stage: () => {
        writeFileSync(path, "kind: charter\nproduct-intent: [unterminated\n");
        return [];
      },
      stderr: /^tiphys brief compose: charter /,
    },
    {
      name: "a charter with no product-intent field",
      stage: () => {
        writeCharter(dir, undefined);
        return [];
      },
      stderr: /declares no product-intent, so the brief would carry no product intent/,
    },
    {
      name: "a charter whose product-intent is blank",
      stage: () => {
        writeCharter(dir, "   \n");
        return [];
      },
      stderr: /declares no product-intent with any non-space text/,
    },
  ];

  for (const member of members) {
    rmSync(path, { force: true });
    const extra = member.stage();
    for (const role of INTENT_ROLES) {
      const started = Date.now();
      const red = composeRoleIn(dir, role, extra);
      assert.ok(
        Date.now() - started < BOUNDED_MS,
        `${member.name}: composition did not return in bounded time`,
      );
      assert.notEqual(red.status, null, `${member.name}: composition was killed by the timeout`);
      assert.equal(
        red.status,
        1,
        `${member.name} (${role}) composed: ${red.stdout.slice(0, 200)}`,
      );
      assert.equal(red.stdout, "", `${member.name} (${role}): a brief was emitted beside the refusal`);
      assert.match(red.stderr, member.stderr, `${member.name} (${role}): ${red.stderr}`);
    }
  }

  /* THE OTHER DIRECTION: the same directory with a readable charter composes. */
  rmSync(path, { force: true });
  writeCharter(dir, "A repaired intent.\n");
  for (const role of INTENT_ROLES) {
    const green = composeRoleIn(dir, role);
    assert.equal(green.status, 0, green.stderr);
    assert.ok(intentSection(green.stdout).includes("\nA repaired intent.\n"));
  }
});

test("brief compose with no charter declared says so in the intent section rather than omitting it", (t) => {
  const dir = charterWorkspace(t);
  const run = composeRoleIn(dir, "implementer");
  assert.equal(run.status, 0, run.stderr);
  const section = intentSection(run.stdout);
  assert.match(
    section,
    /no charter declared: --charter was not given and .*charter\.yaml does not exist/,
  );
  assert.ok(section.includes(`## Phase intent\n\n${planPhaseIntent()}\n`));

  /* AND --charter NAMING A READABLE FILE ELSEWHERE IS USED, so a fleet whose
     charter lives under charter/ can hand it over explicitly. */
  const elsewhere = join(dir, "sub");
  mkdirSync(elsewhere);
  writeCharter(elsewhere, "Named explicitly.\n");
  const named = composeRoleIn(dir, "implementer", ["--charter", join(elsewhere, "charter.yaml")]);
  assert.equal(named.status, 0, named.stderr);
  assert.ok(intentSection(named.stdout).includes("\nNamed explicitly.\n"));
});

test("the composed intent section has a closed heading and field set", (t) => {
  const dir = charterWorkspace(t);
  writeCharter(dir, `${templateProductIntent()}\n`);
  for (const role of INTENT_ROLES) {
    const run = composeRoleIn(dir, role);
    assert.equal(run.status, 0, run.stderr);
    const lines = intentSection(run.stdout).split("\n");
    /* CLOSED SETS, not a denylist (p2-no-scoring): a heading or a key: value
       line this test does not name, whatever it is called, is red. */
    assert.deepEqual(
      lines.filter((line) => line.startsWith("#")),
      ["# Intent", "## Product intent", "## Phase intent"],
    );
    assert.deepEqual(
      lines
        .filter((line) => /^[A-Za-z][A-Za-z_-]*: /.test(line))
        .map((line) => line.slice(0, line.indexOf(":"))),
      ["charter"],
      `${role}: the intent section carries a field other than the charter path`,
    );
  }
});
