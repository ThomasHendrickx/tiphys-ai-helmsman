# Work history: the watcher test flake (standalone fix round)

Branch: `claude/watcher-flake-fix`, cut from `origin/main` at 9781212.
The scope auditor derives a phase id from any branch matching the phase
pattern, so this branch deliberately does not match it (CLAUDE.md:512).

`origin/main` advanced to 7784c47 while this round ran. Both measurement
arms were pinned to 9781212 so that the only difference between them was
this change; merging the newer main is left to the orchestrator.

## What was wrong

`test/watcher.test.ts` fails intermittently, and the `suite` gate is
REQUIRED, so a required gate is nondeterministic.

Two attributions arrived with the brief. CPU contention was already
REFUTED by a verifier (reproduced at load average 0.27, and in an isolated
single-file run). This round did not reopen that, and its own evidence
agrees with the refutation: the failure it reproduced is a budget that is
too small whatever the load, and load only decides how often the budget is
exceeded.

## The MECHANISM

Not "this assertion's budget is too tight". The mechanism is:

**An assertion whose outcome turns on a REAL-CLOCK BUDGET written in the
test source, where the budget must also contain costs the test never
measures: the spawn and module load of a child CLI, the watcher's own poll
granularity, and whatever else the machine is doing. The budget is chosen
against the SCHEDULED durations only, so the unmeasured remainder is
whatever is left over, and nothing in the test says how much that is.**

The failure is invisible in the ordinary way: the assertion is about the
watcher's behavior, the number in the source is about the clock, and the
two are only connected by an unwritten assumption that the child costs
nothing. When the remainder goes negative, the assertion reddens with no
behavior having changed.

Three shapes of it are present in this file, and they are the three sites
this round changed:

1. A SAMPLING WINDOW opened before the child is spawned, which must then
   contain N events produced by that child.
2. A SLEEP that must contain a tick, standing in for a fact the fleet
   records on disk.
3. An INTERVAL that a later spawn must still be inside, where the spawn is
   the only thing in the gap.

## Evidence that this is the mechanism, not a story about it

The measurement that settles it is the SLACK: how many milliseconds the
assertion had left over, taken on every trial, rather than only whether a
trial happened to land red. Instrument: WF-slack.mjs (kept in the round's
scratch directory, not committed; it is measurement, not a deliverable).

For the site that actually reddened, 48 trials of each form, run in
alternating blocks of 12 so that load drift hits both equally:

| quantity | OLD form | NEW form |
|---|---|---|
| spawn to arming beacon, ms | min 189, p50 224, p90 338, **max 2135** | min 191, p50 217, p90 253, max 525 |
| third heartbeat, ms after arming | p50 3502 | p50 2102 |
| **SLACK ms left in the window** | min **-1501**, p10 361, p50 477, max 510 | min **1894**, p50 1898, max 1906 |
| trials with slack at or below 0 | **2 of 48** | **0 of 48** |
| trials within 300ms of red | **3 of 48** | **0 of 48** |

Read the first and third rows together. The OLD window is opened before
the spawn, so the arming cost is spent out of the events' budget: the
slack is the window minus the arming cost minus the schedule, and the
arming cost ranges over 1946ms between its minimum and its maximum. That
single term is the whole of the variance, and it is why the OLD slack
distribution reaches -1501ms while its median is a comfortable-looking
477ms. The NEW window starts at the beacon the watcher itself wrote, so
the arming cost is not in the budget at all, and the slack distribution
collapses to a 12ms spread around 1898ms.

This is the mechanism stated as a measurement: **the variance of the old
budget is the unmeasured child startup, and removing that term from the
budget removes the variance.**

## The derivation

The mechanism is "a real-clock budget an assertion's outcome turns on", so
the derivation enumerates EVERY literal duration in the tracked test tree
that bounds, schedules or times something a test then asserts on, plus the
same in the shipped sources and in the scripts, for scope. The command,
verbatim, is scripts/../WF-derive.sh in the scratch directory; its body is
these eight `git grep` invocations, run from the worktree root:

```
git grep -nE '\bsleep\(\s*[0-9_]+' -- 'test/*.ts'
git grep -nE 'Date\.now\(\)\s*[-+]\s*[0-9_]+' -- 'test/*.ts'
git grep -nE '(waitForExit|waitForBeacon|waitForFile|waitFor[A-Za-z]*)\([^)]*[0-9_]{3,}' -- 'test/*.ts'
git grep -nE '"--(interval|poll|backoff-cap|deadline|max-heartbeats)"' -- 'test/*.ts'
git grep -nE 'timeout:\s*[A-Za-z0-9_]+' -- 'test/*.ts'
git grep -nE 'TIPHYS_(WATCH|BEACON|STALE)[A-Z_]*' -- 'test/*.ts'
git grep -nE '_MS\s*=\s*[0-9_]+' -- 'src/*.ts' 'src/**/*.ts'
git grep -nE 'sleep [0-9]+|timeout[ -][0-9]+|timeout-minutes' -- 'scripts/*' '.github/*'
```

