/**
 * THE CUTOVER-ENTRY TRIGGER TESTS (kernel plan M4, M4-P27 criteria 2, 3 and 4).
 *
 * THE DANGEROUS STATE EVERY WITNESS HERE REDDENS AGAINST is a trigger that
 * reports READY when it is not. The red-witness rule's stronger form is what
 * shapes this file: a test that is merely red against an absent feature is
 * worthless, so each witness names a state in which acting on the trigger's
 * answer would cause harm.
 *
 * The four shapes of that state, and where each is witnessed:
 *
 *   1. AN ARM GREENS BECAUSE IT COULD NOT REACH THE THING IT CHECKS. The CLI
 *      is absent, so the drain question was never asked. A two-state checker
 *      answers "false" and a careless one answers "true"; both are wrong, and
 *      the exit code must distinguish them.
 *   2. AN ARM GREENS ON AN EMPTY RESULT. A retirement report naming zero rows
 *      is not a report naming zero unported rows. A freshness comparison with
 *      nothing to compare against is a guard that cannot go red. An exclusion
 *      suite that runs zero tests exits 0.
 *   3. THE OWNER STEP IS TREATED AS DONE. The all-satisfied fixture is the
 *      dangerous one here: every computed arm holds, and a naive
 *      implementation prints a green light. It must halt.
 *   4. THE PROBE WRITES. Not "is intended not to write": the chokepoint is
 *      exercised against a scratch repository with a real pending commit and a
 *      real uncommitted edit, and against a stub server that counts requests.
 *
 * NOTHING HERE TOUCHES A SHIPPED FILE. Every fixture is built under a fresh
 * `mkdtempSync` root and removed afterwards, so no test mutates the repository
 * it is running inside. `git checkout --` in a tree holding uncommitted work is
 * destructive with no safe narrow form (CLAUDE.md standing warning 8), which is
 * also why the scratch repository below is the only place that verb appears.
 *
 * REGISTRY DISCIPLINE. The behaviors assertion at the end checks PRESENCE BY
 * NAME of this phase's rows and asserts no count over `test/behaviors.json`,
 * which is append-only and union-resolved (CLAUDE.md binding convention 5).
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const checkerPath = join(repoRoot, "scripts", "check-cutover-entry.mjs");
const probePath = join(repoRoot, "scripts", "probe-pilot-readonly.mjs");

interface ArmRecord {
  id: string;
  name: string;
  verdict: string;
  reason: string;
}

const checker = (await import(
  new URL("../scripts/check-cutover-entry.mjs", import.meta.url).href
)) as {
  ARM_VERDICTS: string[];
  OVERALL_VERDICTS: string[];
  REQUIRED_EXCLUSION_BEHAVIORS: string[];
  countRetirementRows: (text: string) => {
    ported: number;
    unported: number;
    rows: number;
    unrecognised: string[];
  };
  overallFor: (arms: ArmRecord[]) => string;
  childEnv: (kind: string) => Record<string, string | undefined>;
  EXIT_SATISFIED: number;
};

const probe = (await import(
  new URL("../scripts/probe-pilot-readonly.mjs", import.meta.url).href
)) as {
  ReadOnlyViolation: new (message: string) => Error;
  assertReadOnlyGit: (args: unknown) => void;
  readOnlyGit: (args: string[], options?: { cwd?: string; timeoutMs?: number }) => {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
  };
  readOnlyHttp: (url: string, options?: Record<string, unknown>) => Promise<Response>;
  overallVerdict: (results: { verdict: string }[]) => string;
  verdictForStatus: (status: number) => string;
  TARGET_VERDICTS: string[];
  gitChildEnv: () => Record<string, string | undefined>;
};

/* ------------------------------------------------------------------ */
/* Fixture construction                                                */
/* ------------------------------------------------------------------ */

const scratchRoots: string[] = [];

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of scratchRoots) rmSync(dir, { recursive: true, force: true });
});

interface RootSpec {
  /** Text the stub CLI prints for `cutover status`. `null` omits the CLI. */
  statusText?: string | null;
  statusExit?: number;
  /** Text the stub CLI prints on STDERR for `cutover status`. */
  statusStderr?: string;
  /** Text the stub CLI prints for `cutover status --retirement`. */
  retirementText?: string;
  retirementExit?: number;
  /** Text the stub CLI prints on STDERR for `cutover status --retirement`. */
  retirementStderr?: string;
  /** Behavior names to register. Defaults to the checker's required list. */
  behaviors?: string[];
  /** Body of the stub exclusion test file. */
  exclusionTestBody?: string;
  /** Write the pre-freeze ruleset. */
  ruleset?: boolean;
  /** Write a retirement inventory. */
  inventory?: boolean;
  /** Commit the ruleset BEFORE the inventory, so it is older by commit order. */
  rulesetStale?: boolean;
  /** Commit the ruleset and the inventory together, so their commit times are EQUAL. */
  rulesetSameCommit?: boolean;
  /** Leave the fixture as a plain directory with no git repository at all. */
  git?: boolean;
  /** Leave the ruleset modified after its commit, so the tree differs from it. */
  rulesetDirty?: boolean;
  /** Write the ruleset but never commit it, so it has no commit at all. */
  rulesetUncommitted?: boolean;
}

/**
 * THE FIXTURE IS A REAL GIT REPOSITORY, AND THAT IS THE FIX-ROUND'S LARGEST
 * SINGLE CHANGE TO THIS FILE.
 *
 * Arm d used to compare file mtimes, so a fixture could force it stale with
 * `utimesSync`. A clean-room reviewer measured that mtime is the wrong input in
 * both directions, and the sharpest half is that `utimesSync` back-dating is a
 * state GIT CANNOT PRODUCE: the old witness reddened against a situation no
 * clone is ever in, while the situation every clone IS in went unwitnessed.
 *
 * So the fixture now commits, and the ORDER of its commits is what the arm
 * reads. Dates are pinned rather than taken from the clock because `%ct` has
 * one-second resolution and two commits made in one test would otherwise be
 * equal by accident rather than by intent. Command-scoped identity only, never
 * user or global config (CLAUDE.md standing warning 5).
 */
const FIXTURE_GIT_ENV = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "tiphys@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "tiphys@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

const EARLIER = "2026-01-01T00:00:00+0000";
const LATER = "2026-01-02T00:00:00+0000";

function fixtureGit(cwd: string, args: string[], when?: string): void {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 60000,
    env: {
      ...process.env,
      ...FIXTURE_GIT_ENV,
      ...(when === undefined ? {} : { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when }),
    },
  });
  assert.equal(
    result.status,
    0,
    `fixture git ${args.join(" ")} failed: ${result.stdout ?? ""}${result.stderr ?? ""}`,
  );
}

/**
 * The five `SWITCH` lines M4-P25 criterion 1 fixes
 * (delivery/plan/kernel-plan-m4.md:3290). Fix round 2 made arm a read the WHOLE
 * report rather than only the lines carrying its own vocabulary, so a fixture
 * that prints one switch line is no longer a fixture imitating the real
 * command. The names are the criterion's own; the checker asserts the COUNT and
 * not the names, so they are here for realism rather than to be matched.
 */
const FIVE_SWITCHES =
  "SWITCH planning-and-scope kernel\n" +
  "SWITCH dispatch kernel\n" +
  "SWITCH review kernel\n" +
  "SWITCH gates kernel\n" +
  "SWITCH merge kernel\n";

const PASSING_TEST_BODY =
  'import test from "node:test";\n' +
  'test("a cross-environment exclusion witness", () => {});\n';

const VACUOUS_TEST_BODY = "// a file that registers no tests at all\n";

function stubCli(spec: RootSpec): string {
  const statusText = spec.statusText ?? `${FIVE_SWITCHES}DRAIN clean\n`;
  const statusExit = spec.statusExit ?? 0;
  const retirementText = spec.retirementText ?? "PORT claude-md ported\nPORT skills ported\n";
  const retirementExit = spec.retirementExit ?? 0;
  const statusStderr = spec.statusStderr ?? "";
  const retirementStderr = spec.retirementStderr ?? "";
  return [
    "const args = process.argv.slice(2);",
    'if (args[0] !== "cutover" || args[1] !== "status") {',
    '  process.stderr.write("unknown subcommand\\n");',
    "  process.exit(64);",
    "}",
    'if (args.includes("--retirement")) {',
    `  process.stdout.write(${JSON.stringify(retirementText)});`,
    `  process.stderr.write(${JSON.stringify(retirementStderr)});`,
    `  process.exit(${retirementExit});`,
    "}",
    `process.stdout.write(${JSON.stringify(statusText)});`,
    `process.stderr.write(${JSON.stringify(statusStderr)});`,
    `process.exit(${statusExit});`,
    "",
  ].join("\n");
}

