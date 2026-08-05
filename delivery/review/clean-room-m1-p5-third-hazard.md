# Clean-room review: M1-P5 fix round (supervision-blocking lens)

- Date: 2026-08-05
- PR: 8
- Branch: claude/m1-p5-watcher-liveness
- Head reviewed: 1bdfce5fcf0ecfa88d7318f58f77b378544045b5
- Base: origin/main at bcefc98 (three-dot diff)
- Reviewer: independent clean-room reviewer, blocking/hang/signal-loss lens,
  did not see the implementation session and did not see the concurrent
  reviewer's findings
- Findings numbered from CR-520 to avoid collision with the three prior
  rounds and with the concurrent reviewer

## VERDICT: FIX-ROUND-NEEDED

One HIGH, one MEDIUM, two LOW. The HIGH is not a new class of defect: it
is the SAME defect the previous round was convened to fix (NEW-2, an
indefinite kernel-level block on an unprobed read), still live on six of
the seven paths this phase reads, including the one that takes the guard
itself down and therefore defeats the safety net that catches all the
others.

Read the DR-0012 note in the last section before deciding anything. Both
of that record's stop-and-wait conditions are now satisfied.

## Method

Lens first, contract second. I derived my own inventory of every
filesystem read in `src/` at this head rather than trusting the candidate
list I was given, then attacked each one with the construction the prior
round's HIGH finding used. Everything below marked as evidence is my own
execution in my own worktree, with exit codes captured; `timeout N` was
used throughout so a hang reports as exit 124 rather than as an
unexplained wait. The three new tests were red-witnessed by sabotaging
the shipped source, three runs each, restoring from a byte copy taken
before any edit (never `git checkout --`, environment warning 8). All 15
acceptance criteria were then walked by direct CLI invocation,
independently of the suite.

## Isolation (T-004)

All work was done in the detached worktree at
`.../scratchpad/cr-p5-a` at 1bdfce5. Scratch fleets were created under
`.../scratchpad/probe`, `/walk`, `/walk2`, `/walk3`, `/spawnprobe`,
`/lost` and `/cr509`, all outside the worktree. Byte copies of the three
sabotaged sources were taken in `.../scratchpad/backup` before any
mutation and restored from there afterwards. Nothing under
`/home/user/tiphys-ai-helmsman` was written. `git status --porcelain` in
the worktree is EMPTY as of the end of this review except for this file,
which is untracked and uncommitted by design.

## Gate evidence (local, Node v22.22.2, npm 10.9.7, running as uid 0)

| Gate | Exit | Observed |
|---|---|---|
| `npm ci` (clean) | 0 | 4 packages, EBADENGINE warnings as expected |
| `npm run build` (`rm -rf dist` first) | 0 | `git status --porcelain` empty afterwards |
| `node --test` (dist removed), run 1 | 0 | tests 139, pass 137, fail 0, cancelled 0, skipped 2, todo 0; 95.1s |
| `node --test` (dist removed), run 2 | 0 | tests 139, pass 137, fail 0, cancelled 0, skipped 2, todo 0; 82.7s |

