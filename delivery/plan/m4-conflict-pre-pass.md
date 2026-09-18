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

## Wave 2 planning, and a coupling that file lists cannot see

Computed 2026-09-16 while wave 1 and 1b were in flight, by extracting every
remaining phase's `src/` files from the plan and intersecting them with what the
nine live units hold.

**Only ONE of the eighteen remaining phases is dispatchable, and the reason is
worth writing down rather than rediscovering each wave.**

### `src/cli.ts` is the serialisation bottleneck

Four remaining phases name it: M4-P12, M4-P18, M4-P24 and M4-P25. They name it
for the same reason in every case, which is that **every new command registers
there**. M4-P16 holds it now.

So the parallelism ceiling for this milestone is not the agent cap or the CPU
count. It is that a kernel whose commands live in one dispatch table serialises
every phase that adds one. Naming it is the first step to deciding whether that
is worth changing; this pre-pass does not decide it.

Blocked by direct file overlap with a live unit: M4-P11 and M4-P22 (via
`src/checks.ts` and `src/spawn.ts`), M4-P15 and M4-P17 (via
`src/commands/doctor.ts`), M4-P21 (via `src/commands/init.ts`), plus the four
above. M4-P3, M4-P4 and M4-P8 remain blocked on `src/spawn.ts`. M4-P5, M4-P6 and
M4-P7 are dependency-blocked rather than conflict-blocked: they need the adapter
seam that M4-P2, M4-P3 and M4-P4 build.

### THE COUPLING A FILES-TO-TOUCH INTERSECTION CANNOT SEE

**M4-P14 has ZERO file overlap with any live unit and is still blocked.**

It edits `gate-registry.yaml`. `CLAUDE.md`'s gate block is GENERATED from that
registry, and the `agent-rules-drift` gate compares them row for row on both CI
events. So a phase that adds a gate must re-render `CLAUDE.md`, and `CLAUDE.md`
belongs to M4-P23 until it lands.

**Two files with no path in common, coupled by a generated block and a gate that
checks the generation.** This is the shape a pre-pass built on set intersection
misses by construction, and it would have surfaced as a red gate on whichever of
the two merged second.

**The rule this adds, for every future wave:** intersect the files-to-touch
lists, THEN ask separately which pairs of files are joined by a generator or a
drift check. In this repository that is at least `gate-registry.yaml` to
`CLAUDE.md` (`agent-rules-drift`), and `gate-registry.yaml` to the generated
brief rows (`brief-drift`). Check for others before assuming those are all.

### Dispatched in wave 2

**M4-P27 only.** All new files plus `test/behaviors.json`, which is append-only
and union-resolved. No overlap with anything live, and no generator couples it.

## Wave 3: the two merge blockers, 2026-09-16

All ten wave-1 and wave-1b units have returned with commits. Two things block
every merge and neither is a phase anyone scheduled first:

1. **No root `charter.yaml`**, so `check-dual-review` errors the moment any
   phase commits its two verdicts (delivery/plan/m4-charter-blocks-every-merge.md:1).
2. **No single-family exception mechanism**, so DR-0012 condition 1 cannot be
   met by this orchestrator at all
   (delivery/verification/my-own-dual-review-does-not-satisfy-dr-0012.md:1).

| unit | branches FROM | files |
|---|---|---|
| M4-P15 (kernel charter) | `plan/pstack-borrow-review` | `charter.yaml` (new at root), `delivery/plan/phase-declarations/m4-p15.json`, `delivery/work-history/m4-p15.md` |
| M4-P11 (single-family exception) | **`claude/m4-p10-verdict-head-and-medium`** | `src/checks.ts`, `src/gates/result.ts`, `src/gates/run.ts`, `test/single-family.test.ts`, `witness/` |

**M4-P11 branches from M4-P10, not from the base, and that is a DEPENDENCY
rather than a conflict.** M4-P10 holds `src/checks.ts` and its schema changes
are what M4-P11 extends. Building it on the base would mean re-deriving the
verdict-pair checks M4-P10 just wrote, and then merging two divergent versions
of one file. Its merge order is therefore strictly after M4-P10's.

**The risk this creates, stated rather than discovered:** M4-P10 is in review
with a FIX-ROUND-NEEDED verdict already returned, so its head will MOVE. M4-P11
must rebase onto the fixed head before it merges, and its review is only valid
against the head it was reviewed on. That is a real cost of stacking and it is
accepted here because the alternative is a merge path that cannot be computed
at all.

