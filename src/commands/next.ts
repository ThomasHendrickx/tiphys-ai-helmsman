import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { EX_USAGE } from "../cli.ts";
import { loadFleet } from "../fleet.ts";
import { pathsIdentifySameObject } from "../path-identity.ts";
import { TASK_ID_PATTERN, poolList } from "../pool.ts";
import { readTaskMeta, singleLine } from "../task.ts";
import { landedness } from "../teardown.ts";
import type { Fleet } from "../fleet.ts";

/**
 * THE STOP CONDITION, COMPUTED RATHER THAN JUDGED (kernel plan M4, M4-P24
 * criteria 1 to 4; M4-D-10 decided in delivery/plan/kernel-plan-m4.md:3211).
 *
 * WHY A COMMAND AND NOT A RULE. "The orchestrator does not decide when it is
 * finished" has three recorded violations behind it, and every one of them was
 * a JUDGMENT presented as a status report. A rule that depends on remembering
 * does not survive a busy session; the answer this project keeps arriving at
 * is a mechanism whose nonzero exit is a fact nobody can report their way
 * around (CLAUDE.md, "The orchestrator does not decide when it is finished").
 *
 * THE EXIT CODE IS THREE-VALUED ON PURPOSE (criterion 1). `EXIT_WORK_REMAINS`
 * is distinct from 0 AND from 1, so a caller can tell "work remains" from "the
 * command failed". Collapsing them would make a crashing stop condition look
 * exactly like a busy fleet, which is the T-008 shape one level up: a guard
 * whose failure is indistinguishable from its red.
 *
 * WHAT CANNOT BE ESTABLISHED IS COUNTED AS WORK, NEVER AS EMPTY. A category
 * this command failed to read is reported in `unknown` and holds the exit code
 * at `EXIT_WORK_REMAINS`. T-036 is the measured instance of the opposite
 * choice: a stop condition that silently treated an unreadable source as zero
 * printed a finished milestone with six phases unbuilt
 * (delivery/tuition/T-036-the-stop-condition-reported-a-finished-milestone.md:1).
 *
 * AND THAT PROPERTY HOLDS PER CANDIDATE, NOT ONLY PER CATEGORY (round 1). The
 * first version of this file enforced it at CATEGORY granularity: the three
 * `readdirSync` failures were recorded and every per-ROW drop inside a
 * category was silent. The mechanism that reopens is this one sentence: A
 * CATEGORY THAT IS EMPTY BY CONSTRUCTION IS REPORTED AS A CATEGORY THAT IS
 * EMPTY BY OBSERVATION. Four measured instances, all of them exit 0 with
 * `in flight: 0` and `unknown: 0`: a task whose meta.json did not read, a
 * branch that exists only under `refs/remotes/`, a project clone reached
 * through a symlink, and a clone whose `origin/HEAD` points at a feature
 * branch. So every site below that removes a CANDIDATE from the walk either
 * records it in `unknown` or carries a written reason why its absence is
 * established rather than merely unobserved; the enumeration of all fourteen
 * such sites is in delivery/work-history/m4-p24.md:1051.
 *
 * AND THE T-036 QUESTION IS ANSWERED IN THE CANNOT-SEE BLOCK RATHER THAN
 * HIDDEN. Every in-flight category below derives from an artifact that exists
 * only AFTER the work has started: a task record is written at dispatch, a
 * pool record at pool create, a branch at branch create. So an empty report
 * says "nothing is in flight", which is not the same sentence as "nothing is
 * left to do", and `CANNOT_SEE` says so by name instead of leaving the reader
 * to infer it. A fleet home has no artifact that names work before anyone
 * starts it, so this is a reported limit and not a fixable one here.
 *
 * NO ABSOLUTE PATH LITERAL APPEARS IN THIS FILE (criterion 2). Every directory
 * is derived from `loadFleet(process.cwd())` (src/fleet.ts:82). The script this
 * command retires hard-codes one session's scratchpad path, which is why that
 * is a criterion rather than a note.
 *
 * NO NETWORK (criterion 4). Nothing here fetches, and that is a property to
 * keep rather than an omission: a stop condition that degrades to a shorter
 * answer when the network is gone is indistinguishable from one reporting a
 * quiet system, which is the shape CLAUDE.md standing warning 6 records for
 * watchers. The cannot-see block and the exit code are therefore functions of
 * the fleet home alone.
 */

