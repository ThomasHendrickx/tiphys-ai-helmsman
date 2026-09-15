# DR-0038: a project with one model family declares it, and the check says so out loud

- id: DR-0038
- project: tiphys-kernel
- task: M4 intake, open decision M4-D-17
- question: DR-0012 requires two clean-room reviews produced on DIFFERENT model
  families. A project with only one family available can satisfy that only by
  recording something false. What should the kernel do?
- reversibility: reversible. Removing the exception is a schema and check
  change plus whatever merged under it.
- vetoable: no, this narrows nothing the owner did not narrow
- revert-cost: one enum value, one check arm, and a re-review of anything that
  merged under the exception.
- status: **DECIDED BY THE OWNER, 2026-09-15, BY SELECTING ONE OF THREE OPTIONS
  THE ORCHESTRATOR WROTE.** See the provenance section below; this line was
  originally just "DECIDED BY THE OWNER", which an adversarial review found
  unverifiable from the record alone.
- decided: the project DECLARES that only one family is available; the check
  reports a THIRD status that is neither green nor red and states the fact
  plainly; no false value is ever written
- date: 2026-09-15

## Provenance, stated exactly, because this record narrows an owner-reserved condition

**The owner did not write these words. The owner SELECTED them.** A review found
this record labelled "the decision, in the owner's terms" over text that was
entirely the orchestrator's, which under the evidence rule makes the owner's
agreement unverifiable from the record. The correction is to say what happened.

The orchestrator put three options to the owner and the owner chose the first.
The option text, verbatim as it was offered:

> **Declared exception.** The project writes down that only one family is
> available. The check then reports a third status, not green and not red. It
> says clearly: reviewed twice, but not by two families. Nobody has to write
> anything false, and nobody can hide it.

The two rejected options, also verbatim, so the choice is legible:

> **Keep it strict.** No exception. A project with one AI family cannot merge
> under delegated authority. It has to fall back to you approving each merge by
> hand. Safest, but it blocks pulse today.

> **Drop the family rule.** Two reviews are still required, but they may come
> from the same family. Simplest. Cost: two reviews from one family tend to miss
> the same things, which is the reason the rule exists.

**Why the distinction matters and is not pedantry.** DR-0012's conditions are
owner-reserved. An orchestrator that writes an option, has it selected, and then
records the option as "the owner's terms" has laundered its own recommendation
into an owner decision. The choice was genuinely the owner's; the framing was
not, and a later reader must be able to tell which.

## Why this was the owner's to decide and not the orchestrator's

DR-0012's conditions are owner-reserved: the record puts an owner-reserved
condition outside what the orchestrator may change
(delivery/decisions/DR-0012-delegated-merge-authority.md:22 is the condition
itself). An exception arm is a narrowing of condition 1 however carefully it is
worded, so the orchestrator could analyse it and could not take it.

## The failure this replaces, measured

It is not hypothetical and it has already happened once, in the running pilot.
`dual-review-decorrelation` hard-requires two distinct `produced-by` families
with no declared override, so its single-family environment could satisfy it
only by declaring something false. Its owner overrode the check by decision
record and BOTH reviewers escalated rather than record a false family
(delivery/STATE.md:82).

**Two honest people refusing to lie to a gate is the gate being wrong, not the
people.** The shipped behaviour has exactly two exits and both are bad: a false
field, or an override that happens outside the mechanism and therefore outside
every later audit of it.

## The shape, and the three rules it must satisfy

The DIRECTION is decided. The MECHANISM is being established against the
shipped code and lands in M4's plan. Three constraints are already binding and
are recorded here so the design is measured against them rather than judged
afterwards:

1. **Fail closed.** A check that cannot reach a verdict reports error. It never
   reports not-applicable, which asserts that a precondition WAS evaluated and
   found unmet, and never green.
2. **Never green by omission.** An unmet precondition reports not-applicable
   with the precondition as DATA, never green, because a vacuous no-op reported
   green is the shape that produces an exit test testing nothing
   (delivery/verification/spec-coherence-report.md:137).
3. **The declaration must be falsifiable.** The whole value of a declared
   exception over a silent one is that a reader can check it. So the design
   owes an answer to: what stops a project declaring the exception when it is
   not true? An exception nobody can contradict is the same as no rule at all,
   one step further from the evidence.

## What this does NOT decide

- **It does not change how many reviews happen.** Two independent clean-room
  reviews are still required. What is relaxed is the FAMILY requirement, and
  only against a recorded declaration.
- **It does not change DR-0035.** Review is never skipped; the fix-round count
  is what tiers
  (delivery/decisions/DR-0035-review-is-never-skipped-the-rounds-are-what-tier.md:49).
- **It does not decide where the declaration lives.** The charter and the
  assurance-mode document are both candidates and DR-0029's split is the test:
  whether "which model families exist in this environment" is process or
  predicate. That is plan work.
