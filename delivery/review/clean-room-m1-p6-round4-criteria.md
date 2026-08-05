# CR-740: clean-room CRITERIA-CONTRACT review, PR #9 (M1-P6), FIX ROUND 3, DELTA SCOPE

- Head reviewed: `5e3fd38` (`5e3fd3898c611f6d1dc3d9320db073211ae40a12`)
- Previous reviewed head: `9b76639`
- Branch: `claude/m1-p6-toy-sandbox-exit`
- Reviewer role: CRITERIA-CONTRACT, DELTA mandate. A concurrent
  HAZARD-CONTRACT reviewer works the same head in the sibling worktree
  `p6d-hazard`, not read here.
- Worktree: detached at `5e3fd38`,
  `/tmp/claude-0/.../scratchpad/p6d-criteria`. No file in
  `/home/user/tiphys-ai-helmsman` or in `p6d-hazard` was written by this
  review. No push, commit, or write to the real sandbox repository
  (`ThomasHendrickx/tiphys-ai-helmsman-sandbox`); every harness run in
  this review used a `file://` remote, including a reviewer-built `gh`
  stand-in for the one full-mode run (state file toggled OPEN/MERGED by
  hand, no network call).
- Toolchains: Node v26.6.0 (npm 11.18.0) from the scratchpad toolchain
  first on PATH for every "Node 26" row, confirmed with `node --version`
  in the exact shell that ran each command; Node v22.22.2 via `bash -lc`
  for every "Node 22" row (the bare non-login shell in this container
  resolves to v20.20.2, confirmed directly and matches CLAUDE.md warning
  1).

## Verdict

**APPROVE. Zero new findings.**

## Criteria re-executed vs skipped

| # | Criterion | Action | Result |
|---|---|---|---|
| 1 | sandbox clone, file:// and real repo | SKIPPED (spot-check): `git diff --stat 9b76639..5e3fd38 -- sandbox/ scripts/seed-sandbox.sh scripts/stub-payload.sh` is empty | Unchanged, MET |
| 2 | local mode, complete bundle | RE-EXECUTED, own bundle | MET, 56 records, non-lapse path confirmed unchanged |
| 3 | teardown refusal / watcher line / teardown-after-merge | RE-EXECUTED, own bundle | MET, byte-exact |
| 4 | gates CI check on PR #9 at `5e3fd38`, falsifiability step executes | RE-EXECUTED via GitHub API and job log | MET |
| 5 | falsification run exits nonzero at C2 | RE-EXECUTED, own run | MET |
| 6 | node --test exit 0, registry resolves by name | RE-EXECUTED, own script | MET, 156/162, 0 unresolved either direction |

Criteria 2, 3, 5, 6 are fully re-walked with fresh evidence, as instructed,
because the round's changes (lease take-over, whitelist parser, fifth
stub, malformed-session diagnostic) are all downstream of them. Criterion
4 is cheap and directly touched by `gates.yml`, so it was re-executed
rather than spot-checked. Criterion 1 is the only one genuinely skipped:
the diff over its three governing files is empty.

## Criterion 2: local-mode harness, complete evidence bundle, non-lapse path

Own execution: `bash scripts/m1-exit-test.sh --mode local <dir>` (Node
26.6.0), exit 0, real 1m44.3s.

| Item | This review's own run |
|---|---|
| records in `records/` | 56 |
| `recordsInBundle` | 56 |
| `recordsValidated` | 55 |
| `tiphysInvocations` | 13 |
| `problems` | `[]` |
| distinct registry steps present | 12 (A1-A8, B1, C1-C3), confirmed by set-extraction over all 56 files |
| duplicate sequence numbers | none (56 files, 56 distinct 3-digit prefixes) |
| A3 lease record | `A3 recorded (observation: the lease survived stage B)` -- the take-over branch did NOT fire |

The non-lapse path is confirmed unchanged: the run went straight through
without touching the new take-over code, matching the pre-round-3 shape
except for the header/comment rewording.

## Criterion 3: teardown refusal / watcher line / teardown-after-merge

From the same bundle as criterion 2:

- `output/watch.out`: `wc -c` = 24, `cat -A` = `signal m1-exit turn-end$`
  (one line, byte-exact).
- `033-A7.json`: teardown refusal, `exitCode: 1, expected: "exit
  nonzero", outcome: "pass"`.
