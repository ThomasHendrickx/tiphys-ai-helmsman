/**
 * THE REVIEW-EVIDENCE TESTS THAT OUTLIVED THE DECORRELATION CHECK (kernel plan
 * M3-P9, M5-P3; M6-P5 deleted `scripts/check-dual-review.mjs` and the
 * `dual-review-decorrelation` check, DR-0062).
 *
 * What stays: the verdict FIXTURES under `witness/fixtures/dual-review/` are
 * real verdicts that validate; the merge-authority regime a context declares is
 * read fail-closed by `verdict-pair-approves`; and the merge gate, run through
 * the REAL runner and the shipped `gate-registry.yaml`, is red for a missing
 * review and counts reviews through the kernel's review records.
 *
 * THE CONTEXT IS ASSEMBLED FROM SHIPPED ARTIFACTS. Each staged directory
 * carries the repository's own `assurance-modes.yaml` and a charter derived
 * from `templates/charter.example.yaml`, because the check reads the declared
 * mode's `merge-authority` rather than assuming one.
 *
 * `src` is imported through the computed-URL dynamic import pattern (CLAUDE.md
 * standing warning 4).
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, sep } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { realpathSync as ceilingRealpath } from "node:fs";
import { tmpdir as ceilingTmpdir } from "node:os";
import { delimiter as ceilingDelimiter } from "node:path";
import { recordVerdicts } from "./support/review-records.ts";
import { removeGitDirectory } from "./support/remove-git-directory.ts";

/*
 * NO REPOSITORY ABOVE THE SCRATCH ROOT (kernel 0.2.1 fix round 3). Tests in
 * this file stage context directories under os.tmpdir() that are NOT git
 * repositories (or whose `.git` is removed) and assert what the code does
 * when no repository is found. Git DISCOVERS a repository in any ancestor, so
 * a repository at or above os.tmpdir() turns every such arm into a read of
 * THAT repository's HEAD. Measured: the whole suite with os.tmpdir() inside a
 * real repository failed 64 tests across six files, this one among them, and
 * CI run 35946757118 failed one of them the same way. The ceiling stops
 * discovery from climbing out of os.tmpdir(); repositories a test stages
 * INSIDE it (and contexts nested in them) are still found. Every child
 * process inherits it from here.
 */
const GIT_CEILING = [ceilingRealpath(ceilingTmpdir()), ceilingTmpdir(), process.env["GIT_CEILING_DIRECTORIES"] ?? ""]
  .filter((entry) => entry !== "")
  .join(ceilingDelimiter);
process.env["GIT_CEILING_DIRECTORIES"] = GIT_CEILING;
/*
 * AND NO REPOSITORY BY THE ENVIRONMENT (kernel 0.2.1 fix round 3, the
 * orchestrator's decision on open question 13). The ceiling above stops
 * DISCOVERY; it does not stop an inherited GIT_DIR, which names a repository
 * outright and was the only shape measured to reproduce CI's exact message.
 * So the names that relocate the repository, its objects or its index are
 * removed for this file and every child it spawns.
 */
const INHERITED_REPOSITORY_ENV = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
];
for (const name of INHERITED_REPOSITORY_ENV) {
  delete process.env[name];
}
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const fixturesDir = join(repoRoot, "witness", "fixtures", "dual-review");

const checksModule = (await import(new URL("../src/checks.ts", import.meta.url).href)) as {
  missingRegimeDocument: (contextDirectory: string) => { document: string; reason: string } | undefined;
  readReviewFamilies: (
    contextDirectory: string,
  ) =>
    | { kind: "absent" }
    | { kind: "error"; reason: string }
    | { kind: "declared"; families: string[]; provenance: { sha256: string } };
  loadCommittedVerdicts: (
    contextDirectory: string,
    source?: { kind: "commit"; ref: string; refSha: string; scope: string },
  ) => { ok: true; verdicts: unknown[] } | { ok: false; reason: string };
};

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
};

/**
 * Stage a context directory: the real mode document, a charter declaring
 * `mode`, and the named verdict fixtures under `delivery/review/`.
 *
 * The charter is the SHIPPED TEMPLATE with one line changed, so the only thing
 * that differs between the delegated arm and the owner arm is the declared
 * mode, which is exactly the variable criterion 7's fifth direction is about.
 */
function stageContext(mode: string, fixtures: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-dual-review-"));
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(
    join(repoRoot, "templates", "charter.example.yaml"),
    "utf8",
  );
  const retargeted = charter.replace(/^delivery-mode: .*$/m, `delivery-mode: ${mode}`);
  assert.notEqual(retargeted, charter === retargeted ? "" : charter, "charter mode line not found");
  writeFileSync(join(dir, "charter.yaml"), retargeted);
  for (const fixture of fixtures) {
    copyFileSync(join(fixturesDir, fixture), join(dir, "delivery", "review", fixture));
  }
  return dir;
}


/* The fixtures are real verdicts, not stand-ins                        */
/* ------------------------------------------------------------------ */

