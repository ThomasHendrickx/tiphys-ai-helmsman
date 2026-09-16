/**
 * THE CUTOVER-ENTRY PRECONDITION CHECK (kernel plan M4, M4-P27 steps 1 and 3,
 * criteria 1 and 2).
 *
 * WHAT THIS IS. The cutover-entry trigger is DR-0042's and is not re-decided
 * here. This script is step 1 of it: the four computed preconditions, each
 * evaluated independently, each classified into one of four words, and none of
 * them ever reported as satisfied because it could not be checked.
 *
 * THE DANGEROUS STATE THIS EXISTS AGAINST is a trigger that reports READY when
 * it is not. Three concrete shapes, all of which this script is built to
 * redden on and all of which are witnessed in test/cutover-entry.test.ts:
 *
 *   1. an arm that greens because it could not reach the thing it checks;
 *   2. an arm that greens on an EMPTY result, so a report naming zero rows
 *      reads as a report naming zero bad rows;
 *   3. a script that treats the OWNER step as done, or prints anything a
 *      reader could take as permission to enter cutover.
 *
 * THE FOUR-ARM CLASSIFIER, and why a two-state answer is wrong here. A probe
 * can land in four genuinely different places, and the measured reason is at
 * delivery/verification/m4-prototype-probes.md:1: a nonzero exit does NOT mean
 * the condition is false, because a transport failure exits nonzero too.
 *
 *   satisfied     the arm's condition was checked and holds
 *   not-yet       the arm's condition was checked and does not hold
 *   unreachable   the arm could not be checked at all, or was answered with
 *                 something that establishes nothing
 *   refused       the check was answered with an authorization refusal
 *
 * `unreachable` and `refused` DOMINATE `not-yet` in the overall verdict,
 * because "I could not tell" must not be reported as "the answer is no" any
 * more than it may be reported as "yes".
 *
 * EVERY ARM IS ALWAYS EVALUATED. A checker that short-circuits on the first
 * failure is silent about the other three, and the plan asks for four
 * independently forced-false witnesses precisely because the arms are
 * independent (kernel plan M4, M4-P27 criterion 2).
 *
 * THE OWNER STEP IS NOT COMPUTABLE AND THIS SCRIPT DOES NOT PRETEND TO
 * COMPUTE IT. Step 3 of the trigger is "ask the owner to reboot the pilot
 * session". There is no input to this script that makes step 3 report done.
 * Exit 0 here means STEP 1 IS SATISFIED, and the final line says so in words:
 * it is a HALT, not a green light. The overall vocabulary below is closed and
 * contains no member meaning "ready".
 *
 * THE FOUR ARMS.
 *
 *   a  `tiphys cutover status` reports `DRAIN clean`. M4-P25 criterion 1 fixes
 *      that line's shape. An absent DRAIN line is `unreachable`: the command
 *      not saying anything about drain is not the command saying drain is
 *      clean.
 *   b  the cross-environment exclusion behaviors that M4-P21 and M4-P22
 *      register resolve BY NAME in `test/behaviors.json`, and their tests
 *      pass. A suite that runs ZERO tests exits 0, so the arm also requires a
 *      reported pass count greater than zero; "exits 0" alone is the vacuous
 *      version.
 *   c  `tiphys cutover status --retirement` reports zero `unported` rows.
 *      ZERO ROWS ALTOGETHER is `unreachable`, not satisfied, for the same
 *      reason as arm a.
 *   d  `delivery/plan/cutover/pre-freeze-ruleset.json` is present and newer
 *      than the most recent inventory change. With NO inventory present the
 *      comparison is vacuous and the arm is `unreachable`, because "newer than
 *      nothing" is a guard that cannot go red.
 *
 * ARM b's REQUIRED NAMES ARE A CONTRACT THIS PHASE DECLARES, NOT A FACT IT
 * OBSERVED. M4-P21 and M4-P22 had not landed when this was written and the
 * plan does not name their behavior ids. The list below is derived from their
 * acceptance criteria and is deliberately a MINIMUM, never a count, so a phase
 * that appends more rows does not redden it (CLAUDE.md binding convention 5: a
 * test over an append-only registry asserts by name and never by count). If
 * those phases land with different ids, THIS ARM REPORTS not-yet, which is the
 * fail-closed direction, and the list is reconciled in one edit. It is stated
 * here rather than left to be discovered.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = dirname(scriptDir);

/** Closed set. Checked at runtime so a new word cannot be introduced silently. */
export const ARM_VERDICTS = ["satisfied", "not-yet", "unreachable", "refused"];