FULL OUTPUT, not a summary. It was taken from the working tree WITH this
round's change applied, so every line number below resolves in the
committed state.

```
=== git rev ===
9781212241f84d7c0a18eaae3aedd69956cfb401

=== A. real-clock SLEEPS in tests (sleep(...) / setTimeout literals) ===
test/lock.test.ts:167:    await sleep(25);
test/lock.test.ts:175:    await sleep(10);
test/lock.test.ts:804:    await sleep(2);
test/watcher.test.ts:191:          await sleep(20);
test/watcher.test.ts:194:        await sleep(10);
test/watcher.test.ts:352:    await sleep(10);
test/watcher.test.ts:367:    await sleep(10);
test/watcher.test.ts:378:    await sleep(10);
test/watcher.test.ts:429:    await sleep(10);
test/watcher.test.ts:438:    await sleep(20);
test/watcher.test.ts:999:    await sleep(50);

=== B. real-clock DEADLINE arithmetic in tests (Date.now() + literal) ===
test/gates.test.ts:1983:    const deadline = Date.now() + 10_000;
test/liveness.test.ts:446:        writtenAt: new Date(Date.now() + 86_400_000).toISOString(),
test/liveness.test.ts:485:        writtenAt: new Date(Date.now() + 1000).toISOString(),
test/liveness.test.ts:649:        writtenAt: new Date(Date.now() - 13_000).toISOString(),
test/liveness.test.ts:697:        writtenAt: new Date(Date.now() - 902_000).toISOString(),
test/lock.test.ts:759:    const deadline = Date.now() + 25000;
test/watcher.test.ts:418:  const armDeadline = Date.now() + 30_000;
test/watcher.test.ts:432:  const deadline = Date.now() + 4000;
test/watcher.test.ts:641:  const stagedAt = new Date(Date.now() - 300_000).toISOString();
test/watcher.test.ts:871:        launchedAt: new Date(Date.now() - 120_000).toISOString(),
test/watcher.test.ts:872:        deadline: new Date(Date.now() - 60_000).toISOString(),
test/watcher.test.ts:891:        deadline: new Date(Date.now() + 600_000).toISOString(),
test/watcher.test.ts:908:        launchedAt: new Date(Date.now() - 120_000).toISOString(),
test/watcher.test.ts:909:        deadline: new Date(Date.now() - 60_000).toISOString(),
test/watcher.test.ts:1219:  const snapshot = { lastHeartbeatAt: new Date(Date.now() - 60_000).toISOString(), backoffStreak: 5 };

=== C. bounded WAIT helpers called with a literal budget ===
test/lock.test.ts:171:async function waitForFile(path: string, boundMs = 15_000): Promise<void> {
test/watcher.test.ts:506:  await waitForBeacon(fleet, 30_000);
test/watcher.test.ts:509:  const code = await watcher.waitForExit(30_000);
test/watcher.test.ts:530:  const ticked = await waitForCadenceStreak(fleet, 3, 30_000, idle);
test/watcher.test.ts:538:  await idle.waitForExit(20_000);
test/watcher.test.ts:560:  const continuedCode = await continued.waitForExit(30_000);
test/watcher.test.ts:587:  const code = await bounded.waitForExit(30_000);
test/watcher.test.ts:706:  await waitForFile(`${barrier}.observed`, 10_000);
test/watcher.test.ts:713:  const heldCode = await held.waitForExit(10_000);
test/watcher.test.ts:756:    await waitForBeacon(fleet, 30_000);
test/watcher.test.ts:760:    let residentCode = await watcher.waitForExit(3000);
test/watcher.test.ts:768:      residentCode = await watcher.waitForExit(30_000);
test/watcher.test.ts:973:  await waitForFile(marker, 30_000);
test/watcher.test.ts:979:  await spawning.waitForExit(10_000);
test/watcher.test.ts:1169:  const residentCode = await resident.waitForExit(20_000);
test/watcher.test.ts:1484:    await waitForFile(`${barrierA}.observed`, 15_000);
test/watcher.test.ts:1485:    await waitForFile(`${barrierB}.observed`, 15_000);
test/watcher.test.ts:1491:    const firstCode = await first.waitForExit(20_000);
test/watcher.test.ts:1492:    const secondCode = await second.waitForExit(20_000);

=== D. cadence FLAGS handed to a spawned CLI (--interval/--poll/--backoff-cap/--deadline) ===
test/spawn.test.ts:417:  assert.equal(spawnCli(scratch, "t-dl", stub, ["--deadline", "300"]).status, 0);
test/spawn.test.ts:643:    const result = spawnCli(scratch, "t-deadline", stub, ["--deadline", bad]);
test/spawn.test.ts:651:  assert.equal(spawnCli(scratch, "t-deadline", stub, ["--deadline", "300"]).status, 0);
test/watcher.test.ts:413:    ["watch", "--interval", "0.3", "--poll", "0.1", "--backoff-cap", "10"],
test/watcher.test.ts:503:    ["watch", "--interval", "30", "--poll", "0.1", "--backoff-cap", "60"],
test/watcher.test.ts:527:    ["watch", "--interval", "0.4", "--poll", "0.1", "--backoff-cap", "10"],
test/watcher.test.ts:549:      "--interval",
test/watcher.test.ts:551:      "--poll",
test/watcher.test.ts:553:      "--backoff-cap",
test/watcher.test.ts:555:      "--max-heartbeats",
test/watcher.test.ts:576:      "--interval",
test/watcher.test.ts:578:      "--poll",
test/watcher.test.ts:580:      "--backoff-cap",
test/watcher.test.ts:582:      "--max-heartbeats",
test/watcher.test.ts:634:  const init = runCli(["watch", "--once", "--interval", "30"], { cwd: fleet });
test/watcher.test.ts:647:  const due = runCli(["watch", "--once", "--interval", "30"], { cwd: fleet });
test/watcher.test.ts:651:  const immediate = runCli(["watch", "--once", "--interval", "30"], { cwd: fleet });
test/watcher.test.ts:753:      ["watch", "--interval", "30", "--poll", "0.05", "--backoff-cap", "60"],
test/watcher.test.ts:968:      "--deadline",
test/watcher.test.ts:1107:    ["--backoff-cap", "--interval", "--max-heartbeats", "--once", "--poll"],
test/watcher.test.ts:1166:  const resident = startCli(t, ["watch", "--interval", "30", "--poll", "0.1"], {
test/watcher.test.ts:1241:  const bothModes = runCli(["watch", "--once", "--max-heartbeats", "2"], { cwd: fleet });
test/watcher.test.ts:1244:  const badInterval = runCli(["watch", "--once", "--interval", "0"], { cwd: fleet });
test/watcher.test.ts:1249:  const badCadence = runCli(["watch", "--once", "--backoff-cap", "36000"], { cwd: fleet });

=== E. child-process TIMEOUT options in tests ===
test/brief-compose.test.ts:54:    timeout: BOUNDED_MS,
test/citation-gate.test.ts:219:    timeout: 15_000,
test/deploy-gate.test.ts:514:test("deploy gate ignores a head declaration flipped to none and records the merge-base blob", { timeout: 20000 }, () => {
test/deploy-gate.test.ts:684:test("a fabricated declaration in a scratch copy makes both entries applicable and red", { timeout: 30000 }, () => {
test/deploy-gate.test.ts:779:test("migrations gate is green end to end with units equal to migrations compared", { timeout: 20000 }, () => {
test/liveness.test.ts:97:      : { timeout: opts.timeoutMs, killSignal: "SIGKILL" as const }),
test/liveness.test.ts:790:    { encoding: "utf8", env: baseEnv(), timeout: BLOCK_PROBE_TIMEOUT_MS, killSignal: "SIGKILL" },
test/liveness.test.ts:944:      { encoding: "utf8", env: baseEnv(), timeout: BLOCK_PROBE_TIMEOUT_MS, killSignal: "SIGKILL" },
test/migration-gate.test.ts:372:test("migrations adapter reports error naming a named pipe in the migrations directory", { timeout: 15000 }, async () => {
test/release-contract.test.ts:433:test("release hanging adapter attempt is error while the kernel returns", { timeout: 15000 }, async () => {
test/release-contract.test.ts:477:test("release adapter leaving a named pipe at the record path is error not a hang", { timeout: 15000 }, async () => {
test/release-contract.test.ts:493:  { timeout: 15000 },
test/suite-gate.test.ts:175:    timeout: 120000,
test/validate.test.ts:557:      { encoding: "utf8", timeout: 20_000 },
test/validate.test.ts:574:      { encoding: "utf8", timeout: 20_000 },
test/validate.test.ts:584:      { encoding: "utf8", timeout: 20_000 },
test/validate.test.ts:596:      { encoding: "utf8", timeout: 20_000 },
test/watcher.test.ts:1281:    timeout: BLOCK_PROBE_TIMEOUT_MS,

=== F. env-var cadence overrides in tests ===
test/liveness.test.ts:348:        TIPHYS_WATCH_BACKOFF_CAP_SECONDS: "900",
test/liveness.test.ts:349:        TIPHYS_WATCH_POLL_SECONDS: "15",
test/liveness.test.ts:350:        TIPHYS_WATCH_STALE_SECONDS: "915",
test/liveness.test.ts:370:        TIPHYS_WATCH_BACKOFF_CAP_SECONDS: "900",
test/liveness.test.ts:371:        TIPHYS_WATCH_POLL_SECONDS: "15",
test/liveness.test.ts:372:        TIPHYS_WATCH_STALE_SECONDS: "916",
test/liveness.test.ts:534:  // whose TIPHYS_WATCH_* value is a typo: falling back to the default
test/liveness.test.ts:543:      env: { ...baseEnv(), TIPHYS_WATCH_STALE_SECONDS: "twenty" },
test/liveness.test.ts:547:  assert.match(load.stderr ?? "", /TIPHYS_WATCH_STALE_SECONDS="twenty"/);
test/liveness.test.ts:658:    TIPHYS_WATCH_BACKOFF_CAP_SECONDS: "10",
test/liveness.test.ts:659:    TIPHYS_WATCH_POLL_SECONDS: "1",
test/liveness.test.ts:660:    TIPHYS_WATCH_STALE_SECONDS: "12",
test/watcher.test.ts:122:  delete env.TIPHYS_WATCH_TEST_HOLD;
test/watcher.test.ts:704:    env: { ...baseEnv(), TIPHYS_WATCH_TEST_HOLD: barrier },
test/watcher.test.ts:1478:      env: { ...baseEnv(), TIPHYS_WATCH_TEST_HOLD: barrierA },
test/watcher.test.ts:1482:      env: { ...baseEnv(), TIPHYS_WATCH_TEST_HOLD: barrierB },

=== G. real-clock budgets in the SHIPPED sources (for scope) ===
src/commands/lock.ts:57:const HOLD_WAIT_LIMIT_MS = 30_000;
src/gates/citations.ts:661:const GIT_TIMEOUT_MS = 30_000;
src/gates/coverage.ts:235:export const REGEX_EXEC_TIMEOUT_MS = 250;
src/liveness.ts:276:export const BEACON_FUTURE_TOLERANCE_MS = 5000;
src/lock.ts:78:const MUTEX_WAIT_TOTAL_MS = 5000;
src/lock.ts:79:const MUTEX_WAIT_POLL_MS = 10;
src/pool.ts:498:export const STALE_LOCK_AGE_MS = 300_000;
src/watcher.ts:600:const CLAIM_WAIT_TOTAL_MS = 5000;
src/watcher.ts:601:const CLAIM_WAIT_POLL_MS = 5;
src/watcher.ts:614:const HOLD_WAIT_LIMIT_MS = 30_000;
src/witness/run.ts:795:const TEST_RUN_TIMEOUT_MS = 120_000;

=== H. real-clock budgets in scripts/ and .github/ (outside this round's scope) ===
scripts/m1-exit-test.sh:632:    sleep 1
scripts/m1-exit-test.sh:761:    sleep 1
scripts/m1-exit-test.sh:764:  ( sleep 30; kill "${watch_pid}" 2>/dev/null || true ) &
```