test("every dual-review fixture validates against the shipped verdict schema", () => {
  /* IF THE FIXTURES WERE NOT VALID VERDICTS the seven directions below would be
     exercising the check against documents no reviewer could produce, and every
     result would be about a shape that cannot occur. */
  const names = readdirSync(fixturesDir).filter((name) => name.endsWith(".yaml"));
  assert.ok(names.length >= 5, `only ${String(names.length)} fixtures were found`);
  for (const name of names) {
    const run = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "verdict", join(fixturesDir, name)],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const output = `${run.stdout}${run.stderr}`;
    /* Checks registered for `verdict` require a context and this invocation
       deliberately gives none, so each reports `SKIPPED <id> no context`.
       Since kernel 0.2.1 a run whose only non-pass results are skips exits 0,
       so the exit is asserted too; what makes a skip visible is that every
       line that is there is a skip, never a pass. */
    assert.equal(run.status, 0, `${name}: ${output}`);
    assert.doesNotMatch(output, /INVALID/, `${name}: ${output}`);
    for (const line of output.split("\n").filter((entry) => entry.trim() !== "")) {
      assert.match(line, /^SKIPPED [a-z-]+ no context$/, `${name}: ${line}`);
    }
  }
});

test("the fixtures are refused when the schema is not satisfied, so the check above is not vacuous", () => {
  /* THE ARM THAT MAKES THE TEST ABOVE MEAN SOMETHING. "No INVALID lines" is
     also what a validator that validates nothing prints. */
  const dir = mkdtempSync(join(tmpdir(), "tiphys-verdict-invalid-"));
  try {
    const broken = readFileSync(
      join(fixturesDir, "decorrelated-criteria.yaml"),
      "utf8",
    ).replace(/^review-contract: criteria$/m, "review-contract: improvised");
    const path = join(dir, "broken.yaml");
    writeFileSync(path, broken);
    const run = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "verdict", path],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.notEqual(run.status, 0);
    assert.match(`${run.stdout}${run.stderr}`, /INVALID #\/review-contract/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the fixture framings name framings the shipped checklist actually declares", () => {
  /* A framing id that no checklist declares would make the decorrelation
     fixtures assert over a vocabulary that does not exist. */
  const checklist = yamlModule.parse(
    readFileSync(join(repoRoot, "checklists", "clean-room.yaml"), "utf8"),
  ) as { framings: { id: string }[] };
  const declared = new Set(checklist.framings.map((framing) => framing.id));
  /* M6-P2 removed the criteria-contract framing with the criteria contract
     (DR-0064). Fixtures naming it are history, as committed verdicts are. */
  declared.add("criteria-contract");
  for (const name of readdirSync(fixturesDir).filter((entry) => entry.endsWith(".yaml"))) {
    const verdict = yamlModule.parse(
      readFileSync(join(fixturesDir, name), "utf8"),
    ) as { framing: string };
    assert.ok(declared.has(verdict.framing), `${name} names framing ${verdict.framing}`);
  }
});

/* ------------------------------------------------------------------ */
/* The merge-authority regime is read fail-closed                       */
/* ------------------------------------------------------------------ */

/** `tiphys validate --type verdict` over the one staged verdict, with the directory as context. */
function validateInContext(dir: string, fixture: string): { status: number; output: string } {
  const run = spawnSync(
    process.execPath,
    [cliEntry, "validate", "--type", "verdict", "--context", dir, join(dir, "delivery", "review", fixture)],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
}

/*
 * ONE VERDICT UNDER A DELEGATED GRANT, so the pair rule of
 * `verdict-pair-approves` reddens exactly when the regime is read as delegated.
 * The not-a-delegated-grant arm is a REPORT, so a regime read wrongly as some
 * other authority exits 0: that is the fail-open direction both tests below
 * guard. M6-P5 moved them here from the deleted decorrelation check, whose
 * regime reader `verdict-pair-approves` shares.
 */
const ONE_VERDICT = "decorrelated-criteria.yaml";

test("a lookalike character in merge-authority does not turn a delegated grant into no grant", () => {
  /* Measured before the canonical form existed, on the real shipped script,
     with a Cyrillic o and with an ASCII case change: both exited 0. */
  for (const [label, authority] of [
    ["cyrillic o", `delegated-under-c${String.fromCodePoint(0x043e)}nditions`],
    ["ascii case", "Delegated-Under-Conditions"],
  ] as const) {
    const dir = stageContext("full", [ONE_VERDICT]);
    try {
      const path = join(dir, "assurance-modes.yaml");
      const before = readFileSync(path, "utf8");
      const after = before.replace(
        /merge-authority: delegated-under-conditions/,
        `merge-authority: "${authority}"`,
      );
      assert.notEqual(after, before, "merge-authority line not rewritten");
      writeFileSync(path, after);
      const run = validateInContext(dir, ONE_VERDICT);
      assert.equal(run.status, 1, `${label} exited ${String(run.status)}: ${run.output}`);
      /* THE CHECK MUST NOT HAVE REPORTED ITSELF INAPPLICABLE. That is the
         precise failure: not a wrong answer, but no answer presented as one. */
      assert.doesNotMatch(run.output, /which is not a delegated grant/, run.output);
      assert.match(run.output, /\(check: verdict-pair-approves\)/, run.output);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("a mode that states no merge-authority is refused rather than reported as not a delegated grant", () => {
  /* `String(mode.mode["merge-authority"] ?? "")` once made a mode with no
     merge-authority compare unequal to the delegated grant, and that arm is a
     REPORT, so the whole rule turned off under a regime nobody had
     established. Measured at d9d5a1d before the repair. */
  const dir = stageContext("full", [ONE_VERDICT]);
  try {
    const path = join(dir, "assurance-modes.yaml");
    const before = readFileSync(path, "utf8");
    const line = /^ +merge-authority: .*\n/m;
    assert.match(before, line, `no merge-authority line in ${path}`);
    writeFileSync(path, before.replace(line, ""));
    const run = validateInContext(dir, ONE_VERDICT);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /declares no merge-authority for mode full/, run.output);
    assert.match(run.output, /could not be established/, run.output);
    assert.doesNotMatch(run.output, /which is not a delegated grant/, run.output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the merge checks refuse a modes document declaring the charter's mode twice with the weaker row first, rather than reporting that row's regime", () => {
  /* M6-P3 FIX ROUND 1, CR-M6P3A-01. The regime reader took the FIRST mode row
     whose id matched the charter, so a second `full` row declaring
     merge-authority `owner`, placed ahead of the real one, turned the merge
     check from red into a REPORT ("not a delegated grant") and exit 0.
     Measured by hazard review A at d584639. M6-P3 drove the deleted
     `scripts/check-dual-review.mjs`; merging it into M6-P5 moved this test to
     `verdict-pair-approves`, the regime reader that remains, with ONE VERDICT
     under a delegated grant, so a green here is a wrong merge authorisation. */
  const dir = stageContext("full", [ONE_VERDICT]);
  try {
    const path = join(dir, "assurance-modes.yaml");
    const document = yamlModule.parse(readFileSync(path, "utf8")) as {
      modes: Record<string, unknown>[];
    };
    const real = document.modes.find((mode) => mode["id"] === "full");
    assert.ok(real !== undefined, "the shipped document declares no full mode");
    const weaker = structuredClone(real);
    weaker["merge-authority"] = "owner";
    delete weaker["granted-by"];
    delete weaker["conditions"];
    document.modes.unshift(weaker);
    writeFileSync(path, yamlModule.stringify(document));
    const run = validateInContext(dir, ONE_VERDICT);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /declares mode full 2 times \(entries 0, 1\)/);
    assert.match(run.output, /\(check: verdict-pair-approves\)/, run.output);
    assert.doesNotMatch(run.output, /which is not a delegated grant/);

    /* AGAINST THE REAL CAPTURE (rule (f): the witness members mutate
       src/checks.ts, which spawns). Every INVALID line the command printed over
       the same construction, with the scratch path written <dir> as the
       capture declares, must be printed again now. */
    const capture = readFileSync(
      join(repoRoot, "witness", "captures", "m6-p5-merge-duplicate-mode-id.txt"),
      "utf8",
    );
    const section = capture.split("\ncase: ").find((part) => part.startsWith("merge-checks-verdict\n"));
    const captured = (section ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("INVALID #/verdict"));
    assert.ok(captured.length > 0, "m6-p5-merge-duplicate-mode-id.txt carries no merge-checks-verdict INVALID line");
    const live = run.output
      .split(realpathSync(dir))
      .join("<dir>")
      .split(dir)
      .join("<dir>")
      .split("\n");
    for (const line of captured) {
      assert.ok(live.includes(line), `the live output no longer prints the captured line:\n${line}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M5-P3: missing is red, through the REAL runner and registry          */
/* ------------------------------------------------------------------ */

/**
 * THE ARMS OF M5-P3's CRITERIA, EACH RUN THROUGH `tiphys gates run` WITH THE
 * SHIPPED `gate-registry.yaml`, never through the gate module directly. The
 * hazard this phase exists against is REVIEW-GATE-NEVER-RUNS: a gate that is
 * correct when invoked and is never invoked, because the runner's precondition
 * said no (T-040, T-041). A test that called the gate by hand would be green on
 * exactly that defect, so the variable under test here is what the RUNNER does
 * with the registry's own entry, precondition and declared parameters included.
 *
 * THE FIXTURE IS A GIT REPOSITORY, because the review budget is a property of a
 * DIFF (`base...head`) and a review's head is related to the audited one by
 * ANCESTRY. Its commits are, in order: a base; a change under `src/` (the
 * shipped change a review is owed for, and the commit the verdicts name); and a
 * commit that adds the verdicts and the kernel review record for each (M6-P5),
 * whose whole gap is under `delivery/`. The gate module is a SYMLINK into this
 * checkout, excluded from the fixture's history, so the runner resolves the
 * registry's relative commands in the fixture while the code that runs is the
 * code under test.
 */

const RUNNER_GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function fixtureGit(dir: string, args: string[]): string {
  const run = spawnSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...RUNNER_GIT_IDENTITY },
  });
  assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
  return (run.stdout ?? "").trim();
}

/** One verdict to place, rewritten from a shipped fixture. */
interface BudgetVerdict {
  fixture: string;
  as: string;
  verdict?: string;
}

interface BudgetRepo {
  dir: string;
  base: string;
  /** The commit the placed verdicts name. */
  reviewed: string;
  /** The checkout's HEAD, which the gate audits. */
  head: string;
}

/**
 * Stage the fixture repository.
 *
 * `shipped` false makes the branch's only change a `delivery/` document, which
 * is criterion p3-paperwork-budget's arm.
 */
function stageBudgetRepo(
  verdicts: BudgetVerdict[],
  options: { shipped?: boolean; declared?: boolean } = {},
): BudgetRepo {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-review-budget-"));
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  assert.match(charter, /^delivery-mode: full$/m, "the shipped template no longer declares mode full");
  /* M6-P2: `declared` adds a runtime-set block (DR-0063) naming src/, so a
     delivery-only change is single; without it every change is pair. */
  writeFileSync(
    join(dir, "charter.yaml"),
    options.declared === true ? `${charter}\nruntime-set:\n  paths: [src/]\n` : charter,
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "feature.ts"), "export const feature = 1;\n");
  fixtureGit(dir, ["init", "-q", "."]);
  fixtureGit(dir, ["add", "-A"]);
  fixtureGit(dir, ["commit", "-q", "-m", "base"]);
  const base = fixtureGit(dir, ["rev-parse", "HEAD"]);

  if (options.shipped === false) {
    mkdirSync(join(dir, "delivery", "notes"), { recursive: true });
    writeFileSync(join(dir, "delivery", "notes", "state.md"), "paperwork only\n");
  } else {
    writeFileSync(join(dir, "src", "feature.ts"), "export const feature = 2;\n");
  }
  fixtureGit(dir, ["add", "-A"]);
  fixtureGit(dir, ["commit", "-q", "-m", "the change under review"]);
  const reviewed = fixtureGit(dir, ["rev-parse", "HEAD"]);

  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  for (const entry of verdicts) {
    let body = readFileSync(join(fixturesDir, entry.fixture), "utf8");
    const anchored = body.replace(/^head: .*$/m, `head: ${reviewed}`);
    assert.notEqual(anchored, body, `${entry.fixture} has no single-line head to rewrite`);
    body = anchored;
    if (entry.verdict !== undefined) {
      const rewritten = body.replace(/^verdict: .*$/m, `verdict: ${entry.verdict}`);
      assert.notEqual(rewritten, body, `${entry.fixture} has no single-line verdict to rewrite`);
      body = rewritten;
    }
    writeFileSync(join(dir, "delivery", "review", entry.as), body);
  }
  /* M6-P5: the kernel review record for each verdict, as `tiphys review
     dispatch` writes it, naming the reviewed commit. */
  if (verdicts.length > 0) {
    recordVerdicts(dir, "m3-p9", { defaultHead: reviewed });
  }
  fixtureGit(dir, ["add", "-A"]);
  fixtureGit(dir, ["commit", "-q", "--allow-empty", "-m", "the reviews"]);
  const head = fixtureGit(dir, ["rev-parse", "HEAD"]);

  /* THE GATE CODE, linked rather than copied and excluded from the fixture's
     history, so no fixture commit's diff contains it and the budget is decided
     by the one `src/` file the arm changed. */
  writeFileSync(join(dir, ".git", "info", "exclude"), "/src/gates/\n/gate-registry.yaml\n/evidence/\n");
  mkdirSync(join(dir, "src", "gates"), { recursive: true });
  symlinkSync(
    join(repoRoot, "src", "gates", "merge-preconditions.ts"),
    join(dir, "src", "gates", "merge-preconditions.ts"),
  );
  writeFileSync(join(dir, "gate-registry.yaml"), readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"));
  return { dir, base, reviewed, head };
}

interface RunnerOutcome {
  exit: number;
  output: string;
  record: { status: string; units: number; detail?: string };
}

/** Run ONE registry gate through the real runner, full mode, as CI would. */
function runRegistryGate(repo: BudgetRepo, gate: string): RunnerOutcome {
  const evidence = join(repo.dir, "evidence", gate);
  const run = spawnSync(
    process.execPath,
    [
      cliEntry,
      "gates",
      "run",
      "--registry",
      "gate-registry.yaml",
      "--mode",
      "full",
      "--only",
      gate,
      "--base",
      repo.base,
      "--head",
      repo.head,
      "--phase",
      "m3-p9",
      "--evidence",
      evidence,
    ],
    { cwd: repo.dir, encoding: "utf8" },
  );
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const record = JSON.parse(readFileSync(join(evidence, gate, "result.json"), "utf8")) as RunnerOutcome["record"];
  return { exit: run.status ?? -1, output, record };
}

function withBudgetRepo<T>(
  verdicts: BudgetVerdict[],
  options: { shipped?: boolean; declared?: boolean },
  body: (repo: BudgetRepo) => T,
): T {
  const repo = stageBudgetRepo(verdicts, options);
  try {
    return body(repo);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
}

const APPROVING_PAIR: BudgetVerdict[] = [
  { fixture: "decorrelated-criteria.yaml", as: "m3-p9-criteria.yaml" },
  { fixture: "decorrelated-hazard.yaml", as: "m3-p9-hazard.yaml" },
];

test("merge-preconditions, the review gate the pull-request bundle runs, is red through the real runner for zero and one committed review", () => {
  /* The fixture repository has NO REMOTE, so a gate that consulted the GitHub
     API before deciding the review evidence would stop at "no repository could
     be established" and report error; red with the missing count is the proof
     the evidence was decided first. */
  for (const [verdicts, missing] of [
    [[], 2],
    [[APPROVING_PAIR[0] as BudgetVerdict], 1],
  ] as [BudgetVerdict[], number][]) {
    withBudgetRepo(verdicts, {}, (repo) => {
      const run = runRegistryGate(repo, "merge-preconditions");
      assert.equal(run.record.status, "red", run.output);
      assert.notEqual(run.exit, 0, run.output);
      assert.match(
        run.record.detail ?? "",
        new RegExp(`${String(2 - missing)} of 2 are counted and ${String(missing)} missing`),
      );
      assert.doesNotMatch(run.record.detail ?? "", /no repository could be established/);
    });
  }
});

test("merge-preconditions through the real runner is red for a delivery-only change with no review, naming 0 of 1, and an approving pair reaches the network conditions", () => {
  /* M6-P2 (DR-0063): there is no tier that owes no review. A single change
     owes one, and without it the gate is red before any network request. */
  withBudgetRepo([], { shipped: false, declared: true }, (repo) => {
    const run = runRegistryGate(repo, "merge-preconditions");
    assert.equal(run.record.status, "red", run.output);
    assert.match(run.record.detail ?? "", /^DR-0063 single at head/);
    assert.match(run.record.detail ?? "", /0 of 1 are counted and 1 missing/);
    assert.doesNotMatch(run.record.detail ?? "", /no repository could be established/);
  });
  /* THE CONTROL: the same command over an approving pair is NOT red on the
     review evidence and goes on to condition 4, which needs a repository this
     fixture deliberately does not have. Error, never green and never
     not-applicable, is the correct word for that. */
  withBudgetRepo(APPROVING_PAIR, {}, (repo) => {
    const run = runRegistryGate(repo, "merge-preconditions");
    assert.equal(run.record.status, "error", run.output);
    assert.match(run.record.detail ?? "", /no repository could be established/);
  });
});

const budgetModule = (await import(new URL("../src/gates/merge-preconditions.ts", import.meta.url).href)) as {
  classifyReviewBudget: (
    contextDirectory: string,
    base: string,
    head: string,
  ) =>
    | { ok: true; budget: { tier: string; paths: { path: string; tier: string }[]; pair: string[] } }
    | { ok: false; reason: string };
};

/**
 * THE REVIEW BUDGET CONSUMES git's OUTPUT, so the red-witness rule's stronger
 * form applies: the assertion is made against REAL captured output. The
 * capture at witness/captures/m5-p3-git-review-budget.json was taken from this
 * exact staging; the test re-stages it, re-runs both commands, requires the
 * live output to equal the recorded bytes, and only then asks the shipped
 * classifier about it. A git that printed something else would redden the
 * first half before the classifier was trusted with it.
 */
const GIT_BUDGET_CAPTURE = join(repoRoot, "witness", "captures", "m5-p3-git-review-budget.json");

test("the review budget classifies git's real NUL-separated, rename-split name list for a nested project by DR-0063's runtime set", () => {
  const recorded = JSON.parse(readFileSync(GIT_BUDGET_CAPTURE, "utf8")) as {
    commands: { argv: string[]; cwd: string; stdout: string }[];
  };
  const dir = mkdtempSync(join(tmpdir(), "tiphys-budget-git-"));
  try {
    const kernel = join(dir, "kernel");
    mkdirSync(join(kernel, "src"), { recursive: true });
    /* M6-P2: the nested project DECLARES its runtime set at the base. The
       charter is unchanged by the change, so neither recorded command's output
       depends on it; the live comparison below proves that. */
    writeFileSync(join(kernel, "charter.yaml"), "kind: charter\nruntime-set:\n  paths: [src/]\n");
    writeFileSync(join(kernel, "src", "feature.ts"), "export const feature = 1;\n");
    writeFileSync(join(kernel, "src", "old.ts"), "export const old = 1;\n");
    fixtureGit(dir, ["init", "-q", "."]);
    fixtureGit(dir, ["add", "-A"]);
    fixtureGit(dir, ["commit", "-q", "-m", "base"]);
    const base = fixtureGit(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(kernel, "src", "feature.ts"), "export const feature = 2;\n");
    mkdirSync(join(kernel, "delivery"), { recursive: true });
    writeFileSync(join(kernel, "delivery", "a b.md"), "paperwork with a space in its name\n");
    renameSync(join(kernel, "src", "old.ts"), join(kernel, "delivery", "old.md"));
    mkdirSync(join(kernel, "test"), { recursive: true });
    writeFileSync(join(kernel, "test", "x.test.ts"), "// test\n");
    writeFileSync(join(kernel, "CLAUDE.md"), "rules\n");
    writeFileSync(join(dir, "outside.md"), "outside the project\n");
    fixtureGit(dir, ["add", "-A"]);
    fixtureGit(dir, ["commit", "-q", "-m", "the change"]);
    const head = fixtureGit(dir, ["rev-parse", "HEAD"]);

    for (const command of recorded.commands) {
      const argv = command.argv.slice(1).map((arg) => (arg === "<base>...<head>" ? `${base}...${head}` : arg));
      const live = spawnSync("git", argv, { cwd: join(dir, command.cwd), encoding: "utf8" });
      assert.equal(live.status, 0, live.stderr);
      assert.equal(live.stdout, command.stdout, `git ${argv.join(" ")} no longer prints what was captured`);
    }

    const classified = budgetModule.classifyReviewBudget(kernel, base, head);
    assert.ok(classified.ok, classified.ok ? "" : classified.reason);
    const tiers = new Map(classified.budget.paths.map((entry) => [entry.path, entry.tier]));
    assert.deepEqual(
      Object.fromEntries(tiers),
      {
        "kernel/CLAUDE.md": "single",
        "kernel/delivery/a b.md": "single",
        "kernel/delivery/old.md": "single",
        /* THE SOURCE HALF OF A MOVE INTO delivery/ IS SEEN, which is what
           `--no-renames` is for: without it only the destination prints and a
           shipped file moved into paperwork reads as paperwork. */
        "kernel/src/old.ts": "pair",
        "kernel/src/feature.ts": "pair",
        "kernel/test/x.test.ts": "single",
        /* OUTSIDE THE PROJECT, fail closed. */
        "outside.md": "pair",
      },
    );
    assert.equal(classified.budget.tier, "pair");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* The pair rule reads the COMMITTED corpus and regime                  */
/*                                                                     */
/* Moved here by M6-P5 from test/single-family-exception.test.ts, whose */
/* subject, the declared single-family exception inside the deleted     */
/* decorrelation check, went with it. These arms guard the corpus and   */
/* regime readers `verdict-pair-approves` still shares, so they now run */
/* through `tiphys validate --type verdict --context` over ONE          */
/* committed verdict under a delegated grant: the pair rule reddens     */
/* exactly when the committed regime is read as delegated and the       */
/* committed corpus holds fewer than two.                               */
/* ------------------------------------------------------------------ */

const committedScratch: string[] = [];

test.after(() => {
  for (const dir of committedScratch) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface CommittedStage {
  /** Fixtures committed under `delivery/review/`, each naming the reviewed commit. */
  verdicts: string[];
  /** Fixtures written under `delivery/review/` AFTER the commit, in no commit. */
  uncommittedVerdicts?: string[];
  /** The repository is the parent and the context is `proj/` inside it. */
  nest?: boolean;
  /** Regime documents on disk and held out of every commit. */
  holdOut?: string[];
  /** Rewrite the working-tree charter's delivery-mode after the commit. */
  modeAfterCommit?: string;
  /** Rewrite the working-tree delegated merge-authority after the commit. */
  authorityAfterCommit?: string;
  /** Append a DR-0038 review-families declaration of these families to the charter. */
  declare?: string[];
}

/**
 * A committed context: the shipped modes document, a charter from the shipped
 * template (mode `full`, a delegated grant), an empty commit the verdicts name
 * as their head, and the verdicts committed on top of it, which is the shape of
 * a real review.
 */
function stageCommitted(options: CommittedStage): string {
  const repo = mkdtempSync(join(tmpdir(), "tiphys-committed-corpus-"));
  committedScratch.push(repo);
  const dir = options.nest === true ? join(repo, "proj") : repo;
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  assert.match(charter, /^delivery-mode: full$/m, "the shipped template no longer declares mode full");
  writeFileSync(
    join(dir, "charter.yaml"),
    options.declare === undefined ? charter : `${charter}${declarationBlock(options.declare, "one vendor is served here")}`,
  );
  fixtureGit(repo, ["init", "-q", "."]);
  fixtureGit(repo, ["commit", "-q", "--allow-empty", "-m", "reviewed"]);
  const reviewed = fixtureGit(repo, ["rev-parse", "HEAD"]);
  const place = (fixture: string): void => {
    const body = readFileSync(join(fixturesDir, fixture), "utf8");
    const anchored = body.replace(/^head: .*$/m, `head: ${reviewed}`);
    assert.notEqual(anchored, body, `${fixture} has no single-line head to rewrite`);
    writeFileSync(join(dir, "delivery", "review", fixture), anchored);
  };
  options.verdicts.forEach(place);
  const hold = mkdtempSync(join(tmpdir(), "tiphys-committed-hold-"));
  committedScratch.push(hold);
  for (const document of options.holdOut ?? []) {
    renameSync(join(dir, document), join(hold, document));
  }
  fixtureGit(repo, ["add", "-A"]);
  fixtureGit(repo, ["commit", "-q", "-m", "stage"]);
  for (const document of options.holdOut ?? []) {
    renameSync(join(hold, document), join(dir, document));
  }
  (options.uncommittedVerdicts ?? []).forEach(place);
  if (options.modeAfterCommit !== undefined) {
    const onDisk = readFileSync(join(dir, "charter.yaml"), "utf8");
    const rewritten = onDisk.replace(/^delivery-mode: .*$/m, `delivery-mode: ${options.modeAfterCommit}`);
    assert.notEqual(rewritten, onDisk, "the charter has no single-line delivery-mode to rewrite");
    writeFileSync(join(dir, "charter.yaml"), rewritten);
  }
  if (options.authorityAfterCommit !== undefined) {
    const onDisk = readFileSync(join(dir, "assurance-modes.yaml"), "utf8");
    const rewritten = onDisk.replace(
      /^(\s*)merge-authority: delegated-under-conditions$/m,
      `$1merge-authority: ${options.authorityAfterCommit}`,
    );
    assert.notEqual(rewritten, onDisk, "no delegated merge-authority line to rewrite");
    writeFileSync(join(dir, "assurance-modes.yaml"), rewritten);
  }
  return dir;
}

const PAIR_REFUSAL = "DR-0012 condition 2 is a property of the PAIR";

/** A DR-0038 declaration block, each family a YAML double-quoted scalar. */
function declarationBlock(families: string[], reason: string): string {
  const quoted = (value: string): string => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return ["review-families:", "  available:", ...families.map((family) => `    - ${quoted(family)}`), `  reason: ${quoted(reason)}`, ""].join("\n");
}

test("an UNCOMMITTED second review does not satisfy the pair a delegated grant requires", () => {
  const dir = stageCommitted({ verdicts: [ONE_VERDICT], uncommittedVerdicts: ["decorrelated-hazard.yaml"] });
  /* The two documents approve the same head, which is what makes this the
     dangerous state: read off disk, this pair satisfies the rule on one
     committed review. */
  const tracked = spawnSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], { cwd: dir, encoding: "utf8" });
  assert.doesNotMatch(tracked.stdout, /decorrelated-hazard\.yaml/);
  const run = validateInContext(dir, ONE_VERDICT);
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes(PAIR_REFUSAL), `the pair check did not refuse a corpus of one:\n${run.output}`);
});

test("a corpus-scoped refusal names the source that corpus was read from, on both arms", () => {
  /* SC-011 APPLIED TO THE CORPUS: a sentence about a set read off disk must
     not name a commit, and one read from a commit must name it. */
  const committed = stageCommitted({ verdicts: [ONE_VERDICT] });
  const fromCommit = validateInContext(committed, ONE_VERDICT);
  assert.match(fromCommit.output, /\(corpus: [^)]*read from commit [0-9a-f]{40}, resolved from HEAD\)/, fromCommit.output);
  assert.doesNotMatch(fromCommit.output, /read from the WORKING TREE/);

  /* The worktree arm, staged by removing the git directory entirely rather
     than by mocking anything: the only state in which the loader falls back.
     RENAMED OUT, NOT rmSync-ED IN PLACE: see test/support/remove-git-directory.ts.
     A partial .git left by a recursive remove is a repository again. */
  const noGit = stageCommitted({ verdicts: [ONE_VERDICT] });
  const aside = mkdtempSync(join(tmpdir(), "tiphys-committed-git-aside-"));
  committedScratch.push(aside);
  removeGitDirectory(noGit, aside);
  const fromTree = validateInContext(noGit, ONE_VERDICT);
  assert.match(fromTree.output, /\(corpus: delivery\/review read from the WORKING TREE because/, fromTree.output);
  assert.doesNotMatch(fromTree.output, /read from commit/);
});

test("an UNCOMMITTED delivery-mode does not switch off the pair requirement", () => {
  /* THE CONTROL ARM: with nothing edited the single committed verdict is
     refused, so a refusal below is not a fixture that was refused whatever the
     regime said. */
  const control = validateInContext(stageCommitted({ verdicts: [ONE_VERDICT] }), ONE_VERDICT);
  assert.equal(control.status, 1, control.output);
  /* `direct-pr` is a real mode of the shipped assurance-modes.yaml whose
     merge-authority is `owner`, not a delegated grant. */
  const edited = stageCommitted({ verdicts: [ONE_VERDICT], modeAfterCommit: "direct-pr" });
  assert.match(readFileSync(join(edited, "charter.yaml"), "utf8"), /^delivery-mode: direct-pr$/m);
  const run = validateInContext(edited, ONE_VERDICT);
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes(PAIR_REFUSAL), run.output);
  assert.doesNotMatch(run.output, /which is not a delegated grant/);
});

test("an UNCOMMITTED merge-authority does not switch off the pair requirement", () => {
  /* THE SECOND MEMBER, through the OTHER document the regime reads: the
     charter is left alone and what its mode's authority IS is rewritten. */
  const edited = stageCommitted({ verdicts: [ONE_VERDICT], authorityAfterCommit: "owner" });
  assert.match(readFileSync(join(edited, "assurance-modes.yaml"), "utf8"), /^\s*merge-authority: owner$/m);
  const run = validateInContext(edited, ONE_VERDICT);
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes(PAIR_REFUSAL), run.output);
  assert.doesNotMatch(run.output, /which is not a delegated grant/);
});

test("a charter.yaml that exists only in the working tree is still missing to the merge gate's regime reader", () => {
  /* THE ADDITION DIRECTION OF REGIME PRESENCE (DV-001): an actor who can write
     a file and has committed nothing must not supply the regime the merge gate
     refuses to run without. `missingRegimeDocument` is that reader. */
  const dir = stageCommitted({ verdicts: [ONE_VERDICT], holdOut: ["charter.yaml"] });
  assert.match(readFileSync(join(dir, "charter.yaml"), "utf8"), /^delivery-mode: full$/m);
  const tracked = spawnSync("git", ["ls-files"], { cwd: dir, encoding: "utf8" });
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.doesNotMatch(tracked.stdout, /(^|\/)charter\.yaml$/m, tracked.stdout);
  const missing = checksModule.missingRegimeDocument(dir);
  assert.ok(missing !== undefined, "an uncommitted charter was read as present");
  assert.equal(missing.document, "charter.yaml");
  /* THE ABSENCE CLAIM NAMES THE TREE IT IS AN ABSENCE FROM. */
  assert.match(missing.reason, /charter\.yaml does not exist in commit [0-9a-f]{40}/, missing.reason);
});

test("a committed approving pair is counted when the context directory is NOT the repository root", () => {
  /* THE ROOT AXIS (DV-002). `git ls-tree` applies the current directory as an
     implicit pathspec, so from a nested context the corpus listing came back
     EMPTY with exit 0, and an empty listing is indistinguishable from an absent
     directory. The pair rule then saw fewer than two committed reviews of a
     head two committed reviews approve. */
  const nested = stageCommitted({ nest: true, verdicts: [ONE_VERDICT, "decorrelated-hazard.yaml"] });
  assert.ok(nested.endsWith(`${sep}proj`), nested);
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: nested, encoding: "utf8" });
  assert.equal(top.status, 0, top.stderr);
  assert.notEqual(top.stdout.trim(), nested, "the context is its own repository root after all");
  const run = validateInContext(nested, ONE_VERDICT);
  assert.equal(run.status, 0, run.output);
  assert.match(run.output, /REPORT verdict-pair-approves 2 verdict\(s\) for phase M3-P9 at head [0-9a-f]{40} read APPROVE/, run.output);
  /* THE CONTROL ARM: the same pair in a context that IS its repository root. */
  const root = validateInContext(stageCommitted({ verdicts: [ONE_VERDICT, "decorrelated-hazard.yaml"] }), ONE_VERDICT);
  assert.equal(root.status, 0, root.output);
});

test("a committed corpus that could not be READ is refused, never reported as an empty corpus", () => {
  /* `git cat-file -t <sha>:./<dir>` fails identically for a path that is not
     in the tree and for a commit the object database cannot produce, and the
     listing helper once returned an EMPTY corpus for both. Staged by naming a
     commit that is not in this repository. */
  const dir = stageCommitted({ verdicts: [ONE_VERDICT, "decorrelated-hazard.yaml"] });
  const real = checksModule.loadCommittedVerdicts(dir);
  assert.equal(real.ok, true, JSON.stringify(real));
  assert.equal(real.ok === true ? real.verdicts.length : -1, 2, JSON.stringify(real));
  const absent = "0123456789abcdef0123456789abcdef01234567";
  const unreadable = checksModule.loadCommittedVerdicts(dir, {
    kind: "commit",
    ref: "HEAD",
    refSha: absent,
    scope: join("delivery", "review"),
  });
  assert.equal(unreadable.ok, false, JSON.stringify(unreadable));
  const reason = unreadable.ok === false ? unreadable.reason : "";
  assert.match(reason, new RegExp(`${absent} could not be read`), reason);
});

/* ------------------------------------------------------------------ */
/* DR-0038's declaration is read from the COMMIT                        */
/*                                                                     */
/* Moved here by M6-P5 from test/single-family-exception.test.ts. The   */
/* merge gate reads the declaration through `readReviewFamilies`, so    */
/* these call it directly rather than through the deleted script.       */
/* ------------------------------------------------------------------ */

test("editing the declaration in the working tree after the commit changes nothing, and the recorded blob sha256 is the committed blob's", () => {
  const dir = stageCommitted({ verdicts: [ONE_VERDICT], declare: ["family-a"] });
  const committedSha = spawnSync("git", ["rev-parse", "HEAD:charter.yaml"], { cwd: dir, encoding: "utf8" });
  assert.equal(committedSha.status, 0, committedSha.stderr);
  const committedBlob = spawnSync("git", ["cat-file", "blob", committedSha.stdout.trim()], { cwd: dir });
  assert.equal(committedBlob.status, 0, String(committedBlob.stderr));
  const reading = checksModule.readReviewFamilies(dir);
  assert.equal(reading.kind, "declared", JSON.stringify(reading));
  const declared = reading as Extract<typeof reading, { kind: "declared" }>;
  assert.equal(
    declared.provenance.sha256,
    createHash("sha256").update(committedBlob.stdout).digest("hex"),
    "the recorded sha256 is not the committed blob's",
  );
  /* NOW CHANGE THE DECLARATION IN THE WORKING TREE ONLY. Read from the tree,
     the family set would change; it must not. */
  const onDisk = readFileSync(join(dir, "charter.yaml"), "utf8");
  const widened = onDisk.replace(
    /^review-families:[\s\S]*$/m,
    declarationBlock(["a-family-nothing-carries"], "edited in the working tree after the commit"),
  );
  assert.notEqual(widened, onDisk, "the working-tree declaration was not rewritten");
  writeFileSync(join(dir, "charter.yaml"), widened);
  const reread = checksModule.readReviewFamilies(dir);
  assert.equal(reread.kind, "declared", JSON.stringify(reread));
  const after = reread as Extract<typeof reread, { kind: "declared" }>;
  assert.deepEqual(after.families, declared.families, "the working-tree edit changed what was read");
  assert.equal(after.provenance.sha256, declared.provenance.sha256);
});

test("a declaration that exists only in the working tree is error, never permission and never a quiet absence", () => {
  const dir = stageCommitted({ verdicts: [ONE_VERDICT], declare: ["family-a"], holdOut: ["charter.yaml"] });
  const tracked = spawnSync("git", ["ls-files"], { cwd: dir, encoding: "utf8" });
  assert.doesNotMatch(tracked.stdout, /(^|\/)charter\.yaml$/m, tracked.stdout);
  const reading = checksModule.readReviewFamilies(dir);
  assert.equal(reading.kind, "error", JSON.stringify(reading));
  assert.ok(
    (reading as { reason: string }).reason.includes("never permission"),
    `the refusal does not say why: ${JSON.stringify(reading)}`,
  );
});

test("a declaration listing one family twice once canonicalised is error rather than a single-family declaration", () => {
  const dir = stageCommitted({ verdicts: [ONE_VERDICT], declare: ["Family-A", "family-a"] });
  const reading = checksModule.readReviewFamilies(dir);
  assert.equal(reading.kind, "error", JSON.stringify(reading));
  assert.ok(
    (reading as { reason: string }).reason.includes("more than once once canonicalised"),
    (reading as { reason: string }).reason,
  );
});
