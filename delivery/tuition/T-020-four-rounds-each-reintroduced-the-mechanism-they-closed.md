# T-020: four consecutive fix rounds each closed their instance and re-introduced the mechanism in the code they added

- date: 2026-08-12
- author: orchestrator
- subject: the exit-test harness assertion-direction branch, fix rounds 1 to 4
- status: the pattern of FOUR is a completed fact and is recorded now rather
  than at the end. Round 5 is in flight and may or may not extend it; nothing
  below depends on its outcome.

## The pattern

One branch. Four fix rounds. Four DIFFERENT fresh implementers, three
independent delta verifications. Every round closed the finding it was given.
Every round introduced a new finding of the SAME SHAPE in the code it had just
written.

| round | given | closed it | introduced | the condition it shipped |
|---|---|---|---|---|
| 2 | the original assertion-direction defect | yes | **DV-3** (MEDIUM) | `!Array.isArray(gates)` |
| 3 | DV-3 and DV-4 | yes, DV-3 widened | **DV3-F1** (MEDIUM) | a member-NAME lookup against a fixed list |
| 4 | DV3-F1, told to fix the CLASS | yes, by replacing the instrument | **DV4-1** (MEDIUM) | `array.length !== set.size` plus membership |
| 1 | (the original fix) | n/a | DV-4 (MEDIUM) | a regex matching `...IDENTIFIER` |

The shape, as round 3 itself named it after being bitten by it:

> A check's CONDITION recognises a syntactic or typed SUBSET of the class its
> MESSAGE quantifies over, so members outside that subset pass in silence.

**Round 3 named that mechanism and then instantiated it, in the same round, in
the code written to close it.** Round 4 was told the mechanism explicitly,
replaced the instrument rather than widening it, got the hard part RIGHT, and
instantiated the mechanism again in the auxiliary check it added to cover what
the new instrument could not reach.

## Why this is not four implementers being careless

Four different agents, none of whom saw the others' work, made the same class of
error. Each one's reasoning was locally correct. The strongest evidence that it
is structural rather than personal is round 4: it was handed the mechanism in
its brief, it correctly diagnosed that a source-text scan can never see
`expectedIds["pu" + "sh"](id)` (round 4's claim, and demonstrable by
construction: the member name exists only at run time, so no scan over source
text has anything to match), it abandoned the list-widening approach on exactly
that ground, and it built a run-time freeze which the verification then confirmed
correct on every path. Then its SECOND derivation, added because the
freeze provably cannot see inside its own closure, compared a length to a size.

**The task itself has this shape.** The program's job is to assert that a set
derived from several sources is the set that should have been derived. Any check
of the form "did this collection change wrongly" is a comparison, and a
comparison recognises some equivalence class.

In all four cases here the defect was the gap between the equivalence the
comparison used and the equivalence the message claimed. That is an observation
over four instances, not a law: nobody has enumerated the ways such a check can
be wrong, and a fifth instance could have a different cause.

So the useful lesson is NOT "be more careful". It is: **on a task with this
shape, expect the fix to carry the defect, and dispatch the verification as part
of the round rather than as a decision to be made afterwards.** Three of the four
rounds here were verified and all three verifications found something; that is
consistent with T-003's measured twelve of thirteen.

## The specialisation that made round 5 tractable

The generic mechanism above is true and was not enough: round 4 received it and
still failed. What made the next round specifiable was narrowing it to the
instance's actual mechanism:

> **A SET-BASED COMPARISON IS BLIND TO MULTIPLICITY.**

Putting values in a `Set`, or comparing a `length` against a `Set`'s `size`,
discards how many times each value occurs. Any defect preserving the value-set
while changing multiplicity is invisible. `[A, A]` has length 2, its set has size
2, and every member is present.

**This has two independently confirmed instances in two different programs**,
and noticing that they were one mechanism is what turned two unrelated backlog
items into one:

1. the harness's second derivation, DV4-1, above;
2. `describeDrift` in `scripts/render-agent-rules-gates.mjs`, which compares two
   blocks by building a `Set` of each block's lines, so a DUPLICATED line leaves
   both sets unchanged and it prints a hard-coded sentence that is actively
   false. Measured with control arms at
   delivery/verification/render-agent-rules-gates-duplicate-row.md:44.

The second was sitting in the register as an unrelated unowned MEDIUM. It is the
same defect.

## What to do with this, mechanically

- **When a check compares collections, state which equivalence it uses**, in the
  code, next to the condition: set equality, multiset equality, or sequence
  equality. The three differ and the difference is exactly what these findings
  are.
- **A `Set` in a comparison is a claim that multiplicity does not matter.** If
  that claim is not deliberate, it is a defect waiting to be found.
- **The message and the condition must quantify over the same thing.** Every
  finding in the table above was detectable by reading the shipped message beside
  the shipped condition and asking whether the second decides the first. That
  reading is cheap and none of the four rounds did it on its own new code.

## What this entry does NOT establish

- **It does not show the class is exhausted.** Four instances are four, and the
  fifth round's code has not been verified at the time of writing.
- **It does not show the two programs are the only sites.** No repository-wide
  enumeration of set-based comparisons has been run; each instance was found by
  a verification of something else.
- **It does not establish that the verification-per-round policy is optimal**,
  only that every verification run so far has returned a finding. Nobody has
  measured what a round would have cost without one.
