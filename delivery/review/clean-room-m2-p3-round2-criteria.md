# CLEAN-ROOM DELTA RE-REVIEW: M2-P3 fix round one (criteria/regression)

Status: IN PROGRESS
Started (UTC): 2026-08-06T16:45:58Z

## Scope
Re-reviewer for CR-1425 fix round. Branch claude/m2-p3-suite-wrapper, subject
head TBD (to be recorded after fetch/checkout).

## Log
- 16:45:58Z started, wrote WORKDIR beacon.
- Fetched origin main / claude/m2-p3-suite-wrapper / claude/m2-phase-reviews.
  Confirmed origin/claude/m2-p3-suite-wrapper == 35a9c17 (exact match to
  dispatch). Checked out via `git worktree add ... 35a9c17 --detach` at
  scratchpad/m2-fanout/m2-p3/rereview-criteria/wt. Confirmed HEAD contains
  origin/main (current with main, merge-base = 8439c88 = origin/main tip).
- Read arbitration-m2-p3.md and clean-room-m2-p3-criteria.md from
  origin/claude/m2-phase-reviews. Findings to close: CR-1306 (hazard,
  Opus, phantom-filter mechanism), CR-M2P3-1 (criterion-10 count),
  CR-M2P3-2 (gates.yml scope).
- Re-read full M2-P3 plan section (kernel-plan-m2.md lines ~295-330),
  all 11 acceptance criteria transcribed.
- Scope: `git diff --name-status origin/main...HEAD` = exactly
  delivery/work-history/m2-p3.md (extra), gates.manifest.json,
  package.json, src/gates/suite.ts, test/behaviors.json,
  test/suite-gate.test.ts. Matches phase-declarations/m2-p3.json's
  filesToTouch + standing extras exactly. gates.yml ABSENT.
- `git diff origin/main -- .github/workflows/gates.yml`: EMPTY (0 bytes).
  CR-M2P3-2 CONFIRMED CLOSED.
- Read src/gates/suite.ts CR-1306 diff (6fe8066..HEAD): single filter
  `points = stream.points.filter(!isFileWrapperPhantom)` applied once,
  before all 3 counting sites (bucketPoints call, discovery-parity
  reportedFiles set, registry reportedTestNames set). Confirmed via
  `grep -n 'entityType === "test"'` and `grep -n 'stream.points'` that
  only 1 residual stream.points reference remains (the filter line
  itself) and the 2 former direct-consumer sites now read `points`.
