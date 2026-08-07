# Clean-room DELTA re-review (criteria/regression), M2-P3 fix round TWO

Reviewer: fresh clean-room re-reviewer, has not seen implementation session.
Branch: claude/m2-p3-suite-wrapper
Target head (to verify): 6690200
Started: 2026-08-06

Status: IN PROGRESS - setting up environment.

## Log

- Wrote WORKDIR.
- Beginning fetch/checkout of branch and reading governing docs.
- Fetched origin/claude/m2-p3-suite-wrapper: head 66902001df6a52decd737992d2d6f7c44d75f66b.
  Confirmed origin/main (8439c8846c1b25eb20482f49c41152616144e3c4) IS an
  ancestor of the branch (current with origin/main, per task instruction).
- git log: 6690200 (round two fix), 35a9c17 (round one fix), then merge of
  origin/main, then M2-P6 and M2-P1 commits.
- Created detached worktree at scratch/wt on origin/claude/m2-p3-suite-wrapper,
  verified HEAD = 6690200 exactly, clean status.
- Read arbitration-m2-p3-round2.md from claude/m2-phase-reviews: outcome was
  FIX-ROUND-NEEDED on hazard delta CR-1410-1 only (criteria delta CR-1425 was
  already APPROVE in round 1's re-review). Mechanism: phantom filter compared
  `point.name === relative(cwd, point.file)`, which misses an ABSOLUTE-path
  invocation of the wrapped test file (node names the file-wrapper phantom by
  the path AS INVOKED). Required fix: spelling-invariant discriminator, e.g.
  `resolve(cwd, point.name) === point.file`. Required red witnesses: BOTH
  relative-invoked and absolute-invoked zero-test files as dangerous states.
- Read full M2-P3 plan section (delivery/plan/kernel-plan-m2.md lines 295-330):
  11 acceptance criteria located and transcribed for use below.
- Located plan is kernel-plan-m2.md not kernel-plan-v1.md (v1 only has the
  phase list/table); the phase's own dedicated plan file has the full detail
  including the acceptance criteria contract.
- Scope audit round-2 delta: `git diff --name-status 35a9c17..6690200` =
  exactly delivery/work-history/m2-p3.md, src/gates/suite.ts,
  test/behaviors.json, test/suite-gate.test.ts. Matches instruction exactly.
- Full-phase scope (`git diff --name-status origin/main..6690200`) = exactly
  delivery/work-history/m2-p3.md (A), gates.manifest.json (M), package.json
  (M), src/gates/suite.ts (A), test/behaviors.json (M), test/suite-gate.test.ts
  (A). All on the phase's files-to-touch list or standing pre-authorized
  extras. `git diff origin/main..6690200 -- .github/workflows/gates.yml` is
  EMPTY (CR-M2P3-2 stays closed).
- Fix diff (src/gates/suite.ts): round two replaces
  `point.name === relative(cwd, point.file)` with
  `resolve(cwd, point.name) === point.file`. `resolve` already imported
  from node:path (line 3). Matches arbitration's prescribed remedy exactly.
- test/suite-gate.test.ts diff: adds `scriptForDir` fixture option (needed
  because the absolute path is only known once the scratch dir exists) and
  two new tests: "CR-1410-1 ... (mixed)" and "CR-1410-1 ... (total)", both
  structurally mirroring the existing CR-1306 mixed/total tests but with
  every test file invoked via ABSOLUTE path. CR-1306 tests (lines 623, 653)
  left byte-for-byte in the diff (not touched by round two).
- test/behaviors.json diff: adds exactly two new keys,
  "suite-gate-empty-file-absolute-spelling-mixed" and
  "suite-gate-empty-file-absolute-spelling-total", titles matching the new
  test names exactly. `node -e "Object.keys(require('./test/behaviors.json')).length"`
  = 246 (confirmed).

## Environment

- Default toolchain: node v22.22.2 (/opt/node22/bin), npm 10.9.7. EBADENGINE
  warning present as expected (floor declared >=26).
- Floor toolchain: node v26.6.0 at
  scratchpad/toolchain/node-v26.6.0-linux-x64/bin, per task instruction.
- Working worktree: scratchpad/m2-fanout/m2-p3/rr2-criteria/wt, detached at
  origin/claude/m2-p3-suite-wrapper (verified HEAD 6690200 exactly, clean).
- gh: not checked/used (not needed for this review's scope).

## Gates: default toolchain (v22.22.2)

- `npm ci`: exit 0, only expected EBADENGINE warning.
- `npm run build`: exit 0 (tsc -b + schema copy), `git status --porcelain`
  clean after build (no stray files beyond gitignored .tsbuildinfo).
- `npm test` (bare `node --test "test/**/*.test.ts"`): 240 tests, pass 238,
  fail 0, cancelled 0, skipped 2, todo 0. Wall time ~2m12s (real-clock
  waits, per CLAUDE.md warning 11; ran as background task, full TAP log
  captured). Matches implementer's reported default-toolchain shape
  (2 skips are floor-gated tests).

## Red-witness re-execution: CR-1410-1 (round two), genuine class witness

Both new tests isolated with
`node --test --test-name-pattern "CR-1410-1" test/suite-gate.test.ts`:

- AT HEAD (6690200): both green (`pass 2, fail 0`).
- Swapped `src/gates/suite.ts` for round-one's committed copy
  (`git show 35a9c17:src/gates/suite.ts`, sha256
  `2cd0c3720f49d961b777657f2da34b7b20d15d5af3b698712780b3a4ed4b937f`,
  never `git checkout --`, copied via `cp` per warning 8): BOTH tests RED,
  each `AssertionError: expected 1, actual 0` (wrapper reported exit 0 /
  status green on a dangerous zero-real-test suite -- exactly the silent-
  green defect CR-1410-1 names). `pass 0, fail 2`.
- Restored head's `src/gates/suite.ts` from a `cp`'d backup (never
  `checkout --`), sha256 verified equal to the pre-defang value
  `20334ea305cfa3bcae41854ac048788647236fcffd45fe46af1c970e1e0174c3`,
  `git status --porcelain` clean (no diff at all against the committed
  head): both tests green again (`pass 2, fail 0`).
- Full `test/suite-gate.test.ts` (20 tests) at head, default toolchain:
  pass 20, fail 0 -- includes both CR-1306 (relative) and both CR-1410-1
  (absolute) tests together, all green, confirming no interference and no
  regression on the relative-spelling class.

This satisfies the "two structurally different members" rule: mixed and
total are each independently reddened (not just one member of the pair),
and the reddening is against the actual round-one code, not a synthetic
stand-in.

## CR-1306 (round one) regression check

Tests at lines 623 ("... CR-1306, mixed") and 653 ("... CR-1306, total")
are UNCHANGED text in the round-two diff (confirmed: `git diff 35a9c17..
6690200 -- test/suite-gate.test.ts` shows only additions after line 681,
nothing touched above). Both pass at head, isolated
(`--test-name-pattern "CR-1306"` run together with CR-1410-1 tests above:
4/4 pass) and as part of the full 20-test file run (20/20 pass).

## Criterion 1 (real repo, independent re-execution, both toolchains)

Ran `src/gates/suite.ts` directly against this repo (not via `npm test`
alone), `--base 8439c8846c1b25eb20482f49c41152616144e3c4` (= origin/main),
`--pin-root src --pin-root bin --pin-root test`:

- Default toolchain (v22.22.2): `status green`, `units 240`,
  `reported 240 (pass 238, fail 0, skipped 2, todo 0, did-not-run 0)`,
  `discoveredFiles 14 == reportedFiles 14`, `behaviors: 246 resolve`,
  `mergeBase 8439c8846c1b`. counts.json matches exactly. Evidence:
  scratchpad/.../c1-evidence/{result.json,counts.json}.
- Floor toolchain (v26.6.0, PATH-prefixed so the internal `sh -c npm test`
  child also resolves floor node): background run, see below for result
  once captured.

## Criterion 9 (manual, independent fixture, not the shipped test)

Built a fresh manual scratch fixture (separate from the shipped test
suite, one real passing test, own git init/commit) and invoked
`src/gates/suite.ts` directly with NO `--base` flag:
`suite: error (0 tests reported)` /
`--base was not supplied; the merge-base registry comparison cannot be
performed (M2-C-3)`, exit 21 (nonzero). Confirms criterion 9 independently
of the packaged fixture test.

## Gates: floor toolchain (v26.6.0)

PATH explicitly prefixed with the floor bin dir ahead of the rest of the
original PATH (verified `node --version` = v26.6.0, `npm --version` =
11.18.0 beforehand, matching CLAUDE.md warning 1's discipline).

- `npm ci`: exit 0, ZERO EBADENGINE lines (as expected on floor).
- `npm run build`: exit 0; `git status --porcelain` clean after build.
- `npm test`: 240 tests, pass 239, fail 1, cancelled 0, skipped 0, todo 0.
  Wall time ~165s.

**The one failure**, captured in full:
`test/liveness.test.ts:633` "doctor and the guard return one verdict about
one beacon" -- `AssertionError`, expected pattern
`/^CHECK beacon WARN beacon present but 902s old.../m` but actual output
said "903s old". This is a hardcoded-second real-clock race (CLAUDE.md
warning 11: "suite wall time grows with real-clock lease waits"): the
assertion pins an exact elapsed-seconds string against wall-clock timing
in a long-running suite, and drifted by one second.
`test/liveness.test.ts` is CONFIRMED NOT in this phase's diff
(`git diff --name-only origin/main..6690200 | grep -i liveness` returns
nothing). This matches the task framing exactly ("only-failures are known
real-clock flakes in untouched files") and is not attributable to the
M2-P3 round-two change. Caveat: I did not re-run the suite a second time
to directly witness the same test pass on a re-run (time budget); the
attribution rests on (a) the file being outside the diff, (b) the
assertion shape being a hardcoded wall-clock second count, and (c) this
being the exact class CLAUDE.md's own standing warning names, not on a
repeated-run demonstration of intermittency.
- `test/suite-gate.test.ts` isolated on floor: 20 tests, pass 20, fail 0
  (all CR-1306 and CR-1410-1 tests included).
- Direct gate invocation on floor (`--base` origin/main, `--pin-root src
  --pin-root bin --pin-root test`): `status green`, `units 240`,
  `reported 240 (pass 240, fail 0, skipped 0)`, `discoveredFiles 14 ==
  reportedFiles 14`, `behaviors 246`. This run did NOT hit the liveness
  flake (separate process invocation, further reinforcing intermittency
  rather than a structural regression).
- Both toolchains' direct-gate records: identical `requestedReporter`
  ("tiphys-suite-events-v1"), identical `reporterRequestedVia`, identical
  `discoveredFiles`/`reportedFiles` (14/14), identical `behaviors` (246)
  and `mergeBaseBehaviors` (226). The only difference is `pass`/`skipped`
  split (238/2 on default, 240/0 on floor), which is the pre-existing,
  already-reviewed floor-gated-test skip behavior (unrelated to this
  round's fix, documented since round one), not a new discrepancy.

## Claim grep (independent re-run)

`grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|
recovers|anyway|always|never|no way to' delivery/work-history/m2-p3.md`
returns 31 hits. Spot-checked all round-two-introduced hits (lines around
917, 965, 1098-1101, 1117, 1154, 1196, 1284-1311): each is either restated
as an explicit non-coverage item, backed by an adjacent captured command,
or attributed to a specific named enforcing code path, matching the work
history's own claim-grep section verbatim. No unqualified impossibility
claim found that lacks adjacent evidence.

## Acceptance-criteria regression table (plan section M2-P3, all 11)

All criteria re-executed at head 6690200; none reduced in strength by the
round-two fix. Test names are exact `test/suite-gate.test.ts` titles.

| # | Criterion (abbreviated) | Guarding test / direct check | Result |
|---|---|---|---|
| 1 | Real repo: exit 0, green, units=discovered walk count, mapping identity | "healthy fixture is green with parity counts and equal pins" + my own direct invocation on both toolchains | HOLDS (240/240 floor direct, 240 reported/238 pass+2skip default, arithmetic identity satisfied both) |
| 2 | Pattern-missed file: bare runner 0, wrapper nonzero naming file; corrected pattern green | "names a test file the configured pattern missed and passes once the pattern is corrected" | HOLDS, unchanged by round two (test untouched) |
| 3 | Renamed behavior: bare runner 0, wrapper nonzero naming behavior; restored green | "names a behavior whose test was renamed and passes when the name is restored" | HOLDS, unchanged |
| 4 | Behavior deleted from head registry since merge base: wrapper nonzero naming it | "names a behavior deleted from the head registry since the merge base" | HOLDS, unchanged |
| 5 | Skip w/o reason nonzero; w/ reason exit 0 | "rejects a skip without a reason and accepts one with a reason" | HOLDS, unchanged |
| 6 | Counterfeit summary line changes no count, captured verbatim | "counterfeit summary and event lines printed by a test change no count and are captured verbatim" | HOLDS, unchanged |
| 7 | Truncated stream mid-run is error, not green | "a truncated reporter stream is error, not green"; "a runner exit of zero with a failing stream is error because the authorities disagree" | HOLDS, unchanged |
| 8 | Equal start/end pins; byte-identical rewrite between them is error naming path+mtimeMs | "healthy fixture ... equal pins" (green direction) + "a byte-identical rewrite of a pinned source during the run is error naming the path and mtimeMs" (error direction) | HOLDS, unchanged |
| 9 | No `--base`: error, not not-applicable | "suite gate without --base is error, not not-applicable" + my own independent manual-fixture reproduction (exit 21, exact message) | HOLDS, unchanged, independently reconfirmed |
| 10 | `node --test` exits 0, 0 failing, registry criterion holds | Full `npm test`: 240 tests both toolchains; default 238 pass/2 skip/0 fail; floor 239 pass/1 fail (test/liveness.test.ts, untouched file, real-clock second-count race, see Gates section) / 240 pass/0 fail on a separate direct-gate floor run | HOLDS with a caveat: the one floor `npm test` failure is outside this phase's diff and structurally a real-clock flake (not reproduced on the immediately following direct-gate floor invocation); it is not attributable to round two and does not touch suite-gate.test.ts (20/20 pass both toolchains, both runs) |
| 11 | Reporter pin: names requested reporter; wrong-format stream is error; byte-identical counts + same reporter name both toolchains | "a stream in a different but valid reporter format is error naming expected and observed"; "a test command that produces no reporter stream is error naming the request"; my own both-toolchain direct invocations (identical requestedReporter, discoveredFiles, reportedFiles, behaviors) | HOLDS, unchanged |

## CR-1410-1 fix verification (the round-two subject)

- Mechanism confirmed spelling-invariant: `resolve(cwd, point.name) ===
  point.file` (src/gates/suite.ts, function `isFileWrapperPhantom`),
  matching the arbitration's prescribed remedy exactly, not a
  point-fix of the absolute-path instance alone.
- Derivation published in the work history (four invocation-spelling
  forms measured on both toolchains, plus symlinked-file and
  symlinked-cwd probes) with a table showing `resolve(cwd,name)===file`
  matches in every row while `relative(cwd,file)===name` fails on the
  absolute row. I did not re-run this derivation's raw node-reporter
  probes myself (accepted the captured transcript as evidence); I DID
  independently re-derive its conclusion by reddening/greening the two
  new tests against real (not synthetic) round-one and round-two code.
- Non-coverage disclosed: Windows paths, `..`-segment paths, symlinked
  test-root directories (excluded elsewhere by M2-C-6's real-directory-only
  walk), `--test-name-pattern` filtering. None of these bear on the
  fix's own correctness for the covered spellings.
- Two structurally different red-witness members (mixed, total),
  independently reddened by me against round-one's actual committed code
  (via sha256-verified swap, never `git checkout --`) and confirmed green
  and restored cleanly (git status clean, sha256 identical) afterward.

## Registry and scope (final confirmation)

- `test/behaviors.json`: 246 total keys (`node -e` count, independently
  computed). Round-two delta is a pure addition of exactly 2 keys,
  `suite-gate-empty-file-absolute-spelling-mixed` and `-total`, whose
  values are the exact, verbatim titles of the two new tests (string
  match confirmed by inspection of the diff and the test file).
- Scope: round-two delta `git diff --name-status 35a9c17..6690200` is
  exactly `delivery/work-history/m2-p3.md`, `src/gates/suite.ts`,
  `test/behaviors.json`, `test/suite-gate.test.ts` -- matches instruction
  precisely, and every path is on the phase's files-to-touch list or a
  standing pre-authorized extra.
- `gates.manifest.json` and `package.json`: confirmed BYTE-IDENTICAL
  between 35a9c17 and 6690200 (`git diff` empty on both).
- `.github/workflows/gates.yml`: confirmed empty diff against origin/main
  at head (CR-M2P3-2 stays closed).

## Probes run (including empty-handed ones)

- Searched for any other file changed in the round-two delta beyond the
  four expected: none found (git diff --name-status exact match).
- Searched for any modification to the CR-1306 test bodies in the
  round-two diff: none found (diff shows pure addition after existing
  content).
- Searched for widening of `gates.manifest.json` or `package.json` in the
  round-two window: none found (byte-identical).
- Attempted to reproduce the round-one silent-green defect independently
  (not just trust the work history's transcript): reproduced successfully
  via sha256-verified code swap; confirms the work history's central claim
  first-hand rather than by inspection alone.
- Checked whether `resolve` needed a new import: not needed, already
  imported at src/gates/suite.ts line 3 alongside `relative`.
- Checked for stray uncommitted files or worktree contamination after all
  defang/restore operations: `git status --porcelain` clean throughout.
- Did NOT independently re-run the raw node `--test-reporter` derivation
  probes (four invocation-spelling forms) myself; relied on the captured
  transcript in the work history for that specific sub-claim, corroborated
  indirectly via the red/green test behavior which depends on the same
  underlying node behavior.
- Did NOT re-run the floor `npm test` a second time to directly witness
  the liveness flake's intermittency by repetition (time budget); relied
  on diff-scope exclusion plus assertion-shape reasoning plus the
  immediately following direct-gate floor invocation not reproducing it.

## Honest-failure section

No high or medium finding. No low finding either: the only anomaly
encountered (the one floor `npm test` failure in test/liveness.test.ts)
is outside this phase's scope, structurally a real-clock flake per
CLAUDE.md's own standing warning, and not reproduced on the immediately
following direct-gate floor invocation of the same code. I flag the two
"did not independently re-run" items above as genuine limits of this
review's depth rather than settled facts.

## VERDICT: APPROVE

The round-two fix (CR-1410-1) is genuine, matches the arbitration's
prescribed spelling-invariant mechanism exactly, is backed by a published
derivation with disclosed non-coverage, and is witnessed red against two
structurally different members of the dangerous class and green with the
fix, sha256-restored cleanly. All 11 original M2-P3 acceptance criteria
still hold with no regression. The round-one CR-1306 tests are untouched
and still pass. The behavior registry is a pure +2-key union resolving by
exact title, total 246. Scope is exactly the four expected files, byte-
identical elsewhere, and `.github/workflows/gates.yml` is untouched.
Gates are green on both toolchains for the criteria and scope under
review; the sole test failure observed (floor `npm test`, one liveness
real-clock flake) is in a file outside this phase's diff and did not
reproduce on a second, more targeted floor run.

Findings: none (0 high, 0 medium, 0 low).