### Classifying that output

Not every literal duration is an instance. The distinguishing question is
whether an assertion's OUTCOME turns on the number. Three classes:

**Instances of the mechanism, all in this round's scope, all changed.**

- test/watcher.test.ts:432 the sampling window. Was 4200ms opened before
  the spawn and needing 4 beacon writes; the site that reddened.
- test/watcher.test.ts:530 was a flat `sleep(3000)` that had to contain a
  tick before an ordinal assertion could hold.
- test/watcher.test.ts:641 was `sleep(500)` plus a 400ms base interval,
  making a later pass's not-due outcome depend on an 800ms window that
  contained a CLI exit and a CLI spawn.
- test/watcher.test.ts:760 a 3000ms exit wait whose expiry silently
  changes the assertion's INPUT from "the resident surfaced" to "", which
  would then be reported as a dropped wake. Narrowed rather than widened,
  because widening it unconditionally costs five rounds of dead time.

**Bounded waits for an observed fact, which are the CORRECT shape and are
not instances.** The bound is an upper bound on a hang and no assertion
turns on its value: test/watcher.test.ts:506, :509, :538, :560, :587,
:706, :713, :756, :973, :979, :1169, :1484, :1485, :1491, :1492, and
test/lock.test.ts:171. Four of these were nonetheless raised from 5000 and
8000 to 30_000 in this round, because a bound that is 50x the expected
cost and a bound that is 300x cost the same when nothing is wrong, and the
larger one leaves far more room before a growing cost could reach it. I
did not establish an upper bound on that cost, so this is headroom, not
immunity.