function makeRoot(spec: RootSpec = {}): string {
  const root = scratch("tiphys-cutover-entry-");
  if (spec.statusText !== null) {
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(join(root, "bin", "tiphys.ts"), stubCli(spec), "utf8");
  }

  mkdirSync(join(root, "test"), { recursive: true });
  const names = spec.behaviors ?? checker.REQUIRED_EXCLUSION_BEHAVIORS;
  const behaviors: Record<string, string> = {};
  for (const name of names) behaviors[name] = `fixture row for ${name}`;
  writeFileSync(join(root, "test", "behaviors.json"), JSON.stringify(behaviors, null, 2), "utf8");
  writeFileSync(
    join(root, "test", "cross-environment.test.ts"),
    spec.exclusionTestBody ?? PASSING_TEST_BODY,
    "utf8",
  );

  const cutoverDir = join(root, "delivery", "plan", "cutover");
  mkdirSync(cutoverDir, { recursive: true });
  if (spec.inventory !== false) {
    writeFileSync(
      join(cutoverDir, "retirement-inventory.json"),
      JSON.stringify({ rows: [{ id: "PORT-1" }] }, null, 2),
      "utf8",
    );
  }
  const rulesetPath = join(cutoverDir, "pre-freeze-ruleset.json");
  if (spec.ruleset !== false) {
    writeFileSync(rulesetPath, JSON.stringify({ capturedAt: "fixture" }, null, 2), "utf8");
  }

  if (spec.git !== false) {
    fixtureGit(root, ["init", "--quiet", "--initial-branch", "main"]);
    const rulesetRelative = "delivery/plan/cutover/pre-freeze-ruleset.json";
    const inventoryRelative = "delivery/plan/cutover/retirement-inventory.json";
    if (spec.rulesetUncommitted === true) {
      fixtureGit(root, ["add", "-A", ":!" + rulesetRelative]);
      fixtureGit(root, ["commit", "--quiet", "-m", "fixture, ruleset left untracked"], EARLIER);
    } else if (spec.ruleset === false || spec.rulesetSameCommit === true) {
      fixtureGit(root, ["add", "-A"]);
      fixtureGit(root, ["commit", "--quiet", "-m", "fixture"], EARLIER);
    } else if (spec.rulesetStale === true) {
      // The ruleset lands FIRST and the inventory LAST, so the inventory is the
      // newer change and the arm must say not-yet.
      fixtureGit(root, ["add", "-A", ":!" + inventoryRelative]);
      fixtureGit(root, ["commit", "--quiet", "-m", "fixture, ruleset first"], EARLIER);
      if (spec.inventory !== false) {
        fixtureGit(root, ["add", "-A"]);
        fixtureGit(root, ["commit", "--quiet", "-m", "fixture, inventory later"], LATER);
      }
    } else {
      fixtureGit(root, ["add", "-A", ":!" + rulesetRelative]);
      fixtureGit(root, ["commit", "--quiet", "-m", "fixture, everything else"], EARLIER);
      fixtureGit(root, ["add", "-A"]);
      fixtureGit(root, ["commit", "--quiet", "-m", "fixture, ruleset last"], LATER);
    }
    if (spec.rulesetDirty === true) {
      writeFileSync(rulesetPath, JSON.stringify({ capturedAt: "edited" }, null, 2), "utf8");
    }
  }
  return root;
}

interface RunResult {
  status: number | null;
  text: string;
}

function runChecker(root: string, extra: string[] = []): RunResult {
  const result = spawnSync(
    process.execPath,
    [checkerPath, "--root", root, "--exclusion-test", "test/cross-environment.test.ts", ...extra],
    { encoding: "utf8", timeout: 300000 },
  );
  return { status: result.status, text: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function armOf(text: string, id: string): string {
  const match = new RegExp(`^ARM ${id} \\S+ (\\S+) -- (.*)$`, "m").exec(text);
  assert.ok(match !== null, `no ARM ${id} line in:\n${text}`);
  return `${match[1]}|${match[2]}`;
}

/* ------------------------------------------------------------------ */
/* The checker                                                         */
/* ------------------------------------------------------------------ */

test("all four arms satisfied exits 0 and still halts at the owner action", () => {
  const root = makeRoot();
  const run = runChecker(root);
  assert.equal(run.status, 0, run.text);
  for (const id of ["a", "b", "c", "d"]) {
    assert.match(armOf(run.text, id), /^satisfied\|/, `arm ${id} in:\n${run.text}`);
  }
  assert.match(run.text, /STEP 1 preconditions: preconditions-satisfied-owner-action-pending/);

  // THE DANGEROUS STATE. Every computed arm holds. This is exactly the input
  // on which a trigger reports READY, and it must not.
  assert.match(run.text, /STEP 3 owner reboot of the pilot session: HALT, OWNER ACTION\./);
  assert.match(run.text, /never reports it done/);
  assert.match(run.text, /STEP 4[\s\S]*blocked by step 3/);
  for (const forbidden of [/\bREADY\b/, /\bGO\b/, /\bPROCEED\b/, /cutover may (begin|proceed)/i]) {
    assert.doesNotMatch(run.text, forbidden, `a ready-token reached the output:\n${run.text}`);
  }
});

test("the drain arm reddens when cutover status does not report DRAIN clean", () => {
  // `statusExit` was the default 0 here until the fix round, and the fixture
  // was INCOHERENT with the contract it stands in for: M4-P25 criterion 1 makes
  // the command exit 0 "only when all five read `kernel` AND drain is clean"
  // (delivery/plan/kernel-plan-m4.md:3291). The arm now reports that
  // contradiction as unreachable, so the fixture has to imitate the real
  // command rather than a command that cannot exist.
  const root = makeRoot({
    statusText: `${FIVE_SWITCHES}DRAIN 3 in flight\n`,
    statusExit: 1,
  });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "a"), /^not-yet\|.*DRAIN 3 in flight/);
});

test("the exclusion arm reddens when a required behavior name does not resolve", () => {
  const required = checker.REQUIRED_EXCLUSION_BEHAVIORS;
  const root = makeRoot({ behaviors: required.slice(1) });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "b"), new RegExp(`^not-yet\\|.*${required[0]}`));
});

test("the retirement arm reddens while any row is unported", () => {
  const root = makeRoot({
    retirementText: "PORT claude-md ported\nPORT skills unported\nPORT next-mjs unported\n",
    retirementExit: 1,
  });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "c"), /^not-yet\|2 of 3 retirement row\(s\) are unported/);
});

test("the ruleset arm reddens when the pre-freeze ruleset is stale", () => {
  const root = makeRoot({ rulesetStale: true });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "d"), /^not-yet\|.*is older than/);
});

test("every arm is evaluated: four simultaneous failures are all reported", () => {
  // A checker that returns on its first failing arm is green on the other
  // three, which is the shape M4-P27 criterion 2 names when it asks for four
  // independently forced-false witnesses rather than two.
  const root = makeRoot({
    statusText: `${FIVE_SWITCHES}DRAIN 9 in flight\n`,
    statusExit: 1,
    behaviors: [],
    retirementText: "PORT claude-md unported\n",
    // The exit code was 0 here until the fix round, and that fixture was
    // INCOHERENT with the contract it stands in for: M4-P25 criterion 6 makes
    // the command exit nonzero while any row is unported
    // (delivery/plan/kernel-plan-m4.md:3317). The arm now says so, and a fixture
    // that contradicts the contract it imitates is not a fixture worth keeping.
    retirementExit: 1,
    ruleset: false,
  });
  const run = runChecker(root);
  assert.notEqual(run.status, 0, run.text);
  assert.match(armOf(run.text, "a"), /^not-yet\|.*DRAIN 9 in flight/);
  assert.match(armOf(run.text, "b"), /^not-yet\|/);
  assert.match(armOf(run.text, "c"), /^not-yet\|1 of 1 retirement row/);
  assert.match(armOf(run.text, "d"), /^not-yet\|.*is absent/);
});

test("an unreachable CLI is unreachable, never satisfied, and exits 3 rather than 1", () => {
  // THE DANGEROUS STATE: the drain question was never asked. A two-state
  // classifier reports "false" and loses the distinction that matters, and the
  // measured reason it matters is that a transport failure exits nonzero too
  // (delivery/verification/m4-prototype-probes.md:153).
  const root = makeRoot({ statusText: null });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*no CLI entry at/);
  assert.match(armOf(run.text, "c"), /^unreachable\|/);
  assert.match(run.text, /STEP 1 preconditions: preconditions-indeterminate/);
});

test("a retirement report naming zero rows is unreachable, never satisfied", () => {
  // THE DANGEROUS STATE: zero rows reads as zero bad rows. The command exits 0
  // and says nothing, and the arm must not turn that into a pass.
  const root = makeRoot({ retirementText: "", retirementExit: 0 });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "c"), /^unreachable\|.*zero rows is not zero unported rows/);
});

test("a freshness comparison with no inventory present is unreachable, never satisfied", () => {
  // THE DANGEROUS STATE: "newer than the most recent inventory change" is
  // vacuously true when there is no inventory, so the arm would be green for
  // every ruleset file that exists at all.
  const root = makeRoot({ inventory: false });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "d"), /^unreachable\|.*cannot go red/);
});

test("an exclusion suite that runs zero tests is not-yet, because exit 0 asserts nothing", () => {
  const root = makeRoot({ exclusionTestBody: VACUOUS_TEST_BODY });
  const run = runChecker(root);
  // THE DANGEROUS STATE, and it bit this very arm. Measured 2026-09-16 on node
  // v22.22.2: a file registering no tests reports `ok 1 - <file path>` and
  // `# pass 1`, so "pass count above zero" is itself a guard that cannot go
  // red. The arm must require a passing subtest whose NAME is not the file's.
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "b"), /^not-yet\|.*registered no named test/);
});

