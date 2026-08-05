# DR-0016: What is worth the owner's attention, and what is a failure of the system

- id: DR-0016
- project: tiphys-kernel
- task: process-governance
- question: When may an agent stop and ask the owner? Raised after a throughput analysis measured that owner escalations cost 4.7 hours on one phase alone, 16% of that milestone's elapsed time, and that every one of them was answered with the option the orchestrator had already recommended.
- reversibility: reversible (the owner can tighten the threshold at any time; every decision taken under it is recorded and auditable like any other)
- status: decided
- decided: Recommendation-backed questions are decided by the agent; only genuine ties of high impact reach the owner (owner, 2026-08-05)
- date: 2026-08-05

## Decision

The owner's rule, recorded in their terms because the wording carries the
reasoning:

If there is a choice to be made with a clear recommendation, make that decision
and move on. Only where there are at least two genuinely equal but different
options, of high impact, is the owner the one who answers.

A high-impact question with only one truly recommended option is the agent's to
take; stopping the owner for it is asking them to drop whatever they were doing
and lose time and potentially money on that other thing, which is justified
only when the question and its options carry the impact to deserve it.

**Being asked a question whose answer was already obvious is a failure of the
system, not a courtesy.**

## The test, stated so it can be applied rather than felt

Escalate ONLY when both hold:

1. **Two or more options are genuinely comparable.** Not "two options exist".
   If the analysis produces a recommendation the agent would defend, the
   options are not comparable and there is nothing to ask.
2. **The consequence is high impact and costly to reverse.** Irreversible or
   expensive-to-unwind: a published name, a runtime dependency, an external
   commitment, a decision that rewrites the plan.

Everything else the agent decides, records, and reports. A recorded decision
the owner can read and reverse costs them seconds. A blocking question costs
them their focus.

Owner-reserved matters are unchanged and remain outside this rule: anything
requiring elevated access the agent does not hold, and anything the owner has
explicitly reserved.

## The evidence that produced it

Measured across M1:

- Owner escalations cost **4.7 hours on M1-P5 alone**, 16% of that milestone's
  elapsed critical path, across two firings of the DR-0012 stop-and-wait limit.
- The limit fired a third time on M1-P6.
- **All three times the owner chose the option the orchestrator had already
  recommended.** The escalation changed no outcome.
- The intervention that actually broke M1-P5's spiral was not the owner's
  decision. It was the FRESH IMPLEMENTER dispatched afterwards, which derived
  eleven call sites where the review had listed eight and closed in one round a
  class three prior rounds had each closed one path at a time.

So the escalation was expensive, and the thing that worked was available
without it.

## What this changes in practice

- **DR-0012's stop-and-wait limit stops being a stop.** The property it
  protects is real and is kept: when a phase is grinding, something DIFFERENT
  must happen rather than another round of the same. From now on that
  difference is a **fresh implementer plus a third review contract**, dispatched
  immediately, with the owner notified asynchronously rather than waited on.
  Evidence that this is the effective half is above.
- **The residual guardrail**: if the round after that also fails, the phase goes
  to the owner. At that point the phase is genuinely grinding and the situation
  is no longer one with an obvious answer.
- **Reporting does not shrink.** Milestone exit-test evidence still goes to the
  owner unasked (DR-0015). Every decision taken under this rule is recorded as
  a decision record with its reasoning and its evidence, exactly as if it had
  been escalated. The owner loses no visibility, only interruptions.
- **The orchestrator states its recommendation before checking the threshold.**
  Writing the recommendation first is what reveals whether the options were
  genuinely comparable. A question posed without a recommendation is usually a
  question that had one.

## Applied retroactively, so the rule is not just aspirational

Judged against this rule, these should NOT have been escalated, and the
orchestrator records them as its own misjudgements:

- **M1-P5's two DR-0012 stops.** Both carried a clear recommendation; both were
  answered with it.
- **M1-P6's DR-0012 stop.** Same shape. The orchestrator wrote "my
  recommendation: take round 3" and then asked anyway.
- **CR-608's lease question**, escalated as "a plan question, not a harness
  question". A reviewer then showed the harness could be fixed today with
  `lock acquire --duration`, so the framing that made it owner-shaped was
  wrong.

These WOULD still qualify: DR-0008 (a published package name, effectively
permanent), DR-0013 (a runtime dependency inherited by every fleet home, where
the owner in fact overrode the recommendation and was right to), DR-0004
(elevated access the orchestrator does not hold), DR-0015 (merge authority
itself).

The split is instructive. Every question the owner genuinely needed was about
something irreversible or about access. Every question that wasted their time
was about how hard to push on a defect.

## Evidence

- Owner's rule, 2026-08-05, recorded above in their terms.
- The measured cost: the M1 throughput analysis, whose critical-path
  decomposition attributes 4.70h to escalation idle on M1-P5 and shows the
  fresh implementer as the effective intervention.
- The limit this supersedes:
  `delivery/decisions/DR-0012-delegated-merge-authority.md`, the limits section
  and its two recorded liftings.
- The related decision that removed the owner from routine merges and expressly
  kept this escalation, now also superseded:
  `delivery/decisions/DR-0015-owner-out-of-the-merge-path.md`.
