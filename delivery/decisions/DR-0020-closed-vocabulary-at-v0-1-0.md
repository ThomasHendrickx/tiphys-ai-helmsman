# DR-0020: the mode, stage and role vocabularies ship CLOSED at v0.1.0

- id: DR-0020
- project: tiphys-kernel
- task: M3-P3 third review contract (consumer lens), dispatched under DR-0016
- question: The shipped schemas close `mode id`, `pipeline stage id` and `role id`
  to exactly this repository's own values, so a consuming project cannot declare
  its own. Should M3 open them, or ship closed?
- status: DECIDED BY THE ORCHESTRATOR (2026-08-09) under DR-0016 and DR-0015.
  **This is not an owner decision and must not be read as one.** It is reported
  to the owner unasked, and the owner may reverse it.
- reversibility: the DECISION DIRECTION MATTERS and is the load-bearing part of
  the reasoning; see below
- date: 2026-08-09

## Why this is DR-0020 and not DR-0019

It was first written as DR-0019. **That id was already allocated and retired**,
and reusing it was an orchestrator defect caught by the round-3 delta verifier,
not by the orchestrator who made it.

The history, verified rather than recalled:

- `719f04f` created `delivery/decisions/DR-0019-citations-scope-forward-docs.md`.
- `f775c56` DELETED it, under the title "Re-attribute citations-scope change as
  an orchestrator decision, not a fabricated owner DR". The record had asserted
  owner sign-off that never happened.

So DR-0019 names a retired, fabricated record that
`delivery/review/clean-room-citations-scope-hazard.md` and
`delivery/work-history/m2-citations-scope.md` still discuss BY THAT ID. Two
different documents under one id, one of them a cautionary tale about a
fabricated decision, is precisely the collision CLAUDE.md's identifier section
records for the `A-n` namespace: **allocate a fresh id and never reuse a retired
one.** The rule was written for `A-n` and it binds every scheme in that section.

DR-0020 was chosen over DR-0021 because DR-0021 is the id used in the SHIPPED
example `templates/decision-record.example.yaml`, while DR-0020's only
occurrence anywhere is inert fixture text inside a coverage-gate test. Neither
has ever had a record file.

The historical references to DR-0019 in the two documents above are deliberately
NOT rewritten. They are the record of what happened, and this renumber restores
their accuracy rather than damaging it: with this file renamed, no live DR-0019
record exists, which is what the hazard review asserted at its own head.

## What was found, and by whom

The third review contract dispatched under DR-0016 was given the CONSUMER LENS,
a framing neither earlier reviewer had. It built a scratch consuming project
outside this repository and pointed the shipped tools at it. Both earlier
reviewers had recorded, under their own non-coverage sections, that nobody had
done this.

It found two high-severity items that neither of them found:

- **CR-001.** `assurance-modes.yaml`'s mode-id and pipeline-stage-id enums, and
  `role-model-config.yaml`'s role enum, are closed to this repository's own ids,
  with `additionalProperties: false` throughout. A scratch consumer declaring
  `mode id: standard`, stages `design/implement/review/merge` and role
  `backend-developer` was rejected on every one. Nothing in the shipped package
  discloses that the vocabulary is this-repository-only.
- **CR-002.** `charter-mode-enum-matches-modes` is required and unconditional, so
  every consumer must build a `schemas/charter.schema.json` at a fixed path with
  two exact property names whose enums equal its declared mode ids. A fully
  cooperative scratch consumer, with correct vocabulary and its own
  `gate-registry.yaml`, still failed until it replicated this repository's
  charter shape exactly.

Both are reproduced with captured CLI output in
`delivery/review/clean-room-m3-p3-consumer.md`.

## Why this is not simply a defect to fix

The finding is real and the framing that produced it was the right one. But
"open the enums" is a change to the schemas that M3-P5, M3-P6, M3-P9 and M3-P10
are all written against, in a milestone whose own honest-scope note already
records that **M3 never executes `direct-pr` or `local-only`** and that nothing
runs on Tiphys before M4 (a settled owner decision). There is no real consumer
yet against which an extensibility design could be validated. M4's pilot IS that
consumer, and it is the phase whose purpose is to produce one.

## The decision, and the reason that decides it

