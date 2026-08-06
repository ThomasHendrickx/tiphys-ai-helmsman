# M2 conflict pre-pass

- date: 2026-08-05
- purpose: DR-0011 condition 1 requires a recorded pairwise files-to-touch
  disjointness check before any parallel dispatch. This is that check for M2,
  done by hand, standing in for the M5 automated pre-pass.
- outcome: **M2-P1 is the only serialising phase. M2-P2 through M2-P8 are
  mutually disjoint and can all run concurrently. M2-P9 runs last.**

## The dependency graph, read from the plan's own grounding fields

| Phase | Grounds on | Can start when |
|---|---|---|
| M2-P1 | M1 merged with exit evidence | M1 exit test passes |
| M2-P2 | M2-P1 merged | P1 merges |
| M2-P3 | M2-P1 merged | P1 merges |
| M2-P4 | M2-P1 merged | P1 merges |
| M2-P5 | M2-P1 merged | P1 merges |
| M2-P6 | M2-P1 merged | P1 merges |
| M2-P7 | M2-P1 merged | P1 merges |
| M2-P8 | M2-P1 merged, plus M1-P4's adapter (merged `6ec0482`) | P1 merges |
| M2-P9 | M2-P1 to M2-P8 merged | all merge |

Nothing between P2 and P8 grounds on anything between P2 and P8. The plan was
written sequentially and is not sequentially CONSTRAINED, which nobody had
checked until now.

## Pairwise disjointness

Each of P3 to P8 creates its own gate module, its own schema and its own test
file:

| Phase | Creates |
|---|---|
| M2-P3 | `src/gates/suite.ts`, `test/suite-gate.test.ts` |
| M2-P4 | `src/gates/scope.ts`, `src/gates/schemas/phase-declaration.schema.json`, `test/scope-gate.test.ts` |
| M2-P5 | `src/gates/citations.ts`, `src/gates/schemas/citation-config.schema.json`, `test/citation-gate.test.ts` |
| M2-P6 | `src/gates/coverage.ts`, `src/gates/schemas/coverage-config.schema.json`, `test/coverage-gate.test.ts` |
| M2-P7 | `src/gates/deploy.ts`, `src/gates/migrations.ts`, `src/gates/schemas/verifier-config.schema.json`, two test files |
| M2-P8 | `src/exec/env.ts`, `src/gates/credentials.ts`, `test/credentials-gate.test.ts` |

Zero overlap among created files.

## The three real contentions, and how each is handled

1. **`test/behaviors.json` and `gates.manifest.json`**, shared by every phase as
   standing pre-authorized extras. Both are APPEND-ONLY registries keyed by
   name. A union merge against the true merge base is correct and was performed
   successfully during M1-P6's branch update: 145 keys plus 7 added with zero
   overlap and nothing removed. **Rule for M2: never re-serialise phases over
   these two files. Resolve as a union against the merge base, assert no
   overlapping key, assert nothing removed or retitled, and let the registry
   test catch anything else.**
2. **`package.json`**, edited by M2-P1 (gate scripts) and M2-P3 (its own
   script). P1 merges before P3 starts, so this is sequential by the graph and
   needs no special handling.
3. **`.github/workflows/gates.yml` and `scripts/`**, contended by M2-P1, M2-P8
   and M2-P9. P9 runs last by grounding. P8's edit is to `src/spawn.ts` and
   `src/hooks.ts` rather than the workflow; its `scripts/stub-payload.sh` touch
   is the only overlap with P9, and P9 grounds on P8 merging.

## What this changes

Serial M2 at M1's measured ~4h per phase is nine phases, roughly 36 hours.

With this graph: **P1, then seven phases concurrently, then P9.** The wall
clock becomes P1 plus the SLOWEST of P2 to P8 plus P9, not their sum. On the
measured spread that is roughly 4 + 6 + 4 = **14 hours**, against 36.

## What actually limits it, stated so it is not discovered late

Not implementer capacity, and not reviewer capacity: both are agents and both
parallelise. The measured serial resource is **orchestrator arbitration**, one
per phase per round. Seven phases landing together is seven arbitrations plus
seven merge sequences, and DR-0004's ruleset requires each branch to be current
with `main` before merging, which serialises the merges themselves.

Mitigation, in dispatch order rather than as an afterthought: stagger the seven
dispatches slightly so their reviews do not all land in one window; merge in
grounding order; and expect the last merges to need a branch update each,
because `main` moves under them.

## Conditions carried from DR-0011, unchanged

1. This pre-pass is the recorded disjointness check. Any overlap discovered at
   dispatch cancels that phase's parallel start.
2. Merge order remains dependency order even when work order is concurrent.
3. Acceptance criteria that cannot be executed until an earlier phase merges
   are marked deferred at implementation time and executed in a final
   validation pass, never quietly dropped. M1-P6 is the worked example, and its
   validation pass found a floor defect that would have reddened CI.
