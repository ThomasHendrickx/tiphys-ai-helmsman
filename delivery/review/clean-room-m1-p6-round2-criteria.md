# CR-660 series: clean-room CRITERIA-CONTRACT review, PR #9 (M1-P6), FIX ROUND

- Head reviewed: `8954b05` (`8954b058af96af4e8e913416abcc68516f556a9b`)
- Previous reviewed head: `79604ec` (round 0, APPROVE, CR-620 to CR-624)
- Branch: `claude/m1-p6-toy-sandbox-exit`
- Base: `origin/main` at `58ac9649f243b563805fa46a3c17c399768604e8`
- Reviewer role: CRITERIA-CONTRACT, REGRESSION mandate (T-007 pairing; a
  concurrent HAZARD-CONTRACT reviewer is working the same head in the
  sibling worktree `cr-p6b-hazard`, not read here)
- Worktree: detached worktree at `8954b05`,
  `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/cr-p6b-criteria`
- No file in `/home/user/tiphys-ai-helmsman` or in the sibling worktree
  `cr-p6b-hazard` was written by this review. This review did not push,
  commit, or write to the real sandbox repository
  (`ThomasHendrickx/tiphys-ai-helmsman-sandbox`); every harness run used
  `file://` scratch remotes exclusively, per the isolation instructions.
- Toolchains: Node v26.6.0 (npm 11.18.0) from
  `.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin` put first on PATH
  for every "Node 26" row; the container default Node v22.22.2 with no
  PATH override for every "Node 22" row.

## Method

Every criterion, every mutation, and every gate number below was produced
by this session executing a command in the worktree above: fresh `npm ci`,
fresh builds, fresh harness runs against scratch `file://` remotes, and a
from-scratch registry-resolution script. Nothing here is copied from the
implementer's transcripts, the work history's own tables, or bundles left
on disk by earlier passes. Where a work-history number is quoted, it is
quoted to compare against a number this review separately produced.

## Verdict

**APPROVE, with one medium finding recorded and left to the orchestrator's
judgment (CR-661) plus one informational reliability note (CR-662).**