- `052-C2.json` (green path): `exitCode: 0, expected: "exit zero",
  outcome: "pass"`; `053-C2.json`/`054-C2.json`: worktree removed, task
  meta status closed, both `outcome: "pass"`.

## Criterion 4: gates CI check on PR #9 at `5e3fd38`

Direct GitHub API observation against the exact head:

```
pull_request_read(get, PR #9): head.sha = 5e3fd3898c611f6d1dc3d9320db073211ae40a12, state open
pull_request_read(get_check_runs, PR #9):
  gates        completed / success
  test (26)    completed / success
```

Job log (fetched directly, `job_id 92396810667`) shows the falsifiability
step running the harness a second time to completion: the full green
path (A1 through C3, real `npm ci`/`build`/`test` on the kernel and a
real seeded-project run) completes first, then a second full harness
invocation with `TIPHYS_EXIT_TEST_SKIP_STAGE_B=1` runs, ending
`m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge):
expected exit zero, got 1` followed by `falsifiability guard witnessed at
C2: exitCode 1`. Not skipped, not truncated.

## Criterion 5: falsification run

```
$ TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 bash scripts/m1-exit-test.sh --mode local <dir>
...
m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge): expected exit zero, got 1
exit 1
```

`046-C2.json`: `"exitCode": 1, "expected": "exit zero", "outcome":
"fail"`. Exact match.

## Criterion 6: node --test and the behavior registry

Node 26, `npm test` (raw TAP, 4 independent runs, see flake section):
**156 tests, 156 pass, 0 fail, 0 skipped**, exit 0, all 4 runs. Node 22
(`bash -lc`, confirmed v22.22.2 in-shell): **156 tests, 154 pass, 0 fail,
2 skipped**, exit 0, both skips confirmed by name to be the documented
floor-gated `doctor` tests (`# SKIP local Node v22.22.2 is below the
kernel floor >=26`).

Registry check (own script, `p6d-registry-check.mjs`, extracts every
top-level `ok`/`not ok` title from raw TAP and set-compares against
every value in `test/behaviors.json`, in both directions): **156
distinct test titles, 162 behaviors.json entries, 0 unresolved
registry-to-test, 0 unresolved test-to-registry.**

`test/behaviors.json` diff, checked programmatically:

- `9b76639` (161) -> `5e3fd38` (162): 0 dropped, 0 changed values, 1
  added (`exit-test-guard-failure-reaches-required-check`).
- `origin/main` (152) -> `5e3fd38` (162): 0 dropped, 0 changed values,
  10 added (the whole phase's registry diff is purely additive over
  `main`). No key was renamed or retitled in either comparison.

## Mutation testing

All mutations applied to an isolated file, run, then restored from a
pristine copy taken before any mutation in this session; `diff` and
(for the two files mutated more than once) `md5sum` both confirm
byte-identical restoration after every row, and `git status --porcelain`
is empty after all restorations.

| # | Behavior | Mutation | Observed result | Restore confirmed |
|---|---|---|---|---|
| M1 | CR-680 lease take-over, control arm | Removed the take-over branch from `stage_c` (reverted to the pre-round-3 reassurance text), real full-mode stage A bundle (37 records, reviewer-built `gh` stand-in, `file://` remote), lease expired by editing only `expiresAt` | **ARM A (fix in place): exit 0**, take-over fires (`A3 ok (reclaim the lease by take-over ...)`), C2 teardown succeeds, C3 evidence validated. **ARM B (mutation applied): exit 1** at C2, `tiphys teardown: lease ... expired ...; re-acquire or take over before mutating tasks`, identical starting state (byte-copied work dir and lock file) for both arms | diff + md5 identical |
| M2 | CR-681 whitelist, step-level link | Added `timeout-minutes: 1` to the falsifiability-guard step (a key nobody enumerated) | **RED**: `deepStrictEqual` fails, "the falsifiability step declares keys beyond name and run (name, timeout-minutes, run)" | diff + md5 identical |
| M3 | CR-681 whitelist, job-level link | Added `if: false` to the `test` job | **RED**: `deepStrictEqual` fails, "the test job declares keys beyond runs-on, strategy and steps (if, runs-on, strategy, steps)" | diff + md5 identical |
| W1 | `exit-test-step-failure-is-fatal` | `run_step`'s outcome computation (`case "${expect}" in ...`) deleted, every step scores pass unconditionally | **RED**: 0 pass, 1 fail. Harness runs past A1's induced `npm ci` failure and dies later on an unrelated assertion (`dist/bin/tiphys.js does not exist after npm run build`); `assert.match(result.stderr, /FAILED: step A1 \(kernel npm ci\)/)` fails | diff + md5 identical |
| W2 | `exit-test-step-failure-is-fatal` | `die "step ..."` in the fail branch replaced with `true "step ..."` | **RED**: same failure shape as W1, harness continues past the failing step through three more failing npm calls before dying downstream | diff + md5 identical |

