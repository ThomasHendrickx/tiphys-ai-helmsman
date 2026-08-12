# T-014: the watchdog watched the wrong place, six times in one session

- date: 2026-08-10
- discovered by: the orchestrator, against itself, repeatedly
- severity: no work was lost; the cost was false signals and one near-miss in
  the direction that DOES lose work
- status: mechanism recorded, and the rule it sharpens is CLAUDE.md's T-008

## What happened

T-008 requires a freshness watchdog armed in the same turn as every dispatch,
and says it "watches the newest mtime under the agent's working directory".
In one session the orchestrator built SIX watchdogs against that rule. Every one
of them had a condition that did not test the property that mattered.

| # | what it watched | what it got wrong |
|---|---|---|
| 1 | the beacon FILE alone | an agent writing code but not appending reads as DEAD |
| 2 | elapsed since last write, no dispatch baseline | a fresh agent INHERITS a stale tree, so it fired instantly on a healthy one |
| 3 | a tree whose agent had finished | guaranteed to false-alarm later, watching nobody |
| 4 | a PINNED run id | cannot follow `main` as the head moves |
| 5 | the repo tree only | a gate run writes EVIDENCE to scratchpad, so a live agent read as going stale for 15 minutes |
| 6 | max(re-arm, newest write) | on a RE-ARM the dispatch grace is unwarranted and made a 128s-old tree read as 62s |

Number 5 is the one that nearly cost something. It read a working agent as
approaching stale for a quarter of an hour, and the correct response to a stale
watchdog is to salvage and re-dispatch. Acting on it would have killed a healthy
round three-quarters of the way through its work.

## The mechanism

**Each watchdog was written against where the orchestrator EXPECTED the work to
appear, and the expectation came from the PREVIOUS agent's behaviour rather than
from THIS agent's contract.**

That is why fixing one never prevented the next. The beacon fix did not
anticipate dispatch time. The dispatch fix did not anticipate evidence
directories. Each repair was correct and local, and the shape survived every one
of them, because the shape is not in any single condition. It is in the method
of choosing the condition.

## The second-order finding, which matters more than the six

**T-008's own wording is not mechanical enough, and it is the rule written to
stop exactly this.** "The newest mtime under the agent's working directory"
sounds precise and is ambiguous in at least three ways this session hit:

- a gate run writes to an EVIDENCE directory outside the working tree;
- a freshly dispatched agent has no working directory yet;
- an agent that has finished leaves a directory that goes stale forever.

A rule that reads as mechanical but requires judgment at each application is the
worst kind, because it feels discharged when it is not. That is the same family
as T-008's own postscript (the first watchdog tested EXISTENCE and reported
success two minutes in) and as the red-witness rule one level up.

## What to do instead, and it is three questions, not a template

Before arming any watchdog, answer these IN WRITING in the dispatch turn:

1. **Where does THIS agent write?** Not the last one. Read its brief: if it runs
   gates, it writes evidence outside the tree; if it clones, it writes nowhere
   until the clone lands. Enumerate the paths and watch ALL of them.
2. **What is the baseline before its first write?** Dispatch time, not the
   inherited mtime of whatever the previous agent left. And on a RE-ARM, the
   baseline is the newest existing write, because the grace was already spent.
3. **What does silence mean here?** Say which of "dead", "in a long run", and
   "finished" the watchdog can distinguish, and label its output accordingly.
   A watchdog that cannot tell them apart must SAY SO in its message rather than
   print a number that implies it can.

The corrected form used at the end of this session watches the repo tree AND the
agent's evidence directories, is dispatch-aware, and deliberately EXCLUDES the
orchestrator's own worktrees, because including them would keep the watchdog
green regardless of the agent. **That last exclusion is the important one: a
watchdog that cannot go red is worse than none, since it is trusted.**

## What this entry does NOT establish

- Whether a generic watchdog could be written once and reused. Each agent's
  write set really does differ, so the honest answer is unknown and this entry
  does not claim a template would work.
- Whether any of the six ever produced a WRONG ACTION. It did not: the
  near-miss at number 5 was caught by checking the tree before acting, and no
  agent was killed or re-dispatched on a false signal. The cost was attention.
- Whether the same shape appears in the kernel's own shipped watcher and
  liveness guard (M1-P5). It was NOT audited for this. That is worth doing,
  because the kernel ships a liveness guard to consumers and this entry is about
  the orchestrator failing at the same task six times while building it.

## Postscript, 2026-08-12: the seventh, and the first that would have acted

Recorded under this id rather than a new one because it is the SAME mechanism.
A fresh id for a repeat dilutes both entries.