The two skips are the unchanged M1-P2 floor-gated pair ("doctor in a
healthy fleet exits 0", "doctor with gh absent exits 0 under the generic
profile"), each carrying the recorded reason
"local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on
CI (Node 26)". Zero unaccounted tests. `mkfifo` is present here, so the
new FIFO witness RAN rather than skipping.

Wall time note: both my runs exceed every figure quoted in environment
warning 9 (66.8 / 71.2 / 75.9 / 80.8 / 82.0s). The warning's own framing
("treat any number quoted here as a floor") holds, and both runs are
inside the 120s budget it prescribes, so this is not a finding.

## Scope audit

`git diff --name-only origin/main...HEAD` returns twelve paths:

- Nine on the plan's files-to-touch list: `src/watcher.ts`,
  `src/commands/watch.ts`, `src/liveness.ts`, `test/watcher.test.ts`,
  `test/liveness.test.ts`, `src/cli.ts`, `src/commands/spawn.ts`,
  `src/commands/teardown.ts`, `src/commands/doctor.ts`.
- Two standing pre-authorized extras: `test/behaviors.json`,
  `delivery/work-history/m1-p5.md`.
- One declared scope extension: `test/teardown.test.ts` (deviation 4).
  I read the diff. It touches only that file's `runCli` helper, adds an
  assertion that the guard produced AT MOST ONE line, and routes the
  remaining stderr into the same field the file's existing assertions
  read, so nothing was weakened or deleted. Both prior reviewers ruled
  this accepted. I concur and raise no new finding on it.

No file outside the phase. No tsconfig, dependency or CI change.

## Conventions

- Non-ASCII scan over all twelve changed files: `grep -rP '[^\x00-\x7F]'`
  exit 1 (clean).
- Em-dash scan over the same files: exit 1 (clean).
- English only: confirmed by reading.
- npm only: no pnpm or yarn reference introduced.
- Commit messages: `git log origin/main..HEAD` (14 commits) scanned for
  claude/opus/sonnet/gpt/anthropic/openai/copilot/co-authored: exit 1
  (clean). The git AUTHOR field on the branch commits is
  "Claude <noreply@anthropic.com>", which is pre-existing practice on
  this repository (the same author appears on delivery commits already on
  `main`) and is not what the convention regulates; raised here as an
  observation, not a finding.

## The three constraints, checked as hazards

- **C-1.** Currency comes from `tasks/<id>/meta.json` (through the one
  classifier) and the turn-end file. `state/last-wake.json` is opened
  exactly once in `src/`, at `src/watcher.ts:507`, with flag `"a"`, and
  is never read anywhere: `grep -rn "lastWakePath\|last-wake\|LAST_WAKE"
  src/` returns only the constant, the path helper, the append site and
  two doc comments. No decision in this kernel is derived from a log
  tail. CLEAN. (But see CR-522: the fact that nothing reads it is what
  makes the FM-046 guarantee hollow.)
- **C-2.** `grep -nE "process\.kill|kill\(|signal-0|/proc/|process\.pid|
  \.pid\b|SIGKILL|SIGTERM"` over `src/watcher.ts`, `src/liveness.ts`,
  `src/commands/watch.ts`: exit 1. Liveness is beacon freshness only.
  CLEAN. `test/liveness.test.ts` does use `killSignal: "SIGKILL"` on
  `spawnSync`, which is bounding a child in a test harness, not identity
  or exclusion; criterion 14's grep is scoped to `src/` and C-2 regulates
  the lock and liveness design. Not a violation.
- **C-3.** `grep -nE "detached|unref|daemon|background|nohup|spawn\("`
  over the same three files: exit 1. `src/commands/watch.ts` has no
  daemonize or background flag (the flag surface is `--once`,
  `--interval`, `--poll`, `--backoff-cap`, `--max-heartbeats`), and
  `runResident` is a plain foreground loop that starts no child process.
  CLEAN.
- **Network (criterion 13).** No `node:http`, `node:https`, `node:net`,
  `node:tls`, `node:dgram`, no `fetch(`, no client library across
  `src/watcher.ts` and its transitive imports: exit 1. CLEAN.

## Behavior registry (checked BY NAME, computed independently)

Script over the live tree, parsing every `test(` title under `test/` and
resolving every mapping in `test/behaviors.json`:

    registered mappings:        145
    distinct registered titles: 139
    test() titles discovered:   139
    unresolvable mappings:      0

Against `origin/main`'s `test/behaviors.json` (107 mappings): removed
names `[]`, retitled names `[]`, 38 added. Every behavior newly named by
this phase's criteria maps to a test present in this run, and every
previously registered mapping still resolves by name. This matches the
work history's own claim (145 / 0 / 139) exactly. CLEAN.

## The 15 criteria, walked by execution

Every criterion below was executed by me against a scratch fleet built by
`tiphys init`, not inherited from the suite.

1. PASS. `watch --interval 0.5 --poll 0.1 --backoff-cap 10`, resident,
   sampled the beacon every 100ms for 4.5s: four distinct stamps, gaps
   `[195, 632, 2000]` ms, non-decreasing, zero bytes on stdout and stderr
   while idle, process still running when I killed it.
2. PASS. Resident watcher, `--poll 0.1`; a turn-end written 1.5s in:
   exit 0, stdout exactly `signal t1 turn-end`, stderr empty.
3. PASS. No open tasks, `--interval 0.4 --poll 0.1`: `timeout 3` killed
   it at exit 124 (still running, three base intervals), stdout empty.
   Same fleet with `--max-heartbeats 2`: exit 0, stdout `heartbeat 2`.
4. PASS both halves. Virgin fleet `watch --once`: exit 3, stdout empty,
   stderr empty. With a turn-end pending: exit 0, `signal t1 turn-end`.
5. PASS. `watch --once --interval 0.4` three times across three separate
   processes: exit 3, then (after 0.6s) exit 0 `heartbeat 1`, then
   immediately exit 3. `state/watcher.cadence.json` reads
   `{"lastHeartbeatAt":"...","backoffStreak":1}`. The schedule crossed
   process boundaries.
6. PASS. First `--once`: exit 0 `signal t1 turn-end`. Second on the
   unchanged fleet: exit 3, stdout empty.
7. Taken from the suite, not re-walked (see honest failures). Tests
   `watcher-race-single-surfacing` and `watcher-resident-versus-once-race`
   pass in both of my full runs.
8. PASS. Two consecutive no-wake passes: `06:04:26.939Z` then
   `06:04:27.144Z`, strictly greater, exit 3 each.
9. PASS. Open task, `executor.json` with a past deadline, no turn-end:
   exit 0, stdout exactly `stale t1 deadline`.
10. PASS. Beacon aged 1260s, one open task. `doctor` exit 1 with exactly
    one stderr line, all of it the advisory, and
    `CHECK beacon WARN beacon present but 1260s old, past the 1200s
    freshness threshold`. `teardown --task t1` exit 1 with exactly one
    advisory line among two stderr lines (the second is teardown's own
    reason). `doctor --for watch` promotes the same condition to
    `CHECK beacon FAIL ... (required for profile watch)`.
11. PASS. Fresh beacon, same fleet, same commands: zero advisory lines,
    same exit codes as the stale runs, `CHECK beacon PASS beacon present,
    age 0s (freshness threshold 1200s)`.
12. PASS both clauses. (a) Verified by the registered test plus the
    guard's arithmetic. (b) Executed: `TIPHYS_WATCH_BACKOFF_CAP_SECONDS=900
    TIPHYS_WATCH_POLL_SECONDS=15 TIPHYS_WATCH_STALE_SECONDS=915` exits 1
    with `invalid watcher cadence: stale threshold 915000ms is not
    strictly greater than backoff cap 900000ms plus one poll interval
    15000ms (915000ms)`; one second more (916) loads and exits 3; the
    same violation through `--backoff-cap 36000` is exit 64 naming both
    values.
13. PASS. Grep clean (above).
14. PASS. Grep clean (above).
15. PASS. Suite exit 0, 139/137/0/2, zero unaccounted; registry check
    above.

No criterion regressed. Criterion 15's numbers in the work history's
FIRST criteria walk (127 tests, 131 mappings) are that round's figures and
are superseded in place by the later per-round gate-evidence sections;
that is dating, not overstatement.

## THE LENS: can a supervision path still block, hang, or lose a signal?

Yes. The round closed the blocking read on ONE path and left it open on
six, four of which it created itself in this phase.

### Inventory (derived, not inherited)

`grep -rn "readFileSync\|createReadStream\|openSync\|readdirSync\|statSync\|
lstatSync\|existsSync\|realpathSync\|readlinkSync" src/`, then traced each
site that reads a path under `tasks/`, `state/` or `worktrees/`:

| Reader | Path read | Probed before open? | Blocks on a FIFO? |
|---|---|---|---|
| `surveyTaskRecords` -> `readTaskMeta` (`src/liveness.ts:412`) | `tasks/<id>/meta.json` | YES (this round's fix) | no |
| `readBeacon` (`src/liveness.ts:203`) via `judgeBeacon:467` | `state/watcher.beacon` | NO (`lstatSync` at :460 tests presence only, not type) | **YES** |
| `identityOf` -> `readIfPresent` (`src/watcher.ts:245`) | `tasks/<id>/turn-end` | NO (`statSync` at :241 does not gate on type) | **YES** |
| `deadlineOf` -> `readIfPresent` (`src/watcher.ts:397`) | `tasks/<id>/executor.json` | NO | **YES** |
| `claimCheckRequest` -> `readIfPresent` (`src/watcher.ts:651`) | `state/check-request` (after rename) | NO | **YES** |
| `readSeenState` -> `readIfPresent` (`src/watcher.ts:257`) | `state/watcher.seen.json` | NO | **YES** |
| `readCadenceState` -> `readIfPresent` (`src/watcher.ts:299`) | `state/watcher.cadence.json` | NO | **YES** |
| `teardownTask` -> `readTaskMeta` (`src/teardown.ts:189`) | `tasks/<id>/meta.json` | NO (does not use the classifier) | **YES** |

`readIfPresent` and `statIfPresent` are the module's own
absent-is-not-an-error helpers, and both are documented as the structural
answer to "how a raised error is classified". Neither touches a block,
for exactly the reason the round wrote down for the record path: a block
is not an exception.

### CR-520 (HIGH): the blocking-read class is closed on one path out of seven, and the one left open takes the guard itself down

**The claim.** `src/liveness.ts:296-303` states as a governing rule of the
one classifier that "opening a FIFO with no writer blocks in the kernel
and is not an exception, so a classifier that read first would hang
instead of classifying, and would take the guard's three callers down with
it", and the commit subject is "probe a task record before reading it, so
a named pipe cannot hang supervision". The module header at
`src/liveness.ts:58-63` still states "WARN, NEVER BLOCK ... guard() is
TOTAL: every filesystem read it performs is wrapped".

**Why it is wrong.** `guard()` performs a second filesystem read, of the
beacon, and that one is NOT probed for type. `judgeBeacon`
(`src/liveness.ts:453-480`) calls `lstatSync(beaconPath)` only to answer
"is anything there", discards the result, and then calls `readBeacon`,
which is a bare `readFileSync`. A named pipe at `state/watcher.beacon`
therefore blocks `guard()` forever. `guard()` is called unconditionally by
`warnIfWatcherStale`, which `src/commands/doctor.ts:369`,
`src/commands/spawn.ts:140` and `src/commands/teardown.ts:73` call before
they do anything else, so all three commands die silently. `writeBeacon`
(`src/watcher.ts:360`) calls `readBeacon` too, so both watcher modes die
as well. This is strictly worse than the record case the round just
fixed, because the guard is the mechanism that would otherwise notice
every other hang by letting the beacon go stale: with the guard hung, the
safety net is gone too.

**Evidence.** Fleet built by `tiphys init` with one open task,
`mkfifo state/watcher.beacon`, no writer ever opened:

    timeout 10 tiphys doctor                -> EXIT=124, stdout EMPTY, stderr EMPTY
    timeout 8  tiphys watch --once          -> EXIT=124, stdout empty, stderr empty
    timeout 8  tiphys watch                 -> EXIT=124, stdout empty, stderr empty
    timeout 8  tiphys teardown --task t1    -> EXIT=124, stdout empty, stderr empty
    timeout 12 tiphys spawn --task s2 ...   -> EXIT=124  (control without the FIFO: EXIT=1,
                                               "tiphys spawn: ... has no configured remote")
    timeout 8  guard(loadFleet(fleet))      -> EXIT=124

Note the doctor result specifically: ZERO output, not a partial check
list. `warnIfWatcherStale` runs at `src/commands/doctor.ts:369`, before
the loop that prints the eight `CHECK` lines, so the diagnostic tool
produces nothing at all on the fleet it exists to diagnose.

The other five paths, same fleet shape, each probed with a control run
first (`watch --once` on the healthy fleet exits 3, empty):

    mkfifo tasks/t1/turn-end             -> tiphys watch --once EXIT=124
    mkfifo tasks/t1/executor.json        -> tiphys watch --once EXIT=124
    mkfifo state/check-request           -> tiphys watch --once EXIT=124, and the
                                            request had already been renamed to
                                            check-request.taken before the block,
                                            so the wake source is consumed and lost
    mkfifo state/watcher.seen.json       -> tiphys watch --once EXIT=124
    mkfifo state/watcher.cadence.json    -> tiphys watch --once EXIT=124

Control that the round's own fix DOES work on the path it targeted: with
a FIFO at `tasks/piped/meta.json` and nothing else unusual,
`tiphys doctor` exits 1 having printed all eight `CHECK` lines, and
`tiphys watch --once` exits 0 printing `stale piped meta`. That half is
genuinely closed.

Control that the danger is specific to blocking, not to odd file types: a
DIRECTORY at each of `state/watcher.cadence.json`,
`state/watcher.seen.json` and `state/watcher.beacon` makes
`tiphys watch --once` exit 1 with exactly one reason line each
(`EISDIR: illegal operation on a directory, read` / `... scanning the
watcher wake sources failed: EISDIR ...` / `EISDIR ... rename`). The
designed loud path works; it is only the kernel-level block that walks
past it.

**Why this is HIGH and not a contrived corner.** Three reasons, and the
first is the decisive one. (a) The project already graded this exact
construction HIGH one round ago and convened a fix round for it; grading
the same construction lower now because it is on a different path is not
a judgement, it is fatigue. (b) The aggravating factor the second
reviewer named for NEW-2 applies verbatim here: the module carries a
prominent, delivered claim that the class is handled, and the claim is
false the moment it is tested. A false claim of coverage is worse than no
claim, because the next implementer builds on it. (c) The blast radius is
larger: NEW-2 hung the guard's callers while leaving the guard's own
staleness mechanism intact for other failures; CR-520 hangs the guard, so
no "supervision stopped" warning can ever be produced on that fleet.

I record the honest counter-argument: nothing in this kernel creates a
FIFO, so reaching any of these states needs a person or a foreign program.
If the owner judges the whole class acceptable, that is a legitimate
decision. It is not a decision an implementer or an orchestrator may take
by leaving the docstring's claim standing.

**Fix (concrete, small, one of two).** Either:

1. Make the probe a property of the read rather than of one call site.
   `readTaskMeta` in `src/task.ts`, `readBeacon` in `src/liveness.ts` and
   `readIfPresent` in `src/watcher.ts` are the three entry points; give
   each one an `lstat`/`stat`-then-open-only-a-regular-file preamble (or
   route all three through one `readRegularFileIfPresent` helper). This is
   ONE implementation, not a second reader, and it covers all eight rows
   of the table above including `src/teardown.ts` (see CR-521).
2. Or accept the residue by owner decision, and correct BOTH false claims
   in `src/liveness.ts` (the header's "guard() is TOTAL: every filesystem
   read it performs is wrapped" and the classifier's implication that the
   blocking class is handled) plus the corresponding work-history entry,
   so the record states which paths are protected and which are not.

Option 1 is roughly fifteen lines. I would take it.

### CR-521 (MEDIUM): the stated reason for declining defence in depth is a false dichotomy, and `src/teardown.ts` still reads a record the classifier never cleared

**The claim.** Work history, final-confirmation round: "I did NOT add a
non-blocking reader as defence in depth, and the reason is the previous
round's own lesson rather than laziness: a second reader beside
`readTaskMeta` would be a second implementation of 'read a task record'".
The same reasoning is in `src/liveness.ts:308-314`.

**Why it is wrong.** The choice is not between "one reader with a per-call-
site probe" and "two readers". The third option, which the entry does not
consider, is to move the probe INSIDE `readTaskMeta`: still exactly one
implementation of "read a task record", still one classifier, and every
caller protected by construction instead of by remembering. The current
shape leaves the ordering enforced by control flow inside ONE function
while the property it protects is a property of the file, so any other
caller of `readTaskMeta` is unprotected. There already is one:
`src/teardown.ts:189`.

**Evidence.** Same fleet, `mkdir tasks/t2 && mkfifo tasks/t2/meta.json`:

    timeout 10 tiphys teardown --task t2  ->  EXIT=124, stdout empty, stderr empty

The guard advisory at `src/commands/teardown.ts:73` now survives the FIFO
(that is the round's fix working), and then `teardownTask` hangs on the
same file two calls later. So the answer to "does anything downstream of
the fix round's changes still read a task record the classifier did not
clear" is yes, by name and by line.

`src/teardown.ts` is M1-P4 code and is not on this phase's files-to-touch
list, which is why this is MEDIUM rather than part of the HIGH: the
implementer was right not to edit it. What is a finding is the recorded
REASON, because it is the sentence a later phase will read and act on, and
it argues against the one fix that would have covered this.

**Fix.** Replace the declined-alternative paragraph in both places with
the accurate statement: the probe belongs inside `readTaskMeta`, that is
one implementation and not two, the file is out of this phase's scope, and
`src/teardown.ts:189` is the caller currently left exposed. Then raise the
`src/task.ts` change as an M2 item (or fold it into CR-520's fix if the
orchestrator widens scope for it).

### CR-522 (LOW): FM-046's enqueue-before-suppress protects a file nothing reads, and the channel that matters is written after the suppress

**The claim.** `src/watcher.ts:117-128` and the plan's step 1: the wake is
appended to `state/last-wake.json` BEFORE the seen record advances, so
"a crash between the two duplicates rather than drops" (FM-046).

**Why it is thin.** The module states, correctly and by design (C-1), that
`state/last-wake.json` is written and never read by any code path in this
kernel; I verified that by grep. So the barrier is placed in front of a
file that cannot restore anything. The channel that actually delivers a
wake to a consumer is stdout, written in `cmdWatch`
(`src/commands/watch.ts:185`) AFTER `claimSignal` has already advanced the
seen state and released the claim. A stop in that window suppresses the
wake permanently, for every future pass and every mode, with no artifact
any code can act on. That is T-005's shape (a failure that looks like an
absence of work) with a small window rather than a large one.

**Evidence.** I could not reliably kill a process inside a microsecond
window, so I built the state such a stop leaves behind: seen state
advanced to the pending turn-end's exact identity (size, mtimeMs, sha256),
turn-end still present, task still open, `last-wake.json` absent.

    tiphys watch --once  x3   ->  EXIT=3, EXIT=3, EXIT=3, stdout empty each time
    guard(fleet)              ->  {"inFlight":1,"unreadable":0,"beaconAgeMs":159,
                                   "stale":false,
                                   "detail":"watcher fresh: 1 open task(s) in flight,
                                             beacon 0s old"}

A finished task reported as in flight forever, no wake ever surfaced
again for it, and the guard reporting the fleet healthy throughout.

**Why it is LOW and not higher.** The plan names `state/last-wake.json` as
the enqueue target explicitly, so the implementer followed the plan's
letter; closing the window properly means printing inside the claim, which
changes the surfacing protocol and is not an improvisation an implementer
should make. The window is genuinely small.

**Fix.** One sentence in `src/watcher.ts`'s currency section and one line
in the work history's honest-scope list: the at-most-once guarantee is
delivered against the seen state, the durability record cannot restore a
wake because nothing reads it, and a stop between the seen advance and the
stdout write drops the wake permanently. Then carry it to the M2 backlog
next to CR-510's declined repair, which is the same shape of residue.

### CR-523 (LOW): doctor runs the advisory before it prints any check, so anything wrong with the guard silences the whole diagnosis

**The claim.** `src/commands/doctor.ts:363-371`: "Liveness guard (M1-P5
step 2). It warns and never blocks: doctor's exit code is decided by its
checks exactly as before."

**Why it is worth recording.** `warnIfWatcherStale` is called before the
`for` loop that emits the eight `CHECK` lines. `guard()` is total against
RAISES, so today the only way this bites is a block (CR-520), and there
the observed result is zero output from the one command an operator runs
when a fleet is misbehaving. Even after CR-520 is fixed, the ordering
means an advisory sits in front of the diagnosis rather than beside it.

**Evidence.** FIFO beacon, `tiphys doctor`: exit 124 with an empty stdout,
against exit 1 and eight `CHECK` lines for every other beacon state I
tested (fresh, stale, absent, unreadable, future, dangling symlink).

**Fix.** Move the `warnIfWatcherStale` call after the check loop, or
capture the report before the loop and emit the advisory line after it.
Two lines, no behavior change to exit codes, and doctor keeps diagnosing
even when the guard cannot.

## Test honesty: red witnesses against the DANGEROUS state

Each sabotage was applied to the shipped source, run three times with
`--test-name-pattern` PRECEDING the positional path (environment warning
7), then restored from a byte copy and confirmed with
`git status --porcelain` empty.

**H1, the hang witness (`liveness-fifo-record-does-not-block`).** Sabotage:
restored the pre-fix ordering by calling `readTaskMeta` before the lstat
probe and short-circuiting on success, which is exactly the state NEW-2
named. Result: RED 3/3, in 15.6s, 15.6s and 15.6s wall, with

    error: 'the watcher blocked on the named pipe at
    /tmp/tiphys-p5-liveness-ItKOPQ/fleet/tasks/piped/meta.json and was
    killed after 15000ms: the record was read before it was probed'

The work history's claim is CONFIRMED in every part: the bound is 15s, it
is enforced by `spawnSync` with `killSignal: SIGKILL` rather than by the
test runner, the guard half runs in a child process so a regression cannot
hang the suite, and the failure names the FIFO instead of looking like a
CI stall. This is a correctly staged red-witness against a hang, which is
harder than it looks and was done right.

**G5b, the ELOOP witness (`liveness-unexaminable-entry-reported`).**
Sabotage: dropped `+ survey.problems.length` from `surveyTasks` and
replaced `throw new Error(problem)` in `scanUnsafe` with a no-op, which is
the state where an unexaminable entry reads as an idle fleet. Result: RED
3/3, with the on-point message

    an unexaminable entry was read as an idle fleet: no open tasks:
    nothing is in flight to supervise
    0 !== 1

**H2, the dangling-symlink beacon witness
(`doctor-beacon-dangling-symlink-fails`).** Sabotage: changed
`judgeBeacon`'s presence probe from `lstatSync` back to `statSync`, which
follows the link and reports a dangling beacon as absent. Result: RED 3/3.

All three new tests are red against their dangerous states, not merely
against an absent feature. Sources restored; `git diff HEAD -- src/ test/`
empty.

## False-claim sweep on the work history

I treated every factual assertion as unverified and executed a wide
sample. Everything below is my own measurement.

| Claim | Verdict |
|---|---|
| Gate: suite 139 / 137 pass / 0 fail / 2 skipped, zero unaccounted | TRUE, twice |
| Gate: build exit 0, `git status --porcelain` empty after | TRUE |
| Registry: 145 mappings, 0 missing, 139 titles, nothing removed | TRUE, computed independently |
| Scope: nine files-to-touch + behaviors.json + teardown.test.ts + this file | TRUE |
| ASCII / em-dash / C-2 / C-3 / network scans clean | TRUE, all exit 1 |
| H1 red 3/3, bounded at 15s by spawnSync+SIGKILL, guard probed in a child | TRUE, reproduced |
| G5b red 3/3 | TRUE, reproduced |
| H2 red 3/3 | TRUE, reproduced |
| CR-509 remedy: static import + body try/catch catches nothing (exit 1, raw trace); dynamic import inside the try gives exit 78 and one line | TRUE, I rebuilt both forms: Form A exit 1 with 13 stderr lines, Form B exit 78 with 1 line `tiphys: TIPHYS_WATCH_STALE_SECONDS="abc" is not a positive number of seconds`; shipped bin matches Form A |
| Criterion 12(b) message text and the 915/916 boundary | TRUE, byte-for-byte |
| Criterion 10/11 advisory line counts (exactly one / exactly zero) | TRUE |
| Criterion 5 schedule crosses three processes, `backoffStreak 1` | TRUE |
| Criterion 1 beacon gaps non-decreasing, silent while idle | TRUE (gaps 195, 632, 2000 ms) |
| Criteria 2, 3, 4, 6, 8, 9 | TRUE, each executed |
| C-1: `state/last-wake.json` written, never read | TRUE by grep |
| "Nothing in this kernel writes that state" (the TOCTOU residual) | TRUE; no writer produces a non-regular file at a record path |
| Env warning 9's wall-time figures | Understated (my runs: 95.1s and 82.7s vs a quoted 66.8-82.0s range), but the entry explicitly says to treat every number as a floor and to budget off 120s, so the guidance is sound. Not a finding. |
| "the ordering is inverted ... nothing is opened until the path has been established to resolve to a regular file" | TRUE for the classifier, FALSE as a statement about this phase's readers generally: see CR-520 |
| "so a named pipe cannot hang supervision" (commit subject) | FALSE as written: see CR-520 |

The three self-reported false claims (the doctor safety net, CR-509's
prescribed remedy, the FIFO coverage claim plus the false impossibility)
are each corrected IN PLACE with the original wording quoted and the
correction attributed, which is the right form: a later reader sees both
the claim and why it was wrong. That practice is a credit to the record.
CR-520 is, however, the fourth instance of the same shape, and this one
was written INTO the correction itself.

## Disposition of the findings the orchestrator asked about

**CR-509 (the prescribed remedy that its own paragraph rules out):
RESOLVED.** Verified by rebuilding both forms from this head and measuring
against the same input, not by reading. The corrected warning names the
dynamic import inside the try, quotes both measurements, and states that
the earlier sentence was worse than no advice. `bin/tiphys.ts` is
correctly identified as a seam this phase does not own.

**CR-512 (the false impossibility about the incomplete-survey arm):
RESOLVED.** The impossibility claim is corrected in place and the arm is
now witnessed by `liveness-unexaminable-entry-reported`, using the
reviewer's own ELOOP technique. I red-witnessed it 3/3 against the
dangerous state myself.

**CR-513 (the dangling-symlink beacon changed category unremarked):
RESOLVED.** The category change, its criterion-visible exit-code
consequence, and the fact that the floor-dependent half is only witnessable
on CI are all recorded. Pinned by `doctor-beacon-dangling-symlink-fails`,
red 3/3 under my own sabotage.

**Any high or medium finding from a prior round still open?** One, and it
is the reason for this verdict. NEW-2 (HIGH) is closed for the instance it
named, `tasks/<id>/meta.json`, which I confirmed by execution. It is NOT
closed as the class it described, and the class was what made it a HIGH:
the same indefinite kernel-level block is live on six further paths at
this head, including `state/watcher.beacon`, which hangs `guard()` itself.
That is CR-520. No other prior finding at high or medium severity remains;
CR-501 to CR-511 are LOW or INFO and were each closed or explicitly
declined with a recorded reason by their originating reviewers.

## DR-0012: both stop-and-wait conditions are now satisfied

I am not the merge authority, but the merge decision turns on this, so I
state it plainly. DR-0012 line 34: "If a phase needs more than two fix
rounds after its first dual review, or if a high-severity finding recurs
in the same component across rounds, the orchestrator stops merging that
phase and leaves it for the owner with the evidence."

- Rounds after the first dual review (at de8c1bd): the fix round
  (1807951), the final round (98c635e), and this final-confirmation round
  (1bdfce5). That is three, which is more than two.
- A high-severity finding recurring in the same component: NEW-2 (HIGH,
  an unprobed blocking read in `src/liveness.ts`) at 98c635e, and CR-520
  (HIGH, an unprobed blocking read in `src/liveness.ts`) at 1bdfce5. Same
  component, same defect class, consecutive rounds.

Both conditions independently trigger. My recommendation is therefore not
"run a fourth fix round"; it is that the orchestrator stop, hand the owner
this evidence, and let the owner choose between the fifteen-line fix in
CR-520 option 1 and an explicit decision to accept the whole blocking-read
class with both false claims in `src/liveness.ts` corrected to say so.

## Probes run, including the ones that came back empty

Findings and empty-handed probes are listed together so absence of a
finding is distinguishable from absence of a check.

1. Full read-site inventory of `src/` for anything touching `tasks/`,
   `state/`, `worktrees/`. FOUND CR-520, CR-521.
2. FIFO planted at each of eight paths, one at a time, with a healthy
   control run between each. FOUND (six hang).
3. Directory planted at `state/watcher.cadence.json`,
   `state/watcher.seen.json`, `state/watcher.beacon`,
   `state/last-wake.json`. EMPTY: all loud, exit 1, exactly one reason
   line each (the `last-wake.json` case is not reached without a pending
   wake, which is correct).
4. Dangling symlink, empty file, torn JSON, directory and self-referential
   symlink at `tasks/<id>/meta.json`. EMPTY: all classified, guard and
   watcher agree, matching the prior round's own walk.
5. Stranded seen-state claim file (the T-005 shape). EMPTY: exit 1, one
   reason line naming the file and the 5000ms bound, and the beacon
   VERIFIED unchanged across the failed pass
   (`06:02:24.493Z` before and after), so supervision is allowed to read
   as stopped. Removing the claim restores `signal t1 turn-end` at exit 0.
6. Post-suppress signal loss (seen state advanced, consumer never saw the
   line). FOUND CR-522.
7. Guard reporting fresh while supervision is not happening: walked the
   resident loop, `runOnce`, `scanAndSurface`, `heartbeatTick` and
   `writeBeacon`. EMPTY apart from CR-520 and CR-522: a stuck claim writes
   no beacon, a failed scan writes no beacon and exits 1, a no-wake pass
   writes the beacon by design (PR-206), and a future-dated beacon is
   classified as no evidence.
8. TOCTOU between the classifier's `stat` and its `readTaskMeta`. EMPTY as
   a defect: the window is real, the docstring states it, and no writer in
   this kernel produces the state. The failure in that window would be a
   hang, which is the same class as CR-520 and is subsumed by its fix.
9. C-1: is any decision derived from a log tail? EMPTY. `last-wake.json`
   is append-only and unread.
10. C-2: pid, process liveness, signals, `/proc`. EMPTY.
11. C-3: `detached`, `unref`, daemonize flag, any child process on the
    watcher path. EMPTY. `runResident` is a foreground loop; `cmdWatch`
    starts nothing.
12. Destructive paths: can anything in this phase lose committed work?
    EMPTY. This phase writes only `state/*` and reads `tasks/*`; it runs
    no git command, removes no worktree, and touches no branch. The only
    unlink calls are its own claim file and its own `check-request.taken`.
    The one loss I found is a WAKE, not committed work (CR-522), plus the
    consumed-and-lost check request inside CR-520.
13. Is the probe ordering enforced by structure or by comment? Structure
    WITHIN `surveyTaskRecords`, comment-only ACROSS callers. FOUND
    CR-521.
14. Registry resolution by name, and the removed/retitled check against
    `origin/main`. EMPTY.
15. Conventions (ASCII, em dash, English, npm, commit-message tokens).
    EMPTY.
16. Scope audit. EMPTY (one declared, previously accepted extension).
17. All 15 acceptance criteria by direct execution. EMPTY (all PASS).
18. Red witness of all three new tests against their dangerous states.
    EMPTY as a defect: all three are honest, and H1 in particular is a
    correctly bounded witness against a hang.
19. CR-509's remedy claim rebuilt and measured from this head. EMPTY.
20. Both full-suite runs from a removed `dist/`, plus a build from clean
    with a `git status` check. EMPTY.

## Honest failures and limits of this review

1. **Criterion 7 was not re-walked.** The resident-versus-`--once` race
   and the `TIPHYS_WATCH_TEST_HOLD` interleave were taken from the passing
   suite rather than re-staged by hand. Both prior reviewers walked them;
   I chose to spend the time on the blocking lens instead. If criterion 7
   matters to the merge decision, it rests on their execution and on two
   green suite runs, not on mine.
2. **CR-522's window was simulated, not raced.** I could not kill a
   process reliably between the seen-state write and the stdout write, so
   I built the resulting state by hand and demonstrated that it is
   permanent and silent. The consequence is measured; the arrival at it is
   reasoned.
3. **Nothing was witnessed at Node 26.** Local Node is 22.22.2, so both
   floor-gated doctor skips, CR-513's exit-code consequence, and the
   absolute exit code of `tiphys doctor` in a healthy fleet remain CI's to
   confirm. My criteria-10/11 evidence is "the codes are unchanged between
   the two runs", which is what the criterion asks, not the absolute
   value.
4. **CI on this head was not observed.** `gh` is absent locally and I did
   not query GitHub. Merge remains conditional on CI green at 1bdfce5,
   which this review cannot supply.
5. **I did not attack `src/pool.ts`, `src/lock.ts` or `src/spawn.ts` in
   depth.** They are out of this phase's diff. I noted that
   `src/pool.ts:171` and `src/lock.ts:143` have the same unprobed-read
   shape, and that `existsSync` + `readFileSync` on the lock path in
   `src/commands/doctor.ts:206` did NOT hang when I planted a FIFO at
   `state/session.lock` (doctor still printed eight `CHECK` lines), which
   I did not chase to a root cause because it is M1-P3 territory. Someone
   should look at those two files during M2.
6. **I ran as uid 0**, like the suite, so no permission-bit behavior was
   exercised anywhere in this review.

## Worktree state at the end of this review

`git status --porcelain` in `.../scratchpad/cr-p5-a` reports only this
untracked file. All three sabotaged sources were restored from byte copies
taken before mutation and verified identical. `dist/` was removed after
the last build. Nothing was committed; nothing was pushed; nothing under
`/home/user/tiphys-ai-helmsman` was written.
