import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

/**
 * M2-P4: the scope auditor.
 *
 * Every dangerous state below is the dangerous state, not the absent
 * feature (CLAUDE.md red-witness rule, strong form): the anti-widening
 * criterion stages a declaration genuinely edited on the audited branch,
 * the rename/deletion criteria stage real `git mv` and `git rm`, the
 * unresolvable-ref criterion stages a real invalid git object name, and the
 * unprobed-path criterion stages a real named pipe made with `mkfifo`.
 *
 * The scope gate is a STANDALONE script (src/gates/scope.ts), not a
 * `tiphys gates` subcommand: this phase's declaration does not include
 * src/cli.ts or src/commands/gates.ts, so it is invoked directly with
 * `node`, the same way `gates.manifest.json`'s `scope` entry invokes it.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scopeEntry = fileURLToPath(new URL("../src/gates/scope.ts", import.meta.url));
const tiphysEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

// Computed-URL dynamic import (CLAUDE.md warning 4): a literal relative
// import of a src module from test/ fails the build under
// rewriteRelativeImportExtensions.
const resultModule = (await import(new URL("../src/gates/result.ts", import.meta.url).href)) as {
  EXIT_RED: number;
  EXIT_GATE_ERROR: number;
};
const { EXIT_RED, EXIT_GATE_ERROR } = resultModule;

interface GateResultRecord {
  gate: string;
  status: string;
  units: number;
  unitLabel: string;
  detail: string;
  evidence: string[];
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-scope-"));
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Tiphys test",
  GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Tiphys test",
  GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
};

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

/**
 * The branch a phase's fixture declaration claims (and, after fix round 1,
 * the branch this suite must actually have checked out for that
 * declaration to be readable at all: the scope gate now cross-checks
 * `currentBranch` against the loaded declaration's own `branch` field).
 */
function fixtureBranch(phase: string): string {
  return `claude/${phase}-fixture`;
}

function writeDeclaration(
  declDir: string,
  phase: string,
  fields: { filesToTouch: string[]; declaredExtras?: string[]; branch?: string; id?: string },
): string {
  mkdirSync(declDir, { recursive: true });
  const body = `${JSON.stringify(
    {
      id: fields.id ?? phase.toUpperCase(),
      branch: fields.branch ?? fixtureBranch(phase),
      filesToTouch: fields.filesToTouch,
      declaredExtras: fields.declaredExtras ?? [],
      citations: [],
    },
    null,
    2,
  )}\n`;
  writeFileSync(join(declDir, `${phase}.json`), body);
  return body;
}

/**
 * Copy `src/` to a scratch location and return the path to ITS COPY of
 * `src/gates/scope.ts`. `declarationSchema()` resolves the shipped schema
 * document relative to `import.meta.url`, so running the COPY is the way to
 * mutate or remove that schema document for CR-1047's three failure arms
 * without touching the real installation this suite itself runs from.
 */
