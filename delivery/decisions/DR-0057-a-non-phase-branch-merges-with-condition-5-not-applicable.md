# DR-0057: a non-phase branch in the dual-review tier merges with condition 5 not applicable

- id: DR-0057
- status: DECIDED BY THE ORCHESTRATOR, 2026-09-24, under DR-0012 and DR-0016
- decided-by: orchestrator
- raised-by: orchestrator, 2026-09-24
- relates-to: DR-0012, DR-0016, DR-0027, DR-0053

## The situation

Two pull requests for kernel 0.2.1 came from non-phase branches:

- #216, `claude/kernel-0-2-1-history-compat`, audited at verdict commit
  8a00c96 (reviewed head fc44f28), merged as 69a7a60.
- #218, `claude/kernel-0-2-1-release-bump`, audited at verdict commit
  a957a95 (reviewed head 95d1ede), merged as 2c49ab3.

Neither branch name matches the phase pattern, so neither has a phase
declaration, and the scope gate reports not-applicable on both. Both change
files in the dual-review tier, so the merge gate was run by hand before each
merge. The captures are
delivery/evidence/kernel-0-2-1-merge-preconditions-8a00c96.txt:1 and
delivery/evidence/kernel-0-2-1-release-bump-merge-preconditions-a957a95.txt:1.

Each capture reads 7 of 8 rows green: verdict-selection, conditions 1, 2, 3,
4 and 6, and branch-protection. The one red row is condition 5, "the scope
audit passes" (delivery/decisions/DR-0012-delegated-merge-authority.md:26).
Its sentence is the same on both: the scope gate record "reads
not-applicable, not green". That sentence comes from
src/gates/merge-preconditions.ts:537, which treats every status other than
green as unmet.

## Decision

Both pull requests were merged under DR-0012, with condition 5 judged not
applicable to a branch that carries no phase declaration.

## Reasoning

Condition 5 exists so that a phase stays inside its declared files. Its text
is "changed files are on the phase's files-to-touch list plus the two
standing pre-authorized extras". A branch with no declaration has no
files-to-touch list, so the condition has nothing to measure. It is not
failed; it is empty.

The property it protects was still checked, by other means:

- Both reviewers of each pull request confirmed the exact diff. For #218, the
  hazard review lists the four bumped files and then the one-file delta to
  95d1ede, and the criteria review states the diff is exactly five files
  (delivery/review/clean-room-kernel-0-2-1-release-bump-hazard.md:8 and
  delivery/review/clean-room-kernel-0-2-1-release-bump-criteria.md:17). For
  #216, both reviewers re-verified the delta 281d892..fc44f28
  (delivery/review/arbitration-kernel-0-2-1-reviewed-head.md:90).
- Verdict-selection admitted only verdicts naming the reviewed head, and it
  confirmed that every path differing between the reviewed head and the
  audited commit is under `delivery/`.
- CI was green on the exact audited head for both (gates 35966714698 on
  8a00c96, gates 35973303679 on a957a95), and the post-merge push runs were
  green (gates 35971153312 on 69a7a60, gates 35976377266 on 2c49ab3).

The options were not comparable. Refusing the merge would have needed a phase
declaration invented after the fact, only to turn one row green. That adds no
check the reviewers did not already make. So under DR-0016 this is decided and
recorded, not escalated.

## What the orchestrator had assumed, and was wrong about

The orchestrator assumed the 0.2.1 release bump was below the dual-review
tier, because it touched only version strings. The gate disagrees, and the
gate is right by its own table. src/gates/merge-preconditions.ts:876 lists the
two LOWER tiers only (`delivery/`, `CLAUDE.md`, `.claude/` get none; `scripts/`,
`test/`, `.github/` and the two gate files get one review). Every other path
fails closed to the dual tier (src/gates/merge-preconditions.ts:853 and
src/gates/merge-preconditions.ts:893). So `package.json`, `package-lock.json`
and `templates/` are dual-review tier. This is why the release bump needed two
decorrelated verdicts after the first review, as the hazard review's update
records.

## The tool gap

merge-preconditions has no arm for a non-phase branch that touches the
dual-review tier. Condition 5 reads red whenever the scope gate record is not
green (src/gates/merge-preconditions.ts:533), and the scope gate reported
not-applicable on both branches here, which carry no declaration. So each such
pull request needs this same human judgment until the gate is changed.

Recorded as a follow-up in delivery/STATE.md:1, under "Tracked obligations,
unowned". Two shapes a fix could take, neither decided here:

1. For a branch with no declaration, condition 5 reports not-applicable with
   a reason, and the reviewers' diff confirmation becomes the evidence it cites.
2. Condition 5 on such a branch requires the verdicts to name the exact changed
   path set, so the gate checks what the reviewers confirmed by hand.

Until then, a merge like these two is allowed only when all other rows are
green and both verdicts confirm the exact diff. Each such merge cites this
record.
