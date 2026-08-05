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
| M1-P4 spawn and teardown | merged | #6 | carry the criterion-13 meta.json baseOffline clause and P3's holder-identity transport into the brief |
| M1-P5 watcher and liveness | in progress | | tuition T-002 asks that "task open, no turn-end, worktree dirty" become a wake reason |
| M1-P6 toy sandbox and exit test | built ahead, awaiting P4 and P5 merge plus A-1 | | branch claude/m1-p6-toy-sandbox-exit |

## In flight

**M1-P4 is MERGED** at `6ec0482`, the first merge under DR-0012's delegated
authority. Its record is deliberately complete: the squash commit carries
both reviewers' rulings, the one disagreement and how it was arbitrated, and
the fact that an overstated claim was narrowed before merge rather than
carried. Five of six M1 phases are now delivered.

What the dual cross-model review found on that phase, recorded because it is
the evidence for keeping the practice: a criteria-walk lens found a
state-confusion bug; a destructive-paths lens found two high-severity throw
paths that skipped rollback entirely and that neither the implementer nor
the first reviewer had surfaced; a later delta found a red witness that had
silently gone green when a subsequent change short-circuited it, and a code
path recorded as untestable that was in fact reachable from the CLI. Each
was found by measurement rather than argument.

**M1-P5 (watcher and liveness): implementing.** Branch
`claude/m1-p5-watcher-liveness` from `main` at 6ec0482. The last unbuilt M1
phase. Its brief carries the three recorded inputs (a cadence flag so the
exit harness can stop using fixed upper bounds, no dependence on spawn
forwarding stdout, and T-002's abandoned-task condition witnessed against a
genuinely killed spawn rather than a synthesized file state), plus the two
watcher-specific witness traps: a wake for the wrong reason proves nothing,
and a liveness check on a fleet with no tasks in flight cannot fail.

**M1-P6: built, pushed, waiting.** Branch `claude/m1-p6-toy-sandbox-exit`.
Under DR-0011 its PR opens only after P5 merges. Criteria 1 and 6 pass;
2, 3, 4 and 5 are DEFERRED-TO-VALIDATION with their discharging commands
recorded. Full mode remains blocked on owner action A-1.

**After P5 merges**, P6 opens and the M1 exit test becomes runnable. A-1 is
then the only thing between the project and a completed milestone, and
milestone exit evidence goes to the owner regardless of DR-0012.

**M2 and M3 detailed plans: DRAFT, unreviewed**, in PR #7. Both need
adversarial review before their milestones dispatch. An M2 review that
moves the gate manifest shape or the coverage input contract lands on three
M3 phases.

## Carried forward, not yet owned

Items discovered during M1 that belong to a later milestone and have no owner
yet. Recorded here so they are not rediscovered the expensive way.

- **Non-atomic task metadata write.** `src/task.ts` writes `meta.json` with a
  plain write, which is the mechanism that produces the torn record the M1-P5
  guard now has to defend against. Out of scope when found and no reviewer
  faulted the phase for it. Real M2 item.
- **Clean presentation of a load-time configuration error.** A malformed
  watcher cadence environment value fails loudly, which is correct, but
  presenting it as a usage error rather than a stack trace needs a top-level
  handler in `bin/tiphys.ts`, a seam no M1 phase owns.
- **M1-P4's inert liveness hook.** Confirmed dead by two reviewers, left in
  place because it is not M1-P5's to delete. Remove it when a phase owns
  `src/spawn.ts`.
- **Deadline-less abandonment.** A task spawned without a deadline is not
  auto-detected as abandoned. The plan's own not-proven list says so for M1;
  it needs an owner in M2 or M4.
- **A mechanism index** mapping a mechanism to the rules this project has
  established for it, per tuition T-005. Belongs with the M3 tuition flow.

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
