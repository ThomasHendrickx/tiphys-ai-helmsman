# T-017: the beacon instruction asks for a habit, and habits do not survive a working agent

- date: 2026-08-12
- discovered by: the orchestrator, after nudging three consecutive agents about
  the same thing and noticing the number was the same every time
- kernel-relevant: yes. T-008's beacon rule is a DISPATCH CONTRACT clause, and
  M3 ships dispatch contracts. If the clause does not produce the behaviour, the
  kernel will ship a clause that does not produce the behaviour.
- id check: `git log --all --oneline -- 'delivery/tuition/T-017*'` and
  `git log --all --oneline -S'T-017'` both empty, so T-017 has never been
  allocated or retired.

## What happened, three times, with the same number

T-008 makes it binding that every dispatched agent writes its output
INCREMENTALLY, creating its artifact within the first minutes and appending as
it works, so that a death leaves a partial result rather than nothing. Every
brief this session carried that instruction, in those words, with the reason
attached.

All three agents dispatched today obeyed the first half and not the second:

| agent | created | then sat at | for | after a nudge |
|---|---|---|---|---|
| clean-room contract B | yes, early | **23 lines** | ~25 minutes | 482 lines |
| exit-test harness implementer | yes, early | **23 lines** | ~11 minutes | 493 lines |
| M3-P6 implementer (earlier, the one that died) | yes, early | 262 lines | until death | n/a, it died |

Twenty-three lines, twice, independently. That is the header an agent writes
when it creates the file, and then nothing until it has something it considers
worth reporting.

Nothing was lost. Both live agents were nudged and both resumed appending
immediately and without complaint. The third one died, and what saved it was a
DIFFERENT instruction in the same brief, "commit as you go", which had produced
two clean local commits.

## The mechanism

**The instruction asks for a HABIT, sustained across a whole session, and it is
read once at dispatch.** "Append as you work" has no trigger. There is no moment
at which an agent deep in a derivation is prompted to notice it is due.

The nudges that worked did not repeat the instruction. They replaced it with a
PER-ACTION rule bound to something the agent was already about to do:

> after each derivation command, paste the command and its FULL output into the
> work history before moving on; after each defang, write the input you
> corrupted, the command, the captured exit code, and the verdict

That fires at a specific, frequent, unmissable moment. The original does not.

This is the shape this project has now recorded four times over:
delivery/tuition/T-005-lessons-do-not-propagate-between-phases.md:1 and
delivery/tuition/T-006-unexecuted-claims-about-the-world.md:1
both conclude that a rule depending on memory does not survive a busy session
and that the answer is a mechanism, and `CLAUDE.md`'s claim-grep entry says
outright that "a grep is mechanical; a reminder is not". The beacon instruction
was left as a reminder while the rules around it were being mechanised.

## Why the nudge is not the fix

The nudge works every time and it is still the wrong answer, for the reason
delivery/tuition/T-016-an-acknowledged-alarm-says-nothing-new-when-the-state-changes.md:98
gives: it costs ORCHESTRATOR ATTENTION, and attention is what a busy
session does not have. Three nudges today were three interruptions that happened
to land because the watchdogs were being watched closely. On a session where
they were not, the same three agents would have batched.

## Structural consequence

- status: **PARTIALLY APPLIED.**
- APPLIED: the dispatch briefs' beacon clause is being rewritten from a habit
  ("append as you work") to a per-action trigger ("append after each command
  whose output you will cite, before running the next one"). That is a wording
  change the orchestrator controls and it costs nothing.
- NOT APPLIED: nothing enforces it. The honest position is that a per-action
  trigger is still an instruction, and this entry does not claim rewording will
  hold where the previous wording did not. It claims only this, which is a fact
  about the two texts rather than a prediction: the per-action form NAMES a
  moment at which to append, and the previous form names none.
- target, for the kernel rather than for this session: the dispatch contract
  M3 ships should carry the per-action form, and the watcher should be able to
  distinguish "alive and not appending" from "possibly dead", which is a
  distinction the orchestrator's own watchdogs only gained today and which
  belongs in the guard rather than in one session's scripts.

## What this entry does NOT claim

- **It does not claim the instruction was ignored.** All three agents created
  the artifact early, which is the half with a trigger. The half without one is
  the half that did not happen, and that is the finding.
- **It does not claim three is enough to predict the fourth.** Three is what
  this project's own convention calls a mechanism rather than three anecdotes,
  and that convention is being applied here rather than a new one invented, but
  all three were dispatched by the same orchestrator with near-identical briefs,
  so the sample is not independent in the way the count suggests.
- **It does not measure what would have been lost.** No agent died during a
  batching window today, so the cost of the pattern is inferred from
  delivery/tuition/T-002-agent-death-mid-fix-round.md:1 and
  from the M3-P6 death rather than observed here.
- **It says nothing about why agents batch.** No cause was established. That
  writing up feels like a closing activity is a guess, not a finding.
