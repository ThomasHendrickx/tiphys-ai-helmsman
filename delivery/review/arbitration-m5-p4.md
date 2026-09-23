# Arbitration: M5-P4 merge, 2026-09-23

Orchestrator record under DR-0012 condition 6, for PR #209 (branch
`claude/m5-p4-ci-truth`). The plan entry is
delivery/plan/value-delivery-plan.yaml:1 under M5-P4.

## Reviews on the record

| review | head | verdict | open findings |
|---|---|---|---|
| clean-room-M5-P4-opus-criteria.md | 602cc6d | FIX-ROUND-NEEDED | CR-001 medium, CR-002 low, CR-003 low |
| clean-room-M5-P4-sonnet-hazard.md | 602cc6d | APPROVE | CR-001 low, CR-002 low |
| verification-M5-P4-fix-round-opus.md | bbc53a4 | APPROVE | CR-V1 low, CR-V2 low |
| verification-M5-P4-fix-round-sonnet.md | bbc53a4 | APPROVE | CR-004 low, CR-005 low |

The two reviews disagreed at 602cc6d on one point: opus found the CI-step
harness ran steps under a different shell from the runner (medium), and
sonnet did not. That finding was reproduced by its reviewer on the real
workflow (a `| cat` defang stayed green). It is not a matter of preference, so
it was taken as a fix round. Fix round 1 closed it, and both families
verified the delta on the next head.

## Declaration entries added on the branch

Both were printed by name by the scope gate, and both delta reviewers accept
them. Neither is in the plan's files-to-touch list, so they are recorded here.

- `delivery/plan/cutover/retirement-inventory.json`: required by the existing
  retirement-inventory test (T-033) for every new top-level declaration in
  `.claude/orchestrator-next.mjs`. Pure additions. It overlaps M5-P5, which the
  M5 pre-pass amendment records.
- `CLAUDE.md`: the section on reading a green bundle said the workflow uploads
  no artifact, which this phase makes false. The edit is confined to that one
  section.

## Lows carried as tracked items, not fixed

- Sonnet CR-001: `planNextAction` does not read the plan's `parallelizable`
  field. Every M5 phase is `parallelizable: false`, so plan order equals
  dependency order today.
- Opus CR-V1: the `| cat` defang check assumes the real workflow keeps the
  runner's default shell. A move to `shell: bash` reddens with a misleading
  message. It fails safe.
- Opus CR-V2 and sonnet CR-004, CR-005: the fallback list in the CLAUDE.md
  section omits "the run failed before the bundle step"; the workflow-level
  shell default and `working-directory` have no witness. Neither exists in the
  real workflow today.
- The six other test sites that run step text with `bash -c`, recorded in the
  work history as residue. The opus delta review swapped each to `bash -e -c`
  and no result changed.

## CI evidence

The CI-deferred criterion p4-summary-artifact was observed on a real runner
for the pull_request arm: run 35834743824 uploaded one artifact holding only
`summary.json`, with 7-day retention. The push arm is observed after merge.
