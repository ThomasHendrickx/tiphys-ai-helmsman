import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * THE THREE LOOP GAPS (kernel plan M4, M4-P24): the stop condition, and the
 * pull-request and merge capability that lands in the PLUGIN rather than in
 * the kernel.
 *
 * WHY THE DELIVERED-ELSEWHERE ASSERTIONS ARE ANCHORED TO A RECORDED CAPTURE.
 * The predicate under test consumes git's output, so an assertion written to
 * match the implementation would be a hand-written string dressed as a
 * measurement (CLAUDE.md standing warning 10, the red-witness rule). The file
 * `witness/captures/next-delivered-elsewhere-git.txt` holds a REAL run of
 * `git branch --merged`, `git merge-base --is-ancestor`, `git merge-tree` and
 * `git cherry` against a repository of exactly the shape the tests build. The
 * tests parse the naive predicate's answer out of that capture and require the
 * freshly built repository to reproduce it BEFORE any claim about the new
 * predicate is made, so the premise "git branch --merged reports both members
 * open" is measured on the spot rather than quoted from the plan.
 *
 * Sources are imported through the computed-URL dynamic-import pattern
 * (standing warning 4): a literal relative import of a `src` or `plugin/src`
 * module from `test/` fails the build with TS2878 under
 * rewriteRelativeImportExtensions across the project reference.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceEntry = join(repoRoot, "bin", "tiphys.ts");
const nextSourcePath = join(repoRoot, "src", "commands", "next.ts");
const prMainPath = join(repoRoot, "plugin", "src", "pr-main.ts");
const witnessPayload = join(repoRoot, "scripts", "credential-witness.mjs");
const capturePath = join(
  repoRoot,
  "witness",
  "captures",
  "next-delivered-elsewhere-git.txt",
);
const refusalCapturePath = join(
  repoRoot,
  "witness",
  "captures",
  "pr-refuses-without-credential.txt",
);

type Delivery =
  | { kind: "delivered"; how: "ancestor" | "squash" | "patch-equivalent" }
  | { kind: "open" }
  | { kind: "unknown"; detail: string };

const nextModule = (await import(new URL("../src/commands/next.ts", import.meta.url).href)) as {
  EXIT_WORK_REMAINS: number;
  CANNOT_SEE: readonly string[];
  CANNOT_SEE_HEADING: string;
  deliveredElsewhere(contextDir: string, branchRef: string, baseRef: string): Delivery;
};

const prModule = (await import(new URL("../plugin/src/pr.ts", import.meta.url).href)) as {
  PR_OPEN_COMMAND: string;
  PR_MERGE_COMMAND: string;
  PR_CREDENTIAL_NAMES: readonly string[];
  PR_EX_NO_CREDENTIAL: number;
  resolveCredential(
    env: Readonly<Record<string, string | undefined>>,
  ): { ok: true; name: string; value: string } | { ok: false; reason: string };
  prChildEnv(
    inherited: Readonly<Record<string, string | undefined>>,
    credential: { name: string; value: string },
  ): Record<string, string>;
};

interface LaunchRequest {
  taskId: string;
  worktree: string;
  command: string[];
  hookPath: string;
  recordPath: string;
  deadlineSeconds: number | undefined;
  env: Record<string, string> | undefined;
  briefPath: string;
  role: string | undefined;
  declaredTier: string | undefined;
  phaseId: string | undefined;
}
type LaunchOutcome =
  | { kind: "completed"; exitCode: number }
  | { kind: "launch-failed"; reason: string }
  | { kind: "incomplete"; reason: string };

const pluginModule = (await import(
  new URL("../plugin/src/index.ts", import.meta.url).href
)) as {
  claudeCodeAdapter: { name: string; launch(request: LaunchRequest): Promise<LaunchOutcome> };
  default: { name: string; launch: unknown };
  PR_OPEN_COMMAND?: string;
  PR_MERGE_COMMAND?: string;
  runPr?: unknown;
  resolveCredential?: unknown;
  prChildEnv?: unknown;
};

