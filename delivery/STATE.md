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
| M1-P6 toy sandbox and exit test | not started | | needs owner action A-1 first |

## In flight

**M1-P4 (spawn and teardown): implementing.** Branch
`claude/m1-p4-spawn-and-teardown`, based on `main` at 54ceb6e. Running lean
by owner instruction: implement, CI, one focused review, merge. No
multi-lens verification workflow unless something high-severity surfaces.

Obligations this phase inherits, all of which must appear in its brief:

- Criterion 13's remaining clause: a spawn writes `meta.json` carrying
  `baseOffline`, the provenance flag M1-P3 records in the pool record.
- M1-P3's holder-identity transport: `acquire` prints the holderId and
  renew and release take `--holder`, which is what P4's holdership checks
  consume.
- Tuition T-002: an abandoned task (open, no turn-end record, dirty
  worktree) should become a detectable condition, since salvage is
  currently a human's job.
- M1-P3's destroy contract: teardown drives the same path, so it must
  distinguish a stage-2 refusal (a true no-op) from an operational partial
  failure, and must not describe the second as the first.

**M1-P3 is merged** at 54ceb6e after five fix rounds, three verification
rounds and one investigation. The lock's compare-and-swap is established
sound. The concurrency rollback machinery was deleted rather than hardened,
with its requirements deferred to M5 and recorded in the M5 list below.

Deferred to M5, to be picked up in M5 planning: heavy-concurrency create
hardening above roughly six-way; validated partial-state rollback; the
unattributed "branch already exists" failure (absent since the cut, which
is ten runs and not a proof); and the prune-versus-add hazard, which
destroy still carries and which is safe only because M1 never runs
concurrent destroys.

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
