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

  /* THE SCOPE GATE READS THE MERGE BASE, AND NOTHING ELSE WILL DO. Measured
     2026-09-16: the declaration being on the BRANCH is what every M4 phase had,
     and the gate was red for all twelve. It is red until the declaration is in
     the merge base of --base and --head, which committing it to main does NOT
     achieve on its own: a commit added to main after a branch was cut is not in
     that branch's merge base. The branch must then merge main in.

     This check read the declaration from the branch when main lacked it, and so
     passed a phase whose scope gate could not go green. That is the shape this
     whole script exists against, one level in. */
  const mergeBase = git(["merge-base", "origin/main", ref]);
  const inMergeBase = mergeBase !== "" && exists(mergeBase, declPath);
  if (!inMergeBase) {
    const where = exists(ref, declPath) ? "on the branch only" : "nowhere";
    unmet.push(
      `${declPath} is ${where}, NOT in the merge base ${mergeBase.slice(0, 8)}; the scope gate reads it from there, so it is RED. ` +
        `Two steps: land the declarations on main, THEN merge main into this branch so its merge base moves past that commit.`,
    );
  }
  const declRef = inMergeBase ? mergeBase : exists("origin/main", declPath) ? "origin/main" : ref;
  if (!exists(declRef, declPath)) {
    unmet.push(`${declPath} exists on neither origin/main nor the branch`);
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

  /* 4b. WHAT DO THE LANDED REVIEWS ACTUALLY SAY? A review file on the branch
        satisfies DR-0031's "carries all its evidence" and says nothing about
        whether it APPROVED. Reading the file is the only way to tell, and a
        phase with a FIX-ROUND-NEEDED review on its own branch is not ready
        however many boxes above are ticked. */
  /* A REVIEW THAT ASKED FOR A FIX ROUND, AND A FIX ROUND THAT HAS SINCE LANDED,
     ARE DIFFERENT STATES AND IMPLY DIFFERENT ACTIONS. The first check here
     could not tell them apart and told a reader a round was owed on three
     phases whose round had already run. What is owed after a fix round is a
     RE-REVIEW, because the head the reviewers examined is no longer the head.

     The head a review examined is not recorded in the file in a form worth
     parsing, so the proxy is whether any commit after the review's own commit
     changes something other than delivery/review/. That is coarse and is
     labelled as a proxy rather than presented as the fact. */
  for (const path of reviewFiles) {
    const body = git(["show", `${ref}:${path}`]);
    const needsRound = /FIX-ROUND-NEEDED/.test(body);
    const highs = (body.match(/\[(HIGH|CRITICAL)\]/g) || []).length;
    if (!needsRound && highs === 0) continue;

    /* THE REVIEWED HEAD IS IN THE REVIEW, and using the review FILE's own commit
       instead gets this backwards whenever the reviews are landed AFTER the fix
       round, which is the normal order here. Measured: that version reported
       "the round is owed" on two phases whose round had already run and pushed. */
    const headMatch = body.match(/\bhead `?([0-9a-f]{7,40})`?/);
    const reviewedHead = headMatch === null ? "" : headMatch[1];
    let after = [];
    if (reviewedHead !== "" && git(["cat-file", "-t", reviewedHead]) === "commit") {
      after = git(["log", "--format=%h", `${reviewedHead}..${ref}`, "--", ".", ":(exclude)delivery/review"])
        .split("\n").map((x) => x.trim()).filter(Boolean);
    }
    const label = `${path}${needsRound ? " records FIX-ROUND-NEEDED" : ""}` +
      `${highs > 0 ? `${needsRound ? " and" : " records"} ${String(highs)} HIGH/CRITICAL finding(s)` : ""}`;
    if (after.length === 0) {
      unmet.push(`${label}; that round is owed before this merges`);
    } else {
      unmet.push(
        `${label}, and ${String(after.length)} commit(s) since the head it reviewed (${reviewedHead.slice(0, 8)}) changed ` +
          `the code, so a RE-REVIEW is owed rather than a first round.`,
      );
    }
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
