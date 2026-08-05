# CR-620 series: clean-room CRITERIA-CONTRACT review, PR #9 (M1-P6)

- Head reviewed: `79604ec` (`79604ecd36cea50e0d4e8fcb0f7b574887eeb9d2`)
- Branch: `claude/m1-p6-toy-sandbox-exit`
- Base: `origin/main` at `58ac9649f243b563805fa46a3c17c399768604e8`
- Reviewer role: CRITERIA-CONTRACT (T-007 pairing; a concurrent HAZARD-CONTRACT
  reviewer is working the same head in a sibling worktree, not read here)
- Worktree: detached worktree at `79604ec`,
  `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/cr-p6-criteria`
- No file in `/home/user/tiphys-ai-helmsman` or in the sibling worktree
  `cr-p6-hazard` was written by this review.
- Toolchains used: Node v26.6.0 (npm 11.18.0) from the scratch prefix
  `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/toolchain/node-v26.6.0-linux-x64/bin`,
  put first on PATH for every "Node 26" row below; the container default
  Node v22.22.2 for every "Node 22" row, with no PATH override (default
  shell PATH resolves `node` to `/opt/node22/bin/node`).

## Method

Every criterion, every mutation, and every gate number below was produced by
this session executing a command in the worktree above, not by reading the
implementer's transcripts, the evidence bundles left on disk by the build or
validation passes, or the work history's own tables. Where a number in the
work history is quoted, it is quoted to compare against a number this review
separately produced, never as the basis for a verdict on its own.

The real sandbox repository (`ThomasHendrickx/tiphys-ai-helmsman-sandbox`)
was read via a repository attachment already present in this session
(`add_repo` returned `already_present`) and a clone at
`/workspace/tiphys-ai-helmsman-sandbox`, a path outside this review's
scratch directory because it is where the session's repo-attachment
mechanism places it. This review did not push, commit, or write anything to
that remote: the only operations performed there were `git fetch`,
`git checkout FETCH_HEAD -- .` (which stages content locally but changes no
ref), `git ls-remote`, `npm ci`, and `npm test`. `git ls-remote origin`
before and after this review's session shows the remote unchanged at
`27c882f521694e8ba72969a4257aaa31e1d58adb`. This is stated explicitly per
the isolation instructions because the repository is shared mutable state a
concurrent reviewer may also be observing.

## Verdict

**APPROVE.**

