import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Tests for the M2 exit-test harness (kernel plan M2, M2-P9).
 *
 * WHAT THIS FILE GUARDS, AND WHAT GUARDS THE REST.
 *
 *   - The harness's argument handling (fast, no build).
 *   - The self-test itself: `--self-test` runs the harness's assertion code
 *     over two fixture manifests and must REJECT both, naming the gate, and
 *     exit nonzero. This is criterion 3's own behaviour, exercised end to end
 *     against the compiled runner (guarded by the presence of dist, which the
 *     workflow builds before `npm test`).
 *   - The CI wiring, criterion 5: the exit-test bundle step and the self-test
 *     falsifiability guard step both sit INSIDE the single `gates` job, which
 *     under DR-0017 IS DR-0004's required status context, and neither can be
 *     decoupled from the required check. This is asserted by BEHAVIOUR (the
 *     guard step's own shell script is extracted and executed against stub
 *     harnesses) and by pinned structure, never by asserting over the text of
 *     the workflow, which is the guard-that-asserts-text class MECHANISMS.md
 *     records six instances of (CR-720 to CR-722, section 1.5 row 17).
 *
 * The full PR and main bundles are NOT run from this suite. Running them means
 * running the whole gate set, which runs this repository's own suite in a
 * subprocess: a test in this file that invoked it would be re-entered by the
 * suite it invoked, exactly the recursion the M1-P6 harness test documents
 * (test/exit-test-local.test.ts header). Those bundles are exercised by the
 * orchestrator's exit run and by CI. The self-test, by contrast, runs only
 * FIXTURE gates (trivial subprocesses), so it is safe to run here.
 *
 * Every spawn strips NODE_OPTIONS and the NODE_TEST_* variables: node --test
 * sets a child-of-a-runner context and a custom reporter that a nested node
 * would inherit and misbehave under, and this file's own spawns must reproduce
 * a clean shell, not the one the suite gate happens to run it in.
 */

const scriptsDir = fileURLToPath(new URL("../scripts", import.meta.url));
const harness = join(scriptsDir, "m2-exit-test.sh");
const distEntry = fileURLToPath(new URL("../dist/bin/tiphys.js", import.meta.url));

const WORKFLOW_PATH = fileURLToPath(
  new URL("../.github/workflows/gates.yml", import.meta.url),
);

/** The witness line the self-test guard prints on its success path. */
const GUARD_WITNESS = "m2 self-test falsifiability guard witnessed";

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-p9-"));
}

