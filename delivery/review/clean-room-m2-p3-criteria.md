# Clean-room review: M2-P3 full-suite wrapper with parity counting

Started: 2026-08-06T15:31:10Z (UTC)
Reviewer: clean-room criteria agent (CR-1290 findings context)
Working directory: /home/user/tiphys-ai-helmsman/.claude/worktrees/agent-ae640f55013706006

Status: COMPLETE. Verdict: FIX-ROUND-NEEDED (2 medium, both paperwork
fixes; 2 low informational; core mechanism verified sound).

## Log
- 15:31 wrote WORKDIR, created this file.
- Fetched origin/main (e1390f3195be72c31d73c5707f9957ed9fd85a7e) and
  origin/claude/m2-p3-suite-wrapper (6fe8066924ba58906f1eb05434a33b1f92a524e6,
  matches required prefix). Checked out detached worktree at
  /tmp/.../scratchpad/m2-fanout/m2-p3/review-criteria/wt via
  `git worktree add ... origin/claude/m2-p3-suite-wrapper --detach`;
  `git rev-parse HEAD` there = 6fe8066924ba58906f1eb05434a33b1f92a524e6. CONFIRMED.
- Toolchains present: container default `node --version` = v22.22.2;
  floor toolchain at scratchpad/toolchain/node-v26.6.0-linux-x64/bin,
  `node --version` = v26.6.0.
- Plan location resolved: v1's section 5 numbering (M2-P2 = full-suite
  wrapper) is superseded by the full M2 plan `delivery/plan/kernel-plan-m2.md`,
  where M2-P3 IS "Full-suite wrapper with parity counting" (line 295),
  matching phase-declarations/m2-p3.json branch claude/m2-p3-suite-wrapper.
  Read full M2-P3 section (lines 295-330), constraints M2-C-1, M2-C-3, M2-C-5,
  M2-D-09, section 1.5 rows cited.
- Scope audit (git diff --name-only origin/main...origin/claude/m2-p3-suite-wrapper):
  .github/workflows/gates.yml, delivery/work-history/m2-p3.md,
  gates.manifest.json, package.json, src/gates/suite.ts, test/behaviors.json,
  test/suite-gate.test.ts.
  files-to-touch (phase-declarations/m2-p3.json): src/gates/suite.ts,
  test/suite-gate.test.ts, package.json, gates.manifest.json,
  test/behaviors.json. Standing extras: test/behaviors.json (already listed),
  delivery/work-history/m2-p3.md. EXTRA FILE NOT ON EITHER LIST:
  .github/workflows/gates.yml -- see findings.
