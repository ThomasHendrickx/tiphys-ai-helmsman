# Clean-room CRITERIA review: hemma PR #457 (M1-P1)

Head 8380ad0d6470964b00903e42a8300b64cfe53bd7, base main 16a5588. Reviewer: claude-opus, criteria contract. Complete; verdict APPROVE.

## Environment

Clone at scratchpad/m5p6-rev-m1p1/criteria, detached at 8380ad0d6470964b00903e42a8300b64cfe53bd7. Toolchain node v26.6.0 (scratch prefix). `npm ci` failed with ENOSPC (disk 95 percent full, 1.9G free), so node_modules is a symlink to the bootstrap clone scratchpad/m5p6-step3/hemma/node_modules, whose package-lock.json sha256 (c39341f43982...) equals this head's. The PR does not change package.json or package-lock.json (`git diff --quiet 16a5588 HEAD -- package-lock.json package.json` exit 0). Every vitest run had DATABASE_URL, E2E_DATABASE_URL and DIRECT_URL unset; no database was needed (unit project, mocked repository).

## Scope

`git diff --stat origin/main...HEAD` (origin/main = 16a5588a594abc3a7d2daf8ee18d1a1f27b1a50d):

```
 .../2026-09-24.site-shed-frozen-clock.md           | 401 +++++++++++++++++++++
 domain/site-shed/site-shed.service.spec.ts         |  19 +-
 2 files changed, 419 insertions(+), 1 deletion(-)
```

Exactly the two paths in docs/tiphys/phase-declarations/m1-p1.json filesToTouch, declaredExtras empty. By hand: none of gate-registry.yaml, scripts/tiphys-gates/, .github/workflows/, package-lock.json, tests/setup.ts, .env.test, test/behaviors.json, delivery/ appears in the name list (full list is the two lines above). PASS.

## deleted-assertion hazard

- Spec diff is additive except one line: the vitest import gains beforeEach, afterEach (the only `-` line).
- `expect(` count: 113 at 16a5588, 113 at head. `it(` count 43 and 43.
- `diff` of every line containing `expect` between the two sides: only the import line differs; all expect lines byte-identical.
PASS.

## m1-p1-lint

- 16a5588 spec: `npx eslint --max-warnings 0 domain/site-shed/site-shed.service.spec.ts` exit 1, 7 warnings, all `no-untimed-clock-in-specs` (grep count 7). RED as grounding says.
- head: same command exit 0, no output. GREEN. PASS.

## m1-p1-tests

`npx vitest run --project unit domain/site-shed/site-shed.service.spec.ts`:
- base spec: exit 0, `Tests 43 passed (43)`.
- head: exit 0, `Tests 43 passed (43)`.
- JSON reporter full test names, sorted, diffed: identical 43 names both sides, all status passed, 0 skipped. PASS.

Environment note added mid-review: from about 15:40 UTC the root filesystem reached 0 bytes free (another process; this review's own disk use is its 93M clone). All later runs were made in a byte copy of the head tree at /dev/shm/rev-m1p1-work (`cmp` against the clone's spec: identical), invoking `node node_modules/vitest/vitest.mjs` directly because `npx` failed writing its log (ENOSPC). Same toolchain, same node_modules, same DB variables unset.

## Frozen clock applies to every clock-reading path (independent probe)

The lint rule is per-file, so its green says nothing about coverage. I wrote my own probe, structurally different from the implementer's (theirs wraps the FAKE Date after install; mine wraps the REAL clock before any module loads, so it detects real-clock reads rather than frozen ones):

