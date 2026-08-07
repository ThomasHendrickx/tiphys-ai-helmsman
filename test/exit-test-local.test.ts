import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Tests for the M1 exit-test harness scripts (kernel plan v1, M1-P6).
 *
 * What this file covers and what covers the rest. These tests exercise
 * the harness's own surface: its argument handling, its step registry
 * against section 4, its failure machinery, the sandbox seeder, and the
 * stub payload. The end-to-end local-mode run is covered by the gates
 * workflow, which runs the harness twice per leg: once on the green path
 * and once with TIPHYS_EXIT_TEST_SKIP_STAGE_B=1, where it must exit
 * nonzero. Both M1-P4 and M1-P5 are merged and all six acceptance
 * criteria are discharged in delivery/work-history/m1-p6.md.
 *
 * Why the end-to-end run is NOT invoked from this suite, since that is
 * the obvious thing to reach for (CR-605). The harness's step A1 runs
 * `npm ci`, `npm run build` and `npm test` with the LIVE repository root
 * as its working directory. Both consequences were measured against a
 * real evidence bundle rather than reasoned about:
 *
 *   1. Recursion. A1's `npm test` runs the whole suite, this file
 *      included: the captured output of record 003-A1 contains the
 *      titles of tests defined here, and its reported test total is the
 *      whole suite's. A test in this file that invoked the harness would
 *      be re-entered by the harness it invoked.
 *   2. Concurrent destruction. A1's `npm ci` (record 001-A1, cwd = the
 *      repository root) removes and reinstalls node_modules. node --test
 *      runs test files in parallel, so that would delete dependencies
 *      out from under the other files of the running suite. Witnessed by
 *      a reviewer with a sentinel file under node_modules, which `npm
 *      ci` removed.
 *
 * Deliberately NO test count is quoted here. An earlier version cited
 * "tests 153" from the bundle it was measured against; the suite grew
 * and the number went stale while the argument stayed true, which is a
 * citation that decays on its own (CR-646). The checkable claim is that
 * A1 runs the whole suite at the repository root, and the records named
 * above are where to check it.
 *
 * So the falsifiability property is guarded in three places instead:
 * the CI step above runs the real red path end to end; the test below
 * asserts the workflow still wires it; and a second test asserts that a
 * failing step is fatal to a run, which is the general regression the
 * always-green failure mode would have to pass through.
 *
 * Every test runs git with HOME pointed at an empty directory and
 * GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM pointed at paths that do not
 * exist. That is not decoration: it reproduces the clean CI runner with
 * no git identity, which is the failure class EXT-F-02 and PR-211 exist
 * for, and without it a script that quietly depended on an ambient
 * identity would pass here and fail in CI.
 */

const scriptsDir = fileURLToPath(new URL("../scripts", import.meta.url));
const harness = join(scriptsDir, "m1-exit-test.sh");
const seeder = join(scriptsDir, "seed-sandbox.sh");
const stubPayload = join(scriptsDir, "stub-payload.sh");

const HARNESS_NAME = "Tiphys Exit Test";
const HARNESS_EMAIL = "exit-test@tiphys.invalid";

/** Section 4's steps, in order, with the stage each belongs to. */
const SECTION_4_STEPS: readonly (readonly [string, string])[] = [
  ["A1", "A"],
  ["A2", "A"],
  ["A3", "A"],
  ["A4", "A"],
  ["A5", "A"],
  ["A6", "A"],
  ["A7", "A"],
  ["A8", "A"],
  ["B1", "B"],
  ["C1", "C"],
  ["C2", "C"],
  ["C3", "C"],
];

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-p6-"));
}

/**
 * An environment with no reachable git identity: empty HOME, and global
 * and system git config pointed at nonexistent files.
 */
function identityLessEnv(root: string): Record<string, string> {
  const home = join(root, "empty-home");
  mkdirSync(home, { recursive: true });
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // GIT_*: any inherited identity would defeat the point of this env.
    // NODE_TEST_*: node --test sets NODE_TEST_CONTEXT while running a
    // test file, and a nested node --test that inherits it switches to
    // its child-of-a-runner protocol and prints nothing recognizable on
    // stdout. The toy project's own suite is run as such a child here.
    if (
      value !== undefined &&
      !key.startsWith("GIT_") &&
      !key.startsWith("NODE_TEST")
    ) {
      env[key] = value;
    }
  }
  env["HOME"] = home;
  env["GIT_CONFIG_GLOBAL"] = join(root, "no-such-global-config");
  env["GIT_CONFIG_SYSTEM"] = join(root, "no-such-system-config");
  return env;
}

