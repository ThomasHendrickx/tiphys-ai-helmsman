# Arbitration: the two M1-P5 round-four reviews, and what the split means this time

- date: 2026-08-05
- head: `84dfa41f8f92d90d6982ca97b3addebe7893ff75` (PR 8)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: merge is blocked by two mediums, BOTH of which close with edits to
  the work history alone. This is not a fifth code round, and the distinction
  is the substance of this arbitration.

## The two verdicts

| | hazard contract (Opus) | criteria contract (Sonnet) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED | APPROVE |
| high | 0 | 0 |
| medium | 2 (CR-560, CR-561) | 0 |
| low | 4 (CR-562 to CR-566) | 1 (CR-580) |
| criteria | regression spot-checks | all 15 met, executed |
| inventory rows | 12 | not its contract |
| gates, Node 26 | 146 / 146 / 0 skip | 146 / 146 / 0 skip |
| gates, Node 22 | 146 / 144 / 2 skip | 146 / 144 / 2 skip |

Both reviewers used the floor toolchain this round, which the previous
criteria review did not, and both reproduced the implementer's gate numbers
exactly.

## What changed in the character of the findings

The previous three rounds each ended with a NEW HIGH in `src/liveness.ts`.
This round ends with ZERO highs from either contract. That is the first time
in this phase, and it is the fact the merge decision should turn on.

The hazard contract's own judgment on the residual is the load-bearing
sentence, and it is worth quoting rather than paraphrasing: **acceptable as a
residual, blocking as recorded.** `doctor` and both watcher modes are now
total against this class on every path the reviewer could construct, so the
defect that made CR-520 severe, the guard taking down the safety net that
would otherwise notice every other hang, is genuinely gone.

## The two mediums

**CR-560: a twelfth path, and the same vacuous-scope shape a third time.**
`mkfifo <fleet>/warnings.md` hangs `tiphys spawn` forever, exit 124 with zero
output, stranding a worktree, a pool record, a `task/c2` branch and the task
id. Verified at the source by the orchestrator: `src/brief.ts:56` is a bare
`readFileSync` gated only by `existsSync`, and `src/brief.ts` does not appear
in this phase's diff at all, so the defect is PRE-EXISTING and the file is
outside the authorized set.

The cause is instructive and is now the third instance of one pattern. The
round derived its inventory by scoping to `tasks/`, `state/` and
`worktrees/`; `warnings.md` sits at the fleet root and fell outside the
search. That is the same shape as the previous reviewer probing
`state/session.lock` when the lease is `state/orchestrator.lock`, and as the
FIFO coverage claim before it: a search whose SCOPE is wrong returns an empty
result that reads exactly like an absence of defects.

**CR-561: the commit subject overstates, again.** `84dfa41` reads "make the
type probe a property of every read and open". Six unprobed opens remain,
three of which still hang a shipped command, and the commit body never
mentions the escalated residuals. This is the same unqualified universal the
round was convened partly to correct in `e0d4fce`, which makes it the fifth
instance of the T-006 pattern in this phase.

Neither medium requires a source change. CR-560's honest disposition is to
record the twelfth path and the corrected residual list, because fixing it
means editing `src/brief.ts`, which belongs to another phase. CR-561's
disposition is to correct the record, since a pushed commit subject cannot be
rewritten.

## Where the two contracts agree, and why that matters

Both independently:

- reproduced the gate numbers on both toolchains, exactly;
- confirmed the CR-540 replacement test is a SOUND red witness rather than a
  coin flip (hazard: 12/12 red under mutation, 12/12 green clean; criteria:
  20/20 red, 8/8 green), which settles the flakiness question the orchestrator
  deliberately did not settle;
- confirmed the pre-existing `atomicWrite` wake-loss defect against a pristine
  build of the previous head, so the round's claim to have found and fixed
  someone else's bug holds;
- confirmed `randomUUID` is C-2 clean and does not trip criterion 14;
- confirmed scope, with `src/teardown.ts` untouched despite being authorized;
- caught the registry count being wrong by one, INDEPENDENTLY of each other
  (CR-565 and CR-580 are the same finding found twice).

Two reviewers on different models and different contracts converging on the
same off-by-one is strong evidence it is real, and it was: the key count goes
145 to 152 across the round, verified a third time by the orchestrator.

## The one place the criteria contract was too generous

The criteria contract returned APPROVE having found only the registry
off-by-one. It also wrote, unprompted, a section naming what its contract
structurally cannot see, and asked to be weighed jointly rather than read as a
clean bill of health. That is tuition T-007 operating one round after being
filed, and it is why the APPROVE is not being treated as decisive here.

CR-563 is the concrete demonstration: the hazard contract showed that the full
146-test suite passes with CR-523's ordering fix REVERTED, so a behavior this
round fixed is unguarded. A criteria walk could not have found that, because
no criterion mentions doctor's output ordering.

## Recommendation to the owner

Not a fifth code round on the class, and not a merge as it stands.

The honest close is a documentation round correcting the record (the twelfth
path, the full residual list including `lock release` and `lock renew`, the
registry numbers, and the removal of the universal claim), optionally carrying
two cheap code items: CR-563's deterministic witness for CR-523, since an
unguarded fix is exactly the CR-540 mistake this round was convened to correct,
and CR-564's doctor message, which currently says a FIFO "does not parse as a
beacon record" when it was never opened.

Completing the class across `src/lock.ts`, `src/pool.ts` and `src/brief.ts`
is real work on three other phases' files and should be a named item with its
own scope, not smuggled into this phase's fourth fix round.
