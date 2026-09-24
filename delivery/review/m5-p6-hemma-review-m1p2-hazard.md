# Clean-room HAZARD review, hemma PR #458 (M1-P2)

Reviewer: claude-sonnet-5 (subagent)
Head under review: a49d417c9b37a8d12445d2791de034089d61cda7
Branch point: 16a5588
main at review time: ccd658c (not used as diff base; branch point used per PR description)

## Scope check

git diff --stat 16a5588 a49d417c: exactly two files changed, 387 insertions(+), 1 deletion(-):
- docs/work-history/2026-09-24.google-calendar-oauth-frozen-clock.md (new)
- integrations/google-calendar/oauth.spec.ts (modified)

No production code, no build config, no migration, no gate-registry, no
workflow file touched. Matches the PR's stated scope exactly.

## What the change does

Adds a file-level beforeEach (vi.useFakeTimers() + vi.setSystemTime(FROZEN_NOW),
FROZEN_NOW = 2026-01-15T12:00:00.000Z) and a file-level afterEach
(vi.useRealTimers()) to integrations/google-calendar/oauth.spec.ts. No test
body, fixture, or assertion is changed (diff confirms one import line touched,
18 lines added).

## Independent verification performed

1. Cloned PR head a49d417c, npm ci exit 0 (node v26.6.0), no build needed for
   vitest.
2. Ran the changed spec alone: `npx vitest run --project unit
   integrations/google-calendar/oauth.spec.ts` -> Test Files 1 passed (1),
   Tests 21 passed (21). Logger output inside the run carries frozen
   timestamps (e.g. "timestamp":"2026-01-15T12:00:00.000Z"), confirming
   production code (lib/logger.ts, oauth.ts) reads the frozen clock, not just
   the spec's own fixtures.
3. Shuffle order independence: `--sequence.shuffle --sequence.seed=99` ->
   21 passed (21), no hang, ~1.8s wall time.
4. Cross-file leak check: ran oauth.spec.ts alongside
   integrations/next-auth/auth.spec.ts and
   domain/receipt/receipt.service.spec.ts in one invocation -> 96 passed (96).
   The other two files' log lines carry real 2026-09-24 timestamps while
   oauth.spec.ts's carry the frozen 2026-01-15 timestamp in the SAME run,
   confirming vitest.config.ts's pool:"forks" isolation holds and the frozen
   clock does not leak across files.
5. Post-throw leak check (scratch copy, restored after): injected a `throw`
   as the first statement of the first test body, plus a file-level
   afterAll logging vi.isFakeTimers() and the real wall clock. Result: that
   one test failed as expected, the other 20 tests still ran and passed
   (afterEach ran despite the throw), and afterAll reported
   "fake=false now=2026-09-24T...", i.e. real timers were restored even
   after an exception. No stuck fake-timer state leaking out of the file.
6. expect.hasAssertions() probe (scratch copy, restored after): inserted
   `expect.hasAssertions();` as the first statement of all 21 it() bodies.
   Result: 21 passed (21), unchanged. No test silently exits before its
   real assertions run (no vacuous / short-circuited async path).
7. Mutation witness 1 (scratch copy, restored after): removed the 60s buffer
   at oauth.ts:414 (`<= Date.now() + 60_000` -> `<= Date.now()`). Result:
   exactly 1 failure, "treats token as expired when expiresAt is within 60s
   buffer", AssertionError expected 'refreshed-token' got 'old-token'. The
   buffer-specific test is the one and only test that reddens, which is the
   correct, non-vacuous target.
8. Mutation witness 2, different mechanism (scratch copy, restored after):
   added 24h to `now` at oauth.ts:63 inside startGoogleCalendarConnection.
   Result: exactly 1 failure, "returns 409 when INITIALIZING is recent",
   expected 409 got 500. A second, structurally different mutation also
   reddens a specific, correctly-targeted test. Two structurally different
   witnesses satisfy the "one witness is not a class" bar.
9. After each scratch mutation, `git status --short` confirmed the working
   tree was restored to the PR head before the next check.
10. Confirmed the lint rule (infrastructure/lint/no-untimed-clock-in-specs.mjs)
    is file-scoped (ANY vi.useFakeTimers/setSystemTime call anywhere in the
    file silences it for the whole file), matching the work history's stated
    reason for the audit above being necessary rather than a formality. The
    file-level beforeEach/afterEach genuinely wraps every test in every
    describe block (vitest applies outer beforeEach/afterEach to nested
    describes), so the fix addresses the actual mechanism, not just the lint
    signal.
11. `npx eslint --max-warnings 0 integrations/google-calendar/oauth.spec.ts`
    -> exit 0, confirming the red-witness claim (branch point: exit 1, 7
    warnings, per the work history; not independently re-verified against
    16a5588 in this pass since the two-file scope diff already establishes
    what changed, and the eslint rule source read at item 10 above
    corroborates the mechanism).
12. Two em dashes found in the changed spec file (lines 164 and 504,
    "// just now -- within TTL" and "// 30s -- within 60s buffer" style
    comments) were checked with git blame against the PR head: both
    pre-date this PR (commit 849dc5b, 2026-08-03), not introduced by it.
    Not a finding against this PR.
13. Claim grep over the work history: the only hits for
    'cannot be|impossible|needs a|is covered|catches|would catch|recovers|
    anyway|always|never|no way to' are inside the verbatim Prompt section
    and the document's own quotation of the grep command and its output;
    no unsettled claim in the authored sections.

## Findings

No findings. See verdict JSON for the machine-readable empty findings list.

## Verdict

APPROVE. The change is exactly what it claims to be: a test-only clock
freeze with no assertion or fixture changes, it does not reach production
code or the build, the frozen date does not flip any test onto the wrong
branch (both mutation witnesses reddened the correct, specific test), there
is no vacuous assertion, no async/fake-timer hazard (hasAssertions probe,
shuffle, and post-throw checks all clean), and no cross-file or
post-exception leak of the frozen clock or fake-timer state.