M1 reproduces the hazard reviewer's own ARM A / ARM B construction
independently, from a fresh full-mode stage A bundle built in this
session (own reviewer-built `gh` stand-in, not reused from any prior
session's artifacts) with an empty starting bare repository that
required `--initial-branch=main` to behave like a real GitHub remote
(an artifact of raw bare-repo `file://` semantics on an unborn HEAD, not
a defect in the harness; noted for the honest-failure section). Both
arms started from a byte-identical work directory and lock file.

M2 and M3 are the two links the dispatch asked for (step-level,
job-level); the class's other three links (workflow-runs-on-PR, needs,
gates-exit) were read but not separately mutated in this pass, matching
the delta scope.

## CR-662 flake watch

4 full-suite Node 26 runs at `5e3fd38`, raw TAP:

| Run | Result |
|---|---|
| 1 | 156/156/0/0 |
| 2 | 156/156/0/0 |
| 3 | 156/156/0/0 |
| 4 | 156/156/0/0 |

**0 of 4 runs showed the `watcher.test.ts` flake** (1 of 4 two heads ago
at `8954b05`, 0 of 4 one head ago at `9b76639`). Scope of this negative
result: 4 runs at one head, same sample size as the last two rounds, no
attempt at a larger sample or root cause. This is now 8 of 8 clean runs
across the last two heads combined; still reported as a data point, not
a closure, since a 1-in-4 rate is not ruled out by clean runs alone.

## Gates, both toolchains (this review's own runs)

| Gate | Node v26.6.0 (declared floor) | Node v22.22.2 (login-shell default, via `bash -lc`) |
|---|---|---|
| `npm ci` | exit 0, 0 EBADENGINE lines | exit 0, 5 EBADENGINE lines (expected) |
| `npm run build` | exit 0 | exit 0 |
| `git status --porcelain` after build | clean | clean |
| `npm test` | exit 0: **156 tests, 156 pass, 0 fail, 0 skipped** | exit 0: **156 tests, 154 pass, 0 fail, 2 skipped** (documented floor-gated `doctor` tests, confirmed by name) |
| behavior registry by name (own script) | 162 mappings, **0 unresolved** | not re-run (Node 26 is the declared authority) |

Both Node-22 rows used `bash -lc` explicitly and `node --version` was
checked inside that same invocation each time (v22.22.2), guarding
against the exact trap CLAUDE.md environment warning 1 describes
(stripped-shell v20.20.2) and against an exported floor-toolchain PATH
surviving into a column meant to be Node 22, which is what the
fix-round-3 work history self-flagged.

## Scope audit

```
$ git diff --name-only 9b76639..5e3fd38
.github/workflows/gates.yml
delivery/work-history/m1-p6.md
scripts/m1-exit-test.sh
test/behaviors.json
test/exit-test-local.test.ts
```

Five files. `.github/workflows/gates.yml` and `scripts/m1-exit-test.sh`
are on the phase's files-to-touch list; `test/exit-test-local.test.ts`
is declared; `test/behaviors.json` and `delivery/work-history/m1-p6.md`
are the two standing pre-authorized extras. **Scope audit passes, no
unauthorized file.**

## Conventions

- ASCII: `git diff --name-only 9b76639..5e3fd38 | xargs grep -lP
  "[^\x00-\x7F]"` finds nothing (xargs exit 123, no match in any file).
- Em dash: same 5 files, same empty result (grep for the em dash
  character, xargs exit 123).
