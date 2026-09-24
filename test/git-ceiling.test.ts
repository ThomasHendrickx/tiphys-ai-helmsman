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
 * The same files also remove inherited GIT_DIR, GIT_WORK_TREE,
 * GIT_COMMON_DIR, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY and
 * GIT_ALTERNATE_OBJECT_DIRECTORIES (the orchestrator's decision on the fix
 * round's open question 13), because the ceiling does not stop GIT_DIR.
 *
 * This file is the red witness. It makes a repository reachable by three
 * routes (a directory holding `.git` above TMPDIR, a directory that IS a git
 * directory above TMPDIR, and an inherited GIT_DIR), and under each runs one
 * victim test from each STRUCTURALLY DIFFERENT shape of the class in a nested
 * `node --test`:
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
  const source = stageCharterOnlyRepository("tiphys-git-ceiling-gitdir-source-");
  try {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "tiphys-git-ceiling-gitdir-")));
    cpSync(join(source, ".git"), root, { recursive: true });
    return root;
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
}

/**
 * A repository whose HEAD tree holds `charter.yaml` at its root and no
 * `assurance-modes.yaml`: the tree CI's message describes, where the charter
 * probe found a blob and the modes probe did not.
 */
function stageCharterOnlyRepository(prefix: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  mustGit(root, ["init", "-q"]);
  writeFileSync(join(root, "charter.yaml"), "delivery-mode: full\n");
  mustGit(root, ["add", "charter.yaml"]);
  mustGit(root, ["commit", "-q", "-m", "charter only"]);
  return root;
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
 * NODE_TEST_* name and no GIT_* name except those in `inherited`, so the only
 * ceiling it can have, and the only strip, are the ones the victim file sets
 * for itself.
 */
function runVictim(ancestor: string, file: string, title: string, inherited: Record<string, string> = {}) {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(gitFreeEnv())) {
    if (name !== "NODE_OPTIONS" && !name.startsWith("NODE_TEST")) {
      env[name] = value;
    }
  }
  const scratchRoot = join(ancestor, "tmp");
  mkdirSync(scratchRoot, { recursive: true });
  env["TMPDIR"] = scratchRoot;
  Object.assign(env, inherited);
  const traceDir = mkdtempSync(join(tmpdir(), "tiphys-git-ceiling-trace-log-"));
  const traceFile = join(traceDir, "trace.log");
  env["GIT_TRACE"] = traceFile;
  env["GIT_TRACE_SETUP"] = traceFile;
  const run = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", "--test-name-pattern", `^${escapeRegExp(title)}$`, join(repoRoot, "test", file)],
    { cwd: repoRoot, encoding: "utf8", env },
  );
  let trace = "";
  try {
    trace = readFileSync(traceFile, "utf8");
  } catch {
    trace = "(no trace written)";
  }
  rmSync(traceDir, { recursive: true, force: true });
  return { status: run.status, output: `${run.stdout ?? ""}${run.stderr ?? ""}`, trace };
}

/**
 * DIAGNOSTIC, printed on every run: what git does, from a removed-.git
 * directory staged the way the victims stage one, under the ceiling the
 * victims set. Kept so a CI-only difference is visible in the job log.
 */
function traceNoRepository(root: string): string[] {
  const scratchRoot = join(root, "tmp");
  mkdirSync(scratchRoot, { recursive: true });
  const dir = mkdtempSync(join(scratchRoot, "tiphys-git-ceiling-trace-"));
  const lines: string[] = [];
  try {
    mustGit(dir, ["init", "-q", "."]);
    writeFileSync(join(dir, "charter.yaml"), "delivery-mode: full\n");
    writeFileSync(join(dir, "assurance-modes.yaml"), "modes: {}\n");
    mustGit(dir, ["add", "-A"]);
    mustGit(dir, ["commit", "-q", "-m", "trace"]);
    rmSync(join(dir, ".git"), { recursive: true, force: true });
    const ceiling = [realpathSync(scratchRoot), scratchRoot].join(":");
    lines.push(`uid=${String(process.getuid?.())} ${git(dir, ["--version"]).stdout.trim()} ceiling=${ceiling}`);
    lines.push(`outer GIT_* names: ${Object.keys(process.env).filter((n) => n.startsWith("GIT_")).join(",") || "none"}`);
    for (const withCeiling of [true, false]) {
      for (const args of [
        ["rev-parse", "HEAD^{commit}"],
        ["rev-parse", "--git-dir", "--show-toplevel", "--show-prefix"],
        ["cat-file", "-t", "HEAD:./charter.yaml"],
        ["config", "--list", "--show-origin", "--show-scope"],
      ]) {
        const extra: Record<string, string> = { GIT_TRACE_SETUP: "1" };
        if (withCeiling) {
          extra["GIT_CEILING_DIRECTORIES"] = ceiling;
        }
        const run = git(dir, args, extra);
        lines.push(
          `ceiling=${String(withCeiling)} git ${args.join(" ")} -> ${String(run.status)}: ${`${run.stdout}${run.stderr}`.replace(/\n/g, " | ")}`,
        );
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return lines;
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

  /* 2. THREE routes to a repository the test did not stage. Two are the
     shapes discovery accepts: a directory holding `.git`, and a directory that
     IS a git directory (HEAD, objects and refs laid straight into it). The
     third is the ENVIRONMENT: an inherited GIT_DIR naming a repository whose
     HEAD tree holds only `charter.yaml`, which no ceiling stops and which is
     the one route measured to reproduce CI's exact message. For each, the
     dangerous state is shown to be real before the victims run: HEAD resolves
     from the nested scratch root under that route. */
  const charterOnly = stageCharterOnlyRepository("tiphys-git-ceiling-charter-only-");
  const ancestors: Array<{ kind: string; root: string; inherited: Record<string, string> }> = [
    { kind: "a repository with a .git directory", root: stageAncestor("tiphys-git-ceiling-ancestor-"), inherited: {} },
    { kind: "a git directory laid into the parent", root: stageGitDirAncestor(), inherited: {} },
    {
      kind: "an inherited GIT_DIR naming a charter-only repository",
      root: realpathSync(mkdtempSync(join(tmpdir(), "tiphys-git-ceiling-plain-"))),
      inherited: { GIT_DIR: join(charterOnly, ".git") },
    },
  ];
  try {
    const modes = git(charterOnly, ["cat-file", "-t", "HEAD:assurance-modes.yaml"]);
    assert.notEqual(modes.status, 0, "the charter-only repository must hold no assurance-modes.yaml");
    for (const ancestor of ancestors) {
      mkdirSync(join(ancestor.root, "tmp"), { recursive: true });
      const head = git(join(ancestor.root, "tmp"), ["rev-parse", "HEAD^{commit}"], ancestor.inherited);
      assert.equal(head.status, 0, `${ancestor.kind}: HEAD must resolve from inside it: ${head.stderr}`);
      assert.match(head.stdout, /^[0-9a-f]{40}\n$/);
      for (const line of traceNoRepository(ancestor.root)) {
        console.log(`# trace [${ancestor.kind}] ${line}`);
      }

      /* 3. Each shape's victim still passes with that repository reachable. */
      for (const victim of VICTIMS) {
        const result = runVictim(ancestor.root, victim.file, victim.title, ancestor.inherited);
        assert.equal(
          result.status,
          0,
          `${victim.shape} (${victim.file}) failed under ${ancestor.kind}:\n${result.output}\n--- git trace ---\n${result.trace}`,
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
    rmSync(charterOnly, { recursive: true, force: true });
  }
});