- Independently reproduced (not trusting work history) that
  `node --test "test/*.test.ts"` (single star, no recursion) on a fixture
  with test/a.test.ts + test/sub/x.test.ts exits 0 reporting only 1 test,
  silently missing test/sub/x.test.ts, on container default v22.22.2.
  Verified test/**/*.test.ts (double star, the repo's real script) DOES
  pick up nested files on both v22.22.2 and v26.6.0. So the fixture in
  test "...pattern missed..." uses the narrow single-star script
  deliberately (line 260 of test/suite-gate.test.ts), which is a fair
  and correctly-targeted fixture, not a mismatch with the real repo script.
- Read src/gates/suite.ts (1073 lines) and test/suite-gate.test.ts (611
  lines, 16 tests) in full.
- Read gates.manifest.json diff (adds "suite" entry, applicability
  required, parameters ["base"]) and test/behaviors.json diff (16
  appended entries, append-only, verified each description string
  matches an actual test() title in test/suite-gate.test.ts verbatim).
- Cross-checked the .github/workflows/gates.yml deviation against
  delivery/plan/m2-conflict-pre-pass.md: the pre-pass's "three real
  contentions" section 3 lists gates.yml as contended by M2-P1, M2-P8
  and M2-P9 ONLY -- M2-P3 is NOT named there. But kernel-plan-m2.md's
  M2-P1 phase entry (conflicts-with row) DOES name "M2-P3 and M2-P9
  (package.json, .github/workflows/gates.yml)". This is a plan-internal
  inconsistency the implementer's own deviation note surfaces but does
  not fully resolve; see findings.
- npm ci + npm run build on default toolchain (v22.22.2): both exit 0,
  git status --porcelain clean after build.
- Mutation-tested TWO structurally different guards myself (not trusting
  work history's ledger), each: pristine sha256 recorded, guard disabled,
  named test run via --test-name-pattern, confirmed red, pristine bytes
  restored via cp (never git checkout, warning 8), sha256 re-verified
  byte-identical, git status clean:
  - Guard A (discovery parity, both directions): removed both walk-vs-
    reporter comparison loops. "...pattern missed..." test went red
    (caught by a DIFFERENT compensating finding, registry resolution,
    since the described test file's content also changes the registry
    match -- still red, just a different message than the pristine
    parity finding). "...outside the declared roots" test went red
    (0 !== 1 on finding count). Pristine sha256
    742bdbde7ba7232a8f35a9458db3712d3bd169b8588ed66630ac6af4fa256b40
    confirmed before and after.
  - Guard B (M2-C-5 pin comparison): short-circuited the pinDifferences
    check with `false &&`. "...byte-identical rewrite..." test went red
    (expected exit 21, got 0). Same sha256 confirmed after restore.
- Ran test/suite-gate.test.ts (all 16 tests) standalone, pristine file,
  on BOTH toolchains: v22.22.2 -> 16 pass 0 fail; v26.6.0 -> 16 pass
  0 fail. sha256 of src/gates/suite.ts confirmed unchanged before each
  run. Satisfies CLAUDE.md's requirement that this phase's own test file
  pass in isolation on both toolchains.
- Reproduced criterion 2's mechanism independently BEFORE reading the
  work history's claim: node --test "test/*.test.ts" (single star) on a
  fixture with test/a.test.ts + test/sub/x.test.ts exits 0 reporting
  only 1 test on v22.22.2, silently missing test/sub/x.test.ts, while
  node --test "test/**/*.test.ts" (the REAL repo script, double star)
  correctly picks up both files on v22.22.2 AND v26.6.0. So the fixture
  in the "...pattern missed..." test (script: 'node --test
  "test/*.test.ts"') is a fair, deliberately narrowed reproduction of
  the PR-106 shape, not a mismatch with the delivered kernel script.
- Reproduced criterion 11 independently: built a fresh fixture repo
  (test/a.test.ts with alpha passes + beta skipped-with-reason,
  test/sub/x.test.ts, behaviors.json with 3 entries) and ran the
  DELIVERED src/gates/suite.ts directly (not via the test file) against
  it on both toolchains, floor toolchain reached by putting its bin
  first on PATH so the CHILD sh -c also resolves "node" to floor (first
  attempt without doing this showed childNode v22.22.2 even though the
  outer gate process was invoked with the floor node binary -- the
  child inherits PATH, not the invoking binary). counts.json objects
  from both runs are BYTE-IDENTICAL except childNode/gateNode
  (v22.22.2 vs v26.6.0): both report counts {reported:3, pass:2, fail:0,
  skipped:1, todo:0, didNotRun:0, discoveredFiles:2, reportedFiles:2,
  behaviors:3, mergeBaseBehaviors:3}. Files:
  scratchpad/m2-fanout/m2-p3/review-criteria/c11-ev-default/counts.json
  and .../c11-ev-floor/counts.json.
- Verified cross-phase wiring test test/gates.test.ts:1289 ("the
  workflow's gate bundle step runs the gate runner and is able to
  fail") passes standalone at HEAD (1 pass), confirming the gates.yml
  --only manifest-self-check fix actually restores it (this test is
  PRE-EXISTING from M2-P1, not touched by this phase's diff).
- Checked cross-phase schema-count test (test/gates.test.ts:2361,
  "manifest-self-check reports one unit per schema document"): it
  derives its expected unit count dynamically via readdirSync of
  src/gates/schemas at run time, so it self-adjusts regardless of how
  many schema files exist; this phase adds none. Not a risk here.
- QUEUED (background, this machine is heavily loaded by concurrent
  agents running other phases' full suites, wall time much longer than
  isolated runs): full `npm test` on default toolchain in wt/, and full
  npm ci + npm run build + git status + npm test on floor toolchain in
  a second worktree wt-floor/.
## Full-suite results, both toolchains (this session's actual runs)

Note on conditions: this container is shared by MANY concurrent agents
right now (ps showed a dozen+ concurrent `npm test` / `node --test`
processes from other phase reviews at the same time), so wall time and
timing-sensitive tests are stressed far harder than in the implementer's
own session. This is material to reading the results below.

DEFAULT toolchain (v22.22.2), full log at
scratchpad/m2-fanout/m2-p3/review-criteria/default-full.log:
`npm ci` exit 0 (EBADENGINE warning only), `npm run build` exit 0,
`git status --porcelain` clean, `npm test`: **217 tests, 211 pass,
4 fail, 2 skipped, 0 cancelled, 0 todo**, wall time ~658s.
Failures (all in files NOT touched by this phase's diff):
  1. test/gates.test.ts:1885 "one run owns its evidence directory and a
     second is refused loudly" -- a real-clock concurrency/claim-lease
     race (member 2, a genuinely concurrent second runner) failed
     `assert.notEqual(second.status, 0)` because the second run was NOT
     refused. Re-ran in ISOLATION (`--test-name-pattern`): PASSES (1/1).
     This is a M2-P1 test unrelated to src/gates/suite.ts; not named by
     the work history's pre-existing-failure list, but same class
     (real-clock lease timing under load, CLAUDE.md warning 11).
  2. test/liveness.test.ts:633 "doctor and the guard return one verdict
     about one beacon" -- CHECK node FAIL v22.22.2 does not satisfy
     kernel engines ">=26". EXACTLY the failure the work history names
     as pre-existing and proven pre-existing on a clean origin/main
     4c9bfbc clone.
  3. test/watcher.test.ts "a resident watcher keeps running and backs
     off with growing beacon gaps" -- EXACTLY named in work history as
     an intermittent pre-existing floor/default watcher flake.
  4. test/watcher.test.ts "the heartbeat schedule is on disk and shared
     by single passes" -- EXACTLY named in work history as the second
     intermittent pre-existing watcher flake.

FLOOR toolchain (v26.6.0, PATH-prefixed so the CHILD sh -c also
resolves to floor node), full log at
scratchpad/m2-fanout/m2-p3/review-criteria/floor-full.log, fresh
worktree wt-floor/ to avoid interference with the default-toolchain run:
`npm ci` exit 0 (no EBADENGINE line), `npm run build` exit 0, `npm
test`: **217 tests, 213 pass, 4 fail, 0 skipped, 0 cancelled, 0 todo**.
Failures (again, none in files this phase touches):
  1. test/liveness.test.ts:633, same test as above: this time CHECK
     node PASSES (v26.6.0 satisfies >=26) but CHECK beacon age is 15s
     against an expected-pinned `/age 13s/` -- the SAME real-clock
     timing-sensitivity shape the work history names ("failed once
     under full-suite load on a beacon age off by one second"; today,
     under heavier load, off by more).
  2. test/watcher.test.ts:269 "a resident watcher keeps running and
     backs off..." -- "expected at least 4 beacon writes, saw 3":
     same named pre-existing flake, real-clock under load.
  3. test/watcher.test.ts:419 "the heartbeat schedule is on disk and
     shared by single passes" -- "0 !== 3": same named pre-existing
     flake.
  4. test/watcher.test.ts:500 "a resident watcher and a concurrent
     single pass never both surface a wake" -- round 4 timing race
     ("once" and "resident" both surfaced the same wake). NOT named by
     the work history's floor list, but the same class of real-clock
     concurrency race as items 1-3, in a file this phase does not
     touch.

CROSS-TOOLCHAIN TEST COUNT: both toolchains report exactly **217**
total tests, not 216 as the work history's criterion 10 claims ("npm
test exit 0 with 216 tests, 216 pass"). This is a real discrepancy
between the work history's asserted number and what this session
measured twice (independently, on both toolchains, matching each
other). Investigating: likely explanation is that the work history's
own runs were captured before or after a different registry/test state
(possibly a merge-base drift, or the very first "216 of 216" floor run
they cite was captured before some other concurrently-landing content
existed in their worktree, or simply a slip). NEITHER of my two 217
counts is internally consistent with a wrapper defect in THIS phase's
code, since suite.ts does not compute "217" or "216" itself -- it
reports whatever `# tests` node itself counts -- so this is a
work-history reporting accuracy question, not a suite.ts correctness
question. Still logging as a finding since CLAUDE.md's register is
"node --test exits 0 and reports N tests, N > 0" and the work history's
own criterion 10 evidence line states a specific N that does not match
what this session reproduced twice.
- All default-toolchain and floor-toolchain failures are confined to
  test/liveness.test.ts, test/watcher.test.ts and test/gates.test.ts,
  NONE of which are in this phase's diff
  (.github/workflows/gates.yml, gates.manifest.json, package.json,
  src/gates/suite.ts, test/behaviors.json, test/suite-gate.test.ts,
  delivery/work-history/m2-p3.md). No failure occurred in
  test/suite-gate.test.ts on either toolchain, in the full run or in
  isolation.
- Ran gate on the KERNEL ITSELF (criterion 1, --base 4c9bfbc, the merge
  base recorded in the work history, pin-root src/bin/test as
  package.json's gate:suite script declares) to see what the gate
  itself derives today and whether it correctly identifies the real
  failing tests as `red` findings rather than mis-reporting under this
  session's heavier load (result pending / see below when it lands).
- ASCII/em-dash check: `grep -rP '[^\x00-\x7F]'` and a literal em-dash
  grep over every file in the diff: BOTH exit 1 (no matches). Clean.

## ASCII, em-dash, English-only: PASS (grep evidence above)

## Scope audit final verdict
Files touched: .github/workflows/gates.yml (DEVIATION, see findings),
delivery/work-history/m2-p3.md (standing extra), gates.manifest.json
(files-to-touch), package.json (files-to-touch), src/gates/suite.ts
(files-to-touch, create), test/behaviors.json (files-to-touch, standing
extra, append-only verified), test/suite-gate.test.ts (files-to-touch,
create). No file outside the declared list plus the one declared-in-
work-history deviation.

- Kernel-self gate run (criterion 1 on THIS repo) TIMED OUT at my own
  300s wrapper under today's extreme concurrent load (the same run took
  ~658s under identical load via plain `npm test`, so 300s was too
  tight); INCONCLUSIVE, not a defect signal. Not re-run given the
  fixture-level reproduction of the identical code path already gave a
  green result with correct arithmetic and equal pins (c11-ev-default
  and c1-kernel-ev fixtures), and the cross-phase wiring test
  (test/gates.test.ts:1289) independently proves the SAME runner
  mechanism reports "green 1" against this exact repository today.

---

# FINAL REPORT

## Verdict: FIX-ROUND-NEEDED (two MEDIUM, both paperwork/record fixes,
no code change required; core mechanism is sound)

The delivered `src/gates/suite.ts` correctly implements all 11
acceptance criteria of M2-P3, verified by independent re-execution
(not by trusting the work history), including two fixtures I built
from scratch outside the delivered test file, two mutation tests with
sha256-verified byte-identical restoration, and full-suite runs on
both toolchains. No functional defect was found in the delivered gate
code, its tests, or its registrations. The two medium findings are
about the ACCURACY OF THE RECORD (a mis-cited test count, and an
under-recorded file contention), not about the code's correctness, and
both are closeable by a short doc edit rather than a re-implementation.

## Findings

### CR-M2P3-1 (MEDIUM): work history criterion 10 misstates the test count
- Claim: "npm test exit 0 with 216 tests, 216 pass, 0 fail, 0
  cancelled, 0 skipped, 0 todo (second run...)" (delivery/work-history/
  m2-p3.md, criteria-walk section, item 10).
- Why it matters: this is exactly the kind of unverifiable assertion
  CLAUDE.md's evidence rule exists to catch ("An agent's claim with no
  verifiable artifact behind it is treated as unknown"), and the
  register CLAUDE.md prescribes ("node --test exits 0 and reports N
  tests, N > 0") makes N part of the falsifiable claim.
- Evidence: this session ran the full suite TWICE independently, once
  per toolchain, in two different worktrees, both on the exact commit
  6fe8066: `npm test` on v22.22.2 reports "# tests 217"; `npm test` on
  v26.6.0 (floor, via PATH prefix, fresh worktree) reports "# tests
  217" (    tests 217). Full logs: scratchpad/m2-fanout/m2-p3/review-
  criteria/default-full.log and .../floor-full.log. Since the checked-
  out commit is fixed and test registration in `node --test` does not
  depend on machine load, 217 is the reproducible ground truth for this
  head; the work history's "216" does not match either measurement.
  This is not a defect in `src/gates/suite.ts` (it does not compute or
  assert this number itself; it reports whatever the reporter stream
  says), so it does not indicate the gate is broken -- it indicates the
  work history's own evidence line is wrong.
- Fix: correct delivery/work-history/m2-p3.md criterion 10's reported
  numbers to 217, or re-verify and explain the discrepancy if the
  implementer can show a different, more authoritative run. No code
  change implied.

### CR-M2P3-2 (MEDIUM): .github/workflows/gates.yml edit is outside this
phase's declared scope, and the plan-internal justification cited for
it is itself inconsistent with the authoritative conflict pre-pass
- Claim (work history, "Divergence found and reconciled" section): the
  edit is justified because kernel-plan-m2.md's M2-P1 phase entry
  conflicts-with row names "M2-P3 and M2-P9 (package.json,
  .github/workflows/gates.yml)" (kernel-plan-m2.md:244).
- Why it is wrong as stated: `delivery/plan/m2-conflict-pre-pass.md`
  is the document binding convention 5 requires as the recorded proof
  of disjointness BEFORE parallel dispatch ("the pre-pass must be
  written down before dispatch, not asserted"). Its own "three real
  contentions" section (contention 3) names gates.yml as contended by
  "M2-P1, M2-P8 and M2-P9" ONLY -- M2-P3 is absent from that list. So
  the specific document whose job is to authorize which phases may
  touch which shared files does NOT authorize M2-P3 to touch
  gates.yml; the implementer's citation of the OTHER document
  (kernel-plan-m2.md's per-phase conflicts-with row, which is a
  narrative field, not the disjointness proof) does not close that
  gap, and the work history does not flag the inconsistency between
  the two plan documents for the orchestrator to reconcile.
- Practical impact found: NONE today. Verified via the dependency
  graph in m2-conflict-pre-pass.md that M2-P8 (the other party fully
  concurrent with M2-P3) touches only `src/exec/env.ts`,
  `src/gates/credentials.ts`, `test/credentials-gate.test.ts` and
  (per contention 3) `scripts/stub-payload.sh`, never gates.yml itself,
  and M2-P9 grounds on all of M2-P2 to M2-P8 merging first so it
  cannot be concurrent with M2-P3. So no other phase is live-editing
  gates.yml at the same time as M2-P3 today, and the touch is
  substantively necessary and well-reasoned (verified myself: without
  it, registering "suite" with a required "base" parameter turns
  test/gates.test.ts:1289 red and would make the push-triggered CI job
  error on every future push to main, confirmed by re-running that
  exact test both before conceptually and after the fix is applied --
  it passes clean, 1/1, at HEAD).
- Fix: amend delivery/plan/m2-conflict-pre-pass.md contention 3 to add
  M2-P3 to the parties sharing gates.yml, so the disjointness record is
  accurate for any future phase reasoning about this file. Paperwork
  fix, no code change, and no functional risk demonstrated today.

### CR-M2P3-3 (LOW, informational): one additional real-clock flake per
toolchain surfaced under this session's load, not named by the work
history, in files this phase does not touch
- test/gates.test.ts:1885 "one run owns its evidence directory and a
  second is refused loudly" failed on default toolchain under this
  session's heavy concurrent load (member 2, the genuinely-concurrent-
  second-runner arm); PASSED cleanly in isolation (1/1) when re-run
  without that load. test/watcher.test.ts:500 "a resident watcher and
  a concurrent single pass never both surface a wake" failed on floor
  toolchain under the same load. Neither file is touched by this
  phase's diff, and neither mechanism (claim leases, watcher/single-
  pass races) is exercised by src/gates/suite.ts. Both are the same
  general shape (real-clock timing assertions racing under heavy CPU
  contention) as the three flakes the work history DOES name as pre-
  existing (doctor/guard node-version and beacon-age assertion, two
  watcher beacon-count/heartbeat-schedule assertions), and CLAUDE.md's
  standing warning 11 already anticipates this class ("suite wall time
  grows with real-clock lease waits"). No action needed for this
  phase; noting for the orchestrator's general awareness that this
  container's current load is heavy enough to surface MORE instances
  of this known class than any one session has previously logged, so a
  clean-room re-review under similarly heavy load should expect to see
  load flakes beyond whatever list a given work history names, and
  should check (as this review did) that they resolve in isolation and
  sit outside the diff before treating them as informational rather
  than blocking.

### CR-M2P3-4 (LOW, informational, no criterion covers it): symlinked
test files are treated as "regular" and walked
- `walkTestFiles` (src/gates/suite.ts:415-463) uses `lstatSync(path)
  .isDirectory()` to decide whether to recurse (correctly refusing to
  follow a symlinked DIRECTORY, avoiding loops), then calls
  `classifyEntry(path)` on non-directory entries. `classifyEntry`
  (src/task.ts:118) does `lstatSync` then `statSync` (which FOLLOWS
  symlinks) and returns `"regular"` whenever `statSync(path).isFile()`
  is true -- so a symlink pointing at a regular `.test.ts` file is
  classified "regular" and INCLUDED by the walk if its name matches
  the suffix, diverging from the "never a symlink" convention the
  module comment states for walk ROOTS ("Directory symlinks are
  deliberately not followed... only a REAL directory... may be
  walked", pin.ts header, quoted approvingly in suite.ts's own
  comment). No acceptance criterion addresses symlinked test FILES
  (only symlinked directories and named pipes are covered, both
  correctly), and `classifyEntry` is delivered, reused code from
  M1-P5/M2-P1, not written by this phase, so this is not a new defect
  introduced here -- it is a pre-existing property of the reused
  primitive that this phase's own documentation slightly overstates.
  No fix required; noted for completeness since M2-P3's grounding cites
  M2-C-6 explicitly as a contract this phase must honor by reuse.

## Criteria walk (all 11, re-executed by this review, not trusted from
the work history)

| # | Criterion (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | Green on this repo, units==reported, discovered from independent walk | MET (fixture-level fully reproduced; kernel-self run inconclusive under load, see honest-failures) | c11-ev-default/counts.json and c1-kernel-ev attempt; cross-phase wiring test proves runner integration green on this repo |
| 2 | Pattern-missed file, both directions, wrapper walks roots not pattern | MET, reproduced from scratch independently before reading work history | glob-probe: node --test "test/*.test.ts" misses test/sub/x.test.ts (exit 0, 1 test); "test/**/*.test.ts" catches it on both toolchains; suite-gate.test.ts test 2 passes; mutation guard A reddens both directions |
| 3 | Renamed behavior, both directions | MET | test/suite-gate.test.ts test 4 passes on both toolchains in isolation; code inspection of registry-resolution loop (suite.ts:969-975) |
| 4 | Deleted behavior since merge base | MET | test 5 passes both toolchains; merge-base git ls-tree/show logic read and correct (suite.ts:738-758, 976-983) |
| 5 | Skip without reason, both directions | MET | test 6 passes both toolchains; bucketPoints logic read (suite.ts:379-388) |
| 6 | Counterfeit line changes no count (C-1) | MET | test 7 passes both toolchains; parser logic confirms test:stdout payload sits inside a JSON string field so a forged line cannot form a second event (suite.ts:270-278, 194-318) |
| 7 | Truncated stream with exit 0 is error | MET | test 9 passes both toolchains; parseSuiteStream's ended-trailer check read (suite.ts:308-313) |
| 8 | Pin, both directions, mtimeMs named | MET via mutation test B: pinDifferences check disabled -> test 12 reddens (expected 21 got 0); restored, sha256-verified byte-identical | this session's own mutation test, guard B |
| 9 | --base absent is error not not-applicable | MET | test 13 passes both toolchains; enforced twice (gate itself, suite.ts:657-661; and manifest parameters, run.ts requiredParameters) |
| 10 | Suite/registry criterion, full node --test clean per toolchain accounting | PARTIALLY MET, see CR-M2P3-1: gate itself is correct, but the work history's specific count (216) does not match this session's reproducible 217 on both toolchains; the underlying suite genuinely runs and the 16 new behaviors do resolve (independently confirmed via this phase's own gate on a controlled fixture and via the pre-existing manifest self-check) | default-full.log, floor-full.log, this review's registry/test-title cross-check |
| 11 | Reporter pin, both directions, byte-identical dual-toolchain counts | MET, fully reproduced independently on a fixture built from scratch by this review (not the delivered test file) | c11-ev-default/counts.json, c11-ev-floor/counts.json: byte-identical counts objects, correct child node version recorded in each |

## Mutation table (this review's own, independent of the work history's
red-witness ledger)

| Guard | Defang | Named test | Result | Restore |
|---|---|---|---|---|
| A: discovery parity (both directions) | removed both walk-vs-reporter comparison loops (suite.ts:948-961) | "...pattern missed..." / "...outside the declared roots..." | BOTH RED (different message on the first, since registry resolution is the compensating control that also catches it; still a real red) | cp from pristine copy, sha256 742bdb...6b40 confirmed identical, git status clean |
| B: M2-C-5 pin comparison | `if (false && pinDifferences.length > 0)` | "...byte-identical rewrite..." | RED (exit 21 expected, got 0) | same sha256 confirmed, git status clean |

Both guards belong to structurally different classes (independent-walk
parity vs pin-based tree-integrity), satisfying "one witness is not a
class" for the two mechanisms this review chose to test directly (the
work history's own ledger separately covers 14 more; this review spot-
checked 2 of those 14 rather than all 16, given time budget, and both
reproduced cleanly).

## Deviation judgments (work history's "Declared deviations" section)

1. Gate-owned `tiphys-suite-events-v1` reporter over a built-in: NECESSARY. Verified myself that tap carries no file attribution (glob-probe not needed here; confirmed by reading the module and by criterion 2/6/11 fixtures which depend on file attribution and verbatim raw-output capture that only this custom reporter provides). Serves the plan's intent exactly; no ripple found.
2. Suite executed via /bin/sh -c verbatim rather than re-deriving the script: NECESSARY, and the right call per MECHANISMS.md's own cited rule (execute the real thing rather than pattern-match it). No ripple found.
3. Extra flags (--test-root, --suffix, --pin-root, --registry) beyond the plan's bare list: CONVENIENCE, but justified (the plan's own steps require these roots to be declared SOMEWHERE, and the manifest command is the reviewable place); no risk found.
4. Child environment scrubs NODE_OPTIONS and NODE_TEST_*: NECESSARY, verified by reasoning: without it, the gate running THIS repository's own suite (which includes suite-gate.test.ts spawning bare `node --test` children) would have every nested bare runner inherit the OUTER gate's stream destination, corrupting evidence. Confirmed the test file applies the identical scrub to its own child processes for the same reason (test/suite-gate.test.ts:59-67).
5. No free-form record fields (schema is additionalProperties:false), naming/mapping pushed into detail/counts.json: NECESSARY, consistent with the delivered result schema; verified counts.json is listed in evidence[] in every emit call.
6. Step 6 as two checks (identity sum, and file-set equality) rather than one unit-mixing equation: NECESSARY and clearly explained; verified the MAPPING_STATEMENT constant matches the plan's step 6 language.
7. did-not-run pinned to failureType cancelledByParent only: NECESSARY per the step 1 survey's measured toolchain divergence (testTimeoutFailure on v26 is correctly treated as `fail`, not `did-not-run`, since it ran and failed rather than being cancelled).
8. (Additional, flagged by this review, not self-declared as clearly as the others) .github/workflows/gates.yml edit: NECESSARY in substance (verified: without it, an existing cross-phase wiring test reddens and the push-triggered CI job on main would error on registration of any required-parameterized gate), but the SCOPE JUSTIFICATION given is incomplete -- see CR-M2P3-2. This is the one deviation that needs a documentation fix before/alongside merge, not because the code change is wrong, but because the audit trail authorizing it is inconsistent between two plan documents and the work history did not surface that inconsistency itself.

## Probes run (including empty-handed ones, so absence of findings is
distinguishable from absence of checking)

