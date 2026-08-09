# Orchestrator reproduction of CR-001, M3-P3 round 6 (`218fc12`)

- date: 2026-08-09
- author: the orchestrator, independently of the reporting reviewer
- head: `218fc12`, worktree `scratchpad/wt-orch-cr001`, detached
- toolchain: node v26.6.0 from the scratch prefix, `npm ci` exit 0
- status: **CONFIRMED. The finding is real and the mechanism is not the one the
  finding's title suggests.**

This exists because the standing practice here is to re-run a reviewer's exploit
rather than read the report and believe it. The correctness reviewer was still
running when this was written, so nothing below is taken from its report beyond
the four shapes it named.

## What was run

A probe importing `quotableUnits` from the shipped `src/checks.ts` at this head,
scored against an oracle built independently in the same file: walk the
`commonmark` AST and take each leaf paragraph's concatenated literal text. Two
controls are included deliberately, because a probe with no green row cannot
distinguish a defect from a broken probe.

```
LEAK   nested bullet on one line
         source : "- - alpha one"
         units  : ["- - alpha one"]
         oracle : ["alpha one"]
LEAK   bullet then ordered
         source : "- 1. alpha two"
         units  : ["- 1. alpha two"]
         oracle : ["alpha two"]
LEAK   ordered then bullet
         source : "1. - alpha three"
         units  : ["1. - alpha three"]
         oracle : ["alpha three"]
LEAK   bullet then quote
         source : "- > alpha four"
         units  : ["- > alpha four"]
         oracle : ["alpha four"]
ok     control: plain bullet
         source : "- alpha five"
         units  : ["alpha five"]
         oracle : ["alpha five"]
ok     control: two lines
         source : "- alpha six\n  - alpha seven"
         units  : ["alpha six alpha seven"]
         oracle : ["alpha six","alpha seven"]

marker-leaking shapes: 4 of 6
EXIT=1
```

Both controls behave. The single-marker case strips correctly, which is what
makes the four failures a specific defect rather than the function being broken.

The second control's fusion is NOT a defect and is called out so a later reader
does not re-open it: CommonMark lazy continuation makes that fusion correct, and
it is the same shape DR-0022 already withdrew as V-3 and as V-5's fifth member.

## The mechanism, which is what the fix round owes

Not "nested list markers are mishandled". That is the finding.

`startOffset` verifies the parser's start column instead of trusting it, which
is correct and was the right lesson from the earlier rounds. It verifies by
testing the skipped span against `SKIPPABLE_PREFIX`, and that regex models **at
most one list marker**. Its own comment says so in those words.

So the guard has two failure causes it cannot tell apart:

1. the column describes a DIFFERENT line, which is the real hazard it was built
   for (a link reference definition advances `sourcepos[0][0]` but not
   `sourcepos[0][1]`), and
2. the column is CORRECT and simply describes a prefix richer than the regex can
   spell, which is every line carrying two block markers.

On both it takes the same fallback, and that fallback consumes only `quoteDepth`
quote markers. For a nested bullet `quoteDepth` is 0, so it returns 0 and the
slice becomes the ENTIRE RAW LINE, markers included.

**The defect is the fallback direction, not the regex's incompleteness.** Widening
`SKIPPABLE_PREFIX` to two markers would move the boundary and leave the shape:
three markers on one line fails the same way. The mechanism is that a
verification which cannot distinguish "column is lying" from "prefix is richer
than my model" fails OPEN to offset 0.

This is the family `CLAUDE.md` records five times: a guard whose condition does
not test the property that matters. The property is "does this column describe
THIS line's prefix". The condition tests "is this prefix one my regex can spell".

## Direction of the failure

Fail-open. The unit set gains strings that are not units of the document, so a
condition fabricated to equal `- - alpha one` is accepted as a quote of a
document that never contained that unit. The legitimate condition `alpha one` is
simultaneously rejected, so the check is wrong in both directions at once on
these shapes.

## CR-001 IS NOT A REGRESSION, and this changes how the round should be framed

The obvious reading of a new finding on round 6 is "five for five became six for
six". That reading is WRONG here, and it was worth ten minutes to establish
rather than assume.

The identical probe was run against the PRE-A2 implementation, `18c335a`, in a
separate worktree with the same toolchain:

```
"- - alpha one"
   pre-A2 (18c335a): ["- alpha one"]      LEAK
   A2     (218fc12): ["- - alpha one"]    LEAK
"- 1. alpha two"
   pre-A2 (18c335a): ["1. alpha two"]     LEAK
   A2     (218fc12): ["- 1. alpha two"]   LEAK
"1. - alpha three"
   pre-A2 (18c335a): ["- alpha three"]    LEAK
   A2     (218fc12): ["1. - alpha three"] LEAK
"- > alpha four"
   pre-A2 (18c335a): ["> alpha four"]     LEAK
   A2     (218fc12): ["- > alpha four"]   LEAK
"- alpha five"
   pre-A2 (18c335a): ["alpha five"]       ok
   A2     (218fc12): ["alpha five"]       ok
```

Both implementations are wrong on all four shapes. The pre-A2 line loop strips
the OUTER marker and leaks the inner one; A2 leaks BOTH. So A2 is strictly worse
on these inputs, and the CLASS is pre-existing and was never fixed by any of the
six rounds.

Three consequences, and each matters to the arbitration:

1. **This is not the sixth consecutive self-inflicted defect.** It is an old hole
   that A2 widened, which is a different and much less alarming shape than the
   regression V-5 was.
2. **The owner's acceptance criterion is not undermined.** Unit sets are
   byte-identical on all nineteen records precisely because no real decision
   record contains a two-marker line, so both implementations are wrong in the
   same invisible place. The criterion did its job and did not pretend to cover
   what it does not.
3. **It is exactly the limit DR-0022 stated against itself.** That record's known
   gap says the measurement is bounded by the imagination of whoever wrote the
   cases. The 40-shape exploit set and the 15,000-document fuzz both score A2 at
   100 per cent, and neither ever emitted two block markers on one line. A
   reviewer's fresh lens found in an hour what 15,000 generated documents could
   not, which is an argument about generator coverage rather than about fuzzing.

## What this reproduction did NOT cover

Stated because a search whose scope is wrong returns an empty result
indistinguishable from an absence of defects, and this project has been bitten by
that three times.

- Only `quotableUnits` was probed. `paragraphsBeneath` and `collectUnits` also
  call `sourceSlice`, and whether they reach the same fallback was not tested
  here.
- Only two-marker prefixes were tried. Three or more, and marker combinations
  involving indented code, were not.
- The reviewer's separate mutation-campaign result, that eleven of seventeen
  mutants survive the phase's own suite, is NOT reproduced here and is
  independent of this finding. It is the more serious of the two and is
  arbitrated separately.
- No claim is made here about whether any real decision record in
  `delivery/decisions/` contains such a line. That was not measured.
