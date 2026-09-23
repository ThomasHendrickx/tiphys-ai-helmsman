/**
 * KERNEL 0.2.1: OLD HISTORY VALIDATES AGAIN, AND CURRENT WORK IS STILL JUDGED
 * AS STRICTLY (DR-0053, DR-0054).
 *
 * The owner's rule is "Tiphys judges current and future work, never history".
 * The mechanism this file guards against is an ADMISSION rule for current work
 * written where it also judges history: the verdict schema required `head` and
 * refused APPROVE beside a medium finding, and the review-families falsifiers
 * read every verdict ever committed. Each of those rejected documents a
 * consumer wrote before the rule existed.
 *
 * Every test here has two halves, because the fix is a MOVE and not a
 * deletion: history must be well formed and must not contradict a later
 * declaration, AND the merge gates must still refuse to count a head-less
 * verdict and must still redden on a second family committed after the
 * declaration.
 *
 * THE SUBJECTS ARE REAL. `test/fixtures/pulse-0.1.0-verdicts/` holds seven of
 * the 49 verdict documents committed in the pulse project at d4e491b, copied
 * byte for byte and chosen to be ASCII: three APPROVE-beside-medium documents,
 * two APPROVE documents with only low findings, one FIX-ROUND-NEEDED document,
 * and one `kind: finding` document that was already invalid under v0.1.0 and
 * is kept here as the control that must stay invalid.
 *
 * WHERE THE BEHAVIOUR CONSUMES git's OUTPUT, the assertion is made against a
 * real capture (witness/captures/kernel-0-2-1-history-git.json): the tests
 * stage the repository, re-run the command the kernel runs, and compare the
 * live output with the recorded output before trusting the gate's verdict.
 *
 * `src` and `scripts` are reached through spawned processes or computed-URL
 * imports (CLAUDE.md standing warning 4).
 */

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
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
const dualFixtures = join(repoRoot, "witness", "fixtures", "dual-review");
const pulseDir = join(repoRoot, "test", "fixtures", "pulse-0.1.0-verdicts");
const GIT_CAPTURE = join(repoRoot, "witness", "captures", "kernel-0-2-1-history-git.json");

const yamlModule = (await import("yaml")) as unknown as { parse: (text: string) => unknown };

const scriptModule = (await import(new URL("../scripts/check-dual-review.mjs", import.meta.url).href)) as {
  SINGLE_FAMILY_PRECONDITION: string;
};

/** The six pulse documents that ARE verdicts and must now be well formed. */
const PULSE_VERDICTS = [
  "m1-p1-criteria.yaml",
  "m1-p1-hazard.yaml",
  "m3-p14-criteria-round2.yaml",
  "m3-p18-criteria-round2.yaml",
  "m3-p18-hazard-round2.yaml",
  "m3-p3-criteria-round4.yaml",
];
/** Rejected by 0.2.0 ONLY for APPROVE beside a medium finding (and for head). */
const PULSE_APPROVE_WITH_MEDIUM = ["m1-p1-criteria.yaml", "m3-p18-criteria-round2.yaml", "m3-p3-criteria-round4.yaml"];
/** Invalid under v0.1.0 too: a findings list, not a verdict. Not forced green. */
const PULSE_NOT_A_VERDICT = "m3-p3-hazard-round4.yaml";

const scratchDirs: string[] = [];
test.after(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

/** Identity per command, never written to any config (standing warning 5). */
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function git(dir: string, args: string[]): string {
  const run = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...GIT_IDENTITY } });
  assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
  return run.stdout ?? "";
}

function commit(dir: string, message: string): string {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]).trim();
}

