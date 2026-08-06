# Phase declarations

One JSON document per M2 phase, the projection the scope auditor (M2-P4)
reads. Authored by the orchestrator from `delivery/plan/kernel-plan-m2.md`
section 3's files-to-touch lists, committed to `main` BEFORE any phase
branch is created, never authored or edited on a phase branch (plan section
3 preamble, M2-P4 step 4). The anti-widening property depends on the merge
base: the auditor reads the declaration from the merge base of the audited
branch, so a declaration that is not on `main` when the branch forks cannot
govern that branch.

Shape, fixed by M2-P4 step 2: `{id, branch, filesToTouch, declaredExtras,
citations}`. Entries are literal paths or literal directories (M2R-016).
`test/behaviors.json` and `delivery/work-history/<phase-id>.md` are the two
standing pre-authorized extras and are the auditor's to add, but
`test/behaviors.json` also appears in each files-to-touch list here because
the plan's own lists carry it; the duplication is harmless and keeps this
projection a faithful copy of the plan text. `gates.manifest.json` appears
on each declaring phase's own list per M2R-020.

The directory location is the orchestrator's decision (DR-0016,
recommendation-backed): the declarations are the build's paperwork, not a
kernel deliverable, so they live under `delivery/plan/` beside the plan
they project. M2-P4's gate takes the declaration path from configuration,
so the location is an input, not a hardcode.