**Disjoint from each other and from the two running reviews**: M4-P15 creates
one root file and its own paperwork; M4-P11 touches three source files none of
which M4-P15 names. No generator couples them (`charter.yaml` is not rendered
from anything and nothing renders from it; the `agent-rules-drift` chain runs
`gate-registry.yaml` to `CLAUDE.md` and neither is touched here).

## Wave 4, 2026-09-17, and every earlier block is gone

Written BEFORE dispatch, per rule 5.

**Nothing is live.** Every phase dispatched in M4 has merged: M4-P1, M4-P2,
M4-P10, M4-P11, M4-P13, M4-P15, M4-P16, M4-P19, M4-P20, M4-P23, M4-P26, M4-P27.
So every "blocked by direct file overlap with a live unit" entry above is
discharged, and the only constraints left are between the units dispatched
together.

| unit | files it may touch |
|---|---|
| M4-P3 | `src/spawn.ts`, `src/commands/spawn.ts`, `schemas/executor-record.schema.json` (new), `src/validate.ts`, `test/spawn.test.ts`, `test/schemas.test.ts`, `package.json` (verify only), its declaration |
| M4-P14 | `src/gates/schemas/phase-declaration.schema.json`, `src/gates/gate-classes.ts` (new) or `src/gates/scope.ts`, `gate-registry.yaml`, `gates.manifest.json`, `CLAUDE.md`, `roles/implementer.md`, its declaration |

**Intersection: EMPTY.** No path appears on both lists.

**The generator check, which set intersection cannot do.** M4-P14 owns the whole
drift chain: `gate-registry.yaml` renders `CLAUDE.md` (`agent-rules-drift`) and
`roles/implementer.md` (`brief-drift`). M4-P3 touches none of those three. The
two schema files are in DIFFERENT trees, `schemas/` at the root versus
`src/gates/schemas/`, and `manifest-self-check` validates only the second, so
M4-P3's new root schema is outside that generator chain too. Checked, not assumed.

`test/behaviors.json` may be appended by both. That is append-only and
union-resolved and never re-serialises phases.

**Not dispatched and why.** M4-P4 and M4-P8 collide with M4-P3 on `src/spawn.ts`.
M4-P22 and M4-P21 collide with it too. M4-P5, M4-P6 and M4-P7 are
dependency-blocked on the adapter seam M4-P3 and M4-P4 build. M4-P12, M4-P18,
M4-P24 and M4-P25 all name `src/cli.ts`, which DR-0046 leaves serialised for the
rest of M4; M4-P12 also collides with M4-P14 on `gate-registry.yaml` and
`CLAUDE.md`. M4-P17 collides with M4-P18 and M4-P21 on `src/commands/doctor.ts`
and is held for a pair of its own.

**Two agents, one wave, therefore two run at once**, which is the owner's cap
under DR-0044.

## Wave 5, 2026-09-17

Written BEFORE dispatch, per rule 5. Nothing is live; M4-P3 and M4-P14 have both
merged.

| unit | files it may touch |
|---|---|
| M4-P4 | `src/spawn.ts`, `src/commands/spawn.ts`, `src/adapters/load.ts` (new), `src/index.ts` (new), `package.json`, `tsconfig.src.json` (verify first), `test/spawn.test.ts`, `test/adapter-load.test.ts` |
| M4-P17 | `src/commands/doctor.ts`, `src/lock.ts`, `src/pool.ts`, `test/doctor.test.ts` |

**Intersection: EMPTY.**

**M4-P17's list is NARROWER than an earlier grep suggested, and the difference
matters.** A keyword scan of the plan attributed `src/cli.ts`,
`src/commands/init.ts`, `src/commands/sync.ts` and `src/status.ts` to it; those
belong to M4-P18, whose section follows immediately. M4-P17 touches
`src/commands/doctor.ts`, `src/lock.ts`, `src/pool.ts` and its test. Read from
the section's own files-to-touch line, not from a window around it. So M4-P17
does NOT take `src/cli.ts`, and DR-0046's serialisation of that file is not
engaged by this wave at all.

**The generator check.** Neither unit touches `gate-registry.yaml`, `CLAUDE.md`
or `roles/implementer.md`, so the drift chain is idle. M4-P4 edits
`package.json`'s `exports` and `types`, which changes WHAT THE PACKAGE PUBLISHES,
and `check-agents-references` resolves every `AGENTS.md` reference against the
published set. Neither unit edits `AGENTS.md`, so that coupling cannot fire
across the pair, but M4-P4 owns it and must re-run that gate itself.