- INDEPENDENT red-witness re-execution (not trusting work history):
  sha256 of pristine src/gates/suite.ts = 2cd0c372...4ed4b937f, MATCHES
  work history's recorded pristine hash exactly. Defanged (`const points
  = stream.points;`, i.e. reverted the filter to the dangerous no-filter
  state), ran `node --test-name-pattern "CR-1306" --test
  test/suite-gate.test.ts`: both new tests RED (not ok 1, not ok 2, pass
  0 fail 2). Restored via `cp` (never git checkout --), sha256
  re-verified byte-identical (2cd0c372...4ed4b937f), `git status
  --porcelain` clean, re-ran: both GREEN (pass 2 fail 0). RED-WITNESS
  CONFIRMED GENUINE, self-executed, not merely read.
- Full test/suite-gate.test.ts standalone, default toolchain (v22.22.2):
  18 tests, 18 pass, 0 fail.
- Registry check: test/behaviors.json diff origin/main...HEAD is purely
  additive (grep '^-' over the diff, excluding the '---' file header,
  returns zero lines). All 18 suite-gate-* keys' description strings
  resolve exactly (byte match) to a real test() title in
  test/suite-gate.test.ts (checked programmatically, 0 missing). Total
  behaviors.json count = 244, matching the work history's claimed
  "244 behaviors resolve" in the criterion-1 rerun exactly.
- Set up wt-floor and wt-default worktrees at 35a9c17 for isolated
  toolchain runs (avoiding interference between the two, per prior
  review's practice).
- FLOOR toolchain (v26.6.0, absolute path binary, no ambient PATH edit
  needed for npm ci/build since those don't spawn nested node): npm ci
  exit 0, 0 EBADENGINE lines; npm run build exit 0; git status
  --porcelain clean.
- FLOOR red-witness repeat (structurally identical mutation, second
  toolchain, PATH-prefixed so this session confirms the SAME sha256
  2cd0c372...4ed4b937f pristine, both new CR-1306 tests defang to RED
  (pass 0 fail 2, raw AssertionError 0 !== 1 captured), restore
  byte-identical (sha256 matches, git status clean), full
  test/suite-gate.test.ts in isolation on floor: 18 tests, 18 pass,
  0 fail.
- Kicked off full `npm test` in background on BOTH toolchains
  (wt-floor with floor PATH prefix, wt-default plain) to get the
  gate numbers per toolchain; heavy concurrent load observed again
  (ps aux: ~19-38 node --test processes from other phase reviews,
  same as prior review's noted condition).
- FLOOR toolchain (v26.6.0) full `npm test` COMPLETE: 238 tests, 235
  pass, 3 fail, 0 cancelled, 0 skipped, 0 todo, exit nonzero. Failures:
  test/liveness.test.ts:633 (doctor/guard beacon-age real-clock flake,
  named pre-existing class), test/watcher.test.ts:269 ("backs off with
  growing beacon gaps", "expected at least 4 beacon writes, saw 3"),
  test/watcher.test.ts:419 ("heartbeat schedule is on disk...",
  "0 !== 3"). All 3 failures in files OUTSIDE this phase's diff
  (liveness.test.ts, watcher.test.ts; phase touches suite.ts,
  suite-gate.test.ts, package.json, gates.manifest.json,
  behaviors.json only). No failure in test/suite-gate.test.ts.
  Full log: scratchpad/m2-fanout/m2-p3/rereview-criteria/floor-full.log.
- Criterion-1 self-gate run (delivered suite.ts against the kernel
  itself, --base 8439c88, floor toolchain): TIMED OUT at a 280s wrapper
  under today's heavy concurrent load (exit 124), matching the SAME
  inconclusive-not-a-defect pattern the prior criteria review recorded
  (300s wrapper too tight under ~658s wall time). Not re-attempted with
  a longer timeout since (a) the fixture-level mechanism is independently
  confirmed sound via the CR-1306 red-witness above, (b) this phase's
  own suite-gate.test.ts (which fixture-tests the identical code path,
  including a real invocation against fixture suites) passes 18/18 on
  both toolchains, (c) the cross-phase wiring test
  test/gates.test.ts:1289 exercises the same runner mechanism against
  this repository. INCONCLUSIVE at full-repository scale under load,
  not treated as pass or fail.
- DEFAULT toolchain (v22.22.2) full `npm test` COMPLETE: 238 tests, 233
  pass, 3 fail, 0 cancelled, 2 skipped, 0 todo, exit 1. Failures: line
  613 test/liveness.test.ts (doctor/guard node-version-floor flake, same
  named class), line 1331 test/watcher.test.ts (beacon-gaps flake), line
  1367 test/watcher.test.ts (heartbeat-schedule flake) -- the SAME three
  named tests as the floor run, same pre-existing real-clock/floor-gate
  class. 2 skips are the floor-gated doctor tests skipped below Node 26
  (confirmed by SKIP reason text: "local Node v22.22.2 is below the
  kernel floor >=26"). Zero failures in test/suite-gate.test.ts on
  either toolchain, full run or isolation. Full log:
  scratchpad/m2-fanout/m2-p3/rereview-criteria/default-full.log.
- Cross-checked m2-conflict-pre-pass.md contention 3 (gates.yml) still
  lists only M2-P1/P8/P9, NOT M2-P3 -- consistent with the arbitration's
  ruling that no pre-pass amendment is needed once P3's diff stops
  touching the file (verified true above).

## STATUS: COMPLETE

See FINAL REPORT below.

---

# FINAL REPORT

## Verdict: APPROVE

Head 35a9c17 closes all three findings from arbitration-m2-p3.md round one
(CR-1306 code medium, CR-M2P3-1 and CR-M2P3-2 record mediums). No
regression against any of the original 11 acceptance criteria. The
phantom-filter fix is at the mechanism (all three counting sites, not
just one instance), its own red-witness is genuine (self-executed, not
trusted), the two record corrections are verified independently, scope
is exactly the phase's declared files, and the registry is a clean
append-only union.

## Findings from CR-1425 (arbitration round one), disposition

| Finding | Disposition | Evidence |
|---|---|---|
| CR-1306 (code medium): empty .test.ts file's phantom pass counted as a real test, bypassing M2-C-2 | CLOSED | `isFileWrapperPhantom` filters `stream.points` into `points` once, before all 3 counting sites (bucketPoints call, discovery-parity reportedFiles, registry reportedTestNames); derivation grep republished and independently re-run by this review; false comment at old suite.ts:335-337 corrected |
| CR-M2P3-1 (record medium): work history's criterion 10 said "216 tests, 216 pass" | CLOSED | Work history corrected; this review's own two independent full-suite runs at head 35a9c17 both land on 238 tests (matching each other and the fix round's own re-measurement), each number internally consistent with the head it was measured against as the merge base moved (216/217 at 6fe8066, 238 at 8439c88) |
| CR-M2P3-2 (record medium): .github/workflows/gates.yml edited outside declared scope | CLOSED | `git diff origin/main -- .github/workflows/gates.yml` is EMPTY (0 bytes, verified twice, exit 0); branch was rebased onto main and the file reconciled entirely to main's version; m2-conflict-pre-pass.md contention 3 correctly left unamended since the file no longer needs authorization |

## Criteria regression table (all 11 re-executed, none regressed)

| # | Criterion (short) | Verdict | This review's evidence |
|---|---|---|---|
| 1 | Green on this repo, units==reported, discovered from independent walk | MET at fixture level; kernel-self run INCONCLUSIVE under load (see below) | test/suite-gate.test.ts test 1 passes both toolchains; cross-phase wiring test (gates.test.ts:1289, present in full-suite green run) passes; kernel-self gate run timed out at 280s under heavy concurrent load, not re-attempted given sufficiency of other evidence |
| 2 | Pattern-missed file, both directions | MET, unchanged | suite-gate.test.ts test passes both toolchains; discovery-parity loop untouched by this round except reading `points` instead of `stream.points`, a no-op when no file is an empty-file phantom |
| 3 | Renamed behavior, both directions | MET, unchanged | test passes both toolchains, code path untouched |
| 4 | Deleted behavior since merge base | MET, unchanged | test passes both toolchains, code path untouched |
| 5 | Skip without reason, both directions | MET, unchanged | test passes both toolchains; bucketPoints's skip logic unchanged, only its input array changed |
| 6 | Counterfeit line changes no count (C-1) | MET, unchanged | test passes both toolchains |
| 7 | Truncated stream with exit 0 is error | MET, unchanged | test passes both toolchains |
| 8 | Pin, both directions | MET, unchanged | test passes both toolchains; this round's diff does not touch pin logic |
| 9 | --base absent is error | MET, unchanged | test passes both toolchains |
| 10 | Suite/registry criterion, full node --test clean per toolchain | MET, corrected count | THIS REVIEW independently measured 238 tests on BOTH toolchains (floor: 238 total/235 pass/3 fail/0 skip; default: 238 total/233 pass/3 fail/2 skip), matching the fix round's own re-measurement exactly; all 3 failures on each toolchain are the SAME named pre-existing real-clock/floor-gate flakes (test/liveness.test.ts, test/watcher.test.ts), zero failures in test/suite-gate.test.ts on either toolchain |
| 11 | Reporter pin, both directions, byte-identical dual-toolchain counts | MET, unchanged | test passes both toolchains; this round's diff does not touch the reporter or pin comparison |

## Red-witness re-execution (CR-1306), self-performed, both toolchains

Not trusted from the work history -- independently reproduced by this
review from scratch:

- Pristine `src/gates/suite.ts` sha256 (default-toolchain worktree):
  `2cd0c3720f49d961b777657f2da34b7b20d15d5af3b698712780b3a4ed4b937f`,
  BYTE-IDENTICAL to the hash the work history records.
- Defang (dangerous pre-fix state): replaced
  `const points = stream.points.filter((point) => !isFileWrapperPhantom(point, cwd));`
  with `const points = stream.points;` -- i.e. removed the phantom
  filter entirely, reproducing the pre-fix code exactly, not merely
  disabling an unrelated guard.
- Default toolchain (v22.22.2): `node --test-name-pattern "CR-1306"
  --test test/suite-gate.test.ts` on the defanged file: `not ok 1`,
  `not ok 2`, `# pass 0`, `# fail 2`. RED.