function copyInstallation(outside: string): string {
  const dest = join(outside, `installation-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dest, { recursive: true });
  const copied = spawnSync("cp", ["-r", join(repoRoot, "src"), dest], { encoding: "utf8" });
  assert.equal(copied.status, 0, `cp -r src failed: ${copied.stdout}${copied.stderr}`);
  return join(dest, "src", "gates", "scope.ts");
}

interface ProcessOutcome {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run src/gates/scope.ts directly, the way the manifest's command invokes it. */
function runScope(
  cwd: string,
  outside: string,
  args: string[],
): { run: ProcessOutcome; record: GateResultRecord | undefined; evidenceDir: string; resultPath: string } {
  const unique = Math.random().toString(36).slice(2);
  const evidenceDir = join(outside, `evidence-${unique}`);
  mkdirSync(evidenceDir, { recursive: true });
  const resultPath = join(outside, `result-${unique}.json`);
  const raw = spawnSync(
    process.execPath,
    [
      scopeEntry,
      "--declarations",
      "delivery/plan/phase-declarations",
      "--result",
      resultPath,
      "--evidence",
      evidenceDir,
      ...args,
    ],
    { cwd, encoding: "utf8" },
  );
  const run: ProcessOutcome = { status: raw.status, stdout: raw.stdout, stderr: raw.stderr };
  let record: GateResultRecord | undefined;
  try {
    record = JSON.parse(readFileSync(resultPath, "utf8")) as GateResultRecord;
  } catch {
    record = undefined;
  }
  return { run, record, evidenceDir, resultPath };
}

function initRepo(): { dir: string; outside: string } {
  const dir = scratch();
  const outside = scratch();
  git(dir, ["init", "-q", "-b", "main"]);
  return { dir, outside };
}

function cleanup(...dirs: string[]): void {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("scope direct entry runs through the logical macOS alias and writes its error result", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(declDir, { recursive: true });
    writeFileSync(join(declDir, "m2-p4.json"), "{}\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);

    const scopeCopy = copyInstallation(outside);
    rmSync(join(scopeCopy, "..", "schemas", "phase-declaration.schema.json"));
    let invocationPath = scopeCopy;
    if (process.platform === "darwin") {
      assert.match(scopeCopy, /^\/var\//, "macOS temp path must retain its logical /var spelling");
      assert.notEqual(scopeCopy, realpathSync(scopeCopy), "logical and physical spellings must differ");
    } else {
      invocationPath = join(outside, "scope-alias.ts");
      symlinkSync(scopeCopy, invocationPath);
    }

    const resultPath = join(outside, "scope-alias-result.json");
    const run = spawnSync(
      process.execPath,
      [
        invocationPath,
        "--declarations",
        "delivery/plan/phase-declarations",
        "--result",
        resultPath,
        "--base",
        base,
        "--head",
        "HEAD",
        "--phase",
        "m2-p4",
      ],
      { cwd: dir, encoding: "utf8" },
    );
    assert.equal(run.status, EXIT_GATE_ERROR, run.stdout + run.stderr);
    const record = JSON.parse(readFileSync(resultPath, "utf8")) as GateResultRecord;
    assert.equal(record.status, "error");
    assert.match(record.detail, /missing from this installation/);
  } finally {
    cleanup(dir, outside);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 1: declared green, undeclared red, both directions,        */
/* plus the under-touch note (a listed file not touched is not a        */
/* violation).                                                          */
/* ------------------------------------------------------------------ */

test("a diff touching every declared path is green with units equal to the touched count, and an extra undeclared path is red naming it", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    // C is declared but will not be touched, to witness the under-touch note.
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts", "src/b.ts", "src/c-untouched.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);
    // Fix round 1: the gate now cross-checks the current branch against the
    // declaration's own `branch` field, so every test that expects a
    // declaration to load successfully must actually stand on that branch.
    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);

    // DIRECTION 1: touch only declared paths A and B.
    writeFileSync(join(dir, "src", "a.ts"), "2\n");
    writeFileSync(join(dir, "src", "b.ts"), "1\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "touch A and B"]);
    const head1 = git(dir, ["rev-parse", "HEAD"]);
    const r1 = runScope(dir, outside, ["--base", base, "--head", head1, "--phase", "m2-p4"]);
    assert.equal(r1.run.status, 0, r1.run.stdout + r1.run.stderr);
    assert.equal(r1.record?.status, "green");
    assert.equal(r1.record?.units, 2);
    assert.match(r1.record?.detail ?? "", /src\/c-untouched\.ts/);

    // DIRECTION 2: also touch an undeclared C.
    writeFileSync(join(dir, "src", "extra-undeclared.ts"), "1\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "also touch undeclared"]);
    const head2 = git(dir, ["rev-parse", "HEAD"]);
    const r2 = runScope(dir, outside, ["--base", base, "--head", head2, "--phase", "m2-p4"]);
    assert.notEqual(r2.run.status, 0);
    assert.equal(r2.record?.status, "red");
    assert.match(r2.record?.detail ?? "", /src\/extra-undeclared\.ts/);
  } finally {
    cleanup(dir, outside);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 2: the two standing extras, plus another phase's history.  */
/* ------------------------------------------------------------------ */

test("touching the two standing extras without declaring them is green, and touching another phase's work history is red naming it", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "test"), { recursive: true });
    mkdirSync(join(dir, "delivery/work-history"), { recursive: true });
    writeFileSync(join(dir, "test/behaviors.json"), "{}\n");
    writeFileSync(join(dir, "delivery/work-history/m2-p4.md"), "old\n");
    writeFileSync(join(dir, "delivery/work-history/m2-p7.md"), "someone else's history\n");
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/scope.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);

    // DIRECTION 1: touch only the two standing extras, neither declared.
    writeFileSync(join(dir, "test/behaviors.json"), "{\"a\":1}\n");
    writeFileSync(join(dir, "delivery/work-history/m2-p4.md"), "new\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "touch own standing extras"]);
    const head1 = git(dir, ["rev-parse", "HEAD"]);
    const r1 = runScope(dir, outside, ["--base", base, "--head", head1, "--phase", "m2-p4"]);
    assert.equal(r1.run.status, 0, r1.run.stdout + r1.run.stderr);
    assert.equal(r1.record?.status, "green");

    // DIRECTION 2: also touch a DIFFERENT phase's own work history.
    writeFileSync(join(dir, "delivery/work-history/m2-p7.md"), "edited by the wrong phase\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "touch another phase's history too"]);
    const head2 = git(dir, ["rev-parse", "HEAD"]);
    const r2 = runScope(dir, outside, ["--base", base, "--head", head2, "--phase", "m2-p4"]);
    assert.notEqual(r2.run.status, 0);
    assert.equal(r2.record?.status, "red");
    assert.match(r2.record?.detail ?? "", /delivery\/work-history\/m2-p7\.md/);
  } finally {
    cleanup(dir, outside);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3: renames, both directions.                                */
/* ------------------------------------------------------------------ */

test("renaming a declared file to an undeclared path is red naming the new path, and renaming to another declared path is green", () => {
  const declFields = { filesToTouch: ["src/old.ts", "src/allowed-new.ts"] };

  // DIRECTION 1: rename to an UNDECLARED path.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "old.ts"), "1\n");
      writeDeclaration(declDir, "m2-p4", declFields);
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
      spawnSync("git", ["mv", "src/old.ts", "src/undeclared-new.ts"], { cwd: dir, env: GIT_ENV });
      git(dir, ["commit", "-q", "-am", "rename to undeclared"]);
      const head = git(dir, ["rev-parse", "HEAD"]);
      const r = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
      assert.notEqual(r.run.status, 0);
      assert.equal(r.record?.status, "red");
      assert.match(r.record?.detail ?? "", /src\/undeclared-new\.ts/);
      // The OLD path was declared, so it must NOT be named as a violation.
      assert.doesNotMatch(r.record?.detail ?? "", /outside the declared scope:[^(]*src\/old\.ts/);
      assert.equal(r.record?.units, 2);
    } finally {
      cleanup(dir, outside);
    }
  }

  // DIRECTION 2: rename to ANOTHER declared path.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "old.ts"), "1\n");
      writeDeclaration(declDir, "m2-p4", declFields);
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
      spawnSync("git", ["mv", "src/old.ts", "src/allowed-new.ts"], { cwd: dir, env: GIT_ENV });
      git(dir, ["commit", "-q", "-am", "rename to declared"]);
      const head = git(dir, ["rev-parse", "HEAD"]);
      const r = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
      assert.equal(r.run.status, 0, r.run.stdout + r.run.stderr);
      assert.equal(r.record?.status, "green");
      assert.equal(r.record?.units, 2);
    } finally {
      cleanup(dir, outside);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4: deletions, both directions.                              */
/* ------------------------------------------------------------------ */

test("deleting a declared file is green and deleting an undeclared file is red naming it", () => {
  // DIRECTION 1: delete a DECLARED file.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "gone.ts"), "1\n");
      writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/gone.ts"] });
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
      git(dir, ["rm", "-q", "src/gone.ts"]);
      git(dir, ["commit", "-q", "-am", "delete declared"]);
      const head = git(dir, ["rev-parse", "HEAD"]);
      const r = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
      assert.equal(r.run.status, 0, r.run.stdout + r.run.stderr);
      assert.equal(r.record?.status, "green");
      assert.equal(r.record?.units, 1);
    } finally {
      cleanup(dir, outside);
    }
  }

  // DIRECTION 2: delete an UNDECLARED file.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "gone2.ts"), "1\n");
      writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/other.ts"] });
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
      git(dir, ["rm", "-q", "src/gone2.ts"]);
      git(dir, ["commit", "-q", "-am", "delete undeclared"]);
      const head = git(dir, ["rev-parse", "HEAD"]);
      const r = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
      assert.notEqual(r.run.status, 0);
      assert.equal(r.record?.status, "red");
      assert.match(r.record?.detail ?? "", /src\/gone2\.ts/);
    } finally {
      cleanup(dir, outside);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5: the anti-widening property, this phase's reason to      */
/* exist. The declaration is read from the MERGE BASE blob, never from  */
/* the head, so widening it on the audited branch changes nothing.      */
/* ------------------------------------------------------------------ */

test("a declaration widened on the head branch to add an undeclared touch does not change the verdict, and the record's declaration sha256 equals the merge-base blob", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    const baseDeclarationBody = writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
    const expectedSha256 = createHash("sha256").update(Buffer.from(baseDeclarationBody, "utf8")).digest("hex");

    // On the audited branch: touch an undeclared path C, AND widen the
    // declaration itself to list C, the exact dangerous state named by
    // criterion 5 and this phase's hazard class ("a declaration widened on
    // the branch being audited").
    writeFileSync(join(dir, "src", "c.ts"), "1\n");
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts", "src/c.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-am", "widen the declaration on head and touch C"]);
    const head = git(dir, ["rev-parse", "HEAD"]);

    const r = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
    assert.notEqual(r.run.status, 0, "widening the declaration on the audited branch must not turn the verdict green");
    assert.equal(r.record?.status, "red");
    assert.match(r.record?.detail ?? "", /src\/c\.ts/);
    assert.match(r.record?.detail ?? "", new RegExp(expectedSha256));

    const evidence = JSON.parse(
      readFileSync(join(r.evidenceDir, "scope-audit.json"), "utf8"),
    ) as { declarationSha256: string; mergeBase: string };
    assert.equal(evidence.declarationSha256, expectedSha256);
    assert.equal(evidence.mergeBase, base);
  } finally {
    cleanup(dir, outside);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 6: branch-matches, three directions, through the FULL       */
/* runner (this precondition is evaluated by src/gates/run.ts, delivered */
/* by M2-P1, exercised here against THIS gate's own manifest entry).     */
/* ------------------------------------------------------------------ */

function runTiphys(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [tiphysEntry, ...args], { cwd, encoding: "utf8" });
}

function readSummaryFile(evidenceDir: string): {
  exitCode: number;
  gates: { id: string; status: string; detail: string }[];
} {
  return JSON.parse(readFileSync(join(evidenceDir, "summary.json"), "utf8")) as {
    exitCode: number;
    gates: { id: string; status: string; detail: string }[];
  };
}

function scopeManifest(dir: string): string {
  const manifestPath = join(dir, "scope-only-manifest.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        version: 1,
        gates: [
          {
            id: "scope",
            command: ["node", scopeEntry, "--declarations", "delivery/plan/phase-declarations"],
            unitLabel: "changed paths audited",
            applicability: "required",
            parameters: ["base", "head"],
            precondition: {
              id: "scope-branch-is-a-phase-branch",
              kind: "branch-matches",
              pattern: "claude/m[0-9]+-p[0-9]+-.*",
            },
          },
        ],
        destructiveCommands: [],
      },
      null,
      2,
    )}\n`,
  );
  return manifestPath;
}

