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
  HEADLESS_ONLY_WARNING: string;
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
 * control arm is an ordinary current review. `stamp` rewrites the document's
 * `tiphys-version` line to the given value, or removes it when null.
 */
function stageReviewedChange(
  verdicts: {
    from: string;
    as: string;
    stripHead?: boolean;
    stamp?: string | null;
    /** Rewrite the document's single `phase:` line to this value. */
    phase?: string;
    /** Keep the file byte for byte: no head is added or rewritten. */
    verbatim?: boolean;
    /** Give a head-less document a PRESENT but abbreviated head of the reviewed commit. */
    abbreviatedHead?: boolean;
  }[],
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
    if (entry.phase !== undefined) {
      const rephased = body.replace(/^phase: .*$/m, `phase: ${entry.phase}`);
      assert.notEqual(rephased, body, `${entry.from} has no single-line phase to rewrite`);
      body = rephased;
    }
    if (entry.verbatim === true) {
      writeFileSync(join(dir, "delivery", "review", entry.as), body);
      continue;
    }
    if (entry.abbreviatedHead === true) {
      assert.doesNotMatch(body, /^head:/m, `${entry.from} already carries a head`);
      /* QUOTED, because the reviewed sha changes with every staging and an
         abbreviation that YAML reads as a number (all decimal digits, about
         1 run in 27, or a form such as 12e4567) is not a string at all. That is refused too, with a different
         message ("declares head as a number"), so unquoted the assertion on
         the pattern message below was flaky; measured once in the full suite. */
      body = body.replace(/^(phase: .*)$/m, `$1\nhead: "${reviewed.slice(0, 7)}"`);
      writeFileSync(join(dir, "delivery", "review", entry.as), body);
      continue;
    }
    if (entry.stripHead === true) {
      const stripped = body.replace(/^head: .*\n/m, "");
      assert.notEqual(stripped, body, `${entry.from} has no single-line head to remove`);
      body = stripped;
    } else {
      body = body.replace(/^head: .*$/m, `head: ${reviewed}`);
    }
    if (entry.stamp !== undefined) {
      const restamped =
        entry.stamp === null
          ? body.replace(/^tiphys-version: .*\n/m, "")
          : body.replace(/^tiphys-version: .*$/m, `tiphys-version: ${entry.stamp}`);
      assert.match(body, /^tiphys-version: .*$/m, `${entry.from} has no single-line tiphys-version to rewrite`);
      body = restamped;
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

test("the bare check-dual-review script without --base, on a corpus whose every verdict declares no head, is not-applicable with a warning that names --base, and the same corpus with one anchored verdict carries no warning", () => {
  /* The criteria review, CR-006. Without --base the script computes no review
     budget, so a corpus of history only is not-applicable, where 0.2.0 was
     red. The gate runner passes --base and is red (the test above); a consumer
     wiring the script by hand is told so rather than left to read a quiet
     not-applicable. */
  const bare = (repo: ReviewedRepo): { status: string; detail: string; stdout: string } => {
    const recordPath = join(repo.dir, "bare-result.json");
    const run = spawnSync(
      process.execPath,
      [scriptPath, repo.dir, "--head", repo.reviewed, "--result", recordPath, "--evidence", join(repo.dir, "bare-evidence")],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as { status: string; detail?: string };
    return { status: record.status, detail: record.detail ?? "", stdout: `${run.stdout ?? ""}${run.stderr ?? ""}` };
  };
  const history = stageReviewedChange([...PULSE_PAIR]);
  assertGitMatchesCapture(history.dir, "budget-name-list-pulse", { base: history.base, head: history.head });
  const run = bare(history);
  assert.equal(run.status, "not-applicable", run.stdout);
  assert.ok(run.detail.includes(scriptModule.HEADLESS_ONLY_WARNING), `no warning:\n${run.detail}`);
  assert.match(run.detail, /pass --base \(the gate runner does\)/, run.detail);
  for (const entry of PULSE_PAIR) {
    assert.ok(run.detail.includes(`delivery/review/${entry.as} declares no head`), run.detail);
  }

  /* THE CONTROL: one anchored verdict beside one head-less one. The exclusion
     is still named, and the warning is absent because not every verdict is
     history. */
  const mixed = stageReviewedChange([
    { from: join(dualFixtures, "decorrelated-criteria.yaml"), as: "m3-p9-criteria.yaml" },
    { from: join(dualFixtures, "decorrelated-hazard.yaml"), as: "m3-p9-hazard.yaml", stripHead: true },
  ]);
  assertGitMatchesCapture(mixed.dir, "budget-name-list", { base: mixed.base, head: mixed.head });
  const control = bare(mixed);
  /* Measured: the anchored verdict alone reaches the derived checks, which
     refuse a group of one, so the control is red, not not-applicable. */
  assert.equal(control.status, "red", `${control.detail}\n${control.stdout}`);
  assert.ok(control.stdout.includes("m3-p9-hazard.yaml declares no head"), control.stdout);
  assert.ok(!control.detail.includes("WARNING every committed verdict declares no head"), control.detail);
  assert.ok(!control.stdout.includes("WARNING every committed verdict declares no head"), control.stdout);
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

/* ------------------------------------------------------------------ */
/* DR-0055: the stamp gates SHAPE by version and never relaxes ADMISSION */
/* ------------------------------------------------------------------ */

const KERNEL_VERSION = (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version;

/** The shipped fixture with its head abbreviated and its stamp set (or removed, for null). */
function abbreviatedHeadDocument(stamp: string | null): string {
  const dir = scratch("tiphys-history-compat-stamp-");
  let body = readFileSync(join(dualFixtures, "decorrelated-criteria.yaml"), "utf8");
  const abbreviated = body.replace(/^head: ([0-9a-f]{7})[0-9a-f]{33}$/m, "head: $1");
  assert.notEqual(abbreviated, body, "the fixture has no forty-hex head to abbreviate");
  body = abbreviated;
  const restamped =
    stamp === null
      ? body.replace(/^tiphys-version: .*\n/m, "")
      : body.replace(/^tiphys-version: .*$/m, `tiphys-version: ${stamp}`);
  assert.match(body, /^tiphys-version: .*$/m, "the fixture has no tiphys-version line");
  const path = join(dir, "verdict.yaml");
  writeFileSync(path, restamped);
  return path;
}

function validateOutput(file: string): string[] {
  const run = spawnSync(process.execPath, [cliEntry, "validate", "--type", "verdict", file], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return `${run.stdout ?? ""}${run.stderr ?? ""}`.split("\n").filter((line) => line !== "");
}

test("a rule applies from the version that introduced it: an abbreviated head is history when unstamped or stamped 0.1.0, and INVALID when stamped 0.2.0", () => {
  /* THE ONE RULE IN RULES_SINCE THAT A SHAPE CHECK CAN SHOW: M4-P10's
     forty-hex head, since 0.2.0. The same bytes, three stamps. */
  for (const stamp of [null, "0.1.0"]) {
    const lines = validateOutput(abbreviatedHeadDocument(stamp));
    assert.ok(!lines.some((line) => line.startsWith("INVALID")), `${String(stamp)}:\n${lines.join("\n")}`);
    assert.ok(
      lines.some((line) => line.startsWith("HISTORY verdict-head-full-sha applies from tiphys-version 0.2.0")),
      `${String(stamp)}: the rule not applied is not named:\n${lines.join("\n")}`,
    );
  }
  for (const stamp of ["0.2.0", KERNEL_VERSION]) {
    const lines = validateOutput(abbreviatedHeadDocument(stamp));
    assert.ok(
      lines.some((line) => line.startsWith("INVALID #/head") && line.includes("does not match")),
      `${stamp}: the 0.2.0 rule did not apply:\n${lines.join("\n")}`,
    );
    assert.ok(!lines.some((line) => line.startsWith("HISTORY verdict-head-full-sha")), lines.join("\n"));
  }
  /* A stamp that is not a version is refused by the schema, so it cannot be
     used to be read as history. */
  const malformed = validateOutput(abbreviatedHeadDocument("0.2"));
  assert.ok(malformed.some((line) => line.startsWith("INVALID #/tiphys-version")), malformed.join("\n"));
});

test("a rule not in force for a document's stamp is removed alone: every other rule at the same place still applies to history", () => {
  /* THE MECHANISM, not one instance of it. RULES_SINCE names the 0.2.0 head
     rule by its keyword (`pattern`), and only that keyword is lifted for an
     unstamped document. A head that is not a string at all breaks the `type`
     rule at the SAME place, and history must still be refused for it. A gate
     keyed on the instance location `#/head` would read both as the one rule
     and pass this document. */
  const dir = scratch("tiphys-history-compat-keyword-");
  const body = readFileSync(join(dualFixtures, "decorrelated-criteria.yaml"), "utf8")
    .replace(/^head: [0-9a-f]{40}$/m, "head: 12345")
    .replace(/^tiphys-version: .*\n/m, "");
  assert.match(body, /^head: 12345$/m, "the fixture has no forty-hex head to replace");
  assert.doesNotMatch(body, /^tiphys-version:/m, "the fixture is still stamped");
  const path = join(dir, "verdict.yaml");
  writeFileSync(path, body);
  const lines = validateOutput(path);
  assert.ok(
    lines.some((line) => line.startsWith("HISTORY verdict-head-full-sha applies from tiphys-version 0.2.0")),
    `the document is not read as history:\n${lines.join("\n")}`,
  );
  assert.ok(
    lines.some((line) => line.startsWith("INVALID #/head")),
    `the type rule at #/head was lifted with the pattern rule:\n${lines.join("\n")}`,
  );
});

/** Run `tiphys validate --type <type>` on one file: its exit and its printed lines. */
function validateRun(type: string, file: string): { status: number | null; lines: string[]; output: string } {
  const run = spawnSync(process.execPath, [cliEntry, "validate", "--type", type, file], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  return { status: run.status, lines: output.split("\n").filter((line) => line.trim() !== ""), output };
}

/** The shipped final-report template as an object, with `edit` applied, written as JSON. */
function finalReportVariant(edit: (report: Record<string, unknown>) => void): string {
  const template = yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "final-report.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
  edit(template);
  const path = join(scratch("tiphys-history-compat-final-report-"), "final-report.json");
  writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`);
  return path;
}

test("a final report written before delivered-outcome existed validates as history, and one stamped 0.2.0 or later still needs it", () => {
  /* M5-P2's `delivered-outcome` joined `required` before the 0.2.0 bump, so a
     report with no stamp is pre-stamp history and is not held to it. */
  const unstamped = validateRun(
    "final-report",
    finalReportVariant((report) => {
      delete report["tiphys-version"];
      delete report["delivered-outcome"];
    }),
  );
  assert.ok(!unstamped.lines.some((line) => line.startsWith("INVALID")), unstamped.output);
  assert.ok(
    unstamped.lines.some((line) =>
      line.startsWith("HISTORY final-report-delivered-outcome-required applies from tiphys-version 0.2.0"),
    ),
    `the rule not applied is not named:\n${unstamped.output}`,
  );
  assert.equal(unstamped.status, 0, unstamped.output);

  /* ONLY that entry of `required` is lifted: a rule that existed at 0.1.0,
     `decisions-owed` required, still holds for the same unstamped history. */
  const withoutOlderField = validateRun(
    "final-report",
    finalReportVariant((report) => {
      delete report["tiphys-version"];
      delete report["delivered-outcome"];
      delete report["decisions-owed"];
    }),
  );
  assert.ok(
    withoutOlderField.lines.some((line) => line.startsWith("INVALID") && line.includes("decisions-owed")),
    `a 0.1.0 rule was lifted with the 0.2.0 one:\n${withoutOlderField.output}`,
  );
  assert.equal(withoutOlderField.status, 1, withoutOlderField.output);

  /* NEW WORK: stamped at the rule's version or later, the answer is required. */
  for (const stamp of ["0.2.0", KERNEL_VERSION]) {
    const stamped = validateRun(
      "final-report",
      finalReportVariant((report) => {
        report["tiphys-version"] = stamp;
        delete report["delivered-outcome"];
      }),
    );
    assert.ok(
      stamped.lines.some((line) => line.startsWith("INVALID") && line.includes("delivered-outcome")),
      `${stamp}: the 0.2.0 rule did not apply:\n${stamped.output}`,
    );
    assert.equal(stamped.status, 1, stamped.output);
  }
});

test("the shipped final-report template is stamped with the running kernel version and validates", () => {
  const path = join(repoRoot, "templates", "final-report.example.yaml");
  const template = yamlModule.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  assert.equal(template["tiphys-version"], KERNEL_VERSION, "the template's stamp is not the package version");
  const run = validateRun("final-report", path);
  assert.ok(!run.lines.some((line) => line.startsWith("INVALID") || line.startsWith("HISTORY")), run.output);
});

test("a verdict whose only non-pass results are SKIPPED checks exits 0, and each skip is still printed by name", () => {
  /* The owner's report: pulse's history "returns false". A real pulse
     verdict, validated with no --context, is exit 0 and says which checks it
     did not run. */
  const run = validateRun("verdict", join(pulseDir, "m1-p1-hazard.yaml"));
  assert.ok(!run.lines.some((line) => line.startsWith("INVALID")), run.output);
  const skipped = run.lines.filter((line) => /^SKIPPED [a-z-]+ no context$/.test(line));
  assert.ok(skipped.length > 0, `no check was skipped, so this does not exercise a skip:\n${run.output}`);
  assert.equal(run.status, 0, run.output);
});

test("a verdict with a real INVALID line still exits 1 without a context, whether the schema or a derived check found it", () => {
  const dir = scratch("tiphys-history-compat-invalid-");
  const source = readFileSync(join(pulseDir, "m1-p1-hazard.yaml"), "utf8");

  /* A DERIVED CHECK that runs without a context
     (verdict-finding-references-resolve): a hazard class names a finding id
     no findings[] entry declares. The same run also carries SKIPPED lines,
     so a violation among skips is what is asserted. */
  const dangling = source.replace(/^    finding: CR-007$/m, "    finding: CR-999");
  assert.notEqual(dangling, source, "the fixture no longer names CR-007");
  const danglingPath = join(dir, "dangling.yaml");
  writeFileSync(danglingPath, dangling);
  const derived = validateRun("verdict", danglingPath);
  assert.ok(
    derived.lines.some((line) => line.startsWith("INVALID") && line.includes("(check: verdict-finding-references-resolve)")),
    derived.output,
  );
  assert.ok(derived.lines.some((line) => line.startsWith("SKIPPED ")), derived.output);
  assert.equal(derived.status, 1, derived.output);

  /* THE SCHEMA: a review-contract outside the closed vocabulary. */
  const broken = source.replace(/^review-contract: hazard$/m, "review-contract: improvised");
  assert.notEqual(broken, source, "the fixture no longer declares review-contract: hazard");
  const brokenPath = join(dir, "broken.yaml");
  writeFileSync(brokenPath, broken);
  const schema = validateRun("verdict", brokenPath);
  assert.ok(schema.lines.some((line) => line.startsWith("INVALID #/review-contract")), schema.output);
  assert.equal(schema.status, 1, schema.output);
});

test("a derived check gated out by a document's stamp is printed as NOT IN FORCE with the stamp named, for an unstamped and an old-stamped verdict, and never for a current one", () => {
  /* The 0.2.1 hazard review, CR-KH-001: a check the stamp gates out is not
     run, and the line saying so sits beside the checks' own lines, so a
     reader scanning SKIPPED lines sees it rather than an absence. */
  const dir = scratch("tiphys-history-compat-not-in-force-");
  const source = readFileSync(join(dualFixtures, "decorrelated-criteria.yaml"), "utf8");
  assert.match(source, /^tiphys-version: .*$/m, "the fixture has no tiphys-version line");
  const cases: { stamp: string | null; expected: string | null }[] = [
    { stamp: null, expected: "NOT IN FORCE verdict-pair-approves for no tiphys-version" },
    { stamp: "0.1.0", expected: "NOT IN FORCE verdict-pair-approves for tiphys-version 0.1.0" },
    { stamp: KERNEL_VERSION, expected: null },
  ];
  for (const { stamp, expected } of cases) {
    const body =
      stamp === null
        ? source.replace(/^tiphys-version: .*\n/m, "")
        : source.replace(/^tiphys-version: .*$/m, `tiphys-version: ${stamp}`);
    const path = join(dir, `verdict-${String(stamp)}.yaml`);
    writeFileSync(path, body);
    const run = validateRun("verdict", path);
    const notInForce = run.lines.filter((line) => line.startsWith("NOT IN FORCE"));
    if (expected === null) {
      assert.deepEqual(notInForce, [], `${String(stamp)}: a current document printed NOT IN FORCE:\n${run.output}`);
    } else {
      assert.deepEqual(notInForce, [expected], `${String(stamp)}:\n${run.output}`);
      assert.ok(
        run.lines.some((line) => line.startsWith("HISTORY verdict-pair-approves applies from tiphys-version 0.2.0")),
        `${String(stamp)}: the HISTORY line for the gated check is missing:\n${run.output}`,
      );
    }
    assert.ok(!run.lines.some((line) => line.startsWith("INVALID")), `${String(stamp)}:\n${run.output}`);
  }
});

test("a RULES_SINCE row whose since is not a kernel version is an internal defect that names the row, for an unstamped document as much as a stamped one", async () => {
  /* The 0.2.1 hazard review, CR-KH-002: RULES_SINCE is authored in this
     repository, so a malformed since is a defect to fail on loudly, never a
     reason to read every document as current or as history. */
  const stampModule = (await import(new URL("../src/stamp.ts", import.meta.url).href)) as {
    ruleApplies: (rule: Record<string, unknown>, stamp: Record<string, unknown>) => boolean;
    readStamp: (record: unknown) => Record<string, unknown>;
  };
  const rule = { id: "a-malformed-row", type: "verdict", since: "0.2", check: "verdict-pair-approves", statement: "x" };
  for (const record of [{}, { "tiphys-version": "0.1.0" }, { "tiphys-version": KERNEL_VERSION }, { "tiphys-version": "0.2" }]) {
    assert.throws(
      () => stampModule.ruleApplies(rule, stampModule.readStamp(record)),
      /^Error: internal defect: RULES_SINCE entry a-malformed-row has since "0\.2", which is not a kernel version/,
      JSON.stringify(record),
    );
  }
  /* The shipped table is well formed: every row applies to a current stamp. */
  const shipped = (await import(new URL("../src/stamp.ts", import.meta.url).href)) as {
    RULES_SINCE: Record<string, unknown>[];
  };
  for (const row of shipped.RULES_SINCE) {
    assert.equal(stampModule.ruleApplies(row, stampModule.readStamp({ "tiphys-version": KERNEL_VERSION })), true, String(row["id"]));
  }
});

/** The approving, anchored, decorrelated pair with each document's stamp replaced. */
function stampedPair(stamp: string | null, stripHead = false): { from: string; as: string; stamp: string | null; stripHead: boolean }[] {
  return ANCHORED_APPROVING_PAIR.map((entry) => ({ ...entry, stamp, stripHead }));
}

/*
 * ADMISSION DOES NOT READ THE STAMP (kernel 0.2.1, the orchestrator's ruling
 * after pulse was found running real work on 0.2.0). A 0.2.0 reviewer writes
 * a head and no stamp, because 0.2.0 never asked for one. Those verdicts must
 * keep counting when the project upgrades mid-phase, and an old stamp must not
 * excuse a verdict from any rule either. Both tests run BOTH merge gates, so a
 * change to either gate's admission reddens them.
 */
test("a real-shaped 0.2.0 verdict pair, with a head and no stamp, is admitted by check-dual-review and merge-preconditions, and so is the same pair stamped old or current", () => {
  for (const stamp of [null, "0.1.0", KERNEL_VERSION]) {
    const repo = stageReviewedChange(stampedPair(stamp));
    assertGitMatchesCapture(repo.dir, "budget-name-list", { base: repo.base, head: repo.head });
    if (stamp === null) {
      /* Real-shaped 0.2.0: a forty-hex head and no tiphys-version line. */
      for (const entry of ANCHORED_APPROVING_PAIR) {
        const body = readFileSync(join(repo.dir, "delivery", "review", entry.as), "utf8");
        assert.match(body, /^head: [0-9a-f]{40}$/m, `${entry.as} carries no full head`);
        assert.doesNotMatch(body, /^tiphys-version:/m, `${entry.as} is still stamped`);
      }
    }
    const dual = runGate(repo, "check-dual-review");
    assert.equal(dual.record.status, "green", `${String(stamp)}: ${dual.output}`);
    /* merge-preconditions: the review conditions are cleared and the run
       reaches the network condition this fixture has no repository for. */
    const merge = runGate(repo, "merge-preconditions");
    assert.equal(merge.record.status, "error", `${String(stamp)}: ${merge.output}`);
    assert.match(merge.record.detail ?? "", /no repository could be established/, `${String(stamp)}: ${merge.output}`);
    /* The review conditions are decided first: a pair with fewer than two
       admitted is red on "admitted and missing" before this step (the old-stamp
       head-less test below shows that shape). Reaching it is the admission. */
    assert.doesNotMatch(merge.record.detail ?? "", /admitted and \d+ missing/, `${String(stamp)}: ${merge.output}`);
  }
});

test("an old-stamped verdict that breaks a current rule is excluded by name for the rule it breaks, never for its stamp, at check-dual-review and merge-preconditions", () => {
  /* The rule broken is the head clause: the pair is stamped 0.1.0 and carries
     no head. An admission that honoured the old stamp would let it through;
     one that read the stamp at all would name the stamp. */
  const repo = stageReviewedChange(stampedPair("0.1.0", true));
  assertGitMatchesCapture(repo.dir, "budget-name-list", { base: repo.base, head: repo.head });

  const dual = runGate(repo, "check-dual-review");
  const dualDetail = dual.record.detail ?? "";
  assert.equal(dual.record.status, "red", dual.output);
  assert.match(dualDetail, /0 of 2 are admitted and 2 missing/, dualDetail);
  for (const entry of ANCHORED_APPROVING_PAIR) {
    assert.ok(dualDetail.includes(`delivery/review/${entry.as} declares no head`), `${entry.as}:\n${dualDetail}`);
  }
  assert.doesNotMatch(dualDetail, /tiphys-version/, dualDetail);

  const merge = runGate(repo, "merge-preconditions");
  assert.equal(merge.record.status, "red", merge.output);
  assert.match(merge.record.detail ?? "", /0 of 2 are admitted and 2 missing/);
  const selection = merge.gateStdout.split("\n").filter((line) => line.includes("verdict-selection"));
  assert.equal(selection.length, 1, merge.gateStdout);
  const row = selection[0] as string;
  for (const entry of ANCHORED_APPROVING_PAIR) {
    assert.ok(row.includes(`delivery/review/${entry.as} declares no head`), `${entry.as}:\n${row}`);
  }
  assert.doesNotMatch(row, /tiphys-version/, row);
});

/*
 * KERNEL 0.2.1 FIX ROUND 1 (CR-001): HISTORY JUDGED AT ADMISSION THROUGH
 * GROUPING. Pulse's M3-P3 review is paused with head-less verdicts committed
 * for that phase; resuming it writes an anchored pair beside them. The derived
 * checks group every committed verdict by (phase, head), and until this round a
 * same-phase sibling with no head was a violation, so that phase could never go
 * green without editing history (DR-0054). The sibling here is pulse's own
 * m3-p3-criteria-round4.yaml byte for byte; the pair is the decorrelated
 * fixture pair re-phased to M3-P3 and anchored to the reviewed commit.
 */
test("a same-phase sibling verdict with no head is history: a real pulse M3-P3 round-4 review beside an anchored approving pair is excluded by name and both merge gates clear the review conditions, while a sibling whose head is present and unusable still reddens both", () => {
  const anchoredM3P3 = ANCHORED_APPROVING_PAIR.map((entry) => ({
    ...entry,
    as: entry.as.replace("m3-p9", "m3-p3-resumed"),
    phase: "M3-P3",
  }));
  const pulseSibling = join(pulseDir, "m3-p3-criteria-round4.yaml");
  const siblingRecord = yamlModule.parse(readFileSync(pulseSibling, "utf8")) as Record<string, unknown>;
  assert.equal(siblingRecord["kind"], "verdict");
  assert.equal(siblingRecord["phase"], "M3-P3");
  assert.equal("head" in siblingRecord, false, "the pulse sibling carries a head, so it does not exercise the change");

  /* Arm 1: history. Green at check-dual-review, the sibling named. */
  const history = stageReviewedChange([
    ...anchoredM3P3,
    { from: pulseSibling, as: "m3-p3-criteria-round4.yaml", verbatim: true },
  ]);
  assertGitMatchesCapture(history.dir, "budget-name-list-m3-p3-sibling", { base: history.base, head: history.head });
  assert.equal(
    readFileSync(join(history.dir, "delivery", "review", "m3-p3-criteria-round4.yaml"), "utf8"),
    readFileSync(pulseSibling, "utf8"),
    "the pulse sibling was not staged byte for byte",
  );
  const dual = runGate(history, "check-dual-review");
  assert.equal(dual.record.status, "green", dual.output);
  for (const check of ["dual-review-decorrelation", "verdict-pair-approves"]) {
    assert.ok(
      dual.gateStdout.includes(
        `REPORT ${check} delivery/review/m3-p3-criteria-round4.yaml declares no head, so it is history (DR-0054)`,
      ),
      `${check} did not name the excluded sibling:\n${dual.gateStdout}`,
    );
  }
  const merge = runGate(history, "merge-preconditions");
  assert.equal(merge.record.status, "error", merge.output);
  assert.match(merge.record.detail ?? "", /no repository could be established/, merge.output);
  assert.doesNotMatch(merge.record.detail ?? "", /condition-[12]=red/, merge.output);

  /* Arm 2: the same sibling with a PRESENT but abbreviated head tried to name
     what it reviewed and named it wrongly, so it still refuses the group. */
  const unusable = stageReviewedChange([
    ...anchoredM3P3,
    { from: pulseSibling, as: "m3-p3-criteria-round4.yaml", abbreviatedHead: true },
  ]);
  assertGitMatchesCapture(unusable.dir, "budget-name-list-m3-p3-sibling", { base: unusable.base, head: unusable.head });
  const dualUnusable = runGate(unusable, "check-dual-review");
  assert.equal(dualUnusable.record.status, "red", dualUnusable.output);
  assert.match(
    dualUnusable.gateStdout,
    /INVALID #\/head delivery\/review\/m3-p3-criteria-round4\.yaml declares head [0-9a-f]{7}, which is not forty lowercase hexadecimal digits/,
    dualUnusable.gateStdout,
  );
  const mergeUnusable = runGate(unusable, "merge-preconditions");
  assert.equal(mergeUnusable.record.status, "red", mergeUnusable.output);
});

test("a composed clean-room-reviewer brief and a gate bundle's summary.json are stamped with the running kernel version", () => {
  /* THE WRITERS THE KERNEL OWNS carry the stamp, and the brief's line is the
     value the shipped reviewer brief tells the reviewer to copy. */
  const composed = spawnSync(
    process.execPath,
    [cliEntry, "brief", "compose", "--role", "clean-room-reviewer", "--phase", "templates/plan.example.yaml", "--phase-id", "M9-P1"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(composed.status, 0, composed.stderr);
  assert.match(composed.stdout, new RegExp(`^tiphys-version: ${KERNEL_VERSION.replace(/\./g, "\\.")}$`, "m"));
  assert.match(composed.stdout, /`tiphys-version` is the kernel version on the `tiphys-version:` line/);

  const repo = stageReviewedChange(stampedPair(KERNEL_VERSION));
  runGate(repo, "check-dual-review");
  const summary = JSON.parse(readFileSync(join(repo.dir, "evidence", "check-dual-review", "summary.json"), "utf8")) as Record<string, unknown>;
  assert.equal(summary["tiphys-version"], KERNEL_VERSION);
});
