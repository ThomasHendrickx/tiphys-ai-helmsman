# Clean-room review: M1-P5 (watcher and liveness guard), second reviewer

Date: 2026-08-05
PR: 8
Head: de8c1bd
Branch: claude/m1-p5-watcher-liveness
Reviewer: Claude (Sonnet 5), independent second pass, no visibility into the
other reviewer's findings.

Method: read CLAUDE.md, the M1-P5 plan section (delivery/plan/kernel-plan-v1.md,
15 acceptance criteria) and delivery/work-history/m1-p5.md as claims to
verify; did not walk the criteria in order (that is the other reviewer's
job); instead started from ways the watcher or guard could fail silently
and worked outward, driving the real code with scratch fleets and hand-built
sabotage, per the assignment brief.

Isolation: worked only inside a private clone at
/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/p5-failure-sonnet,
cloned read-only from /home/user/tiphys-ai-helmsman at de8c1bd, `npm ci` run
inside the clone. All scratch fleets and repro scripts were written under
/tmp/claude-0/.../scratchpad/p5-repro, a directory this session created.
Nothing was written to /home/user/tiphys-ai-helmsman except this review file.
No commits were made in the clone; the one deliberate sabotage edit
(src/commands/teardown.ts) was reverted and diffed byte-identical against
the original before moving on (`git status --porcelain` and `git diff --stat`
both empty at the end of the session).

## VERDICT: FIX-ROUND-NEEDED

Two findings meet the bar for blocking. Both are silence, not crashes: the
watcher (or its guard) reports "nothing to see here" in a state where a
real, in-flight task's completion or existence is invisible to every
downstream consumer (spawn, teardown, doctor). One of the two directly
touches a claim in the work history that this document itself calls the
place most worth attacking (the surfaceWake claim design) and one exposes a
second, unrelated overstated claim ("which doctor reports anyway") that
conceals exactly the kind of defect this project has been bitten by twice
before.

## Findings

### Finding 1 (CRITICAL): a stranded seen-state claim file permanently and silently swallows every future turn-end wake in the fleet, with the beacon staying fresh throughout

Claim under test (work history, key decision 5 and the module doc at
src/watcher.ts:509-536): "A claim that cannot be taken within the bounded
wait is treated as 'someone else owns this wake': the pass reports no-wake
and leaves the seen state alone, so the wake is still pending for the next
pass." This framing assumes the obstruction is always transient (another
live pass currently inside the window). It is not: nothing in the codebase
ever removes a `state/watcher.seen.json.mutex` file that was left behind by
a pass that stopped between creating it (`writeFileSync(claimPath, "",
{flag: "wx"})`, src/watcher.ts:520) and removing it in the `finally` block
(src/watcher.ts:553-559). Once that file is stranded, every future pass,
resident or `--once`, times out on the same 5000ms bounded wait
(`CLAIM_WAIT_TOTAL_MS`, src/watcher.ts:463-464, checked at line 526) and
reports "no-wake" for the pending turn-end forever. This is a permanent
loss disguised as ordinary contention, not a duplicate-rather-than-drop
outcome as the design intends elsewhere.

The direct comparison the codebase itself invites: src/lock.ts's
`applyLeaseMutation` uses the identical O_EXCL claim-file pattern
(`<lock>.mutex`) and explicitly documents that a stranded claim "makes
later mutations fail LOUDLY after a bounded wait, naming the file for
manual removal" (src/lock.ts:44-47, and the returned `claimTimeout: true`
with a reason naming the mutex path at src/lock.ts:238-244). Watcher's
`claimSignal` copies the mechanism but drops the "fail loudly" half: its
timeout path (src/watcher.ts:525-533) returns a bare `false`, which
`surfaceWake` (src/watcher.ts:604-605) and `scanAndSurface`
(src/watcher.ts:696-699) both fold into the ordinary "nothing to surface"
path, indistinguishable from "no wake pending." No reason string, no stderr
line, no nonzero exit, and critically: the beacon is rewritten normally
right after (src/watcher.ts:752, `writeBeacon` called even when
`scanAndSurface` returns undefined), so the liveness guard sees a perfectly
fresh beacon the entire time. This is precisely the failure the phase
exists to prevent: a watcher that is technically alive and ticking, while
the one signal it exists to catch is dropped, and the guard that is
supposed to say "supervision is missing" has nothing to react to because,
by its own (correct) definition, supervision did not stop.