test("a branch matching the phase pattern with no merge-base declaration is red naming the branch, a non-matching branch is not-applicable, and a matching branch without --phase is error", () => {
  const { dir, outside } = initRepo();
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base, no declaration anywhere in this repo"]);
    const base = git(dir, ["rev-parse", "HEAD"]);
    const manifest = scopeManifest(dir);

    /* DIRECTION 1: a branch matching the pattern, no declaration -> red. */
    git(dir, ["checkout", "-q", "-b", "claude/m2-p4-scope-auditor"]);
    writeFileSync(join(dir, "src", "a.ts"), "2\n");
    git(dir, ["commit", "-q", "-am", "matching branch, no declaration"]);
    const headMatching = git(dir, ["rev-parse", "HEAD"]);
    const ev1 = join(outside, "ev-matching-no-decl");
    const run1 = runTiphys(dir, [
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      ev1,
      "--base",
      base,
      "--head",
      headMatching,
      "--phase",
      "m2-p4",
    ]);
    assert.notEqual(run1.status, 0, run1.stdout + run1.stderr);
    const summary1 = readSummaryFile(ev1);
    const scopeRow1 = summary1.gates.find((row) => row.id === "scope");
    assert.equal(scopeRow1?.status, "red");
    assert.match(scopeRow1?.detail ?? "", /claude\/m2-p4-scope-auditor/);

    /* DIRECTION 2: a non-matching branch -> not-applicable. */
    git(dir, ["checkout", "-q", "-b", "claude/paperwork-only"]);
    const headNonMatching = git(dir, ["rev-parse", "HEAD"]);
    const ev2 = join(outside, "ev-non-matching");
    const run2 = runTiphys(dir, [
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      ev2,
      "--base",
      base,
      "--head",
      headNonMatching,
      "--phase",
      "m2-p4",
    ]);
    assert.notEqual(run2.status, 0, run2.stdout + run2.stderr);
    const summary2 = readSummaryFile(ev2);
    const scopeRow2 = summary2.gates.find((row) => row.id === "scope");
    assert.equal(scopeRow2?.status, "not-applicable");
    assert.match(summary2.gates[0]?.detail ?? "", /precondition .* evaluated and unmet/);

    /* DIRECTION 3: a matching branch, --phase omitted -> error. */
    git(dir, ["checkout", "-q", "claude/m2-p4-scope-auditor"]);
    const ev3 = join(outside, "ev-matching-no-phase");
    const run3 = runTiphys(dir, [
      "gates",
      "run",
      "--manifest",
      manifest,
      "--evidence",
      ev3,
      "--base",
      base,
      "--head",
      headMatching,
    ]);
    assert.notEqual(run3.status, 0, run3.stdout + run3.stderr);
    const summary3 = readSummaryFile(ev3);
    const scopeRow3 = summary3.gates.find((row) => row.id === "scope");
    assert.equal(scopeRow3?.status, "error");
    assert.notEqual(scopeRow3?.status, "not-applicable");
    assert.match(scopeRow3?.detail ?? "", /--phase/);
  } finally {
    cleanup(dir, outside);
  }
});