const envModule = (await import(new URL("../src/exec/env.ts", import.meta.url).href)) as {
  buildChildEnv(spec: {
    parentEnv: Record<string, string | undefined>;
    scrubDir: string;
  }): { ok: true; env: Record<string, string> } | { ok: false; reason: string };
};

const credentialsModule = (await import(
  new URL("../src/gates/credentials.ts", import.meta.url).href
)) as { GH_TOKEN_VARIABLES: readonly string[] };

/* ------------------------------------------------------------------ */
/* Scratch helpers                                                      */
/* ------------------------------------------------------------------ */

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Next Command Test",
  GIT_AUTHOR_EMAIL: "next-command@tiphys.invalid",
  GIT_COMMITTER_NAME: "Next Command Test",
  GIT_COMMITTER_EMAIL: "next-command@tiphys.invalid",
};

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-m4p24-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function git(dir: string, args: string[]): { stdout: string; status: number } {
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return { stdout: result.stdout ?? "", status: result.status ?? -1 };
}

function commit(dir: string, file: string, body: string, message: string): void {
  writeFileSync(join(dir, file), body);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", message]);
}

/**
 * The delivered-elsewhere laboratory, built to the shape the recorded capture
 * was taken against.
 *
 *   feat-a     two commits, SQUASH-merged into main (member A)
 *   feat-b     one commit, cherry-picked into feat-c and merged with it, after
 *              which main edits the same file again (member B)
 *   feat-c     merged into main with a real merge commit
 *   feat-open  never delivered anywhere (the control)
 */
function makeDemoRepo(parent: string): string {
  const repo = join(parent, "demo");
  mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q", "--initial-branch=main"]);
  commit(repo, "base.txt", "base\n", "c0");

  git(repo, ["checkout", "-qb", "feat-a"]);
  commit(repo, "a1.txt", "a1\n", "a1");
  commit(repo, "a2.txt", "a2\n", "a2");

  git(repo, ["checkout", "-q", "main"]);
  git(repo, ["checkout", "-qb", "feat-b"]);
  commit(repo, "shared.txt", "line one\n", "b1");
  const b1 = git(repo, ["rev-parse", "HEAD"]).stdout.trim();

  git(repo, ["checkout", "-q", "main"]);
  git(repo, ["checkout", "-qb", "feat-c"]);
  // `-x` appends a provenance trailer, so the cherry-picked commit has a
  // DIFFERENT sha from feat-b's and the same patch id. Without it git
  // reproduces a byte-identical commit object, feat-b becomes an ancestor of
  // main, and member B stops being dangerous at all.
  git(repo, ["cherry-pick", "-x", b1]);
  commit(repo, "c1.txt", "c1\n", "c1");

  git(repo, ["checkout", "-q", "main"]);
  git(repo, ["checkout", "-qb", "feat-open"]);
  commit(repo, "open.txt", "o1\n", "o1");

  git(repo, ["checkout", "-q", "main"]);
  git(repo, ["merge", "--squash", "-q", "feat-a"]);
  git(repo, ["commit", "-q", "-m", "squash of feat-a"]);
  git(repo, ["merge", "--no-ff", "-q", "-m", "merge feat-c", "feat-c"]);
  commit(repo, "shared.txt", "line one\nline two\n", "extend shared");
  return repo;
}

/**
 * The branch names `git branch --merged main` printed in the RECORDED capture.
 * Parsed rather than retyped, so the premise every member-A and member-B claim
 * rests on comes from real git output.
 */
function recordedMergedBranches(): string[] {
  const capture = readFileSync(capturePath, "utf8");
  const lines = capture.split("\n");
  const start = lines.indexOf("$ git branch --merged main");
  assert.notEqual(start, -1, `the capture ${capturePath} has no branch --merged block`);
  const names: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("(exit ")) {
      break;
    }
    const name = line.replace(/^\*?\s+/, "").trim();
    if (name !== "") {
      names.push(name);
    }
  }
  assert.ok(names.length > 0, "the recorded branch --merged block listed nothing");
  return names.sort();
}

function liveMergedBranches(repo: string): string[] {
  return git(repo, ["branch", "--merged", "main"]).stdout
    .split("\n")
    .map((line) => line.replace(/^\*?\s+/, "").trim())
    .filter((line) => line !== "")
    .sort();
}

