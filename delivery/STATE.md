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

**M1-P3 (PR #3): implemented through fix round 3, head `c06464c`, CI green,
not yet verified and not merged.** Read the states precisely: implemented
means the code is pushed and the gates pass; verified means an independent
pass has attacked it; merged means the owner accepted it. Only the first is
true here.

History, recorded plainly because it is the point: four rounds have each
closed the previous round's findings and introduced a new one, all in the
machinery handling CONCURRENT pool operations. A fifth round is in flight
that DELETES that machinery rather than hardening it again, on the reasoning
that the plan keeps parallelism off until M5 and M1 never enters the
scenario the machinery serves. The lock is untouched by that cut.

Settled and no longer a risk: **the lock's compare-and-swap is sound.**
Established under heavy attack in
`delivery/verification/u2-race-flake-investigation.md`. U-2 is not evidence
of a defect in the primitive: 0 occurrences in 180 full-suite runs against
an original 2 in 11. Its trigger is UNATTRIBUTED. Exactly one of two
possibilities holds, either the test hold seam released early so the
interleave was never staged, or the tree under test did not contain the byte
compare (source mutation by a sibling verification lens in a shared
worktree, tuition T-004, is the leading unproven hypothesis for that second
branch). Do not restate this as "the failing runs did not execute the
shipped compare-and-swap", which asserts one branch as fact.

Closed and verified: V-1 (destroy discarding committed work) and V-2 (the
retry signature dropping git's real contention message), both confirmed by
`delivery/review/verification-m1-p3-fix-round-2.md`.

Implemented in round 3, not independently verified: V-3, V-4, D-1, D-2,
D-3, the barrier-witness discriminator, and U-9 to U-12. The third
verification of that round stalled after one lens of three reported; that
lens found a new high (an unconditional `rmSync` of a worktree admin
directory in the U-9 fix) and two mediums (a branch-gate decision read in
stage 1 and acted on in stage 3, and a rollback with no retry). Those are
folded into the round now in flight.

Severity note, so the record is not internally false: the investigation
records D-1, D-2 and D-3 all as **medium**. The orchestrator escalated D-1
and D-3 to required-before-merge status, not to high severity, on the
grounds that D-1 reddens acceptance criterion 3's own witness and can make
`lock status` and `doctor` report a healthy fleet as corrupt while M1-P4 is
about to build holdership checks on that same read, and that D-3 leaves two
race witnesses unable to distinguish holding from never having held. That
escalation is the orchestrator's, not the investigation's.

Deferred to M5 by the round in flight, to be picked up in M5 planning:
heavy-concurrency create hardening, partial-state rollback on failed
create, the unattributed "branch already exists" failure, and the
prune-versus-add hazard.

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
