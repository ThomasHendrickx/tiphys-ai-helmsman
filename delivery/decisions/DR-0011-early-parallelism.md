# DR-0011: Turn on limited parallelism before M5

- id: DR-0011
- project: tiphys-kernel
- task: m1-execution
- question: Binding convention 5 says every M1 phase is sequential and the next phase starts only after the previous PR is merged, with parallelism off until M5. The owner has asked whether phases, or workers inside a phase, can run in parallel now. May that convention be relaxed for the specific cases where the plan's own declared file lists prove disjointness?
- reversibility: reversible (a parallel phase can be stopped and re-sequenced at any time; the cost of being wrong is merge conflict and rework, not lost work)
- status: open
- decided: (pending)
- date: 2026-08-04

## Why the convention exists

Parallelism is deferred to M5 because M5 builds the two mechanisms that make it safe: the conflict pre-pass, which computes file-overlap across planned phases, and the merge-time red-witness gate, which catches semantic overlap the file pre-pass cannot see. Without them, two phases editing one file merge into conflict, and two phases changing related behaviour merge into a defect nobody witnessed.

That reasoning is sound and is not being challenged. What follows is narrower: the plan already declares files-to-touch per phase, so disjointness can be checked by hand today for a small number of specific cases, which is the cheap floor the pre-pass would automate.

## What the declared file lists actually show

Checked against delivery/plan/kernel-plan-v1.md:

- **M1-P4 and M1-P5 cannot run in parallel.** P5's grounding is "M1-P4 merged (turn-end signal files exist as the wake source)", and P5's files-to-touch edits `src/commands/spawn.ts` and `src/commands/teardown.ts`, which P4 creates. This is a real dependency, not a convention, and no decision can remove it.
- **M1-P6 is disjoint from both.** Its files-to-touch are `sandbox/`, `scripts/seed-sandbox.sh`, `scripts/m1-exit-test.sh`, `scripts/stub-payload.sh`, `test/exit-test-local.test.ts` and `.github/workflows/gates.yml`. None appears in P4's or P5's list. P6 declares "conflicts-with: none remaining". P5's conflicts-with names P6 over `src/cli.ts`, but P6's own file list does not include `src/cli.ts`, so that note appears stale; it must be reconciled before any parallel dispatch.
- P6's grounding does require P1 through P5 merged, because the exit test exercises them. That constrains when P6 can be VALIDATED, not when its content can be BUILT.

## Options

1. **Keep the convention as written.** M1 finishes strictly sequentially. Lowest risk, no new decision, slowest.
2. **Relax it for provably disjoint phases only, with a manual pre-pass.** M1-P6's buildable content (toy sandbox, seeder, stub payload, harness skeleton, CI wiring) starts in parallel with M1-P4, on its own branch. Its acceptance criteria that depend on P4 and P5 are deferred to a final validation pass once both are merged, and its PR does not merge before them. The disjointness check is performed and recorded per pair before dispatch, standing in for the M5 pre-pass.
3. **Relax it fully, including parallel workers inside a phase.** Two implementers splitting one phase's file set. This is where the plan's reasoning bites hardest: intra-phase work shares contracts and often shares files, the coordination overhead is real, and there is no merge-time witness to catch semantic overlap.

## Recommendation

Option 2, scoped to M1-P6 only, plus one thing that needs no decision at all.

The thing needing no decision: **detailed planning of M2 and M3 in parallel with M1 implementation.** Planning produces documents, touches no source file, and cannot conflict with anything. M3 alone carries 74 of the 115 requirement rows and has never been detail-planned, which is what makes any completion forecast impossible today. That work is already dispatched under existing authority.

Against option 3: the evidence from M1-P3 argues the other way. That phase took five fix rounds not because work was serialized but because each round introduced a defect that only an independent pass caught. Adding concurrent writers to a phase increases the number of things a review must hold in its head at once, and the constraint here has been review throughput, not implementer throughput.

If option 2 is taken, these conditions apply and are the substance of the decision:

1. A pairwise files-to-touch disjointness check is performed and recorded before each parallel dispatch, and any overlap cancels the parallel start.
2. The stale conflicts-with note between P5 and P6 is reconciled in the plan first.
3. The parallel phase's PR may not merge before the phases its grounding names, so merge order stays sequential even when work is concurrent.
4. Acceptance criteria that cannot be executed until the earlier phases merge are marked deferred at implementation time and executed in a final validation pass, never quietly dropped.
5. Owner action A-1, the toy sandbox repository, becomes urgent rather than eventual, because P6 needs it for full mode.

## Evidence

- Binding convention 5: CLAUDE.md and delivery/plan/kernel-plan-v1.md section 1.4.
- Why parallelism waits for M5: delivery/intake/orchestrated-delivery-v1.md section 10, the conflict pre-pass and the merge-time witness gate.
- Declared file lists and grounding for M1-P4, M1-P5, M1-P6: delivery/plan/kernel-plan-v1.md, those phase sections.
- Coverage weighting that makes M3 planning the highest-value parallel work: delivery/plan/kernel-plan-v1.md coverage appendix, counts M1 = 11, M2 = 16, M3 = 74, M4 = 13, M5 = 1.
- Why intra-phase parallelism is not recommended: delivery/review/verification-m1-p3-fix-round.md and delivery/tuition/T-003-fix-rounds-need-verification.md.