const USAGE = "usage: tiphys next";

/**
 * Work remains. DISTINCT FROM 1, which is the command failing, and from 0,
 * which is every in-flight category empty (criterion 1).
 */
export const EXIT_WORK_REMAINS = 3;

/**
 * WHAT THIS COMMAND CANNOT SEE, as a NAMED LIST (criterion 4).
 *
 * Printed unconditionally. It is not derived from a probe and it does not
 * shorten when something is unreachable, because a list that shrinks when the
 * network is gone tells the reader that fewer things are unknown at exactly
 * the moment more of them are.
 */
export const CANNOT_SEE: readonly string[] = [
  "open pull requests, and whether any of them is waiting on a review",
  "CI conclusions on any head, on either the pull-request arm or the push arm",
  "post-merge push runs on the new main head (T-009: a pull-request green is not evidence for the push arm)",
  "work nobody has started: every in-flight category above is a trace that work leaves BEHIND, so an empty report cannot tell 'nothing left to do' from 'nothing started' (T-036)",
  "whether a project's base ref is still its default branch: the base is read from the clone's own origin/HEAD, which git writes once at clone time and never refreshes, so a default-branch rename upstream leaves every existing clone pointing at a branch that is no longer the default until someone runs git remote set-head. The base actually used is printed under 'base refs' above, so the judgement can be checked rather than trusted",
];

/** The heading the cannot-see block is printed under. */
export const CANNOT_SEE_HEADING =
  "cannot see (this command has no network; an absence here is not evidence of absence):";

interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * One local git invocation in `cwd`. `-C` is how git is told where to
 * resolve, which is NOT where this process is standing (standing warning 9),
 * and `cwd` always arrives derived from the fleet home.
 */