Failure scenario: a resident watcher process is killed (OOM, container
preemption, forced redeploy) in the narrow but real window inside
`claimSignal` between the claim create and its release; or, more
mundanely, an operator's disk is momentarily overloaded so the claim's own
`fsyncSync` (src/watcher.ts:457, inside `appendWakeRecord`) or the staged
rename takes long enough that the process dies of an unrelated cause before
reaching the `finally`. From that point forward, an already-completed task
(turn-end file genuinely present) is reported as "no wake" by every future
`--once` pass and never surfaces in a resident run either, while
`state/watcher.beacon` keeps advancing on schedule and `tiphys doctor`
prints `CHECK beacon PASS`. An operator who trusts "no watcher stale
warning" as "nothing needs attention" will never learn the task finished.

Evidence (captured, reproducible in the clone at the isolation path above,
scripts under .../scratchpad/p5-repro/repro1.mjs and repro2.mjs; not
committed anywhere):

```
$ node repro1.mjs
stranded mutex present: true
outcome: {"code":3,"line":""} elapsedMs: 5011
beacon exists: true
beacon: {
  "writtenAt": "2026-08-05T00:30:23.437Z",
  "backoffStreak": 0,
  "intervalMs": 60000
}
seen state: (absent)

$ node repro2.mjs          # second, independent pass against the SAME fleet
mutex still present: true
second pass outcome: {"code":3,"line":""} elapsedMs: 5008
turn-end still present: true
```

Two consecutive, independent `runOnce` passes both report exit code 3
(no-wake) against a fleet with a real, unconsumed `tasks/t1/turn-end` file,
because a single pre-planted stray `state/watcher.seen.json.mutex` file
(simulating one crashed prior claim) blocks every subsequent claim
indefinitely. Nothing distinguishes this from the healthy "nothing to
report" case anywhere in stdout, stderr, exit code, or the beacon.

No test in test/watcher.test.ts exercises a stranded (never-released) claim
file; `two passes racing on one turn-end surface it exactly once`
(test/watcher.test.ts:433) and the resident/once race
(test/watcher.test.ts:467) both stage or measure the transient case, where
the claim IS eventually released by its rightful owner. That is the
red-witness gap: the shipped tests are green against the dangerous state
because they never construct it.

Fix: give the claim file the same honesty lock.ts already has. Either (a)
have `claimSignal`'s timeout path return a distinguishable "stuck" result
that bubbles up as a nonzero exit / stderr reason line the way lock.ts's
`claimTimeout` does (this changes runOnce/runResident's contract enough to
need a plan note, since criterion 4/6/7 currently expect timeouts to look
like ordinary no-wake), or (b) make the claim file break-able the way
lock.ts's own module doc argues is the only sound alternative to steal
protocol: report it, do not silently absorb it. At minimum, doctor should
gain a check for a `state/*.mutex` file older than the claim's own bounded
wait, so an operator has a file-based (C-2-compliant) way to learn
supervision is stuck on exactly this kind of debris.

### Finding 2 (HIGH): the guard's and doctor's "corrupt meta.json is a bounded, reported cost" rationale is false as stated; a genuinely open, unsupervised task with a malformed meta.json is invisible to both, and the work history's own claim that doctor covers it does not hold

Claim under test (work history, key decision 9, verbatim): "a meta.json
that does not parse is not counted as an open task (C-1: a file with no
status carries no status, and inventing one would be worse than a missed
advisory, which doctor reports anyway)." The parenthetical "which doctor
reports anyway" is the load-bearing part of the argument: it is what makes
dropping the task from the guard's in-flight count an acceptable, bounded
cost rather than a second silent hole. It is not true. `src/commands/doctor.ts`
never reads `tasksDir`, never opens a task's `meta.json`, and its own
module doc says so directly: "this phase's checks read no task state"
(src/commands/doctor.ts:16-20). `grep -n "tasksDir\|tasks/" src/commands/doctor.ts`
returns only that doc-comment line; there is no per-task check anywhere in
the file's `checkNode`/`checkGit`/`checkGh`/`checkLayout`/`checkRemote`/
`checkLock`/`checkBeacon`/`checkIdentity` set.

