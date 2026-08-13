# M3-P9 fix round 1: delta verification

Status: IN PROGRESS, written incrementally. This file's mtime is the
liveness beacon for this session; a death leaves this partial content rather
than nothing.

Scope: verifying ONE repair, the fix round on branch
`claude/m3-p9-agents-policy`, delta `d9d5a1d..0cf4676`, PR #131. Not a
re-review of the phase. The two clean-room reviews and the arbitration are
already on `main` at `delivery/review/clean-room-m3-p9-criteria.md`,
`delivery/review/clean-room-m3-p9-hazard.md`,
`delivery/review/arbitration-m3-p9.md`.

Worktrees used, all under this session's scratch directory (never under the
repository, per T-019):

- `verify-wt`, detached at `0cf4676` (the fix-round head), for running the
  suite, the gate bundle and hand-built attacks against the real shipped
  script.
- `mutate-wt`, a second checkout of `0cf4676`, used only to apply and revert
  the four witness specs' mutations and confirm each reddens its named test.
- `pre-fix-wt`, detached at `d9d5a1d` (the pre-repair head), used briefly to
  confirm the new tests do not simply pass everywhere (superseded by the
  mutation-based check below, which is the stronger form since it exercises
  the actual mutation text rather than a whole different commit).
- `verify-report-wt`, this file's worktree, branch `claude/verify-m3-p9-fr1`,
  cut from `origin/main` at `1fd2834`.

## What this verification did NOT cover

Read this section first.

1. **CI was not read.** `gh auth status` and any `gh`/`GH_TOKEN` REST call are
   unusable in this container per the task brief; T-009's post-merge `push`
   run on the eventual merge tip is not discharged by anything below. Every
   result here is a local execution on a worktree of the branch.
2. **The gate bundle run is reported as attempted, and its outcome is
   annotated with how much of it I actually saw finish.** It is slow (the
   `red-witness` gate re-clones and re-runs ~36 stored witnesses); see the
   dedicated section below for exactly what completed and what did not.
3. **Attacks were run against `produced-by` primarily.** The same mechanism
   (`establishField`'s trim-only normalisation) applies identically to
   `framing` and `review-contract` since all three route through one
   function, but I did not build fixtures exercising the homoglyph/ZWSP
   attack on those two fields specifically. `framing` and `review-contract`
   carry schema patterns that constrain their legal alphabet more than
   `produced-by` does (see the schema section below); `produced-by` is the
   field with no character-set restriction at all, so it is the strongest
   demonstration and the one I ran to completion.
4. **`src/checklists.ts` and `src/commands/brief.ts` candidates.** I ran the
   checklists.ts merge claim to completion by execution. For brief.ts I
   verified by reading the code and the shipped role files rather than
   driving the full `tiphys brief compose` CLI end to end (it needs a plan
   file and phase id I did not construct), because the code path and the
   shipped data (all five `roles/*.md` declare `role:`) already settle the
   practical severity without it.
5. **The 33-of-37-sites-classified table was spot-checked, not fully
   re-executed.** I independently reproduced the derivation script's stage 1
   to 3 counts exactly and re-ran a handful of the "read, not measured" rows
   by execution (`checklists.ts`, `gates/scope.ts:370`); I did not execute
   every one of the remaining ~30 rows (e.g. every `coverage.ts` and
   `gates/run.ts` line individually).
6. **I did not attempt NFC/NFD Unicode normalisation against the real
   fixtures** (no existing family name carries a diacritic); I confirmed the
   underlying claim (`establishField` never calls `.normalize()`) by direct
   inspection and by a standalone Node comparison of a precomposed vs.
   decomposed string, not by a live fixture run. The live fixture runs cover
   case, embedded zero-width space, cross-script homoglyph, fullwidth variant
   characters, and a lookalike dash, which is why the finding below is stated
   as a class
   rather than resting on the normalisation point alone.

## Summary of verdict (expanded reasoning below)

**NOT VERIFIED AS FULLY CLOSING THE MECHANISM. VERIFIED AS A CORRECT AND
HONEST PARTIAL REPAIR** that closes every instance the two clean-room reviews
and the round's own derivation named, with one HIGH-severity residue the round
did not find and did not name, in the same fail-open direction as CR-001.

Everything else the round claims (the four red witnesses, the CR-002 fix, the
absence-vs-not-applicable policy, the suite counts, the claim-grep discipline)
held up under direct attack and is recorded below with the commands that
checked it.
