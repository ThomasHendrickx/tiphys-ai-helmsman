/*
 * Kernel 0.2.1 fix round 3: a real git repository ABOVE os.tmpdir() must not
 * turn a test's "no repository here" arm into a read of that repository.
 *
 * CI run 35946757118 failed test/single-family-exception.test.ts on its
 * no-git arm: check-dual-review read `HEAD` of a commit that exists in no
 * repository this project owns, so git discovery had climbed out of the
 * staged directory into an ancestor. Measured here: the whole suite with
 * os.tmpdir() inside a real repository failed 64 tests across six files.
 * Each of those files now sets GIT_CEILING_DIRECTORIES to os.tmpdir() for
 * itself and every child it spawns (test/exit-test-local.test.ts also puts it
 * back into the identity-less environment that strips every GIT_* name).
 *
 * This file is the red witness. It stages an ancestor in each of the two
 * shapes discovery accepts (a directory holding `.git`, and a directory that
 * IS a git directory), points TMPDIR inside it, and runs one victim test from
 * each STRUCTURALLY DIFFERENT shape of the class in a nested `node --test`:
 *
 *   - a staged repository whose `.git` is REMOVED (single-family-exception);
 *   - a context that was NEVER a repository (dual-review);
 *   - a context reached through an environment that strips GIT_* names
 *     (exit-test-local).
 *
 * Before trusting the ceiling it compares git's live behavior with a real
 * capture (witness/captures/kernel-0-2-1-git-ceiling.json): without a
 * ceiling discovery finds the ancestor, with the ceiling at the ancestor it
 * finds nothing, and a repository staged BELOW the ceiling is still found.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const CAPTURE = join(repoRoot, "witness", "captures", "kernel-0-2-1-git-ceiling.json");

/** Identity per command, never written to any config (standing warning 5). */
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

/** The inherited environment with no GIT_* name, so no ceiling leaks in. */
function gitFreeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.startsWith("GIT_")) {
      env[name] = value;
    }
  }
  return env;
}

function git(cwd: string, args: string[], extra: Record<string, string> = {}) {
  return spawnSync("git", args, { cwd, encoding: "utf8", env: { ...gitFreeEnv(), ...GIT_IDENTITY, ...extra } });
}

function mustGit(cwd: string, args: string[]): string {
  const run = git(cwd, args);
  assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
  return run.stdout;
}

/** A repository with one commit; the shape CI met above its scratch root. */
function stageAncestor(prefix: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  mustGit(root, ["init", "-q"]);
  writeFileSync(join(root, "ancestor.txt"), "ancestor\n");
  mustGit(root, ["add", "ancestor.txt"]);
  mustGit(root, ["commit", "-q", "-m", "ancestor"]);
  return root;
}

/**
 * A directory that IS a git directory: a real repository's `.git` contents
 * copied into it, with no `.git` entry. Discovery from a plain subdirectory
 * resolves HEAD there (measured, git 2.43.0) while refusing `<rev>:./path`
 * as "relative path syntax can't be used outside working tree".
 */
