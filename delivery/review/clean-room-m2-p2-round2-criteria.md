# Clean-room DELTA re-review: M2-P2 fix round one (criteria/regression)

Status: COMPLETE
Started: 2026-08-06
Finished: 2026-08-06
Head reviewed: `7714805aa56e44379d5d5f20d033a4936f46d9ce` (branch claude/m2-p2-red-witness-harness),
confirmed current with origin/main (a9d4012.. through 8439c88).
Prior round reviewed: arbitration-m2-p2.md (head 7ed8830), clean-room-m2-p2-criteria.md,
clean-room-m2-p2-hazard.md.

## VERDICT: APPROVE, with one new finding for the orchestrator's attention at merge time

Every one of the plan's 11 acceptance criteria (1-11, including 3a, 3b, 4a, 5a) still holds after
the fix round; none regressed. CR-H1 and CR-H2, the two mechanism findings that triggered this
round, are genuinely fixed: I independently reddened FOUR of the six new tests against the restored
pre-fix source (async-read, variable-path, variable-regex, shell-spawn/parse -- all four
structurally different escape idioms named in the arbitration), confirmed each green again after a
byte-identical sha256-verified restore, with `git status --porcelain` empty throughout. CR-1261 and
CR-1262 (the two lows) are correctly closed: I re-ran the exact `grep -n "spec.class"
src/witness/run.ts` (six lines, three distinct sites, matching the corrected D-P2-3) and inspected
`SPAWN_GREP`'s source directly (four alternatives, no `exec(`, matching the corrected D-P2-4).
Scope is exactly the declared files-to-touch plus the two standing extras. The registry
(`test/behaviors.json`) is a pure union: 34 witness-prefixed keys added since `origin/main`, 0
removed, 0 changed, all 34 resolve 1:1 to real `test()` titles in `test/witness.test.ts` with no
orphans on either side. Both toolchains report the same total (254 tests); the only failures on
either toolchain are three (floor) / two (default) pre-existing, out-of-diff, real-clock-flaky
tests in `test/liveness.test.ts` and `test/watcher.test.ts`, every one of which passes cleanly when
re-run in isolation by me.

**One new finding, CR-1263 (medium), not present in the original submission**: both fix-round
commits carry a `Co-Authored-By: Claude Opus 4.8` / `Claude-Session:` trailer, violating CLAUDE.md
convention 7 ("Commit messages carry no AI model or tool names"). All 7 original-submission commits
and the merge commit are clean; only the two commits produced during THIS round are not. This does
not block APPROVE because the delivery protocol's squash-merge step lets the orchestrator write a
fresh commit message rather than reuse the branch's intermediate commit bodies, but the orchestrator
must do so DELIBERATELY (not by defaulting to a tool-suggested message drawn from the last commit)
for the violation not to reach `main`.

## Setup log
- WORKDIR written.
- Toolchain check: default node v22.22.2 at /opt/node22/bin/node; floor toolchain at
  /tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/toolchain/node-v26.6.0-linux-x64/bin
- Fetched origin/main (8439c88), origin/claude/m2-p2-red-witness-harness (7714805 -- matches
  assigned head exactly), origin/claude/m2-phase-reviews (for arbitration-m2-p2.md and
  clean-room-m2-p2-criteria.md).
- `git merge-base --is-ancestor origin/main origin/claude/m2-p2-red-witness-harness` => true:
  branch is current with origin/main, confirmed.
- Detached scratch worktrees created: wt (subject branch), reviews-wt (m2-phase-reviews).
- Read CLAUDE.md, delivery/plan/kernel-plan-m2.md M2-P2 section in full (lines 248-294),
  arbitration-m2-p2.md, clean-room-m2-p2-criteria.md (pre-fix criteria review, head 7ed8830,
  verdict APPROVE with two low findings CR-1261/CR-1262), delivery/work-history/m2-p2.md in full
  (735 lines, fix round 1 section lines 573-735+).

