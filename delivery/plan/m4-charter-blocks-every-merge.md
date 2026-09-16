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
