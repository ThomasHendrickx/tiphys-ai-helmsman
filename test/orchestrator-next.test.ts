/**
 * THE ORCHESTRATOR'S NEXT ACTION IS DERIVED FROM THE PLAN (value-delivery plan
 * M5-P4, criterion p4-next-action).
 *
 * .claude/orchestrator-next.mjs is the stop condition that cannot be reported
 * around: it exits nonzero while work remains and prints ONE next action. At
 * M5 it had two defects. `--milestone m5` looked for a markdown plan M5 does
 * not have and exited 7 on every run, and a finished M4 named the final
 * approval sweep that pull request #202 had already closed.
 *
 * WHAT THESE TESTS REFUSE, stated so a reader can judge the witness: a script
 * that answered from a CONSTANT. Every fixture below uses milestone M7, whose
 * phases exist nowhere but in the fixture's own plan, and the plan lists
 * M7-P2 BEFORE M7-P1, so the expected answer is neither the lowest phase
 * number nor any id this repository has ever had. The answer then MOVES as
 * the fixture's git state moves (a merge, a push), which a hard-coded phase
 * cannot follow.
 *
 * The script is run for real, as a subprocess, against a scratch clone whose
 * `origin` is a local bare repository, because every fact it reads comes from
 * `origin/main` and remote refs. CLAUDE.md warning 5: scratch commits carry
 * command-scoped identity. Warning 9: every path handed to git is absolute.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(repoRoot, ".claude", "orchestrator-next.mjs");

const GIT_ENV = {
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...GIT_ENV } });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed in ${cwd}:\n${result.stderr}`);
  return result.stdout.trim();
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** The fixture plan: M7-P2 is listed FIRST, so plan order is not numeric order. */
const FIXTURE_PLAN = [
  "kind: plan",
  "status: approved",
  "phases:",
  "  - id: M7-P2",
  "    branch: claude/m7-p2-second",
  "  - id: M7-P1",
  "    branch: claude/m7-p1-first",
  "  - id: M7-P3",
  "    branch: claude/m7-p3-third",
  "",
].join("\n");

/** A bare origin and a clone whose main carries the plan and an M4 that is finished. */
function stageFixture(): { dir: string; work: string } {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-orchestrator-next-"));
  const origin = join(dir, "origin.git");
  const work = join(dir, "work");
  mkdirSync(origin);
  mkdirSync(work);
  git(origin, ["init", "-q", "--bare", "-b", "main"]);
  git(work, ["init", "-q", "-b", "main"]);
  git(work, ["remote", "add", "origin", origin]);
  write(work, "delivery/plan/value-delivery-plan.yaml", FIXTURE_PLAN);
  /* A finished M4 in the markdown-plan dialect the script already reads:
     one planned phase, and its work history on main. */
  write(work, "delivery/plan/kernel-plan-m4.md", "# M4\n\n### M4-P1: the only phase\n");
  write(work, "delivery/work-history/m4-p1.md", "# M4-P1\n");
  git(work, ["add", "-A"]);
  git(work, ["commit", "-q", "-m", "fixture main"]);
  git(work, ["push", "-q", "origin", "main"]);
  return { dir, work };
}

/** Put one commit on a new phase branch and push it. */
function pushPhaseBranch(work: string, branch: string): void {
  git(work, ["checkout", "-q", "-b", branch, "main"]);
  write(work, `work/${branch.replace(/\//g, "-")}.md`, `${branch}\n`);
  git(work, ["add", "-A"]);
  git(work, ["commit", "-q", "-m", `work on ${branch}`]);
  git(work, ["push", "-q", "-u", "origin", branch]);
  git(work, ["checkout", "-q", "main"]);
}

/** Merge a pushed branch into main the way a pull request merge records it, and push main. */
function mergeAsPullRequest(work: string, branch: string, number: number): void {
  git(work, ["merge", "-q", "--no-ff", "-m", `Merge pull request #${String(number)} from fixture-owner/${branch}`, branch]);
  git(work, ["push", "-q", "origin", "main"]);
}