A watchdog armed in the same turn as the M3-P6 fix-round dispatch fired
`TRANSITION: p6fix history crossed 900s STALE` about three minutes into a
healthy round. Two defects in one script, and they compounded:

1. **SELECTION WAS FIND ORDER, NOT RECENCY.** It resolved the agent's beacon
   with `find ... | head -1`. `find` returns directory order, so it locked onto
   `probe/wrepo`, a worktree seven hours stale, and reported that as the agent's
   silence.
2. **EXCLUSION BY GUESS.** It excluded the `m3p6` worktree on the ASSUMPTION
   that this was the previous implementer's leavings. The agent was writing
   there. Excluding the live directory is how a guard goes permanently blind,
   and it is the mirror of the exclusion this entry already recommends: leaving
   the orchestrator's worktrees IN keeps a watchdog green forever, and taking
   the agent's OUT keeps it red forever.

**This is the first instance in the series that would have produced a WRONG
ACTION.** The body above notes that none of the six ever did, and that the cost
was attention. That is no longer true. The correct response to a stale watchdog
is salvage and re-dispatch, and acting on this one would have killed a round
three minutes in.

Two things held the cost to about four minutes, and both were deliberate rather
than lucky:

- The script LABELLED the suspect value `INHERITED(not yet appended)` instead of
  printing a bare number, because the work history already existed in several
  worktrees and existence proves nothing. The label is what made the diagnosis
  immediate.
- T-016's TRANSITION marker said this was a FIRST crossing rather than a repeat,
  which is the difference between looking and clearing.

**The corrected rule, stated so it is mechanical:** resolve a beacon by the
NEWEST mtime among candidates, never by find order, and exclude only paths known
BY IDENTITY (the orchestrator's own worktrees, and any OTHER live agent's),
never by a guess about which directory the agent will choose. Separate "nothing
written since dispatch" from "stale": they need different words because they
need different responses.

**What this postscript does NOT claim.** It does not claim the corrected rule is
sufficient. Newest-by-mtime picks the wrong file if a stale candidate is touched
by something else, and the exclusion list is still hand-written, so it is one
mis-typed path from the same blindness. It also does not discharge the audit the
section above says is worth doing on the kernel's own shipped watcher, which
remains not done.

## Second postscript, same day: five defect CLASSES in one session, and what that argues

The first postscript recorded one more instance. By the end of the same session
there were FIVE DISTINCT CLASSES, all in guards hand-written by the orchestrator
for a single dispatch:

| # | class | what it did |
|---|---|---|
| 1 | selection by FIND ORDER | `find ... \| head -1` locked onto a worktree seven hours stale |
| 2 | exclusion BY GUESS | excluded the live worktree, assuming it was the previous agent's |
| 3 | baseline MOVED ON RESTART | two restarts for unrelated patches made a real 10:05 write read as "nothing written since dispatch" |
| 4 | silent RE-TARGETING | a finished agent's watchdog latched onto a DIFFERENT LIVE AGENT's worktree, because that tree now held a newer copy of the same filename, and reported the new agent's health under the old agent's label |
| 5 | watching a SUBSET of the trees | an agent comparing heads used FOUR worktrees; the guard watched only the one its report sat in, so a long session in the lab tree would have read as silence |

None produced a wrong action. Three were caught by labels added for exactly that
purpose, and the label that did the most work was printing
`INHERITED(not yet appended)` instead of a bare number.

**Class 4 is genuinely new and this entry did not previously cover it.** The body
above says a finished agent leaves a directory that goes stale forever. It does
not say the guard can start reporting a DIFFERENT agent instead. A watchdog for a
finished agent is not merely useless; it is a source of false confidence about
whoever writes that filename next. **Stop a watchdog when its agent completes**,
rather than letting it run out its timeout.

**Class 5's cause is worth stating because it is not carelessness.** The guard
was written from the same brief that made four worktrees the right design for
that agent, and the design implication was not carried back into the guard. The
answer to T-008's first question changes per agent, and it changes because of
choices the ORCHESTRATOR made in the brief minutes earlier.

### The argument this makes, which is different from "watch the right place"

The body of this entry is about getting a guard right. Five classes in one
session says something else: **a hand-written guard per dispatch is a
hand-written bug per dispatch.** The defect rate is not falling with practice
within the session; each new agent shape introduced a new way to be wrong.

The section above asks whether a generic watchdog could be written once and
reused, and answers honestly that each agent's write set really does differ, so
it is unknown. These five are five data points toward "it has to be", and they
name the shape it would need: recency-based resolution, exclusions by identity
only, a baseline that survives restarts, a lifecycle bound to the agent's, and a
write set derived from the dispatch rather than assumed.

