# T-008: The orchestrator supervised two agents with no beacon and no guard, and lost nine hours

- id: T-008
- project: tiphys-kernel
- date: 2026-08-06
- stage: M1-P6, fifth review pass
- kernel-relevant: yes (this is the kernel's own subject matter, applied to the process running the kernel's build)

## What happened

Two clean-room review agents were dispatched against `c24fb86` at roughly
19:20 UTC. Both died within minutes, immediately after `npm ci`, and produced
no output at all. The orchestrator did not notice until the OWNER sent a
screenshot of the background-task list at 04:36 the following morning, showing
both agents at 550 minutes elapsed.

**Nine hours and eleven minutes of nothing.** No work was lost, because the
branch was already pushed. The entire cost was wall clock, and it was the
single largest waste in the project to date, larger than every escalation
combined.

During those nine hours the orchestrator answered the owner repeatedly,
dispatched other work, wrote three decision records and ran a throughput
analysis, without once checking whether the thing it was waiting on was alive.

## The part that makes this a tuition entry rather than a mistake

**This project is building the supervision mechanism that prevents exactly
this, and the orchestrator did not apply it to itself.**

M1-P5, the phase that consumed ten hours and four fix rounds, is the watcher
and liveness guard. Its requirement row R-079 reads: supervision never silently
disappears while work is in flight. Its stated design principle, written into
three separate dispatch briefs by the orchestrator, is **"no health from an
absence of evidence."** Plan constraint C-2 is unambiguous: **liveness is lease
and beacon FRESHNESS; never pid, never process liveness, never signals.**

The orchestrator's supervision of those two agents was: dispatch them, and wait
for a completion notification. That is process liveness. It is precisely what
C-2 forbids, for precisely the reason C-2 forbids it: a dead process sends no
notification, and an absence of notification is indistinguishable from work in
progress.

The kernel has a beacon because a watcher that has stopped must be
DISTINGUISHABLE from a watcher with nothing to report. The orchestrator had no
beacon. It had no freshness threshold. It had no guard. It had the thirty
minute stall rule it had stated aloud to the owner earlier the same day, and it
did not apply that either.

## Why the stall rule was not enough, and what is

The stall rule failed because it is a rule addressed to attention, and
attention is what a busy orchestrator does not have. This project has already
recorded, twice, that a rule which depends on remembering does not survive
contact with a busy session: tuition T-006 notes the pattern "survived being
documented as a norm", and the answer there was a mechanical grep.

The same answer applies here. The kernel's own design is the specification:

- **A beacon.** Every dispatched agent must leave observable freshness. An
  agent writing its report INCREMENTALLY is a beacon: the file's mtime is the
  evidence of work. An agent that writes only at the end has no beacon, and
  when it dies it leaves nothing, which is exactly what happened here.
- **A guard.** A separate process that reads that freshness and reports stale,
  running independently of the thing it supervises. A background watchdog is
  the available form.
- **Freshness, not liveness.** The guard must ask "when did evidence last
  change", never "did anything tell me it stopped".

## Binding consequence, added to CLAUDE.md the same day

No agent dispatch without a freshness watchdog armed in the same turn. Two
rules, both mechanical:

1. Every dispatched agent is instructed to write its output INCREMENTALLY,
   creating its artifact within the first minutes and appending as it goes. Its
   file mtime is its beacon. This also means a death leaves a partial result
   rather than nothing.
2. A background watchdog is armed in the same turn as the dispatch, and it
   watches FRESHNESS (newest mtime in the agent's working directory), not
   existence and not completion.

## A second, smaller instance in the fix itself

The first watchdog written after this failure had the wrong exit condition. It
tested whether the report FILE EXISTED, and both reviewers created their
skeleton within two minutes, so it fired immediately and reported success while
telling the orchestrator nothing.

That is T-006's shape in a shell script: a guard written, run green, and green
meaning nothing because the condition did not test the property that mattered.
Corrected to test staleness of the newest mtime. Recorded because the first
attempt at a fix reproducing the class the fix is for is worth knowing about.

## What this says about the kernel being built

The strongest available argument for this kernel is in this entry. A competent
orchestrator, holding the design, having written the rule aloud that morning,
supervising only two agents, still lost nine hours to a silent stop. Not from
carelessness: from being busy with real work while a signal that was never
going to arrive failed to arrive.

That is the failure mode the watcher and the liveness guard exist for, and the
reason they belong in a kernel rather than in a habit. The blueprint's claim
that supervision must be structural rather than attentive is not a theoretical
position. It is now measured, on the project's own orchestrator, at nine hours
and eleven minutes.

## Evidence

- The owner's screenshot of the background task list, 04:36 UTC 2026-08-06,
  showing both agents at 550m58s and 551m20s elapsed.
- Last file activity in both review worktrees: 19:25:08 and 19:23:49 UTC.
- Branch state unaffected: `claude/m1-p6-toy-sandbox-exit` at `c24fb86`
  throughout, working tree clean, paperwork branch in sync.
- The rule that was stated and not applied: the orchestrator's own message to
  the owner earlier that day, "my stall rule is 30 minutes without progress".
- The constraint violated: plan v1 section 3, C-2 (FM-053).
- The requirement whose subject this is: R-079, and blueprint section 4's
  watcher and liveness-guard contracts.
