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

**M1-P3 (PR #3) must not merge yet.** Three fix rounds so far, each closing
the previous round's findings and each so far introducing new ones in
`src/pool.ts`. The pattern is recorded honestly: concurrent git operations
against a shared clone is a hard surface, and the verification loop is what
keeps finding the defects rather than the suite, which has been green
throughout.

Settled and no longer a risk: **the lock's compare-and-swap is sound.**
Established under heavy attack in `delivery/verification/u2-race-flake-investigation.md`
(6000 contested cross-process mutations, 4000 claim contests, a process
parked at each of the six points inside the critical section, 1.76 million
concurrent reads, zero unaided double winners). U-2 is impeached as evidence
against the primitive: 0 occurrences in 180 full-suite runs against an
original 2 in 11. Its trigger is unattributed, with a sibling verification
lens mutating source in the shared worktree the leading unproven candidate
(tuition T-004).

Closed and verified: V-1 (destroy discarding committed work) and V-2 (the
retry signature dropping git's real contention message), both confirmed
genuinely closed by `delivery/review/verification-m1-p3-fix-round-2.md`.

Open, being fixed in fix round 3 (dispatched, head at dispatch `20b6a5a`):

- V-3 (high): a refused `pool destroy` is not a no-op. The branch gate is
  evaluated after the worktree is already removed, and on an unreadable
  record the task id is permanently wedged, strictly worse than the
  behavior it replaced. Being fixed by restructuring destroy into resolve,
  then evaluate every gate, then act.
- V-4 (high): the commondir transient also strikes the fetch, where nothing
  retries it, so concurrent `pool create` still fails with the exact V-2
  refusal and still records a false `offline: true` provenance.
- D-1 (high, from the investigation): the initial lease is published
  non-atomically, which intermittently reddens acceptance criterion 3's own
  witness and can make `lock status` and `doctor` report a healthy fleet as
  corrupt. M1-P4 builds holdership checks on that read.
- D-3 (high, from the investigation): the test hold seam cannot distinguish
  holding from never having held, so two race witnesses can silently
  degrade into no-op tests.
- D-2 (medium, reproduced on unmodified code): the claim file is the sole
  serializer and the CLI's own remedy text instructs operators to delete it,
  which can produce two live holders. The module comment claiming the token
  confirmation is a second safety net is false.
- U-9 to U-12 (medium and low): an unscoped `worktree prune` against the
  shared clone during rollback, an overstated determinism claim in the work
  history, a permanent condition matching a retry alternative, and a
  registry description that over-promises.

Also unresolved and recorded rather than assumed away: three concurrent
create failures ("branch already exists") that the verification could not
attribute across 240 creates.

Open scope question with the owner: V-4, U-9 and the unattributed failures
appear only at 90-way to 120-way concurrency, and the plan keeps parallelism
off until M5. The dispatched round fixes them now but cheaply, driving
contention deterministically in tests rather than by running heavy stress in
the suite. The alternative, if cost is capped, is to take V-3 and the lock
guards now and park the rest for an M5 hardening phase.

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