**Ship the vocabularies CLOSED at v0.1.0. Disclose it prominently IN THE SHIPPED
PACKAGE. Defer extensibility to M4's pilot, driven by a real consumer rather
than by speculation.**

The reason is asymmetry of reversibility, and it is the whole argument:

- **Widening a closed enum later is backward compatible.** Every document valid
  under v0.1.0 stays valid.
- **Closing an open enum later is a BREAKING change.** Documents that validated
  stop validating.

So shipping closed and opening at M4 is the reversible direction, and shipping
open now and discovering the vocabulary was wrong is not. Guessing an
extensibility mechanism before a single consumer exists is precisely the M1-P3
failure this plan has already recorded once: building an engine for a case the
milestone never enters.

Under DR-0016 this is therefore NOT an owner escalation. The analysis yields a
recommendation the orchestrator would defend, the options are not comparable
once reversibility is weighed, and asking the owner a question whose answer is
already clear costs them focus they are spending elsewhere.

## What this decision REQUIRES, and it is not optional

The decision is only defensible if the limit is DISCLOSED where a consumer can
see it. CR-004 (medium) measured that today it is not: the disclosures live in
`delivery/`, which `npm pack --dry-run` confirms is excluded from the tarball
(123 files, no `delivery/`), or in source comments stripped from the shipped
`.d.ts`. `tiphys mode show` prints `direct-pr` and `local-only` with the same
confident formatting as `full` and no annotation.

So CR-004 is IN SCOPE for the current fix round and is not deferred:

1. The three schemas carry a `$comment` stating the vocabulary is this
   repository's own at v0.1.0 and that extension is an M4 question, citing this
   record.
2. `tiphys mode show` annotates a mode that is validated-only and never executed
   by this milestone, so an operator who has not read the plan is not misled.
3. The escalation bounds are shown as DATA that a brief cites, never as an
   enforcement engine, because nothing in M3 counts fix rounds.

## A dependency this record CREATES, recorded so it cannot be forgotten

The disclosures required above name **v0.1.0**. `package.json` currently declares
`"version": "0.0.0"`, and the fresh implementer handed this back rather than
resolving it, correctly, because neither side is on its declaration.

M3-P10 step 1 (delivery/plan/kernel-plan-m3.md:4823) sets `version` to 0.1.0, so
the forward reference becomes true at release and the disclosures are correct as
written. **But only if that step happens.** If M3-P10 ships without the bump, a
package declaring 0.0.0 carries five `$comment`s asserting a fact about v0.1.0,
which is a present-tense claim about a version that does not exist: the exact
shape tuition T-006 records.

This is therefore a BLOCKING obligation on M3-P10, not a nicety, and it is
recorded in `delivery/STATE.md`. It is stated as a dependency rather than as a
reminder because this project has twice measured that a rule depending on
memory does not survive a busy session. The honest position is that nothing
mechanical currently checks it; if M3-P10 can make it checkable cheaply, it
should.

## Consequences accepted

- v0.1.0 is honestly a kernel that runs THIS project's delivery, published so
  that M4 can pilot it, not a general-purpose product. The README and the
  package description must not claim more.
- CR-002's charter-shape coupling stands for v0.1.0 and is recorded as a known
  limit rather than fixed. It is the same question as CR-001 and is decided the
  same way.
- CR-003 (low): `mode-conditions-quote-granted-by` requires context
  unconditionally although its logic is a no-op unless a mode uses
  `delegated-under-conditions`. Tracked, not fixed, and currently masked because
  CR-002's check needs context anyway.

## What would reverse this

A real consumer at M4 whose governance cannot be expressed in the closed
vocabulary. That is the evidence this decision is deliberately waiting for, and
M4 is where it arrives. The widening is backward compatible when it comes.

## Evidence

- `delivery/review/clean-room-m3-p3-consumer.md`, the third review contract.
- `delivery/decisions/DR-0016-escalation-threshold.md`, which mandates the third
  contract and forbids escalating a question whose answer is already clear.
- `delivery/decisions/DR-0010-harness-orchestration-primitive.md`, status open,
  recording that nothing runs on Tiphys before M4.
- delivery/plan/kernel-plan-m3.md:2591, the phase's own honest-scope note that
  M3 never executes `direct-pr` or `local-only`.
