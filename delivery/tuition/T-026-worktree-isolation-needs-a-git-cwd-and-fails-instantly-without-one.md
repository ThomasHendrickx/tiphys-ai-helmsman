# T-026: worktree isolation needs a git working directory, and an unisolated agent takes yours

- date: 2026-09-15
- cost: two dispatch rounds, three agents launched and killed in under three
  seconds each, zero tokens burned. Cheap, and worth recording because the
  second half of it was NOT cheap and only luck made it so.

## What happened

Nine implementers were dispatched for M4 wave 1 and wave 1b. Two distinct
failures, both about WHERE an agent stands rather than what it does.

### Failure 1: worktree isolation is a property of the session's working directory

Wave 1's six agents launched fine. Wave 1b's three failed instantly, all with
the same message:

```
Cannot create agent worktree: not in a git repository and no WorktreeCreate
hooks are configured.
```

**The difference was not the script and not the arguments. It was the
orchestrator's working directory.** Wave 1 was launched while the session's
directory was the repository root. Between the waves the directory had reset to
its parent, which is not a git repository, and the isolation mechanism resolves
against THAT and not against any path in the prompt.

The reset is routine: this session's shell returns to the parent after most
commands. So the condition is easy to satisfy, easy to lose without noticing,
and has nothing to do with the work being dispatched.

**The failure mode is the good kind and that is worth naming too.** It is
instant, it is loud, it names the cause, and it costs nothing. Compare the
watchdog failures this project has recorded, which were silent and cost hours.
A dispatch that fails in three seconds with a correct message is not a problem
to be defended against; it is a problem to be noticed.

**The fix is one command before any fan-out that uses isolation:**

```
cd <repository-root> && git rev-parse --is-inside-work-tree
```

### Failure 2: an agent WITHOUT isolation takes the orchestrator's clone

Five of wave 1's six were given worktree isolation. The sixth was not, because
its files-to-touch list read as documents only and isolation is not free.

Within minutes the orchestrator's clone reported:

```
branch: claude/m4-p1-harness-probe
```

The unisolated agent had created and checked out its own branch IN THE
ORCHESTRATOR'S WORKING TREE. It was doing exactly what it was told: an
implementer commits on its own branch, and it made that branch where it was
standing.

**Nothing was lost, and the only reason is that the orchestrator's work was
already pushed.** Had it not been, fifteen commits of intake, plan and decision
records would have been sitting in a tree that another process had just moved.

## The mechanism, not the instance

Both failures are the same shape one level up: **a dispatched agent inherits a
LOCATION that nobody wrote down, and the orchestrator's own location is part of
the dispatch contract.**

T-008 made the dispatch contract answer three questions about where an agent
WRITES. This adds a fourth, about where the orchestrator STANDS:

4. **Where does the ORCHESTRATOR stand, and is that a git repository?** If the
   dispatch uses isolation, it must be. If any agent is NOT isolated, the
   orchestrator must not be standing anywhere it minds losing.

## What was changed

- `CLAUDE.md`'s dispatch section gains both rules: isolate EVERY implementer
  including document-only ones, and the orchestrator takes its own worktree
  before dispatching.
- The orchestrator now works from a separate worktree, created before the next
  dispatch rather than after the incident.

## What this does NOT cover

- Whether the same reset affects other tools that resolve against the session
  directory. Only the workflow isolation path was observed failing.
- Whether an unisolated agent would have collided destructively with
  UNCOMMITTED orchestrator work. It did not happen here because there was none,
  and the account above should not be read as evidence that it is survivable.
- The `WorktreeCreate` hook path named in the error message was not
  investigated. There may be a configuration that removes the git-cwd
  requirement entirely, and nobody has looked.


## Postscript, 2026-09-16: a third location failure, in the watchdog itself

The watchdog armed for these ten agents took the NEWEST write across the UNION
of all agent worktrees and compared that one number to a threshold.

**That guard cannot go red while any single agent is alive.** Nine busy agents
mask one dead one, permanently, and the reading it prints is indistinguishable
from full health. It was armed twice in that form, and the second arming was
done while re-reading the rule that forbids it.

T-014 records the inverse and this project has now paid for both:

| shape | why it cannot go red |
|---|---|
| watch a SUBSET of the agent's paths (T-014) | the agent writes somewhere the watchdog is not looking, so quiet reads as dead |
| watch the UNION and take the newest (this) | one busy sibling keeps the number fresh, so dead reads as alive |

**The fix is per-agent, and it is four lines of shell:** loop the worktrees,
compute each one's own age, and NAME the ones over threshold. The replacement
prints the branch name of every stale agent rather than a single aggregate
number, so the output says WHICH agent rather than WHETHER any.

**The general rule, which is the reusable half:** a freshness check over N
independent things must be N checks. An aggregate over independent subjects is
not a weaker version of the per-subject check, it is a DIFFERENT check that
answers a question nobody asked. The measured example here is that the aggregate
read 28 seconds while one agent sat at 444, and both numbers were true.

Verified the same way the rest of this entry was: all ten agents were confirmed
alive by a per-agent listing, and the spread between the freshest and the
stalest was 416 seconds.


## Second postscript: a FINISHING agent looks exactly like a dead one

The per-agent watchdog from the first postscript fired within minutes, on
exactly the agent the aggregate had been masking: one implementer at 562 seconds
with no write while its sibling sat at 259.

**It was not dead. It was finishing.**

Its last file writes were build output. Its uncommitted changes were the closing
sections of its work history. An agent composing its final structured response
performs NO FILE WRITES for as long as that takes, so **the end of a healthy
agent's life is indistinguishable, by freshness, from its death.** This is the
same class as the three failures above and it is the one no threshold fixes:
raising the threshold delays every real detection by the same amount.

**What makes it safe is the RESPONSE, not the detection.** The correct action on
a stale reading is to PRESERVE, never to reclaim:

```
git -C <worktree> diff > <salvage>/uncommitted.patch
cp <each modified file> <salvage>/
git -C <worktree> bundle create <salvage>/branch.bundle <base>..<branch>
```

Three commands, nothing mutated, and the worktree left exactly as found. If the
agent was finishing, the copy is wasted and costs seconds. If it was dead, the
work survives. The asymmetry is the whole argument, and it means a watchdog does
not need to distinguish the two cases to be useful.

**What was preserved here**, and it is the argument against reclaiming on a
timer: 28KB of work history, a 23KB test file, a 22KB probe script, and a branch
bundle of three commits. The work history's closing section recorded that the
citations gate does NOT lint work histories, that its own citations were
therefore verified by hand, and that three of them were wrong on first writing
and corrected. A reclaim would have destroyed a finding about a gate's blind
spot, discovered by an agent checking its own work.

**So the rule is not "tune the threshold".** It is: a freshness watchdog reports
a SUSPICION, and the only action it authorises is a non-destructive copy. Any
procedure that lets a timer destroy work is wrong regardless of what the timer
is set to.
