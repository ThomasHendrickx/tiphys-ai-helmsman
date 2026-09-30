import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * ACCEPTANCE CRITERIA ARE TESTS (DR-0064, kernel plan M6-P4).
 *
 * The schema half is driven through `tiphys validate --type plan`. The proof
 * half runs the REAL suite gate CLI over small scratch repositories whose
 * suites really run under `node --test`, so every outcome a criterion is
 * judged on (passed, skipped, todo, failed, never reported) is the node test
 * runner's own report, never a hand-written reporter line.
 *
 * Two red outputs are compared byte for byte with REAL captured output of the
 * gate CLI on the same fixtures, witness/captures/m6-p4-criteria-gate-cli.txt,
 * taken on node v26.6.0 in the kernel container. Every child here gets a
 * scrubbed environment (no NODE_OPTIONS, no NODE_TEST_*), for the reasons
 * test/suite-gate.test.ts records at its head.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const gatePath = join(repoRoot, "src", "gates", "suite.ts");
const capturePath = join(repoRoot, "witness", "captures", "m6-p4-criteria-gate-cli.txt");
const byEventCapturePath = join(repoRoot, "witness", "captures", "m6-p4-criteria-by-event.txt");

const yamlModule = (await import("yaml")) as unknown as { parse: (text: string) => unknown };

function scrubbedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "NODE_OPTIONS" && !key.startsWith("NODE_TEST")) {
      env[key] = value;
    }
  }
  return env;
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...scrubbedEnv(),
      GIT_AUTHOR_NAME: "tiphys-test",
      GIT_AUTHOR_EMAIL: "tiphys-test@invalid",
      GIT_COMMITTER_NAME: "tiphys-test",
      GIT_COMMITTER_EMAIL: "tiphys-test@invalid",
    },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr ?? ""}`);
  return (result.stdout ?? "").trim();
}

/** The shipped plan template with its one phase's acceptance replaced. */
function planWith(acceptance: Record<string, unknown>[]): Record<string, unknown> {
  const plan = yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
  const phase = (plan["phases"] as Record<string, unknown>[])[0] as Record<string, unknown>;
  phase["acceptance"] = acceptance;
  /* The template's hazard classes point at its own criterion ids; point them
     at the first replacement so only the criterion shape is under test. */
  for (const hazard of phase["hazard-classes"] as Record<string, unknown>[]) {
    hazard["addressed-by"] = `criterion ${String(acceptance[0]?.["id"])}`;
  }
  return plan;
}

const TESTS_FILE =
  'import { test } from "node:test";\n' +
  'test("alpha passes", () => {});\n' +
  'test("beta is skipped", { skip: "fixture reason" }, () => {});\n' +
  'test("gamma is a todo", { todo: "fixture reason" }, () => {});\n' +
  'test("epsilon is filtered out", () => {});\n';

/**
 * A scratch repository with a suite, an empty behavior registry and a plan at
 * `plan.json`. The test script filters `epsilon` out by name, which node
 * v26.6.0 reports as nothing at all (measured, work history step 2).
 */
function makeFixture(
  files: Record<string, string>,
  plan: Record<string, unknown>,
  script = 'node --test --test-skip-pattern="epsilon" "test/**/*.test.ts"',
): { dir: string; base: string } {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-criteria-"));
  git(dir, ["init", "-q", "-b", "main", "."]);
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "fixture", private: true, type: "module", scripts: { test: script } }, null, 2)}\n`,
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "lib.ts"), "export const one = 1;\n");
  mkdirSync(join(dir, "test"), { recursive: true });
  writeFileSync(join(dir, "test", "behaviors.json"), "{}\n");
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  writeFileSync(join(dir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "base"]);
  return { dir, base: git(dir, ["rev-parse", "HEAD"]) };
}

interface GateRun {
  status: number | null;
  stdout: string;
  record: { status: string; detail: string; evidence: string[] };
  evidenceDir: string;
  criteria?: Record<string, unknown>;
}

function runGate(dir: string, base: string, extra: string[]): GateRun {
  const evidenceDir = mkdtempSync(join(tmpdir(), "tiphys-criteria-ev-"));
  const resultPath = join(evidenceDir, "result.json");
  const result = spawnSync(
    process.execPath,
    [gatePath, "--result", resultPath, "--evidence", evidenceDir, "--base", base, ...extra],
    { cwd: dir, encoding: "utf8", env: scrubbedEnv(), timeout: 120000 },
  );
  const record = JSON.parse(readFileSync(resultPath, "utf8")) as GateRun["record"];
  const run: GateRun = { status: result.status, stdout: result.stdout ?? "", record, evidenceDir };
  if (record.evidence.includes("counts.json")) {
    const counts = JSON.parse(readFileSync(join(evidenceDir, "counts.json"), "utf8")) as {
      criteria?: Record<string, unknown>;
    };
    if (counts.criteria !== undefined) {
      run.criteria = counts.criteria;
    }
  }
  return run;
}