**M4-P14's new `gate-classes` gate binds from now on**: every declaration needs a
`gateClasses` disposition or the gate reddens on it. Both declarations here carry
one.

**Not dispatched and why.** M4-P8 and M4-P22 collide with M4-P4 on
`src/spawn.ts`. M4-P21 collides with both units, on `src/spawn.ts` and on
`src/commands/doctor.ts`. M4-P18 collides with M4-P17 on `src/commands/doctor.ts`
and `src/pool.ts`. M4-P5, M4-P6 and M4-P7 are dependency-blocked on the adapter
seam M4-P4 builds, which is why M4-P4 leads this wave. M4-P12, M4-P24 and M4-P25
share `src/cli.ts` and stay serialised under DR-0046.

**Two agents, one wave, therefore two run at once**, the owner's cap under
DR-0044.

## Wave 6, 2026-09-17: one unit into a free slot

Written BEFORE dispatch, per rule 5. M4-P17's fix round is live and holds one of
the two agent slots, so this wave adds ONE unit rather than a pair.

| unit | files it may touch |
|---|---|
| M4-P17 (live, fix round) | `src/commands/doctor.ts`, `src/lock.ts`, `src/pool.ts`, `test/doctor.test.ts` |
| M4-P5 | `plugin/**` (new workspace), `package.json`, `package-lock.json`, `tsconfig.src.json`, `test/plugin-package.test.ts`, `test/plugin-adapter.test.ts` |

**Intersection: EMPTY.**

**M4-P7 was the obvious pick and it is BLOCKED, which a files-to-touch reading
catches and a dependency list does not.** The earlier waves recorded M4-P5, M4-P6
and M4-P7 as dependency-blocked on the adapter seam, and M4-P4 landing discharged
that. But M4-P7 also creates `plugin/src/model-resolution.ts`,
`plugin/src/vocabulary.ts` and edits `plugin/src/adapter.ts`, and the `plugin/`
workspace does not exist until M4-P5 creates it. So M4-P7 waits on M4-P5 for a
second, independent reason, and M4-P5 is the unit that unblocks both it and
M4-P6.

**The generator check.** M4-P5 touches no file in the `gate-registry.yaml` to
`CLAUDE.md` to `roles/implementer.md` chain. It DOES edit `package.json`
(`workspaces`) and `tsconfig.src.json` (a project reference), both of which reach
gates: `license` inventories production packages from the pack listing, and the
new `typecheck` gate runs `tsc -b` over the referenced projects. M4-P5 owns both
and must re-run them; M4-P17 touches neither, so neither can fire across the pair.

`red-witness` will report NOT APPLICABLE for M4-P5, because its precondition is a
changed path under `src/` or `bin/` and this phase's code lands under `plugin/`.
Its `gateClasses` correctness disposition therefore names `suite` and `typecheck`
rather than `red-witness`. That is a real gap in the class vocabulary M4-P14 just
shipped, recorded here rather than worked around: a phase can ship code that the
red-witness gate structurally cannot see.

## Wave 7, 2026-09-17: one unit into the slot M4-P17 freed

Written BEFORE dispatch, per rule 5.

| unit | files it may touch |
|---|---|
| M4-P5 (live) | `plugin/**`, `package.json`, `package-lock.json`, `tsconfig.src.json`, `test/plugin-package.test.ts`, `test/plugin-adapter.test.ts` |
| M4-P28 | `src/gates/coverage.ts`, `test/coverage-gate.test.ts` |

**Intersection: EMPTY**, and this pair is the cleanest in the milestone: M4-P28
touches two files, neither under `plugin/` nor in the packaging chain.

**Why this unit and not a larger one.** M4-P28 removes the 250ms WALL CLOCK
budget at src/gates/coverage.ts:235 that is used as a catastrophic-backtracking
proxy. That budget has produced false reds repeatedly in this milestone: it is
named in the STATE record of the M4-P16 incident, where `suite` was RED inside
the full bundle and GREEN when run alone at the same head, and it is named again
in T-029's ruled-out section as the wall-clock family that the precondition flake
is NOT a member of. Every wave that runs two agents makes the load that trips it.
So this phase pays for itself in the waves that follow it, which is the argument
for spending the free slot on a two-file phase rather than a larger one.

**The generator check.** `src/gates/coverage.ts` is not rendered from anything
and nothing is rendered from it. `coverage` is in the registry and the manifest
already, so no drift chain moves. M4-P28 does change a shipped gate's behaviour,
so `red-witness` IS applicable to it, unlike M4-P5, and its `gateClasses`
correctness disposition names it.

