# DR-0013: Release verification is a pluggable interface, not a fixed selector list

- id: DR-0013
- project: tiphys-kernel
- task: m2-planning
- question: Raised by the M2 planner as "which platform does the deploy verifier's first concrete adapter target". The owner rejected the framing and replaced it with a broader one: what is the right shape for post-merge release verification, given that different projects verify release in fundamentally different ways?
- reversibility: costly (the interface is what every project's verification plugs into, and the charter field that selects one is part of the owner-facing contract; changing it later means changing every project's charter and every shipped adapter)
- status: decided in principle, interface design under investigation
- decided: Pluggable interface with kernel-shipped reference adapters (owner, 2026-08-05)
- date: 2026-08-05

## Decision

The question as raised assumed release verification is one thing with a
platform selector. The owner's position, recorded in their terms:

One instance of Tiphys may run a project that needs a Vercel check. Another
may run a project on Hetzner and need to check whether that has actually
deployed. Another may run locally and have no remote deployment at all.
Another may be an Android or iOS app, where "deployed" is not a deployment
poll in any web sense. Therefore this needs an interface and a defined way of
working, with some implementations shipped for the platforms typically used,
rather than a rigid gate with a couple of selectors.

That is accepted as the direction. The exact interface is not being decided
by assertion here: it is going to an investigation first, because getting a
plugin contract wrong is expensive and the failure mode of inventing an API
shape that matches nothing real is one this project has already recorded
(tuition T-003, and the M2 plan's own note that this is the phase most likely
to repeat the M1-P3 failure because the milestone never reaches the state it
guards).

## What follows from it, and what does not

Follows immediately:

- **Not-applicable becomes a first-class outcome, not an edge case.** A
  locally-run project has no remote release to verify, and it must be able to
  say so as a declared configuration rather than by failing a precondition
  check by accident. The M2 plan already treats not-applicable as a status;
  what changes is that it becomes a legitimate declared choice, not only an
  unmet precondition.
- **The kernel ships reference adapters, not the only adapters.** A project
  supplies its own when its platform is not covered. What the kernel owes is
  the contract, the loader, and enough working examples that a new adapter is
  written by analogy.
- **The charter selects and configures it.** Which verifier a project uses is
  a per-project declaration, which puts a field in the charter schema (M3) and
  makes this decision one of the inputs to that schema rather than only a gate
  detail.

Does not follow, and is explicitly not decided here:

- The interface's actual shape, its lifecycle, how a project registers a
  custom adapter, or how credentials reach it. That is the investigation.
- Which reference adapters ship first, and whether any ships during M2 at all.
- Whether this generalizes to migration verification too (see below).

## The question the investigation must answer first

Whether "deploy verifier" and "migration verifier" are two gates or two
instances of one pluggable post-merge verification concept. The blueprint
lists them separately and the M2 plan builds them in one phase. The owner's
reframing suggests they may be the same shape: a project declares what must
be true after a merge before the next phase may start, and the kernel runs
whatever answers that question for that project.

If they are one concept, M2-P7 changes shape substantially and the saving is
real. If they are two, the reason should be written down rather than assumed
from the blueprint's table layout.

## Impact on work already planned

- **M2-P7** was scoped to build two verifiers to contract with a poller whose
  response semantics are grounded in a real captured platform response or else
  deferred. That phase is not invalidated, but its centre of gravity moves
  from "poll a platform" to "define the contract and prove it with adapters".
  The M2 planner should not act on this until the investigation reports.
- **M3's charter schema** gains a verification field. The M3 planner should
  hold that space rather than design it now.
- Neither milestone can dispatch before M1 completes, so there is time to do
  this properly, and no phase is blocked while the investigation runs.

## Evidence

- Owner's framing, 2026-08-05, recorded above in their terms.
- The gate table treating deploy and migrations as conditional with
  not-applicable statuses: delivery/plan/kernel-plan-m2.md, gate table and
  M2-P7.
- Why inventing an unreal API shape is the specific hazard here:
  delivery/tuition/T-003-fix-rounds-need-verification.md, and the M2 plan's
  own risk note that M2-P7 guards a state the milestone never reaches.
- The precedent for this shape inside the kernel already: the executor adapter
  contract from DR-0007, where the kernel owns the contract and ships one
  implementation while others remain additive.