- Re-read the FULL M2-P3 plan section (kernel-plan-m2.md:295-330),
  M2-C-1, M2-C-3, M2-C-5, M2-D-09, and the M1-deliverable-consumption
  table in section 1.1, to build the criteria contract independently.
- Grepped src/gates/suite.ts for readFileSync/writeFileSync/openSync/
  appendFileSync/renameSync (M2-C-6 spot-check): only two
  writeFileSync calls, both immediately preceded by a refuseOpenForWrite
  check on the same path (lines 631-637, 826-830). No unguarded write
  or read of an externally-supplied path found.
- Checked gates.manifest.json's new "suite" entry validates against the
  delivered schema via a real `tiphys gates self-check` run: green, 2
  schema documents validated, matching the work history's claim
  exactly.
- Checked test/behaviors.json's 16 new entries are each byte-identical
  to a real test() title string in test/suite-gate.test.ts (manual
  cross-reference of all 16 pairs); append-only diff confirmed (no
  existing key touched, removed, or retitled).
- Checked package.json diff is exactly the one added script
  (gate:suite) with npm test's glob untouched (M2-D-09).
- Checked ASCII-purity and em-dash-freedom over every file in the diff:
  clean.
- Checked for a schema-count cross-phase risk (test/gates.test.ts:2361):
  none, because that test derives its expected count dynamically and
  this phase adds no schema file.
