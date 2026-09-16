# T-027: four hundred commits of M4 lived only in the container, and the stop condition said NOTHING LEFT

- date: 2026-09-16
- subject: twelve M4 phase branches, and `.claude/orchestrator-next.mjs`
- cost: nothing, because the container was not reclaimed first. That is luck,
  not process.

## What happened

At 01:58 UTC a routine check of branch state found that **no M4 branch existed
on the remote**. Measured, not inferred:

```
$ git ls-remote --heads origin 'refs/heads/claude/m4-*'
$ echo $?
0
```

Zero lines. Twelve local phase branches, 409 commits counted per-branch, **141
distinct commits**, existed in one ephemeral container and nowhere else. The
earliest was 23:52:51 the previous evening, so the exposure was just over two
hours of continuous multi-agent work.

The environment notice for this session states the position plainly: the
container "is reclaimed after a period of inactivity (or when the session
ends), so anything worth keeping needs to be committed and pushed first." The
work was committed. Committed is not pushed, and only one of the two survives.

## The mechanism, not the finding

The finding is "I forgot to push". The MECHANISM is that **every signal I had
was computed from a source that could not see the defect.**

Three signals were available and all three were green:

| signal | what it reads | why it could not see this |
|---|---|---|
| `git status` in each worktree | uncommitted files | clean after a commit; push is not its subject |
| the session stop hook | untracked files | same; it asks about the index, not the remote |
| `.claude/orchestrator-next.mjs` | phases, from origin | see below, and it is the bad one |

The stop condition is the script whose entire purpose is stated in its own
header: a nonzero exit is "a fact the orchestrator cannot report its way
around". Run bare, at 01:58, it printed:

```
milestone M3: 13/13 phases merged to main
NEXT ACTION: NOTHING LEFT. All 13 phases merged and exit-test evidence is on main.
exit 0 (0 means nothing left to do; nonzero means work remains)
```

Two independent defects produced that, and either alone is sufficient.

**Defect 1: the milestone defaulted to a finished one.** The flag existed and
worked; its default did not. The fallback in the file
was the literal `"m3"`, and M3 completed on 2026-08-26. So the DEFAULT
invocation of the un-report-around-able stop condition had been pinned to exit
0 since then, for any milestone that followed. This is the same shape as the
hard-coded `PHASE_COUNT = 10` that T-024 records in this same file: **a
constant is a claim about every future member, and it is false the moment one
is appended.** T-024 fixed the phase count and left the milestone.

My own invocation made it worse rather than catching it. I ran
`MILESTONE=m4 node .claude/orchestrator-next.mjs`. The script reads `--milestone`
from argv and reads no environment variable at all, so the variable was
discarded in silence and I received a confident M3 report. Measured against the
file as it stood, before any fix:

```
$ git show HEAD:.claude/orchestrator-next.mjs | grep -n 'process.env'
$ echo $?
1
```

Exit 1, no hits: there is no environment read in the file. The two argv reads
are the whole of its input handling. That is the third item of the
fix-round contract's list, verbatim: **a usage error read as a clean result.**

**Defect 2: the phase set is derived from the remote, so local-only work is not
an unflagged phase, it is not a phase at all.** `derivePhaseNumbers` harvested
from three sources, and every one of them reads origin: declarations on
`origin/main`, work histories on `origin/main`, and `git branch -r`. Unpushed
work is definitionally outside all three.

That second defect has a consequence worth stating on its own, because it is
what makes this a class rather than an oversight: **the script could not have
warned about this state under any invocation.** Even with `--milestone m4`
supplied correctly, all three sources return empty for M4, and the script would
have exited 4 on "derived ZERO phases". That is its designed non-silent
failure, so it would not have lied, but it would also not have said the one
true thing: that the work existed and was about to be lost.

## What did the derivation NOT cover

Stated because the reviewer's first check is this one.

