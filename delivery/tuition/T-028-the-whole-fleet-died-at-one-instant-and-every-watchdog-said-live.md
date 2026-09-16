# T-028: fourteen agents died in the same instant, and every guard said "live" one second earlier

- date: 2026-09-16, about 04:16 UTC
- subject: the session token quota, and every watchdog this project has built
- cost: no work lost in the end, but NOT for the reason first written here. The
  salvage recovered three branches and BROKE a fourth; see the correction at the
  end, which is the more useful half of this entry. Roughly 2.4 million subagent
  tokens of in-flight work was interrupted.

## What happened

Fourteen agents were running: eight clean-room reviews, five fix rounds, and the
two merge-blocker implementers. Every one of them returned the same failure in
the same instant:

```
[fix:M4-P23]        failed: You've hit your session limit, resets 4:20am (UTC)
[review:M4-P10:B]   failed: You've hit your session limit, resets 4:20am (UTC)
[fix:M4-P19]        failed: You've hit your session limit, resets 4:20am (UTC)
[fix:M4-P26]        failed: You've hit your session limit, resets 4:20am (UTC)
[review:M4-P1:solo] failed: You've hit your session limit, resets 4:20am (UTC)
[review:M4-P20:solo]failed: You've hit your session limit, resets 4:20am (UTC)
[fix:M4-P2]         failed: You've hit your session limit, resets 4:20am (UTC)
[m4w1:p11-single-family] failed: You've hit your session limit, resets 4:20am (UTC)
[m4w1:p15-charter]  failed: You've hit your session limit, resets 4:20am (UTC)
[fix:M4-P27]        failed: You've hit your session limit, resets 4:20am (UTC)
```

Two reviews had already returned and are unaffected. Everything else stopped
mid-work.

## The mechanism, and it is NOT "an agent died"

This project has five recorded variants of "a watchdog could not go red". This
is a different shape and it deserves its own entry: **the watchdog worked
perfectly and was useless anyway.**

The watchdog measures FRESHNESS: the newest mtime across a workflow's agent
transcripts. Every one of those fourteen agents was writing continuously right
up to the instant it died. The last heartbeat before the kill reads, verbatim,
`wf_16d43c4d-a7b:live(0s,...)`, `wf_325aa631-d2d:live(4s,...)`. Zero seconds
stale. Then all fourteen stopped at once.

**A quota kill has no leading indicator in the signal any freshness watchdog
measures.** Death by crash is preceded by silence; death by quota is preceded by
maximum activity, because activity is what spends the quota. The guard is not
merely late here, it is pointed at a quantity that moves the WRONG WAY before
the event.

## The orchestrator's actual error, which is upstream of all of that

I dispatched fourteen concurrent agents without ever looking at the quota.

Every dispatch discipline this repository has written is about CPU and
liveness. The concurrency section at CLAUDE.md:1157 reasons entirely about
`nproc`, the per-workflow cap of `min(16, CPUs - 2)`, and load average, and
concludes that the fix for slowness is MORE workflows. That is correct about throughput and it
is silent about the resource that actually ran out. The measured numbers make
the omission plain: those fourteen agents reported roughly **2.4 million
subagent tokens** between them, and the per-workflow cap had nothing to say
about it because the cap counts processes.

