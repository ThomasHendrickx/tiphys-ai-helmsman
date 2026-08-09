# Feasibility measurement for a CR-001 fix, M3-P3

- date: 2026-08-09
- author: the orchestrator
- head measured: `218fc12`, worktree `scratchpad/wt-orch-cr001`, detached
- toolchain: node v26.6.0 from the scratch prefix
- status: **a one-line change closes the whole class, passes the suite, and
  preserves the owner's acceptance criterion exactly.**

## Why this exists, and what it is NOT

The orchestrator does not write feature code and this is not a fix. It is the
same instrument used for DR-0022: rather than hand the next implementer an
argument about what might work, measure whether the obvious direction actually
does, so the round starts from a fact. The implementer is free to reject this
and is responsible for its own derivation either way.

It also protects against a specific failure this project has recorded: a fix
round that closes the four shapes a reviewer NAMED rather than the mechanism. If
the one-line change below turned out to close only the named shapes, that would
be the finding, and it is better to know before dispatch than after.

## The change measured

`SKIPPABLE_PREFIX` currently models at most one list marker, by construction:

```
/^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[0-9]{1,9}[.)]|[-*+])[ \t]*)?$/
```

The variant measured allows any number of interleaved quote and list markers,
still anchored at both ends:

```
/^(?:[ \t]*(?:>[ \t]?|(?:[0-9]{1,9}[.)])[ \t]*|[-*+][ \t]*))*[ \t]*$/
```

## The question that decides it

Widening a guard usually weakens it, and `startOffset` exists to catch a real
hazard: `sourcepos[0][0]` is advanced past leading link reference definitions
while `sourcepos[0][1]` is not, so the column can describe a line the node no
longer starts on. If the wider regex accepts those spans too, the guard is gone
and the cure is worse than the disease.

It does not. Measured directly on the spans, four that MUST be rejected and
eleven that MUST be accepted:

```
MUST REJECT (the column-is-lying hazard):
  ok        quote form, reference definition       "ep"     current=false proposed=false
  ok        list form                              "re"     current=false proposed=false
  ok        ordinary prose fragment                "alp"    current=false proposed=false
  ok        mid-word                               "sil"    current=false proposed=false

MUST ACCEPT (legitimate block prefixes):
  ok        no prefix                              ""       current=true proposed=true
  ok        one bullet                             "- "     current=true proposed=true
  ok        one ordered                            "1. "    current=true proposed=true
  ok        one quote                              "> "     current=true proposed=true
  ok        quote then bullet                      "> - "   current=true proposed=true
  ok        bullet then bullet                     "- - "   current=false proposed=true
  ok        bullet then ordered                    "- 1. "  current=false proposed=true
  ok        ordered then bullet                    "1. - "  current=false proposed=true
  ok        bullet then quote                      "- > "   current=false proposed=true
  ok        three deep                             "- - - " current=false proposed=true
  ok        quote quote bullet                     "> > - " current=true proposed=true

problems: 0
EXIT=0
```

The reason it holds is that the regex is a test of the WHOLE skipped span, not a
prefix match, and prose fragments contain characters no marker alternative can
consume. Widening WHICH markers may repeat does not weaken that.

**The three-deep row is the one that matters most.** The finding names two-marker
lines; three-deep is a structurally different member of the same class, and it is
green here. That is the difference between fixing the mechanism and fixing the
instances, and it is why this was measured rather than asserted.

## Effect, end to end

With the change applied in the worktree:

```
ok     nested bullet on one line   "- - alpha one"     units ["alpha one"]     oracle ["alpha one"]
ok     bullet then ordered         "- 1. alpha two"    units ["alpha two"]     oracle ["alpha two"]
ok     ordered then bullet         "1. - alpha three"  units ["alpha three"]   oracle ["alpha three"]
ok     bullet then quote           "- > alpha four"    units ["alpha four"]    oracle ["alpha four"]
ok     control: plain bullet       "- alpha five"      units ["alpha five"]    oracle ["alpha five"]
ok     control: two lines          (lazy continuation) units fused, correct per CommonMark

marker-leaking shapes: 0 of 6
```

Every one now equals the oracle, not merely "no longer leaks".

## The suite, and the owner's acceptance criterion

- `npm test` with the change: **501 tests, 0 fail, 9 skipped, exit 0**, on
  node v26.6.0.
- The owner's DR-0022 acceptance criterion re-checked directly: unit sets for all
  twenty records under `delivery/decisions/`, sorted and serialised, compared
  byte for byte between the changed and shipped implementations. **IDENTICAL.
  20 records, 504 units.** The criterion the owner attached to A2 survives the
  fix, which follows from the measured fact that no real record carries a
  two-marker line.

The worktree was restored to the shipped file afterwards; `git diff --stat`
prints nothing.

## One discrepancy, reported rather than smoothed over

This run reports **492 passed and 9 skipped** out of 501. The supply-chain
reviewer reported **501 of 501 passing** at the same head. Both runs exit 0 and
neither has a failure, so nothing here is red, but the two numbers are not the
same statement and one of them is describing a different environment. It is
recorded rather than averaged away. Whoever takes round 7 should establish which
nine are skipped and why before quoting either figure as the phase's evidence.

## What this measurement does NOT establish

- **It says nothing about the mutation-campaign finding**, that eleven of
  seventeen mutants survive the phase's own thirty tests. That is the more
  serious of the two reported problems, it is about the TESTS rather than the
  source, and no regex closes it. A round that took this one-line change and
  called itself done would be the exact shape this project keeps paying for.
- No red witness was constructed. A witness for this class must redden under at
  least two structurally different members, and the three-deep row suggests the
  second member, but constructing and taking the witness is the implementer's
  work, not this document's.
- Only `SKIPPABLE_PREFIX` was varied. Whether `sourceSlice`'s continuation-line
  handling has a sibling hole was not examined.
- The 40-shape exploit set and the 15,000-document fuzz were NOT re-run against
  the change. They rate the shipped code 100 per cent while missing this class
  entirely, so re-running them unchanged would prove nothing; extending the
  generator to emit two block markers on one line is the real follow-up and it is
  not done here.
