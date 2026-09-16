/**
 * THE DECLARED SINGLE-FAMILY REVIEW EXCEPTION (kernel plan M4, M4-P11;
 * DR-0038, DR-0012 condition 1, M4-D-28).
 *
 * DR-0012 requires two clean-room reviews produced on different model
 * FAMILIES. In an environment with one family that is unsatisfiable honestly,
 * and the shipped check made it worse: it compares canonicalised STRINGS, so
 * two models of one family compare as DISTINCT and the pair reports
 * decorrelated. That false green has been reproduced three times, most
 * recently by this project's own review dispatch
 * (delivery/verification/my-own-dual-review-does-not-satisfy-dr-0012.md:22).
 *
 * The owner's decision: the project DECLARES that one family is available, and
 * the check reports a status that is neither green nor red and says plainly
 * that the reviews were two and the families were one.
 *
 * WHAT THE TESTS BELOW ARE ACTUALLY GUARDING, because "the exception exists"
 * is not it. The M4 probe measured that adding a FIFTH status word costs one
 * type error and eleven lines, and that a bundle carrying a gate reporting it
 * printed `every applicable gate is green` and exited 0, because the
 * aggregation is `if` chains and not an exhaustive switch
 * (delivery/verification/m4-prototype-probes.md:104). The dangerous state is
 * therefore AN EXCEPTION THE BUNDLE COUNTS AS GREEN, and criterion 8 is the
 * test that reddens against it.
 *
 * THE SUBJECTS ARE REAL WHERE A REAL ONE EXISTS, AND DECLARED CONSTRUCTED
 * WHERE ONE DOES NOT. Criteria 2 and 3 run against this repository's own two
 * committed review verdicts, read from
 * `delivery/evidence/m3-exit-test/e1/e1-7/` at test time rather than
 * transcribed, so the strings compared are the ones a reviewer really wrote.
 * Criterion 5, the PERMISSIVE arm, has no real subject: DR-0037 leaves the
 * kernel as M4's only subject and the kernel's own corpus carries two
 * families, so a true single-family environment does not exist to run against.
 * That arm is FIXTURE-ONLY and is labelled as such here and in the work
 * history rather than described as exercised.
 *
 * `src` and `scripts` are imported through the computed-URL dynamic import
 * pattern (CLAUDE.md standing warning 4).
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
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
const scriptPath = join(repoRoot, "scripts", "check-dual-review.mjs");
const fixturesDir = join(repoRoot, "witness", "fixtures", "dual-review");

/**
 * THIS REPOSITORY'S OWN TWO COMMITTED REVIEW VERDICTS, and the plan's criteria
 * 2 and 3 say to use the real ones rather than fixtures.
 *
 * WHERE THE PLAN IS WRONG AND THE MEASUREMENT WINS, stated here because the
 * spec names a different pair. Section 4.2.6 criterion 2 says "the two real
 * verdicts from M4-P10's own reviews". Those do not exist:
 * `git log --all --name-only -- 'delivery/review/*.yaml'` shows the only
 * verdict documents ever committed under `delivery/review/` were the M3 exit
 * test's, moved out again by `20c4c30`, and M4-P10's branch adds none. The
 * pair below IS real, IS this project's own, and is the exact pair the probe
 * reproduced the false green with
 * (delivery/verification/m4-prototype-probes.md:132).
 */
const realVerdictDir = join(repoRoot, "delivery", "evidence", "m3-exit-test", "e1", "e1-7");
const REAL_VERDICTS = ["verdict-criteria.yaml", "verdict-hazard.yaml"];

/**
 * The canonical form of the hazard reviewer's `produced-by`, DERIVED from the
 * file at run time and never transcribed. A hand-written copy would stop
 * following the document the moment anyone edited it, and this value is the
 * one the falsifiers compare.
 */
function realProducedBy(file: string): string {
  const body = readFileSync(join(realVerdictDir, file), "utf8");
  /* PARSED, NOT REGEXED. One of the two real verdicts writes `produced-by` as
     a folded block scalar (`>-`), so a line-based read returns the block
     indicator instead of the value, which is how the first version of this
     test passed its assertion against the string ">-". */
  const parsed = yamlModule.parse(body) as Record<string, unknown>;
  const value = parsed["produced-by"];
  assert.equal(typeof value, "string", `${file} carries no string produced-by`);
  return value as string;
}

/** The comparison the check makes: NFKC, printable ASCII, collapse, lowercase. */
function canonicalish(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
};

const checksModule = (await import(new URL("../src/checks.ts", import.meta.url).href)) as {
  readReviewFamilies: (
    contextDirectory: string,
    ref?: string,
  ) =>
    | { kind: "absent" }
    | { kind: "error"; reason: string }
    | {
        kind: "declared";
        families: string[];
        declaredAs: string[];
        reason: string;
        provenance: { path: string; ref: string; refSha: string; sha256: string };
      };
  registeredChecks: () => readonly { id: string }[];
  deregisterCheck: (id: string) => boolean;
  registerCheck: (check: unknown) => void;
  dualReviewDecorrelation: { id: string };
  verdictPairApproves: { id: string };
  REVIEW_FAMILIES_FIELD: string;
  CHARTER_DOCUMENT: string;
};

const runModule = (await import(new URL("../src/gates/run.ts", import.meta.url).href)) as {
  DECLARED_PRECONDITION_EVIDENCE: string;
  isDeclaredNotApplicable: (result: {
    status: string;
    precondition?: { evidence?: string[] };
  }) => boolean;
  decideAggregate: (
    counts: Record<string, number>,
    requiredNotApplicable: string[],
    rows: { id: string; status: string; declaredNotApplicable?: boolean }[],
  ) => { exitCode: number; reason: string };
};

