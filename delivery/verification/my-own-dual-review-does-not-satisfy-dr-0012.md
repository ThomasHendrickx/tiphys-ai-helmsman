# The orchestrator's dual review does not satisfy DR-0012 condition 1

- date: 2026-09-16
- found by: the orchestrator, checking its own review dispatch against the
  condition it is meant to discharge, after both first reviewers returned.
- status: **the merge path is blocked on this, and it is the second blocker
  found today.** The first is the missing root charter.

## What I set up, and why it is wrong

Each M4 phase gets two independent clean-room reviewers, dispatched together,
with different framings and different models: reviewer A on the session default,
reviewer B pinned to a different model.

DR-0012 condition 1 requires two independent clean-room reviews **produced on
different model FAMILIES**.

**Both of my reviewers are Claude models.** Different models, one family. The
condition is not met, and running two of them does not make it met.

## Why the machine check would not catch it

This is the measured false-green, now reached by my own hand rather than
hypothetically. `dual-review-decorrelation` compares canonicalised STRINGS for
equality, so two different Claude model names compare as DISTINCT and the check
reports the pair decorrelated.

It was measured twice before today, on this repository's own reviews:
delivery/verification/m4-prototype-probes.md:1 records a probe reproducing it
with the two real `produced-by` values from the M3 exit-test reviews, green,
"distinct on produced-by", while one of the two strings literally contains the
words "Anthropic model family".

**So had I not checked by hand, the gate would have told me the condition was
satisfied.** That is the whole reason the finding is worth a document: the
guard agrees with the mistake.

## What this does NOT mean

- **It does not make the reviews worthless.** Two independent agents, different
  framings, no shared context, both returned FIX-ROUND-NEEDED with findings.
  That is real review value and the phases are better for it. What it fails is
  the DECORRELATION property, which exists because two instances of one family
  tend to miss the same things.
- **It does not mean the reviews should be discarded.** They are evidence, and
  they are honest evidence, correctly labelled.
- **It does not reopen DR-0012.** The condition is the owner's and stands.

## What it means

**No M4 phase can merge under DR-0012's delegated authority as things stand.**
Three ways out, and only one of them is available today:

1. **A genuinely different model family** reviews each head. Not available to
   this orchestrator: every model it can dispatch is one family.
2. **DR-0038's declared single-family exception**, which the owner decided
   precisely for this case: the environment declares that one family is
   available, and the check reports a third status that is neither green nor
   red and says so plainly. **The mechanism is not built.** It is M4-P11, which
   the conflict pre-pass holds behind M4-P10 on `src/checks.ts`.
3. **The owner approves each merge by hand**, which is where merge authority
   sits by default and what DR-0012's delegation was granted to avoid.

## The disposition

**M4-P11 is promoted**, alongside the root charter, to the set of things that
must land before any phase merges. Both were discovered the same way: by
checking whether the machinery that is supposed to authorise a merge can
actually reach a verdict, rather than assuming a green gate means a satisfied
condition.

Until then phases build, phases are reviewed, fix rounds run, and nothing
merges. That is not a stall: it is the correct state for a pipeline whose merge
predicate is not yet computable.

## What is not established

- Whether the two reviewers, being one family, actually DID miss the same
  things. That would need a third reviewer from another family to test, which is
  the thing not available. The decorrelation requirement is a prior, not a
  measurement, and nothing here confirms or refutes it for these specific
  reviews.
- Whether any earlier merge in this project's history satisfied condition 1 in
  substance. The M3 exit-test pair measured above suggests at least one did not,
  and no audit of the merged history has been run.