**Not dispatched.** M4-P29 is the natural sibling and collides with nothing here,
but the owner's cap is two agents and M4-P5 holds the other slot. M4-P9 collides
with M4-P5 on `package.json`. M4-P18, M4-P21, M4-P22, M4-P12, M4-P24 and M4-P25
are all free of this pair and wait only on a slot.

## Wave 8, 2026-09-17: both slots, M4-P8 and M4-P18

Written BEFORE dispatch, per rule 5.

| unit | files it may touch |
|---|---|
| M4-P8 | `src/spawn.ts`, `src/exec/env.ts`, `src/gates/credentials.ts`, `src/task.ts`, `scripts/credential-witness.mjs`, `test/payload-credentials.test.ts` |
| M4-P18 | `src/commands/sync.ts`, `src/cli.ts`, `src/status.ts`, `src/commands/init.ts`, `test/sync.test.ts`, `test/status.test.ts`, `AGENTS.md` |

**Intersection: EMPTY.** Both lists are taken verbatim from the plan, M4-P8 at
delivery/plan/kernel-plan-m4.md:1463 and M4-P18 at
delivery/plan/kernel-plan-m4.md:2761.

**Checked against the two pull requests still in CI, because a merge that lands
while these run is a conflict the intersection above does not see.** Measured
with `git diff --name-only origin/main...<branch>`:

- #175 (M4-P5) changes `plugin/**`, `package.json`, `package-lock.json`,
  `test/license-gate.test.ts`, `test/plugin-package.test.ts`,
  `test/plugin-adapter.test.ts`. No overlap with either unit.
- #176 (M4-P28) changes `src/gates/coverage.ts`, `test/coverage-gate.test.ts`,
  `witness/coverage-regex-interrupt-not-a-verdict.json`. No overlap with either
  unit. M4-P8 edits a DIFFERENT file under `src/gates/`, `credentials.ts`.

**The generator and drift checks, done separately from the intersection.**

- `src/gates/credentials.ts` backs two registry gates, `credential-scrub` at
  `gate-registry.yaml:79` and `credential-token` at `gate-registry.yaml:87`.
  Those two are QUOTED, not cited, and the reason is a rule this document paid
  for: the citations gate declares root-level `*.md` and `*.json` and nothing
  else at the root, so a root-level `.yaml` path resolves against no declared
  root and reddens. Measured 2026-09-17, run 35203631442 on this branch's first
  head. The declared root list is at src/gates/citations.ts:201.
  Both rows already exist in the registry AND the manifest, and M4-P8's plan line
  says it exports the vocabulary only. So no gate row is added and no drift
  chain moves. If M4-P8's step 4 turns out to need a NEW gate arm, that is an
  escalation, not a quiet registry edit, because a registry-only gate does not
  run in CI.
- `AGENTS.md` is READ by three scripts: `scripts/check-clause-map.mjs`,
  `scripts/check-agents-references.mjs` and
  `scripts/check-retirement-inventory.mjs`. M4-P18 edits it, so M4-P18 owns
  running all three. M4-P8 does not touch it, so this is a within-phase
  obligation and not a cross-phase coupling.
- `src/cli.ts` is M4-P18's alone. DR-0046 keeps the command table serialised
  through M4; the other claimants (M4-P12, M4-P24, M4-P25) are not dispatched
  and neither in-flight pull request touches it, measured as zero hits above.

**Shared registries.** `test/behaviors.json` is append-only and resolved as a
union against the merge base. It does not re-serialise the pair.

**Not dispatched, and why.** M4-P9 needs the plugin package skeleton that M4-P5
is landing in #175, so it waits for that merge. M4-P29 collides with M4-P8 on
`src/gates/credentials.ts`. M4-P21 collides with M4-P18 on
`src/commands/init.ts`. M4-P22 collides with M4-P8 on `src/spawn.ts`.
M4-P12, M4-P24 and M4-P25 collide with M4-P18 on `src/cli.ts` under DR-0046.
That leaves M4-P6, M4-P7 (both blocked on M4-P5) and M4-P30 as the only phases
free of this pair, and the owner's cap is two agents.
## Wave 9, 2026-09-17: M4-P6 and M4-P30, written early and RE-CHECKED at dispatch

This one is written before the wave it governs is dispatchable, because both
agent slots are held by wave 8 and the paperwork would otherwise be a separate
pull request under DR-0031. **The in-flight check below is re-run at dispatch**,
against whatever is actually open then; what is recorded here is the file-level
derivation, which does not move.