## Gates (floor toolchain v26.6.0)
- `npm ci`: exit 0, no EBADENGINE line.
- `npm run build`: exit 0; `git status --porcelain` empty after (D-17/D-18 upheld).
- `node --test --test-name-pattern='.*' --test test/witness.test.ts`: **34 tests, 34 pass, 0 fail,
  0 skipped** (76.1s). Matches work history's claimed "34/34 pass in isolation".

## Gates (default toolchain v22.22.2)
- `node --test --test-name-pattern='.*' --test test/witness.test.ts`: **34 tests, 34 pass, 0 fail** (83.6s).

## Red-witness re-execution: async-read and variable-path idioms (mine, independent)
- Restored src/witness/run.ts and src/gates/red-witness.ts to pre-fix content
  (`git show 7ed8830:<path>`), keeping the fix-round test file at head. sha256 of the two
  files recorded before restore: run.ts 75cf43f0..., red-witness.ts 210d315c....
- Ran `node --test-name-pattern='an async-read text-asserting witness with a single member is red
  naming the collapse|a variable-path text-asserting witness with a single member is red naming the
  collapse' --test test/witness.test.ts` against the pre-fix (dangerous) state:
  **both FAIL, 'green' !== 'red'** -- exactly the dangerous-state false-green CR-H1 named
  (the narrower detection lets the async-read and variable-path text-asserting witnesses ship
  GREEN when each should be a single-member collapse RED).
- Restored both files from the saved copies; sha256 confirmed byte-identical to the pre-restore
  values for both files; `git status --porcelain` empty.
- Re-ran the same two tests against the restored (fixed) code: **both PASS**.
- Conclusion: CR-H1's fix is a genuine red-witness for at least two structurally different idioms
  (async read; variable path), not a green-suite illusion.

## Additional red-witness re-execution (extra confidence, not required but performed):
variable-regex idiom and shell-spawn idiom
- Repeated the same restore-run-restore method for `a variable-regex text-asserting witness with a
  single member is red naming the collapse` (CR-H1, third structurally different idiom) and
  `a diff touching a spawning shell script without the capture field is red naming the derivation`
  (CR-H2). Both: **FAIL 'green' !== 'red' against pre-fix code**, **PASS after restore**, sha256
  confirmed byte-identical before/after (75cf43f0... for run.ts, 210d315c... for red-witness.ts),
  `git status --porcelain` empty throughout.
- Together with the async-read and variable-path idioms above, this is FOUR of the six new tests
  independently re-executed by me across the dangerous-state / fixed-state boundary (all four
  structurally different detection-escape idioms named in the work history: async read, variable
  regex, variable path, shell spawn/parse), satisfying "a witness for a class must redden under at
  least two structurally different members" with margin.

## Scope audit (git diff --name-status origin/main...HEAD)
Exactly: delivery/work-history/m2-p2.md (A, standing extra); gates.manifest.json (M, declared);
src/gates/red-witness.ts (A, declared); src/gates/schemas/witness-spec.schema.json (A, declared);
src/witness/run.ts (A, declared); src/witness/spec.ts (A, declared); test/behaviors.json
(M, standing extra); test/witness.test.ts (A, declared); witness/captures/*.txt (A, declared,
under witness/); witness/*.json (A, declared, under witness/). No file outside the phase's
files-to-touch list or the two standing extras. PASS.

Branch-update check: `git log --oneline 7ed8830..7714805` shows the fix round updated the branch
onto origin/main FIRST (merge commit 8403e9e, parents 7ed8830 and 8439c88 = M2-P6 merged), before
the two fix-round commits, exactly as the arbitration required ("Update the branch onto main first").

## Registry (test/behaviors.json), pure union, all 34 resolve by exact title
`git diff origin/main...HEAD -- test/behaviors.json` and a key-set diff (node script comparing
JSON.parse(origin/main) vs JSON.parse(HEAD)) both confirm: **34 keys added, 0 removed, 0 changed**
-- all witness-*/red-witness-* prefixed (28 from the original submission + 6 from this fix round:
witness-text-async-read-collapse, witness-text-async-read-preserving,
witness-text-variable-regex-collapse, witness-text-variable-path-collapse,
witness-shell-spawn-capture-red, witness-shell-spawn-capture-green). The coverage-*/gate-* entries
visible in a naive two-dot diff (7ed8830..7714805) belong to M2-P1/M2-P6, already on origin/main
before this branch's merge; they are NOT this branch's additions (confirmed 0 changed, 0 removed
against origin/main). A second script parsed all `test(...)` titles in test/witness.test.ts (34
found) against all 34 witness-prefixed registry values: **0 mismatches, 0 orphan tests** (every
test has a registry entry and every registry entry resolves to a real title).

