# DR-0058: M5-P6 closes the charter-only gap in init

- id: DR-0058
- status: DECIDED, option A
- decided-by: orchestrator, 2026-09-24, under DR-0016
- raised-by: M5-P6 step 1 intake, question Q-8
- relates-to: DR-0016, DR-0029, DR-0031, DR-0054

## The situation

M5-P6 step 1 read hemma without changing it. The intake is
delivery/verification/m5-hemma-intake.md:213 (section 4d). Hemma fits the
applicability envelope with named conditions. The gap it found is in the
kernel, not in hemma:

- `tiphys init` takes a directory and nothing else. It reads no charter.
- Four pieces of kernel configuration are needed after init, and neither init
  nor the charter produces them: the `assurance-modes.yaml` link, the
  `schemas/` link, a gate registry, and the `.ctx-*/` ignore line.
- The only onboarded project, pulse-fleet, carries all four as hand-placed
  files. Its gate registry is a link to the KERNEL's registry, so its gate
  commands are the kernel's, not the project's.

Criterion p6-charter-only (delivery/plan/value-delivery-plan.yaml:446)
requires that no kernel configuration beyond the charter and project-owned
predicates is hand-added before init. As the kernel stands, it cannot pass.

## Options

A. Amend M5-P6 so the phase fixes init: init produces or locates the kernel
   configuration itself, and the project supplies its own gate registry from
   a shipped template. Then step 3 onboards hemma from its charter alone.
B. Do the handwork, declare every item, and record p6-charter-only as failed
   in the exit report.

## Decision

A. The reasons:

1. Charter-only onboarding is the value M5-P6 exists to prove (its intent at
   delivery/plan/value-delivery-plan.yaml:397). Option B would close the
   milestone having found the defect and left it in place. Every later
   project would then need the same hidden handwork.
2. The fix is bounded. Three of the four items are kernel files that init can
   link or locate. The fourth is a project-owned registry, which is a template
   and a documented step, not new machinery.
3. The phase already carries a kernel half (the conflicts command), so this
   stays one phase, one branch, one pull request (DR-0031).

This is not an owner question under DR-0016: option B is clearly worse, and
the change is a scope addition inside one phase, reversible before merge.

## What changes

- M5-P6 files-to-touch gains src/commands/init.ts, test/init.test.ts and
  templates/gate-registry.example.yaml. The declaration grants them, plus
  this record and the plan file itself. The grant is additive and printed by
  name for the reviewers (src/gates/scope.ts:110).
- Witness files for the new behaviors are granted by name as they are
  written, in the same way.
- Acceptance is unchanged. p6-charter-only becomes meetable.
- The hazard hidden-bootstrap-handwork now also covers the kernel fix: a
  reviewer checks that init produces every item the intake named (I-7 to
  I-10), and that no item moved into an undocumented manual step.

## Not decided here

- Where the charter lives (intake Q-4) is the implementer's to establish from
  src/, with evidence.
- The phase-id pattern the conflicts command enforces (intake section 6a)
  suits hemma phases named M1-P1 and M1-P2. It is noted, not changed.
- Push access to hemma remains an owner action. Step 3 cannot run without it.

## Addendum, 2026-09-24: what the implementation found

Recorded by the orchestrator after the kernel half and its fix round 1 (review
finding CR-KH-005). The decision is unchanged. Its "What changes" section
assumed init must produce or locate all of I-7 to I-10. Measurement showed
that only one of them is really consumed from a user's tree:

- I-7, `assurance-modes.yaml`: needed in the PROJECT repository, because the
  merge regime reads it from the commit. `tiphys init --project` now writes
  it as a byte copy of the kernel's file.
- I-8, `schemas/`: not needed. Its only context read is src/checks.ts:746,
  inside an assurance-modes check the merge regime does not run.
- I-9, the gate registry: project-owned, from the shipped template.
- I-10, the `.ctx-*/` ignore line: not needed. No kernel code produces or
  reads it.

The fleet home itself needs no kernel files. The evidence and the remaining
post-init steps are in delivery/verification/m5-hemma-intake.md:244 (section
4e). Known residue from the reviews: the project copy can drift after a kernel
upgrade, the charter lives in two places with no agreement check, and the copy
cannot be validated inside a project. Each is recorded there, not fixed here.