function stageGitDirAncestor(): string {
  const source = stageAncestor("tiphys-git-ceiling-gitdir-source-");
  try {
    writeFileSync(join(source, "charter.yaml"), "delivery-mode: full\n");
    mustGit(source, ["add", "charter.yaml"]);
    mustGit(source, ["commit", "-q", "-m", "charter only"]);
    const root = realpathSync(mkdtempSync(join(tmpdir(), "tiphys-git-ceiling-gitdir-")));
    cpSync(join(source, ".git"), root, { recursive: true });
    return root;
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
}

interface CeilingProbe {
  name: string;
  cwd: string;
  ceiling: string | null;
  status: number;
  stdout: string;
  stderr: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Run ONE named test of `file` in a nested `node --test` whose os.tmpdir()
 * lies inside `ancestor`. The nested run inherits no NODE_OPTIONS, no
 * NODE_TEST_* name and no GIT_* name, so the only ceiling it can have is the
 * one the victim file sets for itself.
 */
function runVictim(ancestor: string, file: string, title: string) {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(gitFreeEnv())) {
    if (name !== "NODE_OPTIONS" && !name.startsWith("NODE_TEST")) {
      env[name] = value;
    }
  }
  const scratchRoot = join(ancestor, "tmp");
  mkdirSync(scratchRoot, { recursive: true });
  env["TMPDIR"] = scratchRoot;
  const run = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", "--test-name-pattern", `^${escapeRegExp(title)}$`, join(repoRoot, "test", file)],
    { cwd: repoRoot, encoding: "utf8", env },
  );
  return { status: run.status, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

const VICTIMS: Array<{ shape: string; file: string; title: string }> = [
  {
    shape: "removed .git",
    file: "single-family-exception.test.ts",
    title: "a corpus-scoped refusal names the source that corpus was read from, on both arms",
  },
  {
    shape: "never a repository",
    file: "dual-review.test.ts",
    title: "two verdicts sharing a produced-by model family exit nonzero naming the duplicated value",
  },
  {
    shape: "GIT_* stripped from the child environment",
    file: "exit-test-local.test.ts",
    title: "the stub payload refuses a bad mode and a working directory that is not a worktree",
  },
];

test("a real repository above os.tmpdir() leaves the removed-.git, never-a-repository and GIT-stripped no-repository arms green, because git's ceiling stops discovery as the capture records", () => {
  /* 1. git behaves as the capture records, so the ceiling is the right tool. */
  const capture = JSON.parse(readFileSync(CAPTURE, "utf8")) as { probes: CeilingProbe[] };
  assert.equal(capture.probes.length, 3);
  const lab = stageAncestor("tiphys-git-ceiling-lab-");
  try {
    mkdirSync(join(lab, "ctx", "deeper"), { recursive: true });
    const spell = (text: string) => text.split(lab).join("<lab>");
    const live: CeilingProbe[] = [];
    for (const recorded of capture.probes) {
      if (recorded.name === "ceiling-at-the-ancestor-still-finds-a-repository-below-it") {
        mustGit(join(lab, "ctx"), ["init", "-q"]);
      }
      const cwd = recorded.cwd.split("<lab>").join(lab);
      const extra: Record<string, string> =
        recorded.ceiling === null ? {} : { GIT_CEILING_DIRECTORIES: recorded.ceiling.split("<lab>").join(lab) };
      const run = git(cwd, ["rev-parse", "--show-toplevel"], extra);
      live.push({
        name: recorded.name,
        cwd: recorded.cwd,
        ceiling: recorded.ceiling,
        status: run.status ?? -1,
        stdout: spell(run.stdout ?? ""),
        stderr: spell(run.stderr ?? ""),
      });
    }
    assert.deepEqual(live, capture.probes);
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }

  /* 2. TWO ancestor shapes, because discovery accepts two: a directory holding
     `.git`, and a directory that IS a git directory (HEAD, objects and refs
     laid straight into it, here copied from a repository whose only commit
     holds a root `charter.yaml`). For each, the dangerous state is shown to be
     real before the victims run: HEAD resolves from the nested scratch root. */
  const ancestors = [
    { kind: "a repository with a .git directory", root: stageAncestor("tiphys-git-ceiling-ancestor-") },
    { kind: "a git directory laid into the parent", root: stageGitDirAncestor() },
  ];
  try {
    for (const ancestor of ancestors) {
      mkdirSync(join(ancestor.root, "tmp"), { recursive: true });
      const head = git(join(ancestor.root, "tmp"), ["rev-parse", "HEAD^{commit}"]);
      assert.equal(head.status, 0, `${ancestor.kind}: HEAD must resolve from inside it: ${head.stderr}`);
      assert.match(head.stdout, /^[0-9a-f]{40}\n$/);

      /* 3. Each shape's victim still passes with that repository above it. */
      for (const victim of VICTIMS) {
        const result = runVictim(ancestor.root, victim.file, victim.title);
        assert.equal(
          result.status,
          0,
          `${victim.shape} (${victim.file}) failed under ${ancestor.kind}:\n${result.output}`,
        );
        assert.match(result.output, /^# tests 1$/m, `${victim.shape}: the pattern must select exactly one test`);
        assert.match(result.output, /^# pass 1$/m);
        assert.match(result.output, /^# fail 0$/m);
        assert.match(result.output, /^# skipped 0$/m);
      }
    }
  } finally {
    for (const ancestor of ancestors) {
      rmSync(ancestor.root, { recursive: true, force: true });
    }
  }
});
