# Arbitration: the two clean-room reviews of the exit-test harness fix

- date: 2026-08-12
- author: orchestrator
- head reviewed: `fdb3120`, by both contracts, independently, on different
  model families
- verdicts: **H-A APPROVE** (CR-FR-1 LOW, CR-FR-2 LOW).
  **H-B APPROVE** (CR-V-1 MEDIUM, CR-V-2 LOW).
- outcome: **MERGE BLOCKED on CR-V-1.** A fix round was dispatched rather than
  the finding being argued down.

## The disposition first, because it is the only thing that gates anything

DR-0012 condition 2 requires no unresolved high or medium finding. CR-V-1 is a
MEDIUM and it is unresolved, so the harness fix does not merge, and M3-P6 does
not merge behind it. Nothing below changes that; the rest of this document is
about what the pair of reviews establishes.

Two reviews both saying APPROVE is not the same as two reviews finding nothing.
Both attached findings to their approval, and one of them is blocking. Reading
"APPROVE" as the answer and skipping the findings is the failure mode this
section exists to prevent.

## There is no dispute to arbitrate, and that is the finding

Neither review contradicts the other on any point of fact. Where both touched
the same claim they agree, including on the two sha256 values and on the
complete suite sentence, which both quote as node v26.6.0, `dist/` built, 594
tests and 594 pass and 0 skipped under `npm test`, 596 under a bare
`node --test`, exit 0 in both cases.

So this is a CONVERGENCE document, not a tie-break. What is worth recording is
that the two contracts reached DIFFERENT defects, and that this is now the
second time on this change that the hazard-shaped contract produced the
blocking finding while the criteria walk produced only lows:

| round | criteria contract | hazard contract |
|---|---|---|
| the original change | (reviews died mid-walk) | F-B1, MEDIUM, the assertion iterated only the expectation |
| the fix at `fdb3120` | CR-FR-1, CR-FR-2, both LOW | CR-V-1, MEDIUM, the third union leg is unwitnessed |

That is T-007's claim, that criteria cannot contain the defect and the QUESTION
must be decorrelated rather than the reviewer, holding twice in a row on one
artifact. It is evidence for keeping the two-contract shape rather than
collapsing to a single deeper review, and it is recorded because the opposite
economy is tempting when a change is small and on a critical path.

## CR-V-1, the blocking finding, restated so it is not softened

`explicitById.keys()` can be deleted from the union and the entire suite stays
green: 594 tests, 594 pass, 0 skipped, exit 0, identical to baseline. It is not
dead code. The shape only it asserts, a table row naming a gate present in
NEITHER the manifest nor the bundle, flips from exit 1 to exit 0 on both arms
once the leg is gone. It also composes: with the leg removed, a manifest whose
`gates` key is not an array turns a real-table run into a total vacuous pass
printing zero gates asserted at exit 0.

**The mechanism, and it is the same one the change exists to remove, one level
in.** The change was made because the assertion program iterated the
expectation and never the rows, so a row the table did not name was never
asserted on. The union that replaced it has three spreads and only two of them
are witnessed. A union member that no test can observe being removed is exactly
an unasserted row wearing different clothes.

**The round's own substituted mechanism cannot close it**, and H-B established
that rather than asserting it: an explicit-spec finding never carries the
default reason string, so a probe built on the round's keying would come back
over-determined and the test's own assertion would reject it. This is why the
fix round was dispatched with an explicit instruction NOT to extend the
existing mechanism, and it is the difference between a fix round that addresses
the mechanism and one that addresses the instance.

## What NEITHER review covered, which is the first thing to read

Both reviewers volunteered the same gap, independently and unprompted:

**Neither ran a single registry gate.** Not `citations`, `scope`, `suite`,
`red-witness`, `clause-map`, `agent-rules-drift`, `coverage`,
`credential-scrub` or `manifest-self-check`. H-A says so explicitly and names
CI as the authority it used instead; H-B says it ran no `tiphys gates run` at
all and reports nothing about any gate on that head.

