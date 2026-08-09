# T-012: a feasibility measurement that checks only correctness recommends a defect

- id: T-012
- date: 2026-08-09
- discovered by: the M3-P3 round-7 INDEPENDENT DELTA VERIFIER
- committed by: the orchestrator, against its own work
- severity: high, because the defect was introduced by the document that was
  supposed to de-risk the round

## What happened

Round 7 of M3-P3 widened `SKIPPABLE_PREFIX` to accept an unbounded, interleaved
block-marker prefix. It closed CR-001 completely: 32/32 shapes, 6,000-document
fuzz from 3,035 divergences to 0, depth sweep green to eight markers, and the
owner's byte-identical criterion preserved at 20/20.

The delta verifier then measured what nobody had:

> **V-1 (HIGH): the widened `SKIPPABLE_PREFIX` backtracks exponentially, and it
> is REACHABLE from `quotableUnits`. `986f58a` takes 73,175 ms on a 269-byte
> two-line document where `218fc12` takes 23.7 ms and returns the SAME unit.**

A 269-byte input costs seventy-three seconds. That is a denial of service in a
check that a consuming project points at its own decision records.

## Whose defect this is

**The orchestrator's, and stating that plainly is the point of this entry.**

Before dispatching round 7, the orchestrator wrote
`delivery/review/orchestrator-cr-001-fix-feasibility.md`, which measured a
candidate widening and reported: closes all seven reported shapes plus the
unreported three-deep member, still rejects all four column-is-lying spans,
suite 501 with 0 failures, owner's criterion preserved 20/20. It recommended the
direction as a "measured starting point", explicitly as evidence rather than an
instruction, and the round reached the same shape.

Every one of those measurements was TRUE. The recommendation was still wrong,
because the document measured exactly one axis, CORRECTNESS, and the defect is
on a different axis, COST.

The document carried a "what this measurement does NOT establish" section, which
is the right instinct and is why this entry can be written at all. That section
named four gaps: no red witness constructed, only `SKIPPABLE_PREFIX` varied,
`sourceSlice` continuation not examined, exploit set and fuzz not re-run.

**It did not name performance.** So the omission was not disclosed as an
omission; it was invisible. A non-coverage section only protects against the
gaps its author thought of, which is precisely the limit DR-0022 recorded about
test-case imagination, arriving one level up.

## The mechanism

**A widened regex is a correctness change and a complexity change at the same
time, and only the first is visible to a correctness test.**

The specific shape: nested quantifiers over an ambiguous alternation. Optional
whitespace appears both inside the repeated group and around it, so on a string
that ALMOST matches, the engine can split the same run of whitespace across
group iterations in exponentially many ways before concluding failure. The
anchored `$` is what makes it explore all of them: a near-miss is the worst case,
not a match.

Every correctness probe in the round used SHORT inputs that either matched fast
or failed fast. None used a long near-miss. A 6,000-document fuzz that generates
well-formed documents will never produce one, because a well-formed document
matches.

## Why this belongs to the recorded family, and how it differs

The family is "a guard whose condition does not test the property that matters":
T-008's watchdog tested existence rather than freshness; T-010's grep could not
see NUL; T-011's witness input decayed silently; M3-P1's suite guard asserted a
file existed.

T-012's difference: **the guard was not a gate, it was a MEASUREMENT, and the
measurement was used to authorise a change.** A green gate that proves nothing
wastes a check. A green measurement that proves less than it appears to
RECOMMENDS A DEFECT, and carries the orchestrator's authority while doing it.

## What follows, and it is mechanical

1. **A feasibility measurement that recommends a direction must state its AXES,
   not only its gaps.** Correctness, cost, and failure mode are three axes; a
   document silent on one of them is asserting nothing about it, and readers
   will not notice the silence.
2. **A regex change is a complexity change.** Any widening of a pattern that is
   anchored and contains a quantified group owes a worst-case timing measurement
   on a LONG NEAR-MISS, not only correctness on short inputs.
3. **Fuzzing well-formed documents cannot find this class.** The pathological
   input is one that nearly matches and then fails. A generator that only emits
   valid documents is structurally blind to it, exactly as the round-6 fuzz was
   structurally blind to two markers on one line.
4. The general lesson is the one this project keeps re-buying: a search or a
   measurement whose scope is wrong returns a clean result that is
   indistinguishable from an absence of defects.

## What this entry does NOT claim

It does not claim the verifier found this because the brief told it to; the brief
did not mention performance either. It found it by attacking the change on an
axis nobody had named, which is the argument for keeping independent delta
verification even when a round looks thorough. Round 7 was thorough. It was also
wrong, and so was the document that de-risked it.

It also does not claim the correct fix. Removing the ambiguity, most likely by
consuming the prefix with a linear scan instead of an anchored backtracking
pattern, is round 8's work and owes its own derivation, including a timing
measurement this time.

## Evidence

- `delivery/review/verification-m3-p3-round-7.md`, V-1, with the reproduction
  and the two timings.
- `delivery/review/orchestrator-cr-001-fix-feasibility.md`, the document that
  recommended the direction, whose non-coverage section did not name cost.
- `delivery/work-history/m3-p3.md`, fix round 7, whose own measurements were all
  true and all on one axis.