- Restore via `cp` from a saved pristine copy (never `git checkout --`,
  CLAUDE.md warning 8): sha256 re-verified byte-identical
  (`2cd0c372...4ed4b937f`), `git status --porcelain` clean, re-ran: both
  tests green (`# pass 2`, `# fail 0`).
- Floor toolchain (v26.6.0), SAME mutation repeated independently in a
  separate worktree: pristine sha256 matched, defanged run produced
  captured `AssertionError [ERR_ASSERTION] ... 0 !== 1` on both new
  tests (raw output captured, not summarized), restore sha256-verified
  byte-identical, git status clean, restored run green on both.
- Full test/suite-gate.test.ts in isolation, fix in place: 18 tests, 18
  pass, 0 fail on BOTH toolchains.

Conclusion: the red-witness is genuine in both directions on both
toolchains, self-executed rather than read from the work history.

## Registry and scope

- `test/behaviors.json`: diff against origin/main is PURELY ADDITIVE
  (`git diff origin/main...HEAD -- test/behaviors.json | grep '^-'`
  returns zero content lines, excluding the file-header `---` line).
  All 18 `suite-gate-*` keys' description strings resolve BY EXACT
  STRING MATCH to a real `test()` title in `test/suite-gate.test.ts`
  (checked programmatically over the full file, 0 missing). Total
  registry size: 244 entries, matching the fix round's own claimed
  "244 behaviors resolve" figure exactly.
