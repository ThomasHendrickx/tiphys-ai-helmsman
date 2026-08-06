# CR-780: PR #9 fifth review pass, M1-P6 toy-sandbox-exit

Branch: claude/m1-p6-toy-sandbox-exit
Head: c24fb86a7dc184f47a9f75b5431b1928a1b0b089
Reviewer: CRITERIA-CONTRACT (this pass)
Working copy: scratchpad/p6f-criteria (detached, isolated from p6f-hazard)

## VERDICT: APPROVE (see full verdict section below)

## Scope of this pass

Fifth review pass. Prior four criteria walks found six of six criteria met.
This pass re-executes only what the delta (5e3fd38..c24fb86) could plausibly
have moved: scripts/m1-exit-test.sh, test/exit-test-local.test.ts,
test/behaviors.json, work history. .github/workflows/gates.yml is claimed
byte-identical to the prior round; verified below.

## Findings (CR-780-xxx)

None. No new finding rises to LOW or above this pass. See "Also, briefly"
note below on the PR body's stale "159 behavior mappings" text.

### Non-finding note

The PR #9 description text (written before fix round 4) still says
"Criterion 6: gates green, 159 behavior mappings, 0 unresolved." The
registry is now 162. This is stale PR-body prose, not a registry or code
discrepancy (verified: registry itself is internally consistent, 162
keys, 0 unresolved, as shown below). Not raised as a CR finding since it
does not affect any gate or certification path; noted only so a later
reader does not treat the PR body as authoritative over the registry file.

## Criteria walk

Setup: npm ci on Node 26.6.0 exit 0 (4 packages, 0 vulnerabilities). npm run
build exit 0 (4.4s), git status clean after build (only REVIEW-OUT.md
untracked, which is this report). Scope: diff 5e3fd38..c24fb86 touches
exactly scripts/m1-exit-test.sh, test/exit-test-local.test.ts,
test/behaviors.json, delivery/work-history/m1-p6.md -- matches the four
files claimed. `git diff 5e3fd38..c24fb86 -- .github/workflows/gates.yml`
is 0 lines: confirmed byte-identical.

1. Criterion 5 (falsification path, C2 nonzero teardown): CONFIRMED. See below.
2. Criterion 2 (local-mode bundle, 56 records): CONFIRMED.
   `scripts/m1-exit-test.sh --mode local` run in
   scratchpad/p6f-criteria-runs/ev-normal completed
   ("m1-exit-test: local mode complete"), no `die` lines in its stdout/stderr.
   `ls records | wc -l` = 56. `output/bundle-validation.out`:
   `{"recordsValidated": 55, "recordsInBundle": 56, "tiphysInvocations": 13,
   "problems": []}` (55 vs 56 is the validation record itself, not counted
   against itself -- expected). Registry steps covered: A1-A8, B1, C1-C3 =
   12 distinct step codes. Duplicate-seq check
   (`ls records | sed -E 's/-.*//' | sort | uniq -d`) = empty, i.e. no
   duplicate sequence numbers among the 56 record files.
3. Criterion 6 (node --test exit 0, registry 162 mappings, rename check): CONFIRMED.
   Clean serial run (no concurrent contention): 156 tests, 156 pass, 0 fail,
   0 skipped, exit 0, real 1m36s. Registry check in its own subsection below.
4. Criterion 3 (watcher line, teardown outcomes): CONFIRMED.
   Own falsify run (ev-falsify3-quick, synchronous, single shot):
   process exit code captured directly as 1 (`echo $?` immediately after
   the harness command, not inferred). Its C2 record:
   `{"step":"C2","exitCode":1,"outcome":"fail",...}`, output text
   "tiphys teardown: branch task/m1-exit is not landed on origin/main;
   land it before tearing the task down". The earlier successful non-falsify
   run (ev-normal, criterion 2) shows the OTHER teardown outcome in the
   same C2 slot: `run_step C2 zero` passed, worktree removed, meta closed
   -- both outcomes (refuse-unlanded and succeed-after-land) are witnessed
   across the two runs. Watcher line re-extracted from ev-normal's own
   bundle: `cat -A output/watch.out` = `signal m1-exit turn-end$` -- one
   line, no trailing whitespace or second line, matching the assertion
   record's `"expected": "signal m1-exit turn-end", "observed": "signal
   m1-exit turn-end", "outcome": "pass"`.