/** Run `tiphys validate --type verdict` on one file and return its INVALID lines. */
function invalidLines(file: string): string[] {
  const run = spawnSync(process.execPath, [cliEntry, "validate", "--type", "verdict", file], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  /* A crash is not a clean result: the command must have reached the
     per-document report, which prints one line per check it considered. */
  assert.ok(output.trim() !== "", `validate printed nothing for ${file} (exit ${String(run.status)})`);
  return output.split("\n").filter((line) => line.startsWith("INVALID"));
}

/* ------------------------------------------------------------------ */
/* The captured git output                                             */
/* ------------------------------------------------------------------ */

interface CapturedCommand {
  name: string;
  argv: string[];
  exit: number;
  stdout: string;
}

function capturedCommand(name: string): CapturedCommand {
  const recorded = JSON.parse(readFileSync(GIT_CAPTURE, "utf8")) as { commands: CapturedCommand[] };
  const found = recorded.commands.find((entry) => entry.name === name);
  assert.ok(found !== undefined, `the capture has no command named ${name}`);
  return found;
}

/**
 * Re-run a captured command in a staged repository and require git's LIVE
 * output to equal the recorded output. Commit shas differ per staging (they
 * carry the time), so the capture spells each commit by the name the staging
 * gave it, `<name>`, and the live output is translated the same way before the
 * comparison. Nothing else is rewritten; an unknown sha stays a sha and fails.
 */
function assertGitMatchesCapture(dir: string, name: string, names: Record<string, string>): void {
  const command = capturedCommand(name);
  const argv = command.argv.slice(1).map((arg) =>
    arg.replace(/<([a-z-]+)>/g, (whole, key: string) => names[key] ?? whole),
  );
  const live = spawnSync("git", argv, { cwd: dir, encoding: "utf8" });
  assert.equal(live.status, command.exit, live.stderr);
  let translated = live.stdout ?? "";
  for (const [key, sha] of Object.entries(names)) {
    translated = translated.split(sha).join(`<${key}>`);
  }
  assert.equal(translated, command.stdout, `git ${argv.join(" ")} no longer prints what was captured`);
}

/* ------------------------------------------------------------------ */
/* Criterion 4: the real 0.1.0-era documents are well formed again     */
/* ------------------------------------------------------------------ */

test("every representative 0.1.0-era pulse verdict validates with no INVALID line against the shipped schema", () => {
  const present = readdirSync(pulseDir).sort();
  assert.deepEqual(present, [...PULSE_VERDICTS, PULSE_NOT_A_VERDICT].sort(), "the fixture set changed");
  for (const file of present) {
    const bytes = readFileSync(join(pulseDir, file));
    const stray = bytes.findIndex((byte) => !(byte === 0x09 || byte === 0x0a || (byte >= 0x20 && byte <= 0x7e)));
    assert.equal(stray, -1, `${file} carries a byte outside printable ASCII at offset ${String(stray)}`);
  }
  for (const file of PULSE_VERDICTS) {
    const record = yamlModule.parse(readFileSync(join(pulseDir, file), "utf8")) as Record<string, unknown>;
    /* THE SUBJECT IS THE DANGEROUS ONE: every document here predates the
       field, so a schema that requires it rejects all of them. */
    assert.equal("head" in record, false, `${file} carries a head, so it does not exercise the change`);
    assert.equal(record["kind"], "verdict", file);
    assert.deepEqual(invalidLines(join(pulseDir, file)), [], `${file} is not well formed`);
  }
  for (const file of PULSE_APPROVE_WITH_MEDIUM) {
    const record = yamlModule.parse(readFileSync(join(pulseDir, file), "utf8")) as {
      verdict: string;
      findings: { severity: string }[];
    };
    const severities = record.findings.map((finding) => finding.severity);
    assert.equal(record.verdict, "APPROVE", file);
    assert.ok(severities.includes("medium"), `${file} has no medium finding: ${severities.join(", ")}`);
    assert.ok(!severities.includes("high") && !severities.includes("critical"), `${file}: ${severities.join(", ")}`);
  }
});

test("a 0.1.0-era document that is not a verdict stays invalid, for the reasons it was invalid under 0.1.0", () => {
  const lines = invalidLines(join(pulseDir, PULSE_NOT_A_VERDICT));
  for (const expected of [
    'INVALID #/kind value "finding" does not equal the required constant "verdict"',
    "INVALID #/phase required property phase is missing",
    "INVALID #/framing required property framing is missing",
    "INVALID #/findings/0/concrete-edit property concrete-edit is not permitted here",
  ]) {
    assert.ok(lines.includes(expected), `missing ${expected} in:\n${lines.join("\n")}`);
  }
  assert.ok(!lines.some((line) => line.startsWith("INVALID #/head")), lines.join("\n"));
});

/* ------------------------------------------------------------------ */
/* Criterion 1: a head-less verdict is never admitted toward a merge   */
/* ------------------------------------------------------------------ */

interface ReviewedRepo {
  dir: string;
  base: string;
  reviewed: string;
  head: string;
}

/**
 * A dual-tier change (one `src/` file) whose reviews are the given documents.
 * `stripHead` removes the `head:` line from a document that has one; any
 * document still carrying a head is pointed at the reviewed commit, so the
 * control arm is an ordinary current review.
 */
function stageReviewedChange(
  verdicts: { from: string; as: string; stripHead?: boolean }[],
): ReviewedRepo {
  const dir = scratch("tiphys-history-compat-gate-");
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  assert.match(charter, /^delivery-mode: full$/m, "the shipped template no longer declares mode full");
  writeFileSync(join(dir, "charter.yaml"), charter);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "feature.ts"), "export const feature = 1;\n");
  git(dir, ["init", "-q", "."]);
  const base = commit(dir, "base");
  writeFileSync(join(dir, "src", "feature.ts"), "export const feature = 2;\n");
  const reviewed = commit(dir, "the change under review");
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  for (const entry of verdicts) {
    let body = readFileSync(entry.from, "utf8");
    if (entry.stripHead === true) {
      const stripped = body.replace(/^head: .*\n/m, "");
      assert.notEqual(stripped, body, `${entry.from} has no single-line head to remove`);
      body = stripped;
    } else {
      body = body.replace(/^head: .*$/m, `head: ${reviewed}`);
    }
    writeFileSync(join(dir, "delivery", "review", entry.as), body);
  }
  const head = commit(dir, "the reviews");
  /* The gate code is linked, not committed, so the budget is decided by the
     one `src/` file the change touched. */
  writeFileSync(join(dir, ".git", "info", "exclude"), "/scripts/\n/src/gates/\n/gate-registry.yaml\n/evidence/\n");
  mkdirSync(join(dir, "scripts"), { recursive: true });
  symlinkSync(scriptPath, join(dir, "scripts", "check-dual-review.mjs"));
  mkdirSync(join(dir, "src", "gates"), { recursive: true });
  symlinkSync(join(repoRoot, "src", "gates", "merge-preconditions.ts"), join(dir, "src", "gates", "merge-preconditions.ts"));
  copyFileSync(join(repoRoot, "gate-registry.yaml"), join(dir, "gate-registry.yaml"));
  return { dir, base, reviewed, head };
}