- **Other repositories.** Only `tiphys-ai-helmsman` was probed.
  `tiphys-ai-helmsman-sandbox` and the fleet remote were not, and the fleet
  remote is known to carry six probe branches awaiting an owner action.
- **Non-phase branches.** The `ls-remote` pattern was `claude/m4-*`. Any
  orchestrator-side branch outside that pattern was not examined. The
  orchestrator's own working branch, `plan/pstack-borrow-review`, is one such
  and was separately confirmed pushed.
- **Uncommitted work.** Four worktrees held modified files at the time of the
  measurement. Those are not covered by a push and are not covered by the new
  check either. They are covered only by the incremental-beacon rule (T-008
  rule 1), which is a different mechanism.
- **Tags, notes and stashes.** Not examined at all.

## The fix, and why it needed two rounds

`.claude/orchestrator-next.mjs` now does three things it did not:

1. **Derives the milestone** from the highest one with any evidence, rather
   than defaulting to a constant. With no derivable milestone it exits 5 rather
   than reporting an idle repository.
2. **Counts unreplicated commits per phase** as `rev-list <local> --not
   --remotes`, and ranks that above every other next action with exit 6. It is
   ranked first because it is the only state the script can observe that no
   later session can recover from.
3. **Discovers worktrees** via `git worktree list --porcelain` instead of a
   hard-coded scratchpad path. The old constant embedded ANOTHER session's
   scratchpad id, a directory that does not exist, so `existsSync` was false on
   every run and the liveness half of this script had been silently inert since
   that session ended. Three guards that cannot go red, in one file, found in
   one sitting.

**The first version of fix 2 was itself half a guard, and the lab caught it.**
Built with two structurally different members of the class, as the
one-witness-is-not-a-class rule requires:

- member A: a local branch whose remote counterpart exists but is BEHIND it
- member B: a local branch with NO remote counterpart, which is today's shape

With only fix 2 applied, member A reddened correctly and **member B did not
appear in the report at all**, because defect 2 above kept it out of the phase
set. Had I witnessed one member and shipped, I would have shipped a check that
was blind to precisely the case that prompted it. The fix is a fourth
harvesting source, local branch names, and both members then redden:

```
  m9-p1    MERGED  [UNPUSHED 2 commit(s)]
  m9-p2    not started  [UNPUSHED 2 commit(s)]
NEXT ACTION: PUSH BEFORE ANYTHING ELSE. ...
exit 6
```

and after pushing both, same tree, same command, the danger is gone and so is
the red:

```
  m9-p1    MERGED
  m9-p2    pushed, 2 commit(s) ahead, NOT merged
exit 2
```

## The rule

**A commit is not a durable artifact. A pushed commit is.** The durability
table in CLAUDE.md says "must be a committed file before the producing session
ends", and that sentence is now known to be insufficient on its own: this
project's own blueprint principle 4 says truth lives in "files and git", and
git here means the remote, because the local one is inside the thing that gets
reclaimed.

Push every phase branch on dispatch, not on completion. A branch with one
commit on it costs nothing to push and converts the failure mode from total
loss to partial loss, which is the same argument T-008 rule 1 makes for writing
an artifact incrementally rather than at the end.

## The pattern this belongs to

Four entries now share one shape, and the count is the point: T-008 (a watchdog
testing existence rather than freshness), T-014 (a watchdog watching a path the
agent does not write to), T-023 (a watchdog red for the wrong reason), T-024 (a
stop condition counting rather than deriving), and now this one, three times
over in a single file. Every instance is **a guard whose condition does not
test the property that matters**, which is the red-witness rule one level up,
and every instance was green while it was broken.

The lesson that is new here is about WHERE to look for the next one: the guards
that failed were the ones nobody had reason to re-read, because they had been
written carefully, reviewed once, and were passing. A passing guard is the
cheapest possible thing to leave alone. Re-derive what each one can actually
observe, on a schedule, and prefer a guard that names its own blind spots in
its output, as CLAUDE.md:1142 already requires of this script and as the
worktree half now does.
