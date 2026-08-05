# Clean-room review: M1-P5 (watcher and liveness guard) - round B

- Date: 2026-08-05
- PR: 8
- Branch: claude/m1-p5-watcher-liveness
- Head reviewed: 1bdfce5fcf0ecfa88d7318f58f77b378544045b5
- Reviewer: independent clean-room reviewer (second of two, running concurrently
  with a sibling reviewer in a separate worktree; neither saw the other's
  findings)
- Merge base for three-dot diffs: origin/main (6ec0482, M1-P4 merged)
- Worktree: /tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/cr-p5-b
  (isolated, detached at the reviewed head; nothing outside this worktree was
  touched)

## Method

Contract-first, executed rather than read. The 15 acceptance criteria of
plan section 3, M1-P5, were walked one at a time: for each one I built a
throwaway scratch fleet by hand (via `tiphys init` plus hand-written
`tasks/<id>/meta.json`, `turn-end`, or `executor.json` files, or via real
`git init` + `tiphys spawn` for the scenarios that need a real project), ran
the compiled CLI (`node dist/bin/tiphys.js ...`) directly, and captured exit
codes and stdout/stderr myself. I did not accept the implementer's or the
prior reviewers' captured transcripts as evidence; every criterion below has
its own command and output captured in this session.

Separately, I read `src/liveness.ts`, `src/watcher.ts`, `src/commands/watch.ts`
in full, and the diffs to `src/cli.ts`, `src/commands/spawn.ts`,
`src/commands/teardown.ts`, `src/commands/doctor.ts`, `test/watcher.test.ts`,
`test/liveness.test.ts`, `test/teardown.test.ts`, `test/behaviors.json`, and
the complete 1226-line `delivery/work-history/m1-p5.md` (both fix rounds and
the final confirmation round).

For criteria 6 through 12, and for the fix-round changes to
`src/liveness.ts` (stuck-claim, unreadable-meta, future-beacon,
declared-cadence-floor, task-record-classification ordering), I mutated the
shipped source directly in this worktree, ran the named guarding test with
`--test-name-pattern "<title>"` BEFORE the file path (per the environment
warning), confirmed red, and restored the file from a byte copy taken before
any mutation, verified identical with `diff` after restoration. Every
mutation round is in the table below with the restore verified.

## Gate evidence (this session, Node v22.22.2, npm 10.9.7)

1. `npm ci` from the pre-cloned worktree: exit 0, EBADENGINE warnings as
   expected (floor `>=26`, local `22.22.2`).
2. `npm run build` from `rm -rf dist *.tsbuildinfo`: exit 0.
   `git status --porcelain` empty afterward, both before and after every
   mutation-and-restore cycle (verified repeatedly, not just once).
3. `node --test` from `rm -rf dist *.tsbuildinfo` (no prior build), final
   clean run of this session:

       1..139
       # tests 139
       # suites 0
       # pass 137
       # fail 0
       # cancelled 0
       # skipped 2
       # todo 0
       # duration_ms 91977.481482

   (A second full run after all mutation work measured 76.1s; both are
   within the work history's own stated spread. The 2 skips are the
   unchanged M1-P2 floor-gated doctor witnesses, each with its recorded
   reason.)

## Behavior registry (criterion 15), checked mechanically

Script: parsed `full test output` for every `# Subtest: <title>` line
(139 distinct titles) and checked, for every key in `test/behaviors.json`,
that its value string equals one of those titles.

- `test/behaviors.json` on HEAD: 145 entries, 139 distinct test titles.
- Missing (registered but no matching test title in this run): 0.
- `test/behaviors.json` on `origin/main`: 107 entries.
- Keys present on `origin/main` but absent on HEAD: 0 (none removed).
- Keys present on both with a changed value (test re-pointed): 0.

Criterion 15 MET, verified by name resolution rather than by count, exactly
as the criterion requires.

