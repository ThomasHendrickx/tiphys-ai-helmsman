import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
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
const remoteCapturePath = join(
  repoRoot,
  "witness",
  "captures",
  "next-remote-only-branch-git.txt",
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
  baseRefOf(
    projectDir: string,
  ): { ok: true; ref: string; how: string; doubt?: string } | { ok: false; reason: string };
};

const prModule = (await import(new URL("../plugin/src/pr.ts", import.meta.url).href)) as {
  PR_OPEN_COMMAND: string;
  PR_MERGE_COMMAND: string;
  PR_CREDENTIAL_NAMES: readonly string[];
  PR_EX_NO_CREDENTIAL: number;
  PR_EX_NO_TARGET: number;
  PR_EX_USAGE: number;
  openArgv(flags: { repo: string; head?: string; base?: string; title?: string }): string[];
  mergeArgv(flags: { repo: string; number: string }): string[];
  runPr(
    argv: string[],
    options: {
      env: Readonly<Record<string, string | undefined>>;
      io: { stderr(line: string): void; stdout(line: string): void };
      exec: (
        program: string,
        args: string[],
        env: Record<string, string>,
      ) => { status: number | null; reason?: string };
    },
  ): number;
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
    const parent = makeTempDir(t);
    const repo = makeDemoRepo(parent);
    const fleet = makeFleet(t);
    const project = join(fleet.projects, "demo");
    spawnSync("cp", ["-a", repo, project]);

    // THE REACHABLE ARM HAS TO BE REACHABLE OR THE WHOLE TEST IS ONE STATE
    // TWICE. A bare clone on local disk is what this container can actually
    // reach; every outbound git URL here goes through a proxy and none of them
    // answers. So `origin` is a real remote that `git ls-remote` resolves, and
    // the probe below MEASURES that rather than assuming it.
    const remote = join(parent, "origin.git");
    git(parent, ["clone", "--quiet", "--bare", repo, remote]);
    git(project, ["remote", "add", "origin", remote]);
    const reachableProbe = spawnSync("git", ["-C", project, "ls-remote", "origin"], {
      encoding: "utf8",
    });
    assert.equal(
      reachableProbe.status,
      0,
      `the reachable arm could not reach its own remote: ${reachableProbe.stderr}`,
    );

    const reachable = runNext(fleet);
    const beforeBlock = cannotSeeLines(reachable.stdout);
    assert.equal(
      beforeBlock.length,
      nextModule.CANNOT_SEE.length,
      `the cannot-see block printed ${String(beforeBlock.length)} of ${String(nextModule.CANNOT_SEE.length)} entries`,
    );
    for (const item of nextModule.CANNOT_SEE) {
      assert.ok(reachable.stdout.includes(item), `the cannot-see block omitted: ${item}`);
    }

    // TWO STRUCTURALLY DIFFERENT UNREACHABLE STATES, because one is not a
    // class: a remote path that does not exist at all, and a TCP endpoint that
    // refuses the connection. The first is how a moved or deleted mirror
    // fails, the second is how a network outage fails, and a command that
    // degrades on either is the shape CLAUDE.md standing warning 6 records.
    for (const [label, url] of [
      ["absent local remote", join(parent, "no-such-remote.git")],
      ["refused connection", "git://127.0.0.1:9/nothing.git"],
    ] as const) {
      git(project, ["remote", "set-url", "origin", url]);
      const probe = spawnSync("git", ["-C", project, "ls-remote", "origin"], {
        encoding: "utf8",
      });
      assert.notEqual(probe.status, 0, `${label}: the remote was still reachable, so nothing was witnessed`);

      const unreachable = runNext(fleet, { GIT_TERMINAL_PROMPT: "0" });
      assert.deepEqual(
        cannotSeeLines(unreachable.stdout),
        beforeBlock,
        `${label}: the cannot-see block changed when the network went away`,
      );
      assert.equal(
        unreachable.status,
        reachable.status,
        `${label}: the exit code changed when the network went away`,
      );
    }
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
/* Round 1: empty by construction is not empty by observation           */
/* ------------------------------------------------------------------ */

/**
 * THE MECHANISM THESE THREE TESTS GUARD, stated once.
 *
 * A CATEGORY THAT IS EMPTY BY CONSTRUCTION MUST NOT BE REPORTED AS A CATEGORY
 * THAT IS EMPTY BY OBSERVATION. The first version of `tiphys next` enforced
 * that at CATEGORY granularity only: the three `readdirSync` failures were
 * recorded, and every place a single CANDIDATE left a walk was silent. Four
 * such places were measured, and each of them printed `in flight: 0`,
 * `unknown: 0` and exit 0 over real work.
 *
 * Each test below drives the dangerous STATE, not the absent feature, and each
 * carries its own green control in the same body, because a test that only
 * ever sees the broken fixture cannot tell a fix from a fixture that stopped
 * being dangerous.
 */

test(
  "next records a task whose meta.json did not read as a task record rather than counting it as zero",
  (t) => {
    const fleet = makeFleet(t);
    const taskDir = join(fleet.root, "tasks", "t-0001");
    mkdirSync(taskDir, { recursive: true });
    const metaPath = join(taskDir, "meta.json");

    // GREEN CONTROL FIRST, so the red below is attributable to the record and
    // not to the presence of a task directory at all. A CLOSED task reads, so
    // its status IS established, and it belongs in neither category.
    openTaskMeta(fleet, "t-0001", join(fleet.projects, "demo"));
    const closed = JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>;
    closed["status"] = "closed";
    writeFileSync(metaPath, `${JSON.stringify(closed, null, 2)}\n`);
    const control = runNext(fleet);
    assert.equal(control.status, 0, control.stdout + control.stderr);
    assert.match(control.stdout, /^unknown: 0$/m);
    assert.match(control.stdout, /^in flight: 0$/m);

    // TWO STRUCTURALLY DIFFERENT MEMBERS OF THE SAME CLASS, and they are
    // different because they reach `readTaskMeta`'s single `undefined` by
    // DIFFERENT ROUTES: one never parses (src/task.ts:390), the other parses
    // and fails the field check (src/task.ts:404). Collapsing them into one
    // fixture would be one shape twice.
    const members: [string, string][] = [
      ["truncated mid-write", '{"id":"t-0001","project":"demo","shape":"ship"'],
      [
        "parses and fails the field check",
        JSON.stringify({
          id: "t-0001",
          project: "demo",
          shape: "ship",
          branch: "b",
          worktree: "w",
          baseSha: "0",
          baseOffline: false,
          status: "OPEN",
          createdAt: "x",
        }),
      ],
    ];
    for (const [label, body] of members) {
      writeFileSync(metaPath, body);

      // THE PREMISE IS MEASURED, not assumed: member one must genuinely fail
      // to parse and member two must genuinely parse, or the pair is one
      // member twice and this test proves less than it claims.
      let parses: boolean;
      try {
        JSON.parse(readFileSync(metaPath, "utf8"));
        parses = true;
      } catch {
        parses = false;
      }
      assert.equal(
        parses,
        label !== "truncated mid-write",
        `${label}: the fixture did not reach readTaskMeta's undefined by the route this member is for`,
      );

      const run = runNext(fleet);
      assert.equal(run.status, nextModule.EXIT_WORK_REMAINS, `${label}: ${run.stdout}${run.stderr}`);
      assert.match(run.stdout, /^unknown: 1$/m, `${label}: ${run.stdout}`);
      assert.match(
        run.stdout,
        /task t-0001: tasks\/t-0001\/meta\.json did not read as a task record/,
        `${label}: ${run.stdout}`,
      );
      assert.match(
        run.stdout,
        /next action: MEASURE the category this command could not read/,
        `${label}: ${run.stdout}`,
      );
    }
  },
);

/**
 * The recorded git run this test's premise is parsed out of. Each block is a
 * command line, its output lines, and its exit code, taken against a clone of
 * exactly the shape `makeRemoteOnlyProject` builds.
 */
function recordedRemoteBlock(command: string): { lines: string[]; exit: number } {
  const capture = readFileSync(remoteCapturePath, "utf8");
  const lines = capture.split("\n");
  const start = lines.indexOf(`$ ${command}`);
  assert.notEqual(start, -1, `the capture ${remoteCapturePath} has no block for: ${command}`);
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("(exit ")) {
      return { lines: body, exit: Number.parseInt(line.slice("(exit ".length), 10) };
    }
    body.push(line);
  }
  assert.fail(`the capture block for ${command} has no exit line`);
}