**Staged time, which is the remedy rather than the mechanism.** A
timestamp written into a file in the past or the future so that no waiting
is needed: test/watcher.test.ts:641, :871, :872, :891, :908, :909, :1219,
and test/liveness.test.ts:446, :485, :649, :697. Section D's other rows
are cadence flags whose values feed staged or waited-for facts rather than
budgets.

**Deliberate hang bounds, a different shape.** test/watcher.test.ts:1281
and the liveness and release-contract rows in section E exist so that a
regression fails NAMING the path it blocked on instead of as an
unexplained CI timeout (CR-520). The timeout there is the thing under
test, not an unstated assumption.

**Section G, the shipped sources.** None of the eleven is an instance:
they are the kernel's own waits and are asserted against by staging, not
by racing. src/watcher.ts:600 is the claim wait the stranded-claim test
exercises, and that test stages the debris rather than timing anything.

**Section H and the sibling test files are ENUMERATED AND NOT EDITED**, per
this round's scope. See the next section.

## What the derivation did NOT cover

Read this first.

1. **It did not cover sibling test files, by scope.** The round's scope is
   `test/watcher.test.ts` and, if the mechanism lived there, `src/watcher/`.
   The mechanism did NOT live in the shipped sources: every one of these
   defects is in the test's own arithmetic and the watcher behaved
   correctly throughout. So no source file was touched. The enumeration
   found candidate rows in test/lock.test.ts:759 (a 25000ms deadline) and
   test/gates.test.ts:1983 (a 10_000ms deadline) that I did NOT open and
   therefore cannot classify. They are reported, not fixed.
