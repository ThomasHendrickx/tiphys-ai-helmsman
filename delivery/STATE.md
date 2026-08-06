# Pipeline state

The single place that answers "where are we right now". Update it whenever
a phase changes state, a decision is answered, or an owner action becomes
runnable. If this file disagrees with reality, reality wins and this file
is wrong: verify against git and the PR list before trusting it.

- as of: 2026-08-06
- milestone: M2 (gate registry), IN PROGRESS. M1 complete, exit test passed on
  `7e1b5f1`, completion record merged to main in PR #10 at `037477e`.
- plan: `delivery/plan/kernel-plan-v1.md` revision 7, owner-approved
- assurance mode: full (adversarial pipeline). Merge authority is DELEGATED
  to the orchestrator under DR-0012, conditional on dual cross-model clean
  review, and DR-0015 extends that to milestone boundaries too: the owner is
  not an approval step anywhere in execution. Exit tests remain HARD GATES and
  their evidence is presented to the owner regardless, which is a reporting
  obligation and not a click.

## The M1 hard stop: DISCHARGED 2026-08-06

The owner confirmed at the boundary, changed the session model, and instructed
M2 to start with maximum safe parallelism and deterministic supervision of
subagents (beacons plus freshness watchdogs per the T-008 dispatch contract).
The stop is kept here as history because a future session should see that it
existed and that it was released by the owner, not optimised away.

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
| M1-P6 toy sandbox and exit test | merged | #9 | four fix rounds, five review passes; exit test PASSED on the merged head with a falsification control |

## In flight

**M2-P1 (gate contract, manifest, runner, pin): DISPATCHED** on branch
`claude/m2-p1-gate-contract-and-runner` off `037477e`. It is the serialising
phase; M2-P2 through M2-P8 dispatch concurrently the moment it merges, per
`delivery/plan/m2-conflict-pre-pass.md`. The implementer carries the T-008
dispatch contract (incremental work history as beacon), the pre-submit hazard
self-review, M2-C-6, and the DR-0013 diagnostic contract as load-bearing
constraints.

**M3 plan re-grounding: DISPATCHED** on branch `claude/m3-plan-regrounding`,
documents only, same DR-0011 step M2 received. Inputs: DR-0013 as decided,
DR-0014 to DR-0016, T-005 to T-008, MECHANISMS.md, the M2 revision-2 boundary,
and M1's final defect record.

A freshness watchdog is armed on both worktrees (20-minute staleness
threshold). Supervision is beacon freshness, not completion notifications.

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
  handler in `bin/tiphys.ts`, a seam no M1 phase owns. **Promoted from cosmetic
  to load-bearing by DR-0013**: YAML parse failures must present through this
  same policy, so M3 depends on it existing.
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
- **M1-P6's three tracked lows, merged with under DR-0012 clause 2.** Each is
  recorded here with its reason rather than fixed, because all three are in the
  guard-on-the-guard rather than in the harness that certifies the milestone,
  and this phase has already spent four fix rounds on that test.
  **CR-760**: the `gates` fan-in's own `run:` script is text-asserted, so two
  structurally different edits leave it green. Real fix is ~8 lines executing
  the fan-in script the way tier 1 executes the guard's. Reason for deferring:
  it is a third-order guard, and the second-order one is now sound.
  **CR-761**: residual R6 is stated one level too narrow;
  `defaults.run.working-directory` is green at the WORKFLOW level as well as
  the job level. Documentation fix.
  **CR-762 and the criteria contract's sighting, which are the same thing and
  now NAMED**: `test/liveness.test.ts:671` asserts a hardcoded "age 13s" and
  fails under CPU contention. Seen once by each reviewer, clean on serial
  re-run both times. It is an M1-P5 file, out of this phase's scope, and it is
  a real flake in a suite the rules treat as a hard binary gate. **This is the
  highest-value of the three and should be fixed early in M2.**
- **Work-history contract must cover impossibility, coverage and remedy
  claims**, not only universal quantifiers, per tuition T-006. T-003 already
  routed the universal-quantifier rule to M3's report contract; T-006 records
  that the rule as written would have caught none of the three false claims
  M1-P5 produced, because those are existential and causal claims verified by
  CONSTRUCTION rather than by counter-experiment. M3 item, and a reviewer
  checklist item in the same role briefs.