function run(
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string> },
): RunResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function git(
  args: string[],
  options: { cwd: string; env: Record<string, string> },
): RunResult {
  const result = run("git", args, options);
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${result.stderr}`,
  );
  return result;
}

test("the harness rejects invalid invocations with exit 64", () => {
  const root = scratch();
  const env = identityLessEnv(root);
  try {
    const cases: { args: string[]; expect: RegExp }[] = [
      { args: [], expect: /--mode local\|full is required/ },
      { args: ["--mode", "sideways", "ev"], expect: /--mode local\|full is required/ },
      { args: ["--mode", "local"], expect: /evidence directory argument is required/ },
      {
        args: ["--mode", "local", "--stage", "a", "ev"],
        expect: /local mode runs all stages in one invocation/,
      },
      {
        args: ["--mode", "full", "--stage", "all", "ev"],
        expect: /full mode cannot run stage B, which is an owner authorization/,
      },
      {
        args: ["--mode", "full", "ev"],
        expect: /full mode needs --sandbox-remote/,
      },
      {
        args: ["--mode", "full", "--stage", "c", "ev"],
        expect: /stage C needs --approval/,
      },
      { args: ["--mode", "local", "--nonsense", "ev"], expect: /unknown option/ },
    ];
    for (const testCase of cases) {
      const result = run("bash", [harness, ...testCase.args], { cwd: root, env });
      assert.equal(
        result.status,
        64,
        `args ${JSON.stringify(testCase.args)} gave ${String(result.status)}: ${result.stderr}`,
      );
      assert.match(result.stderr, testCase.expect);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the harness step registry covers every step of section 4 exactly once", () => {
  const root = scratch();
  const env = identityLessEnv(root);
  try {
    const result = run("bash", [harness, "--list-steps"], { cwd: root, env });
    assert.equal(result.status, 0, result.stderr);
    const rows = result.stdout
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => line.split("\t"));
    assert.equal(rows.length, SECTION_4_STEPS.length);
    for (const [index, [step, stage]] of SECTION_4_STEPS.entries()) {
      const row = rows[index];
      assert.ok(row !== undefined, `no registry row at index ${String(index)}`);
      assert.equal(row[0], step);
      assert.equal(row[1], stage);
      assert.ok(
        ["both", "local-substitute", "full-only"].includes(row[2] ?? ""),
        `step ${step} has an undocumented local disposition "${String(row[2])}"`,
      );
      assert.ok((row[3] ?? "").length > 0, `step ${step} has no description`);
    }
    // The two steps section 4 states cannot be executed identically in
    // local mode must say so, and A6 and C1 are exactly where the gh-only
    // observations live (PR-008).
    const disposition = new Map(rows.map((row) => [row[0], row[2]]));
    assert.equal(disposition.get("A6"), "local-substitute");
    assert.equal(disposition.get("B1"), "local-substitute");
    assert.equal(disposition.get("C1"), "local-substitute");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failed harness step is fatal to the run and is recorded as failed", () => {
  // The always-green regression is the failure mode this harness is most
  // exposed to, and the end-to-end red path cannot run from this suite
  // (see the header). What CAN run here is the machinery that red path
  // depends on: a step whose observed exit code does not match its
  // expectation must abort the harness, name the step, and leave a
  // record whose outcome is "fail".
  //
  // The failure is induced from OUTSIDE the harness, by giving it a
  // repository root whose `npm ci` cannot succeed, rather than by
  // editing the script. That keeps the test honest about what it
  // guards: the harness as shipped.
  const root = scratch();
  const env = identityLessEnv(root);
  try {
    const fakeRepo = join(root, "broken-repo");
    mkdirSync(join(fakeRepo, "scripts"), { recursive: true });
    // A package.json with no package-lock.json beside it: `npm ci`
    // refuses, deterministically and in about a second.
    writeFileSync(
      join(fakeRepo, "package.json"),
      JSON.stringify({ name: "broken", version: "0.0.0", private: true }) + "\n",
    );
    copyFileSync(harness, join(fakeRepo, "scripts", "m1-exit-test.sh"));

    const evidence = join(root, "evidence");
    const result = run("bash", [join(fakeRepo, "scripts", "m1-exit-test.sh"), "--mode", "local", evidence], {
      cwd: root,
      env,
    });

    assert.notEqual(result.status, 0, "the harness exited 0 with a failing step");
    // Naming the step matters: an abort somewhere else downstream would
    // also be nonzero, and would not witness the step machinery.
    assert.match(result.stderr, /FAILED: step A1 \(kernel npm ci\)/);

    const records = readdirSync(join(evidence, "records"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(evidence, "records", f), "utf8")) as Record<string, unknown>);
    const failed = records.filter(
      (r) => r["step"] === "A1" && r["outcome"] === "fail" && r["exitCode"] !== 0,
    );
    assert.equal(
      failed.length,
      1,
      `expected exactly one failing A1 record, got ${JSON.stringify(records, null, 2)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * READING gates.yml: WHAT THIS FILE CAN AND CANNOT ESTABLISH
 * (rewritten in fix round 4; read this before adding an assertion below)
 *
 * The mechanism that cost this phase three rounds: DECIDING WHAT ANOTHER
 * PROGRAM WILL DO BY PATTERN-MATCHING THE TEXT OF A FILE IT CONSUMES.
 * Rounds 2 and 3 each answered a review by adding assertions over the
 * text of `.github/workflows/gates.yml`, and each time the next review
 * found more ways for the text and GitHub Actions' evaluation of it to
 * come apart: the same key one node over (CR-721), the same key on a
 * node the scan never visits (CR-720), the same key spelled with quotes
 * (CR-722), a value that changes the meaning without changing the
 * presence (CR-723). By round 3 the whitelist had also started
 * REJECTING ordinary edits, including `needs: [test, lint]`, which
 * strengthens the very property being guarded (CR-724).
 *
 * A guard that both misses real defangs and blocks ordinary work is
 * evidence about the approach, not about the whitelist's length. So this
 * round stops trying to reimplement GitHub's evaluator and states the
 * boundary instead. Three tiers, each labelled by what actually enforces
 * it:
 *
 *   TIER 1, BEHAVIOUR (sound, executed here). The step's `run:` script is
 *     extracted and EXECUTED against stub harnesses whose behaviour is
 *     known, and its exit code is the assertion. This is the only tier
 *     that measures meaning rather than shape.
 *
 *   TIER 2, PINNED STRUCTURE (sound within a pinned file shape). A small
 *     set of facts that follow from the file itself rather than from
 *     Actions' evaluation rules: the guard step exists exactly once and
 *     it is INSIDE the `gates` job, which under the single-job shape
 *     (DR-0017) IS DR-0004's required status context, so a failure of the
 *     step is a failure of the required check directly. The reader below
 *     PINS the shapes it accepts and FAILS LOUDLY on anything else, which
 *     is this project's established answer to parsing another program's
 *     format (MECHANISMS.md, "PIN the format as a controlled input rather
 *     than widening the parse"). Failing closed is why a quoted key can no
 *     longer walk past it.
 *
 *   TIER 3, THE TWO NEUTRALISING KEYS (bounded, NOT closed). GitHub
 *     documents exactly two keys that stop a failing step from failing
 *     its job: `if:` and `continue-on-error:`. Both are refused on the
 *     guard step and, under the single-job shape (DR-0017), both on the
 *     `gates` job itself: it is the required-check job now, so an `if:`
 *     there could skip the whole required check instead of failing it, and
 *     `continue-on-error:` there would stop the guard's failure counting.
 *     This is a DENYLIST over a documented vocabulary, and round 3's argument
 *     against denylists ("a whitelist fails on any key nobody thought
 *     of") is answered by measurement rather than by rhetoric: the
 *     whitelist did not close the class (CR-720, CR-721, CR-722) and did
 *     reject four legitimate edits (CR-724). A denylist's residual is
 *     nameable; a whitelist's false positives are paid every edit.
 *
 * WHAT IS NOT GUARDED HERE AT ALL, stated so nobody re-derives it:
 *
 *   a. Which check branch protection REQUIRES. That is GitHub repository
 *      configuration, not workflow YAML, and is not readable from the
 *      tree. It is DR-0004's territory. If `gates` is dropped from the
 *      required set, every assertion in this file still passes and no
 *      pull request is gated.
 *   b. This file. Any assertion below can be deleted, and adding a layer
 *      that guards it only moves the regress. What catches that is the
 *      pull-request diff and the scope audit.
 *   c. A neutralising key outside {`if`, `continue-on-error`}. Bounded by
 *      GitHub's documented workflow syntax, not measured on a runner.
 *   d. (Removed with the fan-in, DR-0017.) The two-job shape had a
 *      `needs:` link whose semantics tier 2 could only read from the
 *      documentation, not run. The single job has no second job and no
 *      `needs:`, so the guard's failure is the required job's failure
 *      directly, with no cross-job result to interpret.
 *
 * WHAT ENFORCES (a) AND (c) INSTEAD, empirically and per run: the guard
 * step prints one distinctive line on its success path, asserted in tier
 * 1 so it cannot be quietly dropped:
 *
 *     falsifiability guard witnessed at C2: exitCode <n>
 *
 * A step that did not run prints nothing. So on any head, the live check
 * is the job log itself, which needs no assumption about YAML at all:
 *
 *     gh run view <run-id> --log --job <gates job id> | grep -F \
 *       "falsifiability guard witnessed at C2"
 *
 * WHAT REDDENS THIS TEST ON PURPOSE (CR-724: an obstruction that is not
 * written down reads as a broken test, and the cheap way out of a red
 * gate is to delete the assertion). Each of these is a decision, not an
 * accident, and each failure message below says so:
 *
 *   - renaming the guard step so "falsifiability guard" no longer
 *     matches it, or adding a second step whose name also matches;
 *   - putting `if:` or `continue-on-error:` on the guard step or on the
 *     `gates` job (both refused there under the single-job shape);
 *   - moving the guard step out of the `gates` job, for example into a
 *     second job that the required check does not run;
 *   - filtering the `pull_request:` trigger;
 *   - changing the witness line quoted above.
 *
 * Everything else is free. `permissions:`, `timeout-minutes:`, `env:`,
 * `defaults:`, extra steps, and extra jobs (with any `needs:`) all pass;
 * only the `gates` job and the guard step inside it are constrained,
 * because that job is the required check. Keeping ordinary edits green is
 * the CR-724 regression this approach repays.
 */

const WORKFLOW_PATH = fileURLToPath(
  new URL("../.github/workflows/gates.yml", import.meta.url),
);

/** The witness line the guard prints on its success path. See above. */
const GUARD_WITNESS = "falsifiability guard witnessed at C2";

function gatesWorkflowLines(): string[] {
  return readFileSync(WORKFLOW_PATH, "utf8").split("\n");
}

interface Block {
  /** Index of the block's first line in the whole file. */
  start: number;
  /** Index one past the block's last line. */
  end: number;
  lines: string[];
  /** Mapping entries declared at the block's own key indent. */
  keys: Map<string, string>;
}

/**
 * The mapping entries a slice declares at exactly `indent` spaces.
 *
 * PINNED, not pattern-matched (CR-722). Round 3 collected keys with
 * /^ {8}([\w-]+):/ and a YAML-quoted key was simply invisible to it,
 * which re-opened the two members that round claimed to have closed. The
 * lesson is not "add quotes to the character class": a name regex
 * silently returns nothing for every shape it does not know, and an
 * empty result is indistinguishable from an absence of keys.
 *
 * So every line at the key indent must match ONE accepted shape, and
 * anything else fails the test with the line quoted. Unquoted, double-
 * quoted and single-quoted keys are all read as the same key. A shape
 * nobody anticipated (a flow mapping, an anchor, a tab) reddens instead
 * of passing.
 */
function declaredKeys(lines: string[], indent: number, what: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const line of lines) {
    if (line.trim() === "" || /^\s*#/.test(line)) {
      continue;
    }
    assert.doesNotMatch(
      line,
      /\t/,
      `${what}: gates.yml line contains a tab, which this reader will not guess at: ${JSON.stringify(line)}`,
    );
    const lead = (/^ */.exec(line)?.[0] ?? "").length;
    if (lead !== indent) {
      // Deeper lines belong to some key's value; shallower lines cannot
      // occur inside an already-sliced block.
      continue;
    }
    const entry = /^ *(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_.-]+)) *:(?: +(.*))?$/.exec(line);
    assert.ok(
      entry,
      `${what}: gates.yml has a line at the key indent that this test cannot read as ` +
        `a single "key: value" entry: ${JSON.stringify(line)}. This test pins the ` +
        "shapes it accepts and refuses to guess at the rest, because a reader that " +
        "guesses returns nothing for a shape it does not know and reports that as " +
        "an absence of keys (CR-722). Either write the entry in the pinned shape or " +
        "extend this reader deliberately.",
    );
    const name = (entry[1] ?? entry[2] ?? entry[3]) as string;
    keys.set(name, (entry[4] ?? "").trim());
  }
  return keys;
}

/** One top-level job, by name. */
function workflowJob(name: string): Block {
  const lines = gatesWorkflowLines();
  const start = lines.findIndex((l) => /^ {2}(?:"([^"]*)"|'([^']*)'|[A-Za-z0-9_.-]+) *:/.test(l) && declaredKeys([l], 2, "jobs").has(name));
  assert.notEqual(start, -1, `no job named ${name} in gates.yml`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || /^\s*#/.test(line)) {
      continue;
    }
    if ((/^ */.exec(line)?.[0] ?? "").length <= 2) {
      end = i;
      break;
    }
  }
  const slice = lines.slice(start + 1, end);
  return { start, end, lines: slice, keys: declaredKeys(slice, 4, `job ${name}`) };
}

