# Arbitration: M3-P4 fix round 2, delta verification at `2ed019b`

- date: 2026-08-10
- arbiter: the orchestrator
- head verified: `2ed019b`, branch tree clean, real branch name, HEAD confirmed
  by the verifier at the end of its run
- outcome: **ONE MORE FIX ROUND. DV-002 is HIGH and blocks merge under DR-0012
  condition 2. This is the SECOND fix round after the dual review, which is the
  last one the stop rule allows without something different happening.**

## The round did what a fix round is supposed to do

Every round-1 finding is CLOSED, and the verifier's per-finding table says each
was closed at the MECHANISM rather than at the named instance. That is the
property the fix-round contract exists to produce and the property M1 failed to
produce in twelve of thirteen re-reviewed rounds.

Two closures are worth naming because they exceed what was asked. CR-002's fix
TRAVELS THROUGH THE `$ref` into the work history, so the sibling artifact
inherited it rather than needing its own edit. CR-005's zero-false-rejection
claim was confirmed on a WIDER sweep than the round itself ran, which is a
verifier strengthening a result instead of merely agreeing with it.

## DV-002, HIGH, ACCEPTED. An impossibility claim refuted by construction.

The round wrote that a site is "unreachable by keyword or check". The verifier
built the thing the round said could not exist: the same negative-lookahead
`pattern` the round applied to `claim.statement` narrows
`#/$defs/verificationFirst`'s prose `finding` field. Two structurally different
lies rejected, two controls and the shipped template accepted, and **no keyword
outside the declared sixteen**, so it needs no vocabulary widening.

**Why this is HIGH rather than a documentation low:** the false sentence is in a
SHIPPED schema `$comment`, in the converse table, and in the handback. This
phase ships the contract that decides what a false claim may look like. A false
impossibility claim inside that contract's own shipped text is the phase
refuting its own thesis, and it is the third time in this delivery that a
document asserting closure was the thing hiding the hole.

The round's justification is the part to fix, not just the sentence: it argued
that each open site "compares a document to something that is not in any
document". The verifier showed that is FALSE FOR THIS SITE. So the round's
GENERALISATION was wrong, and the other sites need re-deriving under a correct
one rather than inheriting a bad argument.

**This is why the contract told the round to prove "structurally unclosable" by
construction rather than assert it.** It asserted; the verifier constructed; the
assertion lost. `CLAUDE.md`'s claim grep exists for exactly this shape and the
round ran the grep, which shows a grep catches the WORDING and not the
REASONING behind it.

## DV-003, MEDIUM, ACCEPTED, and it is the same defect one site over

"`result: red` owes nothing at all: no exit code, no counts. Structurally open"
is HALF wrong. The counts half holds. The exit-code half is closable in
vocabulary, and closable WITHOUT closing the declared-open `exit 0` residue,
which is the distinction that makes it a real fix rather than a trade.

Taken with DV-002 this is a pattern, not two incidents: **the round declared a
class open on one argument and the argument does not hold across the class.**
The next round owes a per-site derivation, not a per-class sentence.

## DV-001, MEDIUM, ACCEPTED AS LATENT, and it is the salvaged lead

`sharedDefinitionUsers()` skips local pointers, so the CR-001 guard is ONE HOP
DEEP: three multi-type and twenty-six single-type definitions are invisible to
it, and an unresolvable `guards` pointer is silently unchecked. Proved by
mutation, with md5 restored identical, and with a one-hop control that reddens
while three chained members stay green. That control is what makes the result a
measurement rather than an opinion.

**LATENT, and the severity depends on that word:** no registered check guards
any of the invisible definitions today, so there is no live escape. But a
work-history document PROVABLY reaches `settledBy`, so the hole is one
registration away from being live.

This finding exists because the FIRST verifier wrote incrementally and its
40-line partial survived the container restart that killed it. Without T-008's
beacon rule this is simply not in the record.

## DV-004, LOW

`schemas/report.schema.json` claims an enumeration makes a registration "a
checked fact"; it checks nothing, and the round's own work history says the
registration is asserted by hand. Text fix, and the same family as DV-002 at
lower stakes: a comment claiming a guard that is not there.

## CR-007: the handback was RIGHT, and I am not reversing it

The verifier judged the handback correct rather than merely open, which is what
the contract asked. Closing CR-007 needs a FOURTH derived-check row where this
arbitration authorised three, and D-M3-22 makes an unlisted row a plan defect to
escalate rather than an implementer's improvisation. The round declined to
improvise and said so with captures. **That is the behaviour this process wants
and it does not count against the phase.**

It stays open and is routed to the plan-text queue with DV-001's converse item.

## Where DR-0012's stop rule now stands, stated before it is reached

Round 1 was the dual review. The round just verified is the FIRST fix round. The
round this arbitration dispatches is the SECOND, which is the last one the rule
allows before "something different must happen".

Recording it now rather than at the boundary, because the failure mode DR-0012
guards against is grinding without noticing. If a THIRD fix round is needed,
DR-0016 applies: a fresh implementer and a third review contract are dispatched
immediately, and under DR-0023 the owner is NOTIFIED rather than waited on.

## What this arbitration did NOT settle

- Whether the other "structurally open" sites are genuinely open. DV-002 killed
  the round's general argument; the remaining sites are UNJUDGED, not upheld.
  The next round derives each one separately or states it as an open question.
- Whether closing DV-001's one-hop limit is worth doing now or belongs with the
  fourth derived-check row. The next round should MEASURE the cost rather than
  assume it, and hand back if it needs files outside the declaration.
- The `enumerableSection` site, where the verifier said "I did not find a way"
  in exactly that form. That is an honest open question and stays one.
- The pre-existing cross-test race the verifier hit in `test/gates.test.ts` over
  the tracked `src/gates/schemas/` directory. It is NOT in this delta, it was
  exposed by two concurrent suites over one tree, and it is recorded here so it
  is not rediscovered as a mystery.
