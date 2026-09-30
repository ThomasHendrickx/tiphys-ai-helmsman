# Dual-review verdict fixtures (M3-P9 criteria 7 and 7b)

Five verdict documents. They are combined into SETS by `test/dual-review.test.ts`,
`test/verdict-head.test.ts`, `test/merge-preconditions.test.ts` and others, which
stage a context directory holding the repository's own `assurance-modes.yaml` and
a charter, drop the chosen verdicts into `delivery/review/`, and run
`tiphys validate --type verdict` or the merge gate against it. M6-P5 deleted the
decorrelation check they were first written for (DR-0062): the family of a review
is now what the kernel observed when it launched the reviewer, recorded under
`delivery/review/records/`, and the `produced-by` values below are history that
no reader compares.

WHY THEY LIVE HERE AND NOT UNDER `test/fixtures/`. `witness/` is on this
phase's declaration and `test/fixtures/` is not
(delivery/plan/phase-declarations/m3-p9.json:1). The criteria name no path, so
the choice was made before dispatch rather than discovered from a red gate
(delivery/plan/m3-p9-dispatch-read.md:59).

WHY A SUBDIRECTORY AND NOT `witness/` ITSELF. `src/witness/spec.ts:239` lists
the `.json` entries DIRECTLY inside `witness/` and reads each as a witness spec,
deliberately non-recursively. A verdict fixture placed beside the specs would be
validated as one and the red-witness gate would report it as malformed.

Every fixture names phase `M3-P9` and framings that exist in
`checklists/clean-room.yaml`, so nothing here is a stand-in for a vocabulary
that does not exist.

| file | produced-by | framing | review-contract |
|---|---|---|---|
| `decorrelated-criteria.yaml` | family-a | criteria-contract | criteria |
| `decorrelated-hazard.yaml` | family-b | destructive-paths | hazard |
| `shared-family-hazard.yaml` | family-a | destructive-paths | hazard |
| `shared-framing-hazard.yaml` | family-b | criteria-contract | hazard |
| `shared-contract-criteria.yaml` | family-b | destructive-paths | criteria |