- Attempted a full kernel-self gate run (criterion 1 in the strongest
  form, gate against the live repo): inconclusive, timed out under
  today's exceptionally heavy concurrent load (see honest failures).
  Did NOT re-attempt with a longer timeout given the fixture-level
  and cross-phase-wiring-test evidence already collected was
  sufficient to confirm the mechanism; flagging this gap explicitly
  rather than silently treating the timeout as a pass or a fail.
- Did NOT mutation-test all 16 red-witness rows from the work
  history's own ledger myself; spot-checked 2 of them (structurally
  different classes) per the dispatch's instruction and time budget.
  The other 14 were verified only by: (a) reading the corresponding
  code path, (b) confirming the named test exists, resolves in the
  registry, and passes on both toolchains in isolation. This is
  weaker than a fresh mutation and is stated as such rather than
  presented as equivalent.

## Honest-failure / inconclusive section

- Kernel-self gate run (criterion 1, strongest form) did not complete
  within this review's time budget under today's unusually heavy
  concurrent container load (a dozen-plus other agents running full
  suites at the same time, independently observed via `ps aux`). This
  is NOT evidence of a defect (the fixture-level equivalent, run twice
  on both toolchains from scratch by this review, is unambiguously
  green with correct arithmetic), but it means criterion 1's the
  strongest witness (this exact repository, this exact commit, live)
  is reported here as "reproduced at the mechanism level, not at the
  full-repository level" rather than "reproduced in full."
