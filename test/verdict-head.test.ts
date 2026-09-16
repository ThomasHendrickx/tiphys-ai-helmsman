/**
 * THE VERDICT HEAD, THE MEDIUM ESCALATION, AND THE PAIR PREDICATE
 * (kernel plan M4, M4-P10; DR-0012 conditions 1 and 2).
 *
 * Two changes to a shipped schema and one new derived check, and all three
 * exist against ONE hazard: a merge precondition that reads as checked and is
 * not. Before this phase:
 *
 *   - `schemas/verdict.schema.json` carried no head, so the only thing tying a
 *     pair of reviews to one commit was the DIRECTORY the operator pointed the
 *     gate at. Two reviews of two different heads in one directory were
 *     compared as a pair and DR-0012 condition 1 read as satisfied.
 *   - the escalation rule fired on `{high, critical}` while DR-0012 condition 2
 *     bars an unresolved finding at high or MEDIUM, so an APPROVE beside a
 *     finding the review itself ranked medium validated at exit 0.
 *   - `scripts/check-dual-review.mjs` could not see a verdict's VALUE at all,
 *     so two properly decorrelated reviews that both REFUSED the merge passed
 *     the gate green.
 *
 * HOW THE RED WITNESSES ARE BUILT, because it is the part most easily faked.
 * The dangerous state here is not "the feature is absent", it is "the OLD
 * RULE is in force". So the old rule is obtained from git rather than
 * reconstructed by hand wherever that is possible:
 *
 *   - `preHeadTree()` materialises the newest commit reachable from HEAD whose
 *     `schemas/verdict.schema.json` does not carry `head`, with `git archive`,
 *     and runs the SHIPPED-AT-THAT-COMMIT `scripts/check-dual-review.mjs` out
 *     of it. Nothing is re-implemented in this file. The staging asserts that
 *     the tree it produced really lacks this phase's code, so "this is the old
 *     state" is measured rather than assumed.
 *   - `reconstructedPreHeadSchema()` is a DECLARED minimal edit of the shipped
 *     schema, and one test asserts it agrees with the git one on every
 *     dangerous document. That is what stops the reconstruction becoming a
 *     convenient copy of whatever makes the test pass.
 *
 * `src` and `scripts` are imported through the computed-URL dynamic import
 * pattern (CLAUDE.md standing warning 4).
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
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
const schemaPath = join(repoRoot, "schemas", "verdict.schema.json");

const checksModule = (await import(new URL("../src/checks.ts", import.meta.url).href)) as {
  registeredChecks: () => readonly { id: string; type: string; requiresContext: boolean }[];
  deregisterCheck: (id: string) => boolean;
  registerCheck: (check: unknown) => void;
  verdictPairApproves: { id: string };
  BLOCKING_SEVERITIES: readonly string[];
};

const validateModule = (await import(new URL("../src/validate.ts", import.meta.url).href)) as {
  validateToLines: (schema: Record<string, unknown>, instance: unknown) => string[];
};

const scriptModule = (await import(
  new URL("../scripts/check-dual-review.mjs", import.meta.url).href
)) as {
  evaluate: (directory: string) => {
    status: string;
    units: number;
    lines: string[];
    checksRun: number;
    pairChecksRun: number;
    read?: { path: string; verdict: string; head: string; producedBy: string }[];
  };
  PAIR_CHECK_ID: string;
};

/* ------------------------------------------------------------------ */
/* The head this phase's fixtures claim to review                       */
/* ------------------------------------------------------------------ */

/**
 * The head the shipped dual-review fixtures carry.
 *
 * READ OUT OF A FIXTURE RATHER THAN WRITTEN HERE, so this file cannot drift
 * from `witness/fixtures/dual-review/` the way a second copy of a constant
 * always eventually does.
 */
const FIXTURE_HEAD = (() => {
  const body = readFileSync(join(fixturesDir, "decorrelated-criteria.yaml"), "utf8");
  const match = /^head: ([0-9a-f]{40})$/m.exec(body);
  assert.ok(match !== null, "the decorrelated-criteria fixture carries no forty-hex head");
  return (match as RegExpExecArray)[1] as string;
})();

/** A DIFFERENT real forty-character sha: the tip of `main` this branch was cut above. */
const OTHER_HEAD = "1945d69a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a";

/* ------------------------------------------------------------------ */
/* Staging                                                             */
/* ------------------------------------------------------------------ */

/**
 * Stage a context directory carrying the real mode document, a charter naming
 * `mode`, and the named documents under `delivery/review/`.
 *
 * Deliberately the same shape `test/dual-review.test.ts` stages, and for the
 * same reason recorded there: the check reads the declared mode's
 * `merge-authority` rather than assuming one, so a two-line stand-in charter
 * would stop testing the thing under test (section 2.3 rule 4).
 */
function stageContext(mode: string, documents: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-verdict-head-"));
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  /* The line must EXIST; it does not have to change. The shipped template
     already declares `full`, so asserting the text differs would fail on the
     one mode this file most needs to stage. */
  assert.match(charter, /^delivery-mode: .*$/m, "the charter template has no delivery-mode line");
  const retargeted = charter.replace(/^delivery-mode: .*$/m, `delivery-mode: ${mode}`);
  assert.match(retargeted, new RegExp(`^delivery-mode: ${mode}$`, "m"));
  writeFileSync(join(dir, "charter.yaml"), retargeted);
  for (const [name, body] of Object.entries(documents)) {
    writeFileSync(join(dir, "delivery", "review", name), body);
  }
  return dir;
}

