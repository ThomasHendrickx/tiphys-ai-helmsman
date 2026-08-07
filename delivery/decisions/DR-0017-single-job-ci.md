# DR-0017: CI runs as a single job named `gates`

- status: DECIDED (owner, 2026-08-06)
- supersedes: the two-job CI shape established in M2-P1 (a matrix `test` job
  plus a `gates` fan-in job); does not change DR-0004's requirement that the
  required status context is named `gates` verbatim.

## Decision

`.github/workflows/gates.yml` runs a SINGLE job named `gates` (no matrix, node
26 pinned) that performs `npm ci`, `npm run build`, `npm test`, the M2 gate
bundle, and the M1 exit-test harness plus its falsifiability guard. The
separate `test` matrix job and the `gates` fan-in job are removed. The single
job publishes the check-run context `gates`, which is the required context, so
branch protection is satisfied directly and reflects the real build+test+gate
outcome.

## Why (measured)

The two-job shape acquired a runner twice per run: once for `test`, once for
the `gates` fan-in that only asserted the matrix succeeded. Under runner
contention the fan-in starved in the queue. Measured 2026-08-06 on PR #15
(M2-P5): `test (26)` succeeded at 18:23; the `gates` fan-in then sat QUEUED for
a runner from 19:11:33 to 19:26:34 (about fifteen minutes) and was cancelled
without ever running, turning a correct head red and blocking merge. This
recurred across the M2 merge train and was the dominant cause of the train
being both slow and red. One job means one runner acquisition, removing the
starvation class.

## Consequences

- The `test (26)` check-run context no longer exists. Per M2-P1's own record,
  the only required context is `gates` (adding contexts was explicitly avoided
  to prevent a ruleset change), so no branch-protection edit is required. If a
  ruleset still lists `test (26)` as required, it must be removed; the CI
  change PR surfaces this by being unmergeable on a missing required context.
- M2-P9 still replaces the interim `--only manifest-self-check` bundle steps
  with the exit harness (M2R-026); it now edits one job instead of two.
- The single node-26 leg keeps CI as the floor authority (CLAUDE.md); a matrix
  would change the context to `gates (26)` and break the required-check name,
  so the pin is intentional and must not be reintroduced as a matrix.