const scriptModule = (await import(
  new URL("../scripts/check-dual-review.mjs", import.meta.url).href
)) as {
  evaluate: (directory: string) => {
    status: string;
    units: number;
    lines: string[];
    checksRun: number;
    singleFamily?: unknown;
  };
  SINGLE_FAMILY_PRECONDITION: string;
  DECLARED_EVIDENCE: string;
  CHECK_ID: string;
};

/* ------------------------------------------------------------------ */
/* Staging                                                             */
/* ------------------------------------------------------------------ */

const scratchDirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-single-family-"));
  scratchDirs.push(dir);
  return dir;
}

/**
 * A git identity supplied PER COMMAND and never written to user or global
 * config (CLAUDE.md standing warning 5; CI runners have no git identity).
 */
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function git(dir: string, args: string[]): void {
  const run = spawnSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
}

/** A YAML double-quoted scalar, so a family name carrying punctuation survives. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function declarationBlock(families: string[], reason: string): string {
  return [
    "review-families:",
    "  available:",
    ...families.map((family) => `    - ${yamlString(family)}`),
    `  reason: ${yamlString(reason)}`,
    "",
  ].join("\n");
}

interface StagedVerdict {
  /** A file under `witness/fixtures/dual-review/`, or a REAL_VERDICTS name. */
  file: string;
  /** Rewrite `produced-by` after copying. Staging, never a fixture edit. */
  producedBy?: string;
  /** Rewrite `phase` after copying, so a document joins no pair under review. */
  phase?: string;
  /** Write it here instead of `delivery/review/`, as a repository-relative dir. */
  directory?: string;
  /** Write it under a different name than the fixture it was copied from. */
  as?: string;
}

interface StageOptions {
  /** Omit for the OMISSION arm: no declaration at all. */
  declare?: string[];
  reason?: string;
  verdicts: StagedVerdict[];
  /** Read the verdicts from the real corpus instead of the fixture set. */
  real?: boolean;
  /** Default true. False leaves the declaration uncommitted. */
  commit?: boolean;
  /**
   * Written AFTER the commit, so they exist in the working tree and in no
   * commit. This is the dangerous state CR-M4P11-001 is about, staged from the
   * ADDITION side: an actor who can write a file but has committed nothing.
   */
  uncommittedVerdicts?: StagedVerdict[];
  /**
   * Deleted from the working tree AFTER the commit, by repository-relative
   * path. The same dangerous state from the DELETION side.
   */
  deleteAfterCommit?: string[];
}

/**
 * A context directory the check can be pointed at: the repository's own
 * `assurance-modes.yaml`, a charter derived from the shipped template, the
 * named verdicts under `delivery/review/`, and a git history, because the
 * declaration is read from the object database and never from the tree.
 */
function stage(options: StageOptions): string {
  const dir = scratch();
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  let charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  assert.match(charter, /^delivery-mode: full$/m, "the shipped template no longer declares mode full");
  if (options.declare !== undefined) {
    charter += `${declarationBlock(
      options.declare,
      options.reason ?? "Only one model family can be dispatched in this environment.",
    )}`;
  }
  writeFileSync(join(dir, "charter.yaml"), charter);
  const place = (verdict: StagedVerdict): void => {
    const from = join(options.real === true ? realVerdictDir : fixturesDir, verdict.file);
    const directory = join(dir, verdict.directory ?? join("delivery", "review"));
    mkdirSync(directory, { recursive: true });
    const to = join(directory, verdict.as ?? verdict.file);
    let body = readFileSync(from, "utf8");
    if (verdict.producedBy !== undefined) {
      const rewritten = body.replace(/^produced-by: .*$/m, `produced-by: ${verdict.producedBy}`);
      assert.notEqual(rewritten, body, `${verdict.file} has no single-line produced-by to rewrite`);
      body = rewritten;
    }
    if (verdict.phase !== undefined) {
      const rewritten = body.replace(/^phase: .*$/m, `phase: ${verdict.phase}`);
      assert.notEqual(rewritten, body, `${verdict.file} has no single-line phase to rewrite`);
      body = rewritten;
    }
    writeFileSync(to, body);
  };
  for (const verdict of options.verdicts) {
    place(verdict);
  }
  git(dir, ["init", "-q", "."]);
  if (options.commit !== false) {
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "stage"]);
  } else {
    /* A commit must exist for HEAD to resolve; the CHARTER is what is left
       uncommitted, which is the state criterion 9 is about. */
    git(dir, ["commit", "-q", "--allow-empty", "-m", "empty"]);
  }
  /* EVERYTHING BELOW THIS LINE HAPPENS AFTER THE COMMIT, which is the whole
     point of it: these are working-tree states that no commit records. */
  for (const verdict of options.uncommittedVerdicts ?? []) {
    place(verdict);
  }
  for (const relative of options.deleteAfterCommit ?? []) {
    rmSync(join(dir, relative));
  }
  return dir;
}

interface ScriptRun {
  exit: number;
  stdout: string;
  record: {
    gate: string;
    status: string;
    units: number;
    detail: string;
    precondition?: { id: string; met: boolean; reason: string; evidence?: string[] };
  };
}

