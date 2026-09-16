# The claim grep catches "is covered" and misses seven identical siblings

- date: 2026-09-16
- found by: M4-P26's clean-room reviewer, by measurement, while judging the work
  history's own statement of what its derivation did not cover.
- status: **a measured gap in a BINDING mechanism.** The claim grep is required
  before any work history is submitted, and a real over-claim walked through it.

## What happened

M4-P26's work history contains this sentence:

> `readRetirementInventory` has no adversarial witness ... A malformed inventory
> is refused by its own code path and that path is unwitnessed.

The first clause is an honest admission. **The second clause is false**, and the
reviewer measured it rather than reading it: `src/cutover.ts` casts the parsed
rows to a typed array with no per-row validation, so a document whose rows
contain the string `"not an object"` and the number `42` is READ rather than
refused, and both come back with verdict `ported`. A row whose witness field is
an empty string throws an uncaught `TypeError` instead of returning a refusal.

**So the sentence converts a FAIL-OPEN defect into a merely-unwitnessed one.**
That is exactly the shape the fix-round contract's item 3 exists to catch: an
empty result made indistinguishable from an absence of defects.

**And the claim grep reported clean.** Run over that work history, both the
line-based and the wrap-insensitive form, it matched 64 occurrences and missed
this sentence, because `is refused` is not in its vocabulary.

## The gap, measured

The binding pattern is
`cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to`.

It contains exactly ONE passive assertion-of-handling, `is covered`. Tested
against its structural siblings:

| phrase | caught |
|---|---|
| `is covered` | **yes** |
| `is refused` | no |
| `is validated` | no |
| `is checked` | no |
| `is handled` | no |
| `is guarded` | no |
| `is rejected` | no |
| `is enforced` | no |

Eight phrases, one caught. They are the same claim with a different verb: *this
input meets a control I am not going to demonstrate*.

## Why this is worse than a missing word

The grep is not advisory. The agent rules make it binding precisely BECAUSE a
reminder does not survive a busy session and a mechanical check does. So an
author who runs it and gets a clean result has done what was asked, and the
system told them they were done.

**A guard whose vocabulary is narrower than the claim it guards reports green
and is worthless for the cases it misses.** That is this repository's dominant
recorded failure, and here it is inside the very mechanism written to prevent
the dominant recorded failure one level up.

The wrap-insensitive form does not help: it fixes line-straddling, not
vocabulary. Both forms share the same alternation.

## The proposed amendment, NOT yet applied

Extend the alternation to cover the passive-handling family as a shape rather
than as a word list:

```
is (covered|refused|validated|checked|handled|guarded|rejected|enforced|prevented|caught)
```

**Why a shape and not eight more words:** the eight above were found by one
reviewer following one instance. Nothing establishes that the list is complete,
and a word list grows one incident at a time forever. `is <past participle>`
applied to a control is the structure, and matching the structure is what stops
the next verb from being a new incident.

**What the amendment cannot do**, stated so it is not oversold: this catches a
sentence pattern, not a false statement. An author who writes "the malformed
case returns a refusal" evades every alternation here. The grep raises the cost
of an unexamined claim; it does not detect untruth, and no grep will.

## Why it is not applied here

`CLAUDE.md` is M4-P23's file until that phase merges, per
delivery/plan/m4-conflict-pre-pass.md:1, which says in terms that a rule
discovered mid-wave goes to `delivery/tuition/` or waits. **This document is the
"waits", and the `CLAUDE.md` amendment is owed the moment M4-P23 lands.**

## What is not established

- Whether any OTHER work history in this repository contains an over-claim the
  grep missed for the same reason. One instance was found by one reviewer on one
  branch; no sweep has been run over the existing histories, and the same grep
  would not find them.
- Whether the amendment's broader pattern produces enough false hits to be
  ignored in practice, which is its own failure mode. Not measured.