/** One block of the real captured gate (or runner) output. */
function captured(block: string, path = capturePath): string {
  const body = readFileSync(path, "utf8");
  const begin = `--- BEGIN ${block} ---\n`;
  const from = body.indexOf(begin);
  assert.notEqual(from, -1, `capture block ${block} is absent`);
  const to = body.indexOf(`--- END ${block} ---`, from);
  assert.notEqual(to, -1, `capture block ${block} is unterminated`);
  return body.slice(from + begin.length, to);
}

function validatePlan(plan: Record<string, unknown>): { status: number | null; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-criteria-plan-"));
  const file = join(dir, "plan.json");
  writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`);
  const run = spawnSync(process.execPath, [cliEntry, "validate", "--type", "plan", file], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: run.status, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

/* ------------------------------------------------------------------ */
/* p4-schema: exactly one of check and not-testable                     */
/* ------------------------------------------------------------------ */

test("a plan criterion with neither check nor not-testable, or with both, is rejected naming the criterion", () => {
  const neither = validatePlan(planWith([{ id: "1", criterion: "the importer retries" }]));
  assert.equal(neither.status, 1, neither.output);
  assert.match(neither.output, /^INVALID #\/phases\/0\/acceptance\/0 value matches no permitted alternative here$/m);

  const both = validatePlan(
    planWith([
      {
        id: "1",
        criterion: "the importer retries",
        check: { tests: ["the importer retries"] },
        "not-testable": "a reading",
      },
    ]),
  );
  assert.equal(both.status, 1, both.output);
  assert.match(both.output, /^INVALID #\/phases\/0\/acceptance\/0 value matches no permitted alternative here$/m);

  /* THE OTHER DIRECTION: each shape alone is accepted, so the refusal above is
     about the pair and not about the fields. */
  for (const alone of [
    { id: "1", criterion: "the importer retries", check: { tests: ["the importer retries"] } },
    { id: "1", criterion: "the importer retries", "not-testable": "a reading" },
  ]) {
    const accepted = validatePlan(planWith([alone]));
    assert.doesNotMatch(accepted.output, /INVALID/, JSON.stringify(alone));
    assert.equal(accepted.status, 0, accepted.output);
  }
});

test("a criterion check needs tests or a command, accepts either or both, and refuses an empty list or an empty reason", () => {
  for (const check of [
    { tests: ["the importer retries"] },
    { command: ["node", "--test"] },
    { tests: ["the importer retries"], command: ["node", "--test"] },
  ]) {
    const accepted = validatePlan(planWith([{ id: "1", criterion: "c", check }]));
    assert.equal(accepted.status, 0, `${JSON.stringify(check)}: ${accepted.output}`);
  }
  for (const [shape, pointer] of [
    [{ check: {} }, /^INVALID #\/phases\/0\/acceptance\/0\/check value matches no permitted alternative here$/m],
    [{ check: { tests: [] } }, /^INVALID #\/phases\/0\/acceptance\/0\/check\/tests array has 0 items/m],
    [{ check: { command: [] } }, /^INVALID #\/phases\/0\/acceptance\/0\/check\/command array has 0 items/m],
    [{ check: { tests: ["a"], script: "x" } }, /^INVALID #\/phases\/0\/acceptance\/0\/check\/script property script is not permitted here$/m],
    [{ "not-testable": " " }, /^INVALID #\/phases\/0\/acceptance\/0\/not-testable /m],
  ] as [Record<string, unknown>, RegExp][]) {
    const refused = validatePlan(planWith([{ id: "1", criterion: "c", ...shape }]));
    assert.equal(refused.status, 1, `${JSON.stringify(shape)}: ${refused.output}`);
    assert.match(refused.output, pointer, JSON.stringify(shape));
  }
});

/* ------------------------------------------------------------------ */
/* p4-maps-red and p4-maps-green: the suite gate proves each check      */
/* ------------------------------------------------------------------ */

test("a criterion whose named test was skipped, is a todo, was filtered out or never ran is red naming the criterion and the title", () => {
  const plan = planWith([
    { id: "c-ok", criterion: "alpha", check: { tests: ["alpha passes"] } },
    { id: "c-skip", criterion: "beta", check: { tests: ["beta is skipped"] } },
    { id: "c-todo", criterion: "gamma", check: { tests: ["gamma is a todo"] } },
    { id: "c-filtered", criterion: "epsilon", check: { tests: ["epsilon is filtered out"] } },
    { id: "c-prefix", criterion: "a prefix of a real title", check: { tests: ["alpha pass"] } },
    { id: "c-longer", criterion: "a real title is a prefix of it", check: { tests: ["alpha passes too"] } },
  ]);
  const { dir, base } = makeFixture({ "test/a.test.ts": TESTS_FILE }, plan);

  /* THE CONTROL: the same suite, judged without the plan, is GREEN. A skip
     with a reason and a todo are not suite findings, so every red line below
     is the criteria judge's and nobody else's. */
  const control = runGate(dir, base, []);
  assert.equal(control.status, 0, control.record.detail);

  const run = runGate(dir, base, ["--plan", "plan.json", "--phase", "M9-P1"]);
  assert.equal(run.record.status, "red", run.record.detail);
  assert.equal(run.status, 1);
  /* The live output IS the real captured output of this CLI on this fixture. */
  assert.equal(run.stdout, captured("tests-red"));
  for (const finding of [
    'criterion c-skip: test "beta is skipped" was skipped (test/a.test.ts)',
    'criterion c-todo: test "gamma is a todo" is a todo (test/a.test.ts)',
    'criterion c-filtered: test "epsilon is filtered out" was not reported by the suite, so nothing proves it',
    'criterion c-prefix: test "alpha pass" was not reported by the suite, so nothing proves it',
    'criterion c-longer: test "alpha passes too" was not reported by the suite, so nothing proves it',
  ]) {
    assert.ok(run.record.detail.includes(finding), `missing: ${finding}\n${run.record.detail}`);
  }
  assert.doesNotMatch(run.record.detail, /criterion c-ok:/);
  assert.equal(run.criteria?.["proven"], 1);
  assert.equal(run.criteria?.["unproven"], 5);
});

test("a criterion whose named test fails is red naming the criterion and the title, even when another test with that title passes", () => {
  const plan = planWith([{ id: "c-dup", criterion: "delta", check: { tests: ["delta"] } }]);
  const { dir, base } = makeFixture(
    {
      "test/b.test.ts": 'import { test } from "node:test";\ntest("delta", () => {});\n',
      "test/c.test.ts":
        'import { test } from "node:test";\ntest("delta", () => { throw new Error("fixture failure"); });\n',
    },
    plan,
    'node --test "test/**/*.test.ts"',
  );
  const run = runGate(dir, base, ["--plan", "plan.json", "--phase", "M9-P1"]);
  assert.equal(run.record.status, "red", run.record.detail);
  assert.ok(
    run.record.detail.includes('criterion c-dup: test "delta" failed (test/c.test.ts)'),
    run.record.detail,
  );
  assert.equal(run.criteria?.["unproven"], 1);
});

test("a criterion whose command exits nonzero, times out or hands a script to a shell is red with the exit and the output tail", () => {
  const plan = planWith([
    {
      id: "c-exit",
      criterion: "exits 3",
      check: { command: ["node", "-e", "console.log('tail-marker-c-exit'); process.exit(3)"] },
    },
    /* `false || true` exits 0 under a shell and 1 without one. */
    { id: "c-literal", criterion: "no shell", check: { command: ["false", "||", "true"] } },
    { id: "c-shell", criterion: "inline shell", check: { command: ["sh", "-c", "exit 0"] } },
    { id: "c-slow", criterion: "timeout", check: { command: ["node", "-e", "setTimeout(() => {}, 30000)"] } },
    { id: "c-ok", criterion: "exits 0", check: { command: ["node", "-e", "process.exit(0)"] } },
  ]);
  const { dir, base } = makeFixture({ "test/a.test.ts": TESTS_FILE }, plan);
  const run = runGate(dir, base, ["--plan", "plan.json", "--phase", "M9-P1", "--check-timeout", "2"]);
  assert.equal(run.record.status, "red", run.record.detail);
  assert.equal(run.stdout, captured("commands-red"));
  for (const finding of [
    'criterion c-exit: check.command ["node","-e","console.log(\'tail-marker-c-exit\'); process.exit(3)"] exited 3; output tail: tail-marker-c-exit',
    'criterion c-literal: check.command ["false","||","true"] exited 1; no output',
    'criterion c-shell: check.command ["sh","-c","exit 0"] was not proven: it hands an inline script to sh',
    'criterion c-slow: check.command ["node","-e","setTimeout(() => {}, 30000)"] timed out after 2s',
  ]) {
    assert.ok(run.record.detail.includes(finding), `missing: ${finding}\n${run.record.detail}`);
  }
  assert.doesNotMatch(run.record.detail, /criterion c-ok:/);
});

test("a criterion whose named tests pass and whose command exits 0 is green, the phase id matches in any case, and the not-testable count is printed", () => {
  const plan = planWith([
    { id: "c-test", criterion: "alpha", check: { tests: ["alpha passes"] } },
    /* Run from the project root: plan.json is at the root of the fixture. */
    {
      id: "c-cmd",
      criterion: "root",
      check: { command: ["node", "-e", "process.exit(require('node:fs').existsSync('plan.json') ? 0 : 5)"] },
    },
    {
      id: "c-both",
      criterion: "both",
      check: { tests: ["alpha passes"], command: ["node", "-e", "process.exit(0)"] },
    },
    { id: "c-reading", criterion: "a reading", "not-testable": "a judgement the hazard review answers" },
  ]);
  const { dir, base } = makeFixture({ "test/a.test.ts": TESTS_FILE }, plan);
  /* Lower case, as CI derives it from a branch name. */
  const run = runGate(dir, base, ["--plan", "plan.json", "--phase", "m9-p1"]);
  assert.equal(run.status, 0, run.record.detail);
  assert.equal(run.record.status, "green");
  assert.match(
    run.record.detail,
    /; criteria of M9-P1 in plan\.json: 4 criterion\(s\), 3 proven by their check, 0 unproven, 1 not-testable$/,
  );
  assert.equal(run.criteria?.["applicable"], true);
  assert.equal(run.criteria?.["proven"], 3);
  assert.equal(run.criteria?.["notTestable"], 1);
});

test("a plan that does not declare the phase leaves the suite verdict alone and says the criteria are not applicable", () => {
  const plan = planWith([{ id: "c-test", criterion: "never run", check: { tests: ["no such test"] } }]);
  const { dir, base } = makeFixture({ "test/a.test.ts": TESTS_FILE }, plan);
  const run = runGate(dir, base, ["--plan", "plan.json", "--phase", "M6-P4"]);
  assert.equal(run.status, 0, run.record.detail);
  assert.match(run.record.detail, /; criteria not applicable: plan plan\.json declares no phase M6-P4$/);
  assert.equal(run.criteria?.["applicable"], false);
});

test("an invalid plan makes the suite gate error before the suite runs, with a phase and without one", () => {
  const plan = planWith([{ id: "c-bare", criterion: "neither check nor not-testable" }]);
  const { dir, base } = makeFixture({ "test/a.test.ts": TESTS_FILE }, plan);
  /* With a phase (a pull request) and without one (a push): the plan is read
     and validated either way, so a push does not wave an invalid plan through. */
  for (const extra of [["--plan", "plan.json", "--phase", "M9-P1"], ["--plan", "plan.json"]]) {
    const run = runGate(dir, base, extra);
    assert.equal(run.record.status, "error", `${extra.join(" ")}: ${run.record.detail}`);
    assert.equal(run.status, 21);
    assert.match(run.record.detail, /does not validate against the plan schema: INVALID #\/phases\/0\/acceptance\/0 /);
    /* The suite never ran: its reporter stream was never written. */
    assert.equal(existsSync(join(run.evidenceDir, "suite-events.ndjson")), false);
  }
});

test("a suite run given --plan and no --phase runs the suite and reports the criteria not applicable naming no phase, and --phase with no --plan proves nothing", () => {
  /* The criterion would be RED if it were judged (its test is skipped), so a
     green run is the proof that the criteria half did not run. */
  const plan = planWith([{ id: "c-skip", criterion: "beta", check: { tests: ["beta is skipped"] } }]);
  const { dir, base } = makeFixture({ "test/a.test.ts": TESTS_FILE }, plan);

  const noPhase = runGate(dir, base, ["--plan", "plan.json"]);
  assert.equal(noPhase.status, 0, noPhase.record.detail);
  assert.equal(noPhase.record.status, "green");
  assert.match(
    noPhase.record.detail,
    /; criteria not applicable: no phase: this run names none, so no criteria of plan plan\.json are proven$/,
  );
  assert.equal(noPhase.criteria?.["applicable"], false);

  /* A phase with no plan: this repository's own registry entry passes
     `phase?` and no `--plan`, so on a pull request the suite gets `--phase`
     alone. It runs, it is green, and it claims nothing about criteria. */
  const noPlan = runGate(dir, base, ["--phase", "M9-P1"]);
  assert.equal(noPlan.status, 0, noPlan.record.detail);
  assert.equal(noPlan.record.status, "green");
  assert.doesNotMatch(noPlan.record.detail, /criteri/);
  assert.equal(noPlan.criteria, undefined);
});

/* ------------------------------------------------------------------ */
/* The runner arm: an OPTIONAL run parameter (gate parameter `phase?`)  */
/* ------------------------------------------------------------------ */

/** A fixture gate that reports, as its detail, the --phase it was given. */
const RUNNER_GATE =
  'import { writeFileSync } from "node:fs";\n' +
  "const argv = process.argv.slice(2);\n" +
  "const at = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };\n" +
  'const phase = at("--phase");\n' +
  'const record = { gate: argv[0], status: "green", units: 1, unitLabel: "fixture units", startedAt: "2026-09-30T00:00:00.000Z", endedAt: "2026-09-30T00:00:01.000Z", detail: phase === undefined ? "received no --phase" : `received --phase ${phase}`, evidence: [] };\n' +
  'writeFileSync(at("--result"), `${JSON.stringify(record)}\\n`);\n';

function registryEntry(
  id: string,
  command: string[],
  parameters: string[],
  unitLabel: string,
): Record<string, unknown> {
  return {
    id,
    prevents: "a fixture failure",
    command,
    unitLabel,
    applicability: "required",
    "verified-by": "script",
    modes: ["full"],
    events: ["pull_request", "push"],
    parameters,
  };
}

function writeRegistry(dir: string, gates: Record<string, unknown>[]): void {
  const document = {
    kind: "gate-registry",
    version: 1,
    preflight: [{ command: ["npm", "ci"], note: "install exactly the lockfile" }],
    gates,
    destructiveCommands: [],
  };
  writeFileSync(join(dir, "registry.json"), `${JSON.stringify(document, null, 2)}\n`);
}

/**
 * The REAL runner over `registry.json` in `dir`. The first stdout line names a
 * random run id and is dropped, exactly as the capture drops it.
 */
function runRunner(dir: string, extra: string[]): { status: number | null; stdout: string; output: string } {
  const evidence = join(dir, `evidence-${String(Math.random()).slice(2)}`);
  const run = spawnSync(
    process.execPath,
    [cliEntry, "gates", "run", "--registry", "registry.json", "--mode", "full", "--evidence", evidence, ...extra],
    { cwd: dir, encoding: "utf8", env: scrubbedEnv(), timeout: 300000 },
  );
  const stdout = run.stdout ?? "";
  return {
    status: run.status,
    stdout: stdout.split("\n").slice(1).join("\n"),
    output: `${stdout}${run.stderr ?? ""}`,
  };
}

/** The capture's declared substitutions: the base commit and the child's node version. */
function scrubRun(stdout: string, base: string): string {
  return stdout
    .split(base)
    .join("<base>")
    .split(base.slice(0, 12))
    .join("<base12>")
    .replace(/\(child node v[0-9.]+\)/g, "(child node <node>)");
}

test("a gate declaring phase? is passed --phase when the run has one and runs without it when the run has none, while a gate requiring phase still errors without it", () => {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-criteria-runner-"));
  writeFileSync(join(dir, "gate.mjs"), RUNNER_GATE);
  writeRegistry(dir, [
    registryEntry("takes-phase", ["node", join(dir, "gate.mjs"), "takes-phase"], ["phase?"], "fixture units"),
    registryEntry("needs-phase", ["node", join(dir, "gate.mjs"), "needs-phase"], ["phase"], "fixture units"),
  ]);

  const withPhase = runRunner(dir, ["--phase", "M9-P1"]);
  assert.equal(withPhase.status, 0, withPhase.output);
  assert.match(withPhase.stdout, /^gates: takes-phase: green: received --phase M9-P1$/m);
  assert.match(withPhase.stdout, /^gates: needs-phase: green: received --phase M9-P1$/m);

  /* No phase: the optional one runs without it, the required one is error
     (M2-C-3 unchanged). Compared with the real captured runner output. */
  const withoutPhase = runRunner(dir, []);
  assert.equal(withoutPhase.status, 21, withoutPhase.output);
  assert.equal(withoutPhase.stdout, captured("runner-no-phase", byEventCapturePath));
});

test("a project registry whose suite passes --plan and declares phase? proves the phase's criteria on a pull request and reports them not applicable on a push", () => {
  /* The criterion's test is skipped, so wherever the criteria half runs it is
     red: red on the pull request is the proof that it ran there, and green on
     the push is the proof that a push, which names no phase, is not held to
     one phase's criteria. */
  const plan = planWith([{ id: "c-skip", criterion: "beta", check: { tests: ["beta is skipped"] } }]);
  const { dir, base } = makeFixture({ "test/a.test.ts": TESTS_FILE }, plan);
  writeRegistry(dir, [
    registryEntry("suite", ["node", gatePath, "--plan", "plan.json"], ["base", "phase?"], "tests reported"),
  ]);

  const pullRequest = runRunner(dir, ["--event", "pull_request", "--base", base, "--phase", "m9-p1"]);
  assert.equal(pullRequest.status, 1, pullRequest.output);
  assert.equal(scrubRun(pullRequest.stdout, base), captured("suite-pull-request", byEventCapturePath));

  const push = runRunner(dir, ["--event", "push", "--base", base]);
  assert.equal(push.status, 0, push.output);
  assert.equal(scrubRun(push.stdout, base), captured("suite-push", byEventCapturePath));
});

/* ------------------------------------------------------------------ */
/* p4-count: the not-testable count, from the plan                      */
/* ------------------------------------------------------------------ */

test("tiphys plan count prints each phase's criteria and not-testable count from the plan, and refuses an invalid plan", () => {
  const plan = planWith([
    { id: "1", criterion: "a", check: { tests: ["a"] } },
    { id: "2", criterion: "b", "not-testable": "a reading" },
  ]);
  const second = structuredClone((plan["phases"] as Record<string, unknown>[])[0]) as Record<string, unknown>;
  second["id"] = "M9-P2";
  second["branch"] = "claude/m9-p2-second";
  second["acceptance"] = [
    { id: "1", criterion: "c", "not-testable": "a reading" },
    { id: "2", criterion: "d", "not-testable": "another reading" },
    { id: "3", criterion: "e", check: { command: ["node", "--version"] } },
  ];
  (plan["phases"] as Record<string, unknown>[]).push(second);
  const dir = mkdtempSync(join(tmpdir(), "tiphys-criteria-count-"));
  const file = join(dir, "plan.json");
  writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`);

  const all = spawnSync(process.execPath, [cliEntry, "plan", "count", "--plan", file], { encoding: "utf8" });
  assert.equal(all.status, 0, all.stderr);
  assert.equal(all.stdout, "phase M9-P1: 2 criteria, 1 not-testable (2)\nphase M9-P2: 3 criteria, 2 not-testable (1, 2)\n");

  const one = spawnSync(process.execPath, [cliEntry, "plan", "count", "--plan", file, "--phase-id", "m9-p2"], {
    encoding: "utf8",
  });
  assert.equal(one.status, 0, one.stderr);
  assert.equal(one.stdout, "phase M9-P2: 3 criteria, 2 not-testable (1, 2)\n");

  /* A criterion with neither shape is not silently counted as testable. */
  (second["acceptance"] as Record<string, unknown>[]).push({ id: "4", criterion: "f" });
  writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`);
  const invalid = spawnSync(process.execPath, [cliEntry, "plan", "count", "--plan", file], { encoding: "utf8" });
  assert.equal(invalid.status, 1, invalid.stdout);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /INVALID #\/phases\/1\/acceptance\/3 /);
});

test("the final report schema rejects a current report without the per-phase not-testable count and accepts it with one", () => {
  const template = yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "final-report.example.yaml"), "utf8"),
  ) as Record<string, unknown>;
  assert.deepEqual(template["not-testable"], [{ phase: "M3-P3", criteria: [] }]);
  const dir = mkdtempSync(join(tmpdir(), "tiphys-criteria-report-"));
  const validate = (report: Record<string, unknown>): { status: number | null; output: string } => {
    const file = join(dir, "report.json");
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    const run = spawnSync(process.execPath, [cliEntry, "validate", "--type", "final-report", file], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return { status: run.status, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
  };
  assert.equal(validate(template).status, 0);

  const without = { ...template };
  delete without["not-testable"];
  const refused = validate(without);
  assert.equal(refused.status, 1, refused.output);
  assert.match(refused.output, /^INVALID #\/not-testable required property not-testable is missing$/m);

  /* The count is carried as the ids, so it is never a number (the schema's
     standing no-numeric-field rule, M5-P2): no rows, a row with no list, a
     number in place of the list, and one id listed twice are each refused. */
  for (const rows of [
    [],
    [{ phase: "M3-P3" }],
    [{ phase: "M3-P3", criteria: 0 }],
    [{ phase: "M3-P3", criteria: ["p1", "p1"] }],
  ]) {
    const bad = validate({ ...template, "not-testable": rows });
    assert.equal(bad.status, 1, `${JSON.stringify(rows)}: ${bad.output}`);
  }

  /* History: a report with no stamp predates the rule and still validates. */
  const history = { ...without };
  delete history["tiphys-version"];
  const old = validate(history);
  assert.equal(old.status, 0, old.output);
  assert.match(old.output, /^HISTORY final-report-not-testable-required applies from tiphys-version 0\.2\.2/m);
});

/* ------------------------------------------------------------------ */
/* The hazard reviewer's brief carries the not-testable criteria        */
/* ------------------------------------------------------------------ */

test("the composed hazard review brief carries each not-testable criterion as a question, and says so when there is none", () => {
  const compose = (planFile: string, role: string): { status: number | null; stdout: string; stderr: string } => {
    const run = spawnSync(
      process.execPath,
      [cliEntry, "brief", "compose", "--role", role, "--phase", planFile, "--phase-id", "M9-P1"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
  };
  const reviewer = compose("templates/plan.example.yaml", "clean-room-reviewer");
  assert.equal(reviewer.status, 0, reviewer.stderr);
  const section = reviewer.stdout.slice(reviewer.stdout.indexOf("# Not-testable criteria"));
  assert.ok(section.startsWith("# Not-testable criteria: questions this review answers"), reviewer.stdout);
  assert.ok(
    section.includes("- 3: The retry log line tells an operator which request is being retried and why."),
    section,
  );
  assert.ok(
    section.includes(
      "  not-testable: Whether a log line is clear to an operator is a reading; the hazard review answers it.",
    ),
    section,
  );
  /* Criteria that name a check are proven by the kernel and are not questions. */
  assert.doesNotMatch(section, /^- [12]: /m);

  const dir = mkdtempSync(join(tmpdir(), "tiphys-criteria-brief-"));
  const allChecked = join(dir, "plan.json");
  writeFileSync(
    allChecked,
    `${JSON.stringify(planWith([{ id: "1", criterion: "a", check: { tests: ["a"] } }]), null, 2)}\n`,
  );
  const none = compose(allChecked, "clean-room-reviewer");
  assert.equal(none.status, 0, none.stderr);
  assert.match(
    none.stdout,
    /# Not-testable criteria: questions this review answers\n\n\(none: every acceptance criterion of this phase names a check the kernel runs\)/,
  );
});

/* ------------------------------------------------------------------ */
/* Fix round 1: pass-shaped points, compose, template, env, ambiguity  */
/* ------------------------------------------------------------------ */

/* `expectFailure` makes node report a test whose assertions FAILED as
   test:pass (node v26.6.0, measured in the work history's fix round 1). */
const XFAIL_FILE =
  'import { strict as assert } from "node:assert";\n' +
  'import { test } from "node:test";\n' +
  'test("the retry happens twice", { expectFailure: "retries are not built yet" }, () => {\n' +
  '  assert.equal(1, 2, "the retry happened once");\n' +
  "});\n" +
  'test("the retry is logged", { expectFailure: true }, () => {\n' +
  '  throw new Error("nothing was logged");\n' +
  "});\n";

/* The body passes only in the EARLIER run, which records it in the rerun
   state file; in the gate's run the body throws, and node replays the earlier
   pass instead of running it. */
const REPLAY_FILE =
  'import { test } from "node:test";\n' +
  'test("the cache is warm", () => {\n' +
  '  if (process.env["TIPHYS_FIXTURE_EARLIER_RUN"] !== "1") {\n' +
  '    throw new Error("the cache is cold in this run");\n' +
  "  }\n" +
  "});\n";

const NEW_FILE = 'import { test } from "node:test";\ntest("a new test runs", () => {});\n';

const RERUN_SCRIPT = 'node --test --test-rerun-failures=.rerun.json "test/**/*.test.ts"';

test("a criterion whose named test passes only under expectFailure, or only as a replay of an earlier run, is red naming the criterion and the title", () => {
  const plan = planWith([
    { id: "c-xfail", criterion: "the retry", check: { tests: ["the retry happens twice"] } },
    { id: "c-xfail-bare", criterion: "the log", check: { tests: ["the retry is logged"] } },
    { id: "c-replay", criterion: "the cache", check: { tests: ["the cache is warm"] } },
    { id: "c-new", criterion: "a test that runs", check: { tests: ["a new test runs"] } },
  ]);
  const { dir, base } = makeFixture(
    { "test/x.test.ts": XFAIL_FILE, "test/r.test.ts": REPLAY_FILE, "test/n.test.ts": NEW_FILE },
    plan,
    RERUN_SCRIPT,
  );
  const node = (args: string[], extraEnv: Record<string, string> = {}): { status: number | null; out: string } => {
    const run = spawnSync(process.execPath, args, {
      cwd: dir,
      encoding: "utf8",
      env: { ...scrubbedEnv(), ...extraEnv },
    });
    return { status: run.status, out: `${run.stdout ?? ""}${run.stderr ?? ""}` };
  };
  /* THE DANGEROUS STATE, shown by node itself: the expectFailure file exits 0
     although both bodies fail, and the cache test's body fails when run. */
  assert.equal(node(["--test", "test/x.test.ts"]).status, 0);
  assert.equal(node(["--test", "test/r.test.ts"]).status, 1);
  /* The earlier run: only r.test.ts, its body passing, recorded in the state. */
  const earlier = node(["--test", "--test-rerun-failures=.rerun.json", "test/r.test.ts"], {
    TIPHYS_FIXTURE_EARLIER_RUN: "1",
  });
  assert.equal(earlier.status, 0, earlier.out);

  const run = runGate(dir, base, ["--plan", "plan.json", "--phase", "M9-P1"]);
  assert.equal(run.record.status, "red", run.record.detail);
  assert.equal(run.stdout, captured("pass-shaped-red"));
  for (const finding of [
    'criterion c-xfail: test "the retry happens twice" passed only because it is marked expectFailure, so its assertions failed (test/x.test.ts)',
    'criterion c-xfail-bare: test "the retry is logged" passed only because it is marked expectFailure, so its assertions failed (test/x.test.ts)',
    'criterion c-replay: test "the cache is warm" passed only as a replay of an earlier run (--test-rerun-failures), so this run did not execute it (test/r.test.ts)',
  ]) {
    assert.ok(run.record.detail.includes(finding), `missing: ${finding}\n${run.record.detail}`);
  }
  /* The control inside the same run: a test the earlier run never saw runs
     for real under the same flag and proves its criterion. */
  assert.doesNotMatch(run.record.detail, /criterion c-new:/);
  assert.equal(run.criteria?.["proven"], 1);
  assert.equal(run.criteria?.["unproven"], 3);
});

test("brief compose refuses a plan that does not validate against the plan schema, naming the plan and the invalid criterion", () => {
  const plan = planWith([{ id: "c-bare", criterion: "neither check nor not-testable" }]);
  const dir = mkdtempSync(join(tmpdir(), "tiphys-criteria-brief-"));
  const planFile = join(dir, "plan.json");
  writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  /* The same plan, as `validate --type plan` reads it. */
  const validated = validatePlan(plan);
  assert.notEqual(validated.status, 0, validated.output);
  assert.match(validated.output, /INVALID #\/phases\/0\/acceptance\/0 /);

  const run = spawnSync(
    process.execPath,
    [cliEntry, "brief", "compose", "--role", "clean-room-reviewer", "--phase", planFile, "--phase-id", "M9-P1"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.notEqual(run.status, 0, run.stdout);
  assert.equal(run.stdout, "");
  assert.ok(
    (run.stderr ?? "").includes(
      `plan ${planFile} does not validate against the plan schema: INVALID #/phases/0/acceptance/0 `,
    ),
    run.stderr,
  );
});

