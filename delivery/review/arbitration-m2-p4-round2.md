# Arbitration: M2-P4 scope auditor, round two (merge)

- date: 2026-08-06
- head merged: `5ab3350` (= fix head `c9b00c9` + merge of `origin/main` 8439c88 + the four registry keys)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **CLEAN, MERGE.**

## The verdicts on the fix (head c9b00c9)

| | criteria delta (Sonnet, CR-1395) | hazard delta (Opus, CR-1380) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED (one medium) | APPROVE |
| the HIGH (CR-1045) | confirmed closed, witnesses re-reddened | confirmed closed at the mechanism |

Both contracts independently confirmed the yardstick HIGH is closed by the
four cross-checks (phase==id, branch==declaration.branch, merge-base ancestor
of trunk, head==HEAD), each re-reddened against pre-fix code and greened with
the fix; CR-1047 closed; CR-1031 and CR-1046 landed. The criteria delta's one
medium was NOT a code defect: the four new fix-round tests were unregistered
in `test/behaviors.json` (12 keys, needed 16).

## Why this merges without a third dual review

The registry omission is append-only, non-executable registration paperwork,
and the reviewer specified the exact fix (add the four keys). The orchestrator
applied it and verified it MECHANICALLY: extracting all 16 `test()` titles
from `test/scope-gate.test.ts` and checking each against the behaviors values
gives 0 unresolved (16/16). No source or behavior changed. The merged head is
the dual-reviewed code plus the already-reviewed-and-merged P6 code (from the
`origin/main` update) plus these four keys. Re-running a full dual clean-room
review over a four-line registry append is disproportionate under DR-0016, and
DR-0012's "no unresolved high or medium" is satisfied: the sole medium is
closed and verified. The proportionality call and its verification are
recorded here so the decision is auditable, not skipped.

## Merge conditions (DR-0012)

Dual APPROVE on the code (criteria delta's medium closed and verified); scope
audit clean (declared files + standing extras + the one authorized plan-text
line); branch current with `main`; CI green on the exact merged head (pending,
merge on green). killSignal not in scope. Carried forward to M2-P9: `scope`
errors on a detached-HEAD pull_request checkout (CR-1051), and the trunk-
fallback-arm low (record which trunk ref check 3 used); both recorded in the
task and to be handled by the exit harness.