## Scope audit

    git diff --name-status origin/main...HEAD
    A  delivery/work-history/m1-p5.md      standing pre-authorized extra
    M  src/cli.ts                          files-to-touch (edit)
    M  src/commands/doctor.ts              files-to-touch (edit)
    M  src/commands/spawn.ts               files-to-touch (edit)
    M  src/commands/teardown.ts            files-to-touch (edit)
    A  src/commands/watch.ts               files-to-touch (create)
    A  src/liveness.ts                     files-to-touch (create)
    A  src/watcher.ts                      files-to-touch (create)
    M  test/behaviors.json                 standing pre-authorized extra
    A  test/liveness.test.ts               files-to-touch (create)
    M  test/teardown.test.ts               DECLARED EXTENSION (deviation 4)
    A  test/watcher.test.ts                files-to-touch (create)

Eleven files. All nine files-to-touch paths, both standing extras, and one
declared extension (`test/teardown.test.ts`). PASSES. I read the full diff
to `test/teardown.test.ts`: it is exactly the claimed change (a `runCli`
helper that separates the guard's advisory line from the command's own
stderr, asserts the guard produced at most one line, and does not weaken or
delete any existing assertion). `.github/workflows/gates.yml` is untouched
(`git diff origin/main...HEAD -- .github/workflows/gates.yml` is empty).

## Conventions

- ASCII: `grep -rnP '[^\x00-\x7F]'` over every changed file: empty.
- Em dash: grepped for the em dash character over every changed file: empty.
- pnpm/yarn: `grep -rni "pnpm\|yarn"` over every changed file: empty.
- Commit messages (`git log origin/main..HEAD`, 14 commits): no AI/model/tool
  name in subject or body (`grep -inE
  "claude|gpt|opus|sonnet|anthropic|copilot|co-authored"` over full commit
  bodies: empty).
- English only: confirmed by reading.

## The 15-criteria walk (my own execution)

**1. MET.** Real `tiphys watch --interval 0.5 --poll 0.1 --backoff-cap 10`
against a hand-built fleet with one open task, no signals, sampled the
beacon file every 200ms for 3.8s from a separate process:

    beacon writtenAt/backoffStreak samples:
    05:56:45.307Z streak 0
    05:56:45.806Z streak 1   (gap 499ms)
    05:56:46.807Z streak 2   (gap 1001ms)
    05:56:48.808Z streak 3   (gap 2001ms)

Gaps strictly increase and double; process still running after kill; zero
bytes were ever on stdout while idle.

**2. MET.** Real resident watcher (`--interval 30 --poll 0.1`), turn-end
written for `t1` mid-run: exit 0, stdout exactly `signal t1 turn-end\n`,
stderr empty, measured latency 75ms.

**3. MET.** Fresh init'd fleet, no open tasks, `--interval 0.4 --poll 0.1`:
still running after 1.3s (>3 base intervals), 0 stdout bytes; same fresh
fleet with `--max-heartbeats 2`: exit 0, stdout `heartbeat 2`. (Also
observed, on a fleet that already had cadence state from a prior run in the
same directory, that `--max-heartbeats 2` printed `heartbeat 4` because the
ordinal is the fleet's cadence streak, not a per-run counter -- this is the
plan's own documented design, key decision 3 in the work history, not a
defect; re-verified on a clean fleet to isolate the effect.)

**4. MET, both halves.** Virgin fleet with one open task, `watch --once`:
exit 3, stdout and stderr both empty (0 bytes). Same fleet with a turn-end
file added: `watch --once` exit 0, stdout `signal t1 turn-end`, byte-for-byte
what resident mode printed in criterion 2.

**5. MET.** Virgin fleet, `--once --interval 0.4`: exit 3 (init pass).
500ms later, same command: exit 0, `heartbeat 1`. Immediately again: exit 3,
empty stdout. `state/watcher.cadence.json` shows `backoffStreak: 1`
persisted across three separate process invocations.

