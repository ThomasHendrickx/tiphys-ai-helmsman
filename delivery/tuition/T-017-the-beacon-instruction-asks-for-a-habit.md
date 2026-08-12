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

## What happened, four times, twice with the same number

T-008 makes it binding that every dispatched agent writes its output
INCREMENTALLY, creating its artifact within the first minutes and appending as
it works, so that a death leaves a partial result rather than nothing. Every
brief this session carried that instruction, in those words, with the reason
attached.

All four agents dispatched today obeyed the first half and not the second:

| agent | created | then sat at | for | after a nudge |
|---|---|---|---|---|
| clean-room contract B | yes, early | **23 lines** | ~25 minutes | 482 lines |
| exit-test harness implementer | yes, early | **23 lines** | ~11 minutes | 493 lines |
| M3-P6 implementer (earlier, the one that died) | yes, early | 262 lines | until death | n/a, it died |
| M3-P6 fix round 1 | yes, early | 999 lines | ~16 minutes | 1269 lines |

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
session does not have. Four nudges today were four interruptions that happened
to land because the watchdogs were being watched closely. On a session where
they were not, the same four agents would have batched.

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

- **It does not claim the instruction was ignored.** All four agents created
  the artifact early, which is the half with a trigger. The half without one is
  the half that did not happen, and that is the finding.
- **It did not claim three was enough to predict the fourth, and the fourth
  then happened.** ADDED AFTER THE FACT, which is the only reason it is worth
  anything: the M3-P6 fix-round implementer batched from 999 lines for about
  sixteen minutes and resumed to 1269 within one tool round of the nudge. That
  is four for four on the pattern and four for four on the nudge. The
  reservation below still stands and is NOT withdrawn: all four were dispatched
  by the same orchestrator with near-identical briefs, so the sample is not
  independent in the way the count suggests, and a fifth from a different brief
  would be worth more than these four.
- **It does not claim the per-action wording is what fixed the fourth.** The
  fourth nudge USED the per-action wording and the first three did not, so the
  nudge and the wording are confounded in that instance. What is measured is
  that a nudge works, not which nudge.
- **It does not measure what would have been lost.** No agent died during a
  batching window today, so the cost of the pattern is inferred from
  delivery/tuition/T-002-agent-death-mid-fix-round.md:1 and
  from the M3-P6 death rather than observed here.
- **It says nothing about why agents batch.** No cause was established. That
  writing up feels like a closing activity is a guess, not a finding.

## POSTSCRIPT, 2026-08-12: the instruction told the agent to destroy evidence

The entry above is about agents not following the beacon instruction. This
postscript is the opposite and it is worse: **an agent followed it exactly, and
following it exactly is what caused the harm.** The defect is in the
instruction, which is the orchestrator's, not in the agent.

The dispatch briefs this session carried both of these, as separate binding
items:

- "Append after each command whose output you will cite, BEFORE running the
  next one." Then: "COMMIT AND PUSH as you go."
- "PUSH, then LET the `gates` workflow COMPLETE before reporting."

**A push cancels the in-flight run on the previous head.** So an agent obeying
the first item on every cited command cancels CI on every cited command, and
the second item becomes unsatisfiable. The two are in direct conflict and
nothing in the brief says which wins.

Measured on the M3-P6 fix round: SIX heads pushed in about two hours,
`64e1ba8`, `6c1b010`, `5e33361`, `4dbf0c4`, `b4f0f08`, `4619bf8`. One completed
run, a failure on the first. Then cancelled, cancelled, cancelled, cancelled.
For two hours there was no completed gate evidence for the branch on the
critical path of the milestone, and the orchestrator read the cancellations as
the agent being careless rather than as the brief being contradictory.

**The resolution, which the implementer found and stated better than the brief
did: COMMITTING and PUSHING are separable, and only one of them is the beacon.**

- Durability, which is what T-002 and the beacon rule are actually protecting,
  is satisfied by a LOCAL COMMIT plus the file's mtime. A dead agent's worktree
  is recoverable while the container lives, and a local commit survives
  everything short of the reclaim.
- PUSHING is a different act with a different cost. It publishes, and it
  cancels CI.