test("a cutover status that prints no DRAIN line is unreachable, never satisfied", () => {
  // THE DANGEROUS STATE: the command RAN and exited 0, and said nothing about
  // drain. A checker reading "exit 0" as "drain is clean" is green on a command
  // that never answered the question.
  const root = makeRoot({ statusText: "SWITCH planning-and-scope kernel\n", statusExit: 0 });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*printed no DRAIN line/);
});

test("an exclusion suite with a failing test is not-yet", () => {
  const root = makeRoot({
    exclusionTestBody:
      'import test from "node:test";\n' +
      'test("ok", () => {});\n' +
      'test("broken", () => { throw new Error("forced"); });\n',
  });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "b"), /^not-yet\|.*1 failing test/);
});

test("the checker's overall vocabulary is closed and no member means ready", () => {
  assert.deepEqual(checker.ARM_VERDICTS, ["satisfied", "not-yet", "unreachable", "refused"]);
  assert.equal(checker.OVERALL_VERDICTS.length, 3);
  for (const word of checker.OVERALL_VERDICTS) {
    assert.doesNotMatch(word, /\b(ready|go|green|proceed|clear)\b/i, word);
  }
  // Indeterminate dominates a real negative: "I could not tell" is not "no".
  const indeterminate = checker.overallFor([
    { id: "a", name: "drain", verdict: "not-yet", reason: "" },
    { id: "b", name: "exclusion", verdict: "unreachable", reason: "" },
  ]);
  assert.equal(indeterminate, "preconditions-indeterminate");
});

test("countRetirementRows never counts an unported row as ported", () => {
  const counts = checker.countRetirementRows("PORT a ported\nPORT b unported\nPORT c unported\n");
  assert.deepEqual(counts, { ported: 1, unported: 2, rows: 3, unrecognised: [] });
});

test("the checker exits 64 on an unknown argument", () => {
  const result = spawnSync(process.execPath, [checkerPath, "--nope"], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(result.status, 64);
  assert.match(`${result.stderr}`, /unknown argument: --nope/);
});

/* ------------------------------------------------------------------ */
/* The probe: the read-only boundary                                   */
/* ------------------------------------------------------------------ */

const gitEnv = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "tiphys@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "tiphys@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, args: string[]): { status: number | null; text: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, ...gitEnv },
  });
  return { status: result.status, text: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function digestOf(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** A repository with a commit, and an uncommitted edit on top of it. */
function scratchRepoWithPendingWork(): { dir: string; file: string } {
  const dir = scratch("tiphys-probe-repo-");
  assert.equal(git(dir, ["init", "--quiet", "--initial-branch", "main"]).status, 0);
  const file = join(dir, "tracked.txt");
  writeFileSync(file, "committed content\n", "utf8");
  assert.equal(git(dir, ["add", "tracked.txt"]).status, 0);
  assert.equal(git(dir, ["commit", "--quiet", "-m", "base"]).status, 0);
  writeFileSync(file, "uncommitted edit that a wipe would destroy\n", "utf8");
  return { dir, file };
}

test("the git chokepoint refuses a mutating operation and the repository is unchanged", () => {
  // THE DANGEROUS STATE, and it is real rather than notional: the repository
  // has a stageable change that `commit -a` WOULD commit, and an uncommitted
  // edit that `checkout --` WOULD destroy. Both verbs are handed to the
  // chokepoint. Member A creates history; member B destroys working-tree
  // content. They are structurally different limbs of one class.
  const { dir, file } = scratchRepoWithPendingWork();
  const headBefore = git(dir, ["rev-parse", "HEAD"]).text.trim();
  const statusBefore = git(dir, ["status", "--porcelain"]).text;
  const digestBefore = digestOf(file);

  // Both calls are made and their outcomes COLLECTED rather than asserted
  // inline, so that the assertions below run in the order that matters. The
  // STATE assertions come first on purpose: with the allowlist removed, the
  // first thing that fails must be "the repository changed", not "no exception
  // was thrown". A witness whose first failure is the absent guard is red
  // against the absent feature; this one is red against the harm.
  const outcomes: { operation: string; threw: string | null }[] = [];
  for (const argv of [
    ["commit", "-a", "-m", "this must never land"],
    ["checkout", "--", "tracked.txt"],
  ]) {
    let threw: string | null = null;
    try {
      probe.readOnlyGit(argv, { cwd: dir });
    } catch (error) {
      threw = (error as Error).name;
    }
    outcomes.push({ operation: argv[0], threw });
  }

  assert.equal(
    git(dir, ["rev-parse", "HEAD"]).text.trim(),
    headBefore,
    "the probe created a commit in the scratch repository",
  );
  assert.equal(
    digestOf(file),
    digestBefore,
    "the probe altered the uncommitted edit in the scratch repository",
  );
  assert.equal(git(dir, ["status", "--porcelain"]).text, statusBefore);
  assert.deepEqual(outcomes, [
    { operation: "commit", threw: "ReadOnlyViolation" },
    { operation: "checkout", threw: "ReadOnlyViolation" },
  ]);
});

test("the git chokepoint refuses a clone that does not carry a depth of one", () => {
  assert.throws(
    () => probe.assertReadOnlyGit(["clone", "https://example.invalid/x.git", "/tmp/nope"]),
    (error: Error) => /--depth 1/.test(error.message),
  );
  assert.doesNotThrow(() =>
    probe.assertReadOnlyGit(["clone", "--depth", "1", "https://example.invalid/x.git", "/tmp/ok"]),
  );
  assert.doesNotThrow(() => probe.assertReadOnlyGit(["ls-remote", "https://example.invalid/x.git"]));
});

test("the git chokepoint refuses an empty and a non-string argument list", () => {
  assert.throws(() => probe.assertReadOnlyGit([]), /empty argument list/);
  assert.throws(() => probe.assertReadOnlyGit([{}]), /non-string argument/);
});

test("the http chokepoint refuses a request-shaping option and issues nothing", async () => {
  // THE DANGEROUS STATE: a caller steering the request into a write. The
  // assertion is not only that the call throws, but that the server RECEIVED
  // NOTHING, which is what distinguishes "refused before issuing" from
  // "issued and then complained".
  const received: string[] = [];
  const server = createServer((request, response) => {
    received.push(`${request.method} ${request.url}`);
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    // Outcomes collected, then the SERVER's record asserted first, for the
    // same reason as the git witness above: the first failure under a defanged
    // chokepoint must be "the request reached the server".
    const outcomes: (string | null)[] = [];
    for (const shaping of [{ method: "PATCH" }, { body: "x" }, { redirect: "follow" }]) {
      try {
        const response = await probe.readOnlyHttp(`${base}/anything`, shaping);
        await response.text();
        outcomes.push(null);
      } catch (error) {
        outcomes.push((error as Error).name);
      }
    }
    assert.deepEqual(received, [], `requests reached the server: ${received.join(", ")}`);
    assert.deepEqual(outcomes, ["ReadOnlyViolation", "ReadOnlyViolation", "ReadOnlyViolation"]);

    // The control: the permitted shape DOES reach the server, so the zero
    // above is the refusal working and not a broken fixture.
    const response = await probe.readOnlyHttp(`${base}/allowed`, { timeoutMs: 5000 });
    assert.equal(response.status, 200);
    await response.text();
    assert.deepEqual(received, ["GET /allowed"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("the probe source carries zero occurrences of every write verb", () => {
  const source = readFileSync(probePath, "utf8");
  const forbidden: [string, RegExp][] = [
    ["POST", /\bPOST\b/g],
    ["PATCH", /\bPATCH\b/g],
    ["PUT", /\bPUT\b/g],
    ["DELETE", /\bDELETE\b/g],
    ["post", /\bpost\b/gi],
    ["patch", /\bpatch\b/gi],
    ["put", /\bput\b/gi],
    ["delete", /\bdelete\b/gi],
    ["push", /\bpush\b/gi],
    ["gh pr", /\bgh\s+pr\b/gi],
    ["gh issue", /\bgh\s+issue\b/gi],
  ];
  for (const [label, pattern] of forbidden) {
    const hits = source.match(pattern) ?? [];
    assert.equal(hits.length, 0, `${label} occurs ${hits.length} time(s) in ${probePath}`);
  }
  // The control that keeps this test honest: the same patterns DO fire on a
  // string that contains the verbs, so a zero above is the source being clean
  // and not the regexes being broken.
  const control = "POST PATCH PUT DELETE items.push(1) gh pr create gh issue list";
  for (const [label, pattern] of forbidden) {
    assert.ok((control.match(pattern) ?? []).length > 0, `${label} pattern never fires`);
  }
});

test("the probe has exactly one child-process call site and one request call site", () => {
  // A grep over verbs and an allowlist over operations fail differently
  // (M4-P27 criterion 3), and both are defeated by a SECOND call site that
  // bypasses the chokepoint. This counts them.
  const source = readFileSync(probePath, "utf8");
  assert.equal((source.match(/spawnSync\(/g) ?? []).length, 1);
  assert.equal((source.match(/(?<![.\w])fetch\(/g) ?? []).length, 1);
  // The import line is the other half: a second way to start a child process
  // would have to be imported, and only one binding is.
  const imports = /import\s*\{([^}]*)\}\s*from\s*"node:child_process";/.exec(source);
  assert.ok(imports !== null, "no node:child_process import found");
  assert.deepEqual(
    imports[1].split(",").map((name) => name.trim()).filter((name) => name.length > 0),
    ["spawnSync"],
  );
  assert.equal((source.match(/node:child_process/g) ?? []).length, 1);
});

/* ------------------------------------------------------------------ */
/* The probe: the failure arm                                          */
/* ------------------------------------------------------------------ */

interface StubRoute {
  status: number;
  body: string;
}

async function withStubApi(
  routes: Record<string, StubRoute>,
  body: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    const route = routes[request.url ?? ""] ?? { status: 404, body: '{"message":"Not Found"}' };
    response.writeHead(route.status, { "content-type": "application/json" });
    response.end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  try {
    await body(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** A bare repository with one commit, reachable by `git ls-remote`. */
function bareRemote(owner: string, name: string): string {
  const base = scratch("tiphys-probe-remote-");
  const seed = join(base, "seed");
  mkdirSync(seed, { recursive: true });
  assert.equal(git(seed, ["init", "--quiet", "--initial-branch", "main"]).status, 0);
  writeFileSync(join(seed, "a.txt"), "seed\n", "utf8");
  assert.equal(git(seed, ["add", "a.txt"]).status, 0);
  assert.equal(git(seed, ["commit", "--quiet", "-m", "seed"]).status, 0);
  const bare = join(base, owner, name);
  mkdirSync(dirname(bare), { recursive: true });
  assert.equal(git(base, ["clone", "--bare", "--quiet", seed, bare]).status, 0);
  return base;
}

/**
 * ASYNCHRONOUS ON PURPOSE. `spawnSync` here would block the test process's own
 * event loop, so the stub server below could never accept a connection and
 * every arm would fail for a reason that has nothing to do with the subject.
 * That exact harness defect is on the record at
 * delivery/verification/m4-prototype-probes.md:286, and it was reproduced here
 * before being fixed: the first version of this helper used `spawnSync` and
 * every stub-server test failed with a fetch timeout.
 */
function runProbe(args: string[]): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [probePath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      text += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      text += chunk;
    });
    child.on("close", (status) => resolveRun({ status, text }));
  });
}

function probeOut(): string {
  return join(scratch("tiphys-probe-out-"), "pulse-re-probe.md");
}

const REPO_BODY = JSON.stringify({
  full_name: "owner/name",
  default_branch: "main",
  visibility: "public",
  updated_at: "2026-09-16T00:00:00Z",
});

test("a 200 carrying an empty body is unreachable, never a clean probe", async () => {
  // THE DANGEROUS STATE: the remote answers, so a status-only classifier calls
  // it a read. The body establishes nothing. This repository has been bitten
  // three times by an empty result indistinguishable from an absence.
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi(
    {
      "/repos/owner/name": { status: 200, body: "{}" },
      "/repos/owner/name/commits?per_page=1": { status: 200, body: "[]" },
    },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 3, run.text);
      assert.match(run.text, /TARGET owner\/name unreachable/);
      const document = readFileSync(out, "utf8");
      assert.match(document, /no full_name/);
      assert.match(document, /an empty answer is not a clean one/);
      assert.match(document, /### What was NOT established/);
      assert.doesNotMatch(document, /OVERALL satisfied/);
    },
  );
});

test("an absent repository is a real negative and is not reported as clean", async () => {
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi({}, async (base) => {
    const run = await runProbe([
      "--api-base", base, "--git-base", remote, "--repo", "owner/name",
      "--out", out, "--timeout-ms", "10000",
    ]);
    assert.equal(run.status, 1, run.text);
    assert.match(run.text, /TARGET owner\/name not-yet/);
    assert.match(readFileSync(out, "utf8"), /answered HTTP 404/);
  });
});

test("a refusal is classified apart from a real negative", async () => {
  // 403 and 404 are both nonzero and they mean opposite things. Collapsing
  // them is how "the pilot is not there" gets reported for "this session may
  // not read the pilot", which is a measured state of this container.
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi(
    { "/repos/owner/name": { status: 403, body: '{"message":"not enabled for this session"}' } },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 3, run.text);
      assert.match(run.text, /TARGET owner\/name refused/);
      assert.equal(probe.verdictForStatus(403), "refused");
      assert.equal(probe.verdictForStatus(404), "not-yet");
      assert.equal(probe.verdictForStatus(500), "unreachable");
      assert.equal(probe.verdictForStatus(418), "unreachable");
    },
  );
});

test("an unreachable api exits 3 and the evidence document records the reason", async () => {
  // The beacon half of criterion 4: the document exists and carries the reason
  // even though nothing was read.
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  const run = await runProbe([
    "--api-base", "http://127.0.0.1:1", "--git-base", remote, "--repo", "owner/name",
    "--out", out, "--timeout-ms", "5000",
  ]);
  assert.equal(run.status, 3, run.text);
  const document = readFileSync(out, "utf8");
  assert.match(document, /transport failure reading/);
  assert.match(document, /OVERALL unreachable/);
  assert.match(document, /is NOT a clean probe/);
});

test("all three sources read exits 0 and the document records both heads", async () => {
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  const head = git(join(remote, "owner", "name"), ["rev-parse", "HEAD"]).text.trim();
  await withStubApi(
    {
      "/repos/owner/name": { status: 200, body: REPO_BODY },
      "/repos/owner/name/commits?per_page=1": { status: 200, body: JSON.stringify([{ sha: head }]) },
    },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 0, run.text);
      const document = readFileSync(out, "utf8");
      assert.match(document, new RegExp(`head \`${head.slice(0, 7)}\``));
      assert.match(document, new RegExp(`git ref \`${head.slice(0, 7)}\``));
      assert.match(document, /OVERALL satisfied/);
    },
  );
});

test("a refused transport does not discard a working one from the breakdown", async () => {
  // Measured against the real pilot on 2026-09-16: the REST path answered
  // HTTP 403 while `git ls-remote` answered the head sha with exit 0. A probe
  // that returns on its first non-satisfied source throws away the source that
  // worked, which is the same defect as a checker short-circuiting on its
  // first failing arm.
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi(
    { "/repos/owner/name": { status: 403, body: '{"message":"refused"}' } },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 3, run.text);
      const document = readFileSync(out, "utf8");
      assert.match(document, /gitRef=satisfied/);
      assert.match(document, /record=refused/);
    },
  );
});

test("a head disagreement between the two transports establishes neither", async () => {
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi(
    {
      "/repos/owner/name": { status: 200, body: REPO_BODY },
      "/repos/owner/name/commits?per_page=1": {
        status: 200,
        body: JSON.stringify([{ sha: "0000000000000000000000000000000000000000" }]),
      },
    },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 3, run.text);
      assert.match(readFileSync(out, "utf8"), /the two transports disagree/);
    },
  );
});

