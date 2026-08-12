# Arbitration, M3-P4 round 4: two mediums, one fix round, and NO escalation

- date: 2026-08-12
- head arbitrated: c7d9d2c on claude/m3-p4-report-and-work-history (PR #81)
- reviews: delivery/review/clean-room-m3-p4-r4-criteria.md:1 (contract A,
  criteria, executed) and
  delivery/review/clean-room-m3-p4-r4-argument-audit.md:1 (contract C, the
  argument audit, new to this phase)
- ruling: **BOTH FINDINGS UPHELD. ONE SMALL FIX ROUND, THEN DELTA VERIFICATION,
  THEN MERGE. The phase does NOT go to the owner.**

## The verdicts, and why there is nothing to arbitrate between them

Both returned CHANGES REQUIRED with exactly one MEDIUM, zero high, and **they
found different defects**. There is no disagreement to resolve; both are upheld
in full. That the two contracts did not overlap is T-007's pairing working
rather than two reviewers duplicating one contract, and it is the third time
this project has measured that effect.

| | contract A (criteria) | contract C (argument audit) |
|---|---|---|
| criteria | 23 of 23 MET, 0 not met, 0 partial, every one EXECUTED | not its contract |
| claims attacked | not its contract | 11, of which 10 HELD |
| finding | CR-A-1, a pinned count | CR-C-1, an undercounted class |
| severity | MEDIUM | MEDIUM |

## CR-A-1, upheld, and verified by me before ruling

`test/report-contract.test.ts:1394` pins `assert.equal(oneHop.size, 3)` over a
set derived from `readdirSync(schemasDir)`, which grows as later phases add
schemas. Read at the head:

```
  /* THE MEASUREMENT, derived rather than pinned: ... and a pinned number would
     be a claim about every future phase. */
  assert.equal(oneHop.size, 3, [...oneHop.keys()].join(", "));
```

**The comment states the rule correctly and the next line breaks it.** The
reviewer derived it by execution with two structurally different members and a
negative control: an M3-P7-shaped `verdict.schema.json` referencing
`#/$defs/finding` reddens it `4 !== 3`, one referencing `#/$defs/evidence`
reddens it the same way, and a new schema with no cross-document `$ref` leaves it
green.

This is not hypothetical. **M3-P7 is named in this phase's own `conflicts-with`
line** as the phase whose verdict schema shares the finding definition. The test
would redden for the next phase that touches it.

It also refutes a claim in the round's own work history at
delivery/work-history/m3-p4.md:781, which reports the registry-hygiene sweep as
finding no count over-assertion. The fix is one line: assert the three keys BY
NAME, which the block six lines above already does correctly.

## CR-C-1, upheld, and verified by me before ruling

`schemas/report.schema.json` ships a `$comment` stating that round 4 enumerated
the class of gate results with no exit code and that it "names four members".
The round's own pasted derivation in the work history lists eighteen
`errorResult(` call sites in `src/gates/run.ts`, and the round's prose examines
two of them. The reviewer constructed four ADDITIONAL structurally distinct
honest members through the real gate runner.

**The repair itself is sound and generalises**: the reviewer verified that the
author-declares mechanism (`no-wrapper-exit-code`) covers all four new members,
so there is no live schema defect. What is false is the COMPLETENESS CLAIM,
published in a shipped comment as evidence of rigor. In this repository that is
not cosmetic, because the whole thesis is that a false claim in a durable record
is how a real defect stays hidden.

## THE MECHANISM, ruled: this is occurrences four and five, and it is NARROWING

Rounds 2, 3 and 4 each shipped "a universal claim over a class, used to justify a
keyword, with no member of the class derived". Both of today's mediums are that
shape once more: a pinned count is a claim about every future phase, and "four
members" is a claim about a class the round itself printed as larger.

**But the shape has changed in a way that matters and must not be flattened.**
In rounds 2 and 3 the false claim CARRIED A DEFECT: the schema refused an honest
record, and the argument was the thing holding the defect up. Today the schema
repairs are correct, generalise to members nobody had built, and survived eleven
attacks. What is left over-claimed is the PROSE DESCRIBING the repair.

That is a real defect and it is upheld as a medium. It is not the same severity
of failure as shipping a schema that makes the true record unwritable, and
recording it as though it were would be as inaccurate as excusing it.

## Why this does NOT go to the owner (DR-0016, decided not escalated)

DR-0016 says the phase goes to the owner only if the fresh-implementer round
ALSO fails. Round 4 did not fail:

- 23 of 23 acceptance criteria met, every one executed rather than read;
- zero high findings from either contract;
- the red witness reproduces exactly, reverting both schemas to `5470207` gives
  `tests 3, pass 0, fail 3` and restoring gives `pass 3`, with failures landing
  on the DANGEROUS arm rather than an absent feature, and each witness carrying
  four or five derived members where the rule requires two;
- eleven load-bearing claims attacked by construction, ten held;
- suite green on the merged head, and both CI arms green by step.

A round that meets every criterion and leaves two prose corrections is a passing
round with corrections, not a failure. Escalating it would be the exact failure
DR-0016 names: asking the owner a question whose answer was already obvious costs
them focus they were spending elsewhere. Recorded here with the reasoning, per
that decision's own instruction to write the recommendation first.

## Fix round 5, scoped deliberately small

1. **CR-A-1**: assert the three one-hop keys BY NAME, matching the block six
   lines above. Then correct the work history's registry-hygiene sentence, which
   currently reports that no count over-assertion was found.
2. **CR-C-1**: correct the completeness claim in the shipped `$comment` and in
   the work history. State what the derivation ACTUALLY established (the members
   it examined and why those) rather than asserting the class has four.
3. Nothing else. This is not an invitation to improve the schema.

**The one thing this round must not do is fix the two instances and leave the
habit.** The correction to make is that a claim about a class states what was
examined, and a test over a growing set asserts by name. Both are the same
discipline the repository already requires; neither needs new machinery.

## What this arbitration does NOT establish

- **Whether the same over-assertion shape sits in M3-P1 to M3-P3's shipped
  comments and tests.** Still not looked for, now flagged twice. Five
  occurrences in one phase is reason to sweep the earlier ones, and that is an
  orchestrator task after this phase lands, not a widening of this round.
- **Whether contract C's residues hide anything.** Its own boundary section
  names `report-parity-arithmetic` as read-but-not-fixture-tested and calls it
  the weakest link in its coverage. That honesty is why it is recorded here
  rather than discovered later, and it is not closed.
- **The post-merge push run**, which by definition cannot exist yet and which
  T-009 requires on both workflows now that a second one exists.