interface Fleet {
  root: string;
  projects: string;
}

function makeFleet(t: { after(fn: () => void): void }): Fleet {
  const tmp = makeTempDir(t);
  const root = join(tmp, "fleet");
  const env = { ...process.env };
  delete env["TIPHYS_HOLDER_ID"];
  const init = spawnSync(process.execPath, [sourceEntry, "init", root], {
    encoding: "utf8",
    env: { ...env, ...GIT_IDENTITY },
  });
  assert.equal(init.status, 0, init.stderr);
  return { root, projects: join(root, "projects") };
}

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function runNext(fleet: Fleet, extra: Record<string, string> = {}): Run {
  const result = spawnSync(process.execPath, [sourceEntry, "next"], {
    cwd: fleet.root,
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY, ...extra },
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function nextActionLines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line.startsWith("next action: "));
}

function cannotSeeLines(stdout: string): string[] {
  const lines = stdout.split("\n");
  const start = lines.indexOf(nextModule.CANNOT_SEE_HEADING);
  if (start === -1) {
    return [];
  }
  const block: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith("  - ")) {
      break;
    }
    block.push(line);
  }
  return block;
}

function openTaskMeta(fleet: Fleet, taskId: string, project: string): void {
  const dir = join(fleet.root, "tasks", taskId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "meta.json"),
    `${JSON.stringify(
      {
        id: taskId,
        project,
        shape: "ship",
        branch: `task/${taskId}`,
        worktree: join(fleet.root, "worktrees", taskId),
        baseSha: "0".repeat(40),
        baseOffline: false,
        status: "open",
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

/* ------------------------------------------------------------------ */
/* Criterion 3: the delivered-elsewhere predicate                       */
/* ------------------------------------------------------------------ */

test(
  "delivered-elsewhere reports a squash-merged branch delivered where git branch --merged reports it open",
  (t) => {
    const repo = makeDemoRepo(makeTempDir(t));

    // THE PREMISE IS MEASURED FIRST. The recorded capture and this fresh
    // repository must agree that `git branch --merged main` does not list
    // feat-a; if they ever stop agreeing, this test says so instead of
    // quietly asserting something about a state that no longer exists.
    const recorded = recordedMergedBranches();
    assert.deepEqual(liveMergedBranches(repo), recorded);
    assert.equal(
      recorded.includes("feat-a"),
      false,
      "git branch --merged listed the squash-merged branch, so the naive predicate is not the dangerous state this test assumes",
    );

    // AND THE TIP IS NOT AN ANCESTOR, so the branch really is invisible to
    // the sha-based reading rather than merely unlisted.
    const ancestor = spawnSync(
      "git",
      ["-C", repo, "merge-base", "--is-ancestor", "refs/heads/feat-a", "refs/heads/main"],
      { encoding: "utf8" },
    );
    assert.equal(ancestor.status, 1, "feat-a is an ancestor of main, so member A is not dangerous here");

    assert.deepEqual(
      nextModule.deliveredElsewhere(repo, "refs/heads/feat-a", "refs/heads/main"),
      { kind: "delivered", how: "squash" },
    );
  },
);

test(
  "delivered-elsewhere reports a branch whose commits landed in another pull request delivered where git branch --merged reports it open",
  (t) => {
    const repo = makeDemoRepo(makeTempDir(t));

    const recorded = recordedMergedBranches();
    assert.deepEqual(liveMergedBranches(repo), recorded);
    assert.equal(
      recorded.includes("feat-b"),
      false,
      "git branch --merged listed the foreign-pull-request branch, so the naive predicate is not the dangerous state this test assumes",
    );

    const ancestor = spawnSync(
      "git",
      ["-C", repo, "merge-base", "--is-ancestor", "refs/heads/feat-b", "refs/heads/main"],
      { encoding: "utf8" },
    );
    assert.equal(ancestor.status, 1, "feat-b is an ancestor of main, so member B is not dangerous here");

    // STRUCTURALLY DIFFERENT FROM MEMBER A, and this is the assertion that
    // says so: merging feat-b into main CONFLICTS, because main edited the
    // same file again after the commit landed. The content arm therefore
    // answers open for it, and only the patch-id arm can answer at all.
    const merged = spawnSync(
      "git",
      ["-C", repo, "merge-tree", "--write-tree", "refs/heads/main", "refs/heads/feat-b"],
      { encoding: "utf8" },
    );
    assert.equal(merged.status, 1, "merging feat-b into main was clean, so member A's arm would have covered it");

    assert.deepEqual(
      nextModule.deliveredElsewhere(repo, "refs/heads/feat-b", "refs/heads/main"),
      { kind: "delivered", how: "patch-equivalent" },
    );
  },
);

test(
  "delivered-elsewhere reports a genuinely undelivered branch open and tiphys next names it",
  (t) => {
    const repo = makeDemoRepo(makeTempDir(t));
    assert.deepEqual(
      nextModule.deliveredElsewhere(repo, "refs/heads/feat-open", "refs/heads/main"),
      { kind: "open" },
    );

    const fleet = makeFleet(t);
    spawnSync("cp", ["-a", repo, join(fleet.projects, "demo")]);
    const run = runNext(fleet);
    assert.equal(run.status, nextModule.EXIT_WORK_REMAINS, run.stdout + run.stderr);
    assert.match(run.stdout, /branch refs\/heads\/feat-open in project demo/);
    assert.equal(
      run.stdout.includes("refs/heads/feat-a in project demo"),
      false,
      "the squash-merged branch was reported in flight",
    );
    assert.equal(
      run.stdout.includes("refs/heads/feat-b in project demo"),
      false,
      "the foreign-pull-request branch was reported in flight",
    );
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 1: the three-valued exit code                              */
/* ------------------------------------------------------------------ */

test(
  "next exits 3 while an in-flight item exists and 0 only when every category is empty",
  (t) => {
    const fleet = makeFleet(t);

    const empty = runNext(fleet);
    assert.equal(empty.status, 0, empty.stdout + empty.stderr);
    assert.match(empty.stdout, /^in flight: 0$/m);
    assert.match(empty.stdout, /^unknown: 0$/m);

    openTaskMeta(fleet, "t-one", join(fleet.projects, "demo"));
    const busy = runNext(fleet);
    assert.equal(busy.status, nextModule.EXIT_WORK_REMAINS, busy.stdout + busy.stderr);
    assert.match(busy.stdout, /task t-one \(open\)/);

    // THREE-VALUED ON PURPOSE: distinct from 0 and from 1, so a caller can
    // tell work remaining from the command failing. Outside a fleet home the
    // same binary exits 1.
    assert.notEqual(nextModule.EXIT_WORK_REMAINS, 0);
    assert.notEqual(nextModule.EXIT_WORK_REMAINS, 1);
    const outside = spawnSync(process.execPath, [sourceEntry, "next"], {
      cwd: dirname(fleet.root),
      encoding: "utf8",
      env: { ...process.env, ...GIT_IDENTITY },
    });
    assert.equal(outside.status, 1, outside.stdout + outside.stderr);
    assert.match(outside.stderr, /not a fleet home/);
  },
);

test("next prints exactly one next action line in every state", (t) => {
  const fleet = makeFleet(t);

  const empty = runNext(fleet);
  assert.deepEqual(nextActionLines(empty.stdout).length, 1, empty.stdout);
  assert.match(empty.stdout, /next action: NOTHING IS IN FLIGHT/);

  openTaskMeta(fleet, "t-one", join(fleet.projects, "demo"));
  const busy = runNext(fleet);
  assert.deepEqual(nextActionLines(busy.stdout).length, 1, busy.stdout);
  assert.match(busy.stdout, /next action: CLOSE OR REPORT task t-one/);

  const repo = makeDemoRepo(makeTempDir(t));
  spawnSync("cp", ["-a", repo, join(fleet.projects, "demo2")]);
  const both = runNext(fleet);
  assert.deepEqual(nextActionLines(both.stdout).length, 1, both.stdout);
});

/* ------------------------------------------------------------------ */
/* Criterion 2: no absolute path literal                                */
/* ------------------------------------------------------------------ */

test("the next command source contains no absolute path literal", () => {
  const source = readFileSync(nextSourcePath, "utf8");
  const hits: string[] = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.includes("/home/") || line.includes("/tmp/")) {
      hits.push(`${String(index + 1)}: ${line.trim()}`);
    }
  }
  assert.deepEqual(hits, [], `absolute path literal in ${nextSourcePath}`);

  // AND THE WORKING DIRECTORY IS THE FLEET HOME'S, not the process's idea of
  // where a fleet lives: the command resolves it through loadFleet(cwd), so
  // the same binary reports on whichever fleet home it is run in.
  assert.match(source, /loadFleet\(process\.cwd\(\)\)/);
});

/* ------------------------------------------------------------------ */
/* Criterion 4: the cannot-see block                                    */
/* ------------------------------------------------------------------ */

test(
  "next prints the whole cannot-see block and the same exit code when the network is unreachable",
  (t) => {
    const fleet = makeFleet(t);
    const repo = makeDemoRepo(makeTempDir(t));
    const project = join(fleet.projects, "demo");
    spawnSync("cp", ["-a", repo, project]);

    const reachable = runNext(fleet);
    const beforeBlock = cannotSeeLines(reachable.stdout);
    assert.equal(
      beforeBlock.length,
      nextModule.CANNOT_SEE.length,
      `the cannot-see block printed ${String(beforeBlock.length)} of ${String(nextModule.CANNOT_SEE.length)} entries`,
    );
    for (const item of nextModule.CANNOT_SEE) {
      assert.ok(
        reachable.stdout.includes(item),
        `the cannot-see block omitted: ${item}`,
      );
    }

    // THE NETWORK GOES AWAY. `origin` is repointed at a path that does not
    // exist, so every remote operation in this clone fails, and the fleet
    // home itself has no remote at all.
    git(project, ["remote", "add", "origin", join(fleet.root, "no-such-remote.git")]);
    const unreachable = runNext(fleet, { GIT_TERMINAL_PROMPT: "0" });
    const probe = spawnSync("git", ["-C", project, "ls-remote", "origin"], {
      encoding: "utf8",
    });
    assert.notEqual(probe.status, 0, "the remote was still reachable, so nothing was witnessed");

    assert.deepEqual(
      cannotSeeLines(unreachable.stdout),
      beforeBlock,
      "the cannot-see block changed when the network went away",
    );
    assert.equal(
      unreachable.status,
      reachable.status,
      "the exit code changed when the network went away",
    );
  },
);

test(
  "next counts a category it could not read as work remaining rather than as empty",
  (t) => {
    const fleet = makeFleet(t);

    // A project directory that is not a git repository at all: no base ref
    // resolves, so delivery cannot be judged for it. T-036's mechanism is the
    // opposite choice, where a source that could not be read contributed zero
    // and the stop condition reported a finished milestone.
    mkdirSync(join(fleet.projects, "not-a-repo"), { recursive: true });
    writeFileSync(join(fleet.projects, "not-a-repo", "readme.md"), "not a repo\n");

    const run = runNext(fleet);
    assert.equal(run.status, nextModule.EXIT_WORK_REMAINS, run.stdout + run.stderr);
    assert.match(run.stdout, /^unknown: 1$/m);
    assert.match(run.stdout, /project not-a-repo: not the top level of its own git repository/);
    assert.match(run.stdout, /next action: MEASURE the category this command could not read/);
    assert.match(run.stdout, /^in flight: 0$/m);
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 5: the plugin's pull-request capability                    */
/* ------------------------------------------------------------------ */

/** Every credential name, removed from this process for the call and restored. */
function withoutCredentials<T>(body: () => T): T {
  const saved = new Map<string, string | undefined>();
  for (const name of prModule.PR_CREDENTIAL_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  try {
    return body();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

/**
 * The recorded refusal, parsed out of
 * `witness/captures/pr-refuses-without-credential.txt`. Each block records one
 * child's argv, its stderr and stdout verbatim as JSON string literals, and its
 * exit code, so a live run can be compared against a real earlier run rather
 * than against a string typed to match the implementation.
 */
function recordedRefusal(subcommand: string): {
  stderr: string;
  stdout: string;
  exit: number;
} {
  const capture = readFileSync(refusalCapturePath, "utf8");
  const lines = capture.split("\n");
  const header = `$ node plugin/src/pr-main.ts ${subcommand} --repo owner/name --number 1`;
  const start = lines.indexOf(header);
  assert.notEqual(start, -1, `the capture ${refusalCapturePath} has no block for ${subcommand}`);
  const field = (offset: number, name: string): string => {
    const line = lines[start + offset] ?? "";
    assert.ok(line.startsWith(`${name}: `), `capture block for ${subcommand} has no ${name} line`);
    return line.slice(name.length + 2);
  };
  return {
    stderr: JSON.parse(field(1, "stderr")) as string,
    stdout: JSON.parse(field(2, "stdout")) as string,
    exit: Number.parseInt(field(3, "exit"), 10),
  };
}

test(
  "pr open and pr merge each exit nonzero with exactly one line when the credential is absent",
  () => {
    withoutCredentials(() => {
      for (const subcommand of ["open", "merge"]) {
        const recorded = recordedRefusal(subcommand);
        const result = spawnSync(
          process.execPath,
          [prMainPath, subcommand, "--repo", "owner/name", "--number", "1"],
          { encoding: "utf8", env: { ...process.env } },
        );
        assert.notEqual(result.status, 0, `pr ${subcommand} exited 0 with no credential`);
        assert.equal(result.status, prModule.PR_EX_NO_CREDENTIAL);
        const lines = (result.stderr ?? "").split("\n").filter((line) => line !== "");
        assert.equal(lines.length, 1, `pr ${subcommand} wrote ${String(lines.length)} lines: ${result.stderr}`);
        assert.equal(result.stdout, "", `pr ${subcommand} wrote to stdout while refusing`);
        assert.match(lines[0] ?? "", /no pull-request credential is present/);

        // AND THE LIVE RUN REPRODUCES THE RECORDED ONE, byte for byte on both
        // streams and on the exit code. That is what makes the three
        // assertions above measurements of this program rather than of a
        // sentence someone wrote next to it.
        assert.equal(result.stderr, recorded.stderr, `pr ${subcommand} stderr diverged from the recorded run`);
        assert.equal(result.stdout, recorded.stdout, `pr ${subcommand} stdout diverged from the recorded run`);
        assert.equal(result.status, recorded.exit, `pr ${subcommand} exit diverged from the recorded run`);
      }
    });

    // The names are the kernel's own gh vocabulary, compared against the
    // exported list rather than against a second literal.
    for (const name of credentialsModule.GH_TOKEN_VARIABLES) {
      assert.ok(
        prModule.PR_CREDENTIAL_NAMES.includes(name),
        `${name} is in the kernel's gh vocabulary and not in the plugin's`,
      );
    }
  },
);

test(
  "the pull-request credential never reaches a kernel adapter child, probed from inside the child",
  async (t) => {
    const dir = makeTempDir(t);
    const worktree = join(dir, "worktree");
    mkdirSync(worktree, { recursive: true });
    const hookPath = join(dir, "turn-end-hook.mjs");
    writeFileSync(
      hookPath,
      "import { writeFileSync } from 'node:fs';\n" +
        `writeFileSync(${JSON.stringify(join(dir, "turn-end"))}, JSON.stringify({ endedAt: new Date().toISOString(), exitCode: Number(process.argv[2]) }) + "\\n");\n`,
    );
    writeFileSync(join(dir, "brief.md"), "# Brief\n");

    const canary = "ghp_m4p24_canary_never_leaves_the_orchestrator";

    await withoutCredentials(async () => {
      // THE PLUGIN RESOLVES A CREDENTIAL from an environment it was HANDED,
      // and builds a child environment for its own child from it. Neither step
      // may publish the value into this process.
      const supplied = { ...process.env, GH_TOKEN: canary };
      const resolved = prModule.resolveCredential(supplied);
      assert.equal(resolved.ok, true);
      const prEnv = prModule.prChildEnv(supplied, resolved as { name: string; value: string });
      assert.equal(prEnv["GH_TOKEN"], canary, "the plugin's own child lost the credential");
      for (const name of prModule.PR_CREDENTIAL_NAMES) {
        assert.equal(
          process.env[name],
          undefined,
          `${name} was published into the kernel process by the plugin`,
        );
      }

      // AND THE ASSERTION THAT SETTLES IT IS MADE FROM INSIDE THE CHILD, by
      // the kernel's own probe vocabulary, rather than from this process's
      // reading of an object the kernel returned (M4-P8's criterion 5).
      for (const arm of ["inherited", "scrubbed"] as const) {
        const report = join(dir, `witness-${arm}.json`);
        let childEnv: Record<string, string> | undefined;
        if (arm === "scrubbed") {
          const built = envModule.buildChildEnv({
            parentEnv: { ...process.env, GH_TOKEN: canary },
            scrubDir: join(dir, "scrub-env"),
          });
          assert.equal(built.ok, true, built.ok ? "" : built.reason);
          childEnv = (built as { env: Record<string, string> }).env;
        }
        const outcome = await pluginModule.claudeCodeAdapter.launch({
          taskId: `m4p24-${arm}`,
          worktree,
          command: [process.execPath, witnessPayload, report],
          hookPath,
          recordPath: join(dir, `executor-${arm}.json`),
          deadlineSeconds: undefined,
          env: childEnv,
          briefPath: join(dir, "brief.md"),
          role: undefined,
          declaredTier: undefined,
          phaseId: undefined,
        });
        assert.deepEqual(outcome, { kind: "completed", exitCode: 0 }, JSON.stringify(outcome));
        const seen = JSON.parse(readFileSync(report, "utf8")) as {
          env: Record<string, string>;
          envNames: string[];
        };
        for (const name of prModule.PR_CREDENTIAL_NAMES) {
          assert.equal(
            seen.env[name],
            undefined,
            `${name} reached the ${arm} adapter child`,
          );
        }
        assert.equal(
          Object.values(seen.env).includes(canary),
          false,
          `the canary value reached the ${arm} adapter child under another name`,
        );
      }
    });
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 6: no kernel code path invokes either command              */
/* ------------------------------------------------------------------ */

function sourceFilesUnder(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFilesUnder(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found;
}

test("no kernel code path under src or bin names either plugin pull-request command", () => {
  const tokens = [
    prModule.PR_OPEN_COMMAND,
    prModule.PR_MERGE_COMMAND,
    "plugin/src/pr",
  ];
  const files = [
    ...sourceFilesUnder(join(repoRoot, "src")),
    ...sourceFilesUnder(join(repoRoot, "bin")),
  ];
  assert.ok(files.length > 0, "the kernel source walk found nothing, so this grep proves nothing");
  const hits: string[] = [];
  for (const file of files) {
    const body = readFileSync(file, "utf8");
    for (const token of tokens) {
      if (body.includes(token)) {
        hits.push(`${file}: ${token}`);
      }
    }
  }
  assert.deepEqual(hits, [], "a kernel source names the plugin's pull-request capability");
});

test(
  "the plugin entry point re-exports the pull-request capability and still defaults to the adapter",
  () => {
    // THE CAPABILITY IS REACHABLE BY THE PACKAGE NAME. An orchestrator holding
    // the credential installs `@tiphys/claude-code-plugin` and imports it; a
    // capability that exists only in an unexported module is a capability
    // nobody outside this repository can invoke.
    assert.equal(pluginModule.PR_OPEN_COMMAND, prModule.PR_OPEN_COMMAND);
    assert.equal(pluginModule.PR_MERGE_COMMAND, prModule.PR_MERGE_COMMAND);
    for (const name of ["runPr", "resolveCredential", "prChildEnv"] as const) {
      assert.equal(
        typeof pluginModule[name],
        "function",
        `the plugin entry point does not export ${name}`,
      );
    }

    // AND THE DEFAULT EXPORT IS STILL THE ADAPTER, which is the whole of the
    // loader contract: src/adapters/load.ts refuses a default that is not an
    // object with a callable launch, and that refusal happens AFTER a worktree,
    // a branch and a pool record have been created.
    assert.equal(pluginModule.default.name, pluginModule.claudeCodeAdapter.name);
    assert.equal(typeof pluginModule.default.launch, "function");
  },
);