function withContext<T>(
  mode: string,
  documents: Record<string, string>,
  body: (dir: string) => T,
): T {
  const dir = stageContext(mode, documents);
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * One shipped fixture, optionally with declared substitutions applied.
 *
 * EVERY DANGEROUS DOCUMENT IN THIS FILE IS DERIVED FROM A SHIPPED FIXTURE BY A
 * NAMED EDIT, never written from scratch. A hand-written "verdict" is a
 * document no reviewer could have produced, and a test built on one is
 * asserting about a shape that cannot occur (section 2.3 rule 4, and the same
 * argument `test/dual-review.test.ts` makes for using the fixtures at all).
 */
function fixture(name: string, edits: [string, string][] = []): string {
  let body = readFileSync(join(fixturesDir, name), "utf8");
  for (const [from, to] of edits) {
    assert.ok(body.includes(from), `${name}: ${from} is not present, so the edit is stale`);
    body = body.replace(from, to);
  }
  return body;
}

/* ------------------------------------------------------------------ */
/* The pre-change state, obtained from git rather than re-implemented   */
/* ------------------------------------------------------------------ */

function git(args: string[]): { status: number; stdout: string; stderr: string } {
  const run = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: run.status ?? -1, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

/** Whether this checkout can answer history questions at all. */
const gitAvailable = (() => {
  const run = git(["rev-parse", "--is-inside-work-tree"]);
  return run.status === 0 && run.stdout.trim() === "true";
})();

/**
 * The newest commit reachable from HEAD whose verdict schema does NOT carry
 * `head`, or `undefined` if history is unavailable.
 *
 * DERIVED RATHER THAN PINNED, and the reason is that a pinned `HEAD~1` is
 * wrong after the first fix round: the parent of the tip would then be this
 * phase's own earlier commit, which already carries the field, and the witness
 * would quietly become a comparison of the new rule against itself. Walking
 * every ancestor newest-first and taking the first whose TREE lacks the field
 * is right whatever the branch's shape becomes. The next comment down says why
 * "every ancestor" and not "every ancestor that touched the file".
 */
function preHeadCommit(): string | undefined {
  if (!gitAvailable) {
    return undefined;
  }
  /* EVERY ANCESTOR, NEWEST FIRST, NOT ONLY THOSE THAT TOUCHED THE SCHEMA, and
     the difference is not cosmetic: filtering by path finds the newest commit
     that EDITED the file without `head`, which is an M3 commit from before
     `scripts/check-dual-review.mjs` existed at all. Measured while writing
     this: the staged tree had no `scripts/` entry for the gate and every
     witness died with MODULE_NOT_FOUND. What is wanted is the newest ancestor
     whose TREE does not carry the change, which is the commit this branch was
     cut from. */
  const listed = git(["rev-list", "--max-count=200", "HEAD"]);
  if (listed.status !== 0) {
    return undefined;
  }
  for (const sha of listed.stdout.split("\n").filter((line) => line.trim() !== "")) {
    const shown = git(["show", `${sha}:schemas/verdict.schema.json`]);
    if (shown.status !== 0) {
      continue;
    }
    const parsed = JSON.parse(shown.stdout) as Record<string, unknown>;
    const required = (parsed["required"] ?? []) as string[];
    if (!required.includes("head")) {
      const script = git(["cat-file", "-e", `${sha}:scripts/check-dual-review.mjs`]);
      return script.status === 0 ? sha : undefined;
    }
  }
  return undefined;
}

let stagedPreHeadTree: string | undefined;

/**
 * A working copy of the pre-change tree, with the repository's `node_modules`
 * symlinked in so its `scripts/` and `src/` run unmodified.
 *
 * WHAT IT ASSERTS BEFORE RETURNING is the part that makes it a witness rather
 * than a directory: that the tree really does lack this phase's code. A
 * staging step that silently produced the CURRENT tree would give a red
 * witness that cannot go red, which is the failure shape this repository has
 * recorded three times.
 */
function preHeadTree(): string | undefined {
  if (stagedPreHeadTree !== undefined) {
    return stagedPreHeadTree === "" ? undefined : stagedPreHeadTree;
  }
  const sha = preHeadCommit();
  if (sha === undefined) {
    stagedPreHeadTree = "";
    return undefined;
  }
  const dir = mkdtempSync(join(tmpdir(), "tiphys-pre-head-"));
  const archive = spawnSync("sh", ["-c", `git archive ${sha} | tar -x -C ${dir}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if ((archive.status ?? -1) !== 0) {
    rmSync(dir, { recursive: true, force: true });
    stagedPreHeadTree = "";
    return undefined;
  }
  symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"), "dir");

  const oldChecks = readFileSync(join(dir, "src", "checks.ts"), "utf8");
  assert.ok(
    !oldChecks.includes("headGroupFor"),
    "the staged pre-change tree already carries the head grouping, so it is not the old state",
  );
  assert.ok(
    !oldChecks.includes("verdictPairApproves"),
    "the staged pre-change tree already carries verdict-pair-approves, so it is not the old state",
  );
  const oldSchema = JSON.parse(
    readFileSync(join(dir, "schemas", "verdict.schema.json"), "utf8"),
  ) as Record<string, unknown>;
  assert.ok(
    !((oldSchema["required"] ?? []) as string[]).includes("head"),
    "the staged pre-change schema already requires head",
  );

  stagedPreHeadTree = dir;
  return dir;
}

/** The shipped verdict schema, parsed fresh so callers can mutate their copy. */
function shippedSchema(): Record<string, unknown> {
  return JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
}

/**
 * The shipped schema with M4-P10's two edits UNDONE, which is the dangerous
 * state stated as an edit rather than as a file.
 *
 * Both undos are named here so a reader can check them against the diff:
 * `head` leaves `required` and `properties`, and the escalation enum narrows
 * from [medium, high, critical] back to [high, critical].
 */
function reconstructedPreHeadSchema(): Record<string, unknown> {
  const schema = shippedSchema();
  schema["required"] = (schema["required"] as string[]).filter((name) => name !== "head");
  delete (schema["properties"] as Record<string, unknown>)["head"];
  const severity = (
    (((schema["if"] as Record<string, unknown>)["properties"] as Record<string, unknown>)[
      "findings"
    ] as Record<string, unknown>)["contains"] as Record<string, unknown>
  )["properties"] as Record<string, unknown>;
  (severity["severity"] as Record<string, unknown>)["enum"] = ["high", "critical"];
  return schema;
}

/** Parse a fixture body into the plain object the validator takes. */
const yamlModule = (await import("yaml")) as unknown as { parse: (text: string) => unknown };
function parsed(body: string): Record<string, unknown> {
  return yamlModule.parse(body) as Record<string, unknown>;
}

/** Run the shipped gate script against a staged context. */
function runGate(dir: string, tree = repoRoot): { status: number; output: string } {
  const run = spawnSync(
    process.execPath,
    [join(tree, "scripts", "check-dual-review.mjs"), dir],
    { cwd: tree, encoding: "utf8" },
  );
  return { status: run.status ?? -1, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

/* ------------------------------------------------------------------ */
/* Criterion 2: head is required, and a document without one is refused */
/* ------------------------------------------------------------------ */

test("the shipped schema requires head as forty lowercase hexadecimal digits", () => {
  const schema = shippedSchema();
  assert.ok((schema["required"] as string[]).includes("head"), "head is not required");
  const head = (schema["properties"] as Record<string, unknown>)["head"] as Record<
    string,
    unknown
  >;
  assert.equal(head["type"], "string");
  assert.equal(head["pattern"], "^[0-9a-f]{40}$");
});

test("tiphys validate --type verdict exits nonzero naming head for a verdict that carries none", () => {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-no-head-"));
  try {
    const path = join(dir, "no-head.yaml");
    writeFileSync(path, fixture("decorrelated-criteria.yaml", [[`head: ${FIXTURE_HEAD}\n`, ""]]));
    const run = spawnSync(process.execPath, [cliEntry, "validate", "--type", "verdict", path], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const output = `${run.stdout}${run.stderr}`;
    assert.notEqual(run.status, 0, output);
    assert.match(output, /^INVALID #\/head required property head is missing$/m, output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the same document carrying a head produces no head diagnostic, and none at all against the schema", () => {
  /* TWO ASSERTIONS BECAUSE THE CLI AND THE SCHEMA ANSWER DIFFERENT QUESTIONS.
     `validate` with no `--context` exits 1 whatever the document says, because
     the context-requiring derived checks report `SKIPPED ... no context` and a
     command that passed by not running would be the vacuous pass. So the CLI
     arm asserts the ABSENCE of any INVALID line, and the schema arm asserts a
     genuine empty diagnostic list, which is the exit-0 the criterion means. */
  const dir = mkdtempSync(join(tmpdir(), "tiphys-with-head-"));
  try {
    const body = fixture("decorrelated-criteria.yaml");
    const path = join(dir, "with-head.yaml");
    writeFileSync(path, body);
    const run = spawnSync(process.execPath, [cliEntry, "validate", "--type", "verdict", path], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const output = `${run.stdout}${run.stderr}`;
    assert.doesNotMatch(output, /INVALID/, output);
    assert.deepEqual(validateModule.validateToLines(shippedSchema(), parsed(body)), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RED WITNESS, criterion 2: the same head-less document validates clean against the PRE-CHANGE schema", () => {
  /* THE DANGEROUS STATE, NOT THE ABSENT FEATURE. What made the directory
     convention survivable was that a head-less verdict was a VALID verdict, so
     nothing anywhere refused it. Against the reconstructed pre-change schema
     this document produces zero diagnostics, which is the exit 0 the criterion
     names; against the shipped one it produces exactly the head diagnostic. */
  const instance = parsed(fixture("decorrelated-criteria.yaml", [[`head: ${FIXTURE_HEAD}\n`, ""]]));
  assert.ok(!Object.hasOwn(instance, "head"), "the edit did not remove head");

  const before = validateModule.validateToLines(reconstructedPreHeadSchema(), instance);
  assert.deepEqual(before, [], "the pre-change schema was expected to accept a head-less verdict");

  const after = validateModule.validateToLines(shippedSchema(), instance);
  assert.deepEqual(after, ["INVALID #/head required property head is missing"]);
});

test("the reconstructed pre-change schema agrees with the one in git, so the reconstruction is not a convenience", () => {
  /* WHAT THIS GUARDS. `reconstructedPreHeadSchema` is written by hand in this
     file, and a hand-written "old state" is exactly the shape that drifts into
     whatever makes the test pass. Comparing it against the real committed
     document on the same two dangerous instances is what keeps it honest. If
     history is unavailable this cannot run, and it SAYS so rather than
     reporting a pass. */
  const sha = preHeadCommit();
  if (sha === undefined) {
    assert.ok(!gitAvailable, "git is available but no pre-head commit was found");
    return;
  }
  const committed = JSON.parse(
    git(["show", `${sha}:schemas/verdict.schema.json`]).stdout,
  ) as Record<string, unknown>;

  const headless = parsed(
    fixture("decorrelated-criteria.yaml", [[`head: ${FIXTURE_HEAD}\n`, ""]]),
  );
  const approveWithMedium = parsed(mediumFindingBody());
  delete approveWithMedium["head"];

  for (const instance of [headless, approveWithMedium]) {
    assert.deepEqual(
      validateModule.validateToLines(committed, instance),
      validateModule.validateToLines(reconstructedPreHeadSchema(), instance),
      "the reconstruction and the committed pre-change schema disagree",
    );
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4: APPROVE beside a medium finding                         */
/* ------------------------------------------------------------------ */

/**
 * A verdict reading APPROVE beside a finding the review itself ranked medium.
 *
 * Built from the shipped decorrelated fixture by replacing its empty
 * `findings` list, so everything else about it is a document a reviewer
 * produced.
 */
function mediumFindingBody(severity = "medium"): string {
  return fixture("decorrelated-criteria.yaml", [
    [
      "findings: []",
      [
        "findings:",
        "  - id: CR-001",
        `    severity: ${severity}`,
        '    evidence: ["src/checks.ts:1 the guard reads the wrong field"]',
        '    concrete-fix: "Read the field the rule is about."',
      ].join("\n"),
    ],
  ]);
}

test("APPROVE beside a medium finding is refused, and the diagnostic names the verdict field", () => {
  const lines = validateModule.validateToLines(shippedSchema(), parsed(mediumFindingBody()));
  assert.ok(lines.length > 0, "a medium finding beside APPROVE was accepted");
  assert.ok(
    lines.some((line) => line.startsWith("INVALID #/verdict")),
    `no diagnostic named the verdict field: ${lines.join("; ")}`,
  );
});

test("RED WITNESS, criterion 4: that exact document validates clean against the PRE-CHANGE schema", () => {
  /* `head` IS REMOVED FIRST, AND THAT IS NOT A WEAKENING OF THE WITNESS. The
     pre-change schema is `additionalProperties: false` and has no `head`
     property, so it refuses the field outright: a document carrying one is a
     document that schema could never have been given, and validating it there
     would measure the absence of the property rather than the escalation rule.
     What the criterion is about is the SEVERITY, and this arm holds everything
     else fixed. The head-less-ness of the pre-change corpus is exactly what
     the criterion-2 witness one screen up measures. */
  const instance = parsed(mediumFindingBody());
  delete instance["head"];
  assert.deepEqual(
    validateModule.validateToLines(reconstructedPreHeadSchema(), instance),
    [],
    "the pre-change escalation rule was expected to accept APPROVE beside a medium finding",
  );
  /* THE CONTROL. Reintroduce only the severity change and the shipped schema
     refuses it, so the green above is the old RULE and not the edit that
     removed the field. */
  assert.ok(
    validateModule
      .validateToLines(shippedSchema(), parsed(mediumFindingBody()))
      .some((line) => line.startsWith("INVALID #/verdict")),
  );
});

test("the widening is a class, not one severity: high and critical still redden and low still does not", () => {
  /* ONE WITNESS IS NOT A CLASS. The rule under test is "a finding the review
     ranked at or above the blocking floor forces FIX-ROUND-NEEDED", and
     `medium` is only its new member. The two old members must still redden,
     because a widening written as a REPLACEMENT rather than an extension would
     leave them out and this test is what refuses that. `low` is the control:
     DR-0012 permits merging with a low finding, so a rule that reddened on it
     would be a different and wrong rule. */
  for (const severity of ["medium", "high", "critical"]) {
    const lines = validateModule.validateToLines(shippedSchema(), parsed(mediumFindingBody(severity)));
    assert.ok(
      lines.some((line) => line.startsWith("INVALID #/verdict")),
      `severity ${severity} did not force FIX-ROUND-NEEDED: ${lines.join("; ")}`,
    );
  }
  assert.deepEqual(
    validateModule.validateToLines(shippedSchema(), parsed(mediumFindingBody("low"))),
    [],
    "a low finding beside APPROVE was refused, which DR-0012 permits",
  );
});

test("the check's blocking severities and the schema's escalation enum are the same three words", () => {
  /* THE HAZARD ROW "the medium widening in the schema only" AND ITS MIRROR, in
     one assertion. The schema decides what one document may say; the check
     decides what a committed PAIR may say; a run where they disagree is a
     merge precondition that is one severity wider in one place than the other,
     which is precisely the state this phase found and repaired. */
  const schema = shippedSchema();
  const enumerated = (
    (
      (((schema["if"] as Record<string, unknown>)["properties"] as Record<string, unknown>)[
        "findings"
      ] as Record<string, unknown>)["contains"] as Record<string, unknown>
    )["properties"] as Record<string, unknown>
  )["severity"] as Record<string, unknown>;
  assert.deepEqual(
    [...(enumerated["enum"] as string[])].sort(),
    [...checksModule.BLOCKING_SEVERITIES].sort(),
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 3: the join key is (phase, head)                           */
/* ------------------------------------------------------------------ */

const SAME_HEAD_PAIR = {
  "decorrelated-criteria.yaml": fixture("decorrelated-criteria.yaml"),
  "decorrelated-hazard.yaml": fixture("decorrelated-hazard.yaml"),
};

const TWO_HEAD_PAIR = {
  "decorrelated-criteria.yaml": fixture("decorrelated-criteria.yaml"),
  "decorrelated-hazard.yaml": fixture("decorrelated-hazard.yaml", [
    [`head: ${FIXTURE_HEAD}`, `head: ${OTHER_HEAD}`],
  ]),
};

test("two verdicts carrying the SAME head are one group of two and the gate reports it green", () => {
  withContext("full", SAME_HEAD_PAIR, (dir) => {
    const run = runGate(dir);
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /check-dual-review: green \(2 review verdicts examined/, run.output);
    assert.match(
      run.output,
      new RegExp(`REPORT dual-review-decorrelation 2 verdict\\(s\\) for phase M3-P9 at head ${FIXTURE_HEAD} are distinct`),
      run.output,
    );
  });
});

test("two verdicts carrying DIFFERENT heads are two groups of one and the condition is not reported satisfied", () => {
  withContext("full", TWO_HEAD_PAIR, (dir) => {
    const run = runGate(dir);
    assert.notEqual(run.status, 0, run.output);
    /* EACH GUARD IS NAMED SEPARATELY, for the reason recorded at the sibling
       assertion in `test/dual-review.test.ts`: the two pair-size rules open
       their messages with the same twelve words, so a regex stopping at the
       shared prefix is satisfied by either one and neither rule is actually
       guarded. Both must print for both heads. */
    for (const head of [FIXTURE_HEAD, OTHER_HEAD]) {
      assert.match(
        run.output,
        new RegExp(
          `only 1 verdict document\\(s\\) exist under delivery/review for phase M3-P9 at head ${head}, and a delegated grant requires two independent clean-room reviews of the exact head \\(check: dual-review-decorrelation\\)`,
        ),
        run.output,
      );
      assert.match(
        run.output,
        new RegExp(
          `only 1 verdict document\\(s\\) exist under delivery/review for phase M3-P9 at head ${head}, and DR-0012 condition 2 is a property of the PAIR, so it cannot be satisfied by fewer than two \\(check: verdict-pair-approves\\)`,
        ),
        run.output,
      );
    }
    /* AND THE SATISFIED SENTENCE IS ABSENT. A red exit code beside a line
       saying the reviews are decorrelated would be two facts a reader has to
       reconcile, and the criterion asks for the second not to be printed. */
    assert.doesNotMatch(run.output, /REPORT dual-review-decorrelation 2 verdict\(s\)/, run.output);
  });
});

test("RED WITNESS, criterion 3, member one: the PRE-CHANGE gate compares that same pair and reports green", () => {
  /* THE DANGEROUS STATE IS THE OLD JOIN KEY, and it is run rather than
     described: `git archive` of the newest commit whose schema has no head,
     and the `scripts/check-dual-review.mjs` that shipped at it. */
  const tree = preHeadTree();
  if (tree === undefined) {
    assert.ok(!gitAvailable, "git is available but the pre-change tree could not be staged");
    return;
  }
  withContext("full", TWO_HEAD_PAIR, (dir) => {
    const run = runGate(dir, tree);
    assert.equal(run.status, 0, `the pre-change gate was expected to green this pair: ${run.output}`);
    assert.match(run.output, /check-dual-review: green \(2 review verdicts examined/, run.output);
    assert.match(
      run.output,
      /REPORT dual-review-decorrelation 2 verdict\(s\) for phase M3-P9 are distinct on produced-by, framing, review-contract/,
      run.output,
    );
  });
});

test("RED WITNESS, criterion 3, member two: a sibling whose head cannot be read is refused, not silently dropped", () => {
  /* THE SECOND STRUCTURALLY DIFFERENT MEMBER OF THE CLASS. Member one is "the
     key ignores the head". This one is "the key uses the head and a document
     that has no usable one falls out of the group", which reaches the same
     dangerous place by a different route: with three verdicts, two of them
     sharing a model family, giving the third an unreadable head would leave a
     compared pair of two and a green run. The group here is the good pair plus
     a third whose head is the empty string. */
  const documents = {
    ...SAME_HEAD_PAIR,
    "third-unreadable-head.yaml": fixture("shared-family-hazard.yaml", [
      [`head: ${FIXTURE_HEAD}`, 'head: ""'],
      ["produced-by: family-a", "produced-by: family-c"],
      ["framing: destructive-paths", "framing: fix-round"],
    ]),
  };
  withContext("full", documents, (dir) => {
    const run = runGate(dir);
    assert.notEqual(run.status, 0, run.output);
    assert.match(
      run.output,
      /third-unreadable-head\.yaml declares head as an empty string, which names no value, so the reviews cannot be grouped by the head they reviewed/,
      run.output,
    );
  });
});

test("an abbreviated head is refused rather than becoming a second group of one", () => {
  /* THE HAZARD ROW "two spellings of one head look like two heads", in the
     direction no canonical form can close. A seven-character prefix of the
     pair's own head is not resolvable to it without a repository this check is
     never given, so it is refused at the document boundary instead. */
  const documents = {
    ...SAME_HEAD_PAIR,
    "third-short-head.yaml": fixture("shared-family-hazard.yaml", [
      [`head: ${FIXTURE_HEAD}`, `head: ${FIXTURE_HEAD.slice(0, 7)}`],
      ["produced-by: family-a", "produced-by: family-c"],
      ["framing: destructive-paths", "framing: fix-round"],
    ]),
  };
  withContext("full", documents, (dir) => {
    const run = runGate(dir);
    assert.notEqual(run.status, 0, run.output);
    assert.match(
      run.output,
      new RegExp(`declares head ${FIXTURE_HEAD.slice(0, 7)}, which is not forty lowercase hexadecimal digits`),
      run.output,
    );
  });
});

test("an upper-case head is ONE key with its lower-case spelling, which is the other direction of the same hazard", () => {
  /* Refusing the abbreviation and FOLDING the case are the two halves of "two
     spellings of one head". This arm proves the second: the pair is still one
     group of two and still green, rather than two groups of one. The schema
     refuses upper case at the document boundary, and `establishField` folds it
     inside the check, so the two layers agree instead of one relying on the
     other; this asserts the inner one on its own. */
  const documents = {
    "decorrelated-criteria.yaml": fixture("decorrelated-criteria.yaml"),
    "decorrelated-hazard.yaml": fixture("decorrelated-hazard.yaml", [
      [`head: ${FIXTURE_HEAD}`, `head: ${FIXTURE_HEAD.toUpperCase()}`],
    ]),
  };
  withContext("full", documents, (dir) => {
    const run = runGate(dir);
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /check-dual-review: green \(2 review verdicts examined/, run.output);
  });
});

/* ------------------------------------------------------------------ */
/* Criteria 5 and 6: the pair predicate                                 */
/* ------------------------------------------------------------------ */

const ONE_REFUSING_PAIR = {
  "decorrelated-criteria.yaml": fixture("decorrelated-criteria.yaml", [
    ["verdict: APPROVE", "verdict: FIX-ROUND-NEEDED"],
  ]),
  "decorrelated-hazard.yaml": fixture("decorrelated-hazard.yaml"),
};

const BOTH_REFUSING_PAIR = {
  "decorrelated-criteria.yaml": fixture("decorrelated-criteria.yaml", [
    ["verdict: APPROVE", "verdict: FIX-ROUND-NEEDED"],
  ]),
  "decorrelated-hazard.yaml": fixture("decorrelated-hazard.yaml", [
    ["verdict: APPROVE", "verdict: FIX-ROUND-NEEDED"],
  ]),
};

test("a pair in which ONE verdict reads FIX-ROUND-NEEDED reddens verdict-pair-approves", () => {
  withContext("full", ONE_REFUSING_PAIR, (dir) => {
    const run = runGate(dir);
    assert.notEqual(run.status, 0, run.output);
    assert.match(
      run.output,
      /decorrelated-criteria\.yaml reads FIX-ROUND-NEEDED for phase M3-P9 at head [0-9a-f]{40}, so the pair does not approve this head/,
      run.output,
    );
    assert.match(run.output, /\(check: verdict-pair-approves\)/, run.output);
    /* AND THE SIBLING CHECK IS NOT WHAT REDDENED IT. This pair is properly
       decorrelated, so a red coming from `dual-review-decorrelation` would
       mean the new predicate had not been reached at all. */
    assert.doesNotMatch(run.output, /INVALID .*\(check: dual-review-decorrelation\)/, run.output);
  });
});

test("RED WITNESS, criterion 5: the PRE-CHANGE gate greens a pair in which BOTH verdicts refuse the merge", () => {
  /* THE CAPTURED GREEN THE CRITERION ASKS FOR. Two properly decorrelated
     reviews that both say FIX-ROUND-NEEDED passed this gate at exit 0, because
     nothing in it could see a verdict's value. The output is captured from the
     pre-change tree and asserted, rather than described. */
  const tree = preHeadTree();
  if (tree === undefined) {
    assert.ok(!gitAvailable, "git is available but the pre-change tree could not be staged");
    return;
  }
  const documents = Object.fromEntries(
    Object.entries(BOTH_REFUSING_PAIR).map(([name, body]) => [
      name,
      /* The pre-change schema has no head, and its check has no head grouping,
         so the field is simply unknown there; leaving it in would be testing a
         document that tree could not have been given. */
      body.replace(/^head: [0-9a-fA-F]+\n/m, ""),
    ]),
  );
  withContext("full", documents, (dir) => {
    const run = runGate(dir, tree);
    assert.equal(run.status, 0, `the pre-change gate was expected to green a refusing pair: ${run.output}`);
    assert.match(run.output, /check-dual-review: green \(2 review verdicts examined/, run.output);
  });
});

test("the SHIPPED gate reddens that same both-refusing pair, which is what the pre-change green measures against", () => {
  withContext("full", BOTH_REFUSING_PAIR, (dir) => {
    const run = runGate(dir);
    assert.notEqual(run.status, 0, run.output);
    /* BOTH VERDICTS ARE NAMED AS SUBJECTS, which is the assertion, and it is
       not a count of lines. The gate runs each check once per document and
       every violation is about the whole group, so one refusal is reported
       from each vantage point and differs only in its trailing path; the
       script's own dedup comment records that as deliberate. Counting lines
       would be asserting about that reporting shape rather than about the
       refusals. */
    for (const name of ["decorrelated-criteria.yaml", "decorrelated-hazard.yaml"]) {
      assert.match(
        run.output,
        new RegExp(`review/${name} reads FIX-ROUND-NEEDED`),
        `${name} was not named as refusing: ${run.output}`,
      );
    }
  });
});

test("a verdict carrying a blocking finding reddens the pair predicate even though the schema also refuses it", () => {
  /* TWO LAYERS, DELIBERATELY, AND THIS IS THE SECOND STRUCTURALLY DIFFERENT
     MEMBER OF "the pair is not clean". The schema refuses APPROVE beside a
     medium finding INSIDE ONE DOCUMENT. Nothing on the gate's path validates
     the committed siblings, which is recorded at `dualReviewDecorrelation`, so
     a document that never went through `tiphys validate` reaches the gate
     unrefused. The check therefore establishes the severity itself rather than
     borrowing the guarantee from the schema. */
  const documents = {
    "decorrelated-criteria.yaml": mediumFindingBody(),
    "decorrelated-hazard.yaml": fixture("decorrelated-hazard.yaml"),
  };
  withContext("full", documents, (dir) => {
    const run = runGate(dir);
    assert.notEqual(run.status, 0, run.output);
    assert.match(
      run.output,
      /carries finding CR-001 at severity medium for phase M3-P9 at head [0-9a-f]{40}, and a delegated grant is not satisfied/,
      run.output,
    );
    assert.match(run.output, /\(check: verdict-pair-approves\)/, run.output);
  });
});

test("a verdict spelled Approve is refused rather than read as an authorisation", () => {
  /* THE FAIL-OPEN THE CANONICAL READING WOULD HAVE OPENED, and it is the
     mirror image of the rule the decorrelation check follows. That check
     REFUSES when two values match, so folding case produces more refusals.
     This one APPROVES when a value matches, so folding case would produce more
     APPROVALS. `schemas/verdict.schema.json` forbids `Approve`, and nothing on
     this gate's path validates the committed siblings, so the schema is not the
     guard here. */
  const documents = {
    "decorrelated-criteria.yaml": fixture("decorrelated-criteria.yaml", [
      ["verdict: APPROVE", "verdict: Approve"],
    ]),
    "decorrelated-hazard.yaml": fixture("decorrelated-hazard.yaml"),
  };
  withContext("full", documents, (dir) => {
    const run = runGate(dir);
    assert.notEqual(run.status, 0, run.output);
    assert.match(
      run.output,
      /declares verdict Approve, which is not one of the two words the closed vocabulary admits \(APPROVE, FIX-ROUND-NEEDED\)/,
      run.output,
    );
    assert.match(run.output, /\(check: verdict-pair-approves\)/, run.output);
  });
});

test("a severity outside the four-word vocabulary is refused rather than treated as non-blocking", () => {
  /* THE SECOND FAIL-OPEN OF THE SAME SHAPE, one field along. Asking "is this
     one of the three blocking severities" answers NO for `blocker`, and no is
     the permissive answer. Two structurally different members of the class
     "a value the check does not recognise is treated as safe": this one and
     the `Approve` arm above. */
  const documents = {
    "decorrelated-criteria.yaml": mediumFindingBody("blocker"),
    "decorrelated-hazard.yaml": fixture("decorrelated-hazard.yaml"),
  };
  withContext("full", documents, (dir) => {
    const run = runGate(dir);
    assert.notEqual(run.status, 0, run.output);
    assert.match(
      run.output,
      /ranks finding CR-001 blocker, which is not one of the four severities the kernel's vocabulary admits \(low, medium, high, critical\)/,
      run.output,
    );
  });
});

test("a low finding does NOT redden the pair predicate, which is the control the two refusals need", () => {
  /* Without this, every one of the arms above would also pass a check that
     reddened on any finding at all, and the vocabulary work would be
     unmeasured. DR-0012 permits merging with a low finding. */
  const documents = {
    "decorrelated-criteria.yaml": mediumFindingBody("low"),
    "decorrelated-hazard.yaml": fixture("decorrelated-hazard.yaml"),
  };
  withContext("full", documents, (dir) => {
    const run = runGate(dir);
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /check-dual-review: green \(2 review verdicts examined/, run.output);
  });
});

test("deregistering verdict-pair-approves makes the one-refusing pair pass, and restoring it makes it fail again", () => {
  /* THE KIND B FALSIFICATION (section 2.3 rule 3), and the same shape the
     sibling check's witness has. The script's own `evaluate` is called rather
     than a copy of its loop, so what is shown to depend on the registration is
     the shipped code path. */
  withContext("full", ONE_REFUSING_PAIR, (dir) => {
    const before = scriptModule.evaluate(dir);
    assert.equal(before.status, "red");
    assert.equal(before.pairChecksRun, 1);

    assert.equal(checksModule.deregisterCheck("verdict-pair-approves"), true);
    try {
      const during = scriptModule.evaluate(dir);
      assert.equal(during.status, "green");
      assert.equal(during.pairChecksRun, 0);
      assert.deepEqual(
        during.lines.filter((line) => line.startsWith("INVALID")),
        [],
      );
    } finally {
      checksModule.registerCheck(checksModule.verdictPairApproves);
    }

    const after = scriptModule.evaluate(dir);
    assert.equal(after.status, "red");
    assert.equal(after.pairChecksRun, 1);
  });
});

test("verdict-pair-approves is registered in the shipped registry for the verdict type and requires a context", () => {
  /* THE OTHER HALF of the witness above, and it has to be a separate
     assertion for the reason `test/dual-review.test.ts` records for its
     sibling: the gate exits 0 when the check is not registered, which is what
     makes the deregistration witness real, and that same property means a
     green tells a reader nothing about whether the check exists. Resolved BY
     NAME out of the registry, never by count or position. */
  const found = checksModule
    .registeredChecks()
    .filter((check) => check.id === "verdict-pair-approves");
  assert.equal(found.length, 1, "verdict-pair-approves is not registered exactly once");
  assert.equal(found[0]?.type, "verdict");
  assert.equal(found[0]?.requiresContext, true);
  assert.equal(scriptModule.PAIR_CHECK_ID, "verdict-pair-approves");
});

/* ------------------------------------------------------------------ */
/* Step 6: the gate prints the count AND the values                     */
/* ------------------------------------------------------------------ */

test("the gate prints each verdict's value, head and produced-by, not only how many it examined", () => {
  /* M4-P10 step 6, and it is the mitigation for the one thing this phase does
     NOT refuse. `produced-by` is compared as a canonicalised STRING, never as
     a model FAMILY, so two values naming one vendor pass as decorrelated; that
     was measured against this repository's own reviews and closing it is
     M4-P11's declared scope. Printing the values is what lets a reader of the
     gate's own output see what was compared instead of opening two files. */
  withContext("full", SAME_HEAD_PAIR, (dir) => {
    const run = runGate(dir);
    assert.equal(run.status, 0, run.output);
    for (const family of ["family-a", "family-b"]) {
      assert.match(
        run.output,
        new RegExp(`verdict APPROVE at head ${FIXTURE_HEAD} produced-by ${family} `),
        run.output,
      );
    }
    assert.match(
      run.output,
      /1 registered check\(s\) named verdict-pair-approves ran over 2 verdict\(s\)/,
      run.output,
    );
  });
});

test("the two registered-check counts are printed separately, so one absent guard is not hidden by the other", () => {
  withContext("full", SAME_HEAD_PAIR, (dir) => {
    const run = scriptModule.evaluate(dir);
    assert.equal(run.checksRun, 1);
    assert.equal(run.pairChecksRun, 1);
    assert.deepEqual(
      (run.read ?? []).map((entry) => entry.verdict).sort(),
      ["APPROVE", "APPROVE"],
    );
    assert.deepEqual(
      (run.read ?? []).map((entry) => entry.producedBy).sort(),
      ["family-a", "family-b"],
    );
  });
});

/* ------------------------------------------------------------------ */
/* The regime still gates both checks                                   */
/* ------------------------------------------------------------------ */

test("under an owner-authority mode neither check violates, and both say why rather than passing silently", () => {
  /* SC-011 for the new check. "Nothing to check here" and "everything checked
     and fine" must not print the same line, and the regime reading is now
     SHARED by the two checks, so this arm is what shows the lift kept the
     report arm working for both rather than only for the one it came from. */
  withContext("direct-pr", ONE_REFUSING_PAIR, (dir) => {
    const run = runGate(dir);
    assert.equal(run.status, 0, run.output);
    assert.doesNotMatch(run.output, /INVALID/, run.output);
    assert.match(
      run.output,
      /REPORT verdict-pair-approves mode direct-pr declares merge-authority owner, which is not a delegated grant/,
      run.output,
    );
    assert.match(
      run.output,
      /REPORT dual-review-decorrelation mode direct-pr declares merge-authority owner, which is not a delegated grant/,
      run.output,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Fix round 1: a candidate that could not be LOOKED AT is a violation   */
/* ------------------------------------------------------------------ */

/**
 * A refusing THIRD review of the same phase and head, decorrelated from both
 * halves of the good pair on every dimension.
 *
 * DECORRELATED ON PURPOSE, so that when it is admitted the ONLY thing that can
 * redden is its FIX-ROUND-NEEDED verdict. A third document that also collided
 * on `review-contract` would redden the decorrelation check as well, and the
 * test would then pass whether or not the pair predicate ever saw it.
 */
const REFUSING_THIRD = fixture("decorrelated-criteria.yaml", [
  ["verdict: APPROVE", "verdict: FIX-ROUND-NEEDED"],
  ["produced-by: family-a", "produced-by: family-c"],
  ["framing: criteria-contract", "framing: third-framing"],
  ["review-contract: criteria", "review-contract: third-contract"],
]);

/**
 * Stage the good pair plus one third document, and return the gate's run.
 *
 * `body` of `undefined` means "make the path a DIRECTORY instead", which is how
 * an unreadable candidate is produced without depending on file modes: this
 * container runs as uid 0, so `chmod 000` does not stop the read and a witness
 * built on it would be green for the wrong reason. Measured before this helper
 * was written: the mode-000 arm reddened only because the gate had ALREADY read
 * the file.
 */
function withThirdDocument<T>(
  body: string | undefined,
  run: (dir: string, output: { status: number; output: string }) => T,
): T {
  return withContext("full", SAME_HEAD_PAIR, (dir) => {
    const path = join(dir, "delivery", "review", "third-refusing.yaml");
    if (body === undefined) {
      mkdirSync(path);
    } else {
      writeFileSync(path, body);
    }
    return run(dir, runGate(dir));
  });
}

/** `tiphys validate` over ONE committed verdict with the directory as context. */
function runValidateOne(dir: string, name: string): string {
  const run = spawnSync(
    process.execPath,
    [
      cliEntry,
      "validate",
      "--type",
      "verdict",
      join(dir, "delivery", "review", name),
      "--context",
      dir,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return `${run.stdout ?? ""}${run.stderr ?? ""}`;
}

/*
 * TWO LAYERS AND TWO MESSAGES, AND EACH ARM BELOW ASSERTS BOTH. The drop was
 * present in `loadCommittedVerdicts` (the derived checks) AND in
 * `committedVerdictPaths` (the gate runner's own selection), and closing only
 * one leaves the other. They do not both print, because the runner refuses the
 * directory with `error` before any check runs, so the runner's refusal is
 * witnessed through the gate and the checks' through `tiphys validate`.
 */

test("a sibling whose YAML does not decode makes the gate error instead of reporting the pair clean", () => {
  /* MEMBER ONE OF THE CLASS "a candidate that could not be looked at shrinks
     the set". Before this round the gate printed
     `no decorrelation violation and the pair approves` at exit 0 over a
     directory whose third review read FIX-ROUND-NEEDED and had one malformed
     line, and the dropped document appeared nowhere in the output. */
  withThirdDocument(`${REFUSING_THIRD}\n  this line: is: not: yaml: [\n`, (dir, run) => {
    assert.equal(run.status, 21, run.output);
    assert.match(run.output, /third-refusing\.yaml did not decode/, run.output);
    assert.doesNotMatch(run.output, /the pair approves/, run.output);

    const validated = runValidateOne(dir, "decorrelated-criteria.yaml");
    for (const check of ["dual-review-decorrelation", "verdict-pair-approves"]) {
      assert.match(
        validated,
        new RegExp(
          `INVALID #/kind .*third-refusing\\.yaml sits under delivery/review and did not decode.*\\(check: ${check}\\)`,
        ),
        validated,
      );
    }
    assert.doesNotMatch(validated, /REPORT verdict-pair-approves .* read APPROVE/, validated);
  });
});