/**
 * One step of one job, by a fragment of its `name:`, together with its
 * `run:` script.
 *
 * The scan looks for the NAME KEY wherever it sits in the list item, not
 * only as the item's first key. Anchoring on `^ {6}- ` alone (round 3)
 * meant a step whose first key was something else disappeared from the
 * scan entirely, and disappearing is the failure mode this whole file
 * exists to prevent.
 */
function workflowStep(
  job: Block,
  nameFragment: string,
): Block & { script: string } {
  const lines = gatesWorkflowLines();
  const named = lines
    .map((l, i) => ({ l, i }))
    .filter(
      ({ l }) =>
        /^ {6}- name:|^ {8}name:/.test(l) &&
        l.toLowerCase().includes(nameFragment.toLowerCase()),
    );
  // Exactly one, never "the first" (CR-682). A decoy step whose name also
  // matches would be validated in place of the one CI runs, leaving the
  // real step free to be defanged. This is not hypothetical: a full-mode
  // falsifiability guard is a natural thing to add above this one.
  assert.equal(
    named.length,
    1,
    `expected exactly 1 workflow step named for "${nameFragment}", found ${named.length}. ` +
      "Renaming this step, or adding a second step whose name also matches, is a " +
      "deliberate change: this test identifies the guard by its name and has no " +
      "other handle on it.",
  );
  let start = named[0]?.i ?? -1;
  while (start >= 0 && !/^ {6}- /.test(lines[start] ?? "")) {
    start -= 1;
  }
  assert.ok(
    start >= 0,
    `the step named for "${nameFragment}" is not inside a "      - " list item`,
  );
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      continue;
    }
    const lead = (/^ */.exec(line)?.[0] ?? "").length;
    if (/^ {6}- /.test(line) || lead <= 6) {
      end = i;
      break;
    }
  }
  const slice = lines.slice(start, end);
  // The item's first line carries "- name:"; the rest are indent-8 keys.
  const keys = declaredKeys(
    [(slice[0] ?? "").replace(/^ {6}- /, " ".repeat(8))].concat(slice.slice(1)),
    8,
    `step "${nameFragment}"`,
  );
  const runAt = slice.findIndex((l) => /^ {8}(?:"run"|'run'|run) *: *\|/.test(l));
  assert.notEqual(runAt, -1, `step ${nameFragment} has no "run: |" block`);
  const script = slice
    .slice(runAt + 1)
    .map((l) => (l.startsWith(" ".repeat(10)) ? l.slice(10) : l))
    .join("\n");
  assert.ok(script.trim().length > 0, `step ${nameFragment} has an empty run block`);
  // CR-720: a step that scans as present anywhere in the file proves
  // nothing about the job the required check actually runs. "Extract the
  // expensive guard into its own job to parallelise" is an ordinary edit
  // that breaks the chain while leaving every other assertion green.
  assert.ok(
    start > job.start && end <= job.end,
    `the "${nameFragment}" step is not inside the job this test was asked about ` +
      `(step lines ${start + 1}-${end}, job lines ${job.start + 1}-${job.end}). ` +
      "A guard in a job that is not the required check gates nothing.",
  );
  return { start, end, lines: slice, keys, script };
}

