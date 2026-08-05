# T-005: A lesson the codebase had already paid for did not reach the next phase that needed it

- id: T-005
- project: tiphys-kernel
- date: 2026-08-05
- stage: M1-P5 (watcher and liveness guard), first dual review
- kernel-relevant: yes (tuition flow, role briefs, implementer brief contents)

## What happened

M1-P3 implements a claim-file mutual-exclusion pattern in `src/lock.ts`. During
that phase an investigation established that a claim which cannot be taken must
fail LOUDLY and name the stuck file, because a silent timeout is
indistinguishable from an absence of contention. That was not a style
preference: it came out of a multi-hour investigation into an unexplained
failure, and the loud behaviour was one of two guards that investigation
required before the phase could merge.

Two phases later, M1-P5 implemented the same claim-file pattern for the
watcher's seen-state, and absorbed the timeout silently. The consequence was
the most severe defect found in M1: a stranded claim file made every
subsequent watcher pass, resident or single, silently and permanently report
that there was nothing to surface, for a genuinely pending signal, while the
beacon kept advancing so the liveness guard reported the fleet healthy
throughout. A reviewer reproduced it with captured output.

The implementer had read the plan, the repository's agent-rules file, the
constraint list, the accumulated environment warnings, and three prior work
histories. None of them carried the rule. It lived in the M1-P3 source, in an
investigation report filed under a different subject, and in the head of
whoever had been present for it.

## Lesson

**A lesson attached to a component does not travel to the next component that
needs it.** The mechanisms this project already has all failed here for
understandable reasons:

- Environment warnings in the agent-rules file capture ENVIRONMENT hazards
  (this Node version, this git behaviour, this CI quirk), not design rules
  about a mechanism.
- Work histories capture what a phase did and why, and a later implementer
  reads them for inherited warnings, not for design rules about a mechanism it
  has not yet decided to use.
- The investigation report that established the rule is filed by the mystery it
  solved, not by the mechanism it constrains.
- Tuition entries record failure modes for the humans and agents running the
  process, and none of them was about this pattern.

The gap is not carelessness. It is that the project has no index from MECHANISM
to RULE. An implementer reaching for a claim file, a lease, an append-only log,
a rollback, or a destructive git operation has no way to ask "what has this
project already learned about this mechanism" and get an answer.

## Structural consequences

- **M3 role briefs (implementer brief)**: the mandated reading section must
  include a mechanism index, not only the plan, the rules file and prior work
  histories. The brief should require an implementer to look up every mechanism
  it is about to use before writing it.
- **A mechanism index is a kernel artifact.** It maps a mechanism (claim file,
  lease, append-only log, worktree removal, force delete, retry classification)
  to the rules this project has established for it and the evidence behind each.
  It is small, it is structured data under DR-0006, and it is checkable: a rule
  with no citation to an investigation, review or tuition entry is not a rule.
- **The tuition flow (M3-P8) should be the writer of that index.** A tuition
  entry that constrains a mechanism must name the mechanism, so the index is a
  projection of the tuition feed rather than a second thing to maintain.
- **Cheap interim measure, available now**: when a phase establishes a rule about
  a mechanism, the implementer records it in the source at the mechanism's
  definition AND names the sibling implementation. M1-P5's fix round did exactly
  this, recording that there are now two claim-file users, that they share one
  rule, and that a third should read `src/lock.ts` first. That is the right
  shape and it should become standard practice rather than a one-off.

## What this says about the kernel being built

The project's own blueprint says failure modes discovered in a project produce
tuition, and kernel-relevant tuition ships upstream. This incident says
something narrower and more actionable: tuition indexed only by INCIDENT is
insufficient, because the next person to need it does not know the incident
happened. It must also be indexed by the thing it constrains.

## Evidence

- The loud behaviour and why it was required: `src/lock.ts`, and
  `delivery/verification/u2-race-flake-investigation.md`, defect D-3 and the
  structural-fix section.
- The silent reimplementation and its reproduction:
  `delivery/review/clean-room-m1-p5-second.md`, finding 1.
- The fix and the interim measure now in place: `delivery/work-history/m1-p5.md`,
  fix-round section.
- The blueprint's tuition flow: `delivery/intake/orchestrated-delivery-v1.md`
  section 9.
