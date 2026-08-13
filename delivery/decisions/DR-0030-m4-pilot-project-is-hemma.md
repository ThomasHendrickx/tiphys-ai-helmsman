# DR-0030: the M4 pilot project is `hemma`

- id: DR-0030
- project: tiphys-kernel
- question: M4's exit test is "the pilot project's next phase runs through v1,
  merged and deploy-verified entirely on v1". No record named a project, so M4's
  mandatory intake could not be written.
- status: **DECIDED BY THE OWNER, 2026-08-13.**
- date: 2026-08-13

## The decision

The M4 pilot project is **`github.com/ThomasHendrickx/hemma`**.

## Why this needed a record rather than a note

Plan decision D-19 makes an M4 intake mandatory before M4 may dispatch, and the
intake cannot be written without knowing the pilot, because four of its six
workstreams are about a specific project: pilot bootstrap (charter, project
configuration, gate applicability), harness adapter, authority enforcement, and
cutover. The M4 paragraph is at delivery/plan/kernel-plan-v1.md:368.

It is also the first real test of the boundary the owner set in
`delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md`,
quoted rather than cited by line because this branch adds that file too.
`hemma` is a project the kernel did not build and whose gates the kernel has
never seen, which is exactly the consumer that DR-0020 said did not exist yet and
whose absence was the reason the vocabularies shipped closed.

## What this record does NOT establish

- **Nothing about `hemma` has been measured.** No agent in this session has
  read that repository; it is not attached to this session, and attaching it is
  an explicit step that has not been taken. Everything about its shape, its
  gates, its language and whether it satisfies DR-0029's applicability envelope
  is UNKNOWN and is work for the M4 intake.
- **It is not an assertion that `hemma` is suitable.** DR-0029 Part 3b lists
  cases where Tiphys does not apply. The intake owes an explicit check of the
  pilot against that list, and "the owner named it" is not that check. If the
  pilot turns out to sit in the does-not-apply band, that is a finding to
  report, not a constraint to bend around.
- **It does not schedule M4.** M3 is not complete, and M4 may not dispatch
  without its own intake and plan.
- **The repository is not yet reachable from this session.** Adding it is a
  deliberate act at intake time, not a side effect of this record.
