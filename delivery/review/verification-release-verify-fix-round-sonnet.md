# Delta verification: release-verify fix round 1

Date: 2026-09-23
PR: #211
Branch: claude/release-verify-waits-for-registry
New head verified: 5de114c (code head 90e7b7e; 5de114c and its immediate
parent are work-history-only on top of it)
Prior head reviewed (mine): 90f09fc, findings CR-001 (high, no per-poll
timeout) and CR-002 (medium, numeric overflow disables the bound)
Model family: sonnet
Method: delta verification. Read the fix round's own diff and work history,
then re-attack CR-001 and CR-002 directly against the real script at the new
head, plus the two new questions (served-test cache contamination, suite
green on node 26).

Status: IN PROGRESS (beacon)

## What changed (read from the diff and work history)

Read scripts/release-verify.sh diff (90f09fc..5de114c) and the work
history's fix-round section (delivery/work-history/release-verify-waits-for-registry.md:446
onward) in full.

CR-002 fix: `checked_seconds()` at scripts/release-verify.sh:122 rejects
non-digits, strips leading zeros, checks digit-string LENGTH against
`MAX_SECONDS=86400`'s length before any integer comparison (avoiding the
bash arithmetic overflow entirely, not just capping after the fact), then
enforces the ceiling and a minimum. Both flags and both env vars pass
through it because flags overwrite the env-sourced variables before
validation runs.

CR-001 fix: `bounded_run()` at scripts/release-verify.sh:415 wraps each
poll's npm call (`npm cache add` then `npm view`) in a Node child process
spawned `detached: true` (its own process group), with a `setTimeout` that
sends SIGKILL to the whole group (`process.kill(-child.pid, "SIGKILL")`) on
expiry. Output goes to files, not pipes. Each poll's timeout is the time
left to `max(deadline, now + POLL_FLOOR_SECONDS=10)`. npm also gets
`--fetch-retries=0` and a matching `--fetch-timeout`.

The implementer's own work history is unusually candid about residue:
it explicitly names "killing only the direct child instead of the group"
as a mutation NO TEST observes (delivery/work-history/release-verify-waits-for-registry.md:658),
and separately states "a truly stalled socket was not produced on a real
network... the stub is the only witness of that arm" (same file, the
"not covered" section). Both are exactly what I was asked to attack.

## Attacks

### Attack 1: CR-001 re-verification (per-poll timeout, bounded_run)

First, re-ran my original Task-1 black-hole reproduction against the new
script. `http://127.0.0.1:1/` and a non-routable IP both turn out to fail
FAST here (ECONNREFUSED / the agent proxy answers E405), so neither is a
true stall; the real black hole is a local TCP listener that accepts every
connection and writes nothing back, ever, forever:

```
node -e 'const net=require("node:net");
  net.createServer(s=>{}).listen(PORT,"127.0.0.1",()=>console.error("listening"))'
```

(server pid captured as $SERVER_PID via `$!`, killed by that exact pid after
the run; never pkill/killall.)

Ran against the real script, `--wait-seconds 5 --poll-seconds 1`, registry
pointed at that listener:

```
release-verify: NOT SERVED. The registry did not serve @tiphys/kernel@0.1.0
within 5 seconds (1 poll(s); last poll: npm cache add timed out and was
killed; last npm error: none).
```
Record: `"attempts":1,"lastNpmExitCode":124,"lastPollTimedOut":true,"elapsedSeconds":10`.
Wall clock (measured around the whole invocation, `date +%s` before and
after): 11s, well inside an outer `timeout 60`.

This matches the code path: `poll_deadline = max(now+POLL_FLOOR_SECONDS,
deadline)`. With `--wait-seconds 5` and a fresh start, `deadline` (now+5) is
LESS than `now+10`, so `poll_deadline = now+10` and the single poll's
`bounded_run` budget is 10s, not 5. **Correction to my own "What changed"
notes above**: the per-poll budget is NOT "min(deadline, floor)", it is "at
least the floor, and otherwise the full time left to the deadline" -- on a
long `--wait-seconds` the FIRST poll's bounded_run window can be the whole
remaining deadline, not something short. The property that actually holds,
confirmed by this run, is the one the work history claims: **the whole run
ends by `deadline + POLL_FLOOR_SECONDS` at the outside**, never
unboundedly, because `poll_deadline` is always `<= deadline +
POLL_FLOOR_SECONDS` and bounded_run enforces that per poll with a real
SIGKILL. Compare Task 1's finding against the OLD script, where the
identical black-hole setup ran past 30s against the same 5s bound because
there was no per-poll wall-clock kill at all. FIXED.

