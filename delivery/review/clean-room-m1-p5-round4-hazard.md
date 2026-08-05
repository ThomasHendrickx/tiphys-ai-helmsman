# Clean-room review: M1-P5 fix round 4 (HAZARD contract)

- Date: 2026-08-05
- PR: 8
- Branch: `claude/m1-p5-watcher-liveness`
- Head reviewed: `84dfa41f8f92d90d6982ca97b3addebe7893ff75`
- Round diff: `1bdfce5..HEAD` (8 files). Phase diff: `origin/main...HEAD` (13 files).
- Reviewer: independent clean-room reviewer under the HAZARD contract. I did
  not see the implementation session and did not see the concurrent criteria
  reviewer's findings.
- Findings numbered from CR-560 to avoid collision with prior rounds and with
  the concurrent reviewer.

## VERDICT: FIX-ROUND-NEEDED

Two MEDIUM, four LOW, zero HIGH.

Both MEDIUM findings are RECORD defects. Neither needs a line of source
changed. The code this round shipped is, as far as I could break it, correct
and a genuine improvement: I re-derived the inventory from scratch, verified
all eleven of its rows before and after by execution, re-derived every red
witness, and independently reproduced the pre-existing defect the round
claims to have found. What is wrong is that the round's account of WHICH
paths remain exposed is incomplete in two places, and its commit subject
makes the same unqualified class claim that the round was convened to
correct in the previous commit subject.

I found a TWELFTH path in the class. It is out of this phase's authorized
file set, like the two the round escalated, and it is not in the escalation.

## Method

Hazard first, criteria only as regression spot-checks. Everything below
marked as evidence is my own execution in my own worktree with exit codes
captured; `timeout 8` (CLI probes) or a 15000ms `spawnSync` bound (suite
probes) was used throughout so a block reports as a code rather than as an
unexplained wait. I derived the read/write inventory myself by grepping every
`readFileSync`, `openSync`, `writeFileSync`, `appendFileSync`, `renameSync`,
`readdirSync` and `unlinkSync` in `src/` and `bin/` and tracing each site that
touches a path the kernel names, then attacked each with `mkfifo` against a
PRISTINE `1bdfce5` build and against this head, one path at a time, with a
healthy control run between. Mutations were applied to a byte copy of the
shipped source in a separate tree, never to this worktree, and restored with
`diff -r` verification. `--test-name-pattern` PRECEDED the positional path
everywhere, and every targeted run was checked for vacuity (see honest
failure 3).

All probes ran on the floor toolchain, Node v26.6.0 / npm 11.18.0, from
`.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin`.

## Isolation (T-004)

All work was done in the detached worktree at
`.../scratchpad/cr-r4-hazard` at `84dfa41`. Scratch fleets, the pristine
`1bdfce5` build (`git archive` + `npm ci` + `npm run build`, verified by
git object hash against `1bdfce5:src/*`), the mutation tree and every probe
directory live under `.../scratchpad/hz/`, outside the worktree and outside
any sibling reviewer's directory. Nothing under
`/home/user/tiphys-ai-helmsman` was written; nothing in `cr-r4-criteria` or
any other sibling was read or touched. `git status --porcelain` in this
worktree is EMPTY at the end of this review except for this file, which is
untracked and uncommitted by design. Nothing was committed or pushed.

## Gate evidence, BOTH toolchains

Floor toolchain (Node v26.6.0, npm 11.18.0), `dist/` removed before the
build:

| Gate | Exit | Observed |
|---|---|---|
| `npm ci` | 0 | 4 packages, 0 vulnerabilities, NO EBADENGINE line |
| `npm run build` | 0 | `git status --porcelain` EMPTY afterwards |
| `npm test` run 1 | 0 | tests 146, pass 146, fail 0, cancelled 0, skipped 0, todo 0; 87.9s |
| `npm test` run 2 | 0 | tests 146, pass 146, fail 0, cancelled 0, skipped 0, todo 0; 100.7s |

Default container toolchain (Node v22.22.2, npm 10.9.7), below the declared
floor, `dist/` removed before the build:

| Gate | Exit | Observed |
|---|---|---|
| `npm ci` | 0 | 4 packages |
| `npm run build` | 0 | `git status --porcelain` EMPTY afterwards |
| `npm test` run 1 | 0 | tests 146, pass 144, fail 0, cancelled 0, skipped 2, todo 0; 117.7s |
| `npm test` run 2 | 0 | tests 146, pass 144, fail 0, cancelled 0, skipped 2, todo 0; 87.2s |

The two skips on Node 22 are the unchanged M1-P2 floor-gated pair, each
carrying its recorded reason:

    ok 4 - doctor in a healthy fleet exits 0 # SKIP local Node v22.22.2 is
      below the kernel floor >=26; exit-0 witnessed on CI (Node 26)
    ok 8 - doctor with gh absent exits 0 under the generic profile # SKIP ...

Zero unaccounted tests on either toolchain. Both figures match the work
history's claim EXACTLY (146/146/0 and 146/144/2). CONFIRMED.

Note for anyone repeating this: `node --test test/` is NOT the project's
gate and fails with MODULE_NOT_FOUND. The gate is `npm test`, which runs
`node --test "test/**/*.test.ts"`.

## Scope audit

`git diff --name-only origin/main...HEAD` returns thirteen paths:

- Nine on M1-P5's files-to-touch list: `src/watcher.ts`,
  `src/commands/watch.ts`, `src/liveness.ts`, `test/watcher.test.ts`,
  `test/liveness.test.ts`, `src/cli.ts`, `src/commands/spawn.ts`,
  `src/commands/teardown.ts`, `src/commands/doctor.ts`.
- Two standing pre-authorized extras: `test/behaviors.json`,
  `delivery/work-history/m1-p5.md`.
- One earlier declared and twice-accepted deviation: `test/teardown.test.ts`.
- One authorized extension: `src/task.ts`, declared in the work history's
  "Scope extension, with its authorization" section as required.

`src/teardown.ts` was authorized and is UNTOUCHED across the whole phase
(`git diff --name-only origin/main...HEAD -- src/teardown.ts` is empty).
VERIFIED, and the work history's smaller-than-authorized footprint claim is
true.

This round alone (`1bdfce5..HEAD`) touches exactly the eight files the work
history names: `src/task.ts`, `src/liveness.ts`, `src/watcher.ts`,
`src/commands/doctor.ts`, `test/watcher.test.ts`, `test/liveness.test.ts`,
`test/behaviors.json`, `delivery/work-history/m1-p5.md`. CLEAN.

One commit this round: `84dfa41`. Fourteen commits on the branch.

## Conventions

- Non-ASCII over all thirteen changed files: no matches. Whole-tree scan over
  `src/`, `test/`, `bin/`, the work history and `CLAUDE.md`: no matches.