function runGit(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** How a branch turned out to have been delivered, or why that is not settled. */
export type Delivery =
  | { kind: "delivered"; how: "ancestor" | "squash" | "patch-equivalent" }
  | { kind: "open" }
  | { kind: "unknown"; detail: string };

/**
 * THE DELIVERED-ELSEWHERE PREDICATE (criterion 3).
 *
 * `git branch --merged` reports a squash-merged branch as UNMERGED, because
 * the squash commit's sha is not the branch tip and the branch tip is not an
 * ancestor of the base. This process squash-merges every phase, so under the
 * naive implementation EVERY delivered branch reads as open forever and the
 * stop condition never goes green.
 *
 * THE CITATION THAT STOOD HERE UNTIL ROUND 1 WAS WRONG, AND IT WAS WRONG IN
 * THE SILENT DIRECTION. It read `delivery/STATE.md:54`, which resolves, which
 * is why no gate reddened; the line it resolves to is about two merge blockers
 * and says nothing about `git branch --merged`. Measured:
 * `grep -n 'branch --merged' delivery/STATE.md` returns nothing, at this head
 * and at the merge base, so the sentence is absent rather than moved. The
 * claim itself is measured in this repository and the measurement is the
 * citation now: witness/captures/next-delivered-elsewhere-git.txt records
 * `git branch --merged main` listing neither the squash-merged branch nor the
 * one delivered through another pull request. The same wrong citation is in
 * the plan at delivery/plan/kernel-plan-m4.md:3239 and in this phase's work
 * history; the work history is corrected, and the plan is an owner-approved
 * document this phase does not edit, so it is raised rather than changed.
 *
 * THREE ARMS, AND THE THIRD IS WHY THIS IS NOT JUST A CALL TO `landedness`.
 *
 *   1. ANCESTOR. An ordinary merge or a fast-forward. `landedness` arm one.
 *   2. CONTENT. Merging the branch into the base changes no tree, so the base
 *      already carries everything the branch did however it got there. This is
 *      MEMBER A, the squash merge, and it is `landedness` arm two.
 *   3. PATCH EQUIVALENCE. Every commit the branch carries has an equivalent
 *      patch already upstream, found by patch id rather than by sha. This is
 *      MEMBER B: commits that landed inside ANOTHER branch's pull request, so
 *      they appear on the base interleaved with commits the branch never had.
 *
 * ARM 3 IS NOT REDUNDANT WITH ARM 2, and the case that separates them is the
 * ordinary one. Once the base moves on and edits the same region again, a
 * three-way merge of the delivered branch CONFLICTS, so arm 2 answers `open`
 * for a branch whose every commit is demonstrably already upstream. Arm 3
 * answers it by patch id, which survives the later edit.
 *
 * ARM 2 IS NOT REDUNDANT WITH ARM 3 EITHER. A squash collapses N commits into
 * one, whose patch id is the id of the COMBINED diff and therefore equals no
 * individual commit's. For any branch of more than one commit, arm 3 sees only
 * unmatched commits and answers `open`.
 *
 * REUSE, NOT A SECOND IMPLEMENTATION (T-005). Arms 1 and 2 are
 * `landedness` at src/teardown.ts:123, the predicate `tiphys teardown` already
 * refuses on. A second copy here would be a second thing to keep true.
 *
 * INCONCLUSIVE IS NOT `open` AND IT IS NOT `delivered`. A git failure returns
 * `unknown`, which the caller counts as work remaining, because the one answer
 * this predicate must never invent is a confident one.
 */
export function deliveredElsewhere(
  contextDir: string,
  branchRef: string,
  baseRef: string,
): Delivery {
  const landed = landedness(contextDir, branchRef, baseRef);
  if (landed.kind === "landed") {
    return { kind: "delivered", how: landed.how };
  }
  if (landed.kind === "inconclusive") {
    return { kind: "unknown", detail: landed.detail };
  }
  return patchEquivalence(contextDir, branchRef, baseRef);
}

/**
 * Arm 3. `git cherry <base> <branch>` prints one line per commit the branch
 * carries that the base does not carry BY SHA, marked `-` when an equivalent
 * patch is already upstream and `+` when it is not. Every line `-` means the
 * base already has every patch this branch introduces.
 */
function patchEquivalence(
  contextDir: string,
  branchRef: string,
  baseRef: string,
): Delivery {
  const cherry = runGit(contextDir, ["cherry", baseRef, branchRef]);
  if (cherry.status !== 0) {
    return {
      kind: "unknown",
      detail: `git cherry exited ${String(cherry.status)}: ${singleLine(cherry.stderr)}`,
    };
  }
  const marks = cherry.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (marks.length === 0) {
    // A branch with nothing ahead of the base is an ancestor of it, so arm 1
    // should already have answered. Reaching here means the two readings
    // disagree, which is reported rather than resolved by guessing.
    return {
      kind: "unknown",
      detail:
        `git cherry reports no commit ahead of ${baseRef} while ` +
        `merge-base --is-ancestor reports ${branchRef} is not an ancestor of it`,
    };
  }
  return marks.every((line) => line.startsWith("-"))
    ? { kind: "delivered", how: "patch-equivalent" }
    : { kind: "open" };
}

/** One thing that is in flight, in the category that found it. */
export interface InFlightItem {
  category: "task" | "worktree" | "branch";
  what: string;
}

/**
 * Everything in flight in a fleet home, plus every candidate left unread, plus
 * the disclosures a reader needs to check the judgement rather than trust it.
 *
 * `notes` DOES NOT COUNT TOWARD THE EXIT CODE and that is deliberate. It
 * carries facts about HOW a judgement was made (which base ref each project's
 * branches were compared against, and by which rule that base was chosen), not
 * facts about whether work remains. Putting them in `unknown` would hold the
 * exit at `EXIT_WORK_REMAINS` forever; leaving them out is what let a clone
 * whose `origin/HEAD` points at a feature branch judge every branch against
 * that branch with nothing in the output saying so.
 */
export interface InFlight {
  items: InFlightItem[];
  unknown: string[];
  notes: string[];
}

/**
 * The line a task whose record did not read is reported as. Named rather than
 * inlined so that the one edit which reopens this defect, dropping the push,
 * is a single contiguous statement a witness can mutate without disturbing
 * anything else in the walk.
 */
function unreadableTaskRecord(id: string): string {
  return (
    `task ${id}: tasks/${id}/meta.json did not read as a task record ` +
    `(absent, not a regular file, not parseable, or missing a required ` +
    `field: src/task.ts:381 returns the same value for all four), so this ` +
    `task's status is not established and it is not evidence that the task ` +
    `finished`
  );
}

/**
 * Open tasks: `tasks/<id>/meta.json` carrying status `open`.
 *
 * THE UNREADABLE RECORD IS THE DANGEROUS ONE, NOT THE MISSING DIRECTORY. The
 * first version of this walk recorded an item only when the record read AND
 * said `open`, with no else arm, so a task directory whose meta.json did not
 * read landed in neither `items` nor `unknown`. Measured before the fix, with
 * one task directory and a truncated meta.json: `in flight: 0`, `unknown: 0`,
 * `NOTHING IS IN FLIGHT`, exit 0. A process killed mid-write is the ordinary
 * failure this repository keeps meeting, so that is T-036's own mechanism
 * inside the command written to prevent T-036.
 *
 * FOUR CAUSES COLLAPSE INTO ONE VALUE AND THE MESSAGE SAYS SO. `readTaskMeta`
 * (src/task.ts:381) returns `undefined` for an absent file, a file that is not
 * regular or could not be read, a body that does not parse, and a body that
 * parses and fails the field check. This walk does not re-read the file to
 * tell them apart: a second reader of a task record is a second thing to keep
 * true (T-005), and every one of the four means the same thing here, which is
 * that the task's status is NOT ESTABLISHED. The reported line names all four
 * rather than implying a diagnosis it did not make.
 */
function openTasks(fleet: Fleet, report: InFlight): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(fleet.tasksDir, { withFileTypes: true });
  } catch (error) {
    report.unknown.push(`tasks/ could not be listed: ${singleLine(String(error))}`);
    return;
  }
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const id = entry.name;
    if (!TASK_ID_PATTERN.test(id)) {
      // A DIRECTORY here is task-shaped storage whose name this command
      // cannot parse, so it is reported rather than dropped. A FILE is not:
      // `tiphys init` itself writes `tasks/.gitkeep`, and a fleet home that
      // reported its own scaffolding as unknown could never exit 0. That is
      // the line between an absence this walk established and one it merely
      // did not look at.
      if (entry.isDirectory()) {
        report.unknown.push(
          `tasks/${id}: a directory under tasks/ whose name is not a task id, ` +
            `so this command cannot read a task record from it and its status ` +
            `is not established`,
        );
      }
      continue;
    }
    const meta = readTaskMeta(fleet, id);
    if (meta === undefined) {
      report.unknown.push(unreadableTaskRecord(id));
      continue;
    }
    if (meta.status === "open") {
      report.items.push({ category: "task", what: `${id} (open)` });
    }
  }
}

