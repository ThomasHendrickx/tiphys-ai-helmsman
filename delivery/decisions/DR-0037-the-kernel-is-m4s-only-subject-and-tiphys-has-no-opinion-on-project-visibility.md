# DR-0037: the kernel is M4's only subject, and Tiphys has no opinion on a project's repository visibility

- id: DR-0037
- project: tiphys-kernel
- task: M4 intake, open decisions M4-D-16 and the A-2 owner action
- question: Does this orchestrator work on `pulse`, and must a project's fleet
  remote be private?
- reversibility: the scope half is fully reversible and costs a re-plan. The
  visibility half is reversible in principle and irreversible in practice: what
  a public repository has already served cannot be unpublished.
- vetoable: no, both halves are the owner's own instruction
- revert-cost: bringing `pulse` back costs whatever M4 phases were planned
  without it, plus the cross-session exclusion that is not built.
- status: **DECIDED BY THE OWNER, 2026-09-15.**
- decided: this orchestrator stays away from `pulse` and `pulse-fleet`; the
  kernel is M4's only subject; `pulse` is a portfolio project and stays public,
  and the kernel must not require otherwise
- date: 2026-09-15

## The decision, in the owner's terms

> Stay away for now. [...] No that was a suggestion but will never happen.
> Pulse will be a portfolio project so always open. Tiphys should not care
> about pulse anyway.

## Part 1: one subject, not two

DR-0036 made the kernel a SECOND subject alongside `pulse`. This makes it the
ONLY one. `pulse` keeps running in a session this orchestrator does not own.

**This does not reopen DR-0034.** `pulse` remains the pilot project. What
changes is who works on it. DR-0034 named the pilot; it did not assign the
session.

**The reason it is not a close call.** delivery/STATE.md:71 already carried the
standing instruction not to touch either repository, because two orchestrators
against one fleet is precisely the contention the session lock exists to
prevent, and cross-environment exclusion is a thing M4 is BUILDING rather than
a thing it has. Working `pulse` from here would have meant relying on the
mechanism under construction to protect the construction.

**What M4 loses, stated rather than minimised.** `pulse` was the greenfield
case and the deploying case. The kernel is neither: it is an existing codebase
with its own conventions, which is the ADOPTION case DR-0034 deferred
(delivery/decisions/DR-0034-pulse-is-the-pilot-and-the-controls-are-cut.md:29).
So M4 now tests adoption and does not test greenfield. Concretely unexercised:
a gate registry written by a project that is not this one, a suite that is not
this one's, and a deploy to a hosting platform.

**The consequence that is NOT settled here.** The M4 exit test requires "the
pilot project's next phase runs through v1, merged and deploy-verified entirely
on v1" (delivery/plan/kernel-plan-v1.md:368). With `pulse` out of reach, that
sentence cannot be run as written. Whether the kernel's own npm publish
satisfies "deploy-verified" under the shipped release-verification contract is
being established against the code, and is recorded as an open item rather than
assumed here because it is convenient.

## Part 2: visibility is the project's call, not the kernel's

Owner action A-2 reads "provide or approve creation of a PRIVATE remote
repository for each real fleet home" (delivery/plan/kernel-plan-v1.md:414). The
owner has refused the private requirement for `pulse` and given the reason: it
is a portfolio project, so being open is the point.

**A-2 encodes a project judgment inside a kernel-level obligation, and that is
the defect the owner's sentence exposes.** The kernel needs a DURABLE remote,
because fleet state that is not committed and pushed does not survive
reclamation. It does not need a PRIVATE one. Privacy was a correct judgment
about one project's data at one moment, and it was written into the action as
though it were a property of fleet homes.

This is DR-0029's split applied to itself: "Tiphys owns the PROCESS. The
project owns the PREDICATE"
(delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:50).
Durability is process. Visibility is predicate.

**A-2 is amended, not discharged.** Its requirement is now: a DURABLE remote
per real fleet home. Visibility is declared by the project and the kernel does
not check it. The `pulse` half of A-2 is CLOSED by this decision rather than
left open forever against an owner who has said no.

**What this costs, so it is not discovered later.** A public fleet home
publishes the delivery paperwork of whatever it delivers: work histories,
review findings, decision records. For `pulse` the owner has decided that is
wanted. Any future project must be told this plainly at charter time rather
than being allowed to discover it, so the charter is the right place for the
declaration.

## Measured at the time of deciding

- `ThomasHendrickx/tiphys-ai-helmsman-fleet` exists, is PRIVATE, and is empty
  (`size` 0, no commits). It is the kernel's fleet-home remote, and it
  discharges the kernel's half of the amended A-2.
- The fleet home itself is NOT yet initialized. `tiphys init` has not been run
  against it, deliberately: that is pilot-bootstrap work and D-19 forbids M4
  dispatching anything before its plan exists
  (delivery/plan/kernel-plan-v1.md:394).