test("the shipped plan template names tests in check.tests and never proves a criterion with a test runner's exit code", () => {
  const template = yamlModule.parse(
    readFileSync(join(repoRoot, "templates", "plan.example.yaml"), "utf8"),
  ) as { phases: { acceptance: { id: string; check?: { tests?: string[]; command?: string[] } }[] }[] };
  const criteria = template.phases.flatMap((phase) => phase.acceptance);
  const runsATestRunner = (argv: string[]): boolean =>
    argv.some((word) => /^--test(?:$|[-=])/.test(word)) ||
    (argv[0] === "npm" && (argv[1] === "test" || argv[1] === "t" || (argv[1] === "run" && argv[2] === "test")));
  for (const criterion of criteria) {
    assert.equal(
      runsATestRunner(criterion.check?.command ?? []),
      false,
      `criterion ${criterion.id} proves itself with a test runner's exit code`,
    );
  }
  /* Criterion 1 names its four tests, and a plan written from the template
     still validates. */
  assert.equal(criteria[0]?.check?.tests?.length, 4);
  assert.equal(criteria[0]?.check?.command, undefined);
  const validated = validatePlan(template as unknown as Record<string, unknown>);
  assert.equal(validated.status, 0, validated.output);
});

test("a plan declaring one phase id twice makes the suite gate error naming the id, rather than proving the first", () => {
  const plan = planWith([{ id: "c-test", criterion: "alpha", check: { tests: ["alpha passes"] } }]);
  const phases = plan["phases"] as Record<string, unknown>[];
  /* The second phase carries the same id and names a test nobody reports, so
     proving "the first" would read green. */
  const second = structuredClone(phases[0]) as Record<string, unknown>;
  second["acceptance"] = [{ id: "c-other", criterion: "never run", check: { tests: ["no such test"] } }];
  for (const hazard of second["hazard-classes"] as Record<string, unknown>[]) {
    hazard["addressed-by"] = "criterion c-other";
  }
  phases.push(second);
  const { dir, base } = makeFixture({ "test/a.test.ts": TESTS_FILE }, plan);
  /* Lower case, as CI derives it from a branch name. */
  const run = runGate(dir, base, ["--plan", "plan.json", "--phase", "m9-p1"]);
  assert.equal(run.record.status, "error", run.record.detail);
  assert.equal(run.status, 21);
  assert.equal(
    run.record.detail,
    "plan plan.json declares 2 phases with id m9-p1, so its criteria cannot be told apart",
  );
  assert.equal(existsSync(join(run.evidenceDir, "suite-events.ndjson")), false);
});