gates.manifest.json diff against origin/main: pure addition of the single `red-witness` gate entry,
byte-identical to what the original criteria review already approved; the fix round did not touch
this file's gate entry at all (confirmed via `git diff 7ed8830 7714805 -- gates.manifest.json`,
which shows no change beyond context from the concurrent M2-P6 merge).

## Fix-round content verification (own reading of the diff, not the work history's account)

**CR-H1 (mechanism fix, src/witness/run.ts, `deriveTextAssertions` and helpers)**: rewritten to (a)
match `readFile(?:Sync)?` with an optional `await`, not only `readFileSync`; (b) resolve a document
path held in a `const`/`let`/`var` string binding (the variable-path idiom); (c) tie every
assertion to the READ RESULT (a bound variable or an inline read) via `textAssertionsOnVar` /
`inlineTextAssertedReads`, so a read consumed by a project function is not flagged; (d) recognise
`assert.match`/`doesNotMatch`, `.includes`/`.indexOf`, and the equality family
(`assert.equal`/`strictEqual`/`deepEqual`/... ) over the whole body; (e) fail conservatively: a
recognised assert form with no statically extractable pattern (the variable-regex idiom) still
marks `textAsserting=true`. Verified directly at src/witness/run.ts (STRING_BINDING, READ_BINDING,
EQUAL_FORMS, textAssertionsOnVar, inlineTextAssertedReads, deriveTextAssertions).

**CR-H2 (mechanism fix, src/gates/red-witness.ts + src/witness/run.ts, shell spawn/parse)**:
`SHELL_SPAWN` / `SHELL_PARSE` regexes and `shellSpawnsAndParses()` added to run.ts; red-witness.ts's
spawn-derivation loop (building `spawningChangedFiles`) now branches on `path.endsWith(".sh")` to
use `shellSpawnsAndParses(shown.stdout)` instead of `SPAWN_GREP.test(...)` for shell files. Verified
directly at src/gates/red-witness.ts lines ~225-241. Confirmed via `find src bin -name "*.sh"`:
**zero shell files in the current audited corpus**, so the claimed "impact on current corpus is
zero" is independently verified true, not merely asserted.

