# Pipeline state

The single place that answers "where are we right now". Update it whenever
a phase changes state, a decision is answered, or an owner action becomes
runnable. If this file disagrees with reality, reality wins and this file
is wrong: verify against git and the PR list before trusting it.

- as of: 2026-08-04
- milestone: M1 (walking skeleton), in progress
- plan: `delivery/plan/kernel-plan-v1.md` revision 7, owner-approved
- assurance mode: full (adversarial pipeline, owner merges)

## How to resume cold

1. Read `CLAUDE.md`, then this file.
2. `git fetch origin main` and check what is actually merged.
3. Check open PRs and their CI state.
4. Read the newest files in `delivery/review/` and `delivery/tuition/`;
   they carry the most recent hard-won knowledge.
5. Pick up from the "in flight" section below, using the
   `phase-delivery` skill.

## Phases

| Phase | State | PR | Notes |
|---|---|---|---|
| M1-P1 scaffold and CI | merged | #1 | npm scaffold, TypeScript build chain, gates workflow |
| M1-P2 fleet init and doctor | merged | #2 | init as private git repo, doctor with readiness profiles |
| M1-P3 lock and pool | in review, blocked | #3 | see below |
| M1-P4 spawn and teardown | not started | | carry the criterion-13 meta.json baseOffline clause and P3's holder-identity transport into the brief |
| M1-P5 watcher and liveness | not started | | tuition T-002 asks that "task open, no turn-end, worktree dirty" become a wake reason |
| M1-P6 toy sandbox and exit test | not started | | needs owner action A-1 first |

## In flight

**M1-P3 (PR #3) must not merge yet.** Two high-severity defects were found
by adversarial verification, both introduced by the first fix round,
neither visible to a green suite. See
`delivery/review/verification-m1-p3-fix-round.md`.

- V-1: `pool destroy` force-deleted the task branch, silently discarding
  committed unpushed work. Reachable through the public CLI.
- V-2: the narrowed retry signature no longer matched git's real
  concurrent ref-update refusal, so parallel `pool create` failed hard.
- Eight unrefuted lower-severity candidates (U-1 to U-8) recorded.

A second fix round landed at head `20b6a5a`. It closes V-1 (deletion gated
on tip equalling the recorded baseSha, refusal otherwise unless a distinct
`--delete-branch-force` flag is passed, deleted sha printed as a recovery
handle), closes V-2 (widened retry signature, permanent failures still fail
in one attempt), and closes U-1, U-3, U-5, U-6, U-7, U-8. It also found two
further concurrency transients, one added to the retry signature and one
deliberately handled by create-level rollback rather than retry after
measuring that retrying converts a transient into a permanent error.

Two things gate the merge:

1. A reduced adversarial verification of that fix round is running
   (`delivery/review/verification-m1-p3-fix-round-2.md` when written).
   Fix rounds are not merged on green CI alone; see tuition T-003.
2. U-2 remains unexplained: two race witnesses failed intermittently on
   unmodified code, which is either a false witness in the test seam or a
   hole in the compare-and-swap. An investigation is running
   (`delivery/verification/u2-race-flake-investigation.md` when written).
   It targets `b475546`; the mutation primitive is unchanged at `20b6a5a`
   apart from one message string in a branch that returns before the claim
   is held, so its conclusions transfer. Not observed in 20 post-fix
   full-suite runs, which is not evidence of absence.

## Owner decisions

| Record | State |
|---|---|
| DR-0001 license | decided: Apache-2.0 |
| DR-0002 Node floor | decided: >=26 |
| DR-0003 CI runner | decided: GitHub Actions, hosted |
| DR-0004 branch protection | approved in principle, commands not yet run |
| DR-0005 language | decided: TypeScript compiled to JavaScript |
| DR-0006 schema technology | decided: lintable schema first, markdown as justified exception |
| DR-0007 substrate | decided: dual, local machine and cloud sessions |
| DR-0008 release registry and package names | deferred, due before the M3 plan is approved |
| DR-0009 firstmate source | decided: supplied, protocols harvested |
| DR-0010 harness orchestration primitive | open, due at M4 adapter planning |

## Owner action items

1. **DR-0004 commands, runnable now.** Flip the repository default branch
   to `main` and enable protection requiring a pull request plus the green
   `gates` check. Exact commands in
   `delivery/decisions/DR-0004-elevated-permissions.md`. Until these run,
   nothing structurally prevents a direct push to `main`.
2. **A-1, before M1-P6.** Create the toy sandbox GitHub repository, or
   grant repository-creation access.
3. **A-2, before M4.** Provide or approve a private remote per real fleet
   home, for fleet-state durability.

## Standing reminders

- Phases are sequential until M5. Do not start P4 before P3 merges.
- Milestone exit tests are hard gates.
- Process paperwork must reach `main`, not only a side branch. This file
  exists because it once did not.
