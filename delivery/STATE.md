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
| M1-P5 watcher and liveness | merged | #8 | four fix rounds; class closed for guard, watcher and doctor, not for lock, pool and brief |
| M1-P6 toy sandbox and exit test | built ahead, awaiting P5 merge (A-1 now done) | | branch claude/m1-p6-toy-sandbox-exit; sandbox repo tiphys-ai-helmsman-sandbox |

## In flight

**M1-P5: MERGED at `58ac964` (PR #8).** Five of six M1 phases are on `main`.

Four fix rounds, six clean-room reviews, zero high findings from either
contract on the merged code. The dominant defect was one class, reading a file
whose type has not been established, and the thing that finally closed it was
fixing at the MECHANISM rather than at the instance: one implementation in
`src/task.ts` with every reader and writer routed through it, instead of a
probe at whichever call site the last review named.

DR-0004's branch protection is LIVE and fired on its first real use: the merge
was rejected because the branch was one commit behind `main` and the ruleset's
strict policy requires it current. The branch was updated, CI re-run to green
on the exact merged head, and only then merged. Recorded because a protection
that has never refused anything is not known to work.

**What did NOT close, and is now a carried-forward item with its own scope:**
`teardown`, four `lock` subcommands and `spawn` still block forever on a named
pipe, through `src/lock.ts`, `src/pool.ts` and `src/brief.ts`. All are M1-P3
and M1-P4 files. The PR body and the work history both say so rather than
implying the class is closed everywhere.

**M1-P6: unblocked, PR not yet opened.** P5 is merged, so its grounding is
satisfied and its four DEFERRED-TO-VALIDATION criteria can now be EXECUTED
rather than deferred again. Its work history names a discharging command per
deferral, which makes the validation pass mechanical. The branch is three
commits behind `main` and must be updated first, both to rebase onto the
delivered P4 and P5 commands its harness drives and because DR-0004's ruleset
now requires a current branch before any merge.

A floor-satisfying Node 26 toolchain is available (environment warning 1), so
criteria 2, 3 and 5 can be discharged locally rather than only in CI.
Criterion 5's falsification run is not in the CI workflow at all, so before
this toolchain existed it had no discharge path.

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
- **Complete the unprobed-open class across `src/lock.ts`, `src/pool.ts` and
  `src/brief.ts`.** M1-P5 closed it for the guard, the watcher and doctor on
  every path a reviewer could construct. `teardown`, four `lock` subcommands
  and `spawn` still hang forever on a FIFO, and the spawn case strands a
  worktree, a pool record, a branch and a task id. These are M1-P3 and M1-P4
  files; patching them from M1-P5's call sites would repeat CR-521. Needs its
  own scope, and it is a strong candidate for the mechanism index of T-005.
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

1. **DR-0004: DONE (owner, 2026-08-05).** The ruleset is active and was
   witnessed refusing a merge whose branch was behind `main`, then allowing it
   after the branch was updated and CI went green on the exact merged head.
   Item 4 (implementer token scoping) remains queued for M2.
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