Because both the guard (`countOpenTasks`, src/liveness.ts:227-242) and
doctor treat a task whose meta.json fails to parse as if it does not exist,
a task that is genuinely open and genuinely unsupervised, but whose
meta.json has been left truncated or malformed by an interrupted write,
produces `guard()` returning `{inFlight: 0, stale: false, detail: "no open
tasks: nothing is in flight to supervise"}` and a completely clean `tiphys
doctor` run with respect to that task. This is the T-002/R-079 incident
shape (open work, watcher quiet, nobody warns) except the guard's own
predicate manufactures the "nobody would even notice" half by construction,
and the module doc's justification for accepting that risk cites a
mitigation that is not implemented.

This is not a hypothetical: `src/task.ts`'s `writeTaskMeta`
(src/task.ts:97-99) writes `meta.json` with a bare `writeFileSync`, not the
stage-then-rename discipline `atomicWrite` in this phase's own watcher.ts
uses for its own state files. `setTaskStatus` (called by teardown at
src/teardown.ts:309) and spawn's initial write (src/spawn.ts:385) both go
through it. A crash mid-write of either call is exactly the mechanism that
produces a torn/invalid `meta.json` for a task that is, in fact, open (or
about to become closed). `src/task.ts` is out of this phase's
files-to-touch list and this finding does not fault the M1-P5 implementer
for that non-atomicity; it faults the claim, made inside this phase's own
work history and used to justify this phase's own design choice, that the
consequence is bounded by a doctor check that does not exist.

Failure scenario and evidence (captured, .../scratchpad/p5-repro, fleet2):

```
$ cat tasks/corrupt1/meta.json
{"id":"corrupt1","status":"open", "branch": "task/corrupt1"       # truncated, invalid JSON

$ node bin/tiphys.ts doctor
CHECK node FAIL v22.22.2 does not satisfy kernel engines ">=26"
CHECK git PASS git version 2.43.0
CHECK gh WARN gh not found on PATH, PR modes unavailable
CHECK layout PASS all layout entries present
CHECK remote WARN fleet home is not a git repository
CHECK lock PASS no lease present
CHECK beacon WARN watcher not running or not scheduled
CHECK identity PASS git commit identity configured (Claude <noreply@anthropic.com>)
exit code: 1        # (the FAIL is the Node floor, unrelated to corrupt1)

$ node -e '... guard(loadFleet("fleet2")) ...'
{
  "inFlight": 0,
  "stale": false,
  "detail": "no open tasks: nothing is in flight to supervise"
}
```

Nothing in doctor's eight checks names `corrupt1`, its meta.json, or any
task at all. The guard actively reports the fleet as having nothing to
supervise. An operator running `tiphys doctor` or relying on the "watcher
stale" advisory from spawn/teardown would see a clean bill of health while
a real task sits open and un-monitored.

No test in test/liveness.test.ts or test/doctor.test.ts constructs a
malformed-but-open meta.json and checks what the guard or doctor say about
it; the closest existing case (`closeTask` in test/liveness.test.ts:132-136)
only exercises a well-formed, legitimately closed task.

Fix: either implement the doctor check the work history claims exists (a
`CHECK task-meta WARN/FAIL <id> meta.json does not parse` line, file-based
and C-1-compliant, reading nothing but the same meta.json the guard
already reads), or correct the work history's rationale to state the true,
unmitigated cost and let the orchestrator decide whether that residual risk
is acceptable for M1. Silently shipping the false claim is the specific
failure mode CLAUDE.md's red-witness rule and this project's own tuition
log warn about: an unverified assertion of a safety net where none exists.

## Ruling on the declared scope extension (test/teardown.test.ts)

