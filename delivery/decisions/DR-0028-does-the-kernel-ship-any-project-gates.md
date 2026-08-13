# DR-0028: does the kernel ship any project gates, or only the gate contract?

- id: DR-0028
- project: tiphys-kernel
- question: M4's paragraph reads as though seven named project gates (typecheck,
  lint, i18n parity, analytics symmetry, manifest regen, e2e, docs grep) land IN
  the kernel. Should the kernel ship project gates at all, or ship only the
  CONTRACT and let a project declare its own?
- status: **RAISED, NOT DECIDED.** Raised by the OWNER, 2026-08-13, unprompted,
  while M3-P9 was in its fix round.
- decides: the framing of M4's intake, which plan decision D-19 makes mandatory
  before M4 can dispatch
- does NOT reopen: DR-0020, which is decided and whose closed-at-v0.1.0 half was
  right. This is the half DR-0020 deferred, coming due.
- date raised: 2026-08-13

## The owner's concern, in their words

> Aren't we making tiphys too specific and giving it too many responsibilities?
> I would assume that the actual gates are project specific, so an integration
> point is needed where the project hooks into on what those gates are. A
> project without e2e tests has zero need on that gate. Same for a pure local
> project with no github actions. There are patterns we can use to expose that
> and we can think on making examples for this. But hardwiring that into tiphys,
> I am getting a bad feeling on this.

## Why this is raised rather than answered

Half of it is already solved, and half of it is a real open question. Saying so
precisely is the point of this record, because answering the solved half would
look like an answer to both.

### The half that is solved: applicability

The registry already carries `applicability: required | conditional`, ten and
five respectively at `1fd2834`, and SC-011's semantics travel with it: **a gate
whose precondition is unmet reports not-applicable and NEVER green.** `deploy`
and `migrations` are already structurally not-applicable on the kernel itself.
`gate-registry.yaml`'s own header states the plan's intent for `i18n`,
`analytics`, `manifest regen`, `e2e` and `docs grep` is exactly
"declared-but-not-applicable".

So "a project without e2e tests has zero need of that gate" has a mechanism, and
it works.

### The half that is open: the vocabulary is closed

`applicability` decides whether a KNOWN gate applies. It does not let a project
declare a gate the kernel has never heard of. A Terraform plan check, or mobile
build signing, has no way in.

This is not speculation. A consumer-lens review in M3-P3 built a scratch
consuming project OUTSIDE this repository and pointed the shipped tools at it. A
consumer declaring `mode id: standard`, stages `design/implement/review/merge`
and role `backend-developer` was rejected on every one, because the mode,
pipeline-stage and role enums are closed with `additionalProperties: false`
throughout. A fully cooperative consumer with correct vocabulary AND its own
`gate-registry.yaml` still failed until it replicated this repository's charter
shape exactly. Recorded at
delivery/decisions/DR-0020-closed-vocabulary-at-v0-1-0.md:60.

DR-0020 shipped closed deliberately, on an asymmetry that still holds: widening
a closed enum later is backward compatible, closing an open one later is
breaking, and there was no real consumer to design extensibility against. **M4's
pilot is that consumer.** So this record is DR-0020's deferral arriving, exactly
as DR-0020 said it would.

## The leak is already in the tarball, and that is new information

Measured 2026-08-13 by the M3-P9 hazard reviewer, who built the real package and
installed it into a fresh consumer project:

- `gate-registry.yaml` IS in `package.json` `files`, so a consumer installs it.
- `scripts/`, `src/` and `bin/` are NOT.
- All thirteen script-verified gates in that shipped registry reference one of
  those three unshipped trees. `manifest-self-check`, listed first, crashes for
  every consumer.

So what ships today is not a template a project adapts; it is **the kernel's own
private registry, and it does not work outside the kernel.** That is the
over-specification the owner's concern names, already published rather than
merely planned. Full measurement in
delivery/review/clean-room-m3-p9-hazard.md:1, arbitrated at
delivery/review/arbitration-m3-p9.md:1.

## The orchestrator's recommendation, written first because DR-0016 requires it

**The kernel should ship the gate CONTRACT and ZERO project gates.**

- The kernel defines what a gate IS: id, command, applicability, unit label,
  precondition semantics, what not-applicable means, and the rule that a
  required gate which did not run is NAMED rather than silently absent.
- A project supplies its own registry declaring its own gates against that
  contract.
- The kernel's current registry becomes an EXAMPLE under `templates/`, not the
  shipped default.

Two things recommend this beyond the owner's instinct. It resolves the packaging
defect above for free, because the kernel stops shipping commands pointing into
its own unshipped source tree. And it makes M4's seven named gates the FIRST
CLIENT of an extension point rather than its definition, which is the difference
between a mechanism and seven hardcoded rows.

**The M4 paragraph should be reworded accordingly.** As written
(delivery/plan/kernel-plan-v1.md:368) "project-specific gate wiring lands for
the pilot" is ambiguous enough to be read as "hardwire these seven into
Tiphys", and D-19's mandatory M4 intake is the moment to remove that ambiguity
rather than discover it mid-milestone.

## Why this is still RAISED and not decided by the orchestrator

DR-0016 says that when the analysis yields a recommendation the orchestrator
would defend, the options are not comparable and there is nothing to ask. By
that test this would be an orchestrator decision.

It is left to the owner anyway, for two reasons that are about authority rather
than about difficulty:

1. **The owner raised it.** Deciding it unilaterally after they voiced a concern
   converts their input into a rubber stamp.
2. **It changes what the product IS.** "Ships a delivery process with gates" and
   "ships a gate contract that projects fill in" are different products with
   different adoption costs. That is a scope judgement, not an engineering one,
   and DR-0015 keeps scope with the owner.

## What this record does NOT establish

- **It does not survey the alternatives.** Only the recommendation is worked
  through. A hybrid, where the kernel ships a small set of universal gates such
  as `suite` and `scope` and everything else is project-supplied, is plausible
  and is NOT analysed here.
- **It does not measure the cost.** Nobody has estimated what moving the kernel's
  registry to `templates/` breaks, and the answer bears on M3-P10, whose exit
  test is a package that installs and imports.
- **It asserts nothing about M4's other five workstreams.** D-19 names six; this
  touches pilot bootstrap and harness adapter and leaves fleet durability,
  cross-environment exclusion, authority enforcement and cutover untouched.
- **The seven gate names are quoted from the plan paragraph, not from a
  registry.** They exist in no registry today; `gate-registry.yaml`'s header
  records that M2-P1 shipped none of the five project-specific ones and that
  promoting them would have been inventing them.