/** Pool entries: a worktree, or an open task whose record did not survive. */
function poolEntries(fleet: Fleet, report: InFlight): void {
  let entries: ReturnType<typeof poolList>;
  try {
    entries = poolList(fleet);
  } catch (error) {
    report.unknown.push(`the pool could not be listed: ${singleLine(String(error))}`);
    return;
  }
  for (const entry of entries) {
    report.items.push({
      category: "worktree",
      what: `${entry.taskId} (${entry.origin}, head ${entry.headSha})`,
    });
  }
}

/**
 * The base ref a project clone's branches are judged against: whatever
 * `origin/HEAD` points at, then `origin/main`, then a local `main`. A clone
 * that answers none of them is UNKNOWN, never assumed, because a guessed base
 * sends the delivered-elsewhere predicate at the wrong ref (src/pool.ts:369
 * records the same refusal for the same reason).
 *
 * `origin/HEAD` CAN BE STALE AND THIS FUNCTION CANNOT TELL (round 1). Git
 * writes it once at clone time and never refreshes it, so a default-branch
 * rename upstream leaves it pointing at a branch that is no longer the
 * default, and a clone made while a feature branch was checked out upstream
 * points there from birth. Measured before round 1's fix: a clone whose
 * `origin/HEAD` pointed at `feat-open` judged every branch against
 * `feat-open`, found nothing open, and exited 0 while `git cherry
 * refs/remotes/origin/main refs/remotes/origin/feat-open` printed a commit on
 * no other ref.
 *
 * WHAT ROUND 1 DID AND DID NOT DO ABOUT IT, STATED EXACTLY, BECAUSE THE
 * OBVIOUS FIX DOES NOT WORK AND WAS MEASURED NOT TO.
 *
 * It did not make this function RESOLVE the stale case. I did not find a
 * signal inside a clone that establishes the upstream default branch: the
 * refresh (`git remote set-head origin --auto`) is a fetch, and the local
 * candidates I tried (`remote.origin.fetch`, `branch.<name>.remote`, a
 * preference for `origin/main`) either say nothing about the default or
 * replace an inherited guess with a typed one, which is the refusal
 * src/pool.ts:369 argues against. Whether such a signal exists is an open
 * question here, not a settled impossibility.
 *
 * AND THE BRANCH WALK DOES NOT RESCUE IT EITHER, WHICH I FOUND BY RUNNING IT.
 * The reasoning that it would went: with `refs/remotes/` now walked, the real
 * default branch is judged against the feature branch and comes back open.
 * Measured against a clone whose `origin/HEAD` pointed at `feat-open`, with
 * `feat-open` one commit AHEAD of `main`: `refs/remotes/origin/main` is an
 * ANCESTOR of the base, so it is reported delivered, and the command exited 0
 * with `in flight: 0`. The rescue only happens when the true default has
 * DIVERGED from the mis-pointed base, which is one shape of the fault and not
 * the common one.
 *
 * SO THE FIX IS DISCLOSURE PLUS A RECORDED DOUBT, AND BOTH ARE MECHANICAL.
 * `how` is returned and printed, so the base a judgement used is in the
 * output instead of being invisible. And when `origin/HEAD` points somewhere
 * that is NEITHER `origin/main` NOR `origin/master` WHILE ONE OF THOSE TWO
 * EXISTS IN THE SAME CLONE, two available signals DISAGREE, and the
 * disagreement goes into `unknown`, which holds the exit at
 * `EXIT_WORK_REMAINS`.
 *
 * THE DIFFERENCE BETWEEN THIS AND THE GUESS src/pool.ts:369 FORBIDS IS THE
 * DIRECTION. That refusal is about FILLING an unresolved field from a
 * plausible name, which produces a confident wrong answer. Nothing here is
 * filled: the base stays whatever `origin/HEAD` said, and a name-shaped
 * observation is used only to RAISE A DOUBT, whose worst case is a project
 * whose genuine default is neither of those two names while a stale `main`
 * survives beside it. That project is reported unknown and never exits 0
 * until someone looks, which is a false positive in the one direction this
 * command is built to fail in.
 */