/* ------------------------------------------------------------------ */
/* Usage errors, direct invocation of the standalone binary.            */
/* ------------------------------------------------------------------ */

test("scope without --declarations, --base, or --phase exits 64 with usage", () => {
  const missingAll = spawnSync(process.execPath, [scopeEntry], { encoding: "utf8" });
  assert.equal(missingAll.status, 64);
  assert.match(missingAll.stderr, /^usage: node src\/gates\/scope\.ts/m);

  const missingSome = spawnSync(
    process.execPath,
    [scopeEntry, "--declarations", "x", "--result", "y.json"],
    { encoding: "utf8" },
  );
  assert.equal(missingSome.status, 64);
  assert.match(missingSome.stderr, /--base/);
  assert.match(missingSome.stderr, /--phase/);

  const unknownFlag = spawnSync(
    process.execPath,
    [scopeEntry, "--declarations", "x", "--result", "y.json", "--base", "HEAD", "--phase", "m2-p4", "--no-such-flag", "z"],
    { encoding: "utf8" },
  );
  assert.equal(unknownFlag.status, 64);
});

/* ------------------------------------------------------------------ */
/* An unresolvable ref is error, never a guessed red or green.          */
/* ------------------------------------------------------------------ */

test("an unresolvable base or head ref is error, never a guessed red or green", () => {
  const { dir, outside } = initRepo();
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);

    const r = runScope(dir, outside, [
      "--base",
      base,
      "--head",
      "tiphys-no-such-ref-9f3a",
      "--phase",
      "m2-p4",
    ]);
    assert.notEqual(r.run.status, 0);
    assert.equal(r.record?.status, "error");
    assert.notEqual(r.record?.status, "red");
    assert.notEqual(r.record?.status, "not-applicable");
    assert.match(r.record?.detail ?? "", /tiphys-no-such-ref-9f3a/);
  } finally {
    cleanup(dir, outside);
  }
});