/**
 * Closed set. NO MEMBER OF THIS VOCABULARY MEANS "READY TO ENTER CUTOVER", and
 * a test asserts that against a forbidden-token list.
 */
export const OVERALL_VERDICTS = [
  "preconditions-satisfied-owner-action-pending",
  "preconditions-not-satisfied",
  "preconditions-indeterminate",
];

export const REQUIRED_EXCLUSION_BEHAVIORS = [
  "exclusion-second-clone-refused",
  "exclusion-unreachable-register-fails-closed",
  "exclusion-identity-no-process-probing",
  "doctor-shared-lock-four-statuses",
  "spawn-refused-under-foreign-shared-lease",
  "teardown-refused-under-foreign-shared-lease",
];

export const DEFAULT_EXCLUSION_TESTS = [
  "test/cross-environment.test.ts",
  "test/cross-environment-lock.test.ts",
];

export const RULESET_PATH = "delivery/plan/cutover/pre-freeze-ruleset.json";
export const INVENTORY_PATHS = [
  "delivery/plan/cutover/retirement-inventory.json",
  "delivery/plan/cutover/retirement-inventory.md",
];

export const EXIT_SATISFIED = 0;
export const EXIT_NOT_SATISFIED = 1;
export const EXIT_INDETERMINATE = 3;
export const EXIT_USAGE = 64;

const VERDICT_SEVERITY = { satisfied: 0, "not-yet": 1, unreachable: 2, refused: 3 };

function arm(id, name, verdict, reason) {
  if (!ARM_VERDICTS.includes(verdict)) {
    throw new Error(`check-cutover-entry: verdict outside the closed set: ${verdict}`);
  }
  return { id, name, verdict, reason };
}

function singleLine(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
}

/* ------------------------------------------------------------------ */
/* Running the kernel CLI, with the transport arm written first        */
/* ------------------------------------------------------------------ */

/**
 * Returns either `{ transport: "failed", reason }` or
 * `{ transport: "ran", status, text }`. The caller never sees a raw exit code
 * without knowing whether the program ran at all, which is the distinction
 * the prototype probes measured and the reason this returns a record rather
 * than a number.
 */