Sound. I read the diff (`git diff 6ec0482..HEAD -- test/teardown.test.ts`)
and independently attacked it rather than trusting the description. The
`runCli` helper change filters lines containing "watcher stale" out of
`stderr` into a separate `advisory` field, and asserts `advisory.length <= 1`
on every CLI invocation in the file (test/teardown.test.ts:68-76). To test
whether the six tests that assert on the whole of `stderr` (a line count or
a `startsWith`) still catch a break in teardown's own single-reason-line
contract (CR-303), I edited the clone's `src/commands/teardown.ts` to add
one extra, unconditional stderr line on every refusal path (a line that is
not the guard's "watcher stale" advisory, simulating a regression in
teardown's own contract), reran the full file, reverted, and diffed the
restored file byte-identical against the original:

```
$ node --test test/teardown.test.ts   # with the sabotage in place
# tests 13
# pass 7
# fail 6
```

The six tests that failed are exactly the six the work history names as
touched for this reason (single-reason-line assertions at what are now
lines 225, 374, 543, 592, 636, plus the `startsWith` assertion at line
516/598 group). One example, captured:

```
not ok 1 - teardown refuses a ship task whose branch is not landed
  error: |-
    expected a single reason line, got: tiphys teardown: debug trace, ignore
    tiphys teardown: branch task/t-unlanded is not landed on origin/main; land it before tearing the task down
    2 !== 1
```

The declared extension does what it claims: it separates the guard's
advisory from teardown's own contract without loosening the check on
either side. I found no way to make a broken CR-303 contract pass the
edited suite. The scope extension is approved.

## What I executed versus what I only read

Executed: `npm ci` in the isolated clone; the full `npm test` suite (127
tests, 125 pass, 0 fail, 2 skip, matching the work history's reported
numbers exactly); targeted structural greps for the C-2/C-3 claims (clean,
matching); direct calls into `runOnce`, `guard`, and `loadFleet` via
one-off Node scripts against hand-built scratch fleets (two custom
scenarios: a stranded seen-state claim file, and a task with a malformed
meta.json); a live `tiphys doctor` invocation via `bin/tiphys.ts` against
the second scratch fleet; the deliberate teardown.ts sabotage and full
revert with a diff check; and a read of `test/watcher.test.ts`'s two race
tests to confirm they exercise a genuine, measured race rather than a
fabricated one.

Only read, not independently re-executed: the acceptance-criteria walk in
the work history (criteria 1-3, 5, 8-14 numeric timing claims, e.g. the
21-point maximum-backoff probe and the 10-of-10 resident-wins measurement);
`npm run build`'s emitted dist/ and its `git status --porcelain` claim;
the CI-only Node 26 floor behavior (doctor's exit-0 claim); the full
`test/liveness.test.ts` and `test/doctor.test.ts` files beyond the excerpts
I grepped; and the exact wording/line numbers of the other five behaviors
registered in test/behaviors.json beyond spot-checking that the suite's
total test count matches the work history's claim.

## What I could not verify

I could not verify the M1-P6 harness's actual consumption of the cadence
flags (that phase does not exist yet on this branch), so I cannot confirm
whether Finding 1's failure mode is reachable inside the M1 exit test as
currently planned; the exit-test harness runs a single spawn/watch/teardown
cycle without artificial process kills, so it likely would not trip over
either finding in its current form. Both findings require either an
injected crash (Finding 1) or an injected file corruption (Finding 2)
that no described M1 exit-test step performs; I am not claiming either
defect blocks M1's exit test, only that it blocks the phase's own
safety claims about supervision continuity. I also did not attempt to
reproduce the 10-of-10 resident-wins race measurement myself (I read the
mechanism and judged it sound rather than re-running it 5+ more times,
since the mechanism, not the specific ratio, is what matters and the
ratio is explicitly reported as measured-not-guaranteed in the work
history).

## Merge recommendation

Do not merge as-is. Both findings are silent-failure modes in exactly the
dimension this phase exists to guarantee (a watcher and a guard that are
trusted never to sleep through what they exist to catch), both are
reproduced with captured, real output rather than asserted from reading
the code, and Finding 2 additionally corrects a specific overstated claim
in the delivered work history that this project has been burned by twice
before. Finding 1 needs either a loud-failure path for a stuck seen-state
claim (mirroring lock.ts's own documented philosophy) or a doctor check
that can detect it; Finding 2 needs either the missing doctor check the
work history assumes exists, or an honest downgrade of that claim so the
orchestrator can decide the risk consciously. The scope extension to
test/teardown.test.ts is sound and should be kept as-is; it is not a
reason to hold the PR. Everything else I exercised (the test suite, the
C-1/C-2/C-3 structural claims, the resident/once race mechanism, and the
teardown scope-extension's own guarding tests) held up under direct attack.