/** A clean env: no NODE_OPTIONS, no NODE_TEST_*, and no ambient git identity. */
function cleanEnv(root: string): Record<string, string> {
  const home = join(root, "empty-home");
  mkdirSync(home, { recursive: true });
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      key !== "NODE_OPTIONS" &&
      !key.startsWith("NODE_TEST") &&
      !key.startsWith("GIT_")
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

/**
 * Write a single-gate bundle carrying `scope` in a chosen status, for driving
 * the harness's own m2-assert.mjs directly. `withPrecondition` controls whether
 * a not-applicable record carries the evaluated, unmet precondition DR-0018
 * needs to accept a diff-scoped N/A. This is the exact shape a real run
 * produces: green with units, a not-applicable that names its unmet
 * branch-matches precondition (the non-phase / detached-HEAD shape), or a red
 * naming an undeclared path.
 */
function writeScopeBundle(
  dir: string,
  status: "green" | "not-applicable" | "red",
  withPrecondition: boolean,
): void {
  mkdirSync(join(dir, "scope"), { recursive: true });
  const applicable = status === "green" || status === "red";
  const units = status === "green" ? 3 : status === "red" ? 4 : 0;
  const summary = {
    gates: [{ id: "scope", status, applicable, vacuous: false, units }],
    counts: {
      declared: 1,
      applicable: applicable ? 1 : 0,
      verdict: applicable ? 1 : 0,
      green: status === "green" ? 1 : 0,
      red: status === "red" ? 1 : 0,
      "not-applicable": status === "not-applicable" ? 1 : 0,
      error: 0,
      vacuous: 0,
    },
  };
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
  const record: Record<string, unknown> = {
    gate: "scope",
    status,
    units,
    detail:
      status === "green"
        ? "3 changed path(s) audited against declaration ...m2-p9.json"
        : status === "red"
          ? "touched path(s) outside the declared scope: src/UNDECLARED-SCOPE-VIOLATION.ts"
          : "precondition scope-branch-is-a-phase-branch evaluated and unmet: branch does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$",
  };
  if (status === "not-applicable" && withPrecondition) {
    record["precondition"] = {
      id: "scope-branch-is-a-phase-branch",
      met: false,
      reason: "branch does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$",
    };
  }
  writeFileSync(join(dir, "scope", "result.json"), JSON.stringify(record));
}

/* -------------------------------------------------------------------- */
/* Argument handling.                                                    */
/* -------------------------------------------------------------------- */

test("the m2 exit-test harness rejects invalid invocations with exit 64", () => {
  const root = scratch();
  const env = cleanEnv(root);
  try {
    const cases: { args: string[]; expect: RegExp }[] = [
      { args: [], expect: /evidence directory argument is required/ },
      { args: ["--bundle", "sideways", "ev"], expect: /--bundle must be pr, main, or both/ },
      { args: ["--nonsense", "ev"], expect: /unknown option/ },
      { args: ["--base"], expect: /usage:/ },
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

test("the main bundle needs no phase: a push to main (non-phase branch, no --phase) reaches the bundle instead of dying at phase derivation", () => {
  // Regression guard. The main bundle runs no diff-scoped gate, so it needs no
  // phase; deriving one unconditionally made a push to main (branch "main", no
  // --phase) DIE at derivation before ever reaching the bundle, reddening every
  // push-to-main run. The harness resolves repo_root from its OWN location
  // (script_dir/..), never the cwd, so the only way to drive it against a
  // controlled branch is to run a COPY from a scratch repo. That scratch has no
  // built dist, so `--no-build` fails FAST at the build check that sits AFTER
  // the (now guarded) derivation, never reaching the gate set: no recursion
  // into this suite (the file header's constraint), and a clean red/green seam.
  const root = scratch();
  const env = cleanEnv(root);
  try {
    mkdirSync(join(root, "scripts"), { recursive: true });
    const copy = join(root, "scripts", "m2-exit-test.sh");
    writeFileSync(copy, readFileSync(harness, "utf8"), { mode: 0o755 });
    // A real repo on the non-phase branch "main", the exact push-to-main shape.
    const g = (args: string[]): void => {
      const r = run("git", args, { cwd: root, env });
      assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
    };
    g(["init", "-q", "-b", "main"]);
    g(["-c", "user.email=t@tiphys.invalid", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "base"]);
    const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, env });
    assert.equal(branch.stdout.trim(), "main", "the scratch repo must be on branch main");

    const result = run("bash", [copy, "--no-build", "--bundle", "main", join(root, "ev")], {
      cwd: root,
      env,
    });
    // It must NOT die deriving a phase (the bug); it must get PAST derivation to
    // the build check, which is the proof it reached the bundle path.
    assert.doesNotMatch(
      result.stderr,
      /could not derive --phase/,
      `the main bundle died at phase derivation instead of skipping it: ${result.stderr}`,
    );
    assert.match(
      result.stderr,
      /--no-build was passed but .* does not exist/,
      `expected the build check (proof the derivation was skipped) but got: ${result.stderr}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* The self-test itself (criterion 3), end to end against the runner.    */
/* -------------------------------------------------------------------- */

test("--self-test rejects a vacuous-green fixture and a required-not-applicable fixture, naming each, and exits nonzero", (t) => {
  if (!existsSync(distEntry)) {
    t.skip(`dist entry ${distEntry} is absent; build with npm run build before this test`);
    return;
  }
  const root = scratch();
  const env = cleanEnv(root);
  try {
    const evidence = join(root, "self-test-evidence");
    const result = run("bash", [harness, "--self-test", evidence], { cwd: root, env });
    // Nonzero is the WORKING state: the assertion code rejected both fixtures.
    // A zero here is the harness's own broken-signal, which the CI guard turns
    // into a job failure; witnessing it green would be the vacuous-pass hazard.
    assert.notEqual(
      result.status,
      0,
      `--self-test exited 0, which means a fixture slipped past the assertion code: ${result.stdout}\n${result.stderr}`,
    );
    // It must NAME each fixture gate, so a reader learns which shape was caught.
    assert.match(
      result.stdout,
      /fixture-vacuous/,
      "the self-test did not name the vacuous-green fixture gate it rejected",
    );
    assert.match(
      result.stdout,
      /fixture-required-na/,
      "the self-test did not name the required-not-applicable fixture gate it rejected",
    );
    // And it must have run BOTH fixtures through the assertion code (evidence
    // record present with both fixture exit codes nonzero).
    const selfTestRecord = join(evidence, "records");
    assert.ok(existsSync(selfTestRecord), "the self-test wrote no evidence records");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the assertion code accepts a diff-scoped gate that is not-applicable with an evaluated precondition, and rejects one without (DR-0018)", (t) => {
  // DR-0018 red-witness. The assertion code was changed so a REQUIRED diff-scoped
  // gate reporting not-applicable on the exit head (its trigger legitimately
  // unmet) is NOT a failure, while a diff-scoped gate that is not-applicable with
  // NO evaluated precondition (a silently skipped or mis-declared gate) STILL is.
  // This is exercised end to end against the SAME assertion program the harness
  // ships (extracted from a real run), over two crafted bundles that differ ONLY
  // in whether the not-applicable record carries an evaluated, unmet precondition.
  if (!existsSync(distEntry)) {
    t.skip(`dist entry ${distEntry} is absent; build with npm run build before this test`);
    return;
  }
  const root = scratch();
  const env = cleanEnv(root);
  try {
    // Obtain the exact m2-assert.mjs the harness writes (it is emitted before any
    // mode branch, so a --self-test run leaves it on disk regardless of outcome).
    const harnessEvidence = join(root, "harness-evidence");
    run("bash", [harness, "--self-test", harnessEvidence], { cwd: root, env });
    const assertProg = join(harnessEvidence, "m2-assert.mjs");
    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");

    const manifest = fileURLToPath(new URL("../gates.manifest.json", import.meta.url));

    // A bundle carrying a single diff-scoped gate reported not-applicable.
    const buildBundle = (dir: string, precondition: unknown): void => {
      mkdirSync(join(dir, "red-witness"), { recursive: true });
      const summary = {
        gates: [
          { id: "red-witness", status: "not-applicable", applicable: false, vacuous: false, units: 0 },
        ],
        counts: {
          declared: 1, applicable: 0, verdict: 0, green: 0, red: 0,
          "not-applicable": 1, error: 0, vacuous: 0,
        },
      };
      writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
      const record: Record<string, unknown> = {
        gate: "red-witness",
        status: "not-applicable",
        detail:
          precondition === undefined
            ? "not run in this bundle"
            : "precondition red-witness-diff evaluated and unmet: no changed path under src/, bin/",
      };
      if (precondition !== undefined) {
        record["precondition"] = precondition;
      }
      writeFileSync(join(dir, "red-witness", "result.json"), JSON.stringify(record));
    };

    const expect = {
      label: "dr-0018 diff-scoped",
      gates: [{ id: "red-witness", expect: "green|not-applicable", required: true, diffScoped: true }],
      absent: [] as string[],
    };
    const expectPath = join(root, "expect.json");
    writeFileSync(expectPath, JSON.stringify(expect));

    const runAssert = (dir: string): RunResult =>
      run(
        distEntry.endsWith(".js") ? process.execPath : "node",
        [assertProg, "--summary", join(dir, "summary.json"), "--evidence", dir, "--expect", expectPath, "--manifest", manifest],
        { cwd: root, env },
      );

    // VALID: not-applicable WITH an evaluated, unmet precondition -> accepted.
    const validDir = join(root, "valid");
    buildBundle(validDir, { id: "red-witness-diff", met: false, reason: "no changed path under src/, bin/", evidence: [] });
    const valid = runAssert(validDir);
    assert.equal(
      valid.status,
      0,
      `a diff-scoped gate not-applicable WITH an evaluated precondition must be accepted (DR-0018): ${valid.stdout}\n${valid.stderr}`,
    );

    // INVALID: not-applicable with NO evaluated precondition -> rejected, naming it.
    const invalidDir = join(root, "invalid");
    buildBundle(invalidDir, undefined);
    const invalid = runAssert(invalidDir);
    assert.notEqual(
      invalid.status,
      0,
      "a diff-scoped gate not-applicable with NO evaluated precondition must be rejected (a silently skipped gate cannot pass as legitimately N/A)",
    );
    assert.match(
      invalid.stdout + invalid.stderr,
      /red-witness/,
      "the rejection did not name the offending diff-scoped gate",
    );

    // COUNTERFACTUAL 2: a diff-scoped gate reported error is rejected even with a
    // precondition record present, so "diff-scoped" never becomes a pass for a
    // genuinely broken gate.
    const erroredDir = join(root, "errored");
    mkdirSync(join(erroredDir, "red-witness"), { recursive: true });
    writeFileSync(
      join(erroredDir, "summary.json"),
      JSON.stringify({
        gates: [{ id: "red-witness", status: "error", applicable: true, vacuous: false, units: 0 }],
        counts: { declared: 1, applicable: 1, verdict: 0, green: 0, red: 0, "not-applicable": 0, error: 1, vacuous: 0 },
      }),
    );
    writeFileSync(join(erroredDir, "red-witness", "result.json"), JSON.stringify({ gate: "red-witness", status: "error", detail: "broke" }));
    const errored = runAssert(erroredDir);
    assert.notEqual(
      errored.status,
      0,
      "a diff-scoped gate reported error must still fail the harness (a broken gate is never accepted as diff-scoped)",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no environment variable changes a production gate's reported status (grep over the gate sources)", () => {
  // Criterion 3, the anti-override property. A production gate must not read an
  // environment variable that changes its reported status; the one env a gate
  // touches is the implementer-token PRESENCE probe, a PRECONDITION (whether
  // the gate is applicable), never a status override. This asserts it by
  // reading the sources, which is where such a switch would have to live.
  const gatesDir = fileURLToPath(new URL("../src/gates", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
      } else if (p.endsWith(".ts")) {
        files.push(p);
      }
    }
  };
  walk(gatesDir);
  // A status-override switch would be a read of a LITERAL-NAMED environment
  // variable that steers the verdict. The only literal-named env read a gate
  // may carry is the implementer-token PRESENCE probe, which is applicability
  // (a precondition), never a status override. Dynamic reads (`process.env`
  // passed to a spawned child for scrubbing, `process.env[configuredName]` for
  // credential injection) are env plumbing, not a named switch, and are the
  // credential machinery's whole job; they are allowed.
  const namedRead = /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["']([^"']+)["']\s*\])/g;
  const ALLOWED_NAMES = new Set(["TIPHYS_IMPLEMENTER_TOKEN"]);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const [i, line] of text.split("\n").entries()) {
      for (const m of line.matchAll(namedRead)) {
        const name = (m[1] ?? m[2]) as string;
        assert.ok(
          ALLOWED_NAMES.has(name),
          `${file}:${String(i + 1)} reads the named environment variable ${name}: ${line.trim()}. ` +
            "A production gate must not read a named environment variable that changes its reported " +
            "status (M2-P9 criterion 3); the only permitted named read is the TIPHYS_IMPLEMENTER_TOKEN " +
            "PRESENCE probe, which is applicability, not a status override.",
        );
      }
    }
  }
});

/* -------------------------------------------------------------------- */
/* CI wiring, criterion 5. Mirrors test/exit-test-local.test.ts: read    */
/* the workflow by PINNED structure and refuse to guess, assert BEHAVIOUR */
/* by executing the guard step's own script, and never assert over text.  */
/* -------------------------------------------------------------------- */

function gatesWorkflowLines(): string[] {
  return readFileSync(WORKFLOW_PATH, "utf8").split("\n");
}

interface Block {
  start: number;
  end: number;
  lines: string[];
  keys: Map<string, string>;
}

/** Mapping entries at exactly `indent` spaces; pins the shapes it accepts. */
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
      continue;
    }
    const entry = /^ *(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_.-]+)) *:(?: +(.*))?$/.exec(line);
    assert.ok(
      entry,
      `${what}: gates.yml has a line at the key indent that this test cannot read as a ` +
        `single "key: value" entry: ${JSON.stringify(line)}. This test pins the shapes it ` +
        "accepts and refuses to guess at the rest, because a reader that guesses returns " +
        "nothing for a shape it does not know and reports that as an absence of keys (CR-722).",
    );
    const name = (entry[1] ?? entry[2] ?? entry[3]) as string;
    keys.set(name, (entry[4] ?? "").trim());
  }
  return keys;
}

function workflowJob(name: string): Block {
  const lines = gatesWorkflowLines();
  const start = lines.findIndex(
    (l) =>
      /^ {2}(?:"([^"]*)"|'([^']*)'|[A-Za-z0-9_.-]+) *:/.test(l) &&
      declaredKeys([l], 2, "jobs").has(name),
  );
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

function workflowStep(job: Block, nameFragment: string): Block & { script: string } {
  const lines = gatesWorkflowLines();
  const named = lines
    .map((l, i) => ({ l, i }))
    .filter(
      ({ l }) =>
        /^ {6}- name:|^ {8}name:/.test(l) &&
        l.toLowerCase().includes(nameFragment.toLowerCase()),
    );
  assert.equal(
    named.length,
    1,
    `expected exactly 1 workflow step named for "${nameFragment}", found ${named.length}. ` +
      "Renaming this step, or adding a second step whose name also matches, is a deliberate " +
      "change: this test identifies the step by its name and has no other handle on it.",
  );
  let start = named[0]?.i ?? -1;
  while (start >= 0 && !/^ {6}- /.test(lines[start] ?? "")) {
    start -= 1;
  }
  assert.ok(start >= 0, `the step named for "${nameFragment}" is not inside a "      - " list item`);
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
  const keys = declaredKeys(
    [(slice[0] ?? "").replace(/^ {6}- /, " ".repeat(8))].concat(slice.slice(1)),
    8,
    `step "${nameFragment}"`,
  );
  // Support both "run: |" (block) and "run: >" (folded), since the exit-test
  // bundle step uses a folded scalar and the guard step uses a literal block.
  const runAt = slice.findIndex((l) => /^ {8}(?:"run"|'run'|run) *: *[|>]/.test(l));
  assert.notEqual(runAt, -1, `step ${nameFragment} has no "run: |" or "run: >" block`);
  const script = slice
    .slice(runAt + 1)
    .map((l) => (l.startsWith(" ".repeat(10)) ? l.slice(10) : l))
    .join("\n");
  assert.ok(script.trim().length > 0, `step ${nameFragment} has an empty run block`);
  assert.ok(
    start > job.start && end <= job.end,
    `the "${nameFragment}" step is not inside the job this test was asked about ` +
      `(step lines ${start + 1}-${end}, job lines ${job.start + 1}-${job.end}). ` +
      "A guard in a job that is not the required check gates nothing.",
  );
  return { start, end, lines: slice, keys, script };
}

const REFUSED_STEP_KEYS = ["if", "continue-on-error", "working-directory"] as const;
const REFUSED_JOB_KEYS = ["if", "continue-on-error"] as const;

const WHY_REFUSED: Record<string, string> = {
  if: "An `if:` there can stop the failure ever being evaluated.",
  "continue-on-error": "A `continue-on-error:` there stops a failure failing anything.",
  "working-directory":
    "A `working-directory:` there runs the step against a different tree, so it can " +
    "certify a harness that is not the one in this repository.",
};

function refuseKeys(keys: Map<string, string>, refused: readonly string[], what: string): void {
  for (const key of refused) {
    assert.ok(
      !keys.has(key),
      `${what} declares ${key}: ${JSON.stringify(keys.get(key))}. ${WHY_REFUSED[key] ?? ""} ` +
        `Exactly ${String(refused.length)} keys are refused here and every other key ` +
        "(permissions, env, timeout-minutes, defaults, id, with, ...) is allowed. If you need " +
        "this one, that is a decision about whether the milestone certification is still gated.",
    );
  }
}

test("the m2 self-test falsifiability guard fails the job when the assertion code cannot reject a vacuous bundle", () => {
  // BEHAVIOURAL, not textual. The guard step's own shell script is extracted
  // and EXECUTED against stub harnesses whose behaviour is known, and the
  // step's exit code is the assertion. A mutation that preserves the text but
  // inverts the meaning (`exit 1` to `exit 0`, or a step-level `if: false`)
  // reddens this test because the meaning is what is measured.
  const { script: stepScript } = workflowStep(
    workflowJob("gates"),
    "self-test guard",
  );
  const root = scratch();
  try {
    // A stub standing in for scripts/m2-exit-test.sh. Its only job is to exit
    // with a chosen code when called as `--self-test <dir>`.
    const stub = (exitCode: number): string => `#!/usr/bin/env bash\nexit ${String(exitCode)}\n`;

    const runGuard = (name: string, stubBody: string): RunResult => {
      const dir = join(root, name);
      mkdirSync(join(dir, "scripts"), { recursive: true });
      writeFileSync(join(dir, "scripts", "m2-exit-test.sh"), stubBody, { mode: 0o755 });
      const substituted = stepScript.replaceAll("${{ runner.temp }}", join(dir, "temp"));
      mkdirSync(join(dir, "temp"), { recursive: true });
      return run("bash", ["-c", substituted], { cwd: dir, env: cleanEnv(dir) });
    };

    // 1. The regression the guard exists for: a self-test that exits 0 means the
    //    assertion code let a vacuous bundle through. The guard MUST fail the job.
    const broken = runGuard("self-test-broken", stub(0));
    assert.notEqual(
      broken.status,
      0,
      "the guard passed a self-test that exited 0, which is the assertion code failing to reject a vacuous bundle",
    );

    // 2. A working self-test exits nonzero (it rejected the fixtures). The guard
    //    must PASS, or it would redden every honest run, and it must SAY SO.
    const working = runGuard("self-test-working", stub(1));
    assert.equal(
      working.status,
      0,
      "the guard rejected a self-test that correctly exited nonzero",
    );
    assert.match(
      working.stdout,
      new RegExp(GUARD_WITNESS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `the guard no longer prints "${GUARD_WITNESS}" on its success path, which is the only ` +
        "per-run evidence that the step actually executed in CI",
    );

    // 2b. A different nonzero self-test exit is still accepted: the guard keys on
    //     the exit code being nonzero, not on one specific value.
    const workingOther = runGuard("self-test-working-2", stub(2));
    assert.equal(
      workingOther.status,
      0,
      "the guard rejected a self-test that exited 2; it must accept any nonzero self-test exit",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the m2 exit-test bundle step and its self-test guard sit inside the required gates job", () => {
  // TIER 2 and TIER 3 of the boundary (see test/exit-test-local.test.ts).
  // DR-0017 collapsed the workflow to ONE job named `gates`, which IS DR-0004's
  // required status context. Both the exit-test bundle step (the single caller
  // of `gates run`) and the self-test falsifiability guard must sit inside it,
  // and neither may carry a key that decouples its failure from the required
  // check. Asserted within the bound the exit-test-local header names.
  const lines = gatesWorkflowLines();
  const gatesJob = workflowJob("gates");

  // The single caller of `gates run` is inside the required job. Its
  // containment is asserted by workflowStep, which fails loudly otherwise.
  // The bundle step legitimately carries `if: github.event_name == ...`,
  // because the pull-request and push variants are mutually exclusive by
  // event, so `if` is NOT refused here; `continue-on-error` and
  // `working-directory` still are, since either would decouple a failing
  // bundle from the required check or run it against another tree.
  const bundleStep = workflowStep(gatesJob, "M2 exit test (pull request)");
  refuseKeys(
    bundleStep.keys,
    ["continue-on-error", "working-directory"],
    "the M2 exit-test bundle step",
  );

  // The self-test guard is inside the required job.
  const guardStep = workflowStep(gatesJob, "self-test guard");
  refuseKeys(guardStep.keys, REFUSED_STEP_KEYS, "the M2 self-test falsifiability guard step");

  // The required job itself carries neither neutralising key: an `if:` could
  // skip the whole required check and `continue-on-error:` could stop a failure
  // counting. There is no fan-in that needs an `if:` here (DR-0017).
  refuseKeys(gatesJob.keys, REFUSED_JOB_KEYS, "the gates job");

  // The workflow runs on pull requests, UNFILTERED: a filter such as
  // paths-ignore leaves the trigger present while no pull request produces a
  // run (CR-723), so presence alone was never the property.
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
    "the pull_request: trigger carries an inline value; this test only accepts the unfiltered form",
  );

  // The shell-template hole, closed once for the whole file: a custom shell
  // command template carrying {0} can decide whether a step's script runs at
  // all, turning a guard green without touching its run: block.
  for (const [i, line] of lines.entries()) {
    const shell = /^ *(?:"shell"|'shell'|shell) *: +(.*)$/.exec(line);
    if (!shell) {
      continue;
    }
    assert.doesNotMatch(
      shell[1] as string,
      /\{0\}/,
      `gates.yml line ${String(i + 1)} sets a custom shell command template ` +
        `(${JSON.stringify(shell[1])}), which can turn a guard green without changing its run: block. ` +
        "A plain interpreter name such as `shell: bash` is accepted.",
    );
  }
});

/* -------------------------------------------------------------------- */
/* The scope-detached-HEAD fix (fix round 2). Two guards: the workflow    */
/* checks out the head branch BY NAME so scope is not detached (a pinned  */
/* value, the same class as the pull_request: "" pin above); and the      */
/* PR-bundle expectations REQUIRE scope green, so a scope not-applicable  */
/* (the detached-HEAD artifact, or any regression to it) is REJECTED      */
/* rather than accepted as legitimately N/A.                              */
/* -------------------------------------------------------------------- */

/** The `with:` mapping of the first `- uses: actions/checkout` step, indent 10. */
function checkoutWithKeys(): Map<string, string> {
  const lines = gatesWorkflowLines();
  const stepAt = lines.findIndex((l) => /^ {6}- uses: actions\/checkout/.test(l));
  assert.notEqual(stepAt, -1, "gates.yml has no `- uses: actions/checkout` step");
  // Step body runs until the next `      - ` list item or a dedent to <= 6.
  let end = lines.length;
  for (let i = stepAt + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || /^\s*#/.test(line)) {
      continue;
    }
    const lead = (/^ */.exec(line)?.[0] ?? "").length;
    if (/^ {6}- /.test(line) || lead <= 6) {
      end = i;
      break;
    }
  }
  const slice = lines.slice(stepAt, end);
  const withAt = slice.findIndex((l) => /^ {8}(?:"with"|'with'|with) *:\s*$/.test(l));
  assert.notEqual(withAt, -1, "the actions/checkout step declares no `with:` block");
  return declaredKeys(slice.slice(withAt + 1), 10, "checkout with:");
}

test("the gates workflow checks out the pull-request head branch by name (ref: github.head_ref) so scope is not detached", () => {
  // On a pull_request event actions/checkout defaults to a DETACHED HEAD at the
  // ephemeral merge commit, so `git rev-parse --abbrev-ref HEAD` returns "HEAD"
  // and the scope gate's branch-matches precondition (and the gate's own
  // current-branch cross-check) never match ^claude/mN-pM-...$: scope reports
  // not-applicable and never audits a real diff. Checking the head branch out
  // BY NAME (ref: github.head_ref) is what keeps scope auditing in CI, so this
  // value is pinned exactly, the same class as the pull_request: "" pin above.
  // A pinned value is not the guard-that-guesses class (CR-722): it reads one
  // named key and fails loudly if the value is anything else or the key is gone.
  const keys = checkoutWithKeys();
  assert.ok(
    keys.has("ref"),
    "the actions/checkout step declares no `ref:`; on a pull_request event it then " +
      "defaults to a detached HEAD, and the scope gate reports not-applicable on every " +
      "CI run (never auditing a real diff). Set `ref: ${{ github.head_ref }}`.",
  );
  assert.equal(
    keys.get("ref"),
    "${{ github.head_ref }}",
    "the actions/checkout `ref:` is not `${{ github.head_ref }}`; only the head-branch-by-name " +
      "form puts the runner on claude/mN-pM-... so the scope gate audits. A SHA there re-detaches " +
      "HEAD and reintroduces the vacuous scope pass.",
  );
  // fetch-depth: 0 must be preserved alongside ref: the diff-scoped gates need
  // full history to compute merge bases against the base ref.
  assert.equal(
    keys.get("fetch-depth"),
    "0",
    "the actions/checkout step must keep `fetch-depth: 0`; a shallow checkout has no merge base " +
      "for the diff-scoped gates to compute against.",
  );
});

/** Resolve scope's PR-bundle expected status from the harness's own logic. */
function resolveScopeExpect(
  root: string,
  env: Record<string, string>,
  phase: string,
  branch: string,
): string {
  return run("bash", [harness, "--resolve-scope-expect", phase, branch], {
    cwd: root,
    env,
  }).stdout.trim();
}

/** Run the harness's shipped m2-assert.mjs over a bundle against an expect doc. */
function runScopeAssert(
  root: string,
  env: Record<string, string>,
  assertProg: string,
  manifest: string,
  dir: string,
  scopeExpect: string,
): RunResult {
  const expectPath = join(root, `expect-${scopeExpect.replace(/[^a-z]/g, "")}.json`);
  writeFileSync(
    expectPath,
    JSON.stringify({
      label: `scope ${scopeExpect}`,
      gates: [{ id: "scope", expect: scopeExpect, required: true, diffScoped: true }],
      absent: [],
    }),
  );
  return run(
    process.execPath,
    [assertProg, "--summary", join(dir, "summary.json"), "--evidence", dir, "--expect", expectPath, "--manifest", manifest],
    { cwd: root, env },
  );
}

test("the PR bundle requires scope green: the harness assertion code rejects a scope not-applicable and accepts a scope green", (t) => {
  // The PHASE-RUN arm. M2R-026 made this harness the CI for EVERY pull request,
  // not only phase-branch PRs (the non-phase arm is the test below). On a
  // PHASE-branch run scope is required GREEN: scope's precondition is
  // branch-matches, and a phase-branch PR is BY CONSTRUCTION expected to audit
  // its diff, so a scope not-applicable there is the detached-HEAD vacuous pass
  // the M2-P9 HIGH was about (or a missing declaration, or a branch-name
  // regression) and MUST fail. Behavioural throughout:
  //  (1) the harness resolves scope's expected status to "green" on a phase run
  //      (its --phase is a valid phase id OR its head branch is claude/mN-pM-);
  //  (2) under that resolved "green" the SAME assertion program the harness ships
  //      REJECTS a scope not-applicable naming scope (reddens if a phase-run N/A
  //      is ever accepted) and ACCEPTS a scope green with units (not merely
  //      always-red);
  //  (3) the harness actually WIRES the resolved value into PR_EXPECT_JSON via
  //      the placeholder (a pinned-value read, the same class as the workflow ref
  //      pin), so the arms above guard a value the harness really uses.
  if (!existsSync(distEntry)) {
    t.skip(`dist entry ${distEntry} is absent; build with npm run build before this test`);
    return;
  }
  const root = scratch();
  const env = cleanEnv(root);
  try {
    // (1) A phase run resolves scope to "green", by either detection arm.
    assert.equal(
      resolveScopeExpect(root, env, "m2-p9", "main"),
      "green",
      "a valid --phase id must resolve scope to green (a phase run is expected to audit its diff)",
    );
    assert.equal(
      resolveScopeExpect(root, env, "not-a-phase", "claude/m2-p9-exit-test"),
      "green",
      "a claude/mN-pM- head branch must resolve scope to green even when --phase is not itself a phase id",
    );

    // (2) Extract the exact assertion program the harness ships and drive it.
    const harnessEvidence = join(root, "harness-evidence");
    run("bash", [harness, "--self-test", harnessEvidence], { cwd: root, env });
    const assertProg = join(harnessEvidence, "m2-assert.mjs");
    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");
    const manifest = fileURLToPath(new URL("../gates.manifest.json", import.meta.url));

    // The not-applicable bundle carries the evaluated, unmet precondition DR-0018
    // needs, so the ONLY reason "green" rejects it is the required-green rule for
    // a phase run, not a malformed bundle.
    const naDir = join(root, "scope-na");
    writeScopeBundle(naDir, "not-applicable", true);
    const greenDir = join(root, "scope-green");
    writeScopeBundle(greenDir, "green", false);

    // DANGEROUS STATE: a scope not-applicable under the phase (green) expect is
    // REJECTED, naming scope (the vacuous pass a phase run must never accept).
    const rejected = runScopeAssert(root, env, assertProg, manifest, naDir, "green");
    assert.notEqual(
      rejected.status,
      0,
      `a phase-run scope not-applicable must be REJECTED under the required-green expect (the vacuous pass): ${rejected.stdout}\n${rejected.stderr}`,
    );
    assert.match(rejected.stdout + rejected.stderr, /\[scope\]/, "the rejection did not name scope");

    // NOT MERELY ALWAYS-RED: a scope green with units is ACCEPTED.
    const acceptedGreen = runScopeAssert(root, env, assertProg, manifest, greenDir, "green");
    assert.equal(
      acceptedGreen.status,
      0,
      `a scope green with units must be ACCEPTED under the required-green expect: ${acceptedGreen.stdout}\n${acceptedGreen.stderr}`,
    );

    // CONTROL: the non-phase "green|not-applicable" expect ACCEPTS the same N/A
    // bundle, isolating the required-green rule as the cause of the rejection.
    const controlAccepts = runScopeAssert(root, env, assertProg, manifest, naDir, "green|not-applicable");
    assert.equal(
      controlAccepts.status,
      0,
      `the non-phase green|not-applicable expect must ACCEPT the same scope N/A bundle (isolating required-green as the cause): ${controlAccepts.stdout}\n${controlAccepts.stderr}`,
    );

    // (3) The harness WIRES the resolved value in via the placeholder. A hardcoded
    // scope expect either way is a regression: "green" would reopen the non-phase
    // block, "green|not-applicable" would reopen the phase-run vacuous pass.
    const harnessText = readFileSync(harness, "utf8");
    assert.match(
      harnessText,
      /\{"id": "scope", "expect": "__SCOPE_EXPECT__", "required": true, "diffScoped": true\}/,
      "scripts/m2-exit-test.sh PR_EXPECT_JSON no longer resolves scope per run via the __SCOPE_EXPECT__ " +
        "placeholder; scope's expected status must be chosen by resolve_scope_expect, not hardcoded.",
    );
    assert.doesNotMatch(
      harnessText,
      /\{"id": "scope", "expect": "green", "required": true, "diffScoped": true\}/,
      "scripts/m2-exit-test.sh PR_EXPECT_JSON hardcodes scope green again; that fails every NON-phase PR " +
        "(scope is legitimately N/A there) and reopens the block M2R-026 introduced.",
    );
    assert.doesNotMatch(
      harnessText,
      /\{"id": "scope", "expect": "green\|not-applicable", "required": true, "diffScoped": true\}/,
      "scripts/m2-exit-test.sh PR_EXPECT_JSON hardcodes scope green|not-applicable; that accepts a scope " +
        "not-applicable on a PHASE branch too, reopening the detached-HEAD vacuous pass.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the PR bundle accepts a scope not-applicable on a non-phase run and resolves scope differently for phase vs non-phase runs (M2R-026)", (t) => {
  // The NON-PHASE arm, the unblock. M2R-026 made this harness the CI for EVERY
  // pull request, so a non-phase PR (a bug fix, paperwork, a harness fix) whose
  // scope is legitimately not-applicable (its branch does not match
  // ^claude/mN-pM-, the branch-matches precondition evaluated and unmet) must
  // PASS, not fail with "[scope] expected green, observed not-applicable". Two
  // halves, both behavioural, no assertion over harness text:
  //  (1) resolve_scope_expect maps a non-phase run to "green|not-applicable" and
  //      a phase run to "green", and the two MUST differ (or the per-run split is
  //      dead code that resolves the same value on every branch);
  //  (2) under the resolved "green|not-applicable" the SAME assertion program the
  //      harness ships ACCEPTS a scope not-applicable WITH an evaluated
  //      precondition (reddens if a non-phase N/A is ever rejected, which is the
  //      block this fixes), while still REJECTING a scope not-applicable WITHOUT
  //      a precondition and a scope red (a real violation is never accepted, on
  //      any branch).
  if (!existsSync(distEntry)) {
    t.skip(`dist entry ${distEntry} is absent; build with npm run build before this test`);
    return;
  }
  const root = scratch();
  const env = cleanEnv(root);
  try {
    // (1) The per-run detection. A non-phase run accepts scope N/A; a phase run
    // requires green; the two differ (the anti-dead-code witness).
    const nonPhase = resolveScopeExpect(root, env, "claude/harness-scope-nonphase", "claude/harness-scope-nonphase");
    const phase = resolveScopeExpect(root, env, "m2-p9", "main");
    assert.equal(
      nonPhase,
      "green|not-applicable",
      "a non-phase run (non-phase --phase and non-phase branch) must resolve scope to green|not-applicable, or every non-phase PR fails CI on scope",
    );
    assert.equal(phase, "green", "a phase run must resolve scope to green");
    assert.notEqual(
      nonPhase,
      phase,
      "phase and non-phase runs must resolve scope to DIFFERENT expectations, or the per-run split is dead code",
    );
    assert.equal(
      resolveScopeExpect(root, env, "", "main"),
      "green|not-applicable",
      "an empty --phase on a non-phase branch is a non-phase run",
    );

    // (2) Under the resolved non-phase expect, the shipped assertion program
    // accepts the legitimate N/A and still rejects the illegitimate shapes.
    const harnessEvidence = join(root, "harness-evidence");
    run("bash", [harness, "--self-test", harnessEvidence], { cwd: root, env });
    const assertProg = join(harnessEvidence, "m2-assert.mjs");
    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");
    const manifest = fileURLToPath(new URL("../gates.manifest.json", import.meta.url));

    // THE UNBLOCK: scope not-applicable WITH an evaluated precondition -> ACCEPTED.
    const naWithPre = join(root, "scope-na-pre");
    writeScopeBundle(naWithPre, "not-applicable", true);
    const acceptedNa = runScopeAssert(root, env, assertProg, manifest, naWithPre, nonPhase);
    assert.equal(
      acceptedNa.status,
      0,
      `a non-phase scope not-applicable WITH an evaluated precondition must be ACCEPTED (the M2R-026 unblock): ${acceptedNa.stdout}\n${acceptedNa.stderr}`,
    );

    // Still REJECTED: a not-applicable WITHOUT an evaluated precondition (a
    // silently skipped or mis-declared gate) is not "legitimately N/A".
    const naNoPre = join(root, "scope-na-nopre");
    writeScopeBundle(naNoPre, "not-applicable", false);
    const rejectedNoPre = runScopeAssert(root, env, assertProg, manifest, naNoPre, nonPhase);
    assert.notEqual(
      rejectedNoPre.status,
      0,
      "a scope not-applicable WITHOUT an evaluated precondition must still be REJECTED, even on a non-phase run",
    );
    assert.match(rejectedNoPre.stdout + rejectedNoPre.stderr, /\[scope\]/, "the rejection did not name scope");

    // Still REJECTED: a real scope violation (red) fails on any branch.
    const redDir = join(root, "scope-red");
    writeScopeBundle(redDir, "red", false);
    const rejectedRed = runScopeAssert(root, env, assertProg, manifest, redDir, nonPhase);
    assert.notEqual(
      rejectedRed.status,
      0,
      "a scope red (a real out-of-scope violation) must fail even on a non-phase run",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
