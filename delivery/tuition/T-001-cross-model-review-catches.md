# T-001: Cross-model review caught findings that survived three same-model rounds

- id: T-001
- project: tiphys-kernel
- date: 2026-08-04
- stage: planning (stage 1, before any implementation dispatch)
- kernel-relevant: yes (feeds the deferred reviewer-decorrelation decision, blueprint section 6)

## What happened

The kernel plan went through three adversarial review rounds plus one targeted verification, all by the same model family, producing 28 applied findings. The owner then submitted an external review by a different model family (GPT 5.6). It found at least two genuine defects that had survived every internal round:

1. Lease renewal was never required to fail after expiry, so an expired-but-alive holder racing a legitimate takeover could produce dual mutation (EXT-F-01). Internal rounds had probed renewal races (PR-202, PR-203) and still left the expired-renewal case unstated.
2. Fleet initialization assumed a configured git identity, which a clean cloud environment does not have (EXT-F-02), despite two internal rounds focused specifically on cloud-substrate honesty.

## Lesson

The blueprint parked cross-model-family review "until tuition records a miss that survived every review stage" (blueprint section 6). This is that record, and it arrived before the system even had code. Same-family reviewers share blind spots; the deterministic verifier layer does not cover design-level races and environment assumptions at planning time.

## Structural consequence to consider

When the kernel's role-to-model binding lands (M3 role briefs, harness adapter configuration), the parked decision should be reopened with this entry as evidence: at minimum, offer a charter-level option to route one review round of full-mode plans through a different model family, and record in the review header which family produced it. Owner cost tolerance decides the default; the option must exist.

## Evidence

- delivery/review/plan-review-r4-external.md (the external review, verdict and findings)
- delivery/review/plan-review-r1.md, plan-review-r2.md, plan-review-r3.md (the internal rounds that missed the two defects)
- Blueprint parking decision: delivery/intake/orchestrated-delivery-v1.md section 6

## Second data point, 2026-08-04, with decorrelation actually in place

After the owner delegated merge authority under DR-0012, requiring two
clean-room reviews on different model families per pull request, the first
dual review ran on M1-P4. The two reviews were given deliberately different
framings: one walked the fourteen acceptance criteria as a contract, the
other was told to start from "where can this destroy something or claim a
guarantee it does not have" and work outward.

They found different defects. The criteria walk found one blocking medium
(a task id whose directory survives teardown lets a new payload read the
previous incarnation's turn-end record). The destructive-paths lens found
two highs the first review did not surface at all: a thrown write error
after the worktree is already gone, leaving the task's state authority
falsely reporting open, and a thrown error between worktree creation and
launch that bypasses rollback entirely and wedges the task id. Both were
reproduced live rather than reasoned about.

Both reviews independently reached the same rulings on the two judgement
calls the implementer had declared, which is the corroboration half of the
value.

The lesson is narrower than "use two models". It is that two reviews with
different STARTING QUESTIONS find different things, and model diversity
makes that difference harder to collapse. When the M3 role briefs encode
review, the checklists should vary the entry point rather than only the
reviewer.
