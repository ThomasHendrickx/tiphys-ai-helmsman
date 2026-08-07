# DR-0019: The citations gate governs forward-claiming docs, not the historical record

- id: DR-0019
- project: tiphys-kernel
- task: m2-p5-citation-linter-scope
- question: Once the exit-test harness runs the full gate set on every delivery-doc PR, the citations gate is applied to the historical delivery RECORD (delivery/review/ and delivery/work-history/). Those records' path:line refs were correct when written and have since drifted, so the gate now reds on them. Should the gate keep requiring a record's citations to resolve against the code at head, or should it govern only forward-claiming docs whose claims must hold now?
- reversibility: reversible (the two globs can be returned to the config in one edit; no data is lost, and the records themselves are untouched)
- status: decided
- decided: The gate governs forward-claiming docs, not the historical record; delivery/review/ and delivery/work-history/ are removed from the configured document set (owner, 2026-08-07)
- date: 2026-08-07

## Decision

The `citations` gate (M2-P5) governs FORWARD-CLAIMING delivery docs, NOT the
historical delivery RECORD.

The `delivery/review/` and `delivery/work-history/` trees are records of what was
examined at the time they were written. Their `path:line` citations were valid
against the code as it stood when the record was authored, and they drift as the
code moves on. They are removed from both the `documents` set (so their
citations are no longer required to resolve at head) and, for review, from the
`citationRequired` set.

The docs whose claims MUST hold against the current code stay gated. In
`documents`: `delivery/plan/`, `delivery/verification/`, `delivery/decisions/`,
`delivery/requirements/`, and `delivery/STATE.md`. In `citationRequired`:
`delivery/plan/` and `delivery/verification/`.

## Why

A citation in a review or a work history is a statement about the code AT THE
TIME OF THE REVIEW. "I read `src/foo.ts:120` and it did X" is true forever about
that moment; it is not a promise that line 120 still says X today. Requiring it
to resolve at head re-litigates settled history against current code and turns
ordinary, correct drift into a gate failure.

A citation in a plan, a verification, a decision, or a requirement is a FORWARD
claim: it asserts something about the code as it is meant to be, and its
resolving at head is exactly the anti-fabrication property the gate exists to
protect. Those stay gated.

The trigger was mechanical: the M2-P9 exit harness now runs the full gate set on
every doc PR, so the M2 paperwork batch (which carries the M2 review and
work-history records) was blocked by the citations gate on the drift of records
it was merely trying to land. Reproduced before the change: the batch's records
red with 86 unresolved-or-vacuous citations; after the change they are no longer
a configured document and the batch is no longer red.

## Consequence

- The M2 paperwork batch lands: its historical records are no longer gated, and
  its forward docs (here, only delivery/STATE.md differs, which carries no
  required citations) do not red.
- Anti-fabrication is preserved where it is a forward claim: a plan,
  verification, decision, or requirement doc with an unresolving made citation
  still reds. Demonstrated by red-witness (a forward plan doc citing a
  nonexistent file reds; the same shape in a review or work-history record does
  not), and by a suite test that reds under the old config and greens under the
  new one.
- The gate is narrowed in scope, not weakened in kind. A record can still be
  read and audited by hand; it is simply not machine-gated for citation drift.

## What this does not change

- The schema, the roots, the made-vs-quoted logic, the hunk-scope rule
  (M2-D-21), and the vacuous guard (CR-1020) are all unchanged.
- The escalated M2-P9 policy question, whether a required gate that reaches
  not-applicable should fail the aggregate, is untouched and remains M2-P9's to
  answer. This decision only removes records from the gated set; it does not
  decide how not-applicable is scored.
