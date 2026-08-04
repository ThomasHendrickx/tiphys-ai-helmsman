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
| M1-P3 lock and pool | approved, awaiting owner merge | #3 | see below |
| M1-P4 spawn and teardown | not started | | carry the criterion-13 meta.json baseOffline clause and P3's holder-identity transport into the brief |
| M1-P5 watcher and liveness | not started | | tuition T-002 asks that "task open, no turn-end, worktree dirty" become a wake reason |
| M1-P6 toy sandbox and exit test | not started | | needs owner action A-1 first |

## In flight

**M1-P3 (PR #3): implemented, reviewed, APPROVED, one owner re-review finding resolved, awaiting owner merge.**
Head `bf11f84`, CI green on both checks. States kept distinct on purpose: implemented means pushed
and gates passing; reviewed means an independent pass attacked it; merged
means the owner accepted it. The first two are true; the third is not.

Evidence chain, in order: clean-room review (APPROVE, 4 low), fix round 1,
adversarial verification (2 high, both introduced by that round), fix round
2, verification (V-1 and V-2 confirmed closed, 2 new high introduced), fix
round 3 (structural restructure of destroy), partial verification (1 new
high, salvaged when the run stalled), round 4 as a surface cut, single
focused final review (APPROVE with 3 conditions), pre-merge fix. Four rounds
each closed the previous round's findings and introduced a new one, all in
machinery serving concurrency M1 never uses; the fifth round DELETED that
machinery instead, net -293/+188, and the residual failure disappeared with
it.

Final review result: **16 of 17 acceptance criteria met with executed
evidence, 0 not-met, 0 lost to the deletion.** The 17th clause is the plan's
own named M1-P4 obligation. Criterion 15 executed 10/10 green, the destroy
group 5/5, the four race criteria 20 runs with 0 red. All three review
conditions are fixed with measured red witnesses against the dangerous
state, 5/5 each.

Settled: **the lock's compare-and-swap is sound**, established under heavy
attack in `delivery/verification/u2-race-flake-investigation.md`. U-2 is not
evidence of a defect in the primitive; its trigger is UNATTRIBUTED, with
exactly one of two possibilities holding (the hold seam released early so
the interleave was never staged, or the tree under test did not contain the
byte compare). Do not restate this as "the failing runs did not execute the
shipped compare-and-swap".

Deferred to M5, to be picked up in M5 planning: heavy-concurrency create
hardening above roughly six-way; validated partial-state rollback; the
unattributed "branch already exists" failure (not seen since the rollback
was removed, which is 10 runs, not a proof); and the prune-versus-add
hazard, which destroy still carries and which is safe only because M1 never
runs concurrent destroys.

Next after merge: M1-P4 (spawn and teardown). Carry into its brief the
criterion-13 meta.json baseOffline clause, P3's holder-identity transport,
and tuition T-002's request that an abandoned task (open, no turn-end,
dirty worktree) become a wake condition. F-1's fix should land before P4
dispatches because P4's teardown drives the same destroy path.

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
