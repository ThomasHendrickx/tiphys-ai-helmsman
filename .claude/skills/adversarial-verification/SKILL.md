---
name: adversarial-verification
description: Run a multi-lens adversarial verification with refutation over a diff, a fix round, or a plan, and investigate unexplained failures. Use before merging foundation work, after any fix round, when a green suite is not enough assurance, or when something fails intermittently and the cause is unknown. Produces confirmed findings that survived attempts to kill them.
---

# Adversarial verification

Independent lenses find candidate defects; independent refuters try to kill
them; only survivors are reported. The point is not more review, it is
review that cannot be satisfied by agreement.

## When to spend this

It is expensive. In this project one verification of a single fix round
cost roughly 1.3 million tokens and 87 minutes. Spend it on:

- Foundation work every later phase inherits (the lock, the executor
  contract, anything defining exclusion or destruction).
- Any fix round, at least in a reduced form. A fix round closing four
  low-severity findings here introduced two high-severity defects, neither
  visible to a green suite (delivery/tuition/T-003).
- Work where a green suite is known to be weak evidence, for example
  concurrency, destructive operations, or classification of another
  program's output.

Do not spend it on routine phases that a single clean-room pass covers.
Declare the choice rather than improvising it; assurance level is a
declared property, not an orchestrator mood.

## Shape

Two phases, then synthesis.

**Lenses (parallel, independent).** Four to six agents, each with ONE angle
and no knowledge of the others' findings. Design angles so that they can
disagree: the value comes from independence, not coverage arithmetic. Good
angle families:

- Completeness of a claimed propagation or contract (enumerate every path,
  not the happy one).
- The design that was salvaged, rewritten, or reasoned about rather than
  measured.
- Data loss and destructive authority (always its own lens where any
  destroy, force, prune, or delete exists).
- The false negative introduced by a narrowing or optimization (the
  direction opposite to the one the fix was aimed at).
- Suite integrity, determinism, registry honesty, scope, conventions, and
  work-history accuracy.

Every lens brief must: name the exact artifact under review and the commit
range; give an isolated working copy so lenses cannot collide or disturb
in-flight work; demand execution over argument; cap findings (three is
enough) to prevent padding; and state plainly that an honest empty-handed
result is more valuable than a manufactured finding.

**Refutation (parallel, per finding).** Two refuters per finding, each with
a distinct angle, told they are not neutral judges. Useful angles:
reachability (can this be triggered through a real entry point, executed
end to end) and already-handled (does an existing guard, ordering, or
contract already prevent it). Default to refuted when evidence is weak or
the mechanism cannot produce the exact observed symptom. A finding counts
as real only if it survives.

Cap refutation to the most severe candidates, and report lower-severity
candidates explicitly as unrefuted claims rather than confirmed defects, so
the reader knows which is which.

**Synthesis.** One agent writes the report: verdict, a section per
surviving finding (severity, claim, failure scenario, evidence, concrete
fix, refutation vote record), a considered-and-refuted section so killed
candidates are visibly killed rather than invisibly dropped, the unrefuted
lower-severity candidates, a lens-coverage section naming what each lens
checked and which came back empty-handed, and an honest-failure section.

Write to `delivery/review/verification-<subject>.md`. The orchestrator
commits it; the agents do not.

## Investigating an unexplained failure

When something fails intermittently and no cause is known, the deliverable
is a reproduction, not a theory. Run parallel hypotheses, each in its own
isolated clone:

- Brute reproduction in the exact failing configuration, many runs, full
  output captured, conditions varied and recorded.
- The instrument is lying (the test seam, harness, or fixture produced a
  false witness).
- The system is genuinely broken (try to force the invariant violation with
  process-level tools such as SIGSTOP parking at each interesting window).
- Cross-component interference (shared paths, leaked environment, resource
  starvation) especially when the failure appears only in a full run and
  never in an isolated one.

Tell every investigator what has already been ruled out, so effort is not
re-spent. Require an explicit verdict field distinguishing "the system is
broken" from "the instrument lied" from "undetermined", and require that a
claimed root cause explain the SPECIFIC observed symptom, not a plausible
neighbouring one. An honest "could not reproduce in N attempts, here is the
harness and what was eliminated" is a valid result and must not be dressed
up as a conclusion.

Whatever the outcome, ask for the structural fix that makes this class of
failure loud and attributable next time rather than silent.

## Hard rules

- Agents work in isolated copies, never in a worktree another agent is
  editing, and never in the main checkout.
- Nothing an agent finds is committed by that agent; the orchestrator
  commits the report.
- A finding without a concrete fix is half a finding.
- Do not merge around an unexplained failure in foundation code. Settle it
  or state plainly that it is unsettled and let the owner decide.
