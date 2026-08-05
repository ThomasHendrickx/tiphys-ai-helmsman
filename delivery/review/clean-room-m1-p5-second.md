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

## Delta review of the fix round (head 1807951)

Date: 2026-08-05
Delta: de8c1bd..1807951 (fix-round commits 5fa1b39, 1807951)
Reviewer: same as above, same isolation discipline, narrow delta scope
(the two findings above and what the fix round touched to close them),
not a full re-walk of the 15 criteria.

Isolation: a fresh clone at
/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/p5-delta-sonnet
(head 1807951, `npm ci` run inside it) and a second clone at
.../scratchpad/p5-delta-sonnet-old (head de8c1bd) for red/green comparison.
All probe scripts live under .../scratchpad/p5-repro, a directory this
session created; every scratch fleet they built lives under the OS temp
directory, outside both clones. `git status --porcelain` in the 1807951
clone is empty at the end of the session (nothing written into the
tracked tree); nothing was written to /home/user/tiphys-ai-helmsman except
this file.

### VERDICT: FIX-ROUND-NEEDED (one new finding, MEDIUM; both blocking findings from the prior round are otherwise closed)

### Finding 1 (CRITICAL, stranded claim): CLOSED, verified by execution, not by reading

I rebuilt the exact scenario from my original finding (a fleet with one
open task, an armed beacon, a live turn-end, and a pre-planted
`state/watcher.seen.json.mutex` simulating a crashed prior claim) as an
independent script (`probe1.mjs`), run against both heads.

Old head (de8c1bd), captured:

```
stuck exit: 3
stuck stdout: ""
stuck stderr: ""
beacon before: {"writtenAt":"2026-08-05T01:19:22.140Z", ...}
beacon after:  {"writtenAt":"2026-08-05T01:19:22.327Z", ...}   <- advanced
turn-end still present: true
second (independent) stuck pass: exit 3, silent
```

This reproduces the original defect exactly: silent no-wake, beacon kept
advancing, and a second independent pass fails the identical way, i.e. the
loss is permanent, not transient contention.

New head (1807951), same script, same fleet construction:

```
stuck exit: 1
stuck stderr: "tiphys watch: supervision is stuck: the seen-state claim
  <path>/state/watcher.seen.json.mutex was still present after 5000ms, so
  the turn-end of task t1 could not be surfaced and no wake was reported;
  if no other watcher is running, remove that file and re-run"
beacon before: {"writtenAt":"2026-08-05T01:19:40.412Z", ...}
beacon after:  {"writtenAt":"2026-08-05T01:19:40.412Z", ...}   <- unchanged
turn-end still present: true
second (independent) stuck pass: exit 1, same reason, beacon still frozen
```

All three claimed properties hold under direct execution: nonzero exit
(1, not the no-wake code 3), a reason line naming the exact claim path,
and the beacon byte-for-byte unchanged across the stuck pass. I traced why
in the source rather than trusting the doc comment: `runOnce` and
`runResident` both return the `{code: 1, line: "", reason}` outcome from
`scanAndSurface` immediately on a "stuck" result, before either function's
own `writeBeacon` call is reached, so the no-beacon-write property is
structural (an early return), not incidental.

I then ran the guard against the resulting fleet, per the probe's
instruction to run it rather than read that it would fire. `guard()`
takes an injectable `nowMs`, the same seam the shipped test suite already
uses to probe the 900s-backoff-cap-plus-poll edge without a real wait
(criterion 12a); I used it the same way rather than inventing a new
mechanism:

```
guard(fleet, writtenMs + 0s)    -> stale=false, "watcher fresh ... beacon 0s old"
guard(fleet, writtenMs + 60s)   -> stale=false, "watcher fresh ... beacon 60s old"
guard(fleet, writtenMs + 1199s) -> stale=false, "watcher fresh ... beacon 1199s old"
guard(fleet, writtenMs + 1201s) -> stale=true,  "watcher stale: 1 open task(s) in
                                    flight and <path> is 1201s old (threshold 1200s);
                                    supervision may have stopped"
```

This is the exact function `warnIfWatcherStale` calls with a real
`Date.now()`, which is the exact function spawn, teardown and doctor all
call (confirmed by grep: all three import and call `warnIfWatcherStale`,
none reimplements the check). The chain the round claims is real end to
end: stuck claim, no beacon write, and once the beacon's age crosses the
declared threshold, the guard fires and every one of the three commands
that consult it will emit "watcher stale". Real-clock confirmation of the
last hop (waiting out the actual 1200s) was not performed, since the
injected-clock call above executes the identical branch of the identical
function with no different code path between "the clock advanced" and "I
told it the clock advanced"; I judged that a genuine execution of the
guard, not a reading of it, and a 20-minute wall-clock wait would have
added confirmation of `Date.now()` itself advancing, which is not in
question.