// needsOf was deleted with the two-job fan-in (DR-0017). It read a `gates`
// job's `needs:` to confirm the fan-in consumed the `test` job's result.
// Under one job there is no cross-job `needs:` link to check: the guard runs
// inside the required job, so its failure is the required check's failure with
// no result to relay. Leaving a dead helper here would invite a future reader
// to re-add a link the single-job shape does not have.

/**
 * The keys refused, DERIVED rather than guessed.
 *
 * The derivation is published in delivery/work-history/m1-p6.md, fix
 * round 4: GitHub's workflow syntax is a CLOSED, documented vocabulary,
 * so the thirteen documented step keys and the nineteen documented job
 * keys were each asked one question, "can this decouple a failing guard
 * from a failing required check", and the ones that can are these. That
 * is what makes a denylist defensible here and a denylist over an
 * open-world vocabulary indefensible. What the derivation does NOT cover
 * is written at the top of this section and in the work history.
 *
 * `if` and `continue-on-error` were already known. The derivation added
 * `working-directory`, which decouples differently: it does not stop the
 * failure propagating, it points the step at a different tree, so the
 * step can certify a harness that is not this repository's. `shell` is
 * handled separately and file-wide, below, because the same hole exists
 * at three levels (step, job `defaults`, workflow `defaults`).
 */