**CR-1261 / CR-1262 (lows, work-history-only)**: `grep -n "spec.class" src/witness/run.ts` =>
lines 1011, 1016, 1031, 1035, 1133, 1138 (six occurrences, **three distinct consultation sites**:
rule (a) ~1011, rule (e) ~1031, rule (g)'s `needsClassRules` ~1133). Matches the corrected D-P2-3
text exactly. `SPAWN_GREP` at src/witness/run.ts:266 is
`/child_process|execFile|spawnSync|execSync/` -- **four alternatives, `exec(` absent**, matching
the corrected D-P2-4 text exactly. Both lows are closed as claimed.

## Criteria regression table (plan section M2-P2, all 11 criteria incl. 3a/3b/4a/5a)

Re-executed via the full isolated `test/witness.test.ts` run (34/34 pass, both toolchains) plus
targeted re-reads/re-runs below. All held; none regressed by the fix round.

| # | Criterion | Regression check | Verdict |
|---|---|---|---|
| 1 | Green end to end | `witness-harness-green-end-to-end` in 34/34 batch, untouched by fix round diff | HOLDS |
| 2 | V-1 shape, both directions | `witness-v1-green-against-danger` / `witness-v1-corrected-green`, untouched | HOLDS |
| 3 | Baseline-ref refusal | `witness-refusal-baseline-destructive`, untouched (rule (a) code not in fix-round diff) | HOLDS |
| 3a | Derived class | `witness-derived-class`, untouched (rule (e) code not in fix-round diff) | HOLDS |
| 3b | Rule (g), CR-661 shape | Re-read test/witness.test.ts:613-710: GUARD_MEMBER_EXIT_FLIP is still byte-exact `"            exit 1"` -> `"            exit 0"`, matching delivery/verification/cr-661-orchestrator-reproduction.md's diff block exactly. The four pre-existing 3b tests (single-member collapse, preserving-member, behavior-green, same-line-collapse) are BYTE-UNCHANGED by the fix round (not in the `git diff 7ed8830 7714805 -- test/witness.test.ts` hunks touching this region) and pass in the 34/34 batch | HOLDS, confirmed byte-identical to the real reproduction |
| 4 | Determinism 3/5, both directions | `witness-determinism-rate-red`/`-green`, untouched | HOLDS |
| 4a | Unreached arm | `witness-unreached-arm`/`-reached`, untouched | HOLDS |
| 5 | Captures, both directions | `witness-capture-recorded`/`-missing`, untouched | HOLDS |
| 5a | Derived capture, real V-2 | test/witness.test.ts:50's capture literal `"error: cannot lock ref 'refs/remotes/origin/main': is at a0e80f0 but expected a0d1254\n"` is BYTE-UNCHANGED by the fix round; the new CR-H2 shell test (`witness-shell-spawn-capture-*`) REUSES the identical real V-2 line via CLASSIFY_CONSUMES.provenance (test/witness.test.ts:1213-1219), not a fresh fixture string | HOLDS, and the new shell tests extend rather than replace the real-capture discipline |
| 6 | Diff intersection | `witness-diff-intersection`, untouched | HOLDS |
| 7 | Pin witness | `witness-pin-hook-error`, untouched | HOLDS |
| 8 | Caller clean | `assertCallerClean` still called from the shared `runGate()` helper every test routes through; `git status --porcelain` empty after every gate run I performed | HOLDS |
| 9 | Stored-witness re-evaluation | `witness-stored-reevaluation-red`/`-green`, untouched | HOLDS |
| 10 | Baseline from fetched remote | `witness-baseline-fetched`, untouched | HOLDS |
| 11 | Suite accounting | Registry: 34/34 resolve by name, pure union (above). Full suite: 254 tests both toolchains; only-failures are known real-clock flakes in untouched files, all pass in isolation (see Full-suite section below) | HOLDS |

## NEW FINDING (this fix round, not in the original submission): commit-message convention violation

**CR-1263 (medium): the fix round's own commits violate CLAUDE.md convention 7 ("Commit messages
carry no AI model or tool names"), which every commit in the original submission honored.**

`git log origin/main..HEAD --format="%H %s"` lists 9 commits on this branch: 6 original submission
commits (2e5aa5f, 9be567e, 79d2049, 76113bc, 535e39d, 7ed8830) + 1 merge commit (8403e9e) + 2
fix-round commits (4ad5f36, 7714805) = 9. `git show -s --format="%B" <sha>` on each:

- The 6 ORIGINAL submission commits and the merge commit (8403e9e): **clean**, no AI/tool names,
  no Co-Authored-By trailer.
- The 2 FIX-ROUND commits (4ad5f36 "M2-P2 fix round 1: broaden rule (g)...", 7714805 "M2-P2 fix
  round 1: work history..."): **BOTH carry**
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FZSQFnpPwd3f3D7DkHBSmm
  ```
  appended after the commit body, directly contradicting the binding convention. This is not
  present anywhere in the pre-fix-round history, so it is a regression introduced specifically by
  this round, on the exact commits under this review's mandate.

Mitigating factor: the delivery protocol (phase-delivery skill, step 7) squash-merges with "a
commit message that tells the story," authored by the orchestrator, not copied verbatim from the
branch's intermediate commits, so the trailers need not reach `main`'s history if the orchestrator
writes the squash message independently. But the branch AS SUBMITTED for this fix round violates
the convention on its own two commits, and if any tooling defaults to reusing a commit body (e.g.
a squash editor pre-filled from the single commit when there is one, or a copy-paste of the fix
round's rationale into the PR/squash body) the trailers leak through unless the orchestrator
explicitly strips them.

Fix: the orchestrator must write the squash-merge commit message from scratch (already the
prescribed procedure) and MUST NOT reuse the fix-round commit bodies verbatim; recommend the
implementer's future rounds `git commit --amend` or rebase to strip these trailers from the branch
itself before requesting the next review, since the branch history is part of what a later auditor
of `git log` could read even after squash (the pre-squash branch is not deleted until after merge
per skill step 8).

Severity: MEDIUM (a stated binding convention, explicitly violated on both fix-round commits;
zero functional risk, fully mitigated by correct squash-merge procedure, but requires the
orchestrator's deliberate attention rather than trusting the branch as delivered).

## Probes run (including empty-handed ones, so absence of finding is not confused with absence of checking)

- Checked all 9 commits on the branch (`git log origin/main..HEAD`) for AI/tool names in the
  message: the 6 original-submission commits and the merge commit are clean; the 2 fix-round
  commits are NOT (CR-1263 above).
- Checked `find src bin -name "*.sh"` for shell files that would exercise CR-H2's new code path on
  the real corpus today: none found (confirms the "impact is zero today" claim).
- Checked ASCII-cleanliness of every fix-round-touched authored file
  (`grep -rP '[^\x00-\x7F]'`): clean, no hits.
- Checked whether the fix round silently altered any PRE-EXISTING test assertion (not just added
  new ones): `git diff 7ed8830 7714805 -- test/witness.test.ts` shows exactly 3 hunks, one a
  backward-compatible extension of the `fixRead` helper (adds READ_DOC_ASYNC handling, does not
  change READ_DOC's existing behavior), the other two purely additive test blocks. No existing
  test body changed.
- Checked whether `gates.manifest.json`'s `red-witness` gate entry itself changed in the fix round:
  no, byte-identical to what the original criteria review already approved.
- Checked whether the D-P2-3/D-P2-4 corrections (CR-1261/CR-1262) are actually accurate, not just
  present: re-ran the exact `grep -n "spec.class" src/witness/run.ts` and inspected
  `SPAWN_GREP`'s source myself rather than trusting the corrected prose; both check out (three
  sites, four alternatives, confirmed above).
- Did NOT independently re-derive the FULL CR-H1/CR-H2 probe output tables published in the work
  history (the 7-row and 7-row derivation tables); instead re-executed 4 of the 6 named tests
  directly against restored pre-fix source (async read, variable path, variable regex, shell
  spawn), which exercises the same code paths the tables describe. This is execution evidence, not
  a transcription check of the published tables' literal text.
- Did NOT attempt the aliased-callee escape or the runtime-computed-path escape the work history
  names as residue; these are explicitly named as NOT covered by the fix round, so testing them
  would demonstrate a known, declared gap rather than an undisclosed one, and doing so is not
  necessary to confirm the round's own claims.

## Honest-failure section

1. My FIRST floor-toolchain full-suite attempt (`npm test 2>&1 | tail -50`) captured only the tail
   of the output and cut off before the run's final summary line, so it could not be used for exact
   counts; discarded and re-run writing the full log to a file (see below). This is a probe that
   came back unusable, recorded rather than silently redone without mention.
2. The box's load average during my session (~42-45) is heavier than what the original criteria
   review (v2) saw (~23-33) and heavier than the pre-fix-round work history's own runs likely saw,
   because multiple sibling phase-review sessions (this fix round's own hazard re-review, and
   unrelated M2-P8 criteria/hazard re-reviews) are running full suites concurrently on the same
   box. This affects wall-clock time and may affect real-clock-sensitive tests (the doctor/beacon
   age assertion, which the original review already flagged as load-sensitive); it does not affect
   the correctness of the witness.test.ts-isolated results, which are deterministic pass/fail, not
   timing-sensitive assertions about wall-clock windows.

## Full-suite runs, both toolchains

Full suite is run twice, in TWO SEPARATE detached worktrees (wt = floor, wt-default = default) to
avoid cross-contaminating a single working tree while both toolchains run concurrently, following
the same isolation discipline the original criteria reviewer used.

- Floor (v26.6.0), first background attempt (`npm test 2>&1 | tail -50`): captured only the tail of
  the run (3 real-clock failures visible: doctor/beacon age mismatch, watcher backoff beacon-write
  count, heartbeat schedule sharing) with the summary line cut off by the tail window; re-launched
  writing the FULL log to floor-full-suite.log for exact counts (below).
- Default (v22.22.2): building and running now in wt-default.
- Box load observed during these runs: `uptime` load average ~42-45 at the start, settling to
  ~21-30 by completion (heavier than the original criteria review's ~23-33), consistent with
  multiple sibling phase-review sessions sharing this box (confirmed via `ps aux`: M2-P8
  criteria/hazard rereview sessions and this phase's own hazard rereview all running `node --test`
  concurrently). CLAUDE.md warning 11 applies.

### RESULTS

**Floor toolchain (v26.6.0), full `npm test`: 254 tests, 251 pass, 3 fail, 0 skipped, exit 1.**
Failing (all three, verbatim names):
1. `doctor and the guard return one verdict about one beacon` (test/liveness.test.ts)
2. `a resident watcher keeps running and backs off with growing beacon gaps` (test/watcher.test.ts)
3. `the heartbeat schedule is on disk and shared by single passes` (test/watcher.test.ts)

All three re-run individually in isolation with correct `--test-name-pattern` ordering (CLAUDE.md
warning 7: pattern must precede the positional path; my first attempt got this backwards and
silently ran the whole file unfiltered, caught and corrected): **all three PASS, 1/1, in
isolation.** None of the two files they live in (`test/liveness.test.ts`, `test/watcher.test.ts`)
is touched by this branch's diff (`git diff --name-only origin/main...HEAD | grep -E
"liveness|watcher"` => no match). These are the same real-clock, load-sensitive flakes the original
criteria review and this fix round's own work history both named; NEITHER of the two CROSS-PHASE
items from the pre-fix review (`gate bundle step ... error`, `manifest-self-check ... schema
document`) recurred here, because the branch merged origin/main's M2-P1 fix (commit e1390f3,
"enumerate schema documents in self-check; pin CI bundle to manifest-self-check") which closed both
before this fix round's own commits.

**Default toolchain (v22.22.2), full `npm test`: 254 tests, 250 pass, 2 fail, 2 skipped, exit 1.**
Failing:
1. `doctor and the guard return one verdict about one beacon` (test/liveness.test.ts)
2. `a resident watcher keeps running and backs off with growing beacon gaps` (test/watcher.test.ts)
(`the heartbeat schedule...` passed this run, consistent with these being timing-flaky rather than
deterministically broken.) Both re-run individually: **both PASS, 1/1, in isolation.** The 2
skipped are the documented floor-gated doctor skips (`doctor in a healthy fleet exits 0`, `doctor
with gh absent exits 0 under the generic profile`), each carrying the standard reason string
"local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)" -- an honest
skip, not a false witness (the same skip condition would also skip in CI only below the floor,
consistent with the intended contract).

**The "254/254" figure from the dispatch brief is confirmed as the TOTAL TEST COUNT (254 tests
exist on this head, both toolchains agree exactly), not a literal 254-pass/0-fail claim.** I did
not find a "254/254 pass" claim written anywhere in `delivery/work-history/m2-p2.md` itself (I read
the file in full); the number appears to describe the suite's total size, which both my own runs
independently confirm precisely (254 on both toolchains). Floor is NOT unconditionally green
(3 failures observed under this session's heavier-than-usual box load), but every failure is a
pre-existing, out-of-diff, load-sensitive real-clock test that passes cleanly in isolation, so this
does not indicate a regression caused by the fix round.