function runScript(work: string, milestone: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [scriptPath, "--milestone", milestone], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The one NEXT ACTION line, asserted to be exactly one. */
function nextAction(stdout: string): string {
  const actions = stdout.split("\n").filter((line) => line.startsWith("NEXT ACTION:"));
  assert.equal(actions.length, 1, `expected exactly one NEXT ACTION line, found ${String(actions.length)}:\n${stdout}`);
  return actions[0] as string;
}

test("orchestrator-next derives its next action from the value-delivery plan's first unmerged phase in plan order, and the answer follows merges and pushes", () => {
  const { dir, work } = stageFixture();
  try {
    /* 1. Nothing merged: the FIRST phase in plan order, which is M7-P2 and
          not the lowest number. */
    const fresh = runScript(work, "m7");
    assert.equal(fresh.status, 2, fresh.stdout + fresh.stderr);
    const freshAction = nextAction(fresh.stdout);
    assert.match(freshAction, /^NEXT ACTION: DISPATCH M7-P2\. /);
    assert.match(freshAction, /delivery\/plan\/value-delivery-plan\.yaml/);
    assert.match(freshAction, /claude\/m7-p2-second/);

    /* 2. M7-P2 merged by pull request, with NO work history on main: the
          merge commit naming the plan's branch is what makes it merged. A
          later phase pushed ahead of main does not jump the plan order. */
    pushPhaseBranch(work, "claude/m7-p2-second");
    mergeAsPullRequest(work, "claude/m7-p2-second", 1);
    pushPhaseBranch(work, "claude/m7-p3-third");
    const afterMerge = runScript(work, "m7");
    assert.equal(afterMerge.status, 2, afterMerge.stdout + afterMerge.stderr);
    assert.match(nextAction(afterMerge.stdout), /^NEXT ACTION: DISPATCH M7-P1\. /);
    assert.match(afterMerge.stdout, /m7-p2 +MERGED/);

    /* 3. M7-P1's plan-named branch pushed ahead of main: DRIVE, not DISPATCH. */
    pushPhaseBranch(work, "claude/m7-p1-first");
    const afterPush = runScript(work, "m7");
    assert.equal(afterPush.status, 2, afterPush.stdout + afterPush.stderr);
    assert.match(
      nextAction(afterPush.stdout),
      /^NEXT ACTION: DRIVE M7-P1 TO MERGE\. .*origin\/claude\/m7-p1-first is 1 commit\(s\) ahead of main/,
    );

    for (const run of [fresh, afterMerge, afterPush]) {
      assert.doesNotMatch(run.stdout + run.stderr, /DR-0047/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a finished M4 hands over to the value-delivery plan's next incomplete phase and never names the closed DR-0047 sweep", () => {
  const { dir, work } = stageFixture();
  try {
    const closed = runScript(work, "m4");
    assert.equal(closed.status, 2, closed.stdout + closed.stderr);
    assert.match(closed.stdout, /milestone M4: 1\/1 phases merged to main/);
    const action = nextAction(closed.stdout);
    assert.match(action, /^NEXT ACTION: M4 IS CLOSED, all 1 phases merged\. DISPATCH M7-P2\. /);
    assert.doesNotMatch(closed.stdout + closed.stderr, /DR-0047|APPROVAL SWEEP/i);

    /* The handover follows the successor plan's state too. */
    pushPhaseBranch(work, "claude/m7-p2-second");
    mergeAsPullRequest(work, "claude/m7-p2-second", 1);
    assert.match(nextAction(runScript(work, "m4").stdout), /M4 IS CLOSED, .*DISPATCH M7-P1\. /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a started milestone named by neither a markdown plan nor the value-delivery plan still exits 7 naming both sources rather than reporting nothing left", () => {
  const { dir, work } = stageFixture();
  try {
    /* A STARTED phase (its declaration is on main) so the derivation is not
       empty, which would exit 4 before the plan read is ever consulted. */
    write(work, "delivery/plan/phase-declarations/m8-p1.json", "{}\n");
    git(work, ["add", "-A"]);
    git(work, ["commit", "-q", "-m", "declare m8-p1"]);
    git(work, ["push", "-q", "origin", "main"]);
    const unknown = runScript(work, "m8");
    assert.equal(unknown.status, 7, unknown.stdout + unknown.stderr);
    assert.match(unknown.stderr, /kernel-plan-m8\.md could not be read/);
    assert.match(unknown.stderr, /value-delivery-plan\.yaml names no M8 phase/);
    assert.doesNotMatch(unknown.stdout, /NEXT ACTION/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