interface RunnerOutcome {
  exit: number;
  output: string;
  record: { status: string; units: number; detail?: string };
  /** What the gate itself printed, which the runner keeps as stdout.txt. */
  gateStdout: string;
}

/** One registry gate through the real runner, full mode, as CI runs it. */
function runGate(repo: ReviewedRepo, gate: string): RunnerOutcome {
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
  const gateStdout = readFileSync(join(evidence, gate, "stdout.txt"), "utf8");
  return { exit: run.status ?? -1, output, record, gateStdout };
}

/** THE DANGEROUS STATE: an approving, fully decorrelated pair that says nothing about which commit it read. */
const HEADLESS_APPROVING_PAIR = [
  { from: join(dualFixtures, "decorrelated-criteria.yaml"), as: "m3-p9-criteria.yaml", stripHead: true },
  { from: join(dualFixtures, "decorrelated-hazard.yaml"), as: "m3-p9-hazard.yaml", stripHead: true },
];
/** The same pair as current reviews of the staged change: the control. */
const ANCHORED_APPROVING_PAIR = HEADLESS_APPROVING_PAIR.map((entry) => ({ from: entry.from, as: entry.as }));
/** Two real 0.1.0-era reviews of one phase, neither carrying a head. */
const PULSE_PAIR = [
  { from: join(pulseDir, "m1-p1-criteria.yaml"), as: "m1-p1-criteria.yaml" },
  { from: join(pulseDir, "m1-p1-hazard.yaml"), as: "m1-p1-hazard.yaml" },
];

test("a dual-tier change whose only reviews declare no head is red at check-dual-review, and each is excluded by name", () => {
  /* THE CONTROL FIRST: with a head naming the reviewed commit, this exact pair
     is green. So the head-less arm below is the state that WOULD be green if a
     head-less verdict were admitted, and red there is the exclusion working. */
  const control = stageReviewedChange(ANCHORED_APPROVING_PAIR);
  const green = runGate(control, "check-dual-review");
  assert.equal(green.record.status, "green", green.output);

  for (const [name, verdicts] of [
    ["decorrelated approving pair, head removed", HEADLESS_APPROVING_PAIR],
    ["real 0.1.0-era pulse pair", PULSE_PAIR],
  ] as const) {
    const repo = stageReviewedChange([...verdicts]);
    /* THE BUDGET CONSUMES git's NAME LIST, compared with the capture first. */
    assertGitMatchesCapture(repo.dir, name === "real 0.1.0-era pulse pair" ? "budget-name-list-pulse" : "budget-name-list", {
      base: repo.base,
      head: repo.head,
    });
    const run = runGate(repo, "check-dual-review");
    const detail = run.record.detail ?? "";
    assert.equal(run.record.status, "red", `${name}: ${run.output}`);
    assert.notEqual(run.exit, 0, `${name}: ${run.output}`);
    assert.match(detail, /0 of 2 are admitted and 2 missing/, `${name}: ${detail}`);
    for (const entry of verdicts) {
      assert.ok(
        detail.includes(`delivery/review/${entry.as} declares no head`),
        `${name}: ${entry.as} is not excluded by name as head-less:\n${detail}`,
      );
    }
    assert.match(detail, /never admitted toward a merge/, `${name}: ${detail}`);
  }
});

