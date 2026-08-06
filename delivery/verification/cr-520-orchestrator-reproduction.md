# Orchestrator reproduction of CR-520, independent of the reviewer

- date: 2026-08-05
- subject: CR-520, a FIFO at `state/watcher.beacon` blocks `guard()` and every
  command that consults it
- head: `1bdfce5fcf0ecfa88d7318f58f77b378544045b5` (PR 8, M1-P5)
- why this file exists: CR-520 is the finding an owner decision now turns on,
  and this project's rule is that an agent's claim with no verifiable artifact
  behind it is treated as unknown. The reviewer's evidence was not taken on
  trust.

## Method

A detached worktree at the reviewed head, `npm ci` clean, driven with a
FLOOR-SATISFYING toolchain (Node v26.6.0, fetched per the amended environment
warning 1) rather than the container default of 22.x, so the run is on the
declared floor and the doctor node check passes rather than masking the
result behind a FAIL.

A fresh fleet was initialized, doctor was run to establish a baseline, then
one `mkfifo` was applied and the same commands were re-run under a 20 second
`timeout`. Nothing else changed between the two runs.

## Baseline, no beacon present

```
$ node bin/tiphys.ts init <fleet>          # exit 0
$ timeout 20 node bin/tiphys.ts doctor
CHECK remote WARN no remote configured, fleet state has no push target (SC-002)
CHECK lock PASS no lease present
CHECK beacon WARN watcher not running or not scheduled
CHECK identity PASS git commit identity configured (Claude <noreply@anthropic.com>)
doctor-exit:0
```

## After one mkfifo, same fleet, same binary

```
$ mkfifo <fleet>/state/watcher.beacon
$ ls -la <fleet>/state/watcher.beacon
prw-r--r-- 1 root root 0 Aug  5 06:14 .../state/watcher.beacon

$ timeout 20 node bin/tiphys.ts doctor
Terminated
doctor-exit:124

$ timeout 20 node bin/tiphys.ts watch --once
Terminated
watch-exit:124
```

Exit 124 is `timeout` killing the process, so both commands hung for the full
bound. `doctor` produced ZERO output: not one `CHECK` line, so an operator
gets no diagnosis at all, which independently corroborates CR-523 (the guard
advisory runs before doctor prints anything).

## Reading that matches the measurement

- `src/liveness.ts` `readBeacon` performs a bare `readFileSync` inside a
  `try/catch`. Opening a FIFO with no writer blocks in the kernel. A block is
  not an exception, so the `catch` is never reached.
- `judgeBeacon` establishes presence with `lstatSync` and never establishes
  TYPE, so nothing upstream of the read classifies the entry.

## The claim in the source that this falsifies

`src/liveness.ts` states, in the module documentation at the head of the file:

> Because of that, guard() is TOTAL: every filesystem read it performs is
> wrapped, and a raised error is classified as "this file is not readable",
> never propagated.

The wrapping is real and the conclusion does not follow. Totality against
RAISES is not totality against BLOCKS, and the failure this phase was
convened to fix is a block. The same sentence pattern is what tuition T-006
was filed about a few hours earlier: an assertion about the world, written
without executing it, which a construction disproves in minutes.

The commit subject `e0d4fce` carries the same overreach: "probe a task record
before reading it, so a named pipe cannot hang supervision". A named pipe can
still hang supervision, through five other paths plus the beacon.

## Verdict of this reproduction

CR-520 is CONFIRMED, at HIGH, on the reviewer's severity and on this
reproduction independently. The instance NEW-2 named is genuinely fixed; the
CLASS NEW-2 described is not.

## Consequence for the merge decision

DR-0012's stop-and-wait limit fires for the second time on this phase, and
both of its clauses are met again: more than two fix rounds after the first
dual review, and a high-severity finding recurring in the same component
(`src/liveness.ts`, unprobed blocking read) across consecutive rounds. The
owner's lift of 2026-08-05 was explicitly scoped ("that lifts the stop for
this phase only ... and it applies again to M1-P5 if this round does not come
back clean on both reviews"), so it does not cover this. The phase is not
merged and no further fix round is dispatched on the orchestrator's own
authority.
