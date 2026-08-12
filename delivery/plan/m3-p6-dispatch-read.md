# M3-P6 pre-dispatch criterion-level read, both directions

- date: 2026-08-12
- author: orchestrator
- discharges: the rule at delivery/plan/m3-dependency-screen.md:62, which says to
  read a phase's ACCEPTANCE CRITERIA rather than its `filesToTouch` before
  clearing it, and which explicitly did NOT classify any of its own rows
- covers: M3-P6 only, at delivery/plan/kernel-plan-m3.md:3210
- status: M3-P6 remains BLOCKED behind M3-P5's merge. This document does not
  clear it; it removes the work that would otherwise happen at dispatch time,
  and it records one negative result that was worth measuring.

## Why this exists rather than being done at dispatch

M3-P5's criterion 6 was assigned to a phase whose declaration forbade the only
edit that could satisfy it (delivery/plan/m3-p5-criterion-6-gap.md:1). The
screen that followed (delivery/plan/m3-dependency-screen.md:37) found candidate
cross-phase reads in every remaining phase and classified none of them, saying
so in its own limits section. Classification is per-phase work. This is that
work for M3-P6, done while the phase is blocked rather than while an implementer
waits.

## The read direction: what M3-P6's criteria must READ that it does not own

Declaration read: delivery/plan/phase-declarations/m3-p6.json:1. Criteria read:
delivery/plan/kernel-plan-m3.md:3420 through delivery/plan/kernel-plan-m3.md:3533.

| criterion | reads a file M3-P6 does not own | owner | on `main` at 52fe657? |
|---|---|---|---|
| 1 | `schemas/role-brief.schema.json` | M3-P5 | NO, unmerged |
| 2, 5, 10 | `src/commands/brief.ts` composition of M3-P5's briefs | M3-P5 | NO, unmerged |
| 9(a) | `CLAUDE.md`, for the claim-grep pattern at CLAUDE.md:338 | the repository | yes |
| 9d | `roles/investigator.md`, `roles/plan-writer.md`, `roles/adversarial-plan-reviewer.md`, composed | M3-P5 | NO, unmerged |
| 9d | `roles/_shared-dispatch-contract.md` | M3-P5 | NO, unmerged |

Every unmerged row above resolves the moment M3-P5 merges, which is exactly what
delivery/plan/kernel-plan-m3.md:3569 already states as the phase's `blocked-by`.
**So the read direction produces no new blocker.** That is the useful negative:
the M3-P5 shape does not repeat here.

`CLAUDE.md` is the one read that is NOT covered by the `blocked-by` line, and it
is safe: it is on `main`, it is not any phase's deliverable, and criterion 9(a)
reads a pattern from it rather than writing to it. A read of a file outside the
declaration is not a scope-gate event, because the auditor audits CHANGED paths.

## The write direction, which is the one that produced the M3-P5 gap

The criterion-6 gap was invisible to both prior sweeps because both looked for a
phase READING another's file, and that phase needed to WRITE one
(delivery/plan/m3-p5-criterion-6-gap.md:42). So the write direction is asked
here explicitly.

**One candidate, and it was refuted by measurement.** Criterion 9d
(delivery/plan/kernel-plan-m3.md:3493) requires the dispatch-contract clause text
to be shipped ONCE and asserted against "the composed output of each of the five
briefs". Its own paragraph at delivery/plan/kernel-plan-m3.md:3504 says the
clause text would otherwise exist in five places and drift independently. If
M3-P5's three briefs INLINED that text, M3-P6 would have to convert them to
includes, and all three are absent from M3-P6's `filesToTouch`. That is the
criterion-6 shape exactly.

Measured at the M3-P5 head 48829d9, which is what its dual review examined:

```
$ git ls-tree --name-only 48829d9 roles/
roles/README.md
roles/_shared-dispatch-contract.md
roles/adversarial-plan-reviewer.md
roles/investigator.md
roles/plan-writer.md

$ for f in investigator plan-writer adversarial-plan-reviewer; do
    git show 48829d9:roles/$f.md | grep -n 'shared-dispatch-contract'; done
12:  - roles/_shared-dispatch-contract.md
120:$include: _shared-dispatch-contract.md
8:  - roles/_shared-dispatch-contract.md
95:$include: _shared-dispatch-contract.md
11:  - roles/_shared-dispatch-contract.md
80:$include: _shared-dispatch-contract.md
```

All three already include the single copy through the `$include` directive. The
conversion M3-P6 would have had to perform has already been performed by M3-P5.
**No write-direction blocker.**

