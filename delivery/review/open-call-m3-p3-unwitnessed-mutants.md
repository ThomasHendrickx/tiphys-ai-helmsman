# Open scope call: the eleven still-unwitnessed mutants in M3-P3

- date: 2026-08-09
- raised by: the M3-P3 round-7 implementer, unprompted, against its own work
- status: **OPEN. Deliberately not decided until the round-7 delta verification
  reports.** Recorded now so it cannot merge silently.
- decided by: the orchestrator, under DR-0016

## The fact

The correctness review measured fourteen surviving mutants of `quotableUnits`
and its helpers. Round 7 added witnesses for three of them, chosen because the
arbitration named them: M01 and M04 (literally the pre-fix state), M20 (M04
reached from the other side), and the CR-001 class.

**Eleven survivors still have no witness**, and the implementer listed them by
name rather than reporting a count: **M03, M06, M07, M09, M10, M11, M12, M13,
M16, M18, M19.** From the review's own table, these cover the `NOT_QUOTABLE`
set, the `startOffset` fallback arm, three `sourceSlice` behaviours (end column,
continuation quote-marker stripping, line joining), the line-split regex
(CRLF and lone CR), two quote-depth deepenings, and `normalizeProse` trimming.

Each was measured CORRECT AT HEAD by the reviewer's 20-shape tab and
line-ending probe, which scored 20/20. So this is a WITNESS gap, not a behaviour
defect. Nothing here is currently wrong.

## Why this is a real question and not bookkeeping

CR-002's mechanism, as the arbitration named it, is that **a behaviour can be
registered in `test/behaviors.json` and resolve green with no witness spec
naming the code that implements it.** Eleven remaining instances of that exact
mechanism, in the same function, is a reasonable reading of "the mechanism is
not closed", and this repository's whole fix-round contract exists because
fixing the named instance rather than the mechanism has cost it roughly a third
of a milestone.

The narrower reading is also defensible, and it is the reviewer's own wording:
the finding was that **the defects THIS ROUND FIXED** had no witness. Round 7
closed that, and the other eleven are pre-existing coverage on code rounds 3 to
5 wrote.

The two readings give different answers, which is why this is written down
rather than resolved in passing.

## What raises the stakes

`src/checks.ts` is on M3-P4's files-to-touch list, and on later phases' too. So
an unwitnessed behaviour in this file is not a dormant risk: the next phase edits
this file, and T-011 has already recorded twice in this very phase that a
refactor silently invalidates a witness while every gate stays green. An
unwitnessed behaviour has no witness to invalidate, which is worse and quieter.

## Why the call is deferred, and it is not deferral for its own sake

The round-7 delta verifier is running with an explicit instruction to invent
mutants the round did not write and to judge coverage independently. Deciding
this before its report would pre-empt the exact check that was dispatched to
answer it, and would risk accepting a gap the verifier is about to show matters.

The decision will be made when that report lands, not left to drift. If the
verifier finds any of the eleven guards something that could regress under
M3-P4's edits, that subset closes in this phase; if it confirms all eleven are
inert coverage on stable behaviour, the gap is accepted and tracked with its
names, never as a count.

## What is NOT acceptable either way

Merging with this unstated. A phase that quietly ships eleven unwitnessed
behaviours reads afterwards as a phase that had none, which is the silent-cap
failure `CLAUDE.md` names: if a round bounds coverage, the bound is logged, or
the absence of a report is indistinguishable from complete coverage.

The implementer reporting this against its own work, by name and unprompted, is
the behaviour this process wants and is why the question is answerable at all.
