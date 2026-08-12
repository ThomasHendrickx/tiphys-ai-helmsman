# M3-P5 sequencing: its PR is HELD until M3-P4 merges

- date: 2026-08-12
- decided by: the orchestrator under
  delivery/decisions/DR-0016-escalation-threshold.md:1 (a recommendation I would
  defend, so there is no question to put to the owner)
- refines: delivery/plan/m3-conflict-pre-pass.md:1
- declaration read: delivery/plan/phase-declarations/m3-p5.json:1
- to be folded into delivery/STATE.md with the M3-P4 arbitration batch

## The fact that forces it, measured rather than argued

M3-P5 delivered eight of nine acceptance criteria and reported criterion 6 as
NOT delivered. Checked independently at `origin/main` = cee7996:

```
$ git cat-file -e origin/main:schemas/report.schema.json ; echo $?
1                       # ABSENT from main
filesToTouch contains schemas/report.schema.json
  m3-p5.json : false
  m3-p4.json : true
```

Criterion 6 needs `schemas/report.schema.json`. It does not exist on `main`, it
is not on M3-P5's declaration, and it IS M3-P4's deliverable, which is unmerged.

**The implementer was right to refuse it twice over.** Creating the file would
have been an undeclared change and a red scope gate. And it deliberately did NOT
register `investigator-report-requires-repro` in `test/behaviors.json`, because a
registered behavior that no test resolves is a red `suite` gate, which is the
false-green shape this repository has already paid for. Refusing to manufacture
a passing appearance is the correct call and is recorded as such.

## The decision

**Do not open M3-P5's pull request yet.** Sequence:

1. M3-P4 merges (its dual review is in flight).
2. M3-P5 rebases or merges the new `main`, then completes criterion 6 against
   the now-present schema.
3. M3-P5 gets its dual cross-model clean-room review.
4. M3-P5 merges.

## Why, and what the alternative costs

Opening the PR now guarantees two cross-model reviewers walk a criterion that
CANNOT pass at that head. DR-0012 condition 3 requires both reviewers to walk the
acceptance criteria, so both would spend real work reaching "criterion 6 not met"
for a reason already known and already recorded. That is two reviews spent to
rediscover a dependency, and reviews are the scarcest thing in this pipeline.

The alternative considered and rejected: review the eight deliverable criteria
now and merge with criterion 6 tracked as an open item. Rejected because DR-0012
condition 2 forbids merging with an unresolved medium, and an acceptance
criterion that is simply not delivered is not weaker than a medium finding. A
phase is not done until every criterion has been walked with evidence or
explicitly marked CI-deferred with a reason, and "blocked on another phase" is a
sequencing fact, not a CI deferral.

## What this refines in the conflict pre-pass

delivery/plan/m3-conflict-pre-pass.md cleared M3-P5 to run CONCURRENTLY with
M3-P4 and said merge order stays dependency order with P4 first. Both halves
held. What the pre-pass did NOT predict is that concurrency would leave one
acceptance criterion unmeetable rather than merely leaving files to merge.

**The refinement, worth carrying to the remaining phases: a file-level disjointness
check does not detect a criterion-level dependency.** P5 and P4 were disjoint in
`filesToTouch`, which is what the pre-pass measured, and P5 still had a criterion
that reads another phase's deliverable. Before clearing the next pair to run
concurrently, read the ACCEPTANCE CRITERIA of the later phase for references to
the earlier phase's files, not only its `filesToTouch`.

The concurrency was still worth it: eight criteria, 21 behaviors, 9 witness specs
and a 528-test green suite were produced while M3-P4 was blocked in review, and
none of that work is wasted or needs redoing.

## What this does NOT establish

- Whether criterion 6 is the ONLY criterion in M3-P6 to M3-P10 with a
  cross-phase dependency. It has not been checked. The refinement above says to
  check it; this record does not claim it has been done.
