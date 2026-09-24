# Clean-room CRITERIA review, hemma PR #458 (M1-P2)

Head a49d417c9b37a8d12445d2791de034089d61cda7, branch point 16a5588, main ccd658c.
Status: complete (see end).

## Evidence log (appended as measured)

Toolchain: node v26.6.0 (scratch prefix), `npm ci --ignore-scripts` exit 0.

### Scope
`git diff --stat 16a5588...HEAD`: 2 files, 387 insertions, 1 deletion:
`docs/work-history/2026-09-24.google-calendar-oauth-frozen-clock.md` (+369) and
`integrations/google-calendar/oauth.spec.ts` (+18 -1). Exactly the two paths in
`docs/tiphys/phase-declarations/m1-p2.json` filesToTouch; declaredExtras [].
`git diff --quiet 16a5588 HEAD -- gate-registry.yaml scripts/tiphys-gates .github/workflows package-lock.json tests/setup.ts .env.test test/behaviors.json delivery`
exit 0 (test/behaviors.json and delivery/ do not exist in hemma at either side).

### Merge with current main
`git merge-tree --write-tree origin/main HEAD` exit 0, tree 4a384e7.
M1-P1 changed set (16a5588...origin/main): domain/site-shed/site-shed.service.spec.ts,
docs/work-history/2026-09-24.site-shed-frozen-clock.md. Intersection with M1-P2 set: empty.

### deleted-assertion
expect( count 43 at 16a5588 and 43 at head; it( count 21 and 21. `diff` of the
expect( lines of both sides: identical (exit 0). The spec diff is purely additive
apart from the vitest import line gaining `afterEach`.

### Lint and tests
- 16a5588 content at the real path: `npx eslint --max-warnings 0` exit 1, 7 warnings
  (hemma-lint/no-untimed-clock-in-specs), 0 errors.
- head: exit 0.
- `npx vitest run --project unit integrations/google-calendar/oauth.spec.ts`: base
  21 passed (21), exit 0; head 21 passed (21), exit 0. Working tree clean after restore.

### Frozen clock covers every clock-reading path (own probe)
Probe: a `vi.hoisted` block inserted directly after the vitest import (so it runs
before any module under test loads) replaces globalThis.Date with a wrapper that
records every ZERO-ARGUMENT `new Date()`, `Date()` and `Date.now()` (argument-bearing
construction is not a clock read, and is how @sinonjs/fake-timers builds its own
dates), and wraps `performance.now`. Each read records the current test name and its
stack. Once fake timers are installed the wrapper is shadowed, so any read that still
reaches it is a REAL-clock read. Two arms, identical probe, 21/21 pass on both:

| arm | real reads total | in-test | in-test from oauth.ts | in-test from the spec |
|---|---|---|---|---|
| control (16a5588 spec, no hooks) | 34 | 33 | 17 | 16 |
| head (with hooks) | 22 | 21 | **0** | **0** |

Control arm real reads from oauth.ts include the key paths: `Date.now` at the token
expiry check (oauth.ts:414 `isExpired`, 5 reads), refreshed-token `expiresAt`
(oauth.ts:463, 2 reads), `expiry_date - Date.now()` (oauth.ts:483, 2 reads) and the
INITIALIZING TTL `new Date()` (oauth.ts:63, 5 reads), plus fixture `new Date()` and
`Date.now()` in the spec, including the 6 `new Date()` fixture sites the lint rule
does NOT flag (it reports only `Date.now()`).
Head arm, attributed by stack: 21 in-test reads, exactly one per test, all from
vitest's own `vi.useFakeTimers()` install (node_modules/vitest/dist/chunks/test.*.js:3293,
called from the spec's file-level beforeEach), which seeds the fake clock and is then
overridden by `vi.setSystemTime(FROZEN_NOW)`; 1 read outside any test, at module load
of `generated/runtime/client.js` (the Prisma runtime), identical in both arms and not
code under test. `performance.now`: zero reads in either arm (neither oauth.ts nor the
spec uses it). So every clock read made by the code under test and the fixtures during
a test is on the frozen clock, including the unflagged `new Date()` sites.
Merge tree 4a384e7: oauth.spec.ts blob 4d59188 equals head's; site-shed spec blob
50bdb25 equals origin/main's. Each side's file arrives unaltered.

### leaked-fake-timers
Temporary spec (head spec plus a last `describe` whose only test records
`vi.isFakeTimers()` and `Date.now()` and then throws, plus an `afterAll` that
records the state after every test has run):
- head hooks: 1 failed | 21 passed (22), exit 1 (the deliberate failure). During the
  failing test fake=true, now=1768478400000 (= 2026-01-15T12:00:00.000Z). In afterAll:
  isFakeTimers=false, globalThis.Date is the original Date, Date.now() is more than a
  day away from FROZEN_NOW. afterEach restored real timers despite the failure.
- control arm (same spec with the `vi.useRealTimers()` line removed): afterAll
  isFakeTimers=true, Date not restored, clock still frozen. So the check can go red.
Own shuffle seeds, `--sequence.shuffle --sequence.seed=N`: 1, 42, 1337, 20260924, 777,
each 21 passed (21). Shuffle confirmed real: verbose ordering md5 d5534076 unshuffled,
60a01ecc seed 1, f58a0351 seed 42, 21 names each.
All temporary spec files deleted; `git status --porcelain` empty.

### CI on head a49d417c9b37a8d12445d2791de034089d61cda7 (GitHub MCP)
- CI run 36021445913 (ci.yml, pull_request, head_sha a49d417c): success. Jobs:
  validate success, build-and-e2e success, ci-passed success, migrate skipped.
- Tiphys gates run 36021445984 (tiphys-gates.yml, pull_request, head_sha a49d417c):
  success; job gates success.
- Vercel Preview Comments: success.
- Post-merge push run: NOT-YET (PR open, not merged). Criterion m1-p2-ci is
  therefore half-discharged; the push half is owed after merge.
Scope: the PR run tested the union with base 16a5588, not with ccd658c. Covered by
the merge-tree evidence above (disjoint paths, blobs unaltered), which is a deduction,
not an observed run.

### Claim grep on the work history
Line-based: hits on lines 28, 58, 61, 73, 79, 348, 352. Wrap-insensitive: 27
occurrences total. Accounting: lines 28-79 give 8 (all inside the "Prompt" section,
the verbatim dispatch prompt, instructions not claims); line 348 is the quoted grep
command itself (11 alternatives); line 352 is the quoted list of the 8 hits. 8+11+8=27,
so no hit is hidden by a wrap. Every hit settled: none is a claim by the work.
Work history: zero non-ASCII bytes, zero control characters.
Commit messages 16a5588..HEAD: no model or tool names, no Co-Authored-By or session
trailers (grep exit 1).

## Criteria walk
| criterion | result |
|---|---|
| scope (two declared paths, protected paths untouched) | PASS |
| merge with main clean and disjoint | PASS |
| m1-p2-lint (red 7 at 16a5588, exit 0 at head) | PASS |
| m1-p2-tests (exit 0, 21 = 21) | PASS |
| deleted-assertion (43/43 expect, 21/21 it, expect lines identical) | PASS |
| frozen clock on every clock-reading path, incl. token expiry | PASS (own probe, control arm red) |
| leaked-fake-timers | PASS (failing-last test, control arm red, 5 seeds) |
| m1-p2-ci PR head | PASS; post-merge push run NOT-YET |
| claim grep | PASS |

## Findings
None.

## Verdict
APPROVE. Condition carried forward, not a finding: m1-p2-ci's post-merge push run must
be observed to completion after merge.

Status: complete.
