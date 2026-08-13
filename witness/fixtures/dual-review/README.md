# Dual-review decorrelation verdict fixtures (M3-P9 criteria 7 and 7b)

Five verdict documents. They are combined into SETS by
`test/dual-review.test.ts`, which stages a context directory holding the
repository's own `assurance-modes.yaml` and a charter, drops the chosen
verdicts into `delivery/review/`, and runs
`node scripts/check-dual-review.mjs <dir>` against it.

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
