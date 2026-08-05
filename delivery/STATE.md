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

**M1-P5 (PR #8) is STOPPED, not merged, and waits for the owner.** Head
`98c635e`, CI green, both reviewers approve everything they previously
raised. The orchestrator is declining to merge under its own limit in
DR-0012, and the record should show that clearly.

Both clauses of that limit are now met. The phase has had two fix rounds
after its first dual review, and a high-severity finding has recurred in the
same component across rounds: a CRITICAL and a HIGH in round one, a MEDIUM
in round two, and now a HIGH in the final confirmation.

**The finding (NEW-2, high).** A named pipe at a task's metadata path hangs
the liveness guard and the watcher's single pass FOREVER, because the
blocking read runs before the probe that would classify the path. That
live-locks doctor, spawn and teardown, and directly contradicts the module's
own charter that the guard warns and never blocks. It predates this delta,
so it is not a regression, but the fix round's own documentation explicitly
claims that shape is covered, so the completeness claim is false.

Everything else on the phase is closed and verified by execution on both
heads: the original critical and high, the duplicate-implementation
divergence closed at the class rather than the instance, no regression from
the refactor, and the agreement tests confirmed to bite under both a
one-sided and a shared-helper sabotage.

Two lows from the other reviewer are recorded rather than fixed: a false
claim in the work history that an arm cannot practically be witnessed, which
was disproved with a self-referential symlink, and an unnoticed behaviour
change for a dangling-symlink beacon.

**What the owner decides:** take the fix (the reviewer judges it small,
probe before read or use a non-blocking read) and let the orchestrator
continue, or accept the residue with the overclaiming documentation
corrected to say so honestly, or take the phase back entirely.

**M1 is blocked behind this.** M1-P6 is built and waiting and cannot open
until P5 merges, so the milestone exit test cannot run either. A-1 remains
unactioned and is the other thing the exit test needs.

**M2 and M3 detailed plans: revision 1, adversarially reviewed, fix rounds
applied.** Both were reviewed on different model families and both came back
FIX-ROUND-NEEDED (M2: 6 high, 14 medium; M3: 4 high, 4 medium). Both rounds
are applied and committed.

M2 now carries a defect-to-gate traceability table, which is the milestone's
honest headline: of thirteen recorded M1 defects, seven are caught by an M2
gate with a named criterion and six are not, every uncovered one routed to a
named M3 owner. The two most severe defects M1 produced are among the
uncovered, and the plan says so in its own voice. Its circular-authority
finding was closed by removing the circularity rather than blessing it: no
M2 phase edits the agent-rules file, so the delegation clause stays true and
the gate-list update becomes a non-blocking owner item.

M3 placed tuition T-005 by generating the mechanism index as a projection of
the tuition schema rather than as a second artifact, seeded with four
mechanisms this project has already paid for. It fixed the
impossible-criteria finding at the class: the reviewer named four
cross-document invariants no schema keyword can express, and its own audit
found eleven more.

**Neither revision is delta-reviewed, deliberately.** DR-0011's recorded
consequence already requires re-grounding a parallel-written plan at
dispatch, and M3 has made that its own risk entry, so a review now would be
spent twice. The delta reviews are queued for dispatch time, which cannot
arrive before M1's exit test passes, since milestone exit tests are hard
gates.

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