| unit | files it may touch |
|---|---|
| M4-P6 | `plugin/src/hooks/turn-end.ts`, `plugin/src/hooks/tool-call-observer.ts`, `plugin/src/status.ts`, `plugin/.claude-plugin/plugin.json`, `plugin/src/adapter.ts`, `test/plugin-hooks.test.ts`, `test/fixtures/plugin-hook-payloads/` |
| M4-P30 | `src/commands/doctor.ts`, `test/doctor.test.ts`, `assurance-modes.yaml`, `delivery/evidence/m4-fleet-bringup/` |

**Intersection: EMPTY.** M4-P6's list is at
delivery/plan/kernel-plan-m4.md:919. M4-P30 does not restate its own files and
says so; its section points at 3.4, whose files-to-touch block is at
delivery/plan/kernel-plan-m4.md:2423, and the id moved from M4-P15 to M4-P30
when the charter was split out.

**Disjoint from wave 8 as well**, which matters because wave 8 may still be
unmerged when this dispatches: M4-P8 holds `src/spawn.ts`, `src/exec/env.ts`,
`src/gates/credentials.ts`, `src/task.ts` and
`scripts/credential-witness.mjs`; M4-P18 holds `src/commands/sync.ts`,
`src/cli.ts`, `src/status.ts`, `src/commands/init.ts` and `AGENTS.md`. Neither
touches a file in either list above. Note that M4-P6's `plugin/src/status.ts`
and M4-P18's `src/status.ts` are different files.

**M4-P6 DEPENDS ON M4-P5 BEING MERGED**, because every one of its paths is under
`plugin/`, which M4-P5 creates. It is not dispatchable before that, and the
dependency is a hard one rather than a preference.

**Why this pair and not the obvious one.** M4-P6 and M4-P7 look like the natural
pair once `plugin/` exists, and they are NOT disjoint: both edit
`plugin/src/adapter.ts`, M4-P6 to wire the turn-end invocation and M4-P7 to wire
the model-resolution writer. No dependency list in the plan carries that
pairing, so it is recorded here. M4-P7 follows M4-P6, not beside it.

**The generator check.** Neither unit adds or changes a gate row, so no drift
chain moves: `render-agent-rules-gates.mjs` and `check-brief-drift.mjs` both
read `gate-registry.yaml`, which neither list contains. M4-P30 edits
`assurance-modes.yaml` for the fix-round ceiling; that file is not a generator
input for `CLAUDE.md` or `roles/`.

**Not dispatched, and why.** M4-P7 collides with M4-P6 as above. M4-P9 collides
with M4-P18 on `AGENTS.md` and also needs `plugin/`. M4-P29 collides with M4-P8
on `src/gates/credentials.ts`. M4-P21 collides with M4-P18 on
`src/commands/init.ts`. M4-P22 collides with M4-P8 on `src/spawn.ts` AND with
M4-P30 on `src/commands/doctor.ts`, which makes it the most contended phase
left. M4-P12, M4-P24 and M4-P25 collide with M4-P18 on `src/cli.ts` under
DR-0046.

## Wave 10, 2026-09-17: M4-P7 and M4-P29

Written BEFORE dispatch, per rule 5.

| unit | files it may touch |
|---|---|
| M4-P7 | `schemas/model-resolution.schema.json`, `src/validate.ts`, `src/model-resolution.ts`, `plugin/src/model-resolution.ts`, `plugin/src/vocabulary.ts`, `plugin/src/adapter.ts`, `test/model-resolution.test.ts`, `witness/` |
| M4-P29 | `src/gates/credentials.ts`, `src/gates/red-witness.ts`, `src/gates/suite.ts`, `test/credentials-gate.test.ts`, `test/witness.test.ts`, `test/suite-gate.test.ts`, `witness/` |

**Intersection: EMPTY except `witness/`, and that exception is stated rather
than waved through.** Both lists are read from the plan, M4-P7 at
delivery/plan/kernel-plan-m4.md:1049 and M4-P29 at
delivery/plan/kernel-plan-m4.md:3819.

**`witness/` IS SHARED, AND IT IS SAFE FOR THE SAME REASON THE REGISTRIES ARE.**
Every wave since M4-P18 has had phases add their own specs under it, and a
witness spec is a whole file named after the behaviour it guards, so two phases
append disjoint filenames and never edit a shared document. That makes it
append-only in exactly the sense CLAUDE.md's rule 5 means, and it does not
re-serialise the pair. What WOULD re-serialise them is a phase editing another
phase's existing spec, and neither of these does: M4-P7 ships new
`model-resolution-*` specs, M4-P29 ships new gate-CLI ones.

