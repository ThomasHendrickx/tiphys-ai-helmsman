import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Tests for the M1 exit-test harness scripts (kernel plan v1, M1-P6).
 *
 * What these tests can and cannot reach: the harness's stages A and C
 * drive tiphys spawn, teardown and watch, which are M1-P4 and M1-P5
 * deliverables. Until those merge, the end-to-end local-mode run cannot
 * execute, and the criteria that depend on it are recorded as deferred
 * in delivery/work-history/m1-p6.md rather than asserted here. What is
 * exercised here is everything the harness owns that does not need those
 * commands: its argument surface, its step registry against section 4,
 * the sandbox seeder, and the stub payload.
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

    const tested = run("npm", ["test"], { cwd: clone, env });
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
