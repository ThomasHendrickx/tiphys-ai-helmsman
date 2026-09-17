# T-033: the stop condition reported a finished milestone with six phases unbuilt

**Measured:** 2026-09-17, on `main` at `d938557`.

## What happened

The hourly durable floor ran `.claude/orchestrator-next.mjs`, which exists to be
the one fact an orchestrator cannot report its way around. It printed:

```
milestone M4: 24/24 phases merged to main
exit 3 (0 means nothing left to do; nonzero means work remains)
```

Exit 3 is defined in the floor's own prompt as "all phases merged, exit test not
run". Six phases were not started: M4-P9, M4-P12, M4-P21, M4-P22, M4-P24 and
M4-P25.

**The next action that reading invites is running the M4 exit test and calling
the milestone done.** This is the script's own false green, in the script whose
whole purpose is to prevent exactly that.

## The mechanism

`derivePhaseNumbers`, at .claude/orchestrator-next.mjs:239, took the union of
four sources, and the union of four
sources is still blind if all four share an assumption. They do: **every one of
them is EVIDENCE OF WORK.**

| source | exists from |
|---|---|
| a declaration on `main` | when the phase is about to be dispatched |
| a work history on `main` | when the phase has merged |
| a remote branch | when the phase has been dispatched |
| a local branch | when the phase has been dispatched |

None of them exists for a phase nobody has touched. So the denominator was not
"phases in the milestone", it was "phases someone has started", and the
milestone looked complete when the LAST STARTED phase merged rather than when
the last PLANNED one did.

The script's own comment asserted the branch source covered "a planned but
undispatched phase". That sentence is false: a branch exists only after
dispatch. The comment made the gap look closed.

## The fix

A fifth source, the PLAN, which is the only artifact that names a phase before
anyone works on it. Two patterns, because the plan spells an id in two places:
a section heading and the `- id:` line inside a phase entry.

Strict patterns rather than a bare `M4-P[0-9]+` grep, because prose names ids
that are not phases ("the next free id is M4-P31"). Control, measured on this
plan: the strict form and the loose form return the SAME 30 ids, so the strict
form drops nothing today, and it is kept because the loose one carries no such
guarantee on a later revision.

A plan that cannot be read is REPORTED, never silently zero: `gitTry` rather
than `git`, and the reason joins `hardErrors`.

## The witness

Same repository state, same working tree, one file changed:

| | printed | exit |
|---|---|---|
| before | `milestone M4: 24/24 phases merged to main` | **3**, "all phases merged" |
| after | `milestone M4: 24/30 phases merged to main` | **2**, "work remains" |

And the six become visible by name:

```
  m4-p9    not started
  m4-p12   not started
  m4-p21   not started
  m4-p22   not started
  m4-p24   not started
  m4-p25   not started
```

## What this does NOT cover

- **The plan is now load-bearing for the denominator.** A phase the plan fails
  to name is still invisible, and this only moves the trust from four artifacts
  to one. That is an improvement because the plan is the document a phase is
  derived FROM, not a trace it leaves behind, but it is not a proof.
- **Only `delivery/plan/kernel-plan-<milestone>.md` is read.** M4's plan happens
  to live at that path. A milestone whose plan is split across files, or named
  differently, falls back to the four work-evidence sources and the report says
  so rather than pretending.
- **Nothing checks that the plan's phase list is itself complete** against the
  requirements it discharges. That is a different gate and it does not exist.
- **The earlier readings were not wrong when they were printed.** Every "N/22",
  "N/24" line this script produced today was a true statement about started
  phases. What was missing is that the denominator moved as work was dispatched,
  and a denominator that grows is not a denominator.

## The rule

When a count exists to answer "is there work left", derive it from what DECLARES
the work, never from what the work LEAVES BEHIND. Traces appear after the fact,
so a count over traces is complete only when nothing is left to start, which is
the one moment it is being asked about.
