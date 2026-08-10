# DR-0023: DR-0012's stop rule NOTIFIES the owner, it does not WAIT for them

- id: DR-0023
- project: tiphys-kernel
- task: orchestrator process, raised by the owner
- question: When DR-0012's stop rule fires and the orchestrator has a
  recommendation it would defend, does the phase halt until the owner answers,
  or does the orchestrator proceed and notify?
- status: DECIDED BY THE ORCHESTRATOR (2026-08-10) under DR-0016.
  **This is not an owner decision and must not be read as one.** It is reported
  to the owner unasked and the owner may reverse it.
- reversibility: cheap. It changes who moves first, not what gets built.
- date: 2026-08-10

## What prompted it

The owner, after answering the CR-002 escalation:

> "Why did you not just take your recommended option? This is the second time
> in a row I have taken your recommended option."

That is correct and it is a process defect, not a one-off.

## The rules were already clear and the orchestrator misapplied them

DR-0016 states the bar: escalate only when two or more options are genuinely
comparable AND the consequence is high impact and costly to reverse, and
**"if the analysis yields a recommendation you would defend, the options are
not comparable and there is nothing to ask"**. It goes further and says asking a
question whose answer was already obvious is a FAILURE of the system, because it
costs the owner focus they were spending elsewhere.

DR-0016 also already redefined what stopping means: "the phase no longer waits
for the owner", the fallback is dispatched immediately, and the owner is
notified asynchronously.

On the CR-002 escalation the orchestrator wrote its recommendation first, said
it would defend it, described the fix as narrow and specified, and then asked
anyway. Both halves of DR-0016 were quoted in the same document that violated
them.

## The real cause, which is worth naming because it will recur

The proximate justification was DR-0012's stop rule ("stops merging that phase
and leaves it for the owner with the evidence") and a pre-commitment the
orchestrator had written hours earlier saying a round 9 goes to the owner.
Honouring a pre-commitment is normally right, and writing it before the verdict
existed was right.

But the actual reason it was honoured to the letter was different. One hour
before, the orchestrator had regraded a medium (W-1) down to a low, and had
noticed that regrading a second medium in the same hour, each time on the
finding blocking a merge, would be a pattern indistinguishable from grading to
reach a desired outcome. Having noticed that, it stopped trusting its own
severity judgment, and used the owner as a tiebreaker.

**That is the mechanism: an orchestrator that has just caught a possible bias in
itself resolves the next call by escalating.** It feels like caution. It is
actually outsourcing the bias problem to the owner instead of fixing it, and it
spends the exact resource DR-0016 exists to protect.

The correct response to noticing a pattern in your own judgment is to apply a
STRICTER standard to your own reasoning and write that reasoning down where it
can be checked, not to hand the decision away. The written reasoning is what
makes the call reversible; a question makes it someone else's problem.

## The decision

**When DR-0012's stop rule fires, the orchestrator STOPS MERGING, writes the
evidence and its recommendation, NOTIFIES the owner, and proceeds with the
recommendation. It does not wait.** The owner reverses it if they disagree.

The stop rule's purpose is to stop grinding on defective work, not to insert an
approval step. Applying the rule's PURPOSE means asking whether the work is
still defective:

- if the round under review introduced a new defect, or a high-severity finding
  recurred in the same component, the work IS still defective and the phase
  genuinely halts;
- if it did not, and one narrow finding remains with a specified fix, the
  circuit breaker has done its job by forcing the evidence to be written, and
  the phase proceeds.

Measured against CR-002: round 8 introduced no defect in `src/`, the first round
of the phase that could say so, and every acceptance criterion had been executed
and passed. The rule's trigger was mechanically met and its purpose was not.
The orchestrator made exactly that argument for W-1 an hour earlier and then
declined to apply it to CR-002. The inconsistency is the tell.

## What still goes to the owner, unchanged

- **A-7 and anything needing access an agent does not hold.** Not a judgment
  call; the orchestrator cannot perform it.
- **A genuine DR-0016 case**: two or more comparable options AND high impact AND
  costly to reverse. The test remains: write the recommendation FIRST. If you
  can defend it, there is no question.
- **Milestone exit-test evidence**, reported unasked. A reporting obligation,
  not a request for approval.
- **Anything owner-reserved**: a decision record, the plan's binding
  conventions, merge authority itself.

## What this does NOT license

It does not license merging past an unresolved high or medium. DR-0012
condition 2 is untouched: the finding still has to be fixed, or regraded with
recorded reasoning, or tracked with a reason. What changes is that the
orchestrator dispatches the fix and tells the owner, rather than idling the
whole milestone until the owner is awake.

Nor does it license grinding. If the round after this one also produces a new
defect, that is the stop rule's genuine trigger and the phase halts for real.

## Cost of the defect being fixed

M3-P3 sat stopped across several hours of owner sleep with seven phases blocked
behind it, for a decision whose answer the orchestrator had already written and
would have defended. That is the measurable cost, and it is the same currency
DR-0016 was created to stop spending.