The consequence, stated plainly: **on `fdb3120` the gate results rest solely on
the CI run, with no independent reproduction.** That is acceptable, because CI
is the authority under this repository's rules and the run is green by step,
but it means the pair of reviews adds NO redundancy on the gate axis. If the CI
configuration itself were wrong, neither review would have caught it, and the
harness under change is part of what CI runs.

Also uncovered by both: the default v22.22.2 toolchain arm. H-A names the
round's reported figures for it and explicitly declines to vouch for them.

## The lows, and why none of them is being argued away

- **CR-FR-1 (LOW, H-A)**: the round's derivation missed a sixth live site,
  which drives the program through a different flag and so carries none of the
  tokens the derivation searched for. H-A checked the site by execution and
  found it sound. So the DEFECT is in the derivation's stated bound rather than
  in the code, which is precisely fix-round contract item 3 failing, and it is
  worth fixing for that reason and not because anything is broken.
- **CR-FR-2 (LOW, H-A)**: the leg-count gap is guardable, and H-A wrote the
  guard and red-witnessed it rather than asserting it could be written. The
  round had declined on a by-count objection; H-A's guard is by-name, so the
  objection does not reach it.
- **CR-V-2 (LOW, H-B)**: the assertion program exempts itself from the vacuity
  rule it enforces on everything else. Four degenerate inputs exit 0 printing
  zero gates asserted. Held LOW only because it is not reachable through the
  shipped harness, which H-B measured rather than assumed.

CR-FR-2 and CR-V-2 point the same way: **the program that asserts other gates
are non-vacuous does not assert it of itself.** Two reviewers reached that from
different directions without either contract naming it, which is the same
convergence signal as the earlier round and is why both are being fixed rather
than tracked.

## Condition-by-condition, DR-0012

This is not an M3 phase, so DR-0012 conditions a phase merge and does not bind
here by its own terms. It is applied anyway, because this code asserts every
other gate and a silent defect in it does not fail, it stops noticing.

| condition | state |
|---|---|
| two independent clean-room reviews of the current head | MET: both of `fdb3120`, both APPROVE |
| different model families | MET |
| no unresolved high or medium | **NOT MET: CR-V-1 is an open MEDIUM** |
| CI green on that exact head | MET at `fdb3120`, read by step |
| scope audit passing | not applicable: non-phase branch, no declaration |
| arbitrate with evidence, never prefer the convenient verdict | this document |

The convenient verdict here was available and is named so it is on the record:
both reviews say APPROVE, the change is on a milestone's critical path, and
CR-V-1 could have been recorded as tracked-with-a-reason on the argument that
the leg is defensive and the suite is green. That argument is wrong for the
same reason the original F-B1 was a finding, and taking it would have shipped
the change's own defect inside its fix.

## What happens next

1. Fix round dispatched for CR-V-1, with CR-V-2, CR-FR-1 and CR-FR-2 also on
   its list. It was told not to extend the round's existing mechanism, because
   H-B established that mechanism cannot reach this leg.
2. The branch is `mergeable_state: behind` and must be updated before merge.
   The delta it absorbs was pre-computed as nine files, eight under `delivery/`
   and one `CLAUDE.md`, with no source, script or test changes, so the update
   cannot alter the harness or invalidate these reviews.
3. Then, and only then, M3-P6's own merge sequence, whose first exercise of
   this fix on the case it exists for is a separate precondition recorded in
   delivery/STATE.md:103.

## A note on the citation above, because it nearly went in wrong

That line reference was first written as `delivery/STATE.md:47` from memory and
was WRONG; line 47 is an unrelated bullet and the precondition is at 103. It
was caught by opening the file, not by the gate.

Worth stating because it is a limit of the tooling that is easy to forget: the
`citations` gate resolves that a path and line EXIST. It does not and cannot
check that the line says what the citing sentence claims. A confidently wrong
line number is green. The only check is the author opening the file, and this
project has now recorded getting citations wrong from memory more than once.
