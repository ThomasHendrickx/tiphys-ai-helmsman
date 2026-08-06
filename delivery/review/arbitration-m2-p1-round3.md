# Arbitration: M2-P1 round three, and the DR-0016 response

- date: 2026-08-06
- head: `411a320` (PR 11)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: FIX-ROUND-NEEDED stands on one medium. This is the THIRD round
  after the first dual review, so DR-0016's response fires: a FRESH
  implementer is dispatched immediately with a third review contract to
  follow, and the owner is notified asynchronously rather than waited on.

## The verdicts

| | hazard (Opus) | criteria (Sonnet) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED | APPROVE |
| high / medium / low | 0 / 1 / 3 | 0 / 0 / 0 |
| gates floor / default | 196/0/0 and 194/0/2 | identical, own invocations |
| registry | 202, 0 unresolved | identical, own script |

No factual disagreement. The criteria contract's four mutations all reddened
exactly their named tests; its two initial gate-number mismatches were its own
methodology errors, found, corrected and recorded rather than discarded.

## The medium, and why a fresh implementer rather than a fourth pass

CR-900: `writeInsideClaim` guards CONTENT WRITES, while the runner still
rmSyncs a foreign run's result record and still spawns gates into a directory
whose claim it has lost. Round 2's claim that every write verifies the claim
was a coverage claim defeated by a two-gate construction, and its derivation
could not see the bypass because the grep pattern was the names of the round's
own new wrapper functions. That is the wrong-scope search again, and it is the
SECOND consecutive round in which this implementer's enumeration of the write
class was incomplete. The design itself survived attack everywhere the
reviewer pushed; what keeps failing is one enumeration, and independent
re-derivation of an enumeration is precisely what the fresh-implementer
evidence supports.

## The rest

CR-901 (low): the G7 unwitnessable label was defeated by construction, an own
non-enumerable NaN passing both screens; the shipped form catches it and the
rejected alternative certifies green with green equal to NaN, so the
construction vindicates the code while disproving its stated justification.
The witness is about three lines and goes to the fresh round. CR-902 (low):
taken by the orchestrator, the carry-forward notes moved to STATE. CR-903
(low, trivial): one producer, zero consumers.

Confirmed and closed: CR-860, CR-861, CR-862, CR-865 (first byte-identical
claim-grep transcript in the phase), the G2b ordering property verified end to
end, CR-861's residual ruled genuinely unfixable at this layer with the
sibling-marker construction rejected for the right reason.