test("a sibling that cannot be read at all makes the gate error instead of reporting the pair clean", () => {
  /* MEMBER TWO, AND IT IS STRUCTURALLY DIFFERENT RATHER THAN A SECOND SPELLING
     OF MEMBER ONE: member one has bytes that fail to parse, this one is never
     opened, so it exercises `readOperatorPath`'s refusal rather than
     `decodeDocument`'s. The two reach the same drop through different
     readers. */
  withThirdDocument(undefined, (dir, run) => {
    assert.equal(run.status, 21, run.output);
    assert.match(run.output, /third-refusing\.yaml could not be read/, run.output);
    assert.doesNotMatch(run.output, /the pair approves/, run.output);

    const validated = runValidateOne(dir, "decorrelated-criteria.yaml");
    for (const check of ["dual-review-decorrelation", "verdict-pair-approves"]) {
      assert.match(
        validated,
        new RegExp(
          `INVALID #/kind .*third-refusing\\.yaml sits under delivery/review and could not be read.*\\(check: ${check}\\)`,
        ),
        validated,
      );
    }
    assert.doesNotMatch(validated, /REPORT verdict-pair-approves .* read APPROVE/, validated);
  });
});

test("a verdict sibling that states no phase is reported rather than silently left out of the group", () => {
  /* MEMBER THREE, one layer in from the other two: this document READS and
     DECODES and declares `kind: verdict`, so it is a review of something, and
     `phase` is half the join key. It used to fall out through the same `||`
     as a verdict of a DIFFERENT phase, which is a determinate answer and a
     correct skip. The two arms are now separate.

     THE GATE RUNNER IS NOT THE ONLY READER, and that is why the CLI arm below
     exists as its own test: this runner happens to run the checks over EVERY
     loaded document, so the phase-less one reddens on its own instance too. A
     reader could mistake that for the guard working. */
  withThirdDocument(
    REFUSING_THIRD.split("\n")
      .filter((line) => !line.startsWith("phase: "))
      .join("\n"),
    (_dir, run) => {
      assert.notEqual(run.status, 0, run.output);
      assert.match(
        run.output,
        /third-refusing\.yaml declares no phase, so it cannot be placed in or out of the group/,
        run.output,
      );
    },
  );
});

