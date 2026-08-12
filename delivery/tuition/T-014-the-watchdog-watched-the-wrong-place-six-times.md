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
