# Clean-room review, M4-P1 (branch claude/m4-p1-harness-probe, head 0025b78, base 3b40118)

Reviewer: Opus 5, clean-room, sole reviewer of this phase.
Framing: evidence integrity and data loss.
Started: 2026-09-16.

## Running log

- Confirmed base == origin/main == 3b401182301361700ffa0fd4b2ae099993b3d733.
- `git diff --name-only origin/main...branch`: 73 files. NONE under src/, bin/,
  schemas/, roles/, tuition/. Shipped surface untouched, confirmed independently
  of the dispatch note.
- Declaration `delivery/plan/phase-declarations/m4-p1.json` is ADDED by this
  branch (new file in the diff), so it does not exist at the merge base.
  Opening question: does the scope gate resolve it? Tracking.

## CONFIRMED F-1: the `scope` gate is RED at this head (ran it)

    node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
      --only scope --evidence /tmp/claude-0/reviews/ev-scope \
      --base origin/main --head HEAD --phase m4-p1

    gates: declared 1 applicable 1 verdict 1 green 0 red 1 ...
    gates: scope: red: branch claude/m4-p1-harness-probe (phase m4-p1) matches the
    phase pattern but no phase declaration exists at
    delivery/plan/phase-declarations/m4-p1.json in the merge base 3b40118...

Second, independent half: even with the declaration landed, 26 of the 73 touched
paths are outside filesToTouch + declaredExtras (CLAUDE.md, delivery/STATE.md,
10 DR records, 10 delivery/evidence/m4-probes files, kernel-plan-m4.md,
m4-intake.md, m4-conflict-pre-pass.md, pstack-borrow-review.md).
They are inherited from the unmerged `plan/pstack-borrow-review` base
(merge base with main is 3b40118; the branch carries 22 plan-branch commits).
The implementer's OWN commits (6961186..HEAD) touch exactly 47 paths, all
inside the declaration. So this is a base-branch/dispatch defect, not an
implementer scope violation, but the PR as it stands lands the whole M4 plan.

## CONFIRMED F-2: a pinned count that is now wrong

Work history line 671 claims "THIRTY-EIGHT fixture files ... counted with
`git ls-files test/fixtures/harness-probe | wc -l`".
Measured at head 0025b78: **44**. Measured at 2447541 (the commit whose message
is "correct the fixture count to the measured number"): 38. Six
suite-and-controls fixtures were added afterwards and the count was not redone.