5. Criterion 4 (gates check on PR #9, falsifiability step executed): CONFIRMED.
   Via mcp github pull_request_read: PR #9 head sha is
   c24fb86a7dc184f47a9f75b5431b1928a1b0b089 (matches this review's target
   exactly). get_check_runs on that PR: two check runs, "gates" conclusion
   success, "test (26)" conclusion success, both status completed.
   Pulled the actual job log for "test (26)" (job id 92413886021): the
   falsifiability-guard step DID execute (not skipped) --
   "m1-exit-test: work directory ..." through
   "m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge):
   expected exit zero, got 1" followed immediately by
   "falsifiability guard witnessed at C2: exitCode 1" -- captured CI output,
   not a hand-written string. This independently confirms criterion 5's
   mechanism ran for real in CI on this exact head, not just locally.
6. Criterion 1 (spot check, sandbox/ untouched): CONFIRMED by the stat diff
   above; the delta touches none of sandbox/, seed-sandbox.sh,
   stub-payload.sh. Not walked further (fifth pass, prior four already
   cleared it and nothing in this delta touches that area).

### Registry check (own script, not the implementer's)

`test/behaviors.json`: 162 keys, 0 duplicate keys in the JSON object.
Wrote scratchpad/p6f-criteria/check-registry2.mjs: for each of the 162
keys, checked whether its DESCRIPTION VALUE (not the key) appears as a
substring in some test/*.test.ts file, since key strings are not literally
quoted in test titles -- the description text is the literal `test(...)`
title. Result: 0 unresolved.

Diff test/behaviors.json 5e3fd38..c24fb86 (the actual round-4 delta): shows
exactly one line changed, the claimed rename
`exit-test-guard-failure-reaches-required-check` ->
`exit-test-guard-inside-gated-job`, nothing else added, dropped or retitled.

`grep -rn` for the OLD key across the whole tree: one hit, in
delivery/work-history/m1-p6.md, in prose narrating the rename itself (not
in any test or registry file). The NEW key appears in test/behaviors.json
and in the same work-history prose. Old key is not referenced by any code
or registry path.

SCOPE NOTE: the instruction asked to diff "versus origin/main". origin/main
(58ac964) predates the entire M1-P6 phase (it is M1-P5's merge), so a
behaviors.json diff against it shows all ten keys this phase added as new,
not an isolated view of this round's one rename. I used 5e3fd38 (the
previous fix round's head, i.e. what the four prior review passes already
cleared) as the baseline instead, which is the only baseline that isolates
this round's delta. Diffing against origin/main directly gives ten added
keys and zero renames/drops, consistent with the phase as a whole, not in
conflict with the round-4 claim.

## Mutation table

All three run against a saved-original copy, restored with `cp` after each,
restore confirmed with `diff` (empty) and `md5sum` (matched) before
re-confirming green.

| Behavior | Mutation | Result | Byte-identical restore |
|---|---|---|---|
| exit-test-guard-inside-gated-job | Guard step relocated into a new job `guard:` that `gates:`'s `needs: test` does not include | RED: "the falsifiability guard step is not inside the job this test was asked about (step lines 48-92, job lines 14-43)" | Confirmed, diff empty, md5 98dca2fe1b985f50a8fde9be55273d61 both before and after |
| exit-test-guard-inside-gated-job | Double-quoted `"continue-on-error": true` added to the guard step | RED: "the falsifiability guard step declares continue-on-error: \"true\"." (declaredKeys' quoted-key branch caught it, as CR-722 intended) | Confirmed, diff empty, same md5 |
| exit-test-step-failure-is-fatal | W2 from the work history: the `die` call in `run_step`'s fail branch replaced with `true` (a no-op) | RED: 0 pass 1 fail. The harness no longer stopped at A1 (npm ci); it ran on and died later on a different, unrelated check ("dist/bin/tiphys.js does not exist after npm run build"), so the test's assertion on the specific "FAILED: step A1 (kernel npm ci)" message failed. Reproduces the work history's documented W2 result. | Confirmed, diff empty, md5 be2a1c79b9c670d8923d4adc829b520a both before and after |

### timeout-minutes: 1 claim -- VERIFIED

Added `timeout-minutes: 1` to the guard step, ran the "sits inside the job"
test: GREEN (stays green, does not redden). Restored, diff empty, md5
matched. This confirms the implementer's claim mechanically. The claim's
REASONING is also sound: Actions' documented semantics make an exceeded
step timeout a FAILED step (safe direction, job fails, fan-in fails), so
excluding `timeout-minutes` from the refused-keys denylist does not create
a hole in the class being guarded (a green required check with a neutered
guard). Work history correctly self-corrects an earlier round's claim that
this key was "caught" (delivery/work-history/m1-p6.md line 2322 area, D8).

## Flake watch

`test/watcher.test.ts` itself did not flake across the runs observed this
pass: 0 failing watcher-titled lines in the clean 156/156 run and 0 in the
earlier contended run that had the unrelated liveness.test.ts failure
(`grep "watch" node26-test2.log` shows 14 passing watcher-titled tests, 0
failing). SCOPE: two full-suite observations plus several embedded runs
inside the exit-test harness's own npm-test precondition; not a
statistical claim beyond what was run this session.

A DIFFERENT pre-existing test flaked once under self-inflicted contention:
`test/liveness.test.ts:671` hardcodes
`/^CHECK beacon PASS beacon present, age 13s \(freshness threshold 901s\)$/m`.
During a window where I had 3+ full suites running concurrently on this
box (my own npm test, my own falsify run's nested npm test, and the
concurrent p6f-hazard reviewer's suite, all contending for CPU), this
assertion saw "age 14s" instead of "age 13s" and failed once
(node26-test2.log, 156 tests/155 pass/1 fail). liveness.test.ts is NOT
part of this delta (5e3fd38..c24fb86 touches none of it) and predates
M1-P6's fix rounds. A clean serial re-run with no concurrent contention
(this same session, same commit, same Node 26.6.0) passed 156/156, 0 fail.
SCOPE: this is one observation under abnormal, self-inflicted load; it is
not attributed to the M1-P6 delta, and is reported here only because a
red result appeared during this review's own work and the claim-grep
standard requires stating what a negative or surprising result does and
does not cover. Recommend nothing be done to this phase for it; if it
recurs on a quiet CI runner it would be a M1-P5-territory finding, out of
this phase's scope.

## Gates

| Gate | Node 26.6.0 (floor, scratchpad toolchain) | Node 22.22.2 (container default) |
|---|---|---|
| npm ci | exit 0, 4 packages, 0 vulnerabilities | not run (floor gate is the authority; container default used only for the skip check below) |
| npm run build | exit 0, 4.4s, git status clean after | not separately run this pass |
| node --test (full suite) | exit 0, 156 tests, 156 pass, 0 fail, 0 skipped, 96s (clean serial run) | not run in full; targeted `test/doctor.test.ts` run only, see below |
| test/doctor.test.ts alone | n/a | exit 0, 14 tests, 12 pass, 0 fail, 2 skipped -- confirms the two floor-gated skips still skip on Node 22, per the "confirm on Node 22" instruction |

## What this contract cannot see

- Whether `gates` is the check branch protection actually REQUIRES on this
  repository. That is GitHub repo configuration, not readable from the
  tree or from the check-run list (this is DR-0004's territory, and the
  test file itself documents this boundary at test/exit-test-local.test.ts
  line 337).
- Any neutralizing workflow key outside `{if, continue-on-error,
  working-directory}` plus the `shell:` template hole -- the denylist is
  bounded by GitHub's documented vocabulary, not exhaustively fuzzed here.
- Full-mode (`gh`-dependent) behavior: `gh` is not usably authenticated in
  this container (CLAUDE.md environment warning 6); not attempted.
- Whether the liveness.test.ts flake above is reproducible on a quiet
  runner or is purely a product of this review's self-inflicted
  concurrent load; only one instance was observed, under contention I
  created, and it is out of this phase's file scope regardless.
- I did not re-run the full mutation matrix from prior rounds (D1-D32 in
  the work history); I re-ran only the three mutations the task specified
  plus the timeout-minutes check, all of which reproduced their documented
  results.

## VERDICT: APPROVE

All six criteria confirmed with fresh, captured evidence this pass
(local runs, PR #9's actual CI logs on c24fb86, and independent scripts
rather than trusting the implementer's counts). The renamed registry key
is accounted for and not a residual reference anywhere live. All three
requested mutations reddened correctly and restored byte-identically; the
timeout-minutes: 1 claim is mechanically verified and its reasoning holds.
No new finding rises above LOW under the stated severity calibration (a
gap in workflow-wiring coverage would be LOW unless it lets a broken
milestone certify green, and none found here does). The one red result
observed (an unrelated pre-existing test under self-inflicted contention)
is scoped and does not implicate this delta.