2. **It did not cover `scripts/` or `.github/`.** Section H shows three
   rows in scripts/m1-exit-test.sh, including a 30-second background kill
   of a resident watcher at scripts/m1-exit-test.sh:764, which is the same
   shape as the sites fixed here. Out of scope and unexamined.
3. **The greps are lexical and will miss a budget that is not a literal.**
   A duration assembled at run time, read from an env var, or hidden
   behind a named constant declared outside the matched patterns does not
   appear. Section E's `BOUNDED_MS` and `BLOCK_PROBE_TIMEOUT_MS` rows only
   appear because the pattern also matched identifiers; a budget written
   as, say, `base * 3` would not. I did not enumerate that class and do
   not claim it is empty.
4. **It did not cover the node test runner's own per-test timeout**, which
   is a budget of exactly this kind imposed from outside the file. No test
   in `test/watcher.test.ts` sets one, so the default applies, and I did
   not establish what happens to these tests if a `--test-timeout` is ever
   configured.
5. **The slack instrument covers ONE of the three sites.** It measures the
   sampling-window site because that is the one that reddened and the one
   whose budget is continuous. The other two sites' remedies are argued
   from their construction (a wait for a fact has no budget to exceed; a
   60-second margin against a 51ms spawn is 1200x) and witnessed by
   mutants, not by a slack distribution. I did not build a slack
   instrument for them.
6. **Everything here is one machine, one container, one filesystem.** The
   spawn cost, and therefore every margin, is a property of this box. I
   did not measure the CI runner, and the arming cost that dominates the
   old budget is exactly the quantity most likely to differ there.

## The three sites, and what changed

### Site A, the sampling window (the one that reddened)

test/watcher.test.ts:383. The window was `Date.now() + 4200` set before
`startCli` returned, and it had to contain four beacon writes, the last
falling due 3500ms into the watcher's own life. That leaves 700ms for the
spawn, the module load, the startup evaluation and three poll-granularity
delays. Measured arming cost on this box: p50 224ms, max 2135ms.

Now: the window opens at the arming beacon the watcher itself wrote, and
the cadence is asserted against the schedule each beacon DECLARES rather
than against a ratio chosen in the test. Each beacon carries
`backoffStreak` and `intervalMs`, so the test compares an observed gap
with the interval the previous beacon committed to. A heartbeat is noticed
at the loop's next poll, so it is late or exactly on time, and while the
loop's own condition is `now() >= dueMs` at src/watcher.ts:1024 it is not
early: `gap >= the declared interval` is EXACT in the only direction that
can then be violated. That is a stronger statement than the old ratio, and it is why
the new form needs no tolerance at all.

The old ratio was `current >= previous * 1.5` over raw gaps. Its margin was
thinnest on the FIRST heartbeat, where one poll interval of lateness is a
fifth of the interval being measured, and the first gap was not even a
scheduled interval: it ran from the arming beacon, which is written a
moment AFTER the cadence is initialised, so it was systematically shorter
than the base interval by an unmeasured amount.