test("the phase-less sibling is reported through `tiphys validate` too, where only one instance is checked", () => {
  /* THE ISOLATING PATH. `tiphys validate --type verdict <one document>
     --context <dir>` runs the derived checks over ONE instance, so a dropped
     sibling gets no run of its own and the drop is invisible unless the
     grouping reports it. Measured at the reviewed head on this exact staging:
     both checks printed their affirmative REPORT lines over the remaining
     two. */
  withThirdDocument(
    REFUSING_THIRD.split("\n")
      .filter((line) => !line.startsWith("phase: "))
      .join("\n"),
    (dir) => {
      const output = runValidateOne(dir, "decorrelated-criteria.yaml");
      for (const check of ["dual-review-decorrelation", "verdict-pair-approves"]) {
        assert.match(
          output,
          new RegExp(
            `INVALID #/phase .*third-refusing\\.yaml declares no phase.*\\(check: ${check}\\)`,
          ),
          output,
        );
      }
      assert.doesNotMatch(output, /REPORT verdict-pair-approves .* read APPROVE/, output);
    },
  );
});

test("the precondition reports a directory whose only review document is unexaminable as APPLICABLE", () => {
  /* THE WORST ARM OF THE SAME CLASS, AND IT IS NOT REACHABLE THROUGH THE GATE
     ARM ABOVE. `--precondition` decides whether the gate RUNS. With the only
     candidate dropped it counted zero and exited 1, and the gate then reported
     NOT-APPLICABLE: merge evidence that could not be read was announced as
     "there is no pair of reviews to compare". A not-applicable reached by not
     looking is the vacuous pass M2-C-3 exists against. */
  withContext("full", {}, (dir) => {
    writeFileSync(
      join(dir, "delivery", "review", "only-review.yaml"),
      `${REFUSING_THIRD}\n  this line: is: not: yaml: [\n`,
    );
    const precondition = spawnSync(process.execPath, [scriptPath, "--precondition", dir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const preconditionOutput = `${precondition.stdout ?? ""}${precondition.stderr ?? ""}`;
    assert.equal(precondition.status, 0, preconditionOutput);
    assert.match(
      preconditionOutput,
      /1 candidate\(s\) that could not be examined/,
      preconditionOutput,
    );

    const run = runGate(dir);
    assert.equal(run.status, 21, run.output);
    assert.match(run.output, /check-dual-review: error/, run.output);
    assert.doesNotMatch(run.output, /not-applicable/, run.output);
  });
});

test("an empty review directory is still NOT-APPLICABLE, which is the control the four arms above need", () => {
  /* Without this every arm above would also pass a gate that errored on any
     directory at all, and "could not look" would stop being distinguishable
     from "nothing to look at", which is the distinction the whole section is
     about. */
  withContext("full", {}, (dir) => {
    const precondition = spawnSync(process.execPath, [scriptPath, "--precondition", dir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(precondition.status, 1, `${precondition.stdout ?? ""}`);
    const run = runGate(dir);
    assert.equal(run.status, 20, run.output);
    assert.match(run.output, /check-dual-review: not-applicable/, run.output);
  });
});

test("a prose review and a non-verdict document in the same directory are still skipped silently", () => {
  /* THE OTHER CONTROL, and it is the one that stops this round from having
     swapped one fail-open for a gate nobody can keep green. `delivery/review/`
     in this repository is mostly markdown, and a `.yaml` that decodes and says
     it is something else has ANSWERED. Neither is a candidate that could not
     be looked at, so neither may redden. */
  withContext("full", SAME_HEAD_PAIR, (dir) => {
    writeFileSync(
      join(dir, "delivery", "review", "clean-room-m4-p10.md"),
      "# a prose review\n\nthis is not: valid: yaml: [\n",
    );
    writeFileSync(
      join(dir, "delivery", "review", "notes.yaml"),
      "kind: note\nphase: M3-P9\nbody: not a verdict\n",
    );
    const run = runGate(dir);
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /check-dual-review: green \(2 review verdicts examined/, run.output);
  });
});

/* ------------------------------------------------------------------ */
/* The shipped corpus                                                   */
/* ------------------------------------------------------------------ */

test("every shipped dual-review fixture carries a forty-hex head, so the corpus is migrated rather than exempted", () => {
  const names = readdirSync(fixturesDir).filter((name) => name.endsWith(".yaml"));
  assert.ok(names.length >= 5, `only ${String(names.length)} fixtures were found`);
  for (const name of names) {
    const instance = parsed(readFileSync(join(fixturesDir, name), "utf8"));
    assert.match(
      String(instance["head"]),
      /^[0-9a-f]{40}$/,
      `${name} does not carry a forty-hex head`,
    );
  }
});

test("this phase's behaviors are registered in test/behaviors.json and resolve by name", () => {
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "verdict-head-required",
    "verdict-head-is-a-full-sha",
    "verdict-head-joins-the-pair",
    "verdict-head-unreadable-sibling-refused",
    "verdict-approve-with-medium-finding-rejected",
    "verdict-pair-must-approve",
    "verdict-pair-blocking-finding-refused",
    "verdict-pair-approves-registered",
    "verdict-pair-verdict-vocabulary-exact",
    "verdict-pair-severity-vocabulary-closed",
    "verdict-pair-low-finding-mergeable",
    "dual-review-prints-verdict-values",
    "dual-review-undecodable-sibling-refused",
    "dual-review-unreadable-sibling-refused",
    "dual-review-phaseless-sibling-refused",
    "dual-review-unexaminable-candidate-is-applicable",
    "dual-review-non-verdict-document-still-skipped",
  ]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(behaviors, id),
      `behavior ${id} is not registered`,
    );
  }
});

test.after(() => {
  if (stagedPreHeadTree !== undefined && stagedPreHeadTree !== "" && existsSync(stagedPreHeadTree)) {
    rmSync(stagedPreHeadTree, { recursive: true, force: true });
  }
});