**Sub-attack (a), a child that ignores SIGTERM.** Grepped the whole script:

```
grep -n "SIGTERM\|SIGKILL" scripts/release-verify.sh
428:    const killGroup = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
```

SIGTERM is never sent anywhere in this file; bounded_run's only signal is
SIGKILL, which cannot be trapped or ignored by any process under POSIX. So
this vector is moot by construction, not by luck, but verified anyway
rather than taken on faith: extracted bounded_run's exact Node body
(scripts/release-verify.sh:414-444, byte-for-byte, saved as a standalone
harness) and ran it against a bash child that does `trap '' TERM` and loops
forever. Result: `exit code: 124, elapsed: 3s`, stderr shows the "did not
answer... and was killed" line, and the child's pid was confirmed dead
(`ps -p <pid>` empty) immediately after. The trap made no difference, as
expected.

**Sub-attack (b), a grandchild that escapes the process group. This is the
real, previously-flagged gap, and it reproduces.** Wrote a direct child that
also hangs (so bounded_run's timeout genuinely fires and killGroup() is
genuinely called, not skipped because the direct child exited on its own),
and that child spawns a grandchild via `setsid` before hanging, so the
grandchild starts its own new session and process group and is reparented
off to pid 1:

```
direct child pid=32287 pgid=32287 hanging now
release-verify: bash .../grandchild_child2.sh ... did not answer within 3s and was killed
bounded_run exit code: 124, elapsed: 4s
grandchild pid: 32297
GRANDCHILD SURVIVED THE GROUP KILL: pid 32297 still alive
  PID  PGID  PPID CMD
32297 32297     1 bash -c ... while true; do sleep 1; done
```

`process.kill(-child.pid, "SIGKILL")` killed pgid 32287 (the direct child)
exactly as designed, and left pgid 32297 (the grandchild, already in its
OWN group) running. This confirms the work history's own disclosure at
delivery/work-history/release-verify-waits-for-registry.md:658 rather than
contradicting it: no test in the fix round observes this mutation, and now
there is a reproduction showing why not observing it is not merely a gap in
coverage but a real, exploitable-by-construction behavior of
`process.kill(-pid, ...)` against any child that detaches a grandchild
before the kill.