test("zero targets probed is a failure, not a clean sweep", () => {
  assert.equal(probe.overallVerdict([]), "unreachable");
  assert.deepEqual(probe.TARGET_VERDICTS, ["satisfied", "not-yet", "unreachable", "refused"]);
  assert.equal(probe.overallVerdict([{ verdict: "satisfied" }, { verdict: "refused" }]), "refused");
  assert.equal(
    probe.overallVerdict([{ verdict: "not-yet" }, { verdict: "unreachable" }]),
    "unreachable",
  );
});

test("the probe exits 64 on an unknown argument", async () => {
  const run = await runProbe(["--nope"]);
  assert.equal(run.status, 64);
  assert.match(run.text, /unknown argument: --nope/);
});

/* ------------------------------------------------------------------ */
/* The entry-trigger document                                          */
/* ------------------------------------------------------------------ */

test("the entry-trigger document states the four steps, the reserve and the residual", () => {
  const document = readFileSync(
    join(repoRoot, "delivery", "plan", "cutover", "entry-trigger.md"),
    "utf8",
  );
  for (const step of ["## Step 1", "## Step 2", "## Step 3", "## Step 4"]) {
    assert.ok(document.includes(step), `missing ${step}`);
  }
  assert.ok(document.includes("node scripts/check-cutover-entry.mjs"));
  assert.ok(document.includes("node scripts/probe-pilot-readonly.mjs"));
  // Criterion 5: the amendment option is in reserve with a raised bar, cited.
  assert.match(document, /amendment option[\s\S]{0,400}reserve/i);
  assert.ok(document.includes("DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:69"));
  // Criterion 6: the residual is named rather than implied.
  assert.match(document, /## What this trigger does NOT settle/);
  assert.ok(document.includes("DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:93"));
});

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

/**
 * THE GUARD THAT COULD NOT GO RED, AND IT GUARDED THIS PHASE'S OWN REGISTRY.
 *
 * As first written this test asserted `Object.hasOwn(behaviors, id)` and
 * nothing else, so it was green whenever the KEY existed, whatever its VALUE
 * said. `test/behaviors.json` maps an id to the EXACT NAME of the test that
 * guards it, and the `suite` gate resolves a row by a byte-identical lookup of
 * that VALUE against the names the runner reported (src/gates/suite.ts:1060):
 * there is no id-to-test lookup anywhere, so a paraphrase is permanently
 * unresolvable however well the test passes.
 *
 * Measured by running the required `suite` gate, which neither the phase nor
 * fix round 1 had run: 49 of this phase's rows registered a DESCRIPTION rather
 * than the test's name, 29 `cutover-entry-*` and 20 `pilot-probe-*`. The
 * registration test was green throughout, and so was every full `node --test`
 * run in the work history.
 *
 * A sibling phase paid for the identical weak predicate and wrote the guard
 * this one now matches, on `main` at test/cutover.test.ts:1659. This test
 * asserts the property the key check only appeared to: every id below resolves
 * BY NAME to a `test()` that exists. It reads the test sources rather than the
 * running suite because a test cannot enumerate its own run, and the `suite`
 * gate does the runtime half.
 *
 * MEMBER A of the class is a row whose value matches no test. MEMBER B is the
 * weaker predicate itself, an assertion over ids rather than over names.
 */
test("this phase's new behaviors are registered in test/behaviors.json", () => {
  // BY NAME, never by count: `test/behaviors.json` is append-only and resolved
  // as a union against the merge base, so a count is a claim about every
  // future phase and is false the moment the next one appends.
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  const ids = [
    "cutover-entry-all-arms-satisfied-halts-at-owner-action",
    "cutover-entry-drain-arm-reddens",
    "cutover-entry-exclusion-arm-reddens",
    "cutover-entry-retirement-arm-reddens",
    "cutover-entry-ruleset-arm-reddens",
    "cutover-entry-evaluates-every-arm",
    "cutover-entry-unreachable-is-not-satisfied",
    "cutover-entry-zero-retirement-rows-is-unreachable",
    "cutover-entry-vacuous-freshness-is-unreachable",
    "cutover-entry-vacuous-exclusion-suite-is-not-yet",
    "cutover-entry-absent-drain-line-is-unreachable",
    "cutover-entry-failing-exclusion-suite-is-not-yet",
    "cutover-entry-overall-vocabulary-has-no-ready",
    "cutover-entry-unported-never-counted-as-ported",
    "cutover-entry-usage-error",
    "cutover-entry-drain-notice-defeats-a-drain-row",
    "cutover-entry-two-drain-rows-are-unreachable",
    "cutover-entry-exit-zero-contradicting-drain-is-unreachable",
    "cutover-entry-retirement-summary-line-is-not-a-row",
    "cutover-entry-exit-zero-contradicting-unported-row-is-unreachable",
    "cutover-entry-ruleset-freshness-ignores-mtime",
    "cutover-entry-ruleset-freshness-survives-a-clone",
    "cutover-entry-ruleset-equal-commit-time-is-not-newer",
    "cutover-entry-ruleset-uncommitted-edit-is-unreachable",
    "cutover-entry-ruleset-without-git-is-unreachable",
    "cutover-entry-ruleset-untracked-is-named-as-untracked",
    "cutover-entry-json-mode-carries-the-halt",
    "cutover-entry-root-flag-needs-a-value",
    "pilot-probe-refuses-to-truncate-existing-evidence",
    "pilot-probe-refuses-truncation-on-the-success-path",
    "pilot-probe-target-cannot-inject-an-evidence-row",
    "pilot-probe-unexpected-failure-is-indeterminate",
    "pilot-probe-flag-without-a-value-is-usage",
    "pilot-probe-git-chokepoint-refuses-mutation",
    "pilot-probe-git-chokepoint-requires-shallow-clone",
    "pilot-probe-git-chokepoint-refuses-malformed-argv",
    "pilot-probe-http-chokepoint-refuses-request-shaping",
    "pilot-probe-source-has-no-write-verbs",
    "pilot-probe-single-child-and-request-call-sites",
    "pilot-probe-empty-body-is-not-clean",
    "pilot-probe-absent-repository-is-a-real-negative",
    "pilot-probe-refused-is-distinct-from-not-yet",
    "pilot-probe-unreachable-records-the-reason",
    "pilot-probe-reads-all-three-sources",
    "pilot-probe-keeps-the-working-transport-in-the-breakdown",
    "pilot-probe-head-disagreement-establishes-neither",
    "pilot-probe-zero-targets-is-a-failure",
    "pilot-probe-usage-error",
    "cutover-entry-document-states-the-four-steps",
    // Fix round 2.
    "cutover-entry-child-env-excludes-an-inherited-reporter",
    "cutover-entry-child-env-excludes-an-inherited-import",
    "cutover-entry-child-env-excludes-an-inherited-git-dir",
    "cutover-entry-child-env-is-an-allowlist",
    "cutover-entry-drain-arm-reads-the-whole-report",
    "cutover-entry-drain-arm-survives-a-crash-with-no-vocabulary",
    "cutover-entry-retirement-arm-reads-the-whole-report",
    "cutover-entry-retirement-nonzero-exit-with-nothing-unported-is-unreachable",
    "cutover-entry-status-nonzero-exit-with-everything-clean-is-unreachable",
    "cutover-entry-switch-row-count-is-fixed-at-five",
    "cutover-entry-shallow-clone-cannot-date-arm-d",
  ];
  const testNames = new Set<string>();
  const testDir = join(repoRoot, "test");
  for (const entry of readdirSync(testDir)) {
    if (!entry.endsWith(".test.ts")) continue;
    const body = readFileSync(join(testDir, entry), "utf8");
    for (const match of body.matchAll(/\btest\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) {
      testNames.add(match[2] as string);
    }
  }
  // The scan's own control: if the regex stopped matching, every assertion
  // below would be red rather than quietly vacuous, but a named failure is
  // cheaper to read than fifty.
  assert.ok(
    testNames.size > 100,
    `the test-name scan found only ${testNames.size} names, so it is not reading the suite`,
  );

  const unregistered: string[] = [];
  const unresolved: string[] = [];
  for (const id of ids) {
    if (!Object.prototype.hasOwnProperty.call(behaviors, id)) {
      unregistered.push(id);
      continue;
    }
    if (!testNames.has(behaviors[id] as string)) {
      unresolved.push(`${id} -> ${JSON.stringify(behaviors[id])}`);
    }
  }
  assert.deepEqual(unregistered, [], `behaviors.json does not register ${unregistered.length} id(s)`);
  assert.deepEqual(
    unresolved,
    [],
    `${unresolved.length} of ${ids.length} registered rows name no test:\n  ${unresolved.join("\n  ")}`,
  );
});

/* ------------------------------------------------------------------ */
/* Fix round 1: the shape rule, the commit-order arm, and the writes   */
/* ------------------------------------------------------------------ */

/**
 * ONE MECHANISM, WITNESSED ACROSS ITS MEMBERS.
 *
 * Fix round 1 was opened on eleven clean-room findings. Seven of them are one
 * mechanism: A WRITE OR A VERDICT WHOSE SCOPE IS WIDER OR NARROWER THAN THE
 * SENTENCE DESCRIBING IT, WITH NO TEST OVER THE DIFFERENCE. The witnesses below
 * are grouped by member rather than by finding, because a witness per finding is
 * what produced a defect per finding the first time.
 *
 * Every one of them was demonstrated RED against the state shipped at 4e95204,
 * by running the same assertion with that version of the script restored into a
 * mutation lab. The captures are in delivery/work-history/m4-p27.md:1195.
 */

test("a DRAIN clean line is not believed when the report says it is stale", () => {
  // THE DANGEROUS STATE, and it is the reviewer's measured one: the command
  // printed a drain number AND said the number was not to be trusted. The old
  // arm read the first matching line and ignored the rest, so it answered
  // `satisfied` on a report the command itself disowned.
  const root = makeRoot({
    statusText:
      `${FIVE_SWITCHES}DRAIN clean\n` +
      "ERROR: could not read the drain register, the numbers above are stale\n",
    statusExit: 1,
  });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*contract does not fix/);
  assert.match(armOf(run.text, "a"), /could not read the drain register/);
  assert.doesNotMatch(run.text, /ARM a drain satisfied/, run.text);
});

test("two DRAIN lines are unreachable, because the first of several is not an answer", () => {
  // A STRUCTURALLY DIFFERENT MEMBER of the same shape rule: not an extra line
  // ABOUT drain, but an extra DRAIN ROW that contradicts the first. The old
  // `/m` exec silently took the first and reported a confident verdict.
  const root = makeRoot({
    statusText: `${FIVE_SWITCHES}DRAIN clean\nDRAIN 4 in flight\n`,
    statusExit: 1,
  });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*2 DRAIN lines/);
});

