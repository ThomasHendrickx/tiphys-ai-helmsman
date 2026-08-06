# T-007: A phase met fifteen of fifteen executed acceptance criteria and still live-locked every supervision command

- id: T-007
- project: tiphys-kernel
- date: 2026-08-05
- stage: M1-P5 (watcher and liveness guard), third dual review
- kernel-relevant: yes (gate registry, plan schema's acceptance-criteria
  contract, reviewer role briefs)

## What happened

Two clean-room reviewers examined the same head on different model families.
Both walked all fifteen of the phase's acceptance criteria by direct
execution, not by reading. Both agreed on every mechanical fact: gate exit
codes, test counts, registry resolution, scope audit, constraint scans.

One returned APPROVE. The other returned FIX-ROUND-NEEDED on a high-severity
defect that live-locks `doctor`, `spawn`, `teardown` and both watcher entry
modes, silently, with no output at all. The defect was reproduced twice, with
captured output, and is real.

The reviewer who approved was not careless. Its report does not contain the
word `readBeacon`. It never probed the path, because NO ACCEPTANCE CRITERION
COVERS IT. The criteria describe what the watcher and guard do when the files
they read are files. Nothing in them describes what happens when an entry in
`state/` is a named pipe, a directory, or a socket.

So a reviewer executing the phase's entire contract faithfully and completely
could not have found the defect. The contract did not contain it.

## Lesson

**Acceptance criteria are a specification of intended behavior, and a
specification of intended behavior is not a specification of the failure
surface.** A phase can be complete against its criteria and still be
dangerous, and no amount of rigor in walking the criteria will close that gap,
because the gap is in the criteria rather than in the walk.

This is not an argument for more criteria. Fifteen was already a lot, and
enumerating every hostile filesystem state ahead of time is not achievable.
It is an argument that criteria-walking is ONE assurance mechanism and cannot
be the only one, and specifically that a review whose contract is the criteria
must be paired with a review whose contract is the hazard.

That pairing is what this project happened to have, by an accident of how the
two lenses were briefed. It should be a rule, not an accident.

## Why this is not T-001 again

T-001 records that reviewers on different model families catch different
defects, and that decorrelation is therefore worth paying for. True, and this
round is a third data point for it.

But the mechanism here is not model decorrelation. The two reviewers differed
in their BRIEF, not only in their model: one was given the criteria as its
contract, the other was given a starting question about what can block, hang,
or lose a signal. Had both been briefed on the criteria, both would have
approved, on any two models. The decorrelation that mattered was in the
question asked.

## Structural consequences

- **Reviewer role briefs (M3)**: a code phase requires two review contracts,
  not two reviewers. One walks the criteria. One is given a hazard question
  derived from the component's nature (what can block, what can be lost, what
  can never exit, what can destroy). The second contract must be a declared
  artifact, not left to whoever writes the dispatch prompt to remember.
- **Plan schema (M3-P1)**: a phase section that declares acceptance criteria
  should also declare its hazard classes, so the second contract is derivable
  from the plan rather than improvised per dispatch. For M1-P5 the hazard
  class was "this component reads files it does not own", which names the
  defect class directly.
- **Gate registry (M2)**: "all acceptance criteria met" must not be
  expressible as a terminal green. It is one input. The M2 traceability table
  already found that six of thirteen M1 defects are caught by no gate; this
  entry explains one reason why, which is that the gates inherit the criteria's
  blind spots.
- **Mechanism index (T-005)**: the defect class here, reading a file whose type
  has not been established, is a mechanism this project has now paid for twice
  in one phase. A criteria-based review will never surface it; a mechanism
  lookup would have.

## Evidence

- The two verdicts on one head, and the fact that they agree on every
  mechanical fact: `delivery/review/clean-room-m1-p5-third-hazard.md` and
  `delivery/review/clean-room-m1-p5-third-criteria.md`.
- The arbitration, including the observation that the approving review
  contains no occurrence of `readBeacon`:
  `delivery/review/arbitration-m1-p5-third-round.md`.
- The defect reproduced independently of both reviewers, with captured output
  and exit codes: `delivery/verification/cr-520-orchestrator-reproduction.md`.
- The prior entry on model decorrelation this one distinguishes itself from:
  `delivery/tuition/T-001-cross-model-review-catches.md`.
- The gate-coverage finding this explains:
  `delivery/plan/kernel-plan-m2.md`, section 1.5 defect-to-gate traceability.
