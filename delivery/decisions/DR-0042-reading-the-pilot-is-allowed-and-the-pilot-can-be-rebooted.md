# DR-0042: reading the pilot is allowed, and the pilot can be rebooted on request

- id: DR-0042
- project: tiphys-kernel
- task: the residual left open by DR-0037 and DR-0041
- question: Is READ-ONLY observation of the public `pulse` repositories inside
  or outside "stay away"? And is the pilot permanently out of reach, or
  available on request?
- reversibility: fully reversible
- vetoable: no, this is the owner's own instruction
- revert-cost: none
- status: **DECIDED BY THE OWNER, 2026-09-15.**
- decided: reading is allowed; the pilot can be rebooted by the owner to run
  the checks that need it
- date: 2026-09-15

## The decision, in the owner's terms

> You can read pulse if it helps, it is public so that is ok. [...] And I can
> reboot pulse to do the checks.

## What each half changes

**Reading is allowed.** DR-0041 treated it as forbidden and probed nothing, and
named this as the single owner sentence that would settle it. It is settled.
Consequences:

- The M4 plan may re-probe the pilot's CURRENT state rather than relying on
  delivery/verification/dr-0034-premise-check.md:32, whose clones were already
  two days stale when it was written and are now a month older.
- A read-only verification option exists at cutover: this orchestrator can
  check the pilot's own pushed evidence itself rather than accepting a report.
  That matters because a milestone exit test is a hard gate, and an agent's
  claim with no verifiable artifact behind it is treated as unknown.
- DR-0037's boundary is unchanged in the direction that matters. **Reading is
  not writing.** No push, no branch, no pull request, no fleet state, no lease.
  The contention DR-0037 avoids is two orchestrators WRITING to one fleet, and
  reading creates none of it.

**The pilot can be rebooted.** This is the larger half and it changes the
shape of the problem rather than one answer inside it.

DR-0041 deferred the exit test's subject to cutover entry with a written
trigger, and phrased that trigger as a condition on the world: whether
cross-environment exclusion is delivered and the pilot is reachable. **The
pilot's reachability is now an owner action, not a state of the world.** So the
exit test is DEFERRED, not BLOCKED, and the difference is worth stating because
the two lead to different plans: a blocked exit test invites designing around
it, and a deferred one does not.

## The trigger, restated

**DR-0041's trigger is superseded in BOTH clauses, and an earlier version of
this line said "the second clause only".** A review caught the inconsistency:
the restated trigger below carries no cross-environment-exclusion clause at all,
so claiming the first clause survived was false on its face. Under the narrower
reading in "What this does not settle" below, the pilot returns only for the
exit test and not as a working subject, so exclusion is not its precondition.

At **cutover entry**:

1. Re-probe the pilot read-only, which is now permitted, and record its current
   state. This is the first act, because everything below depends on facts that
   are a month stale.
2. Ask the owner to reboot the pilot session.
3. Run the exit test as written, on the pilot, with this orchestrator verifying
   the pushed evidence read-only.

**The amendment option in DR-0041 stays in reserve and its bar goes UP.** It
existed because the exit test might have been undischargeable. It is
dischargeable. Amending it now would be trading assurance for convenience, and
the record already says why that is the wrong trade at this particular
milestone.

## What does NOT change

- **DR-0037 stands.** This orchestrator does not WORK on the pilot. Its phases,
  its fleet and its merges are not this session's.
- **DR-0041's refusal of a kernel-only exit test stands, and is reinforced.**
  Its argument was that the exit test must prove the kernel delivers a project
  that is not itself, and that a kernel-only test applies the cannot-go-red
  shape to the handover. That argument did not rest on the pilot being
  unreachable. With the pilot reachable, the kernel-only option loses the one
  thing that made it tempting.
- **The assurance reduction DR-0041 recorded is PARTLY reversed, and only
  partly.** During M4's five non-cutover workstreams the kernel is still the
  only subject, so every observation in them is still self-hosted and the
  subject-versus-instrument control is still a human one. What returns is the
  control at EXIT, which is where it matters most.

## One thing this does not settle

Whether the pilot returns as a SUBJECT for the non-cutover workstreams, or only
for the exit test. This record assumes the narrower reading, because the owner's
words were "to do the checks". If the pilot were to return as a full subject,
DR-0037's contention argument comes back and cross-environment exclusion
becomes its precondition, exactly as `delivery/plan/m4-intake.md` already
sequences it in section 1.1. (Quoted without a line for the reason DR-0041 now
records: the intake is being edited and a line citation into it resolves
silently to the wrong text.)
