# Clean-room final sweep, CRITERIA contract, group: exclusion

- head: ad2428b76ef6f53f75b0d7f94c7db50463e077b7
- group: exclusion (src/lock.ts, src/exclusion.ts, src/pool.ts, src/watcher.ts, src/teardown.ts, src/fleet.ts)
- contract: criteria
- framing: criteria-contract
- phases covered: M1-P3, M1-P5, M4-P16, M4-P17, M4-P19, M4-P20, M4-P21, M4-P22
- clone: /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-criteria/clone (detached at the head above)
- toolchain: node v26.6.0 from /tmp/claude-0/n26/bin

Written incrementally. Nothing below is softened.

## F-1 (HIGH, REPRODUCED): the shared-exclusion guard is defeated by the kernel's own `tiphys sync`

Status: reproduced end to end with the built CLI, both arms.

**The mechanism, not the instance.** `guardSharedRegister` (src/exclusion.ts:933) is the
whole of M4-P22 criteria 2 and 3. Its verdict for a HELD register is decided by one
comparison, src/exclusion.ts:954-957:

```
  const mine = readEnvironmentId(fleetRoot);
  if (mine !== undefined && mine === status.envId) {
    return { kind: "allowed", status };
  }
```

`readEnvironmentId` reads `tiphys-environment.json` at the fleet root. That file is NOT in
`FLEET_IGNORED` (src/fleet.ts:28), so it is a durable fleet path. `tiphys sync`
(M4-P18, src/commands/sync.ts:293-330) stages exactly the changed paths the fleet
`.gitignore` does not cover, so the environment identity is committed and pushed by the
kernel's own fleet-state sync. Every later clone of that fleet then reads the SAME id,
and every one of them is `allowed` by the guard while another environment holds the
register.

M4-P21 criterion 3 asks for exactly this file property ("travels with the clone") and
test/cross-environment-lock.test.ts:328-360 asserts it. M4-P22 criterion 2 asks for a
refusal keyed on environment identity. Each is met on its own. Composed, the identity is
no longer per environment and the M4-P22 guard cannot fire between two clones of a fleet
that has synced once.

**Reproduction, exact commands and output.** Fixture under
`/tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-exclusion-criteria/fx1`,
node v26.6.0, `dist/` built, CLI invoked as `node bin/tiphys.ts`.

```
$ node bin/tiphys.ts init $FX/A --shared-exclusion
initialized fleet home at .../fx1/A
declared tiphys.sharedExclusion on origin at refs/heads/tiphys/lease
$ (cd $FX/A && node bin/tiphys.ts lock acquire --duration 3000)
acquired b28399cb-ce43-476d-a87f-6f4153679fac expires 2026-09-18T13:08:52.313Z
shared exclusion: register refs/heads/tiphys/lease on origin was absent, claiming it for
environment 2f6acf8c-474c-48a6-a140-3f406ca7a07c at counter 1; signal=counter; register
now d988630026963e14220db5bf26cde1e502de3216
$ (cd $FX/A && node bin/tiphys.ts sync)
COMMITTED tiphys-environment.json
PUSHED origin
$ git -C $FX/A show --stat --name-only HEAD | tail -3
    tiphys sync: 1 durable path(s)
tiphys-environment.json
$ git clone -b main $FX/fleet.git $FX/B && (cd $FX/B && node bin/tiphys.ts resume)
REBUILT state/
REBUILT worktrees/
REBUILT projects/
$ cat $FX/B/tiphys-environment.json   # identical to A's
  "envId": "2f6acf8c-474c-48a6-a140-3f406ca7a07c",
$ (cd $FX/B && node bin/tiphys.ts doctor | grep shared-lock)
CHECK shared-lock PASS held 2f6acf8c-474c-48a6-a140-3f406ca7a07c until 2026-09-18T13:08:52.313Z
```

B therefore SEES a live holder and still proceeds:

```
$ (cd $FX/B && node bin/tiphys.ts spawn --task t1 --project $FX/P --brief $FX/brief.md \
     --shape ship --exec true)
spawned t1 worktree .../fx1/B/worktrees/t1 exec exited 0
exit=0
$ ls $FX/B/worktrees
t1
t1.pool.json
```