test("a cutover status exiting 0 under a DRAIN line that is not clean is unreachable", () => {
  // The exit code used in the ONE direction it is decisive in. M4-P25
  // criterion 1 makes exit 0 mean drain is clean, so this input is the command
  // contradicting itself and neither half may be preferred to the other.
  const root = makeRoot({ statusText: `${FIVE_SWITCHES}DRAIN 3 in flight\n`, statusExit: 0 });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*exited 0 while reporting DRAIN 3 in flight/);
});

test("a retirement SUMMARY line is not a retirement row", () => {
  // THE DANGEROUS STATE: the zero-rows guard is one of this phase's headline
  // properties and a single line carrying the word defeated it. Measured by a
  // clean-room reviewer against 4e95204: `satisfied -- all 1 retirement
  // row(s) are ported`, exit 0, with no rows printed at all.
  const root = makeRoot({ retirementText: "RETIREMENT SUMMARY: 12 rows, all ported\n" });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "c"), /^unreachable\|.*contract does not fix/);
  assert.match(armOf(run.text, "c"), /RETIREMENT SUMMARY/);
  assert.doesNotMatch(run.text, /ARM c retirement satisfied/, run.text);
});

test("a retirement report exiting 0 while printing an unported row is unreachable", () => {
  // The arm c mirror of the arm a exit-coherence witness, and a structurally
  // different member of it: there the exit code contradicted a state word,
  // here it contradicts a row count.
  const root = makeRoot({
    retirementText: "PORT claude-md ported\nPORT skills unported\n",
    retirementExit: 0,
  });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "c"), /^unreachable\|.*exited 0 while printing 1 unported/);
});

