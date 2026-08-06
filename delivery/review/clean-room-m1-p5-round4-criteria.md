# Clean-room review: M1-P5 fix round 4 (CRITERIA CONTRACT)

- Date: 2026-08-05
- PR: 8
- Branch: claude/m1-p5-watcher-liveness
- Head reviewed: 84dfa41f8f92d90d6982ca97b3addebe7893ff75
- Base for three-dot diffs: origin/main (M1-P4 merged)
- This round's own base: 1bdfce5fcf0ecfa88d7318f58f77b378544045b5 (the head
  the third-round criteria and hazard reviews examined)
- Reviewer: independent clean-room reviewer, CRITERIA CONTRACT (T-007). A
  concurrent reviewer in a sibling worktree (`cr-r4-hazard`) holds the
  hazard contract on the same head; I did not see that reviewer's work and
  it did not see mine.
- Worktree: `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/cr-r4-criteria`,
  a detached worktree at 84dfa41. Nothing outside it or outside
  `/tmp/claude-0/.../scratchpad/cr4-*` scratch paths was touched. Nothing
  under `/home/user/tiphys-ai-helmsman` was written (only read, for
  `delivery/plan/kernel-plan-v1.md`, the tuition entries, and the two
  third-round reviews, none of which are writable from this worktree
  anyway).

## Method

Contract-first, executed rather than read, exactly as instructed: this
round's central question is REGRESSION, since all fifteen criteria already
passed twice at the previous head (1bdfce5) and this round rewrote the
read and write path of the whole component (`src/task.ts`'s new
`classifyEntry` / `readRegularFileIfPresent` / `refuseOpenForWrite`, wired
into `src/liveness.ts`, `src/watcher.ts` and `src/commands/doctor.ts`).

For every one of the fifteen criteria I built my own scratch fleet by hand
(`tiphys init` plus hand-written `meta.json` / `turn-end` / `executor.json`,
or a real `git init` + `tiphys spawn` upstream for criteria 10 and 11) and
drove the compiled CLI (`node dist/bin/tiphys.js ...`) myself, capturing
exit codes and stdout/stderr in this session. I did not reuse the
implementer's or any prior reviewer's transcripts as evidence.

I ran the full gate sequence (`npm ci`, `npm run build`, `node --test`) on
BOTH toolchains: the fetched floor toolchain (Node v26.6.0,
`.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin` first on PATH) and
the container's default (Node v22.22.2, the default `PATH`, which resolves
`node` to `/opt/node22/bin/node` ahead of the `/usr/local/bin -> node20`
symlink, noted here because an earlier attempt of mine that explicitly
narrowed PATH to exclude `/opt/node22/bin` accidentally picked up Node
20.20.2 instead and produced a spurious all-tests-fail result from
`ERR_UNKNOWN_FILE_EXTENSION` on `.ts`; that was my own environment mistake,
corrected before any evidence below was collected, and is recorded here so
a later reader does not mistake the container's default for anything other
than 22.22.2).

For the mutation table I mutated the shipped source directly in this
worktree, ran the named test with `--test-name-pattern "<title>"` BEFORE
the file path, confirmed red, and restored the file from a byte copy taken
before any mutation (`.../scratchpad/cr4-backup/*.orig`), verifying
byte-identity with `diff` after every restore and a final `git status
--porcelain` empty. The CR-540 replacement test was additionally run 20
times mutated and 8 times clean, not once each, because a probabilistic
witness needs a measured rate, not a single sample.

## Gate evidence (both toolchains, this session)

### Floor toolchain (Node v26.6.0, npm 11.18.0)

| Gate | Exit | Observed |
|---|---|---|
| `npm ci` | 0 | 4 packages, no EBADENGINE line |
| `npm run build` (`dist` removed first) | 0 | `git status --porcelain` empty after |
| `node --test`, run 1 | 0 | tests 146, pass 146, fail 0, cancelled 0, skipped 0, todo 0; 85.4s |
| `node --test`, run 2 | 0 | tests 146, pass 146, fail 0, cancelled 0, skipped 0, todo 0; 98.5s |
| `node --test`, run 3 (post-mutation-work, after a fresh `npm run build`) | 0 | tests 146, pass 146, fail 0, cancelled 0, skipped 0, todo 0; 78.0s |