All six acceptance criteria are met, re-executed independently by this
review and matching the work history's numbers exactly everywhere they were
checked (with one immaterial exception explained under "probes-run", caused
by this reviewer's own invocation error, not the codebase). The mutation
table is 5 for 5 red-then-green. Gate numbers match on both toolchains. The
scope audit passes. Conventions pass except one low-severity, defensible
literal-text item (CR-624). No high or medium finding survived investigation.

This APPROVE is explicitly qualified by the "what this contract cannot see"
section below, per T-007: a clean criteria walk is evidence of criteria
compliance, not evidence of absence of hazard, and the hazard-contract
review running concurrently on this same head is not superseded by this
verdict.

## Criteria table

| # | Criterion | Verdict | Deferred at build time? | Re-executed by this review |
|---|---|---|---|---|
| 1 | file:// clone: npm ci + npm test exit 0, >=1 test | MET | No (file:// form) | Yes |
| 1 | real repo: same, plus PR-211 identity distinction | MET | Yes (real form; owner action A-1) | Yes |
| 2 | `m1-exit-test.sh --mode local` exits 0, complete evidence | MET | Yes | Yes |
| 3 | teardown refusal / watcher line / teardown-after-merge, from evidence | MET | Yes | Yes |
| 4 | gates CI check green on this PR | MET | Yes | Yes (observed via GitHub API) |
| 5 | falsification run (`SKIP_STAGE_B=1`) exits nonzero at C2 | MET | Yes | Yes |
| 6 | `node --test` exit 0, behaviors.json resolves by name, nothing removed | MET | No | Yes |

6 criteria, 6 met, 0 not-met, 0 not-verifiable-here.

## Criteria walk, in order

### Criterion 1a: file:// seeded repository

**As written** (plan section M1-P6, acceptance criterion 1): "In a clone of
the seeded toy repo, `npm ci` and `npm test` exit 0 with at least 1 test."

**Verdict: MET.**

Execution evidence: the registered test `a clone of the seeded sandbox
passes npm ci and npm test with at least one test` (behavior
`sandbox-clone-npm-ci-and-test`) ran as part of the full `npm test` suite
on both toolchains (see gates table below), and this review also drove the
same path directly through `scripts/m1-exit-test.sh --mode local` (records
`006-A1.json` through `010-A1.json`, all `outcome: pass`), reproduced in
full under "Criterion 2" below. `010-A1.json`'s own assertion is the
identity half: expected and observed both
`Tiphys Exit Test <exit-test@tiphys.invalid> / Tiphys Exit Test
<exit-test@tiphys.invalid>`.

This form neutralizes global git configuration
(`test/exit-test-local.test.ts:86-87` sets `GIT_CONFIG_GLOBAL` and
`GIT_CONFIG_SYSTEM` to nonexistent paths) and then commits anyway, which is
the "not REQUIRED" half of PR-211. It structurally cannot witness the "not
READ" half, because it removes the configuration the claim is about; that
is criterion 1b.

### Criterion 1b: real sandbox repository

**As written**: same acceptance criterion, discharged against
`ThomasHendrickx/tiphys-ai-helmsman-sandbox`, deferred at build time on
owner action A-1 and on push authorization (see work history "First
attempt" and "Second attempt").

**Verdict: MET.**

This review independently cloned and inspected the real repository
read-only (method section above) rather than trusting the claimed commit
identity:

```
$ git log --format='%H  author: %an <%ae>  committer: %cn <%ce>  subject: %s  date: %ad' --date=iso
27c882f521694e8ba72969a4257aaa31e1d58adb  author: Tiphys Exit Test <exit-test@tiphys.invalid>  committer: Tiphys Exit Test <exit-test@tiphys.invalid>  subject: seed toy sandbox project content
7e514e1997ec564e831afe11946e1bf175824ed5  author: Drift Probe <drift@invalid>  committer: Drift Probe <drift@invalid>  subject: drift probe: make the remote differ from the seed content
7211d7150c7fcc251f707d2862d6085800d9c5fb  author: Tiphys Exit Test <exit-test@tiphys.invalid>  committer: Tiphys Exit Test <exit-test@tiphys.invalid>  subject: seed toy sandbox project content
```

This container's own ambient identity, checked directly, differs:

```
$ git config --global user.name   -> Claude
$ git config --global user.email  -> noreply@anthropic.com
```

Neither seed commit is authored or committed as `Claude
<noreply@anthropic.com>`. This is the executed witness for "no global git
configuration is READ": an identity is present, is different from the
committed identity, and was not used. The claimed distinction between the
file:// form ("not required") and the real form ("not read") holds under
independent inspection.

Round trip in the real clone, executed by this review (not copied from the
work history):

```
$ npm ci     -> exit 0 ("up to date, audited 1 package")
$ npm test   -> exit 0, 2 tests, 2 pass, 0 fail
```

The disclosed drift-probe commit (`7e514e1`, `Drift Probe <drift@invalid>`)
is present in history exactly as the work history and the PR body disclose
it; the repository's tree at `27c882f` is the pristine seed content
(`README.md`, `package-lock.json`, `package.json`, `src/greet.js`,
`test/greet.test.js`), matching the file list the work history claims.

Discharging command (work history): the seed-then-clone-then-round-trip
sequence quoted above; this review ran the clone/ci/test half of it and
independently inspected the commit log rather than re-running the seed
step (which would mutate shared state unnecessarily; the seed's effect is
already the head this review read).

### Criterion 2: local-mode harness exits 0 with a complete evidence bundle

**As written**: `scripts/m1-exit-test.sh --mode local <evidence-dir>` exits
0 on a machine with only git, Node 26+, and npm; the evidence directory
contains records for every stage A/C step plus the stage B substitution,
CLI invocations resolving to `dist/bin/tiphys.js`, and harness/stub commits
carrying the documented identity.

**Verdict: MET.**

Execution:

```
$ scripts/m1-exit-test.sh --mode local <this review's own evidence dir>
m1-exit-test: local mode complete, evidence in <dir>
exit 0        real 2m8.432s
```

(no `gh` on PATH in this container, `which gh` exits 1, so this executed
the gh-absent branch, same as the reported build-time and validation-pass
runs.)

Independently counted from the evidence THIS review produced (not the
implementer's bundle):

| Item | Claimed (work history) | This review's own run |
|---|---|---|
| JSON records, all parse | 51 | 51 |
| Steps represented | 12 (all) | 12 (all) |
| Per-step counts A1..C3 | 10,7,4,1,3,5,3,2,7,4,3,2 | 10,7,4,1,3,5,3,2,7,4,3,2 |
| kind=executed / assertion / substituted / skipped-full-only | 30/17/2/2 | 30/17/2/2 |
| step-map.json entries | 12, dispositions A1/A6/B1/C1=local-substitute, rest=both | identical |
| CLI invocations resolving to `dist/bin/tiphys.js` | 12 | 12 (the 13th `grep` hit is `004-A1.json`'s assertion text, not a command array; confirmed by inspection) |
| Identity assertions (010-A1, 028-A6, 041-B1) | all pass, harness identity both sides | reproduced identically in this review's own bundle |

Every number matches. This is a full independent reproduction, not a
sampling.

### Criterion 3: teardown refusal / watcher line / teardown-after-merge

**As written**: from the local-mode evidence, verifiably: teardown refusal
nonzero while unmerged, watcher exit line matching `signal <task-id>
turn-end`, teardown exit 0 after the squash merge.

**Verdict: MET.**

From this review's own bundle (the same run as criterion 2):

- `030-A7.json`: `exitCode: 1`, `expected: "exit nonzero"`, `outcome:
  pass`. `031-A7.json` confirms the reason line names the branch
  (`branch task/m1-exit is not landed on origin/main; land it before
  tearing the task down`). `032-A7.json` confirms the worktree still
  `exists`.
- `033-A8.json`/`034-A8.json`: the resident watcher exits 0, and this
  review byte-dumped the captured output rather than trusting a loose
  match:
  ```
  $ wc -c output/watch.out
  24 output/watch.out
  $ cat -A output/watch.out
  signal m1-exit turn-end$
  ```
  24 bytes, one line, terminator only, no trailing content. Exact match to
  the claimed line.
- `047-C2.json`: `exitCode: 0`, `expected: "exit zero"`, `outcome: pass`,
  output `torn down m1-exit`. `048-C2.json` worktree `absent`.
  `049-C2.json` task meta `closed`.

All three assertions verified from this review's own evidence files, byte
level where the plan's phrasing invites it.

### Criterion 4: gates CI check on the phase PR

**As written**: the gates CI job runs the local-mode harness and the phase
PR shows the gates check completed successfully.

**Verdict: MET.**

PR #9 is open (`pull_request_read` confirms `state: open`, head
`79604ecd36cea50e0d4e8fcb0f7b574887eeb9d2`). The workflow run for that head
on that branch:

```
workflow: gates, run 60, head_sha 79604ecd36cea50e0d4e8fcb0f7b574887eeb9d2
status: completed
conclusion: success
event: pull_request
```

This is a direct GitHub API observation by this review, not a reading of
the work history's prediction. The work history itself could not discharge
this criterion (no PR existed when the implementer wrote it); this review
is the first execution of the actual observation the criterion asks for.

### Criterion 5: falsification run

**As written**: `TIPHYS_EXIT_TEST_SKIP_STAGE_B=1` makes the harness exit
nonzero, with C2 showing a nonzero teardown.

**Verdict: MET.** This is treated as the most important criterion in the
phase, per the dispatch brief, because it is the harness's own red witness.

```
$ TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 scripts/m1-exit-test.sh --mode local <dir>
...
m1-exit-test: B1 recorded (skipped-override: stage B stub squash merge skipped by TIPHYS_EXIT_TEST_SKIP_STAGE_B)
m1-exit-test: C1 recorded (skipped-override: the payload's change is not on the sandbox default branch)
m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge): expected exit zero, got 1
exit 1
```

`041-C2.json` in that bundle: `exitCode: 1`, `expected: "exit zero"`,
`outcome: "fail"`. The run proceeded past B1 and C1 (both recorded, not
aborted) and failed at C2, confirming the build-time design claim that
failure is engineered to land on teardown's real refusal rather than on an
earlier, less meaningful check.

Confirmed separately: `grep -rn SKIP_STAGE_B .github/` exits 1 (no
matches), so this override is not exercised anywhere in CI and this local
execution is its only discharge path, as claimed.

### Criterion 6: node --test and the behavior registry

**As written**: `node --test` exits 0, 0 failing, zero unaccounted tests;
`test/behaviors.json` maps every newly named behavior to a test in the run
and every previously registered mapping still resolves by name.

**Verdict: MET.**

Gate numbers (see table below) and a from-scratch registry check: this
review captured the Node 26 `npm test` TAP output itself, extracted all
`ok`/`not ok` titles, and cross-checked every one of the 159 entries in
`test/behaviors.json` against that title set programmatically (a small
Node script, not visual inspection). Result: **159 total entries, 0
unresolved.** `git diff origin/main...HEAD -- test/behaviors.json` shows
exactly 7 new entries appended, nothing else touched, and both new titles
spot-checked (`grep -n` in `test/exit-test-local.test.ts`) exist verbatim
as `test(...)` declarations.

## Mutation testing (red-witness verification)

Rule applied: a test counts only if demonstrated red against the DANGEROUS
state. All mutations below were introduced with `cp`/`mv`/`sed`, run, then
reverted; `git status --porcelain` was confirmed clean after each
restoration.

| Behavior | Mutation | Observed result | Restored-clean confirmation |
|---|---|---|---|
| Reporter-pin fix exists at HEAD, absent at the parent | Checked out parent `6ff149b` in a separate worktree, ran the sandbox-clone test on Node 26 | RED: exit 1, `AssertionError: no pass count in npm test output`, sandbox itself passed 2/2 (parse failure, not a real defect) | Separate worktree, removed after use; no mutation of the reviewed worktree |
| Fix is GREEN on both toolchains at HEAD | none (baseline) | Node 26: `npm test` exit 0, 153/153/0; Node 22: exit 0, 153/151/0/2-skip | n/a (unmutated) |
| Sandbox suite genuinely fails | `sandbox/src/greet.js`: `hello, ${name}` to `HELLO, ${name}` | RED on Node 26 (exit 1, `1 !== 0`) and RED on Node 22 (exit 1, `expected 0 actual 1`) | `git status --porcelain sandbox/` empty after restoring from backup; full-suite green re-confirmed |
| Sandbox has no tests at all (vacuous state) | Moved `sandbox/test/greet.test.js` out of the tree | RED on Node 22 (exit 1, `expected true, actual false`) and RED on Node 26 (exit 1, `expected at least one passing test, got 0`) | File moved back; targeted test re-run green (`pass 1`, `fail 0`) after restoration |
| Load-bearing measurement: empty glob exits 0 | `node --test "test/**/*.nomatch.js"` inside `sandbox/`, with and without the tap pin | Both exit **0**; with the pin: `1..0`, `# tests 0`, `# pass 0`, `# fail 0` | No mutation of tracked files; this is a measurement, not a code change |
| Pin-refused failure mode | `NODE_OPTIONS=--test-reporter=no-such-reporter npm test` in `sandbox/` | exit **7**, `ERR_MODULE_NOT_FOUND`, on the container's Node 22.22.2 | No mutation of tracked files |

Every mutation behaved exactly as the work history claims: red against the
dangerous state, green after restoration, on both toolchains where both
toolchains were in scope. The vacuous-suite measurement (`node --test` over
a non-matching glob exits 0 and prints `# pass 0`) is independently
confirmed, so the claim that the count parse (not just the exit code) is
load-bearing for "at least 1 test" is true, not merely asserted.

## Gates, both toolchains (this review's own runs)

| Gate | Node v26.6.0 (declared floor) | Node v22.22.2 (container default) |
|---|---|---|
| `npm ci` | exit 0, 0 EBADENGINE lines | exit 0, 5 EBADENGINE lines (expected, floor warning) |
| `npm run build` | exit 0 | not separately re-run (build is toolchain-driven by tsc; Node 26 run is authoritative for the type gate) |
| `git status --porcelain` after build | clean | n/a |
| `npm test` | exit 0: **153 tests, 153 pass, 0 fail, 0 skipped**, ~82-98s across repeated runs | exit 0: **153 tests, 151 pass, 0 fail, 2 skipped**, ~99s |
| behavior registry by name (own script, against own TAP capture) | 159 mappings, **0 unresolved** | not re-run; Node 26 run is the authority per work history's own stated policy, followed here for the same reason |
| non-ASCII scan | `grep -rP '[^\x00-\x7F]'` over `sandbox/`, `scripts/`, `test/exit-test-local.test.ts`, `test/behaviors.json`, `.github/`, `delivery/work-history/m1-p6.md`: exit 1 (no match) | same |

These numbers match the work history's claimed "153/153/0/0" (Node 26) and
"153/151/0/2" (Node 22) exactly.

## Scope audit

```
$ git diff --name-only origin/main...HEAD
.github/workflows/gates.yml
delivery/work-history/m1-p6.md
sandbox/README.md
sandbox/package-lock.json
sandbox/package.json
sandbox/src/greet.js
sandbox/test/greet.test.js
scripts/m1-exit-test.sh
scripts/seed-sandbox.sh
scripts/stub-payload.sh
test/behaviors.json
test/exit-test-local.test.ts
```

Declared files-to-touch: `sandbox/`, `scripts/seed-sandbox.sh`,
`scripts/m1-exit-test.sh`, `scripts/stub-payload.sh`,
`test/exit-test-local.test.ts`, `.github/workflows/gates.yml`, plus the two
standing pre-authorized extras `test/behaviors.json` and
`delivery/work-history/m1-p6.md`. Every changed file is accounted for.
**Scope audit passes, no unauthorized file.**

The `.github/workflows/gates.yml` diff was inspected line by line: it adds
exactly one new step to the `test` matrix job
(`scripts/m1-exit-test.sh --mode local "${{ runner.temp }}/m1-exit-evidence"`)
and touches nothing else. The `gates` fan-in job is unmodified: still
`needs: test`, still `if: always()`, still exits 1 unless
`needs.test.result == success`, and the matrix is still exactly `node:
[26]`. This matches the claim that "the required check context keeps both
its name and its semantics."

## Conventions

- Pure ASCII: `grep -rP '[^\x00-\x7F]'` over the phase's changed files
  including the work history: exit 1, no matches. PASS.
- No em dashes: separately grepped for the em dash character across the
  same file set: no matches. PASS.
- npm only: no `yarn.lock` or `pnpm-lock.yaml` introduced. PASS.
- No AI/model/tool names in commit messages: `git log origin/main..HEAD`
  scanned case-insensitively for `claude|anthropic|gpt|openai|copilot`.
  **One match**, in commit `8c630dfff06453963fdb0ae53f05c448c4b6745c`
  ("record the second real-repository attempt"), which quotes this
  container's own ambient git identity, `Claude <noreply@anthropic.com>`,
  as a fact needed to distinguish PR-211's two witnessed halves. See
  finding CR-624.

## Findings

### CR-621 (informational, not a defect): bare `node --test` is not the gate

While reproducing criterion 6 this review first ran bare `node --test`
(no glob) at the repository root and got 155 tests, 155 pass, not the
claimed 153. Investigation: `node --test`'s default file discovery picks
up ANY `*.test.js` under the tree, including
`sandbox/test/greet.test.js` (2 tests), which the project's own `npm test`
script deliberately excludes with the explicit glob
`test/**/*.test.ts` (`package.json` line ~`"test": "node --test
\"test/**/*.test.ts\""`). Re-running via `npm test` (the actual gate
command named in CLAUDE.md and in this phase's own criterion 6 wording)
gives exactly 153, matching the work history. This is a note about this
reviewer's own first invocation, not a codebase defect: the declared gate
is `npm test` / `node --test` as invoked by the package script and by
`scripts/m1-exit-test.sh`'s A1 step, neither of which uses the bare
recursive glob. Recorded here so a future reviewer who sees a similar
"155 vs 153" surprise does not mistake it for suite drift.

- Severity: informational
- Fix: none required. Optionally, a future phase could note in
  CLAUDE.md or a test README that `npm test`'s explicit glob is
  load-bearing for excluding `sandbox/`'s own suite from the kernel's own
  test count, since a reviewer who runs bare `node --test` will get a
  different, still-passing, but differently-counted result.

### CR-622 (informational): `doctor`'s own identity check surfaces this container's ambient identity

`doctor`'s output in this review's own A2 record shows `CHECK identity PASS
git commit identity configured (Claude <noreply@anthropic.com>)`. This is
`doctor`'s own health check reporting the fleet operator's git identity,
which is unrelated to and does not weaken PR-211: PR-211 is about the
identity used by the HARNESS'S OWN COMMITS (seed, stub payload, squash
merge), all three of which this review independently confirmed still carry
`Tiphys Exit Test <exit-test@tiphys.invalid>` regardless of what `doctor`
reports about the ambient operator identity. No fix needed; recorded so
the distinction is explicit for the next reader.

- Severity: informational

### CR-623 (informational, negative result): SKIP_STAGE_B override absent from CI

Confirmed by this review: `grep -rn SKIP_STAGE_B .github/` exits 1, no
matches. Criterion 5's falsification path is exercised only by a manual
local run (this review's own, and the implementer's), never by CI. This
is not a defect against the criterion as written (the criterion only
requires the harness to be falsifiable when the env var is set, which it
is), but it is a coverage gap worth naming: nothing currently regresses
this behavior automatically on a future PR that touches the harness. Scope
of this negative result: `.github/` only; the search does not rule out the
override being wired some other way outside that directory (none was
found in `scripts/` either, confirmed separately).

- Severity: low
- Claim: none (this is a gap, not an incorrect claim)
- Fix: not required by this phase's plan text; worth a note for M2 gate
  registry design, since T-007's own lesson is that "criteria met" and
  "regression-proof" are different properties.

### CR-624 (low): one commit message names "Claude" and "Anthropic"

**Claim under CLAUDE.md binding convention 7**: "Commit messages carry no
AI model or tool names."

**Why it is arguably wrong**: commit `8c630dfff06453963fdb0ae53f05c448c4b6745c`
("M1-P6: record the second real-repository attempt, still blocked on write
access") contains the line "this container does carry an ambient global
git identity, Claude <noreply@anthropic.com>, so it is not the
identity-less condition CI runs under." This is a factual citation of an
environment measurement (the output of `git config --global user.email`),
not an attribution of authorship or a tool credit, and it is directly
load-bearing for the PR-211 distinction the same commit is discharging.
Removing it would weaken the commit's own evidentiary content. But the
convention as literally written draws no exception for evidentiary
citation, and the string is present.

**Evidence**: `git log origin/main..HEAD --format='%H %s%n%b' |
grep -iE "claude|anthropic"` matches exactly this one commit, this one
line.

**Fix**: either (a) treat this as within the convention's intent (citing a
measured fact is not "carrying an AI model or tool name" in the sense the
rule is protecting against, which is self-attribution/promotion) and take
no action, or (b) if the letter of the rule is to be enforced literally,
rephrase future occurrences of this fact as "this container's configured
git identity (name and email captured in the evidence, redacted here)"
rather than the literal string. This review does not treat (b) as
required for APPROVE, because the rule's evident purpose (no tool-credit
lines, no "Generated by X" trailers) is not what happened here, and no
other commit in the phase's range repeats the pattern. Recorded as low
severity so the orchestrator can decide rather than have the reviewer
decide unilaterally.

## Probes run (including empty-handed ones, with scope stated)

| Probe | Scope | Result |
|---|---|---|
| Non-ASCII scan | `sandbox/`, `scripts/`, `test/exit-test-local.test.ts`, `test/behaviors.json`, `.github/`, `delivery/work-history/m1-p6.md` | Empty (exit 1, no matches). Does not cover files outside this list; other phases' files were not rescanned by this review. |
| Em dash scan | Same file set as above | Empty |
| AI/tool name scan | `git log origin/main..HEAD`, commit subject + body only (not diff content, not the work-history file body, which is not a commit message) | One match, CR-624 |
| yarn/pnpm lockfile scan | Whole worktree except `node_modules/` | Empty |
| `SKIP_STAGE_B` wiring scan | `.github/` (recursive), plus `scripts/` (recursive) | Empty in both; only reachable via manual env var, confirmed |
| Nested-subtest scan (`t.test(`) across `test/*.ts` | All ten `.ts` files in `test/` | Empty; no dynamic test generation found, so the 153 count is not concealing loop-generated tests |
| dist/ leftover test-file scan | `dist/` after build | Empty; no compiled `.test.*` files found there, ruling out double-counting from a build artifact |
| CLI-invocation-not-resolving-to-dist scan | This review's own 51-record evidence bundle | Empty (0 of 12 command records point anywhere but `dist/bin/tiphys.js`; the one extra grep hit was an assertion record, not a command, confirmed by direct inspection) |
| Real-sandbox-repo write probe | This review's own operations against `tiphys-ai-helmsman-sandbox` | No writes made; `git ls-remote` before and after this review's reads shows the remote unchanged at `27c882f...` |

No probe in this list should be read as "no defect exists in the area it
covers" beyond its stated scope. In particular the non-ASCII/em-dash/AI-name
scans covered only this phase's changed files, per the scope audit list,
not the whole repository.

## Honest-failure section

This review found no criterion unmet and no mutation that failed to
demonstrate red-then-green. The two things closest to an "honest failure"
for this session:

1. This reviewer's own first invocation of `node --test` (bare, no glob)
   produced a materially different count (155 vs. 153) before the cause
   was identified as the reviewer's own command, not the codebase (CR-621).
   Recorded in full above rather than silently corrected, per the
   project's evidence-over-assertion norm: a reviewer's own miscount is
   exactly the kind of thing a later reader needs to be able to
   distinguish from a real regression.
2. Criterion 4 cannot be independently re-executed in the sense the other
   five can (there is no alternate CI run to trigger); this review's
   discharge of it is a single GitHub API observation of the existing
   `gates` check on the existing PR head, which is what the criterion asks
   for, but it is a one-shot observation rather than a reproducible
   experiment the way criteria 2, 3, and 5 are.

Nothing was found that the work history claimed and this review could not
reproduce.

## What this contract cannot see

Per T-007, an "all criteria met" verdict from this contract is one input,
not a terminal judgment, and this section names the defect classes a
criteria walk on THIS phase structurally cannot reach, independent of how
carefully it is executed:

1. **Anything the six criteria do not describe.** T-007's own lesson
   applies directly: the M1-P5 live-lock was invisible to a full criteria
   walk because no criterion named the hazard class ("a state/ file whose
   type has not been established"). This phase's criteria describe
   command exit codes, evidence-file shapes, and one specific falsified
   path. They say nothing about what happens if, for example, a record
   file, `session.json`, or the fleet directories the harness creates are
   replaced with a FIFO, a symlink cycle, a socket, or an unreadable
   directory mid-run; nothing about what happens if two invocations of
   `scripts/m1-exit-test.sh` race against the same scratch work directory;
   nothing about resource exhaustion, partial writes, or a process that is
   killed between steps rather than completing or cleanly failing. A
   criteria walk that executes all six clauses faithfully, as this one
   did, produces no signal about any of these, because none of them is a
   clause.
2. **Concurrency and partial-failure hazards inside the 882-line harness
   script itself.** This review ran the harness end to end four times
   (twice for criterion 2's evidence, once for criterion 5, plus the
   parent-commit red-witness run) and every run happened to complete
   cleanly or fail at the intended point. A criteria walk samples the
   documented paths, not the undocumented ones; it cannot characterize
   what the script does if, say, `git push` in the middle of the B1 stub
   squash merge times out, or if the harness's own cleanup trap is itself
   interrupted.
3. **The identity/isolation properties of the REAL toy sandbox repository
   under true concurrent access.** This review and the implementer's own
   validation pass both used the SAME repository sequentially. Neither
   witnesses what happens if two exit-test runs (this reviewer's and, in
   principle, a concurrent hazard reviewer's, or a future CI full-mode
   run) target the same real repository at once. The plan's own section 4
   substrate note flags fleet-state continuity across session reclamation
   as out of scope for M1; this review adds that same-repository
   concurrent-write hazard as a related, currently unwitnessed area,
   because criterion 1's real-repo form was designed and executed as a
   single-actor sequential probe.
4. **Anything upstream of this branch.** This contract verified that
   M1-P4 and M1-P5's contracts (spawn exits 0, teardown refuses/succeeds
   correctly, watch wakes) hold AS OBSERVED THROUGH THIS HARNESS. It is
   not a review of M1-P4 or M1-P5's own source, which received their own
   clean-room reviews at their own phases. A defect in, say, `teardown`'s
   internal handling of a hostile file that happens not to be exercised by
   this harness's specific sequence of commands would not surface here.
5. **Anything the hazard-contract reviewer is specifically tasked to find
   in this same diff.** This review deliberately did not attempt to
   duplicate that brief and did not read the sibling worktree
   `cr-p6-hazard`. Per T-007's structural lesson, the two contracts are
   meant to be decorrelated in the QUESTION asked, not just cross-checked
   after the fact; this section names the gap rather than trying to close
   it from inside the criteria contract.

## Summary for the record

- Verdict: **APPROVE**
- Criteria: 6 stated, 6 met, 0 not-met, 0 not-verifiable-here
- Findings: 4 total, 0 high, 0 medium, 0 low-severity-defect, 1 low
  (CR-624, defensible convention-letter item), 3 informational
  (CR-621, CR-622, CR-623)
- Mutation table: 5 rows, 5/5 correctly red against the dangerous state and
  green after restoration
- Gates: Node 26 exit 0, 153/153/0/0-skip; Node 22 exit 0, 153/151/0/2-skip;
  behavior registry 159/159 resolved, 0 unresolved, both matching the work
  history's claimed numbers exactly
