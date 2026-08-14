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
  // The witness runner's child-output contract is anchored by node-test-tap-real.txt.
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

test("a declaration widened on the head branch is NAMED rather than silently accepted, the declaration file's own change still needs authorizing, and the record's declaration sha256 remains the merge-base blob", () => {
  // THIS TEST USED TO ASSERT THE OPPOSITE VERDICT, and saying so is part of
  // the change (M3-P11 change B, DR-0031, delivery/plan/m3-p11-phase-spec.md:156).
  // Until this phase it read "a declaration widened on the head branch to add
  // an undeclared touch does not change the verdict", and it was M2-P4's own
  // criterion 5 witness. From this phase on an ADDITION at the head is
  // ALLOWED, and the protection against it is that the gate PRINTS it by
  // name for a reviewer to sign off.
  //
  // It is restated rather than deleted, and it is restated rather than left
  // to pass by accident: with change B in place the original assertions all
  // still held, for a DIFFERENT reason (the branch's change to the
  // declaration file itself was the violation, and `src/c.ts` appeared in
  // the detail only through the new amendment note). A test that passes for
  // a reason other than the one it names is exactly the shape this
  // repository keeps paying for, so both reasons are separated below.
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

    // ARM 1. Touch an undeclared path C, AND widen the declaration itself to
    // list C, without authorizing the declaration FILE. Still red, and the
    // reason is now precise: the violation is the declaration file, not C.
    writeFileSync(join(dir, "src", "c.ts"), "1\n");
    writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts", "src/c.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-am", "widen the declaration on head and touch C"]);
    const head = git(dir, ["rev-parse", "HEAD"]);

    const r = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
    assert.notEqual(r.run.status, 0);
    assert.equal(r.record?.status, "red");
    assert.match(
      r.record?.detail ?? "",
      /outside the declared scope: delivery\/plan\/phase-declarations\/m2-p4\.json/,
    );
    // C is NOT a violation any more; it appears only in the named amendment.
    assert.match(r.record?.detail ?? "", /DECLARATION AMENDED AT HEAD/);
    assert.match(r.record?.detail ?? "", /filesToTouch src\/c\.ts/);
    // The merge-base blob is still what the record pins. Change B reads the
    // head as well; it does not move the yardstick.
    assert.match(r.record?.detail ?? "", new RegExp(expectedSha256));

    const evidence = JSON.parse(
      readFileSync(join(r.evidenceDir, "scope-audit.json"), "utf8"),
    ) as { declarationSha256: string; mergeBase: string };
    assert.equal(evidence.declarationSha256, expectedSha256);
    assert.equal(evidence.mergeBase, base);

    // ARM 2. The same widening, with the declaration file authorized by the
    // head declaration itself. Green, and the addition is PRINTED.
    writeDeclaration(declDir, "m2-p4", {
      filesToTouch: ["src/a.ts", "src/c.ts", "delivery/plan/phase-declarations/m2-p4.json"],
    });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-am", "authorize the declaration file itself"]);
    const head2 = git(dir, ["rev-parse", "HEAD"]);
    const r2 = runScope(dir, outside, ["--base", base, "--head", head2, "--phase", "m2-p4"]);
    assert.equal(r2.run.status, 0, r2.run.stdout + r2.run.stderr);
    assert.equal(r2.record?.status, "green");
    assert.match(r2.run.stdout, /DECLARATION AMENDED AT HEAD/);
    assert.match(r2.run.stdout, /filesToTouch src\/c\.ts/);
    const evidence2 = JSON.parse(
      readFileSync(join(r2.evidenceDir, "scope-audit.json"), "utf8"),
    ) as { declarationSha256: string };
    assert.equal(evidence2.declarationSha256, expectedSha256);
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

/* ------------------------------------------------------------------ */
/* M3-P11 change A: a phase's OWN evidence is a standing extra.         */
/*                                                                      */
/* Both arms are witnessed, because one arm is not a witness: the       */
/* phase's own evidence must pass undeclared, and ANOTHER phase's       */
/* evidence must still redden. The third arm is the prefix-boundary     */
/* trap, which is not decoration: `m3-p1` is a proper string prefix of  */
/* `m3-p11`, so a `startsWith` with no boundary silently hands every    */
/* M3-P11 review document to the M3-P1 branch.                          */
/*                                                                      */
/* The witness runner's child-output contract for these tests is        */
/* anchored by node-test-tap-real.txt, as the other scope witnesses in  */
/* this file are, and the shape of the git output every audited path is */
/* derived from is anchored by git-name-status-real.txt.                */
/* ------------------------------------------------------------------ */

test("a phase's own clean-room review and delta verification pass undeclared, another phase's review reddens, and a longer phase id is not swallowed by a shorter one", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "delivery/review"), { recursive: true });
    mkdirSync(join(dir, "delivery/verification"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    writeDeclaration(declDir, "m3-p1", { filesToTouch: ["src/a.ts"] });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["checkout", "-q", "-b", fixtureBranch("m3-p1")]);

    // ARM 1: the phase's OWN evidence, in all four covered shapes, none of
    // them on the declaration.
    writeFileSync(join(dir, "src", "a.ts"), "2\n");
    writeFileSync(join(dir, "delivery/review/clean-room-m3-p1-hazard.md"), "own hazard review\n");
    writeFileSync(join(dir, "delivery/review/arbitration-m3-p1.md"), "own arbitration\n");
    writeFileSync(join(dir, "delivery/review/verification-m3-p1-fix-round.md"), "own verification\n");
    writeFileSync(join(dir, "delivery/verification/m3-p1-delta.md"), "own delta\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "own evidence"]);
    const head1 = git(dir, ["rev-parse", "HEAD"]);
    const r1 = runScope(dir, outside, ["--base", base, "--head", head1, "--phase", "m3-p1"]);
    assert.equal(r1.run.status, 0, r1.run.stdout + r1.run.stderr);
    assert.equal(r1.record?.status, "green");
    assert.equal(r1.record?.units, 5);

    // ARM 2: ANOTHER phase's clean-room review still reddens, naming it.
    writeFileSync(join(dir, "delivery/review/clean-room-m3-p9-hazard.md"), "somebody else's review\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "another phase's evidence"]);
    const head2 = git(dir, ["rev-parse", "HEAD"]);
    const r2 = runScope(dir, outside, ["--base", base, "--head", head2, "--phase", "m3-p1"]);
    assert.notEqual(r2.run.status, 0);
    assert.equal(r2.record?.status, "red");
    assert.match(r2.record?.detail ?? "", /delivery\/review\/clean-room-m3-p9-hazard\.md/);

    // ARM 3: the boundary. `m3-p11` starts with `m3-p1` as a string, and it
    // is a DIFFERENT phase, so it must redden on the m3-p1 branch.
    git(dir, ["rm", "-q", join(dir, "delivery/review/clean-room-m3-p9-hazard.md")]);
    writeFileSync(join(dir, "delivery/review/clean-room-m3-p11-criteria.md"), "a longer phase id\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "a longer phase id"]);
    const head3 = git(dir, ["rev-parse", "HEAD"]);
    const r3 = runScope(dir, outside, ["--base", base, "--head", head3, "--phase", "m3-p1"]);
    assert.notEqual(r3.run.status, 0);
    assert.equal(r3.record?.status, "red");
    assert.match(r3.record?.detail ?? "", /clean-room-m3-p11-criteria\.md/);

    // ARM 4: and a path one level DEEPER under delivery/review/ is not
    // swept in by the directory prefix, whatever its basename says.
    git(dir, ["rm", "-q", join(dir, "delivery/review/clean-room-m3-p11-criteria.md")]);
    mkdirSync(join(dir, "delivery/review/evidence"), { recursive: true });
    writeFileSync(join(dir, "delivery/review/evidence/clean-room-m3-p1-hazard.md"), "nested\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "nested evidence"]);
    const head4 = git(dir, ["rev-parse", "HEAD"]);
    const r4 = runScope(dir, outside, ["--base", base, "--head", head4, "--phase", "m3-p1"]);
    assert.notEqual(r4.run.status, 0);
    assert.equal(r4.record?.status, "red");
    assert.match(r4.record?.detail ?? "", /delivery\/review\/evidence\/clean-room-m3-p1-hazard\.md/);
  } finally {
    cleanup(dir, outside);
  }
});

/* ------------------------------------------------------------------ */
/* M3-P11 change B: the declaration is read from BOTH sides.            */
/*                                                                      */
/* Criteria 9, 10 and 11 are one test on purpose: criterion 11 asks for */
/* the addition and the removal to be demonstrated on the SAME          */
/* declaration, differing only in the DIRECTION of the change, and two  */
/* tests over two fixtures could not establish that.                    */
/* ------------------------------------------------------------------ */

test("a head declaration that ADDS an entry passes with the added entry PRINTED by name, and the same declaration with an entry REMOVED reddens naming it", () => {
  const { dir, outside } = initRepo();
  try {
    const declDir = join(dir, "delivery/plan/phase-declarations");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "1\n");
    writeFileSync(join(dir, "src", "kept.ts"), "1\n");
    // THE merge-base declaration. Both arms below start from this one file.
    writeDeclaration(declDir, "m2-p4", {
      filesToTouch: ["src/a.ts", "src/kept.ts"],
      declaredExtras: [],
    });
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);

    // DIRECTION 1, ADDITION (criterion 9). The head declaration adds
    // `src/added.ts` AND its own path, which is what a real phase amending
    // its own declaration must do: the declaration file is itself a changed
    // path, and only the addition rule can authorize it.
    writeDeclaration(declDir, "m2-p4", {
      filesToTouch: [
        "src/a.ts",
        "src/kept.ts",
        "src/added.ts",
        "delivery/plan/phase-declarations/m2-p4.json",
      ],
      declaredExtras: ["docs/added-extra.md"],
    });
    writeFileSync(join(dir, "src", "a.ts"), "2\n");
    writeFileSync(join(dir, "src", "added.ts"), "new file the merge base never authorized\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "amend the declaration and use the new entry"]);
    const headAdd = git(dir, ["rev-parse", "HEAD"]);
    const added = runScope(dir, outside, ["--base", base, "--head", headAdd, "--phase", "m2-p4"]);
    assert.equal(added.run.status, 0, added.run.stdout + added.run.stderr);
    assert.equal(added.record?.status, "green");
    // THE PRINTED LINE IS THE ASSERTION, not the exit code. A silent pass is
    // the failure this change would otherwise introduce (criterion 9).
    assert.match(added.run.stdout, /DECLARATION AMENDED AT HEAD/);
    assert.match(added.run.stdout, /filesToTouch src\/added\.ts/);
    assert.match(added.run.stdout, /declaredExtras docs\/added-extra\.md/);
    assert.match(added.run.stdout, /filesToTouch delivery\/plan\/phase-declarations\/m2-p4\.json/);
    assert.match(added.record?.detail ?? "", /filesToTouch src\/added\.ts/);
    const auditAdd = JSON.parse(
      readFileSync(join(added.evidenceDir, "scope-audit.json"), "utf8"),
    ) as { declarationDelta: { added: string[]; removed: string[] } };
    assert.ok(auditAdd.declarationDelta.added.includes("filesToTouch src/added.ts"));
    assert.deepEqual(auditAdd.declarationDelta.removed, []);

    // DIRECTION 2, REMOVAL (criterion 10), on THE SAME declaration, changed
    // only in direction: `src/kept.ts` is present at the merge base and is
    // taken away at the head.
    // The declaration's own `branch` field names `claude/m2-p4-fixture`, and
    // the gate cross-checks the checked-out branch against it, so the removal
    // arm must stand on a branch of that name too: the addition branch is
    // renamed out of the way and a fresh one is cut from the same base.
    git(dir, ["branch", "-q", "-m", `${fixtureBranch("m2-p4")}-addition`]);
    git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4"), base]);
    writeDeclaration(declDir, "m2-p4", {
      filesToTouch: ["src/a.ts", "delivery/plan/phase-declarations/m2-p4.json"],
      declaredExtras: [],
    });
    writeFileSync(join(dir, "src", "a.ts"), "3\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "narrow the declaration"]);
    const headRemove = git(dir, ["rev-parse", "HEAD"]);
    const removed = runScope(dir, outside, [
      "--base",
      base,
      "--head",
      headRemove,
      "--phase",
      "m2-p4",
    ]);
    assert.notEqual(removed.run.status, 0);
    assert.equal(removed.record?.status, "red");
    assert.match(removed.record?.detail ?? "", /REMOVES/);
    assert.match(removed.record?.detail ?? "", /filesToTouch src\/kept\.ts/);
  } finally {
    cleanup(dir, outside);
  }
});

test("a head that deletes the phase declaration outright reddens rather than falling back to the merge base", () => {
  // The largest possible removal. Without this arm, "a removal is hard"
  // would be true for every entry and false for the whole file.
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

    git(dir, ["rm", "-q", join(declDir, "m2-p4.json")]);
    writeFileSync(join(dir, "src", "a.ts"), "2\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "delete the declaration"]);
    const head = git(dir, ["rev-parse", "HEAD"]);
    const run = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);
    assert.notEqual(run.run.status, 0);
    assert.equal(run.record?.status, "red");
    assert.match(run.record?.detail ?? "", /not at head/);
  } finally {
    cleanup(dir, outside);
  }
});

test("a phase branch that changes ANOTHER phase's declaration is red however it got the scope, and a directory-prefix addition says that it is one", () => {
  // FIX ROUND 1, MECHANISM 2: change B relaxed a HARD control into a VISIBLE
  // one, and the visibility was weaker than the refusal it replaced in three
  // independent ways. Two of them are here (C-2 and M-1); the third, the note
  // never reaching the runner's stdout on the green arm, is in
  // test/gates.test.ts because it is the runner that was dropping it.
  //
  // C-2, THE MECHANISM. `compareDeclarations` reads exactly ONE file on both
  // sides, `<declarationsDir>/<phase>.json`, so "a removal is still hard" is a
  // guarantee about the audited phase's own declaration and about nothing
  // else. Every OTHER phase's declaration is, to this gate, an ordinary path:
  // get it into scope by any route and the branch may narrow it with no delta
  // check at all, and the narrowing lands on main and governs that phase's
  // later audit. A clean-room reviewer measured that green in a scratch
  // repository before this round.
  //
  // TWO STRUCTURALLY DIFFERENT MEMBERS, because the fix is a property of the
  // DIRECTORY and must not depend on how the scope was granted:
  //
  //   ARM 1  the grant is a head-side DIRECTORY PREFIX addition, which is the
  //          reachability change B introduced and the shape that was measured.
  //   ARM 2  the grant is a LITERAL path that was already in the MERGE BASE,
  //          so change B is not involved at all and no amendment exists. A fix
  //          that only inspected the head-side delta would leave this green.
  //
  // ARM 3 is the control: a branch touching only its OWN declaration is still
  // green, so the rule refuses a class rather than the directory.
  //
  // Every audited path below comes from git's own `diff --name-status`, whose
  // line shape is anchored by the real capture git-name-status-real.txt, and
  // the harness that runs this test parses node's TAP stream, anchored by
  // node-test-tap-real.txt.

  // ARM 1: head-side directory-prefix grant.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "a.ts"), "1\n");
      writeFileSync(join(dir, "src", "other.ts"), "1\n");
      writeFileSync(join(dir, "src", "guarded.ts"), "1\n");
      writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts"] });
      writeDeclaration(declDir, "m2-p7", {
        filesToTouch: ["src/other.ts", "src/guarded.ts"],
      });
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);

      writeDeclaration(declDir, "m2-p4", {
        filesToTouch: ["src/a.ts", "delivery/plan/phase-declarations/"],
      });
      // The narrowing itself: M2-P7 loses src/guarded.ts, on a branch that has
      // no relationship to M2-P7 whatsoever.
      writeDeclaration(declDir, "m2-p7", { filesToTouch: ["src/other.ts"] });
      writeFileSync(join(dir, "src", "a.ts"), "2\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "grant the directory and narrow another phase"]);
      const head = git(dir, ["rev-parse", "HEAD"]);
      const run = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);

      assert.notEqual(run.run.status, 0, run.run.stdout + run.run.stderr);
      assert.equal(run.record?.status, "red");
      assert.match(run.record?.detail ?? "", /not its own declaration/);
      assert.match(
        run.record?.detail ?? "",
        /delivery\/plan\/phase-declarations\/m2-p7\.json/,
      );
      // M-1: the grant that made this possible is named AS a directory prefix,
      // not as a string the same shape as a single-file addition.
      assert.match(run.run.stdout, /DECLARATION AMENDED AT HEAD/);
      assert.match(
        run.run.stdout,
        /filesToTouch delivery\/plan\/phase-declarations\/ \(DIRECTORY PREFIX/,
      );
      assert.match(run.run.stdout, /1 of them a DIRECTORY PREFIX/);
      const audit = JSON.parse(
        readFileSync(join(run.evidenceDir, "scope-audit.json"), "utf8"),
      ) as { foreignDeclarations: string[]; declarationDelta: { added: string[] } };
      assert.deepEqual(audit.foreignDeclarations, [
        "delivery/plan/phase-declarations/m2-p7.json",
      ]);
      // The recorded delta stays unannotated DATA; the annotation is a
      // property of the sentence a reviewer reads, not of the diff.
      assert.deepEqual(audit.declarationDelta.added, [
        "filesToTouch delivery/plan/phase-declarations/",
      ]);
    } finally {
      cleanup(dir, outside);
    }
  }

  // ARM 2: the grant was already in the merge base, so there is no amendment
  // and no head-side delta to inspect.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "a.ts"), "1\n");
      writeFileSync(join(dir, "src", "other.ts"), "1\n");
      writeFileSync(join(dir, "src", "guarded.ts"), "1\n");
      writeDeclaration(declDir, "m2-p4", {
        filesToTouch: ["src/a.ts", "delivery/plan/phase-declarations/m2-p7.json"],
      });
      writeDeclaration(declDir, "m2-p7", {
        filesToTouch: ["src/other.ts", "src/guarded.ts"],
      });
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);

      writeDeclaration(declDir, "m2-p7", { filesToTouch: ["src/other.ts"] });
      writeFileSync(join(dir, "src", "a.ts"), "2\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "narrow another phase under a merge-base grant"]);
      const head = git(dir, ["rev-parse", "HEAD"]);
      const run = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);

      assert.notEqual(run.run.status, 0, run.run.stdout + run.run.stderr);
      assert.equal(run.record?.status, "red");
      assert.match(run.record?.detail ?? "", /not its own declaration/);
      assert.match(
        run.record?.detail ?? "",
        /delivery\/plan\/phase-declarations\/m2-p7\.json/,
      );
      // No amendment exists on this arm, which is what makes it a different
      // member rather than a restatement of arm 1.
      assert.doesNotMatch(run.run.stdout, /DECLARATION AMENDED AT HEAD/);
    } finally {
      cleanup(dir, outside);
    }
  }

  // ARM 3, THE CONTROL. Touching only its OWN declaration is still green, and
  // a single-file addition is NOT annotated as a directory prefix.
  {
    const { dir, outside } = initRepo();
    try {
      const declDir = join(dir, "delivery/plan/phase-declarations");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "a.ts"), "1\n");
      writeDeclaration(declDir, "m2-p4", { filesToTouch: ["src/a.ts"] });
      writeDeclaration(declDir, "m2-p7", { filesToTouch: ["src/other.ts"] });
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      git(dir, ["checkout", "-q", "-b", fixtureBranch("m2-p4")]);

      writeDeclaration(declDir, "m2-p4", {
        filesToTouch: [
          "src/a.ts",
          "src/added.ts",
          "delivery/plan/phase-declarations/m2-p4.json",
        ],
      });
      writeFileSync(join(dir, "src", "a.ts"), "2\n");
      writeFileSync(join(dir, "src", "added.ts"), "new\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "amend only its own declaration"]);
      const head = git(dir, ["rev-parse", "HEAD"]);
      const run = runScope(dir, outside, ["--base", base, "--head", head, "--phase", "m2-p4"]);

      assert.equal(run.run.status, 0, run.run.stdout + run.run.stderr);
      assert.equal(run.record?.status, "green");
      assert.match(run.run.stdout, /DECLARATION AMENDED AT HEAD/);
      assert.match(run.run.stdout, /filesToTouch src\/added\.ts/);
      assert.doesNotMatch(run.run.stdout, /DIRECTORY PREFIX/);
      const audit = JSON.parse(
        readFileSync(join(run.evidenceDir, "scope-audit.json"), "utf8"),
      ) as { foreignDeclarations: string[] };
      assert.deepEqual(audit.foreignDeclarations, []);
    } finally {
      cleanup(dir, outside);
    }
  }
});
