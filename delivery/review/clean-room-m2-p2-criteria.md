# CR-1260: Clean-room criteria review, M2-P2 red-witness harness

Status: COMPLETE
Started: 2026-08-06
Finished: 2026-08-06

## Setup (done)

- Fetched origin/main and origin/claude/m2-p2-red-witness-harness.
- Head verified: `origin/claude/m2-p2-red-witness-harness` = `7ed8830fc2ccdd859c08b46f4355ba9ad4799f4f`
  (matches the head named in the assignment, exact string compare).
- Detached scratch worktree at
  `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/m2-fanout/m2-p2/review-criteria/cr-m2p2/wt`.
- Floor toolchain confirmed at
  `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/toolchain/node-v26.6.0-linux-x64/bin`
  (`node --version` => v26.6.0). Wrapper script `run.sh` beside this file sets PATH and cd's into the worktree
  for floor-toolchain invocations (sandbox rejects inline PATH=... && cd compound commands).
- Read CLAUDE.md (project instructions), MECHANISMS.md (27 rows), plan section
  "M2-P2: Red-witness harness" in full (delivery/plan/kernel-plan-m2.md lines 248-294),
  section 1.5 rows 1-4 and 17 (kernel-plan-m2.md), plan v1 section 3 preamble (C-1/C-2/C-3, test
  accounting rule), delivery/plan/phase-declarations/m2-p2.json, delivery/work-history/m2-p2.md (full,
  559 lines), delivery/verification/cr-661-orchestrator-reproduction.md,
  delivery/review/verification-m1-p3-fix-round.md (V-1, V-2 sections).

## Gates run so far

- `npm ci` (floor toolchain v26.6.0): exit 0, no EBADENGINE (correct toolchain in effect).
- `npm run build` (floor toolchain): exit 0. `git status --porcelain` empty afterward (D-17/D-18 upheld).
- `test/witness.test.ts` in isolation, floor toolchain (v26.6.0), with
  `--test-name-pattern='.*' --test test/witness.test.ts`: **28 tests, 28 pass, 0 fail** (35.68s).
- `test/witness.test.ts` in isolation, default toolchain (v22.22.2): **28 tests, 28 pass, 0 fail** (31.97s).
- Full suite (`npm test`, default toolchain v22.22.2) launched; box is shared with sibling phase
  review sessions (confirmed via `ps aux`, m2-p8 and others running `node --test test/**/*.test.ts`
  concurrently) -- consistent with the work history's stated load shape. Result pending, see below.

## Scope audit

`git diff --name-only origin/main...HEAD`:

```
delivery/work-history/m2-p2.md          (standing extra)
gates.manifest.json                     (declared)
src/gates/red-witness.ts                (declared)
src/gates/schemas/witness-spec.schema.json (declared)
src/witness/run.ts                      (declared)
src/witness/spec.ts                     (declared)
test/behaviors.json                     (standing extra + declared)
test/witness.test.ts                    (declared)
witness/captures/git-name-status-real.txt   (under witness/, declared)
witness/captures/node-test-tap-real.txt     (under witness/, declared)
witness/red-witness-base-absent-error.json  (under witness/, declared)
witness/witness-member-kind-diagnostics.json (under witness/, declared)
witness/witness-spec-schema-required.json    (under witness/, declared)
witness/witness-tap-reporter-pin.json        (under witness/, declared)
```

Every file is on `delivery/plan/phase-declarations/m2-p2.json`'s `filesToTouch` list or one of the two
standing extras. **PASS.**

Observation (not a finding against this PR): plan step 2 says "each spec this phase adds is listed as a
literal path in the phase declaration" but `phase-declarations/m2-p2.json` (committed at 4c9bfbc, before
this phase's dispatch, confirmed by `git log -- delivery/plan/phase-declarations/m2-p2.json` showing only
that one commit) lists only the generic `witness/` directory entry, not each literal spec path. The
declaration file is not on this phase's files-to-touch list, so amending it would itself be an out-of-scope
edit; this is a declaration-authoring gap that predates dispatch, not a defect introduced by this branch.
Flagging for the orchestrator's process notes, not counted as a CR finding.

