# Delta verification: M3-P10 fix round 1

Subject: branch claude/m3-p10-release-and-exit, round-1 head 26ebf7f (pull
request #140). Pre-round head for the delta: 8d056f6.

Verifier: independent delta verifier, dispatched as an adversary of the ROUND,
not a reviewer of the phase. Working tree is a separate worktree cut from
origin/claude/m3-p10-release-and-exit; nothing in the implementer's tree or in
the repository clone was touched. Mutation labs are built OUTSIDE the worktree.

Status: IN PROGRESS. This file is the beacon; it is appended to as work
proceeds and its mtime is the liveness signal.

## Why this verification exists

The immediately preceding phase, M3-P11, ran the same sequence: its fix round 1
closed the mechanisms it was sent to close and introduced a regression that made
an honest precondition emit a false error, failing the whole gate bundle, while
the pull request was GREEN at that head. The delta verification is what found
it. This one assumes the same is possible.

## Plan

1. Read the two clean-room reviews, the arbitration, the round-1 work history,
   and the full diff 8d056f6..26ebf7f.
2. Re-attack the three mechanisms with my own constructions:
   - M1, a guard asserted by its text rather than evaluated.
   - M2, a check that models what it should read.
   - M3, the artifact is never executed before it is published.
3. Hunt for regressions introduced by the round itself: the no-fallback licence
   reader, the confirm-string replacement of the boolean dry-run input, and the
   real installed fixtures.
4. Re-run the suite on all four axes and the gate bundle, and compare against
   the numbers the round reports.
5. Audit the declared non-coverage for accuracy and for gaps it did not declare.

## Hard limits observed

No `npm publish` in any form, including `--dry-run`. No `npm login`. No workflow
dispatch. No file modified outside this one.

## Findings

(appended below as they are established)
