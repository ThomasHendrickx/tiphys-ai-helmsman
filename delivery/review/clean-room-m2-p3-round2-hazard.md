# Clean-room DELTA re-review (hazard lens): M2-P3 fix round one

Subject: branch claude/m2-p3-suite-wrapper at head 35a9c17 (verified current with origin/main)
Prior review: CR-1306 (hazard, Opus), arbitration-m2-p3.md
Contract: second (T-007), find what criteria cannot describe; declared hazard = a measurement that can shrink silently.

## Head / currency
- HEAD = 35a9c1715bef8ec05c1ec6cd979b464415ef0084 (checked out, verified).
- origin/main IS an ancestor of HEAD; no commits in origin/main missing from HEAD. Current.
- merge-base with origin/main = 8439c88.

## Gates (floor toolchain v26.6.0, npm 11.18.0)
- npm ci exit 0, no EBADENGINE line.
- npm run build exit 0; git status --porcelain clean after build.
- phase suite test/suite-gate.test.ts: 18 tests, 18 pass, 0 fail (floor).
- phase suite (default toolchain v22.22.2): 18 tests, 18 pass, 0 fail.

## Scope audit: PASS
- Changed files vs origin/main: delivery/work-history/m2-p3.md, gates.manifest.json,
  package.json, src/gates/suite.ts, test/behaviors.json, test/suite-gate.test.ts.
- filesToTouch (m2-p3.json) = suite.ts, suite-gate.test.ts, package.json, gates.manifest.json, behaviors.json.
  Plus standing extras (work-history). All within scope.
- .github/workflows/gates.yml: git diff origin/main..HEAD EMPTY. Redundant --only edit DROPPED. CR-M2P3-2 closed.

## Fix verification (CR-1306)
- Filter isFileWrapperPhantom(point, cwd) = entityType==="test" && nesting===0 && name===relative(cwd,file).
- Applied ONCE at suite.ts:928, filtering stream.points -> points, BEFORE all three counting sites:
  bucketPoints (945), reportedFiles set (987-993), reportedTestNames set (1013-1017). Mechanism-level: one filter feeds all three.
- False comment at pristine 335-337 corrected in place (now 335-344).
- Two new tests, structurally different members (mixed: one empty among reals; total: all empty + empty registry).
  Both assert bareRunner(dir)==0 (dangerous green at runner) and gate red. Red-witness defang recorded in work history
  (lines 764-782): both fail "not ok" with fix removed, pass with fix. Strong form (red against dangerous state).

## Independent node measurement (floor v26.6.0, pinned reporter)
Phantom name spelling by invocation form, and whether the filter (name===relative(cwd,file)) catches it:
- empty.test.ts via relative glob "test/**/*.test.ts" (SUBJECT's actual script): name="test/empty.test.ts" -> MATCH -> caught. SAFE.
- empty.test.ts via bare `node --test` (auto-discovery): name relative -> MATCH -> caught. SAFE.
- empty.test.ts via ./-prefixed path: node normalizes -> name relative -> caught. SAFE.
- empty.test.ts via ABSOLUTE path: name=absolute, relative(cwd,file)=relative -> NO MATCH -> NOT caught. SLIP-PAST (see finding).
- directory arg `node --test test/`: exits 1 (safe, gate cross-checks exit).
- empty describe() file: entityType "suite", already excluded; no phantom emitted; file absent from reportedFiles -> discovery-parity red. SAFE.
- real test named exactly "test/named.test.ts": indistinguishable from phantom -> over-removed (documented residual, false-RED direction).

## Findings (see final message for full detail)
- CR-1410-1 (LOW/MEDIUM, hazard): absolute-path invocation slip-past. Latent for subject (script is relative).

## Red-witness independently reproduced
- Neutralized the filter in suite.ts (filter -> `true || ...`), ran the two CR-1306 tests on floor:
  both FAIL (mixed and total). Restored suite.ts exactly (git diff empty). Strong red-witness confirmed
  independently of the work history's recorded defang.

## M2-P1 integration (still holds at 35a9c17)
- GateResult: suite.ts imports makeGateResult/renderGateResult/exitCodeForStatus/EXIT_GATE_ERROR from result.ts; M2-C-2 vacuous rewrite present in result.ts.
- Pin: {sha256, size, mtimeMs, ctimeMs} + file identity (five-field, ctimeMs present); comparePins/takePin/describePinDifference used; fix did not touch pin.
- C-1: counts derive from parseSuiteStream(points) + childExit cross-check only (suite.ts:945-984); no summary/diagnostic line read.

## FINDING CR-1410-1 (MEDIUM, hazard): absolute-path invocation defeats the phantom filter (silent green returns)
- Mechanism: the fix discriminates the phantom by name===relative(cwd,file). node names the file-wrapper
  phantom by the file's path AS INVOKED. Under an absolute-path test invocation node names it the ABSOLUTE
  path, so relative(cwd,file) != name, the filter misses it, it is counted as a real test, and (measured)
  discovery parity also passes because the walk's discovered set is absolute too. Nothing catches it: silent
  green over a zero-test file, i.e. the exact CR-1306 defect and the phase's own declared hazard.
- Evidence: scratchpad/attack/measure4.sh output: `node --test /abs/.../test/empty.test.ts` -> phantom
  name = absolute path; relative(cwd,file)="test/empty.test.ts"; MATCH_relative=false. measure3/measure5:
  relative glob (the SUBJECT's script), bare `node --test`, and ./-prefixed forms all name it relatively -> caught.
- Latent for THIS subject: package.json scripts.test = `node --test "test/**/*.test.ts"` (relative), so the
  fix is complete and correct for the subject; criterion 1 = 238 unaffected. But the gate reads the target
  repo's verbatim script and the kernel is built to run on other repos; an absolute-path script reintroduces the hazard.
- Contract basis (independent of scope judgment): the work history's stated mechanism ("the phantom's name is
  the file's path AS INVOKED", line 709) is strictly broader than what it implemented (relative spelling only),
  and its non-coverage disclosures (call-site grep scope; over-removal residual) do NOT state this dangerous-
  direction slip-past. Fix-round contract item 3 requires stating what the derivation did not cover; this is undisclosed.
- Remedy (small; `resolve` already imported at suite.ts:3): discriminate by a spelling-invariant property,
  e.g. `resolve(cwd, point.name) === point.file` (catches both relative and absolute name spellings), OR at
  minimum document the absolute-path slip-past as declared non-coverage with a reason.

## Criterion 1 (real kernel count)
- Work history recorded: gate against repo --base 8439c88 -> 238 reported, 237 pass, 1 fail (known
  test/liveness.test.ts real-clock flake), discoveredFiles==reportedFiles==14, behaviors 244, mergeBaseBehaviors 226.
- My independent gate run against the repo (floor, --base 8439c88) was still completing under heavy container
  load; witnessed mid-run stream 203 lines / on track, consistent. Count corroborated (unchanged by the fix,
  since the repo has zero empty .test.ts files so points === stream.points here).

## VERDICT: FIX-ROUND-NEEDED
- CR-1306 relative-form instance CLOSED at the mechanism for the subject; two new tests red-witnessed (reproduced independently).
- CR-M2P3-2 (gates.yml) CLOSED (empty diff). CR-M2P3-1 (count correction) folded into the 238 re-verification.
- One MEDIUM (CR-1410-1): absolute-path invocation defeats the phantom filter (silent green), the same declared
  hazard, undisclosed as non-coverage. Latent for the subject. Remedy small (resolve-based invariant) or, if
  consuming-repo invocation variance is judged out of M2-P3 scope, disclose it as declared non-coverage.

