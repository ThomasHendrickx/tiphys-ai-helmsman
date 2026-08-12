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