test("merge-preconditions excludes a verdict that declares no head by name and never counts it toward the two reviews", () => {
  /* The control: anchored, the pair clears the review conditions and reaches
     the network condition this fixture has no repository for. */
  const control = stageReviewedChange(ANCHORED_APPROVING_PAIR);
  const reached = runGate(control, "merge-preconditions");
  assert.equal(reached.record.status, "error", reached.output);
  assert.match(reached.record.detail ?? "", /no repository could be established/);

  const repo = stageReviewedChange(HEADLESS_APPROVING_PAIR);
  const run = runGate(repo, "merge-preconditions");
  const detail = run.record.detail ?? "";
  assert.equal(run.record.status, "red", run.output);
  assert.notEqual(run.exit, 0, run.output);
  assert.match(detail, /0 of 2 are admitted and 2 missing/, detail);
  /* THE EXCLUSION IS NAMED IN THE VERDICT-SELECTION ROW the gate prints,
     which says what every other row is about. */
  const selection = run.gateStdout.split("\n").filter((line) => line.includes("verdict-selection"));
  assert.equal(selection.length, 1, run.gateStdout);
  const row = selection[0] as string;
  assert.match(row, /0 verdict\(s\) admitted and 2 excluded/, row);
  for (const entry of HEADLESS_APPROVING_PAIR) {
    assert.ok(row.includes(`delivery/review/${entry.as} declares no head`), `${entry.as}:\n${row}`);
  }
  /* The 0.2.0 sentence named the wrong fact for a missing head. */
  assert.doesNotMatch(row, /declares head , which/, row);
});

/* ------------------------------------------------------------------ */
/* Criterion 3: the review-families falsifiers read from the declaration */
/* ------------------------------------------------------------------ */

/** Three real 0.1.0-era verdicts carrying three different produced-by values. */
const HISTORY = ["m1-p1-criteria.yaml", "m3-p14-criteria-round2.yaml", "m3-p18-hazard-round2.yaml"];

interface DeclaredRepo {
  dir: string;
  names: Record<string, string>;
}

/**
 * The shape of a consumer adopting the declaration late:
 *
 *   project -> history (0.1.0-era reviews, several families)
 *           -> unrelated (touches neither charter nor delivery/)
 *           -> declare (charter gains review-families: family-a)
 *           -> reviewed (the commit the current pair names)
 *           -> current (the current pair, both family-a, plus the options)
 *
 * `unrelated` sits between the history and the declaration ON PURPOSE: the
 * charter's log is path-limited, and if git reported REWRITTEN parents there,
 * the declaration's parent would read as `project`, the history would not be
 * in the "before" tree, and this arm would be red. The capture pins that git
 * reports the real parent.
 */
