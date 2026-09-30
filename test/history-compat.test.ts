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
 * M6-P5 (DR-0062) REPLACED ADMISSION BY THE VERDICT'S OWN HEAD WITH KERNEL
 * REVIEW RECORDS: the merge gate counts a verdict when a committed record names
 * its path and bytes, and reads the head from the record. The tests here whose
 * subject was admission by a verdict's `head` line, the review-families scope
 * over verdicts, or `scripts/check-dual-review.mjs` were deleted with those
 * mechanisms; what stays is that a stamp is never read on the admission path.
 *
 * `src` is reached through spawned processes or computed-URL imports (CLAUDE.md
 * standing warning 4).
 */

import { spawnSync } from "node:child_process";
import {
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
import { recordVerdicts } from "./support/review-records.ts";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const dualFixtures = join(repoRoot, "witness", "fixtures", "dual-review");
const pulseDir = join(repoRoot, "test", "fixtures", "pulse-0.1.0-verdicts");
const GIT_CAPTURE = join(repoRoot, "witness", "captures", "kernel-0-2-1-history-git.json");

const yamlModule = (await import("yaml")) as unknown as { parse: (text: string) => unknown };

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

/** A staged document's text with its `phase:` line rewritten when asked. */
function rephased(entry: { from: string; phase?: string }): string {
  const body = readFileSync(entry.from, "utf8");
  if (entry.phase === undefined) {
    return body;
  }
  const rewritten = body.replace(/^phase: .*$/m, `phase: ${entry.phase}`);
  assert.notEqual(rewritten, body, `${entry.from} has no single-line phase to rewrite`);
  return rewritten;
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
    /**
     * Commit the (verbatim) document in the BASE, so the change under audit
     * did not write it (fix round 2). Without `edit` the branch leaves it
     * byte for byte; with `edit` the branch changes it.
     */
    atBase?: boolean;
    /** Rewrite the branch's copy of a verbatim document; the edit must change it. */
    edit?: (body: string) => string;
  }[],
): ReviewedRepo {
  const dir = scratch("tiphys-history-compat-gate-");
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  assert.match(charter, /^delivery-mode: full$/m, "the shipped template no longer declares mode full");
  writeFileSync(join(dir, "charter.yaml"), charter);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "feature.ts"), "export const feature = 1;\n");
  for (const entry of verdicts) {
    if (entry.atBase === true) {
      assert.equal(entry.verbatim, true, `${entry.as}: only a verbatim document is staged at the base`);
      mkdirSync(join(dir, "delivery", "review"), { recursive: true });
      writeFileSync(join(dir, "delivery", "review", entry.as), rephased(entry));
    }
  }
  git(dir, ["init", "-q", "."]);
  const base = commit(dir, "base");
  writeFileSync(join(dir, "src", "feature.ts"), "export const feature = 2;\n");
  const reviewed = commit(dir, "the change under review");
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  for (const entry of verdicts) {
    let body = rephased(entry);
    if (entry.verbatim === true) {
      if (entry.edit !== undefined) {
        const edited = entry.edit(body);
        assert.notEqual(edited, body, `${entry.as}: the edit did not change the document`);
        body = edited;
      } else if (entry.atBase === true) {
        continue;
      }
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
  /* M6-P5: the kernel review record for each verdict, as `tiphys review
     dispatch` writes it, naming the reviewed commit. */
  recordVerdicts(dir, "m3-p9", { defaultHead: reviewed });
  const head = commit(dir, "the reviews");
  /* The gate code is linked, not committed, so the budget is decided by the
     one `src/` file the change touched. */
  writeFileSync(join(dir, ".git", "info", "exclude"), "/src/gates/\n/gate-registry.yaml\n/evidence/\n");
  mkdirSync(join(dir, "src", "gates"), { recursive: true });
  symlinkSync(join(repoRoot, "src", "gates", "merge-preconditions.ts"), join(dir, "src", "gates", "merge-preconditions.ts"));
  writeFileSync(join(dir, "gate-registry.yaml"), readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"));
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

/**
 * Pulse's real M1-P1 hazard review, stamped with the running kernel version and
 * given a full head. M6-P5 deleted dual-review-decorrelation, the one
 * context-requiring verdict check an unstamped document was still held to, so
 * the only such check left, verdict-pair-approves, is in force for a current
 * stamp alone.
 */
function currentPulseHazard(dir: string): { path: string; source: string } {
  const history = readFileSync(join(pulseDir, "m1-p1-hazard.yaml"), "utf8");
  const source = history.replace(/^(phase: .*)$/m, `$1\ntiphys-version: ${KERNEL_VERSION}\nhead: ${"a".repeat(40)}`);
  assert.notEqual(source, history, "the fixture has no phase line to stamp after");
  const path = join(dir, "current-hazard.yaml");
  writeFileSync(path, source);
  return { path, source };
}

test("a verdict whose only non-pass results are SKIPPED checks exits 0, and each skip is still printed by name", () => {
  /* The owner's report: pulse's history "returns false". A real pulse
     verdict, validated with no --context, is exit 0. */
  const history = validateRun("verdict", join(pulseDir, "m1-p1-hazard.yaml"));
  assert.ok(!history.lines.some((line) => line.startsWith("INVALID")), history.output);
  assert.equal(history.status, 0, history.output);
  /* The same document at a current stamp says which check it did not run. */
  const run = validateRun("verdict", currentPulseHazard(scratch("tiphys-history-compat-skip-")).path);
  assert.ok(!run.lines.some((line) => line.startsWith("INVALID")), run.output);
  const skipped = run.lines.filter((line) => /^SKIPPED [a-z-]+ no context$/.test(line));
  assert.ok(skipped.length > 0, `no check was skipped, so this does not exercise a skip:\n${run.output}`);
  assert.equal(run.status, 0, run.output);
});

test("a verdict with a real INVALID line still exits 1 without a context, whether the schema or a derived check found it", () => {
  const dir = scratch("tiphys-history-compat-invalid-");
  const { source } = currentPulseHazard(dir);

  /* A DERIVED CHECK that runs without a context and finds a violation, beside
     the shipped context-requiring checks that are SKIPPED in the same run, so
     a violation among skips is what is asserted. M6-P3 deleted every shipped
     verdict check that runs without a context, so the violating check is
     registered by a driver around the real `cmdValidate`, whose exit rule is
     the thing under test. */
  const verdictPath = join(dir, "verdict.yaml");
  writeFileSync(verdictPath, source);
  const driver = `
import { registerCheck } from ${JSON.stringify(join(repoRoot, "src", "checks.ts"))};
import { cmdValidate } from ${JSON.stringify(join(repoRoot, "src", "commands", "validate.ts"))};
registerCheck({
  id: "fixture-always-violated",
  type: "verdict",
  requiresContext: false,
  run: () => ({ violations: [{ pointer: "#", message: "a fixture violation" }], reports: [] }),
});
process.exitCode = cmdValidate(["--type", "verdict", process.argv[1]]);
`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", driver, verdictPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const derived = {
    status: run.status,
    output: `${run.stdout ?? ""}${run.stderr ?? ""}`,
    lines: `${run.stdout ?? ""}${run.stderr ?? ""}`.split("\n").filter((line) => line.trim() !== ""),
  };
  assert.ok(
    derived.lines.some((line) => line.startsWith("INVALID") && line.includes("(check: fixture-always-violated)")),
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
 * excuse a verdict from any rule either. Both tests run merge-preconditions,
 * which counts each verdict through its kernel review record (M6-P5), so a
 * change to that count reddens them.
 */
test("a real-shaped 0.2.0 verdict pair, with a head and no stamp, is counted by merge-preconditions through its kernel records, and so is the same pair stamped old or current", () => {
  for (const stamp of [null, "0.1.0", KERNEL_VERSION]) {
    const repo = stageReviewedChange(stampedPair(stamp));
    assertGitMatchesCapture(repo.dir, "budget-name-list-with-records", { base: repo.base, head: repo.head });
    if (stamp === null) {
      /* Real-shaped 0.2.0: a forty-hex head and no tiphys-version line. */
      for (const entry of ANCHORED_APPROVING_PAIR) {
        const body = readFileSync(join(repo.dir, "delivery", "review", entry.as), "utf8");
        assert.match(body, /^head: [0-9a-f]{40}$/m, `${entry.as} carries no full head`);
        assert.doesNotMatch(body, /^tiphys-version:/m, `${entry.as} is still stamped`);
      }
    }
    /* The review conditions are cleared and the run reaches the network
       condition this fixture has no repository for. The gate returns before
       that step on any review row that is not green: a pair with fewer than two
       counted is red on "counted and missing", and a counted pair with a
       blocking finding is red on condition 2. So reaching it is the evidence
       that both verdicts were counted, and the error arm prints no rows. */
    const merge = runGate(repo, "merge-preconditions");
    assert.equal(merge.record.status, "error", `${String(stamp)}: ${merge.output}`);
    assert.match(merge.record.detail ?? "", /no repository could be established/, `${String(stamp)}: ${merge.output}`);
    assert.doesNotMatch(merge.record.detail ?? "", /counted and \d+ missing/, `${String(stamp)}: ${merge.output}`);
  }
});

test("an old-stamped verdict that breaks a current rule is refused at merge-preconditions for the rule it breaks, never for its stamp", () => {
  /* The rule broken is DR-0012 condition 2: pulse's real 0.1.0-era M1-P1
     criteria review reads APPROVE beside a medium finding (CR-001). It is
     stamped 0.1.0 here, re-phased to the phase under audit, and counted
     through its kernel record. An admission that honoured the old stamp would
     let it through; one that read the stamp at all would name the stamp. */
  const addStamp = (body: string): string => body.replace(/^(phase: .*)$/m, "$1\ntiphys-version: 0.1.0");
  const repo = stageReviewedChange([
    { from: join(pulseDir, "m1-p1-criteria.yaml"), as: "m3-p9-criteria.yaml", verbatim: true, phase: "M3-P9", edit: addStamp },
    { from: join(dualFixtures, "decorrelated-hazard.yaml"), as: "m3-p9-hazard.yaml", stamp: "0.1.0" },
  ]);
  assertGitMatchesCapture(repo.dir, "budget-name-list-with-records", { base: repo.base, head: repo.head });

  const merge = runGate(repo, "merge-preconditions");
  assert.equal(merge.record.status, "red", merge.output);
  assert.notEqual(merge.exit, 0, merge.output);
  const rowsNamed = (id: string): string[] => merge.gateStdout.split("\n").filter((line) => line.startsWith(`${id} (`));
  assert.match(rowsNamed("verdict-selection").join("\n"), /2 review\(s\) counted from 2 record\(s\)/, merge.gateStdout);
  const condition2 = rowsNamed("condition-2");
  assert.equal(condition2.length, 1, merge.gateStdout);
  assert.match(condition2[0] as string, /m3-p9-criteria\.yaml carries finding CR-001 at severity medium/, merge.gateStdout);
  assert.doesNotMatch(condition2[0] as string, /tiphys-version|0\.1\.0/, condition2[0]);
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
 *
 * FIX ROUND 2 (CR-KH-003, CR-007): history is decided by PROVENANCE. The
 * sibling is committed at the BASE, which is where pulse's round-4 review
 * really is when the resumed pair is written, so the change under audit did
 * not write it. The next test is the other side: the same document ADDED or
 * CHANGED by the change under audit is refused.
 */
/*
 * KERNEL 0.2.1 FIX ROUND 2 (CR-KH-003, CR-007): SHAPE IS NOT PROVENANCE.
 * `declaresNoHead` alone let a head-less verdict written TODAY take history's
 * exemption, so two clean reviews plus a fresh head-less refusal carrying a
 * high finding read green. Two structurally different members of that class,
 * each built from pulse's own round-4 review: (a) the change ADDS it,
 * rewritten to a refusal with a high finding, which is CR-KH-003 exactly; (b)
 * it is committed at the base and the change EDITS it from APPROVE to
 * FIX-ROUND-NEEDED. Both gates refuse both, naming the path, the verdict and
 * the blocking findings. The control, the same document unchanged at the
 * base, is the test above. Without a base the bare script cannot tell, keeps
 * the exclusion, and says so on the line (the last arm).
 */
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
  runGate(repo, "merge-preconditions");
  const summary = JSON.parse(readFileSync(join(repo.dir, "evidence", "merge-preconditions", "summary.json"), "utf8")) as Record<string, unknown>;
  assert.equal(summary["tiphys-version"], KERNEL_VERSION);
});
