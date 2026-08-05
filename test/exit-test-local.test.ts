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
 *      titles of tests defined here. A test in this file that invoked
 *      the harness would be re-entered by the harness it invoked.
 *   2. Concurrent destruction. A1's `npm ci` (record 001-A1, cwd = the
 *      repository root) removes and reinstalls node_modules. node --test
 *      runs test files in parallel, so that would delete dependencies
 *      out from under the other files of the running suite.
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

test("the gates workflow runs the harness falsifiability guard and fails when it exits 0", () => {
  // The end-to-end red path lives in CI (see the header for why it
  // cannot live here). This is the guard on that guard: if the workflow
  // step is deleted or defanged, nothing else in the repository would
  // notice, and criterion 5 would silently lose its only automated
  // witness.
  const workflow = readFileSync(
    fileURLToPath(new URL("../.github/workflows/gates.yml", import.meta.url)),
    "utf8",
  );
  assert.match(
    workflow,
    /TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 scripts\/m1-exit-test\.sh --mode local/,
    "the gates workflow no longer runs the harness with the stage B skip",
  );
  // It must run it as a NEGATIVE assertion: exiting 0 has to fail the
  // job. A step that merely ran the command would pass whatever it did.
  assert.match(
    workflow,
    /if TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 scripts\/m1-exit-test\.sh[^\n]*\n\s*echo "FALSIFIABILITY GUARD BROKEN/,
    "the workflow runs the skip path but does not fail the job when the harness exits 0",
  );
  // And it must check WHERE it failed, so an unrelated early abort
  // cannot masquerade as the guard firing.
  assert.match(workflow, /-C2\.json/);
  assert.match(workflow, /no C2 record showing a nonzero teardown exit with outcome fail/);
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
