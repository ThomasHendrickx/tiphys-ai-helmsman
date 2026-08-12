# The red-witness gate does not run on changes to `scripts/`

- date: 2026-08-12
- author: orchestrator
- verdict: **CONFIRMED from the gate registry AND from a CI run's own output.**
- severity: **MEDIUM, and it is the causal explanation for two findings this
  milestone has already paid for.** Not raised higher only because a partial
  compensating control exists, described below, and because nothing currently
  on `main` is known to be wrong because of it.
- measured at: `origin/main` c75152b, and CI job 94132994333 on head `fdb3120`.

## The finding in one line

`red-witness` declares the precondition `diff-touches` over `src/` and `bin/`.
The checking infrastructure lives in `scripts/`. **So a pull request that
changes only the checking infrastructure does not run the gate whose job is to
prove that checks can fail.**

## The evidence, in the order it was obtained

First, the whole-registry enumeration, which is what turned this up. Only two
gates carry a path-scoped precondition at all:

```
gate                 precondition kind   paths
citations            diff-touches        delivery/plan/ delivery/verification/ delivery/decisions/
                                         delivery/tuition/ delivery/requirements/ delivery/STATE.md
red-witness          diff-touches        src/ bin/
```

Second, the harness fix branch's own diff, six files against its merge base:

```
.github/workflows/gates.yml
delivery/work-history/exit-test-assertion-direction.md
scripts/m2-exit-test.sh
test/behaviors.json
test/gate-registry.test.ts
test/m2-exit-test.test.ts
```

Zero under `src/`, zero under `bin/`.

Third, and this is the part that makes it observed rather than inferred, the
CI run on `fdb3120` says so itself:

```
gates: declared 11 applicable 5 verdict 5 green 5 red 0 not-applicable 6 error 0 vacuous 0
gates: required gate(s) not applicable: citations, scope, red-witness
```

The run is GREEN and `red-witness` is among the required gates it declared not
applicable. That is the gate reporting its own absence correctly; nothing is
malfunctioning. The defect is the precondition's path list, not the machinery.

## Why this is the explanation and not just a coincidence

The two most serious findings against this change were both **vacuous
witnesses**:

- CR-V01: the main-arm witness could not see the change disappear, because
  every member carried a red row and a pre-existing check caught red rows
  first.
- CR-V-1: a union member can be deleted with the entire suite still green.

Detecting a witness that cannot fail is exactly and only what `red-witness`
exists to do. It did not run. Both were found by human clean-room reviewers
instead, one of whom died four lines into writing its report and nearly took
the finding with it.

**The mechanism, stated generally: a gate scoped by path is only as good as
its path list, and a path list is a claim about where the risk lives.** Here
the claim is that risky code lives in `src/` and `bin/`. That was probably true
when it was written. It stopped being true when the checking infrastructure
grew into `scripts/`, and nothing re-evaluated it, because a precondition that
excludes a tree fails SILENTLY and GREENLY. This is the same shape as T-009,
where the arm nobody witnessed is the arm that broke.

## The compensating control, stated precisely so it is not over-credited

The exit test does re-run the gate, and the run log shows it:

```
m2-green: red-witness GREEN with 4 unit(s) against M2-P2 merged diff 1b6f0963b62f^..1b6f0963b62f (real history)
```

That is a green-arm check proving the gate still works. **It runs against a
FIXED HISTORICAL DIFF, not against the pull request's own diff.** So it
establishes that `red-witness` is not broken, and it establishes nothing
whatever about the witnesses in the change under review. It is a self-test of
the gate, not a check of the branch.

Reading that line as coverage would be the exact error this repository keeps
recording: a green that is evidence for a different question than the one being
asked.

## What this does NOT cover

- **No fix is proposed, and the obvious one needs measuring first.** Adding
  `scripts/` to the precondition would make `red-witness` applicable on a class
  of pull requests where it was NOT applicable on the one run measured here,
  and this project has twice found
  that a newly applicable check reddens things nobody expected. The fallout is
  UNMEASURED. Measuring it is cheap and is the first thing any scoping should
  do.
- **`test/` is also absent from the list and is NOT analysed here.** Whether a
  test-only change should trigger `red-witness` is a real question with a
  defensible answer either way, and this document does not answer it. It is
  named so that a reader does not mistake silence for a judgement.
- **Only the two gates carrying a `diff-touches` precondition were examined.**
  The other twelve either have no precondition or use `file-exists`,
  `branch-matches` or `command-exit-zero`. Those were NOT audited for an
  equivalent scoping gap; `branch-matches` on `scope` in particular deserves
  the same question and did not get it here.
- **It is not established that anything on `main` is actually wrong because of
  this.** The claim is that a class of change goes unchecked, not that a
  specific defect slipped through into `main`. CR-V01 and CR-V-1 were both
  caught before merge, by review.
- **The sibling finding about the `citations` precondition is recorded
  separately** at delivery/verification/citations-gate-does-not-see-reviews-or-work-histories.md:1,
  and both came out of the same one-command enumeration. Two omissions in the
  only two path-scoped preconditions in the registry is itself worth noticing:
  the sample size is two and the failure rate is two.

## Disposition

Recorded as an unowned finding against `main`. It blocks nothing in flight and
it must not be folded into either change currently in review, both of which are
on a milestone's critical path. It is written down now because it was
discovered now, and because the next person to ask "how did a vacuous witness
reach clean-room review twice" should find the answer rather than re-derive it.
