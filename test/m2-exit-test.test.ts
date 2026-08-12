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
 * A manifest declaring exactly the gates a crafted single-gate bundle carries.
 *
 * These tests used to hand the assertion program the repository's REAL
 * gates.manifest.json alongside a bundle carrying ONE row, which was only ever
 * coherent because the manifest argument was inert: it was read solely to
 * recompute summary.manifestSha256, and these crafted summaries set no such
 * field. The manifest is now load-bearing, because the set of gates the program
 * asserts on is DERIVED from it, so a manifest declaring eleven gates beside a
 * one-row bundle is correctly ten missing records. Each test therefore declares
 * the manifest that describes the bundle it actually built.
 */
function manifestFor(root: string, gateIds: string[]): string {
  const path = join(root, `manifest-${gateIds.join("-")}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      gates: gateIds.map((id) => ({
        id,
        command: ["node", "-e", "process.exit(0)"],
        unitLabel: "units",
        applicability: "required",
      })),
      destructiveCommands: [],
    }),
  );
  return path;
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

    const manifest = manifestFor(root, ["red-witness"]);

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
    const manifest = manifestFor(root, ["scope"]);

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
    const manifest = manifestFor(root, ["scope"]);

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

/* -------------------------------------------------------------------- */
/* THE ASSERTION DIRECTION.                                              */
/*                                                                       */
/* The assertion program used to iterate the hand-written expectations   */
/* table and key into the bundle's rows, so a row the table did not name  */
/* was asserted by NOTHING, whatever its status: a red gate absent from   */
/* the table passed the exit test in silence. The set of gates it asserts */
/* on is now DERIVED (manifest ids, union the ids the bundle reported,    */
/* union the ids the table names, minus the ids declared absent), a gate  */
/* with no row defaults to REQUIRED-GREEN, and a global zero-red check    */
/* joins the existing zero-error and zero-vacuous ones.                   */
/*                                                                       */
/* Both arms are witnessed, because behaviour forks on the CI event and   */
/* T-009 records that the unwitnessed arm is the one that broke.          */
/* -------------------------------------------------------------------- */

/** The harness's own resolved expectations document for one arm. */
function printExpect(
  harnessPath: string,
  root: string,
  env: Record<string, string>,
  arm: "pr" | "main",
  scopeExpect?: string,
): { label: string; gates: { id: string; expect: string }[]; absent: string[] } {
  const args = [harnessPath, "--print-expect", arm];
  if (scopeExpect !== undefined) {
    args.push(scopeExpect);
  }
  const result = run("bash", args, { cwd: root, env });
  assert.equal(result.status, 0, `--print-expect ${arm} exited ${String(result.status)}: ${result.stderr}`);
  return JSON.parse(result.stdout) as {
    label: string;
    gates: { id: string; expect: string }[];
    absent: string[];
  };
}

/**
 * A bundle built from {id, status} rows, with per-gate result.json records of
 * the shape a real run produces and self-consistent summary counts, so the
 * recount check (CR-602) is never the reason a probe reddens and the assertion
 * DIRECTION is the only variable.
 */
function writeBundle(dir: string, rows: { id: string; status: string }[]): void {
  mkdirSync(dir, { recursive: true });
  const summaryRows = rows.map(({ id, status }) => ({
    id,
    status,
    applicable: status === "green" || status === "red" || status === "error",
    vacuous: false,
    units: status === "green" ? 3 : status === "red" ? 2 : 0,
  }));
  for (const row of summaryRows) {
    mkdirSync(join(dir, row.id), { recursive: true });
    const record: Record<string, unknown> = { gate: row.id, status: row.status, units: row.units };
    if (row.status === "not-applicable") {
      record["detail"] =
        `precondition ${row.id}-pre evaluated and unmet: STRUCTURAL, a post-merge check ` +
        "in a pre-merge bundle (kernel plan M2 section 1.4, O-3)";
      record["precondition"] = {
        id: `${row.id}-pre`,
        met: false,
        reason: "structural: evaluated and unmet",
      };
    } else {
      record["detail"] = `${row.id} examined ${String(row.units)} unit(s)`;
    }
    writeFileSync(join(dir, row.id, "result.json"), JSON.stringify(record, null, 2));
  }
  const counts = {
    declared: summaryRows.length,
    applicable: summaryRows.filter((r) => r.applicable).length,
    verdict: summaryRows.filter((r) => r.status === "green" || r.status === "red").length,
    green: summaryRows.filter((r) => r.status === "green").length,
    red: summaryRows.filter((r) => r.status === "red").length,
    "not-applicable": summaryRows.filter((r) => r.status === "not-applicable").length,
    error: summaryRows.filter((r) => r.status === "error").length,
    vacuous: 0,
  };
  writeFileSync(join(dir, "summary.json"), JSON.stringify({ gates: summaryRows, counts }, null, 2));
}

/**
 * A scratch copy of the harness beside a manifest of this test's choosing. The
 * harness resolves its repo root from its OWN location (script_dir/..), never
 * the cwd, so this is the only way to drive it against a manifest under the
 * test's control. --print-expect runs before argument parsing and before any
 * gate work, so the copy needs no dist and never re-enters this suite.
 */
function harnessCopy(root: string, extraGateIds: string[]): { harness: string; manifest: string } {
  mkdirSync(join(root, "scripts"), { recursive: true });
  const copy = join(root, "scripts", "m2-exit-test.sh");
  writeFileSync(copy, readFileSync(harness, "utf8"), { mode: 0o755 });
  const realManifest = JSON.parse(
    readFileSync(fileURLToPath(new URL("../gates.manifest.json", import.meta.url)), "utf8"),
  ) as { gates: { id: string }[] };
  for (const id of extraGateIds) {
    realManifest.gates.push({
      id,
      ...{ command: ["node", "-e", "process.exit(0)"], unitLabel: "units", applicability: "required" },
    } as { id: string });
  }
  const manifest = join(root, "gates.manifest.json");
  writeFileSync(manifest, JSON.stringify(realManifest, null, 2));
  return { harness: copy, manifest };
}

test("the main bundle's absent list is DERIVED from the manifest, so a newly declared gate it does not run is asserted absent rather than named by neither list", () => {
  // The main arm carried the six-id gate set TWICE: once as the runner's --only
  // arguments and once, by hand, as the complement in the expectations table's
  // absent list. A gate could be missing from BOTH, and then it was never run on
  // that arm and its absence was asserted by nothing either. The absent list is
  // now derived from the manifest, so the two cannot drift.
  const root = scratch();
  const env = cleanEnv(root);
  try {
    // THE DANGEROUS STATE: a gate declared in the manifest that the main bundle
    // does not run. Before the fix its id appeared in neither list.
    const NEW_GATE = "fixture-gate-the-main-bundle-does-not-run";
    const { harness: copy } = harnessCopy(root, [NEW_GATE]);
    const derived = printExpect(copy, root, env, "main");
    assert.ok(
      derived.absent.includes(NEW_GATE),
      `a manifest gate the main bundle does not run must be asserted ABSENT from it, but the ` +
        `derived absent list is ${JSON.stringify(derived.absent)}. A gate in neither the gates ` +
        "list nor the absent list is asserted by nothing on this arm.",
    );

    // NOT MERELY ALWAYS-TRUE: a gate the main bundle DOES run is not absent, and
    // the two lists PARTITION the manifest with nothing left over and no overlap.
    // Asserted as a set relation derived at run time, never as a pinned list or a
    // count: gates.manifest.json is append-only and CLAUDE.md forbids both.
    const manifestIds = (
      JSON.parse(readFileSync(join(root, "gates.manifest.json"), "utf8")) as { gates: { id: string }[] }
    ).gates.map((gate) => gate.id);
    const listed = derived.gates.map((gate) => gate.id);
    for (const id of listed) {
      assert.ok(
        !derived.absent.includes(id),
        `${id} is both expected in the main bundle and declared absent from it`,
      );
    }
    assert.deepEqual(
      [...listed, ...derived.absent].sort(),
      [...manifestIds].sort(),
      "the main bundle's expected gates and its derived absent list must PARTITION the manifest: " +
        "every declared gate is either asserted to have a record or asserted to have none, and " +
        "nothing is asserted twice. A gate in neither is the defect this derivation closes.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a RED gate is rejected on BOTH bundles under three structurally different shapes, and the derived expected set is separately witnessed on BOTH bundles by probes it alone rejects", (t) => {
  // The class is "a red gate passes the bundle", and one witness is not a class
  // (CLAUDE.md). Three structurally different members, each on BOTH arms:
  //   1. declared in gates.manifest.json, no table row  -> the MANIFEST leg
  //   2. in neither manifest nor table, present only as a bundle row -> the ROWS leg
  //   3. NAMED in the table, required:false, alternates that admit red -> zero-red ALONE
  // Member 3 is the one that isolates the global zero-red check: neither leg of
  // the derived union helps, because the gate has an explicit spec permitting its
  // status. Members 1 and 2 exercise the two different legs of the union.
  //
  // Those three members are all OVER-DETERMINED: each carries a red row, so each
  // is rejected by zero-red on its own and NONE of them witnesses the derived
  // expected set. Three further probes below carry no red row and no other
  // defect, so the derivation is their unique rejecter, and they are built the
  // SAME WAY on both arms so neither arm can end up asserting nothing.
  if (!existsSync(distEntry)) {
    t.skip(`dist entry ${distEntry} is absent; build with npm run build before this test`);
    return;
  }
  const root = scratch();
  const env = cleanEnv(root);
  try {
    // The exact assertion program the harness ships (written before any mode
    // branch, so a --self-test run leaves it on disk whatever the outcome).
    const harnessEvidence = join(root, "harness-evidence");
    run("bash", [harness, "--self-test", harnessEvidence], { cwd: root, env });
    const assertProg = join(harnessEvidence, "m2-assert.mjs");
    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");

    const UNLISTED = "fixture-gate-with-no-table-row";
    const NOWHERE = "fixture-gate-declared-nowhere";
    const { harness: copy, manifest } = harnessCopy(root, [UNLISTED]);

    // The default-spec reason is DERIVED from the shipped harness rather than
    // copied into this file. The uniqueness assertion below is only as good as
    // this string, so a reword of the message must redden here loudly instead of
    // silently turning that assertion into a tautology.
    const whyMatch = /const DEFAULT_SPEC_WHY =\s*\n\s*"([^"]+)"/.exec(readFileSync(harness, "utf8"));
    assert.ok(
      whyMatch,
      "could not derive DEFAULT_SPEC_WHY from the harness; the uniqueness check below would be " +
        "vacuous without it, so this is a hard failure rather than a fallback",
    );
    const defaultSpecReason = (whyMatch[1] as string).trim();

    // THE SECOND KEY, and the reason there has to be one. `defaultSpecReason` is
    // appended under `const why = explicit ? "" : DEFAULT_SPEC_WHY`, so for a
    // member carrying an explicit table row it is the EMPTY STRING on every
    // branch of the program. A probe for the EXPLICIT leg of the union can
    // therefore never satisfy a uniqueness test keyed on it: the same key is the
    // over-determination filter below, which would reject such a probe as
    // "rejected by a check OTHER than the derived expected set". The explicit
    // leg needs the key of the branch that actually rejects it, derived from the
    // harness for the same reason the first key is: a reword must redden here
    // loudly rather than silently turning the filter into a tautology.
    const explicitMatch = /fail\(spec\.id, explicit\s*\n\s*\? `([^$`]+)/.exec(readFileSync(harness, "utf8"));
    assert.ok(
      explicitMatch,
      "could not derive the explicit-spec rejection message from the harness; the uniqueness " +
        "check for the explicit leg would be vacuous without it, so this is a hard failure " +
        "rather than a fallback",
    );
    const explicitSpecReason = (explicitMatch[1] as string).trim();
    assert.notEqual(
      explicitSpecReason,
      defaultSpecReason,
      "the two attribution keys must DISCRIMINATE between the branches they name; if they were " +
        "equal, one probe family would silently admit the other's rejecter",
    );

    const runAssert = (dir: string, expectDoc: unknown, name: string): RunResult => {
      const expectPath = join(root, `expect-${name}.json`);
      writeFileSync(expectPath, JSON.stringify(expectDoc));
      return run(
        process.execPath,
        [assertProg, "--summary", join(dir, "summary.json"), "--evidence", dir,
          "--expect", expectPath, "--manifest", manifest],
        { cwd: root, env },
      );
    };

    for (const arm of ["pr", "main"] as const) {
      const table = printExpect(copy, root, env, arm, arm === "pr" ? "green" : undefined);
      // The healthy rows for this arm: every gate the table expects, in the
      // status it expects (taking the first alternate), plus the unlisted gate
      // green. Derived from the table so it cannot fall behind it.
      const healthy = table.gates.map((gate) => ({
        id: gate.id,
        status: String(gate.expect).split("|")[0] as string,
      }));
      // The unlisted gate belongs in the bundle only on the arm that RUNS it.
      // The PR bundle runs the whole manifest, so it appears there and is
      // asserted under the derived default. The main bundle runs a subset, so
      // the derivation puts the unlisted gate in that arm's ABSENT list, and a
      // bundle carrying a record for it is a different (also rejected) shape.
      const runsUnlisted = !table.absent.includes(UNLISTED);
      assert.equal(
        runsUnlisted,
        arm === "pr",
        `[${arm}] expected the unlisted manifest gate to be run on the pr arm and derived into ` +
          `the main arm's absent list; absent is ${JSON.stringify(table.absent)}`,
      );
      if (runsUnlisted) {
        healthy.push({ id: UNLISTED, status: "green" });
      }

      // CONTROL: the healthy bundle is ACCEPTED, so nothing below is an
      // always-red assertion. The unlisted gate passes on its default green.
      const okDir = join(root, `${arm}-healthy`);
      writeBundle(okDir, healthy);
      const ok = runAssert(okDir, table, `${arm}-healthy`);
      assert.equal(
        ok.status,
        0,
        `a healthy ${arm} bundle must be ACCEPTED, including a manifest gate with no table row ` +
          `that is green: ${ok.stdout}\n${ok.stderr}`,
      );

      // MEMBER 1: the unlisted gate is RED. It is declared in the manifest and
      // named by no table row, which is the shape brief-drift arrives in.
      const m1Dir = join(root, `${arm}-member-1`);
      writeBundle(m1Dir, [
        ...healthy.filter((r) => r.id !== UNLISTED),
        { id: UNLISTED, status: "red" },
      ]);
      const m1 = runAssert(m1Dir, table, `${arm}-member-1`);
      assert.notEqual(
        m1.status,
        0,
        `[${arm}] a RED gate that the manifest declares and the table does not name must be ` +
          `REJECTED; before the fix it passed in silence: ${m1.stdout}\n${m1.stderr}`,
      );
      assert.match(
        m1.stdout + m1.stderr,
        new RegExp(UNLISTED),
        `[${arm}] the rejection did not name the offending gate`,
      );

      // MEMBER 2: a RED row for a gate in NEITHER the manifest NOR the table.
      // Structurally different: it is caught by the ROWS leg of the union, not
      // the manifest leg, so a runner reporting an undeclared gate is covered too.
      const m2Dir = join(root, `${arm}-member-2`);
      writeBundle(m2Dir, [...healthy, { id: NOWHERE, status: "red" }]);
      const m2 = runAssert(m2Dir, table, `${arm}-member-2`);
      assert.notEqual(
        m2.status,
        0,
        `[${arm}] a RED row for a gate declared in neither the manifest nor the table must be ` +
          `REJECTED: ${m2.stdout}\n${m2.stderr}`,
      );

      // MEMBER 3: a gate the table NAMES, with required:false and alternates that
      // ADMIT red. Neither leg of the union helps: the spec is explicit and it
      // permits the status. Only the global zero-red check rejects this, which is
      // what makes that check load-bearing rather than redundant.
      const named = table.gates[0]?.id as string;
      const lax = {
        ...table,
        gates: table.gates.map((gate) =>
          gate.id === named ? { ...gate, expect: `${gate.expect}|red`, required: false } : gate,
        ),
      };
      const m3Dir = join(root, `${arm}-member-3`);
      writeBundle(m3Dir, healthy.map((r) => (r.id === named ? { ...r, status: "red" } : r)));
      const m3 = runAssert(m3Dir, lax, `${arm}-member-3`);
      assert.notEqual(
        m3.status,
        0,
        `[${arm}] a RED gate must be rejected even when the expectations table names it, marks it ` +
          `required:false and lists red among its permitted alternates; no expectation in section ` +
          `1.4 permits a red gate: ${m3.stdout}\n${m3.stderr}`,
      );
      assert.match(
        m3.stdout + m3.stderr,
        /reported RED/,
        `[${arm}] the rejection did not come from the global zero-red check, so that check is not ` +
          "the thing being witnessed here",
      );

      // DERIVATION-ONLY PROBES, built IDENTICALLY on both arms.
      //
      // Members 1 to 3 are all OVER-DETERMINED: each carries a red row, so the
      // global zero-red check rejects it on its own and none of them can see the
      // derived expected set disappear. These probes carry no red row and no
      // other defect, so the derivation is their UNIQUE rejecter.
      //
      // The previous version of this block branched on the arm, and on the MAIN
      // arm produced two probes whose real rejecter was section 8's
      // declared-absent check, which is pre-existing code: both survived
      // collapsing the derivation back to the hand-written table, so the
      // main-arm half of this test witnessed nothing at all. The MECHANISM was
      // not "they carried red rows" (they did not); it was that uniqueness was
      // established by excluding the one competitor someone had thought of,
      // `doesNotMatch(/reported RED/)`, and the competitor set differs BY ARM.
      // Uniqueness is established mechanically below instead: EVERY finding the
      // program printed must be a default-spec finding, which excludes every
      // competitor, including competitors added after this test was written.
      //
      // The union spreads THREE sources a probe can enter the expected set by:
      // the MANIFEST leg, the ROWS leg and the EXPLICIT-TABLE leg. One probe per
      // leg is what makes this a class rather than one witness (CLAUDE.md).
      // Defanging the legs SEPARATELY shows they are three code paths and not
      // one wearing three hats: each probe dies with its own leg and survives
      // removal of the other two.
      //
      // The explicit leg was UNWITNESSED until this round, and not by oversight.
      // Its members always carry an explicit spec, so the harness binds their
      // reason to "" and no rejection of one can carry `defaultSpecReason`; the
      // uniqueness filter below would have thrown out any probe written for it.
      // A witness family can only cover the branches its attribution key names,
      // so the explicit leg carries its own key, `explicitSpecReason`.
      const dropped = table.gates[table.gates.length - 1]?.id as string;
      const TABLE_ONLY = "fixture-gate-only-the-table-names";
      const tableWithoutDropped = {
        ...table,
        gates: table.gates.filter((gate) => gate.id !== dropped),
      };
      const withoutDropped = healthy.filter((r) => r.id !== dropped);
      const derivationOnly: {
        name: string;
        table: typeof table;
        rows: { id: string; status: string }[];
        names: string;
        // The attribution key EVERY itemised finding this probe provokes must
        // carry. It is the message of the branch that rejects this probe's leg,
        // derived from the harness, never hand-written.
        reason: string;
        why: string;
      }[] = [
        {
          name: "probe-1-rows-leg",
          reason: defaultSpecReason,
          table,
          rows: [...healthy, { id: NOWHERE, status: "not-applicable" }],
          names: NOWHERE,
          why:
            "a bundle row for a gate declared in NEITHER the manifest nor the table, reporting " +
            "not-applicable with a valid evaluated precondition, must be REJECTED under the " +
            "strict default: its id reaches the expected set through the ROWS leg of the union, " +
            "and nothing else in the bundle is wrong",
        },
        {
          name: "probe-2-manifest-leg",
          reason: defaultSpecReason,
          table: tableWithoutDropped,
          rows: withoutDropped,
          names: dropped,
          why:
            "a gate this bundle RUNS whose table row is gone and which produced NO record must " +
            "be REJECTED: its id reaches the expected set through the MANIFEST leg alone, since " +
            "with no record it is in no row and with no table row it is in no explicit spec",
        },
        {
          name: "probe-3-manifest-gate-not-applicable",
          reason: defaultSpecReason,
          table: tableWithoutDropped,
          rows: [...withoutDropped, { id: dropped, status: "not-applicable" }],
          names: dropped,
          why:
            "a manifest gate with no table row reporting not-applicable must be REJECTED: it is " +
            "asserted under the default required-green, and accepting it is how a silently " +
            "skipped gate reads as legitimately N/A. This is the shape brief-drift arrives in",
        },
        {
          name: "probe-4-explicit-table-leg",
          reason: explicitSpecReason,
          table: {
            ...table,
            // No `required` key: the shape of a printExpect row is {id, expect},
            // and the rejection this probe provokes is the missing-record branch,
            // which fires before any required/status check can.
            gates: [...table.gates, { id: TABLE_ONLY, expect: "green" }],
          },
          rows: healthy,
          names: TABLE_ONLY,
          why:
            "an expectations-table row naming a gate that is in NEITHER gates.manifest.json NOR " +
            "the bundle must be REJECTED: its id reaches the expected set through the EXPLICIT " +
            "leg of the union alone, and deleting that leg silently restores the original " +
            "assertion-direction defect in its mirror direction, a gate the table names that " +
            "produced no record and that nothing complains about",
        },
      ];
      for (const probe of derivationOnly) {
        const dir = join(root, `${arm}-${probe.name}`);
        writeBundle(dir, probe.rows);
        const result = runAssert(dir, probe.table, `${arm}-${probe.name}`);
        const output = result.stdout + result.stderr;
        assert.notEqual(result.status, 0, `[${arm}] ${probe.why}: ${output}`);
        // MECHANICAL UNIQUENESS. Every itemised finding must carry the harness's
        // own default-spec reason. A finding from any other check means the
        // probe is over-determined, and an over-determined probe stays red when
        // the derivation is removed, which is exactly how the main arm of this
        // test came to assert nothing.
        const findings = output.split("\n").filter((line) => line.startsWith("  - "));
        assert.ok(
          findings.length > 0,
          `[${arm}] ${probe.name} printed no itemised finding, so which check rejected it cannot ` +
            `be established: ${output}`,
        );
        const foreign = findings.filter((line) => !line.includes(probe.reason));
        assert.deepEqual(
          foreign,
          [],
          `[${arm}] ${probe.name} was rejected by ${String(foreign.length)} check(s) OTHER than ` +
            "the derived expected set, so the derivation is not its unique rejecter and " +
            "collapsing the derivation back to the hand-written table would leave this probe red " +
            `anyway: ${foreign.join(" | ")}`,
        );
        assert.match(
          output,
          new RegExp(probe.names),
          `[${arm}] ${probe.name} did not name the gate it rejected`,
        );
      }

      // The declared-absent check (section 8) is what the previous main-arm
      // members 4 and 5 actually exercised. That is real coverage of a real
      // rule, so it is kept here rather than deleted, correctly labelled: these
      // are NOT witnesses for the derived expected set, and the assertion names
      // the check they do witness so they cannot be miscredited again.
      if (!runsUnlisted) {
        for (const status of ["not-applicable", "green"] as const) {
          const name = `absent-gate-${status}`;
          const dir = join(root, `${arm}-${name}`);
          writeBundle(dir, [...healthy.filter((r) => r.id !== UNLISTED), { id: UNLISTED, status }]);
          const result = runAssert(dir, table, `${arm}-${name}`);
          const output = result.stdout + result.stderr;
          assert.notEqual(
            result.status,
            0,
            `[${arm}] a ${status} record for a gate the DERIVED absent list covers must be ` +
              "REJECTED: the two bundles stay distinguishable only if what one does not run is " +
              `asserted to have produced nothing: ${output}`,
          );
          assert.match(
            output,
            /expected to be ABSENT from this bundle/,
            `[${arm}] ${name} was not rejected by the declared-absent check, which is the only ` +
              `check it exercises: ${output}`,
          );
        }
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the assertion program applies M2-C-2 to ITSELF and refuses to certify a bundle it asserted zero gates on, in structurally different degenerate shapes", () => {
  // The program rejects any gate that reports green having examined zero units
  // as vacuous (M2-C-2). It exempted ITSELF: it could print "0 gate(s) asserted"
  // and exit 0, which is the same shape as the defect the whole branch is about,
  // one level up. Every route into that state degrades SILENTLY rather than
  // erroring, which is why none of them showed up as a failure.
  //
  // THE FIRST VERSION OF THIS TEST HAD TWO MEMBERS AND THE CHECK IT GUARDED
  // TESTED A TYPE. `!Array.isArray(gates)` is one syntactic route into an empty
  // manifest leg out of several, while the message it prints quantifies over
  // ALL of them ("a manifest that declares no gates cannot certify a bundle").
  // A delta verification measured a well-formed `gates: []` CERTIFYING a bundle
  // in which a manifest-declared gate produced no record, on both arms. The
  // check now tests the leg's CONTRIBUTION, so the members below are three
  // shapes of one condition rather than three conditions, and a fourth shape
  // nobody has thought of is covered by the same line.
  //
  // The title deliberately pins no count: a shape added later must not have to
  // edit a number, which is the same reason CLAUDE.md:201 gives for registries.
  const root = scratch();
  const env = cleanEnv(root);
  try {
    // The program AS SHIPPED, read out of the heredoc the harness writes to
    // disk. Taking it this way rather than through --self-test is deliberate:
    // it needs no dist/, so this test runs under every invocation and on BOTH
    // CI events. A guard witnessed on only one arm is the shape T-009 records.
    const progMatch =
      /cat >"\$\{ASSERT\}" <<'ASSERT_EOF'\n([\s\S]*?)\nASSERT_EOF/.exec(readFileSync(harness, "utf8"));
    assert.ok(
      progMatch,
      "could not extract the assertion program from the harness heredoc; every assertion below " +
        "would be about nothing, so this is a hard failure rather than a fallback",
    );
    const assertProg = join(root, "m2-assert.mjs");
    writeFileSync(assertProg, progMatch[1] as string);

    const GATE = "fixture-control-gate";
    const runAssert = (
      dir: string,
      expectDoc: unknown,
      manifestDoc: unknown,
      name: string,
    ): RunResult => {
      const expectPath = join(root, `expect-${name}.json`);
      const manifestPath = join(root, `manifest-${name}.json`);
      writeFileSync(expectPath, JSON.stringify(expectDoc));
      writeFileSync(manifestPath, JSON.stringify(manifestDoc));
      return run(
        process.execPath,
        [assertProg, "--summary", join(dir, "summary.json"), "--evidence", dir,
          "--expect", expectPath, "--manifest", manifestPath],
        { cwd: root, env },
      );
    };

    // CONTROL: a well-formed manifest with one gate and a bundle that reports it
    // green is ACCEPTED, so neither assertion below is an always-red one.
    const okDir = join(root, "control");
    writeBundle(okDir, [{ id: GATE, status: "green" }]);
    const ok = runAssert(
      okDir,
      { label: "control", gates: [], absent: [] },
      { version: 1, gates: [{ id: GATE }] },
      "control",
    );
    assert.equal(
      ok.status,
      0,
      `a well-formed manifest and a green bundle must be ACCEPTED: ${ok.stdout}\n${ok.stderr}`,
    );

    // MEMBERS 1 to 3: three STRUCTURALLY DIFFERENT manifests that all empty the
    // manifest leg. Each keeps the expected set NON-empty (the table names the
    // gate), so the empty-set check cannot fire and the manifest-leg check is
    // alone in every one of them. Member 1 is the shape a type test catches;
    // members 2 and 3 are the shapes it does not, and member 3 is not even
    // distinguishable from a healthy manifest by any test of type or length.
    const emptyLegMembers: { name: string; manifest: unknown; names: RegExp }[] = [
      {
        name: "manifest-gates-not-an-array",
        manifest: { version: 1, gates: {} },
        names: /"gates" key is not an array/,
      },
      {
        name: "manifest-gates-empty-array",
        manifest: { version: 1, gates: [] },
        names: /"gates" key is an empty array/,
      },
      {
        name: "manifest-entries-without-usable-ids",
        manifest: { version: 1, gates: [{ name: GATE }, { id: "" }, { id: 7 }] },
        names: /array of 3 entries and NONE carries a non-empty string id/,
      },
    ];
    for (const member of emptyLegMembers) {
      const dir = join(root, member.name);
      writeBundle(dir, [{ id: GATE, status: "green" }]);
      const result = runAssert(
        dir,
        { label: member.name, gates: [{ id: GATE, expect: "green", required: true }], absent: [] },
        member.manifest,
        member.name,
      );
      const output = result.stdout + result.stderr;
      assert.notEqual(
        result.status,
        0,
        `${member.name} empties the manifest leg of the derived expected set, so a gate that is ` +
          "DECLARED but did not run becomes invisible, and it must be REJECTED rather than read " +
          `as a manifest declaring nothing: ${output}`,
      );
      assert.match(
        output,
        /manifest leg of the derived expected set is EMPTY/,
        `${member.name} was not rejected by the manifest-leg check, which is the only check it ` +
          `exercises: ${output}`,
      );
      assert.match(
        output,
        member.names,
        `${member.name} was rejected without the message naming the shape observed, so a reader ` +
          `cannot tell which degenerate input arrived: ${output}`,
      );
      assert.doesNotMatch(
        output,
        /derived expected set is EMPTY, so this run would certify/,
        `${member.name} is meant to isolate the manifest-leg check; if the empty-set check also ` +
          "fired, the two are not separately witnessed here",
      );
    }

    // MEMBER 4: the aggregate check, witnessed ALONE. Every leg CONTRIBUTES
    // here (the manifest declares a gate, so the manifest-leg check is silent)
    // and the expected set is still empty, because the table declares the only
    // contributed id absent from this bundle. That is the state in which
    // nothing at all is asserted while every leg looks healthy, and it is the
    // only remaining route to it.
    const zeroDir = join(root, "zero-gates-asserted");
    writeBundle(zeroDir, []);
    const zero = runAssert(
      zeroDir,
      { label: "zero", gates: [], absent: [GATE] },
      { version: 1, gates: [{ id: GATE }] },
      "zero-gates-asserted",
    );
    const zeroOut = zero.stdout + zero.stderr;
    assert.notEqual(
      zero.status,
      0,
      "a run that asserted on ZERO gates must be REJECTED: exiting 0 there certifies a bundle " +
        `having examined nothing, which is exactly what M2-C-2 forbids: ${zeroOut}`,
    );
    assert.match(
      zeroOut,
      /derived expected set is EMPTY, so this run would certify/,
      `member 4 was not rejected by the empty-expected-set check, which is the only check it ` +
        `exercises: ${zeroOut}`,
    );
    assert.doesNotMatch(
      zeroOut,
      /manifest leg of the derived expected set is EMPTY/,
      "member 4's manifest DECLARES a gate, so the manifest-leg check must not fire; if it does, " +
        "the two checks are not separately witnessed here and the aggregate check has no witness " +
        "of its own left",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every source spread into the derived expected set is named by this suite, so a new leg cannot arrive unprobed", () => {
  // WHY A SOURCE-LEVEL GUARD EXISTS AT ALL. The probes above witness the legs
  // that exist. Nothing witnessed the arrival of a NEW one, and the previous
  // round wrote that gap down as an open item on the grounds that a guard here
  // would pin a count, which CLAUDE.md:201 forbids. That premise is wrong twice
  // over: CLAUDE.md:201 forbids pinning a count over an APPEND-ONLY REGISTRY,
  // where growth is routine and legitimate, and this union is not one; and the
  // form CLAUDE.md:201 actually prescribes, asserting BY NAME, applies here
  // directly. No count is pinned below. The assertion is a set equality over
  // identifier names, and it reddens on an addition and on a removal alike.
  //
  // It is deliberately NOT gated on dist/: it reads one source file, so it runs
  // under every invocation and on both CI events, which is where an unwitnessed
  // arm has bitten this repository before (CLAUDE.md:418).
  // THE CONDITION IS THE SET OF LEGS, NOT THE SPELLING THEY HAPPEN TO HAVE.
  // The first version of this guard read the union with
  // /\.\.\.\s*([A-Za-z_$][\w$]*)/g, which requires a spread to be followed by a
  // bare identifier. A delta verification added a FULLY FUNCTIONAL fourth leg
  // spelled `...(summary.extraGates ?? [])`, in this file's own idiom, proved a
  // gate id entered the expected set through it and flipped the verdict, and
  // this guard still exited 0. So the universal the registered behaviour states
  // was false as written: the condition recognised one spelling of the class it
  // quantified over. It now enumerates the array literal's TOP-LEVEL ELEMENTS
  // with a depth-aware scan and compares their source text, so a leg is seen
  // whatever it is spelled like, including one that is not a spread at all.
  const source = readFileSync(harness, "utf8");
  const ANCHOR = "for (const id of [";
  const anchorCount = source.split(ANCHOR).length - 1;
  assert.equal(
    anchorCount,
    1,
    `the union statement's anchor ${JSON.stringify(ANCHOR)} occurs ${String(anchorCount)} times ` +
      "in the harness, not once; this guard would be reading the wrong statement or none at all, " +
      "so it is a hard failure rather than a fallback",
  );
  // Split the array literal's top-level elements. Tracks (), [], {} depth and
  // is string, template and comment aware, so a comma inside a nested call, a
  // string or a comment cannot split an element and a bracket inside one cannot
  // end the literal.
  const splitTopLevel = (text: string, openIndex: number): string[] | null => {
    const out: string[] = [];
    let depth = 0;
    let start = openIndex + 1;
    let state: "code" | "string" | "line" | "block" = "code";
    let quote = "";
    for (let i = openIndex; i < text.length; i += 1) {
      const c = text[i] as string;
      const next = text[i + 1];
      if (state === "line") {
        if (c === "\n") state = "code";
        continue;
      }
      if (state === "block") {
        if (c === "*" && next === "/") {
          state = "code";
          i += 1;
        }
        continue;
      }
      if (state === "string") {
        if (c === "\\") {
          i += 1;
          continue;
        }
        if (c === quote) state = "code";
        continue;
      }
      if (c === "/" && next === "/") {
        state = "line";
        i += 1;
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        i += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        state = "string";
        quote = c;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") {
        depth += 1;
        continue;
      }
      if (c === ")" || c === "]" || c === "}") {
        depth -= 1;
        if (depth === 0) {
          out.push(text.slice(start, i));
          return out;
        }
        continue;
      }
      if (c === "," && depth === 1) {
        out.push(text.slice(start, i));
        start = i + 1;
      }
    }
    return null;
  };
  const openIndex = source.indexOf(ANCHOR) + ANCHOR.length - 1;
  const raw = splitTopLevel(source, openIndex);
  assert.ok(
    raw,
    "the union's array literal is not balanced, so its legs cannot be enumerated and every " +
      "assertion below would be about nothing",
  );
  const legs = (raw as string[])
    .map((element) => element.replace(/\s+/g, " ").trim())
    .filter((element) => element !== "")
    .sort();
  // One entry per LEG, named by its source text rather than by an identifier a
  // regex happened to find. A leg added here without a probe added above is the
  // defect this guard exists to catch. No count is pinned: this is a set
  // equality over names, which is the form CLAUDE.md:201 prescribes.
  const probed = [
    "...manifestLeg",
    "...rowsLeg",
    "...tableLeg",
  ];
  assert.deepEqual(
    legs,
    probed,
    "the derived expected set draws from a set of legs that this suite does not probe " +
      "one-for-one. probe-1-rows-leg witnesses `rowsLeg` alone and probe-4-explicit-table-leg " +
      "witnesses `tableLeg` alone; `manifestLeg` has exactly ONE witness, " +
      "probe-2-manifest-leg. probe-3-manifest-gate-not-applicable witnesses the DISJUNCTION of " +
      "`manifestLeg` and `rowsLeg` and neither of them alone, so removing probe-2 would leave the " +
      "manifest leg with no witness at all. A leg ADDED to the union needs its own probe, and a " +
      "probe for it needs the attribution key of the branch that rejects its members, which is " +
      "NOT automatically the default-spec reason: that is exactly how `explicitById` stayed " +
      `unwitnessed. Derived from the harness: ${JSON.stringify(legs)}`,
  );

});

test("every occurrence of the derived expected set's binding that this suite cannot prove is a read is pinned, so an unrecognised operation reddens instead of passing", () => {
  // THE SIBLING THE ELEMENT LIST CANNOT SEE. Pinning the array literal's legs
  // catches a new source that arrives INSIDE it. A new source can equally
  // arrive as a separate write to `expectedIds` somewhere else in the program,
  // and no enumeration of that one literal would ever notice.
  //
  // THE FIRST VERSION OF THIS ASSERTION HAD THE DEFECT THIS WHOLE BRANCH IS
  // ABOUT, and it was introduced by the round that named the defect. It
  // classified each occurrence by looking the FOLLOWING member name up in a
  // fixed list (push, splice, unshift, ...) and its message quantified over
  // "every operation that WRITES the binding". A delta verification wrote to the
  // set through an index assignment, through an alias, and through
  // Function.prototype.apply, proved each one admitted an id and flipped the
  // program's verdict on byte-identical fixtures, and this assertion exited 0 on
  // all three. Adding those three names to the list would have left a fourth:
  // `expectedIds["pu" + "sh"](id)` is a write no list of names can ever contain.
  //
  // SO THE DEFAULT IS INVERTED. An occurrence is recorded unless this scan can
  // PROVE it is a read, and the proof is a narrow allowlist of read forms. A
  // spelling nobody anticipated is therefore recorded rather than skipped, which
  // is the difference between a guard that fails closed and one that fails open.
  // The pinned list below is deliberately NOT a list of writes: it is every
  // occurrence not proven to be a read, and it includes occurrences that are in
  // fact reads (an identifier passed as an ARGUMENT is indistinguishable here
  // from one passed to something that mutates it). Over-strict is the safe
  // direction; the previous instrument was over-permissive and that is what it
  // cost.
  //
  // WHAT THIS CANNOT SEE, stated rather than left to be found: a write that
  // never names this binding. That is not a residue this suite leaves open, it
  // is the half the RUN-TIME instruments cover, and they are witnessed by
  // execution in the test below rather than by reading source at all.
  //
  // THE SCAN IS WHITESPACE- AND COMMENT-INSENSITIVE ON PURPOSE. A line-based
  // version was written first and measured: a write split across two lines
  // (`expectedIds` on one, `.push(...)` on the next) walked straight past it.
  // COMMENTS ARE MASKED, STRINGS ARE NOT. A mention of the binding in prose is
  // not a use of it, and leaving comments in made this assertion redden on a
  // sentence. Strings are deliberately left alone: the interior of a template
  // literal is CODE, and masking templates to get rid of string mentions would
  // hide `${expectedIds.push(id)}` from the scan, which is a new blind spot of
  // exactly the kind this rewrite exists to remove. A mention inside a plain
  // string is therefore recorded, which is the fail-closed direction.
  const maskComments = (text: string): string => {
    let out = "";
    let state: "code" | "string" | "line" | "block" = "code";
    let quote = "";
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i] as string;
      const next = text[i + 1];
      if (state === "line") {
        if (c === "\n") {
          state = "code";
          out += c;
        } else {
          out += " ";
        }
        continue;
      }
      if (state === "block") {
        out += c === "\n" ? c : " ";
        if (c === "*" && next === "/") {
          out += " ";
          i += 1;
          state = "code";
        }
        continue;
      }
      if (state === "string") {
        out += c;
        if (c === "\\") {
          out += next ?? "";
          i += 1;
          continue;
        }
        if (c === quote) state = "code";
        continue;
      }
      if (c === "/" && next === "/") {
        state = "line";
        out += "  ";
        i += 1;
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        out += "  ";
        i += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        state = "string";
        quote = c;
      }
      out += c;
    }
    return out;
  };
  const source = maskComments(readFileSync(harness, "utf8"));
  const BINDING = "expectedIds";
  // The ONLY forms accepted as proof of a read. Anything else is recorded.
  //
  // `.length` is a read ONLY when it is not being assigned to. `expectedIds.length = 0`
  // empties the set, which is the DANGEROUS direction for this program (it
  // asserts on fewer gates than its legs justify) and it is not a method call at
  // all, so no list of mutator names would ever have held it. The negative
  // lookahead is what keeps this allowlist from re-opening the hole it closes.
  const PROVEN_READS = [
    /^\.\s*length\b(?!\s*=[^=])/,
    /^\.\s*filter\s*\(/,
    /^\.\s*includes\s*\(/,
    /^\.\s*indexOf\s*\(/,
    /^\.\s*some\s*\(/,
    /^\.\s*every\s*\(/,
    /^\.\s*map\s*\(/,
    /^\.\s*join\s*\(/,
    /^\.\s*slice\s*\(/,
    /^\.\s*concat\s*\(/,
    /^\.\s*entries\s*\(/,
    /^\.\s*keys\s*\(/,
    /^\.\s*values\s*\(/,
  ];
  const occurrences: string[] = [];
  const pattern = new RegExp(`(^|[^.\\w$])${BINDING}\\b`, "g");
  for (const match of source.matchAll(pattern)) {
    const at = match.index ?? 0;
    // Iteration and spread are proven reads from what PRECEDES the identifier.
    const before = source.slice(Math.max(0, at - 8), at + (match[0]?.length ?? 0));
    if (new RegExp(`(\\bof|\\.\\.\\.)\\s*${BINDING}$`).test(before)) {
      continue;
    }
    let index = at + (match[0] as string).length;
    for (;;) {
      const ahead = source.slice(index);
      const ws = /^\s+/.exec(ahead);
      if (ws) {
        index += ws[0].length;
        continue;
      }
      if (ahead.startsWith("//")) {
        index += ahead.indexOf("\n") + 1;
        continue;
      }
      if (ahead.startsWith("/*")) {
        index += ahead.indexOf("*/") + 2;
        continue;
      }
      break;
    }
    const rest = source.slice(index);
    if (PROVEN_READS.some((form) => form.test(rest))) {
      continue;
    }
    // A SHORT, STABLE TOKEN rather than a slice of source text, so reformatting
    // the pinned line does not redden this and a new OPERATION does.
    const member = /^\.\s*([A-Za-z_$][\w$]*)/.exec(rest);
    occurrences.push(
      member
        ? `.${member[1] as string}`
        : /^\[/.test(rest)
          ? "[]"
          : /^(\+\+|--)/.test(rest)
            ? "++"
            : /^=[^=]/.test(rest)
              ? "="
              : (rest.slice(0, 1) as string),
    );
  }
  assert.deepEqual(
    occurrences,
    ["=", ",", ")", ")", ")"],
    `the binding ${BINDING} is used in the harness by an operation this suite cannot prove is a ` +
      "read. The five pinned occurrences, in source order, are its DECLARATION (`=`); its pass as " +
      "the FIRST argument to sameSequence in the leg-union check (`,`); a pass to JSON.stringify " +
      "in that check's failure message (`)`); its pass as the SECOND argument to sameSequence in " +
      "the consumption-coverage check (`)`); and a pass to JSON.stringify in THAT check's failure " +
      "message (`)`). The four argument passes are in fact reads, and they stay pinned rather than " +
      "allowlisted because an identifier passed as an argument is indistinguishable here from one " +
      "passed to something that mutates it, and over-strict is the safe direction. Anything else " +
      "here is a use nobody has looked at: if it writes the set, the derivation's legs no longer " +
      "justify what is asserted and the probes above do not cover it; if it is a read, add its " +
      "form to PROVEN_READS above and say in the work history why it is one. Derived from the " +
      `harness: ${JSON.stringify(occurrences)}`,
  );
});

test("a write that adds an id to the derived expected set is refused at RUN TIME, in spellings no list of names contains", () => {
  // THE INSTRUMENT, NOT THE SPELLINGS. Every guard on this branch that has
  // failed has failed the same way: its CONDITION recognised a syntactic subset
  // of the class its MESSAGE quantified over. Widening the subset by the members
  // the last reviewer built produces the next instance, and this branch has now
  // produced three (a spread form, a type test, a member-name list).
  //
  // This test does not read source. It takes the assertion program AS SHIPPED,
  // injects a write, runs it against fixtures that are byte-identical across
  // every member, and asks the program what it asserted on. A write is then
  // caught because of what it DOES, so how it is spelled stops mattering: the
  // three shapes the delta verification used to defeat the source scan are here
  // alongside two that no list of member names could ever hold.
  //
  // TWO REGIONS, TWO MECHANISMS, WITNESSED SEPARATELY. Outside the derivation
  // the set is frozen, so the write throws. Inside the derivation's closure the
  // accumulator is still extensible, and the program's own check that the set
  // equals what its legs contributed is what catches it. Members of both
  // families are run, and the inside-the-closure members additionally assert the
  // message, so a freeze that silently swallowed them could not read as a pass.
  const root = scratch();
  const env = cleanEnv(root);
  try {
    const progMatch =
      /cat >"\$\{ASSERT\}" <<'ASSERT_EOF'\n([\s\S]*?)\nASSERT_EOF/.exec(readFileSync(harness, "utf8"));
    assert.ok(
      progMatch,
      "could not extract the assertion program from the harness heredoc; every assertion below " +
        "would be about nothing, so this is a hard failure rather than a fallback",
    );
    const pristine = progMatch[1] as string;

    const GATE_A = "fixture-control-gate-a";
    const GATE_B = "fixture-control-gate-b";
    const INJECTED = "fixture-id-no-leg-contributed";
    // THE FIXTURES ARE BYTE-IDENTICAL FOR EVERY MEMBER, so the only variable is
    // the injected write. Two manifest gates, both with green records, no table
    // rows and nothing declared absent: the honest derived set is exactly
    // [GATE_A, GATE_B] and the program accepts.
    //
    // BOTH DIRECTIONS ARE INJECTED, and the REMOVING one is the one that makes
    // the dangerous state SILENT. A write that ADDS an unjustified id is caught
    // loudly on the unfixed program too (the id has no record, so it is
    // reported), and only the ATTRIBUTION of that finding distinguishes fixed
    // from unfixed. A write that REMOVES an id leaves the unfixed program
    // exiting 0 having asserted on fewer gates than its legs justify, which is
    // this whole branch's subject, and it is invisible in the exit code. Both
    // families are here because a witness that only covered the loud direction
    // would be a witness against the absent feature rather than against the
    // dangerous state.
    const dir = join(root, "bundle");
    writeBundle(dir, [{ id: GATE_A, status: "green" }, { id: GATE_B, status: "green" }]);
    const expectPath = join(root, "expect.json");
    const manifestPath = join(root, "manifest.json");
    writeFileSync(expectPath, JSON.stringify({ label: "writes", gates: [], absent: [] }));
    writeFileSync(
      manifestPath,
      JSON.stringify({ version: 1, gates: [{ id: GATE_A }, { id: GATE_B }] }),
    );
    const runProgram = (programPath: string): RunResult =>
      run(
        process.execPath,
        [programPath, "--summary", join(dir, "summary.json"), "--evidence", dir,
          "--expect", expectPath, "--manifest", manifestPath],
        { cwd: root, env },
      );

    // POSITIVE CONTROL: the shipped program accepts these fixtures and does NOT
    // assert on INJECTED. Without this row every rejection below could be a
    // rejection of the lab rather than of the write.
    const pristinePath = join(root, "m2-assert-pristine.mjs");
    writeFileSync(pristinePath, pristine);
    const control = runProgram(pristinePath);
    const controlOut = control.stdout + control.stderr;
    assert.equal(
      control.status,
      0,
      `the shipped program must ACCEPT the unmutated fixtures, or every member below is a ` +
        `rejection of the fixtures rather than of the injected write: ${controlOut}`,
    );
    assert.match(
      controlOut,
      /: OK\./,
      `the control must reach the success line: ${controlOut}`,
    );
    assert.ok(
      !controlOut.includes(INJECTED),
      `the control already names ${INJECTED}, so the fixture does not isolate the injected ` +
        `write: ${controlOut}`,
    );
    assert.ok(
      controlOut.includes(GATE_A) && controlOut.includes(GATE_B),
      `the control must report BOTH manifest gates as asserted, or a member that REMOVES one ` +
        `has nothing to remove and measures nothing: ${controlOut}`,
    );

    const AFTER = "const derivedIds = expectedIds.filter((id) => !explicitById.has(id));";
    const INSIDE = "  return out;";
    const ID = JSON.stringify(INJECTED);
    const members: {
      name: string;
      anchor: string;
      inject: string;
      family: "frozen" | "closure";
      direction: "add" | "remove";
    }[] = [
      // OUTSIDE THE DERIVATION, where the freeze is the mechanism. The first is
      // the one shape the replaced member-name list DID recognise, kept so the
      // new instrument is measured to be at least as strong as the one it
      // replaced rather than merely different.
      { name: "after-push", anchor: AFTER, family: "frozen", direction: "add",
        inject: `expectedIds.push(${ID});` },
      // ... and then the shapes it did not and could not. The first three are
      // the delta verification's W3, W4 and W5 verbatim.
      { name: "after-index-assignment", anchor: AFTER, family: "frozen", direction: "add",
        inject: `expectedIds[expectedIds.length] = ${ID};` },
      { name: "after-alias-then-push", anchor: AFTER, family: "frozen", direction: "add",
        inject: `const aliasOfExpected = expectedIds; aliasOfExpected.push(${ID});` },
      { name: "after-push-apply", anchor: AFTER, family: "frozen", direction: "add",
        inject: `Array.prototype.push.apply(expectedIds, [${ID}]);` },
      // The member name is COMPUTED, so it exists in no source text at all and
      // no allowlist of names could ever contain it.
      { name: "after-computed-member", anchor: AFTER, family: "frozen", direction: "add",
        inject: `expectedIds["pu" + "sh"](${ID});` },
      // The REMOVING direction: silent on the unfixed program.
      { name: "after-pop", anchor: AFTER, family: "frozen", direction: "remove",
        inject: "expectedIds.pop();" },
      // Not a method call at all: a property assignment that empties the set.
      { name: "after-length-truncation", anchor: AFTER, family: "frozen", direction: "remove",
        inject: "expectedIds.length = 0;" },
      { name: "after-reflect-splice", anchor: AFTER, family: "frozen", direction: "remove",
        inject: "Reflect.apply(Array.prototype.splice, expectedIds, [0, 1]);" },
      // INSIDE THE DERIVATION'S CLOSURE, where the accumulator is not yet frozen
      // and the program's leg-union check has to be the mechanism instead.
      { name: "inside-closure-push", anchor: INSIDE, family: "closure", direction: "add",
        inject: `  out.push(${ID});` },
      { name: "inside-closure-pop", anchor: INSIDE, family: "closure", direction: "remove",
        inject: "  out.pop();" },
    ];

    for (const member of members) {
      // THE MUTATOR'S OWN NEGATIVE CONTROL. An anchor that has moved or been
      // duplicated would produce an unmutated program, which runs green and is
      // indistinguishable from a clean result. It is a hard failure instead.
      const anchorCount = pristine.split(member.anchor).length - 1;
      assert.equal(
        anchorCount,
        1,
        `the injection anchor ${JSON.stringify(member.anchor)} occurs ${String(anchorCount)} ` +
          `times in the assertion program, not once, so member ${member.name} would run an ` +
          "unmutated program and pass while measuring nothing",
      );
      const mutated = pristine.replace(member.anchor, `${member.inject}\n${member.anchor}`);
      assert.notEqual(
        mutated,
        pristine,
        `member ${member.name} did not change the program, so it measures nothing`,
      );
      const programPath = join(root, `m2-assert-${member.name}.mjs`);
      writeFileSync(programPath, mutated);
      const result = runProgram(programPath);
      const output = result.stdout + result.stderr;

      assert.notEqual(
        result.status,
        0,
        `${member.name} makes the derived expected set differ from what its legs contributed ` +
          `(direction: ${member.direction}). The program must REFUSE rather than certify a ` +
          `bundle against a set its own derivation does not justify: ${output}`,
      );
      assert.doesNotMatch(
        output,
        /: OK\./,
        `${member.name} reached the success line, so the program certified a bundle against a ` +
          `set that an injected write had changed: ${output}`,
      );
      if (member.direction === "add") {
        // ATTRIBUTION, not merely a nonzero exit. On the unfixed program this
        // member exits 1 as well, because the added id has no record, so the
        // exit code alone does not tell fixed from unfixed. What does is
        // whether the program ever ASSERTED on the id: a finding attributed to
        // it means the id entered the set. The bracketed form is required
        // because an uncaught throw prints the injected source line, so the
        // bare id appears in the output either way.
        assert.ok(
          !output.includes(`[${INJECTED}]`),
          `${member.name} produced a finding attributed to ${INJECTED}, which means the id ` +
            "ENTERED the derived expected set and the program asserted on a gate no leg " +
            `contributed: ${output}`,
        );
      }
      if (member.family === "closure") {
        assert.match(
          output,
          /derived expected set is NOT the union of the declared legs/,
          `${member.name} writes INSIDE the derivation, where the freeze cannot reach it, so the ` +
            "leg-union check is the only mechanism that can catch it and it must be the one that " +
            `names the failure: ${output}`,
        );
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a change to the derived expected set that preserves its value-set is refused, in the derivation and in the loop that consumes it", () => {
  // THE MECHANISM: A SET-BASED COMPARISON IS BLIND TO MULTIPLICITY. Putting
  // values in a Set, or comparing a length against a Set's size, discards how
  // many times each value occurs, so any defect that preserves the value-set
  // while changing multiplicity is invisible to it. The check this test guards
  // used to be exactly that shape: `expectedIds.length !== legContributed.size
  // || expectedIds.some((id) => !legContributed.has(id))`. A write substituting
  // a DUPLICATE for a dropped id cancels out in both halves ([A, A] has length
  // two, {A, B} has size two, and both elements are members), so the check
  // passed while B was never asserted on.
  //
  // The mechanism is not confined to this file: `describeDrift` in
  // scripts/render-agent-rules-gates.mjs:196 compares two blocks by building a
  // Set of each block's lines, so a DUPLICATED line leaves both sets unchanged.
  // That is recorded at delivery/verification/render-agent-rules-gates-duplicate-row.md:44
  // and is tracked separately; it is deliberately not touched here.
  //
  // THE FIXTURE IS THE DANGEROUS STATE, not the absent feature. The manifest
  // declares TWO gates and the bundle carries a record for ONE. GATE_B is
  // therefore a declared gate that did not run, and the shipped program REJECTS
  // this bundle, naming it. Every member below makes the program ACCEPT it. The
  // control's direction is thus reject-to-accept rather than the reverse, which
  // is what makes "exits 0" here mean "certified a bundle in which a
  // manifest-declared gate produced no record".
  //
  // TWO FAMILIES, TWO CHECKS, ATTRIBUTED SEPARATELY. A nonzero exit is not
  // enough: the shipped program already exits nonzero on this fixture, for the
  // honest reason, so exit code alone cannot tell a caught member from an
  // uncaught one. Each member therefore asserts (a) the program did NOT reach
  // the success line, (b) the failure names the check that is supposed to catch
  // it, and (c) the honest finding about GATE_B is ABSENT, which is what says
  // the member really did stop the gate being asserted on rather than being
  // caught incidentally by the pre-existing check.
  //
  // AND EACH FAMILY CARRIES A DEFANGED CONTROL, run inside this test rather than
  // asserted in prose: the same member against a program whose new check has
  // been neutered must reach the success line. Without that row, a member could
  // be being caught by something else entirely and this test would not know.
  const root = scratch();
  const env = cleanEnv(root);
  try {
    const progMatch =
      /cat >"\$\{ASSERT\}" <<'ASSERT_EOF'\n([\s\S]*?)\nASSERT_EOF/.exec(readFileSync(harness, "utf8"));
    assert.ok(
      progMatch,
      "could not extract the assertion program from the harness heredoc; every assertion below " +
        "would be about nothing, so this is a hard failure rather than a fallback",
    );
    const pristine = progMatch[1] as string;

    const GATE_A = "fixture-recorded-gate";
    const GATE_B = "fixture-declared-but-never-ran";
    const dir = join(root, "bundle");
    writeBundle(dir, [{ id: GATE_A, status: "green" }]);
    const expectPath = join(root, "expect.json");
    const manifestPath = join(root, "manifest.json");
    writeFileSync(expectPath, JSON.stringify({ label: "multiplicity", gates: [], absent: [] }));
    writeFileSync(
      manifestPath,
      JSON.stringify({ version: 1, gates: [{ id: GATE_A }, { id: GATE_B }] }),
    );
    const runProgram = (programPath: string): RunResult =>
      run(
        process.execPath,
        [programPath, "--summary", join(dir, "summary.json"), "--evidence", dir,
          "--expect", expectPath, "--manifest", manifestPath],
        { cwd: root, env },
      );
    // A finding attributed to a gate is printed as "[<id>] ...". The BARE id is
    // not attribution: it also appears in the success line and in any stack
    // trace an injected throw produces.
    const attributed = (output: string): boolean => output.includes(`[${GATE_B}]`);

    const pristinePath = join(root, "m2-assert-pristine.mjs");
    writeFileSync(pristinePath, pristine);
    const control = runProgram(pristinePath);
    const controlOut = control.stdout + control.stderr;
    assert.notEqual(
      control.status,
      0,
      `the shipped program must REJECT a bundle whose manifest declares ${GATE_B} and which ` +
        `carries no record for it. If it accepts, this fixture is not the dangerous state and ` +
        `every member below measures nothing: ${controlOut}`,
    );
    assert.ok(
      attributed(controlOut),
      `the shipped program's rejection must be ATTRIBUTED to ${GATE_B}, or the fixture is being ` +
        `rejected for some unrelated reason and no member below is isolating anything: ${controlOut}`,
    );

    const INSIDE = "  return out;";
    const LEG_CHECK = "if (!sameSequence(expectedIds, legExpected)) {";
    const COVERAGE_CHECK = "if (!sameSequence(assertedIds, expectedIds)) {";
    const AFTER_DERIVATION = "const derivedIds = expectedIds.filter((id) => !explicitById.has(id));";
    // A truncating and a SUBSTITUTING iterator: structurally different members
    // of the consumption family, the second being the multiplicity-preserving
    // one, which is the same shape one level up from the derivation family.
    const TRUNCATING_ITERATOR =
      "Array.prototype[Symbol.iterator] = function () { let i = 0; const self = this; " +
      "return { next: () => (i < self.length - 1 ? { value: self[i++], done: false } : " +
      "{ value: undefined, done: true }), [Symbol.iterator]() { return this; } }; };";
    const SUBSTITUTING_ITERATOR =
      "Array.prototype[Symbol.iterator] = function () { let i = 0; const self = this; " +
      "return { next: () => (i < self.length ? { value: (i === self.length - 1 ? self[0] : self[i]), " +
      "done: (i++, false) } : { value: undefined, done: true }), [Symbol.iterator]() { return this; } }; };";

    const families = [
      {
        // The set is DERIVED wrong. Caught before the per-gate loop runs.
        family: "derivation",
        anchor: INSIDE,
        // The check whose neutering must let a member through, and what to
        // neuter it to. Both are exact source, so a check that moved or was
        // reworded aborts this test rather than silently skipping its control.
        check: LEG_CHECK,
        defanged: "if (false && !sameSequence(expectedIds, legExpected)) {",
        names: /derived expected set is NOT the union of the declared legs/,
        members: [
          // The four the delta verification constructed.
          { name: "closure-pop-then-push-first", inject: "  out.pop(); out.push(out[0]);" },
          { name: "closure-index-substitute", inject: "  out[1] = out[0];" },
          { name: "closure-splice-substitute", inject: "  out.splice(1, 1, out[0]);" },
          { name: "closure-fill", inject: "  out.fill(out[0]);" },
          // Four it did not, so the fix is measured to generalise beyond the
          // reported list rather than to handle it. copyWithin and Object.assign
          // in particular name no mutator this or any earlier instrument listed.
          { name: "closure-copy-within", inject: "  out.copyWithin(1, 0);" },
          { name: "closure-unshift-then-pop", inject: "  out.unshift(out[0]); out.pop();" },
          { name: "closure-object-assign", inject: "  Object.assign(out, [out[0], out[0]]);" },
          { name: "closure-truncate-then-regrow", inject: "  out.length = 1; out.push(out[0]);" },
        ],
      },
      {
        // The set is derived RIGHT and then not consumed. The freeze cannot
        // reach this: the override is on the shared prototype, not on the
        // frozen instance.
        family: "consumption",
        anchor: AFTER_DERIVATION,
        check: COVERAGE_CHECK,
        defanged: "if (false && !sameSequence(assertedIds, expectedIds)) {",
        names: /asserted on a SEQUENCE that is not the derived expected set/,
        members: [
          { name: "iterator-drops-last", inject: TRUNCATING_ITERATOR },
          { name: "iterator-substitutes-last", inject: SUBSTITUTING_ITERATOR },
        ],
      },
    ];

    for (const fam of families) {
      // THE MUTATOR'S OWN NEGATIVE CONTROLS, both fatal. An anchor or a check
      // that has moved or been duplicated would produce an unmutated program or
      // an un-neutered one, and both run green while measuring nothing.
      const anchorCount = pristine.split(fam.anchor).length - 1;
      assert.equal(
        anchorCount,
        1,
        `the injection anchor ${JSON.stringify(fam.anchor)} occurs ${String(anchorCount)} times ` +
          `in the assertion program, not once, so the ${fam.family} members would run an ` +
          "unmutated program and pass while measuring nothing",
      );
      const checkCount = pristine.split(fam.check).length - 1;
      assert.equal(
        checkCount,
        1,
        `the check ${JSON.stringify(fam.check)} occurs ${String(checkCount)} times in the ` +
          `assertion program, not once, so the ${fam.family} family's defanged control would ` +
          "not actually defang anything and would prove the check load-bearing when it is not",
      );

      for (const member of fam.members) {
        const mutated = pristine.replace(fam.anchor, `${member.inject}\n${fam.anchor}`);
        assert.notEqual(
          mutated,
          pristine,
          `member ${member.name} did not change the program, so it measures nothing`,
        );
        const programPath = join(root, `m2-assert-${member.name}.mjs`);
        writeFileSync(programPath, mutated);
        const result = runProgram(programPath);
        const output = result.stdout + result.stderr;

        assert.doesNotMatch(
          output,
          /: OK\./,
          `${member.name} reached the success line, so the program CERTIFIED a bundle in which ` +
            `${GATE_B} is declared by the manifest and produced no record: ${output}`,
        );
        assert.notEqual(
          result.status,
          0,
          `${member.name} exited 0 on a bundle the shipped program rejects: ${output}`,
        );
        assert.match(
          output,
          fam.names,
          `${member.name} was refused, but not by the ${fam.family} check that is supposed to ` +
            "catch it. A member caught for the wrong reason is a member this suite is not " +
            `measuring: ${output}`,
        );
        assert.ok(
          !attributed(output),
          `${member.name} produced a finding attributed to ${GATE_B}, which means the gate WAS ` +
            "asserted on after all, so this member never reached the state it exists to " +
            `witness and its refusal above is the control's refusal, not a new one: ${output}`,
        );
      }

      // THE DEFANGED CONTROL. One member of the family against a program whose
      // new check has been neutered and nothing else changed. It must reach the
      // success line, which is what attributes every refusal above to that check
      // rather than to anything else the program does.
      const first = fam.members[0] as { name: string; inject: string };
      const neutered = pristine
        .replace(fam.check, fam.defanged)
        .replace(fam.anchor, `${first.inject}\n${fam.anchor}`);
      const neuteredPath = join(root, `m2-assert-defanged-${fam.family}.mjs`);
      writeFileSync(neuteredPath, neutered);
      const defangedResult = runProgram(neuteredPath);
      const defangedOut = defangedResult.stdout + defangedResult.stderr;
      assert.match(
        defangedOut,
        /: OK\./,
        `with the ${fam.family} check neutered, member ${first.name} did NOT reach the success ` +
          "line, so something other than that check is refusing it and the assertions above " +
          `attribute the catch to the wrong place: ${defangedOut}`,
      );
      assert.equal(
        defangedResult.status,
        0,
        `with the ${fam.family} check neutered, member ${first.name} still exited nonzero: ${defangedOut}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no expectations row admits a lax status the gate it names can never legitimately produce", () => {
  // THE ADJACENT DEFECT. The derivation above closes "a row is ABSENT, so the
  // gate is asserted by nothing". Its sibling is "a row is PRESENT but its
  // expectation is wrong", and the shape that matters here is a row admitting
  // not-applicable for a gate that has NO precondition. Such a gate is always
  // applicable, so it can never legitimately be N/A, and admitting it means the
  // row silently accepts a gate that was skipped or mis-declared.
  //
  // Only that ONE direction is asserted, deliberately. The converse (a gate WITH
  // a precondition whose row does not admit not-applicable) is not a defect but
  // a legitimate extra strictness, and `coverage` is exactly that case today:
  // its precondition names delivery/requirements/migration-table.md:1, a tracked
  // file that always exists, so a not-applicable coverage means the inventory
  // vanished and SHOULD fail. Asserting the converse would redden a correct row.
  const root = scratch();
  const env = cleanEnv(root);
  try {
    const manifestGates = (
      JSON.parse(
        readFileSync(fileURLToPath(new URL("../gates.manifest.json", import.meta.url)), "utf8"),
      ) as { gates: { id: string; precondition?: unknown }[] }
    ).gates;
    const hasPrecondition = new Map(
      manifestGates.map((gate) => [gate.id, gate.precondition !== undefined && gate.precondition !== null]),
    );
    // Both arms, and both resolutions of the per-run scope placeholder, since the
    // non-phase resolution is the one that widens a row's alternates.
    //
    // The two resolutions are DERIVED from the harness's own resolver rather
    // than copied here (CR-H-2). Hand-writing them made this test assert over
    // two strings that happened to match `resolve_scope_expect`
    // (scripts/m2-exit-test.sh:108) on the day it was written, which is the same
    // replica hazard this branch's design argument names. The two inputs below
    // are a phase-branch run and a non-phase run, the only distinction that
    // resolver draws; they are asserted DIFFERENT so a resolver collapsed to one
    // value cannot leave this test quietly covering one case twice.
    const phaseScope = resolveScopeExpect(root, env, "m9-p9", "claude/m9-p9-fixture-branch");
    const nonPhaseScope = resolveScopeExpect(root, env, "", "claude/fixture-not-a-phase-branch");
    assert.notEqual(
      phaseScope,
      nonPhaseScope,
      "the harness resolved the scope placeholder identically for a phase-branch run and a " +
        `non-phase run (both ${phaseScope}), so the two tables below are the same table and ` +
        "this test covers one resolution twice",
    );
    const tables = [
      printExpect(harness, root, env, "pr", phaseScope),
      printExpect(harness, root, env, "pr", nonPhaseScope),
      printExpect(harness, root, env, "main"),
    ];
    let checked = 0;
    for (const table of tables) {
      for (const row of table.gates) {
        const alternates = String(row.expect).split("|").map((s) => s.trim());
        assert.ok(
          !alternates.includes("red") && !alternates.includes("error"),
          `${table.label}: the row for ${row.id} admits ${row.expect}; no expectation in ` +
            "section 1.4 permits a red or errored gate on either bundle",
        );
        if (!alternates.includes("not-applicable")) {
          continue;
        }
        checked += 1;
        assert.equal(
          hasPrecondition.get(row.id),
          true,
          `${table.label}: the row for ${row.id} admits not-applicable, but gates.manifest.json ` +
            "declares that gate with no precondition, so it is always applicable and can never " +
            "legitimately report not-applicable. A row admitting a status the gate cannot " +
            "legitimately produce accepts a skipped or mis-declared gate as a pass.",
        );
      }
    }
    assert.ok(
      checked > 0,
      "no expectations row admits not-applicable on any arm, so this test examined nothing and " +
        "would pass however the tables were written",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the zero-red check reads the bundle's ROWS, not the summary's own red count, so a summary under-reporting its reds cannot pass", () => {
  // PRE-EMPTING THE OBVIOUS QUESTION ABOUT THIS FIX: does the check I added
  // actually read the rows, or can it pass when it should fail?
  //
  // The question is not rhetorical, because the defect this whole change is
  // about had a NEAR-MISS sitting beside it. scripts/m2-exit-test.sh:459 already
  // computed `red: rows.filter(r => r.status === "red").length` and compared it
  // with `summary.counts.red`. That LOOKS like a zero-red check and is not: it
  // only asserts the summary is self-consistent, so a bundle honestly reporting
  // three reds passes it. A guard whose condition does not test the property
  // that matters is green and worthless (CLAUDE.md, T-008's postscript).
  //
  // So the new check must key off the ROWS. The dangerous state that separates
  // the two readings is a summary whose counts claim zero red while a row says
  // red: a count-reading check passes it, a row-reading check cannot. The
  // assertion is on WHICH finding is produced, because a counts/rows mismatch
  // also trips the recount check, and passing for the right reason is the point.
  const root = scratch();
  const env = cleanEnv(root);
  try {
    const dir = join(root, "lying-summary");
    mkdirSync(join(dir, "suite"), { recursive: true });
    // counts say zero red; the row says red. Only a row reader sees it.
    writeFileSync(
      join(dir, "summary.json"),
      JSON.stringify({
        gates: [{ id: "suite", status: "red", applicable: true, vacuous: false, units: 2 }],
        counts: {
          declared: 1, applicable: 1, verdict: 1, green: 1, red: 0,
          "not-applicable": 0, error: 0, vacuous: 0,
        },
      }),
    );
    writeFileSync(
      join(dir, "suite", "result.json"),
      JSON.stringify({ gate: "suite", status: "red", units: 2, detail: "a real failure" }),
    );
    const expectPath = join(root, "expect-lying.json");
    writeFileSync(
      expectPath,
      JSON.stringify({
        label: "counts under-report the reds",
        // The row's gate is NAMED and its alternates ADMIT red, so neither the
        // derived expected set nor the required-green rule can be what rejects
        // this. Only the row-driven zero-red check is left.
        gates: [{ id: "suite", expect: "green|red", required: false }],
        absent: [],
      }),
    );
    const harnessEvidence = join(root, "harness-evidence");
    run("bash", [harness, "--self-test", harnessEvidence], { cwd: root, env });
    const assertProg = join(harnessEvidence, "m2-assert.mjs");
    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");

    const result = run(
      process.execPath,
      [assertProg, "--summary", join(dir, "summary.json"), "--evidence", dir,
        "--expect", expectPath, "--manifest", manifestFor(root, ["suite"])],
      { cwd: root, env },
    );
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, `a bundle carrying a red row must be REJECTED: ${output}`);
    assert.match(
      output,
      /1 gate\(s\) reported RED: suite/,
      "the rejection did not come from a check that READ THE ROW. A summary claiming red:0 " +
        "while a row says red is exactly the state a count-reading check passes, and " +
        "scripts/m2-exit-test.sh:459's recount is a count-reading check that already existed " +
        `and is not sufficient. Output was: ${output}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