Also confirmed: a merely transient claim (planted, then removed by an
independent background process 500ms into the 5000ms bounded wait, so the
main process could not have released it itself) resolves as a normal win,
not as stuck, in 519ms: `signal t1 turn-end`, exit 0. This is the
distinction the probe brief asked for (stuck vs. merely contended) and it
holds: the fix does not turn ordinary, short-lived contention into a
false "stuck" alarm.

CLOSED. Evidence above is executed and captured, not read.

### Finding 2 (HIGH, corrupt meta.json): CLOSED on the merits; the work-history claim it was built on is now corrected rather than repeated

Rebuilt the exact scenario (a task directory with a truncated,
unparseable meta.json, `{"id":"corrupt1","status":"open", "branch":
"task/corrupt1"` with no closing brace) against the new head:

```
$ tiphys watch --once
exit 0, stdout "stale corrupt1 meta"

$ guard(fleet)
{"inFlight":1,"unreadable":1,"stale":false,
 "detail":"watcher fresh: 1 task(s) (1 with an unreadable meta.json,
 which is not evidence they are finished) in flight, beacon 0s old"}
```

The watcher now surfaces the condition instead of silently skipping the
task, and the guard counts it as in flight and names it in the detail
line. `tiphys doctor` still does not gain a ninth check for task state (I
confirmed this: `doctor` on this fleet shows the same eight CHECK lines
as before, none naming `corrupt1`), but the work history's key decision 9
is now corrected in place with the false parenthetical quoted rather than
silently dropped, which is what my finding asked for as the minimum bar.
The guard/watcher fix is the stronger of the two remedies I offered and it
is the one actually shipped.

CLOSED, on both the code and the documentation claim.

### Ruling on the declined alternative (a doctor check for a stale claim mutex)

SOUND, with one caveat noted for the record rather than a blocking
objection.

Walking the operator route as described: a resident watcher or a
scheduled `--once` cron job hits the stranded mutex only at the moment a
real turn-end needs to be claimed (confirmed above: with no turn-end
pending, `scanUnsafe` never reaches `claimSignal`, so an idle fleet with a
stray mutex keeps ticking and its beacon keeps advancing normally; the
danger is dormant until a task actually finishes). At that moment the
pass that hits it prints one precise line naming the exact file and the
remedy ("remove that file and re-run") to its own stderr and exits
nonzero, and from that instant the beacon stops. Any of spawn, teardown,
or doctor invoked while that task is still open will, once the beacon's
age crosses the declared threshold (20 minutes with the shipped
defaults, or sooner if the watcher had declared a shorter interval),
print "watcher stale" and doctor's CHECK beacon line will show
WARN/FAIL. I confirmed this chain by injected-clock execution above; it
is real and it is bounded.

The residual cost, disclosed here rather than left implicit: detection
through this route can take up to the full staleness threshold after the
stuck pass, and the guard's advisory text says "supervision may have
stopped", not "a stray claim mutex is present", so an operator relying
only on the later "watcher stale" line (rather than reading the stuck
pass's own stderr at the time it happened) has to go looking for the
cause rather than being told it directly. A dedicated doctor check
(`state/*.mutex` older than the claim's own bounded wait) would have
closed that gap immediately and by name. I judge the tradeoff the round
made, declining that check to avoid a second scope extension into
M1-P2's own exact-check-count test (confirmed: test/doctor.test.ts:121
asserts `[...checks.keys()]` deepEqual against a fixed `CHECK_NAMES`
list, so an uncoordinated ninth check would have broken that phase's own
test), is reasonable for this milestone: the failure is no longer silent
or permanent, only slower to pinpoint than it could be. This is not
grounds to hold the PR; it is grounds for the orchestrator to decide,
consciously rather than by default, whether the up-to-20-minute detection
lag is acceptable for M1 or worth a future doctor check owned jointly
with M1-P2's test.

### New finding: NEW-1 (MEDIUM) - a meta.json that exists as a non-regular file is silently dropped by the guard while the watcher surfaces it, an asymmetry the fix round's own property forbids

The round's stated invariant is unconditional: "a meta.json that exists
and does not parse is not evidence that a task finished" (module docs,
src/watcher.ts and src/liveness.ts, both fix-round text). Neither module
doc conditions that sentence on the file being a regular file. The
implementation does, and only in one of the two modules.

`src/watcher.ts`'s `scanUnsafe` classifies an entry as "unreadable" (and
surfaces it as `stale <id> meta`) whenever `statIfPresent(metaPath(...))`
returns anything at all:

```
if (statIfPresent(metaPath(fleet, id)) !== undefined) {
  unreadable.push(id);
}
```

`src/liveness.ts`'s `surveyTasks`, introduced whole in this fix round to
replace `countOpenTasks`, instead requires the stat result to be a
regular file:

```
if (statSync(join(fleet.tasksDir, id, "meta.json")).isFile()) {
  unreadable += 1;
}
```

If `tasks/<id>/meta.json` exists as a directory rather than a file (a
state no code path in this kernel writes today, but not one the guard's
own stated contract excludes, and a state a botched migration script, a
stray `mkdir -p` typo, or a misplaced bind mount could produce),
`readTaskMeta` returns undefined (its `readFileSync` throws `EISDIR`,
caught by its blanket catch), `statIfPresent`/`statSync` both succeed
(stat works fine on directories), and the two modules diverge:

Reproduced (probe3.mjs, new head 1807951, `mkdir -p tasks/weird1/meta.json`):

```
$ tiphys watch --once
exit 0, stdout "stale weird1 meta"      <- watcher surfaces it, correctly

$ guard(fleet)
{"inFlight":0,"unreadable":0,"stale":false,
 "detail":"no open tasks: nothing is in flight to supervise"}   <- WRONG

$ tiphys doctor
(all 8 checks PASS/WARN as normal, nothing names weird1)
```

The watcher does exactly what the round's property demands. The guard
reports "nothing is in flight to supervise" about a task directory it
never established was closed, which is precisely the shape of Finding 2
this round exists to have eliminated: health asserted from an absence of
evidence, not from a positively established state. Any of spawn,
teardown, or doctor consulting the guard on this fleet would print a
clean bill of health while a task sits in a state the guard's own module
doc says should count as in flight.

Severity reasoning: MEDIUM, not HIGH, because the specific incident
Finding 2 was written against (an interrupted `writeFileSync` producing a
truncated regular file, `src/task.ts:97-99`) is fully and correctly
closed by this same fix, `isFile()` is true for a torn regular file. This
gap is a narrower, more exotic trigger that nothing in the current kernel
writes by itself. It is raised because it is a clean counterexample to
the round's own literal, unconditional claim, because the same
classification is implemented twice with different conditions (a
maintenance hazard independent of whether this exact shape is ever hit in
production), and because this project has twice already shipped a guard
that quietly manufactured "nobody would notice" out of an untested edge
of its own stated rule.

