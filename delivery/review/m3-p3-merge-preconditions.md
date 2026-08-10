# M3-P3 merge preconditions at `108eed0`, checked against DR-0012's literal text

- date: 2026-08-10
- author: the orchestrator
- head: `108eed0`
- status: TWO gaps found, one closed by dispatch, one recorded as a boundary
  that has NOT been crossed

## Why this was written

PR #54's CI came back green on `108eed0` and the reflex was to treat the phase
as one verification away from merging. Re-reading DR-0012's conditions rather
than recalling them found two problems. Both would have been merged over.

## Gap 1: condition 1 was NOT satisfied, and is now being closed

> **1.** Two independent clean-room reviews exist for **the current head**,
> produced on different model families, each written to `delivery/review/` and
> committed.

The two clean-room reviews of this phase (supply chain and regression;
correctness) were produced against **`218fc12`**. Since then the block-prefix
decision has been REWRITTEN TWICE:

- round 7 widened a regex, which introduced the HIGH-severity ReDoS regression
  V-1, and
- round 8 removed regexes from that decision entirely, replacing them with a
  procedural scan across three new helper functions and one predicate.

**Neither existing reviewer saw any of that code.** Condition 1 says "the current
head" and the current head is not the head they reviewed. Delta verification is a
different contract: it asks whether the named findings are closed and whether
anything new appeared, not whether the phase's acceptance criteria hold.

**Decision: a second independent look at `108eed0` is required and has been
dispatched**, running concurrently with the delta verification rather than after
it, so it costs wall clock rather than serialising.

Its contract is deliberately NOT a repeat of the earlier two. It walks or
EXECUTES the phase's acceptance criteria (condition 3: "A review that only read
is not sufficient for a code phase"), exercises the shipped CLI, checks DR-0020's
disclosure obligations, and re-derives the owner's DR-0022 criterion from
`git archive`. The supply-chain and consumer-lens contracts are not re-run,
because what they examined has not changed; that is a proportionality judgment
and it is recorded rather than exercised silently.

## Gap 2: the stop-and-wait boundary, which is REACHED but NOT crossed

> **Stop and wait rather than grind.** If a phase needs more than two fix rounds
> after its first dual review, or if a high-severity finding recurs in the same
> component across rounds, the orchestrator stops merging that phase and leaves
> it for the owner with the evidence.

Counted naively from the phase's very first dual review, M3-P3 has had eight
rounds and this rule fired long ago. But it DID fire: DR-0016's fallback ran (a
fresh implementer plus a third review contract), that also failed, and the phase
went to the owner as DR-0022. The owner decided A2. That is the rule working, not
the rule being ignored.

The counter that matters now restarts from the dual review of the A2
implementation at `218fc12`:

| round | what it was |
|---|---|
| 6 | the A2 implementation, reviewed by the dual pair at `218fc12` |
| 7 | fix round one after that review |
| 8 | fix round two after that review |

**Two fix rounds. The limit is "more than two". So the boundary is REACHED and
NOT crossed, and merging round 8 is within the delegation.**

The consequence is stated now rather than discovered later: **if the round-8
verification requires a round 9, that crosses the limit and the phase goes to the
owner with the evidence.** It does not get a ninth round on orchestrator
authority. Writing this down before the verdict arrives is the point, because the
temptation to re-count the rounds favourably exists only after a bad result.

The second clause is also live and is worth stating explicitly: a high-severity
finding recurring in the SAME COMPONENT across rounds is an independent trigger.
V-1 was a high in `quotableUnits`'s prefix decision. **If round 8's verification
returns another high in that same component, the phase goes to the owner on that
clause alone, regardless of the round count.**

## What is NOT in doubt

- Condition 4, CI green on the exact head: satisfied. Run 31345592259 on
  `108eed0`, `pull_request` event, completed success.
- Condition 5, the scope audit: round 8 reports it ran green over 41 paths, and
  an independent path-by-path check of the seven changed files against the phase
  declaration returns zero out-of-scope. The gate could actually RUN this time,
  which it could not at the previous head.
- Condition 2, no unresolved high or medium: NOT yet establishable. That is what
  the two in-flight checks are for.

## What this document does not cover

It checks DR-0012's conditions and the stop rule. It does not re-examine DR-0015
(milestone boundaries) or DR-0016, and it says nothing about whether the phase's
CONTENT is correct, which is the two in-flight contracts' job.
