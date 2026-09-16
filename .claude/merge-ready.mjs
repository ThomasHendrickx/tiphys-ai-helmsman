#!/usr/bin/env node
/**
 * IS THIS PHASE READY TO MERGE? Computed, not judged.
 *
 * The companion to `.claude/orchestrator-next.mjs`, which answers "what is the
 * next action". This answers the narrower question the orchestrator kept
 * answering from memory: whether a particular phase has everything DR-0012,
 * DR-0031 and the scope rules require, BEFORE a pull request is opened.
 *
 * WHY IT EXISTS. DR-0031 was decided after one day produced ten pull requests
 * for two phases, at roughly sixteen minutes of serialised CI each. Its third
 * clause is the one this script serves: CI enforces that `main` stays green, it
 * is NOT how you find out whether you are green. Every check below is
 * answerable locally in under a second, and each one has cost a round at least
 * once when it was answered by judgment instead.
 *
 * IT EXITS NONZERO WHEN THE PHASE IS NOT READY, and prints every unmet
 * condition rather than the first, because finding one blocker per CI cycle is
 * the cost pattern DR-0031 exists against.
 *
 * WHAT IT CANNOT SEE, stated rather than left to be discovered: it has no
 * network, so open pull requests, CI conclusions and post-merge push runs are
 * invisible; and it does not RUN the gate bundle, because several gates are
 * wall-clock sensitive and this box is routinely loaded above the band that
 * reddens `coverage` (delivery/verification/wall-clock-budgets-are-load-dependent.md).
 * It tells you to run those separately, on a quiet machine, and says so in its
 * output rather than letting a silent omission read as a pass.
 *
 * Usage: node .claude/merge-ready.mjs <phase-id>        e.g. m4-p2
 */

import { execFileSync } from "node:child_process";