const REFUSED_STEP_KEYS = ["if", "continue-on-error", "working-directory"] as const;
const REFUSED_JOB_KEYS = ["if", "continue-on-error"] as const;

const WHY_REFUSED: Record<string, string> = {
  if: "An `if:` there can stop the guard's failure ever being evaluated.",
  "continue-on-error": "A `continue-on-error:` there stops a failure failing anything.",
  "working-directory":
    "A `working-directory:` there runs the step against a different tree, so it can " +
    "certify a harness that is not the one in this repository.",
};

function refuseKeys(
  keys: Map<string, string>,
  refused: readonly string[],
  what: string,
  allow: readonly string[] = [],
): void {
  for (const key of refused) {
    if (allow.includes(key)) {
      continue;
    }
    assert.ok(
      !keys.has(key),
      `${what} declares ${key}: ${JSON.stringify(keys.get(key))}. ` +
        `${WHY_REFUSED[key] ?? ""} ` +
        `Exactly ${String(refused.length)} keys are refused here and every other key ` +
        "(permissions, env, timeout-minutes, defaults, shell, id, with, ...) is " +
        "allowed. If you need this one, that is a decision about whether the " +
        "milestone certification is still gated, not a test to relax.",
    );
  }
}

test("the gates falsifiability guard fails the job when the harness cannot fail", () => {
  // BEHAVIOURAL, not textual. The previous version of this test asserted
  // that certain strings were present in the workflow. It caught
  // deletion of the step and one shape of defang, and three other
  // realistic defangs left it green: `exit 1` changed to `exit 0`,
  // `continue-on-error: true` on the step, and dropping the C2 arm's
  // `process.exit(1)`. Every one of those preserves the text.
  //
  // So the workflow step's own shell script is extracted and EXECUTED
  // against stub harnesses whose behaviour is known, and the step's exit
  // code is the assertion. A mutation that preserves the text but
  // inverts the meaning now reddens this test, because the meaning is
  // what is measured.
  // DR-0017: the guard step lives in the single job named `gates` now, not in
  // a separate matrix `test` job. Only the job lookup changed; the behavioural
  // assertions below are untouched, because the step's own script is unchanged.
  const { script: stepScript } = workflowStep(workflowJob("gates"), "falsifiability guard");
  const root = scratch();
  try {
    // A stub harness standing in for scripts/m1-exit-test.sh. `exit` is
    // its exit code; `c2` is the C2 record it leaves behind, or "none".
    const stub = (exitCode: number, c2: string): string => `#!/usr/bin/env bash
evidence="$3"
mkdir -p "\${evidence}/records"
${
  c2 === "none"
    ? ""
    : `cat >"\${evidence}/records/043-C2.json" <<'JSON'\n${c2}\nJSON`
}
exit ${String(exitCode)}
`;

    // A harness that fails before it ever creates records/, which every
    // other stub hides by creating the directory unconditionally.
    const stubNoRecords = (): string => `#!/usr/bin/env bash
exit 1
`;

    const runStep = (name: string, stubBody: string): RunResult => {
      const dir = join(root, name);
      mkdirSync(join(dir, "scripts"), { recursive: true });
      const harnessPath = join(dir, "scripts", "m1-exit-test.sh");
      writeFileSync(harnessPath, stubBody, { mode: 0o755 });
      // The one GitHub expression in the script, substituted exactly as
      // the runner would substitute it.
      const substituted = stepScript.replaceAll("${{ runner.temp }}", join(dir, "temp"));
      mkdirSync(join(dir, "temp"), { recursive: true });
      const result = run("bash", ["-c", substituted], { cwd: dir, env: identityLessEnv(dir) });
      writeFileSync(join(dir, "stderr.txt"), result.stderr);
      return result;
    };

    const genuineRed = JSON.stringify(
      { step: "C2", kind: "executed", exitCode: 1, outcome: "fail" },
      null,
      2,
    );
    const c2Passed = JSON.stringify(
      { step: "C2", kind: "executed", exitCode: 0, outcome: "pass" },
      null,
      2,
    );

    // 1. The regression the guard exists for: a harness that cannot fail
    //    exits 0 on the red path. The step MUST fail the job.
    assert.notEqual(
      runStep("always-green", stub(0, genuineRed)).status,
      0,
      "the guard passed a harness that exited 0 on the skip-stage-B path",
    );

    // 2. A genuinely falsifiable harness: nonzero, failing at C2. The
    //    step must PASS, or the guard is useless in the other direction
    //    and would redden every honest run.
    const genuine = runStep("genuine-red", stub(1, genuineRed));
    assert.equal(
      genuine.status,
      0,
      "the guard rejected a harness that failed correctly at C2",
    );

    // 2b. And it must SAY SO on stdout. Branch protection and Actions'
    //     evaluation rules are not readable from this tree (see the top
    //     of this section); the one empirical check available on any head
    //     is that this line appears in the test job's log. A step that
    //     did not run prints nothing, so the line's presence is the
    //     evidence and its absence is the alarm. Changing the wording is
    //     a decision: the work history and the block comment above both
    //     quote it as the thing to grep for.
    assert.match(
      genuine.stdout,
      new RegExp(GUARD_WITNESS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `the guard no longer prints "${GUARD_WITNESS}" on its success path, which is ` +
        "the only per-run evidence that the step actually executed in CI",
    );

    // 3. Nonzero, but NOT at C2: an unrelated early abort must not be
    //    accepted as the guard firing. This is the arm that a dropped
    //    process.exit(1) silently removes.
    assert.notEqual(
      runStep("red-elsewhere", stub(1, "none")).status,
      0,
      "the guard accepted a nonzero run with no failing C2 record",
    );
    assert.notEqual(
      runStep("c2-passed", stub(1, c2Passed)).status,
      0,
      "the guard accepted a nonzero run whose C2 record passed",
    );

    // 5. A harness that exits nonzero leaving NO records directory at
    //    all. The guard must DECIDE, not crash: firing by unhandled
    //    exception is indistinguishable from firing by its check, and
    //    hides the removal of the check (CR-683).
    assert.notEqual(
      runStep("no-records-dir", stubNoRecords()).status,
      0,
      "the guard accepted a nonzero run that left no records directory",
    );
    assert.doesNotMatch(
      readFileSync(join(root, "no-records-dir", "stderr.txt"), "utf8"),
      /node:fs|readdirSync|ENOENT/,
      "the guard crashed on a missing records directory instead of deciding",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the falsifiability guard sits inside the job the required check consumes", () => {
  // TIER 2 and TIER 3 of the boundary set out at the top of this section.
  // Read it before adding anything here, and in particular before adding
  // a key whitelist: this test HAD one, it did not close the class, and
  // it reddened four legitimate edits (CR-720 to CR-724).
  //
  // DR-0017 collapsed the workflow from two jobs (a matrix `test` job whose
  // result a non-matrix `gates` fan-in consumed) to ONE job named `gates`,
  // which IS DR-0004's required status context. The chain a failing guard
  // must travel to reach the required check is now SHORTER, not gone.
  //
  // A failing step reaches the required check only if every link holds:
  //
  //   1. the workflow runs on the event that gates a pull request
  //   2. the guard step is INSIDE the `gates` job, and executes  (tier 2)
  //   3. its failure fails the step                              (tier 3)
  //   4. that fails the `gates` job, which IS the required check (tier 3)
  //
  // Link 3's shell half is witnessed by executing the script in the test
  // above. The rest are properties of the YAML around it, asserted here
  // within the bound the comment above names.
  //
  // REMOVED LINKS, and why each no longer applies under one job (recorded so
  // no reader mistakes the shorter chain for a weakened guard):
  //
  //   - Old link 5, "the fan-in job consumes the `test` job's result"
  //     (needsOf(gatesJob).includes("test")): there is no second job to
  //     consume a result. The guard runs INSIDE the required job now, so
  //     workflowStep's containment check below (link 2) is the single-job
  //     replacement: a failure in the required job needs no cross-job relay.
  //   - Old links 5b/5c, the fan-in's `needs.test.result != "success"` /
  //     `exit 1` step and the refuseKeys over it: that step existed only to
  //     translate a matrix leg's result into the required job's exit code.
  //     With the real work in the required job, there is nothing to
  //     translate and no fan-in step to defang.
  //   - Old link 5d, `gates.if == always()`: always() existed to force the
  //     fan-in to RUN after a FAILED upstream job. With no upstream job the
  //     `gates` job must carry NO `if:` at all. An `if:` here could skip the
  //     whole required check (whether a skipped required check blocks a
  //     merge is branch-protection config this test cannot read), so `if` is
  //     now REFUSED on the `gates` job like `continue-on-error`, via
  //     REFUSED_JOB_KEYS with no allow-list, rather than pinned to a value.
  const lines = gatesWorkflowLines();
  const gatesJob = workflowJob("gates");
  const step = workflowStep(gatesJob, "falsifiability guard");

  // 1. The workflow runs on pull requests, UNFILTERED.
  //
  // CR-723: round 3 asserted only that the token appeared under `on:`.
  // `pull_request: {paths-ignore: ['**']}` leaves it present while no
  // pull request produces a run, so presence was never the property. The
  // property is that the trigger carries no filter at all, which is a
  // fact about this file and needs no model of how Actions evaluates the
  // filters it does not have.
  const onAt = lines.findIndex((l) => /^(?:"on"|'on'|on) *:/.test(l));
  assert.notEqual(onAt, -1, "gates.yml declares no on: trigger");
  let onEnd = lines.length;
  for (let i = onAt + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || /^\s*#/.test(line)) {
      continue;
    }
    if (!/^ /.test(line)) {
      onEnd = i;
      break;
    }
  }
  const triggers = declaredKeys(lines.slice(onAt + 1, onEnd), 2, "on:");
  assert.ok(
    triggers.has("pull_request"),
    "gates.yml no longer runs on pull_request, so no pull request is gated by it",
  );
  assert.equal(
    triggers.get("pull_request"),
    "",
    "the pull_request: trigger carries an inline value; this test only accepts the " +
      "unfiltered form, because a filter decides which pull requests are gated and " +
      "that is a decision to record, not a detail",
  );
  const prAt = lines
    .slice(onAt + 1, onEnd)
    .findIndex((l) => /^ {2}(?:"pull_request"|'pull_request'|pull_request) *: *$/.test(l));
  const afterPr = lines
    .slice(onAt + 1 + prAt + 1, onEnd)
    .find((l) => l.trim() !== "" && !/^\s*#/.test(l));
  assert.ok(
    afterPr === undefined || (/^ */.exec(afterPr)?.[0] ?? "").length <= 2,
    `the pull_request: trigger is filtered by ${JSON.stringify(afterPr)}; a filter such ` +
      "as paths-ignore or types can leave the trigger present while no pull request " +
      "produces a run (CR-723). Adding one is a decision about what is gated.",
  );

  // 2. The guard step is inside the `gates` job. workflowStep already
  //    asserted this (it fails loudly if the named step is not within the
  //    block it was handed), which is the single-job replacement for the
  //    old fan-in `needs:` link: the required job runs the guard directly.

  // 2, 3. The guard step carries none of the derived step keys. Every
  //       other documented step key is allowed: `env:`, `timeout-minutes:`,
  //       `id:`, `with:` and the rest cannot decouple the guard from the
  //       check, and round 3 reddened them for no property (CR-724 F4).
  refuseKeys(step.keys, REFUSED_STEP_KEYS, "the falsifiability guard step");

  // 4. Nor does the `gates` job. Under one job this is the required-check
  //    job itself, so BOTH neutralising keys are refused: `if:` (which
  //    could skip the whole required check) and `continue-on-error:`. There
  //    is no always() fan-in that needs an `if:` here anymore, so there is
  //    no allow-list. `permissions:`, `timeout-minutes:` and friends are
  //    still fine here (CR-724 F1, F2).
  refuseKeys(gatesJob.keys, REFUSED_JOB_KEYS, "the gates job");

  // 4b. The shell hole, closed once for the whole file rather than three
  //     times. A CUSTOM shell is a command template carrying `{0}`, the
  //     placeholder Actions substitutes the script path into; it can be
  //     written so the script is never executed at all
  //     (`shell: bash -c "exit 0" {0}`), which turns any step green
  //     without touching that step's `run:`. The same key exists at the
  //     step, at a job's `defaults.run`, and at the workflow's
  //     `defaults.run`, so the assertion is over every `shell:` in the
  //     file at any indent. A plain interpreter name (`shell: bash`) is
  //     not a template and stays green: this refuses the template form
  //     only.
  for (const [i, line] of lines.entries()) {
    const shell = /^ *(?:"shell"|'shell'|shell) *: +(.*)$/.exec(line);
    if (!shell) {
      continue;
    }
    assert.doesNotMatch(
      shell[1] as string,
      /\{0\}/,
      `gates.yml line ${String(i + 1)} sets a custom shell command template ` +
        `(${JSON.stringify(shell[1])}). A template decides whether the step's script ` +
        "runs at all, so it can turn this guard green without changing its run: " +
        "block. A plain interpreter name such as `shell: bash` is accepted.",
    );
  }
});

test("the three exit-test scripts declare one harness identity", () => {
  // The identity is duplicated across three scripts because M1-P6's
  // files-to-touch list has no shared library file in it. This test is
  // the drift guard that duplication needs.
  for (const script of [harness, seeder, stubPayload]) {
    const text = readFileSync(script, "utf8");
    assert.match(
      text,
      new RegExp(`HARNESS_NAME="${HARNESS_NAME}"`),
      `${script} does not declare the documented harness name`,
    );
    assert.match(
      text,
      new RegExp(`HARNESS_EMAIL="${HARNESS_EMAIL.replace(".", "\\.")}"`),
      `${script} does not declare the documented harness email`,
    );
  }
});

test("seeding a sandbox remote is idempotent and commits as the harness identity", () => {
  const root = scratch();
  const env = identityLessEnv(root);
  try {
    const bare = join(root, "toy-sandbox.git");
    git(["init", "--bare", "--quiet", "--initial-branch=main", bare], {
      cwd: root,
      env,
    });
    const remote = `file://${bare}`;

    const first = run("bash", [seeder, "--remote", remote], { cwd: root, env });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /^seed-sandbox: pushed [0-9a-f]{40} /m);

    const headAfterFirst = git(["ls-remote", remote, "refs/heads/main"], {
      cwd: root,
      env,
    }).stdout.split("\t")[0];
    assert.ok(headAfterFirst !== undefined && headAfterFirst.length === 40);

    const second = run("bash", [seeder, "--remote", remote], { cwd: root, env });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already carries the seed content, nothing to do/);

    const headAfterSecond = git(["ls-remote", remote, "refs/heads/main"], {
      cwd: root,
      env,
    }).stdout.split("\t")[0];
    assert.equal(headAfterSecond, headAfterFirst);

    const clone = join(root, "clone");
    git(["clone", "--quiet", remote, clone], { cwd: root, env });
    const identity = git(["log", "-1", "--format=%an <%ae>|%cn <%ce>"], {
      cwd: clone,
      env,
    }).stdout.trim();
    assert.equal(
      identity,
      `${HARNESS_NAME} <${HARNESS_EMAIL}>|${HARNESS_NAME} <${HARNESS_EMAIL}>`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clone of the seeded sandbox passes npm ci and npm test with at least one test", () => {
  const root = scratch();
  const env = identityLessEnv(root);
  try {
    const bare = join(root, "toy-sandbox.git");
    git(["init", "--bare", "--quiet", "--initial-branch=main", bare], {
      cwd: root,
      env,
    });
    const remote = `file://${bare}`;
    const seeded = run("bash", [seeder, "--remote", remote], { cwd: root, env });
    assert.equal(seeded.status, 0, seeded.stderr);

    const clone = join(root, "clone");
    git(["clone", "--quiet", remote, clone], { cwd: root, env });

    const ci = run("npm", ["ci"], { cwd: clone, env });
    assert.equal(ci.status, 0, `npm ci failed: ${ci.stderr}`);

    // The toy project's own suite is run with its reporter PINNED, not
    // with whatever node --test defaults to. The default is ambient and
    // it moves: Node 22 defaults to the tap reporter on a non-tty, Node
    // 26 defaults to spec, so a "# pass N" assertion written against the
    // container's Node 22 was green here and red on the declared ">=26"
    // floor and in CI. Parsing both formats instead would only widen the
    // set of ambient formats this test happens to know about, and the
    // next default would fail it the same way. NODE_OPTIONS carries the
    // flag because the sandbox's test script owns its own node argv, and
    // it is scoped to this one invocation. If the pin is ever refused,
    // node exits nonzero and the exit-code assertion above fires; if it
    // is silently ignored, the TAP assertions below fail. Neither
    // failure mode is quiet.
    const tested = run("npm", ["test"], {
      cwd: clone,
      env: { ...env, NODE_OPTIONS: "--test-reporter=tap" },
    });
    assert.equal(tested.status, 0, `npm test failed: ${tested.stderr}`);
    const passing = /^# pass (\d+)$/m.exec(tested.stdout);
    assert.ok(passing !== null, `no pass count in npm test output: ${tested.stdout}`);
    assert.ok(
      Number(passing[1]) >= 1,
      `expected at least one passing test, got ${String(passing[1])}`,
    );
    assert.match(tested.stdout, /^# fail 0$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Stage a project clone with a task worktree, the shape tiphys spawn
 * hands the payload: a worktree of a clone, checked out on the task
 * branch, with origin pointing at the project's remote.
 */
function stageTaskWorktree(root: string, env: Record<string, string>) {
  const bare = join(root, "toy-sandbox.git");
  git(["init", "--bare", "--quiet", "--initial-branch=main", bare], {
    cwd: root,
    env,
  });
  const remote = `file://${bare}`;
  const seeded = run("bash", [seeder, "--remote", remote], { cwd: root, env });
  assert.equal(seeded.status, 0, seeded.stderr);

  const project = join(root, "project");
  git(["clone", "--quiet", remote, project], { cwd: root, env });

  const branch = "tiphys/m1-exit";
  const worktree = join(root, "worktree");
  git(["worktree", "add", "--quiet", "-b", branch, worktree, "main"], {
    cwd: project,
    env,
  });
  return { bare, remote, project, branch, worktree };
}

test("the stub payload appends, commits as the harness identity, and pushes the task branch", () => {
  const root = scratch();
  const env = identityLessEnv(root);
  try {
    const staged = stageTaskWorktree(root, env);
    const reportPath = join(root, "payload-report.txt");
    const payloadEnv = {
      ...env,
      TIPHYS_EXIT_TEST_MODE: "local",
      TIPHYS_EXIT_TEST_TASK: "m1-exit",
      TIPHYS_EXIT_TEST_REPORT: reportPath,
    };
    const result = run("bash", [stubPayload], {
      cwd: staged.worktree,
      env: payloadEnv,
    });
    assert.equal(result.status, 0, `stub payload failed: ${result.stderr}`);

    assert.match(result.stdout, new RegExp(`^payload branch ${staged.branch}$`, "m"));
    const commitLine = /^payload commit ([0-9a-f]{40})$/m.exec(result.stdout);
    assert.ok(commitLine !== null, `no commit line: ${result.stdout}`);
    assert.match(result.stdout, /^payload pushed file:\/\/\S+ tiphys\/m1-exit$/m);
    // Local mode must not reach for gh at all.
    assert.doesNotMatch(result.stdout, /^payload pr /m);

    const readme = readFileSync(join(staged.worktree, "README.md"), "utf8");
    assert.match(
      readme,
      /^exit-test m1-exit landed a trivial change on branch tiphys\/m1-exit$/m,
    );

    const identity = git(["log", "-1", "--format=%an <%ae>|%cn <%ce>"], {
      cwd: staged.worktree,
      env,
    }).stdout.trim();
    assert.equal(
      identity,
      `${HARNESS_NAME} <${HARNESS_EMAIL}>|${HARNESS_NAME} <${HARNESS_EMAIL}>`,
    );

    const pushed = git(["ls-remote", staged.remote, `refs/heads/${staged.branch}`], {
      cwd: root,
      env,
    }).stdout.split("\t")[0];
    assert.equal(pushed, commitLine[1]);

    // The report file is how the harness learns the branch and commit
    // without assuming tiphys spawn forwards the payload's stdout, an
    // M1-P4 behavior the plan does not state. It must carry the same
    // facts as stdout.
    const report = readFileSync(reportPath, "utf8");
    assert.equal(report, result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the stub payload refuses a bad mode and a working directory that is not a worktree", () => {
  const root = scratch();
  const env = identityLessEnv(root);
  try {
    const badMode = run("bash", [stubPayload], {
      cwd: root,
      env: { ...env, TIPHYS_EXIT_TEST_MODE: "sideways" },
    });
    assert.equal(badMode.status, 64);
    assert.match(badMode.stderr, /unknown mode "sideways"/);

    const notAWorktree = run("bash", [stubPayload], {
      cwd: root,
      env: { ...env, TIPHYS_EXIT_TEST_MODE: "local" },
    });
    assert.equal(notAWorktree.status, 1);
    assert.match(notAWorktree.stderr, /is not a git worktree/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
