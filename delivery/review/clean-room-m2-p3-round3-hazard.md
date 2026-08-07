# CLEAN-ROOM DELTA re-review (hazard) - M2-P3 fix round TWO

Subject: branch claude/m2-p3-suite-wrapper @ 6690200
Reviewer lens: hazard (delta re-review of fix round two)
Finding verified closed: CR-1410-1 (medium, from round-two hazard delta CR-1410 / arbitration-m2-p3-round2)
Contract: second (T-007) - find what criteria cannot describe; declared hazard = a measurement that can shrink silently.

## VERDICT: APPROVE

No high or medium finding. CR-1410-1 is closed AT THE MECHANISM
(spelling-invariant identity, not the absolute-path instance), verified
green across every invocation spelling I could construct. Strong red-witness
reproduced independently for both structurally different members. No
over-removal regression. All three gates green on both toolchains. Scope clean.

## Head / currency
- HEAD = 66902001df6a52decd737992d2d6f7c44d75f66b (checked out detached, verified;
  branch tip via `git ls-remote` = 6690200, matches).
- origin/main = 8439c8846c1b25eb20482f49c41152616144e3c4 IS an ancestor of HEAD
  (`git merge-base --is-ancestor` exit 0). Current.

## Scope audit: PASS
- Changed vs round one (35a9c17): delivery/work-history/m2-p3.md, src/gates/suite.ts,
  test/behaviors.json, test/suite-gate.test.ts. EXACTLY the four expected.
- Changed vs origin/main additionally: gates.manifest.json, package.json (both
  carried verbatim from round one; `git diff 35a9c17..HEAD` empty for both).
- `.github/workflows/gates.yml`: `git diff 8439c88 6690200 -- gates.yml` EMPTY. CR-M2P3-2 stays closed.
- ASCII pure (grep -rP '[^\x00-\x7F]' clean); zero em dashes in changed authored files.

## The fix (diff vs round one)
Single behavioral line in `isFileWrapperPhantom` (suite.ts:407):
  round one: `point.name === relative(cwd, point.file)`
  round two: `resolve(cwd, point.name) === point.file`
Plus comment updates (CR-1410-1 derivation). `resolve` already imported (line 3);
`relative` still used in findings messages.

## Mechanism closure (CR-1410-1)
The mechanism is: round one compared two SPELLING-DEPENDENT strings
(`point.name` as-invoked vs `relative(cwd,file)` unconditionally relative), so it
held only for relative-spelled invocations. The fix compares two REPRESENTATIONS
OF THE SAME FILE: `resolve(cwd, name)` normalizes any spelling to the absolute
form that `point.file` already is. Correctness rests on `point.file` always being
absolute -- MEASURED true in every spelling (see attack table).

## Independent measurement (floor v26.6.0), per-spelling
Zero-test file, reporter mirrors suite.ts (name/file/nesting/entityType).
Column NEW = `resolve(cwd,name)===file` (the fix); OLD = round-one compare.

