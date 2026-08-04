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
| M1-P3 lock and pool | merged | #3 | lease lock, worktree pool; concurrency hardening deferred to M5 |
| M1-P4 spawn and teardown | in progress | | carry the criterion-13 meta.json baseOffline clause and P3's holder-identity transport into the brief |
| M1-P5 watcher and liveness | not started | | tuition T-002 asks that "task open, no turn-end, worktree dirty" become a wake reason |
| M1-P6 toy sandbox and exit test | built ahead, awaiting P4 and P5 merge plus A-1 | | branch claude/m1-p6-toy-sandbox-exit |

## In flight

**M1-P4 (PR #6): dual cross-model review done, fix round in flight.** Head
was 6fca6db. Two independent reviews on different model families both
returned FIX-ROUND-NEEDED and found different defects: a criteria-walk lens
found one blocking medium (a surviving task directory lets a new payload
read the previous incarnation's turn-end record), and a destructive-paths
lens found two highs neither the implementer nor the first reviewer saw (a
thrown error between worktree creation and launch bypasses rollback and
wedges the task id; a thrown write error after destruction leaves the task's
state authority falsely reporting open). Both reproduced live. Both reviews
independently upheld the implementer's two declared judgement calls. One
combined fix round is applying all six findings plus a correction to the
plan's own step 5 prose, which states an ordering that makes criterion 8
unsatisfiable for every input.

**M1-P5 (watcher and liveness): not started.** Inputs it must carry, recorded
here so they survive:

- Ship a flag for the watcher's base and poll interval. The M1-P6 harness
  cannot configure cadence and therefore uses fixed upper bounds (120s
  beacon, 180s wake); a cadence flag shortens every CI run.
- The M1-P6 harness does NOT depend on spawn forwarding the payload's
  stdout. The plan never specified that contract and M1-P6 deliberately did
  not invent it, reading payload facts from a harness-chosen report path
  instead. P5 should not assume stdout forwarding either.
- Tuition T-002's abandoned-task detection is P5's, and M1-P4 established
  the shape it should exercise: since M1's only adapter runs the payload to
  completion in the foreground, "open, no turn-end, dirty worktree" can only
  arise if the spawn process itself dies, so P5 should witness it against a
  killed spawn rather than a synthesized file state.

**M1-P6: built ahead and pushed, not open as a PR.** Under DR-0011 its PR
may not open or merge before P4 and P5. Criteria 1 and 6 pass; criteria 2,
3, 4 and 5 are DEFERRED-TO-VALIDATION, each with its discharging command
recorded, because they need spawn, teardown and watch to exist. Nine red
witnesses were run against dangerous states. Full mode remains blocked on
owner action A-1. Two notes for its reviewer: the harness deliberately
re-runs the gates as its own precondition, costing roughly two minutes per
CI leg, and that must not be "fixed" with a skip flag; and the plan gives no
local-mode mapping for the full doctor profile, so the harness asserts
either exit 0 with gh present or exactly one gh FAIL line without it, which
proves the provisioned fleet remote passed honestly.

**M2 and M3 detailed plans: DRAFT, written in parallel, unreviewed.** M2 is
9 phases covering all 16 of its rows; M3 is 10 phases covering all 74 of
its rows, verified programmatically against the master coverage table. M3
reconciled itself against M2's real phase ids and contracts and accepted
all nine of M2's boundary claims. Both need adversarial review before
either milestone dispatches, and an M2 review that moves the gate manifest
shape or the coverage input contract lands on three M3 phases.

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