test("arm d reads commit order, so touching the ruleset does not make a stale one fresh", () => {
  // THE DANGEROUS STATE, MEMBER A: FALSE GREEN. The reviewer's measurement was
  // that `touch` alone flipped this arm with the file's bytes unchanged. The
  // fixture is genuinely stale by commit order; the touch makes it the NEWEST
  // file on disk by mtime, which is exactly the input the old arm believed.
  const root = makeRoot({ rulesetStale: true });
  const rulesetPath = join(root, "delivery", "plan", "cutover", "pre-freeze-ruleset.json");
  const digestBefore = createHash("sha256").update(readFileSync(rulesetPath)).digest("hex");
  const now = new Date();
  utimesSync(rulesetPath, now, now);
  const digestAfter = createHash("sha256").update(readFileSync(rulesetPath)).digest("hex");
  assert.equal(digestAfter, digestBefore, "the touch must not change the bytes");

  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "d"), /^not-yet\|.*is older than.*by commit order/);
});

test("arm d survives a clone, where checkout order says the opposite of commit order", () => {
  // THE DANGEROUS STATE, MEMBER B: FALSE RED, and it is the state EVERY FRESH
  // CLONE IS IN. git does not preserve mtimes, and `pre-freeze-ruleset.json`
  // sorts before `retirement-inventory.json`, so the checkout walk writes the
  // ruleset first and it reads as the older file whatever its content says.
  // The test asserts the inversion it depends on, so it cannot pass by the
  // clone happening to come out in the other order.
  const source = makeRoot();
  const cloneParent = scratch("tiphys-cutover-clone-");
  const clone = join(cloneParent, "clone");
  fixtureGit(cloneParent, ["clone", "--quiet", source, clone]);

  const rulesetMtime = statSync(
    join(clone, "delivery", "plan", "cutover", "pre-freeze-ruleset.json"),
  ).mtimeMs;
  const inventoryMtime = statSync(
    join(clone, "delivery", "plan", "cutover", "retirement-inventory.json"),
  ).mtimeMs;
  assert.ok(
    rulesetMtime <= inventoryMtime,
    `this witness needs the clone to write the ruleset no later than the inventory; ` +
      `got ${rulesetMtime} against ${inventoryMtime}`,
  );

  const run = runChecker(clone);
  assert.equal(run.status, 0, run.text);
  assert.match(armOf(run.text, "d"), /^satisfied\|.*is newer than.*by commit order/);
});

test("a ruleset committed together with the inventory is not NEWER than it", () => {
  // The plan says NEWER (delivery/plan/kernel-plan-m4.md:3570). The first
  // implementation said "not older than", an undeclared relaxation, and equal
  // timestamps are not rare: `%ct` has one-second resolution and two paths
  // changed in one commit are always equal.
  const root = makeRoot({ rulesetSameCommit: true });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "d"), /^not-yet\|.*is committed no later than/);
});

test("a ruleset edited after its commit cannot be dated by commit order", () => {
  // Commit order does not describe bytes that were never committed. The
  // dangerous direction is the inventory's, not the ruleset's: an inventory
  // edited and left uncommitted would otherwise be dated by an old commit and
  // read as older than the ruleset. The ruleset arm of it is what a fixture
  // can force without the arm short-circuiting earlier.
  const root = makeRoot({ rulesetDirty: true });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "d"), /^unreachable\|.*differs from its last commit/);
});

test("an uncommitted ruleset is reported as untracked, not as differing from a commit", () => {
  // A STRUCTURALLY DIFFERENT MEMBER of the undatable class, and the reason it
  // has its own witness is the round's own mechanism one level down: an
  // untracked file has NO last commit, so a reason saying it "differs from its
  // last commit" would be a message whose scope is not the state it describes.
  const root = makeRoot({ rulesetUncommitted: true });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "d"), /^unreachable\|.*is not tracked by git/);
  assert.doesNotMatch(armOf(run.text, "d"), /differs from its last commit/);
});

test("a tree with no git repository cannot date the ruleset and says so", () => {
  // The floor of the arm: no commit order available means `unreachable`, never
  // a fallback to the timestamp a checkout rewrites.
  const root = makeRoot({ git: false });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "d"), /^unreachable\|.*could not be dated by commit order/);
});

test("--json carries the owner-action halt and no member of its output means ready", () => {
  // THE DANGEROUS STATE is the all-satisfied fixture again, through the mode
  // no test exercised: the commit message and the work history both said the
  // step-3 HALT prints on EVERY run, and `--json` printed no HALT at all.
  const root = makeRoot();
  const run = runChecker(root, ["--json"]);
  assert.equal(run.status, 0, run.text);
  const report = JSON.parse(run.text) as {
    overall: string;
    arms: ArmRecord[];
    ownerAction: { step: number; status: string };
    halt: string;
    steps: string[];
  };
  assert.equal(report.overall, "preconditions-satisfied-owner-action-pending");
  assert.equal(report.arms.length, 4);
  assert.deepEqual(report.ownerAction.step, 3);
  assert.equal(report.ownerAction.status, "blocked");
  assert.match(report.halt, /STEP 3 owner reboot of the pilot session: HALT, OWNER ACTION\./);
  assert.match(report.halt, /never reports it done/);
  assert.ok(
    report.steps.some((line) => /STEP 4/.test(line)),
    run.text,
  );
  for (const forbidden of [/\bREADY\b/, /\bGO\b/, /\bPROCEED\b/, /cutover may (begin|proceed)/i]) {
    assert.doesNotMatch(run.text, forbidden, `a ready-token reached the json output:\n${run.text}`);
  }
});