function stageDeclared(options: { secondFamilyAfter?: boolean; editHistoryAfter?: boolean } = {}): DeclaredRepo {
  const dir = scratch("tiphys-history-compat-families-");
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  assert.match(charter, /^delivery-mode: full$/m, "the shipped template no longer declares mode full");
  assert.doesNotMatch(charter, /^review-families:/m, "the shipped template already declares review-families");
  writeFileSync(join(dir, "charter.yaml"), charter);
  git(dir, ["init", "-q", "."]);
  const names: Record<string, string> = {};
  names["project"] = commit(dir, "project");
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  for (const file of HISTORY) {
    copyFileSync(join(pulseDir, file), join(dir, "delivery", "review", file));
  }
  names["history"] = commit(dir, "0.1.0-era reviews");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "feature.ts"), "export const feature = 1;\n");
  names["unrelated"] = commit(dir, "unrelated work");
  writeFileSync(
    join(dir, "charter.yaml"),
    `${charter}review-families:\n  available:\n    - "family-a"\n  reason: "Only one model family can be dispatched in this environment."\n`,
  );
  names["declare"] = commit(dir, "declare review-families");
  names["reviewed"] = commit(dir, "reviewed");
  for (const [fixture, as] of [
    ["decorrelated-criteria.yaml", "m3-p9-criteria.yaml"],
    ["shared-family-hazard.yaml", "m3-p9-hazard.yaml"],
  ] as const) {
    const body = readFileSync(join(dualFixtures, fixture), "utf8").replace(/^head: .*$/m, `head: ${names["reviewed"] as string}`);
    writeFileSync(join(dir, "delivery", "review", as), body);
  }
  if (options.secondFamilyAfter === true) {
    mkdirSync(join(dir, "delivery", "evidence", "past"), { recursive: true });
    const body = readFileSync(join(dualFixtures, "decorrelated-hazard.yaml"), "utf8").replace(/^phase: .*$/m, "phase: M2-P1");
    writeFileSync(join(dir, "delivery", "evidence", "past", "m2-p1-hazard.yaml"), body);
  }
  if (options.editHistoryAfter === true) {
    appendFileSync(join(dir, "delivery", "review", "m3-p18-hazard-round2.yaml"), "# edited after the declaration\n");
  }
  names["current"] = commit(dir, "current reviews");
  return { dir, names };
}

interface ScriptRun {
  exit: number;
  stdout: string;
  record: { status: string; units: number; precondition?: { id: string; met: boolean } };
}

/** The shipped script, auditing the commit the current pair reviewed. */
function runScript(repo: DeclaredRepo): ScriptRun {
  const recordPath = join(repo.dir, "result.json");
  const run = spawnSync(
    process.execPath,
    [scriptPath, repo.dir, "--head", repo.names["reviewed"] as string, "--result", recordPath, "--evidence", join(repo.dir, "evidence")],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return {
    exit: run.status ?? -1,
    stdout: `${run.stdout ?? ""}${run.stderr ?? ""}`,
    record: JSON.parse(readFileSync(recordPath, "utf8")) as ScriptRun["record"],
  };
}

test("committed history naming several families before review-families was declared does not contradict the declaration", () => {
  const repo = stageDeclared();
  /* The history really does carry three families: this is pulse's state, and
     it is what made a late declaration red under 0.2.0. */
  const families = new Set(
    HISTORY.map((file) => (yamlModule.parse(readFileSync(join(pulseDir, file), "utf8")) as Record<string, unknown>)["produced-by"]),
  );
  assert.equal(families.size, 3, [...families].join(", "));
  /* THE DECLARATION IS DATED FROM git's PATH-LIMITED LOG, compared first. */
  assertGitMatchesCapture(repo.dir, "charter-history", repo.names);

  const run = runScript(repo);
  assert.equal(run.record.status, "not-applicable", run.stdout);
  assert.equal(run.exit, 20, run.stdout);
  assert.equal(run.record.precondition?.id, scriptModule.SINGLE_FAMILY_PRECONDITION, run.stdout);
  assert.ok(
    run.stdout.includes(
      `the 2 verdict document(s) committed at or after ${repo.names["declare"] as string}, the commit that first declared review-families; 3 committed before it are history and were not read`,
    ),
    run.stdout,
  );
  assert.doesNotMatch(run.stdout, /is contradicted by this project's own record/);
});

test("a second family committed after review-families was declared still contradicts it", () => {
  const repo = stageDeclared({ secondFamilyAfter: true });
  assertGitMatchesCapture(repo.dir, "charter-history", repo.names);
  const run = runScript(repo);
  assert.equal(run.record.status, "red", run.stdout);
  assert.equal(run.exit, 1, run.stdout);
  assert.ok(run.stdout.includes("carry 2 distinct produced-by value(s) (family-a, family-b)"), run.stdout);
  assert.ok(run.stdout.includes("3 committed before it are history and were not read"), run.stdout);
});

test("a history verdict edited after review-families was declared is current work and is read again", () => {
  /* HISTORY IS DECIDED BY CONTENT, NOT BY PATH: the edited document is new
     bytes, so its family (claude-fable) is compared and contradicts the
     declaration. A scope keyed on the path would have left it unread. */
  const repo = stageDeclared({ editHistoryAfter: true });
  const run = runScript(repo);
  assert.equal(run.record.status, "red", run.stdout);
  assert.equal(run.exit, 1, run.stdout);
  assert.ok(run.stdout.includes("delivery/review/m3-p18-hazard-round2.yaml carries produced-by claude-fable"), run.stdout);
  assert.ok(run.stdout.includes("2 committed before it are history and were not read"), run.stdout);
});
