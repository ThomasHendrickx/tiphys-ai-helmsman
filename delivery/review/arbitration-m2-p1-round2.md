# Arbitration: M2-P1 round two

- date: 2026-08-06
- head: `3c7970b` (PR 11)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: FIX-ROUND-NEEDED stands on two mediums. Second fix round, same
  implementer; the DR-0016 fresh-implementer response triggers at a third.

## The verdicts

| | hazard (Opus) | criteria (Sonnet) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED | APPROVE |
| high / medium / low | 0 / 2 / 5 | 0 / 0 / 1 |
| gates floor / default | 193/0/0 and 191/0/2 | identical, own invocations |
| registry | 199, 0 unresolved | 199, 13 added, 0 removed |

No factual disagreement. The criteria contract proved the amended aggregate
rule against its own fixtures on the compiled CLI, verified the CR-830-1 fix
in the REAL CI job log rather than the checkmark, and ran eight mutations all
reddening with byte-identical restores. Its one low and the hazard CR-865 are
the same finding found independently: the work history's claim-grep count does
not reproduce (recorded 20, actual 27), with the two stray hits traced to
substance that is true and separately witnessed. A self-audit completeness
gap, not a code defect, and it recurs from CR-810, which makes it a habit of
this workflow worth naming in the fix.

## What blocks

CR-860 and CR-861, both introduced by the CR-803 evidence-claim fix, which is
the twelve-of-thirteen pattern caught in one delta pass rather than four
rounds later. The mechanism, named once for both: **the claim's lifecycle is
not tied to what it protects**. Release happens before the directory's last
write and does not verify holdership; refusal exits without invalidating the
stale bundle it declined to overwrite, and the runId that attribution rests on
never leaves the process.

## Confirmed and not re-litigated

CR-800 closed at the class by both contracts independently. The ctime pin
does not false-positive under build churn (measured, with a positive
control). The three declines are sound boundaries, including the second
claim-file implementation, ruled earned because lock.ts was read, its rule
followed, and the one difference stated with its reason. Nothing from CR-800
to CR-813 remains unfixed. The orchestrator has already taken CR-863 and
CR-866 on the paperwork branch.
