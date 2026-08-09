# T-011: a witness can stop witnessing while every gate stays green

- id: T-011
- date: 2026-08-09
- discovered by: the M3-P3 implementer, TWICE, against its own work, and reported
  unprompted both times; the second instance was confirmed by the round-5
  independent verifier
- severity: high, because it silently removes coverage from the mechanism this
  repository relies on most

## What happened

Two separate instances in two consecutive fix rounds.

**Instance one.** A round-4 refactor moved a line that a ROUND-3 witness spec's
`find` string pointed at. That member then resolved to ZERO occurrences.
`npm run build`, `node --test` and the `suite` gate were ALL GREEN in that state.
Only `red-witness` caught it, via rule (d).

**Instance two, and this is the sharper one.** A round-3 witness put its indented
ATX heading directly under a list item. Round 4 changed what an interrupter inside
a list item MEANS, so that heading became item content. The witness still went
RED, so nothing reported a problem, but it was now red **on the wrong assertion**.
Every gate stayed green. It was found only because the implementer re-took its
neighbours instead of assuming the fix was local.

## The mechanism

**A witness `find` is a literal coupling to source text, and a green suite is not
evidence that a witness still witnesses anything.**

The two instances are different failure modes of that one coupling, and the second
is strictly worse than the first:

| | `find` stops matching | `find` still matches, meaning drifted |
|---|---|---|
| symptom | zero occurrences | still red, wrong assertion |
| caught by | `red-witness` rule (d) | **nothing** |
| detectable mechanically | yes | not by any current gate |

The suite cannot see either, and that is not a defect of the suite: a test that
passes tells you the behaviour holds, not that some OTHER file's description of
how to break that behaviour is still accurate.

## What is measured, and what is not

The implementer swept every mutation-kind witness member in the repository, twice,
finishing at **97 members with 0 problems**. That sweep is real and it catches the
first column.

It is BLIND to the second column, and structurally so. Its own diagnostic prints
`any target under test/ : false`, because no witness `find` targets a test file:
the drift in instance two was in the FIXTURE the witness reads, not in the source
the `find` points at. The implementer stated plainly that it did not find a
mechanism catching the second kind, printed the scope of its search beside the
claim, and did NOT build one, because `src/witness/run.ts` is on M2-P2's
declaration.

That is the correct behaviour and it is why this entry exists rather than a silent
fix.

## Why this is the fifth member of a family, and different from the other four

The recorded family is "a guard whose condition does not test the property that
matters": T-008's watchdog tested existence rather than freshness; M3-P1's
vendored-suite guard asserted a file existed; `clause-map` discharged a clause on
a substring occurrence; T-010's control-character grep could not see NUL.

This one is different in a way worth naming. **The guard is correct and its
condition is right. What decays is the guard's INPUT.** A witness spec is data
that describes source it does not live beside, so ordinary refactoring silently
invalidates it, and the invalidation is indistinguishable from health.

The red-witness rule says a test only counts as guarding a behaviour if it has been
demonstrated red without it and green with it. T-011 is the time dimension of that
rule: **a demonstration is evidence about the head it was taken on, and a witness
carries that evidence forward as an assertion.** That is the same shape as T-009,
where a green gate result was evidence only for the configuration that produced it.

## What follows, and none of it is fixed here

1. A refactor that moves lines a witness points at owes a re-take of that witness,
   not merely a green suite. The implementer's practice of re-taking NEIGHBOURS,
   not only the named member, is what found instance two.
2. A witness whose dangerous state is a FIXTURE rather than source is not covered
   by the existing sweep at all, and no current gate covers it.
3. Whether `red-witness` should detect drift of the second kind is an open design
   question on M2-P2's file. It may not be decidable mechanically: "this mutation
   no longer means what the spec author intended" is a semantic claim. Saying so
   is better than shipping a check that appears to cover it.

Tracked in `delivery/STATE.md`. Not assigned.

## Evidence

- `delivery/review/verification-m3-p3-round-4.md`, which reproduced instance one
  by re-injecting the stale `find` and watching build, test and suite stay green
  while `red-witness` alone went red on rule (d).
- `delivery/review/verification-m3-p3-round-5.md`, which confirmed instance two
  and confirmed independently that no other mechanism catches it.
- `delivery/work-history/m3-p3.md`, the fix-round-4 and fix-round-5 sections,
  where both were self-reported.
