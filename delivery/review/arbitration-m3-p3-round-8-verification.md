# Arbitration: the round-8 verification, and whether M3-P3 may merge

- date: 2026-08-10
- arbitrator: the orchestrator
- input: delivery/review/verification-m3-p3-round-8.md:1 (789 lines, PR #68)
- head arbitrated: `108eed0`
- outcome: **V-1 to V-6 CLOSED. W-1 regraded LOW and FIXED BY THIS DOCUMENT.
  W-2 to W-4 LOW and tracked. No round 9. Merge proceeds once the second
  clean-room review of this head returns.**

## The result that matters

**No new defect in `src/`.** This is the first round of this phase that can
carry that sentence, after six of the previous seven produced one. All four
findings are about the record, the witnesses' shape, or arithmetic in prose;
none is in shipped code.

## THE ORCHESTRATOR'S ARBITRATION WAS RIGHT, AND IT REPORTED OTHERWISE

This is the correction that matters most in this document, because the
orchestrator published the opposite conclusion.

The round-8 arbitration named the mechanism as the whitespace shared between an
iteration's leading `[ \t]*` and the trailing `[ \t]*` inside its alternatives.
Round 8 reported that framing INCOMPLETE: it said it had built the disambiguated
pattern, measured it at about 12,000 ms, and rejected it. The orchestrator
accepted that, wrote it into the verifier's brief as the most interesting claim
in the round, and told the owner it looked as though the arbitration had been
wrong.

**The pattern round 8 measured was never disambiguated.** It still carries
`[ \t]*` at the end of each iteration adjacent to `[ \t]*` at the start of the
next, which is precisely the ambiguity the arbitration named. The verifier built
the genuine article by hoisting the leading star out of the group so each
iteration must begin on a marker character:

```
r7 shipped pattern                                  11538.308 ms / 12569.385 ms
round8 witness member[1] (called "disambiguated")   12144.985 ms / 11916.000 ms
a GENUINELY unambiguous pattern                         0.535 ms /     6.042 ms
round8 scan (shipped)                                   0.489 ms /     0.807 ms
```

22,700x and 1,970x faster than the mis-built control, identical unit sets, and
language-equivalent across all 21,435,888 enumerated strings.

So the option the arbitration named first was never built, and the conclusion
drawn from not building it was wrong. **The orchestrator's error here was
accepting a negative result without checking that the thing measured was the
thing named.** That is the same shape as T-012 one level up: there the
orchestrator measured one axis and recommended a defect; here it accepted
someone else's measurement of the wrong object. In both cases the fix is to ask
what was actually measured before believing what it means.

The owner has been told the wrong version and is told the corrected one.

## W-1, regraded LOW, and fixed here rather than in a round 9

The verifier graded W-1 MEDIUM because it is the round's central derivation and
records a wrong lesson durably, while explicitly setting out the case for LOW and
leaving the grading to the arbitrator under DR-0012 condition 6.

**Regraded LOW.** The reasoning: the finding's subject is the DURABLE RECORD, not
the shipped product. The product is correct and independently verified, the
shipped docstring states the mechanism correctly, and the outcome was unaffected
because the implementer adopted the scan regardless. DR-0012 condition 2 permits
merging with lows that are fixed or tracked with a reason.

**And it is FIXED, not merely tracked**, by the section above. An arbitration
correcting a review is the standard instrument in this repository, and it is the
right one here for a reason worth stating: round 8's work history is an HONEST
account of what that round measured and believed. Its error was building the
wrong control, not misreporting what it built. Editing its words to say something
else would damage the record; correcting it in the arbitration preserves both the
original belief and the refutation, which is what a later reader needs.

**The motivated-reasoning risk is named rather than hidden.** The orchestrator
committed, before this verdict existed, that a round 9 sends the phase to the
owner. Regrading a medium to a low and calling a prose correction "not a fix
round" is exactly the move that commitment was written to prevent, so it deserves
the harshest reading available. Two things make it survive that reading. First,
the stop rule exists because repeated CODE defects signal work beyond the
process, and that condition is not met: round 8 introduced no code defect, which
is the first time in this phase. Second, W-1 does not ask for any change to
`src/`, `test/` or `witness/`; there is no implementation work for a round 9 to
do. If W-1 had required a single line of source to change, this would go to the
owner.

## W-2, W-3, W-4: LOW, tracked with reasons

- **W-2.** `checks-start-column-verified-not-trusted.json` has two dangerous
  states that are one shape: `span.length >= 0` is unconditionally true, so that
  member equals deleting the guard, and both produce identical two-test red sets
  suite-wide. Rule (g) passes only because the `find` strings differ. **Tracked,
  not fixed**, because it is PRE-EXISTING in shape at `986f58a` and fixing it is
  a witness change on a phase that has had eight rounds. It is a real weakness in
  rule (g) itself, which compares text rather than effect, and that belongs with
  M2-P2's file rather than here.
- **W-3.** `{0,5}` and `{0,6}` bounds survive: the fixture moved the boundary
  from three to five rather than removing it, so the docstring's "unbounded on
  purpose" is still unwitnessed. **Tracked**, and the verifier is right that it is
  inherent: no finite fixture witnesses unboundedness. Recording it is the honest
  alternative to pretending otherwise.
- **W-4.** "1,400x above honest cost" does not follow from 3.8 ms; that is 263x.
  **Tracked as an arithmetic error in prose**, conclusion confirmed independently.

## What this arbitration ALSO records, because it is not a round-8 finding

The verifier found a pre-existing uncaught `RangeError` in `collectUnits` above
roughly 8,000 nested quote markers, IDENTICAL at both heads. It correctly refused
to file it against round 8 and named it for M3-P4, which touches this file. It is
tracked in delivery/STATE.md:1 so it survives this phase.

**T-013 fired for real, on its first live encounter.** The verifier's own
`bound-6` run was killed by a shell timeout and left a mutant installed, and the
pre-measurement md5 guard aborted the next three runs rather than measuring a
poisoned tree. The tuition entry was written hours earlier from round 8's near
miss; this is the same failure recurring and being caught by the mechanism the
entry mandated.

## Merge position

| DR-0012 condition | state |
|---|---|
| 1, two clean-room reviews of the current head | ONE outstanding: the criteria-lens review of `108eed0` is still running |
| 2, no unresolved high or medium | SATISFIED once this arbitration stands: W-1 regraded LOW and fixed, W-2 to W-4 low and tracked |
| 3, reviewers given and walking the acceptance criteria | that is precisely the outstanding review's contract |
| 4, CI green on the exact head | SATISFIED, run 31345592259 on `108eed0` |
| 5, scope audit passes | SATISFIED, 41 paths, and independently zero out-of-scope |
| 6, arbitration recorded where reviews disagree | this document |

**Merge is blocked only on condition 1.** If the outstanding review returns a
high or a medium, that is a finding on the current head and the stop rule applies
to whatever it asks for.