Measured, over 48 trials: the smallest observed (gap minus declared
interval) was 0ms, reached in practice, which is why the bound is `>=` and
not `>`. It cannot go below zero while the loop's own test is
`now() >= dueMs` at src/watcher.ts:1024 and the beacon stamp equals the
`lastHeartbeatAt` written in the same tick.

Base interval moved 0.5s to 0.3s so the whole test still costs about what
it did: three heartbeats now fall due 300ms, 900ms and 2100ms after
arming, inside a 4000ms window.

### Site B, the sleep that had to contain a tick

test/watcher.test.ts:515. The old form slept a flat 3000ms and then
required the next run's heartbeat ordinal to match `/^heartbeat
([2-9]|\d\d+)\n$/`, which is only true if the idle run ticked at least
once. Now it WAITS for the fact: the fleet's own cadence file is polled
until it records three heartbeats, bounded at 30s, and the bound is not
what any assertion turns on.

Two things got stronger rather than weaker. The old form never asserted
that any heartbeat had happened at all, and the new one does. And the
continued run's ordinal is now asserted EXACTLY, against the streak read
off the fleet after the previous watcher is confirmed dead, instead of as
"some number greater than one". Confirming the death also removes a real
race: `stop()` returning is not the process having exited, and two
watchers on one fleet would have made the ordinal nondeterministic.

### Site C, the interval a later spawn had to be inside

test/watcher.test.ts:608. This is the site the brief singled out as most
informative. The old form slept 500ms past a 400ms base interval, took a
heartbeat, and then required the NEXT pass to still be inside the doubled
800ms interval. The only thing in that gap is the first pass exiting and
the second pass starting, and nothing measured it. Observed as
`actual: 0`, meaning more than 800ms had passed.

Now there is no real-clock wait at all. The elapsed time is STAGED on disk
by writing `lastHeartbeatAt` five minutes into the past, which exercises
the same comparison, and the base interval is 30 seconds, so the not-due
pass carries about sixty seconds of margin against a 51ms spawn.

Widening a budget also widens the defect's escape route, so the property
the not-due pass was standing in for is now asserted DIRECTLY as well: the
heartbeat moved `lastHeartbeatAt` off the staged timestamp, checked with a
240-second margin. A heartbeat that left the schedule where it found it
reddens there and reddens the not-due pass too, which is exactly what the
MC1 mutant below shows.

### Site D, the exit wait whose expiry changes the assertion's input

test/watcher.test.ts:760, inside the resident-versus-once race. If the
3000ms wait expires, `watcher.stdout()` reads "" and the test would report
a DROPPED wake that did not happen. The budget is only load-bearing when
`--once` ceded, because then the resident is the only channel left, so the
wait is now extended to 30_000ms in exactly that case. When `--once` won,
the resident finds the wake already suppressed in the seen state, so it
does not surface and does not exit on its own, and the short budget is
what keeps the test's five rounds cheap. That is the arm the 3000ms wait
is expected to time out on.

## Rates: baseline and post-fix

### Serial arm, before the fix

30 isolated single-file runs, `node --test test/watcher.test.ts`, node
v26.6.0, `dist/` built, one at a time. **1 RED in 30 (3.3%).** Per-run
1-minute load averages, in order:

```
0.90 1.55 1.48 2.13 2.87 3.21 2.76 1.86 2.23 1.62 1.83 3.95 6.24 6.12
6.67 6.35 6.84 6.96 5.87 3.81 2.91 1.88 1.65 6.02 5.96 11.81 12.62 9.45
7.60 5.48
```

The red was run 17, at load 6.84. Captured verbatim (see the
TRANSLITERATION note at the end; the line numbers in this capture are the
PRE-fix ones):

```
x failing tests:

test at test/watcher.test.ts:269:1
x a resident watcher keeps running and backs off with growing beacon gaps (6518.0123ms)
  AssertionError [ERR_ASSERTION]: expected at least 4 beacon writes, saw 3
      at TestContext.<anonymous> (.../WF-head/test/watcher.test.ts:293:10)
