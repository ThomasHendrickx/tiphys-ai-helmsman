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
 * Usage: node .claude/orchestrator-next.mjs [--milestone m5]
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* Fetch BEFORE deriving: both derivations below read origin/main. */
git(["fetch", "-q", "origin", "main"]);

/* THE VALUE-DELIVERY PLAN IS A PLAN SOURCE TOO (M5-P4).
 *
 * Until M5 every milestone's plan was a markdown file named
 * delivery/plan/kernel-plan-<milestone>.md, and the phase derivation below
 * read only that. M5's plan is delivery/plan/value-delivery-plan.yaml, so
 * `--milestone m5` found no plan, pushed "could not be read" onto the hard
 * errors and exited 7 on every run, and a finished M4 printed the DR-0047
 * sweep, which pull request #202 had already closed. Both are this script
 * naming work that is not the next work.
 *
 * The YAML plan is read from origin/main and PARSED, never grepped: it
 * carries each phase's id AND its branch, in the plan's own order, and that
 * order is the dependency order merges follow (binding convention 5). A read
 * or parse failure is returned as a reason, never as an empty plan. */
const VALUE_PLAN_PATH = "delivery/plan/value-delivery-plan.yaml";

async function readValuePlan() {
  const shown = gitTry(["show", `origin/main:${VALUE_PLAN_PATH}`]);
  if (!shown.ok) return { ok: false, phases: [], why: `${VALUE_PLAN_PATH} could not be read from origin/main (${shown.err})` };
  let parse;
  try {
    ({ parse } = await import("yaml"));
  } catch (error) {
    return { ok: false, phases: [], why: `the yaml package could not be loaded to parse ${VALUE_PLAN_PATH} (${String(error?.message ?? error)}); run npm ci` };
  }
  let document;
  try {
    document = parse(shown.out);
  } catch (error) {
    return { ok: false, phases: [], why: `${VALUE_PLAN_PATH} on origin/main does not parse (${String(error?.message ?? error)})` };
  }
  const rows = Array.isArray(document?.phases) ? document.phases : null;
  if (rows === null) return { ok: false, phases: [], why: `${VALUE_PLAN_PATH} on origin/main has no phases list` };
  const phases = [];
  for (const row of rows) {
    const m = /^M([0-9]+)-P([0-9]+)$/.exec(String(row?.id ?? ""));
    if (m === null || typeof row?.branch !== "string" || row.branch === "") {
      return { ok: false, phases: [], why: `${VALUE_PLAN_PATH} has a phase entry without an M<n>-P<n> id and a branch: ${JSON.stringify({ id: row?.id, branch: row?.branch })}` };
    }
    phases.push({
      id: `m${m[1]}-p${m[2]}`,
      milestone: `m${m[1]}`,
      number: Number.parseInt(m[2], 10),
      branch: row.branch,
    });
  }
  return { ok: true, phases, why: null };
}

const VALUE_PLAN = await readValuePlan();

/* Branches merged into origin/main by pull request, read from the merge
 * commits' subjects ("Merge pull request #N from <owner>/<branch>"). A phase
 * whose PLAN names its branch is merged when that branch was merged, which is
 * what the plan-derived next action asks; the work-history probe below stays
 * as the other, older half of "merged". A failed listing is a hard error, not
 * an empty set, because an empty set would make every phase read unmerged. */
function mergedBranchSet() {
  const r = gitTry(["log", "origin/main", "--merges", "--format=%s"]);
  if (!r.ok) return { ok: false, set: new Set(), why: `cannot list merge commits on origin/main: ${r.err}` };
  const set = new Set();
  for (const line of r.out.split("\n")) {
    const m = /^Merge pull request #[0-9]+ from [^/\s]+\/(\S+)$/.exec(line.trim());
    if (m !== null) set.add(m[1]);
  }
  return { ok: true, set, why: null };
}

/* THE MILESTONE IS DERIVED TOO, AND IT DEFAULTED TO A FINISHED ONE.
 *
 * This read `: "m3"` until 2026-09-16, and by then M3 was complete. So the
 * DEFAULT invocation of the one script whose nonzero exit is meant to be
 * un-report-around-able printed "13/13 merged, NOTHING LEFT" and exited 0,
 * FOREVER, while M4 ran twelve branches past it. A stop condition pinned to a
 * finished milestone cannot go red, which is T-008's shape in the guard that
 * exists to catch exactly that.
 *
 * Deriving it has the same justification as deriving the phase set directly
 * below: a constant is a claim about every future milestone. The highest
 * milestone with ANY evidence is the one in progress. */
