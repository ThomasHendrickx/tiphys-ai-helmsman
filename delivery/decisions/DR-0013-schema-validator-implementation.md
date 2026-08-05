# DR-0013: How JSON Schema validation is implemented in the kernel

- id: DR-0013
- project: tiphys-kernel
- task: m3-planning
- question: DR-0006 decided that kernel artifacts are validated by JSON Schema. The kernel ships zero runtime dependencies today (`package.json` carries devDependencies only, plan v1 decision D-3), and M2 ships a minimal in-repo validator over a closed, documented keyword set that errors loudly on any keyword it does not implement (M2 plan decision M2-D-04, boundary item 5, which explicitly leaves this decision to M3). M3's five artifact schemas exercise far more of the specification than a gate manifest does. Does the kernel extend M2's validator or adopt an external one?
- reversibility: costly (a runtime dependency in a published package is inherited by every fleet home from M3 onward, enters the EXT-F-09 license gate's inventory, and is a supply-chain surface; extending M2's validator is cheaper to reverse but compounds, because every schema written against a keyword the subset lacks has to be rewritten if the subset is later abandoned)
- status: open
- raised: by the M3 plan, revision 1, section 7
- due: before M3-P1 dispatches
- date: 2026-08-05

## Why this record exists as a file

The M3 plan raised this decision and named the filename it expected to be
written at (`delivery/decisions/DR-0013-schema-validator-implementation.md`),
but the file was never created, so M3-P1's `blocked-by` field
(`delivery/plan/kernel-plan-m3.md`, the M3-P1 section) cited a record that did
not exist. This file discharges that citation. The content below is the M3
plan's own write-up, transcribed rather than reinvented, so the plan and the
record cannot drift.

## Options

1. **Take one established JSON Schema validator as a runtime dependency**,
   pinned exact, with the license gate covering it, and keep M2's validator for
   M2's own manifest or retire it behind the same interface.
2. **Extend M2's closed keyword set** to cover what M3's schemas need: `type`,
   `required`, `enum`, `const`, `properties`, `items`, `additionalProperties`,
   `minItems`, `pattern`, `oneOf`, `if`/`then` for the conditional rules M3-P1
   and M3-P4 need, and `contains`, which M3-P3's full-requires-fix-round-
   verification rule and M3-P7's APPROVE-with-a-high-finding rule both need.
   Keep the loud-failure-on-unknown-keyword property that makes the subset
   safe, and declare the subset in `schemas/README.md`.
3. **Hand-write per-type checks in TypeScript.** Contradicts DR-0006's
   language-neutral intent.

## Recommendation

Option 2, extending M2's validator. This is a change from what the M3 plan
first assumed, and the reason is M2's loud-failure property: a keyword outside
the set fails the validator rather than being ignored, which removes the
failure mode that made option 1 attractive (silently ignored keywords producing
vacuous passes, the SC-011 class). With that property in place, option 1 buys
specification completeness the kernel's own schemas do not need, at the cost of
the first runtime dependency in a package every fleet home installs.

Option 1 remains the right answer if the conditional rules M3-P1 step 2 and
M3-P4 step 1 require turn out to need more of the specification than the
extended subset can carry. That is a discovery the M3-P1 implementer must
escalate rather than work around.

## Scope correction carried from the M3 plan review (M3R-002)

The plan's first framing treated "the conditional rules need more of the
specification than the subset carries" as a risk confined to M3-P1 and M3-P4,
which was wrong. The plan's section 2.3 now separates the checks no schema
technology can express (Kind B, fifteen of them, spread across five phases)
from the ones a keyword covers (Kind A). This decision is about Kind A only,
and its blast radius is bounded accordingly.

An implementer who finds a Kind A rule the subset cannot carry escalates rather
than reclassifying it as Kind B to avoid the conversation (plan decision
D-M3-22).

## Note for the owner

M3-P1's steps 8 and 11 and its dependency-related criteria change with the
choice, and nothing else does. Both options keep the schemas themselves
standard JSON Schema, so neither locks the artifacts in.

Nothing is blocked by this today: M3 cannot dispatch before M1's exit test and
M2 both complete. It falls due at M3-P1 dispatch.

## Evidence

- The question, options, recommendation and owner note, as raised:
  `delivery/plan/kernel-plan-m3.md` section 7 and open-question 3.
- The seam M2 leaves for it: `delivery/plan/kernel-plan-m2.md`, decision
  M2-D-04 and the section 1.4 note.
- The zero-runtime-dependency position this would change: plan v1 decision D-3.
- The Kind A / Kind B split that bounds the blast radius:
  `delivery/review/plan-review-m3-r1.md` finding M3R-002, and the M3 plan's
  section 2.3 as revised.
- Why silently ignored keywords are the failure mode that matters:
  finding SC-011 in `delivery/verification/spec-coherence-report.md`.
