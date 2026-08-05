# Pipeline state

The single place that answers "where are we right now". Update it whenever
a phase changes state, a decision is answered, or an owner action becomes
runnable. If this file disagrees with reality, reality wins and this file
is wrong: verify against git and the PR list before trusting it.

- as of: 2026-08-05
- milestone: M1 (walking skeleton), in progress
- plan: `delivery/plan/kernel-plan-v1.md` revision 7, owner-approved
- assurance mode: full (adversarial pipeline). Merge authority is DELEGATED
  to the orchestrator under DR-0012, conditional on dual cross-model clean
  review. Milestone exit-test evidence still goes to the owner regardless.

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
| M1-P5 watcher and liveness | round 4 landed at `84dfa41`, dual review in flight | PR 8 | tuition T-002 asks that "task open, no turn-end, worktree dirty" become a wake reason |
| M1-P6 toy sandbox and exit test | built ahead, awaiting P5 merge (A-1 now done) | | branch claude/m1-p6-toy-sandbox-exit; sandbox repo tiphys-ai-helmsman-sandbox |

## In flight

**M1-P5 (PR #8): fourth fix round landed at `84dfa41`, dual review in flight.**
The owner chose option 1 (fix at the mechanism) with two binding conditions,
recorded in DR-0012. Both were met and both earned their keep.

The fix is one implementation of "open a path whose type you have not
established", in `src/task.ts`: `classifyEntry`, `readRegularFileIfPresent`
and `refuseOpenForWrite`, with every reader and writer in the phase routed
through them. Doctor now prints its diagnosis BEFORE running the advisory, so
a guard problem can no longer silence the whole check list (CR-523).

**Condition 2 (fresh implementer) paid for itself twice.** The implementer
derived the path inventory independently and found ELEVEN rows where the
reviewer's table had eight. One of the three additions is procedurally
important: the third-round hazard review recorded as an honest failure that a
FIFO at the lease did NOT hang doctor, but it had probed `state/session.lock`
while the lease is `state/orchestrator.lock`. That negative result was
VACUOUS, and doctor did hang, with zero output. A reviewer's empty-handed
probe is only as good as its target.

It also uncovered a PRE-EXISTING defect while building the CR-540 witness:
`atomicWrite` staged through a fixed `${path}.stage`, so two concurrent passes
shared one temporary, the first renamed it away and the second died on raw
ENOENT AFTER advancing the seen state, losing a pending turn-end in a protocol
whose rule is duplicate-rather-than-drop. Reproduced identically against a
pristine archive of `1bdfce5`, so it is not this round's doing. Fixed with a
per-write `randomUUID` stage name, chosen over a process identifier because of
constraint C-2.

Independently verified by the orchestrator at the new head: one `mkfifo` at
`state/watcher.beacon` now gives `doctor` exit 1 with ALL check lines printed
and `watch --once` exit 1 naming the path and the file type, where both were
exit 124 with zero output at `1bdfce5`. CI green on `84dfa41`.

Reported gates: Node 26 gives 146 tests, 146 pass, 0 skipped; Node 22 gives
146, 144 pass, 2 skipped. Registry 151 mappings, 145 titles, 0 unresolvable,
none removed or retitled.

DECLARED RESIDUAL, escalated rather than papered over: `lock status`,
`lock acquire` and `teardown` still hang on a FIFO at `state/orchestrator.lock`
(`src/lock.ts`), and `teardown` still hangs on a FIFO at
`worktrees/<id>.pool.json` (`src/pool.ts`). Both files are M1-P3 deliverables
and outside M1-P5's authorized set. The implementer deliberately refused to
patch at the call site, which is exactly the shape CR-521 was raised about.
The reviewers are asked to judge whether the residual is acceptable or
blocking; the orchestrator did not decide it unilaterally.

Two further items the reviewers must judge rather than the orchestrator: the
CR-540 replacement test is PROBABILISTIC (reported as catching its mutation
about one round in three, run at twelve rounds), which is a candidate flaky CI
failure as well as a weak witness; and CR-523's fix carries no registered
witness, the implementer reasoning that with CR-520 fixed the ordering can no
longer be made to fail and that registering an unfailable test would repeat the
CR-540 mistake.

Both review contracts are dispatched per tuition T-007: one hazard, one
criteria, on different model families, both instructed to use the Node 26
toolchain. The DR-0012 limit binds again if this does not come back clean on
both.

**M1-P6: built, pushed, waiting on P5.** Its PR opens once P5 merges. Owner
action A-1 is now DONE, so its full mode is unblocked.

**M2 and M3 plans: revision 1, reviewed, fix rounds applied.** Neither is
delta-reviewed, deliberately, because re-grounding at dispatch is already
required and a second review now would be spent twice. Neither milestone may
dispatch before M1's exit test passes.

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
- **A second review contract per code phase, declared rather than improvised**,
  per tuition T-007. A criteria-walking review cannot find a defect the
  criteria do not describe, which is how a phase met fifteen of fifteen
  executed criteria while live-locking every supervision command. The plan
  schema should carry a phase's hazard classes beside its acceptance criteria
  so the second contract is derivable. M3 role briefs and M3-P1 plan schema.
- **Work-history contract must cover impossibility, coverage and remedy
  claims**, not only universal quantifiers, per tuition T-006. T-003 already
  routed the universal-quantifier rule to M3's report contract; T-006 records
  that the rule as written would have caught none of the three false claims
  M1-P5 produced, because those are existential and causal claims verified by
  CONSTRUCTION rather than by counter-experiment. M3 item, and a reviewer
  checklist item in the same role briefs.

**Re-grounding debt for the M2 and M3 plans.** Both were written in parallel
with M1-P5 and predate T-005 and T-006. DR-0011's recorded consequence makes
re-grounding an explicit step before their delta review. The specific inputs
they have not absorbed are T-005 (mechanism index), T-006 (work-history
contract), DR-0014 (release verification becomes a pluggable interface, which
moves M2-P7's centre of gravity), and M1-P5's own defect record.

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
| DR-0008 release registry and package names | decided: public npmjs under @tiphys, `@tiphys/kernel` and `@tiphys/claude-code-plugin` |
| DR-0009 firstmate source | decided: supplied, protocols harvested |
| DR-0010 harness orchestration primitive | open, due at M4 adapter planning |
| DR-0011 early parallelism | decided: maximum safe parallelism, five conditions binding |
| DR-0012 delegated merge authority | decided: delegated under dual cross-model clean review; stop fired once on M1-P5 and was lifted for that phase only |
| DR-0013 schema validator implementation | open, raised by the M3 plan, due before M3-P1 dispatches; recommendation is to extend M2's closed-keyword validator |
| DR-0014 release verification | decided in principle: pluggable interface with kernel-shipped reference adapters; interface design investigated, report in `delivery/verification/release-verification-interface.md` |

## Owner action items

1. **DR-0004 commands, runnable now.** Flip the repository default branch
   to `main` and enable protection requiring a pull request plus the green
   `gates` check. Exact commands in
   `delivery/decisions/DR-0004-elevated-permissions.md`. Until these run,
   nothing structurally prevents a direct push to `main`.
2. **A-1: DONE (owner, 2026-08-05).** The toy sandbox repository is
   https://github.com/ThomasHendrickx/tiphys-ai-helmsman-sandbox. Both M1-P6
   scripts take the repository URL as an argument, so nothing needs editing;
   the URL is supplied at dispatch. M1-P6's full mode is unblocked.
3. **A-2, before M4.** Provide or approve a private remote per real fleet
   home, for fleet-state durability.

## Standing reminders

- Parallelism is on under DR-0011, but MERGE order is still dependency order:
  work may be concurrent, landing may not. A parallel phase's PR never merges
  before the phases its grounding names.
- Milestone exit tests are hard gates, and their evidence goes to the owner
  even while merge authority is delegated.
- A plan written in parallel with implementation is re-grounded against
  everything learned since it was started, as an explicit step BEFORE its
  adversarial review (DR-0011, recorded consequence).
- Process paperwork must reach `main`, not only a side branch. This file
  exists because it once did not.