export function runCli(root, cliArgs, options = {}) {
  const entry = join(root, "bin", "tiphys.ts");
  let entryStat;
  try {
    entryStat = statSync(entry);
  } catch (error) {
    return { transport: "failed", reason: `no CLI entry at ${entry}: ${singleLine(error)}` };
  }
  if (!entryStat.isFile()) {
    return { transport: "failed", reason: `the CLI entry at ${entry} is not a regular file` };
  }
  const result = spawnSync(process.execPath, [entry, ...cliArgs], {
    cwd: root,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 120000,
  });
  if (result.error) {
    return { transport: "failed", reason: `could not start the CLI: ${singleLine(result.error)}` };
  }
  if (result.status === null) {
    return { transport: "failed", reason: "the CLI was killed before it answered" };
  }
  return {
    transport: "ran",
    status: result.status,
    text: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

function classifyCliFailure(run, what) {
  if (run.transport === "failed") {
    return { verdict: "unreachable", reason: `${what}: ${run.reason}` };
  }
  const text = run.text;
  if (run.status === EXIT_USAGE || /unknown subcommand|usage:/i.test(text)) {
    return {
      verdict: "not-yet",
      reason: `${what}: the cutover command is not delivered (exit ${run.status})`,
    };
  }
  if (/permission denied|EACCES|not authori[sz]ed|refused by/i.test(text)) {
    return { verdict: "refused", reason: `${what}: ${singleLine(text)}` };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Arm a: drain                                                        */
/* ------------------------------------------------------------------ */

export function armDrain(root) {
  const run = runCli(root, ["cutover", "status"]);
  const failure = classifyCliFailure(run, "cutover status");
  if (failure) return arm("a", "drain", failure.verdict, failure.reason);

  const match = /^[ \t]*DRAIN[ \t]+(.+?)[ \t]*$/m.exec(run.text);
  if (match === null) {
    return arm(
      "a",
      "drain",
      "unreachable",
      "cutover status printed no DRAIN line; a command that says nothing about " +
        "drain is not a command saying drain is clean",
    );
  }
  const state = match[1].trim();
  if (state === "clean") {
    return arm("a", "drain", "satisfied", "cutover status reports DRAIN clean");
  }
  return arm("a", "drain", "not-yet", `cutover status reports DRAIN ${state}`);
}

/* ------------------------------------------------------------------ */
/* Arm b: the cross-environment exclusion behaviors and their tests    */
/* ------------------------------------------------------------------ */

/**
 * The environment for the nested `node --test` run.
 *
 * `NODE_TEST_CONTEXT` is set by Node's own test runner in every child it
 * spawns, and a nested run that inherits it does NOT run: it prints
 * "node:test run() is being called recursively within a test file. skipping
 * running files" and exits 0 with no counts at all. Measured 2026-09-16 in
 * this repository.
 *
 * That is the exact shape of the thing this script exists against. Exit 0 and
 * no assertions is a vacuous pass, and an arm that read "exit 0" as "the tests
 * pass" would have been GREEN on a run where nothing executed. The arm already
 * fail-closes to `unreachable` when the counts are missing, which is how this
 * was found, but relying on that would leave a checker that can never satisfy
 * arm b when run from inside a test. So the variable is removed and the
 * reporter is pinned, and the missing-counts arm stays as the backstop.
 */
const TEST_RUNNER_ENV_NAMES = ["NODE_TEST_CONTEXT", "NODE_TEST_WORKER_ID"];

function childTestEnv() {
  const cleaned = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !TEST_RUNNER_ENV_NAMES.includes(key)) cleaned[key] = value;
  }
  return cleaned;
}

export function armExclusion(root, requiredNames, testPaths) {
  const behaviorsPath = join(root, "test", "behaviors.json");
  let behaviors;
  try {
    behaviors = JSON.parse(readFileSync(behaviorsPath, "utf8"));
  } catch (error) {
    return arm(
      "b",
      "exclusion",
      "unreachable",
      `could not read ${behaviorsPath}: ${singleLine(error)}`,
    );
  }
  if (behaviors === null || typeof behaviors !== "object" || Array.isArray(behaviors)) {
    return arm("b", "exclusion", "unreachable", `${behaviorsPath} is not a behavior map`);
  }
  const missing = requiredNames.filter(
    (name) => !Object.prototype.hasOwnProperty.call(behaviors, name),
  );
  if (missing.length > 0) {
    return arm(
      "b",
      "exclusion",
      "not-yet",
      `behaviors.json does not yet register: ${missing.join(", ")}`,
    );
  }

  for (const relativePath of testPaths) {
    const absolute = join(root, relativePath);
    try {
      if (!statSync(absolute).isFile()) {
        return arm("b", "exclusion", "not-yet", `${relativePath} is not a regular file`);
      }
    } catch {
      return arm("b", "exclusion", "not-yet", `${relativePath} does not exist yet`);
    }
    const result = spawnSync(
      process.execPath,
      ["--test", "--test-reporter", "tap", absolute],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 600000,
        env: childTestEnv(),
      },
    );
    if (result.error) {
      return arm(
        "b",
        "exclusion",
        "unreachable",
        `could not run ${relativePath}: ${singleLine(result.error)}`,
      );
    }
    if (result.status === null) {
      return arm("b", "exclusion", "unreachable", `${relativePath} was killed before it answered`);
    }
    const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const pass = /^#\s*pass\s+(\d+)\s*$/m.exec(text);
    const fail = /^#\s*fail\s+(\d+)\s*$/m.exec(text);
    if (pass === null || fail === null) {
      return arm(
        "b",
        "exclusion",
        "unreachable",
        `${relativePath} reported no pass/fail counts; exit ${result.status} alone establishes nothing`,
      );
    }
    const passCount = Number(pass[1]);
    const failCount = Number(fail[1]);
    if (passCount === 0) {
      return arm(
        "b",
        "exclusion",
        "not-yet",
        `${relativePath} ran zero passing tests; a suite that asserts nothing exits 0`,
      );
    }
    // A PASS COUNT ABOVE ZERO IS NOT ENOUGH, measured 2026-09-16 on node
    // v22.22.2. A file registering NO tests at all reports
    // `ok 1 - <the file path>` and `# pass 1`, because the runner reports the
    // FILE as a passing subtest when nothing inside it ran. So "pass count
    // greater than zero" was itself a guard that could not go red, in the very
    // arm written to catch a vacuous suite. The stronger condition is at least
    // one passing subtest whose NAME is not the file's own path.
    const namedPasses = [...text.matchAll(/^ok \d+ - (.*)$/gm)]
      .map((entry) => entry[1].trim())
      .filter((name) => name.length > 0 && name !== absolute && name !== relativePath);
    if (namedPasses.length === 0) {
      return arm(
        "b",
        "exclusion",
        "not-yet",
        `${relativePath} registered no named test; the runner reports the file ` +
          "itself as one passing subtest when nothing inside it ran",
      );
    }
    if (failCount > 0) {
      return arm("b", "exclusion", "not-yet", `${relativePath} reports ${failCount} failing test(s)`);
    }
    if (result.status !== 0) {
      return arm(
        "b",
        "exclusion",
        "unreachable",
        `${relativePath} exited ${result.status} while reporting zero failures`,
      );
    }
  }
  return arm(
    "b",
    "exclusion",
    "satisfied",
    `all ${requiredNames.length} required behavior name(s) resolve and ` +
      `${testPaths.length} exclusion test file(s) pass with a nonzero pass count`,
  );
}

/* ------------------------------------------------------------------ */
/* Arm c: the retirement rows                                          */
/* ------------------------------------------------------------------ */

export function countRetirementRows(text) {
  let ported = 0;
  let unported = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (/\bunported\b/.test(line)) unported += 1;
    else if (/\bported\b/.test(line)) ported += 1;
  }
  return { ported, unported, rows: ported + unported };
}

