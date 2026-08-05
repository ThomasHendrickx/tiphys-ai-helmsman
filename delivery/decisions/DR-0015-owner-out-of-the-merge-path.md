# DR-0015: The owner is not an approval step, including at milestone boundaries

- id: DR-0015
- project: tiphys-kernel
- task: m1-exit-test
- question: Raised from CR-608, which exposed that the M1 exit test's stage B assumes an owner approval inside a 900-second lease. The owner rejected the narrow framing and replaced it with a general one: the owner does not want to be an approval step anywhere in execution, at milestone boundaries included.
- reversibility: reversible (the owner can reinstate an approval gate at any time; every merge remains a squash commit on a public branch with its full evidence chain in the repository)
- status: decided in principle, one consequence flagged for the owner to overrule if they disagree
- decided: Owner out of the merge path; dual clean review is the approval (owner, 2026-08-05)
- date: 2026-08-05

## Decision

The owner's position, recorded in their terms:

They do not approve merges themselves any more, or keep it to a minimum. It
is the same as the phase pull requests: if the reviewers come back clean, they
accept. They cannot babysit every pull request review. The whole harness
exists so that the owner is no longer the bottleneck in execution, and so
their attention goes where it matters: goals, plans and blueprints.

That is accepted as the direction, and it is a stronger statement than
DR-0012. DR-0012 delegated merge authority for PHASE pull requests and
explicitly withheld it at milestone boundaries. This decision removes that
carve-out.

## What this changes, concretely

Three written things assume an owner approval and are amended by this record:

1. **DR-0012's limit "Never merge across a milestone boundary."** Superseded.
   The limit was the orchestrator's own guardrail, not an owner instruction,
   and the owner has now spoken to the matter directly. What SURVIVES from
   that limit, because it was two rules in one sentence: the exit test remains
   a hard gate, and its evidence is still presented to the owner. Presenting
   evidence is not the same as requiring a click, and only the second is
   removed.
2. **Plan v1 section 4, stage B**, "the owner's approval is recorded ... the
   orchestrator then merges". The approval artifact is still produced and still
   captured into the evidence bundle. What changes is who signs it: dual
   cross-model clean review under DR-0012's definition of clean, rather than
   the owner.
3. **The M3 plan's owner action A-3**, "approve the exit run's pull request".
   Removed as an owner action, on the same basis.

## The lease question that raised this (CR-608)

Adopted: **option 1, size the lease for the wait.** A certification run
acquires its lease with an explicit duration covering the whole approval
window rather than relying on the default 900 seconds, and stage C records the
observed lease state in the evidence bundle either way, so a lapse is reported
rather than silent.

Evidence for the sizing, measured in this session rather than guessed: a
single clean-room review of a code phase ran between 24 and 45 minutes, two
run concurrently, and a phase needing a fix round took hours end to end. A
900-second lease covers none of that. The default stays 900 seconds for
ordinary use; the certification run is the exception and says so explicitly at
the point of acquisition.

Note that this is now a MORE binding requirement than before, not less. With
the owner out of the path the approval wait is the review pipeline's wall
time, which is measurable and long, rather than a human who might answer in
two minutes.

## The consequence the owner should overrule if they disagree

Stage B exists in the blueprint as more than a rubber stamp. It is the one
place the exit test witnesses that the kernel can hand control to a human, sit
inert while nothing of its own is running, and resume correctly afterwards.
That is a real property of a delivery kernel, and if no human is ever in the
gate, the property goes unwitnessed.

The resolution taken here, which the owner can reject: **keep the mechanism,
change who signs.** The harness still stops, still waits for an approval
artifact it did not produce itself, still records it, and still resumes from
that artifact. The signature comes from the review gate rather than from the
owner. The handoff is therefore still exercised end to end, and the exit test
still proves the kernel can be driven by an external decision it does not
control.

What is genuinely lost: nobody witnesses a wait measured in days rather than
in minutes. That is recorded here rather than hidden, and it is the honest
residual of this decision.

## What does not change

- The exit test remains a HARD GATE. A milestone does not start before the
  previous exit test has passed with recorded evidence.
- Exit-test evidence is still presented to the owner, in full, without being
  asked for.
- The orchestrator still writes no feature code, still lets no review be
  skipped, and implementers still neither open pull requests nor merge.
- Everything DR-0012 defines as "clean" still binds, including the
  stop-and-wait limit, which has already fired twice and is the mechanism that
  brings a phase back to the owner when it is going wrong. Removing the
  routine approval does not remove the escalation path.
- Owner-reserved matters still exist: a decision record, the plan's binding
  conventions, and anything requiring elevated access. This record is itself
  an example, and it was raised to the owner rather than assumed.

## Evidence

- The owner's framing, 2026-08-05, recorded above in their terms.
- The limit this supersedes:
  `delivery/decisions/DR-0012-delegated-merge-authority.md`, the limits
  section.
- The stage B text amended: `delivery/plan/kernel-plan-v1.md` section 4,
  stage B and B1.
- The owner action removed: `delivery/plan/kernel-plan-m3.md` section 7,
  owner action A-3.
- The lease semantics that make the sizing necessary: `src/lock.ts`
  (`DEFAULT_LEASE_DURATION_SECONDS = 900`), and `checkHoldership` in
  `src/task.ts`, which fails closed on an expired lease, so an overrun makes
  the run fail rather than pass unsafely.
- The finding that raised it: CR-608 in
  `delivery/review/clean-room-m1-p6-hazard.md`, and the implementer's
  reasoned decline of its semantic half in `delivery/work-history/m1-p6.md`.
