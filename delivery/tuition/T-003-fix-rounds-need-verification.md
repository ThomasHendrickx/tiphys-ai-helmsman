# T-003: A fix round for low-severity findings introduced two high-severity defects

- id: T-003
- project: tiphys-kernel
- date: 2026-08-04
- stage: M1-P3 (session lock and worktree pool), after clean-room APPROVE
- kernel-relevant: yes (gate registry, red-witness harness, work-history contract)

## What happened

M1-P3 passed clean-room review with APPROVE and four low-severity findings. The orchestrator sent those four back to the implementer as a cheap fix round. The round closed all four, ran its gates green, and reported honestly by its own lights.

An adversarial verification of that round then found two HIGH severity defects, both introduced by the round itself, both reproduced independently by two lenses, and both surviving refutation with zero refuting votes out of four refuters:

- V-1: the fix for a cosmetic id-reuse annoyance made `pool destroy` force-delete the task branch, silently and unrecoverably discarding committed unpushed work. Reachable through the public CLI. The command's own dirty-worktree refusal advises the operator to "commit or land them first", and after the change, following that advice destroys the work.
- V-2: the fix for a one-second retry annoyance narrowed a matcher so that git's real concurrent ref-update refusal no longer counted as transient. Measured against 312 real captured contention failures, every one had the dropped shape and none named a lock file. Parallel `pool create` went from retrying to success to failing hard, measured between 1 in 48 and 5 in 60.

Neither defect was visible to the test suite, which was green throughout.

## Lessons

1. **A fix round is not lower risk than the work it fixes, but it receives less scrutiny.** The clean-room review had already approved; by the pipeline as practised, the fix round would have gone to merge on green CI alone. The severity of the findings being fixed says nothing about the severity of the defects the fixes can introduce. Low-severity input, high-severity output.

2. **Tests written alongside a fix test the fix, not the behavior the fix endangers.** The destroy-then-recreate test destroyed a branch still sitting at its base commit, so it could never observe data loss. The concurrent-create test never advanced the upstream, so no ref transaction was ever opened and no contention could occur. Both tests were green, registered, and worthless for the defect that mattered. This is the red-witness rule's blind spot: the rule demands a test be red before the fix, and both of these were, for the trivial property they actually asserted.

3. **An unfalsified universal claim in a work history is worse than no claim.** The round's work history stated as measured fact that "genuine contention always names the lock file, while permanent failures do not". The permanent-failure half was measured and is sound. The universal half was never falsified in the direction that mattered, and it is precisely what concealed V-2 from the next reader. The document whose purpose is to let a reviewer trust the round is what hid the defect.

4. **Narrowing a predicate to fix an annoyance must be measured on the false-negative side.** The round narrowed a matcher using hand-written example strings chosen to match the new pattern. No message emitted by a real racing git was in the assertion set. Real captured data existed and was reachable in minutes, as the verification demonstrated.

## Structural consequences for the kernel

- **Gate registry (M2, M3):** full mode must require a delta review or verification of every fix round, not leave it to orchestrator discretion. The current process's fix-round step returns to the same implementer and then merges; that path needs an independent stage before merge.
- **Red-witness harness (M2):** extend the contract so a test guarding a destructive or classification behavior must be demonstrated red against the DANGEROUS state, not merely against the absence of the feature. A candidate structural check: any test whose assertions consist solely of hand-authored fixture strings, where the behavior under test consumes external program output, is flagged for review.
- **Report and work-history contract (M3):** a claim of universality ("always", "never", "in all cases") requires a cited counter-experiment that could have falsified it. Without one, the claim must be narrowed to what was actually measured. This is checkable by an LLM reviewer against a checklist and partially by a linter hunting universal quantifiers in evidence sections.
- **Scope of destructive operations:** any kernel command that can destroy work must state its destructive authority explicitly in its contract, and force semantics must never be inherited implicitly from a caller that does not yet exist. V-1's justification was that a component scheduled for the next phase would refuse first.

## Evidence

- delivery/review/verification-m1-p3-fix-round.md (findings V-1, V-2, and unrefuted candidates U-1 to U-8; U-5 is the false work-history claim).
- delivery/review/clean-room-m1-p3.md (the APPROVE and the four low findings that triggered the round).
- delivery/work-history/m1-p3.md (the round's own record, including the claim named in lesson 3).