/* ------------------------------------------------------------------ */
/* Diffs run against the merge base, never against a base that has      */
/* advanced past the true fork point (this phase's hazard class: "a diff */
/* computed against the head of main rather than against the merge      */
/* base, which silently absolves everything another phase landed in     */
/* between").                                                            */
/* ------------------------------------------------------------------ */

test("diffs are computed against the merge base of base and head, so a base that has advanced past the fork point does not misattribute another phase's changes", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "shared.ts"), "1\n");
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/only-mine.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "fork point"]);
    const forkPoint = git(dir, ["rev-parse", "HEAD"]);

    // This phase's branch: touches only its own declared file. Named to
    // match the declaration's own `branch` field (fixtureBranch("m2-p4")),
    // since fix round 1 cross-checks the two.
    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
    writeFileSync(join(dir, "src", "only-mine.ts"), "1\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "this phase's own change"]);
    const head = git(dir, ["rev-parse", "HEAD"]);

    // main advances INDEPENDENTLY after the fork, deleting the shared file
    // this phase never touched. If the gate diffed directly against
    // main's ADVANCED tip instead of the true merge base, this deletion
    // would appear in the diff and be misattributed as a violation this
    // phase committed.
    git(dir, ["checkout", "-q", "main"]);
    git(dir, ["rm", "-q", "src/shared.ts"]);
    git(dir, ["commit", "-q", "-m", "another phase merged after the fork point"]);
    const advancedMain = git(dir, ["rev-parse", "HEAD"]);
    // Fix round 1: the gate now cross-checks both the current branch and
    // the resolved --head against what is actually checked out, so the
    // working tree must be back on the audited branch (at its real tip)
    // before invoking the gate, even though --base names main's advanced
    // (and, from here, uncommitted-to-by-this-branch) tip.
    git(dir, ["checkout", "-q", fixtureBranch("m2-p4")]);

    const r = runScope(dir, outside, ["--base", advancedMain, "--head", head, "--phase", "m2-p4"]);
    assert.equal(r.run.status, 0, r.run.stdout + r.run.stderr);
    assert.equal(r.record?.status, "green");
    assert.doesNotMatch(r.record?.detail ?? "", /shared\.ts/);
    const evidence = JSON.parse(
      readFileSync(join(r.evidenceDir, "scope-audit.json"), "utf8"),
    ) as { mergeBase: string };
    assert.equal(evidence.mergeBase, forkPoint);
    assert.notEqual(evidence.mergeBase, advancedMain);
  } finally {
    cleanup(dir, outside);
  }
});

/* ------------------------------------------------------------------ */
/* Declaration present at the merge base but structurally invalid, or   */
/* not JSON at all: error, never a guessed verdict (M2-C-3).            */
/* ------------------------------------------------------------------ */

test("a declaration that does not parse as JSON, or fails schema validation, is error rather than a guessed verdict", () => {
  // DIRECTION 1: not JSON at all.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(declDir, { recursive: true });
      writeFileSync(join(declDir, "m2-p4.json"), "{ this is not json");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      writeFileSync(join(dir, "src.txt"), "x\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "head"]);
      const head = git(dir, ["rev-parse", "HEAD"]);
      const r = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
      assert.notEqual(r.run.status, 0);
      assert.equal(r.record?.status, "error");
      assert.match(r.record?.detail ?? "", /does not parse as JSON/);
    } finally {
      cleanup(dir, outside);
    }
  }

  // DIRECTION 2: valid JSON, but missing a required field.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(declDir, { recursive: true });
      writeFileSync(
        join(declDir, "m2-p4.json"),
        `${JSON.stringify({ id: "M2-P4", filesToTouch: [], declaredExtras: [], citations: [] })}\n`,
      );
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      writeFileSync(join(dir, "src.txt"), "x\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "head"]);
      const head = git(dir, ["rev-parse", "HEAD"]);
      const r = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
      assert.notEqual(r.run.status, 0);
      assert.equal(r.record?.status, "error");
      assert.match(r.record?.detail ?? "", /branch/);
    } finally {
      cleanup(dir, outside);
    }
  }
});

/* ------------------------------------------------------------------ */
/* M2-C-6: a named pipe at --result is refused naming the path and the  */
/* type, without blocking.                                              */
/* ------------------------------------------------------------------ */