const CONVENTIONAL_DEFAULTS = ["refs/remotes/origin/main", "refs/remotes/origin/master"];

export function baseRefOf(
  projectDir: string,
):
  | { ok: true; ref: string; how: string; doubt?: string }
  | { ok: false; reason: string } {
  const head = runGit(projectDir, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  const pointed = head.stdout.trim();
  if (head.status === 0 && pointed !== "") {
    if (!CONVENTIONAL_DEFAULTS.includes(pointed)) {
      for (const rival of CONVENTIONAL_DEFAULTS) {
        const verified = runGit(projectDir, ["rev-parse", "--verify", "--quiet", rival]);
        if (verified.status === 0 && verified.stdout.trim() !== "") {
          return {
            ok: true,
            ref: pointed,
            how: "origin/HEAD",
            doubt:
              `origin/HEAD points at ${pointed} while ${rival} also exists in ` +
              `this clone, so two signals disagree about which branch is the ` +
              `default and every delivery judgement below rests on the one ` +
              `git wrote at clone time and never refreshed. Settle it with ` +
              `git remote set-head origin --auto, which needs the network ` +
              `this command does not use`,
          };
        }
      }
    }
    return { ok: true, ref: pointed, how: "origin/HEAD" };
  }
  for (const candidate of ["refs/remotes/origin/main", "refs/heads/main"]) {
    const verified = runGit(projectDir, ["rev-parse", "--verify", "--quiet", candidate]);
    if (verified.status === 0 && verified.stdout.trim() !== "") {
      return { ok: true, ref: candidate, how: `${candidate} resolves` };
    }
  }
  return {
    ok: false,
    reason:
      "neither origin/HEAD nor origin/main nor a local main resolves, so there is " +
      "no base ref to judge delivery against",
  };
}

/**
 * Undelivered branches in every project clone under `projects/`, LOCAL AND
 * REMOTE-TRACKING ALIKE.
 *
 * WHY REMOTE-TRACKING REFS ARE WALKED (round 1). The first version listed
 * `refs/heads/` only. A clone is what `tiphys init` and `tiphys resume`
 * produce, and in a fresh clone every branch except the checked-out one exists
 * ONLY under `refs/remotes/`, so the normal state of a project was a branch
 * category that was empty by construction and reported as empty by
 * observation. Measured before the fix, against a clone of an upstream
 * carrying one undelivered branch: `in flight: 0`, `unknown: 0`, `NOTHING IS
 * IN FLIGHT`, exit 0.
 *
 * THREE EXCLUSIONS, AND EACH IS AN ESTABLISHED ABSENCE RATHER THAN A DROP.
 *
 *   - THE BASE REF ITSELF. Judging the base against the base answers nothing.
 *   - A SYMBOLIC REF. `refs/remotes/origin/HEAD` is a POINTER at another ref
 *     in the same walk, so its target is judged on its own line and counting
 *     it twice would report one branch as two. Detected from
 *     `%(symref)` rather than by matching the name `HEAD`, because the name is
 *     a convention and the field is the fact.
 *   - A REF AT AN OBJECT ALREADY JUDGED. `refs/heads/feat` and
 *     `refs/remotes/origin/feat` at the same sha are one piece of work seen
 *     twice. Deduplicated by object name, which is what makes them the same
 *     commit; when the two disagree they have different object names and both
 *     are judged, which is correct, because a local branch ahead of its remote
 *     is a different in-flight state from the remote's.
 */
function undeliveredBranches(fleet: Fleet, report: InFlight): void {
  let projects: string[];
  try {
    // A SYMLINK IS A PROJECT AND `Dirent.isDirectory()` SAYS IT IS NOT. The
    // dirent reflects an lstat, so a project clone reached through a symlink
    // under `projects/` was filtered out of the walk entirely, and every
    // branch in it, local or remote, was invisible. Measured before the fix:
    // `projects/demo -> .../elsewhere/demo`, one undelivered branch inside,
    // `in flight: 0`, `unknown: 0`, exit 0. `statSync` FOLLOWS, which is the
    // question being asked, and an entry that resolves to no directory is
    // reported rather than skipped: `projects/` is empty on a fresh fleet
    // home (measured: `tiphys init` creates it with nothing in it), so
    // nothing legitimate lands in `unknown` for it.
    projects = readdirSync(fleet.projectsDir, { withFileTypes: true })
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    report.unknown.push(`projects/ could not be listed: ${singleLine(String(error))}`);
    return;
  }
  for (const project of projects) {
    const dir = join(fleet.projectsDir, project);
    let isDir: boolean;
    try {
      isDir = statSync(dir).isDirectory();
    } catch (error) {
      report.unknown.push(
        `project ${project}: projects/${project} could not be resolved ` +
          `(${singleLine(String(error))}), so no branch in it can be judged ` +
          `delivered or open`,
      );
      continue;
    }
    if (!isDir) {
      report.unknown.push(
        `project ${project}: projects/${project} does not resolve to a ` +
          `directory, so no branch in it can be judged delivered or open`,
      );
      continue;
    }

    // THE DIRECTORY MUST BE ITS OWN REPOSITORY, AND THIS CHECK IS NOT
    // CEREMONY. A fleet home IS a git repository, so `git -C projects/foo`
    // inside a directory that is not a clone resolves against the FLEET's
    // repository instead of failing: `refs/heads/main` verifies, the branch
    // walk lists the fleet's own branches, and a project nobody could read is
    // reported as having nothing in flight. Measured while writing this
    // phase's own test, which is why it is a refusal rather than a comment.
    // Compared with `pathsIdentifySameObject` because git canonicalises the
    // path it prints and a string comparison answers no for two spellings of
    // one directory (src/path-identity.ts:5).
    const toplevel = runGit(dir, ["rev-parse", "--show-toplevel"]);
    if (toplevel.status !== 0 || !pathsIdentifySameObject(toplevel.stdout.trim(), dir)) {
      report.unknown.push(
        `project ${project}: not the top level of its own git repository ` +
          `(git rev-parse --show-toplevel exited ${String(toplevel.status)} and ` +
          `reported ${singleLine(toplevel.stdout) || "nothing"}), so no branch ` +
          `in it can be judged delivered or open`,
      );
      continue;
    }

    const base = baseRefOf(dir);
    if (!base.ok) {
      report.unknown.push(`project ${project}: ${base.reason}`);
      continue;
    }
    report.notes.push(
      `project ${project}: branches judged against ${base.ref} (chosen by ${base.how})`,
    );
    if (base.doubt !== undefined) {
      report.unknown.push(`project ${project}: ${base.doubt}`);
    }
    const listed = runGit(dir, [
      "for-each-ref",
      "--format=%(objectname) %(refname) %(symref)",
      "refs/heads/",
      "refs/remotes/",
    ]);
    if (listed.status !== 0) {
      report.unknown.push(
        `project ${project}: branches could not be listed: ${singleLine(listed.stderr)}`,
      );
      continue;
    }
    const judgedObjects = new Set<string>();
    for (const line of listed.stdout.split("\n")) {
      const fields = line.trim().split(/\s+/);
      const objectname = fields[0] ?? "";
      const ref = fields[1] ?? "";
      const symref = fields[2] ?? "";
      if (objectname === "" || ref === "") {
        continue;
      }
      if (symref !== "" || ref === base.ref || judgedObjects.has(objectname)) {
        continue;
      }
      judgedObjects.add(objectname);
      const delivery = deliveredElsewhere(dir, ref, base.ref);
      if (delivery.kind === "open") {
        report.items.push({ category: "branch", what: `${ref} in project ${project}` });
      } else if (delivery.kind === "unknown") {
        report.unknown.push(`project ${project}: ${ref}: ${delivery.detail}`);
      }
    }
  }
}

/**
 * Every in-flight category in a fleet home, in dependency order: the task
 * record, the checkout it owns, and the branch that outlives both.
 */
export function collectInFlight(fleet: Fleet): InFlight {
  const report: InFlight = { items: [], unknown: [], notes: [] };
  openTasks(fleet, report);
  poolEntries(fleet, report);
  undeliveredBranches(fleet, report);
  return report;
}

/**
 * THE ONE NEXT ACTION (criterion 1). Exactly one, chosen by the first
 * non-empty category in the order above, so the answer is derived from the
 * report rather than picked.
 */
export function nextAction(report: InFlight): string {
  const unread = report.unknown[0];
  if (unread !== undefined) {
    return `MEASURE the category this command could not read: ${unread}`;
  }
  const task = report.items.find((item) => item.category === "task");
  if (task !== undefined) {
    return `CLOSE OR REPORT task ${task.what}, the first open task in this fleet home`;
  }
  const worktree = report.items.find((item) => item.category === "worktree");
  if (worktree !== undefined) {
    return `TEAR DOWN ${worktree.what}, which still holds a checkout`;
  }
  const branch = report.items.find((item) => item.category === "branch");
  if (branch !== undefined) {
    return `DELIVER OR RETIRE ${branch.what}, whose commits are not on its base by any route`;
  }
  return (
    "NOTHING IS IN FLIGHT in this fleet home. That is not the same sentence as " +
    "'the work is done'; read the cannot-see list above before concluding it"
  );
}

/** The cannot-see block. Unconditional, and it probes nothing to build. */
export function cannotSeeBlock(): string[] {
  const lines = [CANNOT_SEE_HEADING];
  for (const item of CANNOT_SEE) {
    lines.push(`  - ${item}`);
  }
  return lines;
}

/** The whole report, as lines, with exactly one `next action:` line. */
export function renderReport(fleet: Fleet, report: InFlight): string[] {
  const lines = [`fleet ${fleet.root}`];
  lines.push(`in flight: ${String(report.items.length)}`);
  for (const item of report.items) {
    lines.push(`  ${item.category} ${item.what}`);
  }
  lines.push(`unknown: ${String(report.unknown.length)}`);
  for (const detail of report.unknown) {
    lines.push(`  ${detail}`);
  }
  // DISCLOSURES, NOT WORK. Printed between the two counted categories and the
  // cannot-see block because that is where a reader decides whether to believe
  // the counts: the base ref a project's branches were judged against is the
  // input the delivered-elsewhere predicate cannot check for itself.
  lines.push(`base refs: ${String(report.notes.length)}`);
  for (const note of report.notes) {
    lines.push(`  ${note}`);
  }
  lines.push(...cannotSeeBlock());
  lines.push(`next action: ${nextAction(report)}`);
  return lines;
}

/** Work remains whenever anything is in flight OR anything could not be read. */
export function exitCodeFor(report: InFlight): number {
  return report.items.length + report.unknown.length > 0 ? EXIT_WORK_REMAINS : 0;
}

export function cmdNext(args: string[]): number {
  if (args.length > 0) {
    process.stderr.write(`${USAGE}\n`);
    return EX_USAGE;
  }
  let fleet: Fleet;
  try {
    fleet = loadFleet(process.cwd());
  } catch (error) {
    process.stderr.write(`tiphys next: ${singleLine((error as Error).message)}\n`);
    return 1;
  }
  const report = collectInFlight(fleet);
  const code = exitCodeFor(report);
  const lines = renderReport(fleet, report);
  lines.push(
    `exit ${String(code)} (0 means every in-flight category is empty, ` +
      `${String(EXIT_WORK_REMAINS)} means work remains, 1 means this command failed)`,
  );
  process.stdout.write(`${lines.join("\n")}\n`);
  return code;
}