/**
 * An upstream carrying one branch that is genuinely undelivered, and a clone
 * of it. A CLONE is the point: it is what `tiphys init` and `tiphys resume`
 * produce, and in it every branch except the checked-out one exists only
 * under `refs/remotes/`.
 */
function makeRemoteOnlyUpstream(parent: string): string {
  const upstream = join(parent, "upstream");
  mkdirSync(upstream, { recursive: true });
  git(upstream, ["init", "-q", "--initial-branch=main"]);
  commit(upstream, "base.txt", "base\n", "c0");
  git(upstream, ["checkout", "-qb", "feat-open"]);
  // REAL CONTENT, NOT AN EMPTY COMMIT. Measured while writing this test: an
  // empty commit merges into the base without changing its tree, so the
  // delivered-elsewhere predicate's CONTENT arm answers `delivered` and the
  // branch is not dangerous at all.
  commit(upstream, "open.txt", "o1\n", "o1");
  git(upstream, ["checkout", "-q", "main"]);
  return upstream;
}

test(
  "next reports a remote-only branch and a project reached through a symlink as in flight",
  (t) => {
    const parent = makeTempDir(t);
    const upstream = makeRemoteOnlyUpstream(parent);
    const fleet = makeFleet(t);

    // MEMBER A: an ordinary clone, whose undelivered branch exists only as a
    // remote-tracking ref.
    git(parent, ["clone", "--quiet", upstream, join(fleet.projects, "cloned")]);
    // MEMBER B, STRUCTURALLY DIFFERENT: the project is reached through a
    // SYMLINK, so it is dropped by the directory filter one loop earlier,
    // before any ref in it is looked at. Different candidate, different
    // filter, same mechanism.
    const elsewhere = join(parent, "elsewhere");
    git(parent, ["clone", "--quiet", upstream, elsewhere]);
    symlinkSync(elsewhere, join(fleet.projects, "linked"));

    // THE PREMISE IS MEASURED AGAINST REAL GIT OUTPUT, and it is measured
    // TWICE: the recorded run and this fresh clone must agree that the
    // LOCAL-ONLY walk sees one ref and the full walk sees the branch.
    const cloned = join(fleet.projects, "cloned");
    const recordedLocal = recordedRemoteBlock("git for-each-ref --format=%(refname) refs/heads/");
    const liveLocal = git(cloned, ["for-each-ref", "--format=%(refname)", "refs/heads/"]).stdout
      .split("\n")
      .filter((line) => line !== "");
    assert.deepEqual(liveLocal, recordedLocal.lines);
    assert.equal(
      liveLocal.includes("refs/remotes/origin/feat-open"),
      false,
      "the local-only walk listed the remote-only branch, so it is not the dangerous state this test assumes",
    );

    const recordedCherry = recordedRemoteBlock(
      "git cherry refs/remotes/origin/main refs/remotes/origin/feat-open",
    );
    const liveCherry = git(cloned, [
      "cherry",
      "refs/remotes/origin/main",
      "refs/remotes/origin/feat-open",
    ]).stdout
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => line.split(" ")[0] ?? "");
    assert.deepEqual(
      liveCherry,
      recordedCherry.lines.map((line) => line.split(" ")[0] ?? ""),
      "the fresh clone's patch-id marks diverged from the recorded run",
    );
    assert.deepEqual(liveCherry, ["+"], "the branch is already upstream, so nothing is at stake");

    const run = runNext(fleet);
    assert.equal(run.status, nextModule.EXIT_WORK_REMAINS, run.stdout + run.stderr);
    assert.match(
      run.stdout,
      /branch refs\/remotes\/origin\/feat-open in project cloned/,
      run.stdout,
    );
    assert.match(
      run.stdout,
      /branch refs\/remotes\/origin\/feat-open in project linked/,
      run.stdout,
    );

    // AND THE BASE EACH JUDGEMENT USED IS DISCLOSED, which is what makes the
    // verdict checkable rather than trusted.
    assert.match(
      run.stdout,
      /project cloned: branches judged against refs\/remotes\/origin\/main \(chosen by origin\/HEAD\)/,
      run.stdout,
    );

    // NO DOUBLE COUNTING. `refs/heads/main` and `refs/remotes/origin/main`
    // sit at one sha, and `refs/remotes/origin/HEAD` is a POINTER at the
    // second; a walk that judged all three would report one branch as three.
    const reported = run.stdout
      .split("\n")
      .filter((line) => line.startsWith("  branch "));
    assert.equal(reported.length, 2, run.stdout);
    assert.equal(
      run.stdout.includes("refs/remotes/origin/HEAD"),
      false,
      "the symbolic ref was judged as a branch of its own",
    );
  },
);