- No AI/model/tool names: `git log 9b76639..5e3fd38 --format='%H %s%n%b'
  | grep -inE 'claude|anthropic|gpt|openai|copilot'` exits 1, no match,
  over this round's single commit. Author/committer both `Tiphys
  Orchestration`.

## Self-flags in the fix-round-3 work history (T-006 sample)

Two self-corrections are stated; both checked.

1. **"An environment warning that bit me, mid-round"**: `git checkout --
   scripts/m1-exit-test.sh` discarded four uncommitted edits, requiring
   re-application and a full re-run of the CR-680 witness before the
   numbers in that section could be trusted. Verified indirectly rather
   than by watching the original session: (a) the shipped code at
   `5e3fd38` contains the take-over logic exactly as described in the
   CR-680 section, confirmed by reading the diff directly; (b) this
   review independently reproduced the CR-680 witness from a fresh
   full-mode bundle built in this session (M1 above) and got the same
   qualitative result in both arms (fix-in-place recovers and reaches
   C3; take-over removed dies at C2 on the lease-expiry message), which
   is the strongest available check that the numbers reported were not
   lost or fabricated after the described accident. This review cannot
   witness the accident itself, only that its stated consequence (a
   re-run before shipping) is consistent with the shipped code behaving
   as claimed.
2. **"Both Node versions were confirmed... The first attempt at the
   Node 22 column was run with the floor toolchain still on PATH and
   reported v26.6.0; it was discarded and re-run."** Directly
   reproducible as a general hazard: this review's own environment
   probing (see Method) showed the non-login shell resolves to
   v20.20.2 and a login shell to v22.22.2, and separately confirmed
   that an exported PATH with the floor toolchain prepended survives
   inside a shell invocation, so a careless Node-22 column really can
   silently run v26 if the toolchain was exported earlier in the same
   session and not removed. This review's own Node-22 gate rows used a
   fresh `bash -lc` each time specifically to avoid that trap, and
   confirmed `node --version` inside each such invocation. Both halves
   of the claim check out as a real, reproducible property of this
   environment, not merely as a story.

## Probes run (including empty-handed ones, with scope stated)

| Probe | Scope | Result |
|---|---|---|
| Own local-mode bundle | 56 records, one run | 56=56, 0 duplicates, non-lapse path unchanged |
| Own falsification run | one run | exit 1 at C2, record matches |
| Registry set-compare, both directions | own raw-TAP capture (Node 26) vs `test/behaviors.json` | 0 unresolved either direction |
| `behaviors.json` key diff | `9b76639` vs `5e3fd38` vs `origin/main` | 0 dropped or renamed anywhere |
| Criterion 4 | live GitHub API + job log at `5e3fd38` | both checks green, falsifiability step ran to completion |
| CR-680 mutation, own full-mode reproduction | one stage-A bundle, two stage-C arms from a byte-identical start | ARM A recovers (exit 0), ARM B (take-over removed) fails at C2 (exit 1) |
| CR-681 mutation, step-level and job-level | 2 mutations against `gates.yml` | both caught by the whitelist test |
| `exit-test-step-failure-is-fatal` mutations | W1, W2 | both reddened, same shape as round 2's own table |
| Full-suite flake repeat | 4 raw-TAP Node 26 runs at `5e3fd38` | 0 of 4 flaked |
| Criterion 1 unchanged-diff spot-check | `git diff --stat 9b76639..5e3fd38` over `sandbox/`, `seed-sandbox.sh`, `stub-payload.sh` | empty |
| Orphan process check | `ps aux \| grep "tiphys watch"` after all runs | none found |

## Honest-failure section

1. **The M1 (CR-680) reproduction needed a working full-mode stage A**,
   which required this review to build its own `gh` stand-in and
   discover, the hard way, that an empty bare git repository created
   with plain `git init --bare` does not behave like a fresh GitHub
   repository: its `HEAD` stays pointed at `refs/heads/master`
   regardless of which branch later receives content, which broke the
   very first attempt (the seeded clone silently checked out an empty
   `master`, a `npm ci` "no package.json" failure that looked, at
   first glance, like a defect in the harness under test). Fixed by
   creating the scratch remote with `--initial-branch=main`, matching
   what the harness's own local-mode substitution already does. Recorded
   because it cost real time and could mislead a less careful re-run
   into reporting a false finding against the harness.
2. **The mutation table's M1 row is a fresh reproduction of the same
   construction the hazard reviewer already published**, not a novel
   attack. That is intentional per the dispatch ("the implementer's own
   control arm"); this review did not attempt additional lease-recovery
   attacks beyond the one named.
3. **The CR-681 class has three links this review did not separately
   mutate** (workflow-runs-on-pull_request, the `needs: test` wiring,
   and the `gates` job's own exit-nonzero behavior), matching the
   dispatch's "one mutation each" for step-level and job-level. The
   round's own work history reports 13 constructions against the full
   class (D1-D13); this review's 2 (M2, M3) are a targeted subset, not a
   re-verification of all 13.
4. **This review did not attack CR-682, CR-683, or CR-684 with fresh
   mutations**; CR-683's fifth stub and CR-684's malformed-session
   diagnostic are read from the diff and confirmed present in the code
   and in the passing suite, but not separately constructed here, since
   they were outside the four named focus items (criteria 2/3/5/6 plus
   the three named mutation classes) and the round-3 hazard review
   already constructed CR-682 (D13) directly.

## What this contract cannot see

Per T-007: an "all criteria met, zero new findings" verdict from this
contract is one input, not a terminal judgment, and this project's own
tuition record says the criteria contract returned APPROVE while the
hazard contract found the blocking defect on this exact phase, three
review rounds running (T-007's own example is M1-P5; the pattern
repeated on this phase at round 2, where the criteria review approved
`9b76639` at zero findings and the hazard review on the same head found
CR-680 and CR-681, both medium). This review confirms the six stated
criteria and the specific mutation classes named in the dispatch, but:

- It does not derive a hazard inventory from the component's nature (what
  can block, hang, lose a signal, or leave state inconsistent) the way a
  hazard-contract review does. The CR-680 take-over branch, the whitelist
  parser, the fifth stub, and the malformed-session diagnostic were all
  reviewed here BECAUSE the dispatch named them as downstream of the
  criteria, not because this contract's own method would have surfaced
  them unprompted.
- It did not go looking for a fourth member of the CR-681 defang class
  beyond the two named links, or for a second instance of the
  instance-versus-mechanism pattern elsewhere in this round's new code
  (for example, whether the take-over's own failure modes -- a
  `lock acquire --take-over` that itself times out, or a `write_session`
  that fails mid-write -- are themselves guarded).
- Concurrent harness invocations against one scratch work directory, a
  process killed mid-step, and any interaction between the new take-over
  branch and a REAL multi-hour wall-clock lapse (as opposed to an edited
  `expiresAt`) remain outside a criteria walk and are the concurrent
  hazard-contract reviewer's territory, deliberately not read here.
- A criteria walk cannot tell the difference between "correct" and
  "correct for every case anyone thought to name": the whitelist closes
  the class of YAML edits the test enumerates as forbidden keys, but the
  same shape of gap (an instance closed, a wider mechanism assumed closed
  with it) is exactly what recurred twice already in this milestone
  (CR-640/CR-661, then CR-644/CR-684), and nothing in this review's method
  would catch a third instance of that pattern except by having been told
  where to look.

## Summary for the record

- Verdict: **APPROVE**, 0 new findings, 0 high, 0 medium, 0 low, 0
  informational.
- Criteria re-executed: 2, 3, 4, 5, 6 (fresh evidence). Criterion 1
  skipped, spot-checked via unchanged-diff argument (empty diff over its
  three governing files).
- Mutation table: 5 rows (M1 lease take-over control arm with both ARM A
  and ARM B, M2 whitelist step-level, M3 whitelist job-level, W1 and W2
  step-failure-is-fatal). 5 of 5 reddened (or, for M1, both arms behaved
  exactly as claimed); all mutated files restored byte-identical
  (diff + md5).
- Flake recheck: 0 of 4 Node 26 full-suite runs flaked at `5e3fd38`
  (0 of 4 at `9b76639`, 1 of 4 at `8954b05`); scope stated, not declared
  fixed.
- Gates: Node 26 exit 0, 156/156/0/0-skip; Node 22 (via `bash -lc`) exit
  0, 156/154/0/2-skip (2 documented floor-gated skips, confirmed by
  name); registry 156 titles / 162 entries, 0 unresolved either
  direction.
- Both implementer self-flags in the fix-round-3 work history checked
  and found consistent with independently reproducible evidence.