**Checked against the pull request still in CI.** #182 (M4-P30) changes
`src/commands/doctor.ts`, `scripts/m1-exit-test.sh`, `charter.yaml`,
`schemas/assurance-modes.schema.json`, `test/assurance-modes.test.ts`,
`test/doctor.test.ts`, `assurance-modes.yaml` and its evidence tree. No overlap
with either unit. Note that M4-P7 and M4-P30 both touch `schemas/`, and they
touch DIFFERENT DOCUMENTS in it: `model-resolution.schema.json` is created by
one and `assurance-modes.schema.json` is edited by the other.

**The generator check.** M4-P29 edits three gate COMMANDS' source but adds no
gate row, so `gate-registry.yaml` does not move and neither drift chain does.
M4-P7 registers a new `--type` in `src/validate.ts`; that table is not
generated from anything and nothing is generated from it. Both phases must
register the new type in BOTH the `--type` table and the `auto` resolver, which
is the split this repository has paid for twice.

**M4-P29 CARRIES TWO ITEMS M4-P8 RAISED AND DID NOT FIX**, and they are its
scope rather than a discovery it will make:

1. **The `credential-scrub` gate's verdict is inverted.** It greens
   `HTTPS_PROXY`, which grants real GitHub reach, and reddens `GIT_CONFIG_*`,
   which grants only URL rewriting. Measured by M4-P8 from the other side: an
   extension arm took `HTTPS_PROXY` through the audited route, that child got
   HTTP 200 from `api.github.com/user`, and the gate stayed green with 7 units.
2. **M4-P8 shipped no witness spec under `witness/`**, so its own red witnesses
   live as captures in a work history rather than as specs the gate
   re-evaluates. Its `red-witness` line read `0 own`.

**Not dispatched, and why.** M4-P9 collides with M4-P7 on `plugin/src/` and is
the other claimant of the plugin surface; it follows M4-P7 rather than running
beside it. M4-P21 and M4-P22 collide on `src/exclusion.ts`, and M4-P22 also
collides with the merged M4-P8 on `src/spawn.ts`, which is a merge-order
constraint rather than a concurrency one now. M4-P12, M4-P24 and M4-P25 share
`src/cli.ts` under DR-0046.

## Wave 11, 2026-09-17: M4-P9 and M4-P21

Written BEFORE dispatch, per rule 5.

| unit | files it may touch |
|---|---|
| M4-P9 | `plugin/src/hooks/project-write-block.ts`, `plugin/.claude-plugin/plugin.json`, `schemas/write-bypass.schema.json`, `src/commands/validate.ts`, `test/project-write-block.test.ts`, `AGENTS.md`, `witness/` |
| M4-P21 | `src/exclusion.ts`, `src/lock.ts`, `src/commands/lock.ts`, `src/commands/init.ts`, `test/cross-environment-lock.test.ts`, `test/lock.test.ts`, `witness/` |

**Intersection: EMPTY except `witness/`**, which the wave-10 pre-pass settled:
a witness spec is a whole file named after the behaviour it guards, so two
phases append disjoint filenames and never edit a shared document.

M4-P21's list is read from the plan at delivery/plan/kernel-plan-m4.md:2987.
M4-P9's is read from delivery/plan/kernel-plan-m4.md:1581 **with two
corrections, both stated rather than applied silently**, because that line is
the most out-of-date files-to-touch line left in the plan:

1. It says `packages/claude-code-plugin/` (create, whole tree). The plugin tree
   is `plugin/` and it exists: the plan itself recommends `plugin/` at
   delivery/plan/kernel-plan-m4.md:1192 and hands the choice to the
   orchestrator with "no escalation", and M4-P5 shipped it. M4-P9 creates no
   tree; it adds a hook module to the one that is there.
2. It says `package.json` (edit, `workspaces`, only if the adapter phase has
   not already added it). M4-P5 added it, so that clause resolves to no edit
   and `package.json` is not on the declaration.