**That is a description of the kernel's own watcher and liveness guard**, which
this project ships and which the body of this entry already flags as never
audited for these shapes. It is still not audited. That remains the open item,
and it is now supported by five failures instead of six instances of one.

### What this postscript does NOT claim

- **It does not claim the five are independent.** One orchestrator, one session,
  guards derived from each other by copying, which is how class 1 nearly
  propagated into a sixth guard before being rewritten from scratch.
- **It does not claim any cost was paid.** No agent was killed or re-dispatched
  on a false signal. The cost was attention and one near miss.
- **It does not establish that a generic guard is achievable**, only that five
  bespoke ones failed in five different ways in one day.

## Third postscript: the class-4 rule was written and then broken within the hour

The second postscript named class 4, a finished agent's watchdog silently
re-targeting onto a DIFFERENT LIVE AGENT, and stated the remedy in its own
words: **"Stop a watchdog when its agent completes."**

That postscript was committed at roughly 11:15. At roughly 11:55 the harness
implementer's watchdog, still running after its agent had completed, latched
onto a reviewer's worktree and reported `wt=CRH-head` under the implementer's
label. Same class, same session, same orchestrator, about forty minutes after
writing the rule down.

**Nothing about the rule was wrong. It simply has no trigger.** "Stop a watchdog
when its agent completes" is a habit: it depends on the operator remembering, at
the moment a completion notification arrives, that a background process
elsewhere is now watching nothing. The completion notification says nothing
about watchdogs, and the turn that handles it is busy doing the thing the
completion unblocked.

That is precisely the finding of
delivery/tuition/T-017-the-beacon-instruction-asks-for-a-habit.md:1, arriving
from the other direction. T-017 is about an instruction given to agents; this is
the same defect in an instruction the orchestrator wrote for itself, and it
failed faster.

**The per-action form, which is what T-017 says actually works:** the stop is not
a thing to remember later, it is PART OF handling the completion. Concretely,
when an agent-completion notification arrives, the same turn that reads the
result stops that agent's watchdog, before dispatching whatever comes next. Not
"remember to stop watchdogs"; "handling a completion includes stopping its
watchdog".

**What this postscript does NOT claim.** It does not claim the per-action form
will hold either. T-017 says the same thing about its own rewording and declines
to predict, and the honest position here is identical: this is a fact about
which wording names a moment, not a prediction that naming a moment is enough.
The only mechanical version is a guard whose lifetime is bound to its agent's,
which is a property the kernel's watcher could have and a hand-written bash loop
cannot.

## POSTSCRIPT 4, 2026-08-12: the baseline was GUESSED, and guessing is permissive

A seventh instance, and it is a new class: not the wrong PLACE, the wrong TIME.

CLAUDE.md's dispatch contract asks three questions in writing before arming a
watchdog, and the second is "What is the baseline before its first write?" It
says the answer must be dispatch time rather than an inherited mtime. **It does
not say the answer must be MEASURED, and on this occasion it was invented.**

Arming a watchdog for a delta verifier, the orchestrator wrote a literal epoch
constant, `BASELINE=1786547700`, intending "dispatch time". The real time was
`1786546543`. The constant was **1157 seconds in the FUTURE**, so every `age`
computation came out NEGATIVE and the monitor printed `-1184s since dispatch`.

The direction is what makes this worth an entry. A baseline in the future makes
every elapsed time smaller than the truth, so **every threshold fires LATER
than intended, and a threshold that fires later is a watchdog that cannot go
red when it should.** Had the agent died in its first twenty minutes, the
monitor would have reported it healthy throughout. This is the T-008 postscript
shape exactly, a guard whose condition does not test the property that matters,
arrived at by arithmetic rather than by watching the wrong path.

It was caught only because the printed number was NEGATIVE and therefore
absurd. A guess that had been 1157 seconds in the PAST would have been
permissive in the same way and would have looked entirely plausible. So the
detection here was luck, not method.

**The rule this adds, and it is mechanical:**

> A watchdog's baseline is MEASURED, never written as a literal. Take it from
> something the system itself recorded: `stat -c %Y` on the agent's worktree,
> or `date +%s` evaluated INSIDE the monitor. If you find yourself typing an
> epoch number, you are guessing, and a guessed baseline is wrong in the
> permissive direction half the time and undetectable when it is.

The corrected monitor recomputes `BASELINE=$(stat -c %Y "$WT")` on every
iteration, so it is derived from the worktree the agent created rather than
from anything the orchestrator believed about the clock.

### "CANNOT DISTINGUISH" WAS ITSELF WRONG, and the answer was one tool call away