So the rule at CLAUDE.md:1184 ("before dispatching any fan-out, state in
writing: how many agents, in how many workflows, therefore how many run at
once") asks for the wrong third number. **How many run at once is a CPU question. How
much they will spend is the question that kills the fleet.**

## What actually saved the work, and it was not a guard

Nothing detected this in time. What made it MOSTLY cost nothing was the response
rule from T-026's postscript 2: **preserve, never reclaim.** Because no worktree had
ever been reclaimed, all fourteen were still on disk with their contents intact,
and a single sweep recovered everything:

| worktree | preserved |
|---|---|
| `claude/m4-p26-rollback` | 95,901 bytes STAGED, never committed |
| `claude/m4-p11-single-family-exception` | 37,633 staged + 2,722 unstaged |
| `claude/m4-p23-retirement-inventory` | 34,126 unstaged |
| the M4-P19 fix worktree | 1,915 unstaged |

All four were committed verbatim as `WIP-UNREVIEWED:` commits and pushed. The
resuming agents are told in their brief that such a commit is unreviewed, may
stop mid-sentence, and must be verified rather than trusted or discarded.

**Note what the numbers say about the alternative.** The largest single
recovery was STAGED and not committed. An agent that stages as it goes and
commits at the end leaves nothing in `git log` and everything in the index, so
a policy of "salvage committed work" would have recovered zero bytes from the
phase that had the most to lose. Salvage must read the index and the working
tree, not the history.

## The rules

1. **Before any fan-out, estimate the token cost, not only the agent count.**
   A clean-room review of one phase measured between 150,000 and 490,000
   subagent tokens here. Fourteen of those is millions. If that number is not
   known, the dispatch is a guess.
2. **Stagger a large fan-out rather than launching it flat.** Fourteen at once
   converts a quota boundary into a total loss of in-flight state; four at a
   time converts it into one interrupted agent.
3. **A freshness watchdog cannot see this coming and must not be relied on to.**
   State that limit in its own output, as it now states the three states it
   cannot distinguish.
4. **Salvage reads the INDEX and the WORKING TREE, not just commits.** The
   largest recovery in this incident was staged-but-uncommitted.

## What this account does NOT cover

- **The quota itself.** I did not find an interface that reports remaining
  budget before a dispatch, and I did not look hard, because the reset was
  minutes away. Whether one exists is unestablished, and rule 1 is much weaker
  without it: an estimate from past agent costs is not a reading.
- **Whether the two returned reviews were affected.** M4-P16's B reviewer and
  M4-P13's reviewer completed and their output is used. Whether either was
  degraded by contention near the boundary is not checked.
- **The 2.4 million figure.** It is the sum of the `subagent_tokens` each
  workflow reported on failure, which is what those agents SPENT, not what the
  quota counts. The two may differ and I have not reconciled them.

## CORRECTION, half an hour later: the salvage REVERTED a completed fix round

Written above: "all four were committed verbatim". That was true and it was not
safe, and the paragraph calling it a clean recovery was wrong within the hour.

The `WIP-UNREVIEWED` commit on `claude/m4-p26-rollback` was **not new work**. It
was a pure reversal of that phase's entire first fix round: twenty files, +76
and **-1450**, deleting ten witness specs, 486 lines of `src/cutover.ts` and 615
lines of `test/cutover.test.ts`.

It was caught by the fix agent dispatched to resume that phase, which proved it
with object hashes rather than reading the diff and guessing:

```
git rev-parse 7dcce83^{tree}   ->  86dd8afb7471915086899e214a9f94f51f495fc7
git rev-parse 134b131^{tree}   ->  86dd8afb7471915086899e214a9f94f51f495fc7
git diff --stat 7dcce83 134b131 ->  empty
```

The salvaged tree was byte-identical to the head the clean-room REVIEWS were
written against. It carried nothing of its own.

### The mechanism, which is one sentence and I did not think of it

**`git status` in a worktree is relative to THAT WORKTREE'S OWN HEAD, not to the
branch tip.**

A REVIEWER's worktree is checked out at the head under review and stays there.
When the implementer afterwards commits a fix round, the reviewer's worktree does
not move. Its files are now older than the tip, so `git status --porcelain`
reports them as twenty modifications, and `git add -A && git commit` writes the
OLD tree over the new one. The output of `git status` is identical in shape
whether a worktree holds unsaved progress or holds a stale checkout: twenty
changed files either way.

I read "twenty changed files" as "twenty files of unsaved work" and never asked
which HEAD they were changed against.

### The guard, and it is two commands

Before committing any salvage, both of these, per worktree:

```
git -C <worktree> rev-parse HEAD          # is this the branch tip?
git -C <worktree> rev-parse <branch>      # if these differ, the worktree is STALE
git -C <worktree> diff --shortstat        # a salvage that is mostly DELETIONS is a reversal
```

The second is the cheap tell and it was visible in my own output at the time:
three branches read `+637/-6`, `+350/-51`, `+8/-4`, and the fourth read
`+76/-1450`. **One of these is not like the others**, and the number was printed
on my screen before I pushed.

### What this changes about the rules above

Rule 4 said "salvage reads the INDEX and the WORKING TREE, not just commits".
That is still right and it is now insufficient. The full rule:

> **Salvage reads the index and the working tree, AND establishes that the
> worktree's HEAD is the branch tip before believing what it finds there.** A
> stale worktree's contents are not a rescue, they are a time machine pointed
> backwards.

And the meta-lesson, which is the one this project keeps relearning: what saved
this was not a guard, it was an agent told to **verify rather than trust** an
artifact handed to it. The resume brief said a `WIP-UNREVIEWED` commit is
unreviewed, may stop mid-sentence, and must be verified rather than trusted or
discarded. It was, and the instruction earned its place in one round.

## Postscript: my dispatch brief asserted findings the reviews did not contain

Found 2026-09-16 by the M4-P2 fix-round implementer, and it belongs with this
entry because it is the same root as the salvage error above: **an artifact
handed to an agent was trusted by its author and not by its reader, and the
reader was right.**

The brief `m4-fix.js` carried two hard-coded sentences about the phase's reviews:

- "Both clean-room reviewers returned FIX-ROUND-NEEDED."
- "One reviewer already did half of this for you: it grouped five separate
  defects as one family, 'a write or a verdict whose scope is wider or narrower
  than the sentence describing it, with no test over the difference'."

Both were written while dispatching ONE phase and then sent to EVERY phase the
script was used for. The implementer checked rather than accepted:

> "The dispatch attributed a five-defect grouping to a reviewer; that sentence is
> in neither review of this phase (grep over all three review files, exit 1), so
> I derived the family from the findings that are actually present."

The first sentence was false for every single-round phase under DR-0027, which
has one reviewer, and for any phase whose reviewers split. The second was a
fabricated attribution: a quotation put in a reviewer's mouth by a template.

**This is more serious than a stale template**, because of what the brief is for.
It tells an implementer what the reviewers found, and the implementer has no
independent reason to doubt it. A brief that invents a finding is indistinguish-
able, from inside the round, from a review that contains one. This one cost the
implementer effort on a grouping that did not exist; a less careful round would
have "fixed" a mechanism nobody reported and written a work history saying so.

The fix is to remove the claim rather than to correct it. The brief now says
plainly that it does not know what the reviews say and will not pretend to, names
this incident as the reason, and tells the implementer to derive the mechanism
family itself and to TEST any grouping a review offers rather than adopt it.

**The general rule, which this project keeps arriving at from new directions:**
a template may carry PROCEDURE and must not carry FINDINGS. Procedure is true
every time it is sent; a finding is true once.

## The guard in the correction above is INSUFFICIENT, and here is the one that works

Written hours after the correction, and it matters because the guard I proposed
would have passed the very case it was written for.

The correction says to compare the worktree's HEAD against the branch tip and
treat a difference as staleness. Measured against a real stale worktree today:

```
its HEAD: c7402b1   branch tip: c7402b1   uncommitted there: 6
```

**HEAD and the tip are EQUAL and the working tree is stale anyway.** The reason
is a property of git that the proposed guard walks straight past: when two
worktrees have the SAME BRANCH checked out, `rev-parse HEAD` in either one
resolves through the branch ref. One worktree commits, the ref moves, and the
OTHER worktree's HEAD now reads the new tip while its index and files are still
the old content. Those 6 "uncommitted changes" were not work. They were the
REVERSE of the fix round, waiting to be committed by anyone who trusted
`git status`.

### What actually detects it

Ask git which branches are checked out more than once:

```
git worktree list --porcelain \
  | awk '/^worktree /{w=$2} /^branch /{print $2, w}' \
  | sort | awk '{c[$1]++; l[$1]=l[$1]" "$2} END {for (k in c) if (c[k]>1) print k, l[k]}'
```

Run today it printed three, each with a LIVE agent in one worktree and one or
two dead ones holding the same branch:

| branch | worktrees sharing it |
|---|---|
| `claude/m4-p26-rollback` | 3 |
| `claude/m4-p23-retirement-inventory` | 3 |
| `claude/m4-p2-async-launch` | 2 |

**This closes the M4-P26 incident completely.** Two worktrees held that branch,
`wf_2b81e806-d59-1` and `wf_a1849252-b71-1`, and my salvage sweep read the older
one. It was not bad luck and it was not a subtle judgement call: it was a
detectable configuration that nothing was looking for.

### The rule, third and final form

Before salvaging ANY worktree:

1. **Enumerate branches checked out more than once.** A worktree sharing its
   branch with another is presumed stale until shown otherwise, whatever its
   HEAD says.
2. **Read the direction of `git diff --shortstat`.** A salvage that is mostly
   deletions is a reversal. This is the check that would have caught it on the
   day, and it remains the cheapest.
3. **HEAD against the branch tip is NOT a sufficient test** and this entry now
   exists partly to retract it.

A worktree whose branch is shared and whose diff is mostly deletions should be
REMOVED rather than committed, which is the opposite of preserve-never-reclaim
and is not a contradiction of it: the rule protects WORK, and a stale checkout
holds none.

### The detector run in anger, same day

Applied to the live repository within the hour. Three branches were shared, eight
worktrees between them, and the direction test separated them without a judgement
call:

| worktree | branch | `diff --shortstat` vs HEAD | verdict |
|---|---|---|---|
| `wf_badbbac6-8f2-2` | m4-p2 | 24 insertions, **1810 deletions** | reversal |
| `wf_2b81e806-d59-2` | m4-p23 | 71 insertions, **1321 deletions** | reversal |
| `wf_cc74053e-aaa-1` | m4-p23 | 30 insertions, **981 deletions** | reversal |
| `wf_2b81e806-d59-1` | m4-p26 | 79 insertions, **2401 deletions** | reversal |
| `wf_a1849252-b71-1` | m4-p26 | 4 insertions, **952 deletions** | reversal |
| `wf_59bd9e39-597-1` | m4-p23 | **258 insertions**, 26 deletions | REAL WORK |
| `wf_17dfe326-121-1` | m4-p26 | clean | live agent |

The five reversals were removed; the two were left. All three branch tips are
unchanged afterwards, and no branch is checked out more than once any more.

**The sixth row is why the liveness check alone is not enough either.** A
five-minute freshness probe read `wf_59bd9e39-597-1` as NOT live, because its
agent was inside a long tool call, while its journal still showed the round
unfinished and its diff showed 258 lines of new work. Removing it on the
freshness reading would have destroyed a running fix round. **Direction decided
it; freshness would have got it wrong.**