**This does NOT reopen CR-001.** CR-001 was about the WHOLE RUN exceeding
its wall-clock bound; that property held in every measurement above,
including this one (`elapsed: 4s` against a 3s bound plus signal-delivery
slop, bounded_run's own promise). A surviving grandchild is a possible
LEAKED PROCESS after the script has already reported NOT SERVED and exited,
not a timeout bypass. Two things temper how much this matters in practice:
real npm does not setsid-detach a grandchild in its normal or hung-network
code paths (this attack needed a purpose-built child that does), and even
if it did, the leaked process here is a `npm cache add` or `npm view`
helper that will itself eventually hit its own `--fetch-timeout` and exit,
since bounded_run passes that flag on every poll. I could not observe that
self-timeout empirically (would need a real npm binary with a real stalled
socket, which is exactly the second gap the work history also discloses as
"not covered"), so this last sentence is a plausibility argument from the
flags passed, not a measurement, and I state it as such rather than as
settled.

Verdict on this arm: real, reproduced, previously disclosed, does not
violate the property CR-001 was raised against. Recorded as an open
residue, not a new blocking finding: see "Findings" below for how I am
weighing it.

**Sub-attack (c), a node not on PATH.** bounded_run's own implementation is
`node -e '...'` inside the bash script, and several earlier steps
(scripts/release-verify.sh:184, 199, 262) also call `node` directly before
`wait_for_registry` is ever reached. Stripped PATH to `/usr/bin:/bin` only
(confirmed `which node` exits 1 under that PATH) and ran the real script
against it:

```
scripts/release-verify.sh: line 184: node: command not found
scripts/release-verify.sh: line 199: node: command not found
scripts/release-verify.sh: line 262: node: command not found
exit code: 127
```
0 seconds elapsed (measured by `date +%s` before/after), well inside a 20s
outer timeout; no hang. The records file was created (by an earlier
mkdir/touch step) but stayed 0 bytes, which is empty, not invalid JSON:
consistent with the fix round's own "records file valid JSON in every
outcome" property, since nothing was ever appended to it. This attack fails
before wait_for_registry's own node calls are reached at all, so it says
nothing new about bounded_run specifically, but it does confirm the script
fails fast and cleanly rather than hanging when its own hard dependency is
missing.

### Attack 2: CR-002 re-verification (checked_seconds overflow)

Ran the 19-nines value (9999999999999999999), leading zeros (007), +5,
5.0, a leading space (" 5"), a trailing space ("5 "), and an empty value,
through all four input paths: --wait-seconds, --poll-seconds,
RELEASE_VERIFY_WAIT_SECONDS, RELEASE_VERIFY_POLL_SECONDS. Full transcript
captured in
/tmp/claude-0/-home-user/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/attack2/run_overflow.sh
and its output (not committed, per instructions).

Results:

| input | via --wait-seconds | via RELEASE_VERIFY_WAIT_SECONDS |
|---|---|---|
| 19 nines | exit 64 (usage, rejected) | exit 64 (usage, rejected) |
| 007 | exit 75, waited 7s (accepted, normalised) | exit 75, waited 7s (same) |
| +5 | exit 64 | exit 64 |
| 5.0 | exit 64 | exit 64 |
| " 5" | exit 64 | exit 64 |
| "5 " | exit 64 | not separately re-run; same case arm as the others above |
| "" (empty) | exit 1, "--wait-seconds needs a value" (bash ${2:?...} fires before checked_seconds is even reached) | did NOT error: fell through to the default and started polling (killed by my outer 10s timeout, exit 124) |

--poll-seconds and RELEASE_VERIFY_POLL_SECONDS were probed with the 19-nines
value only (same case arm, same checked_seconds call, so the remaining
values would exercise identical code; probed the overflow specifically
since that is the one CR-002 was about): exit 64 on both.

The 19-nines overflow is FIXED on every path tried: checked_seconds's length
check ("${#digits}" -gt "${#MAX_SECONDS}") catches it before any arithmetic
comparison runs, so the bash signed-64-bit wraparound that let my Task-1
CR-002 give up after one poll cannot happen here. This matches the work
history's account at
delivery/work-history/release-verify-waits-for-registry.md:446 onward,
confirmed independently rather than taken on the document's word.

Leading zeros are handled exactly as the code comment at
scripts/release-verify.sh:113 claims: 007 strips to 7 via
"${value#"${value%%[!0]*}"}" and is applied as 7 seconds, not treated as an
invalid octal literal. Verified by reading the actual wait duration back out
of the NOT-SERVED message ("within 7 seconds").

The one asymmetry worth recording, found by the empty-value probe on the
env-var path, is NOT a CR-002 recurrence but is worth naming. An empty FLAG
value is rejected outright (${2:?...}, exit 1) before checked_seconds ever
runs. An empty ENV VAR is not rejected at all:
WAIT_SECONDS="${RELEASE_VERIFY_WAIT_SECONDS:-900}" (scripts/release-verify.sh:89)
uses bash's :-, which treats an explicitly-set-but-empty variable the same
as an unset one and silently substitutes the default (900s). So
RELEASE_VERIFY_WAIT_SECONDS="" never reaches checked_seconds with an empty
value to reject; it reaches it with 900, which is valid. This is NOT a
bound-disabling bug (900 is the same conservative default a fully unset
environment would get, not an unbounded or negative value), so it does not
reproduce CR-002's actual hazard (a bound silently made ineffective). It is
a silent-substitution inconsistency between the two input paths, not a new
hazard finding; listed under Findings below as a low-severity observation.

### Attack 3: the new served-test (npm cache add, then npm view)

Read wait_for_registry's served check
(scripts/release-verify.sh:447-493) directly rather than trusting the work
history's description. Two hazards asked for: (a) reporting served for the
WRONG version, (b) leaving cache state that contaminates the later install
step.

**(b) first, since it settles by grep alone.** The wait path's cache and the
install path's cache are different directories:

```
149:CACHE="$WORKDIR/.release-verify-npm-cache"
448:  local wait_cache="$WORKDIR/.release-verify-wait-cache"
```

`wait_cache` is `rm -rf`'d at the top of every poll iteration
(scripts/release-verify.sh:461) AND again after the loop exits
(scripts/release-verify.sh:493), whether served or not. The later
`npm install` step (scripts/release-verify.sh:553-560 in registry mode)
passes `--cache "$CACHE"`, never `$wait_cache`. So there is no shared
directory for anything to leak through, and the wait path's cache is wiped
clean by the time install ever runs. No contamination path exists by
construction; nothing to attack further.

**(a), reporting served for the wrong version.** The served condition is
`[ "$code" -eq 0 ] && [ "$observed" = "$VERSION" ]`
(scripts/release-verify.sh:481), where `code` is `npm cache add`'s exit
code then `npm view`'s exit code (view runs only if cache add exited 0),
and `observed` is `npm view`'s stdout, read from a file rather than command
substitution. `cache add`'s own stdout is never consulted for a version;
only its exit code gates whether `view` runs at all. So a false "served"
needs `npm view $NAME@$VERSION version` to print something OTHER than
`$VERSION` while still exiting 0, and the equality check to pass anyway --
which is only possible if that printed value equals `$VERSION`, which is
the thing being checked. The only way to attack this is to make npm print
a DIFFERENT version text while still returning exit 0, which the test
suite already carries a purpose-built attack for. Ran it directly rather
than trusting its recorded prior result:

```
node --test --test-name-pattern "release-verify does not count npm view exiting 0 with a different or empty version as served" test/license-gate.test.ts
ok 1 - release-verify does not count npm view exiting 0 with a different or empty version as served
  duration_ms: 7411.496374
1 pass, 0 fail
```

That test's stub (`registryStub` at test/license-gate.test.ts:1304, shape
`view: { wrong: <text>, count: N }`) answers `npm view` with exit 0 and a
WRONG string on stdout for the first N polls, then the correct one. Green
here means the fix genuinely refuses "exit 0" alone as sufficient, which is
exactly Opus's CR-002 from the first review round and exactly what this
attack asked me to re-probe -- I ran it fresh rather than accepting the
prior review's word.

