# M4 conflict pre-pass, wave 1

- date: 2026-09-15
- binding: CLAUDE.md rule 5. Parallelism is ON only where a recorded pre-pass
  proves the phases disjoint, and the pre-pass is WRITTEN DOWN BEFORE DISPATCH,
  not asserted afterwards.
- scope: this covers WAVE 1 only. A later wave needs its own pre-pass.

## The six units dispatched concurrently

| unit | kind | files it may touch |
|---|---|---|
| M4-P1 (remainder) | evidence | `delivery/verification/`, `test/fixtures/harness-probe/`, `delivery/plan/phase-declarations/m4-p1.json` |
| M4-P2 | kernel | `src/spawn.ts`, `src/task.ts`, `src/watcher.ts`, `test/spawn.test.ts`, `test/watcher.test.ts` |
| M4-P10 | kernel | `schemas/verdict.schema.json`, `src/checks.ts`, `scripts/check-dual-review.mjs`, `test/verdict-head.test.ts`, `delivery/review/` |
| M4-P13 | paperwork | `delivery/requirements/migration-table.md`, `delivery/plan/kernel-plan-v1.md`, `test/coverage-gate.test.ts`, `delivery/requirements/clause-map.json` |
| M4-P16 | kernel | `src/commands/resume.ts`, `src/cli.ts`, `src/commands/init.ts`, `src/fleet.ts`, `test/resume.test.ts`, `test/init.test.ts` |
| M4-P20 | test-only | `test/cross-environment.test.ts`, `test/fixtures/exclusion/` |

## The disjointness argument, per pair rather than asserted as a whole

The only shared SOURCE file across any two of the six is none. Checked
pairwise over the union above: `src/spawn.ts` appears once, `src/task.ts` once,
`src/watcher.ts` once, `src/checks.ts` once, `src/cli.ts` once, `src/fleet.ts`
once, `src/commands/init.ts` once, `schemas/verdict.schema.json` once. No source
path appears twice.

**Three shared registries are expected and are NOT a conflict.** `test/behaviors.json`,
`gates.manifest.json` and `delivery/requirements/clause-map.json` are
append-only and resolved as a union against the merge base; CLAUDE.md rule 5
says so and says they never re-serialise phases. M4-P13 is the exception worth
naming: it EDITS `clause-map.json` rather than appending, so no other wave-1
unit may touch that file.

## What is deliberately NOT in wave 1, and why

- **M4-P3 and M4-P4** edit `src/spawn.ts` and two of them edit the same twelve
  lines around the launch call site. They are serial after M4-P2. Adjacency
  inside one function is where a union merge compiles and is wrong.
- **M4-P8** edits `src/spawn.ts` and `src/exec/env.ts`. It collides with M4-P2
  on the first and waits.
- **M4-P9** is blocked on a measurement, not on a file: whether `PreToolUse`
  hooks fire under a bypass permission mode. If they do not, a launch flag
  defeats the whole write-block and it must move out of hooks entirely. M4-P1's
  remainder answers it, which is why that probe is in wave 1 rather than
  deferred.
- **Everything in workstreams 5 and 6** waits on earlier work by dependency,
  not by conflict.

## The count that must move together, restated because it is the one trap here

M4-P13 re-dispositions migration-table rows, and the per-milestone bucket count
is pinned in more than one place including a hard-coded test assertion at
test/coverage-gate.test.ts:160. All the pinned sites move in M4-P13's single
pull request or the coverage gate reddens. No other wave-1 unit may edit them.

## Wave 1b, added 2026-09-15 while wave 1 is in flight

Three more units, checked against the wave-1 six AND each other.

| unit | files it may touch |
|---|---|
| M4-P19 | `src/pool.ts`, `src/teardown.ts`, `src/commands/teardown.ts`, `src/commands/doctor.ts`, `test/pool.test.ts`, `test/teardown.test.ts` |
| M4-P23 | `delivery/plan/cutover/retirement-inventory.{md,json}` (new), `scripts/check-retirement-inventory.mjs` (new), `test/retirement-inventory.test.ts` (new), **`CLAUDE.md`** |
| M4-P26 | `delivery/plan/cutover/rollback.md` (new), `src/cutover.ts` (new), `src/commands/cutover.ts` (new), `scripts/rehearse-cutover-rollback.mjs` (new), `test/cutover.test.ts` |

**Pairwise against wave 1.** M4-P19 takes `src/pool.ts`, `src/teardown.ts`,
`src/commands/teardown.ts` and `src/commands/doctor.ts`; wave 1 holds
`src/spawn.ts`, `src/task.ts`, `src/watcher.ts` (M4-P2) and `src/cli.ts`,
`src/commands/init.ts`, `src/fleet.ts`, `src/commands/resume.ts` (M4-P16). No
overlap. M4-P23 and M4-P26 create files that do not exist. No overlap.

**`CLAUDE.md` IS M4-P23's FOR THE DURATION, AND THAT INCLUDES THE ORCHESTRATOR.**
This is the one real hazard in wave 1b: the orchestrator has amended `CLAUDE.md`
four times today, twice in the last hour. From this dispatch until M4-P23 lands,
the orchestrator does not touch it. A rule recorded mid-wave goes into
`delivery/tuition/` or waits.

**Not dispatched and why.** M4-P11 collides with M4-P10 on `src/checks.ts`.
M4-P25 collides with M4-P26 on `src/commands/cutover.ts`. M4-P3, M4-P4 and
M4-P8 still collide with M4-P2 on `src/spawn.ts`.