test(
  "next records a doubt when origin/HEAD and a conventional default branch disagree",
  (t) => {
    const parent = makeTempDir(t);
    const upstream = makeRemoteOnlyUpstream(parent);
    const fleet = makeFleet(t);
    const askew = join(fleet.projects, "askew");
    git(parent, ["clone", "--quiet", upstream, askew]);

    // GREEN CONTROL, in the same body: before origin/HEAD is moved, the same
    // clone resolves its base with no doubt at all.
    const before = nextModule.baseRefOf(askew);
    assert.equal(before.ok, true);
    assert.equal(
      (before as { doubt?: string }).doubt,
      undefined,
      "an untouched clone already carried a doubt, so the red below is not attributable to the move",
    );

    git(askew, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/feat-open"]);

    // THE DANGEROUS STATE IS MEASURED, not assumed: the mis-pointed base is
    // one the branch walk CANNOT rescue, because the real default is an
    // ANCESTOR of it and therefore reads as delivered. This assertion is why
    // the fix is a recorded doubt and not a cleverer walk.
    const ancestor = spawnSync(
      "git",
      [
        "-C",
        askew,
        "merge-base",
        "--is-ancestor",
        "refs/remotes/origin/main",
        "refs/remotes/origin/feat-open",
      ],
      { encoding: "utf8" },
    );
    assert.equal(
      ancestor.status,
      0,
      "the real default is not an ancestor of the mis-pointed base, so the walk would have rescued this and the doubt is not the thing under test",
    );

    const run = runNext(fleet);
    assert.equal(run.status, nextModule.EXIT_WORK_REMAINS, run.stdout + run.stderr);
    assert.match(run.stdout, /^unknown: 1$/m, run.stdout);
    assert.match(
      run.stdout,
      /project askew: origin\/HEAD points at refs\/remotes\/origin\/feat-open while refs\/remotes\/origin\/main also exists/,
      run.stdout,
    );
    assert.match(
      run.stdout,
      /project askew: branches judged against refs\/remotes\/origin\/feat-open/,
      run.stdout,
    );
  },
);

/* ------------------------------------------------------------------ */
/* Criterion 5: the plugin's pull-request capability                    */
/* ------------------------------------------------------------------ */

/**
 * Every credential name, removed from this process for the call and restored.
 *
 * `async` AND `await body()`, WHICH IS THE WHOLE POINT AND WAS MEASURED RATHER
 * THAN ANTICIPATED. The synchronous form, `try { return body(); } finally
 * { restore(); }`, restores at the instant the body returns its PROMISE, which
 * is its first suspension point and not its end. The credential-boundary test
 * below then ran half its arms with the ambient environment back in place, and
 * passed anyway, because `claudeCodeAdapter.launch` happens to spawn
 * synchronously before it ever suspends. A guard that holds by the callee's
 * internal scheduling rather than by its own construction is green and
 * worthless, and this one was.
 */
async function withoutCredentials(body: () => Promise<void> | void): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const name of prModule.PR_CREDENTIAL_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  try {
    await body();
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
  async () => {
    await withoutCredentials(() => {
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

      // THE ASSERTION THAT SETTLES IT IS MADE FROM INSIDE THE CHILD, and it is
      // FIRST on purpose. An in-process read of `process.env` here would redden
      // against the same mutants, and it would redden BEFORE the child ever
      // ran, leaving the child-written file decorative. M4-P8 measured the
      // general form: a witness that reads the object the kernel returned is
      // reading the wrong side of the handover. The two arms are the two sides
      // a credential can cross on: `inherited` is a launch with no env option
      // at all, which is Node's full-inheritance form and the one a published
      // credential would ride; `scrubbed` is the environment the kernel's own
      // buildChildEnv returns. The in-process assertion follows, as a second
      // and weaker statement of the same property.
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

      for (const name of prModule.PR_CREDENTIAL_NAMES) {
        assert.equal(
          process.env[name],
          undefined,
          `${name} was published into the kernel process by the plugin`,
        );
      }
    });
  },
);

test(
  "pr merge refuses without a --number, before any credential is read and with no child built",
  () => {
    const spawned: string[][] = [];
    const stderr: string[] = [];
    const stdout: string[] = [];
    const io = {
      stderr: (line: string) => stderr.push(line),
      stdout: (line: string) => stdout.push(line),
    };
    const exec = (program: string, args: string[]): { status: number } => {
      spawned.push([program, ...args]);
      return { status: 0 };
    };

    // THE DANGEROUS STATE, AND IT IS THE ARGV THAT WAS BUILT, NOT THE ABSENCE
    // OF A CHECK. Before this refusal, `pr merge --repo owner/name` built
    // `gh pr merge "" --repo owner/name --squash`, spawned it and returned 0:
    // the least reversible operation in this package, run with an unvalidated
    // required argument. What an empty pull-request selector selects is not
    // established anywhere in this repository, which is the reason to refuse
    // rather than a reason to wait.
    const refused = prModule.runPr(["merge", "--repo", "owner/name"], {
      env: { GH_TOKEN: "a-credential-that-must-not-matter-here" },
      io,
      exec,
    });
    assert.notEqual(refused, 0, "pr merge with no --number returned success");
    assert.equal(refused, prModule.PR_EX_NO_TARGET);
    assert.notEqual(prModule.PR_EX_NO_TARGET, prModule.PR_EX_NO_CREDENTIAL);
    assert.deepEqual(spawned, [], "a child was built for a merge with no pull request named");
    assert.deepEqual(stdout, [], "the refusal wrote to stdout");
    assert.equal(stderr.length, 1, `the refusal wrote ${String(stderr.length)} lines`);
    assert.match(stderr[0] ?? "", /--number is required for merge/);

    // AND THE REFUSAL DOES NOT DEPEND ON THE CREDENTIAL, which is what "before
    // the credential is read" means as an assertion rather than as a comment:
    // the same argv with NO credential at all gets the same code and the same
    // line, so a caller who forgot the flag is told about the flag.
    stderr.length = 0;
    const refusedWithout = prModule.runPr(["merge", "--repo", "owner/name"], {
      env: {},
      io,
      exec,
    });
    assert.equal(refusedWithout, prModule.PR_EX_NO_TARGET);
    assert.deepEqual(spawned, []);
    assert.match(stderr[0] ?? "", /--number is required for merge/);

    // GREEN CONTROL: the same call WITH a target builds the argv and spawns.
    stderr.length = 0;
    const accepted = prModule.runPr(["merge", "--repo", "owner/name", "--number", "7"], {
      env: { GH_TOKEN: "t" },
      io,
      exec,
    });
    assert.equal(accepted, 0, stderr.join(" "));
    assert.deepEqual(spawned, [["gh", "pr", "merge", "7", "--repo", "owner/name", "--squash"]]);

    // NO BUILDER MAY EMIT AN EMPTY POSITIONAL AT ALL. This is the mechanism
    // rather than the one instance: both builders used to fall back to `""`
    // for a flag the caller had not supplied.
    for (const argv of [
      prModule.openArgv({ repo: "owner/name" }),
      prModule.openArgv({ repo: "owner/name", head: "h", base: "b", title: "t" }),
      prModule.mergeArgv({ repo: "owner/name", number: "7" }),
    ]) {
      assert.equal(
        argv.includes(""),
        false,
        `a built argv carries an empty element: ${JSON.stringify(argv)}`,
      );
    }
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

/**
 * WHAT THIS CHECK LOOKS FOR, AND WHY IT IS NOT JUST THE COMMAND NAMES.
 *
 * As first written it matched three literals: the two command NAMES and the
 * relative module path. A kernel module that did
 * `import { runPr } from "@tiphys/claude-code-plugin"` and called
 * `runPr(["merge", ...])` contains none of the three, so the class the
 * criterion is about, A KERNEL CODE PATH INVOKING THE PLUGIN CAPABILITY, had
 * no member the check could see. The entry-point IDENTIFIER and an IMPORT of
 * the package by name are added for that, and the import is matched as a
 * STATEMENT rather than as a substring: `src/commands/init.ts:22` names the
 * package in prose, correctly, and a bare substring would redden on it.
 */
const PLUGIN_INVOCATION_TOKENS = ["plugin/src/pr", "runPr"];
const PLUGIN_IMPORT_PATTERNS = [
  /from\s*["']@tiphys\/claude-code-plugin["']/,
  /import\s*\(\s*["']@tiphys\/claude-code-plugin["']/,
];

test("no kernel code path under src or bin names either plugin pull-request command", () => {
  const tokens = [
    prModule.PR_OPEN_COMMAND,
    prModule.PR_MERGE_COMMAND,
    ...PLUGIN_INVOCATION_TOKENS,
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
    for (const pattern of PLUGIN_IMPORT_PATTERNS) {
      if (pattern.test(body)) {
        hits.push(`${file}: ${pattern.source}`);
      }
    }
  }
  assert.deepEqual(hits, [], "a kernel source names the plugin's pull-request capability");

  // THE CHECK MUST BE ABLE TO SEE THE DEFECT IT IS ABOUT. A grep that no real
  // invocation would trip is a guard that cannot go red, so the shape of a
  // real one is run past the same matcher here rather than only through the
  // witness's mutants.
  const realInvocation =
    'import { runPr } from "@tiphys/claude-code-plugin";\n' +
    "export function merge(): number {\n" +
    '  return runPr(["merge", "--repo", "o/n", "--number", "1"], options);\n' +
    "}\n";
  const caught =
    tokens.some((token) => realInvocation.includes(token)) ||
    PLUGIN_IMPORT_PATTERNS.some((pattern) => pattern.test(realInvocation));
  assert.equal(caught, true, "the criterion-6 matcher does not detect a real invocation");

  // AND IT MUST NOT REDDEN ON A MENTION. src/commands/init.ts names the
  // package in a comment and that is not an invocation.
  const mention = ' * the `@tiphys` scope, `@tiphys/kernel` and `@tiphys/claude-code-plugin`).\n';
  assert.equal(
    PLUGIN_IMPORT_PATTERNS.some((pattern) => pattern.test(mention)),
    false,
    "the import matcher reddens on a prose mention of the package",
  );
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