**Paperwork compaction, owner-raised 2026-08-06, falls due at the M2 or M3
boundary.** The owner will challenge what of `delivery/` is useful going
forward: compact without losing information, cut the filler. The measured
split that should drive it: reviews and work histories are ~9,200 of the
~15,300 lines and are mostly READ-ONCE (their probes-run sections were
load-bearing at merge time and dead after), while decisions, tuition,
MECHANISMS.md and STATE are the read-every-dispatch layer and are already
dense. The compaction rule to apply: anything read at dispatch time must be
dense; anything read only in dispute can be archived cold. Git history keeps
deleted files, so compaction is "remove from the working tree, keep an index
row pointing at the sha", never information loss. The kernel connection: M3-P8's
tuition flow and the report contract ARE the productized compactor (incident
text projects to mechanism index; review text projects to findings and
verdicts), so this challenge is an INPUT to M3, not a separate cleanup chore.

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
| DR-0004 branch protection | DONE 2026-08-05: ruleset active, witnessed refusing a merge on a stale branch. Item 4 (token scoping) queued for M2 |
| DR-0005 language | decided: TypeScript compiled to JavaScript |
| DR-0006 schema technology | decided: lintable schema first, markdown as justified exception |
| DR-0007 substrate | decided: dual, local machine and cloud sessions |
| DR-0008 release registry and package names | decided: public npmjs under @tiphys, `@tiphys/kernel` and `@tiphys/claude-code-plugin` |
| DR-0009 firstmate source | decided: supplied, protocols harvested |
| DR-0010 harness orchestration primitive | open, due at M4 adapter planning |
| DR-0011 early parallelism | decided: maximum safe parallelism, five conditions binding |
| DR-0012 delegated merge authority | decided: delegated under dual cross-model clean review; stop fired once on M1-P5 and was lifted for that phase only |
| DR-0013 schema validator implementation | decided 2026-08-05: Ajv 8.20.0 exact, Draft 2020-12, strict mode; plus `yaml` 2.9.0 for the parser the plan had omitted. M2's validator retired as an engine at M3-P1. Supersedes D-3 from M3 onward |
| DR-0014 release verification | decided in principle: pluggable interface with kernel-shipped reference adapters; interface design investigated, report in `delivery/verification/release-verification-interface.md` |
| DR-0015 owner out of the merge path | decided: dual clean review is the approval, at milestone boundaries too; exit tests stay hard gates and their evidence still goes to the owner |
| DR-0016 escalation threshold | decided: recommendation-backed questions are the agent's to take; only genuine high-impact ties reach the owner. A stalled phase gets a fresh implementer and a third contract, not a wait |

## Owner action items

1. **DR-0004: DONE (owner, 2026-08-05).** The ruleset is active and was
   witnessed refusing a merge whose branch was behind `main`, then allowing it
   after the branch was updated and CI went green on the exact merged head.
   Item 4 (implementer token scoping) remains queued for M2.
2. **A-1: DONE (owner, 2026-08-05).** The toy sandbox repository is
   https://github.com/ThomasHendrickx/tiphys-ai-helmsman-sandbox. Both M1-P6
   scripts take the repository URL as an argument, so nothing needs editing;
   the URL is supplied at dispatch. M1-P6's full mode is unblocked.
3. **A-6, NEW and blocking one criterion.** Grant this session PUSH access to
   `ThomasHendrickx/tiphys-ai-helmsman-sandbox`. The repository was attached to
   the session and READ works (`git clone` exit 0, `git ls-remote` exit 0), but
   the write path is refused: `git push --dry-run` exits 128 with HTTP 403 on
   `git-receive-pack`, while the same dry-run against the kernel repository in
   the same shell exits 0. The refusal arrives before any ref is proposed, so
   it is an authorization asymmetry, not branch protection and not anything the
   push could be adjusted to satisfy. Re-calling the attach with push access
   returns already-present and does not upgrade an attached repository.
   Likely the GitHub App is not installed on the sandbox repository, or
   workspace policy excludes it; an admin can grant it in the Claude GitHub
   settings. What it unblocks: M1-P6 criterion 1's real-repository form, its
   commit-identity assertion, and the idempotence half, plus the M1 exit test's
   FULL mode. Local mode is unaffected and passes.
4. **A-2, before M4.** Provide or approve a private remote per real fleet
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