const PHASE = process.argv[2];
if (PHASE === undefined || !/^m[0-9]+-p[0-9]+$/.test(PHASE)) {
  process.stderr.write("usage: node .claude/merge-ready.mjs <phase-id>, e.g. m4-p2\n");
  process.exit(64);
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
function exists(ref, path) {
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}:${path}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

git(["fetch", "-q", "origin", "main"]);

const localBranch = git(["branch", "--list", `claude/${PHASE}-*`])
  .split("\n").map((s) => s.replace(/^[*+]?\s*/, "").trim()).filter(Boolean)[0];
const remoteBranch = git(["branch", "-r", "--list", `origin/claude/${PHASE}-*`])
  .split("\n").map((s) => s.trim()).filter(Boolean)[0];

const unmet = [];
const notes = [];

/* 1. THE BRANCH EXISTS AND IS REPLICATED. Measured 2026-09-16: twelve M4
      branches carrying 141 distinct commits existed only in one container. A
      branch that is not on the remote cannot be merged and cannot survive the
      container (T-027). */
if (localBranch === undefined && remoteBranch === undefined) {
  unmet.push(`no branch matching claude/${PHASE}-* exists locally or on origin`);
} else if (localBranch !== undefined) {
  const n = Number.parseInt(git(["rev-list", "--count", localBranch, "--not", "--remotes"]), 10) || 0;
  if (n > 0) unmet.push(`${localBranch} has ${n} commit(s) on no remote; push before anything else`);
}

const ref = remoteBranch ?? localBranch;

/* 2. THE BRANCH NAME IS THE PHASE'S OWN. The scope auditor derives the phase id
      from the branch name and requires the declaration's `branch` field to
      match. A near-miss name is a red gate, not a preference. */
if (ref !== undefined) {
  const bare = ref.replace(/^origin\//, "");
  const declPath = `delivery/plan/phase-declarations/${PHASE}.json`;
  const declRef = exists("origin/main", declPath) ? "origin/main" : ref;
  if (!exists(declRef, declPath)) {
    unmet.push(`${declPath} exists on neither origin/main nor the branch; the scope gate reads it from the MERGE BASE`);
  } else {
    try {
      const decl = JSON.parse(git(["show", `${declRef}:${declPath}`]));
      if (decl.branch !== undefined && decl.branch !== bare) {
        unmet.push(`declaration says branch "${decl.branch}" but the branch is "${bare}"; the scope gate compares these exactly`);
      }
      notes.push(`declaration read from ${declRef}`);
    } catch {
      unmet.push(`${declPath} did not parse as JSON`);
    }
  }

  /* 3. THE WORK HISTORY IS ON THE BRANCH (durability table; DR-0031 clause 2). */
  if (!exists(ref, `delivery/work-history/${PHASE}.md`)) {
    unmet.push(`delivery/work-history/${PHASE}.md is not on ${ref}`);
  }

  /* 4. THE EVIDENCE RIDES THE SAME PULL REQUEST (DR-0031 clause 2). Splitting a
        phase's evidence into its own pull request is the pattern that decision
        exists to stop, and its mirror is a paperwork pull request asserting
        review evidence for code that has not landed. Both directions checked. */
  const reviewFiles = git(["ls-tree", "--name-only", ref, "delivery/review/"])
    .split("\n").map((s) => s.trim()).filter(Boolean)
    .filter((p) => p.toLowerCase().includes(PHASE));
  if (reviewFiles.length === 0) {
    unmet.push(`no file under delivery/review/ on ${ref} names ${PHASE}; DR-0031 requires the reviews to ride this pull request`);
  } else {
    notes.push(`${reviewFiles.length} review file(s) naming ${PHASE} on the branch`);
  }

  /* 5. A CONFORMING VERDICT, WHICH IS WHAT ARMS THE MERGE CHECK. Measured
        2026-09-16: `check-dual-review` has never asserted anything on this
        repository, because a markdown review is filtered out before it is read
        and no top-level verdict document has ever been committed. Both regime
        documents must also be present or the gate errors rather than running. */
  const verdicts = reviewFiles.filter((p) => /\.(ya?ml|json)$/i.test(p) && p.split("/").length === 3);
  if (verdicts.length === 0) {
    notes.push(`NO conforming verdict document: check-dual-review will report not-applicable, not green. Markdown reviews are filtered out before they are read.`);
  } else {
    for (const document of ["charter.yaml", "assurance-modes.yaml"]) {
      if (!exists(ref, document)) {
        unmet.push(`${verdicts.length} verdict document(s) will ARM check-dual-review, and ${document} is absent, so it reports error (exit 21), not green`);
      }
    }
  }

  /* 6. THE MERGE IS CLEAN. `git diff main..branch` is not a merge preview and
        reads as though a stale branch DELETES things (standing warning 13). Ask
        git for the merge result instead. */
  try {
    execFileSync("git", ["merge-tree", "--write-tree", "origin/main", ref], { encoding: "utf8", stdio: "pipe" });
    notes.push("merge-tree against origin/main is clean");
  } catch {
    unmet.push(`merging origin/main into ${ref} conflicts; resolve it before opening anything`);
  }
}

const lines = [`merge readiness: ${PHASE}  (branch ${ref ?? "NONE"})`, ""];
for (const n of notes) lines.push(`  note   ${n}`);
if (notes.length > 0) lines.push("");
for (const u of unmet) lines.push(`  UNMET  ${u}`);
if (unmet.length === 0) lines.push("  every locally computable condition is met.");
lines.push("");
lines.push("NOT CHECKED HERE, and each is a real condition:");
lines.push("  - the gate bundle. Several gates are wall-clock sensitive and this box is often");
lines.push("    loaded past the band that reddens `coverage`. Run them on a quiet machine:");
lines.push("    read /proc/loadavg first and say what it was.");
lines.push("  - the suite. Quote interpreter, build state, invocation, checkout-vs-archive,");
lines.push("    and the SKIPPED count beside the pass count.");
lines.push("  - anything on the network: open pull requests, CI conclusions, and the");
lines.push("    post-merge `push` run on the new main head (T-009).");
lines.push("  - whether a human read the reviews. No script reaches that.");
process.stdout.write(lines.join("\n") + "\n");
process.exit(unmet.length === 0 ? 0 : 2);