test("the checker refuses --root with no value rather than checking the current directory", () => {
  const result = spawnSync(process.execPath, [checkerPath, "--root"], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(result.status, 64);
  assert.match(`${result.stderr}`, /--root needs a value/);
});

/* ------------------------------------------------------------------ */
/* Fix round 1: the probe's writes                                     */
/* ------------------------------------------------------------------ */

test("the probe refuses to truncate an existing evidence document, and probes nothing", async () => {
  // THE DANGEROUS STATE, MEMBER A, and it is the largest data-loss surface the
  // review found: the beacon header was written BEFORE the first read, so a
  // run that would go on to establish NOTHING destroyed a run that had
  // established everything. Measured against 4e95204 with a 37-byte file.
  const dir = scratch("tiphys-probe-out-");
  const out = join(dir, "pulse-re-probe.md");
  const prior = "IMPORTANT PRIOR EVIDENCE\nline2\nline3\n";
  writeFileSync(out, prior, "utf8");

  const run = await runProbe([
    "--api-base",
    "http://127.0.0.1:1",
    "--git-base",
    "http://127.0.0.1:1",
    "--repo",
    "owner/name",
    "--out",
    out,
  ]);
  assert.equal(readFileSync(out, "utf8"), prior, "the probe destroyed prior evidence");
  assert.equal(run.status, 64, run.text);
  assert.match(run.text, /already exists/);
});

test("the probe refuses the same write on the path where it would have SUCCEEDED", async () => {
  // MEMBER B, structurally different: member A refuses on a run that was going
  // to fail anyway, which leaves open the reading that the guard is really
  // about failure. Here every source is reachable and the run would have gone
  // `satisfied`. The refusal is on the WRITE, and the server's record proves
  // the probe issued nothing before refusing.
  const received: string[] = [];
  const server = createServer((request, response) => {
    received.push(`${request.method} ${request.url}`);
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const dir = scratch("tiphys-probe-out-b-");
  const out = join(dir, "pulse-re-probe.md");
  const prior = "A RUN THAT SUCCEEDED\n";
  writeFileSync(out, prior, "utf8");
  try {
    const run = await runProbe([
      "--api-base",
      `http://127.0.0.1:${address.port}`,
      "--git-base",
      `http://127.0.0.1:${address.port}`,
      "--repo",
      "owner/name",
      "--out",
      out,
    ]);
    assert.equal(readFileSync(out, "utf8"), prior, "the probe destroyed prior evidence");
    assert.deepEqual(received, [], `the probe issued requests before refusing: ${received.join(", ")}`);
    assert.equal(run.status, 64, run.text);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // THE CONTROL, so the refusal above is the guard and not the absence of a
  // feature: with --force the same invocation writes, and the prior content is
  // gone because that is what the operator asked for.
  const forced = await runProbe([
    "--api-base",
    "http://127.0.0.1:1",
    "--git-base",
    "http://127.0.0.1:1",
    "--repo",
    "owner/name",
    "--out",
    out,
    "--force",
  ]);
  assert.equal(forced.status, 3, forced.text);
  assert.doesNotMatch(readFileSync(out, "utf8"), /A RUN THAT SUCCEEDED/);
});

test("a target string cannot inject a row into the evidence table", async () => {
  // THE DANGEROUS STATE: the injected row's verdict column read `satisfied` in
  // a run whose real verdict was `unreachable`. `detail` was escaped and
  // `target` was not, two expressions apart on one line.
  const dir = scratch("tiphys-probe-inject-");
  const out = join(dir, "evidence.md");
  const malicious = "x/y | satisfied | all good |\n| `z/w` | satisfied | fabricated row";
  const run = await runProbe([
    "--api-base",
    "http://127.0.0.1:1",
    "--git-base",
    "http://127.0.0.1:1",
    "--repo",
    malicious,
    "--out",
    out,
  ]);
  const document = readFileSync(out, "utf8");
  const rows = document.split(/\r?\n/).filter((line) => /^\|/.test(line) && !/^\|-/.test(line));
  // One header row and exactly one target row. Anything more is an injection.
  assert.equal(rows.length, 2, document);
  assert.doesNotMatch(document, /\| satisfied \|/, document);
  assert.equal(run.status, 3, run.text);
});

test("an unexpected failure in the probe exits indeterminate, not real-negative", async () => {
  // THE DANGEROUS STATE: EXIT_REAL_NEGATIVE is 1 and an uncaught throw also
  // exits 1, so a crash was indistinguishable from "the remote answered and
  // the answer is no". The forced throw is a real one on the shipped path:
  // --out under a path whose parent is a FILE, so mkdirSync raises ENOTDIR.
  const dir = scratch("tiphys-probe-throw-");
  const blocker = join(dir, "not-a-directory");
  writeFileSync(blocker, "I am a file\n", "utf8");
  const run = await runProbe([
    "--api-base",
    "http://127.0.0.1:1",
    "--git-base",
    "http://127.0.0.1:1",
    "--repo",
    "owner/name",
    "--out",
    join(blocker, "evidence.md"),
  ]);
  assert.equal(run.status, 3, run.text);
  assert.notEqual(run.status, 1);
  assert.match(run.text, /unexpected failure/);
});

test("the probe refuses a flag with no value rather than resolving it to a directory", async () => {
  // `--out` with nothing after it resolved to the current DIRECTORY, and the
  // EISDIR throw from opening it exited 1, this script's own real-negative.
  for (const argv of [["--out"], ["--repo"], ["--api-base"], ["--git-base"], ["--timeout-ms"]]) {
    const run = await runProbe(argv);
    assert.equal(run.status, 64, `${argv[0]}: ${run.text}`);
    assert.match(run.text, new RegExp(`${argv[0]} needs a value`), run.text);
  }
});


/* ==================================================================== */
/* FIX ROUND 2. AN INHERITED VARIABLE RECONFIGURES A CHILD.             */
/* ==================================================================== */

/**
 * THE MECHANISM, and it is not "NODE_OPTIONS was missing from a list of two".
 *
 * A child process inherits its parent's WHOLE environment, so any variable the
 * parent happens to carry can reconfigure the child. The parent of
 * `check-cutover-entry.mjs` is whatever launched it, and one of those parents
 * is the required `suite` gate, which sets
 * `NODE_OPTIONS=--test-reporter=... --test-reporter-destination=...` on its
 * child. The set of names that reconfigure `node` or `git` is OPEN, so a
 * denylist over it is green by construction for whatever it does not name.
 *
 * The fix builds each child's environment from an allowlist instead
 * (`childEnv` in the checker, `gitChildEnv` in the probe). These three tests
 * are the class's witnesses, and they are structurally different on purpose:
 * three different variables, two different child PROGRAMS, and errors in both
 * directions (a false unreachable and a FALSE GREEN).
 */

/** Runs the checker with named variables forced into ITS OWN environment. */
function runCheckerWithEnv(
  root: string,
  overrides: Record<string, string>,
  extra: string[] = [],
): RunResult {
  const result = spawnSync(
    process.execPath,
    [checkerPath, "--root", root, "--exclusion-test", "test/cross-environment.test.ts", ...extra],
    { encoding: "utf8", timeout: 300000, env: { ...process.env, ...overrides } },
  );
  return { status: result.status, text: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/**
 * MEMBER A: a reporter configuration reaches the nested `node --test` run and
 * sends its counts to a file, so arm b reads no counts at all.
 *
 * This is the measured instance: the `suite` gate sets exactly this, and ten of
 * this phase's tests failed under the gate while passing under `npm test`. The
 * direction of the error is a false UNREACHABLE, which is the safe direction
 * and still wrong, because it makes the checker unusable from inside any run
 * that pins a reporter.
 */
test("a reporter pinned in the parent's environment does not reach the exclusion child", () => {
  const root = makeRoot();
  const destination = join(root, "inherited-reporter.tap");
  try {
    const run = runCheckerWithEnv(root, {
      NODE_OPTIONS: `--test-reporter=tap --test-reporter-destination=${destination}`,
    });
    const armB = armOf(run.text, "b");
    assert.ok(
      armB.startsWith("satisfied|"),
      `arm b must still read the child's counts, got: ${armB}\n${run.text}`,
    );
    assert.doesNotMatch(run.text, /reported no pass\/fail counts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * MEMBER B: the SAME variable, a DIFFERENT child (the kernel CLI, not the test
 * runner) and the OPPOSITE direction of error.
 *
 * `NODE_OPTIONS=--import <file>` runs that file inside every node child, so
 * anything it prints lands on the CHILD'S STDOUT, which is the text arm a parses
 * as the CLI's answer. The fixture's CLI prints NO drain row, whose correct
 * verdict is `unreachable`; an injected `DRAIN clean` line makes exactly one
 * row and turns the arm SATISFIED. That is a false green in the arm the owner's
 * go/no-go reads, produced by a variable nobody passed on purpose.
 *
 * `runCli` cleaned nothing at all, so this member reddens against the pre-fix
 * code even in the shape fix round 1 left behind.
 */
test("an --import inherited from the parent cannot inject a row into the CLI's answer", () => {
  // The five switches read `current`, which is the cutover-ENTRY state, so an
  // injected `DRAIN clean` row makes a report that is COHERENT in every other
  // respect and the arm would answer `satisfied`. Without five switches the
  // count check would catch it for an unrelated reason and this test would pass
  // while witnessing nothing, which is how it was first written.
  const atEntry =
    "SWITCH planning-and-scope current\nSWITCH dispatch current\n" +
    "SWITCH review current\nSWITCH gates current\nSWITCH merge current\n";
  const root = makeRoot({ statusText: atEntry, statusExit: 1 });
  const injector = join(root, "inject.mjs");
  try {
    writeFileSync(injector, 'process.stdout.write("DRAIN clean\\n");\n', "utf8");
    // Control: with the variable absent the arm is unreachable BECAUSE THERE IS
    // NO DRAIN LINE, so the assertion below is about the variable and about
    // that specific reason, not about the fixture being broken some other way.
    const control = runChecker(root);
    assert.match(armOf(control.text, "a"), /^unreachable\|.*printed no DRAIN line/);

    const run = runCheckerWithEnv(root, { NODE_OPTIONS: `--import ${injector}` });
    const armA = armOf(run.text, "a");
    assert.match(
      armA,
      /^unreachable\|.*printed no DRAIN line/,
      `an inherited --import must not become a DRAIN row, got: ${armA}\n${run.text}`,
    );
    assert.notEqual(run.status, checker.EXIT_SATISFIED);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * MEMBER C: a different variable FAMILY and a different child PROGRAM.
 *
 * `GIT_DIR` relocates the repository git answers about, so arm d's commit-order
 * read reports on a repository that is not the one it was asked about. That is
 * the wrong-scope answer this whole phase exists against, arriving through the
 * environment rather than through an argument. git reads more than thirty such
 * names, which is why the fix is an allowlist rather than three more entries.
 */
test("an inherited GIT_DIR does not relocate the repository arm d dates", () => {
  const root = makeRoot();
  const elsewhere = scratch("tiphys-cutover-entry-elsewhere-");
  try {
    fixtureGit(elsewhere, ["init", "--quiet", "--initial-branch", "main"]);
    writeFileSync(join(elsewhere, "unrelated.txt"), "not the fixture\n", "utf8");
    fixtureGit(elsewhere, ["add", "-A"]);
    fixtureGit(elsewhere, ["commit", "--quiet", "-m", "an unrelated repository"], EARLIER);

    const control = runChecker(root);
    assert.ok(
      armOf(control.text, "d").startsWith("satisfied|"),
      `control fixture must be satisfied, got: ${armOf(control.text, "d")}`,
    );

    const run = runCheckerWithEnv(root, { GIT_DIR: join(elsewhere, ".git") });
    const armD = armOf(run.text, "d");
    assert.ok(
      armD.startsWith("satisfied|"),
      `an inherited GIT_DIR must not change which repository is read, got: ${armD}\n${run.text}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

/**
 * The construction itself, asserted directly rather than only through its
 * effects: the allowlist carries what a child needs to start and carries no
 * name that reconfigures the child, and the git kind is the only one that
 * reaches the network.
 */
test("the child environment is built from an allowlist and carries no reconfiguring name", () => {
  const before = {
    NODE_OPTIONS: process.env.NODE_OPTIONS,
    NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT,
    GIT_DIR: process.env.GIT_DIR,
    GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND,
  };
  try {
    process.env.NODE_OPTIONS = "--import /nowhere.mjs";
    process.env.NODE_TEST_CONTEXT = "child";
    process.env.GIT_DIR = "/nowhere/.git";
    process.env.GIT_SSH_COMMAND = "/nowhere/run-me";

    const nodeEnv = checker.childEnv("node");
    const gitEnvironment = checker.childEnv("git");
    for (const built of [nodeEnv, gitEnvironment]) {
      for (const name of Object.keys(built)) {
        assert.ok(
          !name.startsWith("NODE_"),
          `a NODE_* name reached a child environment: ${name}`,
        );
      }
      assert.equal(built.GIT_DIR, undefined);
      assert.equal(built.GIT_SSH_COMMAND, undefined);
      // PATH is the one name a child cannot start without.
      assert.equal(built.PATH, process.env.PATH);
    }
    // The git kind pins git's own two behaviours and is the only kind that
    // carries the transport, because only its children reach a remote.
    assert.equal(gitEnvironment.GIT_TERMINAL_PROMPT, "0");
    assert.equal(gitEnvironment.GIT_OPTIONAL_LOCKS, "0");
    assert.equal(nodeEnv.GIT_TERMINAL_PROMPT, undefined);
    process.env.HTTPS_PROXY = "http://127.0.0.1:1";
    assert.equal(checker.childEnv("git").HTTPS_PROXY, "http://127.0.0.1:1");
    assert.equal(checker.childEnv("node").HTTPS_PROXY, undefined);
    delete process.env.HTTPS_PROXY;
    // An unrecognised kind throws rather than quietly returning the narrow set.
    assert.throws(() => checker.childEnv("shell"), /unknown child environment kind/);
    // The probe's sibling construction, same rule, standalone file.
    assert.equal(probe.gitChildEnv().GIT_DIR, undefined);
    assert.equal(probe.gitChildEnv().GIT_TERMINAL_PROMPT, "0");
    assert.equal(probe.gitChildEnv().PATH, process.env.PATH);
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});


/* ==================================================================== */
/* FIX ROUND 2. THE SHAPE RULE DECIDED ITS OWN INPUT.                   */
/* ==================================================================== */

/**
 * THE MECHANISM, and it is not "the word `drain` was the wrong word".
 *
 * Round 1's shape rule was structural over the lines it LOOKED AT, and it chose
 * those lines with a one-word filter: `/drain/i` in arm a, `/\b(un)?ported\b/i`
 * in arm c. A vocabulary is an open set, so the filter is a guard that cannot go
 * red for anything it does not name, and a delta verifier measured three
 * structurally different stubs still reading `satisfied` at the fixed head. One
 * of them was the reviewer's own stub with a single word changed.
 *
 * The fix is that a report is an answer only if the WHOLE report matches the
 * shapes its contract fixes, plus the exit-code coherence read in BOTH
 * directions. The witnesses below are the verifier's three stubs and the two
 * new coherence arms, and they are structurally different on purpose: two
 * streams, two arms, two error vocabularies, a crash with no vocabulary at all,
 * and two shape-clean reports that only the exit code refutes.
 */

test("an error line one word away from the reviewer's still defeats the drain arm", () => {
  // MEMBER A of the class, and it is DV-1's stub A2: the reviewer's own input
  // with "drain register" changed to "in-flight register", on STDERR rather
  // than stdout. Round 1's filter never saw it and answered `satisfied`.
  const root = makeRoot({
    statusText: `${FIVE_SWITCHES}DRAIN clean\n`,
    statusStderr:
      "ERROR: could not read the in-flight register, the numbers above are stale\n",
    statusExit: 1,
  });
  const run = runChecker(root);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*contract does not fix/);
  assert.doesNotMatch(run.text, /ARM a drain satisfied/, run.text);
  assert.equal(run.status, 3, run.text);
});

test("a crash whose text carries none of the arm's vocabulary still defeats it", () => {
  // MEMBER B, DV-1's stub A3, and STRUCTURALLY DIFFERENT because its error text
  // contains no word either filter could ever have been written around: a node
  // stack frame, and an exit code the contract does not define at all.
  const root = makeRoot({
    statusText: `${FIVE_SWITCHES}DRAIN clean\n`,
    statusStderr:
      "TypeError: Cannot read properties of undefined (reading 'switches')\n" +
      "    at readSwitchTable (/kernel/src/cutover/status.ts:88:19)\n",
    statusExit: 7,
  });
  const run = runChecker(root);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*contract does not fix/);
  assert.doesNotMatch(run.text, /ARM a drain satisfied/, run.text);
});

test("a truncation notice on stderr defeats the retirement arm", () => {
  // MEMBER C, DV-1's stub C2, and it is the OTHER ARM: the same mechanism
  // reached through `/\b(un)?ported\b/i` instead of `/drain/i`. The notice says
  // the register was truncated, which is precisely the state in which counting
  // the surviving row as the whole report is a false green.
  const root = makeRoot({
    retirementText: "PORT alpha ported\n",
    retirementStderr:
      "ERROR: the retirement register is truncated, rows below row 1 were not read\n",
    retirementExit: 1,
  });
  const run = runChecker(root);
  assert.match(armOf(run.text, "c"), /^unreachable\|.*contract does not fix/);
  assert.doesNotMatch(run.text, /ARM c retirement satisfied/, run.text);
});

test("a shape-clean retirement report exiting nonzero with nothing unported is unreachable", () => {
  // MEMBER D, and it is structurally different from C because the SHAPE RULE
  // CANNOT SEE IT: every line is a valid PORT row. Only criterion 6's exit
  // implication read in the nonzero direction refutes it
  // (delivery/plan/kernel-plan-m4.md:3315). That second route is what makes the
  // class closed rather than one filter replaced by a wider filter.
  const root = makeRoot({
    retirementText: "PORT alpha ported\nPORT beta ported\n",
    retirementExit: 1,
  });
  const run = runChecker(root);
  assert.match(armOf(run.text, "c"), /^unreachable\|.*exited 1 while printing 2 row\(s\)/);
  assert.doesNotMatch(run.text, /ARM c retirement satisfied/, run.text);
  // Control: the same report exiting 0 IS the coherent one and is satisfied, so
  // the assertion above is about the exit code and not about the rows.
  const coherent = makeRoot({ retirementText: "PORT alpha ported\nPORT beta ported\n" });
  assert.match(armOf(runChecker(coherent).text, "c"), /^satisfied\|/);
});

test("a shape-clean status exiting nonzero with everything clean is unreachable", () => {
  // MEMBER E, arm a's mirror of D, and the one that needed the switch lines to
  // be modelled: five switches on `kernel` AND drain clean is the exact state
  // criterion 1 says exits 0. It cannot fire at cutover entry, where the
  // switches read `current`, which is why adding it does not make the arm
  // permanently unreachable. The control below is that entry state.
  const root = makeRoot({ statusText: `${FIVE_SWITCHES}DRAIN clean\n`, statusExit: 1 });
  const run = runChecker(root);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*exited 1 while reporting DRAIN clean/);

  const atEntry = makeRoot({
    statusText:
      "SWITCH planning-and-scope current\nSWITCH dispatch current\n" +
      "SWITCH review current\nSWITCH gates current\nSWITCH merge current\n" +
      "DRAIN clean\n",
    statusExit: 1,
  });
  assert.match(armOf(runChecker(atEntry).text, "a"), /^satisfied\|/);
});

test("a status report with the wrong number of SWITCH lines is unreachable", () => {
  // The report is not the report the contract describes, so it is not one this
  // arm can read. Four lines, and the missing one is not visible in the drain
  // row at all, which is why a drain-only model answered confidently.
  const root = makeRoot({
    statusText:
      "SWITCH planning-and-scope current\nSWITCH dispatch current\n" +
      "SWITCH review current\nSWITCH gates current\nDRAIN clean\n",
    statusExit: 1,
  });
  const run = runChecker(root);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*printed 4 SWITCH line\(s\)/);
});


/**
 * FIX ROUND 2: the shallow clone, which the work history asserted about and did
 * not measure.
 *
 * The claim was that `git log` returns nothing in a truncated history and the
 * arm fail-closes. A delta verifier built the fixture and measured the
 * opposite: the boundary commit is grafted parentless, so every tracked path
 * dates to it and the arm answered `not-yet` -- a REAL NEGATIVE -- for a state
 * it could not know, on a source tree whose correct answer was `satisfied`.
 * The control below asserts that correct answer on the SAME source, so this
 * test is about the truncation and not about the fixture.
 */
test("a shallow clone cannot date arm d and says so, rather than reporting not-yet", () => {
  const source = makeRoot();
  // The control: the full repository answers satisfied, so the shallow arm
  // below is not measuring a fixture that was stale anyway.
  assert.match(armOf(runChecker(source).text, "d"), /^satisfied\|/);

  const cloneParent = scratch("tiphys-cutover-shallow-");
  const shallow = join(cloneParent, "shallow");
  fixtureGit(cloneParent, [
    "clone",
    "--quiet",
    "--depth",
    "1",
    `file://${source}`,
    shallow,
  ]);
  // The fixture asserts the truncation it depends on, so a git that cloned in
  // full would fail this witness rather than pass it vacuously.
  const depth = spawnSync("git", ["-C", shallow, "rev-list", "--count", "HEAD"], {
    encoding: "utf8",
  });
  assert.equal((depth.stdout ?? "").trim(), "1", depth.stderr ?? "");

  const run = runChecker(shallow);
  assert.match(armOf(run.text, "d"), /^unreachable\|.*shallow repository/);
  assert.doesNotMatch(run.text, /ARM d pre-freeze-ruleset not-yet/, run.text);
  assert.equal(run.status, 3, run.text);
});
