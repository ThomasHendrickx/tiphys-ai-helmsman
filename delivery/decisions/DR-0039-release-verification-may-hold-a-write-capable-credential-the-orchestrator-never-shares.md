# DR-0039: release verification may hold a write-capable credential, and the orchestrator never shares it

- id: DR-0039
- project: tiphys-kernel
- task: M4 intake, open decision M4-D-21
- question: Release verification needs to read a deployment's status. Where a
  platform offers no read-only scope, do we accept a write-capable credential
  in the orchestrator's environment, or declare that project's verification
  `none` with a reason?
- reversibility: reversible, and the direction that costs nothing is
  tightening. Withdrawing it later costs only the verification it enabled.
- vetoable: the DIRECTION is not. The four conditions below are the
  orchestrator's implementation of it and are vetoable.
- revert-cost: one configuration change, plus whatever releases went verified
  under it.
- status: **DECIDED BY THE OWNER, 2026-09-15, BY SELECTING ONE OF THREE OPTIONS
  THE ORCHESTRATOR WROTE.** The four conditions below are the ORCHESTRATOR's
  implementation of that direction and are VETOABLE.
- decided: accept the write-capable credential, held ONLY by the orchestrator,
  never passed to an implementer payload, with the boundary enforced by code
  rather than by a promise
- date: 2026-09-15

## Where this question came from

It was raised as "the one genuine owner decision this re-grounding surfaced"
during M2's re-grounding, and marked as falling due at M4's pilot
(delivery/plan/kernel-plan-m2.md:626). It is due.

## Provenance

**The owner selected, and did not author.** The option text, verbatim as offered:

> **Accept it, orchestrator only.** The token exists, but only the orchestrator
> ever holds it. It is never passed to an implementer agent. The kernel already
> strips credentials from every agent it starts, so this is enforced by code,
> not by a promise.

The rejected options were turning deploy checking off for that project with a
recorded reason, and pausing while the owner checked whether a narrower token
was available.

**"Enforced by code" is in the option text the owner selected, so it is part of
the decision.** The four conditions in the section below are the orchestrator's
attempt to make that true and are vetoable; the direction is not.

## The decision, and the half that is not optional

The credential may exist. The constraint is **who holds it**.

That is the right test and the kernel half-passes it today, which is the part
worth stating plainly rather than reporting as done:

**What is already enforced by construction.** The child environment is an
ALLOWLIST of exact names (src/exec/env.ts:68), and five credential-store
pointers (HOME, XDG_CONFIG_HOME, GH_CONFIG_DIR, GIT_CONFIG_GLOBAL,
GIT_CONFIG_SYSTEM) are REDIRECTED to empty harness-owned paths rather than
dropped, because a dropped HOME makes tools fall back to the real one. The
construction fails closed: a failure to stage any redirect target aborts the
whole build (src/exec/env.ts:180). An implementer payload therefore cannot
reach a platform credential by any default path.

**What is NOT enforced, and is the reason this record has a condition.**
`allowPrCredentials` (src/spawn.ts:267) makes both children inherit the parent
environment UNCHANGED, including any credential the orchestrator holds. It is
unreachable from the `tiphys` CLI and fully reachable by any library consumer,
and `@tiphys/claude-code-plugin` will be a library consumer. Nothing observes
whether a given spawn used it: the `credential-scrub` gate probes the
CONSTRUCTION of an environment, never a real spawn, so a run that bypassed the
scrub is invisible to it.

**So the boundary is enforced for the path anyone would take by accident, and
unenforced against the path someone would take deliberately.** "Enforced by
code" is therefore a target of this decision, not a description of today.

## The conditions, which are part of the decision

1. **`allowPrCredentials` is forbidden for any project payload**, as a declared
   constraint on the adapter, not as guidance.
2. **Every name that must cross goes through `extraAllowlist`** (the
   per-invocation extension point at src/exec/env.ts:154), each with a written
   reason. The default allowlist is never widened and is never replaced by a
   denylist.
3. **Two structurally different red witnesses**, because one witness is not a
   class: one that reddens if a platform credential reaches an implementer
   payload, and one that reddens if the scrub is bypassed at all. The second is
   the one that does not exist today.
4. **The witness is observed from INSIDE the child**, not from the constructed
   environment object. A guard that checks only the object cannot tell a
   scrubbed run from an unscrubbed one, which is the cannot-go-red shape this
   repository keeps paying for.

M2 already wrote most of this contract and did not build it: the extension is
per-invocation and per-adapter, and the rule that it may never include a
pull-request-capable or push-capable credential is stated as checkable by
running the credential-scrub probe from inside the adapter's child environment
rather than by building a second mechanism
(delivery/plan/kernel-plan-m2.md:451). This decision adopts that contract
verbatim rather than writing a new one.

## What this does NOT decide

- **Which platform, or which project.** `pulse` is out of this orchestrator's
  scope under DR-0037, so the first application of this decision is unlikely to
  be a web deploy. Whether the kernel's own npm publish is the first release
  this covers is an open item in M4's plan.
- **Whether a narrower credential exists.** If a platform offers a scope that
  reads deployments and writes nothing, that is strictly better and this
  decision does not authorise reaching for a broader one out of convenience.