test("a criterion naming a describe title is not proven by the suite point, even when every test inside it was skipped", () => {
  const plan = planWith([
    { id: "c-suite", criterion: "the group", check: { tests: ["group of skipped tests"] } },
    { id: "c-ok", criterion: "alpha", check: { tests: ["alpha passes"] } },
  ]);
  const { dir, base } = makeFixture(
    {
      "test/a.test.ts": TESTS_FILE,
      "test/d.test.ts":
        'import { describe, test } from "node:test";\n' +
        'describe("group of skipped tests", () => {\n' +
        '  test("inner one", { skip: "fixture reason" }, () => {});\n' +
        '  test("inner two", { skip: "fixture reason" }, () => {});\n' +
        "});\n",
    },
    plan,
  );
  const run = runGate(dir, base, ["--plan", "plan.json", "--phase", "M9-P1"]);
  assert.equal(run.record.status, "red", run.record.detail);
  assert.ok(
    run.record.detail.includes(
      'criterion c-suite: test "group of skipped tests" was not reported by the suite, so nothing proves it',
    ),
    run.record.detail,
  );
  assert.doesNotMatch(run.record.detail, /criterion c-ok:/);
  assert.equal(run.criteria?.["proven"], 1);
  assert.equal(run.criteria?.["unproven"], 1);
});