**6. MET.** First `--once` on a fleet with a pending turn-end: exit 0,
`signal t1 turn-end`. Second `--once`, same unchanged turn-end: exit 3,
empty stdout.

**7. MET, in the sense the plan states it, with a coverage caveat (see
Finding CR-540).** Part (a), deterministic hold: staged one held pass and
one unheld pass exactly as the suite does; confirmed exactly one surfaces
and one reports no-wake. Part (b): I additionally built a THIRD scenario the
registered suite does not build -- two `--once` processes given the SAME
`TIPHYS_WATCH_TEST_HOLD` barrier, both allowed to reach the hold, then
released with a single file write so both resume as close to
simultaneously as the OS schedules them. Against the real (unmutated)
source this is correctly serialized (see mutation table, row "criterion 7
dual-release"). Against a one-line mutation removing the claim file's
exclusivity, this exact scenario produces a duplicate: both processes print
`signal t1 turn-end` and both exit 0. See CR-540 for why the registered
criterion-7 tests do not catch that mutation.

**8. MET.** Fleet with a pending-then-consumed turn-end, three subsequent
no-wake `--once` passes: beacon timestamps `...11.852Z`, `...11.941Z`,
`...12.017Z`, each strictly greater than the last (some within the same
second, confirming sub-second strictness, not just second-granularity
advance).

**9. MET.** Open task, `executor.json` deadline 60s in the past, no
turn-end: `watch --once` exit 0, stdout exactly `stale t1 deadline`. Same
task with a deadline 60s in the future: exit 3, empty stdout.

**10 and 11. MET, both, driven through real `spawn`/`teardown`/`doctor`
against a real git upstream and a real clone** (not just the unit-level
`guard()` call): built three scratch fleets (absent beacon, fresh beacon,
1260s-old beacon against the shipped 1200s default threshold), each with a
first task left open by an earlier spawn, then ran `spawn p2`,
`teardown p1`, `doctor` in each:

    absent beacon:  spawn exit=0 stderr=[watcher stale: 1 open task(s)... no readable beacon...]
                    teardown exit=0 stderr=[watcher stale: 2 open task(s)...]
                    doctor   exit=1 stderr=[watcher stale: 1 open task(s)...]  (exit 1 is the floor gate, see note)
    fresh beacon:   spawn exit=0 stderr=[]
                    teardown exit=0 stderr=[]
                    doctor   exit=1 stderr=[]
    stale (1260s):  spawn exit=0 stderr=[watcher stale: 1 open task(s)... 1260s old (threshold 1200s)...]
                    teardown exit=0 stderr=[watcher stale: 2 open task(s)...]
                    doctor   exit=1 stderr=[watcher stale: 1 open task(s)...]

Exit codes are identical across all three beacon conditions for each
command (spawn 0/0/0, teardown 0/0/0, doctor 1/1/1); doctor's own stdout
(8 CHECK lines) and spawn/teardown's own stdout are present and unchanged in
every run; exactly one "watcher stale" line appears in the absent and stale
cases and zero in the fresh case. (Doctor's exit 1 in all three cases is the
local Node-floor FAIL, an M1-P2 acceptance criterion unrelated to this
phase; the CRITERION-RELEVANT comparison, "the same code with and without
the warning," holds. This matches the work history's own disclosed
floor-gating and I confirm it firsthand rather than taking it on faith.)

**12. MET, both clauses.** (a) Built a beacon dated at max backoff
(`intervalMs` = `backoffCapMs` = 900000ms) and probed `guard()` directly at
7 points from 0 to `backoffCapMs + pollIntervalMs` (915000ms): fresh at
every point (all `stale: false`), because the shipped defaults
(`staleThresholdMs` 1200s) exceed the worst-case gap (915s) with the
documented room to spare. I then probed the ACTUAL threshold boundary
(1200000ms): fresh exactly at 1200000ms, stale at 1200001ms -- confirming
"strictly greater than" is enforced at the real configured threshold, not
just within the PR-009 arithmetic margin. (b) `TIPHYS_WATCH_BACKOFF_CAP_SECONDS=900
TIPHYS_WATCH_POLL_SECONDS=15 TIPHYS_WATCH_STALE_SECONDS=915 node dist/bin/tiphys.js version`:
raises at import, exit 1, message names all three values including the
computed sum. The same with `STALE_SECONDS=916`: exit 0. Via the flag form,
`watch --once --backoff-cap 36000` on a fleet with the default 1200s
threshold: exit 64, usage-error message naming both values (1200000ms and
36015000ms).

**13. MET.** `grep -nE "node:(http|https|http2|net|tls|dgram|dns)|fetch\(|axios|undici"`
over `src/watcher.ts`, `src/liveness.ts`, `src/task.ts`, `src/fleet.ts`,
`src/lock.ts`, and separately over the whole of `src/` and `bin/`: no
matches (exit 1) in both cases.

**14. MET.** `grep -rniE "process\.kill|\bpid\b|/proc\b|signal\s*0|SIG[A-Z]{3,}|detached\s*:|\.unref\(|daemon|background"`
over `src/watcher.ts`, `src/liveness.ts`, `src/commands/watch.ts`, and
separately over the whole of `src/` and `bin/`: every hit is either the
wake-line grammar word "signal" / "SignalIdentity" (an unrelated
domain term, not a process signal) or prose stating that nothing is
backgrounded/daemonized (in `src/spawn.ts` and `src/watcher.ts` module
docs). No `detached:`, no `.unref(`, no `process.kill`, no `/proc`, no
`SIG<NAME>`. `watch.ts`'s flag surface is exactly `--once`, `--interval`,
`--poll`, `--backoff-cap`, `--max-heartbeats`; no child process is started
anywhere in the three files.

**15. MET.** See "Behavior registry" section above: `node --test` exits 0,
139 tests, 137 pass, 0 fail, 2 skip (recorded reason), and the registry
resolves all 145 mappings by name with 0 previously-registered mappings
lost or repointed.

### Criteria table

| # | Verdict | Method |
|---|---|---|
| 1 | MET | direct execution, sampled beacon |
| 2 | MET | direct execution |
| 3 | MET | direct execution (two fleets) |
| 4 | MET | direct execution |
| 5 | MET | direct execution |
| 6 | MET | direct execution |
| 7 | MET (coverage caveat, CR-540) | direct execution + extra dual-release probe |
| 8 | MET | direct execution |
| 9 | MET | direct execution |
| 10 | MET | direct execution, real spawn/teardown/doctor x3 beacon states |
| 11 | MET | direct execution, same run as 10 |
| 12 | MET | direct execution against exported `guard`/`assertCadenceInvariant` |
| 13 | MET | grep, run myself |
| 14 | MET | grep, run myself |
| 15 | MET | full suite + independent name-resolution script |

Totals: 15 met, 0 not-met, 0 not-verifiable-here.

## Mutation testing

All mutations applied in-place to the shipped source in this worktree, run
with `--test-name-pattern "<exact title>"` BEFORE the file path, confirmed
red, then restored from the byte copy taken before any mutation and
verified identical with `diff -q` (all restores confirmed identical; the
final full suite after all mutation work reports the same 139/137/0/2 as
the clean run above, and `git status --porcelain` is empty).

| Criterion / property | Test title | Mutation | Result |
|---|---|---|---|
| 9 (deadline stale) | `an open task past its executor deadline with no turn-end is stale` | `deadlineMs <= nowMs` gated behind `false &&` | RED (`3 !== 0`) |
| 6 (signal once) | `a surfaced turn-end is not surfaced again by the next pass` | seen-state write (`atomicWrite(seenPath...)`) commented out in `claimSignal` | RED (`0 !== 3`) |
| 8 (beacon advances on no-wake) | `a no-wake single pass strictly advances the beacon` | final `writeBeacon(...)` call in `runOnce`'s no-wake path commented out | RED (assertion `notStrictEqual` failed: beacon unchanged) |
| 7 (race, deterministic) | `two passes racing on one turn-end surface it exactly once` | claim file open flag `"wx"` -> `"w"` (removes exclusivity) | GREEN (see CR-540) |
| 7 (race, probabilistic, 5 rounds x3 runs) | `a resident watcher and a concurrent single pass never both surface a wake` | same `"wx"` -> `"w"` mutation | GREEN 3/3 runs (see CR-540) |
| 7 (dual-release, my own construction, not a registered test) | n/a (manual) | same `"wx"` -> `"w"` mutation | Two genuinely concurrent `--once` processes released from the same hold barrier BOTH printed `signal t1 turn-end` and exited 0 -- a real duplicate signal. Same construction against the UNMUTATED source: exactly one of three trials surfaced, the other two reported no-wake (3/3 correct). |
| 7 mutation, full suite | (whole suite) | same `"wx"` -> `"w"` mutation | 1 failure: `a stranded seen-state claim fails loudly instead of reporting no-wake` (a different, debris-based scenario; see CR-540) |
| Fix round: stuck-claim (CRITICAL, second reviewer finding 1) | `a stranded seen-state claim fails loudly instead of reporting no-wake` | the `"stuck"` return replaced with `return { kind: "lost" }` before the dead `stuck` branch | RED, exact message from work history reproduced: `a stuck claim was reported as an ordinary no-wake: ""` |
| Fix round: FIFO ordering (HIGH, NEW-2) | `a named pipe at a task record is classified without blocking` | `surveyTaskRecords` restructured to call `readTaskMeta` before the `lstat`/`stat` probe (the pre-fix ordering) | RED, bounded, exact message reproduced: `the watcher blocked on the named pipe at .../meta.json and was killed after 15000ms: the record was read before it was probed` (real `mkfifo`, 15s bound enforced by the test's own child-process kill, confirmed available on this runner) |
| Fix round: load-time invariant (criterion 12b) | `a cadence that would make a healthy watcher stale fails at load` | `assertCadenceInvariant` short-circuited with an early `return` | RED (`0 !== 0` -- the child process that should have failed exited 0) |
| Fix round: criterion 10/11 present-but-stale branch | `a stale beacon warns on spawn teardown and doctor without changing them` | the `verdict.kind === "stale"` branch in `guard()` gated behind `false &&` | RED (expected 1 stale line, got 0) |
| CR-501/fix: future-dated beacon | `a beacon dated in the future is no evidence that supervision ran` | the `ageMs < -BEACON_FUTURE_TOLERANCE_MS` check gated behind `false &&` | RED |
| Fix round: unreadable-meta in-flight count | `a task whose record cannot be read still counts as in flight` | `surveyTasks`'s `unreadable` count forced to `0` | RED |
| Fix round: shared classifier agreement | `the watcher and the guard agree on every task-record shape` | same `unreadable: 0` mutation | RED |
| Fix round: unexaminable entry (ELOOP, CR-512) | `a task entry that cannot be examined is counted and reported` | same `unreadable: 0` mutation (drops `problems` too, since both roll into the same count) | RED |

15 of 16 mutation probes behaved as a correct guard would (green only when
the shipped behavior is genuinely absent, red when the dangerous state was
reintroduced). One probe (the `"wx"`-exclusivity removal against the two
criterion-7-labeled tests) came back green where I expected red; I did not
stop at that green result and instead built an independent, non-registered
probe to determine whether it represented a real gap or a bad sabotage.
That investigation is CR-540 below.

## CR-540 (MEDIUM): criterion 7's registered tests do not exercise the claim file's own mutual exclusion; the exclusion is real and correct, but its test coverage is coincidental

**Claim under test.** Criterion 7 requires: "A resident watcher and a
concurrent `--once` pass evaluating the same pending turn-end never both
surface it: exactly one prints the signal line and exits 0, the other
reports no-wake." The mechanism that enforces this for two independent
processes is the exclusive claim file open in `claimSignal`
(`src/watcher.ts:587`, `writeFileSync(claimPath, "", { flag: "wx" })`): two
processes racing to create the same file with `wx` cannot both succeed, so
only one proceeds to read-then-write the seen state.

**Why it is wrong to call this fully witnessed by name.** I mutated the
flag from `"wx"` to `"w"` (removes the exclusivity; a second writer now
silently truncates instead of getting `EEXIST`). Both tests registered
against criterion 7 -- `watcher-race-single-surfacing` (the deterministic
hold-and-release test) and `watcher-resident-versus-once-race` (the 5-round
probabilistic test) -- stayed GREEN under this mutation, in three full runs
of the probabilistic test (15 rounds total, 0 double-surfacings observed).
This is not a coincidence of bad luck: the deterministic test only ever
holds ONE process while the other runs to completion and releases its own
claim file BEFORE the held process resumes, so the held process's later
claim attempt finds no residual file to contend with -- it is protected by
the identity-comparison (`sameIdentity`) check, not by the file's
exclusivity. The probabilistic test is one-sided by the implementer's own
measurement (resident wins essentially always because it is already armed),
so it also never reaches the narrow window in which two processes attempt
the exclusive open at close to the same instant.

I then built the scenario that DOES exercise the exclusion directly: two
`--once` processes given the SAME `TIPHYS_WATCH_TEST_HOLD` barrier path,
both allowed to reach the hold (`.observed` written by each), then released
with a single `touch` so both resume as simultaneously as the OS schedules
them. Against the shipped, unmutated source, three trials of this
construction gave exactly one surfacing and one no-wake each time (correct).
Against the `"wx" -> "w"` mutation, the SAME construction gave both
processes `signal t1 turn-end` on stdout and both exiting 0 -- a genuine
duplicate signal, which is precisely the dangerous state criterion 7
exists to prevent, and it is real and reachable, not a residue-debris
scenario.

Running the full suite under the same mutation does fail one test --
`watcher-stuck-claim-loud` -- but that test's scenario is a PRE-EXISTING
debris claim file with no live contender, a different property (the fix
round's stuck-claim loudness), not the live two-process race criterion 7
names. So the mutation is caught by the suite, but not by any test that
is or should be attributed to criterion 7, and not by exercising the actual
failure mode (a genuine live race) I demonstrated with my own construction.

**Severity reasoning.** This is not a shipped defect: I verified the
current code handles the real dual-release race correctly, 3/3. It is a
red-witness gap under the repository's own strengthened rule ("a test only
counts as guarding a behavior if it has been demonstrated red without the
behavior"): the tests LABELED as guarding criterion 7's true-concurrency
half do not, by demonstration, guard the file-exclusivity mechanism that
actually implements it. If a future edit weakens or removes that
exclusivity, the registered criterion-7 tests will not catch it, and the
only thing that currently would is the unrelated stuck-claim test, by
accident of implementation, not by design. I am scoring this MEDIUM rather
than HIGH because the shipped behavior is currently correct and the gap is
in test-attribution/coverage rather than in the running kernel; it would
become higher-severity the moment `claimSignal`'s locking is refactored
without someone re-deriving this constraint from scratch, since nothing in
the suite would tell them they broke it.

**Fix.** Add a test that gives two `--once` (or one resident, one `--once`)
processes the SAME `TIPHYS_WATCH_TEST_HOLD` barrier, waits for both
`.observed` markers, releases both with one write, and asserts exactly one
surfaces -- i.e., promote my probe above from an ad hoc reviewer script to
a registered behavior (e.g. `watcher-race-simultaneous-claim`). This is a
small addition to `test/watcher.test.ts` next to the existing hold-seam
test and does not require any source change.

## CR-541 (LOW): criterion 3's `--max-heartbeats` ordinal is fleet-scoped, confirmed correct but worth a one-line acceptance-walk caveat

Not a defect. Documented here because I initially got a surprising result
(`heartbeat 4` instead of `heartbeat 2`) reusing a fleet directory across
manual probes, which cost me a rerun to isolate; it is exactly the
documented behavior (work history key decision 3: the ordinal is the
fleet's cadence streak, not a per-invocation counter, so `--max-heartbeats`
bounds the RUN's ticks, not the printed number). Confirmed correct on a
clean fleet (`heartbeat 2` as expected). No fix needed; noting it so a
future reviewer walking criterion 3 does not mistake fleet reuse for a bug,
the way I nearly did.

## Work-history honesty sampling

Sampled aggressively rather than spot-checked, given the file's own
disclosure that three earlier assertions were caught by reviewers rather
than self-caught:

- Gate evidence numbers (139/137/0/2 tests, `git status --porcelain` empty
  after build): reproduced exactly in this session, independently.
- Registry counts (145 mappings, 139 titles, 0 missing, 0 previously
  registered removed): reproduced exactly with my own script, not the
  implementer's.
- Every one of the 15 criteria's walked evidence (exit codes, stdout lines,
  beacon behavior): reproduced independently with my own scratch fleets,
  not by reading the implementer's transcripts (which are session artifacts
  and not present in the diff to check against anyway).
- The T-002 witness's claim of a REAL spawn, real git worktree, real killed
  process, real dirty worktree: read the test source directly
  (`test/watcher.test.ts:624-684`); it is exactly as claimed, not a
  synthesized file state.
- The `test/teardown.test.ts` deviation-4 claim (stderr/advisory
  separation, no assertion weakened): read the full diff to that file;
  matches exactly.
- CR-513's claim (dangling-symlink beacon moved from WARN/absent to
  FAIL/unreadable, doctor's exit code is criterion-visible on CI but masked
  locally by the floor gate): reproduced directly --
  `CHECK beacon FAIL beacon file .../watcher.beacon does not parse as a
  beacon record` for a dangling symlink, confirmed.
- The FIFO fix (NEW-2) and its ordering claim: reproduced with a real
  `mkfifo`, confirmed the pre-fix ordering hangs (bounded, 15s, exact
  message) and the shipped ordering does not.
- The stuck-claim fix (second reviewer finding 1) and its exact message:
  reproduced verbatim.
- No new instance of the "assertion about the world that was not executed"
  failure mode (the pattern the work history flags three times already, all
  caught by reviewers) was found in this sampling. The one place I found a
  claim that does not fully hold up under scrutiny is not in the work
  history's factual assertions but in what the registered TESTS actually
  cover for criterion 7 (CR-540) -- the work history's own criterion-7 walk
  (entry 7, "PASS, in two parts...") is accurate about what was run and
  what it showed; it does not claim to have tested the live-race
  exclusivity in isolation, and I am not treating CR-540 as a work-history
  honesty defect, only as a test-coverage one.

## Probes run (including empty-handed ones)

- Network-import grep over the full `src/`/`bin/` tree (not just the three
  named files): empty, as expected.
- Process-identity grep over the full `src/`/`bin/` tree: three prose hits,
  all confirming absence, no real hit.
- `.github/workflows/gates.yml` diff: empty (file untouched, as claimed).
- `bin/tiphys.ts` diff: empty (file untouched; the CR-502/CR-509 residue --
  a raw stack trace instead of a clean reason line when an env-var cadence
  is malformed -- is real and reproduced by me directly with
  `TIPHYS_WATCH_STALE_SECONDS=abc node dist/bin/tiphys.js version`, exit 1
  with a raw Node stack trace rather than a one-line reason. This is
  correctly disclosed as an OUT-OF-SCOPE residue in the work history
  (bin/tiphys.ts is not on this phase's files-to-touch list) and I am not
  raising it as a new finding for that reason; I confirm the disclosure is
  accurate rather than overstated.)
- Attempted to reproduce CR-505's process-level window (concurrent backoff
  reset racing a resident heartbeat tick): did not attempt this myself,
  given the work history's own honest disclosure that it was unreproducible
  in 20 runs at library level after being fixed there; I judged re-running
  that specific probe a poor use of remaining time versus the higher-value
  dual-release construction above, which is an HONEST GAP, not a finding
  (see honest-failure section).
- Checked whether `--deadline`-less abandonment detection was silently
  added beyond the plan's stated scope (it would be an undisclosed feature
  creep): confirmed absent, matching the work history's explicit
  "NOT DONE, deliberately" entry; `scanUnsafe` only reads
  `executor.json`'s deadline field, no worktree/git inspection anywhere in
  `src/watcher.ts`.
