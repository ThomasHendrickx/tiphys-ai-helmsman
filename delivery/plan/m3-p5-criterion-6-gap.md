# M3-P5 criterion 6 is not satisfiable by any phase's current declaration

- date: 2026-08-12
- found by: the orchestrator, preparing M3-P5's completion dispatch while
  M3-P4's CI ran
- status: RECORDED, not yet acted on. To be batched into paperwork AFTER M3-P4
  merges, deliberately: opening a paperwork pull request now would move `main`
  and put PR #81 "behind" again, which was just resolved.

## The criterion

kernel-plan-m3.md, M3-P5 criterion 6:

> `tiphys validate --type report` accepts an investigator report only when a
> `repro` reference is present for a root-cause verdict, and rejects the same
> report with the reference removed (R-015a made mechanical through the report
> contract rather than left as brief prose; Kind A `if`/`then`, both
> directions).

"The report contract" is `schemas/report.schema.json`.

## The three facts, each measured

1. **The constraint does not exist.** At M3-P4's head, `schemas/report.schema.json`
   contains no `repro` and no `root-cause` token. The only two matches for
   `reproduced` are unrelated prose, one about tuition T-006 and one about fix
   round 5's own derivation. So nothing in the shipped schema enforces this.
2. **`R-015a` is assigned to M3-P5.** It appears in
   delivery/plan/phase-declarations/m3-p5.json:1, in
   delivery/plan/kernel-plan-m3.md:1, in delivery/plan/kernel-plan-v1.md:1 and
   in delivery/requirements/migration-table.md:1.
3. **M3-P5 cannot touch the file it needs.** `schemas/report.schema.json` is
   absent from M3-P5's `filesToTouch` and present in M3-P4's.

So the criterion is assigned to a phase whose declaration forbids the only edit
that could satisfy it, and the phase that owns the file was never asked to make
that edit: it is not among M3-P4's acceptance criteria, and M3-P4's dual review
walked 23 of 23 criteria without this among them.

**This is not an M3-P4 defect.** M3-P4 built what it was asked to build. It is a
gap between two phases' declarations, and it was invisible to both the
file-level conflict pre-pass and the criterion-level dependency screen, because
both look for a phase READING another's file, and this is a phase needing to
WRITE one.

## What M3-P5 actually did, which was right

The implementer reported criterion 6 as NOT delivered rather than doing either
available wrong thing: creating an undeclared file (a red scope gate), or
registering `investigator-report-requires-repro` in `test/behaviors.json` with
no test resolving it (a red `suite` gate, and the false-green shape this
repository has already paid for). It recorded the reason in its work history.

## The recommendation, which is mine to decide under DR-0016

**Amend M3-P5's declaration to add `schemas/report.schema.json`**, and complete
criterion 6 in M3-P5 after M3-P4 merges.

Reasoning: the criterion, the requirement id and the test files are all
M3-P5's; only the schema file is not. Moving one file onto the declaration is a
smaller and more honest change than moving a criterion between phases, and it
keeps R-015a's owner and its evidence in the same phase. The alternative,
reopening M3-P4 to add a constraint that was never in its criteria and that its
dual review therefore never examined, is worse: it would put an unreviewed
schema change into a phase that has just cleared a five-round review chain.

This is not a DR-0016 escalation. The options are not comparable and I would
defend the recommendation.

## What must happen at dispatch, and why it is not automatic

The scope auditor reads the declaration FROM THE MERGE BASE. So the amended
declaration must be merged to `main` BEFORE M3-P5's next push, or the scope gate
will audit against the old list and redden on the schema edit. That ordering is
the whole reason this is recorded rather than left to the dispatch turn.

## What this does NOT establish

- **Whether other criteria in M3-P6 to M3-P10 need to WRITE a file their phase
  does not own.** The dependency screen looked only for READS. The same sweep in
  the write direction has not been run, and this record does not claim the gap
  is unique. Running it is worth doing before the next dispatch.
- Whether `R-015a`'s wording obliges exactly this schema shape, or whether the
  plan intends some other mechanism. The criterion names "the report contract"
  and Kind A `if`/`then`, which is what the reading above rests on.