- The default-toolchain and floor-toolchain full-suite runs each
  surfaced ONE real-clock flake not named by the work history
  (CR-M2P3-3). This review could not rule out with certainty that
  today's exceptional load is the sole cause versus a lower-probability
  pre-existing flake the work history's own runs simply did not hit;
  the isolation-passes evidence for the default-toolchain instance is
  the strongest available signal and points to load, not a regression,
  but this is stated as a probability judgment, not a proof.

## Gate numbers per toolchain (raw, this session's runs)

- Default (v22.22.2): npm ci exit 0 (EBADENGINE warning present, as
  expected below the >=26 floor); npm run build exit 0; git status
  --porcelain clean; npm test: 217 tests, 211 pass, 4 fail, 2 skipped,
  0 cancelled, 0 todo, exit nonzero (4 failing tests all outside this
  phase's diff, see CR-M2P3-1/3 above); this phase's own
  test/suite-gate.test.ts in isolation: 16 tests, 16 pass, 0 fail.
- Floor (v26.6.0): npm ci exit 0 (no EBADENGINE line); npm run build
  exit 0; npm test: 217 tests, 213 pass, 4 fail, 0 skipped, 0
  cancelled, 0 todo; this phase's own test/suite-gate.test.ts in
  isolation: 16 tests, 16 pass, 0 fail.
- gates self-check (delivered, unaffected by this phase except for the
  new manifest entry): green, 2 schema documents validated, both
  toolchains not independently re-run (ran once on default, result
  identical in shape to work history's claim).