| invocation spelling | name | file | NEW caught | OLD caught |
|---|---|---|---|---|
| relative glob (subject's own script) | relative | absolute | YES | YES |
| ABSOLUTE path (CR-1410-1 defect) | absolute | absolute | **YES** | **NO** |
| ./-prefixed | relative (node strips ./) | absolute | YES | YES |
| .. segments (test/../test/empty.test.ts) | relative (node collapses ..) | absolute | YES | YES |
| bare auto-discovery | relative | absolute | YES | YES |
| symlinked FILE, relative invoke | relative | absolute (symlink path, not realpath) | YES | (n/a) |
| symlinked FILE, absolute invoke | absolute | absolute (symlink path) | YES | (n/a) |
| symlinked DIRECTORY, relative invoke | relative | absolute | YES | YES |

Key facts observed: `data.file` is ALWAYS absolute; `data.name` is the path
as-invoked; node keeps name and file in a CONSISTENT symlink state (neither
realpath'd), so `resolve(cwd,name)` reconciles to `file` in every case. The exact
absolute-path spelling that defeated round one (OLD=NO) is now caught (NEW=YES).

Note on the work history's non-coverage list: it conservatively marked `..`
segments as "not measured this round, open question." I measured it: CAUGHT.
That is the claim-grep discipline working (honest under-claim), not a defect.
It also marked Windows paths as unmeasured (POSIX-only container - correct
pre-existing wider non-coverage) and symlinked directories as out of
walkTestFiles' reach; my symlinked-dir invocation was also caught by the filter.

## Over-removal regression check: NONE (fail-safe)
- Normal multi-test file (two ordinary test names): NEW caught = false for both
  points. Unaffected. No over-removal.
- Self-named test (name == its own file path): NEW caught = true, i.e. removed,
  which then surfaces as discovery-parity RED ("discovered by the walk but absent
  from the reporter"). This is the documented false-RED residual: fails SAFE,
  never a silent green. Direction unchanged from round one.
- OBSERVATION (nit, non-blocking): the new comparison broadens the over-removal
  SET slightly - any real test name that RESOLVES to its file path (absolute
  spelling, ./-prefixed, ..-collapsed) is now over-removed, where round one
  over-removed only the exact relative spelling. Direction stays fail-safe
  (false-RED, never silent green) and such a self-naming test is more contrived
  than round one's residual, so this is not a defect. Worth a one-line note in
  the work history if the phase is revisited; does not block merge.

## Red-witness, independently reproduced (strong form, two members)
- Backed up fixed suite.ts (sha256 20334ea3..., matches work history's stated
  fixed hash), reverted the one line to round-one compare in place.
- `node --test-name-pattern CR-1410-1 --test test/suite-gate.test.ts` (floor):
  tests 2, pass 0, fail 2. BOTH members (mixed + total) RED against the dangerous
  state (bareRunner exit 0, i.e. genuine green over zero real tests).
- Restored from backup (sha256 identical; `git status --porcelain` empty).
- Fixed: same two tests pass 2, fail 0. GREEN with fix.
Two structurally different members of the ABSOLUTE-spelling class reddened.

## Criterion 1 (real kernel count): UNCHANGED shape, = 240
Delivered gate against the repo, floor toolchain, --base 8439c88, PATH-prefixed:
  suite: green (240 tests reported); reported 240 from 14 file(s); discovered 14
  walking test for .test.ts; 246 behavior(s) resolve; merge base 8439c88.
counts.json: reported 240, pass 234, fail 0, skipped 6, todo 0, didNotRun 0,
discoveredFiles 14 == reportedFiles 14, behaviors 246, mergeBaseBehaviors 226,
findings []. discovered/reported file lists identical. 240 = round one's 238 + 2
new tests; 246 = 244 + 2 new behaviors. Discovery + registry parity hold.
(6 skips here vs the work history's floor run of 0 skips is an environmental skip
difference, not a failure; identity pass+skip = 234+6 = 240 = reported.)

## M2-P1 integration: intact
suite.ts still imports makeGateResult/renderGateResult/exitCodeForStatus/
EXIT_GATE_ERROR from result.ts and comparePins/describePinDifference/takePin from
pin.ts; comparePins used at suite.ts:952. The round-two diff is the single filter
line plus comments, so integration is unchanged from the round-one head the prior
hazard review confirmed.

## Gates, both toolchains
- Floor v26.6.0 (npm 11.18.0): npm ci exit 0 (no EBADENGINE); npm run build exit 0;
  git status --porcelain clean after build; phase suite test/suite-gate.test.ts
  20 pass 0 fail; full suite via gate 240 reported 0 fail.
- Default v22.22.2: phase suite 20 pass 0 fail 0 skipped.
- Full-suite failures: ZERO in the gate run this session (the known liveness
  real-clock flake in the untouched test/liveness.test.ts did not fire).

## Findings by severity
- HIGH: none.
- MEDIUM: none. CR-1410-1 closed at the mechanism.
- LOW / nit (non-blocking): the over-removal false-RED set is slightly broadened
  by resolve() vs relative(); direction remains fail-safe. Optional work-history note.