All six acceptance criteria are met, re-executed independently against the
fix-round head, and every number reported by the previous round's work
history and by the previous criteria review (`79604ec`) still holds
exactly at `8954b05`, with the improvements the round claims (53-record
bundle, `recordsInBundle` matching the directory, 155/161 counts)
independently confirmed. The mutation table for the two new registered
behaviors is not clean, though: one of the two required mutations for
`exit-test-falsifiability-guard-wired` (defanging the CI guard with
`|| true`) does NOT redden the test under either of two natural
placements this review tried, contradicting the work history's own W4
claim of "same test red". This is CR-661, medium, and is the central
finding of this round's regression walk. No criterion is unmet by it: the
CI step itself still runs and still enforces the real check (confirmed
live against the PR's actual workflow run), so criterion 5's live wiring
holds. What is weakened is the RE-REGRESSION guard the round installed
specifically to protect that wiring going forward, which is precisely the
property this fix round exists to add (CR-605's whole point).

This APPROVE is explicitly qualified by the "what this contract cannot
see" section below, per T-007.

## Criteria table (all six re-walked from zero against 8954b05)

| # | Criterion | Verdict | Re-executed by this review |
|---|---|---|---|
| 1 | file:// clone and real repo: npm ci + npm test exit 0, >=1 test, PR-211 identity distinction | MET | Yes (file:// form fully; real-repo form re-confirmed via this round's own `npm test` run of the unchanged behavior, not re-touched against the live remote, see note below) |
| 2 | `m1-exit-test.sh --mode local` exits 0, complete evidence bundle, 53 records, `recordsInBundle` matches directory | MET | Yes, own bundle |
| 3 | teardown refusal / watcher line byte-exact / teardown-after-merge | MET | Yes, own bundle, `cat -A` |
| 4 | gates CI check green on this PR at `8954b05`, falsifiability step completes (not skipped/timed out) | MET | Yes, GitHub API + job log |
| 5 | falsification run exits nonzero at C2, `043-C2.json` exitCode 1 outcome fail | MET | Yes, own bundle |
| 6 | node --test exit 0, 0 unaccounted, 161 mappings resolve by name, nothing dropped/retitled | MET | Yes, own scripted check plus `git diff` on `behaviors.json` |

6 criteria, 6 met, 0 not-met, 0 not-verifiable-here.

## Criteria walk, in order

### Criterion 1: sandbox clone (regression check)

**As written**: npm ci and npm test exit 0 with >=1 test in a clone of the
seeded toy repo, both the file:// and real-repo forms, with the PR-211
identity distinction.

**Verdict: MET (no regression).**

This round's diff touches none of `sandbox/`, `scripts/seed-sandbox.sh`,
or `scripts/stub-payload.sh` (confirmed: `git diff --stat 79604ec..HEAD`
lists only `.github/workflows/gates.yml`, `delivery/work-history/m1-p6.md`,
`scripts/m1-exit-test.sh`, `test/behaviors.json`,
`test/exit-test-local.test.ts`). The registered behavior
`sandbox-clone-npm-ci-and-test` ran green in this review's own full-suite
runs on both toolchains (see gates table). This review deliberately did
NOT re-clone or re-push to the real sandbox repository
(`ThomasHendrickx/tiphys-ai-helmsman-sandbox`): the round's own diff
cannot regress that path, the previous criteria review (`clean-room-m1-p6-
criteria.md`, criterion 1b) already independently inspected the real
repository's commit identities read-only at `79604ec`, and re-touching
shared mutable state to re-confirm an unchanged code path is the kind of
unnecessary mutation the isolation instructions ask reviewers to avoid.
Scope of this decision: this review's criterion-1 verdict rests on (a) the
unchanged-diff argument and (b) this round's own green `sandbox-clone-npm-
ci-and-test` runs against `file://` remotes, not on a fresh read of the
live remote.

### Criterion 2: local-mode harness, complete evidence bundle

**As written**: `scripts/m1-exit-test.sh --mode local <evidence-dir>`
exits 0; the bundle contains records for every stage A/C step plus the
stage B substitution; CLI invocations resolve to `dist/bin/tiphys.js`;
harness/stub commits carry the documented identity.

**Verdict: MET.**

Own execution:

```
$ bash scripts/m1-exit-test.sh --mode local <this review's own dir>
... (steps A1 through C3, all ok/recorded)
m1-exit-test: local mode complete, evidence in <dir>
exit 0        real 1m55.6s
```

Own bundle counts, produced independently:

| Item | Claimed (fix-round work history) | This review's own run |
|---|---|---|
| records in `records/` (`ls \| wc -l`) | 53 | 53 |
| `bundle-validation.out` `recordsInBundle` | 53 | 53 |
| `bundle-validation.out` `recordsValidated` | not stated numerically, but noted as "one less than the bundle" (the C3 record itself) | 52 (= 53 - 1, the validation's own record, exactly the documented reason at `scripts/m1-exit-test.sh:916-921`) |
| `bundle-validation.out` `problems` | `[]` | `[]` |
| `tiphysInvocations` | 12 | 12 |
| Records where `observed == expected` (the CR-602 "different class, real measurement" sweep) | 6, specific labels named | 6, identical labels: seed commit identity, task branch pushed, stub payload commit identity, watcher wake line, stage B squash commit identity, task meta closed |

The `recordsInBundle` vs. directory-count agreement (53 = 53) is exactly
the CR-606 fix under test, verified against this review's own bundle
rather than the implementer's.

### Criterion 3: teardown refusal / watcher line / teardown-after-merge

**Verdict: MET.**

From this review's own bundle (same run as criterion 2):

- `032-A7.json`: `exitCode: 1`, `outcome: pass`. `033-A7.json`: reason line
  `"tiphys teardown: branch task/m1-exit is not landed on origin/main;
  land it before tearing the task down"`. `034-A7.json`: worktree
  `exists`.
- `output/watch.out`: `wc -c` = 24, `cat -A` = `signal m1-exit turn-end$`
  (one line, `$` terminator only, byte-exact match).
- `049-C2.json`: `exitCode: 0`, `outcome: pass`. `050-C2.json`: worktree
  `absent`. `051-C2.json`: task meta `closed`.

All three assertions independently reproduced at byte level.

### Criterion 4: gates CI check on the phase PR at `8954b05`

**Verdict: MET.**

Direct GitHub API observation, this review's own call, against the exact
head required:

```
pull_request_read(get, PR #9): head.sha = 8954b058af96af4e8e913416abcc68516f556a9b, state open
pull_request_read(get_check_runs, PR #9):
  gates        completed / success   (started 13:00:33, completed 13:00:37)
  test (26)    completed / success   (started 12:55:38, completed 13:00:30, ~4m52s)
```

The `test (26)` job log (fetched directly, not summarized) shows the
falsifiability step actually executing the full harness a second time,
not being skipped: it runs the whole green path first (A1 through C3), and
then a second full harness invocation with
`TIPHYS_EXIT_TEST_SKIP_STAGE_B=1`, ending with
`falsifiability guard witnessed at C2: exitCode 1` before the job
completes. The ~4m52s runtime for `test (26)` (vs. a single-pass job that
would be roughly half that) is consistent with the "two full harness runs
per leg" the workflow's own comment describes, so this is not a case of
the step being present but timed out or truncated.

### Criterion 5: falsification run

**Verdict: MET.**

```
$ TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 bash scripts/m1-exit-test.sh --mode local <dir>
...
m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge): expected exit zero, got 1
exit 1
```

`043-C2.json` in that bundle: `exitCode: 1`, `expected: "exit zero"`,
`outcome: "fail"`. Exact match to the number named in the dispatch brief
and to the work history's claim.

### Criterion 6: node --test and the behavior registry

**Verdict: MET**, with one reliability caveat recorded separately as
CR-662 (not a criterion failure; see below).

Node 26, `npm test` (the declared gate command): **155 tests, 155 pass, 0
fail, 0 skipped**, exit 0. Node 22: **155 tests, 153 pass, 0 fail, 2
skipped** (both skips are the documented pre-existing floor-gated `doctor`
tests, unrelated to this round), exit 0.

Registry check, done with a script this review wrote (captures raw TAP via
`node --test --test-reporter=tap`, extracts every top-level `ok`/`not ok`
title, and set-compares against every value in `test/behaviors.json`):

```
Distinct top-level test titles found in TAP: 155
behaviors.json entries: 161
unresolved: 0
```

`git diff 79604ec..HEAD -- test/behaviors.json` shows a purely additive
diff: the file's 159 pre-round entries are untouched (same keys, same
values, same order) and exactly two entries are appended:
`exit-test-step-failure-is-fatal` and
`exit-test-falsifiability-guard-wired`. Nothing was renamed, retitled, or
removed anywhere in the file, confirmed by inspecting the full diff, not
just the count.

## Mutation testing (required)

Rule applied: a test counts only if demonstrated red against the
DANGEROUS state. Every mutation below was applied with `Edit`/`sed`/`cp`,
run, then restored, with a `diff` against a pristine copy confirming
byte-identical restoration and `git status --porcelain` confirming a clean
tree after every restoration.

| # | Behavior | Mutation | Observed result | Restored-clean confirmation |
|---|---|---|---|---|
| W1 | `exit-test-step-failure-is-fatal` | `run_step`'s outcome computation deleted so every step scores `pass` unconditionally | RED: 0 pass, 1 fail (the test's assertion on the failing `npm ci` message now fails because the harness runs past A1's failure and dies later on a different assertion instead; still 0/1) | `diff` against pristine `scripts/m1-exit-test.sh`: identical; `git status --porcelain`: clean |
| W2 | `exit-test-step-failure-is-fatal` | `die` on a failed `run_step` replaced with `true` (`die "..."` to `true "..."`) | RED: 0 pass, 1 fail (harness continues past the failing step, same assertion mismatch as W1) | `diff`: identical; `git status --porcelain`: clean |
| W3 | `exit-test-falsifiability-guard-wired` | The whole falsifiability step (comment block plus the step) deleted from `gates.yml` | RED: 0 pass, 1 fail (`assert.match` on the SKIP_STAGE_B line fails) | `diff` against pristine `gates.yml`: identical; `git status --porcelain`: clean |
| W4a | `exit-test-falsifiability-guard-wired` | `if TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 scripts/m1-exit-test.sh --mode local "${evidence}" \|\| true; then` (appended to the `if` condition) | **GREEN: 1 pass, 0 fail. The test did NOT catch this mutation.** | `diff`: identical; `git status --porcelain`: clean |
| W4b | `exit-test-falsifiability-guard-wired` | `' "${evidence}" \|\| true` appended to the very end of the enforcement `node -e` invocation (the command whose `process.exit(1)` is the actual thing that fails the CI step under the workflow's `bash -e {0}` shell, confirmed via the job log's `shell: /usr/bin/bash -e {0}` line) | **GREEN: 1 pass, 0 fail. The test did NOT catch this mutation.** | `diff`: identical; `git status --porcelain`: clean |
| RP-1 | reporter-pin (`sandbox-clone-npm-ci-and-test`, a round-old fix, re-confirmed because this round touched the same test file) | `sandbox/src/greet.js`: `hello, ${name}` to `HELLO, ${name}` (genuine sandbox failure) | RED: 0 pass, 1 fail, `AssertionError [ERR_ASSERTION]: expected 1 !== 0` equivalent (npm test exit 1 caught) | `diff` against pristine `greet.js`: identical |
| RP-2 | reporter-pin, same behavior | `sandbox/test/greet.test.js` moved out of the tree (vacuous suite) | RED: 0 pass, 1 fail, `expected: true, actual: false` (the `# pass >= 1` assertion catches the zero-test state) | File moved back; `git status --porcelain sandbox/`: clean |

**Finding on W4a/W4b.** Both are real, independently reproduced negative
results, not a single fluke: two different, realistic placements of
`|| true` (on the `if` line, and on the actual enforcement command whose
exit code the workflow's `bash -e` shell depends on to fail the step) both
leave `exit-test-falsifiability-guard-wired` green. The test's three
`assert.match` calls check for the LITERAL TEXT of the SKIP_STAGE_B
invocation, the "FALSIFIABILITY GUARD BROKEN" echo, and the `-C2.json` /
"no C2 record..." strings, all of which remain present, unchanged, and
byte-identical in the workflow file after either mutation, because `||
true` only changes the SHELL EXIT-CODE SEMANTICS of a line whose text the
test does not otherwise alter. The test verifies that the safety text is
still IN the file; it does not verify that the safety text's associated
command is still WIRED to control the step's exit status. This directly
contradicts the fix-round work history's own claim
(`delivery/work-history/m1-p6.md`, W4 row: "the CI step kept but defanged
to `... \|\| true` | same test red"). Recorded as **CR-661, medium**
below, per T-006: an unfalsified claim of coverage in the artifact a later
reviewer is meant to trust.

## Findings

### CR-661 (medium): `exit-test-falsifiability-guard-wired` does not redden against a realistic `|| true` defang, contradicting the work history's W4 claim

**Claim under review**: `delivery/work-history/m1-p6.md`, the W4 row of
the CR-605 red-witness table: "the CI step kept but defanged to `... ||
true`" is claimed to leave the registered test `exit-test-falsifiability-
guard-wired` red.

**Why it is wrong**: two independently reproduced mutations (see W4a, W4b
above) that both fit the description "the CI step kept but defanged to
`|| true`" leave the test GREEN. The test (`test/exit-test-local.test.ts`
lines 276-302) asserts three regex matches against the raw text of
`.github/workflows/gates.yml`. None of the three regexes constrain the
EXIT-CODE BEHAVIOR of the commands they match against; they constrain
only the presence of certain substrings. `|| true` changes exit-code
behavior while leaving every substring the test checks for completely
intact, so it is invisible to a text-match assertion.

**Evidence**: this review's own W4a and W4b rows above, each with the raw
TAP output (`# tests 1 / # pass 1 / # fail 0`) and a confirmed
byte-identical restoration afterward. The workflow's shell is confirmed
`bash -e {0}` from the PR's own job log
(`mcp__github__get_job_logs`, job 92311963779, line
`shell: /usr/bin/bash -e {0}`), which is what makes `|| true` on the
enforcement command (W4b) a realistic, not merely theoretical, defang: it
is exactly the idiom used to suppress a `set -e` abort on a command whose
failure should otherwise kill the step.

**Severity rationale**: not a criterion failure (criterion 4 and criterion
5 are both independently MET by direct execution against the live PR and
this review's own local runs, so the guard IS correctly wired right now).
The severity is that the round's own new regression protection for that
wiring, the thing CR-605 was specifically about, has a known and easily
reachable blind spot to exactly the defanging pattern the work history
claims to have tested. A future PR that touches `gates.yml` could apply
either W4a's or W4b's change, keep every other test green, and this test
would not tell anyone.

**Fix**: strengthen `exit-test-falsifiability-guard-wired` to check
WIRING, not just text presence. Two independent options, either
sufficient alone: (a) parse the YAML `run:` block for the falsifiability
step and reject any occurrence of `|| true` (or more generally, assert the
enforcement `node -e` command is not followed by anything that could
swallow its exit code); (b) actually execute the step's shell logic (as
`test/exit-test-local.test.ts` already does for other harness paths) with
a defanged copy of the script substituted in, and assert the copy's exit
code is 0 rather than merely grepping the source for markers. Given this
is a fix-round finding on top of a fix round, and the underlying CI wiring
is currently correct and the criteria are all met, this is left to the
orchestrator's disposition (a further, narrow fix-round item, or a tracked
item per the CR-608 precedent) rather than blocking this round's merge
outright.

### CR-662 (informational, reliability note): a pre-existing, out-of-scope test flaked once in four full-suite runs at this exact head

While reproducing criterion 6, one of four full-suite Node 26 runs (raw
`node --test --test-reporter=tap "test/**/*.test.ts"`) came back **154
pass, 1 fail** instead of 155/155. The failing test was `test/watcher.test.ts`'s
`a resident watcher and a concurrent single pass never both surface a
wake` (line 500), with the assertion message `round 1: once="signal t1
turn-end\n" (exit 0) resident="signal t1 turn-end\n" (exit 0)`: both
paths surfaced the wake, where the test expects exactly one to. Run in
isolation with `--test-name-pattern`, the same test passed 3/3 times. Two
subsequent full-suite runs (raw TAP, same command) came back clean
155/155/0. `test/watcher.test.ts` is untouched by this phase
(`git log --oneline -- test/watcher.test.ts` shows only the M1-P5 merge
commit `58ac964`; this round's `git diff --stat 79604ec..HEAD` does not
touch it).

Scope of this observation: four full-suite runs at this exact head, no
attempt to determine an exact flake rate or root-cause the concurrency
race. Not a finding against this phase (the file is out of the round's
files-to-touch and out of scope for a criteria walk of M1-P6), and not
against criterion 6 as worded (which this review's authoritative,
reproducible runs satisfy: the two runs quoted in the gates table below
are the ones used to certify the criterion, both clean). Recorded because
CLAUDE.md's gate 3 ("node --test exits 0") is stated as a hard, binary
gate, and a reviewer or CI run that happened to land on the unlucky
1-in-4 draw would see a red gate on an unrelated, pre-existing race. Worth
a look by whichever phase next touches `test/watcher.test.ts` or the
concurrent-watch fixtures; not routed further by this review since
`watcher.test.ts` is M1-P5's artifact, not this phase's.

## Gates, both toolchains (this review's own runs)

| Gate | Node v26.6.0 (declared floor) | Node v22.22.2 (container default) |
|---|---|---|
| `npm ci` | exit 0, 0 EBADENGINE lines | exit 0, 5 EBADENGINE lines (expected) |
| `npm run build` | exit 0 | exit 0 |
| `git status --porcelain` after build | clean | clean |
| `npm test` (authoritative run, used for the criteria table) | exit 0: **155 tests, 155 pass, 0 fail, 0 skipped** | exit 0: **155 tests, 153 pass, 0 fail, 2 skipped** (documented floor-gated `doctor` tests) |
| behavior registry by name (own script) | 161 mappings, **0 unresolved** | not re-run (Node 26 is the authority per the project's own stated policy) |
| `bash -n` on all three exit-test scripts | exit 0 (all three) | not re-run |
| non-ASCII scan (`grep -rP '[^\x00-\x7F]'`) over this round's 5 changed files | exit 1 (no matches) | same |
| em dash scan over the same 5 files | exit 1 (no matches) | same |

These numbers match the work history's claimed "155/155/0/0" (Node 26)
and "155/153/0/2" (Node 22) exactly, modulo the CR-662 flake noted above,
which this review treats as a reliability observation, not a
contradiction of the claimed authoritative numbers (both of which this
review separately, cleanly reproduced).

## Scope audit

```
$ git diff --name-only 79604ec..HEAD
.github/workflows/gates.yml
delivery/work-history/m1-p6.md
scripts/m1-exit-test.sh
test/behaviors.json
test/exit-test-local.test.ts
```

Declared files-to-touch for this phase: `sandbox/`,
`scripts/seed-sandbox.sh`, `scripts/m1-exit-test.sh`,
`scripts/stub-payload.sh`, `test/exit-test-local.test.ts`,
`.github/workflows/gates.yml`, plus the two standing pre-authorized
extras `test/behaviors.json` and `delivery/work-history/m1-p6.md`. All 5
files this round touches are on that list (3 declared, 2 standing
extras). **Scope audit passes, no unauthorized file.**

Whole-phase diff (`git diff --name-only origin/main...HEAD`) is unchanged
in shape from the previous round's confirmed list, with the same 5-round-2
files layered on top; no new top-level area was touched.

## Conventions

- Pure ASCII: `grep -rP '[^\x00-\x7F]'` over this round's 5 changed files:
  exit 1, no matches. PASS.
- No em dashes: same file set, no matches. PASS.
- npm only: no `yarn.lock` or `pnpm-lock.yaml` anywhere outside
  `node_modules/`. PASS.
- No AI/model/tool names in this round's own commit:
  `git log 79604ec..HEAD --format='%H %s%n%b' | grep -inE
  'claude|anthropic|gpt|openai|copilot'` exits 1 (no match) for the
  round's single commit `8954b05`. The one known instance from the prior
  round (CR-624, commit `8c630df`, already dispositioned "no action,
  arbitrated non-blocking") is unchanged and outside this round's own
  commit range; re-confirmed present only when the range is widened to
  `origin/main..HEAD`, not reintroduced by this round.

## Probes run (including empty-handed ones, with scope stated)

| Probe | Scope | Result |
|---|---|---|
| Non-ASCII scan | The 5 files this round changed | Empty (exit 1). Does not cover files this round did not touch; the whole-repository scan is the prior review's job, not repeated here. |
| Em dash scan | Same 5 files | Empty |
| AI/tool name scan | `git log 79604ec..HEAD`, subject + body of this round's own commit only | Empty. Widening to `origin/main..HEAD` reproduces the known, already-dispositioned CR-624 match and nothing new. |
| yarn/pnpm lockfile scan | Whole worktree except `node_modules/` | Empty |
| Registry resolution scan | Own from-scratch script against own Node-26 raw TAP capture, all 161 `behaviors.json` entries | 0 unresolved |
| `bash -n` scan | All three exit-test scripts (`m1-exit-test.sh`, `seed-sandbox.sh`, `stub-payload.sh`) | All exit 0, no syntax errors |
| `\|\| true` / `shell:` override scan in the test suite, for a wiring-level (not text-level) check on the falsifiability guard | `test/exit-test-local.test.ts`, `.github/workflows/gates.yml` | Empty in both: confirms CR-661's gap is real (no other test or workflow construct catches the exit-code-swallowing mutation) |
| Full-suite flake repeat | 4 raw-TAP full-suite runs on Node 26 at this exact head | 1 of 4 showed a `watcher.test.ts` flake (CR-662); isolated re-run of that single test was 3/3 green. Scope: 4 runs at this head only, no attempt at a larger sample or root cause. |
| Full-mode (`gh` present) CR-600 re-walk with a fake `gh` and real approval flow | Attempted setup only (a minimal `gh` stand-in was written); NOT completed | Deliberately abandoned partway (see honest-failure below); this is a negative result of EFFORT, not of absence, and must not be read as "the full-mode CR-600 fix was independently reproduced by this review." It was not. |

No probe above should be read as "no defect exists in the area it
covers" beyond its stated scope, per this project's own repeated
tuition on wrongly-scoped negative results.

## Honest-failure section

1. **The W4 mutation contradicts a claim this review was told to expect
   as confirmed.** The dispatch brief stated "Reported: ... same test
   red" for the `|| true` defang. This review tried two different
   placements of that mutation and got green both times. Rather than
   assume the dispatch brief's summary was simply imprecise about which
   exact diff the implementer applied, this review is reporting the
   contradiction directly as CR-661, because a third possible reading
   (some other, narrower `|| true` placement that DOES redden the test)
   cannot be ruled out from this review's own two attempts, and the
   review does not have the implementer's exact diff to check against.
   This is disclosed as a limitation of this review's own reproduction,
   not asserted as certain proof the implementer never tested it; what
   is certain, independently and directly demonstrated twice, is that
   the CURRENT test as it exists in the repository at `8954b05` does not
   catch at least two realistic instances of the described mutation.
2. **The full-mode CR-600 fix (the `write_session` sequencing fix and the
   `validate_bundle` B1 requirement) was not independently re-walked by
   this review.** A fake `gh` stand-in was started but the full
   scaffolding needed (a genuine writable scratch remote playing the
   sandbox's role, `--stage a` then `--stage c` with an approval file,
   and reproducing the exact recordSeq handoff CR-600 is about) was
   judged too large to complete rigorously within this review's time
   budget alongside the six-criteria walk and the required mutation
   table. This review instead read the relevant code
   (`write_session`, `stage_b_full_pending`, the `session_file` recordSeq
   handoff) and confirmed it matches the shape the work history describes,
   which is verification-by-reading, not verification-by-execution, and
   is disclosed as such rather than reported as an executed reproduction.
3. **This reviewer's own full-suite Node 26 run flaked once (CR-662)**
   before this review understood the cause. Recorded in full rather than
   quietly re-run and forgotten, per this project's evidence-over-
   assertion norm.

Nothing else was found that the work history claimed and this review
could not reproduce; all six criteria, all four `bash -n` and ASCII/em-
dash scans, the scope audit, and five of the six mutation rows behaved
exactly as claimed.

## What this contract cannot see

Per T-007, an "all criteria met" verdict from this contract is one input,
not a terminal judgment. Defect classes this contract structurally cannot
reach on this round, independent of how carefully it is executed:

1. **Anything the six criteria do not describe**, unchanged from the
   previous round's own statement of this limit: hostile filesystem
   states in `state/`, concurrent invocations of the harness against one
   scratch work directory, resource exhaustion, or a process killed
   mid-step rather than completing or cleanly failing. This round added
   failure machinery (`run_step`'s abort path, the `EXIT` trap) that is
   itself squarely in that hazard class, and a criteria walk that only
   confirms the six clauses still pass produces no signal about whether
   the NEW machinery introduces its own new hazard (a trap that fires at
   the wrong time, a `die` that races the trap's `kill`, and so on). That
   question belongs to the concurrent hazard-contract review.
2. **The gap this round's own CR-661 finding exposes, generalized**: this
   contract found ONE way in which a "regression test" added to guard a
   property does not actually guard it (text-match instead of
   wiring-match). It did not exhaustively search for others of the same
   shape elsewhere in this round's new tests (`exit-test-step-failure-is-
   fatal`'s own assertions were only mutation-tested against the two
   mutations the dispatch brief specified, W1 and W2; no attempt was made
   to find a THIRD way to defeat it that those two do not cover).
3. **Full-mode correctness under a real `gh` and a real approval flow**,
   per the honest-failure section above: this review verified the local-
   mode path exhaustively and the full-mode CR-600 fix only by reading
   code, not by executing it. A defect specific to the full-mode
   recordSeq handoff that differs from what the code visually appears to
   do would not be caught by this contract on this round.
4. **Concurrent access to the real sandbox repository**, unchanged from
   the previous round's statement: this review, like the implementer's
   own fix-round work, used only `file://` scratch remotes throughout.
5. **Anything the hazard-contract reviewer is specifically tasked to find
   in this same diff.** This review deliberately did not read the sibling
   worktree `cr-p6b-hazard` and did not attempt to duplicate its brief.

## Summary for the record

- Verdict: **APPROVE**, with CR-661 (medium) recorded for the
  orchestrator's disposition and CR-662 (informational) recorded as a
  reliability note.
- Criteria: 6 stated, 6 met, 0 not-met, 0 not-verifiable-here.
- Findings: 2 total. 0 high, 1 medium (CR-661), 0 low, 1 informational
  (CR-662).
- Mutation table: 7 rows (W1, W2, W3, W4a, W4b, RP-1, RP-2). 5 of 7 behaved
  as claimed (red-then-clean-restore). 2 of 7 (W4a, W4b) did NOT redden
  the target test, contradicting the work history's W4 claim; both
  restorations confirmed byte-identical regardless.
- Gates: Node 26 exit 0, authoritative run 155/155/0/0-skip (one of four
  raw-TAP runs showed an unrelated, out-of-scope, pre-existing flake in
  `test/watcher.test.ts`, CR-662); Node 22 exit 0, 155/153/0/2-skip;
  behavior registry 161/161 resolved by name, 0 unresolved, both matching
  the work history's claimed numbers exactly.
