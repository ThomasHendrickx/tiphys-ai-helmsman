# Clean-room review: M1-P5 (watcher and liveness guard)

- Date: 2026-08-05
- PR: 8
- Branch: claude/m1-p5-watcher-liveness
- Head reviewed: de8c1bd
- Reviewer: independent clean-room reviewer (first of two, different model
  families, same head, neither reviewer saw the other's findings)
- Merge base: 6ec0482 (M1-P4 merged on main)

## Method

Contract-first. The 15 acceptance criteria of plan section 3, M1-P5, were
treated as the contract and walked by EXECUTION wherever a criterion could
be executed, independently of the phase's own test suite: real `tiphys`
invocations against scratch fleets, with exit codes and stdout or stderr
captured. The phase's tests were then read and attacked separately, by
sabotaging the shipped sources and confirming the guarding test goes red
against the dangerous state rather than merely against an absent feature.
The three plan constraints were checked by grep and by reading every line
of the three new modules.

Note on the local repository: the checkout at /home/user/tiphys-ai-helmsman
carries a stale `origin/main` at 54ceb6e (M1-P3). The real base is GitHub's
`main` at 6ec0482, which was fetched explicitly; all three-dot diffs below
are against that.

## Isolation

All work was done in a private clone, with every scratch file inside it or
inside a scratch directory this review created:

    CLONE=.../scratchpad/p5-criteria-opus
    rm -rf "$CLONE"; git clone --no-hardlinks -q /home/user/tiphys-ai-helmsman "$CLONE"
    git -C "$CLONE" checkout -q de8c1bd; cd "$CLONE" && npm ci
    git -C "$CLONE" remote add gh https://github.com/ThomasHendrickx/tiphys-ai-helmsman
    git -C "$CLONE" fetch -q gh main

Every sabotage was applied inside the clone, measured, and restored from a
byte copy taken first, never with `git checkout --` (environment warning 8).
`git status --porcelain` was verified empty after every restoration. No
file in /home/user/tiphys-ai-helmsman was written except this review. The
clone and the scratch probe directories are deleted.

## VERDICT: APPROVE

All 15 acceptance criteria are met. Fourteen were confirmed by independent
execution; criterion 15 was confirmed by running the suite and by an
independent registry-resolution script with a rename probe. The three
binding constraints hold by grep and by reading. The scope audit passes.
The declared scope extension into test/teardown.test.ts is necessary,
correctly bounded, and does not weaken the six M1-P4 tests it touches, which
was verified by breaking those tests' contract and watching them go red.

Seven findings are recorded. None is high. None is medium. None blocks
merge under DR-0012. Finding CR-501 is the one I would most want an owner
to see, and its reasoning for staying low is stated in full rather than
assumed.

## What I executed versus what I read

EXECUTED (exit codes and output captured, all in the private clone):

- `npm ci`, `npm run build` (from a removed dist/ and removed tsbuildinfo),
  `node --test` (twice, full), `git status --porcelain` after each.
- Criteria 1, 2, 3: a resident watcher started as a shell-owned background
  job, beacon stamps sampled from disk, stdout and stderr captured.
- Criteria 4, 5, 6, 8, 9: direct `tiphys watch --once` sequences on scratch
  fleets built by `tiphys init` plus a hand-written open-task meta.
- Criterion 7 part (a): the hold-seam interleave, staged and released, with
  the `<barrier>.released` contents read back.
- Criterion 7 part (b): 5 rounds of resident-versus-concurrent-`--once`.
- Criteria 10 and 11: two full scenarios each running a real `git init`,
  a real clone, two real `tiphys spawn` runs, a real `tiphys teardown` and
  two `tiphys doctor` runs, stale beacon versus fresh beacon, exit codes
  and stale-line counts compared.
- Criterion 12 both clauses: the guard probed through the real module at
  the shipped defaults at five ages including both boundaries, and the
  load-time failure driven through a child process for both the violating
  and the one-second-larger configuration.
- Criteria 13 and 14: grep over the whole of src/ and bin/, not only over
  the three files the criterion names.
- Criterion 15: full suite plus an independent registry script over the
  captured test-name list, plus a rename probe to prove the script is
  falsifiable.
- Six sabotages of my own, listed under the findings and the scope-extension
  ruling.
- Four adversarial probes the orchestrator asked for: the cadence-currency
  probe, the cry-wolf configuration probe, the warning-never-blocks probe,
  and a guard-totality probe.

READ ONLY (not executed): src/watcher.ts in full, src/liveness.ts in full,
src/commands/watch.ts in full, the diffs to src/cli.ts, src/commands/spawn.ts,
src/commands/teardown.ts, src/commands/doctor.ts and test/teardown.test.ts,
both new test files in full, the whole of delivery/work-history/m1-p5.md,
and the M1-P4 seam in src/spawn.ts.

## Gate evidence

1. `npm ci`: exit 0, 4 packages, EBADENGINE warnings as expected on local
   Node v22.22.2 against the ">=26" floor.
2. `npm run build` from `rm -rf dist *.tsbuildinfo`: exit 0, dist/bin and
   dist/src emitted, `git status --porcelain` empty afterwards. `dist/` is
   not tracked (`git ls-files | grep -c '^dist/'` reports 0).
3. `node --test` from `rm -rf dist *.tsbuildinfo` (no prior build): exit 0.

       1..127
       # tests 127
       # pass 125
       # fail 0
       # cancelled 0
       # skipped 2
       # todo 0
       # duration_ms 72320.607848

   The two skips are the unchanged M1-P2 floor-gated doctor witnesses,
   each carrying its recorded reason: "local Node v22.22.2 is below the
   kernel floor >=26; exit-0 witnessed on CI (Node 26)". Zero unaccounted.

## Scope audit

`git diff --name-status gh/main...de8c1bd` returns exactly twelve paths:

    A  delivery/work-history/m1-p5.md      standing pre-authorized extra
    M  src/cli.ts                          files-to-touch
    M  src/commands/doctor.ts              files-to-touch
    M  src/commands/spawn.ts               files-to-touch
    M  src/commands/teardown.ts            files-to-touch
    A  src/commands/watch.ts               files-to-touch
    A  src/liveness.ts                     files-to-touch
    A  src/watcher.ts                      files-to-touch
    M  test/behaviors.json                 standing pre-authorized extra
    A  test/liveness.test.ts               files-to-touch
    M  test/teardown.test.ts               DECLARED EXTENSION (deviation 4)
    A  test/watcher.test.ts                files-to-touch

Nine files-to-touch paths, both standing extras, and one declared extension.
Nothing else. The audit PASSES. src/spawn.ts, src/teardown.ts, src/lock.ts,
src/pool.ts, src/task.ts and src/fleet.ts are untouched, as the work
history claims.

## Conventions

- Pure ASCII: `grep -nP '[^\x00-\x7F]'` over all twelve changed files
  returns nothing.
- No em dashes in any authored file of this phase.
- No "pnpm" or "yarn" anywhere in src/, test/ or the work history.
- Commit messages: seven commits, none naming any AI model or tool
  (`grep -inE "claude|gpt|opus|sonnet|anthropic|copilot|co-authored"` over
  subjects and bodies returns nothing).
- English only throughout.

## The three constraints

C-1 (no currency from a log tail): HOLDS. `state/last-wake.json` is opened
only with `openSync(..., "a")` at src/watcher.ts:454 and is never read by
any code path. `grep -rn "lastWakePath\|LAST_WAKE\|last-wake" src/ bin/`
returns only the write site, the path helpers, and the module docs. Every
currency read is `readTaskMeta` (meta.json status), the turn-end file, the
executor record, the seen state or the cadence file. Executed confirmation:
with `state/last-wake.json` filled with garbage, `watch --once` still
surfaces the pending signal; with it deleted, the suppression still holds.

C-2 (no pid, signals, process liveness, /proc): HOLDS. `grep -rnE
"\bpid\b|/proc\b|process\.kill|SIG[A-Z]{3,}|signal\s*0|\.unref\(|detached"`
over the whole of src/ and bin/ returns exactly one hit, `detached HEAD` in
a src/pool.ts comment, pre-existing and a git term. The guard's only
liveness question is `nowMs - Date.parse(beacon.writtenAt)`.

C-3 (never auto-background): HOLDS. `grep -rniE
"daemon|background|nohup|disown|setsid"` over src/ and bin/ returns three
hits, all prose in M1-P4 comments stating that nothing is backgrounded.
src/watcher.ts and src/commands/watch.ts start no child process of any
kind. The flag surface is asserted by test to be exactly `--backoff-cap`,
`--interval`, `--max-heartbeats`, `--once`, `--poll`, and I confirmed the
parser rejects anything else with exit 64.

Zero-tokens-idle: `grep -rnE "node:(http|https|http2|net|tls|dgram|dns)|fetch\(|axios|undici"`
over src/ and bin/ returns nothing at all.

## The 15-criteria walk

Each line states MET or NOT MET, what was run, and what came back.

**1. MET.** Resident watcher, one open task, no signals, still running after
three base intervals with growing beacon gaps.

    node bin/tiphys.ts watch --interval 0.5 --poll 0.1 --backoff-cap 10
    still running after 4.2s: YES
    stdout bytes=0   stderr=[]
    stamps=4  gaps=500,1001,2001   gaps non-decreasing: true

Four beacon writes, timestamps strictly increasing, each gap at least the
previous, and the gaps are doubling rather than flat. Zero bytes on stdout
while idle.

**2. MET.** The reason is asserted, not the wake.

    resident with --interval 30 --poll 0.1; turn-end written for t1
    exit=0  stdout=[signal t1 turn-end]  stderr=[]

Exit 0 with exactly one line matching the documented pattern. The test at
test/watcher.test.ts:290 asserts `watcher.stdout() === "signal t1 turn-end\n"`
and empty stderr, so a wake for any other reason fails it. The implementer's
witness W13 (turn-end reported with the heartbeat line) is the right shape
for this trap and is recorded red 3/3.

**3. MET.** No open tasks, unbounded resident silent past three intervals;
bounded run exits 0 with a heartbeat line.

    --interval 0.4 --poll 0.1, 3s elapsed: still running YES, stdout=[]
    --interval 0.3 --max-heartbeats 1: exit=0 stdout=[heartbeat 4]

The ordinal is 4 rather than 1 because the fleet's on-disk schedule carried
over from the preceding idle run. That is the documented behavior
(`--max-heartbeats` bounds the run, the ordinal is the fleet's cadence
position) and the suite tests both directions.

**4. MET, both halves.**

    virgin fleet with one open task, watch --once: exit=3 stdout=[] stderr=[]
    turn-end written, watch --once:                exit=0 stdout=[signal t1 turn-end]

The virgin pass is silent on both streams and exits with the documented
no-wake code. The single-pass signal line is byte-identical to resident
mode's.

**5. MET.** The schedule is on disk and crosses processes.

    watch --once --interval 0.4  -> exit=3      (initialization pass)
    sleep 0.6
    watch --once --interval 0.4  -> exit=0 [heartbeat 1]
    watch --once --interval 0.4  -> exit=3 []
    state/watcher.cadence.json = {"lastHeartbeatAt":"...","backoffStreak":1}

Three separate processes, one schedule.

**6. MET.** After a `--once` surfaces the signal, the immediately following
pass on the unchanged fleet exits 3 with empty stdout. The suite additionally
confirms that a NEW turn-end for the same task surfaces again, so the
suppression is per file identity rather than per task, which is the correct
reading of PR-204.

**7. MET, both shapes.**

Part (a), the staged interleave through TIPHYS_WATCH_TEST_HOLD:

    barrier observed: YES
    other pass:  exit=0 stdout=[signal t1 turn-end]
    held pass:   exit=3 stdout=[]   released=[barrier appeared]

The `<barrier>.released` file reads "barrier appeared" rather than "timed
out without holding", so the interleave really was staged. Exactly one pass
surfaced.

Part (b), the plan's literal shape, 5 rounds:

    round 1..5: once(exit=3,out=[]) resident(exit=0,out=[signal t1 turn-end])

Exactly one surfaced in every round, never both. The resident won 5 of 5,
matching the work history's honest note that this is not a coin flip. The
loser-is-the-resident direction is covered by part (a), which is why part
(a) exists. I agree with that structure.

**8. MET.** Three consecutive no-wake passes:

    exit=3 beacon=2026-08-05T00:41:31.324Z
    exit=3 beacon=2026-08-05T00:41:31.538Z
    exit=3 beacon=2026-08-05T00:41:31.769Z

Strictly advancing across no-wake passes.

**9. MET.** Open task, executor.json with a deadline in the past, no
turn-end: `watch --once` exit 0, stdout exactly `stale t1 deadline`. The
suite adds both negative directions (a future deadline gives exit 3; a
turn-end alongside a passed deadline gives the signal line instead), and
the T-002 witness reaches the state by stopping a real spawn mid-payload
and then asserting the dangerous state as it actually is (no turn-end,
meta status open, non-empty `git status --porcelain`, a deadline in the
executor record) before running the watcher. That is the strengthened
red-witness rule applied correctly: the assertion consumes real captured
output from real programs, not hand-written strings.

**10. MET.** Stale beacon (1260s old, threshold 1200s), one task in flight
throughout:

    spawn    exit=0  stale lines=1  stdout=[spawned probe worktree ... exec exited 0]
    teardown exit=0  stale lines=1  stdout=[torn down probe]
    doctor   exit=1  stale lines=1  8 CHECK lines
      CHECK beacon WARN beacon present but 1261s old, past the 1200s freshness threshold

Exactly one stderr line containing "watcher stale" from each of the three
commands, and each command performed its normal function.

**11. MET.** Same scenario, fresh beacon (1s old):

    spawn    exit=0  stale lines=0  stdout=[spawned probe worktree ...]
    teardown exit=0  stale lines=0  stdout=[torn down probe]
    doctor   exit=1  stale lines=0  8 CHECK lines
      CHECK beacon PASS beacon present, age 2s (freshness threshold 1200s)

Exit codes identical between the stale and fresh runs of the same scenario,
which is the criterion's comparison. doctor's exit 1 in both runs is the
Node floor, the standing environment warning, and the criterion asks for
sameness rather than an absolute. Falsifiable in both directions: the stale
run warns three times and the fresh run zero times.

**12. MET, both clauses.**

First clause, probed through the real module at the shipped defaults
(base 60s, poll 15s, cap 900s, threshold 1200s, so the worst-case healthy
gap is 915000ms):

    age 0        inFlight 1  stale false
    age 914999   inFlight 1  stale false
    age 915000   inFlight 1  stale false
    age 1200000  inFlight 1  stale false
    age 1200001  inFlight 1  stale true

Fresh across the entire gap between two consecutive heartbeats, stale one
millisecond past the threshold.

Second clause, driven as a real module load in a child process:

    TIPHYS_WATCH_BACKOFF_CAP_SECONDS=900 POLL=15 STALE=915
    exit=1, message: "invalid watcher cadence: stale threshold 915000ms is not
    strictly greater than backoff cap 900000ms plus one poll interval 15000ms
    (915000ms), so a watcher idling at maximum backoff would read as stale (PR-009)"

Both values are named, and the poll interval and the sum are named too. One
second more (STALE=916) and the same configuration loads with exit 0, so
the failure is the invariant and not the override mechanism. The same
violation through `--backoff-cap 36000` is a clean exit-64 usage error
naming both values. I could not find a cadence that passes validation and
still makes a healthy watcher read as stale WITHIN one process; the
cross-process case is finding CR-503 below.

**13. MET.** Grep over the whole of src/ and bin/, not merely over
src/watcher.ts and its imports, returns no node:http, node:https, node:http2,
node:net, node:tls, node:dgram, node:dns, no `fetch(`, no axios and no
undici. The phase's own test walks the transitive import graph and asserts
it found at least four modules and specifically found liveness.ts and
task.ts, so it cannot pass by walking nothing. Anti-vacuity is present.

**14. MET.** See the C-2 and C-3 sweeps above. Additionally confirmed by
execution that the command's flag surface is exactly the five documented
flags (`watch --tail` exits 64 with the usage line) and that no daemonize
or background flag exists.

**15. MET.** `node --test` exit 0, 127 tests, 0 failing, 2 skipped with
their recorded reason, zero unaccounted. An independent registry script,
run over the captured test-name list from that same run, reports:

    registry entries: 131  unresolved: 0
    discovered tests not mapped: 0
    SHARED x2: pool destroy refuses a dirty worktree and --discard removes it
    SHARED x2: watch --once on a virgin fleet is silent and single-pass parity holds
    SHARED x3: a stale beacon warns on spawn teardown and doctor without changing them

Every mapping resolves by name. The diff to test/behaviors.json is a pure
append: the only removed line is `"teardown-usage-errors"` losing and
regaining its trailing comma. Nothing previously registered disappeared.

Rename probe, to prove the check is falsifiable rather than vacuous: with
one test title changed in test/watcher.test.ts, the same script reports

    UNRESOLVED watcher-no-wake-advances-beacon -> a no-wake single pass strictly advances the beacon

and the file was restored from a byte copy afterwards.

The three shared mappings are two behaviors per test in two cases and three
in one. The section 3 rule asks for at least one identified test per named
behavior, and one test witnessing two halves satisfies that; the pool pair
is pre-existing precedent from M1-P3. I accept them, with the note that the
liveness triple is the loosest of the three and a future phase should
prefer one test per behavior where the halves can be separated.

## Rulings on the three declared items

### 1. The scope extension into test/teardown.test.ts: ACCEPTED, and it
weakens nothing.

The claim under test: six M1-P4 tests asserted on the whole of stderr as a
proxy for the single-reason-line contract; the helper now separates the
guard's advisory and asserts the guard emits at most one line.

Probe A, is the extension NECESSARY? I reverted the helper to return raw
stderr, leaving everything else at head, and ran the file:

    not ok 1  - teardown refuses a ship task whose branch is not landed
    not ok 5  - a scout that committed to its scratch branch is refused, not silently discarded
    not ok 8  - a destroy that fails partway is reported as a partial failure, never as a refusal
    not ok 9  - teardown refuses when the default branch cannot be fetched
    not ok 10 - a meta write that fails after the destroy is a partial teardown, not a crash
    not ok 11 - a salvage whose push fails reports the local commit and refuses in one line
    # tests 13  # pass 7  # fail 6

Exactly six, exactly as declared. The count and the identities in the work
history are accurate. The extension is necessary, not convenient.

Probe B, do those six still fail if the contract they guard is BROKEN? I
broke the single-reason-line contract at its emission site by replacing
`singleLine(result.reason)` with the raw reason plus a second line, with
the new helper in place:

    not ok 1, 5, 9, 10, 11        # tests 13  # pass 8  # fail 5

Five of the six go red. Test 8 does not, because test 8 does not assert a
line count at all: it asserts the CLASSIFICATION, that stderr starts with
`tiphys teardown: pool destroy did not complete: partial destroy` and names
the removed worktree and the surviving branch. So I broke that instead, by
renaming the classification prefix:

    not ok 8 - a destroy that fails partway is reported as a partial failure, never as a refusal
    # tests 13  # pass 12  # fail 1

All six retain their guarding power against the contract each was written
for. I also broke `singleLine` itself (returning its argument unchanged),
which turned two of the six red, the two whose reason strings genuinely
interpolate multi-line git output.

Probe C, can the separation HIDE anything? The filter removes lines
containing the literal "watcher stale" and the helper asserts at most one
such line was produced. The only masking possible is a teardown reason that
itself contained the string "watcher stale". If the guard also fired, the
helper would see two and fail loudly. If the guard did not fire, one line
could be silently dropped. Nothing in src/teardown.ts or src/commands/
teardown.ts can produce that string, and the construction is contrived. I
record it as a residual rather than a finding.

Ruling: the extension is minimal (confined to the runCli helper), argued in
the work history, necessary, and strictly additive in assertion strength
because it adds the at-most-one-advisory check that did not exist before.
No assertion was deleted or softened. This was the right call, and the
implementer was right to flag it as the item most worth attacking.

### 2. The GREEN witness (W9a): correctly reasoned, and the load-time
invariant really is what catches that state.

The claim: with the stale threshold set to EXACTLY the backoff cap plus one
poll interval and the load-time invariant disabled, the arithmetic probe
test is GREEN 0/3, because the guard's comparison is strictly greater than
the threshold and the probe's last point sits exactly on it.

Verified by reading and by execution. src/liveness.ts:278 is
`beaconAgeMs > cadence.staleThresholdMs`, and the probe at
test/liveness.test.ts:298 sweeps `0 .. backoffCapMs + pollIntervalMs`. With
threshold equal to that sum, the last point gives `age > threshold` false,
so the probe reports fresh and cannot see the misconfiguration. The
reasoning is exactly right.

Does the OTHER guard catch it? `assertCadenceInvariant` at src/liveness.ts:
111-122 returns only when `staleThresholdMs > floorMs`, so the equality case
throws. Executed directly:

    assertCadenceInvariant({base 60000, poll 15000, cap 900000, threshold 915000})
    REJECTED: invalid watcher cadence: stale threshold 915000ms is not strictly greater ...

And the shipped test liveness-cadence-invariant-enforced drives precisely
that equality boundary (900 + 15 = 915, and 916 loads). So the two clauses
of criterion 12 do cover different states, each has its own witness, and
the equality case is caught at load rather than by the probe.

Ruling: the honesty is correct on both counts. Reporting a green witness
instead of quietly dropping it or replacing it with W9c alone is exactly
the behavior CLAUDE.md's durability and never-soften rules ask for. I would
call this the strongest single paragraph in the work history. W9c (the poll
term forgotten from the threshold) is the realistic version of the same
mistake and the probe does catch it, so the pair is complete.

### 3. The reported seam mismatch in src/spawn.ts: CONFIRMED INERT.

src/spawn.ts:222-225:

    export function livenessGuard(fleet: Fleet): GuardResult {
      void fleet;
      return { ok: true };
    }

Its single call site is src/spawn.ts:274-277, which branches on `!liveness.ok`.
The function ignores its argument, has no other caller anywhere
(`grep -rn "livenessGuard" src/ test/ bin/` returns only these two sites and
the M1-P4 comment above them), and returns a literal, so the branch is
unreachable and no spawn can ever be refused for a liveness reason. Executed
confirmation: in the criterion-10 scenario the beacon was 1260s stale with a
task in flight and `tiphys spawn` still exited 0 and did its work.

The implementer's reasoning for leaving it is also correct on the merits:
the M1-P4 seam is BLOCKING-shaped (it returns a GuardResult whose failure
aborts spawnTask before pool create), while this phase's guard must warn and
never block, and src/spawn.ts is not on this phase's files-to-touch list.
Filling a blocking seam with a non-blocking advisory would have been the
wrong shape in the wrong file, and editing an out-of-scope file to delete it
would have failed the scope audit. Reporting it to the orchestrator was the
right move. Recorded as CR-507 for whoever owns src/spawn.ts next.

## Findings

Severity scale: HIGH blocks merge, MEDIUM blocks merge under DR-0012, LOW is
recorded and does not block, INFO is an observation.

### CR-501 (LOW): a beacon dated in the future silences the guard and doctor
permanently, and this phase's own monotonic-bump rule makes it sticky

Claim. `guard()` computes `beaconAgeMs = nowMs - Date.parse(beacon.writtenAt)`
(src/liveness.ts:255-256) and calls the fleet stale only when
`beaconAgeMs > staleThresholdMs` (src/liveness.ts:278). A negative age is
never greater than the threshold, so a beacon whose recorded instant is in
the future reads as fresh forever. doctor's own check rounds the age with
`Math.max(0, ...)` (src/commands/doctor.ts:273), so it prints a reassuring
"age 0s" and PASSes. Separately, `writeBeacon` (src/watcher.ts:312-331)
guarantees a strict advance by writing `previousMs + 1` whenever `now` is
not greater than the previous stamp, so once the file is ahead of the local
clock the kernel itself keeps it ahead, advancing one millisecond per
evaluation rather than resynchronising.

Failure scenario. A task is in flight. The wall clock moves backwards
between two beacon writes (an NTP step, a container or VM suspend and
resume, a reclaimed cloud session resumed on a host whose clock is behind).
The resident watcher then writes `previousMs + 1` on each evaluation and the
beacon stays ahead of local time. The watcher subsequently stops (the session
is reclaimed, the process is killed, the loop raises). Supervision has
disappeared with work in flight, which is exactly what R-079 exists to
prevent, and every consumer reports health: `tiphys spawn` and
`tiphys teardown` emit no advisory, `tiphys doctor` prints
`CHECK beacon PASS beacon present, age 0s`, and `tiphys doctor --for watch`
does not promote anything to FAIL. The condition is invisible and does not
self-heal.

Evidence (executed). A fleet with one open task, no watcher running, and a
beacon written 24 hours ahead of local time:

    CHECK beacon PASS beacon present, age 0s (freshness threshold 1200s)
    guard stderr: [0 stale line(s)]
    watch --once -> exit=3, beacon advanced to 2026-08-06T00:45:39.618Z

The beacon after the pass is still a day ahead: the monotonic bump moved it
by one millisecond.

Why this is LOW and not medium. The plan's step 2 defines stale as "the
beacon is absent or older than a threshold". A future-dated beacon is
neither, so the implementation matches the plan's letter and the implementer
improvised nothing. Nothing runs on Tiphys before M4 (settled owner
decision), so the exposure window before the M4 intake is zero. `state/` is
gitignored, so a beacon never travels between machines through the fleet
repository. And the clock-regression and session-reclamation questions are
already the named M4 residue in the section 3 obligation split.

Concrete fix, if the orchestrator prefers to take it now (three lines, in a
file already on this phase's files-to-touch list): in `guard()`, treat
`beaconAgeMs < -tolerance` the same way `readBeacon` already treats an
unparseable file, that is, as no evidence that supervision ran, and say so
in the detail line; and drop the `Math.max(0, ...)` from doctor's display so
a future beacon is visible rather than cosmetically zeroed. The implementer
has already established that classification for absent and unreadable
beacons ("all three are the same thing to the guard: no evidence that
supervision ran", src/liveness.ts:176-181); this is the third member of that
class. Otherwise, carry it into the M4 intake alongside the deadline-less
abandonment item the work history already parks there.

### CR-502 (LOW): an environment-supplied cadence failure kills every
subcommand with a stack trace, including `--version`, `init` and `doctor`

Claim. `CADENCE` is built at module load (src/liveness.ts:160), and
src/liveness.ts is in the import graph of src/cli.ts through four command
modules, so any throw from `loadCadence` happens before `run()` is entered.
bin/tiphys.ts has no top-level handler. Two distinct throws reach it: the
PR-009 invariant violation (src/liveness.ts:116) and a malformed value
(src/liveness.ts:98).

Failure scenario. An operator or a harness exports a watcher environment
variable that is malformed or that violates the invariant. Every Tiphys
command then dies at import with a raw stack trace, including commands with
no relationship to the watcher. `tiphys doctor`, whose entire job is to
diagnose a misconfigured fleet, cannot run to report the problem, and
`tiphys watch --once` cannot report it cleanly either because the throw
precedes `cmdWatch`'s own try/catch.

Evidence (executed).

    TIPHYS_WATCH_BACKOFF_CAP_SECONDS=900 POLL=15 STALE=915  tiphys lock acquire
      -> exit 1, stack trace at src/liveness.ts:116
    same env, tiphys --version        -> exit 1, stack trace
    TIPHYS_WATCH_STALE_SECONDS=abc, tiphys doctor       -> exit 1, stack trace at :98
    same, tiphys init <newdir>        -> exit 1, stack trace
    same, tiphys watch --once         -> exit 1, stack trace

Why this is LOW. Criterion 12 explicitly requires the invariant violation to
fail at load, so the loudness is mandated, and the message names all three
values. The implementer disclosed it as environment warning 7 and correctly
identified that the clean fix belongs in bin/tiphys.ts, which is not on this
phase's files-to-touch list. Leaving it and reporting it is the right scope
discipline.

Two accuracy notes on that disclosure, recorded because CLAUDE.md forbids
softening a work history. Warning 7 says "the CLI reports it as a raised
error", which understates the blast radius: it is EVERY subcommand,
including `init` and `--version`, not only the guard-carrying ones. And
warning 7 covers only the PR-009 violation; the malformed-value throw at
src/liveness.ts:98 is a second instance of the same shape and is not
mentioned. Neither changes the disposition.

Concrete fix. A four-line try/catch around the top-level `await run(...)` in
bin/tiphys.ts that writes one reason line and returns a nonzero code, taken
by whichever phase next owns that file. M1-P6 touches the harness, not
bin/tiphys.ts, so this most likely belongs to M2.

### CR-503 (LOW): the PR-009 invariant is enforced per process, so a
watcher and a guard configured differently can still cry wolf

Claim. `assertCadenceInvariant` validates the cadence of the process that
loads it. The watcher's effective cadence can come from per-invocation flags
while the guard inside spawn, teardown and doctor reads the environment
only. Two processes can each hold an individually valid configuration whose
combination breaks the invariant the guard depends on.

Failure scenario. An operator shortens the guard's threshold for the
supervision commands (say cap 10s, poll 1s, threshold 12s, which passes
validation because 10 + 1 < 12) but starts the watcher from a shell that
does not carry those variables, so it runs at the shipped defaults with a
900s cap. A perfectly healthy watcher then reads as stale, which is exactly
the state PR-009 exists to prevent, and neither process's load-time check
sees it.

Evidence (executed). A resident `tiphys watch` at the shipped defaults, one
open task, verified still running, 13 seconds after its startup beacon:

    guard env: CAP=10 POLL=1 STALE=12   (10 + 1 = 11 < 12, invariant OK)
    GUARD: watcher stale: 1 open task(s) in flight and .../state/watcher.beacon
           is 13s old (threshold 12s); supervision may have stopped

Why this is LOW. The plan asks for the invariant to be enforced "at load",
and it is. The module docs (src/commands/watch.ts:37-41) already state that
the environment variables are how all four commands learn the same cadence,
so the operator error is documented, and the failure direction that matters
for M1-P6 is the harmless one (a harness shortening only the watcher's
flags leaves the guard more lenient, not less).

Concrete fix, and it is cheap because the information is already on disk:
the beacon record already carries `intervalMs` (src/liveness.ts:168). The
guard could compare against `max(staleThresholdMs, beacon.intervalMs + pollIntervalMs)`
so the watcher's own declared cadence, rather than the reading process's
assumption about it, sets the floor. Worth considering when M2 grows the
gate registry.

### CR-504 (LOW): the work history's guidance to the M1-P6 author is wrong
for exit-test stage C2

Claim. Environment warning 6 in delivery/work-history/m1-p5.md tells the
harness author that the guard "does not fire" in the exit test proper,
"because A5 starts the watcher before A6 spawns anything".

Failure scenario. That is true for A6 and A7. It is not true for C2. The
harness-owned watcher EXITS at A8, by design, when it surfaces
`signal m1-exit turn-end`. Nothing writes the beacon after that. Stage B is
a recorded human authorization with, in the plan's own words, "no timing
requirement". Task m1-exit stays open until C2 tears it down. So by the time
C2 runs `tiphys teardown --task m1-exit`, the beacon is very likely older
than the 1200s default threshold with a task in flight, and the guard WILL
emit its advisory line. A harness written against warning 6's parenthetical
and asserting empty stderr at C2 will fail on a stage B that took more than
twenty minutes, which is the normal case for a human authorization.

Evidence (executed). The criterion-10 scenario is exactly this state, and it
reproduces: one open task, a beacon past the threshold, and

    teardown exit=0  stale lines=1  stdout=[torn down probe]

Why this is LOW. The substance of warning 6 is correct and is the important
half: "a harness assertion that counts stderr lines, or that treats any
stderr as failure, will break; assert on the reason line instead." Following
that advice makes C2 safe regardless. Only the reassuring parenthetical is
wrong.

Concrete fix. One sentence in the work history, or in the M1-P6 dispatch
brief: the guard does not fire at A6 or A7, but it is expected to fire at
C2 because the watcher exited at A8 and stage B is unbounded; C2 must assert
on teardown's exit code and its own stdout, not on empty stderr.

### CR-505 (LOW): the resident loop heartbeats off a cadence snapshot taken
before its wait, so a concurrent single pass can have its backoff reset
overwritten

Claim. `runResident` reads the cadence at the top of each iteration
(src/watcher.ts:819), waits (src/watcher.ts:822), and then calls
`heartbeatTick(fleet, state, ...)` at src/watcher.ts:830 using that same
pre-wait snapshot. `heartbeatTick` writes `state.backoffStreak + 1`
(src/watcher.ts:720-724). If a concurrent `--once` pass surfaces a wake
inside that window, it resets the on-disk cadence to `backoffStreak: 0`
(src/watcher.ts:701-704), and the resident then overwrites it with
`snapshot + 1`, losing the reset.

Failure scenario. A scheduler-driven `--once` surfaces a signal at the same
moment a resident watcher's heartbeat falls due. The plan's rule that the
backoff resets "on any surfaced non-heartbeat wake" is not honored: the
watcher continues backing off as though nothing had happened, so its beacon
cadence stays at the long interval after an event that should have made it
attentive again.

Evidence. Read, not executed. I could not stage this. `waitForChange` uses
`fs.watch` on the fleet's state and tasks directories, and the concurrent
pass necessarily writes into both, so on this platform the resident is woken
early, re-enters the loop, and re-reads the cadence before its heartbeat can
fire. The window closes to the sub-millisecond band around the due instant,
and on the documented `fs.watch`-less fallback path it widens to the tail of
one poll interval. I record this as reasoning over the code with the exact
lines, not as a witnessed defect, and I am not claiming otherwise. The
symmetric case (both a resident and a `--once` finding a heartbeat due) is
benign, because both compute the same `snapshot + 1` and write the same
value.

Concrete fix. Re-read the cadence immediately before the heartbeat tick, or
have `heartbeatTick` re-read inside itself and recompute the ordinal from
the current file rather than from the caller's snapshot. One line.

### CR-506 (INFO): `PROFILES.watch` grew a condition the plan's table does
not list, and the growth is not in the deviations section

The plan's M1-P2 text fixes the M1 profile table and says it is "deliberately
small and grown at M2/M3 with the gate registry", with `watch` promoting
`beacon-absent`. src/commands/doctor.ts:45 now reads
`watch: ["beacon-absent", "beacon-stale"]`.

I judge the change RIGHT on the merits: `beacon-stale` did not exist until
this phase gave doctor a freshness threshold, and a `--for watch` profile
that exits 0 with a twenty-minute-stale beacon would be green by omission,
which SC-011's precondition semantics forbid. Executed confirmation that it
works as intended:

    stale fleet, doctor --for watch:
      CHECK beacon FAIL beacon present but 1282s old, past the 1200s freshness
            threshold (required for profile watch)
    fresh fleet, doctor --for watch:
      CHECK beacon PASS beacon present, age 21s (freshness threshold 1200s)

(Both runs exit 1 locally because of the Node floor, so the promotion's
effect on the exit code is witnessed on CI rather than here, consistent with
every other floor-gated doctor assertion in this repository.)

The only thing I would change is paperwork: this is a change to a
plan-stated table and belongs in the work history's "Deviations from the
plan's letter" list, where a later reader will look for it, rather than only
in key decision 13. No action needed before merge.

### CR-507 (INFO): M1-P4's `livenessGuard` no-op in src/spawn.ts should be
deleted by whoever owns that file next

Confirmed inert; see the ruling above. It is a one-line deletion plus the
removal of its unreachable call site. It is worth doing rather than leaving,
because a future implementer filling that seam would get blocking behavior
where the blueprint's liveness-guard contract requires a warning. The work
history already raises this as open question 1; I agree with it and restate
it here so it survives in the review record.

## Traps the orchestrator asked to be probed, and what came back

**A wake test that passes for the wrong reason.** Every wake criterion in
the suite asserts the LINE, not merely the exit. Criterion 2's test asserts
`stdout === "signal t1 turn-end\n"` and empty stderr; criteria 4, 5, 6, 9
assert exact stdout strings; criterion 3 asserts a heartbeat ordinal by
regex. The implementer's W13 witness is precisely this trap (a turn-end
reported with the heartbeat line) and is recorded red 3/3. My own executions
asserted the reason line independently in every case. CLEAN.

**A liveness test on a fleet with no tasks in flight.** `runGuardScenario`
in test/liveness.test.ts:173-217 spawns a real task named "held" through the
real `tiphys spawn` and leaves it open for the whole scenario, so every
probe in that test has genuine work in flight. The one test that
deliberately has no open task is the one asserting the in-flight half of the
predicate is load-bearing, in both directions including a closed task. My
own criteria-10 and 11 scenarios independently used a real spawn for the
same reason. CLEAN.

**Cadence shared between a resident process and a single pass.** Persisted
state IS read as current state: `runOnce` reads the cadence file on every
invocation, and `runResident` re-reads it at the top of every loop
iteration rather than caching it for the life of the process. Executed
proof that the schedule crosses process boundaries: three separate `--once`
processes produced exit 3, "heartbeat 1", exit 3, with
`backoffStreak: 1` on disk; and a bounded resident run on a fleet with prior
history reported "heartbeat 4" rather than restarting at 1. Nothing is
reconstructed from a log tail; `state/last-wake.json` has no reader at all.
The one place where the two can transiently disagree is CR-505 above.
SUBSTANTIALLY CLEAN, with CR-505 recorded.

**Does a warning ever change an exit code or prevent an operation?** No. Two
full scenarios, stale beacon versus fresh beacon, over real spawn, teardown
and doctor runs: identical exit codes (0, 0, 1 in both), identical stdout
shape, identical CHECK-line count, and the only difference is the presence
of exactly one stderr advisory. `warnIfWatcherStale` returns its report and
all three call sites discard it. `guard()` is total by construction, which I
confirmed against a hostile fleet (a task entry that is a file rather than a
directory, plus a task whose meta.json is truncated JSON): doctor exited 1
with empty stderr and `watch --once` exited 3, neither raising. CLEAN.

**Can a cadence be configured that makes the guard cry wolf?** Not within
one process: every path that builds a cadence goes through
`assertCadenceInvariant`, the flag path re-validates on top of the
environment path, and I confirmed the equality boundary is rejected and the
one-second-larger configuration accepted. Across processes, yes, and that is
CR-503, demonstrated against a demonstrably healthy running watcher.

## Honest failures and limits of this review

Things I tried and could not settle, or did not attempt:

1. CR-505 is reasoning over the code, not a witnessed defect. I attempted to
   stage the interleave with a wide poll interval and a concurrent pass and
   failed, because `fs.watch` wakes the resident early and it re-reads the
   cadence before its heartbeat can fire. I did not add a test seam to force
   it, because that would have meant editing the phase's source to
   manufacture a witness. I have said so at the finding rather than dressing
   the reasoning up as a measurement.
2. CR-501's trigger, a backward wall-clock step, was not reproduced. I
   demonstrated the CONSEQUENCE by writing a future-dated beacon directly,
   and I demonstrated that the kernel's own monotonic bump keeps the file
   ahead. I did not manipulate the system clock, so the reachability half of
   that finding rests on argument about NTP steps and session resume, not on
   measurement.
3. Everything that depends on the Node 26 floor is unwitnessed here. Local
   Node is v22.22.2, so `tiphys doctor` exits 1 in every run above, the two
   M1-P2 doctor skips remain skips, and the exit-code effect of promoting
   `beacon-stale` under `--for watch` is not observable locally. CI on Node
   26 is the authority for all of it, and CI green on de8c1bd is a
   precondition of merge that this review does not supply.
4. I did not run the suite under load or repeatedly enough to say anything
   about flake. The suite passed twice, cleanly, at 72.3s and 71.5s wall
   time. The work history's 71.2s figure is consistent. Criterion 7 part (b)
   is a real race whose result the implementer honestly reports as a rate
   rather than a proof, and my 5 rounds agree with the reported 10 of 10
   distribution; a rare interleave neither of us saw is not excluded by
   either sample.
5. I did not review src/spawn.ts, src/teardown.ts, src/pool.ts, src/lock.ts,
   src/task.ts or src/fleet.ts beyond the seams this phase touches. They are
   merged M1-P4 and earlier work and were confirmed unmodified by the scope
   audit rather than re-reviewed.
6. I did not evaluate whether the shipped default cadence numbers (60s base,
   15s poll, 900s cap, 1200s threshold) are operationally good. FM-044 is a
   calibration starting point, the plan says so, and nothing in M1 exercises
   them at production timescales; the section 4 not-proven list already
   records that long-horizon resident operation is unwitnessed. I checked
   only that they satisfy the invariant, which they do with 285 seconds to
   spare.
7. My registry check is a script I wrote for this review, not a gate in the
   repository. There is still no automated check in the suite that every
   behaviors.json mapping resolves; each phase has verified it by hand. That
   is a standing gap, not this phase's fault, and it is presumably what the
   M2 wrapper (R-048) is for.

## Merge recommendation

I recommend MERGE. This is the most carefully built phase of M1 so far: all
fifteen acceptance criteria are met and fourteen of them I confirmed by
running the shipped CLI rather than by trusting the suite, the three
constraints that make a watcher dangerous are honored structurally rather
than by promise, and the tests are red against the dangerous state rather
than against an absent feature, which I verified by six sabotages of my own
including two that the implementer did not run. The one scope extension is
necessary, minimal, and strictly strengthens the file it touches, which I
established by reverting it (six tests fail without it) and then breaking
the contract those six guard (all six go red, five on the line-count
assertion and one on the classification assertion). The green witness the
implementer chose to report rather than hide is correctly reasoned, and the
load-time invariant genuinely is the thing that catches the state the probe
cannot see. The seam mismatch in src/spawn.ts is genuinely inert and was
correctly left alone rather than edited out of scope. Of the seven findings,
none is high or medium: CR-501 is the one worth an owner's attention, and I
have argued at length why it stays low (the plan's letter is met, nothing
runs on Tiphys before M4, and clock regression across a reclaimed session is
already the named M4 residue) while noting that the fix is three lines in a
file already in scope if the orchestrator would rather take it now. CR-504
should be carried into the M1-P6 dispatch brief before that phase is
dispatched, because the harness author will otherwise write a C2 assertion
that fails on any stage B longer than twenty minutes. Merge subject to the
standing conditions this review cannot supply: CI green on de8c1bd on Node
26, and the second reviewer's independent approval.

## Delta review of the fix round (head 1807951)

- Date: 2026-08-05
- Delta reviewed: de8c1bd..1807951 (two commits, 7 files, +945/-82)
- Reviewer: the same criteria-lens reviewer who returned APPROVE on de8c1bd
- Scope: NARROW. The 15 acceptance criteria were confirmed met on the
  previous head and were not re-walked wholesale. Two questions only: are
  my seven findings closed, and did the fix regress a criterion I had
  already confirmed?

### VERDICT: APPROVE

All seven of my findings are closed or correctly recorded. The two
blocking findings from the second reviewer are closed end to end by my own
execution, not by reading the work history. No regression was found: every
criterion re-executed here returns byte-for-byte what it returned on
de8c1bd. Four new findings are recorded, all LOW or INFO, none blocking
under DR-0012; two of them are corrections to durable guidance the next
phase will read, and I would rather see those taken before merge than
after, because they cost one sentence each.

### Isolation

    CLONE=.../scratchpad/p5-delta-opus
    rm -rf "$CLONE"; git clone --no-hardlinks -q /home/user/tiphys-ai-helmsman "$CLONE"
    git -C "$CLONE" checkout -q 1807951; cd "$CLONE" && npm ci

Every scratch fleet, probe script and sabotage was created inside that
clone and deleted. Two sabotages were applied to shipped sources, each
restored from a byte copy taken first and confirmed with
`git status --porcelain` empty, never with `git checkout --` (warning 8).
Nothing in /home/user/tiphys-ai-helmsman was written except this section.
`git status --porcelain` in the clone is empty at the end.

### What I executed versus what I read

EXECUTED: `npm ci`; `node --test` in full from a removed dist/ and removed
tsbuildinfo; `npm run build` from the same clean state with a
`git status --porcelain` check after it; the future-dated-beacon scenario
through the guard, doctor, `doctor --for watch` and a live resident
watcher; the CR-503 cry-wolf scenario in both directions against a
demonstrably running watcher, plus the same scenario through doctor; four
variants of bin/tiphys.ts (shipped, the work history's named try/catch, a
dynamic-import form, and a src/-shaped lazy dispatch) under both throw
sites; the criterion-12 guard sweep at six ages under two declared beacon
cadences; both clauses of criterion 12's load-time invariant; full
criteria-10 and 11 scenarios with a real `git init`, a real clone, two
real `tiphys spawn` runs, a real `tiphys teardown` and a real
`tiphys doctor`, stale beacon versus fresh; criteria 1, 2, 3, 4, 5, 6, 8
and 9 in both entry modes; criterion 7 part (b) five rounds; the stranded
seen-state claim end to end including recovery; the stray-file and
torn-meta cases; one sabotage of src/watcher.ts to red-witness the CR-505
fix (3/3); one rename sabotage of test/watcher.test.ts to prove the
registry check falsifiable; the registry resolution script over the
captured test-name list; and the convention and constraint sweeps.

READ ONLY: the full diff of src/watcher.ts, src/liveness.ts and
src/commands/doctor.ts; the fix-round section of the work history and its
corrected deviations, environment warnings and key decision 9; the second
reviewer's review; the new test bodies in test/watcher.test.ts and
test/liveness.test.ts.

### Gate evidence

1. `npm ci`: exit 0, 4 packages, EBADENGINE as expected on Node v22.22.2.
2. `node --test` from `rm -rf dist *.tsbuildinfo`: exit 0.

       1..134
       # tests 134
       # pass 132
       # fail 0
       # cancelled 0
       # skipped 2
       # todo 0
       # duration_ms 82032.539399

   The two skips are the unchanged M1-P2 floor-gated doctor witnesses with
   their recorded reason. Zero unaccounted. The counts match the work
   history's claim of 134/132/0/2 exactly.
3. `npm run build` from the same clean state: exit 0, dist/bin and dist/src
   emitted, `git status --porcelain` empty afterwards.

Registry: 139 mappings, 0 unresolved, 0 discovered tests unmapped. The
diff to test/behaviors.json is a pure append of eight entries; nothing
previously registered was removed. Rename probe (one test title changed in
test/watcher.test.ts) reports
`UNRESOLVED watcher-heartbeat-ordinal-from-disk`, so the check is
falsifiable rather than vacuous; the file was restored from a byte copy.
A fourth shared mapping appears (`liveness-future-beacon-not-evidence` and
`doctor-beacon-future-warn` share one test title). That is the same
tolerance already accepted for the three pre-existing shared mappings, and
the same note applies: a future phase should prefer one test per behavior
where the halves separate.

Scope: `git diff --name-status gh/main...1807951` returns exactly the same
twelve paths as on de8c1bd. No new file, no new deviation. The audit
PASSES.

Conventions: non-ASCII 0, em dashes 0, no pnpm or yarn in src/, test/ or
the work history, and no commit subject or body in the delta naming a
model or tool.

Constraints, re-checked because the round touched all three modules:

- C-1 HOLDS. `state/last-wake.json` still has exactly one writer
  (`openSync(..., "a")`, src/watcher.ts:535) and no reader anywhere.
  Executed: with the file filled with garbage a pending turn-end still
  surfaces (exit 0, `signal t1 turn-end`), the following pass is
  suppressed (exit 3), and with the file deleted the suppression still
  holds (exit 3).
- C-2 HOLDS. The pid/signal/proc grep over the whole of src/ and bin/ now
  returns nothing at all. The new stuck-claim path adds no liveness notion
  beyond file presence and a bounded wall-clock wait.
- C-3 HOLDS. The daemon/nohup/disown/setsid grep returns one hit, prose in
  src/spawn.ts stating there is no daemonize path. No new child process.
- Zero tokens idle: the network grep over src/ and bin/ still returns
  nothing.

### Per-finding closure

**CR-501 (future-dated beacon silences the guard and doctor): CLOSED on
the silencing half.** Fleet with one open task, beacon stamped 24 hours
ahead, no watcher running:

    guard:  inFlight=1 unreadable=0 stale=true
      "... the beacon at .../state/watcher.beacon is dated 86400s in the
      FUTURE, so it is no evidence that supervision ran (the clock moved
      backwards under it) ..."
    doctor:            CHECK beacon WARN beacon present but dated 86400s
                       in the future, so it is no evidence that
                       supervision ran        (1 stale advisory line)
    doctor --for watch: CHECK beacon FAIL ... (required for profile watch)

Compare de8c1bd, which printed `CHECK beacon PASS beacon present, age 0s`
and emitted no advisory in the same state. The classification is the third
member of the absent/unparseable class exactly as the finding asked, and
the 5s tolerance is real: a beacon 1s ahead is still fresh. The stickiness
half is not closed and has changed sign; see CR-510 below.

**CR-502 (an environment-supplied cadence failure kills every subcommand):
PARTIALLY FIXED, and the partial fix is MERGEABLE. Ruling below.**

**CR-503 (the per-process invariant lets a healthy watcher read as stale):
CLOSED in the guard, in both directions.** A resident watcher started at
the shipped defaults, verified alive, beacon 13s old and declaring
`intervalMs: 60000`, read by a guard configured at cap 10s, poll 1s,
threshold 12s (the finding's exact configuration):

    de8c1bd: GUARD: watcher stale: ... is 13s old (threshold 12s)
    1807951: watcher fresh: 1 open task(s) in flight, beacon 13s old

And the floor is not a blanket silence, which is the direction that
matters more:

    beacon 50s old, declares 60s -> stale false
    beacon 80s old, declares 60s -> stale true  ("threshold 61s")

The floor cannot be abused to buy unbounded patience, because the value it
trusts is `intervalMsFor(streak, cadence)`, capped at the writing
process's own backoff cap, and that process's load-time invariant already
forces its threshold above cap plus poll. The guard therefore becomes
exactly as patient as the watcher's own configuration says it should be,
which is what I proposed. Doctor's own beacon check did not get the same
treatment; that is CR-508 below.

**CR-504 (wrong guidance to the M1-P6 author about stage C2): CLOSED.**
Environment warning 6 now carries the correction verbatim, states that the
old parenthetical holds for A6 and A7 only, gives the reason (the
harness-owned watcher exits at A8, nothing writes the beacon after that,
stage B has no timing requirement, m1-exit stays open until C2), states
the consequence ("a stage B that took more than twenty minutes ...
guarantees it"), and gives two remedies (assert on exit code and stdout,
or drive `tiphys watch --once` across stage B). This is the finding I most
wanted taken before M1-P6 is dispatched, and it is taken.

**CR-505 (heartbeat off a pre-wait cadence snapshot): FIXED, and the
characterisation is HONEST. Ruling below.**

**CR-506 (PROFILES.watch grew a condition): CLOSED.** It is deviation 6 in
"Deviations from the plan's letter", with the merits argument and a note
that it was previously only in key decision 13. That is the paperwork the
finding asked for and nothing more.

**CR-507 (M1-P4's inert livenessGuard no-op): RECORDED as asked.**
Fix-round disposition 9 states it is confirmed inert, why (returns
`{ok: true}` unconditionally, its only caller is the top of spawnTask, so
it changes no behavior today), why it still matters (the SHAPE is
blocking, and a future implementer filling that seam would get blocking
behavior where the contract requires a warning), where the warning
actually lives now (the command layer), and the size of the deletion (two
lines, for whoever next owns src/spawn.ts). A later reader does not have
to re-derive any of it.

### The second reviewer's two blocking findings, verified independently

Not my findings, but they touch claim handling and beacon classification,
which my criteria depend on, so I drove both rather than trusting the
disposition.

Finding 1 (CRITICAL, stranded claim): CLOSED end to end. Fleet with one
open task, a stranded `state/watcher.seen.json.mutex`, a genuinely pending
turn-end:

    stuck pass: exit=1 elapsed=5169ms stdout=[]
    stderr: tiphys watch: supervision is stuck: the seen-state claim
      .../state/watcher.seen.json.mutex was still present after 5000ms, so
      the turn-end of task t1 could not be surfaced and no wake was
      reported; if no other watcher is running, remove that file and re-run
    beacon advanced across the stuck pass: NO
    second independent pass: exit=1, same reason line
    guard evaluated at now+1300s: stale=true
    after removing the debris: exit=0 stdout=[signal t1 turn-end]

Every element of the fix is present in one run: loud, one reason line
naming the file and the wait it exceeded, the beacon frozen so the guard
can notice, and the pending wake recoverable by removing the named file.
The reviewer's repro (two consecutive exit-3 passes with an empty line)
does not reproduce.

Finding 2 (HIGH, torn meta.json invisible): CLOSED in both halves.
`stale torn meta` is surfaced with exit 0, and the guard reports
`inFlight=1 unreadable=1` with the detail naming the unreadable record.
Key decision 9's false parenthetical is corrected in place.

### Ruling on CR-502's partial fix: MERGEABLE, and the phase should NOT
take the seam

I verified the boundary claim rather than accepting it, by building the
fix the work history names and running it.

The claim is that the failure must be loud (owned, and done: a malformed
value is refused with the variable and the value named, registered as
`liveness-malformed-cadence-refused`), but that presenting it as a clean
usage error needs bin/tiphys.ts, which this phase does not own, and that
nothing in src/ substitutes because the throw happens during import-graph
evaluation.

The load-bearing half of that reasoning is CORRECT and I confirmed it by
execution. What is wrong is the remedy the same paragraph prescribes, and
that matters more than the boundary, so it is recorded separately as
CR-509.

Is the boundary real? Yes, in the sense that matters for merge. I built a
src/-shaped lazy dispatch (`await import("../src/commands/doctor.ts")`
inside a try/catch) and it does catch the same throw and return a chosen
exit code, so the absolute sentence "No file inside src/ can substitute
for it" is false on its face. But the work history's very next clause
concedes exactly this ("the only in-scope alternative would be to make
src/cli.ts import its command modules lazily, which is a restructure of
the dispatch table for a LOW finding"), and I agree with that judgement.
src/cli.ts statically imports all seven command modules; converting the
dispatch to lazy imports changes the load path of every command in the
kernel to improve the presentation of an operator misconfiguration that
already fails loudly, names all three values, and cannot be reached
without an exported TIPHYS_WATCH_* variable. That is not a trade this
phase should make, and taking it inside a fix round would be worse, since
it would be an unwitnessed restructure of the one file every command
enters through.

Ruling: the partial fix is mergeable as it stands. The half this phase
owns is genuinely done and registered. The phase should not take the seam.
The one thing that must not ship as written is the named remedy.

### Ruling on CR-505's characterisation: HONEST, not "untested"

The question is whether "fixed structurally with a measurement that
reproduced 0 of 10 before and 0 of 10 after" is honest reporting or a
euphemism for untested.

It is honest, for three reasons I checked rather than assumed.

First, the changed unit is genuinely guarded. `heartbeatTick` now
recomputes from `readCadenceState(fleet)` instead of the caller's
snapshot, and I red-witnessed the guarding test myself by restoring the
pre-fix line in the shipped source:

    sabotage: const n = state.backoffStreak + 1;
    not ok 1 - the heartbeat ordinal is recomputed from the cadence file
    3 runs, red 3/3; src/watcher.ts restored from a byte copy, git clean

Second, the test is not the T-003 vacuity trap. It constructs the
DANGEROUS state rather than the absence of a feature: the caller's
snapshot says `backoffStreak: 5` while the cadence file on disk says 0,
which is precisely "a concurrent pass reset the backoff inside the
resident's wait", and it asserts the filesystem consequence
(`after.backoffStreak === 1`) rather than only a return value. A test that
staged no contention would be the worthless kind; this one stages it
directly, at the seam where the defect lives.

Third, the reporting is complete and correctly signposted. The work
history states the numbers, states that the concurrent `--once` never
surfaced at all in any of the 20 runs and why (fs.watch wakes the resident
first, the same one-sidedness measured for criterion 7 part (b)), and says
in terms: "I am not claiming the window does not exist, only that I could
not reach it." That is the same limit I recorded at the finding, reached
independently and reported with a number attached.

Calling it untested would itself be inaccurate, because the seam is tested
and red-witnessed. The precise statement, which the work history makes in
its "Honest scope" section and which I endorse, is: the fix is correct and
witnessed at the level it changes, and the finding remains unwitnessed at
process level on this platform. The only wording I would tighten is the
disposition list's bare "FIXED", which reads stronger than the paragraph
under it; "fixed at the seam, defect unwitnessed end to end" would match
the evidence. That is a nit, not a softening, and it does not change the
disposition.

### Regression sweep: NONE FOUND

Every criterion most exposed to the four changed sites was re-executed.
Each line below is what came back at 1807951 next to what this review
recorded at de8c1bd.

Criterion 12, first clause, guard freshness across the worst-case gap, at
the shipped defaults, run twice with the beacon declaring the maximum
backoff (900000ms) and the base interval (60000ms), because the new
declared-cadence floor reads that field:

    age 0        stale false      age 1199999  stale false
    age 914999   stale false      age 1200000  stale false
    age 915000   stale false      age 1200001  stale true

Identical under both declared cadences and identical to de8c1bd. The floor
changes nothing at the shipped defaults, because 900000 + 15000 is below
the 1200000 threshold. No regression.

Criterion 12, second clause, the load-time invariant naming its values:

    STALE=915: exit 1, "invalid watcher cadence: stale threshold 915000ms
    is not strictly greater than backoff cap 900000ms plus one poll
    interval 15000ms (915000ms) ... (PR-009)"
    STALE=916: tiphys version exits 0, so the failure is the invariant and
    not the override mechanism
    --backoff-cap 36000: exit 64, usage line, both values named

Unchanged. No regression.

Criteria 10 and 11, stale-versus-fresh advisory line counts and exit
codes, full scenarios with real spawn, teardown and doctor runs over real
git repositories:

    beacon 1260s old:  spawn exit=0 stale=1, teardown exit=0 stale=1,
                       doctor exit=1 stale=1, 8 CHECK lines,
                       CHECK beacon WARN ... 1261s old, past the 1200s ...
    beacon 1s old:     spawn exit=0 stale=0, teardown exit=0 stale=0,
                       doctor exit=1 stale=0, 8 CHECK lines,
                       CHECK beacon PASS beacon present, age 2s

Exit codes identical between the two runs; exactly one advisory line per
command when stale and zero when fresh; stdout unchanged
(`spawned probe worktree ...`, `torn down probe`); the CHECK-line count
still 8, so no ninth check was added. Byte-for-byte what de8c1bd gave.
This is the sweep I was most worried about, because the guard's detail
string was rewritten and the in-flight count changed shape; neither leaked
into the line counts. No regression.

Both watcher entry modes:

    C1 resident, open task, no signals: still running after 4.2s,
       stdout bytes=0, stderr empty, stamps=4,
       gaps=499,1001,2001 non-decreasing=true
    C2 resident surfaces a turn-end: exit=0 stdout=[signal t1 turn-end]
       stderr empty
    C3 no open tasks: resident silent past three intervals;
       --max-heartbeats 1 exits 0 with [heartbeat 4]
    C4 virgin --once exit=3 silent; after turn-end exit=0
       [signal t1 turn-end]
    C5 three separate processes, one schedule: exit 3, [heartbeat 1],
       exit 3, backoffStreak 1 on disk
    C6 immediately following pass: exit=3, empty stdout
    C7(b) five rounds: once(exit=3,empty) resident(exit=0,signal),
       exactly one surfaced every round
    C8 three consecutive no-wake passes, beacon strictly advancing
    C9 past deadline exit=0 [stale t1 deadline]; future deadline exit=3;
       turn-end present takes precedence over a passed deadline

Every one matches de8c1bd, including the "heartbeat 4" ordinal that comes
from the fleet's carried-over schedule. The wake precedence order is
unchanged and the new stale entry sits below both existing sources: with a
passed deadline AND a torn meta.json present at once, the pass reports
`stale t1 deadline`, so nothing was shadowed. No regression.

### The round's self-caught consequence: HANDLED, and not by special-casing

The round reports that its own tests caught that a task is a directory, so
init's `tasks/.gitkeep` must not be reported as a broken record. Verified,
and verified that the fix is general rather than a filename special case.

Both modules gate on `statSync(...).isDirectory()`, not on a name:
src/liveness.ts's `surveyTasks` and src/watcher.ts's `scanUnsafe`. A grep
for a literal ".gitkeep" in src/ returns nothing. Executed on a fresh
`tiphys init` fleet:

    tasks/ contains only .gitkeep:   watch --once exit=3, stdout empty
    plus notes.txt, .DS_Store and a dangling symlink:
                                     watch --once exit=3, stdout empty
                                     guard: inFlight=0 unreadable=0
                                     surveyTasks: {"open":0,"unreadable":0}

Three further stray entries of three different kinds, including a broken
symlink whose `statSync` raises, and all three are ignored without the
loud path firing. The dangling symlink is worth calling out: it is the
case that would have thrown out of a naive `isDirectory()` check, and both
modules wrap the stat in a try that continues rather than raising.

Then the case that must still be loud, to prove the directory gate did not
buy quiet at the wrong price:

    tasks/torn/meta.json = '{"id":"torn","status":"open"'   (truncated)
    watch --once: exit=0 stdout=[stale torn meta]
    guard: inFlight=1 unreadable=1

And the third state stays quiet as designed: a task directory with no
meta.json at all (a spawn in progress or rollback residue) surfaces
nothing, which the shipped test also asserts. The three-way split is real
and each arm was driven.

### New findings

Severity scale as before: HIGH blocks merge, MEDIUM blocks under DR-0012,
LOW is recorded and does not block, INFO is an observation.

#### CR-508 (LOW): the CR-503 declared-cadence floor was applied to the
guard but not to doctor's own beacon check, so the two disagree about the
same file in the same run

Claim. `guard()` now computes
`max(cadence.staleThresholdMs, beacon.intervalMs + cadence.pollIntervalMs)`
(src/liveness.ts, the `declaredFloorMs` block). `checkBeacon` in
src/commands/doctor.ts still compares `ageSeconds * 1000` against
`CADENCE.staleThresholdMs` alone and never reads `beacon.intervalMs`. So
the cry-wolf state CR-503 described survives on doctor's own surface.

Evidence (executed). A resident watcher at the shipped defaults, verified
alive, beacon 13s old declaring `intervalMs: 60000`, read by a process
configured at cap 10s, poll 1s, threshold 12s:

    guard advisory lines on stderr: 0     ("watcher fresh")
    CHECK beacon WARN beacon present but 13s old, past the 12s freshness
          threshold
    doctor --for watch:
    CHECK beacon FAIL beacon present but 13s old, past the 12s freshness
          threshold (required for profile watch)

One `tiphys doctor` run, one beacon, two contradictory verdicts. Under
`--for watch` the promotion turns it into a FAIL, which is the one place
in this phase where a beacon judgement gates an exit code rather than
merely warning; the advisory never could.

Why LOW rather than medium. The trigger is the same cross-process
misconfiguration CR-503 described (a reader carrying TIPHYS_WATCH_*
variables the watcher does not), it cannot be reached at the shipped
defaults, and I confirmed that control in the same fleet: with no
environment override, the same beacon gives
`CHECK beacon PASS beacon present, age 13s (freshness threshold 1200s)`.
The default threshold of 1200s exceeds any declarable interval, because
the declared value is capped at the writer's backoff cap and the writer's
own invariant keeps that below its threshold. Nothing runs on Tiphys
before M4. The exit-code effect is also unobservable locally, since doctor
exits 1 on the Node floor regardless; CI on Node 26 is the authority, as
for every other floor-gated doctor assertion here.

Concrete fix, three lines in a file already on this phase's files-to-touch
list: have `checkBeacon` read the parsed beacon's `intervalMs` and compare
against `max(CADENCE.staleThresholdMs, beacon.intervalMs + CADENCE.pollIntervalMs)`,
reporting the effective threshold it used, so the guard and the check
answer the same question the same way. Otherwise it belongs with the M2
gate registry, next to CR-503's own residue.

#### CR-509 (LOW): environment warning 7 prescribes a remedy that its own
stated reason refutes, and that I confirmed does not work

Claim. Warning 7 now says: "THE SEAM I DO NOT OWN, named exactly: the
clean fix is a four-line try/catch around `await run(process.argv.slice(2))`
in bin/tiphys.ts." bin/tiphys.ts is four lines and its first is
`import { run } from "../src/cli.ts"`, a STATIC import. A static import is
evaluated before the importing module's body runs, so a try/catch inside
that body cannot catch a throw raised while the graph is being evaluated.
The warning states this reason correctly two sentences earlier ("the throw
happens while the import graph is being evaluated, before `run()` is
entered") and then prescribes a fix the reason rules out.

Evidence (executed). I wrote both forms into the clone and ran them under
both throw sites.

    shipped bin, TIPHYS_WATCH_STALE_SECONDS=abc, "version":
      exit 1, raw stack trace at src/liveness.ts:116
    the named fix (try/catch around await run, STATIC import):
      exit 1, raw stack trace at src/liveness.ts:116   <- does not work
    same file with await import("../src/cli.ts") INSIDE the try:
      exit 78, one line:
      tiphys: TIPHYS_WATCH_STALE_SECONDS="abc" is not a positive number
      of seconds
    and under the PR-009 invariant violation, the same two:
      static form   -> raw stack trace at src/liveness.ts:134
      dynamic form  -> tiphys: invalid watcher cadence: stale threshold
                       915000ms is not strictly greater than ...

Failure scenario. This is a durable instruction, written into the artifact
CLAUDE.md says a later reviewer trusts, aimed at whoever next owns
bin/tiphys.ts (the work history guesses M2). That owner implements four
lines, sees the stack trace unchanged, and either concludes the finding was
wrong or spends the afternoon rediscovering module evaluation order. The
cost of the wrong sentence is paid by someone with less context than the
person who wrote it.

Why LOW. It is a documentation defect, not a code defect; the code half
this phase owns is correct and registered; and the correction is one
sentence. I record it rather than waving it through because a work history
that names a seam wrongly is the same class of error as key decision 9's
"which doctor reports anyway", which the second reviewer had to catch,
and this round's own stated principle is that a claim with no verifiable
artifact behind it is unknown.

Concrete fix. Replace the prescribed shape with the one that works:
`bin/tiphys.ts must move to a dynamic import inside the try
(await import("../src/cli.ts")), because the current static import is
evaluated before any handler in that file exists.` One sentence, no code
change in this phase.

#### CR-510 (LOW): a future-dated beacon changed sign rather than closing,
and the reason line's remedy is the one action that does not help

Claim. The classification fix is right and I asked for it. What it does
not touch is the mechanism that made CR-501 permanent: `writeBeacon`
(src/watcher.ts) still stamps `previousMs + 1` whenever `nowMs` is not
greater than the previous stamp, so a beacon carried into the future stays
there, advancing one millisecond per evaluation. Where de8c1bd reported
permanent false health, 1807951 reports permanent false alarm, and it
still cannot self-heal.

Evidence (executed). Same fleet, beacon 24 hours ahead, with a resident
watcher started and confirmed running, writing beacons every second:

    watcher alive: YES
    beacon after 4s: {"writtenAt":"2026-08-06T01:20:02.044Z",
                      "backoffStreak":2,"intervalMs":4000}
    guard with that healthy watcher running: stale=true
    doctor: CHECK beacon WARN beacon present but dated 86381s in the future

A demonstrably healthy watcher cannot clear the condition, and the guard's
own remediation text says: `start "tiphys watch" or schedule
"tiphys watch --once" at least every 1200s`. It is already running. The
one action that fixes it, removing or rewriting the beacon, is not named.

Why LOW, and why I am not asking the round to reopen it. Loud is the right
direction and matches the property the round enforced; a silent future
beacon was strictly worse. The trigger (a backwards wall-clock step under
a running watcher) is unchanged in reachability and is already the named
M4 residue. And nothing runs on Tiphys before M4.

Why it is still worth recording. The round's own CR-503 rationale is that
"crying wolf and never crying are the same defect from the operator's
side", and this is a state that cries wolf forever with unactionable
advice. The round also established the better pattern one function away:
the stuck-claim reason names the file and says "remove that file and
re-run". The future-beacon detail should do the same.

Concrete fix, either half of which is enough. Name the recovery in the
detail line ("the beacon must be removed or rewritten from the present;
restarting the watcher will not clear it"), which is a string change; or
have `writeBeacon` resynchronise when the previous stamp is more than
BEACON_FUTURE_TOLERANCE_MS ahead of `nowMs`, stamping `nowMs` instead of
`previousMs + 1`. The second is the real repair but it puts one backwards
step into the beacon, which criterion 8's strict-advance assertion would
have to be reconciled with, so it is an owner call rather than an
implementer call. The string half is safe now.

#### CR-511 (INFO): environment warning 9's suite wall-time budget is now
stale, in the same way CR-504 was

Warning 9 still reads "suite wall time is 71.2s ... Budget harness
timeouts off 72s, not off the older figures." The fix round's own gate
evidence supersedes it with 75.9s and explains the added ~4s (the
stuck-claim witness spends the claim's 5s bounded wait twice). My run from
a removed dist/ took 82.0s on this machine. An M1-P6 harness author reading
the warnings list, which is where that advice deliberately lives, will
budget off 72s and see flakes.

No action required before merge; one number in warning 9, pointing at the
fix-round figure and noting that the local measurement varies with machine
load, closes it. I record it because this is exactly the CR-504 shape: a
correct warning whose stated number silently stopped being true, aimed at
a phase that has not been dispatched yet.

### Merge recommendation

MERGE. The round did what it said: it found one property under six
findings and enforced it at four sites, rather than patching six symptoms,
and the property is the right one for a component whose output is trusted
silence. All five of my lows and both infos are closed or correctly
recorded, the two blocking findings from the other reviewer are closed
under my own execution including the recovery path, and nothing I had
previously confirmed stopped holding: the criteria most exposed to the
changed sites return byte-for-byte what they returned on de8c1bd,
including the two that worried me most (the criterion-12 boundary sweep,
which the new declared-cadence floor could have moved, and the criteria
10/11 line counts, which the rewritten detail string could have doubled).

Of the four new findings, two are code residues that stay LOW for the
reasons the originals did (CR-508 is CR-503's other surface and cannot
fire at the shipped defaults, which I confirmed with a control; CR-510 is
CR-501 with its sign flipped, which is the safe direction), and two are
corrections to durable guidance. I would ask the orchestrator to take
CR-509 and CR-511 before merge even though neither blocks, because both
are single sentences in a work history that M1-P6 and M2 will read as
instructions, and because CR-509 is a remedy that has now been
demonstrated not to work.

Merge subject to the standing conditions this review cannot supply: CI
green on 1807951 on Node 26, which is the authority for every floor-gated
assertion above, and the second reviewer's own delta pass on their two
blocking findings.