test("a named pipe at --result is refused naming the path and the type, without blocking", () => {
  const { dir, outside } = initRepo();
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);

    const evidenceDir = join(outside, "evidence-fifo");
    mkdirSync(evidenceDir, { recursive: true });
    const fifoResult = join(outside, "result-fifo.json");
    const made = spawnSync("mkfifo", [fifoResult], { encoding: "utf8" });
    assert.equal(made.status, 0, `mkfifo failed: ${made.stderr}`);

    // Every assertion after this point only executes because the process
    // RETURNED. A gate that opened the pipe would block in the kernel and
    // this test would time out rather than fail an assertion.
    const run = spawnSync(
      process.execPath,
      [
        scopeEntry,
        "--declarations",
        "delivery/plan/phase-declarations",
        "--result",
        fifoResult,
        "--evidence",
        evidenceDir,
        "--base",
        base,
        "--head",
        "HEAD",
        "--phase",
        "m2-p4",
      ],
      { cwd: dir, encoding: "utf8" },
    );
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /result-fifo\.json/);
    assert.match(run.stderr, /named pipe/);
  } finally {
    cleanup(dir, outside);
  }
});

/**
 * A second, STRUCTURALLY DIFFERENT M2-C-6 member (CLAUDE.md, "one witness is
 * not a class"): the evidence side artifact is a best-effort write, guarded
 * the same way, but its refusal does not fail the gate the way --result's
 * does. Both directions witness the guard actually firing without ever
 * blocking, and the gate's own verdict survives the refusal.
 */
test("a named pipe at the evidence path is refused and logged without blocking, and the gate's own verdict still stands", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
    writeFileSync(join(dir, "src", "a.ts"), "2\n");
    git(dir, ["commit", "-q", "-am", "touch declared"]);
    const head = git(dir, ["rev-parse", "HEAD"]);

    const evidenceDir = join(outside, "evidence-fifo-2");
    mkdirSync(evidenceDir, { recursive: true });
    const made = spawnSync("mkfifo", [join(evidenceDir, "scope-audit.json")], { encoding: "utf8" });
    assert.equal(made.status, 0, `mkfifo failed: ${made.stderr}`);
    const resultPath = join(outside, "result-fifo-evidence.json");

    const run = spawnSync(
      process.execPath,
      [
        scopeEntry,
        "--declarations",
        "delivery/plan/phase-declarations",
        "--result",
        resultPath,
        "--evidence",
        evidenceDir,
        "--base",
        base,
        "--head",
        head,
        "--phase",
        "m2-p4",
      ],
      { cwd: dir, encoding: "utf8" },
    );
    // The gate's own audit verdict is unaffected by the evidence write's
    // refusal: it still reaches and reports green.
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stderr, /scope-audit\.json/);
    assert.match(run.stderr, /named pipe/);
    const record = JSON.parse(readFileSync(resultPath, "utf8")) as GateResultRecord;
    assert.equal(record.status, "green");
    assert.deepEqual(record.evidence, []);
  } finally {
    cleanup(dir, outside);
  }
});

/* ====================================================================== */
/* FIX ROUND 1 (CR-1030/CR-1045, HIGH): the mechanism is that every input   */
/* selecting what is measured (--phase, --base, --head) was forwarded       */
/* verbatim and never cross-checked against a property of the branch under  */
/* audit, so the audited party could choose the yardstick. Three            */
/* structurally different members, each closed by a DIFFERENT check, so     */
/* each gets its own witness (CLAUDE.md, "one witness is not a class"):     */
/*   W1 --phase names a different, more permissive declaration (closed by   */
/*      the branch-vs-declaration.branch cross-check: the swapped-in        */
/*      declaration's own `branch` field never matches the real branch).    */
/*   W2 --base is forked onto the audited branch itself, so the merge base  */
/*      lands on a blob the branch itself authored (closed by asserting the */
/*      merge base is an ancestor of the configured trunk).                 */
/*   W3 --head is set to an ancestor of the real tip, hiding a commit       */
/*      without changing the merge base at all, so W2's check cannot catch  */
/*      it (closed by cross-checking --head against the commit actually     */
/*      checked out).                                                       */
/* Every witness below runs the HONEST construction first (a control that   */
/* still reaches the correct verdict) before the ATTACK, which is the       */
/* DANGEROUS state, not merely the absent feature: each attack reproduces,  */
/* on THIS gate's own real code path, the exact live GREEN clean-room       */
/* review CR-1045 captured before this round, and asserts it is now error.  */
/* ====================================================================== */