## The one thing an implementer must be told, because the declaration and the plan disagree

`roles/_shared-dispatch-contract.md` is PRESENT in M3-P6's `filesToTouch`
(delivery/plan/phase-declarations/m3-p6.json:1) and the plan text at
delivery/plan/kernel-plan-m3.md:3410 says of the same file, in bold, "READ ONLY
here, and not on this phase's edit list", and that a phase needing it changed
ESCALATES because the same act edits merged artifacts belonging to other phases.

The declaration is the permissive one. A scope gate reading it would allow an
edit the plan forbids, so the gate cannot catch this and the instruction has to
travel with the dispatch. **M3-P6's dispatch must carry: editing
`roles/_shared-dispatch-contract.md` is an escalation, not a scope question.**

This is recorded rather than repaired. Removing the path from the declaration
would make an accidental edit red at the gate, which is stronger, but it would
also redden a LEGITIMATE escalated edit and require a declaration amendment
mid-phase, which is the ordering trap delivery/plan/m3-p5-criterion-6-gap.md:74
already records: the auditor reads the declaration from the MERGE BASE, so the
amendment must land on `main` before the phase's next push. Leaving it and
naming it in the dispatch is the smaller change. I would defend it, so under
delivery/decisions/DR-0016-escalation-threshold.md:1 there is nothing to ask.

## A second forward constraint, and it binds the M3-P5 fix round NOW

Criterion 9d asserts the TEXT of `incremental-output` and `beacon-is-not-a-claim`
in the shared block: that the first names the artifact-within-the-first-minutes
rule and the mtime-as-beacon consequence, and that the second states the guard
tests FRESHNESS and never existence and never completion. It names two
structurally different weakenings that must redden, one of them the C-2 violation
the first watchdog after T-008 actually shipped.

All three phrases are present in the block at 48829d9. M3-P5's fix round is
editing that block right now, under a MEDIUM saying the clause has no
agent-facing trigger.

**My first draft of this paragraph claimed that a reword would break M3-P6 while
nothing in M3-P5's own gate set went red. That claim was FALSE, and the claim
grep is what caught it before it was committed.** Measured on the M3-P5 branch:

```
$ grep -n 'FIRST MINUTES\|modification time is your beacon\|NEWEST MODIFICATION' \
    test/roles.test.ts
308:  "within the FIRST MINUTES",
310:  "modification time is your beacon",
315:const BEACON_RULE = ["NEWEST MODIFICATION TIME", "never existence and", "never completion"];
```

M3-P5's own registered tests already assert BOTH clauses' specific text, not just
`incremental-output`'s. So a reword reddens the suite in THIS phase, immediately,
which is the state one wants and is stronger than the forward-only constraint I
had assumed. The plan's own text at delivery/plan/kernel-plan-m3.md:3157 says
criterion 6b covers only the `incremental-output` half; the implementer built the
`beacon-is-not-a-claim` half as well, so the delivered guard is wider than the
criterion that asked for it.

What survives is smaller and still worth carrying: M3-P6 criterion 9d asserts the
same text against TWO MORE composed briefs, so the shared block's wording is load
bearing for a phase that has not started. The constraint was sent to the fix round
in the same turn this was measured, stated as additive: add, do not reword.

## What this document does NOT establish

- **It says nothing about M3-P7 to M3-P10.** The screen's rows for those phases
  are still unclassified, and M3-P8 and M3-P9 are the two it flagged as
  planning-relevant (delivery/plan/m3-dependency-screen.md:48).
- **It did not execute anything.** Criterion 1, 2, 5 and 10 name commands that
  cannot run until M3-P5 merges, so their read requirements were derived from
  the criteria text and the declarations, not from running them. A criterion
  that reads a file WITHOUT naming its path is invisible to this method, which
  is the same false-clean limit the screen declares at
  delivery/plan/m3-dependency-screen.md:77.
- **It does not clear M3-P6 to run.** The phase is blocked behind M3-P5 by the
  original conflict pre-pass on shared authorship of the dispatch contract and
  the brief composer, and nothing here changes that.
- **It does not check whether M3-P6's two briefs carry the mandated-reading
  omission M3-P5's review found.** That was named as M3-P6's problem in
  `delivery/review/arbitration-m3-p5.md`, which is deliberately QUOTED rather
  than cited here because it is on an unmerged branch and a citation to it
  would not resolve at this head. Whether the repair generalises depends on
  what the M3-P5 fix round derives, which is not known yet.
