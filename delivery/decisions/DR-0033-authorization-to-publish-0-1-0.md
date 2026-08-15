# DR-0033: authorization to publish `@tiphys/kernel@0.1.0`

- date: 2026-08-14
- status: DECIDED by the owner, in conversation
- raised as a NEW record rather than an amendment to DR-0032, which states that
  the publish remains the owner's call. A decided record is never reopened.

## The decision, in the owner's words

> "when done, release 0.1.0"

## What "when done" is taken to mean, stated so the condition is checkable

The authorization is read as conditional on M3-P12 landing, because that is what
the sentence it answers was about: the phase exists precisely so that the first
real release carries a tag and a GitHub release produced by the machinery rather
than added by hand afterwards. Publishing before it lands would deliver the
version the owner asked for and lose the reason they asked for the phase.

The condition is therefore:

1. M3-P12 merged to `main`, having been through clean-room review like any other
   phase.
2. The post-merge `push` run on the new `main` tip observed to completion and
   green, read by step (T-009).
3. A REHEARSAL dispatch of `release.yml` on that new tip, green, with the publish
   step SKIPPED. The workflow will have changed since the rehearsal of
   2026-08-14 20:03Z, and that rehearsal is evidence only for the configuration
   it ran under.

Only then the real dispatch, `version: 0.1.0` and `confirm: 0.1.0`.

## What this authorization does NOT cover

- **It is for `0.1.0` and for nothing else.** It is not standing permission to
  publish future versions, and a later release is a fresh decision.
- **It does not cover `@tiphys/claude-code-plugin`**, which has no release
  workflow.
- **It does not waive any of the three conditions above.** If M3-P12 is
  abandoned rather than merged, this record's condition is unmet and the
  orchestrator returns to the owner rather than reading "when done" loosely.

## The one thing that will still be true after the publish

The publish arm has no witness and cannot get one without publishing. Steps
`Publish to npmjs over OIDC` and `Release verification against the registry,
after publishing` are the only two in that workflow that have never executed,
and the rehearsal of 2026-08-14 is what established that everything else has.
So this authorization is also the moment those two are exercised for the first
time, on the real artifact, which is an accepted asymmetry rather than an
oversight. It is written down here so that a failure in either is read as the
first execution of an unwitnessed path and not as a surprise.
