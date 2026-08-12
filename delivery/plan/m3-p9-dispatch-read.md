# M3-P9 pre-dispatch criterion read: a design constraint, not a declaration gap

- date: 2026-08-12
- author: orchestrator
- discharges, for M3-P9, the rule at delivery/plan/m3-dependency-screen.md:62
- method and its limits: delivery/plan/m3-p6-dispatch-read.md:1
- status: M3-P9 is blocked behind M3-P8 (delivery/plan/kernel-plan-m3.md:4767).
  Nothing here clears it. One finding, and it is a DESIGN constraint the phase
  can satisfy itself rather than a declaration that needs amending.

## The finding: criterion 2b's two witnesses both mutate another phase's file

Criterion 2b (delivery/plan/kernel-plan-m3.md:4630) requires two structurally
different red witnesses for the anchor check, and names both targets explicitly:

- a heading anchor removed from a markdown target, `roles/implementer.md`
- a field pointer whose key was renamed inside a YAML target,
  `assurance-modes.yaml`

`roles/implementer.md` is M3-P6's deliverable. `assurance-modes.yaml` is M3-P3's,
merged. **Neither is on M3-P9's declaration**
(delivery/plan/phase-declarations/m3-p9.json:1). Performed against the real
files, both witnesses are a red scope gate, and restoring them afterwards invites
`git checkout --` in a tree holding uncommitted work, which this repository has
paid for twice and for which there is no safe narrow form.

## Why this is NOT the M3-P7 shape, and why the difference matters

delivery/plan/m3-p7-dispatch-read.md:1 records the same surface problem for
M3-P7's criterion 3c and refutes it by measurement: the checks engine ALREADY
resolves its document relative to a `--context` directory, so the witness stages
a scratch context and the merged file is never touched. That refutation was
available because the mechanism already existed and could be read.

**Here the mechanism does not exist yet.** `scripts/check-agents-references.mjs`
is CREATED by this phase, so nothing can be measured about how it resolves paths;
that is a decision the implementer will make. Which means the constraint is not
"this is safe, here is the proof" but "this is only safe if you build it that
way".

## The constraint, stated as the dispatch must state it

**`scripts/check-agents-references.mjs` must accept a root or context argument
and resolve every reference relative to it**, so criterion 2b's two witnesses run
against a staged copy of the tree. A checker that hardcodes the repository root
pushes the implementer toward mutating two files it does not own. I did not find
a way to satisfy criterion 2b from inside the declaration once that choice is
made, and I am not claiming there is none: copying the whole tree elsewhere and
running there would work, at the cost of a witness that no longer resembles how
the checker runs in CI.

This is cheap when decided up front and expensive when discovered: the second
half of criterion 2b's own text says the file-present-but-content-moved case is
the SILENT one, so an implementer who cannot witness it may be tempted to assert
it instead, which is the shape the red-witness rule exists to stop.

## The smaller, ambiguous one, recorded rather than resolved

Criterion 7 (delivery/plan/kernel-plan-m3.md:4685) witnesses five directions
"with verdict fixtures", and criterion 7b adds a sixth. M3-P9's declaration
carries `witness/` but not `test/fixtures/`. Verdict fixtures written under
`witness/` are within the declaration and that reading is defensible; fixtures
written under `test/fixtures/` are not. Unlike M3-P8, whose criterion 4c NAMES a
`test/fixtures/` path and therefore had a real gap
(delivery/plan/m3-p8-declaration-gap.md:1), M3-P9's criteria name no path at all,
so there is nothing here to contradict. **Recorded so the implementer puts them
under `witness/` deliberately rather than discovering the constraint from a red
gate.**

## What the read direction found otherwise

Criterion 2b aside, M3-P9's cross-phase reads are `roles/implementer.md`,
`roles/clean-room-reviewer.md`, `assurance-modes.yaml`, `gate-registry.yaml` and
the checklists, all read-only for reference resolution and all merged by the time
this phase runs, since its `blocked-by` is M3-P8 which is behind M3-P7 and
M3-P6. No blocker.

M3-P9 owns `gate-registry.yaml` and `.github/workflows/gates.yml`, so registering
its two new script gates needs no other phase's file.

## What this document does NOT establish

- **M3-P10 is still unread.** The screen gave it 38 candidates
  (delivery/plan/m3-dependency-screen.md:44) and said that is unsurprising for a
  release-and-exit phase. Unsurprising is not the same as classified.
- **It did not run the declaration-completeness probes** that
  delivery/plan/m3-p6-dispatch-read.md:1 runs. M3-P9's declaration is short and
  its criteria touch `src/checks.ts` and `src/commands/validate.ts`, both of
  which it carries, but that is an observation and not the measured pass.
- **Nothing was executed.** `AGENTS.md` and both scripts do not exist, so every
  statement here is derived from the criteria text and the declarations. The
  false-clean limit at delivery/plan/m3-dependency-screen.md:77 applies.
