# Arbitration: M2-P1 round four, final. MERGE.

- date: 2026-08-06
- head: `4811d2e` (PR 11, branch `claude/m2-p1-gate-contract-and-runner`)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **CLEAN under DR-0012. PR 11 merges.** This closes the DR-0016
  fresh-implementer round that arbitration round 3 opened.

## The verdicts

| | derivation audit (Opus) | criteria regression (Sonnet) |
|---|---|---|
| record | `clean-room-m2-p1-round4-derivation-audit.md` | `clean-room-m2-p1-round4-criteria-regression.md` |
| verdict | APPROVE | APPROVE (CR-960) |
| high / medium / low | 0 / 0 / 3 (paperwork lows, tracked) | 0 / 0 / 0 |
| method | re-derived the CR-900 closure by script; widened to 29 APIs plus `lock.ts`; no 12th row; D2 matrix independently reconfirmed | re-executed named fixtures, both toolchains' full suites, live mutation with sha256-proven restore, registry and scope diffs, CI on the head |

No disagreement between them, and no overlap either: the contracts were
declared disjoint (derivation soundness versus criteria regression) and each
report's own "what this contract cannot see" section names the other's
territory. That is T-007's two-contract structure doing what it was added for.

## DR-0012's clean checklist, walked on the exact head

1. **Two independent clean-room reviews of `4811d2e`, different model
   families, both committed.** Yes: the derivation audit ran on Opus, the
   criteria regression on Sonnet (recorded from the agents' own transcripts,
   agent `a88692c27bdf7db97` and agent `aca2232c310cc940c`). Both files are in
   `delivery/review/` on this branch.
2. **No unresolved high or medium.** None in either report. The derivation
   audit's three lows (CR-940, CR-941, CR-942) are work-history record
   corrections, recorded as tracked paperwork items in round 3's arbitration
   and unchanged here.
3. **Criteria walked or executed, not merely read.** The regression pass
   re-executed them: gates on both toolchains (floor 201/201/0/0, default
   199/199/0/2, both matching the work history's claim), every named fixture,
   and a live mutation of `refuseUnlessHolder` under which all four CR-900
   tests reddened (delete, dispatch, precondition-dispatch, mkdir) while the
   CR-901 NaN witness stayed green, with the source file's byte-identical
   restore proven by sha256 before and after.
4. **CI green on the exact head.** Run 31092570135 on
   `4811d2eb720d7237c4af6d8e9b3ec22eb6a7ad12`: both checks (`gates`,
   `test (26)`) completed/success. The gate bundle's REAL execution is
   witnessed in the job log: fresh runId `e3d86a91efe87828f92dced8`, counts
   `declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0
   vacuous 0`, head sha matching. Not cached, not skipped.
5. **Scope audit passes.** Exactly four files changed `411a320..4811d2e`:
   `src/gates/run.ts`, `test/gates.test.ts`, `test/behaviors.json`,
   `delivery/work-history/m2-p1.md`. The last two are the standing
   pre-authorized extras; the first two are on the phase's files-to-touch
   list. Registry delta is a pure append of five keys, 202 to 207, zero
   removed, zero retitled.

## The one observed anomaly, and where it went

CI's FIRST attempt on `4811d2e` failed at `test/watcher.test.ts:500`: both
the resident watcher and the `--once` pass surfaced the same wake, which is a
witnessed violation of M1-P5 criterion 7's exclusivity (PR-204), not timing
noise. The file is untouched by this PR's diff, the rerun of the same run id
was clean, and the suite is green locally on both toolchains, so it does not
block this merge. It is recorded as a carried-forward investigation item in
`delivery/STATE.md` (committed `85a7235`) and needs
`delivery/verification/watcher-exclusivity.md` before anyone calls it
settled. Both reviewers reported it as observed and correctly did not chase
it.

## What the DR-0016 response measured, for the record

Round 3 fired the fresh-implementer response instead of a stop-and-wait. The
fresh implementer closed CR-900 at the mechanism (import-closure derivation,
eleven rows, six unguarded sites of which two had never been named), plus
CR-901 and CR-903, in ONE round, and both round-4 contracts came back clean
on the first pass. That is the second measured instance, after M1-P5, of the
fresh implementer being the effective intervention. The owner was notified
asynchronously and was not blocked on.

## Consequence

PR 11 merges by squash. M2-P1's carry-forwards for P2 to P8 are already in
`delivery/STATE.md` (CR-902). On merge, the P2 to P8 seven-way parallel
dispatch opens per `delivery/plan/m2-conflict-pre-pass.md`, with M2-P9 last.
