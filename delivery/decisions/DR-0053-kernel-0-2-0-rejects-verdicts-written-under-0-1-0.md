# DR-0053: kernel 0.2.0 rejects verdicts written under 0.1.0, and 0.2.1 restores them

- id: DR-0053
- status: RAISED, recommendation below; the approach is decided under DR-0016, the 0.2.1 publish waits for the owner's go-ahead
- decided-by: orchestrator, under DR-0016
- date: 2026-09-23
- supersedes: nothing
- relates-to: DR-0012, DR-0047, DR-0051, DR-0052

## The situation

The owner reported from the pulse pilot: after moving to `@tiphys/kernel@0.2.0`,
validation of pulse's EXISTING delivery history returns false. It is a breaking
change for a consumer.

Reproduced in this container against the pulse repository at `d4e491b`, 49
committed verdict documents (`delivery/review/*-criteria*.yaml` and
`*-hazard*.yaml`), each run through `tiphys validate --type verdict` with no
context, once per kernel version:

| kernel | verdicts with an INVALID line |
|---|---|
| 0.1.0 | 7 |
| 0.2.0 | 49 |

The 7 that were invalid under 0.1.0 are invalid under 0.2.0 for the same
reasons. The 42 newly invalid ones break for two reasons, both introduced in M4:

1. **`head` became a required property** of `schemas/verdict.schema.json`
   (M4-P10, #158, as part of the DR-0047 anchoring). All 49 lack it: 0.1.0
   never asked for it, so no consumer wrote it.
2. **A conditional rule rejects `APPROVE`** where the verdict's own findings
   trigger it (10 documents: `#/verdict value is not one of the permitted
   values`, beside `value does not satisfy the requirements its own shape
   triggers here`).

DR-0012 condition 2 is at delivery/decisions/DR-0012-delegated-merge-authority.md:23.

## The mechanism

The schema is used for two different questions. One question is whether this
document is well formed. The other is whether this document is admissible
evidence for a merge now. M4 moved rules of the second kind into the first.
A historical document can never satisfy a rule its author was never told
about, so every document written before the rule reads as malformed.

## The decision (approach)

**Patch release 0.2.1: the schema describes documents, and the gates judge
admissibility.**

- `head` becomes optional in the verdict schema. The review gates keep
  requiring it for ADMISSION: a verdict with no `head` is excluded by name,
  so it can never count toward a merge. `merge-preconditions` and
  `check-dual-review` already exclude verdicts that do not cover the audited
  head (M5-P3), so the strictness is kept where it belongs.
- The same treatment applies to the conditional APPROVE rule, if it proves to
  be a merge rule (DR-0012 condition 2) rather than a shape rule. It moves to
  the gate that already enforces condition 2. This is to be confirmed by
  reading the rule, not assumed.
- A test that validates real 0.1.0-era verdicts must pass. Its fixture is
  copied from pulse, and it must be red against 0.2.0.

Alternatives rejected:

- Rewrite pulse's history to add `head`. It rewrites evidence, and the
  correct head of an old review is often unknowable.
- A schema-version field with grandfathering. It is heavier, and it still
  needs the same split between shape and admission.

These are not comparable, so under DR-0016 there is no question to ask the
owner about the approach.

## What needs the owner

Publishing 0.2.1 is an outward action. The owner asked for the 0.2.0 publish
by name, so the 0.2.1 publish waits for a go-ahead.

## Also in 0.2.1: the review-families declaration

Pulse also cannot add a `review-families` declaration, because its past
verdicts name several `produced-by` values. The check read the whole history
on purpose (DR-0038). The owner has decided that Tiphys judges current and
future work, never history (DR-0054). So 0.2.1 also limits that check to
verdicts committed from the declaration onward. Pulse keeps its records
unedited.

## Owner answer, 2026-09-23

The owner approved the 0.2.1 publish: "yes, publish 0.2.1 once it's green".
The publish follows the 0.2.1 merge under DR-0012 and a green post-merge
`push` run, and runs the release verification before it is reported done.
