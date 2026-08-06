# CR-700 series: clean-room CRITERIA-CONTRACT review, PR #9 (M1-P6), FIX ROUND 2, DELTA SCOPE

- Head reviewed: `9b76639` (`9b766397291f7374b42bd94469a26c9de18bc3c9`)
- Previous reviewed head: `8954b05` (round 1 of this fix cycle, APPROVE with
  CR-661 medium and CR-662 informational, `delivery/review/clean-room-m1-
  p6-round2-criteria.md`)
- Branch: `claude/m1-p6-toy-sandbox-exit`
- Base: `origin/main` at `58ac9649f243b563805fa46a3c17c399768604e8`
- Reviewer role: CRITERIA-CONTRACT, DELTA mandate. A concurrent
  HAZARD-CONTRACT reviewer works the same head in the sibling worktree
  `p6c-hazard`, not read here.
- Worktree: detached at `9b76639`,
  `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/p6c-criteria`
- No file in `/home/user/tiphys-ai-helmsman` or in the sibling worktree
  `p6c-hazard` was written by this review. No push, commit, or write to
  the real sandbox repository (`ThomasHendrickx/tiphys-ai-helmsman-
  sandbox`); every harness run used the harness's own throwaway `file://`
  remotes.
- Toolchains: Node v26.6.0 (npm 11.18.0) from
  `.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin` first on PATH for
  every "Node 26" row; Node v22.22.2 (the login-shell default, confirmed
  via `bash -lc 'node --version'`) for every "Node 22" row.

## Method

Delta review per dispatch instructions: only criteria 5, 2, 3, 6 were
re-walked from zero; criteria 1 and 4 were spot-checked (unchanged-diff
argument plus a fresh CI observation), not re-walked. Every number below
was produced by this session running a command in the worktree above:
fresh `npm ci`, fresh builds, fresh harness runs against the harness's own
scratch `file://` remotes, a from-scratch registry-resolution script, and
mutation testing with `Edit`/manual restoration verified by `diff` and
`md5sum` against a pristine copy taken before any mutation.

## Verdict

**APPROVE. Zero new findings.**

