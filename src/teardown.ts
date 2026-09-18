import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { MACHINE_IDENTITY_EMAIL, MACHINE_IDENTITY_NAME } from "./commands/init.ts";
import { guardSharedRegister } from "./exclusion.ts";
import type { Fleet } from "./fleet.ts";
import {
  poolDestroy,
  readPoolRecord,
  reconstructPoolRecord,
  worktreePath,
} from "./pool.ts";
import type { PoolRecord } from "./pool.ts";
import {
  checkHoldership,
  metaPath,
  readTaskMeta,
  reportPath,
  runStep,
  setTaskStatus,
  singleLine,
} from "./task.ts";
import type { TaskMeta } from "./task.ts";

/**
 * tiphys teardown (kernel plan v1, M1-P4 step 5): the guard that stands
 * between a finished task and the removal of its worktree.
 *
 * The rules, checked in the plan's order:
 *
 *   0. Holdership (PR-203), the same check spawn performs, through the
 *      same M1-P3 transport (lock acquire prints the holderId, the
 *      operator carries it in TIPHYS_HOLDER_ID). No second mechanism.
 *   1. FETCH FIRST. Every landed-ness question is answered against the
 *      freshly fetched default branch of the project's remote, never
 *      against a local ref that may be stale (PR-001). A fetch that
 *      fails refuses: fail closed, because "I could not check" is not
 *      "it is landed".
 *   2. shape scout: refuse unless tasks/<id>/report.md exists. With a
 *      report, the scratch worktree is discarded (pool destroy
 *      --discard) and teardown proceeds. Scouts never push (PR-010).
 *   3. shape ship: refuse a dirty worktree unless --salvage, and refuse
 *      unless the task branch is landed on the fetched default branch.
 *      Landed means either the branch head is an ancestor of the fetched
 *      default head, or merging the branch into it is a no-op:
 *      git merge-tree --write-tree produces exactly the fetched default
 *      head's tree with no conflicts. The second definition recognizes a
 *      SQUASH merge regardless of how many commits the branch carries,
 *      and squash is this process's own merge practice (PR-001, prior
 *      art FM-035 and FM-038). Fail-closed is adopted verbatim: any
 *      inconclusive check refuses rather than guessing.
 *   4. On success: pool destroy, then meta status closed.
 *
 * WHY THE SALVAGE COMMIT HAPPENS AFTER THE LANDED CHECK, not at the
 * point the plan's prose used to mention it: a salvage commit is by
 * construction NOT landed (it introduces content the default branch does
 * not have), so committing it before the landed check would make the
 * check fail for every salvage and criterion 8's "after the branch is
 * landed and the tree is dirty, teardown --salvage exits 0" could never
 * hold. The plan's step 5 clause (b) has since been corrected to this
 * explicit order. Deciding first and acting afterwards also bounds what a
 * nonzero exit can leave behind, and the honest form of that claim is
 * narrow (CR-302): EVERY REFUSAL THAT PRECEDES THE SALVAGE STEP is a
 * true no-op, making no commit, no push and no removal. The one nonzero
 * exit that can leave a change behind is a salvage whose push fails: the
 * leavings are already committed locally, nothing is destroyed, and the
 * reason line says exactly that. --salvage rescues uncommitted leavings;
 * it never overrides the unlanded refusal.
 *
 * REFUSAL VERSUS PARTIAL FAILURE. Teardown drives pool destroy, whose
 * two failure kinds mean opposite things (see the destroy contract in
 * src/pool.ts): a stage-2 REFUSAL is a true no-op, while a stage-3
 * PARTIAL FAILURE has already removed the worktree and enumerates what
 * survives. This module therefore never wraps a destroy failure in
 * refusal language and never claims that nothing changed; it surfaces
 * the destroy's own reason verbatim and adds only what it knows for
 * certain, which is that the task is still open.
 */

interface GitRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Local git runner. It is deliberately not the pool's: src/pool.ts is
 * explicitly out of this phase's edit scope, and teardown needs no
 * contention retry, because nothing in M1 runs teardown concurrently
 * with anything else (parallelism is off until M5). The locale is pinned
 * for the same reason the pool pins it: reproducible output.
 */