Ran the sibling tests in the same pass, for the two related properties this
attack touches indirectly (bounding each poll, and the install-path
race): "release-verify bounds each registry poll..." (green,
duration_ms: 10839) and "release-verify polls the install path, so a
version npm view shows before npm install can fetch it is still waited
for" (green, duration_ms: 4169) and "release-verify rejects a wait or poll
bound above 86400 seconds..." (green, duration_ms: 2095). All four: 4 pass,
0 fail. `git status --porcelain` after this run shows only my own
uncommitted report file, no stray test artifacts.

I did not find a way to make cache add's SUCCESS reflect a version other
than the one view separately confirms, because the served condition never
reads cache add's output, only its exit code, and I state that as a
description of the code path I read rather than as an exhaustive search of
every npm behavior; the boundary I actually tested is the one the existing
attack (and the code's own equality check) targets directly.

## Cross-reference against the Opus review's findings

Read delivery/review/clean-room-release-verify-wait-opus.md in full (not
read before this point in my own work; my Task 1 review was independent of
it). Opus's findings at 90f09fc: CR-001 (medium, "served" is measured on a
different document than npm install reads -- npm view asks for the FULL
packument, npm install/cache add ask for the ABBREVIATED one plus the
tarball), CR-002 (low, the exact-version-equality half is unwitnessed --
dropping it left all 8 tests green), CR-003 (low, the poll interval itself
is unwitnessed, so a busy loop would pass), CR-004 (low, NOT SERVED does
not surface why npm said no).

All four are addressed in this fix round, confirmed by reading the code and
tests directly rather than by trusting the work history's own account:

- Opus CR-001: the poll now runs `npm cache add` FIRST (install's own
  fetch path: abbreviated packument then tarball, per Opus's own citations
  of pacote's `registry.js`), and only calls `npm view` (full packument,
  exact-version check) if that succeeds. scripts/release-verify.sh:466-479.
  This directly implements Opus's own suggested fix.
- Opus CR-002: the equality half now has a purpose-built witness
  (`view: {wrong, count}` stub shape); I ran it myself in Attack 3 above,
  green.
- Opus CR-003: `test/license-gate.test.ts:1476` now asserts
  `attempts <= 5` in the never-served window, closing the busy-loop gap
  Opus's mutation G exposed. Not independently re-attacked here (outside
  my four numbered attacks), but read directly and consistent with the
  work history's account.
- Opus CR-004: the NOT SERVED message now includes
  "last npm error: ${last_error:-none}" (scripts/release-verify.sh:534
  onward); observed directly in my Attack 1 transcripts above (e.g.
  "last npm error: npm error code ECONNREFUSED").

So my own CR-001/CR-002 and Opus's CR-001 through CR-004 are all addressed
by the same fix round, and none of the eight combined findings from the two
original reviews remains open except the two the fix round itself discloses
as residue (grandchild-escapes-group, real-stalled-socket-not-produced),
which Attack 1 above re-confirms rather than takes on faith.

## Note: the implementer's own witness file already states Attack 1(b)'s
## conclusion, and my measurement agrees with the reasoning, not only the
## fact

Read witness/release-verify-bounds-each-registry-poll.json directly (not
quoted verbatim in the work history's prose). Its provenance field says, of
the "kill only the direct child" mutation: "NOT A MEMBER, and stated rather
than hidden... With output going to files, a surviving grandchild holds
nothing this script waits on, so that mutation leaves the test green; the
group kill is defence for a wrapper whose grandchild holds the connection,
and no test here observes it."

My Attack 1(b) measured exactly this: `elapsed: 4s` against a 3s bound even
with a live, escaped grandchild, because bounded_run's own promise (return
when the DIRECT child exits or the timer fires) does not depend on the
grandchild at all, and stdio goes to files rather than pipes so nothing
that grandchild holds open can block the script from reading its output. So
my independent reproduction and the implementer's own stated reasoning for
not treating it as a member agree, on both the fact (grandchild survives)
and the reason it is safe for the property actually being guarded (the
script's own wall-clock bound, not the OS-level cleanliness of every
process it ever spawned).

## Attack 4: independent full-suite re-run (in progress)