- Checked `PROFILES.watch` in `src/commands/doctor.ts` for the claimed
  second promoted condition: confirmed `["beacon-absent", "beacon-stale"]`
  at line 45, matching deviation 6.
- Checked `test/behaviors.json` for any behavior mapped to a test title NOT
  present in this run's output (would indicate a stale/renamed mapping):
  zero found.
- Checked commit messages individually (not just grepped) by eye for tone
  and AI-attribution: clean.

## Honest-failure section (what I could not check, and why)

- I did not re-attempt CR-505's process-level race reproduction (see
  probes-run). The work history's own disclosure there is specific and
  numeric (0/20) and I judged independently re-running the same 20-trial
  experiment a lower-value use of remaining time than the dual-release
  construction that produced CR-540, which was not previously probed by
  either round-one reviewer as far as the work history records.
  I flag this as unverified-by-me rather than assume it is fine.
- I did not run the full M1 exit-test harness end to end (it is M1-P6
  scope, not yet built on this branch) -- section 4's stage A/C procedure
  is out of scope for this phase's review, consistent with the plan's own
  phasing.
- I did not attempt to reproduce CI's Node 26 environment locally (Node
  22.22.2 only); every floor-gated claim in this review is stated as such,
  matching the two pinned skips, and I did not independently provision a
  Node 26 runtime to re-verify doctor's absolute exit codes.