function runGit(cwd: string, args: string[], extraEnv?: Record<string, string>): GitRun {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C", ...extraEnv },
  });
  if (result.error !== undefined) {
    return { status: null, stdout: "", stderr: String(result.error) };
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** The commit-message prefix every salvaged commit carries (R-081a). */
export const SALVAGE_PREFIX = "WIP-UNREVIEWED (do not treat as reviewed):";

export type TeardownResult =
  | { ok: true; value: { taskId: string; salvaged: boolean } }
  | { ok: false; reason: string };

export type Landedness =
  | { kind: "landed"; how: "ancestor" | "squash" }
  | { kind: "unlanded" }
  | { kind: "inconclusive"; detail: string };

/**
 * Is branchRef landed on defaultRef? Both are resolved in contextDir,
 * and defaultRef is always the just-fetched remote-tracking ref.
 */
export function landedness(
  contextDir: string,
  branchRef: string,
  defaultRef: string,
): Landedness {
  const ancestor = runGit(contextDir, [
    "merge-base",
    "--is-ancestor",
    branchRef,
    defaultRef,
  ]);
  if (ancestor.status === 0) {
    return { kind: "landed", how: "ancestor" };
  }
  if (ancestor.status !== 1) {
    return {
      kind: "inconclusive",
      detail: `git merge-base --is-ancestor exited ${String(ancestor.status)}: ${singleLine(ancestor.stderr)}`,
    };
  }

  const defaultTree = runGit(contextDir, ["rev-parse", "--verify", `${defaultRef}^{tree}`]);
  if (defaultTree.status !== 0) {
    return {
      kind: "inconclusive",
      detail: `cannot resolve the tree of ${defaultRef}: ${singleLine(defaultTree.stderr)}`,
    };
  }
  const merged = runGit(contextDir, ["merge-tree", "--write-tree", defaultRef, branchRef]);
  if (merged.status === 1) {
    // Conflicts: merging is not a no-op, so the branch is not landed.
    return { kind: "unlanded" };
  }
  if (merged.status !== 0) {
    return {
      kind: "inconclusive",
      detail: `git merge-tree --write-tree exited ${String(merged.status)}: ${singleLine(merged.stderr)}`,
    };
  }
  const mergedTree = merged.stdout.split("\n")[0]?.trim() ?? "";
  if (mergedTree === "") {
    return {
      kind: "inconclusive",
      detail: "git merge-tree --write-tree produced no tree id",
    };
  }
  return mergedTree === defaultTree.stdout.trim()
    ? { kind: "landed", how: "squash" }
    : { kind: "unlanded" };
}

export interface TeardownOptions {
  taskId: string;
  salvage: boolean;
  /**
   * Proceed on a pool record RECONSTRUCTED from tasks/<id>/meta.json and
   * git, when worktrees/<id>.pool.json did not survive a reclaim
   * (M4-P19, M4-D-12). See the FROM-RECONSTRUCTED header below for what
   * this flag does and, more importantly, what it does NOT do.
   */
  fromReconstructed: boolean;
}

/**
 * FROM-RECONSTRUCTED: WHAT THE FLAG AUTHORIZES, AND WHAT IT DOES NOT.
 *
 * It authorizes exactly ONE thing: deriving the two fields meta.json does
 * not carry, `remote` and `branch`, from git instead of reading them from
 * a pool record that no longer exists. That is all.
 *
 * IT IS NOT A DESTRUCTION OVERRIDE, and this sentence is here because the
 * two flags it sits beside ARE ones. `--discard` overrides the dirty-tree
 * refusal and `--delete-branch-force` overrides the unlanded-branch
 * refusal, so "mirrors the existing explicit-destruction pattern" reads
 * as an invitation to pass both of them through on this path, with the
 * reasoning that there is no record so nothing can be checked. That
 * reasoning is exactly wrong, and it is the dangerous state this phase's
 * red witnesses redden against: the record is the ONE input that was
 * lost, every other input to every refusal survives, and a reconstructed
 * record makes the gates MORE able to judge, not less. So no refusal that
 * applies to a task with an original record is weakened here, and the
 * refusals are enumerated PER SHAPE rather than as one sentence about
 * "a task", because the two shapes do not have the same refusal set and
 * an earlier revision of this header said they did (M4-P19 fix round,
 * finding F-5: it claimed "a dirty worktree is refused without --salvage,
 * as ever", which was true of a ship and false of a scout, and the scout
 * arm below discarded the tree):
 *
 *   ship
 *     - a dirty worktree is refused without --salvage, as on the
 *       with-record path;
 *     - an unlanded branch is refused, as on the with-record path, and
 *       the refusal names the branch tip so the operator has the
 *       recovery handle (V-1).
 *   scout
 *     - a dirty worktree is refused OUTRIGHT, with no --salvage escape,
 *       which is STRICTER than the with-record path rather than equal to
 *       it. The reasoning is at the check itself, in the scout arm of
 *       `teardownTask`, not summarised here.
 *     - commits on the scratch branch are refused naming tip and base,
 *       as on the with-record path.
 *   both shapes
 *     - a field git cannot answer for is named and the command refuses,
 *       rather than being filled with "origin" and "main".
 *
 * A SHAPE ADDED TO `TaskShape` LATER TAKES NO REFUSAL FROM THIS LIST. It
 * gets whichever arm of `teardownTask` it falls into, and this comment
 * is not a specification that would give it one.
 *
 * A reconstruction is also never persisted. It is passed to pool destroy
 * in memory (DestroyOptions.reconstructed) and no file is created, so a
 * later reader cannot mistake it for an original record.
 */
interface TeardownContext {
  meta: TaskMeta;
  record: PoolRecord;
  /** True when `record` was rebuilt rather than read from disk (M4-P19). */
  reconstructed: boolean;
  worktree: string;
  defaultRef: string;
}

/**
 * Resolve everything teardown needs, and perform the mandatory fetch.
 * Read-only with respect to the task: the fetch updates only the
 * project's remote-tracking ref.
 */
function resolveContext(
  fleet: Fleet,
  taskId: string,
  fromReconstructed: boolean,
): { ok: true; value: TeardownContext } | { ok: false; reason: string } {
  const meta = readTaskMeta(fleet, taskId);
  if (meta === undefined) {
    return {
      ok: false,
      reason: `no readable task meta for task id ${taskId}; teardown needs tasks/${taskId}/meta.json`,
    };
  }
  let record = readPoolRecord(fleet, taskId);
  let reconstructed = false;
  if (record === undefined) {
    if (!fromReconstructed) {
      return {
        ok: false,
        reason:
          `no readable pool record for task id ${taskId}; teardown needs it for the ` +
          `project remote and default branch, and refuses rather than guessing them; ` +
          `pass --from-reconstructed to rebuild them from tasks/${taskId}/meta.json ` +
          `and git, which keeps every other refusal in force`,
      };
    }
    // NETWORK ALLOWED here and nowhere else in this kernel's
    // reconstruction (M4-P19 fix round). Teardown is a command the
    // operator invoked in order to destroy something, it is about to
    // fetch from this remote on the next line regardless, and it is
    // allowed to take as long as that fetch takes. `pool list` and
    // doctor are not, and they pass `{ network: false }`.
    const rebuilt = reconstructPoolRecord(fleet, taskId, { network: true });
    if (rebuilt.kind === "absent") {
      return {
        ok: false,
        reason: `cannot reconstruct the pool record for task id ${taskId}: ${rebuilt.reason}`,
      };
    }
    if (rebuilt.kind === "incomplete") {
      // The missing FIELD is named, not merely the failure, because the
      // remedy differs per field: `remote` is a git configuration repair
      // in the clone, `branch` is usually an origin/HEAD that was never
      // set or a remote that cannot be reached to advertise it.
      return {
        ok: false,
        reason:
          `cannot reconstruct the pool record for task id ${taskId}: unresolved ` +
          `field(s) ${rebuilt.unresolved.join(", ")} (${rebuilt.detail}); teardown ` +
          `refuses rather than guessing them`,
      };
    }
    record = rebuilt.record;
    reconstructed = true;
  }
  const worktree = worktreePath(fleet, taskId);
  const defaultRef = `refs/remotes/${record.remote}/${record.branch}`;
  // PR-001: fetch first, always, and judge landed-ness only against this.
  const fetched = runGit(record.project, [
    "fetch",
    record.remote,
    `+refs/heads/${record.branch}:${defaultRef}`,
  ]);
  if (fetched.status !== 0) {
    return {
      ok: false,
      reason:
        `fetch of ${record.remote}/${record.branch} failed, so landed-ness cannot ` +
        `be judged against fresh remote state: ${singleLine(fetched.stderr)}`,
    };
  }
  return { ok: true, value: { meta, record, reconstructed, worktree, defaultRef } };
}

/** Uncommitted changes or untracked files in the task worktree. */
function worktreeDirty(worktree: string): { ok: true; dirty: boolean } | { ok: false; reason: string } {
  const status = runGit(worktree, ["status", "--porcelain"]);
  if (status.status !== 0) {
    return {
      ok: false,
      reason: `cannot verify worktree cleanliness at ${worktree}: ${singleLine(status.stderr)}`,
    };
  }
  return { ok: true, dirty: status.stdout.trim() !== "" };
}

/** Commit the leavings under the WIP label and push the branch (R-081a). */
function salvageLeavings(context: TeardownContext): { ok: true } | { ok: false; reason: string } {
  const { worktree, record } = context;
  const added = runGit(worktree, ["add", "-A"]);
  if (added.status !== 0) {
    return { ok: false, reason: `salvage failed at git add: ${singleLine(added.stderr)}` };
  }
  const message = `${SALVAGE_PREFIX} leavings salvaged by tiphys teardown for task ${context.meta.id}`;
  // CI runners have no git identity, and the fleet never reads or writes
  // user or global git configuration (EXT-F-02 option B): the machine
  // identity is set command-scoped, exactly as init's bootstrap commit
  // does it.
  const committed = runGit(worktree, ["commit", "-m", message], {
    GIT_AUTHOR_NAME: MACHINE_IDENTITY_NAME,
    GIT_AUTHOR_EMAIL: MACHINE_IDENTITY_EMAIL,
    GIT_COMMITTER_NAME: MACHINE_IDENTITY_NAME,
    GIT_COMMITTER_EMAIL: MACHINE_IDENTITY_EMAIL,
  });
  if (committed.status !== 0) {
    return {
      ok: false,
      reason: `salvage failed at git commit: ${singleLine(committed.stderr) || singleLine(committed.stdout)}`,
    };
  }
  const pushed = runGit(record.project, [
    "push",
    record.remote,
    `refs/heads/${record.branchName}:refs/heads/${record.branchName}`,
  ]);
  if (pushed.status !== 0) {
    return {
      ok: false,
      reason:
        `salvage committed the leavings as "${SALVAGE_PREFIX} ..." but the push of ` +
        `${record.branchName} failed: ${singleLine(pushed.stderr)}; the commit is local only`,
    };
  }
  return { ok: true };
}

/**
 * Remove the worktree and close the task. Never called before every
 * refusal rule has passed.
 */
async function finish(
  fleet: Fleet,
  context: TeardownContext,
  options: { discard: boolean; deleteBranchForce: boolean; salvaged: boolean },
): Promise<TeardownResult> {
  const destroyed = await poolDestroy(fleet, {
    taskId: context.meta.id,
    discard: options.discard,
    deleteBranchForce: options.deleteBranchForce,
    // M4-P19: in memory only, and only when the record was rebuilt. This
    // makes the destroy's own base-sha gate ABLE to judge instead of
    // abstaining with its "pool record missing" refusal; it does not
    // create a file and it does not relax a gate.
    ...(context.reconstructed ? { reconstructed: context.record } : {}),
  });
  if (!destroyed.ok) {
    // The destroy's own reason distinguishes a stage-2 refusal (a true
    // no-op) from a stage-3 partial failure (worktree already removed,
    // survivors enumerated). It is passed through verbatim, and the only
    // thing added is what this layer knows for certain.
    return {
      ok: false,
      reason: `pool destroy did not complete: ${destroyed.reason}; task ${context.meta.id} stays open`,
    };
  }

  // F-1. The worktree is GONE by this point, so a raised write here is
  // not a refusal and must never crash the command: an uncaught throw
  // left meta.json reading "open" beside a worktree that no longer
  // exists, which is the single state authority (C-1) telling a later
  // reader, and the M1-P5 watcher, something false. It is the same
  // partial-failure shape M1-P3 defined for destroy, reported in the
  // same vocabulary, with the manual remedy named.
  const closed = runStep(`marking task ${context.meta.id} closed`, () => {
    setTaskStatus(fleet, context.meta, "closed");
  });
  if (!closed.ok) {
    const removed =
      destroyed.value.deletedBranch === undefined
        ? `worktree ${context.worktree} HAS BEEN REMOVED`
        : `worktree ${context.worktree} HAS BEEN REMOVED and branch ` +
          `${destroyed.value.deletedBranch} was deleted (it was ` +
          `${destroyed.value.deletedSha ?? "unknown"})`;
    return {
      ok: false,
      reason:
        `partial teardown of task id ${context.meta.id}: ${removed}, but ` +
        `${metaPath(fleet, context.meta.id)} could not be marked closed ` +
        `(${closed.reason}); the task record still reads status open although its ` +
        `worktree is gone, so repair that file and set "status": "closed" by hand`,
    };
  }
  return { ok: true, value: { taskId: context.meta.id, salvaged: options.salvaged } };
}

export async function teardownTask(
  fleet: Fleet,
  options: TeardownOptions,
): Promise<TeardownResult> {
  const holdership = checkHoldership(fleet);
  if (!holdership.ok) {
    return { ok: false, reason: holdership.reason };
  }

  /* THE CROSS-ENVIRONMENT HALF (M4-P22 criterion 3), rule 0's second limb.
     `checkHoldership` above returns OK when this environment holds the local
     lease, and the local lease is evidence about this filesystem alone
     (src/lock.ts:63). With the shared register naming another environment,
     the old guard is green and teardown would remove a worktree the other
     orchestrator is working in. One reason line, nonzero exit, and NOTHING
     REMOVED: it runs before `resolveContext`, so no pool record is read, no
     worktree is probed and no branch is deleted. A teardown that refuses
     after deleting something has failed in the way that matters. */
  const sharedGuard = guardSharedRegister(fleet.root, "teardown");
  if (sharedGuard.kind === "refused") {
    return { ok: false, reason: sharedGuard.reason };
  }

  const resolved = resolveContext(fleet, options.taskId, options.fromReconstructed);
  if (!resolved.ok) {
    return resolved;
  }
  const context = resolved.value;
  const { meta, record, worktree } = context;

  if (meta.shape === "scout") {
    // M4-P19 FIX ROUND, finding F-5. THE RECONSTRUCTED PATH IS STRICTER
    // THAN THE WITH-RECORD PATH FOR A SCOUT, DELIBERATELY.
    //
    // The scout arm below discards a dirty scratch tree by design
    // (PR-010: a scout is judged by its report and never pushes), and it
    // reaches `finish` without ever probing cleanliness. That was
    // reachable only by an operator who had the pool record in front of
    // them. This phase made it reachable from a RECLAIM, where the
    // record is the one thing that did not survive, and measured at head
    // abde402: `teardown --task s1 --from-reconstructed` against a scout
    // worktree holding ` M readme.md` and `?? important.md` exited 0 and
    // removed the worktree, where the same fixture on the phase base
    // exited 1 and left it standing. Plan criterion 4 states the refusal
    // with no shape qualifier, so the plan is what is followed here.
    //
    // WHY NOT INSTEAD MAKE THE WITH-RECORD SCOUT PATH REFUSE TOO. That
    // is a change to a decided scout policy (PR-010) which this phase
    // does not own and which the plan does not ask for. The asymmetry is
    // therefore REAL and is stated rather than smoothed over: the
    // difference in force is the difference in what the operator knows.
    // With the record present they are tearing down a scout they are
    // tracking; arriving here from a reclaim they are recovering a fleet
    // whose bookkeeping is already known to be incomplete, and the
    // leavings in that tree may be the only copy.
    //
    // --salvage is NOT the escape, because salvage pushes (PR-010: a
    // scout never pushes), so the remedy named is the one that works.
    if (context.reconstructed) {
      const scoutDirty = worktreeDirty(worktree);
      if (!scoutDirty.ok) {
        return { ok: false, reason: scoutDirty.reason };
      }
      if (scoutDirty.dirty) {
        return {
          ok: false,
          reason:
            `scout worktree ${worktree} has uncommitted changes or untracked ` +
            `files and its pool record did not survive, so teardown is running ` +
            `on a reconstruction and refuses to discard them: copy anything ` +
            `worth keeping out of ${worktree}, then re-run once ` +
            `"git -C ${worktree} status --porcelain" is empty`,
        };
      }
    }
    // (a) A scout is judged by its report, never by its scratch tree.
    if (!existsSync(reportPath(fleet, options.taskId))) {
      return {
        ok: false,
        reason:
          `scout task ${options.taskId} has no report: ${reportPath(fleet, options.taskId)} ` +
          `is absent, and a scout is torn down only once it has reported`,
      };
    }
    // Scout worktrees are scratch and scouts never push (PR-010), so the
    // dirty tree is discarded. --delete-branch-force is deliberately NOT
    // passed: --discard's plan-defined meaning is the dirty-tree
    // override only, and a scout that committed to its scratch branch is
    // refused rather than having those commits deleted silently, which is
    // exactly the M1-P3 V-1 defect.
    //
    // CR-304: teardown answers that question ITSELF, before calling
    // destroy, because the pool's own refusal advises passing
    // --delete-branch-force, a flag teardown does not accept, so the
    // operator was told to do something impossible through the command
    // that printed it and the task could never reach closed. This
    // refusal is a true no-op and names a route that works; the pool's
    // gate stays behind it as the enforcer.
    const tip = runGit(record.project, [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${record.branchName}^{commit}`,
    ]);
    if (tip.status === 0 && tip.stdout.trim() !== record.baseSha) {
      return {
        ok: false,
        reason:
          `scout task ${options.taskId} has commits on its scratch branch ` +
          `${record.branchName} (tip ${tip.stdout.trim()}, base ${record.baseSha}) and ` +
          `teardown never deletes committed work: copy or push them somewhere ` +
          `durable, then release the branch with "git -C ${record.project} update-ref ` +
          `refs/heads/${record.branchName} ${record.baseSha}" and re-run teardown`,
      };
    }
    return finish(fleet, context, {
      discard: true,
      deleteBranchForce: false,
      salvaged: false,
    });
  }

  // (b) ship.
  const dirty = worktreeDirty(worktree);
  if (!dirty.ok) {
    return { ok: false, reason: dirty.reason };
  }
  if (dirty.dirty && !options.salvage) {
    return {
      ok: false,
      reason:
        `worktree ${worktree} has uncommitted changes or untracked files; commit ` +
        `or land them first, or pass --salvage to commit them as ` +
        `"${SALVAGE_PREFIX} ..." and push`,
    };
  }

  const branchRef = `refs/heads/${record.branchName}`;
  const landed = landedness(record.project, branchRef, context.defaultRef);
  if (landed.kind === "inconclusive") {
    return {
      ok: false,
      reason:
        `cannot determine whether ${record.branchName} is landed on ` +
        `${record.remote}/${record.branch} (${landed.detail}); refusing`,
    };
  }
  if (landed.kind === "unlanded") {
    // M4-P19 criterion 5: the refusal NAMES THE TIP. That sha is the
    // operator's recovery handle, exactly as the deleted-branch sha is on
    // the success path (V-1), and it is the one fact that makes this
    // refusal actionable: it says which commit is at risk, not merely
    // that something is. It is named on every unlanded refusal rather
    // than only the reconstructed one, so there is one message and not
    // two that can drift apart.
    const tip = runGit(record.project, [
      "rev-parse",
      "--verify",
      "--quiet",
      `${branchRef}^{commit}`,
    ]);
    const tipSha = tip.status === 0 ? tip.stdout.trim() : "unresolvable";
    return {
      ok: false,
      reason:
        `branch ${record.branchName} (tip ${tipSha}) is not landed on ` +
        `${record.remote}/${record.branch}; land it before tearing the task down` +
        (options.salvage ? " (--salvage rescues leavings, it never lands work)" : ""),
    };
  }

  let salvaged = false;
  if (dirty.dirty) {
    const rescue = salvageLeavings(context);
    if (!rescue.ok) {
      return rescue;
    }
    salvaged = true;
  }

  // The landed judgement is what authorizes deleting the task branch
  // (V-1's explicit flag, which src/pool.ts documents as coming from
  // exactly here). After a salvage the branch carries the WIP commit,
  // which is on the remote, so the local branch is safe to remove.
  return finish(fleet, context, {
    discard: false,
    deleteBranchForce: true,
    salvaged,
  });
}
