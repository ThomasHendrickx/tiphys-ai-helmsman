# T-023: the watchdog went red for the WRONG REASON, and acting on it would have destroyed healthy work

- date: 2026-08-14
- author: orchestrator
- subject: the M3-P10 dispatch watchdog, TWO false reds from two independent
  causes, ninety minutes apart
- status: both causes fixed. NOT closed: the corrected arm has never been made to
  go red against a genuinely dead agent, so it is not known to be able to fire
  for the right reason. This header said "first arm" and "closed" until the
  second instance falsified both, which is the same defect the entry is about.

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

## SECOND FALSE RED, same watchdog, ninety minutes later, DIFFERENT CAUSE

The corrected arm above fired again at 06:32Z, and again the agent was healthy.
Two false reds from one watchdog in ninety minutes is worse than either alone,
because the second one arrives after the first has already taught the reader to
discount the alarm.

Measured at the moment of the alert, which is the only reason it was not acted
on:

| observation | age |
|---|---|
| `/tmp/tiphys-authored-bytes-*` scratch directories | SECONDS |
| `p10/wt/tsconfig.test.tsbuildinfo` | 404s |
| `/proc/loadavg` | 2.55, a working box |

The agent was in its final verification, running the authored-bytes check, at the
moment it was reported dead.

**Two independent causes, and fixing either alone leaves the other:**

1. **`-maxdepth 2` is too shallow, and directory mtimes do not propagate.** A
   directory's mtime updates when an entry is added or removed DIRECTLY in it,
   NOT when a file nested deeper is modified. The agent writes at depth 3 and
   below under `p10/wt/`, so a busy agent left every depth-2 entry looking
   untouched. Depth raised to 4.
2. **The authored-bytes check writes OUTSIDE both watched trees.**
   `scripts/check-authored-bytes.mjs` creates `/tmp/tiphys-authored-bytes-*` at
   the `/tmp` ROOT, which is neither under the scratchpad nor under the
   repository. CLAUDE.md's dispatch contract already says to watch the union
   including scratch used by gate runs, and this arm did not. `/tmp/tiphys-*` is
   now in the watch set.

**Cause 1 is the more interesting of the two**, because the watch set was not
wrong about WHERE, only about HOW DEEP, and a shallow-but-correct-looking watch
set is exactly the shape T-014 warns is unreliable while reading as precise. The
same mistake would be invisible on an agent that happens to write shallowly, and
this agent did so at first: earlier arms of this same watchdog reported correctly
for over an hour before the work moved deeper.

**So the false red was LATENT and became live when the agent changed what it was
doing.** A watchdog verified correct at arm time is not thereby correct later,
which is the same lesson as the expired-monitor variant one level along.

## What the SECOND instance does NOT establish

- **No sweep has been run over the other watchdogs armed today**, and several
  used `-maxdepth 2` over the same scratchpad. They did not fire falsely, which
  is consistent with their agents writing shallowly rather than with the
  expression being right.
- **Depth 4 is a guess, not a measurement.** Nobody has established the deepest
  path an agent writes; it was chosen because the observed miss was at depth 3.
- **The corrected arm still has no red witness.** It has not been made to fire
  against a genuinely dead agent, so it is not known to be able to go red for the
  right reason. That gap is the same one the first section records and it is now
  twice unclosed.