- Em dash over the same files: no matches.
- English only: confirmed by reading.
- npm only: `git diff origin/main...HEAD | grep -iE '^\+.*(pnpm|yarn)'` exit 1.
- Commit messages: `git log --format='%s%n%b' origin/main..HEAD` scanned for
  claude/opus/sonnet/gpt/anthropic/openai/copilot/co-authored/gemini/model:
  exit 1 (clean).

## Behavior registry, computed independently BY NAME

Parsed every `test(` title under `test/`, resolved every mapping in
`test/behaviors.json`, then cross-checked against the names actually
executed in my Node 22 TAP run:

    registered mappings:        152
    distinct registered titles:  146
    test() titles discovered:    146
    unresolvable mappings:         0
    executed test names (TAP):   146
    diff(discovered, executed):  IDENTICAL SETS

Against `origin/main`'s `test/behaviors.json`: removed 0, retitled 0,
added 45. Every behavior newly named by this round maps to a test present
in this run, and every previously registered mapping still resolves by
name. The substantive registry claim is CLEAN. The NUMBERS in the work
history are each one low; see CR-565.

## The three constraints, checked as hazards

- **C-1.** `state/last-wake.json` is opened exactly once in `src/`, at
  `src/watcher.ts:591`, with flag `"a"`, and is never read anywhere:
  `grep -rn "lastWakePath|LAST_WAKE_FILE|last-wake" src/ bin/` returns only
  the constant, the path helper, the new write-side probe at
  `src/watcher.ts:587`, the append, and doc comments. No decision in this
  kernel is derived from a log tail. CLEAN.
- **C-2.** `grep -nE "process\.kill|\bpid\b|/proc\b|signal[ -]?0|SIG[A-Z]{3,}|detached\s*:|\.unref\(|daemon|background"` over
  `src/watcher.ts`, `src/liveness.ts`, `src/commands/watch.ts`: exit 1.
  Same pattern reduced to real calls over all of `src/` and `bin/`: exit 1.
  The new `randomUUID` is treated separately below and is CLEAN.
- **C-3.** `grep -nE "spawnSync\(|spawn\(|execSync\(|execFile|fork\(|detached\s*:|\.unref\(|child_process"` over
  `src/watcher.ts`, `src/commands/watch.ts`, `src/liveness.ts`,
  `src/task.ts`: exit 1. `runResident` starts no child. Executed control: a
  resident `watch --interval 0.5 --poll 0.1 --backoff-cap 10` under
  `timeout 5` exits 124 with EMPTY stdout and stderr, beacon stamps
  `09:17:08.927 / 09:17:09.424 / 09:17:10.425 / 09:17:12.426` (gaps 497,
  1001, 2001 ms, non-decreasing). CLEAN.
- **Network (criterion 13).** `grep -rnE "node:(http|https|http2|net|tls|dgram|dns)|[^a-zA-Z]fetch\(|axios|undici|XMLHttpRequest|WebSocket"` over
  `src/` and `bin/`: exit 1. CLEAN.

## randomUUID against C-2 and criterion 14

The stage name is `${path}.${randomUUID()}.stage` (`src/watcher.ts:392`).

- `randomUUID` from `node:crypto` is RFC 4122 version 4: CSPRNG bytes, no
  node ID, no MAC, no pid, no clock sequence. Executed: five calls in one
  process gave five distinct values; two separate processes gave distinct
  values. Nothing about the running program enters the name.
- It is used for a TEMPORARY FILENAME, not for identity and not for
  exclusion. The exclusion is still `rename(2)`. C-2 regulates identity and
  exclusion; this is neither. CLEAN.
- Precedent already on `main`: `src/lock.ts:414/419/536/590` use
  `randomUUID` for `holderId` and mutex tokens, accepted at M1-P3.
- Criterion 14's structural grep over `src/watcher.ts`, `src/liveness.ts`
  and `src/commands/watch.ts`: exit 1 at this head. The `randomUUID` token
  does not trip it. CONFIRMED.

## THE STARTING QUESTION: is "one implementation covering every path" true?

**No, and the round says so for two of the three places it is not true.**

### My inventory, derived from scratch

Rows 1 to 11 are the implementer's table. Row 12 is mine. Every BEFORE
figure is a run against a pristine `1bdfce5` build; every AFTER figure is a
run against this head. Fleets were built by `tiphys init` with one open task
`t1`; `--turnend` marks the rows that need a pending wake to be reached.
Command run from the fleet root under `timeout 8`.

| # | Path (relative to fleet root) | Reached through | Command | BEFORE | AFTER |
|---|---|---|---|---|---|
| 1 | `tasks/t1/meta.json` (guard) | `surveyTaskRecords` -> `readTaskMeta` | `watch --once` | 0 `stale t1 meta` | 0 `stale t1 meta` |
| 2 | `state/watcher.beacon` | `judgeBeacon`/`writeBeacon` -> `readBeacon` | `doctor` | **124**, no output | 1, all 8 CHECK lines |
| 3 | `tasks/t1/turn-end` | `identityOf` -> `readIfPresent` | `watch --once` | **124** | 1, names the path |
| 4 | `tasks/t1/executor.json` | `deadlineOf` -> `readIfPresent` | `watch --once` | **124** | 1, names the path |
| 5 | `state/check-request` | `claimCheckRequest` | `watch --once` | **124**, request DESTROYED (`check-request.taken`) | 1, request INTACT, no `.taken` |
| 6 | `state/watcher.seen.json` | `readSeenState` -> `readIfPresent` | `watch --once` (turnend) | **124** | 1, names the path |
| 7 | `state/watcher.cadence.json` | `readCadenceState` -> `readIfPresent` | `watch --once` | **124** | 1, names the path |
| 8 | `tasks/t1/meta.json` (teardown) | `teardownTask` -> `readTaskMeta` | `teardown --task t1` | **124** | 1, "no readable task meta for task id t1" |
| 9 | `state/last-wake.json` | `appendWakeRecord` -> `openSync("a")` | `watch --once` (turnend) | **124** | 1, "the wake record could not be appended" |
| 10 | `state/watcher.beacon.stage` | `atomicWrite` -> `writeFileSync` | `watch --once` | **124** | 3 (unreachable: unique name) |
| 11 | `state/orchestrator.lock` | doctor `checkLock` | `doctor` | **124**, no output | 1, all 8 CHECK lines |
| **12** | **`warnings.md`** (fleet ROOT) | **`assembleBrief` -> `readFileSync`** | **`spawn`** | **124** | **124, STILL BLOCKS** |

All eleven of the implementer's rows are CONFIRMED exactly as written,
including the `check-request` destroy-then-block behavior and its repair. Row
12 is CR-560.

Directory-planted controls, BEFORE vs AFTER, to check that the loud paths
stayed loud and no exit code moved:

| Path | BEFORE | AFTER |
|---|---|---|
| `state/watcher.cadence.json` | exit 1, `EISDIR: illegal operation on a directory, read` | exit 1, `<path> is a directory, not a regular file, so it was not opened` |
| `state/watcher.seen.json` | exit 1, `scanning the watcher wake sources failed: EISDIR ...` | exit 1, same prefix, names the path |
| `tasks/t1/turn-end` | exit 1, `scanning ... EISDIR ...` | exit 1, same prefix, names the path |
| `state/watcher.beacon` | exit 1 (`EISDIR ... rename`); `doctor` exit 1 `CHECK beacon FAIL` | exit 1 (`the state file could not be rewritten`); `doctor` exit 1 `CHECK beacon FAIL` |

Every loud path stayed loud, every exit code is unchanged, and every message
gained the path name. NO exit code changed unremarked in this direction.

### Paths I probed that did NOT block, at either head

Recorded so absence of a finding is distinguishable from absence of a check:

- `backlog.md` (fleet root): a FIFO there makes `missingLayoutEntries`
  report `missing backlog.md`, because it uses `statSync(p).isFile()` and
  never opens. All commands exit 1 loudly. No block, BEFORE or AFTER.
- `tasks/t1/brief.md`: nothing reads it after spawn. No block.
- `state/watcher.seen.json.mutex`: `writeFileSync(..., {flag:"wx"})` is
  `O_CREAT|O_EXCL`, which returns EEXIST without opening. Result is the
  documented stuck-claim path: exit 1 after a bounded 5000ms wait, one
  reason line naming the file. Loud, both heads.
