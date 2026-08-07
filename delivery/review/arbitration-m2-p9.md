# Arbitration: M2-P9 exit-test harness, final (merge)

- date: 2026-08-07
- head merged: `fbdcc47` (squashed to `main` as `9bb379b`, PR #25)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **CLEAN, MERGED.**

## The rounds

M2-P9 took two fix rounds after the initial implementation, both driven by
real defects the exit test surfaced on the first-ever full-gate-set integration
(the harness doing exactly its job):

1. **Round 1 (DR-0018).** The exit test runs on P9's own src-less head, so
   `red-witness` is legitimately not-applicable there, contradicting section
   1.4's `green` expectation. Owner decision DR-0018: accept diff-scoped gates
   as not-applicable-with-reason on the exit head AND carry per-phase green-path
   evidence. Also fixed a merged suite-gate bug (reporter `NODE_OPTIONS` leaked
   into nested `node --test`), landed separately as PR #23.
2. **Round 2 (the HIGH).** The criteria contract found that `actions/checkout`
   leaves a detached HEAD on `pull_request`, so the `scope` gate's
   branch-matches precondition never met in CI: scope reported not-applicable
   and the harness accepted it, so scope never audited any PR, forever, a
   vacuous pass one layer down. Fixed at root with `ref: ${{ github.head_ref }}`
   (branch checked out by name) plus tightening the harness to require
   `scope: green`. No `src/` or `bin/` touched.

## Final verdicts on the merged head (fbdcc47)

| | criteria delta (Sonnet) | hazard delta (Opus) |
|---|---|---|
| verdict | APPROVE | APPROVE |
| the HIGH | closed; scope genuinely audits, reproduced 5 ways | closed at root; reproduced independently |
| branch-tip vs merge-ref | (not the criteria lens) | judged ACCEPTABLE and necessary: diff gates use explicit base/head SHAs, working-tree gates covered by DR-0004 current-with-main; Option B would edit M2-P4 |

Both contracts ran on different model families per T-007/DR-0012. Both
red-witnessed the two new guard tests by hand (revert -> red with the exact
message -> restore green). CI green on the exact head; scope audit passes (12
files, all within the declaration landed in PR #24); registries union-clean.

## The exit evidence (DR-0015)

PR bundle on the exit head: declared 10, applicable 6, verdict 6, green 6,
red 0, not-applicable 4, error 0, vacuous 0. Per-phase green demonstrated for
red-witness (4 units, M2-P2's real merged diff), scope (12 units), citations
(1 unit). `--self-test` fails on both fixtures. Main bundle: 6 gates, green.
Committed at `delivery/evidence/m2-exit-test/`. Presented to the owner unasked.

## Carried forward (not an M2 gate)

Both delta reviewers independently hit the `test/watcher.test.ts` /
`test/liveness.test.ts:633` real-clock flake under sandbox contention
(different test each run; reproduces on pre-fix code; untouched by any M2 diff).
It is an M1-P5 defect, out of M2 scope, and now that CI runs the full suite on
every run it will trip intermittently. Highest-value cleanup: make those
real-clock assertions deterministic. Tracked for a dedicated fix.