test("--phase naming a different, more permissive, already-committed declaration is error, not the more permissive verdict (yardstick swap, W1)", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    // TWO valid, internally consistent declarations at the SAME merge base:
    // the branch's own (restricted) and a different phase's (permissive).
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts"] });
    writeDeclaration(declDir, "m2-p9", { filesToTouch: ["src/a.ts", "src/extra.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);

    // The REAL branch is m2-p4's own.
    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
    writeFileSync(join(dir, "src", "extra.ts"), "1\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "touch a file undeclared for m2-p4"]);
    const head = git(dir, ["rev-parse", "HEAD"]);

    // CONTROL: audited against its own declaration, correctly red.
    const honest = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
    assert.notEqual(honest.run.status, 0, honest.run.stdout + honest.run.stderr);
    assert.equal(honest.record?.status, "red");
    assert.match(honest.record?.detail ?? "", /src\/extra\.ts/);

    // ATTACK (the dangerous state): --phase names a DIFFERENT, more
    // permissive, already-committed declaration for the SAME base/head/
    // branch. Before fix round 1 this was GREEN (CR-1045's own live
    // reproduction: "IDENTICAL base/head, only --phase changed").
    const attack = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p9"]);
    assert.notEqual(attack.run.status, 0, attack.run.stdout + attack.run.stderr);
    assert.equal(attack.record?.status, "error");
    assert.notEqual(attack.record?.status, "green");
    assert.match(attack.record?.detail ?? "", /claude\/m2-p4-fixture/);
    assert.match(attack.record?.detail ?? "", /claude\/m2-p9-fixture/);
  } finally {
    cleanup(dir, outside);
  }
});

test("a merge base forked onto the branch under audit, not the true fork point with main, is error (merge-base fork, W2)", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const trueBase = git(dir, ["rev-parse", "HEAD"]);

    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
    // Commit 1 on the branch: self-widen the declaration.
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts", "src/c.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "widen the declaration on the audited branch"]);
    const forgedBase = git(dir, ["rev-parse", "HEAD"]);
    // Commit 2: touch the newly self-authorized path.
    writeFileSync(join(dir, "src", "c.ts"), "1\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "touch the newly self-authorized file"]);
    const head = git(dir, ["rev-parse", "HEAD"]);

    // CONTROL: audited honestly against the true fork point with main, the
    // anti-widening property (criterion 5) still holds: red.
    const honest = runScope(dir, outside, ["--base", trueBase, "--head", head, "--phase", "m2-p4"]);
    assert.notEqual(honest.run.status, 0, honest.run.stdout + honest.run.stderr);
    assert.equal(honest.record?.status, "red");

    // ATTACK (the dangerous state): --base names a commit ON THE AUDITED
    // BRANCH ITSELF (the widening commit), so `merge-base(forgedBase, head)`
    // resolves to forgedBase, whose declaration blob is ALREADY widened.
    // Before fix round 1 this was GREEN (CR-1045's own live reproduction,
    // W2: "declarationSha256 ... the BRANCH's widened blob, not main's").
    const attack = runScope(dir, outside, ["--base", forgedBase, "--head", head, "--phase", "m2-p4"]);
    assert.notEqual(attack.run.status, 0, attack.run.stdout + attack.run.stderr);
    assert.equal(attack.record?.status, "error");
    assert.notEqual(attack.record?.status, "green");
    assert.match(attack.record?.detail ?? "", /not an ancestor of/);
    assert.match(attack.record?.detail ?? "", new RegExp(forgedBase));
  } finally {
    cleanup(dir, outside);
  }
});

test("a --head that hides the last commit without changing the merge base is error (hidden commit, W3)", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);

    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);
    writeFileSync(join(dir, "src", "a.ts"), "2\n");
    git(dir, ["commit", "-q", "-am", "honest commit: touch only the declared file"]);
    const honestHead = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, "src", "undeclared.ts"), "1\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "the commit the attack hides"]);
    const realHead = git(dir, ["rev-parse", "HEAD"]);

    // CONTROL: audited honestly against the real tip, correctly red.
    const honest = runScope(dir, outside, ["--base", base, "--head", realHead, "--phase", "m2-p4"]);
    assert.notEqual(honest.run.status, 0, honest.run.stdout + honest.run.stderr);
    assert.equal(honest.record?.status, "red");
    assert.match(honest.record?.detail ?? "", /src\/undeclared\.ts/);

    // ATTACK (the dangerous state): the working tree is ACTUALLY standing at
    // realHead (never checked out anywhere else), but --head names an
    // ancestor of it, hiding the undeclared commit from the diff. The merge
    // base does not change either way (both resolve to `base`), so W2's
    // trunk-ancestry check cannot catch this; only cross-checking --head
    // against the real checkout does. Before fix round 1 this was GREEN
    // (CR-1045's own live reproduction, W3: "the last commit is simply not
    // measured").
    const attack = runScope(dir, outside, ["--base", base, "--head", honestHead, "--phase", "m2-p4"]);
    assert.notEqual(attack.run.status, 0, attack.run.stdout + attack.run.stderr);
    assert.equal(attack.record?.status, "error");
    assert.notEqual(attack.record?.status, "green");
    assert.match(attack.record?.detail ?? "", new RegExp(honestHead));
    assert.match(attack.record?.detail ?? "", new RegExp(realHead));
  } finally {
    cleanup(dir, outside);
  }
});

