# The kernel has no root charter, and that blocks every M4 merge

- date: 2026-09-16
- found by: M4-P10's implementer, as a HIGH finding against a state it did not
  create. Confirmed independently here before acting on it.
- status: **a sequencing dependency the M4 plan does not carry.** It blocks the
  merge path for every phase, not one of them.

## The mechanism

`check-dual-review` is a CONDITIONAL gate. Its precondition counts verdict
documents under `delivery/review/`. Measured today, that count is ZERO, so the
gate never runs and its absence is invisible.

**The moment two verdict documents land, the precondition passes and the gate
runs.** It then looks for a root `charter.yaml` to learn the declared assurance
mode, does not find one, and reports ERROR with exit 21:

```
charter.yaml does not exist, so the declared mode's merge-authority is unknown
and no decorrelation verdict can be reached; a merge check that cannot determine
the regime reports error, never green
```

Confirmed: `ls charter.yaml` finds nothing at the repository root, and the
refusal reproduces against the pre-change tree, so it is M3-P9's fail-closed
rule working exactly as written and is not a defect introduced by any M4 phase.

The refusal is not inferred from behaviour; it is written down. The regime
documents the gate will look for are the two named at
scripts/check-dual-review.mjs:198, and the message above is emitted at
scripts/check-dual-review.mjs:209. Both lines are byte-identical on origin/main
and on this branch, checked with `git diff --name-only origin/main...HEAD`, so
they resolve against either tree.

## Why this is on the critical path and not a footnote

DR-0031 requires a pull request to carry ALL its evidence, and for a phase that
includes both clean-room reviews. DR-0012 requires two independent reviews for a
delegated merge. So **every M4 phase must commit two verdict documents, and the
first phase that does so turns a dormant gate into a hard CI error.**

The dependency chain nobody wrote down:

```
any phase merging  ->  needs two committed verdicts (DR-0031, DR-0012)
two committed verdicts  ->  arms check-dual-review
check-dual-review armed  ->  needs a root charter.yaml
```

**Nine phases are in flight and two are already in dual review.** Their reviews
will produce exactly the documents that trip this.

## What was NOT the finding, stated so nobody over-reads it

The gate is not wrong. Fail-closed is correct: a merge check that cannot
determine the regime must not report green, and M2-C-3 says an unreachable
verdict is an error rather than a not-applicable. The plan is what is
incomplete, by sequencing verdict-producing work ahead of the charter that makes
verdicts legible.

## The disposition

**A root `charter.yaml` becomes a prerequisite of the first merge, not of the
first phase.** Phases may continue to build and be reviewed; nothing may merge
until it exists.

It is NOT free paperwork and must not be improvised:

- The charter schema requires eleven top-level fields with
  `additionalProperties: false`, and all seven irreversible decisions.
- `delivery/evidence/m3-exit-test/e1/charter.yaml:1` is an authored kernel
  charter and is the right starting point, but it is EXIT-TEST EVIDENCE. Copying
  it wholesale would import a constraint DR-0036 overturned (that the kernel
  never runs on itself before M4) and a `release-verification` field whose shape
  DR-0014 left reserved and which the deploy-gate work has since measured.
- Placing a charter at the repository root changes gate behaviour repository
  wide, so it is a reviewed phase and not an orchestrator edit.

**Assigned to the pilot-bootstrap workstream, promoted to its first phase**, and
its acceptance criteria must include the arm this document exists for: with two
verdict documents present, `check-dual-review` reaches a verdict rather than
erroring.

## What is not established

- Whether any OTHER conditional gate is dormant for the same reason, waiting for
  a precondition that M4 is about to satisfy. Only this one was found, by
  following a finding rather than by a systematic sweep of the registry's
  conditional entries. That sweep has not been run and should be.

## Correction, 2026-09-16: the trigger is a CONFORMING verdict, not a review

The section above says every M4 phase must commit two verdict documents and
that the first to do so arms the gate. The obligation half is right and the
trigger half was stated too widely. Measured in three arms, same command, one
variable changed:

| the review directory contains | precondition exit |
|---|---|
| one markdown clean-room review | **1**, "0 verdict document(s)" |
| this repository's own 234 committed review files | **1**, "0 verdict document(s)" |
| one schema-conforming JSON verdict | **0**, "1 verdict document(s)" |

`committedVerdictPaths` filters to `.yaml`, `.yml` and `.json`, decodes each,
and keeps only what validates as a verdict. A markdown review is skipped before
it is ever read. The trigger is therefore not "a phase commits its reviews", it
is "a phase commits a document conforming to schemas/verdict.schema.json:1".

## What that measurement actually exposed, which is worse than the blocker

`check-dual-review` has **never once asserted anything on this repository.**

Not on any M1 phase, not on any M2 phase, not on any of M3's thirteen. Measured
against origin/main: 234 files under `delivery/review/`, of which ten are
`.yaml` or `.json`, and all ten are gate EVIDENCE captures sitting in
subdirectories. The listing is non-recursive, so even those are invisible to
it. At the top level, where the gate looks, there has never been a verdict
document at all.

Both halves captured, against origin/main:

```
$ git ls-tree -r --name-only origin/main delivery/review/ | wc -l
234
$ git ls-tree -r --name-only origin/main delivery/review/ | grep -Ec '\.(ya?ml|json)$'
10
$ git ls-tree -r --name-only origin/main delivery/review/ | grep -E '\.(ya?ml|json)$'
delivery/review/evidence/clean-room-m3-p3-r8-criteria/gates-summary-full-mode.json
delivery/review/evidence/clean-room-m3-p3-r8-criteria/gates-summary-red-witness.json
delivery/review/evidence/clean-room-m3-p3-r8-criteria/gates-summary-scope.json
delivery/review/evidence/clean-room-m3-p3-r8-criteria/red-witness-evaluations.json
delivery/review/evidence/clean-room-m3-p3-r8-criteria/units-baseline-18c335a.json
delivery/review/evidence/clean-room-m3-p3-r8-criteria/units-head-108eed0.json
delivery/review/evidence/clean-room-m3-p3-r9-criteria/red-witness-evaluations-summary.json
delivery/review/evidence/clean-room-m3-p3-r9-criteria/red-witness-result.json
delivery/review/evidence/clean-room-m3-p3-r9-criteria/units-baseline-18c335a.json
delivery/review/evidence/clean-room-m3-p3-r9-criteria/units-head-b5c01f0.json
$ git ls-tree --name-only origin/main delivery/review/ | grep -E '\.(ya?ml|json)$'
$ echo $?
1
```

Every one of the ten is a gate-evidence capture under `evidence/`, and the
last command, the non-recursive one that matches what `readdirSync` sees,
returns nothing.

**What this derivation does NOT cover.** It reads `origin/main` only, so a
verdict document that existed on a branch and was never merged would not
appear; the claim is about what reached `main`, which is the tree CI lints. It
also does not read the twelve unmerged M4 branches. And it counts by path and
extension rather than by validation, so a top-level `.json` that failed to
decode would have been counted here and still skipped by the gate; since the
top-level count is zero, that distinction does not arise.

The gate is not lying about this. It reports not-applicable with a reason,
which is exactly what M2-C-3 and SC-011 require of a gate that cannot reach its
subject, and it is the honest behaviour. The problem is one level up:

**DR-0012 makes dual cross-model clean review the CONDITION of delegated merge
authority, and the check that would verify that condition has never run.** Every
merge under the delegation has been made on the orchestrator's own assertion
that the condition held. That assertion has been true as far as anyone can
tell, and it has never been machine-checked, which are two different things and
this project's whole method is to insist on the difference.

This is not the "guard that cannot go red" shape, because the gate says
not-applicable rather than green. It is the shape one step before it: a guard
whose subject is never produced, so its honesty costs nothing and buys nothing.
Thirty markdown reviews satisfy a human reading of DR-0012 and leave the
machine check asleep.

## What changes, stated as sequence rather than as a complaint

1. M4-P15's root charter is **not** on the critical path for the first merge,
   because a phase committing only markdown reviews leaves the gate dormant and
   unblocked. It IS on the critical path for the gate ever asserting anything.
2. Leaving it dormant is not an option this project may take. Choosing not to
   emit the artifact a check consumes, in order to keep the check quiet, is the
   same move as deleting the check, with better manners.
3. So the order is: M4-P15 lands the charter, then M4 phases commit a
   conforming verdict document ALONGSIDE their markdown review, and the gate
   arms for the first time in the repository's history.
4. M4-P11 matters exactly at step 3 and not before. The decorrelation check
   compares `produced-by`, and this orchestrator's two reviewers are both
   Claude models, so the first real run of this gate is also the first time
   DR-0038's declared single-family exception has to hold up.

Step 3 is the one that has never been rehearsed, which by T-025's title is
precisely the one to expect trouble from.

## The eleven reviews running on 2026-09-16 do NOT produce verdict documents

Stated here rather than left to be discovered, because the gap is mine and it
is cheap to say now and expensive to find later.

Eleven clean-room reviews were dispatched that morning: dual cross-model rounds
for M4-P2, M4-P10 and M4-P16, the three phases that change shipped artifacts,
and one recorded round each for M4-P1, M4-P13, M4-P20, M4-P23 and M4-P27 under
DR-0027, which change none. Their brief asks for a markdown review and a
structured result, and neither is a document conforming to
schemas/verdict.schema.json:1.

Two fields are why a converter cannot close this after the fact, and they are
the substantive ones. `criteria[]` wants one entry per acceptance criterion in
the phase's plan section, each carrying the evidence the reviewer actually
gathered for it, and `deviations-judged[]` wants one entry per deviation the
work history declares. Neither is recoverable from a review that did not
collect them. Filling them from the plan text alone would be a fabricated
criterion walk, which is exactly what `met: true` beside no evidence means and
exactly what the schema's own comment says the document exists to prevent.

So these eleven satisfy DR-0012 as a PROCESS (two independent reviews of one
head, different framings, and for the three shipped-surface phases different
model families) and they leave the machine check asleep, which is the state
this document has just finished arguing is not acceptable to stay in.

The fix is already in the dispatch scripts rather than in a plan: both now
require the reviewer to write a conforming verdict and to report, as a required
field, how many criteria it walked out of how many the plan declares and which
it could not reach. Since most of these eleven are expected to return
FIX-ROUND-NEEDED, and a fix round is followed by a re-review, the first
conforming verdicts arrive on that pass. A phase that returns APPROVE on the
first pass is the case to watch: it would merge having never produced the
artifact, and it is the one that must be sent back for the verdict document
rather than waved through.
