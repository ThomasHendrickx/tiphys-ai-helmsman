# Hazard review: hemma PR #457 (M1-P1), head 8380ad0d6470964b00903e42a8300b64cfe53bd7

Persisted by the orchestrator from the reviewer's final report, because the
container disk was full (ENOSPC) when the reviewer tried to write it. Content
is the reviewer's, condensed; the verdict JSON beside this file is verbatim.

Verdict: APPROVE.

- Scope: `git diff --name-status 16a5588 8380ad0` shows exactly the two declared
  paths. Nothing reaches production code, the lockfile, CI config or the build.
- Diff: adds imports, FROZEN_NOW = 2026-05-30T12:00:00Z, a file-level beforeEach
  (useFakeTimers, setSystemTime) and afterEach (useRealTimers). No test body,
  fixture or assertion changed.
- Frozen-date traps: Saturday and near month end, but no assertion depends on
  weekday or month-derived values; the one ordering test passes its own `now`.
- Async: every await resolves through mocked collaborators; no real timer awaited.
- Leaks: unit project uses the forks pool with default isolation; afterEach
  always runs.
- Mutation witness: reasoned, NOT executed (disk full). Clock reads mostly feed
  mocks or defaults bypassed by explicit `now`; roster fixtures sit far from the
  7/28-day thresholds, so sensitivity there is weak and predates this diff.

Findings: HZ-M1P1-001 to 004, all low and non-blocking (see the JSON).
The criteria review of the same head executed its own frozen-clock probe and
failing-test leak check (review-m1p1-criteria.md), covering what this review
could not run.
