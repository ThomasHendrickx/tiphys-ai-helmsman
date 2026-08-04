# DR-0009: Firstmate source availability

- id: DR-0009
- project: tiphys-kernel
- task: stage-1-plan
- question: Can the owner supply the firstmate source before M1-P3 dispatches? The blueprint marks six toolbelt components as BORROW from firstmate (watcher, liveness guard, session lock, worktree pool, spawn, teardown guard), but no firstmate source is present in this repository (verification report, honest-failures section). The plan defaults these to BUILD from the blueprint's one-line contracts; supplied source could shrink M1 cost.
- reversibility: reversible (it only sizes M1; the contracts and acceptance criteria are identical either way)
- status: open
- decided: (pending)
- date: 2026-08-04

## Options

1. Owner supplies the firstmate source (or the relevant files) before M1-P3 dispatches. The six components are ported and adapted: likely cheaper and carries proven behavior, at the cost of adapting to the DR-0005 language choice and the kernel's layout.
2. Firstmate is not available (or not worth adapting). The six components are BUILT from the one-line contracts in blueprint section 4. This is the plan's standing assumption (plan decision D-1); M1 phase estimates and model-tier suggestions already price this in.

## Recommendation

Option 1 if the source is trivially at hand, option 2 otherwise; the plan proceeds on option 2 without waiting. Decide before M1-P3 dispatches (the first phase containing BORROW-marked components); a late option 1 after P3 has started buys nothing.

## Evidence

- Honest-failures section: "no firstmate source is present in this repository... six BORROW rows silently become BUILD rows and M1's scope grows", delivery/verification/spec-coherence-report.md.
- BORROW markings and one-line contracts: delivery/intake/orchestrated-delivery-v1.md section 4.
