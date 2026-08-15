# DR-0034: the M4 pilot is pulse, and the M3 exit test's three controls are cut

- date: 2026-08-15
- decided by: the owner, in session
- status: DECIDED
- supersedes: the pilot choice in
  delivery/decisions/DR-0030-m4-pilot-project-is-hemma.md:1, which is NOT
  reopened. DR-0030 stands as the record of what was decided then and why.

## The owner's reasoning, in their terms

> let's not over engineer adoption. first get this thing working and just use
> it. how when where are questions less important than just using it

Both decisions below follow from that one sentence, and it is recorded verbatim
because the reasoning matters more than either decision.

## Decision 1: the M4 pilot is `pulse`, not `hemma`

`pulse` is a personal finance assistant, started from an empty directory.

**What this buys.** A greenfield start exercises the whole kernel loop: charter,
`tiphys init`, a plan written from nothing, the first phase, the first release.
Hemma is an existing project and would have let the kernel skip to phase
delivery on top of a shape somebody else had already made.

**What this costs, stated rather than glossed.** Greenfield never tests ADOPTING
an existing codebase, which is the more common real use and the one where the
kernel's assumptions about `delivery/`, branch naming and gate registries
collide with another project's conventions. **That is deferred, not solved.**
The orchestrator recommended deferring it to M5 rather than trying to get both
properties from one pilot, and the owner's steer above settles it.

**One consequence that is not a footnote.** Personal finance means real account
data. The `credential-scrub` gate and the fleet's read scope stop being
theoretical at M4, because this is the first time they guard something whose
disclosure would matter.

**Owner actions this creates:** a repository for `pulse` added to the session's
GitHub scope, and A-2, the private fleet remote, which was already owed.

## Decision 2: the M3 exit test's three falsification controls are CUT

C1, C2 and C3 are recorded as **skipped by decision**. Not passed, not
not-applicable, not pending. Those three words would each be false and the
distinction is the whole point of recording it.

**What they were for.** Section 4's E0.5 defines them so that a stage which
silently did nothing is distinguishable from a stage that passed. Each names the
stage at which the run must fail, and a control that PASSES is an exit-test
failure.

**Why they are cut.** They are a meta-check on a rehearsal. The kernel is about
to be pointed at a real project, which tests it harder than any control does,
and the exit test has already paid for itself: it found a gate emitting false
reds that blocked legitimate delivery, and a check that reported PASS on an
empty `AGENTS.md`. Both are fixed and both were found without the controls.

**What the cut costs.** The exit test's "measures rather than merely passes"
claim is now UNSUPPORTED. Section 4.5 lists that among what the exit test
proves; with the controls cut it does not prove it. Anyone citing 4.5 must read
this record alongside it. The stages the controls would have reached, Kind A
schema validation, Kind B derived-check invocation, and review-contract
distinctness, have no falsification evidence in this bundle.

That is a real reduction in assurance and it is written here plainly so that a
later reader finds it stated rather than inferred.

## What this record does NOT decide

- It does not change any other exit-test stage. E1, E2, E3 and E4 stand as the
  plan writes them.
- It does not retire the controls as a mechanism. A future milestone may run
  them; nothing here says they were a bad idea.
- It does not say `hemma` will never be a pilot.