**A THIRD CORRECTION, AND IT IS ONE THE ORCHESTRATOR GOT WRONG FIRST.** The
plan's M4-P7 line said `src/validate.ts (edit: type table and auto resolver)`
and the M4-P7 declaration carried that spelling, so the scope gate reported a
declared path the phase never touched. The orchestrator then wrote in the pull
request that the file "does not exist". **It exists.** src/validate.ts:1 is the
kernel's schema validation ENGINE from M3-P1; the `--type` table is in
src/commands/validate.ts and M4-P7 registered its row there correctly at
src/commands/validate.ts:148. So the plan names the wrong file and the phase
edited the right one. M4-P9 also registers a type, and its declaration names
`src/commands/validate.ts` so the same round trip is not paid twice.

**Checked against the pull request still in CI.** #187 changes
`src/gates/red-witness.ts` and one tuition document. No overlap with either
unit.

**The generator check.** Neither unit adds a gate row, so no drift chain moves.
M4-P9 edits `AGENTS.md`, which is READ by `scripts/check-agents-references.mjs`,
`scripts/check-clause-map.mjs` and `scripts/check-retirement-inventory.mjs`;
M4-P9 owns running all three, and M4-P21 touches none of them.

**Not dispatched, and why.** M4-P22 collides with M4-P21 on `src/exclusion.ts`
and is the phase that integrates what M4-P21 builds, so it follows rather than
runs beside it. M4-P12, M4-P24 and M4-P25 share `src/cli.ts` under DR-0046 and
are the last three, to be serialised among themselves.

## Wave 12, 2026-09-17: M4-P22 and M4-P12, the last pair that can run together

Written BEFORE dispatch, per rule 5.

| unit | files it may touch |
|---|---|
| M4-P22 | `src/commands/doctor.ts`, `src/spawn.ts`, `src/teardown.ts`, `src/exclusion.ts`, `test/doctor.test.ts`, `test/spawn.test.ts`, `test/teardown.test.ts`, `delivery/verification/two-environment-rehearsal.md`, `witness/` |
| M4-P12 | `src/gates/merge-preconditions.ts`, `test/merge-preconditions.test.ts`, `gate-registry.yaml`, `gates.manifest.json`, `CLAUDE.md`, `roles/implementer.md`, `src/cli.ts`, `witness/` |

**Intersection: EMPTY except `witness/`**, settled by the wave-10 pre-pass. Both
lists read from the plan, M4-P22 at delivery/plan/kernel-plan-m4.md:3055 and
M4-P12 at delivery/plan/kernel-plan-m4.md:1921.

**`src/cli.ts` IS THE FILE THAT DECIDES THIS PAIRING, AND THE PLAN MAKES IT
CONDITIONAL.** M4-P12's line reads `src/cli.ts` (edit only if gate registration
requires it; verify first). M4-P22 does NOT touch `src/cli.ts` at all, so the
conditional resolves either way without affecting this wave. It is on M4-P12's
declaration because a phase that needs a file and has not declared it costs a
round, while a declared path left untouched costs one printed line.

**M4-P12 MOVES THE WHOLE DRIFT CHAIN and it is the only phase left that does.**
Four files travel together: `gate-registry.yaml` is the source,
`CLAUDE.md`'s gate block is RENDERED from it, `roles/implementer.md` carries
the same relationship through `scripts/check-brief-drift.mjs`, and
`gates.manifest.json` is what CI actually invokes, so a registry-only gate is
declared and never executed. `roles/implementer.md` is added to the declaration
here because the plan's line omits it and the brief-drift gate does not.

**Checked against what is in flight.** Nothing: M4-P9 and M4-P21 are merged and
no pull request is open. Re-check at dispatch.

**M4-P22 IS UNBLOCKED BY M4-P21, WHICH MERGED MINUTES AGO.** It integrates the
`src/exclusion.ts` that phase created and runs the two-environment rehearsal
over it, so its dependency is satisfied rather than assumed.

**The last two are serial and it is not a preference.** M4-P24 creates
`src/commands/next.ts` and M4-P25 creates `src/cutover.ts` and
`src/commands/cutover.ts`; BOTH register their command in `src/cli.ts`
unconditionally, so under DR-0046 they run one after the other. That makes the
remaining shape: this wave of two, then M4-P24, then M4-P25.

**One stale path to correct when M4-P24 is declared.** Its files-to-touch line
names `packages/claude-code-plugin/`, the same out-of-date path M4-P9's carried.
The tree is `plugin/`. Recorded here so the correction is made once, in that
phase's declaration, rather than discovered by its implementer.

## Wave 13, 2026-09-18: M4-P24 alone, and why it is alone

Written BEFORE dispatch, per rule 5. **This wave has ONE unit, and that is the
finding rather than a shortfall.**

| unit | files it may touch |
|---|---|
| M4-P24 | `src/commands/next.ts`, `src/cli.ts`, `plugin/src/`, `test/next.test.ts`, `witness/` |