test("a check command that hands an inline script to a shell behind env and assignments is red, and env before any other program is run", () => {
  const plan = planWith([
    { id: "c-env", criterion: "env then a shell", check: { command: ["env", "sh", "-c", "exit 0"] } },
    {
      id: "c-env-assign",
      criterion: "env, assignments, then a shell",
      check: { command: ["/usr/bin/env", "A=1", "B=two words", "bash", "-lc", "exit 0"] },
    },
    {
      id: "c-env-i",
      criterion: "env -i, an assignment, then a shell",
      check: { command: ["env", "-i", "PATH=/usr/bin:/bin", "sh", "-c", "exit 0"] },
    },
    {
      id: "c-env-ok",
      criterion: "env then a program",
      check: { command: ["env", "A=1", "node", "-e", "process.exit(process.env.A === '1' ? 0 : 7)"] },
    },
  ]);
  const { dir, base } = makeFixture({ "test/a.test.ts": TESTS_FILE }, plan);
  const run = runGate(dir, base, ["--plan", "plan.json", "--phase", "M9-P1"]);
  assert.equal(run.record.status, "red", run.record.detail);
  assert.equal(run.stdout, captured("env-shell-red"));
  for (const finding of [
    'criterion c-env: check.command ["env","sh","-c","exit 0"] was not proven: it hands an inline script to sh,',
    'criterion c-env-assign: check.command ["/usr/bin/env","A=1","B=two words","bash","-lc","exit 0"] was not proven: it hands an inline script to bash,',
    'criterion c-env-i: check.command ["env","-i","PATH=/usr/bin:/bin","sh","-c","exit 0"] was not proven: it hands an inline script to sh,',
  ]) {
    assert.ok(run.record.detail.includes(finding), `missing: ${finding}\n${run.record.detail}`);
  }
  /* env in front of a program that is not a shell is run, and proves. */
  assert.doesNotMatch(run.record.detail, /criterion c-env-ok:/);
  assert.equal(run.criteria?.["proven"], 1);
  assert.equal(run.criteria?.["unproven"], 3);
});