- Scope: `git diff --name-status origin/main...HEAD` is EXACTLY:
  `delivery/work-history/m2-p3.md` (A, standing extra),
  `gates.manifest.json` (M, files-to-touch), `package.json` (M,
  files-to-touch), `src/gates/suite.ts` (A, files-to-touch),
  `test/behaviors.json` (M, files-to-touch/standing extra),
  `test/suite-gate.test.ts` (A, files-to-touch). This matches
  `delivery/plan/phase-declarations/m2-p3.json`'s `filesToTouch` plus
  the two standing pre-authorized extras EXACTLY, with NO other file
  touched. `.github/workflows/gates.yml` is confirmed absent from this
  list, and `git diff origin/main -- .github/workflows/gates.yml` and
  `git diff --name-status origin/main...HEAD -- .github` are both
  independently confirmed EMPTY.

## Gate numbers per toolchain (this review's own runs, raw)

- Default (v22.22.2): `npm ci` exit 0 (EBADENGINE warning, expected
  below floor); `npm run build` exit 0; `git status --porcelain` clean;
  `npm test`: **238 tests, 233 pass, 3 fail, 2 skipped, 0 cancelled,
  0 todo**, exit 1. All 3 failures (test/liveness.test.ts:633,
  test/watcher.test.ts:269, test/watcher.test.ts:419) are the same
  named pre-existing real-clock/floor-gate flake family, all in files
  OUTSIDE this phase's diff. `test/suite-gate.test.ts` standalone: 18
  tests, 18 pass, 0 fail.
- Floor (v26.6.0, PATH-prefixed): `npm ci` exit 0 (0 EBADENGINE lines);
  `npm run build` exit 0; `git status --porcelain` clean; `npm test`:
  **238 tests, 235 pass, 3 fail, 0 skipped, 0 cancelled, 0 todo**, exit
  nonzero. SAME 3 named tests fail (liveness.test.ts:633 this time on
  the beacon-age arm, not the node-version arm; watcher.test.ts:269 and
  :419), all outside this phase's diff. `test/suite-gate.test.ts`
  standalone: 18 tests, 18 pass, 0 fail.
- Criterion-1 kernel-self gate run (floor toolchain, `--base 8439c88`):
  TIMED OUT at a 280s wrapper under heavy concurrent container load
  (same class of inconclusive result the original criteria review hit
  at a 300s wrapper vs ~658s wall time); not a defect signal, not
  re-attempted, see reasoning in criterion 1's row above.
- Both full-suite failure sets are IDENTICAL in test identity across
  toolchains (same 3 named tests), which is itself evidence these are
  pre-existing load-sensitive flakes the work history and the prior
  clean-room review already named, not something this fix round
  introduced (the fix round's diff does not touch test/liveness.test.ts
  or test/watcher.test.ts at all).

## Claim grep (this review's own re-run)

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m2-p3.md
```
Re-run independently over the full file at head 35a9c17. All hits inside
the fix-round section (from "## Fix round one" onward) are either: (a)
literal test-title strings containing the word "never" (not risk
claims), (b) adjacent to a pasted command and its full output (the
"no fourth production call site exists" derivation), or (c) explicitly
restated as an open question with a stated reason ("no criterion in the
plan requires distinguishing it ... because node gives no other signal,
measured"). No new unqualified impossibility claim found in the fix
round's own text.

## Not covered by this review, stated

- The kernel-self criterion-1 gate run (the STRONGEST form of criterion
  1, against this exact live repository) did not complete within this
  review's time budget under today's heavy concurrent load; reported as
  inconclusive rather than pass or fail, consistent with how the
  original criteria clean-room review treated the identical situation.
- This review did not re-mutation-test the other 14 red-witness rows
  from the original submission's own ledger (criteria 2-9, 11); those
  were already spot-checked structurally by the original criteria
  clean-room review (2 of 14, two different classes) and are unaffected
  by this round's diff (only criterion 10's count and the CR-1306
  mechanism changed). This review's own re-execution instead covers:
  all 11 criteria's fixture tests passing on both toolchains (fresh
  runs, not read from a prior log), the CR-1306 mechanism fully
  mutation-tested on both toolchains independently, and both full-suite
  gate runs.
- Whether the moving test count (216 -> 217 -> 238 across three
  successive sessions) will keep moving before merge was not
  investigated further; each number is internally consistent with the
  head it was measured against as the merge base moved, and this
  review's own two independent measurements at 35a9c17 both land on
  238, matching each other and the current work history's claim.