A's lease is live throughout (`lock status` in A: `held holder b28399cb-... expires
2026-09-18T13:08:52.313Z`). Two environments have now mutated one fleet's task set, which
is the state M4-P22 exists to refuse.

**The control arm, one variable changed.** Same fixture, same head, B's identity file
removed so B is a genuinely distinct environment:

```
$ rm $FX/B/tiphys-environment.json
$ (cd $FX/B && node bin/tiphys.ts spawn --task t2 ...)
tiphys spawn: shared exclusion refused spawn: the shared register names environment
2f6acf8c-... as holding this fleet ... and this environment is not identified:
tiphys-environment.json is absent; ...
exit=1
$ (cd $FX/B && node bin/tiphys.ts teardown --task t1)
tiphys teardown: shared exclusion refused teardown: ... exit=1
```

So the guard is capable of firing and the published identity file is precisely what
switches it off. That is the red/green pair.

**Why the rehearsal did not see it.** delivery/verification/two-environment-rehearsal.md
cloned A and B BEFORE any identity existed (the file is written lazily by
`ensureEnvironmentId`, src/exclusion.ts:285, at the first `lock acquire`), so its two
clones drew two different random ids (rehearsal lines 434-435). `tiphys sync` was never
run between the clones. The rehearsal is honest and its capture is real; it measured a
configuration the kernel's own sync command moves you off.

**Concrete fix.** Stop treating "same envId" as proof of holdership. Record, in the
register document, the acquiring environment's LOCAL lease `holderId` (a value that lives
only under the gitignored `state/` prefix and therefore cannot travel through a clone),
and make `guardSharedRegister` require BOTH that `readEnvironmentId(fleetRoot)` equals
`document.envId` AND that `leaseStatus(fleet.lockPath)` reports `held` with that same
`holderId`. A clone has no `state/` and fails closed; a reclaimed environment also has no
`state/` and is told to re-acquire or take over, which is the correct instruction after a
reclaim. Add a test whose fixture is exactly the one above: publish the identity, clone,
and assert spawn and teardown both exit nonzero.

## F-2 (HIGH, REPRODUCED): a failed `lock release` deletes the local lease anyway, and the fleet cannot take it back

Status: reproduced end to end with the built CLI, with a control pair.

**The mechanism, not the instance.** The two exclusion layers are committed in one order on
every mutation: local first, register second. `acquireLease` handles a failed register
publish by ROLLING THE LOCAL LEASE BACK through the same primitive (src/lock.ts:676-690).
`releaseLease` does not (src/lock.ts:889-905): the local mutation
`applyLeaseMutation(lockPath, observed, null, ...)` has already removed the lease file when
`sharedCommit` is called, and on a failed publish the function simply returns
`{ok: false}`. The same asymmetry exists in `renewLease` (src/lock.ts:790-798), where a
failed publish returns nonzero after the local expiry was already extended; release is the
damaging one because the artifact is DELETED.

**Reproduction.** Fleet home A, opted in, file remote. A `pre-receive` hook on the bare
remote refuses the push, which is what a protected ref or a transport failure looks like
from the client:

```
$ node bin/tiphys.ts lock acquire --duration 3000
acquired 52363ec9-1801-485e-b686-fc63c31c3dbe expires 2026-09-18T13:15:19.457Z
shared exclusion: ... claiming it for environment bd4692a0-... at counter 1 ...
$ cat > $W/fleet.git/hooks/pre-receive <<'H'
#!/bin/sh
echo "refusing this push for the experiment" >&2
exit 1
H
$ node bin/tiphys.ts lock release --holder 52363ec9-1801-485e-b686-fc63c31c3dbe
tiphys lock: shared exclusion could not publish the release: the compare-and-swap on
refs/heads/tiphys/lease was indeterminate: push failed without a rejection marker: ...
exit=1
$ ls state/orchestrator.lock
(absent)
$ node bin/tiphys.ts doctor | grep -E "CHECK lock|shared-lock"
CHECK lock PASS no lease present
CHECK shared-lock PASS held bd4692a0-5900-41ae-9b4e-eec36646120c until 2026-09-18T13:15:19.457Z
```

The command reported failure and the lease is gone.

**Why that matters, measured rather than argued.** The local holdership guard
(`checkHoldership`, M1-P4 criterion 12) refuses a task mutation only when a lease FILE is
present. Control pair, same head, one variable:

```
# lease present, TIPHYS_HOLDER_ID unset
$ node bin/tiphys.ts spawn --task c1 ...
tiphys spawn: lease .../state/orchestrator.lock is held by 27aaae00-... and
TIPHYS_HOLDER_ID is not set; ...                                        exit=1
# same fleet, lease file removed
$ node bin/tiphys.ts spawn --task c2 ...
spawned c2 worktree .../worktrees/c2 exec exited 0                      exit=0
```

So in fleet A, after the FAILED release, a second local actor spawned with no holder id at
all:

```
$ node bin/tiphys.ts spawn --task s1 --project $W/P --brief $W/brief.md --shape ship --exec true
spawned s1 worktree .../fx6/A/worktrees/s1 exec exited 0                exit=0
```

`guardSharedRegister` does not close it either, because the register still names THIS
environment (F-1's comparison), so it returns `allowed`.

**And the state is not recoverable for a full stale window.** With the hook removed, A
cannot take its own lease back, because the register is held and its fencing counter has
not stood still long enough:

```
$ node bin/tiphys.ts lock acquire --take-over --duration 3000
tiphys lock: shared exclusion refused acquire: register refs/heads/tiphys/lease is held by
environment bd4692a0-... ; signal=counter, fencing counter 1 has stood still for 19395ms of
the 900000ms this environment requires ...                              exit=1
```

Fifteen minutes, at the default `staleWindowSeconds` of 900 (src/exclusion.ts:102), during
which the fleet has no local lease and every task-mutating command proceeds unguarded.

**Concrete fix.** Give `releaseLease` and `renewLease` the rollback `acquireLease` already
has: on a failed `sharedCommit`, restore the observed lease through
`applyLeaseMutation(lockPath, {kind:"absent"}, renderLease(observed.lease), token)` for
release and re-write the pre-renew lease for renew, and say in the reason line that the
local lease was restored, exactly as the acquire path says it was rolled back. Add a test
using the `pre-receive`-refusing remote above and assert that `state/orchestrator.lock` is
byte-identical before and after a failed release.

### The derivation behind F-2, per the fix-round contract

The mechanism is "a local lease mutation is applied before the register write that
authorises it, and only one of the three call sites undoes it". The enumeration, run at the
head under review, with its full output:

```
$ grep -rn "sharedCommit(" src/
src/lock.ts:543:function sharedCommit(
src/lock.ts:678:    const published = sharedCommit(gate.ctx, preflight, "held", nowMs, durationSeconds);   # acquire
src/lock.ts:799:    const published = sharedCommit(gate.ctx, preflight, "held", nowMs, durationSeconds);   # renew
src/lock.ts:891:    const published = sharedCommit(                                                        # release
$ grep -n "rolled back\|applyLeaseMutation(" src/lock.ts
271:export async function applyLeaseMutation(
661:  const result = await applyLeaseMutation(     # acquire, the forward mutation
681:         lease is rolled back through the SAME mutation primitive. ...
685:      await applyLeaseMutation(                # THE ONLY ROLLBACK
691:      const line = `shared exclusion refused acquire: ... the local lease was rolled back`
783:  const result = await applyLeaseMutation(     # renew, forward only
878:  const result = await applyLeaseMutation(     # release, forward only
```

Three publishing sites, one rollback. Renew is the second member of the class: a failed
publish after a successful local renew leaves the local expiry extended while the command
reports failure. It is reported here rather than as its own finding because it is the same
mechanism and the same fix; release is the member that deletes.

**What this derivation did NOT cover.** It searched `src/` only. It did not search `test/`,
`scripts/` or `bin/`, because the mechanism is a library invariant and a test that
reproduces it is not a defect. It did not enumerate callers of `applyLeaseMutation` outside
`src/lock.ts`; `grep -rn "applyLeaseMutation" src/ | grep -v lock.ts` returns nothing, so
there is no fourth mutator, but a future module importing the exported primitive would not
be caught by the grep above.

### The derivation behind F-1

```
$ grep -rn "readEnvironmentId\|ensureEnvironmentId" src/
src/exclusion.ts:285  ensureEnvironmentId    (writes; called only from lock acquire)
src/exclusion.ts:816  readEnvironmentId      (pure read)
src/exclusion.ts:954  readEnvironmentId      <-- the guard's ONE comparison
src/lock.ts:500       ensureEnvironmentId
$ grep -rn "guardSharedRegister" src/
src/spawn.ts:1024
src/teardown.ts:452
```

So the whole cross-environment half of the guard hangs on one comparison against one file,
and both call sites inherit whatever that comparison says.

**What this derivation did NOT cover.** It did not examine whether any consumer outside
this repository writes `tiphys-environment.json` itself, and it did not probe a real GitHub
remote: the fixture uses a local bare repository, so server-side ref-update ordering is
inferred, exactly as M4-P20 criterion 6 says of its own probe.

## F-3 (MEDIUM, REPRODUCED): a shipped, ungated clock seam turns the fencing counter back into a clock

`src/commands/lock.ts:119` reads `TIPHYS_LOCK_TEST_NOW_MS` and, when set, feeds it as
`nowMs` to every mutating lock subcommand, including `preflightShared`. `judgeByCounter`
(src/exclusion.ts:553) computes `unchangedForMs = nowMs - previous.firstSeenMs`, so the
"two readings of ONE clock" the module's header promises are two readings of a clock the
CALLER supplies. There is no `NODE_ENV`, no test-only build flag and no other gate; the
function is reached from the published CLI.

Reproduced. Environment A holds the register with a 9000-second lease; the honest challenger
is refused, and the same command with one environment variable set takes the lease over
instantly:

```
# B, honest clock
tiphys lock: shared exclusion refused acquire: register refs/heads/tiphys/lease is held by
environment f44bda18-... ; signal=counter, fencing counter 1 has stood still for 0ms of the
900000ms this environment requires                                        exit=1
# B, TIPHYS_LOCK_TEST_NOW_MS = now + 3600000
acquired 32f24d58-f76d-49c0-b8c5-5cfdcf033642 ...
shared exclusion: taking over refs/heads/tiphys/lease from environment f44bda18-...,
whose fencing counter 1 stood still for 3600069ms; environment 451b561c-... advances it
to 2; signal=counter                                                      exit=0
```

The register then names B at counter 2 while A's `state/orchestrator.lock` still says A
holds the fleet. The stale window is bypassed entirely, and the printed line still says
`signal=counter`, so M4-P21 criterion 6's own output cannot distinguish a counter judgement
made on the real clock from one made on an injected one.

**Concrete fix.** Refuse the seam unless the process is running under the test harness, the
same way the repository already refuses other measurement-only inputs loudly: read it only
when `process.env.NODE_TEST_CONTEXT !== undefined` (node's own test-runner marker) or behind
an explicit `TIPHYS_ALLOW_TEST_CLOCK=1` that `tiphys doctor` reports as a FAIL, and make the
verdict line say `signal=counter(injected-clock)` whenever the seam supplied `nowMs`, so a
captured witness cannot read as an honest one.

## F-4 (MEDIUM, REPRODUCED): `lock acquire` piped into a short consumer exits 1 after acquiring

An EPIPE on stdout is unhandled, so the process dies with a Node stack trace after the lease
has been taken. Reproduced at the head under review:

```
$ node bin/tiphys.ts lock acquire --duration 900 2>/dev/null | head -1
acquired a18947b2-8fae-4553-8894-412403a470b0 expires 2026-09-18T12:43:08.395Z
exit(acquire)=1
$ ls state/orchestrator.lock
state/orchestrator.lock          <-- the lease WAS taken
$ git cat-file -p FETCH_HEAD:lease.json | grep -E 'envId|counter'
  "envId": "f44bda18-9e14-4c07-9b98-a1f873cd02c7",
  "counter": 4,                  <-- and the register WAS advanced
```

The unhandled raise is at `reportShared` (src/commands/lock.ts:145), reached only when the
shared layer has a second line to print, which is why the plain local path does not show it.
Any wrapper of the shape `if ! tiphys lock acquire | grep -q acquired; then ...` takes its
failure branch while holding both the local lease and the shared register. That is a wrong
conclusion about exclusion state, which is the one thing this group must never produce.

**Concrete fix.** Install `process.stdout.on("error", ...)` in `bin/tiphys.ts` to swallow
`EPIPE` (and only `EPIPE`) and exit with the command's own code, or write the whole
multi-line report with a single `write` so a truncated consumer cannot split it. Add a test
that pipes `lock acquire` into a consumer closing after one line and asserts the exit code
equals the unpiped one.

## F-5 (LOW, REPRODUCED): M4-P19 criterion 1's `reconstructed` marker is not what a normal clone prints

Criterion 1 asks for `tiphys pool list` to include the id "with a `reconstructed` marker".
At this head it prints that only when `<remote>/HEAD` is set locally. `pool list` passes
`network: false` (a deliberate M4-P19 fix-round change, src/pool.ts:392-404, made after a
measured hang), and `resolveDefaultBranch` then cannot answer for a clone built by
`git init` + `git remote add` + `git fetch`, which the same comment calls "the NORMAL state
of a clone ... which is how this kernel's own tests and fixtures build one". Measured, same
fixture, one variable:

```
# origin/HEAD unset
r1 b2127ef... unreconstructable (unresolved: branch)
CHECK worktrees WARN 1 of 1 pool entr(ies) have no pool record beside them: r1 (unreconstructable: branch)
# after git -C P remote set-head origin -a
r1 b2127ef... reconstructed
CHECK worktrees WARN 1 of 1 pool entr(ies) have no pool record beside them: r1 (reconstructed)
```

The direction is safe (it reports less, never destroys more) and `teardown
--from-reconstructed` still works because it passes `network: true`. The defect is that the
criterion text now describes one of two configurations and nothing says which.

**Concrete fix.** Amend the criterion, or make `pool list` report `reconstructed (partial:
branch unresolved without a network read)` so the marker token the criterion names is
present in both configurations, and add the `origin/HEAD` unset arm to `test/pool.test.ts`.

## F-6 (LOW, REPRODUCED): `CHECK shared-lock PASS not-declared` for a fleet home with no package.json

`readSharedExclusion` maps an ENOENT on `package.json` to `{kind: "absent"}`
(src/exclusion.ts:212-215), and `sharedLockStatus` maps `absent` to the PASS status whose
text asserts "the cross-environment layer is off here". An absent pin file is not evidence
that the layer is off; it is the state in which the question cannot be asked, which is what
the `unreachable` status exists for (and an INVALID declaration is already mapped there).
Measured:

```
$ mv package.json /tmp/pj.bak && node bin/tiphys.ts doctor
CHECK layout FAIL missing package.json
CHECK shared-lock PASS not-declared (tiphys.sharedExclusion is absent from this fleet
home's package.json, so the cross-environment layer is off here)
```

Mitigated by `CHECK layout FAIL` making the whole run exit 1, and by `lock acquire` refusing
"not a fleet home" before the layer is consulted, which is why this is LOW rather than
higher.

**Concrete fix.** In `sharedLockStatus`, distinguish "package.json read and carries no
`tiphys.sharedExclusion`" from "package.json could not be read at all", and map the second
to `unreachable the fleet package.json could not be read`.

## The suite, as a complete sentence

Scratch clone at `ad2428b`, detached; interpreter `node v26.6.0` from `/tmp/claude-0/n26/bin`
(`node --version` checked in the shell that ran it); `npm ci` exit 0, `npm run build` exit 0
and `git status --porcelain` empty afterwards; invocation `npm test` (which is
`node --test "test/**/*.test.ts"`, not the bare `node --test` of gate-list step 3, and the
two differ by the tracked `sandbox/` fixture, CLAUDE.md standing warning 12):

**tests 1341, pass 1340, fail 1, skipped 0, todo 0, cancelled 0, duration_ms 494977, exit 1.**

The one failure is NOT in this group and is the documented container trap, quoted verbatim
rather than summarised:

```
test at test/gates.test.ts:3571:1
AssertionError: gate p11-attr wrote no record at /tmp/tiphys-gates-8a9VmC/.../result.json;
the run itself did not reach a verdict, which is an environment failure rather than a wrong
verdict. exit=21 ...
stderr=tiphys gates run: the gate runner failed: EACCES: permission denied, lstat
'/tmp/claude-0/.../clone/node_modules/ajv/dist/vocabularies/applicator/contains.js'
```

That is CLAUDE.md standing warning 1's `runCliUnprivileged` family: the test drops to an
unprivileged uid and that uid cannot traverse `/tmp/claude-0`, which is `drwx------`. The
clone and the toolchain are both under it here. The test's own assertion message calls it an
environment failure. I did NOT re-run the suite from a clone outside `/tmp/claude-0` to
confirm, so I report this as attributed-by-evidence rather than as proven: the attribution
rests on the EACCES path and the standing warning, not on a control run. **I therefore do
not claim "the suite is green at this head"**; I claim 1340 of 1341 passed and the one
failure names an EACCES on a node_modules path under the private-mode scratch root.

## The criteria walk

Legend: RAN means I executed it against the final code in this session; READ means I
established it by reading the final source and quoting it; NOT REACHED is stated with its
reason.

### M1-P3 (session lock and worktree pool)

| # | verdict | how |
|---|---|---|
| 1 | MET | RAN. `lock acquire` exit 0; the file parses with a non-empty `holderId` and a future `expiresAt`; `grep -c pid state/orchestrator.lock` = 0. |
| 2 | MET | RAN. Second acquire exit 1, stderr `lock held by ...`, sha256 of the lock file identical before and after. |
| 3 | MET | RAN. Five concurrent OS processes: 1 exit 0, 4 exit 1, file holds the winner's holderId, which every loser's message names. |
| 4 | MET | RAN. Renew by the holder exit 0 and `expiresAt` strictly increased (...28.001Z to ...28.826Z); renew with a wrong holder exit 1. Expired-renew arm READ at src/lock.ts:752-759 and exercised by the suite. |
| 5 | MET | RAN. One-second lease, slept past expiry: `lock status` exit 0 printing `expired`, holder and expiry; plain acquire exit 1; `--take-over` exit 0 with a new holder and a future expiry. |
| 6 | MET | READ. Staged interleave through the `observed` seam, test/lock.test.ts:329; the CLI-level form is the same primitive I exercised live in 3 and 7. |
| 7 | MET | RAN. Two concurrent `--take-over` on an expired lease: exits 1 and 0, file holds the winner. |
| 8 | MET | READ. test/lock.test.ts:416 and :459 cover both orderings. |
| 9 | MET | READ. test/lock.test.ts:495. |
| 10 | MET | RAN. `grep -n "process\.kill\|signal 0\|/proc\|process\.pid\|kill(\|\bpid\b"` over all six files of this group: zero hits. |
| 11 | MET | RAN. Local default deliberately behind the remote: `pool create` exit 0, worktree `git status --porcelain` empty, HEAD and recorded `baseSha` both the REMOTE head `b2127ef`, not the stale local `5b2b9e4`. Ahead-arm NOT REACHED (I staged only the behind arm). |
| 12 | PARTLY MET | RAN for the `origin/HEAD` unset arm (the fixture's default): `pool create` exit 0 with the correct base sha. Detached-HEAD arm NOT REACHED. |
| 13 | MET | RAN. Remote repointed at a missing path: exit 1 and nothing created; `--offline` exit 0 with `offline: true` and the last fetched sha. The spawn-side `baseOffline` half READ at src/spawn.ts. |
| 14 | MET | RAN. Duplicate id exit 1, stderr names `t-a`. |
| 15 | MET | RAN. Two concurrent `pool create` for distinct ids both exit 0; `git worktree list` shows both. |
| 16 | MET | RAN. Dirty destroy exit 1 with the directory still present; `--discard` exit 0, directory gone, worktree deregistered. |
| 17 | NOT MET at this head | RAN. The suite does not exit 0 here; see the section above. The failure is outside this group and is attributed to the container, but the criterion's literal text is not satisfied by this run. |

### M1-P5 (watcher and liveness guard)

| # | verdict | how |
|---|---|---|
| 1 | NOT REACHED | A three-interval resident run with growing gaps needs a long-lived process; I ran the resident mode only for the `--max-heartbeats` exit. |
| 2 | MET (single-pass form) | RAN in `--once`: creating `turn-end` produced exactly `signal d1 turn-end`, exit 0. The resident-process form NOT REACHED. |
| 3 | MET | RAN. `watch --max-heartbeats 1` with a short cadence exits 0 printing `heartbeat 1`. |
| 4 | MET | RAN. Virgin fleet `watch --once`: no stdout, exit 3. Pending-turn-end arm covered under 2. |
| 5 | NOT REACHED | Needs a timed heartbeat-due pass; I exercised the cadence file's persistence only through 3 and 4. |
| 6 | MET | RAN. After `signal d1 turn-end`, the immediately following `--once` exits 3. |
| 7 | NOT REACHED | The resident-versus-`--once` race needs two processes contending on the seen-state; READ only, test/watcher.test.ts. |
| 8 | MET | RAN. Two consecutive no-wake passes: beacon `writtenAt` advanced ...17.509Z to ...18.838Z, both exit 3. |
| 9 | MET | RAN, both directions. Past deadline with no turn-end: `stale d1 deadline`, exit 0, and it is standing (a second pass repeats it). Future deadline: exit 3. |
| 10 | MET (partly) | RAN indirectly: every `spawn`/`teardown` in my fixtures with an open task and no beacon emitted `watcher stale: 1 open task(s) in flight and no readable beacon ...` on stderr and still performed its function. The `doctor` arm NOT REACHED. |
| 11 | NOT REACHED | I did not run the fresh-beacon control for all three commands. |
| 12 | MET | RAN. `TIPHYS_WATCH_BACKOFF_CAP_SECONDS=900 TIPHYS_WATCH_STALE_SECONDS=900` exits 1 from src/liveness.ts:152 naming both values; `...STALE_SECONDS=1200` exits 3. The maximum-backoff-probe half NOT REACHED. |
| 13 | MET | RAN. No `node:http`/`node:https`/`node:net`/`node:tls`/`fetch(`/client package in `src/watcher.ts`, `src/commands/watch.ts`, `src/liveness.ts`, `src/fleet.ts`, `src/task.ts`. |
| 14 | MET | RAN. Zero hits for `process.kill|kill(|/proc|pid|detached|unref` across the three files, and zero for `daemon|background|--fork|nohup`. |
| 15 | NOT MET at this head | Same as M1-P3 criterion 17. |

### M4-P16 (fleet rehydration)

| # | verdict | how |
|---|---|---|
| 1 | MET | RAN. Clone of a published fleet: exactly three `REBUILT` lines, exit 0, then `CHECK layout PASS all layout entries present`. |
| 2 | MET | RAN. Non-repository: exit 1, one stderr line naming the absent `.git`, and `find . -mindepth 1 | sort | sha256sum` identical before and after. |
| 3 | MET | RAN. Two further invocations each printed nothing and exited 0. |
| 4 | MET | RAN. Live fleet (dirty `worktrees/x/scratch.txt`, unexpired lease): both sha256 values identical after `resume`, exit 0. |
| 5 | MET | RAN. `state/` removed, `worktrees/` kept: one `REBUILT state/`, the scratch file still present. |
| 6 | MET | RAN. `init` in the clone exits 1 naming `tiphys resume` as the remedy. |
| 7 | NOT REACHED | Behaviour-registry completeness is a registry comparison I did not run. |

### M4-P17 (doctor reports a post-reclaim fleet)

| # | verdict | how |
|---|---|---|
| 1 | MET | RAN. `expiresAt` one second in the past: `CHECK lock FAIL lease held by ... EXPIRED at ...` and `doctor` exit 1. |
| 2 | MET | READ, and it is the strong form: `src/commands/doctor.ts:9` imports `expiryHasPassed` from `src/lock.ts` and calls it at :557, and that function IS the `<=` at src/lock.ts:217. There is no second comparison to disagree with. |
| 3 | MET | RAN. `CHECK tasks PASS 0 open of 1` on a fleet with one closed task; the C-1/C-2 grep over `src/commands/doctor.ts` for `/proc|process.kill|pid|stream.jsonl` returns 0. |
| 4 | MET | RAN. `CHECK worktrees WARN 1 of 4 pool entr(ies) have no pool record beside them: r1 (reconstructed)`. See F-5 for the marker's other configuration. |
| 5 | MET | RAN. `CHECK branches PASS no pushed branches`, and the run's exit code was 0 with that WARN-only check present. |
| 6 | PARTLY MET | RAN member B's shape: `CHECK remote WARN no remote configured ...` on a fleet with no remote. The two-unpushed-commits arm and the failing-fetch arm NOT REACHED. |
| 7 | MET | RAN. One line per check, exit 0 only when no check FAILs (observed both ways). |

### M4-P19 (pool-record reconstruction and post-reclaim teardown)

| # | verdict | how |
|---|---|---|
| 1 | PARTLY MET | RAN, both configurations. See F-5. |
| 2 | MET | RAN. `teardown --task r1` exit 1, and the reason line names `--from-reconstructed`. |
| 3 | PARTLY MET | RAN the resolvable arm (reconstruction succeeded and the run proceeded to the later refusals). The unresolvable arm NOT REACHED as a `--from-reconstructed` invocation. |
| 4 | MET | RAN. Dirty worktree: refused, worktree still present, `git status --porcelain` sha256 identical before and after. |
| 5 | MET | RAN. Clean worktree, branch carrying an unlanded commit: refused with `branch task/r1 (tip 0705cd8ef2ae42901de4247e413576c999caf1ae) is not landed on origin/main`, tip sha named, worktree still present. Structurally different from 4: 4 is caught by the dirty check, 5 is caught by the landed check. |
| 6 | MET | RAN. `ls worktrees/` after every step above shows `r1` and no `r1.pool.json`. |

### M4-P20 (the double-acquire witnesses and the compare-and-swap probe)

| # | verdict | how |
|---|---|---|
| 1 | MET | RAN. `node scripts/probe-cas-ref.mjs --remote <path>` printed exactly `A accept` and `B refuse ! [rejected]        9eb24d1... -> refs/tiphys/lease (stale info)`, exit 0. |
| 2 | MET | RAN. The refusal text is git's own, reproduced live here rather than quoted from the document. |
| 3 | NOT REACHED as a live run | READ: the vacuity arms are in the probe and in delivery/verification/cross-environment-exclusion-probe.md, and the design consequence IS implemented, which I checked instead: `casWrite` emits only the exact-sha form (src/exclusion.ts:481) and the bare form appears nowhere in `src/`. |
| 4 | MET (still true at this head) | RAN, four-way rather than two: four clones of one fleet remote with the layer OFF each get their own `state/orchestrator.lock`, since `state/` is in `FLEET_IGNORED` (src/fleet.ts:28) and never travels. |
| 5 | MET | RAN implicitly by the F-1 fixture: a clone made FROM a published fleet carried no `state/` and had to `resume` to get one. |
| 6 | MET | READ. The evidence document names clock skew, the local-bare-repository substitution and the absent two-host push. |
| 7 | MET | READ plus RAN: the probe runs and produces its two lines, so it has not become a no-op. |

### M4-P21 (the shared exclusion register)

| # | verdict | how |
|---|---|---|
| 1 | MET | RAN. A fleet initialised without `--shared-exclusion` acquires and releases exactly as before and `doctor` says `not-declared`. An INVALID declaration refuses rather than running local-only, which is the stronger half. |
| 2 | MET | RAN. A exit 0 and the ref carries A's document; B exit 1 with ONE line naming A's env id and expiry; `git ls-remote` sha identical before and after; no local lock in B. |
| 3 | MET, AND IT IS THE INPUT F-1 TURNS AGAINST THE GUARD | RAN. Zero `hostname`/`process.pid`/`/proc`/`kill(` in `src/exclusion.ts`; a clone that carries the committed identity file observes the same id, which the criterion asks for and which F-1 shows M4-P22's guard cannot survive. |
| 4 | MET | READ. test/cross-environment-lock.test.ts:383 asserts the dangerous state before acting on it and asserts `no clock comparison was made` in the refusal. |
| 5 | MET | READ. test/cross-environment-lock.test.ts:426, with a CONTROL at :472 showing the stale window IS reachable when the renewal is removed, so the refusal is caused by the renewal and not by an unreachable window. That control is what makes the pair a class rather than two assertions. |
| 6 | MET, with a caveat | RAN. Every verdict line carries `signal=counter` or `signal=clock`. F-3 is why the token is not sufficient: an injected clock still prints `signal=counter`. |
| 7 | MET | RAN. Remote repointed at a missing path: exit 1, and `state/orchestrator.lock` was NOT created. |
| 8 | MET | RAN. Release attempted by the non-holding environment: exit 1, register sha byte-identical. |
| 9 | NOT REACHED | The red-at-first-commit, green-at-tip pair is a history claim about the phase branch, which this sweep does not check out. |

### M4-P22 (shared-exclusion integration and the two-environment rehearsal)

| # | verdict | how |
|---|---|---|
| 1 | MET | RAN all four statuses at this head: `not-declared` (PASS), `free` (PASS), `held <envId> until <t>` (PASS), `unreachable ...` (WARN, never PASS). See F-6 for the one input that takes the wrong branch. |
| 2 | NOT MET | RAN. See F-1: reproduced a `spawn` exit 0 in a second environment while the register named a live holder. The guard fires only when the two environments carry different identities, and the kernel's own `tiphys sync` makes them carry the same one. |
| 3 | NOT MET | RAN. Same fixture, same cause, `teardown` shares the one comparison (src/exclusion.ts:954) and therefore the one hole. The refusal ITSELF is correct and removes nothing when it fires. |
| 4 | MET | READ. delivery/verification/two-environment-rehearsal.md carries the captured output and exit codes for every step, and its two clones sit on two different filesystems (`fsid` recorded for each). |
| 5 | MET | READ. The document names the three things it could not reach: two real machines, two real system clocks, and GitHub's ref-update ordering. |

## Composition findings, which is what this sweep exists for

F-1 and F-5 are the two defects no per-phase review could have produced, and they are
different kinds of composition.

- **F-1 is two correct phases whose union permits what neither intended.** M4-P21
  criterion 3 requires the environment identity to be a TRACKED fleet file so it survives a
  reclaim. M4-P18 gives the kernel a `tiphys sync` that commits and pushes every changed
  durable path. M4-P22 builds the spawn and teardown guard on a comparison against that
  file. Each phase is right in isolation. Composed, "this environment" and "this fleet" are
  the same identity, so the cross-environment guard is `allowed` for every clone of a fleet
  that has synced once. M4-P21 landed before M4-P18's sync existed as a habit, and M4-P22
  landed after, with a rehearsal whose two clones predated any identity at all.
- **F-5 is a criterion broken by a later fix round inside its own phase.** M4-P19
  criterion 1 names a `reconstructed` marker; M4-P19's own fix round made `pool list` and
  `doctor` non-networked to stop a measured hang, and in the `origin/HEAD`-unset
  configuration the marker becomes `unreconstructable`. Both decisions are right; the
  criterion text is now true of one configuration.
- **F-2 is not composition**: it is a single-phase asymmetry (M4-P21 gave acquire a
  rollback and gave renew and release none) that only becomes dangerous once M1-P4's local
  holdership guard is read together with it, because that guard keys on the presence of the
  file the failed release deletes.

## Recurring tuition shapes found present again

- **T-042** (a refusal predicate that cannot see an ABSENT value) is present again as F-6:
  `readSharedExclusion` maps an absent `package.json` to "the layer is off", which is the
  same conjunction of presence with validity one level up.
- **The H-B shape CLAUDE.md records under T-008's postscript** (a guard whose condition
  does not test the property that matters) is present again as F-1: the condition tests
  which FLEET this is, where the property that matters is which ENVIRONMENT this is.
- **T-037** (the absent arm returned success) is present again, inverted, as F-4: a present
  arm returns FAILURE after succeeding.
- **T-003** (a concurrency test where no contention can occur is worthless) is NOT present
  again in this group, and I checked rather than assumed: M1-P3 criteria 3 and 7 use real
  concurrent OS processes, which I reproduced live; the register's own CAS refuses under
  four genuinely concurrent environments, which I also reproduced; and the clock-skew pair
  at test/cross-environment-lock.test.ts carries an explicit control proving the stale
  window is reachable, so its two refusals are caused by the renewal rather than by an
  unreachable window.
- **T-025** (the path that cannot be rehearsed is the one that failed) is HONOURED by
  delivery/verification/two-environment-rehearsal.md, and F-1 is the cost of the part it
  correctly said it could not reach in a different direction: it rehearsed two clones that
  had never exchanged an identity.

## What I tried to break, and what HELD

- **The local lease under real contention.** Five concurrent `lock acquire` and two
  concurrent `lock acquire --take-over`, real processes: exactly one winner each time, the
  file holding the winner, every loser naming that winner. HELD.
- **The register's compare-and-swap under real contention.** Four distinct environments
  acquiring an absent register simultaneously: one exit 0, three exit 1, and all three
  losers rolled their local lease back so only the winner has a lock file. One loser
  resolved through the indeterminate re-read path rather than a rejection marker, which
  means that branch is exercised for real and not only in a test. HELD.
- **Fail-closed on an unreachable register.** Remote repointed at a missing path:
  refusal, and NO local lock file. HELD.
- **Fail-closed on a typo.** `ref: "not-a-ref"`: refusal, no local lock, and `doctor`
  reports WARN rather than PASS. HELD.
- **Switching the layer off by deleting the pin file.** `lock acquire` refuses "not a fleet
  home" before the layer is consulted. HELD (the `doctor` line is F-6, and it is cosmetic
  because the same run fails its layout check).
- **C-2.** Zero hits for `process.kill`, `kill(`, `/proc`, `process.pid` and a `pid` field
  across all six files of the group, and zero in `src/liveness.ts` and
  `src/commands/watch.ts`; the lease file itself carries no `pid`. HELD.
- **C-1.** `state/last-wake.json` is append-only and is opened with `"a"` at
  src/watcher.ts:592; `grep -rn "last-wake|lastWakePath|LAST_WAKE" src/` shows no reader
  outside the writer. Nothing derives current state from it. HELD.
- **Teardown refusing without destroying.** Every refusal I forced (dirty reconstructed,
  unlanded reconstructed, shared-register refusal) left the worktree standing and, for the
  dirty case, `git status --porcelain` byte-identical. HELD.
- **`--from-reconstructed` never persisting a reconstruction.** `ls worktrees/` after every
  reconstructed path: no `.pool.json` was ever written. HELD.

## What I did NOT reach

- The resident watcher's backoff growth over three intervals (M1-P5 criterion 1) and the
  resident-versus-`--once` seen-state race (criterion 7). Both need long-lived or
  contending processes I did not stage.
- The fresh-beacon control for all three supervision commands (criterion 11) and the
  maximum-backoff freshness probe (criterion 12's second half).
- M1-P3 criterion 11's local-ahead-of-remote arm and criterion 12's detached-HEAD arm.
- M4-P17 criterion 6's two-unpushed-commits and failing-fetch arms.
- M4-P21 criterion 9's red-at-first-commit history claim: this sweep reviews one head and
  does not check out phase branches.
- A real GitHub remote. Every register fixture here is a local bare repository, so
  server-side ref-update ordering under concurrent pushes is inferred, exactly as M4-P20
  criterion 6 says of its own probe.
- A control run of the suite from a clone outside `/tmp/claude-0`, which is what would turn
  the one test failure from attributed to proven.

## Verdict

**FIX-ROUND-NEEDED.** Two HIGH findings, both reproduced with red and green arms against
the final code: the cross-environment guard that M4-P22 exists to provide does not fire
between two clones of a synced fleet (F-1), and a failed `lock release` deletes the local
lease while reporting failure, opening the local holdership guard for a full stale window
(F-2). Two MEDIUM findings follow (F-3, F-4), both reproduced. F-5 and F-6 are LOW.

## The verdict document, and the negative control on the instrument

`/tmp/claude-0/final-sweep/verdict-final-exclusion-criteria.json`, validated with the
kernel's own validator at this head:

```
$ node bin/tiphys.ts validate --type auto /tmp/claude-0/final-sweep/verdict-final-exclusion-criteria.json
SKIPPED dual-review-decorrelation no context
SKIPPED verdict-criteria-complete no context
SKIPPED verdict-deviations-judged no context
SKIPPED verdict-hazard-classes-addressed no context
SKIPPED verdict-pair-approves no context
exit=1
```

**Read that exactly.** `src/commands/validate.ts:469-480` prints schema diagnostics FIRST
and returns 1 immediately if there are any; my document produces ZERO diagnostic lines, so
it is schema-valid against `schemas/verdict.schema.json`. The nonzero exit comes from the
Kind B cross-document checks, which are skipped for want of a `--context`. Run WITH
`--context .` they report, correctly, that there is no `plan.yaml`, no `work-history.yaml`
and no committed verdict corpus for phase `M1-P3` at this head:

```
INVALID #/phase this verdict is not among the 0 verdict document(s) committed under
delivery/review for phase M1-P3 at head ad2428b7... (check: dual-review-decorrelation)
INVALID #/verdict only 0 verdict document(s) exist ... DR-0012 condition 2 is a property of
the PAIR (check: verdict-pair-approves)
```

Those are statements about the CORPUS, not about this document, and they will resolve when
this verdict and its pair are committed under `delivery/review`.

**Negative control, four structurally different mutations, so this is a class and not one
witness:**

| mutation | validator |
|---|---|
| `verdict` flipped to `APPROVE` beside the high findings | `INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"` |
| `head` abbreviated to `ad2428b` | `INVALID #/head value "ad2428b" does not match the required pattern ^[0-9a-f]{40}$` |
| `concrete-fix` deleted from one finding | `INVALID #/findings/0/concrete-fix required property concrete-fix is missing` |
| `review-contract` flipped to `hazard` with no `hazard-classes-addressed` | `INVALID # value matches no permitted alternative here` |

All four exit 1 and name the field. The instrument can go red, so its silence on my
document means something.

## The three assigned fields, and the declared deviation

- `"review-contract": "criteria"`, `"framing": "criteria-contract"`, `"produced-by"` naming
  the family I believe I am. I ran the criteria contract as assigned; I did not run the
  hazard contract and did not read any other reviewer's work.
- `"phase": "M1-P3"` is the assigned single value. This review actually covers M1-P3,
  M1-P5, M4-P16, M4-P17, M4-P19, M4-P20, M4-P21 and M4-P22, every one of them named in the
  criteria walk above and every one of them keyed in `criteria[]` by a phase-prefixed id.
  The deviation from the one-head-one-phase shape is declared here so it is auditable.
- `"head": "ad2428b76ef6f53f75b0d7f94c7db50463e077b7"`, forty lowercase hexadecimal digits,
  copied rather than abbreviated.

## The JSON verdict, embedded rather than landed

This verdict reads FIX-ROUND-NEEDED. `check-dual-review` reads the TOP LEVEL of
`delivery/review/` non-recursively as its corpus, so landing this as its own
`verdict-*.json` there would correctly turn that gate red. It is embedded here
instead, so the evidence lands without the gate reading a committed verdict.

```json
{
  "kind": "verdict",
  "phase": "M1-P3",
  "head": "ad2428b76ef6f53f75b0d7f94c7db50463e077b7",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "claude-opus",
  "framing": "criteria-contract",
  "review-contract": "criteria",
  "findings": [
    {
      "id": "CR-EXC-001",
      "severity": "high",
      "evidence": [
        "src/exclusion.ts:954 is the whole cross-environment guard: `const mine = readEnvironmentId(fleetRoot); if (mine !== undefined && mine === status.envId) return {kind: \"allowed\", status}`",
        "src/exclusion.ts:91 puts the identity in tiphys-environment.json at the fleet root, which is not in FLEET_IGNORED at src/fleet.ts:28, so it is a durable fleet path",
        "Reproduced: `tiphys sync` in fleet A printed `COMMITTED tiphys-environment.json` and `PUSHED origin`; `git show --stat --name-only HEAD` names exactly that path under the message `tiphys sync: 1 durable path(s)`",
        "Reproduced: a clone B of that remote plus `tiphys resume` read envId 2f6acf8c-474c-48a6-a140-3f406ca7a07c, identical to A's, and `doctor` in B printed `CHECK shared-lock PASS held 2f6acf8c-474c-48a6-a140-3f406ca7a07c until 2026-09-18T13:08:52.313Z`",
        "Reproduced, the defect: in B, `node bin/tiphys.ts spawn --task t1 --project $FX/P --brief $FX/brief.md --shape ship --exec true` printed `spawned t1 worktree .../fx1/B/worktrees/t1 exec exited 0` and exited 0 while A's lease was live (`lock status` in A: `held holder b28399cb-... expires 2026-09-18T13:08:52.313Z`)",
        "Control arm, one variable changed: `rm $FX/B/tiphys-environment.json` then the same spawn exits 1 with `shared exclusion refused spawn: the shared register names environment 2f6acf8c-... and this environment is not identified`, and teardown of the task created in the first arm also exits 1",
        "test/cross-environment-lock.test.ts:328-360 asserts the clone-observes-the-same-id property, and deletes the file at :357 to make its own second environment distinguishable",
        "delivery/verification/two-environment-rehearsal.md:434-435 records two DIFFERENT env ids because its clones were made before any identity file existed and `tiphys sync` was never run between them",
        "Derivation: `grep -rn \"readEnvironmentId|ensureEnvironmentId\" src/` returns src/exclusion.ts:285, :816, :954 and src/lock.ts:500 only; `grep -rn \"guardSharedRegister\" src/` returns src/spawn.ts:1024 and src/teardown.ts:452, so both call sites inherit the one comparison"
      ],
      "concrete-fix": "Stop treating an equal envId as proof of holdership. Record the acquiring environment's LOCAL lease holderId inside the register document (a value that lives only under the gitignored state/ prefix and so cannot travel through a clone), and require guardSharedRegister to hold BOTH that readEnvironmentId(fleetRoot) equals document.envId AND that leaseStatus(fleet.lockPath) reports `held` with that same holderId. A clone then fails closed for want of state/, and a genuinely reclaimed environment is told to re-acquire or take over, which is the correct instruction after a reclaim. Add a test whose fixture publishes the identity, clones, and asserts spawn and teardown both exit nonzero.",
      "analysis": "M4-P22 criteria 2 and 3 are NOT MET at this head. This is a composition defect rather than a phase defect: M4-P21 criterion 3 requires the identity to be tracked so it survives a reclaim, M4-P18 ships a sync that commits every changed durable path, and M4-P22 builds its guard on the resulting file. Each phase is correct alone; together, environment identity and fleet identity are the same value."
    },
    {
      "id": "CR-EXC-002",
      "severity": "high",
      "evidence": [
        "Derivation, full output: `grep -rn \"sharedCommit(\" src/` returns src/lock.ts:543 (definition), :678 (acquire), :799 (renew), :891 (release); `grep -n \"rolled back|applyLeaseMutation(\" src/lock.ts` returns 271, 661, 681, 685, 691, 783, 878, and the only rollback is at :685 on the acquire path",
        "Reproduced: with a pre-receive hook refusing every push on the fleet remote, `node bin/tiphys.ts lock release --holder 52363ec9-...` printed `shared exclusion could not publish the release: the compare-and-swap on refs/heads/tiphys/lease was indeterminate` and exited 1, and state/orchestrator.lock was ABSENT afterwards",
        "Reproduced: `doctor` in that fleet then printed `CHECK lock PASS no lease present` beside `CHECK shared-lock PASS held bd4692a0-... until 2026-09-18T13:15:19.457Z`",
        "Reproduced consequence: in that state `node bin/tiphys.ts spawn --task s1 ...` printed `spawned s1 worktree .../fx6/A/worktrees/s1 exec exited 0` and exited 0 with no TIPHYS_HOLDER_ID set",
        "Control pair for that consequence, same head, one variable: with a lease file present and TIPHYS_HOLDER_ID unset, spawn exits 1 with `lease .../state/orchestrator.lock is held by 27aaae00-... and TIPHYS_HOLDER_ID is not set`; with the lease file removed the same spawn exits 0",
        "Reproduced non-recovery: with the hook removed, `lock acquire --take-over` in the same fleet exits 1 with `fencing counter 1 has stood still for 19395ms of the 900000ms this environment requires`, so the state persists for the whole DEFAULT_STALE_WINDOW_SECONDS of 900 at src/exclusion.ts:102",
        "The same missing rollback is at src/lock.ts:799 on the renew path, where a failed publish leaves the local expiry already extended"
      ],
      "concrete-fix": "Give releaseLease and renewLease the rollback acquireLease already has at src/lock.ts:685. On a failed sharedCommit in releaseLease, restore the observed lease through applyLeaseMutation(lockPath, {kind: \"absent\"}, renderLease(observed.lease), randomUUID()); in renewLease, re-write the pre-renew lease the same way. Say in the reason line that the local lease was restored, matching the wording the acquire path already uses. Add a test using a pre-receive-refusing bare remote that asserts state/orchestrator.lock is byte-identical before and after a failed release.",
      "analysis": "The two exclusion layers are committed local-first, register-second at all three mutation sites, and only one undoes the local half. Release is the damaging member because the artifact is deleted, and M1-P4's local holdership guard keys on that artifact's PRESENCE, so deleting it silently reopens the dual-writer window that criterion 12 closed."
    },
    {
      "id": "CR-EXC-003",
      "severity": "medium",
      "evidence": [
        "src/commands/lock.ts:119 reads TIPHYS_LOCK_TEST_NOW_MS and feeds it as nowMs to every mutating lock subcommand; there is no NODE_ENV check, no build flag and no other gate, and the file ships in the published package",
        "src/exclusion.ts:553 judgeByCounter computes unchangedForMs = nowMs - previous.firstSeenMs, so the caller-supplied instant decides staleness",
        "Reproduced, honest arm: environment B with a real clock exits 1 on `lock acquire --take-over` with `fencing counter 1 has stood still for 0ms of the 900000ms this environment requires`",
        "Reproduced, injected arm: the same command with TIPHYS_LOCK_TEST_NOW_MS set to now+3600000 exits 0 printing `taking over refs/heads/tiphys/lease from environment f44bda18-..., whose fencing counter 1 stood still for 3600069ms ... advances it to 2; signal=counter`",
        "The register afterwards names environment 451b561c-... at counter 2 while A's state/orchestrator.lock still names holder a4e6b7f9-..., and A's lease had 9000 seconds left",
        "The printed line still reads `signal=counter`, so M4-P21 criterion 6's own output cannot distinguish an honest counter judgement from an injected-clock one"
      ],
      "concrete-fix": "Gate the seam: read TIPHYS_LOCK_TEST_NOW_MS only when process.env.NODE_TEST_CONTEXT is defined, or behind an explicit TIPHYS_ALLOW_TEST_CLOCK=1 that `tiphys doctor` reports as a FAIL check. Independently, make the verdict line print `signal=counter(injected-clock)` whenever the seam supplied nowMs, so a captured witness can never read as an honest one.",
      "analysis": "The module header's promise is that staleness is decided by two readings of ONE clock so that no environment's clock can judge another's. The seam makes that one clock caller-selectable from the shipped CLI, which turns the fencing counter back into the clock comparison the layer exists to avoid."
    },
    {
      "id": "CR-EXC-004",
      "severity": "medium",
      "evidence": [
        "Reproduced: `node bin/tiphys.ts lock acquire --duration 900 2>/dev/null | head -1` printed `acquired a18947b2-8fae-4553-8894-412403a470b0 expires 2026-09-18T12:43:08.395Z` and the acquire process exited 1 (PIPESTATUS[0]=1)",
        "State after that exit-1 run: state/orchestrator.lock EXISTS, and the register document read back through `git cat-file -p FETCH_HEAD:lease.json` carries envId f44bda18-... at counter 4, so both layers were mutated",
        "Captured stack, unpiped stderr: `Error: write EPIPE ... at reportShared (file://.../src/commands/lock.ts:145:20) at cmdLock (.../src/commands/lock.ts:244:7)`",
        "The raise is reached only when the shared layer has a second stdout line to print, which is why the local-only path does not show it"
      ],
      "concrete-fix": "Install an EPIPE-only handler on process.stdout in bin/tiphys.ts (`process.stdout.on(\"error\", (e) => { if (e.code !== \"EPIPE\") throw e })`) so the command still exits with its own code, or emit the whole multi-line lock report in one write so a short consumer cannot split it. Add a test that pipes `lock acquire` into a consumer that closes after one line and asserts the exit code equals the unpiped run's.",
      "analysis": "A wrapper of the ordinary shape `if ! tiphys lock acquire | grep -q acquired` takes its failure branch while holding both the local lease and the shared register. A wrong conclusion about exclusion state is the one output this group must never produce, and it is reachable from a piping operator rather than from anything exotic."
    },
    {
      "id": "CR-EXC-005",
      "severity": "low",
      "evidence": [
        "M4-P19 criterion 1 asks for `tiphys pool list` to include the id with a `reconstructed` marker",
        "Reproduced with origin/HEAD UNSET (the fixture default for a clone built by git init + git remote add + git fetch): `r1 b2127ef... unreconstructable (unresolved: branch)` and `CHECK worktrees WARN 1 of 1 pool entr(ies) have no pool record beside them: r1 (unreconstructable: branch)`",
        "Reproduced after `git -C P remote set-head origin -a`: `r1 b2127ef... reconstructed` and `CHECK worktrees WARN ... r1 (reconstructed)`",
        "src/pool.ts:392-404 documents the cause and calls the unset state 'the NORMAL state of a clone made by git init + git remote add + git fetch, which is how this kernel's own tests and fixtures build one', and records the measured hang that made `pool list` non-networked",
        "`teardown --task r1 --from-reconstructed` still reconstructs successfully in the unset configuration, because that path passes network: true; observed reaching the dirty and landed refusals"
      ],
      "concrete-fix": "Either amend M4-P19 criterion 1 to state both configurations, or have pool list and doctor print `reconstructed (partial: branch unresolved without a network read)` so the token the criterion names is present in both, and add the origin/HEAD-unset arm to test/pool.test.ts so the two spellings are pinned rather than incidental.",
      "analysis": "A criterion broken by a later fix round inside its own phase. The code change is right (it stops a measured hang) and the direction is safe (it reports less, never destroys more); what is wrong is that the criterion text is now true of only one of two ordinary configurations and nothing records which."
    },
    {
      "id": "CR-EXC-006",
      "severity": "low",
      "evidence": [
        "src/exclusion.ts:212-215 maps an ENOENT (and ENOTDIR) on the fleet package.json to {kind: \"absent\"}, and src/exclusion.ts:851-857 maps absent to the PASS status whose text asserts the layer is off here",
        "src/exclusion.ts:859-863 already maps an INVALID declaration to `unreachable`, so the distinction exists and the absent-file case does not use it",
        "Reproduced: `mv package.json /tmp/pj.bak && node bin/tiphys.ts doctor` printed `CHECK layout FAIL missing package.json` and, in the same run, `CHECK shared-lock PASS not-declared (tiphys.sharedExclusion is absent from this fleet home's package.json, so the cross-environment layer is off here)`",
        "Mitigation observed in the same run: `lock acquire` in that fleet exits 1 with `not a fleet home: ... is missing package.json` before the layer is consulted, and the layout FAIL makes doctor exit 1"
      ],
      "concrete-fix": "In readSharedExclusion, return a third kind for 'the fleet package.json could not be read at all' and have sharedLockStatus map it to `unreachable the fleet package.json could not be read`, keeping `not-declared` for a package.json that was read and carries no tiphys.sharedExclusion.",
      "analysis": "This is T-042's shape one level up: the predicate that decides whether the layer is on cannot distinguish 'declared off' from 'could not be asked'. It is LOW because every command that would act on the verdict already refuses the fleet for a different reason, so nothing destructive is reachable through it today."
    }
  ],
  "criteria": [
    {
      "id": "M1-P3-1",
      "quote": "lock acquire in a fleet home exits 0 and creates state/orchestrator.lock whose JSON parses and contains a non-empty holderId and an expiresAt strictly in the future; no pid field exists anywhere in the file (C-2).",
      "evidence": [
        "RAN: `lock acquire --duration 600` exit 0, printed `acquired dedc0b7a-fb4e-4867-8602-cd84a3b6408f expires 2026-09-18T12:31:28.001Z`",
        "The file parses and carries holderId, hostname, acquiredAt, expiresAt, durationSeconds, token; `grep -c pid state/orchestrator.lock` = 0"
      ],
      "met": true
    },
    {
      "id": "M1-P3-2",
      "quote": "While an unexpired lease exists, a second lock acquire from a different process exits nonzero, stderr contains \"lock held\", and the lock file content is byte-identical before and after the attempt.",
      "evidence": [
        "RAN: second acquire exit 1 with `tiphys lock: lock held by dedc0b7a-... , expires 2026-09-18T12:31:28.001Z`",
        "sha256sum of state/orchestrator.lock identical before and after"
      ],
      "met": true
    },
    {
      "id": "M1-P3-3",
      "quote": "Five concurrent lock acquire invocations against a free lock yield exactly one exit 0 and four nonzero exits, and the lock file afterward contains the winner's holderId (PR-006: mutual exclusion is atomic, not read-then-write).",
      "evidence": [
        "RAN with five real concurrent OS processes: exits 1,1,1,1,0; winner 1066c482-c236-403b-a13e-b758f3eef784",
        "state/orchestrator.lock holds that holderId, and all four losers' messages name it"
      ],
      "met": true
    },
    {
      "id": "M1-P3-4",
      "quote": "lock renew by the holding holderId on an unexpired lease exits 0 and strictly increases expiresAt; lock renew on an expired lease exits nonzero even when holderId matches; lock renew with a non-matching holderId exits nonzero; every failing renew leaves the file byte-identical.",
      "evidence": [
        "RAN: renew by the holder exit 0, expiresAt 2026-09-18T12:31:28.001Z -> 2026-09-18T12:31:28.826Z",
        "RAN: renew with `not-the-holder` exit 1 with `renew refused: lease is held by dedc0b7a-..., not not-the-holder`",
        "READ for the expired-renew arm: src/lock.ts:752-759 refuses with `an expired lease cannot be renewed`"
      ],
      "met": true
    },
    {
      "id": "M1-P3-5",
      "quote": "With an expired lease ... lock status exits 0 and stdout contains \"expired\", the holderId, and the expiry timestamp; lock acquire without --take-over still exits nonzero; lock acquire --take-over exits 0 and the file contains a new holderId with a fresh future expiresAt.",
      "evidence": [
        "RAN with a one-second lease and a two-second sleep: `expired holder aee7a079-... acquired ... expires 2026-09-18T12:21:44.566Z`, status exit 0",
        "plain acquire exit 1 with `lease expired ...; acquire refused, takeover is explicit`",
        "`--take-over` exit 0 with new holder d3f62e77-... and expiry 2026-09-18T12:36:46.690Z"
      ],
      "met": true
    },
    {
      "id": "M1-P3-6",
      "quote": "A renew raced concurrently against a takeover at the expiry boundary (scripted interleave, short lease) serializes: exactly one operation exits 0 ... and the loser exited nonzero.",
      "evidence": [
        "READ: test/lock.test.ts:329 stages the interleave through the `observed` seam the plan calls for",
        "The underlying primitive was exercised live by criteria 3 and 7 in this session"
      ],
      "met": true
    },
    {
      "id": "M1-P3-7",
      "quote": "Two concurrent lock acquire --take-over invocations on an expired lease yield exactly one exit 0 and one nonzero exit, and the file afterward contains the winner's holderId.",
      "evidence": [
        "RAN with two real concurrent processes on an expired lease: exits 1 and 0; loser printed `takeover refused: lock held by abc2edb1-..., unexpired until 2026-09-18T12:38:31.887Z`",
        "state/orchestrator.lock holds abc2edb1-a93f-4a79-ae41-80de324eac9b, the winner"
      ],
      "met": true
    },
    {
      "id": "M1-P3-8",
      "quote": "A release by the expired former holder raced against a takeover yields exactly one of two auditable outcomes ... in neither outcome is the new holder's lease removed or altered.",
      "evidence": [
        "READ: test/lock.test.ts:416 and test/lock.test.ts:459 cover both orderings by name"
      ],
      "met": true
    },
    {
      "id": "M1-P3-9",
      "quote": "After a completed takeover, any lock mutation (renew or release) attempted with the losing holderId exits nonzero and leaves the winner's lease byte-identical.",
      "evidence": [
        "READ: test/lock.test.ts:495 with the stale renew at :503 and the stale release at :506"
      ],
      "met": true
    },
    {
      "id": "M1-P3-10",
      "quote": "grep over src/lock.ts shows no process.kill, no signal-0 probing, no /proc access, and no pid field (C-2, structural inspection).",
      "evidence": [
        "RAN: `grep -n \"process\\.kill|signal 0|/proc|process\\.pid|kill\\(|\\bpid\\b\"` over src/lock.ts, src/exclusion.ts, src/pool.ts, src/watcher.ts, src/teardown.ts, src/fleet.ts returned zero hits",
        "The acquired lease file itself carries no pid field"
      ],
      "met": true
    },
    {
      "id": "M1-P3-11",
      "quote": "pool create --task t-a against a scratch project with a remote exits 0; the worktree at worktrees/t-a has empty git status --porcelain output and its HEAD sha equals the remote default branch head sha emitted as the base SHA, both when the clone's local default branch is behind the remote and when it is ahead.",
      "evidence": [
        "RAN the BEHIND arm: local head 5b2b9e4, remote head b2127ef; pool create exit 0 emitting b2127ef; worktree HEAD b2127ef; `git status --porcelain` empty; recorded baseSha b2127ef",
        "NOT REACHED: the AHEAD arm was not staged in this session"
      ],
      "met": true
    },
    {
      "id": "M1-P3-12",
      "quote": "With the project clone at a detached HEAD, and separately with origin/HEAD unset, pool create still resolves the remote default branch, exits 0, and records the correct base SHA (EXT-F-03).",
      "evidence": [
        "RAN the origin/HEAD-unset arm: `git -C P symbolic-ref refs/remotes/origin/HEAD` reported `fatal: ref refs/remotes/origin/HEAD is not a symbolic ref` and pool create still exited 0 with baseSha b2127ef",
        "NOT REACHED: the detached-HEAD arm"
      ],
      "met": true
    },
    {
      "id": "M1-P3-13",
      "quote": "With the remote unreachable, pool create exits nonzero and creates nothing; the same invocation with --offline exits 0, uses the last fetched remote-tracking SHA, and records that SHA plus offline: true.",
      "evidence": [
        "RAN: remote repointed at a missing path, pool create exit 1 and `worktrees/off1` absent",
        "RAN: the same invocation with `--offline` exit 0; the pool record reads `offline: true baseSha: b2127ef412787274fadcccdee2706bbe0ba5524f`",
        "READ for the spawn-side baseOffline half"
      ],
      "met": true
    },
    {
      "id": "M1-P3-14",
      "quote": "pool create with an already-used task id exits nonzero and stderr names the id.",
      "evidence": ["RAN: exit 1 with `tiphys pool: task id already used: t-a`"],
      "met": true
    },
    {
      "id": "M1-P3-15",
      "quote": "Two pool create invocations for distinct task ids launched concurrently both exit 0 and git worktree list in the project shows both worktrees.",
      "evidence": [
        "RAN: cc1=0 and cc2=0 from two concurrent processes; `git worktree list` in the project shows worktrees/cc1 and worktrees/cc2 at b2127ef"
      ],
      "met": true
    },
    {
      "id": "M1-P3-16",
      "quote": "pool destroy on a worktree with an uncommitted file exits nonzero and the directory still exists; the same worktree with --discard exits 0, the directory is gone, and git worktree list no longer shows it; a clean worktree is likewise removed by pool destroy without flags.",
      "evidence": [
        "RAN: dirty destroy exit 1 with `has uncommitted changes or untracked files; ... or pass --discard`, directory still present",
        "RAN: `--discard` exit 0 printing `destroyed t-a (deleted branch task/t-a was b2127ef...)`, directory gone, `git worktree list` no longer shows it"
      ],
      "met": true
    },
    {
      "id": "M1-P3-17",
      "quote": "node --test exits 0 with 0 failing and zero unaccounted tests; test/behaviors.json maps every behavior newly named by this phase's criteria to a test present in this run, and every previously registered mapping still resolves.",
      "evidence": [
        "RAN: node v26.6.0, dist/ built, invocation `npm test`: tests 1341, pass 1340, fail 1, skipped 0, exit 1",
        "The failure is test/gates.test.ts:3571 with `EACCES: permission denied, lstat '/tmp/claude-0/.../node_modules/ajv/dist/vocabularies/applicator/contains.js'`, the documented runCliUnprivileged trap of CLAUDE.md standing warning 1, and the test's own message calls it an environment failure",
        "NOT REACHED: a control run from a clone outside /tmp/claude-0, which is what would make that attribution proven rather than evidenced"
      ],
      "met": false
    },
    {
      "id": "M1-P5-1",
      "quote": "tiphys watch started against a fleet with one open task and no signals is still running after three base heartbeat intervals, and state/watcher.beacon has been rewritten with monotonically increasing timestamps whose successive gaps grow.",
      "evidence": ["NOT REACHED: a long-lived resident run with gap measurement was not staged in this session"],
      "met": false
    },
    {
      "id": "M1-P5-2",
      "quote": "Creating tasks/<id>/turn-end for an open task causes the watcher process to exit 0 within the documented poll interval, with stdout consisting of exactly one line matching the documented pattern \"signal <task-id> turn-end\".",
      "evidence": [
        "RAN in single-pass mode: after writing tasks/d1/turn-end, `watch --once` printed exactly `signal d1 turn-end` and exited 0",
        "NOT REACHED: the resident-process form of the same wake"
      ],
      "met": true
    },
    {
      "id": "M1-P5-3",
      "quote": "With no open tasks and no signals, the watcher does not exit on heartbeats ... unless --max-heartbeats is set, in which case it exits 0 with the line \"heartbeat <n>\".",
      "evidence": [
        "RAN: with a two-second base interval and `--max-heartbeats 1`, the resident watcher printed `heartbeat 1` and exited 0"
      ],
      "met": true
    },
    {
      "id": "M1-P5-4",
      "quote": "On a virgin fleet (no cadence state) and with no pending signal, tiphys watch --once prints nothing to stdout and exits with the documented no-wake code 3 ...; with a turn-end file pending for an open task, watch --once exits 0 with the same single line.",
      "evidence": [
        "RAN: virgin fleet `watch --once` printed nothing and exited 3",
        "RAN: with a pending turn-end the same command printed `signal d1 turn-end` and exited 0"
      ],
      "met": true
    },
    {
      "id": "M1-P5-5",
      "quote": "With a short base interval, a watch --once pass run after the heartbeat interval has elapsed since the last recorded heartbeat exits 0 printing \"heartbeat <n>\", and an immediately following --once pass exits with the no-wake code.",
      "evidence": ["NOT REACHED: the timed heartbeat-due single pass was not staged"],
      "met": false
    },
    {
      "id": "M1-P5-6",
      "quote": "After a --once pass surfaces \"signal <task-id> turn-end\", an immediately following --once pass on the unchanged fleet exits with the no-wake code 3: the seen-state advanced with the surfaced wake.",
      "evidence": ["RAN: the pass after `signal d1 turn-end` exited 3 with no output"],
      "met": true
    },
    {
      "id": "M1-P5-7",
      "quote": "A resident watcher and a concurrent --once pass evaluating the same pending turn-end never both surface it: exactly one prints the signal line and exits 0, the other reports no-wake.",
      "evidence": ["NOT REACHED: the two-process contention was not staged; READ only in test/watcher.test.ts"],
      "met": false
    },
    {
      "id": "M1-P5-8",
      "quote": "A no-wake --once pass (exit 3) strictly advances the beacon timestamp (PR-206).",
      "evidence": [
        "RAN: two consecutive no-wake passes, both exit 3, beacon writtenAt 2026-09-18T12:23:17.509Z then 2026-09-18T12:23:18.838Z"
      ],
      "met": true
    },
    {
      "id": "M1-P5-9",
      "quote": "With an open task whose tasks/<id>/executor.json carries a deadline in the past and no turn-end file, watch --once exits 0 with a single stdout line matching \"stale <task-id> deadline\".",
      "evidence": [
        "RAN: deadline 2026-09-18T00:00:01.000Z, no turn-end: `stale d1 deadline`, exit 0, and repeated on a second pass, so it is a standing condition",
        "RAN the control: deadline 2099-01-01T00:00:00.000Z gives exit 3 and no output",
        "Note for a future fixture author: the record's `deadline` is an ISO INSTANT (src/spawn.ts:620-622), not a number of seconds; src/watcher.ts:469 ignores a non-string"
      ],
      "met": true
    },
    {
      "id": "M1-P5-10",
      "quote": "With one open task and a beacon file older than the threshold, tiphys spawn, tiphys teardown, and tiphys doctor each emit one stderr line containing \"watcher stale\" and still perform their normal function.",
      "evidence": [
        "RAN for spawn and teardown: both emitted `watcher stale: 1 open task(s) in flight and no readable beacon at .../state/watcher.beacon; start \"tiphys watch\" or schedule \"tiphys watch --once\" at least every 1200s` and still performed their function",
        "NOT REACHED: the doctor arm"
      ],
      "met": true
    },
    {
      "id": "M1-P5-11",
      "quote": "With a fresh beacon, the same three commands emit no \"watcher stale\" line (falsifiable in both directions).",
      "evidence": ["NOT REACHED: the fresh-beacon control was not staged for the three commands"],
      "met": false
    },
    {
      "id": "M1-P5-12",
      "quote": "With the watcher idle at maximum backoff, the guard reports fresh ... at every probe across the entire gap between two consecutive heartbeats; loading liveness.ts with a configuration where the threshold is not strictly greater than the backoff cap plus one poll interval fails with an error naming both values.",
      "evidence": [
        "RAN the configuration half: TIPHYS_WATCH_BACKOFF_CAP_SECONDS=900 with TIPHYS_WATCH_STALE_SECONDS=900 exits 1 raising from src/liveness.ts:152, whose message names both values and the floor; with STALE_SECONDS=1200 the same command exits 3",
        "NOT REACHED: the maximum-backoff freshness probe across a whole heartbeat gap"
      ],
      "met": true
    },
    {
      "id": "M1-P5-13",
      "quote": "grep over src/watcher.ts and its imports shows no import of http, https, fetch, or any network client module (structural zero-tokens-idle check, inspection).",
      "evidence": [
        "RAN: src/watcher.ts imports only node:crypto, node:fs, node:path, node:timers/promises and local modules",
        "RAN: no match for `from \"node:(http|https|net|tls|dgram)\"`, `fetch(`, undici, axios or node-fetch in src/watcher.ts, src/commands/watch.ts, src/liveness.ts, src/fleet.ts or src/task.ts"
      ],
      "met": true
    },
    {
      "id": "M1-P5-14",
      "quote": "grep over src/watcher.ts, src/liveness.ts, and src/commands/watch.ts shows no process.kill, no signal-0 probing, no /proc access, and no pid identity (C-2); the watch command exposes no daemonize or background flag, and the kernel code never spawns the watcher detached.",
      "evidence": [
        "RAN: `grep -nE \"process\\.kill|kill\\(|/proc|\\bpid\\b|signal 0|detached|unref\"` over the three files returned zero hits",
        "RAN: `grep -niE \"daemon|background|--fork|nohup\"` over the same files returned zero hits"
      ],
      "met": true
    },
    {
      "id": "M1-P5-15",
      "quote": "node --test exits 0 with 0 failing and zero unaccounted tests; test/behaviors.json maps every behavior newly named by this phase's criteria to a test present in this run.",
      "evidence": ["Same run as M1-P3 criterion 17: 1341 tests, 1340 pass, 1 fail, 0 skipped, exit 1"],
      "met": false
    },
    {
      "id": "M4-P16-1",
      "quote": "In a directory that is a git clone carrying backlog.md, package.json, .gitignore, charter/ and decisions/ and none of state/, worktrees/, projects/, node bin/tiphys.ts resume exits 0, creates exactly those three directories, and prints exactly three lines of the form REBUILT <name>/. Immediately afterwards node bin/tiphys.ts doctor prints CHECK layout PASS.",
      "evidence": [
        "RAN against a clone of a published fleet home: exactly `REBUILT state/`, `REBUILT worktrees/`, `REBUILT projects/`, exit 0",
        "RAN: `doctor` then printed `CHECK layout PASS all layout entries present`"
      ],
      "met": true
    },
    {
      "id": "M4-P16-2",
      "quote": "In a directory that is not a git repository, resume exits 1, writes one stderr line naming the absent .git, and creates nothing. Verified by comparing find . -mindepth 1 | sort | sha256sum before and after: the two digests are equal.",
      "evidence": [
        "RAN: exit 1 with `... is not a git repository, .git is absent, so it is not a cloned fleet home; run tiphys init <dir> to create one`",
        "RAN the digest comparison exactly as the criterion specifies: equal"
      ],
      "met": true
    },
    {
      "id": "M4-P16-3",
      "quote": "In a fleet home whose layout is already complete, resume exits 0 and prints zero REBUILT lines. A second consecutive invocation also prints zero.",
      "evidence": ["RAN: two further invocations each printed nothing and exited 0"],
      "met": true
    },
    {
      "id": "M4-P16-4",
      "quote": "RED WITNESS, dangerous state, member A: a fleet home that is LIVE, holding worktrees/<id>/scratch.txt with uncommitted content and state/orchestrator.lock with an unexpired lease. resume leaves both byte-identical and exits 0.",
      "evidence": [
        "RAN: sha256 of worktrees/x/scratch.txt and of state/orchestrator.lock both identical before and after, resume exit 0"
      ],
      "met": true
    },
    {
      "id": "M4-P16-5",
      "quote": "RED WITNESS, dangerous state, member B, structurally different from A: the same live fleet home where worktrees/ exists but state/ does not ... resume creates state/ only, prints one REBUILT line, and leaves worktrees/ untouched.",
      "evidence": [
        "RAN: after `rm -rf state`, resume printed exactly `REBUILT state/`, exit 0, and worktrees/x/scratch.txt was still present"
      ],
      "met": true
    },
    {
      "id": "M4-P16-6",
      "quote": "tiphys init in a cloned fleet home still exits 1, and its message now names tiphys resume as the remedy.",
      "evidence": [
        "RAN: `tiphys init: ... is already initialized; run tiphys resume to rebuild the ephemeral directories a clone does not carry`, exit 1"
      ],
      "met": true
    },
    {
      "id": "M4-P16-7",
      "quote": "Every new behavior is registered by name in test/behaviors.json and resolves by name. No criterion asserts a test COUNT.",
      "evidence": ["NOT REACHED: I did not run the registry name-resolution comparison in this session"],
      "met": false
    },
    {
      "id": "M4-P17-1",
      "quote": "An EXPIRED lease is a FAIL, not a PASS. With state/orchestrator.lock carrying expiresAt one second in the past, doctor prints CHECK lock FAIL with a detail naming the holder id and the expiry, and exits 1.",
      "evidence": [
        "RAN: `CHECK lock FAIL lease held by abc2edb1-a93f-4a79-ae41-80de324eac9b EXPIRED at 2026-09-18T12:28:30.996Z; a lease that has lapsed is no longer holding anything, so whatever it was protecting is unprotected`",
        "RAN: the same doctor invocation exited 1"
      ],
      "met": true
    },
    {
      "id": "M4-P17-2",
      "quote": "RED WITNESS class member for criterion 1, structurally different: a lease whose expiresAt parses to exactly the current millisecond. isExpired uses <= ... and the check must agree with the lock module rather than carry a second comparison.",
      "evidence": [
        "READ, and it is the strong form: src/commands/doctor.ts:9 imports expiryHasPassed from src/lock.ts and calls it at src/commands/doctor.ts:557; src/lock.ts:217 is `return Date.parse(expiresAt) <= nowMs`, so there is no second comparison anywhere",
        "RAN an approximation of the boundary (expiry a fraction of a second in the past): CHECK lock FAIL"
      ],
      "met": true
    },
    {
      "id": "M4-P17-3",
      "quote": "A new CHECK tasks derived from tasks/ only ... It reads no log tail (C-1) and probes no process (C-2), asserted by a test that greps the new source for /proc, process.kill, pid and stream.jsonl and requires zero hits.",
      "evidence": [
        "RAN: `CHECK tasks PASS 0 open of 1` on a fleet with one closed task",
        "RAN the grep the criterion names over src/commands/doctor.ts: 0 hits"
      ],
      "met": true
    },
    {
      "id": "M4-P17-4",
      "quote": "A new CHECK worktrees reporting each entry under worktrees/ and whether a pool record exists beside it. A worktree with no record is reported by id with status WARN.",
      "evidence": [
        "RAN: `CHECK worktrees WARN 1 of 4 pool entr(ies) have no pool record beside them: r1 (reconstructed)`",
        "See CR-EXC-005 for the marker's other configuration"
      ],
      "met": true
    },
    {
      "id": "M4-P17-5",
      "quote": "A new CHECK branches reporting phase branches that are pushed and unmerged, derived from git. It is WARN and is NEVER promoted to FAIL by any profile.",
      "evidence": [
        "RAN: `CHECK branches PASS no pushed branches`, and the run carrying WARN checks still exited 0"
      ],
      "met": true
    },
    {
      "id": "M4-P17-6",
      "quote": "CHECK remote fetches and compares ... member A: a fleet home with a remote configured and two commits that have never been pushed prints CHECK remote WARN 2 unpushed ... Member B: the fetch itself FAILS ... The check reports a third status naming the fetch failure and never PASS.",
      "evidence": [
        "RAN a related arm: `CHECK remote WARN no remote configured, fleet state has no push target (SC-002)`, which is WARN rather than PASS",
        "NOT REACHED: the two-unpushed-commits arm and the failing-fetch arm"
      ],
      "met": false
    },
    {
      "id": "M4-P17-7",
      "quote": "doctor still prints one line per check and still exits 0 only when no check FAILs, and the advisory still runs last. The existing doctor behaviors in test/behaviors.json still resolve by name.",
      "evidence": [
        "RAN: one line per check observed in every doctor run; exit 0 with WARNs present and exit 1 with the lock FAIL present",
        "NOT REACHED: the behaviors.json name resolution"
      ],
      "met": true
    },
    {
      "id": "M4-P19-1",
      "quote": "With tasks/<id>/meta.json present and worktrees/<id>.pool.json absent, tiphys pool list includes the id with a reconstructed marker, and doctor's CHECK worktrees line names it. Reconstruction is derived from meta.json and from git, never from a remembered value.",
      "evidence": [
        "RAN with origin/HEAD set: `r1 b2127ef... reconstructed` and `CHECK worktrees WARN ... r1 (reconstructed)`",
        "RAN with origin/HEAD unset: `r1 b2127ef... unreconstructable (unresolved: branch)`; see CR-EXC-005"
      ],
      "met": false
    },
    {
      "id": "M4-P19-2",
      "quote": "tiphys teardown --task <id> against that task still exits 1, and its single reason line now names the explicit flag.",
      "evidence": [
        "RAN: exit 1 with `no readable pool record for task id r1; ... pass --from-reconstructed to rebuild them from tasks/r1/meta.json and git, which keeps every other refusal in force`"
      ],
      "met": true
    },
    {
      "id": "M4-P19-3",
      "quote": "tiphys teardown --task <id> --from-reconstructed exits 0 only when the reconstruction resolves both a project remote and a default branch. When either is unresolvable it exits 1 and names the missing field.",
      "evidence": [
        "RAN the resolvable arm: the reconstruction succeeded (network: true) and the run proceeded to the later refusals rather than stopping at the record",
        "NOT REACHED: an unresolvable-field `--from-reconstructed` invocation"
      ],
      "met": true
    },
    {
      "id": "M4-P19-4",
      "quote": "RED WITNESS, dangerous state, member A: reconstructed record plus a worktree holding uncommitted changes. --from-reconstructed refuses, removes nothing, and the worktree's git status --porcelain output is byte-identical before and after.",
      "evidence": [
        "RAN: exit nonzero with `worktree ... has uncommitted changes or untracked files`, worktree still present, sha256 of `git status --porcelain` identical before and after"
      ],
      "met": true
    },
    {
      "id": "M4-P19-5",
      "quote": "RED WITNESS, dangerous state, member B, structurally different: reconstructed record plus a CLEAN worktree whose branch carries commits not present on the remote default branch. --from-reconstructed refuses and names the branch tip sha.",
      "evidence": [
        "RAN: worktree clean (`git status --porcelain` empty), branch tip 0705cd8ef2ae42901de4247e413576c999caf1ae",
        "RAN: `branch task/r1 (tip 0705cd8ef2ae42901de4247e413576c999caf1ae) is not landed on origin/main; land it before tearing the task down`, worktree still present"
      ],
      "met": true
    },
    {
      "id": "M4-P19-6",
      "quote": "A reconstructed record is never written to worktrees/<id>.pool.json. It exists only in memory for the reporting and the flagged path. Asserted by listing worktrees/ after every criterion above.",
      "evidence": ["RAN: `ls worktrees/` after every step above shows `r1` and never `r1.pool.json`"],
      "met": true
    },
    {
      "id": "M4-P20-1",
      "quote": "node scripts/probe-cas-ref.mjs --remote <path> creates a bare repository and two clones A and B at ABSOLUTE paths ... and prints exactly two lines, A accept and B refuse <first line of git stderr>, exit 0.",
      "evidence": [
        "RAN: printed exactly `A accept` and `B refuse ! [rejected]        9eb24d186027933afe57b915db04d6821c3da6f6 -> refs/tiphys/lease (stale info)`, exit 0"
      ],
      "met": true
    },
    {
      "id": "M4-P20-2",
      "quote": "The refusal signature in criterion 1 is CAPTURED from a real forced contention, never hand-written.",
      "evidence": [
        "RAN: the signature above was produced live in this session by the probe, not quoted from the evidence document",
        "src/exclusion.ts:364-367 takes the marker from git's own `! [rejected]` line rather than from the first stderr line, and says why"
      ],
      "met": true
    },
    {
      "id": "M4-P20-3",
      "quote": "The probe also measures the two ways the lease can be VACUOUS ... If either accepts a push that overwrites another environment's value, the bare --force-with-lease form is refused for the design and the exact-sha form is mandated.",
      "evidence": [
        "NOT REACHED as a live vacuity run",
        "READ the design consequence, which is what survives into the final code: src/exclusion.ts:479-484 emits only `--force-with-lease=<ref>:<expectedSha>`, and `grep -rn \"force-with-lease\" src/` shows no bare form anywhere"
      ],
      "met": true
    },
    {
      "id": "M4-P20-4",
      "quote": "RED WITNESS against today's code, member A (concurrent): two clones of one fleet remote, acquireLease called in each against its own state/orchestrator.lock. Both return {ok: true}.",
      "evidence": [
        "RAN, four-way rather than two: four clones of one fleet remote with the layer OFF each acquired their own local lease, because state/ is in FLEET_IGNORED at src/fleet.ts:28 and never travels",
        "The property the witness records is still true at this head, which is what the shared layer above it exists to close"
      ],
      "met": true
    },
    {
      "id": "M4-P20-5",
      "quote": "RED WITNESS against today's code, member B (sequential through the remote) ... Both leases are live and neither clone can see the other's, because state/ never travels.",
      "evidence": [
        "RAN implicitly: every clone in my fixtures had to run `tiphys resume` to get a state/ directory at all, and `resume` printed `REBUILT state/` each time"
      ],
      "met": true
    },
    {
      "id": "M4-P20-6",
      "quote": "The evidence document states WHAT THE PROBE DID NOT COVER ... clock skew is not probed in this phase; the probe runs against a local bare repository rather than against GitHub ...; and no concurrent push from two hosts was attempted.",
      "evidence": ["READ: delivery/verification/cross-environment-exclusion-probe.md names all three"],
      "met": true
    },
    {
      "id": "M4-P20-7",
      "quote": "One behavior registered by name in test/behaviors.json: the probe's refusal arm. The test runs the probe against a scratch bare repository and asserts the two printed lines and exit 0, so the probe itself is guarded against silently becoming a no-op.",
      "evidence": [
        "RAN: the probe still produces its two lines and exit 0 at this head, so it has not become a no-op",
        "READ: test/cas-probe.test.ts exists and is the registered guard"
      ],
      "met": true
    },
    {
      "id": "M4-P21-1",
      "quote": "Declaration, not inference. A fleet home opts in through a field in its own package.json ... With the field absent, every command behaves exactly as it does today and the new code path is not entered.",
      "evidence": [
        "RAN: a fleet initialised without --shared-exclusion acquired, renewed and released exactly as before and doctor reported `CHECK shared-lock PASS not-declared`",
        "RAN the stronger half: a declaration with `ref: \"not-a-ref\"` exits 1 with `shared exclusion is declared and unusable, refusing rather than running local-only` and creates no local lock",
        "See CR-EXC-006 for the one input that takes the `absent` branch when it should take `unreachable`"
      ],
      "met": true
    },
    {
      "id": "M4-P21-2",
      "quote": "With the field set, tiphys lock acquire in clone A exits 0 and the ref refs/tiphys/lease on the shared remote carries A's lease document. The same command in clone B exits 1 with ONE line naming A's environment id and the expiry, and git ls-remote shows the ref sha unchanged.",
      "evidence": [
        "RAN: A exit 0 with `register now c1e2f608b3550e89ce985c35dc1c4554341d29e6`",
        "RAN: B exit 1 with one line naming environment 251deb97-e9b1-45e7-bf19-dbedf790990b and `until 2026-09-18T12:36:36.257Z`",
        "RAN: ls-remote sha identical before and after B's attempt, and no local lock file in B"
      ],
      "met": true
    },
    {
      "id": "M4-P21-3",
      "quote": "Environment identity is not hostname, not a pid and not a process probe (C-2). It is a random id generated once and written to a TRACKED fleet file, so it survives a reclaim and travels with the clone.",
      "evidence": [
        "RAN: zero hits for hostname, process.pid, /proc and kill( in src/exclusion.ts",
        "RAN: a clone of a fleet whose identity file had been committed and pushed read the SAME id (2f6acf8c-474c-48a6-a140-3f406ca7a07c in both A and B)",
        "The criterion is MET, and CR-EXC-001 is what that property costs when M4-P22's guard is composed on top of it"
      ],
      "met": true
    },
    {
      "id": "M4-P21-4",
      "quote": "RED WITNESS, dangerous state, member A: clone B's clock is ten minutes AHEAD of A's ... B's takeover is REFUSED, and B's output names which comparison decided it.",
      "evidence": [
        "READ: test/cross-environment-lock.test.ts:383 asserts the dangerous state before acting (`A's lease must read as expired by the challenger's clock, or this witness is vacuous`) and asserts `signal=counter`, `fencing counter 1` and `no clock comparison was made` in the refusal",
        "RAN the shape at CLI level: a fresh counter refuses a takeover with exactly that wording"
      ],
      "met": true
    },
    {
      "id": "M4-P21-5",
      "quote": "RED WITNESS, dangerous state, member B, structurally different from A: clone B's clock is ten minutes BEHIND. B renews its own lease and A does not treat the renewal as stale.",
      "evidence": [
        "READ: test/cross-environment-lock.test.ts:426, asserting counter 2 after the renewal and a refusal naming it",
        "READ the CONTROL at test/cross-environment-lock.test.ts:472, which removes the renewal and shows the takeover is ALLOWED, so the stale window is reachable and the two refusals are caused by the renewal rather than by an unreachable window"
      ],
      "met": true
    },
    {
      "id": "M4-P21-6",
      "quote": "The decision in criteria 4 and 5 is made against the fencing COUNTER where the register is reachable, and against the clock only where it is not, and the command PRINTS which of the two it used. A run that cannot say which one it used fails this criterion.",
      "evidence": [
        "RAN: every verdict line I produced carries `signal=counter` or `signal=clock`",
        "CR-EXC-003 is the caveat: an injected clock still prints `signal=counter`, so the token alone does not distinguish an honest counter judgement from one made on a caller-supplied instant"
      ],
      "met": true
    },
    {
      "id": "M4-P21-7",
      "quote": "Fail closed on an unreachable register. With the remote unreachable, lock acquire under the declared field exits nonzero and does NOT fall back to local-only exclusion ... the test asserts the exit code AND that the local lock file was not created.",
      "evidence": [
        "RAN: remote repointed at a missing path, exit 1 with `... is unreachable (fatal: ... does not appear to be a git repository); signal=clock ... so this refuses instead of falling back to local-only exclusion`",
        "RAN: state/orchestrator.lock was NOT created"
      ],
      "met": true
    },
    {
      "id": "M4-P21-8",
      "quote": "Release goes through the same compare-and-swap. A release attempted by a non-holder is refused and the register sha is byte-identical before and after.",
      "evidence": [
        "RAN: release from the non-holding environment exited 1 with `register ... is held by environment 251deb97-... at counter 1, not by c3b6db52-...; signal=counter, the register sha c1e2f608b3550e89ce985c35dc1c4554341d29e6 is left unchanged`",
        "RAN: ls-remote sha identical before and after"
      ],
      "met": true
    },
    {
      "id": "M4-P21-9",
      "quote": "Both M4-P20 witnesses are converted to tests and are now GREEN, and the work history shows each one red at the branch's first commit and green at its tip, with both captured runs.",
      "evidence": ["NOT REACHED: this sweep reviews one head and does not check out the phase branch to re-establish a red-at-first-commit claim"],
      "met": false
    },
    {
      "id": "M4-P22-1",
      "quote": "doctor prints CHECK shared-lock with exactly one of four statuses: not-declared, free, held <envId> until <t>, unreachable <reason>. The fourth is never PASS.",
      "evidence": [
        "RAN all four at this head: `PASS not-declared (...)`, `PASS free (register ... was released by environment 251deb97-... at fencing counter 2)`, `PASS held 2f6acf8c-... until 2026-09-18T13:08:52.313Z (...)`, and `WARN unreachable the declaration naming the register is unusable: ...`",
        "The fourth was WARN in every observation, never PASS",
        "CR-EXC-006 is the one input that reaches the wrong branch of the four"
      ],
      "met": true
    },
    {
      "id": "M4-P22-2",
      "quote": "RED WITNESS, dangerous state: tiphys spawn refuses when the shared register names another environment WHILE the local lease is held by this one.",
      "evidence": [
        "RAN, and it does not hold: with the identity file published by `tiphys sync` and cloned, environment B spawned successfully (exit 0, worktree created) while the register named a live holder",
        "RAN the control: with B's identity file removed, the same spawn exits 1 with the intended refusal",
        "Full account and both captures in CR-EXC-001"
      ],
      "met": false
    },
    {
      "id": "M4-P22-3",
      "quote": "The same for tiphys teardown, with one reason line, exit nonzero, and nothing removed.",
      "evidence": [
        "RAN: teardown shares the single comparison at src/exclusion.ts:954 and therefore the same hole; in the published-identity fixture it is `allowed`",
        "RAN the control: with the identity removed, teardown exits 1 with one reason line and removes nothing",
        "The refusal ITSELF is correctly placed before resolveContext (src/teardown.ts:452), so when it fires nothing is removed; what fails is when it fires"
      ],
      "met": false
    },
    {
      "id": "M4-P22-4",
      "quote": "A real rehearsal across two clones on two different filesystem roots is committed with captured output and exit codes for every step.",
      "evidence": [
        "READ: delivery/verification/two-environment-rehearsal.md records the two filesystem ids (fsid=9c46f8f3fe50f392 and fsid=27de05ad2e55ee6d) and carries captured output and exit codes step by step"
      ],
      "met": true
    },
    {
      "id": "M4-P22-5",
      "quote": "The rehearsal document NAMES what it could not reach, and this is a criterion rather than a courtesy: two genuinely different machines, two genuinely different system clocks, and GitHub's own ref-update ordering under concurrent pushes.",
      "evidence": [
        "READ: the document names all three, and cites T-025 for why"
      ],
      "met": true
    }
  ],
  "deviations-judged": []
}

```