Every mtime watchdog written in this session carries a branch that prints, in
these words, "quiet Ns: long run OR death, CANNOT distinguish". That sentence
was added deliberately, under this entry's own rule that a watchdog which
cannot tell those apart must SAY so rather than print a number implying it can.

It is honest about the mtime signal and it is **false about the orchestrator's
actual knowledge**, because for an in-process subagent the harness reports
liveness directly. Measured 2026-08-12: a delta verifier had written nothing
for 917 seconds and had never created its report, which by mtime alone is
indistinguishable from a death and was three quarters of the way to a salvage
decision. `ListAgents` said `running`. It was mid-build, alive, and salvaging it
would have destroyed twenty minutes of work exactly as T-014's worst instance
did.

**So the rule gains a third question, and it is cheap:**

> Before acting on a stale beacon, ask the HARNESS whether the agent is alive.
> `ListAgents` distinguishes running from completed for in-process subagents,
> and mtime cannot. A stale beacon on a RUNNING agent is a beacon-discipline
> problem, which is a nudge. A stale beacon on a COMPLETED or absent agent is a
> death, which is a salvage. **These have opposite correct responses and the
> file system cannot tell them apart.**

This does not contradict constraint C-2, and the distinction matters enough to
state. C-2 forbids pid, process liveness, signals and `/proc` for identity or
exclusion IN THE KERNEL BEING BUILT, where liveness must be lease freshness.
`ListAgents` is the orchestration harness reporting on its own children, not
the kernel inferring identity from a process table. Using it here is not a C-2
violation and reading it as one is how this gap survived three postscripts.

The mtime beacon keeps its job, which C-2 does bear on: it is what survives a
dead agent and leaves partial work behind. Liveness and salvage-value are
different questions and each has its own instrument.

### THE THIRD READING OF A STALE BEACON: starved, by the orchestrator itself

"Dead or in a long run" is not the full disjunction either. There is a third
state and the orchestrator CAUSED it.

Measured 2026-08-12, minutes after the entry above: two agents had gone quiet
for seventeen and twenty minutes and the orchestrator was weighing whether one
was dead. `uptime` reported **load average 13.00 on 4 cores**, better than
three times oversubscribed. The orchestrator was itself running a full `npm
test` in a scratch worktree, in the background, to settle an optional question
about an unowned finding, while two critical-path agents ran suites and gate
bundles of their own.

The agents were not stuck. **They were starved, by their own orchestrator, and
the beacon reports starvation exactly as it reports death.** Worse, the
starvation was invisible from the artefact this entry has spent four
postscripts learning to watch: mtime says quiet, and quiet is quiet whatever
the cause.

Two things follow, and the second is the uncomfortable one.

> **Before reading a stale beacon as trouble, check the LOAD.** `uptime` against
> `nproc` costs nothing. A load average several times the core count means every
> quiet beacon on the box is explained without any of them being dead.

> **The orchestrator's own optional work is not free, and it competes with the
> critical path it is supposed to be protecting.** The measurement being run
> here was a nice-to-have on an unowned finding against `main`. It was slowing
> a milestone's blocking fix round. It was killed, and killing it was correct.

The general shape: an orchestrator that fills its waiting time with local
computation is not idling productively, it is taxing the work it is waiting
for. Waiting is sometimes the highest-value action available, and this project's
standing rule against false stops does NOT mean every idle moment must be
filled with a heavy command. Do paperwork, which is cheap; do not run suites.

### What this postscript does NOT cover

- **The load was not attributed per process.** How much of the 13.00 was the
  orchestrator's own suite and how much was the two agents was not measured;
  killing the probe dropped it to 11.85, which suggests the orchestrator was a
  minority of it. So this records a real effect of unknown size, not a
  quantified one, and the agents were heavy in their own right.
- **No threshold is proposed.** "Several times the core count" is a judgement,
  and this file's whole thesis is that judgements do not survive. A mechanical
  version would have the watchdog emit the load alongside the mtime, and no
  watchdog here does that.
- **The mtime watchdogs in this session were NOT rewritten to consult the
  harness.** They still print "CANNOT distinguish". The rule above is applied by
  the orchestrator at the moment of acting, which is a habit and therefore
  exactly the kind of thing this file records as insufficient. A watchdog that
  emitted the liveness answer itself would be the mechanical version and does
  not exist.
- **It does not audit the other watchdogs armed in this session for the same
  defect.** Two others were armed with `$(date +%s)` evaluated inside the
  monitor, which is correct by construction, and one was armed with a literal
  taken from a `date` command that had actually been RUN, which is correct but
  fragile for the same reason. None was re-checked against the clock.
- **It does not establish why the constant was wrong.** No arithmetic was
  reconstructed. The number was simply not measured, and where it came from is
  not worth recovering.