`test/behaviors.json` diff: 29 added `+` lines, but one is the pre-existing last entry gaining a trailing
comma (JSON mechanics, not a new behavior) -- net **28 new behavior entries**, all `witness-*` /
`red-witness-*` prefixed, matching the work history's "28 additions" claim exactly. Append-only preserved
(no existing line's content changed except the added comma; no line removed).

`gates.manifest.json` diff: pure addition of the `red-witness` gate entry (id, command
`["node","src/gates/red-witness.ts"]`, unitLabel "witnesses evaluated", applicability required,
parameters `["base","head"]`, precondition `{id: red-witness-diff, kind: diff-touches, paths:
["src/","bin/"]}`). Matches plan step 7 verbatim. Append-only preserved.

## Criteria walk (re-executed, not taken from the work history)

| # | Criterion | Re-executed evidence | Verdict |
|---|---|---|---|
| 1 | Green end to end | `witness-harness-green-end-to-end` passed in isolated run (both toolchains, 28/28 batch above includes it) | MET |
| 2 | V-1 shape, both directions | `witness-v1-green-against-danger` + `witness-v1-corrected-green` in 28/28 batch | MET |
| 3 | Baseline-ref refusal, both directions | `witness-refusal-baseline-destructive`; **mutation-tested myself**: disabled rule (a) (`if (false && ...)`), re-ran the named test, got a real red (`/T-003/` no longer matched, full failure text captured), restored `src/witness/run.ts` from a byte copy, confirmed sha256 `decff8f9...` unchanged and `git status --porcelain` empty, re-ran the same test green | MET, mutation-confirmed |
| 3a | Derived class | `witness-derived-class` in 28/28 batch; code confirmed at src/witness/run.ts:846-859 | MET |
| 3b | Rule (g), CR-661 shape, 3 directions + collapse | Read test/witness.test.ts:548-710 in full. `GUARD_MEMBER_EXIT_FLIP` (`"exit 1"` -> `"exit 0"`, nothing else) is byte-for-byte the mutation in `delivery/verification/cr-661-orchestrator-reproduction.md`'s `diff` block. Test `witness-text-preserving-member` asserts `preservesAssertedText === true` and `rate.red === 0` on that exact member -- the harness re-runs the assertions' own greps against the mutated doc and separately executes it, matching the reproduction's measured `exit=0 pass 1 fail 0`. `witness-text-single-member-collapse` (i), `witness-text-behavior-green` (iii, extract-and-execute escapes the class), `witness-text-same-line-collapse` (two members touching the same line) all present and passing. **Mutation-tested myself**: disabled rule (g)'s `length < 2` check (changed to `< 0`), re-ran `witness-text-single-member-collapse`, got a real red (`/single-member collapse/` unmatched, actual detail became the opposite: "every declared member removes the asserted text; none inverts the behaviour" from a DIFFERENT code path further down, confirming the guard's absence is visible), restored from byte copy, sha256 confirmed identical to pre-mutation, git status clean, re-ran green | MET, mutation-confirmed, both directions plus collapse |
| 4 | Determinism 3/5, both directions | `witness-determinism-rate-red` / `-green`; fixture is literally the row-16 stage-path-collision shape (ATOMIC_SRC uses a FIXED `path + ".stage"`, not `randomUUID()`, to reproduce the defect; a sibling helper module correctly uses `randomUUID()` per MECHANISMS.md, and the fixture intentionally uses the fixed-name shape to reproduce the historical defect) | MET |
| 4a | Unreached arm, both directions | `witness-unreached-arm` / `-reached`; record fields asserted directly (file, lines, greenTests), not just the rate | MET |
| 5 | Captures, both directions | `witness-capture-recorded` / `-missing`; schema `captures` has `minItems: 1` so "no capture cited" is schema-unconstructible, confirmed by reading the schema | MET |
| 5a | Derived capture obligation, real V-2 stderr | Confirmed line-for-line: test/witness.test.ts:50 `"error: cannot lock ref 'refs/remotes/origin/main': is at a0e80f0 but expected a0d1254\n"` is byte-identical to `delivery/review/verification-m1-p3-fix-round.md:68`'s captured line. `RETRY_CONSUMES.provenance` cites that file and finding V-2 by name | MET |
| 6 | Diff intersection, both directions | `witness-diff-intersection` in 28/28 batch; rule (d) code at src/witness/run.ts:913-951 checks hunk-level intersection, not just file-level | MET |
| 7 | Pin witness | `witness-pin-hook-error` uses the documented `betweenPins` hook, asserts `/adder\.ts changed during the run/` and `/mtimeMs/`; confirmed the delivered pin (src/gates/pin.ts) is 5-field including ctimeMs (CR-809), so a content-only rewrite is caught even though mtimeMs can't be forced equal by content alone in this test's specific path -- consistent with D-P2-1's reasoning | MET |
| 8 | M2-C-4, caller clean | `assertCallerClean` is called inside the shared `runGate()` helper (test/witness.test.ts:137-149), which essentially every test in the file routes through, so it fires after every fixture's gate invocation, not just 1-7 | MET |
| 9 | Stored-witness re-evaluation, both directions, cost measured | `witness-stored-reevaluation-red` / `-green` (N-401 shape) present; work history's dogfood cost figures (0ms stored re-eval, 24.8s whole run) are **plausible but not independently re-measured by me** against the live corpus, since the kernel's own witness/ specs are all phase-own in this diff (stored set is empty for this branch, exactly as the work history says) -- so there is currently nothing FOR this branch to re-measure a nonzero stored cost against; the 0ms figure is structurally forced, not a claim requiring trust | MET (structurally verified, not independently timed against a nonzero corpus) |
| 10 | Baseline from fetched remote | Read test/witness.test.ts:1242-1280+: builds a real bare(ish) upstream repo, clones it, advances the upstream AFTER the clone (so local `origin/main` is stale), and asserts the recorded baselineSha equals the post-advance sha. This is a genuine two-repo construction, not a mocked ref | MET |
| 11 | Suite accounting | See "Full suite" section below | MET, with the two known cross-phase items reproduced myself |

## Mutation testing (two structurally different guards, run/red/sha256-restore)

Both performed against `src/witness/run.ts` (sha256 before and after: `decff8f9d9290420dd66805151010712e3076869f54831a5e611622949ff5cfb`, confirmed identical, `git status --porcelain` empty both times):

1. **Rule (a)** (baseline-ref refusal for destructive/classification witnesses): changed
   `if (spec.class === "destructive" || spec.class === "classification")` to
   `if (false && (...))`. Named test `a destructive witness whose only member is a baseline ref is
   refused citing T-003` went from PASS to a real assertion failure (`/T-003/` did not match; actual
   detail showed the harness proceeding to execute the baseline-ref member and reporting a plain
   determinism-rate red instead of the T-003 refusal). Restored, sha256 confirmed, test green again.
2. **Rule (g)** (single-member collapse, "one witness is not a class"): changed
   `spec.dangerousStates.length < 2` to `spec.dangerousStates.length < 0`. Named test
   `a text-asserting witness with a single member is red naming the collapse` went from PASS to a real
   assertion failure (`/single-member collapse/` did not match; actual detail was a DIFFERENT red reason
   from further downstream code, "every declared member removes the asserted text; none inverts the
   behaviour" -- confirming the rule (g) collapse check, not some other rule, is what the named test
   depends on). Restored, sha256 confirmed, test green again.

These two guards are structurally different (different rule letter, different code region, different
failure-mode class: a class-membership refusal vs. a cardinality/collapse refusal), satisfying "a witness
for a class must redden under at least two structurally different members" applied to my own mutation
sampling, not just to the branch's internal self-review.

**Caution recorded (methodology, not a branch defect)**: my first `npm test` background run
(`full-suite-default.log`) was contaminated by these live edits to `src/witness/run.ts` happening on disk
while that background process was still executing -- one of its own witness tests
(`a destructive witness whose only member is a baseline ref is refused citing T-003`) failed with the
EXACT text of my rule-(a) defang, which is not a coincidence: the harness spawns children and clones the
live working tree from disk, so a concurrent edit to a module under audit can leak into an in-flight run.
I discarded that run and re-ran the full suite with no concurrent file edits; see below. This is a hazard
of my own review methodology sharing a filesystem with a live edit, not evidence of a flaw in the
harness's isolation contract (M2-C-4 governs the CALLER's repository being left clean after a run, not
concurrent-edit safety of the audited source tree, which no gate anywhere claims).

## Full suite (clean re-run, default toolchain v22.22.2, no concurrent edits)

`npm test` (default toolchain v22.22.2), no files touched during the run: **229 tests, 222 pass, 5 fail, 2
skipped**, wall time 721.1s (long, but this box was concurrently running >=17 sibling `node --test`
processes from other phase-review sessions throughout, per `ps aux` and `uptime` load average
23-33 during the run -- consistent with CLAUDE.md warning 11 and the work history's stated load shape).

Failures, exact names, matching the work history's claimed set 1-for-1:

1. `the workflow's gate bundle step runs the gate runner and is able to fail` -- re-executed in isolation
   myself: `21 !== 0`, captured detail `gates: declared 2 applicable 1 verdict 1 green 1 red 0
   not-applicable 0 error 1 vacuous 0` / `gates: 1 gate(s) reported error: red-witness`. Matches the work
   history's cross-phase item 2 verbatim (M2-P1's runner reports `error`, not exit 0, for a
   `diff-touches` gate invoked with no `--base`; this phase is the first to register such a gate).
2. `manifest-self-check reports one unit per schema document` -- re-executed in isolation myself:
   `2 !== 3` (readdir-based test expects 3 schema documents on disk, the delivered `schemaDocumentPaths()`
   is a hardcoded 2-entry list; this phase's `witness-spec.schema.json` is the third document). Matches
   the work history's cross-phase item 1 (KNOWN, orchestrator-announced, fixed on main separately).
3. `doctor and the guard return one verdict about one beacon` (test/liveness.test.ts, untouched by this
   diff) -- real-clock flake: writes a beacon timestamped exactly 13s in the past and asserts the doctor
   CLI reports `age 13s` moments later; under the current heavy shared-box load (uptime load average
   23-32 throughout my session) I reproduced `age 14s` on **4 of 4** of my own isolated attempts, never a
   pass. I could NOT independently confirm the work history's claim "re-run in isolation ... all three
   PASS"; this is recorded honestly as an open item below rather than asserted either way.
4. `a resident watcher keeps running and backs off with growing beacon gaps` (test/watcher.test.ts,
   untouched by this diff) -- passed in my own isolated re-run (1/1).
5. `the heartbeat schedule is on disk and shared by single passes` (test/watcher.test.ts, untouched by
   this diff) -- passed in my own isolated re-run (1/1).

All five names, and only these five, match the work history's claimed failure set exactly; no
undisclosed failure exists in either of my two full-suite runs once the first run's self-inflicted
contamination (see above) is discounted.

**Behavior resolution** (criterion 11, "resolves by name"): wrote a small script comparing all 28 new
`test/behaviors.json` entries against the `test()` title strings actually present in
`test/witness.test.ts`. Result: 28 checked, **0 mismatches**, and the file contains exactly 28 `test(...)`
calls total, so there is no orphaned registry entry and no untitled/unregistered test in the phase's own
file.

## Honest-failure section

1. Could not independently confirm "doctor and the guard return one verdict about one beacon" passes in
   isolation on this box right now (see above); the box's current load (shared with several sibling
   phase-review sessions) is heavier than what the work history's session likely saw, and the test's
   design (a hardcoded `age 13s` string against a live 1-second window) is inherently load-sensitive. This
   is a probe that came back not-clean rather than clean; recorded rather than asserted either way, per the
   claim-grep discipline. It does not change the criteria walk or the scope audit, because the file is
   entirely absent from this branch's diff.
2. Did not independently re-time the stored-witness re-evaluation cost against a nonzero corpus (there is
   currently no stored witness corpus for this branch to re-evaluate against other than its own 4 specs,
   which are phase-own, not stored); the 0ms figure in the work history is structurally forced by that fact
   rather than a measurement I need to trust, so this is not treated as an unverified claim, but it does
   mean the FIVE-MINUTE CEILING itself (plan step 6) has not been exercised by this phase or by me against
   a corpus large enough to approach it. That is future-phase residue, not a defect here.
3. Did not attempt to independently derive whether a re-exported `child_process` reference (imported in
   one file, re-exported and called via `exec(` in another with no `child_process` literal in that second
   file's own text) would escape the SPAWN_GREP derivation. The work history does not claim to have ruled
   this out either; it is the same class of residue plan section 1.5 row 21 already names as unmechanized.

## Findings

**CR-1261 (low): D-P2-3's site count for `spec.class` consultation is understated by one.**
Claim in `delivery/work-history/m2-p2.md` (Decisions section, D-P2-3): "`grep -n \"spec.class\"
src/witness/run.ts` shows the class is consulted at exactly two places, rule (a) ... and rule (e) itself."
Re-ran that exact command: `src/witness/run.ts:833,838,853,857,954,959` -- **six lines, three distinct
consultation sites**, not two: rule (a) (~833-844), rule (e) (~853-859), and rule (g)'s `needsClassRules`
check at line 954 (`spec.class === "classification"`), which decides whether the two-member/text-asserting
rule applies. This third site is not mentioned in the derivation. The underlying conclusion (that
rule (e)'s fail-closed over-approximation only tightens rule (a) and never silently weakens a witness) is
still correct on inspection, because rule (e) never rewrites `spec.class` itself, it only judges the
DECLARED value against the derived one, so rule (g)'s independent read of `spec.class` is unaffected by
rule (e) firing. Fix: correct the count to three and name the third site, or drop the count and state the
qualitative claim only. Not blocking; this is exactly the shape CLAUDE.md's claim-grep discipline exists to
catch, applied here to a non-fix-round decision record rather than a fix round.

**CR-1262 (low): D-P2-4's claimed spawn-grep alternatives do not match the shipped `SPAWN_GREP` pattern.**
`delivery/work-history/m2-p2.md` D-P2-4 states the spawn-grep is "(`child_process`, `execFile`,
`spawnSync`, `execSync`, `exec(`)". The shipped pattern (`src/witness/run.ts:266`) is
`/child_process|execFile|spawnSync|execSync/` -- four alternatives, not five; `exec(` is absent. No test in
`test/witness.test.ts` exercises the `exec(`-only shape either way. I did not find a coverage gap this
creates: obtaining a reference to Node's callback-style `exec` requires importing `node:child_process`
somewhere reachable, and if that import is in the SAME file being scanned, the `child_process` alternative
already matches; a re-exported reference from a different file is a known, already-named residue (plan
section 1.5 row 21 class), not a new gap this discrepancy introduces. Fix: either add the `exec(`
alternative to the shipped regex (if it was meant to catch bare-`exec` call sites even without a local
import string) or correct D-P2-4's prose to match the four-alternative pattern actually shipped.

**Observation (not a CR finding): phase-declaration literal-path requirement not honored, but not
attributable to this branch.** Recorded in the Scope audit section above.

## Mutation table

| Guard | Rule | Mutation | Named test | Pre-mutation | Post-mutation | Restored (sha256) | Restored (test) |
|---|---|---|---|---|---|---|---|
| Baseline-ref refusal | (a) | `if (spec.class === ...)` -> `if (false && (...))` | `a destructive witness whose only member is a baseline ref is refused citing T-003` | PASS | FAIL (`/T-003/` unmatched) | Identical (`decff8f9...`), `git status` clean | PASS |
| Single-member collapse | (g) | `dangerousStates.length < 2` -> `< 0` | `a text-asserting witness with a single member is red naming the collapse` | PASS | FAIL (`/single-member collapse/` unmatched) | Identical (`decff8f9...`), `git status` clean | PASS |

## Deviation judgments (D-P2-1 through D-P2-6)

- **D-P2-1 (pin bracketing under the five-field pin).** Necessity, not convenience: the delivered M2-P1
  pin (`src/gates/pin.ts`, confirmed 5 fields including `ctimeMs` added by CR-809) makes the plan's literal
  "pin around the mutate-restore cycle" ordering physically impossible (ctime is not userspace-settable),
  which the work history demonstrates with an executed probe rather than an assertion (a 9-line node
  script showing `ctimeMs equal after utimes restore: false`). The resolution (bracket each test execution
  instead) preserves the plan's actual intent (M2-C-5: "a run that cannot name what it executed is not
  evidence") and is exercised by criterion 1 and criterion 7 tests, both passing. Sound; does not ripple
  elsewhere since no other M2 phase's criteria depend on this specific bracketing choice yet.
- **D-P2-2 (coverage semantics).** A reasonable, stated, fail-closed reading of an underspecified plan
  rule (file-level coverage granularity was left open). Witnessed by two tests in both directions. Sound.
- **D-P2-3 (derived-class grep granularity).** Convenience-leaning (substring search over full test-file
  source, not parsed call sites) but explicitly fail-closed by design and reasoned through, with one
  factual inaccuracy in its own derivation count (CR-1261 above). The choice itself is defensible: a false
  positive here can only ADD a `destructive` requirement, never remove one.
- **D-P2-4 (rule (f) scope).** Reasonable in principle; the shipped pattern text does not match the
  decision's own prose (CR-1262 above), a discrepancy worth correcting but not a functional gap I could
  construct.
- **D-P2-5 (baseline-ref member application).** Directly required by the blueprint's own contract ("red on
  baseline, green on head" using the head-authored test), correctly implemented (checkout baseline,
  restore named test files from head), and defended against the false-pass mode (a test that cannot even
  run at baseline does not count as red). Sound.
- **D-P2-6 (repeats=2 on kernel corpus).** A reasonable operating choice with a stated tradeoff (CI cost vs
  the plan's own 5-minute re-evaluation ceiling) and the plan's own criterion-4 fixture is explicitly kept
  at the default 5 so the measured-rate property is not weakened by this choice. Sound; worth the
  orchestrator's attention as the corpus grows, exactly as the work history itself flags.

## Gate numbers per toolchain

| Gate | Floor (v26.6.0) | Default (v22.22.2) |
|---|---|---|
| `npm ci` | exit 0, no EBADENGINE | exit 0 (EBADENGINE expected/documented when this toolchain is used alone; not exercised separately here since floor was used for ci/build) |
| `npm run build` | exit 0, `git status --porcelain` empty after | not re-run separately (build is toolchain-pinned tsc per CLAUDE.md; floor run is authoritative) |
| `test/witness.test.ts` isolated | 28 tests, 28 pass, 0 fail (35.68s) | 28 tests, 28 pass, 0 fail (31.97s) |
| Full suite (`npm test`) | not re-run by me (work history's own floor claim is the isolated-file run above, which I reproduced) | 229 tests, 222 pass, 5 fail, 2 skipped (721.1s, heavy shared-box load); exact failure set reproduced and individually re-verified |

## Verdict

**APPROVE.**

Every one of the plan's 11 acceptance criteria (including 3a, 3b, 4a, 5a) was re-executed, not taken on
trust, and met. The CR-661 reproduction's exact measured mutation (`exit 1` -> `exit 0`, nothing else) is
byte-identical between the historical verification document and this phase's fixture, and the harness's
own recorded fields (`preservesAssertedText: true`, `rate.red: 0`) reproduce the reproduction's measured
`exit=0 pass 1 fail 0` shape mechanically rather than by assertion. The real V-2 contention stderr
(`is at a0e80f0 but expected a0d1254`) is captured byte-for-byte from
`delivery/review/verification-m1-p3-fix-round.md` line 68. Two structurally different guards (rule (a)
class-membership refusal; rule (g) cardinality/collapse refusal) were mutation-tested by me independently,
both reddened the correct named test and only that test's assertion, and both were restored with a
verified byte-identical sha256 and a clean working tree. The scope audit passes cleanly: every changed file
is declared or a standing extra, the two shared registries (`gates.manifest.json`, `test/behaviors.json`)
are pure appends, and all 28 new behavior entries resolve 1:1 to real test titles with no orphans. The full
suite's failure set is exactly the five names the work history claims, with the two cross-phase items
independently reproduced by me with matching captured output, and two of the three claimed
pre-existing-and-untouched real-clock flakes reproduced as passing in isolation (the third I could not
confirm passing under the box's current heavy load, recorded honestly above as an open item rather than
either asserted or treated as a phase defect, since the file is entirely outside this branch's diff).

Two low findings (CR-1261, CR-1262) are both documentation-accuracy issues in the work history's own
mechanism-derivation prose (an undercounted grep-consultation-site claim, and a decision's prose describing
five regex alternatives when four shipped), neither of which I could turn into a constructed coverage gap
in the shipped code. Recommend closing both in the next available commit to this file (not necessarily a
dedicated fix round) so the derivation record stays trustworthy for the next reader, consistent with the
project's own claim-grep discipline. Neither blocks merge.


