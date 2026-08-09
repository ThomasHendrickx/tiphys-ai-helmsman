# Arbitration: M3-P3 round 7 verification, and the scope of round 8

- date: 2026-08-09
- arbitrator: the orchestrator
- input: `delivery/review/verification-m3-p3-round-7.md` (993 lines, PR #66)
- head arbitrated: `986f58a`
- outcome: **CHANGES REQUIRED. Round 8 is dispatched. `986f58a` must not merge:
  it carries a HIGH, and DR-0012 condition 2 blocks on a single medium.**

## This one IS a regression, and the round-6 defence does not transfer

In round 6's arbitration the orchestrator argued, with measurement, that a new
finding was not the sixth consecutive self-inflicted defect: CR-001's shapes
reddened the pre-A2 head too, so it was an old hole newly seen.

**That argument does not hold here and it should not be stretched to.** The same
document, through the same process, is 23.7 ms at `218fc12` and 73,175 ms at
`986f58a`, returning an IDENTICAL unit set. The defect is in the one line this
round changed, and it follows from the specific rewrite chosen rather than from
the direction taken: a widening that is not ambiguous on whitespace closes
CR-001 identically without this property.

So round 7 introduced a defect. Recording that plainly matters more than the
phase's round count looking better.

## Whose defect, and why that is written down rather than left implicit

**The orchestrator's.** `delivery/review/orchestrator-cr-001-fix-feasibility.md`
measured this widening before dispatch and recommended the direction. Every
measurement in it was true and all of them were on one axis. Its non-coverage
section named four gaps and did not name cost, so the omission was invisible
rather than disclosed.

That is recorded as tuition T-012, and the reason it is a tuition entry rather
than a line in this document is that the failing thing was a MEASUREMENT used to
authorise a change, not a gate. A green gate that proves nothing wastes a check.
A green measurement that proves less than it appears to recommends a defect and
carries authority while doing it.

## Does this go to the owner?

**No, and the reasoning is DR-0016's own.** The bar is two or more genuinely
comparable options AND high impact AND costly to reverse. There is no option
question here: the verifier localised the ambiguity precisely (the whitespace
shared between an iteration's leading `[ \t]*` and the trailing `[ \t]*` inside
its alternatives), and the fix is either an unambiguous formulation or a
non-backtracking scan. Both are cheap, local and reversible, and one of them is
plainly better. DR-0016 says that when the analysis yields a recommendation the
orchestrator would defend, the options are not comparable and there is nothing
to ask.

The owner is told, unasked and asynchronously, that the phase is on round 8 and
that the last defect was the orchestrator's own. That is a reporting obligation,
not a decision, and it is discharged in the session report rather than by
blocking the phase.

## Round 8 scope, and it is DELIBERATELY NARROW

This phase is on its eighth round. Every additional item is a new chance to
introduce a ninth defect, and the measured base rate here is not favourable. So
scope is limited to what blocks merge, plus the cheap lows, and everything else
is recorded rather than swept in.

### Required, merge-blocking

1. **V-1 (high).** Replace `SKIPPABLE_PREFIX` with a formulation that cannot
   backtrack: either an unambiguous pattern, or a linear scan that consumes the
   prefix procedurally. A scan is the orchestrator's recommendation, because it
   removes the whole class rather than removing one instance of ambiguity, and
   because the property being tested ("is this span a block prefix") is naturally
   a scan rather than a match. The implementer owes its own derivation and may
   reject this.

   **It needs a TIME witness, and that is the load-bearing part.** The unit sets
   are identical either way, so no equality assertion can ever see this defect;
   that is exactly why it survived a fully green suite. The witness must assert a
   time bound, and it must be demonstrated red against `986f58a` and green after.
   A witness that is not red against `986f58a` is not witnessing V-1.

2. **V-2 (medium).** Add a fixture member at depth FOUR or more, and correct the
   behaviour description, the `test/behaviors.json` row and the witness spec so
   the claim matches the fixture. Today all three claim coverage at four and the
   deepest member is three, and a `{0,3}`-bounded predicate restores CR-001
   verbatim with the full suite green.

### Required, cheap

3. **V-3**: give the CR-001 spec's second dangerous state a distinct, non-vacuous
   member (it currently reddens 14 tests, 13 of them pre-existing, so it
   discriminates almost nothing).
4. **V-4**: correct the work-history sentence that is now false at this head.
5. **V-6**: decide whether the shared `QUOTE_MARKER` regex object wants a guard.
   It is correct today only because it lacks the `g` flag, and adding `g`
   survives the whole suite. Either add a witness or state why the risk is
   accepted; do not leave it silent.

## The V-5 scope call, DECIDED

The round-7 implementer raised it against its own work and the verifier called
it a question for the orchestrator. It was held open in
`delivery/review/open-call-m3-p3-unwitnessed-mutants.md` until verification
reported. It reports, so it is decided here.

**Decision: the eleven remaining survivors (M03, M06, M07, M09, M10, M11, M12,
M13, M16, M18, M19) are ACCEPTED as recorded non-coverage and are NOT in round
8's scope. They are tracked by name in `delivery/STATE.md`, never as a count.**

The reasoning, and the honest part first: the narrow reading of CR-002 is the
one the reviewer actually wrote, that the defects THAT ROUND FIXED had no
witness, and round 7 closed that with a verified diagonal. The eleven are
pre-existing coverage on behaviour rounds 3 to 5 wrote, every one of them
measured correct at head by two independent probes.

Against that: eleven live instances of CR-002's mechanism is a fair reading of
"not closed", and `src/checks.ts` is on M3-P4's files-to-touch list, so the risk
is not dormant.

What decides it is that **V-2 is the same shape and IS in scope.** The scarce
thing here is not witness count, it is the phase's remaining reliability, and
V-2 buys more than all eleven together: it closes a hole through which the
round's own fix can be reverted in place with every gate green. Spending round 8
on eleven witnesses for behaviour nobody is changing, while the phase is on its
eighth attempt, optimises the wrong quantity.

This is a bounded coverage decision and it is LOGGED, which is the part that
makes it a decision rather than a silent cap. A phase that ships eleven
unwitnessed behaviours without saying so reads afterwards as a phase that had
none.

## What the round did well, carried forward so it is not lost

The verifier confirmed, independently and more widely than the round claimed:
the witness diagonal is genuine and M04 now reddens; CR-001 is closed
behaviourally at 68/68 against two structurally independent parsers, including
depths and interleavings the round never tried; CR-003 is closed; DR-0022's
criterion holds at 20/20 and 504 units re-derived from `git archive`; all 38
witness `find` strings are unique; `test/behaviors.json` is append-only by name.

It also recorded that the round's claim-grep accounting is accurate and
complete, which the verifier says it has not previously been able to write about
a work history in this repository.

## Two process notes worth keeping

- The verifier could not RUN the `scope` gate at this head, because the branch
  was checked out in two other worktrees, one carrying another agent's
  uncommitted work. It re-derived the property by hand and said so. Worktree
  hygiene is now costing measurements, and stale worktrees should be pruned
  before the next dispatch.
- An early verification run had two harnesses writing one worktree concurrently.
  It was caught by an unexpected md5, killed, and discarded, and no number in
  the report comes from it. That is the correct handling and it is recorded
  because the failure mode is easy to not notice.
