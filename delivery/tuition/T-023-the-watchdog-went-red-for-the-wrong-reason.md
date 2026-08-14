# T-023: the watchdog went red for the WRONG REASON, and acting on it would have destroyed healthy work

- date: 2026-08-14
- author: orchestrator
- subject: the M3-P10 dispatch watchdog, first arm
- status: closed. The defect is in the watchdog, not in anything it watched.

## What happened

M3-P10 was dispatched at about 05:20Z. Its watchdog fired at 05:27:09Z with:

```
M3-P10 WATCHDOG STALE: no write across repo OR scratch for 8768s
```

8768 seconds is two hours twenty-six minutes. The agent was **ten minutes old**.
Measured immediately afterwards, it was healthy: its worktree
`scratchpad/p10/wt` had been written 31 seconds earlier, and it had already
created its branch and pushed it.

**The correct response to a stale watchdog is to salvage and re-dispatch.** Had
that been done, a healthy agent would have been killed ten minutes into a phase
whose plan section is the longest in the milestone.

## The mechanism

`find`'s expression grammar. The arm was written:

```
find "$REPO" -maxdepth 2 -newermt "@$DISPATCH" \
     -path "$REPO/.git" -prune -o -path "$REPO/node_modules" -prune -o \
     -path "$REPO/dist" -prune -o -printf '%T@\n'
```

`-o` is a disjunction and juxtaposition is conjunction, so that parses as:

```
(-newermt AND -path .git AND -prune)
  OR (-path node_modules AND -prune)
  OR (-path dist AND -prune)
  OR (-printf)
```

**The final branch, the one that actually prints, carries NO time filter.** So
the repo arm reported the newest entry in the entire repository regardless of
dispatch time. That was `delivery/review` at 02:59Z, which is exactly 8768
seconds before the alert. The scratchpad arm was correctly filtered and returned
nothing, because the agent had not written there yet at arm time.

The fix is to put the prunes FIRST and the tests LAST, so `-newermt` and
`-printf` sit in the same branch:

```
find "$REPO" -maxdepth 2 -path "$REPO/.git" -prune -o ... -o -newermt "@$DISPATCH" -printf '%T@\n'
```

## Why this is a NEW variant, and why it is worth its own entry

This repository has recorded the guard-that-cannot-go-red shape at least five
times: a watchdog testing existence rather than freshness, a control-character
check blind to NUL, a watchdog pointed at a subset of an agent's paths, an
expired monitor, and a gate command crash printing as a skip.

**Every one of those was a FALSE GREEN. This is a FALSE RED.**

They are not the same failure and the second is not obviously milder:

| | false green | false red |
|---|---|---|
| what it costs | the thing you were watching for happens unseen | you take the remedy against a healthy subject |
| here, the remedy is | nothing, you never act | salvage and re-dispatch, which DESTROYS the run |
| how it is caught | by something else noticing later | by measuring before acting |

A watchdog that cries wolf also degrades the response to the true alarm, which
is the second-order cost and the reason this is written down rather than quietly
fixed.

## What saved it

The binding rule at CLAUDE.md:1 to MEASURE the agent's paths at every stale
reading rather than trusting the reading. T-014 records six occasions where a
watchdog was pointed at the wrong place, including one that read a healthy round
as approaching stale for fifteen minutes, and states that the correct response to
a stale watchdog would have killed it three-quarters through its work.

That rule was written for false greens. **It caught a false red, and the same
sentence covers both**: the reading is a prompt to measure, never a fact.

## What this entry does NOT establish

- **No sweep of earlier watchdogs has been run.** The same malformed expression
  may have been used in earlier arms today; they would have reported a false
  stale only when the scratchpad arm was also empty, which is a narrow window and
  is why this surfaced once rather than repeatedly. Nobody has checked.
- **It does not show the fix is correct**, only that the old expression was
  wrong. The corrected arm has not itself been made to go red against a
  genuinely dead agent, which is the red-witness standard this entry does not
  meet.
- **It says nothing about the monitor infrastructure**, only about the shell
  expression handed to it.