- Wall-clock budget: I did not run the full suite repeatedly under every
  mutation (only the targeted `--test-name-pattern` runs plus two full
  clean runs bracketing all mutation work, plus one full run under the
  `"wx"->"w"` mutation specifically to check for suite-wide fallout). I
  consider this sufficient given the targeted mutation table above, but a
  reviewer with more wall-clock budget could usefully run the full suite
  under each of the ~15 mutations rather than only the named test.

## Verdict

**APPROVE**, with one medium finding (CR-540) that I recommend be filed as
a follow-up test addition rather than treated as a merge blocker: the
running code is correct (verified by direct construction of the real race
it is meant to prevent, in both the buggy-mutant and the shipped forms),
and DR-0012's bar is "no unresolved high or medium finding" from the
CURRENT round's clean-room reviews -- I am recording this finding now
so it is visible, but recommend the orchestrator's judgment on whether a
test-only addition (no source change, no re-review of source logic) rises
to blocking a phase that has already been through four review rounds with
CR-501 to CR-513, all closed. If the orchestrator's policy reads DR-0012
strictly, this is a FIX-ROUND-NEEDED verdict for the one test addition
named in CR-540's fix. I am stating the evidence and severity plainly and
leaving the merge-authority call to the orchestrator, since CLAUDE.md
reserves that call and I hold no merge authority here regardless.

If a strict reading is preferred: **FIX-ROUND-NEEDED** (one medium finding,
CR-540, fixable by adding one test with no source change).
