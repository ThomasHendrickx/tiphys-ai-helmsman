# M3-P3 STOPS HERE and goes to the owner

- date: 2026-08-10
- arbitrator: the orchestrator
- head: `108eed0`
- inputs: delivery/review/clean-room-m3-p3-r8-criteria.md:1 (PR #69) and
  delivery/review/verification-m3-p3-round-8.md:1 (PR #68)
- outcome: **STOPPED. Not merged. Not sent to a round 9. Handed to the owner
  with the evidence, per DR-0012's stop rule and the orchestrator's own recorded
  pre-commitment.**

## What triggered the stop

The second clean-room review of the current head returned APPROVE with one
MEDIUM (CR-002) and two lows.

- DR-0012 condition 2 forbids merging with an unresolved medium.
- CR-002's fix requires SOURCE changes: a predicate in the completeness check and
  a change to `executionStatus`'s proxy in `src/modes.ts`.
- delivery/review/m3-p3-merge-preconditions.md:1, written BEFORE this verdict
  existed, committed the orchestrator to this: rounds 7 and 8 are the two fix
  rounds allowed after the A2 dual review, and "if the round-8 verification
  requires a round 9, that crosses the limit and the phase goes to the owner. It
  does not get a ninth round on orchestrator authority."

A round 9 is required. So the phase stops.

## CR-002 is NOT downgraded, and the reason is about the orchestrator

The reviewer graded CR-002 MEDIUM and argued both directions honestly, offering a
real case for LOW: no assurance is weakened by any member, since the pipelines
either stay complete or gain stages, so nothing lets a phase ship with less
review than it appears to.

**It stays MEDIUM.** Two reasons, and the second is the important one.

First, on the merits. DR-0020 shipped closed vocabularies and its own text says
that decision "is only defensible if the limit is DISCLOSED where a consumer can
see it", making the disclosure obligation in-scope and explicitly not deferred.
CR-002 shows the disclosure mechanism printing the OPPOSITE of the truth about
the kernel's own delivery, at exit 0, with every registry gate green. The
artifact's threat model IS a data edit, so "it takes a data edit" is not
mitigation here, it is the hazard. And the existing witness declares two
dangerous states that are both CODE mutations, so it guards "someone breaks the
function" and not "someone edits the data": a guard whose condition does not test
the property that matters.

Second, and this is why the grading is stated rather than quietly applied: **the
orchestrator regraded a medium to a low less than an hour ago** (W-1, in
delivery/review/arbitration-m3-p3-round-8-verification.md:1). That regrade was
defensible on its own terms. Doing it twice in one hour, each time on the finding
standing between the phase and a merge, is a PATTERN, and the pattern is
indistinguishable from grading to reach a desired outcome. An orchestrator that
notices itself doing this should stop, and the stopping is worth more than the
merge.

## What the fix is, so the owner is deciding with a real estimate

The reviewer specified it and it is small:

1. The completeness check already computes both sets. One predicate over the same
   two sets closes it: a stage present in BOTH `skips[]` and `pipeline[]` is
   invalid.
2. `executionStatus` should key off `mode.id === "full"` rather than
   `skips.length`, because the blueprint defines `full` as the un-downgraded
   process BY NAME.

Plus a witness whose dangerous state is a DATA edit rather than a code mutation,
which is the part that matters most and the part no existing witness in this
repository does.

## The orchestrator's recommendation, written first so the owner can see whether this was a question

**Authorise one final round on M3-P3 to close CR-002, then merge.** The reasoning:

- The phase is otherwise DONE and independently verified. Every acceptance
  criterion executed and passed. V-1 to V-6 closed. Round 8 introduced no defect
  in `src/`, the first round of this phase that can say so. Your DR-0022
  criterion holds at 20/20 in two separate re-derivations from `git archive`.
  Scope green, CI green on the exact head.
- CR-002 is narrow, its fix is specified, and it is the last known blocker.
- The alternative, merging with CR-002 tracked, would ship a CLI that can be made
  to state a falsehood about the project's own governance, under a decision
  (DR-0020) whose defensibility rests on that very disclosure.

**What the owner may reasonably decide instead**, and the orchestrator would not
argue with either: merge now and fix CR-002 as the first item of M3-P4, which
already touches `src/checks.ts`; or take the phase away from this pipeline
entirely, given that it has consumed eight rounds.

## What is NOT blocked and continues regardless

- M3-P4 through M3-P10 remain blocked behind P3 merging. That is unchanged and is
  the cost of stopping.
- The evidence is landing on `main` by pull request as usual: PR #68 (the round-8
  verification), PR #69 (this review), PR #67 (paperwork, tuition T-012 and
  T-013, the arbitrations).
- A pre-existing uncaught `RangeError` in `collectUnits` above roughly 8,000
  nested quote markers, identical at both heads, is named for M3-P4 and tracked.

## Non-coverage of this arbitration

It rules on severity and on whether to merge. It does not re-examine the
criteria table (executed and passing), does not re-open DR-0020 or DR-0022, and
takes the reviewer's CR-001 and CR-003 at LOW without independent re-measurement.
The criteria reviewer's own stated non-coverage stands and is relevant: it
observed NO CI on either arm, so DR-0012 condition 4 is discharged by the
orchestrator's separate observation of run 31345592259, not by that review.