/* ====================================================================== */
/* CR-1047 (medium): the gate's own failure path was an uncaught throw.     */
/* `declarationSchema()` throws on three structurally different arms, all   */
/* reached the same way (a schema read that is not a clean "read" or       */
/* "absent"), and before this round none of them was caught: Node's        */
/* default uncaught-exception exit code is 1, identical to EXIT_RED, so a   */
/* crash there was indistinguishable from a genuine red verdict to a        */
/* consumer reading only the exit code. Each arm below is constructed       */
/* against a COPY of the installation (`copyInstallation`), because the     */
/* schema path is resolved relative to `import.meta.url`, not to a          */
/* declarations directory a scratch repo can override.                     */
/* ====================================================================== */

test("a missing schema, a schema outside the closed keyword set, or a named pipe at the schema path is a clean error record, never an uncaught crash read as a verdict (CR-1047)", () => {
  // ARM A: the schema document is absent from the installation.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(declDir, { recursive: true });
      // Valid JSON is enough to reach declarationSchema(): the code loads
      // the schema BEFORE it validates the parsed document against it.
      writeFileSync(join(declDir, "m2-p4.json"), "{}\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);

      const scopeCopy = copyInstallation(outside);
      const schemaPath = join(scopeCopy, "..", "schemas", "phase-declaration.schema.json");
      rmSync(schemaPath);

      const resultPath = join(outside, "result-arm-a.json");
      const run = spawnSync(
        process.execPath,
        [
          scopeCopy,
          "--declarations",
          "delivery/plan/phase-declarations",
          "--result",
          resultPath,
          "--base",
          base,
          "--head",
          "HEAD",
          "--phase",
          "m2-p4",
        ],
        { cwd: dir, encoding: "utf8" },
      );
      assert.notEqual(run.status, 0);
      assert.notEqual(
        run.status,
        EXIT_RED,
        `must not read as EXIT_RED (a verdict), never a crash: stdout=${run.stdout} stderr=${run.stderr}`,
      );
      assert.equal(run.status, EXIT_GATE_ERROR);
      const record = JSON.parse(readFileSync(resultPath, "utf8")) as GateResultRecord;
      assert.equal(record.status, "error");
      assert.match(record.detail, /missing from this installation/);
    } finally {
      cleanup(dir, outside);
    }
  }

  // ARM B: the schema document carries a keyword outside the closed set.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(declDir, { recursive: true });
      writeFileSync(join(declDir, "m2-p4.json"), "{}\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);

      const scopeCopy = copyInstallation(outside);
      const schemaPath = join(scopeCopy, "..", "schemas", "phase-declaration.schema.json");
      writeFileSync(
        schemaPath,
        `${JSON.stringify({ type: "object", oneOf: [{ required: ["id"] }, { required: ["branch"] }] })}\n`,
      );

      const resultPath = join(outside, "result-arm-b.json");
      const run = spawnSync(
        process.execPath,
        [
          scopeCopy,
          "--declarations",
          "delivery/plan/phase-declarations",
          "--result",
          resultPath,
          "--base",
          base,
          "--head",
          "HEAD",
          "--phase",
          "m2-p4",
        ],
        { cwd: dir, encoding: "utf8" },
      );
      assert.notEqual(run.status, 0);
      assert.notEqual(
        run.status,
        EXIT_RED,
        `must not read as EXIT_RED (a verdict), never a crash: stdout=${run.stdout} stderr=${run.stderr}`,
      );
      assert.equal(run.status, EXIT_GATE_ERROR);
      const record = JSON.parse(readFileSync(resultPath, "utf8")) as GateResultRecord;
      assert.equal(record.status, "error");
      assert.match(record.detail, /unsupported schema keyword oneOf/);
    } finally {
      cleanup(dir, outside);
    }
  }

  // ARM C: a named pipe sits at the schema path.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(declDir, { recursive: true });
      writeFileSync(join(declDir, "m2-p4.json"), "{}\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);

      const scopeCopy = copyInstallation(outside);
      const schemaPath = join(scopeCopy, "..", "schemas", "phase-declaration.schema.json");
      rmSync(schemaPath);
      const made = spawnSync("mkfifo", [schemaPath], { encoding: "utf8" });
      assert.equal(made.status, 0, `mkfifo failed: ${made.stderr}`);

      const resultPath = join(outside, "result-arm-c.json");
      // Every assertion after this point only executes because the process
      // RETURNED: a gate that opened the pipe would block in the kernel.
      const run = spawnSync(
        process.execPath,
        [
          scopeCopy,
          "--declarations",
          "delivery/plan/phase-declarations",
          "--result",
          resultPath,
          "--base",
          base,
          "--head",
          "HEAD",
          "--phase",
          "m2-p4",
        ],
        { cwd: dir, encoding: "utf8" },
      );
      assert.notEqual(run.status, 0);
      assert.notEqual(
        run.status,
        EXIT_RED,
        `must not read as EXIT_RED (a verdict), never a crash: stdout=${run.stdout} stderr=${run.stderr}`,
      );
      assert.equal(run.status, EXIT_GATE_ERROR);
      const record = JSON.parse(readFileSync(resultPath, "utf8")) as GateResultRecord;
      assert.equal(record.status, "error");
      assert.match(record.detail, /named pipe|not a regular file/);
    } finally {
      cleanup(dir, outside);
    }
  }
});