**M4-P25 is the only other phase left and it CANNOT run beside this one.** Both
register a new command in `src/cli.ts` unconditionally: M4-P24 adds
`src/commands/next.ts` and M4-P25 adds `src/commands/cutover.ts`. DR-0046 keeps
that dispatch table serialised through M4, so the pair is refused and the two
run in sequence. Recorded here so a later reader sees a deliberate single-unit
wave rather than an agent slot left idle.

**Its files-to-touch line carries the stale plugin path, as the wave-12 pre-pass
predicted.** delivery/plan/kernel-plan-m4.md:3202 names
`packages/claude-code-plugin/` with the note that the exact paths are owned by
workstream 1's declaration and cross-referenced rather than duplicated. The tree
is `plugin/`, M4-P5 created it and M4-P6, M4-P7 and M4-P9 all built in it. The
declaration therefore names `plugin/src/` as a directory prefix, which is the
honest form of "cross-referenced, not duplicated": the plan declines to
enumerate the paths, so the declaration grants the tree and the scope gate
PRINTS the prefix as the wider grant it is.

**Checked against what is in flight.** #195 (M4-P22) changes `src/exclusion.ts`,
`src/spawn.ts`, `src/teardown.ts`, `src/commands/doctor.ts`, their tests, the
rehearsal document and `witness/`. No overlap with this unit beyond `witness/`,
which is append-only by filename and settled by the wave-10 pre-pass.

**The generator check.** M4-P24 adds no gate row, so no drift chain moves.
It DOES add a command to `src/cli.ts`, and the only other claimant left is
M4-P25, which is why they are sequenced rather than paired.

## Wave 14: M4-P25 alone, and why it is the last one

Written before dispatch, as rule 5 requires. Declared 2026-09-18.

**One unit, one agent, one workflow.** M4-P25 is the last unstarted phase in
the milestone, so there is nothing to pair it with and the disjointness
question does not arise. The line is recorded anyway, because an empty
pre-pass section is indistinguishable from a forgotten one.

| unit | files it may touch |
|---|---|
| M4-P25 | `src/cutover.ts`, `src/commands/cutover.ts`, `src/cli.ts`, `schemas/cutover-state.schema.json`, `test/cutover.test.ts`, `delivery/plan/cutover/`, `witness/` |

**It cannot start before M4-P24 lands, for two independent reasons, and either
alone would be enough.** The plan states the dependency directly at
delivery/plan/kernel-plan-m4.md:3638, where the chain reads M4-P24 then
M4-P25: criterion 3 of M4-P25 is a drain predicate over in-flight work, and
the in-flight predicate itself is M4-P24's deliverable. Separately, both
phases register a new command in `src/cli.ts` unconditionally, and DR-0046
keeps that dispatch table serialised through M4. So the sequencing is
dependency AND conflict, not one dressed as the other.

**The declaration grants two trees rather than enumerating them, and both are
deliberate.** `witness/` is append-only by filename and was settled by the
wave-10 pre-pass. `delivery/plan/cutover/` is the wider of the two and is the
one a reviewer should look at: the plan's files-to-touch line at
delivery/plan/kernel-plan-m4.md:3272 names only `delivery/plan/cutover/freeze-point.md`,
while criterion 5 at delivery/plan/kernel-plan-m4.md:3308 asserts a precondition
over `delivery/plan/cutover/pre-freeze-ruleset.json`, a file that does not exist
on `main` today and that the phase must therefore create. Granting the tree is
the honest form; the scope gate PRINTS the prefix as the wider grant it is, and
src/gates/scope.ts:110 records that an entry added on the head is allowed and
named for sign-off while a removal is still refused.

**The capture in criterion 5 has an access question that the implementer must
MEASURE rather than assume.** The file is meant to carry the branch-protection
ruleset and the credential grants as they were before the first flip. Whether
this container can read the live ruleset is not established here. If it can,
the phase ships the real capture. If it cannot, the phase ships the assertion
and its fixture witnesses, and the production capture becomes an owner action
with an id from the STATE.md register. What the phase must NOT do is write a
plausible-looking file with no measurement behind it, which is the fabrication
the red-witness rule exists to prevent.

**The generator check.** M4-P25 adds no gate row, so no drift chain moves. It
adds `schemas/cutover-state.schema.json`, which `manifest-self-check` will pick
up as one more schema document validated; that gate counts by enumeration and
pins no total, so no test needs editing for it.