So the corrected instruction, and it is what future briefs must carry:

> Append to your work history and COMMIT LOCALLY after each command whose
> output you will cite. PUSH when a cancelled run would cost nothing: before
> you have triggered a run, or after the in-flight one has already given you
> its answer. Never push while a run you intend to rely on is in flight.

### The sharper version, found while trying to fix it

The first draft of this postscript assumed the standing procedure was silent on
pushing and that the fix was to add a rule. **It was not silent. The rule was
already there and was already right**, at
.claude/skills/phase-delivery/SKILL.md:98:

    One push per fix round, not six. A fix round is 1 to 2 pushes.

It says "not six". The round pushed exactly six.

So the mechanism is not a missing rule. It is this: **a per-dispatch brief
silently overrides a standing rule, because the brief is more recent, more
specific, and addressed to the agent personally, and nothing compares the two.**
The orchestrator wrote "COMMIT AND PUSH as you go" into a brief without ever
opening the procedure that already said the opposite, and the agent reasonably
followed the instruction written for it over the general one.

That is worse than a gap and it is more general: every brief this orchestrator
writes is an opportunity to overwrite a standing rule by accident, and the
standing rules are exactly the ones that were written because something went
wrong before. A rule that can be overridden by forgetting it is not much of a
rule.

The counterfactual is mechanical and cheap: **before writing a dispatch brief,
re-read the standing procedure it is an instance of, and treat any divergence
as a defect in the brief unless the brief says explicitly that it is
overriding.** An intentional override is fine and sometimes necessary; a silent
one is how a correct rule dies.

**Why this is filed as tuition rather than fixed silently.** The general shape
is one this project has now paid for repeatedly: two rules that are each
correct in isolation, given together, with no statement of precedence, to
someone who will be judged on both. The agent cannot resolve it and will guess.
When it guesses wrong the orchestrator sees a compliance problem, which is the
wrong diagnosis and produces a nagging message instead of a brief fix.

The tell was available and was missed for two hours: the agent was doing
EXACTLY what it had been told, promptly and visibly, and the outcome was still
bad. When a diligent agent's diligence is producing the damage, suspect the
instruction before the agent.

### The author of the rule broke it within the hour

Recorded because it is the strongest available evidence about how easy this is
to violate, and because omitting it would leave the postscript reading as
though the problem belongs to implementers.

While writing everything above, the orchestrator pushed its own paperwork
branch EIGHT times in roughly ninety minutes, once after each document, and
cancelled that branch's own `gates` run every time. It was doing precisely what
it had just finished telling two agents not to do, in the commits that told
them not to do it, and it noticed only when it stopped to read its own CI list.

The pattern is identical: append, commit, push, all as one reflex, because the
beacon rule feels like it names a single action. It names one, and only the
first two thirds of it.

Two things follow. **A rule stated is not a rule practised**, which this
project has recorded before and has now recorded against the person writing the
entry. And the paperwork branch is the case where the cost looked like zero, so
the reflex was never interrupted: nothing depended on those runs until a merge
needed one, at which point the last eight were all cancelled and the ninth had
to run from scratch anyway.

### What this postscript does NOT cover

- **It does not establish that the conflict caused the earlier quiet periods.**
  The same round went sixteen minutes without appending at one point, and that
  is the ORIGINAL T-017 failure, not this one. Two different defects in one
  round; only the second is the instruction's fault.
- **No brief has been rewritten at DISPATCH yet.** The corrected wording above
  has not been carried by any dispatch from the start. The harness fix round in
  flight was dispatched with the OLD wording; the correction was sent to it
  mid-round as a superseding message, before it had triggered a run it would
  need, so that round is covered but not from its brief. The place this has to
  land permanently is the implementer role brief and the dispatch skill, and
  neither has been changed. Until they are, this postscript is a description of
  a defect and not a fix.
- **It does not measure what the cancellations cost in wall clock.** Five
  cancelled runs at roughly seven minutes each is an upper bound on CI time,
  not on delivery time, since the agent worked throughout.
- **The push-cancels-run behaviour was not verified from the workflow
  configuration.** It is inferred from five observed cancellations coinciding
  with five pushes. That inference is strong and it is still an inference.