export function armRetirement(root) {
  const run = runCli(root, ["cutover", "status", "--retirement"]);
  const failure = classifyCliFailure(run, "cutover status --retirement");
  if (failure) return arm("c", "retirement", failure.verdict, failure.reason);

  const counts = countRetirementRows(run.text);
  if (counts.rows === 0) {
    return arm(
      "c",
      "retirement",
      "unreachable",
      "the retirement report named no PORT rows at all; zero rows is not zero " +
        "unported rows, and an empty result is not a clean one",
    );
  }
  if (counts.unported > 0) {
    return arm(
      "c",
      "retirement",
      "not-yet",
      `${counts.unported} of ${counts.rows} retirement row(s) are unported`,
    );
  }
  return arm("c", "retirement", "satisfied", `all ${counts.rows} retirement row(s) are ported`);
}

/* ------------------------------------------------------------------ */
/* Arm d: the pre-freeze ruleset and its freshness                     */
/* ------------------------------------------------------------------ */

function mtimeOrNull(path) {
  try {
    const stat = statSync(path);
    return stat.isFile() ? stat.mtimeMs : null;
  } catch {
    return null;
  }
}

export function armRuleset(root, rulesetPath = RULESET_PATH, inventoryPaths = INVENTORY_PATHS) {
  const ruleset = join(root, rulesetPath);
  const rulesetMtime = mtimeOrNull(ruleset);
  if (rulesetMtime === null) {
    return arm("d", "pre-freeze-ruleset", "not-yet", `${rulesetPath} is absent`);
  }
  try {
    JSON.parse(readFileSync(ruleset, "utf8"));
  } catch (error) {
    return arm(
      "d",
      "pre-freeze-ruleset",
      "unreachable",
      `${rulesetPath} is present and does not parse as JSON: ${singleLine(error)}`,
    );
  }

  const present = [];
  for (const relativePath of inventoryPaths) {
    const mtime = mtimeOrNull(join(root, relativePath));
    if (mtime !== null) present.push({ relativePath, mtime });
  }
  if (present.length === 0) {
    return arm(
      "d",
      "pre-freeze-ruleset",
      "unreachable",
      "no retirement inventory is present, so the freshness comparison has " +
        "nothing to compare against; newer than nothing is a guard that cannot go red",
    );
  }
  let newest = present[0];
  for (const entry of present) if (entry.mtime > newest.mtime) newest = entry;
  if (rulesetMtime < newest.mtime) {
    return arm(
      "d",
      "pre-freeze-ruleset",
      "not-yet",
      `${rulesetPath} is older than ${newest.relativePath}`,
    );
  }
  return arm(
    "d",
    "pre-freeze-ruleset",
    "satisfied",
    `${rulesetPath} is present and is not older than ${newest.relativePath}`,
  );
}

/* ------------------------------------------------------------------ */
/* The report                                                          */
/* ------------------------------------------------------------------ */

