# The merge-authority gate, fed for the first time, both arms witnessed

Orchestrator verification, 2026-09-18, during the DR-0047 final approval sweep.

## The question, and why it was worth answering before finishing the sweep

delivery/tuition/T-040-the-merge-authority-gate-has-never-been-fed.md:1 records
that `check-dual-review` reported not-applicable on every head across three
milestones. The gate that enforces DR-0012's merge condition has therefore never
returned a verdict about anything in this project's history.

That left a question the sweep depended on and nobody had settled: **when a pair
of APPROVE verdicts IS landed, does the gate go green?** An empty corpus proves
nothing either way. Spending five more review groups before answering it would
have risked producing eight pairs the gate rejects for a reason discoverable in
ten minutes.

So it was probed before the sweep continued, in a scratch worktree under
`/tmp/claude-0/cdr-endtoend`. No probe commit was pushed and no probe file
reaches a branch that lands on `main`.

## Method

A scratch worktree at the evidence branch's head, `node_modules` symlinked from
the main clone because the gate loads `yaml` through src/validate.ts:89 and a
bare clone does not resolve it. Verdicts written to the TOP LEVEL of
`delivery/review/`, which is the corpus the gate reads non-recursively, then
COMMITTED, because the gate reads the corpus from the commit and not from the
working tree.

## Arm 1, the red arm: two verdicts that are not decorrelated

Two copies of one real verdict, same `framing` and same `review-contract`,
both APPROVE, same phase and head.

    gates: declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0
    gates: check-dual-review: red: INVALID #/framing framing value
    evidence-integrity occurs in 2 of the 2 verdicts for phase M2-P1 ... so the
    reviews are not decorrelated on framing (check: dual-review-decorrelation)
    ... INVALID #/review-contract review-contract value hazard occurs in 2 of
    the 2 verdicts ... not decorrelated on review-contract
    RUNNER EXIT: 1

Red, naming both axes. So the gate's refusal is real and it tests decorrelation
on `framing` AND on `review-contract` independently.

## Arm 2, the green arm: a real decorrelated pair

The sweep's own two `gates`-group verdicts, unmodified except that both were set
to APPROVE with an empty findings array, at one phase and one head.

    gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0
    gates: check-dual-review: green: 2 verdict(s) examined by 1 registered
    check(s) named dual-review-decorrelation and 1 named verdict-pair-approves;
    no decorrelation violation and the pair approves
    RUNNER EXIT: 0

Green, and it names both registered checks: the decorrelation check and
`verdict-pair-approves`, which scripts/check-dual-review.mjs:20 calls DR-0012
condition 2 made into a predicate.

**This is the first green this gate has produced in this project.**

## An error that is worth keeping, because it is CLAUDE.md's own trap

Between the two arms the red output kept naming the FIRST arm's filenames after
those files had been deleted from the working tree and a commit had been made.
The deletions were never staged: `git add <specific paths>` adds the paths named
and does not stage the removal of others. The gate read the commit, which still
carried them, and was right to.

This is the documented trap at CLAUDE.md:227 ("The gate lints at HEAD, not the
working tree. Staging a fix and re-running gives the OLD verdict. Commit, then
re-run") arriving through a door that sentence does not name: the commit HAD
been made, and it was incomplete. `git add -A` fixed it. A reader following the
rule literally can still get the old verdict.

## ARM 3, ADDED THE SAME DAY: the gate does not care WHICH head it approves

**This arm was not run in the first pass, and not running it was the defect in
this verification.** It was found by the sweep's validation-group criteria
reviewer as CR-VS-001 (HIGH) and reproduced here independently before being
believed.

`check-dual-review`'s registry command takes no head parameter. src/checks.ts:3884
groups verdicts by the head THE VERDICTS THEMSELVES DECLARE, and nothing compares
that value to the commit the gate is running against, nor checks that it names a
commit at all.

Two sub-arms, both run in a throwaway clone:

    ARM 3a: two decorrelated APPROVE verdicts naming
            deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
            git cat-file -t on it: "could not get object info"
      -> check-dual-review: GREEN, 2 verdict(s) examined, EXIT 0

    ARM 3b: same verdicts, unchanged, plus a NEW commit of work
            no verdict mentions
      -> check-dual-review: GREEN, 2 verdict(s) examined, EXIT 0

So a pair of approving verdicts makes this gate green for that phase on **every
later head, indefinitely**, on evidence about a commit that need not exist.

**The consequence for this sweep is immediate and is why it is recorded here
rather than only in the review.** T-040 says no verdict pair has ever been
committed. This sweep produces the first. The moment it lands, the gate flips
from not-applicable to applicable and green, and by this arm it then stays green
regardless of what follows. **The gate's first non-vacuous run in this project's
history would also be its first false one.** The CR-VS-001 fix therefore lands in
the same pull request as the verdicts, not after them.

**A probe error worth keeping.** The first attempt at arm 3b appended plain prose
to `src/cli.ts` to make "unreviewed work". That is not valid TypeScript, so the
CLI failed to load with ERR_INVALID_TYPESCRIPT_SYNTAX and the run exited 1 with no
gate line at all. Read quickly, a nonzero exit there could have been mistaken for
the gate refusing. It was the probe breaking the program under test. The arm was
re-run with a change that leaves the tree valid.

## What this settles, and what it does NOT

SETTLED: the gate's red arm and green arm both fire, on real verdict documents
from this sweep, and the sweep's verdicts carry the fields it requires. SETTLED
ALSO, by arm 3: what the green MEANS is much weaker than the first pass implied.
It certifies that a decorrelated approving pair exists somewhere in the corpus,
not that it is about the head being audited. Measured
across the three groups completed at the time: `framing` is `criteria-contract`
against `evidence-integrity`, `review-contract` is `criteria` against `hazard`,
and `produced-by` names different model families in every pair.

NOT SETTLED, and stated rather than left to be assumed:

- The probe ran in a scratch worktree at a probe commit, so it is evidence about
  the GATE, not about any head that will reach `main`.
- It ran LOCALLY. Under T-009 that is not evidence about either CI event, and
  the gate is declared `conditional`, so its applicability in a real CI run is a
  separate question this probe does not touch.
- `dr0029-side` is absent from all six sweep verdicts and the gate did not
  object. Whether some other consumer requires it was not probed.
- Nothing here says the sweep's real verdicts WILL approve. They are what they
  are; this probe only shows the gate can accept a pair that does.
