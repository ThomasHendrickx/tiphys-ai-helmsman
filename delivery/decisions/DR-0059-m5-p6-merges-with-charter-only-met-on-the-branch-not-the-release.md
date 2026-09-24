# DR-0059: M5-P6 merges with charter-only met on the branch, not the release

- id: DR-0059
- status: DECIDED
- decided-by: orchestrator, 2026-09-24, under DR-0016
- raised-by: final criteria review of M5-P6, finding CR-009 (medium)
- relates-to: DR-0012, DR-0016, DR-0058

## The situation

M5-P6 criterion p6-charter-only (delivery/plan/value-delivery-plan.yaml:446)
is NOT MET on the released kernel 0.2.1. hemma was onboarded on 0.2.1, which
has no `tiphys init --project`, so one kernel file, `assurance-modes.yaml`, was
copied into hemma by hand (item H-6 in
delivery/verification/m5-scale-out-exit.md:431, section 1g). This branch
ships `init --project`, which produces that file (DR-0058). So the gap is
closed in code and open in every released package.

The final criteria review found that nothing recorded a decision to merge in
that state.

## Options

A. Merge M5-P6 now with p6-charter-only recorded as not met on 0.2.1, and
   register the closing work as a follow-up: publish a release carrying
   `init --project`, run it in hemma, and show it reports the copy as present
   and identical.
B. Close the gap before merging: publish a release and run it in hemma first.

## Decision

A. B is not available as written. A release is cut from `main`, and the
code that closes the gap reaches `main` only when this phase merges. Releasing
from the phase branch would ship unmerged, partly reviewed work, which the
release procedure does not allow. So the order is fixed: merge, then release,
then prove it in hemma.

M5-P6 still delivered what it exists to prove, and the evidence says so
without softening: two disjoint phases ran concurrently in an existing
project and merged serially with green post-merge runs
(delivery/verification/m5-scale-out-exit.md:769). The one criterion not met
is stated as not met, with its cause.

## What follows

- A follow-up is registered in delivery/STATE.md under "Tracked obligations,
  unowned": the release carrying `init --project`, then the hemma run.
- Publishing that release needs the owner's approval, as every release has
  (DR-0053 for 0.2.1). The orchestrator asks for it after the merge.
- M5-P6's criterion stays NOT MET in its exit report until that run exists.