function deriveMilestone() {
  const seen = new Set();
  const harvestM = (text, re) => {
    for (const line of text.split("\n")) {
      const m = re.exec(line.trim());
      if (m !== null) seen.add(Number.parseInt(m[1], 10));
    }
  };
  harvestM(
    git(["ls-tree", "--name-only", "origin/main", "delivery/work-history/"]),
    /(?:^|\/)m([0-9]+)-p[0-9]+\.md$/,
  );
  harvestM(git(["branch", "-a", "--list", "*claude/m*-p*"]), /claude\/m([0-9]+)-p[0-9]+-/);
  /* The plan names a milestone before any branch or work history exists
     for it (M5-P4), so a planned milestone is not hidden behind a finished
     one on the default invocation. */
  for (const p of VALUE_PLAN.phases) seen.add(Number.parseInt(p.milestone.slice(1), 10));
  if (seen.size === 0) return null;
  return `m${Math.max(...seen)}`;
}

const MILESTONE = (() => {
  const i = process.argv.indexOf("--milestone");
  if (i !== -1 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  const derived = deriveMilestone();
  if (derived === null) {
    process.stderr.write(
      "orchestrator-next: no --milestone given and NONE could be derived from " +
        "work histories on origin/main or from any local or remote phase branch. " +
        "That is a broken derivation, not an idle repository.\n",
    );
    process.exit(5);
  }
  return derived;
})();

const STALE_SECONDS = 420;

/* WORKTREES ARE FOUND, NOT PREDICTED.
 *
 * This was a hard-coded scratchpad path containing ANOTHER SESSION's id, and
 * scratchpad ids change per session, so `existsSync` was false every time and
 * the worktree half of this script reported nothing on every run since that
 * session ended. Not one stale worktree, ever: a guard that cannot go red.
 *
 * It is also the mistake T-014 records six times over, one abstraction up.
 * "Where does the agent write" is a thing to MEASURE. `git worktree list`
 * is that measurement: it names every worktree this repository actually has,
 * with the branch each has checked out, so the phase-to-directory mapping is
 * read rather than guessed. */
function worktreesByBranch() {
  const map = new Map();
  const out = git(["worktree", "list", "--porcelain"]);
  let path = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice(9).trim();
    else if (line.startsWith("branch ") && path !== null) {
      map.set(line.slice(7).trim().replace(/^refs\/heads\//, ""), path);
      path = null;
    }
  }
  return map;
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/* WHY THIS EXISTS BESIDE `git`, AND WHY BOTH ARE KEPT.
 *
 * `git` above swallows every failure to the empty string. For a LISTING that is
 * right: no matching branch and a failed listing are both "nothing to report"
 * and neither is a fact this script acts on.
 *
 * For a COUNT it is a silent lie, and it was measured as one. A clean-room
 * reviewer forced the arm with a single config change, `git config color.branch
 * always`, which makes `git branch --list` emit an escape sequence inside the
 * branch name; the following `rev-list` then exits with a usage error, `git`
 * returns "", and `Number.parseInt("") || 0` is 0. The script dropped from exit
 * 6 with [UNPUSHED 1 commit(s)] to exit 2 with no marker at all. The usage error
 * does reach stderr, so it is not wholly silent to a human, but the EXIT CODE,
 * which is the half this script exists to make un-report-around-able, lied.
 *
 * That is this project's most-recorded failure shape: a guard whose condition
 * does not test the property it claims, reported green. CLAUDE.md's own
 * fix-round contract names "a usage error read as a clean result" as one of
 * three recorded instances.
 *
 * So: counts go through `gitTry`, and a failed count is a HARD ERROR that exits
 * nonzero rather than a zero. A guard that cannot measure must not report
 * "nothing found". */
function gitTry(args) {
  try {
    return { ok: true, out: execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : String(error?.message ?? error);
    return { ok: false, out: "", err: stderr };
  }
}

/** A count, or null when the command failed or did not return an integer. */
function gitCount(args) {
  const r = gitTry(args);
  if (!r.ok) return { value: null, why: `git ${args.join(" ")} failed: ${r.err}` };
  const n = Number.parseInt(r.out, 10);
  if (!Number.isInteger(n)) {
    return { value: null, why: `git ${args.join(" ")} returned ${JSON.stringify(r.out)}, which is not an integer` };
  }
  return { value: n, why: null };
}

/* Branch listings use --format rather than the default, which prints a "* " or
 * "+ " marker and, under color.branch=always, escape sequences inside the name.
 * --format emits the bare short name with neither. That removes the specific
 * trigger above at its source; gitCount's failure arm covers the general case,
 * because closing one door is not closing the mechanism. */
function branchNames(pattern, remote) {
  const args = ["branch", "--format=%(refname:short)"];
  if (remote) args.push("-r");
  args.push("--list", pattern);
  return git(args).split("\n").map((x) => x.trim()).filter(Boolean);
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


/* THE PHASE SET IS DERIVED, NEVER COUNTED.
 *
 * This was `const PHASE_COUNT = 10` until 2026-08-14, and by then M3 had
 * ELEVEN phases: M3-P11 was added mid-milestone to own the crash-is-not-a-skip
 * defect. The script printed "9/10 phases merged" with M3-P11 merged and
 * invisible, because a phase outside the range is not merely uncounted, it is
 * never examined at all.
 *
 * The mechanism is the one binding convention 5 names for append-only
 * registries: a hard-coded count is a claim about every FUTURE member, and it
 * is false the moment one is appended. It is the same defect as a test pinning
 * a row count over `test/behaviors.json`, in the one script whose whole job is
 * to be the stop condition that cannot be reported around.
 *
 * So the set is the UNION of three independent sources, because no single one
 * covers every phase this repository has had: a declaration on main (M2-P1 has
 * none; declarations began at M2-P2), a work history on main (a dispatched but
 * unmerged phase has none there), and a pushed branch (a planned but
 * undispatched phase has none). A phase counts if ANY of them names it.
 *
 * An empty derivation is a FAILURE, not an empty milestone, and it exits
 * nonzero saying so. Reporting "0/0 merged, nothing left" would be this
 * script's own false green. */
let planUnread = null;
/* Set when the phases come from the value-delivery plan: [{id, branch}] in
 * the plan's order. Null for a markdown-plan milestone, which keeps the
 * numeric order and the rule it has always had. */
let planOrdered = null;

function derivePhaseNumbers() {
  const found = new Set();
  const harvest = (text, re) => {
    for (const line of text.split("\n")) {
      const m = re.exec(line.trim());
      if (m !== null) found.add(Number.parseInt(m[1], 10));
    }
  };
  harvest(
    git(["ls-tree", "--name-only", "origin/main", "delivery/plan/phase-declarations/"]),
    new RegExp(`(?:^|/)${MILESTONE}-p([0-9]+)\\.json$`),
  );
  harvest(
    git(["ls-tree", "--name-only", "origin/main", "delivery/work-history/"]),
    new RegExp(`(?:^|/)${MILESTONE}-p([0-9]+)\\.md$`),
  );
  harvest(
    git(["branch", "-r", "--list", `origin/claude/${MILESTONE}-p*`]),
    new RegExp(`^origin/claude/${MILESTONE}-p([0-9]+)-`),
  );
  /* FOURTH SOURCE, and it is the one whose absence made the 2026-09-16 near
   * miss invisible. The three sources above all read origin. A phase whose
   * branch exists ONLY in this container therefore was not an unflagged
   * phase, it was not a phase at all, so the unreplicated-work check below
   * could never examine it. Measured in the lab: with only the three sources,
   * a local-only branch is absent from the report entirely while a local
   * branch merely AHEAD of its pushed remote reddens correctly. Those are two
   * members of one class and only one of them was covered. */
  harvest(
    git(["branch", "--list", `claude/${MILESTONE}-p*`]),
    new RegExp(`^[*+]?\\s*claude/${MILESTONE}-p([0-9]+)-`),
  );
  /* FIFTH SOURCE, THE PLAN, and without it this script reports a FINISHED
   * MILESTONE while phases are still unbuilt.
   *
   * Measured 2026-09-17 at main d938557: exit 3, "all phases merged", with
   * SIX phases (M4-P9, M4-P12, M4-P21, M4-P22, M4-P24, M4-P25) not started.
   * That is this script's own false green, in the one script whose whole job
   * is to be the stop condition that cannot be reported around.
   *
   * The four sources above are all EVIDENCE OF WORK: a declaration, a work
   * history, a remote branch, a local branch. Every one of them appears only
   * once a phase has been STARTED. The comment above says the branch source
   * covers "a planned but undispatched phase", and that is wrong: a branch
   * exists only after dispatch. So a phase the plan names and nobody has
   * touched was invisible to all four, and the milestone looked complete when
   * the LAST STARTED phase merged rather than when the last PLANNED one did.
   *
   * The plan is the only source that names a phase before anyone works on it.
   * Two patterns, because the plan spells a phase id in two places: a section
   * heading (`### M4-P7:`, sometimes numbered `### 4.2.3 M4-P8:`) and the
   * `- id:` line inside a phase entry.
   *
   * WHY THE STRICT PATTERNS AND NOT A BARE `M4-P[0-9]+` GREP: prose names ids
   * that are not phases, for example "the next free id is M4-P31". Measured on
   * this plan both forms return the SAME 30 ids, which is the control that
   * says the strict form drops nothing today; the strict form is kept because
   * the loose one has no such guarantee on a later revision.
   *
   * A MISSING PLAN IS REPORTED, NEVER SILENTLY ZERO. gitTry rather than git,
   * and the reason is pushed onto hardErrors below. */
  const planPath = `delivery/plan/kernel-plan-${MILESTONE}.md`;
  const plan = gitTry(["show", `origin/main:${planPath}`]);
  /* THE VALUE-DELIVERY PLAN, when it names this milestone (M5-P4). Its
   * phases are harvested in PLAN ORDER and with their BRANCHES, and that
   * order and those branches drive the next action below instead of the
   * numeric order, so the next action is the plan's first unmerged phase. */
  const valuePhases = VALUE_PLAN.phases.filter((p) => p.milestone === MILESTONE);
  if (plan.ok) {
    harvest(
      plan.out,
      new RegExp(`^#{2,4} (?:[0-9.]+ )?${MILESTONE.toUpperCase()}-P([0-9]+)[: ]`, "i"),
    );
    harvest(plan.out, new RegExp(`^- id: ${MILESTONE.toUpperCase()}-P([0-9]+) *$`, "i"));
  } else if (valuePhases.length > 0) {
    for (const p of valuePhases) found.add(p.number);
    planOrdered = valuePhases;
  } else {
    planUnread =
      `${planPath} could not be read from origin/main (${plan.err}), and ` +
      `${VALUE_PLAN.ok ? `${VALUE_PLAN_PATH} names no ${MILESTONE.toUpperCase()} phase` : VALUE_PLAN.why}, ` +
      `so a phase the plan names and nobody has started yet is INVISIBLE to this run; the count below is of STARTED phases only`;
  }
  return [...found].sort((a, b) => a - b);
}

const phaseNumbers = derivePhaseNumbers();
if (phaseNumbers.length === 0) {
  process.stderr.write(
    `orchestrator-next: derived ZERO phases for ${MILESTONE}. That is a broken derivation, ` +
      `not an empty milestone, and this script will not report "nothing left" on it. ` +
      `Check that origin/main has delivery/plan/phase-declarations/ and ` +
      `delivery/work-history/, and that --milestone is spelled as the file prefix.\n`,
  );
  process.exit(4);
}
const PHASE_COUNT = phaseNumbers.length;

const WORKTREES = worktreesByBranch();
const phases = [];
/* Counts that could NOT be taken. Never silently zero: see gitTry. */
const hardErrors = [];
if (planUnread !== null) hardErrors.push(planUnread);
const MERGED_BRANCHES = mergedBranchSet();
if (!MERGED_BRANCHES.ok) hardErrors.push(MERGED_BRANCHES.why);
/** Merged: the work history is on main, or the branch the PLAN names for the phase was merged. */
function phaseMerged(id, plannedBranch) {
  return onMain(`delivery/work-history/${id}.md`) || (plannedBranch !== undefined && MERGED_BRANCHES.set.has(plannedBranch));
}
for (const n of phaseNumbers) {
  const id = `${MILESTONE}-p${n}`;
  const merged = phaseMerged(id, planOrdered?.find((p) => p.id === id)?.branch);
  const branch = `claude/${id}-`;
  /* EVERY MATCHING BRANCH, NOT THE FIRST.
   *
   * This read `.filter(Boolean)[0]` until 2026-09-16, on both the remote and
   * the local side. A clean-room reviewer measured what that costs, in a lab
   * built from this script's own source: with one local branch carrying a
   * commit on no remote, the script printed [UNPUSHED 1 commit(s)] and exited
   * 6; with a pushed branch SORTING FIRST and a second branch carrying the
   * unreplicated commit, it printed the ordinary "pushed, NOT merged" line, no
   * marker, exit 2.
   *
   * It was live for M4-P15, whose plan section declares the branch
   * claude/m4-p15-fleet-bringup while the delivered branch is
   * claude/m4-p15-kernel-charter. The first sorts BEFORE the second, so
   * creating it would have made the branch under review the unwatched one.
   *
   * The worktree watch set carried the identical truncation, and the script's
   * "WORKTREE WATCH SET IS EMPTY" warning fires only at ZERO, so a PARTIAL
   * watch set was silent. That is T-014's shape exactly: a watchdog pointed at
   * one of several paths is not weak, it is false, because it reports quiet at
   * full speed. */
  const remoteBranches = branchNames(`origin/${branch}*`, true);
  const remoteBranch = remoteBranches[0];
  let ahead = 0;
  for (const rb of remoteBranches) {
    const counts = gitTry(["rev-list", "--left-right", "--count", `origin/main...${rb}`]);
    if (!counts.ok) {
      hardErrors.push(`${id}: cannot count commits ahead on ${rb}: ${counts.err}`);
      continue;
    }
    const n = Number.parseInt(counts.out.split(/\s+/)[1] ?? "", 10);
    if (!Number.isInteger(n)) {
      hardErrors.push(`${id}: ahead-count for ${rb} was ${JSON.stringify(counts.out)}, not a pair of integers`);
      continue;
    }
    if (n > ahead) ahead = n;
  }

  /* UNREPLICATED WORK: commits that exist in this container and NOWHERE else.
   *
   * Measured 2026-09-16: twelve M4 phase branches carrying 141 distinct
   * commits existed only in the container. None was on origin. The derivation
   * below harvests phase numbers partly FROM the remote, so a local-only
   * branch is not merely unflagged, it is not a phase at all: the script
   * defaulted to a finished milestone and reported NOTHING LEFT.
   *
   * This is the one state the script can observe that no later session can
   * recover from, so it outranks every other next action. A commit is not
   * durable; a PUSHED commit is (durability rule, blueprint principle 4). */
  const localBranches = branchNames(`${branch}*`, false);
  const localBranch = localBranches[0];
  /* `--not --remotes` is the precise question: commits on this local branch
   * that NO remote ref contains. Subtracting only the branch's own remote
   * counterpart gets the no-counterpart case wrong, counting every commit back
   * to the root as unreplicated, including ones already on main. */
  let unreplicated = 0;
  const unreplicatedBy = [];
  for (const lb of localBranches) {
    const c = gitCount(["rev-list", "--count", lb, "--not", "--remotes"]);
    if (c.value === null) {
      /* NOT a zero. A count that could not be taken is the state this guard
       * exists to refuse to paper over. */
      hardErrors.push(`${id}: cannot count unreplicated commits on ${lb}: ${c.why}`);
      continue;
    }
    if (c.value > 0) {
      unreplicated += c.value;
      unreplicatedBy.push(`${lb} ${c.value}`);
    }
  }

  /* The watch set is the UNION over every matching local branch, not the first
   * one's worktree. */
  let worktree = null;
  for (const lb of localBranches) {
    const wt = WORKTREES.get(lb);
    if (wt === undefined || !existsSync(wt)) continue;
    const newest = newestMtime(wt);
    const age = newest === 0 ? -1 : Math.round((Date.now() - newest) / 1000);
    const candidate = { path: wt, ageSeconds: age, stale: age < 0 || age >= STALE_SECONDS };
    /* Freshest wins: any live worktree for this phase means the phase is being
     * worked on, and reporting the stalest would invent a death. */
    if (worktree === null || (candidate.ageSeconds >= 0 && candidate.ageSeconds < worktree.ageSeconds)) {
      worktree = candidate;
    }
  }

  phases.push({ id, merged, remoteBranch, remoteBranches, localBranch, localBranches, unreplicated, unreplicatedBy, ahead, worktree });
}

const done = phases.filter((p) => p.merged);
const pushedNotMerged = phases.filter((p) => !p.merged && p.ahead > 0);
const notStarted = phases.filter((p) => !p.merged && p.ahead === 0);
const unreplicated = phases.filter((p) => p.unreplicated > 0);

const lines = [];
lines.push(`milestone ${MILESTONE.toUpperCase()}: ${done.length}/${PHASE_COUNT} phases merged to main`);
lines.push("");
for (const p of phases) {
  const state = p.merged
    ? "MERGED"
    : p.ahead > 0
      ? `pushed, ${p.ahead} commit(s) ahead, NOT merged`
      : "not started";
  /* NAME the branches, do not only total them. A phase with two local branches
   * and one commit unreplicated on the second is invisible in a bare total. */
  const unrep =
    p.unreplicated > 0
      ? `  [UNPUSHED ${p.unreplicated} commit(s) on ${p.unreplicatedBy.join(", ")}]`
      : "";
  const wt =
    p.worktree === null
      ? ""
      : `  [worktree ${p.worktree.stale ? "STALE" : "fresh"} ${p.worktree.ageSeconds}s]`;
  lines.push(`  ${p.id.padEnd(8)} ${state}${unrep}${wt}`);
}
lines.push("");

/* THE PLAN'S NEXT ACTION (M5-P4). For a milestone whose phases came from the
 * value-delivery plan, and for the successor of a finished M4, the next action
 * is the FIRST phase in plan order whose branch is not merged to origin/main:
 * DRIVE it when its plan-named branch is pushed and ahead of main, DISPATCH it
 * otherwise. Plan order is dependency order, so this is the phase that merges
 * next. Every input is read from origin/main or a remote ref; none is a
 * constant in this file. A count that could not be taken is pushed onto
 * hardErrors, so it can never be read as "not pushed". */
function planNextAction(entries, planLabel) {
  for (const p of entries) {
    if (phaseMerged(p.id, p.branch)) continue;
    const remote = `origin/${p.branch}`;
    const exists = gitTry(["rev-parse", "--verify", "-q", `refs/remotes/${remote}`]).ok;
    let ahead = 0;
    if (exists) {
      const c = gitCount(["rev-list", "--count", `origin/main..${remote}`]);
      if (c.value === null) {
        hardErrors.push(`${p.id}: cannot count commits ahead on ${remote}: ${c.why}`);
        return null;
      }
      ahead = c.value;
    }
    const where = `It is the first phase in ${planLabel} whose branch ${p.branch} is not merged to origin/main`;
    if (ahead > 0) {
      return {
        next:
          `DRIVE ${p.id.toUpperCase()} TO MERGE. ${where}, and ${remote} is ${ahead} commit(s) ahead of main. ` +
          `Next step is whichever of these is not yet done: scope green, dual cross-model clean-room ` +
          `review, arbitration, fix round, delta verification, merge, post-merge push run verified.`,
        exitCode: 2,
      };
    }
    return {
      next: `DISPATCH ${p.id.toUpperCase()}. ${where}, and no pushed branch for it is ahead of main.`,
      exitCode: 2,
    };
  }
  return { next: null, exitCode: null };
}

/* WHAT A FINISHED MILESTONE OWES IS NOT THE SAME FOR EVERY MILESTONE, AND
   HARD-CODING THE EXIT TEST MADE THIS SCRIPT NAME A WRONG NEXT ACTION.
   Measured 2026-09-18, the moment M4's last phase merged: it printed `RUN THE
   M4 EXIT TEST`, which DR-0041 and DR-0042 had already deferred to cutover
   entry, bound to the pilot and refusing a kernel-only subject. M4-P27 ships
   that trigger and is merged, so the instruction was not merely early, it was
   for a step this milestone does not own.

   A stop condition that names the wrong action is worse than one that names
   none, because it trains the reader to discount the line that is supposed to
   be beyond discounting. That is T-036's shape one step out: there the
   denominator was wrong, here the verdict is.

   So the terminal action is DATA per milestone rather than one hard-coded
   branch, and a milestone with no entry says so instead of guessing.

   M4'S ENTRY NAMED THE FINAL APPROVAL SWEEP UNTIL M5-P4, and that sweep was
   closed by pull request #202 (delivery/STATE.md, "M4 IS CLOSED"). Its probe
   file was never landed, so the entry named completed work forever. A
   finished M4 now hands over to its SUCCESSOR PLAN: the value-delivery plan's
   next incomplete phase, derived by planNextAction above. */
const TERMINAL = {
  m4: { successorPlan: VALUE_PLAN_PATH },
};

const planNext = planOrdered !== null ? planNextAction(planOrdered, VALUE_PLAN_PATH) : null;
let successorNext = null;
if (done.length === PHASE_COUNT && TERMINAL[MILESTONE]?.successorPlan !== undefined) {
  if (!VALUE_PLAN.ok) {
    hardErrors.push(`${MILESTONE.toUpperCase()} is finished and its successor plan is unreadable: ${VALUE_PLAN.why}`);
  } else {
    successorNext = planNextAction(VALUE_PLAN.phases, VALUE_PLAN_PATH);
  }
}

/* The next action, chosen by rule and not by judgment. Order matters: an
 * unmerged pushed branch always outranks starting new work, because merge
 * order is dependency order (binding convention 5). For a plan-ordered
 * milestone the plan's order IS that dependency order, so planNext decides. */
let next;
let exitCode;
/* A COUNT THAT COULD NOT BE TAKEN OUTRANKS EVERY OTHER ANSWER, including the
 * unreplicated-work check below, because it is the state in which this script
 * does not KNOW whether work is unreplicated. Reporting a next action here
 * would be the script's own false green: the whole point of it is that a
 * nonzero exit is a fact the orchestrator cannot report its way around, and a
 * guard that answers "nothing found" when it could not look is worth less than
 * no guard, because it is trusted. */
if (hardErrors.length > 0) {
  process.stderr.write(
    `orchestrator-next: ${String(hardErrors.length)} git count(s) FAILED, so the unreplicated-work ` +
      `guard could not run. This is NOT an absence of unreplicated work.\n` +
      hardErrors.map((e) => `  ${e}\n`).join("") +
      `Fix the cause and re-run. Do not read the absence of an [UNPUSHED ...] marker as safety.\n`,
  );
  process.exit(7);
}

if (unreplicated.length > 0) {
  const ids = unreplicated.map((p) => `${p.id}(${p.unreplicated})`).join(", ");
  next =
    `PUSH BEFORE ANYTHING ELSE. ${unreplicated.length} phase branch(es) carry commits that ` +
    `exist only in this container: ${ids}. A reclaimed container loses them and no later ` +
    `session can recover them. Run: git push -u origin <branch> for each.`;
  exitCode = 6;
} else if (done.length === PHASE_COUNT) {
  const terminal = TERMINAL[MILESTONE];
  if (terminal === undefined) {
    const exitEvidence = onMain(`delivery/evidence/${MILESTONE}-exit-test`);
    if (exitEvidence) {
      next = `NOTHING LEFT. All ${PHASE_COUNT} phases merged and exit-test evidence is on main.`;
      exitCode = 0;
    } else {
      next =
        `ALL ${PHASE_COUNT} PHASES MERGED and this script carries no terminal rule for ` +
        `${MILESTONE.toUpperCase()}. What a finished milestone owes is a decided question ` +
        `(an exit test, an approval sweep, or something else), so this reports the gap ` +
        `rather than guessing an action. Add an entry to TERMINAL above.`;
      exitCode = 3;
    }
  } else if (successorNext !== null && successorNext.next !== null) {
    next = `${MILESTONE.toUpperCase()} IS CLOSED, all ${PHASE_COUNT} phases merged. ${successorNext.next}`;
    exitCode = successorNext.exitCode;
  } else {
    next =
      `${MILESTONE.toUpperCase()} IS CLOSED and every phase of its successor plan ` +
      `${terminal.successorPlan} is merged too. Run this script with that plan's ` +
      `milestone for its terminal rule.`;
    exitCode = 3;
  }
} else if (planNext !== null && planNext.next !== null) {
  next = planNext.next;
  exitCode = planNext.exitCode;
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

const watched = phases.filter((p) => p.worktree !== null);
if (watched.length === 0) {
  lines.push(
    "WORKTREE WATCH SET IS EMPTY. No phase branch is checked out in any worktree of this " +
      "repository. That means NO EVIDENCE about agent liveness, not that every agent is " +
      "healthy. If you believe agents are running, this script is looking in the wrong " +
      "place and you must measure where they write (T-014).",
  );
  lines.push("");
}
lines.push(
  "A FRESH worktree mtime means writes are landing. A STALE one CANNOT distinguish dead " +
    "from finished from a long quiet run, so treat it as a prompt to measure, never as a " +
    "death certificate (T-026: a finishing agent looks exactly like a dead one).",
);
lines.push("");
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
