/**
 * THE PROJECTION TESTS (kernel plan M3, M3-P1 criterion 10; D-M3-18).
 *
 * The point of D-M3-18 is that the M2-P4 scope auditor's input stops being a
 * second hand-authored source and becomes a GENERATED VIEW of the plan. The
 * only thing that proves that is running THE REAL AUDITOR against a generated
 * declaration, in a repository shaped the way the auditor reads: the
 * declaration at the MERGE BASE, the branch matching `claude/m<n>-p<n>-`, and
 * the auditor invoked exactly as `gates.manifest.json` invokes it.
 *
 * An auditor run against a declaration present only at the HEAD proves
 * nothing about the property that matters, because the merge-base read is the
 * whole anti-widening mechanism.
 */

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const scopeEntry = join(repoRoot, "src", "gates", "scope.ts");

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
};

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  validateToLines: (
    schema: Record<string, unknown>,
    instance: unknown,
  ) => string[];
};

const planModule = (await import(
  new URL("../src/plan.ts", import.meta.url).href
)) as {
  stripGloss: (entry: string) => string;
  projectPhase: (
    plan: unknown,
    phaseId: string,
  ) =>
    | { ok: true; declaration: Record<string, unknown>; filename: string }
    | { ok: false; reason: string };
};

/**
 * The DELIVERED phase-declaration schema, read from the tree rather than
 * transcribed into this file. Revision 2 of the plan described this document
 * and had three of its five property names wrong; a transcription would have
 * inherited that, and criterion 10 would have measured the transcription.
 */
