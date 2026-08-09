#!/usr/bin/env node
/**
 * The orchestrator's stop condition, computed rather than judged.
 *
 * WHY THIS EXISTS. Twice now the orchestrator has stopped while work remained,
 * and both times the stop was a JUDGMENT ("nothing seems to be in flight",
 * "I have reported, so I am done") dressed as a status report. The answer this
 * project keeps arriving at is the same: a rule that depends on remembering
 * does not survive a busy session, and the fix is a mechanism (T-005, T-006,
 * T-008).
 *
 * So this script answers three questions from FILES AND GIT, never from
 * conversation memory:
 *
 *   1. Is the milestone delivered?   (all ten work histories on origin/main)
 *   2. What is in flight LOCALLY?    (phase branches ahead of main, worktree
 *                                     freshness by mtime, per T-008)
 *   3. What is the single next action?
 *
 * It exits 0 when there is nothing left to do and NONZERO whenever work
 * remains. That inversion is deliberate: a nonzero exit is a fact the
 * orchestrator cannot report its way around.
 *
 * WHAT IT CANNOT SEE, stated here rather than left to be discovered. This
 * script has no network. Open pull requests, CI conclusions and post-merge
 * push runs are invisible to it, and they are exactly where T-009's "green is
 * scoped to the run that produced it" bites. It therefore PRINTS the checks
 * that must be made through the GitHub tools and refuses to call anything
 * settled on their behalf.
 *
 * Usage: node .claude/orchestrator-next.mjs [--milestone m3]
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MILESTONE = (() => {
  const i = process.argv.indexOf("--milestone");
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : "m3";
})();

const PHASE_COUNT = 10;
const STALE_SECONDS = 420;
const SCRATCH =
  "/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function onMain(path) {
  try {
    execFileSync("git", ["cat-file", "-e", `origin/main:${path}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Newest mtime under a directory, ignoring node_modules and .git. */
function newestMtime(dir) {
  let newest = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try {
          const m = statSync(p).mtimeMs;
          if (m > newest) newest = m;
        } catch {
          /* raced with a delete; not a liveness signal either way */
        }
      }
    }
  };
  walk(dir);
  return newest;
}

git(["fetch", "-q", "origin", "main"]);

const phases = [];
for (let n = 1; n <= PHASE_COUNT; n += 1) {
  const id = `${MILESTONE}-p${n}`;
  const merged = onMain(`delivery/work-history/${id}.md`);
  const branch = `claude/${id}-`;
  const remoteBranch = git(["branch", "-r", "--list", `origin/${branch}*`])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  let ahead = 0;
  if (remoteBranch !== undefined) {
    const counts = git(["rev-list", "--left-right", "--count", `origin/main...${remoteBranch}`]);
    ahead = Number.parseInt(counts.split(/\s+/)[1] ?? "0", 10) || 0;
  }
  const wt = join(SCRATCH, `wt-${MILESTONE}p${n}`);
  let worktree = null;
  if (existsSync(wt)) {
    const newest = newestMtime(wt);
    const age = newest === 0 ? -1 : Math.round((Date.now() - newest) / 1000);
    worktree = { path: wt, ageSeconds: age, stale: age < 0 || age >= STALE_SECONDS };
  }
  phases.push({ id, merged, remoteBranch, ahead, worktree });
}

const done = phases.filter((p) => p.merged);
const pushedNotMerged = phases.filter((p) => !p.merged && p.ahead > 0);
const notStarted = phases.filter((p) => !p.merged && p.ahead === 0);

const lines = [];
lines.push(`milestone ${MILESTONE.toUpperCase()}: ${done.length}/${PHASE_COUNT} phases merged to main`);
lines.push("");
for (const p of phases) {
  const state = p.merged
    ? "MERGED"
    : p.ahead > 0
      ? `pushed, ${p.ahead} commit(s) ahead, NOT merged`
      : "not started";
  const wt =
    p.worktree === null
      ? ""
      : `  [worktree ${p.worktree.stale ? "STALE" : "fresh"} ${p.worktree.ageSeconds}s]`;
  lines.push(`  ${p.id.padEnd(8)} ${state}${wt}`);
}
lines.push("");

/* The next action, chosen by rule and not by judgment. Order matters: an
 * unmerged pushed branch always outranks starting new work, because merge
 * order is dependency order (binding convention 5). */
let next;
let exitCode;
if (done.length === PHASE_COUNT) {
  const exitEvidence = onMain(`delivery/evidence/${MILESTONE}-exit-test`);
  if (exitEvidence) {
    next = `NOTHING LEFT. All ${PHASE_COUNT} phases merged and exit-test evidence is on main.`;
    exitCode = 0;
  } else {
    next = `RUN THE ${MILESTONE.toUpperCase()} EXIT TEST. All phases merged; exit-test evidence is NOT on main.`;
    exitCode = 3;
  }
} else if (pushedNotMerged.length > 0) {
  const p = pushedNotMerged[0];
  next =
    `DRIVE ${p.id.toUpperCase()} TO MERGE. Its branch ${p.remoteBranch} is ${p.ahead} commit(s) ` +
    `ahead of main and unmerged. Next step is whichever of these is not yet done: ` +
    `scope green, dual cross-model clean-room review, arbitration, fix round, ` +
    `delta verification, merge, post-merge push run verified.`;
  exitCode = 2;
} else {
  const p = notStarted[0];
  next = `DISPATCH ${p.id.toUpperCase()}. No branch exists for it and it is the lowest unmerged phase.`;
  exitCode = 2;
}

lines.push(`NEXT ACTION: ${next}`);
lines.push("");
lines.push("THIS SCRIPT CANNOT SEE THE NETWORK. Before acting, check via the GitHub tools:");
lines.push("  - open pull requests, and the CI conclusion on each one's CURRENT head sha");
lines.push("  - for anything merged since the last check, the post-merge `push` run on the");
lines.push("    new main head (T-009: a PR-arm green is not evidence for the push arm)");
lines.push("  - use the JOB-STEPS endpoint, not check-runs, which has served stale state here");
lines.push("");
lines.push("ALSO CHECK, because this script cannot: ListAgents for live subagents, and");
lines.push("CronList / list_triggers for whether the kick that woke you still exists.");
lines.push("");
lines.push(`exit ${exitCode} (0 means nothing left to do; nonzero means work remains)`);

process.stdout.write(`${lines.join("\n")}\n`);
process.exit(exitCode);
