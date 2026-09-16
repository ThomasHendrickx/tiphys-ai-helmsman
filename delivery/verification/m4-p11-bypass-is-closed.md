# The merge-authority bypass is closed, verified independently

- date: 2026-09-16
- subject: `claude/m4-p11-single-family-exception` at `2f3b651`
- why: the fix round reported it fixed. This is the orchestrator checking rather
  than taking that on trust, on the one defect in this milestone that could let a
  merge through without the review DR-0012 requires.

## The three arms, in the production shape

Built in a throwaway clone at the fixed head: a root `charter.yaml` taken from
M4-P15, `assurance-modes.yaml`, and two schema-conforming verdict documents that
share `produced-by: family-a`, so a correct check must REFUSE the pair. The
checker is run as CI runs it, `node scripts/check-dual-review.mjs .` from the
repository root.

| arm | what changes | before the fix | at `2f3b651` |
|---|---|---|---|
| 1 | nothing; all committed | red, exit 1 | **red, exit 1** |
| 2 | UNCOMMITTED `rm` of one verdict | not-applicable, exit 20, exception GRANTED | **red, exit 1** |
| 3 | UNCOMMITTED `delivery-mode: direct-pr` | green, exit 0, requirement OFF | **red, exit 1** |

Every arm now reports `1 registered check(s) named dual-review-decorrelation ran
over 2 verdict(s)`, so the pair is being examined rather than the corpus being
empty, which is the difference between a refusal and a vacuous pass.

Arm 3 is the one neither review found. In arm 3 the working tree says
`delivery-mode: direct-pr` and the commit says `delivery-mode: full`, measured
side by side, and the check now follows the commit.

## Three errors in MY probe, recorded because each produced a confident wrong reading

1. **All three arms returned an identical error and I nearly read it as a
   result.** `charter.yaml` does not exist on this branch (M4-P15 adds it), so
   every arm was hitting the missing-regime refusal and measuring nothing. The
   tell was that the arms did not differ.
2. **I then read a defect into the shipped code that was my own invocation.**
   Listing a subtree as `<sha>:./path` from inside a subdirectory returns
   nothing, because `git ls-tree` applies an implicit pathspec of the current
   directory. The shipped code does not do that: it passes the path as a
   PATHSPEC after `--`, at src/checks.ts:3082, which is the correct form. I had
   the finding written before I checked the call.
3. **My first verdict fixtures were silently filtered out.** They failed the
   schema on two counts, `head` not matching `^[0-9a-f]{40}$` and `criteria`
   needing at least one item, so the corpus was empty and the run said so. The
   checker was right and my inputs were wrong.

The common shape is the one this repository keeps paying for: a probe that has
not been shown able to produce a DIFFERENT answer is not evidence. Arms 1 and 2
differing is what makes this verification worth anything.

## What this does NOT establish

- **Only three arms.** The reviewers' second broken arm, two committed
  `family-b` verdicts placed under `delivery/evidence/`, was NOT re-run here.
- **No CI arm exists at all.** `check-dual-review` is registry-only and
  `scripts/m2-exit-test.sh` runs `--manifest`, so this feature has never run in
  CI and everything above is local. T-009's "both arms need a witness" has zero
  witnessed arms here, not one.
- **The fix round's other work is unverified by me.** Its rule (f) scoping change
  and its corpus-extent decision were read, not re-measured.
