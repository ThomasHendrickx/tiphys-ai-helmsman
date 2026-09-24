/*
 * Kernel 0.2.1 fix round 3c: a removed-.git arm must be NOT A REPOSITORY
 * afterwards, even while another process is still unlinking inside the old
 * `.git`.
 *
 * CI run 35956468096 (d02c0c1) printed, for the removed-.git arm of
 * test/single-family-exception.test.ts, "assurance-modes.yaml does not exist
 * in commit f3a032c4..., resolved from HEAD": HEAD resolved in a directory
 * whose `.git` the test had just removed, and one of that commit's blobs was
 * missing. Measured in this round:
 *
 *   - git 2.55.0 detaches a commit's auto maintenance, and the detached child
 *     unlinks `.git/objects/maintenance.lock` after `git commit` returned
 *     (witness/captures/kernel-0-2-1-detached-maintenance.txt: the commit
 *     exits at .552018, the child unlinks at .554315). git 2.43.0 runs it in
 *     the foreground.
 *   - node v26.6.0's recursive rmSync returns WITHOUT ERROR and leaves part of
 *     the tree when an entry it listed is unlinked by another process first
 *     (10 of 60 trials on a plain tree; node v22.22.2: 0 of 60).
 *
 * The real race is microseconds wide and was not hit locally in 2,900
 * unforced trials (git 2.55.0, node v26.6.0), so this test FORCES the shape: many lock-like entries inside
 * `.git/objects`, unlinked by a concurrent process while the removal runs.
 * The control arm shows the dangerous state is real on this interpreter (a
 * bare rmSync leaves a `.git` behind); the arm under test shows that
 * test/support/remove-git-directory.ts leaves none, and no HEAD resolves.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { removeGitDirectory } from "./support/remove-git-directory.ts";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
/** Real strace output of a git 2.55.0 commit; see its header for the selection. */
const CAPTURE = join(repoRoot, "witness", "captures", "kernel-0-2-1-detached-maintenance.txt");

const TRIALS = 24;
const LOCKS = 400;

function gitEnv(ceiling: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.startsWith("GIT_")) {
      env[name] = value;
    }
  }
  return {
    ...env,
    GIT_AUTHOR_NAME: "tiphys test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "tiphys test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
    GIT_CEILING_DIRECTORIES: ceiling,
  };
}

interface Outcome {
  left: number;
  headResolved: number;
}

async function trialRemovals(root: string, remove: (dir: string) => void): Promise<Outcome> {
  const env = gitEnv(root);
  const git = (cwd: string, args: string[]) => spawnSync("git", args, { cwd, env, encoding: "utf8" });
  const outcome: Outcome = { left: 0, headResolved: 0 };
  for (let trial = 0; trial < TRIALS; trial++) {
    const dir = mkdtempSync(join(root, "staged-"));
    assert.equal(git(dir, ["init", "-q", "."]).status, 0);
    writeFileSync(join(dir, "charter.yaml"), `delivery-mode: full\n# ${String(trial)}\n`);
    writeFileSync(join(dir, "assurance-modes.yaml"), `modes: ${String(trial)}\n`);
    assert.equal(git(dir, ["add", "-A"]).status, 0);
    const commit = git(dir, ["commit", "-q", "-m", "stage"]);
    assert.equal(commit.status, 0, commit.stderr);
    for (let lock = 0; lock < LOCKS; lock++) {
      writeFileSync(join(dir, ".git", "objects", `maintenance-${String(lock)}.lock`), "");
    }
    const unlinker = spawn("bash", ["-c", 'rm -f "$1"/maintenance-*.lock', "unlinker", join(dir, ".git", "objects")], {
      stdio: "ignore",
    });
    /* Listen BEFORE yielding: an unlinker that exits during the wait below
       would otherwise emit "exit" to nobody and this await would never end. */
    const unlinkerDone = new Promise((resolve, reject) => {
      unlinker.on("exit", resolve);
      unlinker.on("error", reject);
    });
    await new Promise((resolve) => setTimeout(resolve, trial % 5));
    remove(dir);
    if (existsSync(join(dir, ".git"))) {
      outcome.left += 1;
    }
    if (git(dir, ["rev-parse", "HEAD^{commit}"]).status === 0) {
      outcome.headResolved += 1;
    }
    await unlinkerDone;
  }
  return outcome;
}

test("a .git removed while another process unlinks inside it leaves no repository behind, where a recursive rmSync in place can leave one", async (t) => {
  /* 1. THE WRITER IS REAL: in the captured run, a process other than the
     commit unlinks .git/objects/maintenance.lock AFTER the commit exited. This
     reads the record, not the live git, so it asserts nothing about the git
     this suite happens to run under (git 2.43.0 does not detach). */
  const lines = readFileSync(CAPTURE, "utf8").split("\n").filter((line) => !line.startsWith("#") && line !== "");
  const commitPid = /^(\d+) \S+ execve\("[^"]*", \[[^\]]*"commit"/.exec(lines[0] ?? "")?.[1];
  assert.ok(commitPid !== undefined, `the capture's first line is not the commit's execve: ${lines[0] ?? ""}`);
  const commitExit = lines.find((line) => line.startsWith(`${commitPid} `) && line.includes("exit_group("));
  const lateUnlink = lines.find((line) => /unlink\("<repo>\/\.git\/objects\/maintenance\.lock"\) = 0/.test(line));
  assert.ok(commitExit !== undefined && lateUnlink !== undefined, lines.join("\n"));
  assert.notEqual(lateUnlink.split(" ")[0], commitPid, "the unlink must come from another process");
  assert.ok((lateUnlink.split(" ")[1] ?? "") > (commitExit.split(" ")[1] ?? ""), "the unlink must come after the commit exited");

  const root = realpathSync(mkdtempSync(join(tmpdir(), "tiphys-remove-git-")));
  try {
    /* CONTROL: the dangerous state is real on this interpreter. */
    const bare = await trialRemovals(root, (dir) => {
      rmSync(join(dir, ".git"), { recursive: true, force: true });
    });
    const major = Number(process.versions.node.split(".")[0]);
    if (major >= 26) {
      assert.ok(
        bare.left > 0,
        `a recursive rmSync left no .git in ${String(TRIALS)} forced trials on node ${process.version}; the control arm no longer shows the danger`,
      );
    } else {
      t.diagnostic(
        `control arm not asserted on node ${process.version} (below the declared floor): a recursive rmSync left ${String(bare.left)} .git of ${String(TRIALS)}`,
      );
    }

    /* UNDER TEST: the helper every removed-.git arm uses. */
    const graveyard = mkdtempSync(join(root, "graveyard-"));
    const helped = await trialRemovals(root, (dir) => {
      removeGitDirectory(dir, graveyard);
    });
    t.diagnostic(`in ${String(TRIALS)} forced trials: recursive rmSync ${JSON.stringify(bare)}, removeGitDirectory ${JSON.stringify(helped)}`);
    assert.deepEqual(helped, { left: 0, headResolved: 0 }, `control arm for comparison: ${JSON.stringify(bare)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
