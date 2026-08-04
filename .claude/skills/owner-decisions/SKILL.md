---
name: owner-decisions
description: Raise, write, batch, and record owner decisions for the Tiphys kernel. Use when the plan is silent on an irreversible or costly choice, when an agent is about to improvise something the owner should decide, when reporting decisions back to the owner, or when recording an answer. Also covers owner action items that need elevated access.
---

# Owner decisions

The owner decides in the blueprint, not in the realization. Realization
escalates only on silence about an irreversible choice, and never improvises
one.

## When to raise one

Raise a decision record when the plan is silent AND the choice is expensive
to undo. The boundary rule is reversibility: expensive to undo goes to the
owner; anything a gate can catch and a refactor can fix belongs to
realization.

Raise it as soon as it is known, not when it blocks. A record raised early
can be answered in a batch; a record raised at dispatch time stalls the
phase.

Do NOT raise one for a reversible choice, and do not manufacture decisions
to look thorough. A decision queue padded with non-decisions trains the
owner to skim it.

## The record

File: `delivery/decisions/DR-nnnn-<slug>.md`. Required fields:

```
id, project, task, question, reversibility (reversible | costly |
irreversible), status (open | decided | deferred), decided, date
```

Then: **Options** (two to four, each with its real cost, not a straw man),
**Recommendation** (one option, with the reasoning that would change if the
owner disagrees), **Evidence** (file and section citations for every claim).

Write the question so it can be answered without reading the plan. The
owner asked twice in this project for more context on records that were
technically complete but assumed too much; both needed a plain-language
section explaining what the thing is, why it matters, and what changes
depending on the answer. Write that section the first time.

State plainly what the decision blocks, and whether work can proceed on the
recommendation while it is open.

## Reporting to the owner

Batch decisions; do not narrate them one per pipeline event. A report that
needs a decision should give, per record: the question in one line, the
recommendation, and what it blocks. Everything else stays in the file.

Recommendations are real recommendations. "Either could work" wastes the
owner's turn. If the evidence genuinely does not favour one, say what
additional evidence would settle it and what it would cost to get.

## Recording an answer

Update the record in place: `status: decided`, the decided value, the date,
and a **Decision** section stating what was chosen and any consequence the
owner should be able to find later without re-deriving it.

Record the answer faithfully even when it differs from the recommendation,
and record the owner's reasoning in their terms. If the choice has a
consequence the owner may not have weighed, note it as a recorded
consequence rather than as an argument, and proceed. The decision is theirs.

If a decided value contradicts an assumption the plan made, the plan is
revised and re-reviewed before anything dispatches on it. Do not let code
and plan disagree silently.

A deferred decision stays open with a due point ("due before the M3 plan is
approved"), never silently drops.

## Owner action items

Some things are acts, not choices: creating a repository, granting access,
running a command that needs admin rights. These are not decision records
but they must be tracked with the same discipline.

Never assume elevated access. Propose the exact commands, say when they
become runnable, and re-surface them at that moment rather than once. The
orchestrator has no admin rights and must not pretend otherwise.

## Never

- Never reopen a decided record. Raise a new one that cites it.
- Never improvise an irreversible choice because a phase is blocked. A
  blocked phase is the system working.
- Never bury a decision inside a status report. It gets its own record and
  its own line in the queue.
