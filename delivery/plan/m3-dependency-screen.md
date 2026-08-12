# M3 cross-phase dependency SCREEN (not a proof)

- date: 2026-08-12
- author: orchestrator
- extends: delivery/plan/m3-conflict-pre-pass.md:1
- prompted by: delivery/plan/m3-p5-sequencing.md:1, which recorded that a
  file-level disjointness check did not detect a criterion-level dependency, and
  said explicitly that whether other phases carry the same shape HAD NOT BEEN
  CHECKED. This is that check, and it is a screen rather than a settlement.

## WHAT THIS IS, AND WHAT IT IS NOT. Read this before the table.

**It is a text-substring screen.** For each phase section of
delivery/plan/kernel-plan-m3.md:1, it asks: does the section text mention a path
that some EARLIER phase's declaration owns and that this phase does NOT own?

**A mention is not a dependency.** A section may name another phase's file as
context, as history, as a thing it deliberately does not touch, or inside a
sentence about the boundary between them. This screen cannot tell those apart
from a genuine acceptance-criterion read. **It over-reports by construction, and
every row below is a CANDIDATE that needs the phase's own criteria read before it
is treated as a blocker.**

**What it does establish**, and this is the reason to record it: M3-P5's
criterion-6 dependency was NOT a one-off. Candidate cross-phase reads are present
in every remaining phase, and the count rises steeply toward the end of the
milestone. Nobody should now plan the rest of M3 on the assumption that
`filesToTouch` disjointness implies dispatchability.

## The command, and its full output is the table

```
node -e '<screen>' # sections from delivery/plan/kernel-plan-m3.md,
                   # ownership from delivery/plan/phase-declarations/m3-pN.json
```

| phase | candidate reads of earlier phases' files |
|---|---|
| M3-P5 | 4, from M3-P1 and M3-P3 |
| M3-P6 | 3, from M3-P1, M3-P2, M3-P5 |
| M3-P7 | 5, from M3-P1, M3-P2, M3-P3 |
| M3-P8 | 13, from M3-P1 through M3-P7 |
| M3-P9 | 9, from M3-P1 through M3-P8 |
| M3-P10 | 38, from every earlier phase |

M3-P10's 38 is unsurprising and should not be read as alarming: it is the
release and exit phase, so reading nearly every deliverable is its job rather
than a hidden coupling. The rows that change planning are M3-P8 and M3-P9.

## The one confirmed instance, for calibration

M3-P5's criterion 6 needed `schemas/report.schema.json`, which M3-P4 owns and had
not merged. That was confirmed by measurement, not by this screen: the file was
absent from `main`, absent from M3-P5's declaration, and present in M3-P4's. The
screen would have flagged it as one candidate row among several, which is exactly
the strength and the limit of a screen.

## Consequence for dispatch, stated as a rule rather than a feeling

Before clearing any later M3 phase to run concurrently:

1. Read that phase's ACCEPTANCE CRITERIA, not its `filesToTouch`.
2. For each criterion, ask which files it must READ to be satisfiable, not only
   which it writes.
3. A criterion that reads an unmerged deliverable of another phase is a hard
   sequencing constraint, and it is invisible to `filesToTouch` disjointness.

M3-P6 is separately and independently blocked behind M3-P5 by the original
pre-pass, on shared authorship of the dispatch contract and the brief composer,
so nothing in this screen changes its position.

## WHAT THIS SCREEN DID NOT COVER

- **It read only the phase sections of one file.** Acceptance criteria that live
  in the phase declarations, or obligations stated in
  delivery/plan/kernel-plan-v1.md:1, were not searched.
- **It matches paths as substrings.** A phase that depends on another's
  deliverable WITHOUT naming its path, for example by describing the artifact in
  prose, is invisible to it. That is the direction that produces a FALSE CLEAN,
  and it is the one worth worrying about.
- **It did not classify any hit.** No row below has been read in context to
  decide whether it is a real dependency, and this document does not claim any
  of them is. Doing that classification is the work the rule above assigns to
  each phase's dispatch, not something completed here.
- **It says nothing about M1 or M2.**