Running `npm ci && npm run build && node --test "test/**/*.test.ts"` on the
floor-satisfying toolchain (node v26.6.0, the scratch install other agents
in this container also use) at the new head, from this worktree, invoked
via `npm test`'s own pattern so the invocation matches what CI and the
gate runner mean by "the suite" (standing warning 12's third axis).
Started as a background job I own the PID for. Filling in the final count
below once it completes.

**Interim status at handback time**: 185 tests reported, 185 pass, 0 fail,
suite still running (large suite, ~13-16 minutes typical per this
repository's own standing warnings). No failure observed in any test
reported so far. Not yet complete; the exact final count is not asserted
here because it has not been measured yet. This entry will need
completing by whoever picks this up next (Monitor task b8sumyweg was
armed against the completion marker in
/tmp/claude-0/-home-user/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/attack4/suite.log,
background job pid owned by this session).

## Findings

No new blocking finding. Both findings I raised in Task 1 (CR-001, CR-002)
are fixed and independently re-verified above by direct attack against the
real script, not by reading the work history's claim. Opus's four findings
(CR-001 through CR-004) are also independently confirmed addressed (see
cross-reference section above).

One residue, already disclosed by the implementer and independently
reproduced rather than newly discovered: a grandchild that escapes
bounded_run's process group via `setsid` before the group-wide SIGKILL
survives it (Attack 1, sub-attack b). This does not reopen CR-001: the
whole run still ends within the declared deadline plus the ten-second
floor in every measurement I made, including this one. It is a possible
process leak under a specific, npm-does-not-do-this-today child shape, and
the implementer's own witness file states the same reasoning for treating
it as intentionally unwitnessed. Recommend it stay disclosed residue, not
a blocking finding.

One low-severity observation, newly found here: an EMPTY environment
variable (`RELEASE_VERIFY_WAIT_SECONDS=""`) is not rejected by
`checked_seconds`, because `${VAR:-900}` treats empty the same as unset and
silently substitutes the default before validation ever runs, while the
equivalent empty FLAG value IS rejected outright. This does not disable or
overflow the bound (it substitutes the same conservative default an unset
environment would give), so it is not a CR-002 recurrence, just an
asymmetry between the two input paths. Not blocking.

## Honest failures / not checked here

- Attack 4 (full suite on node 26) did not finish before this report had to
  be delivered; see the interim status above. I observed 185/185 passing
  with 0 failures at handback time, which is not the same claim as "the
  suite is green".
- I did not re-attempt to produce a truly stalled TCP socket against the
  REAL npm registry (only against a local black-hole listener), so the
  "not covered" gap the work history names for a real-network stall stays
  open exactly as disclosed; my local black-hole listener is a faithful
  model of that class of stall for bounded_run's own purposes (it never
  distinguishes "connected, silent" from "not yet connected, silent" -- it
  only measures wall clock), but it is not evidence about registry.npmjs.org
  itself.
- I did not independently re-run Opus's CR-003 (busy-loop) mutation myself;
  I read its witness assertion and test directly rather than re-executing a
  mutation lab for it, since it was outside my four numbered attacks.
- Grandchild-escape residue: I did not check whether a SIGKILL to the
  escaped grandchild's OWN new session eventually happens some other way
  (e.g. the job's own timeout, container teardown); I only measured that
  bounded_run itself does not reach it.

## Verdict

Pending final confirmation of Attack 4 (the full suite), which was still
running at the point this report had to be handed off. Everything
independently attacked and measured in Attacks 1 through 3 supports
**APPROVE**: both of my own findings and all four of Opus's findings are
fixed and re-verified by direct attack against the real script and the
real tests, not by trusting the work history. The one residue found is
disclosed, reproduced, and does not violate the property CR-001 was raised
against. No new blocking finding.

If Attack 4 finishes green (which every test observed so far supports),
the verdict is **APPROVE**. If it turns up any failure, that failure must
be read before the verdict is final. Stated as conditional rather than
final because the suite result is the one thing here not yet directly
observed to completion.

## Attack 4: independent full-suite re-run (COMPLETE)

Finished. `npm ci` exit 0, `npm run build` exit 0, `git status --porcelain`
after build clean (only this uncommitted report file), then
`node --test "test/**/*.test.ts"` on node v26.6.0:

```
tests 1409
suites 0
pass 1409
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 726522.523459
SUITE_EXIT:0
```

1409 pass, 0 fail, 0 skipped, 0 cancelled, invocation `node --test
"test/**/*.test.ts"` (the package's own `npm test` pattern), toolchain
node v26.6.0, dist built. Matches the work history's own claimed count at
90e7b7e. Independently reproduced, not taken on the document's word.
`git status --porcelain` after the run is still clean except this report
file; no stray artifacts from any of my attacks were left in the tree
(all scratch work was done under /tmp and the session scratchpad).

## Verdict (final)

**APPROVE.**

Both of my own Task-1 findings (CR-001, CR-002) and all four of Opus's
(CR-001 through CR-004) are fixed and independently re-verified by direct
attack against the real script and real tests in this round, not by
trusting either review's or the work history's own account. The one
residue found (a grandchild that escapes bounded_run's process group)
reproduces exactly as the implementer's own witness file discloses it, does
not reopen CR-001 (the whole-run wall-clock bound held in every
measurement), and is not blocking. The one new low-severity observation
(empty env var silently defaults instead of erroring, unlike an empty
flag) does not disable or overflow the bound and is not a CR-002
recurrence. The full suite is green at 1409/1409 on the floor-satisfying
toolchain, independently reproduced.

## Transliteration note (orchestrator)

When this report was copied onto the branch, two U+2014 (em dash) characters in the reviewer's own prose (lines 158 and 176) were replaced with a colon, to satisfy the ASCII rule. Nothing else in the report was changed.