- `tasks/<id>/meta.json`, `tasks/<id>/brief.md`,
  `tasks/<id>/turn-end-hook.mjs`, `tasks/<id>/executor.json` as WRITE
  targets for `spawn`: unguarded opens exist (`writeTaskMeta`
  `src/task.ts:272`, `writeTurnEndHook` `src/hooks.ts:63`,
  `src/spawn.ts:162`, `assembleBrief`'s write) but are UNREACHABLE with a
  pre-planted FIFO, because spawn refuses a non-empty task directory
  first: all four gave exit 1, "task directory ... already holds records for
  task id ...". Measured, not assumed.
- `worktrees/t1.pool.json` and `state/orchestrator.lock` DO still block; they
  are the round's declared residual and are treated below.

## Findings

### CR-560 (MEDIUM): a twelfth path in the same class, unlisted and unescalated: a named pipe at `<fleet>/warnings.md` hangs `tiphys spawn` forever and strands a worktree, a branch and a pool record

**The claim.** The work history presents an eleven-row table as "the derived
inventory" of the class, and its "Honest scope: what this round did NOT
close" section names exactly two remaining exposures, `src/lock.ts` and
`src/pool.ts`, both ESCALATED to the orchestrator.

**Why it is wrong.** There is a third. `src/brief.ts:52-56` does
`existsSync(warnings)` and then a bare `readFileSync(warnings, "utf8")` on
`<fleet>/warnings.md`, the fleet's environment-warnings file. It is reached
from `spawnTask` at `src/spawn.ts:362-363` through `assembleBrief`, on the
normal success path of every spawn. `existsSync` establishes presence, not
type. This is the identical mechanism, on a kernel-known fleet path, and
`spawn` is one of the three guard consumers this phase exists to protect.

**Evidence.** Fleet built by `tiphys init`, a real bare upstream, a real
clone under `projects/toy`, HEAD symref set, one open task.

    control, no warnings.md, AFTER head:
      spawn --task c1 ... -> EXIT=0, "spawned c1 worktree .../worktrees/c1 exec exited 0"
    mkfifo <fleet>/warnings.md:
      spawn --task c2 ... -> EXIT=124, stdout EMPTY, stderr EMPTY   (AFTER head, 84dfa41)
      spawn --task c2 ... -> EXIT=124, stdout EMPTY, stderr EMPTY   (BEFORE head, 1bdfce5)

Proof that the block is that read and not something else: with a writer
opened on the FIFO 2 seconds into the run
(`( sleep 2; printf 'FLEET WARNING TEXT\n' > <fleet>/warnings.md ) &`), the
same spawn completed with EXIT=0 and `tasks/c3/brief.md` contains

    do the thing
    FLEET WARNING TEXT

so the FIFO's content was consumed by `assembleBrief` exactly as the module
documents.

Debris left behind by the hung run, measured after killing it: a real git
worktree at `worktrees/c2`, a pool record `worktrees/c2.pool.json`, a branch
`task/c2` in the project clone (`git worktree list` shows it checked out),
and an empty `tasks/c2/`. The task id is consumed. Spawn's rollback path
exists but is never reached, because the process never returns. Recovery is
manual.

**Why it happened, and why that matters more than the row.** The work
history states its own derivation rule: "grepping every filesystem read and
open in `src/` at 1bdfce5 and tracing each one that touches a path under
`tasks/`, `state/` or `worktrees/`". `warnings.md` is at the fleet ROOT, so
the rule excluded it before any probe ran. That is the SAME failure shape
this round correctly identified in the previous review, where a probe at
`state/session.lock` returned a vacuous negative because the lease is
`state/orchestrator.lock`. A scoping rule chosen without checking what falls
outside it produces exactly one more instance of the defect the round was
convened to eliminate.

**Severity.** MEDIUM, not HIGH. It is one more instance of an already
escalated and already owner-visible class; `src/brief.ts` is M1-P4 code
outside this round's authorized set, so the implementer was right not to
patch it and patching it at the call site would repeat CR-521; and reaching
the state needs a person or a foreign program. It is not LOW, because the
orchestrator's owner-facing residual decision turns on knowing the complete
surface, and one of the three commands is currently missing from it.

**Fix (documentation only, no source change).** Add row 12 to the inventory
table and a third item to the honest-scope escalation naming
`src/brief.ts:56`, the path `<fleet>/warnings.md`, the command `tiphys spawn`,
the measurement EXIT=124 at both heads, and the debris it strands. Also
record the derivation-rule lesson: the inventory was scoped to three
directories and the fleet root was not one of them.

### CR-561 (MEDIUM): the commit subject at `84dfa41` makes the same unqualified class claim the round was convened to correct

**The claim.** `git log -1 --format=%s HEAD`:

    M1-P5 fix round 4: make the type probe a property of every read and open

**Why it is wrong.** It is not a property of every read and open. Still
unprobed at this head: `writeTaskMeta` (`src/task.ts:272`, in the very module
that gained the helpers), `writeTurnEndHook` (`src/hooks.ts:63`),
`observeLease` (`src/lock.ts:143`), `readCurrent` (`src/lock.ts:164`),
`readPoolRecord` (`src/pool.ts:171`) and `assembleBrief` (`src/brief.ts:56`).
Three of those still hang a shipped command, measured below. The commit BODY
is otherwise honest and detailed, but it never mentions the escalated
residuals either: it says "Eleven read and open paths were derived
independently and measured with mkfifo before and after", and stops. A reader
of `git log` alone gets the same impression `e0d4fce` gave.

This round corrected `e0d4fce`'s subject in the work history, quoting it and
explaining why it overstated:

    Commit e0d4fce's subject, "probe a task record before reading it, so a
    named pipe cannot hang supervision", OVERSTATED.

and then wrote a new unqualified universal in its own subject. The
arbitration record for the previous round states the rule directly: "a record
that says supervision cannot hang is worse than no record when supervision
can."

**Evidence.** `git log -1 --format='%B' HEAD` (full message read); the
residual measurements in CR-562 and CR-560; the grep list above.

**Severity.** MEDIUM. It is a record defect and not a code defect, and no
gate is broken by it. It is not LOW because it is the identical failure mode
the round was convened to fix, recurring one commit later in the same
artifact class, and because pushed subjects cannot be rewritten, so the only
remedy is the correction-in-place the work history already knows how to
write.

**Fix (documentation only).** Add a bullet to the work history's "The two
false claims, corrected" section, in the same form as the `e0d4fce`
correction: quote `84dfa41`'s subject, state that at the time it was written
`tiphys spawn`, `tiphys teardown` and the four `tiphys lock` subcommands
could still be hung by a named pipe on a fleet path, and state what the
subject should have said (the probe is a property of every read and open in
this round's authorized files).

### CR-562 (LOW): the declared residual understates its own surface: `lock release` and `lock renew` hang too

**The claim.** Honest scope item 1: "`tiphys lock status`, `tiphys lock
acquire` and `tiphys teardown` still block on a named pipe at
`state/orchestrator.lock`."

**Why it is incomplete.** Two more subcommands block on the same file.

**Evidence.** Fleet with one open task, `mkfifo <fleet>/state/orchestrator.lock`,
this head, `timeout 8`, run from the fleet root:

    lock status              -> EXIT=124, stdout EMPTY, stderr EMPTY
    lock acquire             -> EXIT=124, stdout EMPTY, stderr EMPTY
    lock release --holder abc-> EXIT=124, stdout EMPTY, stderr EMPTY
    lock renew   --holder abc-> EXIT=124, stdout EMPTY, stderr EMPTY
    teardown --task t1       -> EXIT=124, stdout EMPTY, stderr EMPTY
    doctor                   -> EXIT=1, all 8 CHECK lines  (FIXED this round)
    watch --once             -> EXIT=3                     (never read it)

Residual item 2 confirmed separately: `mkfifo <fleet>/worktrees/t1.pool.json`,
`teardown --task t1` -> EXIT=124, stdout and stderr EMPTY; `doctor` EXIT=0
and `watch --once` EXIT=3 on the same fleet. The cited readers are correct:
`src/lock.ts:143` (`observeLease`), `src/lock.ts:164` (`readCurrent`),
`src/pool.ts:171` (`readPoolRecord`), all bare `readFileSync`, read at those
exact lines.

**Fix.** Enumerate all five commands in the escalation.

### CR-563 (LOW): CR-523's ordering has a deterministic witness after all, and the full suite passes with the fix reverted

**The claim.** Disposition of CR-523: "with CR-520 fixed, the guard has no
reachable way to block or raise on the paths it reads, so the ordering change
has no independent red witness at this head and none is registered for it
... A regression of the ordering alone would not be caught. Registering a
test that cannot fail would be the CR-540 mistake."

**Why the reasoning is wrong.** The first half is correct: I could not find
any construction that makes `guard()` block or raise at this head. But the
conclusion drawn from it does not follow, because the ordering does not need
a hang to be observable. It is directly observable in the merged output
stream, deterministically, on an ordinary stale-beacon fleet. The property
"the advisory follows the diagnosis" is a plain assertion about output order,
and it fails immediately when the ordering is reverted. This is not an
unfailable test; the round declined to write a failable one after reasoning
about only the hang-shaped construction.

**Evidence.** Stale beacon (1260s old), one open task, this head:

    doctor 2>&1  ->  line 1..8  CHECK node ... CHECK identity ...
                     line 9     watcher stale: 1 open task(s) in flight and ...

Identical ordering to a file and through a pipe. With the ordering-only
mutation applied (the `warnIfWatcherStale` block moved back in front of the
check loop, nothing else changed):

    doctor 2>&1  ->  line 1     watcher stale: 1 open task(s) in flight and ...
                     line 2..9  CHECK node ... CHECK identity ...

And the decisive measurement: with that same ordering-only mutation in place,
the FULL SUITE passes.

    npm test  ->  EXIT=0, tests 146, pass 146, fail 0, skipped 0

So CR-523's fix is real, verified, and completely unguarded: 146 tests do not
notice it being undone.

**Fix.** Register one behavior, for example
`doctor-advisory-follows-the-diagnosis`: build a fleet with an open task and
a beacon older than the threshold, run `doctor` with stdout and stderr into
one pipe, assert the last non-empty line contains "watcher stale" and that
every `CHECK ` line precedes it. Deterministic, about six lines, red against
the dangerous state.

### CR-564 (LOW): doctor's beacon check reports "does not parse as a beacon record" for an entry that was never opened

**The claim.** `src/liveness.ts:222-231` and `src/commands/doctor.ts:281-284`:
a beacon that is absent, not a regular file, unreadable or unparseable is all
one thing to the guard.

**Why it is worth recording.** That collapse is right for the GUARD, whose
job is a warn-or-not verdict. It is wrong for DOCTOR, whose entire job is to
tell an operator what is wrong. `readRegularFileIfPresent` returns
`{kind:"refused", reason}` with an exact, already-worded explanation, and
`readBeacon` discards it. The same commit does the opposite thing one check
earlier: `checkLock` surfaces the reason verbatim.

**Evidence.** Same fleet, this head, one open task:

    mkfifo state/watcher.beacon:
      CHECK beacon FAIL beacon file <path> does not parse as a beacon record
    mkfifo state/orchestrator.lock:
      CHECK lock FAIL <path> is a named pipe, not a regular file, so it was not opened

The beacon line is a false statement about what happened: the file was never
opened and no parse was attempted. It sends an operator to look for a JSON
syntax error in a named pipe. Exit code is unchanged (1 in both the directory
case before and after), so this is a diagnosis-quality defect, not a
behavioral regression.

**Fix.** Have `checkBeacon` call `classifyEntry` (already exported) and render
the reason for the irregular and unexaminable arms, exactly as `checkLock`
does, or give `judgeBeacon` an `unreadable(reason)` arm. Two to six lines.

### CR-565 (LOW): the registry numbers in the work history are each one low, and are inconsistent with the same section's own test count

**The claim.** "Registry, computed independently over the live tree: 151
mappings, 145 distinct registered titles, 145 `test()` titles discovered, 0
unresolvable mappings. Against `origin/main`: removed none, retitled none, 44
added."

**Why it is wrong.** Measured independently: 152 mappings, 146 distinct
registered titles, 146 `test()` titles discovered, 0 unresolvable, 45 added,
0 removed, 0 retitled. Every count is exactly one higher. The claim is also
internally inconsistent with the same section's own gate table, which reports
`tests 146` on both toolchains: with `suites 0` and no subtests, 146 executed
tests cannot come from 145 `test()` titles.

**Evidence.** My extraction of the 146 titles and the 146 executed names from
the Node 22 TAP output are IDENTICAL SETS (`diff` clean). `test/behaviors.json`
at `origin/main` has 107 entries; this round's diff adds 7 to the 145 present
at `1bdfce5`, giving 152.

**Why it is a finding and not a typo.** The substantive claims (0
unresolvable, nothing removed, nothing retitled) are TRUE, and I confirm
them. But tuition T-006 was filed about this phase producing assertions about
the world written without executing them, and this is one: the arithmetic
contradicts a table three paragraphs away, which any execution would have
surfaced.

**Fix.** Correct the four numbers.

### CR-566 (LOW): a unique stage name leaks permanently when a pass is killed mid-write, and nothing sweeps it

**The claim.** `src/watcher.ts:396-402`: "A unique stage name is invisible to
any cleanup, so this pass owns removing its own leavings before it reports
the failure."

**Why it is incomplete.** That is true for the THROW path and only for it.
The fixed name `${path}.stage` was self-healing: the next write overwrote it,
so debris was bounded at one file per state file forever. The unique name is
not. A pass stopped between `writeFileSync(stage)` and `renameSync` leaves a
file that nothing in the kernel will ever look at again, and a resident
watcher writes the beacon on every evaluation, so the leak rate is one file
per stop. Nothing sweeps `state/*.stage`: `grep -rn "\.stage" src/` outside
`src/lock.ts` returns only the doc comment and the construction site.

**Evidence.** Three planted `state/watcher.beacon.leaked-{1,2,3}.stage` files
on a healthy fleet at this head:

    watch --once -> EXIT=3 ; doctor -> EXIT=0
    state/ afterwards: watcher.beacon, watcher.beacon.leaked-1.stage,
      watcher.beacon.leaked-2.stage, watcher.beacon.leaked-3.stage,
      watcher.cadence.json

Nothing broke and nothing was cleaned. `state/` is gitignored and ephemeral,
which is why this is LOW and not higher, and the trade (a real drop removed
for unbounded harmless debris) is the right one.

**Fix.** State the kill-window limit at `atomicWrite` beside the sentence it
qualifies, or sweep stale `${path}.*.stage` entries on write. One sentence is
sufficient; I would not change the code for this in M1.

## What the fix broke: the answers, including the empty ones

- **Can the probe itself fail in a way the old code survived?** Two extra
  syscalls (`lstat` then `stat`) precede every guarded read. Traced every
  arm: ENOENT on `lstat` -> absent (old code: ENOENT on read -> undefined,
  same); ENOENT on `stat` after a good `lstat` -> dangling -> absent (old:
  ENOENT on read -> undefined, same); ELOOP -> unexaminable -> loud (old:
  ELOOP on read -> throw, same class); EISDIR -> irregular -> loud, exit
  unchanged (measured, table above); removed between probe and read ->
  handled explicitly as absent. NO new failure mode found by execution. One
  arm I could NOT execute is recorded as honest failure 1.
- **Does any path report a different error class?** Yes, and all of them are
  improvements except one. The `EISDIR` raw messages became messages that
  name the path; exit codes are unchanged everywhere I measured. The
  exception is doctor's beacon line, CR-564.
- **Are the loud EISDIR paths still loud?** Yes, all four measured, exit 1
  with one reason line, BEFORE and AFTER. CONFIRMED.
- **Did any exit code change unremarked, the way CR-513 did?** Not that I
  could produce. Every BEFORE/AFTER pair in the tables above either kept its
  code or moved from 124 (a hang) to a documented code. The one arm where the
  shape of the classification changed without an executed measurement is
  honest failure 1.
- **Silent absorption (T-005).** Swept the new code. `classifyEntry` carries a
  reason on every non-clean arm. `readRegularFileIfPresent` returns absent
  only for ENOENT and dangling, both documented. `atomicWrite`'s
  `try { unlinkSync(stage) } catch {}` swallows only the cleanup and rethrows
  the original. `refuseOpenForWrite` permits a DANGLING destination, so
  `rename` silently replaces a dangling symlink at the beacon with a regular
  file: measured, exit 3 at BOTH heads, so this is pre-existing and not a
  regression. `readTaskMeta` and `readBeacon` collapse "refused" into
  `undefined`, which is what the PRISTINE versions did too (both had a bare
  `catch { return undefined }`), so the absorption profile is unchanged;
  CR-564 is about the consequence for doctor, not about a new absorption.
  Doctor's `try { warnIfWatcherStale(...) } catch {}` is the same code moved,
  not widened. No NEW silent absorption found.
- **Can any path lose committed work?** No. This round writes only under
  `state/`, reads under `tasks/`, runs no git command, removes no worktree
  and touches no branch. Its only `unlink` targets are its own uniquely named
  stage file. The one loss I found is CR-560's stranded worktree, branch and
  pool record, which is unfinished work abandoned rather than committed work
  destroyed, and it is pre-existing at both heads.

## Red witnesses, re-derived (not re-read)

Every mutation applied to a byte copy of the shipped source in
`.../scratchpad/hz/head-copy`, restored from a pre-mutation copy and verified
with `diff -r` after each one (all restores confirmed identical).
`--test-name-pattern` preceded the positional path throughout, and each run
was checked for pattern-match vacuity.

| Mutation | Dangerous state reinstated | Test | My result |
|---|---|---|---|
| baseline | none | all three watcher witnesses | GREEN |
| A | `readIfPresent` opens blind (import restored) | `watcher-no-path-blocks-on-a-fifo` | RED, naming all 4 rows: turn-end, executor.json, watcher.seen.json, watcher.cadence.json, each "BLOCKED IN THE KERNEL, killed after 15000ms" |
| B | `atomicWrite` stops probing the rename destination | `watcher-no-path-blocks-on-a-fifo` | RED: `ABSORBED INSTEAD OF REPORTED: state/watcher.beacon: exit 3, stdout "", stderr ""` |
| C | `appendWakeRecord` opens blind | `watcher-no-path-blocks-on-a-fifo` | RED: `BLOCKED IN THE KERNEL ... state/last-wake.json (appendWakeRecord openSync append)` |
| D | `claimCheckRequest` renames before it classifies | `watcher-check-request-not-destroyed-unread` | RED: "the wake source was consumed by a pass that could not read it" |
| E | `readBeacon` opens blind (import restored) | `liveness-fifo-beacon-does-not-block` | RED: "doctor blocked on the named pipe at .../state/watcher.beacon and was killed after 15000ms" |
| F | `readTaskMeta` opens blind, classifier probe LEFT IN PLACE | `liveness-fifo-record-does-not-block-teardown` | RED: "teardown blocked on the named pipe at .../tasks/piped/meta.json ..." |
| G | doctor `checkLock` opens blind | `doctor-fifo-lease-does-not-block` | RED: "doctor blocked on the named pipe at .../state/orchestrator.lock ..." |
| H | claim file `"wx"` -> `"w"` | `watcher-simultaneous-claim-single-surfacing` | RED 12/12 runs |
| I | stage name back to the fixed `${path}.stage` | `watcher-unique-stage-path` | RED, deterministic: "a pass used the predictable stage path ...: EISDIR ..." |

Negative controls, which are what make CR-521 and CR-540 findings rather
than opinions. All re-derived by me:

| Mutation | Test that SHOULD have caught it | My result |
|---|---|---|
| F | `liveness-fifo-record-does-not-block` (the previous round's test) | GREEN. The old test does not guard teardown. CR-521 stands. |
| H | `watcher-race-single-surfacing` | GREEN 3/3 |
| H | `watcher-resident-versus-once-race` | GREEN 3/3 |
| CR-523 ordering reverted | the whole 146-test suite | GREEN. See CR-563. |

Every witness A through I is red against its DANGEROUS state, not merely
against an absent feature, and the hang witnesses are bounded by `spawnSync`
with `killSignal: SIGKILL` so a regression names the path rather than looking
like a CI stall. The work history's witness table is CONFIRMED in every row.

## The CR-540 test: sound witness or coin flip

**Sound witness. Not a flaky CI risk on the evidence I have.**

- Green direction, unmutated, this head: 12 targeted runs, GREEN 12/12. Plus
  four full-suite runs (two per toolchain), all green. Sixteen observations,
  zero spurious failures. This is expected from the mechanism: with
  `O_CREAT|O_EXCL` in place exactly one pass can win whatever the interleave,
  so the PASS is deterministic by construction, not by luck.
- Red direction, mutation H (`"wx"` -> `"w"`), this head: RED 12/12 runs. The
  round that caught it was round 0 in eight of twelve runs, round 1 once,
  round 2 once, round 3 twice; 12 detections across 21 elapsed rounds, so a
  per-round detection rate near 0.57 on this machine, better than the
  implementer's own more pessimistic measurement of about a third. At 12
  rounds the miss probability from my rate is on the order of 1e-5, and from
  the implementer's more conservative rate about 8e-3.
- The implementer's disclosure that the failure is probabilistic is honest
  and, if anything, understates the test.

The one caution I would record, which is a cost rather than a flake: the test
spawns 24 CLI children and carries a 15000ms `waitForFile` and a 20000ms
`waitForExit` per round. On a heavily loaded runner the failure mode would be
a timeout in the harness rather than a wrong answer, and it is a meaningful
share of suite wall time. That is a budget note for environment warning 11,
not a finding.

## CR-523's declined witness: is the reasoning correct?

**Partly, and it reaches the wrong conclusion.** See CR-563. The premise
("with CR-520 fixed the guard cannot be made to block or raise on the paths
it reads") holds and I could not refute it: `guard()` reads task records and
the beacon, both now go through `readRegularFileIfPresent`, and
`loadFleet` only stats. The principle ("do not register an unfailable test")
is right and is exactly the CR-540 lesson. But the ordering IS failable
without any hang, deterministically, through the merged output stream, and
the full suite demonstrably does not notice the fix being undone. The right
answer was a six-line output-order test, not no test.

## The pre-existing `atomicWrite` defect: verified independently

**The claim is TRUE, and I reproduced it verbatim against pristine `1bdfce5`.**

Method: `git archive 1bdfce5` into a clean directory, `npm ci`,
`npm run build`, source files verified identical to `1bdfce5` by git object
hash. Then the ONLY change: this head's `test/watcher.test.ts` copied in (it
imports nothing from `src/` that does not exist at `1bdfce5`; its three
computed-URL imports are `heartbeatTick`, `CADENCE` and `loadFleet`, all
present). Ran the single CR-540 test by name.

    PRISTINE 1bdfce5 source + this head's test:  RED 8 of 10 runs

Captured, from three separate runs, the exact shape the round described:

    round 11: the same turn-end was surfaced 0 times by two simultaneously
    released passes: first="" (exit 3, "") second="" (exit 1, "tiphys watch:
    ENOENT: no such file or directory, rename
    '/tmp/tiphys-p5-watch-IS4y8G/fleet/state/watcher.beacon.stage' ->
    '/tmp/tiphys-p5-watch-IS4y8G/fleet/state/watcher.beacon'")

    round 9:  ... surfaced 0 times ... first="" (exit 1, ENOENT rename ...
              beacon.stage -> beacon) second="" (exit 3, "")
    round 4:  ... surfaced 0 times ... same shape

ZERO surfacings, the winner dead on its beacon write after the seen state had
already advanced, the other reporting no-wake. That is a DROP in a protocol
whose rule is duplicate-rather-than-drop. The defect is pre-existing, it is
not introduced by this round, and the round's account of it is accurate in
every part I could check.

A consequence worth recording for the phase file: acceptance criterion 7 was
therefore VIOLATED IN FACT at `1bdfce5` for the two-`--once` case, and both
third-round reviewers marked criterion 7 MET. Neither was wrong to; no
registered test reached the window. It is one more instance of T-007's
lesson.

I also record a false negative of my own, so nobody later cites it as a
refutation: my hand-rolled bash replica of the same construction (dist entry
point, barrier at the fleet root, one write releasing a symlinked second
barrier) produced exactly-one-surfacing in 52 of 52 rounds against pristine
and never reproduced the drop. Only the shipped test's construction (source
entry via `bin/tiphys.ts`, barriers under `state/`) reproduces it. My replica
was not sensitive enough; the shipped test is.

## Regression spot-checks on the criteria (the criteria reviewer owns these)

Executed by me against scratch fleets on this head, to confirm the two extra
syscalls in the hot path and the write-side probe broke nothing:

| # | Result |
|---|---|
| 1 | resident `--interval 0.5 --poll 0.1 --backoff-cap 10` under `timeout 5`: EXIT=124 (still running), stdout and stderr EMPTY, beacon gaps 497 / 1001 / 2001 ms, non-decreasing |
| 2 | resident, turn-end written 1.5s in: EXIT=0, stdout exactly `signal t1 turn-end`, stderr empty |
| 4 | virgin `--once`: EXIT=3, stdout empty. With a turn-end pending: EXIT=0, `signal t1 turn-end` |
| 5 | `--once --interval 0.4` three passes: 3, then (after 0.7s) 0 `heartbeat 1`, then immediately 3 |
| 6 | first `--once` 0 `signal t1 turn-end`, second on the unchanged fleet 3, stdout empty |
| 8 | three consecutive no-wake passes: `09:16:48.237Z`, `.300Z`, `.368Z`, strictly increasing sub-second, EXIT=3 each |
| 9 | past deadline, no turn-end: EXIT=0, stdout exactly `stale t1 deadline` |
| 10/11 | beacon 1260s old: exactly ONE "watcher stale" stderr line, doctor EXIT=0. Fresh beacon, same fleet: ZERO such lines, doctor EXIT=0. Exit codes identical across both. |
| 12(b) | `TIPHYS_WATCH_BACKOFF_CAP_SECONDS=900 POLL=15 STALE=915` raises at import naming all three values; `STALE=916` loads |
| 13/14 | greps exit 1 (above) |
| 15 | gates and registry above |

No criterion regressed.

## Answers the merge decision turns on

**Is CR-520 closed as a CLASS at this head? NO, and the round says so for
two of the three places it is not.**

- CLOSED, on every path I could construct, for `tiphys doctor` and for BOTH
  watcher entry modes. That is the specific thing the third round said was
  gone: the guard itself and the safety net that lets a beacon go stale are
  now total against this class. Eleven rows measured before and after.
- NOT CLOSED for `tiphys teardown` (`state/orchestrator.lock`,
  `worktrees/<id>.pool.json`), for the four `tiphys lock` subcommands
  (`state/orchestrator.lock`), or for `tiphys spawn` (`<fleet>/warnings.md`).
- Two of those three are ESCALATED honestly and measured. The third is
  CR-560 and is not in the record at all.

**Is CR-521 resolved? YES.** Verified by execution (`teardown` with a FIFO at
`tasks/t1/meta.json`: 124 BEFORE, exit 1 "no readable task meta for task id
t1" AFTER), by the new witness going red under mutation F, and by the
negative control showing the previous round's test stays green under the same
mutation. `src/teardown.ts` was authorized and correctly not edited. The
declined-alternative reasoning is corrected in `src/liveness.ts:326-340`.

**Is CR-523 resolved? YES as a fix, NO as a guarded fix.** The advisory now
follows the diagnosis (measured). Nothing in 146 tests notices it being
undone, and the stated reason for not registering a witness is wrong on its
premise. CR-563.

**Is CR-540 resolved? YES, and well.** The new construction is the only one
that reaches the window; my own measurement (RED 12/12 mutated, GREEN 12/12
unmutated, old tests GREEN 3/3 under the same mutation) is stronger than the
implementer's.

**Is the CR-522 deferral honest? YES.** The limitation is written at
`src/watcher.ts:564-576`, at `appendWakeRecord`, where the next reader of
that barrier will find it, and it states plainly that the durability half
cannot restore a wake because nothing reads the file, that stdout is written
after the suppress, and that the guard goes on reporting fresh through the
window. It is carried to M2 rather than improvised. I did not re-race the
window (honest failure 4).

**Does any surviving text overstate coverage?**

- `src/liveness.ts` module header: NO. "What is true now, and only this:
  guard() reads two kinds of path, task records and the beacon, and BOTH go
  through readRegularFileIfPresent" is precisely scoped and precisely true.
  The correction quotes the original and attributes it. This is the right
  form and a credit to the record.
- `src/watcher.ts` `readIfPresent` doc: NO. "Every wake source and every
  cadence file this module reads arrives here" is true.
- `src/task.ts` header: "the probe lives HERE, in the readers and in one
  classifier, and every caller is protected by construction" is defensible
  read as "every caller of these helpers", but is loose enough that a hurried
  reader takes it as a kernel-wide statement. I would tighten it; I am not
  raising it as a separate finding.
- Work history: the class claim is scoped to "the phase's files", which is
  honest, and the escalation names two of the three exposures. CR-560 and
  CR-562 are the gaps.
- Commit subject `84dfa41`: YES, it overstates. CR-561.

**Is the declared residual acceptable or blocking? ACCEPTABLE as a residual,
BLOCKING as currently recorded.**

My reasoning, stated so the orchestrator can disagree with it on the
evidence rather than on my confidence:

1. The thing that made CR-520 a HIGH was that the guard itself hung, so no
   "supervision stopped" signal could ever be produced. That is fixed on
   every path I could find. `doctor` now prints its full diagnosis with a
   named pipe at the beacon, at the lease, or at a task record, and both
   watcher entry modes are loud on every wake source and every cadence file.
2. The remaining hangs are all in `src/lock.ts`, `src/pool.ts` and
   `src/brief.ts`, M1-P3 and M1-P4 files outside this phase's authorized set.
   The implementer's refusal to patch them at the call site inside
   `src/task.ts` is CORRECT and is the CR-521 lesson applied, not an excuse:
   a probe in front of one caller is what caused this whole sequence.
3. Every remaining path needs a person or a foreign program to create a
   non-regular entry. Nothing in the kernel does.
4. The round measured and named them rather than leaving them to be found by
   a fifth reviewer, which is the behavior the process wants.

But the residual as RECORDED is one exposure short (CR-560), understates
another (CR-562), and is contradicted by the commit subject a later reader
will find first (CR-561). "Fixes nine paths and names two remaining" is not
what shipped; what shipped is "fixes eleven paths and names two of three
remaining". Correcting the record costs no source change and no gate rerun.

DR-0012 clause 2 requires no unresolved high or medium finding. Two mediums
are open, so I return FIX-ROUND-NEEDED. I want to be explicit that this is
NOT a recommendation for a fifth CODE round: both mediums close with edits
to `delivery/work-history/m1-p5.md` alone, and the four lows are optional
except that CR-563 is cheap and closes a real coverage hole.

## Probes run, including the ones that came back empty-handed

1. Full read/write/open inventory of `src/` and `bin/`, not scoped to any
   directory. FOUND CR-560.
2. FIFO planted at each of 15 paths, one at a time, with a healthy control
   between, against BOTH the pristine `1bdfce5` build and this head:
   `state/watcher.beacon`, `state/watcher.seen.json`,
   `state/watcher.cadence.json`, `state/check-request`,
   `state/last-wake.json`, `state/orchestrator.lock`,
   `state/watcher.beacon.stage`, `state/watcher.seen.json.mutex`,
   `tasks/t1/meta.json`, `tasks/t1/turn-end`, `tasks/t1/executor.json`,
   `tasks/t1/brief.md`, `worktrees/t1.pool.json`, `warnings.md`,
   `backlog.md`. Commands: `watch --once`, `doctor`, `teardown --task t1`,
   `lock status`, plus `lock acquire/release/renew` and `spawn` where
   relevant. FOUND CR-560, CR-562; confirmed all 11 declared rows.
3. Directory planted at four state and task paths, BEFORE vs AFTER, to check
   loudness and exit codes did not move. EMPTY as a defect.
4. Dangling symlink at the beacon as an atomicWrite DESTINATION. EMPTY as a
   regression: silently replaced at BOTH heads.
5. Spawn's four write targets under `tasks/<id>/` with pre-planted FIFOs.
   EMPTY: all four unreachable, spawn refuses a non-empty task directory
   first, exit 1 with a named reason.
6. `state/watcher.seen.json.mutex` as a FIFO. EMPTY: `O_EXCL` returns EEXIST
   without opening; the stuck-claim path reports loudly after 5000ms.
7. Leaked unique stage files in `state/`. FOUND CR-566 (LOW).
8. Pre-existing `atomicWrite` fixed-stage-name defect, against a pristine
   `1bdfce5` build with only the test file swapped in. CONFIRMED, RED 8/10,
   drop shape captured three times verbatim.
9. CR-540 test, green direction, 12 targeted runs plus 4 full-suite runs.
   EMPTY as a flake.
10. CR-540 test, red direction, mutation H, 12 runs. EMPTY as a defect:
    RED 12/12.
11. Mutations A through I re-derived, plus three negative controls. EMPTY as
    a defect: every witness is honest.
12. CR-523 ordering: observability, and whether the full suite catches the
    fix being reverted. FOUND CR-563.
13. Error-class and exit-code drift across the fix, every path in the
    inventory. FOUND CR-564 (one message), otherwise EMPTY.
14. Silent absorption sweep over all new code paths (`classifyEntry`,
    `readRegularFileIfPresent`, `refuseOpenForWrite`, `atomicWrite`'s
    cleanup, `readTaskMeta`, `readBeacon`, doctor's advisory catch). EMPTY:
    no NEW absorption; the pre-existing collapses are unchanged from
    `1bdfce5`.
15. `randomUUID` against C-2 and criterion 14, including a same-process and
    cross-process distinctness check. EMPTY.
16. C-1 (no decision from a log tail), C-2 (pid, signals, `/proc`), C-3
    (detached, unref, daemonize flag, any child on the watcher path). EMPTY.
17. Destructive paths: can anything in this round lose committed work?
    EMPTY. Only `state/` writes, only its own stage file unlinked. The
    CR-560 debris is abandoned work, not destroyed work, and is pre-existing.
18. Registry resolution by name, plus the removed/retitled check against
    `origin/main`, plus a cross-check of discovered titles against executed
    names. FOUND CR-565 (numbers only; the substance is clean).
19. Scope audit including `src/teardown.ts` untouched. EMPTY.
20. Conventions: ASCII, em dash, English, npm, commit-message tokens. EMPTY.
21. Gates on BOTH toolchains, twice each, from a removed `dist/`, with a
    `git status` check after the build. EMPTY.
22. Regression spot-checks on criteria 1, 2, 4, 5, 6, 8, 9, 10, 11, 12(b),
    13, 14. EMPTY.

## Honest failures and limits of this review

1. **One classification arm was reasoned about, NOT executed.** `judgeBeacon`
   previously treated ANY `lstat` failure as "beacon absent"
   (`try { present = lstatSync(...) !== undefined } catch { present = false }`).
   `classifyEntry` returns "absent" only for ENOENT and maps every other
   `lstat` failure to "unexaminable", which is not absent, so it falls
   through to `readBeacon` and would render as `CHECK beacon FAIL` (exit 1)
   where it previously rendered as `CHECK beacon WARN` (exit 0 contribution).
   That is a CR-513-shaped exit-code change. I could NOT execute it: I ran as
   uid 0 throughout, so no `chmod` on `<fleet>/state/` produces EACCES for
   me; ELOOP and ENOTDIR constructions I tried either fail at `stat` (which
   behaves identically before and after) or make `loadFleet` report a missing
   layout entry first. I therefore assert only that I traced it in the
   source, and NOT that I measured it. Whether it is reachable at all in a
   real deployment is open. I did not raise it as a finding for that reason.
2. **CI on this head was not observed.** `gh` is absent locally and I did not
   query GitHub. Merge remains conditional on CI green at `84dfa41`, which
   this review cannot supply.
3. **One of my own probes was VACUOUS and I caught it; recording it because
   the previous hazard review's item 5 was the same shape.** My first
   mutation-G run used
   `--test-name-pattern "a named pipe at the lease file does not block doctor" test/doctor.test.ts`
   and reported `tests 1, pass 1, fail 0`, exit 0, which I nearly recorded as
   "the witness does not catch mutation G". That test lives in
   `test/liveness.test.ts`, not `test/doctor.test.ts`. Node reports a
   pattern that matches NOTHING as a single green line naming the FILE
   rather than any test, with `tests 1 / pass 1`
   and exit 0, which is indistinguishable by count from a real single pass. I
   verified this deliberately with the pattern `zzz-no-such-test-zzz`. I then
   added a guard that greps the reporter output for the literal title, re-ran
   against `test/liveness.test.ts`, and mutation G is RED there. Every
   targeted run in the witness table above passed that guard. Anyone
   repeating this work should use the same guard.
4. **CR-522's window was not raced.** I inherited the previous reviewer's
   demonstration that the resulting state is permanent and silent, and only
   verified that the code now records the limitation at the right place. I
   did not re-stage it.
5. **Exactly what I probed for the residuals, stated so this cannot mislead
   the way a wrong filename did last round.** The lease probe was
   `mkfifo <fleet>/state/orchestrator.lock`, the path `LOCK_FILE` resolves to
   in `src/fleet.ts:36` (`join("state", "orchestrator.lock")`). I did NOT
   probe `state/session.lock`, which is not a path this kernel names. The
   pool probe was `mkfifo <fleet>/worktrees/t1.pool.json` on a fleet whose
   task `t1` is open with a regular `meta.json`. The warnings probe was
   `mkfifo <fleet>/warnings.md`, the path `warningsPath` resolves to in
   `src/brief.ts:26-27` (`join(fleet.root, "warnings.md")`), against a fleet
   with a real cloned project and a real upstream whose HEAD symref is set,
   so `spawn` genuinely reaches `assembleBrief` (proved by the control run
   completing at exit 0). All commands were run from the fleet root with
   `timeout 8` on Node v26.6.0.
6. **My hand-rolled dual-release replica was a FALSE NEGATIVE.** 52 rounds
   against pristine `1bdfce5` produced exactly-one-surfacing every time and
   never reproduced the drop. Only the shipped test's construction did. If
   someone later cites "a bash replica saw nothing", that is this, and it is
   not evidence.
7. **I did not walk the fifteen acceptance criteria as criteria.** That is
   the concurrent reviewer's contract. I spot-checked twelve of them for
   regression, listed above, and did not re-stage criteria 3, 7 or 12(a).
8. **I did not attack `src/lock.ts`, `src/pool.ts`, `src/brief.ts` or
   `src/spawn.ts` beyond this one class.** They are outside the phase diff.
   Their exposure to THIS mechanism is measured above; anything else in them
   is M2's problem.
9. **I ran as uid 0**, like the suite, so no permission-bit behavior was
   exercised anywhere in this review.

## Worktree state at the end of this review

`git status --porcelain` in `.../scratchpad/cr-r4-hazard` reports only this
file, untracked. `HEAD` is `84dfa41f8f92d90d6982ca97b3addebe7893ff75`,
detached. `dist/` exists from the gate runs and is gitignored. All mutation
work was done in `.../scratchpad/hz/head-copy` and restored with `diff -r`
verification; the review worktree's `src/` and `test/` were never modified.
Nothing was committed, nothing was pushed, and nothing under
`/home/user/tiphys-ai-helmsman` or any sibling scratchpad worktree was
written.