function deliveredDeclarationSchema(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(repoRoot, "src", "gates", "schemas", "phase-declaration.schema.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Tiphys test",
  GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Tiphys test",
  GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
};

function git(cwd: string, args: string[]): string {
  const run = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  assert.equal(
    run.status,
    0,
    `git ${args.join(" ")} failed: ${run.stdout}${run.stderr}`,
  );
  return run.stdout.trim();
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-projection-"));
}

function planFixture(): Record<string, unknown> {
  return yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Criterion 10(a): the emitted document, against the DELIVERED schema  */
/* ------------------------------------------------------------------ */

test("the projection validates against the delivered phase-declaration schema, emits exactly the five camelCase keys, and a sixth key is rejected", () => {
  const projection = planModule.projectPhase(planFixture(), "M9-P1");
  assert.equal(projection.ok, true);
  if (!projection.ok) {
    return;
  }

  assert.deepEqual(
    Object.keys(projection.declaration).sort(),
    ["branch", "citations", "declaredExtras", "filesToTouch", "id"],
    "the emitted key set is not exactly the five required camelCase names",
  );

  const schema = deliveredDeclarationSchema();
  assert.deepEqual(
    validateModule.validateToLines(schema, projection.declaration),
    [],
  );

  /* A SIXTH KEY ON PURPOSE. The delivered schema sets
     `additionalProperties: false`, so an extra property is a REJECTION and
     not an ignored field. Without this direction the assertion above would
     also hold for a projector that emitted six keys into a schema that
     tolerated them. */
  const widened = { ...projection.declaration, extras: ["test/behaviors.json"] };
  assert.deepEqual(validateModule.validateToLines(schema, widened), [
    "INVALID #/extras property extras is not permitted here",
  ]);

  /* The filename is the phase id LOWERCASED, because CI derives `--phase`
     from the branch with a lowercase regex. */
  assert.equal(projection.filename, "m9-p1.json");
});

/* ------------------------------------------------------------------ */
/* Criterion 10(c): a parenthetical gloss projects to the bare path      */
/* ------------------------------------------------------------------ */

test("a files-to-touch entry carrying a parenthetical gloss projects to the bare path, and a directory keeps its trailing slash", () => {
  /* The exact form the criterion names, verbatim from the plan. */
  assert.equal(
    planModule.stripGloss("`src/cli.ts` (edit only if step 4 requires it)"),
    "src/cli.ts",
  );
  /* Structurally different members of the same class, because the auditor
     matches strings LITERALLY and every one of these would be rejected as an
     undeclared path if it survived into the declaration. */
  assert.equal(planModule.stripGloss("src/plan.ts"), "src/plan.ts");
  assert.equal(planModule.stripGloss("`test/fixtures/`"), "test/fixtures/");
  assert.equal(
    planModule.stripGloss("`gates.manifest.json` (edit, append-only)"),
    "gates.manifest.json",
  );

  const projection = planModule.projectPhase(planFixture(), "M9-P1");
  assert.equal(projection.ok, true);
  if (projection.ok) {
    assert.deepEqual(projection.declaration["filesToTouch"], [
      "src/importer.ts",
      "test/importer.test.ts",
      "src/cli.ts",
    ]);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 10(b): THE REAL AUDITOR, merge base, both directions        */
/* ------------------------------------------------------------------ */

/**
 * Build a scratch repository in the shape the auditor reads, generate the
 * declaration into it with `tiphys plan project`, and commit it ON `main` so
 * it is at the MERGE BASE of the phase branch.
 */
function stageAudit(plan: Record<string, unknown>): {
  dir: string;
  outside: string;
  base: string;
} {
  const dir = scratch();
  const outside = scratch();
  git(dir, ["init", "-q", "-b", "main"]);

  mkdirSync(join(dir, "templates"), { recursive: true });
  writeFileSync(join(dir, "templates", "plan.yaml"), yamlModule.stringify(plan));

  const projected = spawnSync(
    process.execPath,
    [
      cliEntry,
      "plan",
      "project",
      "--phase-id",
      "M9-P1",
      "--plan",
      join(dir, "templates", "plan.yaml"),
      "--out",
      join(dir, "delivery", "plan", "phase-declarations"),
    ],
    { encoding: "utf8", cwd: dir },
  );
  assert.equal(projected.status, 0, projected.stdout + projected.stderr);
  assert.match(projected.stdout, /m9-p1\.json/);

  /* The declaration and the files the plan declares exist at the BASE. */
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "test"), { recursive: true });
  writeFileSync(join(dir, "src", "importer.ts"), "1\n");
  writeFileSync(join(dir, "src", "cli.ts"), "1\n");
  writeFileSync(join(dir, "test", "importer.test.ts"), "1\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "base with the generated declaration"]);
  const base = git(dir, ["rev-parse", "HEAD"]);
  git(dir, ["checkout", "-q", "-b", "claude/m9-p1-importer-retry"]);
  return { dir, outside, base };
}

interface AuditOutcome {
  status: number | null;
  stdout: string;
  stderr: string;
  record: { status: string; units: number; detail: string } | undefined;
}

/** Invoke the auditor EXACTLY as gates.manifest.json invokes it. */
function runAuditor(dir: string, outside: string, base: string, head: string): AuditOutcome {
  const unique = Math.random().toString(36).slice(2);
  const evidence = join(outside, `evidence-${unique}`);
  const resultPath = join(outside, `result-${unique}.json`);
  mkdirSync(evidence, { recursive: true });
  const run = spawnSync(
    process.execPath,
    [
      scopeEntry,
      "--declarations",
      "delivery/plan/phase-declarations",
      "--result",
      resultPath,
      "--evidence",
      evidence,
      "--base",
      base,
      "--head",
      head,
      "--phase",
      "m9-p1",
    ],
    { cwd: dir, encoding: "utf8" },
  );
  let record: AuditOutcome["record"];
  try {
    record = JSON.parse(readFileSync(resultPath, "utf8")) as AuditOutcome["record"];
  } catch {
    record = undefined;
  }
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, record };
}

test("the real scope auditor accepts a generated declaration from its merge base, and mutating one files-to-touch entry in the plan changes the auditor's verdict", () => {
  /* DIRECTION 1: the plan declares `src/importer.ts`, the branch touches it,
     the auditor is green. */
  const first = stageAudit(planFixture());
  try {
    writeFileSync(join(first.dir, "src", "importer.ts"), "2\n");
    git(first.dir, ["add", "-A"]);
    git(first.dir, ["commit", "-q", "-m", "touch the declared path"]);
    const head = git(first.dir, ["rev-parse", "HEAD"]);
    const green = runAuditor(first.dir, first.outside, first.base, head);
    assert.equal(green.status, 0, green.stdout + green.stderr);
    assert.equal(green.record?.status, "green");
  } finally {
    rmSync(first.dir, { recursive: true, force: true });
    rmSync(first.outside, { recursive: true, force: true });
  }

  /* DIRECTION 2: the SAME branch change, against a plan whose
     `files-to-touch` no longer names `src/importer.ts`. The declaration is
     generated from that plan, so the auditor must now call the change
     undeclared. This is what makes the declaration DERIVED rather than a
     copy: the only thing edited is the plan. */
  const mutated = planFixture();
  {
    const phase = (mutated["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    phase["files-to-touch"] = [
      "src/somewhere-else.ts",
      "test/importer.test.ts",
      "`src/cli.ts` (edit only if step 4 requires it)",
    ];
  }
  const second = stageAudit(mutated);
  try {
    writeFileSync(join(second.dir, "src", "importer.ts"), "2\n");
    git(second.dir, ["add", "-A"]);
    git(second.dir, ["commit", "-q", "-m", "touch the no-longer-declared path"]);
    const head = git(second.dir, ["rev-parse", "HEAD"]);
    const red = runAuditor(second.dir, second.outside, second.base, head);
    assert.notEqual(red.status, 0, red.stdout + red.stderr);
    assert.equal(red.record?.status, "red");
    assert.match(red.record?.detail ?? "", /src\/importer\.ts/);

    /* And the generated declaration on disk really did change, so the verdict
       change is attributable to the projection and not to something else in
       the staging. */
    const declaration = JSON.parse(
      readFileSync(
        join(second.dir, "delivery", "plan", "phase-declarations", "m9-p1.json"),
        "utf8",
      ),
    ) as { filesToTouch: string[] };
    assert.deepEqual(declaration.filesToTouch, [
      "src/somewhere-else.ts",
      "test/importer.test.ts",
      "src/cli.ts",
    ]);
  } finally {
    rmSync(second.dir, { recursive: true, force: true });
    rmSync(second.outside, { recursive: true, force: true });
  }
});
