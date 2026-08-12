# T-016: an acknowledged alarm says nothing new when the state actually changes

- date: 2026-08-12
- discovered by: the orchestrator, after the M3-P6 implementer died and the
  watchdog that was watching it did not tell anyone
- kernel-relevant: yes. This is a property of the liveness guard the kernel
  ships, not of one session's habits.
- id check: `git log --all --oneline -- 'delivery/tuition/T-016*'` and
  `git log --all --oneline -S'T-016'` both empty, so T-016 has never been
  allocated or retired.

## What happened

The M3-P6 implementer was dispatched with a freshness watchdog armed in the same
turn, per T-008. The watchdog watched the phase worktree and the work history,
reported separately, with a 900-second staleness threshold.

The agent read and derived for long stretches, which is normal. At 955 seconds of
a static work history the watchdog printed:

```
P6 HISTORY STATIC 955s 262L (tree 420s) - check task
```

That is the guard working exactly as designed. So the orchestrator checked the
task, as instructed, and got `running, started 39m ago`. **Alive. The alarm was
correct to fire and correct to be cleared.**

The agent then died. The orchestrator found out at the NEXT scheduled kick, from
`ListAgents` returning `No reachable agents`, not from the watchdog.

## The mechanism

**The watchdog's output is a function of staleness alone, so once staleness is
already past the threshold, a transition from ALIVE-AND-QUIET to DEAD produces no
change in what it says.** Before the death it printed `HISTORY STATIC <n>s -
check task`. After the death it printed `HISTORY STATIC <bigger n>s - check
task`. Same words, larger number, no new information.

The guard was not broken and it had not gone silent. It was SATURATED: it had
already said the only thing it can say, and the operator had already acted on it
and found nothing wrong. A second identical message after an acknowledged first
one carries no signal, and an operator who has just cleared it will clear it
again.

This is one level up from
delivery/tuition/T-014-the-watchdog-watched-the-wrong-place-six-times.md:1,
which is about watching the wrong PLACE. Here the place was right, the threshold
was right, and the alarm still failed to inform, because **an alarm that repeats
itself after acknowledgement is indistinguishable from the state it was
acknowledged in.** The dispatch rule it sits under is
delivery/tuition/T-008-the-orchestrator-had-no-beacon.md:1, and the salvage
discipline that made this cheap is
delivery/tuition/T-002-agent-death-mid-fix-round.md:1.

## Why the cost was near zero this time, which is luck plus one instruction

Nothing was lost. Two reasons, and only the second generalises:

1. **Luck of timing.** The agent had committed its work minutes earlier. A death
   ten minutes sooner would have left the same amount uncommitted.
2. **A standing instruction that was not luck.** The dispatch told it to commit
   as it went and to HOLD its push while a declaration amendment landed. So the
   leavings were two clean local commits rather than a dirty tree, and salvage
   was a push rather than a reconstruction. Measured at salvage: build exit 0,
   and 614 tests with 612 passing, 0 failing and 2 skipped on node v22.22.2 with
   `dist/` built, invocation `npm test`.

The detection gap cost roughly one kick interval of wall clock. That is small
because the kick exists; without it the ceiling is however long until someone
looks.

## Structural consequence

- status: **NOT APPLIED.** Recorded here; no mechanism built.
- target: the watcher and liveness guard. The guard should report a
  TRANSITION, not a level. "Was alive when last checked, is not now" is a
  different message from "still quiet", and only the first is worth waking
  someone for.
- The concrete shape, stated so it can be argued with rather than admired: an
  acknowledged alarm should be latched with the state it was acknowledged AT, and
  should re-fire only when the underlying state CHANGES from that, not when the
  same condition persists. Applied here that means a watchdog whose staleness
  alarm has been cleared against a live agent stays quiet until liveness itself
  changes, and then says so in different words.
- **This wants the liveness signal to be part of the guard rather than a separate
  manual step.** Today the watchdog reads mtimes and the operator reads the task
  list; the guard cannot see what the operator saw, which is exactly why it
  cannot tell the two states apart.

## What this entry does NOT claim

- **It does not claim the watchdog should have caught the death.** A freshness
  guard cannot distinguish a dead agent from a long run; T-008 and T-014 both
  say so and this entry does not overturn it. The claim is narrower: after an
  acknowledgement, it should stop saying the same thing.
- **It does not claim polling `ListAgents` more often is the fix.** That is more
  attention, and this project has recorded three times that a rule depending on
  attention does not survive a busy session.
- **It does not measure how long the agent was dead before discovery.** The
  interval between the last confirmed-alive check and the discovery is bounded by
  the kick period, but the death instant was not observed and is not claimed.
- **It says nothing about why the agent died.** No cause was established; a
  provider usage limit is the pattern this project has seen before and is a guess
  rather than a finding.