```

That is the predicted failure of the sampling window, not a new one.

### Paired arm, both forms at once

The box load drifted between 0.23 and 24.35 during this round, driven by
another implementer's concurrent full suites. A rate is a timing
measurement, so a baseline batch at load 9 and a fixed batch at load 1 are
not comparable, and a fix that changed nothing could look like a fix that
worked. So the A/B arm is PAIRED: each batch starts two copies of the
baseline tree and two of the fixed tree AT THE SAME INSTANT and waits for
all four, so both arms see the identical load in the identical window. It
is also the condition the `suite` gate runs under, since `node --test`
runs test files in parallel, four at a time on this 4-core box.

16 batches: **32 baseline runs, 0 red. 32 fixed runs, 0 red.** Per-batch
1-minute load averages before each batch:

```
1.69 12.22 13.55 12.03 8.17 8.14 7.98 9.31 8.12 10.50 8.04 7.44 8.88
9.58 12.48 14.18
```

### Provenance of the fixed arm, stated because it is not exact

The 32 paired fixed runs were taken against the fixed file BEFORE its last
change, the liveness arm that MB1 prompted (see the mutant section). That
change adds a fail-fast branch inside a bounded wait and alters no budget,
but the runs are not runs of the committed bytes, so they are not offered
as such. Against the committed bytes: 8 further isolated runs, all green,
at 1-minute load averages 3.42 1.99 1.61 2.30 1.48 1.14 1.12 1.80, and the
full `npm test` reported below is also a run of the committed bytes.

Eight runs establish even less than thirty-two. They are reported for
provenance, not as a rate.

### What those numbers do and do not support

Combined baseline: **1 red in 62 runs, 1.6%.** That is the rate on this
box, and it is far below the "roughly one in five" the brief carried.

**THE POST-FIX N IS TOO SMALL TO DETECT THE BASELINE RATE, and I am not
calling the flake fixed on the strength of it.** At 1.6%, 32 runs have an
expected count of 0.5 failures, so observing 0 is what a completely
unchanged test would most likely have produced too. The 32-run fixed arm
is worth reporting and is worth nothing on its own.

The claim I do make rests on the slack distribution instead, and it is a
different kind of claim: over 48 trials of each form, 2 of the old form's
trials had a budget remainder at or below zero and none of the new form's
did, and the new form's worst trial finished with 1894ms to spare against
a distribution whose entire spread is 12ms. A rate says how often a coin
landed; the slack says how far the coin was from the edge, on every toss.

## Red-witness: mutants, and the coverage question

The red-witness rule's stronger form asks for red against the DANGEROUS
STATE, not against an absent feature. For a flake the trap is obvious: a
test made green by asserting less is invisible to every gate. So every
mutant below was run against BOTH the old test file and the new one, from
the same pristine `src/watcher.ts`, with `--test-name-pattern` PRECEDING
the positional path (CLAUDE.md:625).

| mutant of src/watcher.ts | OLD form | NEW form |
|---|---|---|
| MA1 `intervalMsFor` stops doubling | RED | RED |
| MA2 resident ticks every poll, ignoring the due time | RED | RED |
| MB1 unbounded resident returns on every heartbeat | RED | RED |
| MB2 `heartbeatTick` reports the ordinal as 1 always | RED | RED |
| MC1 heartbeat does not advance `lastHeartbeatAt` | RED | RED |
| MC2 `readCadenceState` always returns undefined | RED | RED |
| CONTROL, pristine source, 3 tests x 2 forms | green x6 | green x6 |

The verdicts are exit codes and failure counts from the captures. The
messages, which are what show the RIGHT assertion fired:

```
MA1 / OLD  beacon gaps are not doubling: 499,501,501,501,502,501,502
MA1 / NEW  heartbeat 1 declared 300ms, which is not the doubled interval for that streak
MA2 / OLD  beacon gaps are not doubling: 103,103,103,103,102,102,103,102,...
MA2 / NEW  heartbeat 2 arrived 103ms after the one before it, EARLIER than the 600ms that one declared
MB1 / OLD  watcher exited:
MB1 / NEW  the watcher exited (code 0) after 1 heartbeats instead of staying silent through 3: stdout "heartbeat 1\n"
MB2 / OLD  the heartbeat ordinal restarted instead of continuing the fleet's schedule
MB2 / NEW  the heartbeat ordinal restarted instead of continuing the fleet's schedule
MC1 / OLD  Expected values to be strictly equal
MC1 / NEW  Expected values to be strictly equal
MC2 / OLD  Expected values to be strictly equal
MC2 / NEW  Expected values to be strictly equal
```

MA1 and MA2 are two structurally different members of the class "the
backoff is not what it claims": one breaks the DECLARED schedule and the
other breaks the OBSERVED one, and they redden different assertions in the
new form. One witness is not a class.

MB1's first version of the new form reddened only through the bounded
wait, with the message "the fleet's backoff streak was 1 and never reached
3 within 30000ms". True, and it names the symptom rather than the defect,
so the wait now also fails fast when the child it is waiting on has
exited; the message above is the result. That is the only change this
round made in response to a mutant.

## Coverage traded away

Stated plainly, in one place, because this is the failure mode the round
was warned about.

1. **Site A no longer asserts that the first heartbeat's ordinal is 1.**
   The new form asserts the observed streaks are CONSECUTIVE among
   themselves rather than that they start at 1. The reason is that whether
   the sampler catches the arming beacon before the first heartbeat
   overwrites it is itself a race, and pinning the absolute value would
   have reintroduced exactly the mechanism this round removes. The
   property is not lost: the ordinal's absolute value is asserted
   deterministically at test/watcher.test.ts:649, where a staged fleet
   must print "heartbeat 1", and at test/watcher.test.ts:567, where the
   continued run's ordinal is now checked exactly. MB2 reddens on both.
2. **Site A no longer measures the arming-to-first-heartbeat gap.** The
   old form included it in the gap series. It was never a scheduled
   interval and was systematically short by the time between the cadence
   being initialised and the beacon being written, which is why it was the
   fragile term. What replaces it is the count assertion, which bounds the
   total latency from arming to the third heartbeat at 4000ms.
3. **Site C no longer proves a heartbeat becomes due through real elapsed
   time in a single pass.** It stages the elapsed time on disk instead.
   The comparison exercised is identical, and real elapsed time is still
   exercised at the suite level by site A, where a resident watcher's
   heartbeats are genuinely waited for. This is the trade I would defend
   least comfortably of the three, so it is named rather than buried.

Nothing else was weakened. Sites B and D are strictly stronger than what
they replaced.

## Scope

Changed: test/watcher.test.ts:1 and this work history. No source file was
touched, because the mechanism is not in the sources: the watcher behaved
correctly in every run, including the red ones. `test/behaviors.json` was
NOT changed and needs no change, since no test was renamed and no new
behavior added; the four registry entries that name these tests still
resolve by name.

C-2 was never in play. Nothing added here asks the operating system about
a running program for identity or exclusion. The one liveness question the
new code asks is whether a CHILD THIS TEST OWNS has exited, read from the
child handle the test already holds at test/watcher.test.ts:344, which is
what the pre-existing assertion at test/watcher.test.ts:441 already did.

## Gates and the suite sentence

Toolchain node v26.6.0 (the floor-satisfying toolchain fetched to a
scratch prefix, not the container default v22), `dist/` BUILT, invocation
`npm test`, from the worktree root:

```
i tests 596
i suites 0
i pass 596
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 249138.832419
```

**596 tests, 596 pass, 0 FAILED, 0 SKIPPED, exit 0.** That matches the
figure the brief gives for this head and invocation. `npm run build` exits
0 and `git status` afterwards shows only the two intended paths.

Registry gates, `tiphys gates run --registry gate-registry.yaml --mode full`
with base at the merge base 9781212 and head at this commit: 12 declared,
6 applicable, **6 green, 0 red**, 5 not-applicable, 1 error. The error is
`scope`, which "requires --phase, which was not supplied": this is a
non-phase branch by design, so it has no phase declaration to audit
against (CLAUDE.md:512). `citations` is not-applicable because its
precondition lists delivery/plan/, delivery/verification/,
delivery/decisions/, delivery/tuition/, delivery/requirements/ and
delivery/STATE.md, and delivery/work-history/ is not among them; the
citations in this document were therefore checked by hand against the
worktree rather than by the gate. `red-witness` is not-applicable because
no path under src/ or bin/ changed. The `suite` gate itself reports 596
tests from 36 files, 0 failed, 0 skipped, and 600 behaviors resolving by
name, which is the check that `test/behaviors.json` still lines up.

TRANSLITERATION, declared per CLAUDE.md:87. Node's test reporter prints
two non-ASCII glyphs and this repository's authored bytes must be pure
ASCII. In the captures quoted above, U+2139 (information source) was
replaced with `i`, 8 occurrences, and U+2716 (heavy multiplication x) was
replaced with `x`, 2 occurrences. Nothing else in any captured output was
altered: the counts, the durations, the assertion text and the paths are
verbatim.

## The claim grep

Run over this file per CLAUDE.md:329. Every surviving hit is either a
sentence with its settling command adjacent, or is written as a bounded
observation rather than an impossibility. Two are worth calling out
because they are the ones a reviewer should push on:

- "It cannot go below zero while the loop's own test is `now() >= dueMs`"
  in site A. That is an argument from the source at src/watcher.ts:1024,
  and the measurement that agrees with it is the 48-trial minimum of 0ms.
  It is an argument plus a measurement, not a proof, and a clock that
  steps backwards would break it. I did not test a backward clock step.
- "The mechanism did NOT live in the shipped sources." What I established
  is narrower: across 62 baseline runs and 48 slack trials the watcher's
  observed behavior matched its declared schedule every time, and the one
  red was an assertion about the test's own window. I did not audit
  src/watcher.ts for other defects and this round makes no claim about
  them.
