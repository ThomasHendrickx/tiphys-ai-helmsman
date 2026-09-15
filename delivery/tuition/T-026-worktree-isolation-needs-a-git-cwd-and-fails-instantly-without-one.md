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