CR-661 (medium, round 1: the falsifiability-guard test asserted text, not
wiring) is CLOSED. The rewritten test
(`exit-test-falsifiability-guard-wired`, title now "the gates
falsifiability guard fails the job when the harness cannot fail") extracts
the workflow step's own shell and executes it against stub harnesses; all
five defangs the work history claims to redden it (D1-D5, including the
exact W4/D5 mutation that survived round 1) do redden it, independently
reproduced below. CR-662 (informational, round 1: a 1-in-4 `watcher.test.ts`
flake) did not recur in 4/4 fresh Node 26 full-suite runs at this head;
scope of that negative result is stated below.

## Criteria re-executed vs skipped

| # | Criterion | Action this round | Result |
|---|---|---|---|
| 1 | sandbox clone, file:// and real repo | SKIPPED (spot-check only): confirmed `sandbox/`, `scripts/seed-sandbox.sh`, `scripts/stub-payload.sh` are untouched by `git diff 8954b05..9b76639`, and `sandbox-clone-npm-ci-and-test` ran green in this round's own 4 full-suite Node 26 runs | Unchanged, MET (by the same unchanged-diff argument the previous round used) |
| 2 | local mode, complete bundle | RE-EXECUTED, own bundle | MET, 56 records (was 53), see below |
| 3 | teardown refusal / watcher line / teardown-after-merge | RE-EXECUTED, own bundle | MET, byte-exact |
| 4 | gates CI check green at this head, falsifiability step executes | RE-EXECUTED via GitHub API and job log | MET |
| 5 | falsification run exits nonzero at C2 | RE-EXECUTED, own run | MET |
| 6 | node --test exit 0, registry resolves by name | RE-EXECUTED, own script | MET, 155/161, 0 unresolved |

Criteria 2, 3, 5, 6 were the ones the delta could move and are fully
re-walked with fresh evidence. Criterion 4 is re-executed (a live CI
observation is cheap and the delta touches `gates.yml` directly).
Criterion 1 is the only one genuinely skipped, on the stated scope that
this round's diff does not touch any file criterion 1 depends on.

## Criterion 2: local-mode harness, complete evidence bundle

Own execution: `bash scripts/m1-exit-test.sh --mode local <dir>`, exit 0,
real 1m57.7s.

| Item | Work history claim | This review's own run |
|---|---|---|
| records in `records/` | 56 | 56 |
| `recordsInBundle` | 56 | 56 |
| `recordsValidated` | 55 (one less, the validation's own record) | 55 |
| `problems` | `[]` | `[]` |
| `tiphysInvocations` | 12 -> 13 | 13 |
| distinct registry steps present | 12 (A1-A8, B1, C1-C3) | 12, confirmed by set-extraction over all record files |
| duplicate sequence numbers | none | none (56 files, 56 distinct 3-digit prefixes) |

The three new records versus the 53-record round-1 bundle are, precisely:
`027-A5.json` (kind `observation`, the CR-647 note on what the watch.out
assertions do and do not witness), `046-A3.json` (kind `observation`, the
`observe_step` lease-status invocation itself), and `047-A3.json` (kind
`observation`, the "the lease survived stage B" note). Only one of the
three is literally the `observe_step` command record; the other two are
`note_step` calls with `kind observation`. This is a minor imprecision in
how the dispatch brief characterized the delta ("the three new records are
the observe_step lease-state ones"), not a defect: all three are exactly
where the work history's CR-645/CR-647 sections say they would be, and no
record is an accidental duplicate (verified by the zero-duplicate-prefix
check above and by reading each of the three records' content).

## Criterion 3: teardown refusal / watcher line / teardown-after-merge

From the same bundle as criterion 2:

- `output/watch.out`: `wc -c` = 24, `cat -A` = `signal m1-exit turn-end$`
  (one line, byte-exact).
- `033-A7.json` / `034-A7.json` / `035-A7.json`: teardown refusal
  `exitCode 1, outcome pass` (expected nonzero), reason line names
  `task/m1-exit`, worktree survives.
- C2 in the green bundle: `exitCode 0, outcome pass`, teardown after the
  squash merge, worktree removed, task meta closed (all `ok` in the run's
  own stdout and confirmed in-record).

No regression; the harness's control-flow changes (the wider EXIT trap,
`observe_step`, the guarded `cp`) do not touch these three assertions'
mechanics, and this round's own execution reproduces them unchanged.

## Criterion 4: gates CI check on PR #9 at `9b76639`

Direct GitHub API observation against the exact head:

```
pull_request_read(get, PR #9): head.sha = 9b766397291f7374b42bd94469a26c9de18bc3c9, state open
pull_request_read(get_check_runs, PR #9):
  gates        completed / success
  test (26)    completed / success   (14:15:34 to 14:20:31, ~4m57s)
```

The `test (26)` job log (fetched directly) shows the falsifiability step
running the harness a second time to completion, not being skipped or
truncated: the full green path (A1 through C3) runs first, then a second
full harness invocation with `TIPHYS_EXIT_TEST_SKIP_STAGE_B=1`, ending
`m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge):
expected exit zero, got 1` followed by `falsifiability guard witnessed at
C2: exitCode 1` (the new `.map(...).join(",")` form introduced by this
round, confirmed present in the live log, not just in the source). The
~4m57s runtime matches the "two full harness runs per leg" shape.

## Criterion 5: falsification run

```
$ TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 bash scripts/m1-exit-test.sh --mode local <dir>
...
m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge): expected exit zero, got 1
exit 1
```

`046-C2.json` in that bundle: `"exitCode": 1, "expected": "exit zero",
"outcome": "fail"`. Exact match to the criterion and the work history.

## Criterion 6: node --test and the behavior registry

Node 26, `npm test`: **155 tests, 155 pass, 0 fail, 0 skipped**, exit 0
(one authoritative run; see the flake section for 3 additional raw-TAP
runs). Node 22, `npm test`: **155 tests, 153 pass, 0 fail, 2 skipped**,
exit 0, both skips confirmed to be the documented floor-gated `doctor`
tests (`ok 4 ... # SKIP local Node v22.22.2 is below the kernel floor`,
`ok 8 ... # SKIP` same reason).

Registry check (own script, extracts every top-level `ok`/`not ok` title
from raw TAP and set-compares against every value in
`test/behaviors.json`): **155 distinct titles, 161 behaviors.json entries,
0 unresolved.**

`test/behaviors.json` diff, checked programmatically against both
`8954b05` and `origin/main`:

- `8954b05` (161 entries) vs `9b76639` (161 entries): 0 keys added, 0 keys
  dropped, exactly 1 changed VALUE (`exit-test-falsifiability-guard-
  wired`'s description text, updated to match the rewritten test's new
  title). No key was renamed or retitled; the id is unchanged.
- `origin/main` (152 entries) vs `9b76639`: 0 keys dropped, 0 changed
  values for any key that exists in `main`. The whole phase's registry
  diff is purely additive over `main`.

## Mutation testing: `exit-test-falsifiability-guard-wired`, all 5 defangs

Baseline (before any mutation): 1 pass, 0 fail on both target tests.
Every mutation below applied by `Edit`, run, then restored from a
pristine copy taken before any mutation; `diff` against that pristine
copy and `md5sum` both confirm byte-identical restoration after every
row, and `git status --porcelain` is empty after each restoration.

Pristine hashes: `.github/workflows/gates.yml` = `e56764fe8900131b2345
cf652d09ad57`; `scripts/m1-exit-test.sh` = `e917bb48b9e9ff599262ff7f6
ffe159a`. Both confirmed unchanged after every mutation in this table.

| # | Defang | Result | Restore confirmed |
|---|---|---|---|
| D1 | `exit 1` -> `exit 0` in the guard-broken branch | **RED**: `notStrictEqual` fails, "the guard passed a harness that exited 0 on the skip-stage-B path" | diff + md5 identical |
| D2 | `continue-on-error: true` added to the step | **RED**: `doesNotMatch` fails on the structural `continue-on-error` check | diff + md5 identical |
| D3 | `process.exit(1)` dropped from the C2 arm | **RED**: `notStrictEqual` fails, "the guard accepted a nonzero run with no failing C2 record" (the second-order defect the work history describes: the removed `process.exit` is no longer load-bearing because a prior round's crash-based accident was itself fixed this round, so a genuine assertion now catches it) | diff + md5 identical |
| D4 | the whole step deleted | **RED**: `notEqual` fails, "no workflow step whose name contains falsifiability guard" | diff + md5 identical |
| D5 | the `if` line's guard condition given `\|\| true` (round 1's W4/W4a) | **RED**: `strictEqual` fails, "the guard rejected a harness that failed correctly at C2" (the `if` unconditionally takes the broken-guard branch regardless of the stub's real exit code) | diff + md5 identical |

All five defangs the fix-round work history claims (D1-D5) independently
redden the rewritten test. This closes CR-661: the previous round's exact
counterexample (D5/W4) and three additional realistic defangs (D1-D3
plus the structural D2/D4 checks) are now all caught by an assertion on
behavior rather than on text.

## Mutation testing: `exit-test-step-failure-is-fatal` (re-confirmed, harness changed around it)

| # | Mutation | Result | Restore confirmed |
|---|---|---|---|
| W1 | `run_step`'s outcome computation (`case "${expect}" in ...`) deleted, every step scores `pass` unconditionally | **RED**: 0 pass, 1 fail. The harness runs past A1's induced `npm ci` failure and dies later on an unrelated assertion (`dist/bin/tiphys.js does not exist after npm run build`), so `assert.match(result.stderr, /FAILED: step A1 \(kernel npm ci\)/)` fails | diff + md5 identical |
| W2 | `die "step ..."` in `run_step`'s fail branch replaced with `true "step ..."` | **RED**: 0 pass, 1 fail, same failure shape as W1 (harness continues past the failing step) | diff + md5 identical |

Unchanged from round 1: this test still reddens correctly despite the
round's new `observe_step` helper, the widened EXIT trap, and the
explicit lease duration, none of which touch `run_step`'s own outcome or
`die` logic.

## Self-corrections in the fix-round-2 work history (T-006 sample)

Two corrections are stated in `delivery/work-history/m1-p6.md`; both
checked and both true.

1. **CR-640/CR-661 correction** ("what was wrong was the
   GENERALISATION"): confirmed directly by the mutation table above. The
   round-1 W4 witness (D5 here) does still redden, exactly as claimed, and
   the three additional defangs (D1-D3) that the work history says would
   have escaped the OLD test are all closed by the rewritten one.
2. **CR-644 correction** ("the 'records went down' reading I first typed
   was false: the count goes UP, and the corruption is in the
   numbering"): independently reproduced with a standalone script
   (`/tmp/.../scratchpad/cr644-repro.sh`) that extracts the two record-
   sequence-resumption formulas verbatim from `8954b05` and `9b76639` and
   runs them against a synthetic 37-record directory with a hand-set
   stale session sequence of 5, then appends 15 more records exactly as
   `stage_c` would. Result: OLD logic produces **52 total files, 15
   duplicate sequence prefixes** (file count went UP, not down, exactly
   as the correction states); NEW logic produces **52 total files, 0
   duplicate sequence prefixes**. Both halves of the corrected claim
   check out.
   Scope of this check: a standalone reproduction of the two formulas
   against a synthetic directory, not a full end-to-end `--stage a` /
   `--stage c` run with a real or stubbed `gh` (full mode requires `gh`
   for `pr create`/`pr view`/`pr merge`, which is out of this delta
   review's time budget and not one of criteria 5/2/3/6 this round was
   scoped to). The implementer's own adversarial witness in the work
   history (session recordSeq 37 -> 5, disk max 37) is a full end-to-end
   run and is consistent with this reproduction's numbers in shape (both
   show the fix eliminating duplicates); this review did not re-run the
   implementer's exact end-to-end scenario.

## CR-662 follow-up: full-suite flake recheck

4 full-suite Node 26 runs at this exact head, raw TAP
(`node --test --test-reporter=tap "test/**/*.test.ts"`):

| Run | Result |
|---|---|
| 1 (as part of registry check) | 155/155/0/0 |
| 2 | 155/155/0/0 |
| 3 | 155/155/0/0 |
| 4 | 155/155/0/0 |

**0 of 4 runs showed the `watcher.test.ts` flake CR-662 reported (1 of 4
at `8954b05`).** Scope of this negative result: 4 runs at one head, no
attempt at a larger sample or root cause; a 1-in-4 rate at the previous
head is not ruled out by 4 clean runs at this one (a fair coin can land
heads four times running). This is reported as a data point for whoever
next investigates the M1-P5 race, not as evidence the race is gone.

## Gates, both toolchains (this review's own runs)

| Gate | Node v26.6.0 (declared floor) | Node v22.22.2 (login-shell default) |
|---|---|---|
| `npm ci` | exit 0, 0 EBADENGINE lines | exit 0, 5 EBADENGINE lines (expected) |
| `npm run build` | exit 0 | exit 0 |
| `git status --porcelain` after build | clean | clean |
| `npm test` | exit 0: **155 tests, 155 pass, 0 fail, 0 skipped** | exit 0: **155 tests, 153 pass, 0 fail, 2 skipped** (documented floor-gated `doctor` tests, confirmed by name) |
| behavior registry by name (own script) | 161 mappings, **0 unresolved** | not re-run (Node 26 is the declared authority) |

Note on toolchains: the container's bare shell (no login) resolves
`node` to v20.20.2 via a stale PATH entry (`/usr/local/bin/node`); the
documented container default of v22.22.2 is only reached through a login
shell (`bash -lc`), which is what every Node-22 row above uses. Worth a
one-line note in the environment warnings for the next reviewer who
shells in non-interactively.

## Scope audit

```
$ git diff --name-only 8954b05..9b76639
.github/workflows/gates.yml
delivery/work-history/m1-p6.md
scripts/m1-exit-test.sh
test/behaviors.json
test/exit-test-local.test.ts
```

All 5 files are on the declared files-to-touch list (`scripts/m1-exit-
test.sh`, `.github/workflows/gates.yml`) plus the two standing
pre-authorized extras (`test/behaviors.json`,
`delivery/work-history/m1-p6.md`) and `test/exit-test-local.test.ts`
(declared). **Scope audit passes, no unauthorized file.**

## Conventions

- ASCII: `git diff --name-only 8954b05..9b76639 | xargs grep -lP
  "[^\x00-\x7F]"` finds nothing (exit 123, i.e. grep found no match in
  any of the 5 files; xargs's own exit code, not a tool failure).
- Em dash: same 5 files, same empty result.
- No AI/model/tool names: `git log 8954b05..9b76639 --format='%H %s%n%b'
  | grep -inE 'claude|anthropic|gpt|openai|copilot'` exits 1, no match,
  over this round's single commit `9b76639`.

## Probes run (including empty-handed ones, with scope stated)

| Probe | Scope | Result |
|---|---|---|
| Bundle record-count and duplicate-seq check | This review's own 56-record local-mode bundle | 56 = 56, 0 duplicates |
| Registry set-compare | Own raw-TAP capture (Node 26) vs `test/behaviors.json` | 0 unresolved |
| `behaviors.json` key diff | `8954b05` vs `9b76639` vs `origin/main` | 0 keys dropped or renamed anywhere; 1 value text updated for the rewritten key |
| Mutation table, falsifiability guard | 5 defangs (D1-D5) against the rewritten test | 5/5 red, 5/5 restored byte-identical (diff + md5) |
| Mutation table, step-failure-is-fatal | 2 mutations (W1, W2) | 2/2 red, 2/2 restored byte-identical |
| CR-644 self-correction reproduction | Standalone extraction of both resumption formulas against a synthetic 37-record directory, not a full `--stage a`/`--stage c` run | Both halves of the correction confirmed true |
| Full-suite flake repeat | 4 raw-TAP Node 26 runs at `9b76639` | 0 of 4 flaked (was 1 of 4 at `8954b05`); sample too small to conclude the race is fixed |
| Criterion 1 unchanged-diff spot-check | `git diff --stat 8954b05..9b76639` over `sandbox/`, `scripts/seed-sandbox.sh`, `scripts/stub-payload.sh` | Empty, confirming no regression surface for this round |

## Honest-failure section

1. **The CR-644 self-correction was verified by a standalone
   reproduction of the two formulas, not by running the full-mode
   `--stage a` / `--stage c` handoff with a real or stubbed `gh`.** Full
   mode needs a working `gh pr create`/`pr view`/`pr merge` and a real or
   convincingly faked remote for those to resolve against; building that
   rigorously was judged out of proportion to a delta review scoped to
   criteria 2/3/5/6, and the synthetic reproduction extracts the actual
   shell arithmetic verbatim from both heads rather than reimplementing
   it from a description, which is why this review is confident in the
   result despite not running the full end-to-end path.
2. **The dispatch brief's characterization of the three new records as
   "the observe_step lease-state ones" is slightly imprecise** (only one
   of the three, `046-A3.json`, is literally an `observe_step` call; the
   other two, `027-A5.json` and `047-A3.json`, are `note_step` calls with
   `kind: "observation"`). Reported as a clarification, not a finding,
   since the work history itself is precise about which section produced
   which record and this review confirmed all three against it.
3. **This review did not attempt to reproduce the M1-P5 watcher flake**
   beyond the 4 full-suite runs already reported; 0/4 here versus 1/4 at
   the previous head is not strong enough evidence, in either direction,
   to say anything more than "still worth watching."

Nothing else in the work history's fix-round-2 section was checked and
found to overstate its claim. Every quoted number this review could
independently produce (56, 155, 161, 13, 0 unresolved) matched exactly.

## What this contract cannot see

Per T-007, an "all criteria met, zero new findings" verdict from this
contract is one input, not a terminal judgment. Unchanged from the
previous round's own statement of this limit, plus what this round's own
new machinery adds to it: this review confirms the SIX STATED CRITERIA
and the specific claims the dispatch brief asked about, but did not
independently search for a SECOND gap of CR-661's shape elsewhere in this
round's new code (the wider EXIT trap, `observe_step`'s never-fails
contract, the mode-conditioned B1 exemption, the disk/session max
derivation) beyond the two narrow reproductions above (CR-644's
arithmetic and the falsifiability mutation table). Hostile filesystem
states, concurrent harness invocations against one scratch work
directory, a process killed mid-step, and full-mode correctness under a
real `gh` remain outside what a criteria walk can see and are the
concurrent hazard-contract reviewer's territory, which this review
deliberately did not read.

## Summary for the record

- Verdict: **APPROVE**, 0 new findings.
- Criteria re-executed: 2, 3, 4, 5, 6 (fresh evidence). Criterion 1
  skipped, spot-checked via unchanged-diff argument and this round's own
  green `sandbox-clone-npm-ci-and-test` runs.
- Findings: 0 total (0 high, 0 medium, 0 low, 0 informational new to this
  round). CR-661 (medium, prior round) is CLOSED. CR-662 (informational,
  prior round) did not recur in 4/4 fresh runs; treated as a data point,
  not a closure, given sample size.
- Mutation table: 7 rows (D1-D5, W1-W2). 7 of 7 reddened as claimed; all 7
  restorations confirmed byte-identical by `diff` and `md5sum`.
- Flake recheck: 0 of 4 Node 26 full-suite runs flaked at `9b76639`
  (versus 1 of 4 at `8954b05`); scope explicitly stated as too small to
  conclude anything about the underlying race.
- Gates: Node 26 exit 0, 155/155/0/0-skip; Node 22 exit 0, 155/153/0/2-skip
  (2 documented floor-gated skips, confirmed by name); registry 161/161
  resolved, 0 unresolved.
