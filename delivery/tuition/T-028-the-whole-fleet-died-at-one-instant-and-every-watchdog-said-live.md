# T-028: fourteen agents died in the same instant, and every guard said "live" one second earlier

- date: 2026-09-16, about 04:16 UTC
- subject: the session token quota, and every watchdog this project has built
- cost: zero work lost, entirely because of the salvage discipline T-026 records.
  Roughly 2.4 million subagent tokens of in-flight work was interrupted.

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

Nothing detected this in time. What made it cost nothing was the response rule
from T-026's postscript 2: **preserve, never reclaim.** Because no worktree had
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