export function overallFor(arms) {
  let worst = "satisfied";
  for (const entry of arms) {
    if (VERDICT_SEVERITY[entry.verdict] > VERDICT_SEVERITY[worst]) worst = entry.verdict;
  }
  if (worst === "satisfied") return OVERALL_VERDICTS[0];
  if (worst === "not-yet") return OVERALL_VERDICTS[1];
  return OVERALL_VERDICTS[2];
}

export function exitCodeFor(overall) {
  if (overall === OVERALL_VERDICTS[0]) return EXIT_SATISFIED;
  if (overall === OVERALL_VERDICTS[1]) return EXIT_NOT_SATISFIED;
  return EXIT_INDETERMINATE;
}

/**
 * EVERY ARM IS EVALUATED, always. No early return, no short-circuit.
 */
export function evaluate(options) {
  const root = options.root;
  return [
    armDrain(root),
    armExclusion(root, options.requiredBehaviors, options.exclusionTests),
    armRetirement(root),
    armRuleset(root),
  ];
}

const STEP_LINES = [
  "STEP 2 re-probe the pilot read-only: run `node scripts/probe-pilot-readonly.mjs`.",
  "  This script does NOT run it and does NOT report on it.",
  "STEP 3 owner reboot of the pilot session: HALT, OWNER ACTION.",
  "  This script cannot perform it, cannot observe it, and never reports it done.",
  "  Request an A-n id from delivery/STATE.md, which is the sole allocator, and",
  "  verify the reboot has not already happened before asking.",
  "STEP 4 run the exit test on the pilot and verify the evidence read-only:",
  "  blocked by step 3 and never unblocked by this script.",
];

export function render(arms, overall) {
  const lines = arms.map(
    (entry) => `ARM ${entry.id} ${entry.name} ${entry.verdict} -- ${entry.reason}`,
  );
  return lines
    .concat([
      `STEP 1 preconditions: ${overall}`,
      "",
    ])
    .concat(STEP_LINES)
    .concat([""])
    .join("\n");
}

export function parseArgs(argv) {
  const options = {
    root: defaultRoot,
    requiredBehaviors: REQUIRED_EXCLUSION_BEHAVIORS.slice(),
    exclusionTests: DEFAULT_EXCLUSION_TESTS.slice(),
    json: false,
  };
  let behaviorsOverridden = false;
  let testsOverridden = false;
  let i = 0;
  while (i < argv.length) {
    const argument = argv[i];
    if (argument === "--root") {
      options.root = resolve(process.cwd(), argv[i + 1] ?? "");
      i += 2;
    } else if (argument === "--require-behavior") {
      if (!behaviorsOverridden) {
        options.requiredBehaviors = [];
        behaviorsOverridden = true;
      }
      options.requiredBehaviors = options.requiredBehaviors.concat([argv[i + 1]]);
      i += 2;
    } else if (argument === "--exclusion-test") {
      if (!testsOverridden) {
        options.exclusionTests = [];
        testsOverridden = true;
      }
      options.exclusionTests = options.exclusionTests.concat([argv[i + 1]]);
      i += 2;
    } else if (argument === "--json") {
      options.json = true;
      i += 1;
    } else {
      return { usage: `unknown argument: ${argument}` };
    }
  }
  if (options.requiredBehaviors.some((name) => typeof name !== "string" || name.length === 0)) {
    return { usage: "--require-behavior needs a value" };
  }
  if (options.exclusionTests.some((path) => typeof path !== "string" || path.length === 0)) {
    return { usage: "--exclusion-test needs a value" };
  }
  return { options };
}

export function run(argv, streams = {}) {
  const out = streams.stdout ?? process.stdout;
  const err = streams.stderr ?? process.stderr;
  const parsed = parseArgs(argv);
  if (parsed.usage) {
    err.write(`check-cutover-entry: ${parsed.usage}\n`);
    return EXIT_USAGE;
  }
  const arms = evaluate(parsed.options);
  const overall = overallFor(arms);
  if (parsed.options.json) {
    out.write(
      `${JSON.stringify(
        {
          overall,
          arms,
          ownerAction: {
            step: 3,
            status: "blocked",
            reason: "the pilot reboot is an owner action; this script cannot observe it",
          },
        },
        null,
        2,
      )}\n`,
    );
  } else {
    out.write(render(arms, overall));
  }
  return exitCodeFor(overall);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = run(process.argv.slice(2));
}