Fix: drop the `isFile()` condition in `surveyTasks` (match
`scanUnsafe`'s unconditional "stat succeeded" check), or, better, factor
the "does an entry at this task's meta.json path exist at all, by any
type" check into one shared helper both modules call, so the two
enforcement points of one stated property cannot drift again. Either is
a small, local change; a regression test should plant a directory (or a
FIFO, testing the same class) at `tasks/<id>/meta.json` and assert both
that the watcher surfaces "stale <id> meta" (already true) and that
`guard()` counts it as in-flight (currently false).

### Attacks that did not find anything new

- `tasks/.gitkeep` alone (init's own placeholder, no other tasks): watch
  --once exits 3 silently and `guard()` reports 0 in flight, correctly.
  Matches the round's own claim that its tests caught this during
  implementation.
- An empty (0-byte) `state/watcher.beacon`: `readBeacon` fails to parse
  it, `guard()` correctly falls into the "no readable beacon" stale
  branch when work is in flight, and `doctor` reports `CHECK beacon FAIL
  ... does not parse as a beacon record`. No silent health here.
- A `state/watcher.cadence.json` with a nonsensical `backoffStreak: -999`:
  `watch --once` still runs to a clean exit (3, virgin no-wake); the
  nonsense value affects heartbeat scheduling arithmetic only, not the
  guard's or watcher's health classification, and it does not produce a
  false-reassurance outcome in either direction. Not pursued further as
  it is a different defect class (miscalibrated cadence, already
  partially scoped by CR-502 for the environment-variable path) from the
  "health from absent evidence" property this round is about.
- A stranded-vs-transient claim: already covered under Finding 1 above; a
  claim released within the bounded wait by an independent process
  resolves as an ordinary win in well under the 5s bound, not as stuck.

### Honesty check on two specific claims

CR-505 (resident heartbeat off a pre-wait cadence snapshot), the "0 of 10
before, 0 of 10 after" measurement: HONESTLY CHARACTERIZED, not a quiet
"untested". I read the fix-round work-history text closely for exactly
the failure mode the probe asked me to watch for (dressing up a null
result as a passing one) and it is not present: the text states plainly
that the process-level window was not reproducible in either 10-run
batch, that the concurrent `--once` never surfaced the wake at all in any
of the 20 runs (naming the reason, `fs.watch` waking the resident first),
and explicitly separates that null result from the actual verification,
which it places at the library level: a real regression test
(`the heartbeat ordinal is recomputed from the cadence file`,
test/watcher.test.ts:911-934) calling the now-exported `heartbeatTick`
directly with a stale in-memory snapshot against a cadence file that was
concurrently reset on disk, and asserting the ordinal is recomputed from
disk rather than from the stale snapshot. I read that test; it is a real,
targeted unit test of the exact defect CR-505 describes, not a
tautology. The work history's own sentence, "I am therefore claiming
exactly this: the fix is correct and witnessed at library level, the
defect was real by construction, and I could not demonstrate it at
process level," is an accurate summary of what was and was not shown. No
issue here.

The "SABOTAGE WAS A NO-OP" harness claim (test/watcher.test.ts /
work-history section "Fix-round red witnesses"): PARTIALLY VERIFIED. I
searched the repository for a committed script or test-support module
that emits this literal string or implements a generic "sabotage did not
change the file, therefore do not score it" check, in `test/`, `src/`,
`.claude/skills/`, and `package.json`'s scripts; none exists. `npm test`
is a plain `node --test` invocation with no such wrapper. I read this as
shorthand for a manual discipline the implementer followed during the
fix round's own witnessing pass (plant a sabotage, run the test, revert,
diff to confirm the reverted file is byte-identical to the original and
that the sabotage actually changed something before trusting a red
result), which is the same discipline my own predecessor review in this
document used for the test/teardown.test.ts sabotage ("reverted...and
diffed byte-identical against the original before moving on"). I did not
find the claim FALSE: nothing in this round's red-witness table (F1
through F7, all reported 3/3) shows a sign of having skipped this
discipline, and the specific witnesses I independently re-ran above
(F1/F1b via probe1.mjs, F2/F3 via probe2.mjs) behaved exactly as
described. But "the harness refuses to score" describes an automated
safeguard that, as far as I can find, does not exist as shipped tooling;
it is a procedural claim about how the fix round's own verification was
carried out, not a mechanism a future session can invoke by name. Worth a
wording correction (describe it as the discipline followed, not "the
harness"), not a blocking finding.

### What I executed versus what I only read (this delta)

Executed: `npm ci` in both clones; the full `npm test` suite on 1807951
(134 tests, 132 pass, 0 fail, 2 skip, matching the work history's claim
exactly, `dist/` removed first); `git diff --stat` and full diffs of
src/watcher.ts, src/liveness.ts, src/commands/doctor.ts between the two
heads; five independent probe scripts (probe1.mjs, probe1b.mjs, probe2.mjs,
probe3.mjs, probe4.mjs plus the bash probe4d.sh) built fresh for this
delta and run against real `bin/tiphys.ts` invocations and, for the
clock-injection cases, direct calls into the exported `guard` and
`heartbeatTick` functions; both heads compared side by side for Finding 1;
a read of test/watcher.test.ts's and test/liveness.test.ts's new tests
(the stranded-claim test, the unreadable-meta tests for both modules, the
future-beacon test, the declared-cadence-floor test, the malformed-cadence
test, and the heartbeat-ordinal test) to confirm each is a real assertion
against real filesystem consequences rather than a tautology; a grep
confirming doctor/spawn/teardown all call the same `warnIfWatcherStale`
function (no reimplementation to drift); a grep confirming
test/doctor.test.ts's exact-check-count assertion exists and would have
been broken by an uncoordinated ninth check, corroborating the round's
stated reason for declining the doctor-check alternative; a repository-wide
search for the "SABOTAGE WAS A NO-OP" harness, which turned up no such
artifact.

Only read, not independently re-executed: the acceptance-criteria walk
outside criteria 1, 2, 9 and 10 to 12 (which this delta's probes touch);
the fix round's own claimed re-run counts for the F1 through F7 red
witnesses and the W3/W4 re-verification (I trust the reported 3/3 rates
as stated rather than re-running each three times myself, having
independently reproduced the F1/F1b and F2/F3 outcomes at least once each
by an independent construction); the full CR-504 and CR-506 dispositions
(paperwork corrections, not functional claims); and the exact wording of
every registered behavior name in test/behaviors.json beyond confirming
the total count (139 mappings, 134 titles) is internally consistent with
the reported test count.

### Merge recommendation (delta)

FIX-ROUND-NEEDED, but narrowly: both of my original findings are closed
by execution, not by assertion, and the declined doctor-check alternative
is a reasonable tradeoff rather than a defect. NEW-1 (MEDIUM) is a real,
reproduced counterexample to the round's own unconditional "no health
from an absence of evidence" claim, caused by a two-line difference
between two implementations of what is supposed to be one property; it
should be closed the same way this round closed the last two (make the
quiet branch require evidence, not the loud one) before this PR is called
fully clean against its own stated invariant. It does not reopen either
CRITICAL or HIGH finding from the prior round, and I would not block a
merge on it alone if the orchestrator judges the exotic trigger (a
directory where a JSON file belongs, nothing in this kernel writes)
acceptable residual risk for M1 with a tuition entry recorded instead;
that is the orchestrator's call to make consciously, not by omission.

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
