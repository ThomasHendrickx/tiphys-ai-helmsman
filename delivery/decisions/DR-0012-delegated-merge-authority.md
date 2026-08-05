# DR-0012: Delegated merge authority under dual cross-model review

- id: DR-0012
- project: tiphys-kernel
- task: m1-execution
- question: The owner is unavailable to review pull requests. May the orchestrator merge, and under what standing conditions?
- reversibility: reversible (the owner can revoke at any time; every merge remains a squash commit on a public branch with its full evidence chain in the repository)
- status: decided
- decided: Yes, conditional on dual cross-model clean review passing (owner, 2026-08-04)
- date: 2026-08-04

## Decision

Owner instruction, verbatim in substance: run two clean reviewers per pull request that understand what is being built but come to it with clean eyes, on different models (one Opus, one Sonnet) so that two genuinely different views are represented; when the back and forth comes back clean, the orchestrator has permission to merge. The grant stands until the owner returns.

This supersedes, for the duration, the plan's standing rule that merge authority rests with the owner (blueprint section 8, assurance mode full). Nothing else about the pipeline changes: the orchestrator still writes no feature code, still lets no review be skipped, and implementers still neither open pull requests nor merge.

## What "clean" means, defined here so it cannot be softened later

A pull request may be merged only when ALL of the following hold:

1. Two independent clean-room reviews exist for the current head, produced on different model families, each written to `delivery/review/` and committed.
2. Neither review carries an unresolved finding at high or medium severity. Low findings may be merged with, provided each is either fixed or explicitly recorded as a tracked item with a reason.
3. Both reviewers were given the phase's acceptance criteria as their contract, and both walked or executed them. A review that only read is not sufficient for a code phase.
4. CI is green on the exact head being merged, not on an earlier one.
5. The scope audit passes: changed files are on the phase's files-to-touch list plus the two standing pre-authorized extras.
6. Where the reviews disagree, the orchestrator arbitrates with evidence and records the arbitration in the merge commit or in the review file. A disagreement is never resolved by preferring the more convenient verdict.

## Limits the orchestrator holds itself to

These are not owner instructions; they are the orchestrator's own guardrails on delegated authority, recorded so they are auditable.

- **Documentation-only pull requests** (`delivery/**`, `CLAUDE.md`, `.claude/**` with no source, test or workflow change) require one review rather than two. The reason is proportionality, not convenience, and the distinction is recorded rather than exercised silently.
- **Stop and wait rather than grind.** If a phase needs more than two fix rounds after its first dual review, or if a high-severity finding recurs in the same component across rounds, the orchestrator stops merging that phase and leaves it for the owner with the evidence. That pattern is exactly what M1-P3 cost, and delegated authority is not a licence to repeat it unsupervised.
- **Never merge across a milestone boundary.** Milestone exit tests remain hard gates and their evidence is presented to the owner regardless of this grant.
- **Never merge anything that changes an owner-reserved matter**: a decision record, the plan's binding conventions, merge authority itself, or anything requiring elevated access.
- **Never merge on a green suite alone.** Every defect that mattered in this project so far was invisible to a green suite.

## Why cross-model review specifically

Tuition T-001 records that an external review on a different model family found two defects that had survived three same-family review rounds, and notes that the blueprint parked reviewer decorrelation "until tuition records a miss that survived every review stage". That condition was met. This decision enacts the parked mitigation as standing practice for the duration of the delegation, and the M3 role briefs should carry the option forward as a charter-level setting.

## Limit reached and lifted, 2026-08-05

The stop-rather-than-grind limit fired on M1-P5. Both clauses were met: two
fix rounds after the first dual review, and a high-severity finding recurring
in the same component across rounds (a critical and a high, then a medium,
then a high). The orchestrator stopped and handed the phase to the owner with
the evidence and three options rather than taking a third round.

The owner chose to take the fix on 2026-08-05. That lifts the stop for this
phase only. The limit itself is unchanged and applies again from the next
phase, and it applies again to M1-P5 if this round does not come back clean
on both reviews.

Recording this because a limit that is lifted silently is not a limit. The
sequence that matters is: the limit fired, the orchestrator did not merge,
the owner decided, and the decision is written down.

## Limit reached and lifted a second time, 2026-08-05

The stop-and-wait limit fired again on M1-P5, on both clauses again: a third
fix round after the first dual review, and a high-severity finding recurring
in the same component across consecutive rounds (`src/liveness.ts`, unprobed
blocking read, NEW-2 then CR-520). The orchestrator stopped, arbitrated the
disagreement between the two reviews with evidence rather than by preference,
reproduced the finding independently, and handed the owner three options.

The owner chose option 1 on 2026-08-05: take the fix, at the mechanism rather
than at the instance. Two conditions attach, proposed by the orchestrator and
adopted with the choice:

1. The round's acceptance is a witnessed red test PER READ PATH, one witness
   for each of the paths in the reviewer's inventory, not a claim of coverage.
   This phase has now produced three false coverage claims, so a coverage
   claim is not acceptable currency here.
2. The round goes to a FRESH implementer, with the reviews and the
   reproduction as its input. This is not a judgement on the previous
   implementer, whose work history is honest and whose self-reporting is what
   made the pattern visible. It is that three rounds of accumulated context
   about why the current shape is right is the wrong starting position for a
   round whose whole point is that the shape was too narrow.

The limit itself is unchanged and applies again from the next phase, and again
to M1-P5 if this round does not come back clean on both reviews. Recording the
second lift for the same reason as the first: a limit that is lifted silently
is not a limit, and this is now the second consecutive lift on one phase,
which is itself a fact the owner should be able to see without reading a
transcript.

## Evidence

- Merge authority in full assurance mode: delivery/intake/orchestrated-delivery-v1.md section 8.
- Reviewer decorrelation parked, and the condition for reopening it: delivery/intake/orchestrated-delivery-v1.md section 6.
- The recorded miss that met that condition: delivery/tuition/T-001-cross-model-review-catches.md and delivery/review/plan-review-r4-external.md.
- Why a green suite is not sufficient evidence: delivery/tuition/T-003-fix-rounds-need-verification.md.