/** Run the SHIPPED script over a staged context and read the record it wrote. */
function runScript(dir: string): ScriptRun {
  const recordPath = join(dir, "result.json");
  const run = spawnSync(
    process.execPath,
    [scriptPath, dir, "--result", recordPath, "--evidence", join(dir, "evidence")],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const stdout = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  return {
    exit: run.status ?? -1,
    stdout,
    record: JSON.parse(readFileSync(recordPath, "utf8")) as ScriptRun["record"],
  };
}

/* ------------------------------------------------------------------ */
/* THE ARMS, declared once so criterion 6 can assert over the SET      */
/* ------------------------------------------------------------------ */

/**
 * Every arm the exception has. Criterion 6 asserts that NONE of them reports
 * green, over this array rather than over a list written into that test, so an
 * arm added here without its own status assertion is still covered. Each
 * criterion below selects its arm BY NAME, never by index.
 */
const ARMS: { name: string; subject: "real" | "fixture"; stage: () => string }[] = [
  {
    name: "falsifier-1-contradiction-by-the-real-corpus",
    subject: "real",
    stage: () =>
      stage({
        real: true,
        declare: [realProducedBy("verdict-hazard.yaml")],
        verdicts: REAL_VERDICTS.map((file) => ({ file })),
      }),
  },
  {
    name: "falsifier-2-the-declared-name-is-in-neither-real-verdict",
    subject: "real",
    stage: () =>
      stage({
        real: true,
        declare: ["A Family Nothing Here Was Produced By"],
        verdicts: REAL_VERDICTS.map((file) => ({ file })),
      }),
  },
  {
    name: "omission-no-declaration-and-one-family",
    subject: "fixture",
    stage: () =>
      stage({
        verdicts: [
          { file: "decorrelated-criteria.yaml" },
          { file: "shared-family-hazard.yaml" },
        ],
      }),
  },
  {
    name: "permissive-arm-fixture-declared",
    subject: "fixture",
    stage: () =>
      stage({
        declare: ["family-a"],
        verdicts: [
          { file: "decorrelated-criteria.yaml" },
          { file: "shared-family-hazard.yaml" },
        ],
      }),
  },
  {
    name: "narrowed-to-one-dimension-shared-framing",
    subject: "fixture",
    stage: () =>
      stage({
        declare: ["family-a"],
        verdicts: [
          { file: "decorrelated-criteria.yaml" },
          { file: "shared-framing-hazard.yaml", producedBy: "family-a" },
        ],
      }),
  },
  {
    name: "narrowed-to-one-dimension-shared-review-contract",
    subject: "fixture",
    stage: () =>
      stage({
        declare: ["family-a"],
        verdicts: [
          { file: "decorrelated-criteria.yaml" },
          { file: "shared-contract-criteria.yaml", producedBy: "family-a" },
        ],
      }),
  },
];

function arm(name: string): { name: string; stage: () => string } {
  const found = ARMS.find((candidate) => candidate.name === name);
  assert.notEqual(found, undefined, `no arm named ${name}`);
  return found as { name: string; stage: () => string };
}

test.after(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 2: falsifier 1, contradiction by the REAL corpus          */
/* ------------------------------------------------------------------ */

test("a one-family declaration against this repository's own two real verdicts is red and names both observed families", () => {
  const dir = arm("falsifier-1-contradiction-by-the-real-corpus").stage();
  const run = runScript(dir);
  assert.equal(run.record.status, "red");
  assert.equal(run.exit, 1);
  const contradiction = run.stdout
    .split("\n")
    .filter((line) => line.includes("is contradicted by this project's own record"));
  assert.ok(contradiction.length > 0, `no contradiction line in:\n${run.stdout}`);
  /* BOTH observed families are named, and both are read out of the real files
     rather than written here, so the assertion follows the documents. */
  for (const file of REAL_VERDICTS) {
    const observed = canonicalish(realProducedBy(file));
    assert.ok(observed.length > 20, `${file}'s produced-by read as ${observed}, which is not a family name`);
    assert.ok(
      contradiction.some((line) => canonicalish(line).includes(observed)),
      `the contradiction line does not name ${file}'s produced-by:\n${contradiction.join("\n")}`,
    );
  }
  assert.ok(
    contradiction.some((line) => line.includes("2 distinct produced-by value(s)")),
    "the contradiction line does not count the distinct families",
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 3: falsifier 2, the declared name must match              */
/* ------------------------------------------------------------------ */

test("a one-family declaration naming a family no real verdict carries is red and names the declared family and the observed one", () => {
  const dir = arm("falsifier-2-the-declared-name-is-in-neither-real-verdict").stage();
  const run = runScript(dir);
  assert.equal(run.record.status, "red");
  assert.equal(run.exit, 1);
  const mismatch = run.stdout
    .split("\n")
    .filter((line) => line.includes("which is not the declared family"));
  assert.ok(mismatch.length > 0, `no name-mismatch line in:\n${run.stdout}`);
  assert.ok(
    mismatch.some((line) => line.includes("A Family Nothing Here Was Produced By")),
    "the mismatch line does not name the DECLARED family in the operator's own spelling",
  );
  assert.ok(
    mismatch.some((line) => canonicalish(line).includes(canonicalish(realProducedBy("verdict-hazard.yaml")))),
    "the mismatch line does not name the OBSERVED family",
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 4: an absent declaration is not permission                */
/* ------------------------------------------------------------------ */

test("with no declaration at all, two same-family verdicts stay red exactly as they were before the exception existed", () => {
  const dir = arm("omission-no-declaration-and-one-family").stage();
  const run = runScript(dir);
  /* THE STATUS WORD IS THE ASSERTION, which is the direction the plan asks
     for: a mutant that treats an ABSENT declaration as a declaration reports
     `not-applicable` here, and this reddens against exactly that. */
  assert.equal(run.record.status, "red");
  assert.equal(run.exit, 1);
  assert.equal(run.record.precondition, undefined);
  assert.ok(
    run.stdout.includes("are not decorrelated on produced-by"),
    `the produced-by comparison did not run:\n${run.stdout}`,
  );
  /* And the reading itself says ABSENT rather than declared, so the test does
     not rest on the message alone. */
  assert.equal(checksModule.readReviewFamilies(dir).kind, "absent");
});

/* ------------------------------------------------------------------ */
/* Criterion 5: the permissive arm. FIXTURE-ONLY, declared as such     */
/* ------------------------------------------------------------------ */

test("the permissive arm reports not-applicable through its OWN precondition id, asserted on the record's fields", () => {
  const dir = arm("permissive-arm-fixture-declared").stage();
  const run = runScript(dir);
  assert.equal(run.record.status, "not-applicable");
  assert.equal(run.exit, 20);
  assert.equal(run.record.units, 2, "the record must say two reviews were read");
  const precondition = run.record.precondition;
  assert.notEqual(precondition, undefined, "the not-applicable carries no precondition record");
  const found = precondition as NonNullable<ScriptRun["record"]["precondition"]>;
  /* THE ID IS THE NEW ONE, NOT THE EXISTING ONE. Routing the exception through
     `dual-review-verdicts-present` would have asserted there was nothing to
     compare, which is false: two verdicts were read. */
  assert.equal(found.id, scriptModule.SINGLE_FAMILY_PRECONDITION);
  assert.notEqual(found.id, "dual-review-verdicts-present");
  assert.equal(found.met, false);
  assert.ok(
    found.reason.includes(checksModule.REVIEW_FAMILIES_FIELD),
    `the precondition reason does not name the declaration: ${found.reason}`,
  );
  assert.ok(
    (found.evidence ?? []).includes(scriptModule.DECLARED_EVIDENCE),
    "the precondition evidence does not carry the declaration marker",
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 6: never green, asserted over the SET of arms             */
/* ------------------------------------------------------------------ */

test("no arm of the declared single-family exception reports green, over the whole declared set of arms", () => {
  assert.ok(ARMS.length >= 5, "the arm set shrank below what the plan enumerates");
  const seen: string[] = [];
  for (const candidate of ARMS) {
    const run = runScript(candidate.stage());
    seen.push(`${candidate.name}=${run.record.status}`);
    assert.notEqual(
      run.record.status,
      "green",
      `arm ${candidate.name} reported green: ${run.record.detail}`,
    );
    assert.notEqual(run.exit, 0, `arm ${candidate.name} exited 0`);
  }
  assert.equal(seen.length, ARMS.length, seen.join(", "));
});

/* ------------------------------------------------------------------ */
/* Criterion 7: the exception narrows ONE dimension, two members       */
/* ------------------------------------------------------------------ */

test("a one-family declaration does not excuse a shared framing", () => {
  const run = runScript(arm("narrowed-to-one-dimension-shared-framing").stage());
  assert.equal(run.record.status, "red");
  assert.ok(
    run.stdout.includes("are not decorrelated on framing"),
    `framing was not refused:\n${run.stdout}`,
  );
});

test("a one-family declaration does not excuse a shared review-contract", () => {
  const run = runScript(arm("narrowed-to-one-dimension-shared-review-contract").stage());
  assert.equal(run.record.status, "red");
  assert.ok(
    run.stdout.includes("are not decorrelated on review-contract"),
    `review-contract was not refused:\n${run.stdout}`,
  );
});

test("the exception is reported as narrowing produced-by only, and the report names the dimensions actually compared", () => {
  const run = runScript(arm("permissive-arm-fixture-declared").stage());
  const report = run.stdout
    .split("\n")
    .find((line) => line.startsWith("REPORT dual-review-decorrelation"));
  assert.notEqual(report, undefined, `no decorrelation report in:\n${run.stdout}`);
  const line = report as string;
  assert.ok(line.includes("distinct on framing, review-contract"), line);
  /* THE SENTENCE DR-0038 EXISTS TO STOP BEING WRITTEN. "distinct on
     produced-by" about a pair that was never required to differ on it is the
     false value the whole decision refuses. */
  assert.ok(!line.includes("produced-by"), `the report still claims produced-by distinctness: ${line}`);
});

/* ------------------------------------------------------------------ */
/* Criterion 8: the bundle cannot hide it                              */
/* ------------------------------------------------------------------ */

interface Summary {
  reason: string;
  exitCode: number;
  requiredNotApplicable: string[];
  declaredNotApplicable: string[];
  counts: Record<string, number>;
  gates: { id: string; status: string; declaredNotApplicable?: boolean }[];
}

test("a bundle carrying the declared exception exits 0 and names the declaring gate in its reason line and in summary.json", () => {
  const context = arm("permissive-arm-fixture-declared").stage();
  const dir = scratch();
  const evidence = join(dir, "evidence");
  const greenGate = join(dir, "green.mjs");
  writeFileSync(
    greenGate,
    [
      'import { writeFileSync } from "node:fs";',
      "const args = process.argv.slice(2);",
      'const at = args.indexOf("--result");',
      "writeFileSync(args[at + 1], JSON.stringify({",
      '  gate: "g-green", status: "green", units: 3, unitLabel: "fixture units",',
      '  startedAt: "2026-09-16T00:00:00.000Z", endedAt: "2026-09-16T00:00:01.000Z",',
      '  detail: "fixture green", evidence: [] }, null, 2) + "\\n");',
      "process.exit(0);",
      "",
    ].join("\n"),
  );
  const manifest = join(dir, "manifest.json");
  writeFileSync(
    manifest,
    `${JSON.stringify(
      {
        version: 1,
        destructiveCommands: ["pool destroy", "teardown"],
        gates: [
          {
            id: "g-green",
            command: [process.execPath, greenGate],
            unitLabel: "fixture units",
            applicability: "required",
          },
          {
            /* `.` AND NOT AN ABSOLUTE DIRECTORY, which is how
               `gate-registry.yaml` spells this gate's own command. The runner
               probes every command operand containing a `/` and refuses a
               directory (`probeCommandRunnable`), so handing it the staged path
               reports `error` before the script ever starts. The runner is
               given that directory as its CWD instead, which is also what the
               shipped gate gets. */
            id: "check-dual-review",
            command: [process.execPath, scriptPath, "."],
            unitLabel: "review verdicts examined for decorrelation",
            /* CONDITIONAL, exactly as `gate-registry.yaml` declares it, and
               that is the whole hazard: a conditional gate's not-applicable
               never reaches `requiredNotApplicable`, so before this phase the
               exception appeared nowhere in the bundle at all. */
            applicability: "conditional",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const run = spawnSync(
    process.execPath,
    [cliEntry, "gates", "run", "--manifest", manifest, "--evidence", evidence],
    { cwd: context, encoding: "utf8" },
  );
  const summary = JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as Summary;
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.equal(summary.exitCode, 0);
  assert.deepEqual(summary.declaredNotApplicable, ["check-dual-review"]);
  assert.deepEqual(
    summary.requiredNotApplicable,
    [],
    "a conditional gate must not reach requiredNotApplicable; if it does, this test is passing for the wrong reason",
  );
  assert.ok(
    summary.reason.includes("check-dual-review"),
    `the reason line does not name the declaring gate: ${summary.reason}`,
  );
  assert.ok(
    summary.reason.includes("not applicable by declaration"),
    `the reason line does not say the not-applicable was declared: ${summary.reason}`,
  );
  const row = summary.gates.find((gate) => gate.id === "check-dual-review");
  assert.notEqual(row, undefined);
  assert.equal((row as Summary["gates"][number]).declaredNotApplicable, true);
});

test("the aggregate reason names a declared not-applicable gate, and is the bare green sentence without the declaration", () => {
  /* THE RED WITNESS FOR CRITERION 8, AGAINST THE DANGEROUS STATE RATHER THAN
     AGAINST AN ABSENT FEATURE. The dangerous state is a bundle that counts a
     declared exception as green and never names it, which is what the runner
     did before this phase and what the M4 probe measured a fifth status word
     doing. `decideAggregate` is the one aggregate decision and is exported to
     be exercised rather than read (its own CR-800 note), so both states are
     handed to it here: identical counts, identical rows, one flag. */
  const counts = {
    declared: 2,
    applicable: 1,
    verdict: 1,
    green: 1,
    red: 0,
    "not-applicable": 1,
    error: 0,
    vacuous: 0,
  };
  const rows = [
    { id: "g-green", status: "green" },
    { id: "check-dual-review", status: "not-applicable" },
  ];
  const withoutDeclaration = runModule.decideAggregate(counts, [], rows);
  assert.equal(withoutDeclaration.exitCode, 0);
  assert.equal(withoutDeclaration.reason, "every applicable gate is green");
  assert.ok(
    !withoutDeclaration.reason.includes("check-dual-review"),
    "the undeclared bundle already names the gate, so this control proves nothing",
  );
  const withDeclaration = runModule.decideAggregate(counts, [], [
    rows[0] as { id: string; status: string },
    { id: "check-dual-review", status: "not-applicable", declaredNotApplicable: true },
  ]);
  assert.equal(withDeclaration.exitCode, 0, "a declared exception is not a failure");
  assert.ok(withDeclaration.reason.includes("check-dual-review"), withDeclaration.reason);
  assert.ok(withDeclaration.reason.includes("not applicable by declaration"), withDeclaration.reason);
});

test("a declared not-applicable is named on a red bundle too, so the exception does not go quiet when something else is wrong", () => {
  const counts = {
    declared: 2,
    applicable: 2,
    verdict: 1,
    green: 0,
    red: 1,
    "not-applicable": 1,
    error: 0,
    vacuous: 0,
  };
  const decided = runModule.decideAggregate(counts, [], [
    { id: "g-red", status: "red" },
    { id: "check-dual-review", status: "not-applicable", declaredNotApplicable: true },
  ]);
  assert.equal(decided.exitCode, 1);
  assert.ok(decided.reason.includes("gate(s) reported red"), decided.reason);
  assert.ok(decided.reason.includes("not applicable by declaration"), decided.reason);
});

test("the declaration marker the producer writes is the same string the runner reads, by name and not by coincidence", () => {
  assert.equal(scriptModule.DECLARED_EVIDENCE, runModule.DECLARED_PRECONDITION_EVIDENCE);
  assert.equal(
    runModule.isDeclaredNotApplicable({
      status: "not-applicable",
      precondition: { evidence: [scriptModule.DECLARED_EVIDENCE] },
    }),
    true,
  );
  /* THREE WAYS IT MUST READ FALSE, because a marker that matches too eagerly
     would name gates that declared nothing. */
  assert.equal(
    runModule.isDeclaredNotApplicable({ status: "not-applicable", precondition: { evidence: [] } }),
    false,
  );
  assert.equal(runModule.isDeclaredNotApplicable({ status: "not-applicable" }), false);
  assert.equal(
    runModule.isDeclaredNotApplicable({
      status: "green",
      precondition: { evidence: [scriptModule.DECLARED_EVIDENCE] },
    }),
    false,
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 9: the declaration is the COMMITTED one                   */
/* ------------------------------------------------------------------ */

test("editing the declaration in the working tree after the commit changes nothing, and the recorded blob sha256 is the committed blob's", () => {
  const dir = arm("permissive-arm-fixture-declared").stage();
  const before = runScript(dir);
  assert.equal(before.record.status, "not-applicable");
  const committedSha = spawnSync("git", ["rev-parse", "HEAD:charter.yaml"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(committedSha.status, 0, committedSha.stderr);
  const committedBlob = spawnSync("git", ["cat-file", "blob", committedSha.stdout.trim()], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(committedBlob.status, 0, committedBlob.stderr);
  const reading = checksModule.readReviewFamilies(dir);
  assert.equal(reading.kind, "declared");
  const declared = reading as Extract<typeof reading, { kind: "declared" }>;
  const expected = spawnSync(
    process.execPath,
    ["-e", 'process.stdout.write(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(0)).digest("hex"))'],
    { input: committedBlob.stdout, encoding: "utf8" },
  );
  assert.equal(expected.status, 0, expected.stderr);
  assert.equal(
    declared.provenance.sha256,
    expected.stdout.trim(),
    "the recorded sha256 is not the committed blob's",
  );

  /* NOW WIDEN THE DECLARATION IN THE WORKING TREE ONLY. A charter declaring a
     second family would, if the tree were read, take the exception away; a
     charter declaring a DIFFERENT single family would make falsifier 2 fire.
     Neither happens, because the tree is not what is read. */
  writeFileSync(
    join(dir, "charter.yaml"),
    `${readFileSync(join(dir, "charter.yaml"), "utf8")}`.replace(
      /^review-families:[\s\S]*$/m,
      `${declarationBlock(["a-family-nothing-carries"], "edited in the working tree after the commit")}`,
    ),
  );
  const after = runScript(dir);
  assert.equal(after.record.status, before.record.status);
  const reread = checksModule.readReviewFamilies(dir);
  assert.equal(reread.kind, "declared");
  assert.deepEqual(
    (reread as Extract<typeof reread, { kind: "declared" }>).families,
    declared.families,
    "the working-tree edit changed what the check read",
  );
  assert.equal(
    (reread as Extract<typeof reread, { kind: "declared" }>).provenance.sha256,
    declared.provenance.sha256,
  );
});

test("a declaration that exists only in the working tree is error, never permission and never a quiet absence", () => {
  const dir = stage({
    declare: ["family-a"],
    verdicts: [
      { file: "decorrelated-criteria.yaml" },
      { file: "shared-family-hazard.yaml" },
    ],
    commit: false,
  });
  const reading = checksModule.readReviewFamilies(dir);
  assert.equal(reading.kind, "error", JSON.stringify(reading));
  const run = runScript(dir);
  assert.equal(run.record.status, "error");
  assert.equal(run.exit, 21);
  assert.ok(
    run.record.detail.includes("never permission"),
    `the refusal does not say why: ${run.record.detail}`,
  );
});

/* ------------------------------------------------------------------ */
/* The vacuity guards: a re-measurement, not a precaution              */
/* ------------------------------------------------------------------ */

/**
 * TWO STRUCTURALLY DIFFERENT MEMBERS of one class: an exception REPORTED
 * without the work behind it having been done.
 *
 * The M4 probe flagged, as a READING it had not run, that a vacuous third
 * status looked constructible because the never-green-by-omission rewrite
 * fires only for `status === "green"`
 * (delivery/verification/m4-prototype-probes.md:122). Re-measured in
 * `delivery/work-history/m4-p11.md` and confirmed on both arms: the
 * constructor leaves a not-applicable with units 0 untouched, and with both
 * derived checks deregistered the script reported green with the declaration
 * still in force, so `main` would have emitted "not-applicable by declaration"
 * with two units while ZERO guards ran.
 *
 * These two tests redden against exactly those states. Both refusals are
 * `error` and never `not-applicable`, because the path did not reach a verdict
 * about decorrelation, it failed to run one (M2-C-3).
 */
function withoutTheDecorrelationCheck<T>(body: () => T): T {
  /* BOTH derived checks come out, and the second one is not optional.
     `verdict-pair-approves` has its own group-size refusal, so leaving it
     registered produces violations of its own and the guard under test is
     never reached: the run reddens for an unrelated reason and the test passes
     while asserting nothing. Measured while writing this file. */
  const removed = checksModule.deregisterCheck("dual-review-decorrelation");
  const removedPair = checksModule.deregisterCheck("verdict-pair-approves");
  assert.equal(removed, true, "the check was not registered, so this witness proves nothing");
  assert.equal(removedPair, true, "the sibling check was not registered");
  try {
    return body();
  } finally {
    checksModule.registerCheck(checksModule.dualReviewDecorrelation);
    checksModule.registerCheck(checksModule.verdictPairApproves);
    const ids = checksModule.registeredChecks().map((check) => check.id);
    assert.ok(ids.includes("dual-review-decorrelation"), "the check was not restored");
    assert.ok(ids.includes("verdict-pair-approves"), "the sibling check was not restored");
  }
}

test("a declared exception over fewer than two reviews is error, because DR-0038 relaxes which families and never how many reviews", () => {
  const dir = stage({
    declare: ["family-a"],
    verdicts: [{ file: "decorrelated-criteria.yaml" }],
  });
  const outcome = withoutTheDecorrelationCheck(() => scriptModule.evaluate(dir));
  assert.equal(outcome.status, "error");
  assert.equal(outcome.units, 1);
  assert.equal(outcome.singleFamily, undefined);
  assert.ok(
    outcome.lines.some((line) => line.includes("never HOW MANY reviews there are")),
    outcome.lines.join("\n"),
  );
});

test("a declared exception reported while the check carrying the falsifiers did not run is error", () => {
  const dir = arm("permissive-arm-fixture-declared").stage();
  const outcome = withoutTheDecorrelationCheck(() => scriptModule.evaluate(dir));
  assert.equal(outcome.checksRun, 0, "the deregistration did not take effect");
  assert.equal(outcome.status, "error");
  assert.equal(outcome.units, 2, "two verdicts were still read, so this is not the units arm");
  assert.equal(outcome.singleFamily, undefined);
  assert.ok(
    outcome.lines.some((line) => line.includes("neither of DR-0038's two falsifiers was evaluated")),
    outcome.lines.join("\n"),
  );
});

test("with the check registered, the same declared context reaches not-applicable, which is the control the two refusals need", () => {
  const outcome = scriptModule.evaluate(arm("permissive-arm-fixture-declared").stage());
  assert.equal(outcome.status, "green", "evaluate reports the comparison; the script maps it");
  assert.equal(outcome.checksRun, 1);
  assert.notEqual(outcome.singleFamily, undefined);
});

/* ------------------------------------------------------------------ */
/* The declaration's shape                                             */
/* ------------------------------------------------------------------ */

test("the charter schema admits a review-families declaration and refuses one without a reason", () => {
  const schema = JSON.parse(
    readFileSync(join(repoRoot, "schemas", "charter.schema.json"), "utf8"),
  ) as {
    properties: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
    required: string[];
  };
  const field = schema.properties[checksModule.REVIEW_FAMILIES_FIELD];
  assert.notEqual(field, undefined, "the charter schema declares no review-families");
  assert.deepEqual((field as { required: string[] }).required.slice().sort(), ["available", "reason"]);
  /* OPTIONAL AT THE ROOT, deliberately: an absent declaration is the normal
     case and leaves the cross-family requirement applying unchanged. */
  assert.ok(
    !schema.required.includes(checksModule.REVIEW_FAMILIES_FIELD),
    "review-families became required, which would block every charter that declares nothing",
  );
});

test("a declaration listing one family twice once canonicalised is error rather than a single-family declaration", () => {
  const dir = stage({
    declare: ["Family-A", "family-a"],
    verdicts: [
      { file: "decorrelated-criteria.yaml" },
      { file: "shared-family-hazard.yaml" },
    ],
  });
  const reading = checksModule.readReviewFamilies(dir);
  assert.equal(reading.kind, "error", JSON.stringify(reading));
  assert.ok(
    (reading as { reason: string }).reason.includes("more than once once canonicalised"),
    (reading as { reason: string }).reason,
  );
});

/* ------------------------------------------------------------------ */
/* FIX ROUND 1: the corpus is the COMMITTED record, not the working    */
/* tree, and not one directory of it (CR-M4P11-001, CR-M4P11-002).     */
/*                                                                     */
/* THE MECHANISM, stated once here because three tests share it: a     */
/* decision assembled out of TWO SOURCES OF TRUTH can be made to       */
/* disagree by whoever controls the source that is not committed. The  */
/* declaration was read from the git object database and the corpus    */
/* that refutes it was read from disk, so the exception was bought by  */
/* an UNCOMMITTED change.                                              */
/*                                                                     */
/* THREE MEMBERS, STRUCTURALLY DIFFERENT, because one witness is not a */
/* class. They differ in DIRECTION (a deletion versus an addition), in */
/* WHICH GUARD they defeat (falsifier 1 versus DR-0012 condition 2),   */
/* and in whether anything was uncommitted at all (member 3 commits    */
/* everything and defeats the corpus by PLACEMENT). Measured against   */
/* the pre-fix code at `122472b`: member 1 gave not-applicable exit    */
/* 20, member 2 gave GREEN exit 0, member 3 gave not-applicable exit   */
/* 20. All three are red below.                                        */
/* ------------------------------------------------------------------ */

test("an UNCOMMITTED deletion of a contradicting verdict does not buy the exception", () => {
  const dir = stage({
    declare: ["family-a"],
    verdicts: [
      { file: "decorrelated-criteria.yaml" },
      { file: "shared-family-hazard.yaml" },
      {
        file: "decorrelated-criteria.yaml",
        as: "b-other-phase.yaml",
        producedBy: "family-b",
        phase: "M2-P1",
      },
    ],
    deleteAfterCommit: ["delivery/review/b-other-phase.yaml"],
  });
  /* THE CONTROL ARM, ASSERTED RATHER THAN ASSUMED: the file really is gone
     from the working tree and really is still in the commit. Without this the
     test could pass because the deletion never happened. */
  assert.throws(() => readFileSync(join(dir, "delivery", "review", "b-other-phase.yaml")));
  const tracked = spawnSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.match(tracked.stdout, /delivery\/review\/b-other-phase\.yaml/);

  const run = runScript(dir);
  assert.equal(run.record.status, "red", run.stdout);
  assert.equal(run.exit, 1, run.stdout);
  assert.ok(
    run.stdout.includes("distinct produced-by value(s) (family-a, family-b)"),
    `falsifier 1 did not fire over the committed corpus:\n${run.stdout}`,
  );
});

test("an UNCOMMITTED second review does not satisfy the pair a delegated grant requires", () => {
  const dir = stage({
    verdicts: [{ file: "decorrelated-criteria.yaml" }],
    uncommittedVerdicts: [{ file: "decorrelated-hazard.yaml" }],
  });
  /* The two documents ARE properly decorrelated, which is what makes this the
     dangerous state rather than a trivially failing one: on the pre-fix code
     this pair reported GREEN and authorised a merge on one committed review. */
  const tracked = spawnSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.doesNotMatch(tracked.stdout, /decorrelated-hazard\.yaml/);

  const run = runScript(dir);
  assert.equal(run.record.status, "red", run.stdout);
  assert.equal(run.exit, 1, run.stdout);
  assert.ok(
    run.stdout.includes("DR-0012 condition 2 is a property of the PAIR"),
    `the pair check did not refuse a corpus of one:\n${run.stdout}`,
  );
});

test("a COMMITTED second-family verdict outside delivery/review still contradicts the declaration", () => {
  const dir = stage({
    declare: ["family-a"],
    verdicts: [
      { file: "decorrelated-criteria.yaml" },
      { file: "shared-family-hazard.yaml" },
      {
        file: "decorrelated-hazard.yaml",
        directory: join("delivery", "evidence", "past"),
        phase: "M2-P1",
      },
    ],
  });
  const run = runScript(dir);
  assert.equal(run.record.status, "red", run.stdout);
  assert.equal(run.exit, 1, run.stdout);
  assert.ok(
    run.stdout.includes("committed under delivery/ carry 2 distinct produced-by value(s)"),
    `the falsifier corpus did not reach delivery/evidence/:\n${run.stdout}`,
  );
});

test("a corpus-scoped refusal names the source that corpus was read from, on both arms", () => {
  /* SC-011 APPLIED TO THE CORPUS. The pre-fix code printed "all N committed
     verdict(s) carry it" about a set it had read off disk, which is a sentence
     that is false of the commit it names in the same line.

     BOTH ARMS, because a renderer that names only the arm the tests happen to
     take is the shape that let the false sentence ship in the first place.
     The claim is scoped to sentences that talk ABOUT THE CORPUS: a refusal
     that compares two documents to each other ("not decorrelated on
     produced-by") names no set and is not in scope here. */
  const committed = stage({
    declare: ["family-a"],
    verdicts: [
      { file: "decorrelated-criteria.yaml" },
      { file: "shared-family-hazard.yaml", producedBy: "family-b" },
    ],
  });
  const fromCommit = runScript(committed);
  assert.match(
    fromCommit.stdout,
    /\(corpus: [^)]*read from commit [0-9a-f]{40}, resolved from HEAD\)/,
    fromCommit.stdout,
  );
  assert.doesNotMatch(fromCommit.stdout, /read from the WORKING TREE/);

  /* The worktree arm, staged by removing the git directory entirely rather
     than by mocking anything: this is the only state in which the shipped
     loader falls back, so it is the only honest way to exercise the sentence
     it prints there. ONE verdict, because the corpus-scoped sentence on this
     arm is the pair refusal, and a pair refusal needs a corpus of one. */
  const noGit = stage({ verdicts: [{ file: "decorrelated-criteria.yaml" }] });
  rmSync(join(noGit, ".git"), { recursive: true, force: true });
  const fromTree = runScript(noGit);
  assert.match(
    fromTree.stdout,
    /\(corpus: delivery\/review read from the WORKING TREE because/,
    fromTree.stdout,
  );
  assert.doesNotMatch(fromTree.stdout, /read from commit/);
});

test("this phase's new behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). `test/behaviors.json` is
     append-only and union-resolved, so a count here would be a claim about
     every future phase and false the moment the next one appends. */
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "single-family-declaration-read-from-the-commit",
    "single-family-declaration-uncommitted-is-error",
    "single-family-falsifier-corpus-contradiction",
    "single-family-falsifier-name-mismatch",
    "single-family-absent-declaration-is-not-permission",
    "single-family-permissive-arm-precondition-id",
    "single-family-no-arm-reports-green",
    "single-family-narrows-produced-by-only",
    "single-family-declared-exception-named-in-the-bundle",
    "single-family-declaration-marker-shared-by-name",
    "single-family-exception-refused-below-two-reviews",
    "single-family-exception-refused-when-the-falsifiers-did-not-run",
    "single-family-duplicate-declared-family-is-error",
    "single-family-two-declared-families-is-not-the-exception",
    "single-family-corpus-read-from-the-commit-not-the-worktree",
    "single-family-pair-corpus-read-from-the-commit-not-the-worktree",
    "single-family-falsifier-corpus-spans-the-paperwork-root",
    "single-family-corpus-source-named-on-both-arms",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});

test("a declaration of two genuinely different families is not this exception, and the cross-family requirement still applies", () => {
  const dir = stage({
    declare: ["family-a", "family-b"],
    verdicts: [
      { file: "decorrelated-criteria.yaml" },
      { file: "shared-family-hazard.yaml" },
    ],
  });
  const run = runScript(dir);
  assert.equal(run.record.status, "red");
  assert.ok(
    run.stdout.includes("are not decorrelated on produced-by"),
    `the produced-by comparison did not run:\n${run.stdout}`,
  );
});