Matches the work history's claim (146/146/0/0) exactly, three times.

### Default container toolchain (Node v22.22.2, npm 10.9.7)

| Gate | Exit | Observed |
|---|---|---|
| `npm ci` | 0 | EBADENGINE warnings as expected |
| `node --test test/**/*.test.ts` (globstar-expanded; bare `node --test` with no args discovers 0 files on this tree and is not a valid substitute) | 0 | tests 146, pass 144, fail 0, cancelled 0, skipped 2, todo 0; 118.2s |

Matches the work history's claim (146/144/0/2) exactly. The two skips are
`doctor in a healthy fleet exits 0` and `doctor with gh absent exits 0
under the generic profile`, each carrying the reason "local Node v22.22.2
is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)",
confirmed by reading the TAP output, not assumed. Both skip on the default
toolchain and both ran (not skipped) on the floor toolchain, which is
exactly what the environment warning requires.

`git status --porcelain` was empty after every build in both toolchains,
before and after all mutation-and-restore work below.

## Criteria table (all 15 re-walked at 84dfa41, independent execution)

| # | Verdict | Method / evidence |
|---|---|---|
| 1 | MET | resident `--interval 0.5 --poll 0.1 --backoff-cap 10`, beacon sampled every 0.5s for 4s: streak 0->1->2->3, gaps 497/1002/2002ms (non-decreasing, doubling), 0 bytes stdout/stderr while idle |
| 2 | MET | resident watcher, turn-end written mid-run: exit 0, stdout exactly `signal t1 turn-end`, stderr empty, latency 53ms |
| 3 | MET | no open tasks, `--interval 0.4 --poll 0.1`: alive after 1.4s (>3x0.4s), 0 stdout bytes; same fleet with `--max-heartbeats 2`: exit 0, `heartbeat 2` |
| 4 | MET, both halves | virgin fleet `--once`: exit 3, stdout/stderr both empty; same fleet with a turn-end: exit 0, `signal t1 turn-end` |
| 5 | MET | three `--once --interval 0.4` passes across three processes: exit 3, then exit 0 `heartbeat 1`, then exit 3; `state/watcher.cadence.json` persisted `backoffStreak:1` across all three |
| 6 | MET | first `--once` on a pending turn-end: exit 0 `signal t1 turn-end`; second on the unchanged fleet: exit 3, empty |
| 7 | MET | own dual-release construction (not the suite's): two `--once` processes on the SAME `TIPHYS_WATCH_TEST_HOLD` barrier, released by one write, 3/3 trials gave exactly one `signal t1 turn-end` (exit 0) and one no-wake (exit 3, empty) |
| 8 | MET | three consecutive no-wake `--once` passes on a fleet with a consumed turn-end: beacon `writtenAt` strictly increased each pass (`...55.569Z` -> `...55.641Z` -> `...55.709Z`) |
| 9 | MET | past-deadline `executor.json`, no turn-end: exit 0, `stale t1 deadline`; future deadline, fresh cadence: exit 3, empty |
| 10, 11 | MET, both, real `spawn`/`teardown`/`doctor` against a real git upstream, 3 beacon states | absent/fresh/stale-1260s(threshold 1200s): spawn exit 0/0/0, teardown exit 0/0/0, doctor exit 1/1/1 (identical per command across states); exactly one `watcher stale` stderr line in absent and stale, zero in fresh; doctor's 8 CHECK lines present and unchanged in all three; `CHECK beacon WARN ... 1260s old, past the 1200s freshness threshold` reproduced verbatim |
| 12 | MET, both clauses | (a) `guard()` probed directly at 7 points from 0 to `staleThresholdMs+1` under default cadence (cap 900000ms, poll 15000ms, threshold 1200000ms): fresh through 1200000ms inclusive, stale at 1200001ms, "strictly greater than" confirmed at the real boundary, not just the PR-009 margin; (b) `TIPHYS_WATCH_STALE_SECONDS=915` (with cap 900/poll 15) exits 1 at import naming both values (`915000ms ... 900000ms ... 15000ms (915000ms)`); `=916` exits 0; `--backoff-cap 36000` on the default threshold: exit 64 naming both values |
| 13 | MET | `grep -nE "node:(http|https|http2|net|tls|dgram|dns)|fetch\(|axios|undici|..."` over `src/watcher.ts` alone and over the whole `src/`+`bin/` tree: exit 1 (clean) both times |
| 14 | MET | same grep family (`process.kill`, `\bpid\b`, `/proc`, `SIG[A-Z]{3,}`, `detached\s*:`, `.unref(`, `daemon`, `background`, plus a broader token-only pass with no colon requirement) over the three named files: exit 1 (clean); over the whole tree the only hits are prose in `src/spawn.ts` and `src/commands/spawn.ts` explicitly stating nothing is daemonized, not violations |
| 15 | MET | see registry section below: `node --test` exits 0 on both toolchains with the numbers above; independent script confirms 0 unresolvable mappings and 0 removed/retitled versus `origin/main` |

**Totals: 15 met, 0 not-met, 0 not-verifiable-here. No criterion regressed
from the previous head, and none changed character silently as far as this
contract can observe (see "what this contract cannot see" below).**

### Criteria singled out by the dispatch as most likely to have shifted

- **4 and 6 (no-wake exit code 3).** Re-walked by direct execution above;
  byte-identical exit code and empty-output shape to the third-round
  reviewers' own findings at 1bdfce5.
- **8 (beacon strictly advances on no-wake, now through the guarded-write
  path).** Re-walked with three consecutive real `--once` passes; also
  covered by mutation B below (removing the guarded-write probe does not
  break criterion 8's advance semantics, since the destination probe
  guards against silent absorption of a non-regular entry, not against the
  monotonic-timestamp logic in `writeBeacon`, which is untouched this
  round).
- **10 and 11 (stale/fresh stderr line, doctor's ordering changed).**
  Directly executed against real `spawn`/`teardown`/`doctor`; stdout (8
  CHECK lines) and stderr (advisory) are correctly separated in every
  state, and the CR-523 reordering (advisory now runs AFTER the check
  loop, confirmed by reading `src/commands/doctor.ts:394-410` and by the
  diff at `git diff 1bdfce5..HEAD -- src/commands/doctor.ts`) does not
  change either exit codes or which lines appear where.
- **12 (load-time threshold invariant).** Re-walked including the exact
  boundary (1200000ms fresh, 1200001ms stale), which the third-round
  reviewer's own report also hit; unchanged.

## Registry (criterion 15), verified mechanically, own script

Script: `/tmp/claude-0/.../scratchpad/cr4-registry-check.mjs`. It scans
every `test/*.test.ts` file for `test(`/`test.skip(` calls (matching
nested `t.test(` too, since the string `test(` occurs there as well),
builds the set of literal titles, and cross-checks every value in
`test/behaviors.json` against that set, then diffs `test/behaviors.json`
against `origin/main`'s copy via `git show`.

    Discovered test() titles (source scan): 146
    behaviors.json mappings: 152
    distinct registered titles: 146
    unresolvable mappings: 0
    origin/main mappings: 107
    removed (present on main, absent on HEAD): 0
    retitled (value changed): 0
    added: 45

Cross-checked against actual execution: `node --test` on the floor
toolchain reports exactly 146 tests, matching the source-scan count
exactly (both runs). `git show 1bdfce5:test/behaviors.json` has exactly
145 keys / 139 distinct values (matching BOTH third-round reviewers'
independently-computed 145/139 exactly), and `git diff
1bdfce5..HEAD -- test/behaviors.json` adds exactly 7 keys, all 7 pointing
at the round's own 7 new test titles, 145+7=152, 139+7=146, consistent
with my script's count and with 44+1=45 added versus `origin/main`.

**Criterion 15's substance is MET**: `node --test` exits 0 on both
toolchains, zero unaccounted tests, every behavior named by the round maps
to a test present in the run, and every previously-registered mapping
(all 145 from before this round) still resolves by name, none removed,
none retitled. See CR-580 below for the discrepancy between this and the
work history's own reported numbers, which is a documentation-accuracy
finding, not a criterion-15 failure.

## Mutation testing

### CR-540 replacement test (`watcher-simultaneous-claim-single-surfacing`,
title "two single passes released together surface one turn-end"): the
single most important item in this contract

Mutation: `src/watcher.ts:671`, `writeFileSync(claimPath, "", { flag: "wx"
})` -> `{ flag: "w" }` (removes the claim file's mutual exclusion).

| Direction | Runs | Result |
|---|---|---|
| Clean (unmutated) | 8 | 8/8 green |
| Mutated (`"wx"` -> `"w"`) | 20 | **20/20 RED**, every failure inside round 0, 1 or 2 of the 12-round loop (never later) |

This is a materially stronger detection rate than the implementer's own
disclosed measurement (6/6 red at 12 rounds, "always within the first
three rounds"), and my own 20 independent runs are consistent with it
(with a genuine per-round catch probability near 1/3, 20/20 full-run
successes at 12 rounds/run is the expected outcome, not a coincidence
requiring a higher true rate). **Judgment: this is a sound red witness,
not a coin flip that will intermittently redden CI.** It is
probability-bounded rather than deterministic by the nature of the race it
exercises (correctly disclosed as such in the work history), but 12 rounds
per test invocation drives the miss probability low enough that 28 total
trials in this review (8 clean plus 20 mutated) produced zero results
inconsistent with the claimed behavior in either direction. As a low-cost
strengthening for the future (a suggestion, not a finding), the round
count could be raised further, or the actual round-of-first-failure
distribution logged over a larger CI sample, so a slow drift in the
underlying probability would be visible over time.

### Full mutation table

| Behavior | Mutation | Test | Result | Restored-clean confirmed |
|---|---|---|---|---|
| Guarded-read path (`readRegularFileIfPresent`) | Removed the `classifyEntry` probe entirely, made the read blind again (pre-CR-520 shape) | `no watcher wake source or state file blocks a pass when it is a named pipe` | RED: 5 rows named blocked (`tasks/t1/turn-end`, `tasks/t1/executor.json`, `state/watcher.seen.json`, `state/watcher.cadence.json`, `state/watcher.beacon`), each "BLOCKED IN THE KERNEL, killed after 15000ms" | YES, `diff` byte-identical, `git status --porcelain` empty |
| Guarded-write path (`atomicWrite`'s destination probe) | Removed `refuseOpenForWrite(path)` call, kept stage-then-rename | `no watcher wake source or state file blocks a pass when it is a named pipe` | RED: `ABSORBED INSTEAD OF REPORTED: state/watcher.beacon: exit 3, stdout "", stderr ""` (exact message reproduced) | YES |
| Unique stage name (`randomUUID`) | Restored fixed `${path}.stage` | `a pass stages its state writes under a name no other pass can collide with` | RED (deterministic), "a pass used the predictable stage path .../state/watcher.beacon.stage" | YES |
| Unique stage name (`randomUUID`) | Same mutation | `two single passes released together surface one turn-end` (the wake-loss shape this defect actually produces) | RED 3/5 runs, exact reproduction of the disclosed ENOENT drop: `round 9: the same turn-end was surfaced 0 times ... second="" (exit 1, "tiphys watch: ENOENT: no such file or directory, rename '.../state/watcher.beacon.stage' -> ...")`; consistent with the work history's own disclosed probabilistic rate for this specific mutation | YES |
| Criterion 7 exclusivity flag (`"wx"`) | `"wx"` -> `"w"` | `two single passes released together surface one turn-end` (CR-540 replacement) | RED 20/20 (see table above) | YES |
| CR-521 regression path (probe upstream but `readTaskMeta` itself blind) | Removed the classify probe from `readRegularFileIfPresent` (same as guarded-read mutation, exercised via the liveness-side teardown-specific test) | `a named pipe at a task record does not block teardown` | RED: "teardown blocked on the named pipe at .../tasks/piped/meta.json and was killed after 15000ms: the record was read before it was probed" | YES |

Every mutation was applied to the shipped source, confirmed red, restored
from a byte copy (`.../scratchpad/cr4-backup/*.orig`) and confirmed
identical with `diff`; `git status --porcelain` was empty after every
restore. A full clean rebuild and suite run after all mutation work
reproduced the same 146/146/0/0 as the pre-mutation baseline.

### Direct CLI regression checks (not via the suite), confirming the prior HIGH's six other paths and this round's newly-added lock path

| Planted state | Command | Result |
|---|---|---|
| FIFO at `tasks/t2/meta.json` | `teardown --task t2` (`timeout 8`) | exit 1 (not 124), one clear reason line naming the record, no hang |
| FIFO at `state/orchestrator.lock` | `doctor` (`timeout 8`) | exit 1, all 8 CHECK lines printed, `CHECK lock FAIL ... is a named pipe, not a regular file, so it was not opened` |
| FIFO at `state/watcher.beacon` | `doctor` (`timeout 8`) | exit 1, all 8 CHECK lines printed, `CHECK beacon FAIL beacon file ... does not parse as a beacon record` |
| FIFO at `state/last-wake.json` | `watch --once` on a fleet with a pending turn-end (`timeout 8`) | exit 1, one reason line: "the wake record could not be appended: ... is a named pipe, not a regular file, so it was not opened" |

All four confirm CR-520's class is closed on the paths CR-520 and this
round's own derived inventory named, by direct execution against the real
compiled CLI rather than only through the test suite.

## Scope audit

    git diff --name-status origin/main...HEAD
    A  delivery/work-history/m1-p5.md      standing pre-authorized extra
    M  src/cli.ts                          files-to-touch (edit)
    M  src/commands/doctor.ts              files-to-touch (edit)
    M  src/commands/spawn.ts               files-to-touch (edit)
    M  src/commands/teardown.ts            files-to-touch (edit)
    A  src/commands/watch.ts               files-to-touch (create)
    A  src/liveness.ts                     files-to-touch (create)
    M  src/task.ts                         authorized extension (this round)
    A  src/watcher.ts                      files-to-touch (create)
    M  test/behaviors.json                 standing pre-authorized extra
    A  test/liveness.test.ts               files-to-touch (create)
    M  test/teardown.test.ts               declared extension (deviation 4, accepted by two prior rounds)
    A  test/watcher.test.ts                files-to-touch (create)

Twelve files. All nine files-to-touch paths, both standing extras, one
previously-accepted declared extension, and the one extension authorized
specifically for this round (`src/task.ts`, per DR-0012's delegated fix
authorization). PASSES.

This round's own diff (`git diff 1bdfce5..HEAD --name-status`): exactly
`delivery/work-history/m1-p5.md`, `src/commands/doctor.ts`,
`src/liveness.ts`, `src/task.ts`, `src/watcher.ts`, `test/behaviors.json`,
`test/liveness.test.ts`, `test/watcher.test.ts`, eight files, matching the
work history's own "nothing else" claim exactly.

`src/teardown.ts` (M1-P4 code, authorized but declared NOT edited):
`git diff 1bdfce5..HEAD -- src/teardown.ts` is EMPTY, and `git diff
origin/main...HEAD -- src/teardown.ts` is ALSO empty, the file is
byte-identical to `origin/main` across the whole phase, confirmed, not
just "this round."

`src/commands/spawn.ts`: `git diff 1bdfce5..HEAD -- src/commands/spawn.ts`
is EMPTY, untouched by this round, confirmed.

## Conventions

- ASCII: `grep -rPl '[^\x00-\x7F]'` over every file this phase's diff
  touches (`git diff --name-only origin/main...HEAD | xargs grep -lP
  '[^\x00-\x7F]'`): no matches. (A whole-repo scan does find one hit,
  `delivery/intake/orchestrated-delivery-process.md`, but `git diff
  origin/main...HEAD -- delivery/intake/orchestrated-delivery-process.md`
  is empty, that file is untouched by this phase, last modified at
  `9c3579d`, well before M1-P5, and is the process document being run
  rather than an authored deliverable of this phase, so it is correctly
  out of this scope.)
- Em dash: same scoped scan, no matches.
- pnpm/yarn: `grep -ni "pnpm|yarn"` over the phase's changed files: no
  matches.
- Commit messages: `git log origin/main..HEAD` (14 commits) grepped for
  `claude|gpt|opus|sonnet|anthropic|openai|copilot|co-authored`
  case-insensitively over full subject+body: no matches.
- English only: confirmed by reading every commit message and the fourth-
  round work-history section in full.
- npm only: no lockfile or script changes reference another package
  manager.

## Work-history honesty sampling (T-006)

Every factual claim in the fourth-round section was treated as unverified
until executed, per the dispatch instruction. Sampled aggressively:

| Claim | My verification | Verdict |
|---|---|---|
| Gate numbers, floor toolchain: 146/146/0/0, twice | Reproduced three times (see gate table) | TRUE |
| Gate numbers, default toolchain: 146/144/0/2 | Reproduced once, exact match including which two tests skip and their reasons | TRUE |
| Registry: "151 mappings, 145 distinct registered titles, 145 test() titles discovered, 0 unresolvable, ... 44 added" | My own independent script (and independent confirmation via `git show 1bdfce5:test/behaviors.json` = 145 keys/139 distinct, +7 new keys this round = 152/146) | **FALSE, off by exactly one throughout, see CR-580** |
| "no watcher wake source or state file blocks a pass when it is a named pipe" (11-row inventory, 8 fixed, 1 eliminated by construction) | Reproduced 5 of the 8 rows directly via mutation, plus 4 of the rows via direct CLI FIFO planting outside the suite (meta.json/teardown, orchestrator.lock/doctor, watcher.beacon/doctor, last-wake.json/watch) | TRUE |
| `atomicWrite`'s fixed-stage-name defect: "the same turn-end was surfaced 0 times ... rename ... ENOENT", pre-existing at 1bdfce5, fixed by `randomUUID` | Reproduced the exact ENOENT message and the 0-surfacings shape under the restored-fixed-name mutation; did not independently re-verify the "pre-existing at 1bdfce5" claim by checking out that commit standalone (see honest-failure) | Reproduced mechanism TRUE; "pre-existing" provenance claim NOT independently re-derived by me |
| CR-540 replacement test: "1 round catches 1/3 of the time; at 12 rounds RED 6/6, always within the first 3" | 20 independent mutated runs, 20/20 red, all within round 0-2 | TRUE, and my sample is a stronger confirmation than the disclosed 6/6 |
| `src/liveness.ts` module header correction (TOTAL claim quoted and corrected in place) | Read `src/liveness.ts:66-86` directly | TRUE, exact wording present |
| CR-523: advisory now runs after doctor's check loop | Read `src/commands/doctor.ts:357-413` and the diff at `git diff 1bdfce5..HEAD -- src/commands/doctor.ts` | TRUE |
| Criterion 14's structural grep caught a forbidden token in a new comment, later reworded, during this round's own session | Could not verify from git history: round 4 is a single squashed commit (84dfa41), so an intra-session red state is not preserved in any ref I can diff. Confirmed instead that the FINAL state is clean, both narrowly and with a broader token-only regex with no colon requirement, which is what the criterion actually requires | Final-state claim TRUE; the specific "caught during this round's session" provenance is unfalsifiable from the repository alone (see honest-failure) |
| Scope: "src/task.ts edited, src/teardown.ts authorized but not edited, nothing else" | `git diff 1bdfce5..HEAD --name-status` (8 files) and separate empty diffs for `src/teardown.ts` and `src/commands/spawn.ts` | TRUE |
| Escalations 1-2 (lock.ts/pool.ts still block, out of this round's authorized set) | Not re-verified by me (out of this phase's diff by the work history's own admission and by the plan's files-to-touch list); noted as an open item this round correctly declines to fix | Not independently re-executed; the work history's own disclosure is consistent with the round's stated scope |

## CR-580 (LOW): the work history's self-reported registry count is wrong by exactly one throughout, despite being described as "computed independently"

**The claim.** `delivery/work-history/m1-p5.md`, fourth-round section,
"Behaviors registered this round": "Registry, computed independently over
the live tree: 151 mappings, 145 distinct registered titles, 145 `test()`
titles discovered, 0 unresolvable mappings. Against `origin/main`: removed
none, retitled none, 44 added."

**Why it is wrong.** My own independent script (source: `test(`/`test.skip(`
title scan across every `test/*.test.ts` file, cross-checked against
`test/behaviors.json`, diffed against `git show origin/main:test/behaviors.json`)
computed 152 mappings, 146 distinct titles, 146 `test()` titles discovered,
0 unresolvable, 45 added. Both counts are internally consistent: `git show
1bdfce5:test/behaviors.json` has exactly 145 keys and 139 distinct values
(matching what BOTH third-round reviewers independently reported at that
head), and `git diff 1bdfce5..HEAD -- test/behaviors.json` adds exactly 7
new keys pointing at 7 new distinct test titles. 145+7=152 and 139+7=146,
not 151 and 145. The actual `node --test` run also reports exactly 146
tests on the floor toolchain, matching my 146 and not the work history's
145.

**Why this is not a criterion-15 failure.** The criterion's actual
requirements, 0 fail, zero unaccounted, every newly-named behavior maps to
a test present in the run, every previously-registered mapping still
resolves by name, all hold under my own recount. Nothing was removed or
retitled either way; the discrepancy is purely in the reported totals, not
in resolution.

**Why it is still worth recording.** T-006 was filed specifically because
this phase has a pattern of factual claims that were not executed, or were
executed incorrectly, being written into the record with confidence
language ("computed independently") that invites a later reader to trust
the number rather than recompute it. This is a fresh instance of exactly
that shape, on the one section of this round's own work history that most
directly supports a "criterion 15 met" verdict. It is LOW rather than
higher because the substance is unaffected and I could not construct any
scenario in which the miscount conceals a real resolution failure (I
checked: 0 unresolvable holds both by the work history's arithmetic and by
mine).

**Fix.** Recompute the registry counts with a fresh script run and correct
the four numbers (151->152, 145->146 twice, 44->45) in place, quoting the
original and stating the correction, in the same style the work history
already uses for its other three self-corrected claims.

## Probes run, including empty-handed ones

- Full 11-row inventory from the work history: attacked 5 rows via
  mutation and the remaining 4 via direct FIFO planting on the real CLI
  outside the suite (meta.json/teardown, orchestrator.lock/doctor,
  watcher.beacon/doctor, last-wake.json/watch). All confirmed non-blocking
  and loud.
- Whole-repo non-ASCII / em-dash scan: one hit, `delivery/intake/orchestrated-delivery-process.md`,
  confirmed untouched by this phase (empty three-dot diff) and therefore
  not a convention violation of this phase's authored text.
- `checkLock`'s treatment of a DANGLING symlink at `state/orchestrator.lock`:
  `readRegularFileIfPresent` conflates "absent" and "dangling" into one
  "absent" result, so a dangling lock symlink reads as "no lease present"
  (PASS) rather than an explicit failure, which is a milder classification
  than `checkBeacon`'s dangling-symlink handling (FAIL, per CR-513).
  EMPTY AS A REGRESSION: the pre-round-4 `checkLock` used `existsSync`
  directly, which also returns false for a dangling symlink, so this is
  identical behavior to before this round and is not something round 4
  changed for the worse; not raised as a finding because it predates the
  diff under review and no criterion speaks to it.
- Whole-tree token grep for criterion 14 (broader, colon-free): empty,
  confirming the final state is clean regardless of the specific
  session-internal episode the work history describes.
- Re-derivation of "the ENOENT stage-name defect was pre-existing at
  1bdfce5" by checking out that commit standalone and reproducing it
  directly: NOT attempted (see honest-failure); I instead confirmed the
  mechanism and message by mutating HEAD back to the dangerous state,
  which demonstrates the defect is real and the fix removes it, without
  independently re-deriving the "already present before this round" dating
  claim.
- `.github/workflows/gates.yml` diff across the phase: empty (untouched),
  confirmed.
- Attempted to reproduce CR-505's process-level backoff-reset race
  (mentioned in the phase's history but not part of this round's diff):
  NOT attempted, out of scope for a regression review of round 4
  specifically and already disclosed as unreproducible at library level in
  20 runs by the implementer.

## Honest-failure section

- **CI on this exact head was not observed.** `gh` is absent locally and I
  did not query GitHub. Merge remains conditional on CI green at 84dfa41,
  which only DR-0012's dual-review-plus-CI-green gate can supply, not this
  review.
- **The "pre-existing at 1bdfce5" dating of the stage-name ENOENT defect**
  was not independently re-derived by checking out 1bdfce5 in a separate
  tree and reproducing it there; I verified the mechanism and the exact
  message by mutating HEAD back to the fixed-name state, which is
  sufficient to confirm the defect and its fix are real, but is not the
  same as confirming exactly when it was introduced.
- **The specific claim that criterion 14's grep caught a violation mid-round
  and it was reworded** cannot be checked from the repository, because
  round 4 lands as one squashed commit with no intermediate red state in
  any ref. I confirmed the END state is clean (both the plan's literal
  regex and a broader token-only variant), which is what the criterion
  requires; the session-internal provenance claim is neither confirmed nor
  refuted by anything available to a clean-room reviewer working from git
  history alone.
- **Wall-clock budget.** I did not run the full suite under every
  individual mutation (only the named test via `--test-name-pattern`), plus
  three full clean runs on the floor toolchain bracketing all mutation
  work and one on the default toolchain. This mirrors the third-round
  reviewers' own stated budget tradeoff and I consider it sufficient given
  the targeted mutation table, but a reviewer with more wall-clock time
  could usefully run the full suite under each mutation rather than only
  the named test.
- **`lock.ts` / `pool.ts`'s still-open blocking paths** (the work history's
  own escalations 1 and 2) were not re-verified by me; they are outside
  this phase's diff and outside this round's authorized files, and the
  work history's disclosure is internally consistent with the plan's own
  files-to-touch boundary.
- **I ran as uid 0** (this container's default), so no permission-bit
  behavior was exercised in any of my probes.

## What this contract cannot see

This review walked all fifteen acceptance criteria by direct execution and
found all fifteen met, with no regression from the previous head. Per
T-007, that finding is necessary but not sufficient, and I want to be
explicit about the shape of defect a criteria walk structurally cannot
reach on THIS phase, so an APPROVE here is not read as a clean bill of
health:

1. **Any failure mode whose trigger is not named by one of the fifteen
   criteria.** The criteria describe intended behavior (heartbeat cadence,
   signal-once semantics, staleness thresholds, structural bans on network
   and process-identity code). They say nothing about what happens when a
   file this component reads or writes is not a regular file, which is
   exactly the class T-007 itself documents as invisible to a criteria
   walk on this same phase, one round ago. This round closes eleven
   specific instances of that class across the paths its own inventory
   found; nothing about walking the fifteen criteria would have told me
   whether an twelfth instance remains on a path neither this round's nor
   any prior round's inventory considered. My mutation testing and direct
   CLI probing above went beyond the fifteen criteria specifically to hunt
   for this, but that hunting was informed by the prior rounds' own
   findings (CR-520 through CR-523, CR-540) rather than derived
   independently the way the hazard-contract reviewer is tasked to do; a
   path I did not think to plant a FIFO at is a path I did not check.
2. **Timing- and scheduler-sensitive races below what a 20-trial or even a
   200-round sample can rule out.** The CR-540 witness's own honest framing
   applies to my confirmation of it: a measured rate on this machine, in
   this container, at this moment, is not a guarantee for every CI runner
   under every load.
3. **Anything whose hazard class is not "reads a file it does not own"**,
   for instance, resource exhaustion (file descriptor leaks across many
   watcher evaluations), interaction with a REAL scheduler driving `--once`
   at a cadence the operator misconfigures, or filesystem semantics that
   differ from this Linux container (case sensitivity, symlink behavior on
   another OS, NFS locking semantics). None of the fifteen criteria probe
   these, and neither did I, because my contract is the criteria plus
   regression-hunting informed by prior findings, not an open-ended hazard
   derivation.
4. **Design-level questions the criteria assume answered**, for example,
   whether "warn, never block" is the right contract at all for a
   guard whose own read path can (before this round) or could-in-principle
   (residual TOCTOU window, disclosed and accepted by this round) still
   fail. A criteria walk checks conformance to the contract, not whether
   the contract is the right one.

The concurrent hazard-contract review is the mechanism this project put in
place, per T-007, specifically to cover the first and third of these. I
have not seen that review and this APPROVE should be weighed jointly with
it, not in isolation.

## Verdict

**APPROVE.**

All fifteen acceptance criteria are met by my own independent execution at
84dfa41, none regressed from the previously-approved head, the two prior
HIGH/MEDIUM findings from the third round (CR-520, CR-540) are confirmed
fixed by direct mutation and direct CLI probing (not merely by reading the
suite), the scope audit passes exactly, conventions are clean, and gate
numbers match the work history's claims exactly on both toolchains. The
one finding I raise (CR-580) is LOW severity, does not affect criterion
15's substance, and does not meet DR-0012's bar for blocking ("no
unresolved high or medium finding"), it is a documentation-accuracy
correction, not a merge blocker under this project's stated policy, though
I flag it because it is exactly the kind of thing T-006 asks reviewers to
hunt for and because it undercuts confidence in a phrase ("computed
independently") that this record now needs to earn back.

This verdict is offered jointly with, and should not be read as
sufficient without, the concurrent hazard-contract review's own verdict on
the same head, per the explicit lesson of T-007.