- In `vi.hoisted` (runs before the spec's imports, so before site-shed.service.ts and everything it imports is evaluated) the global `Date` is replaced by a `LoggingDate` subclass of the real Date, and `performance.now` by a logging wrapper. While a per-test flag is set, every zero-argument `new Date()`, every `Date.now()` and every `performance.now()` that reaches the REAL clock is recorded with a stack.
- Consequence: a module that captured `Date` or `performance.now` at load time (for example `const D = Date`) captured the logging version, so its reads during a test are recorded too. That is the case the implementer's probe declared it did not cover.
- Per test, afterEach (registered after the committed hooks, so it runs before `vi.useRealTimers()` under the default stack hook order) records `vi.isFakeTimers()`, whether global Date and performance.now are the fakes, and whether `Date.now()` equals FROZEN_NOW.

Results (JSON at /dev/shm/rp-probe.json and /dev/shm/rp-control.json, summarised by a node one-liner):

```
== probe (head hooks + probe + one deliberately failing test appended last)
tests 44 fake-all true dateIsFake-all true perfIsFake-all true nowEqFrozen-all true
tests with REAL-clock reads 0 total real reads 0
last test "REVIEW-PROBE failing > deliberately fails" fake at its afterEach true
afterAll {"afterAll":true,"fakeAfterAll":false,"dateIsLoggingAfterAll":true}
== control (same probe, the two committed hook bodies commented out)
tests 43 fake-all false dateIsFake-all false perfIsFake-all false nowEqFrozen-all false
tests with REAL-clock reads 22 total real reads 90
by kind {"new":83,"Date.now()":7}
sample SiteShedService.getHubPayload > ... :: new Date() at SiteShedService.getHubPayload (site-shed.service.ts:167:37)
```

vitest: probe run exit 1 with `Tests 1 failed | 43 passed (44)` (the one failure is the deliberate one); control run exit 0, `Tests 43 passed (43)`.

Reading:
- The probe can go red: without the hooks it records 22 tests and 90 real-clock reads, 83 via `new Date()` and 7 via `Date.now()` (the 7 `Date.now()` stacks point at spec lines 616, 617, 625, 626, 661, 670, 702 of the probe copy, which is the head spec plus a 51-line insert, so head lines 565, 566, 574, 575, 610, 619, 651: exactly the seven lines the lint rule flags). This independently reproduces the implementer's 22 tests / 90 reads.
- With the hooks: zero real-clock reads in all 43 tests, through any path including captured references and performance.now, and fake timers active in every test.
- performance.now: zero calls in the control arm, so no code path this spec exercises reads it. Frozen-performance is therefore moot here, not witnessed. (Vitest 4.0.18's default toFake is every timer except nextTick and queueMicrotask, node_modules/vitest/dist/chunks/test.DNmyFkvJ.js line 3299, so performance is faked anyway: perfIsFake-all true.) `process.hrtime` was not wrapped.
- Static check backing the same point: site-shed.service.ts reads the clock only through the global `Date` (lines 95, 102, 139, 167, 207, 244, 487, 720, 748, 846); the spec mocks `@/infrastructure/commands`, so run-command.ts's `performance.now()` is not reached. Module-level dates in the spec (lines 30 and 900) are fixed literals.
- Not covered by this probe: modules evaluated BEFORE the spec's hoisted block (tests/setup.ts and vitest itself). None of those is on the service's code path.

## leaked-fake-timers hazard

- Failing-test path: in the probe run the last test fails deliberately; its afterEach still ran (recorded `fake: true` just before restore), and `afterAll` then saw `vi.isFakeTimers() === false` and the global Date restored. So `afterEach(vi.useRealTimers)` restores after a failing test. PASS.
- Shuffle, seeds of my own choosing (disjoint from the implementer's 1, 42, 1234, 98765, 20260924), `--sequence.shuffle --sequence.seed=<s> --reporter=verbose`:

```
seed 7 exit 0       Tests  43 passed (43) first: SiteShedService.deleteUser > ...
seed 314 exit 0     Tests  43 passed (43) first: SiteShedService.listActivity > ...
seed 2718 exit 0    Tests  43 passed (43) first: SiteShedService.listActivity > ...
seed 31337 exit 0   Tests  43 passed (43) first: SiteShedService.createUser > ...
seed 99 exit 0      Tests  43 passed (43) first: SiteShedService.getCostOverviewPay...
```

  The first test differs from source order (getHubPayload), so the shuffle did reorder. (The verbose check mark U+2713 was dropped from these lines, 5 occurrences; nothing else changed.)
- Cross-file: vitest.config.ts line 75 sets `pool: "forks"` for the unit project and no `isolate: false`, so each spec file gets its own module state; the file-level afterEach restores within the file. PASS.

## m1-p1-ci

Read with the GitHub MCP tools, PR #457, head_sha 8380ad0d6470964b00903e42a8300b64cfe53bd7, event pull_request:

| workflow | run | conclusion |
|---|---|---|
| CI (.github/workflows/ci.yml) | 36020272922 | success (validate success, build-and-e2e success, ci-passed success, migrate skipped) |
| Tiphys gates (.github/workflows/tiphys-gates.yml) | 36020272918 | success (gates job success) |

PR half: PASS. Post-merge push half: NOT-YET (not merged; `mergeable_state` clean).

## Work history claims

Claim grep (binding form) over docs/work-history/2026-09-24.site-shed-frozen-clock.md at head: hits on lines 20, 25, 27, 30, 218, 219, 385, 394, 395, 396. Classification:
- 20, 25, 27, 30: the verbatim implementer prompt (instructions, not claims). Settled.
- 218, 219: test names quoted in the probe capture ("signed up but never returned", "never-returned title"). Settled.
- 385: the grep command. 394 to 396: the claim-grep section quoting the above. Settled.

No unsettled claim. But the section itself names the test-name hits as "lines 213 and 214" and the command as "line 380"; the actual lines at head are 218, 219 and 385 (the prompt-line numbers are right). See CR-M1P1-001.

Other claims checked against my own runs: 7 base warnings (reproduced), 43/43 both sides (reproduced, identical names), 22 tests / 90 reads with fake timers active in all 43 (reproduced by an independent probe), "the transitive modules were not grepped" (an honest limit, now closed by the probe above). The E2E and full-gate numbers were not re-run here (E2E needs the local DB and disk; the CI build-and-e2e and Tiphys gates jobs on this exact head are green).

## Findings

- CR-M1P1-001, low, open (non-blocking): the work history's claim-grep section cites stale line numbers for three hits ("213 and 214", "380"; actually 218, 219, 385 at head). The classification of each hit is correct; only the pointers are off by five, probably from text added above after the grep was run. Fix optional: correct the three numbers.

No high or medium finding.

## Verdict

APPROVE. Every criterion walked: scope exactly the two declared paths; no assertion removed (113 expect calls and 43 tests on both sides, all expect lines byte-identical); m1-p1-lint red at 16a5588 (exit 1, 7 warnings) and green at head (exit 0); m1-p1-tests 43 = 43 with identical names; the frozen clock covers every clock read the spec's tests reach, witnessed red/green by an independent probe; fake timers restore after a failing test and under five fresh shuffle seeds; CI and Tiphys gates green on this head; post-merge push run NOT-YET.
