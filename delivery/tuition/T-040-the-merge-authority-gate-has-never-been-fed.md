# T-040: the gate that machine-checks the merge-authority condition has never
# been fed, across three milestones

**Measured:** 2026-09-18, on `main` at `f783465`.

**Found by:** the orchestrator, while preparing to commit the first phase's
verdict documents. Not by a gate, because this IS the gate.

## The state

`check-dual-review` is the command form of DR-0012 condition 1: two verdicts for
one head, distinct `produced-by` model families, distinct `framing`, distinct
`review-contract`. It is wired into `gates.manifest.json` as the precondition of
`merge-preconditions`, and its context directory there is `.`, the repository
root.

Run against `main` at `f783465`, correct arguments, both arms:

```
$ node scripts/check-dual-review.mjs --precondition .
check-dual-review: 0 verdict document(s) (corpus: delivery/review read from commit f783465..., resolved from HEAD)
EXIT=1

$ node scripts/check-dual-review.mjs .
check-dual-review: not-applicable (0 review verdicts examined for decorrelation)
no verdict document is (corpus: delivery/review read from commit f783465..., resolved from HEAD), so there is no pair of reviews to compare
EXIT=20
```

**Zero.** Every phase of M1, M2, M3 and twenty-eight phases of M4 have merged
with this check reporting not-applicable. The corpus is the TOP LEVEL of
`delivery/review`, read non-recursively from the commit (src/checks.ts:2895 and
src/checks.ts:3151). Of the JSON files committed there, all are evidence
captures nested under `delivery/review/evidence/`, and none is a verdict
document:

```
$ git ls-files 'delivery/review/*.json' | wc -l
0
```

## The mechanism, and it is NOT a defect in the gate

The gate is correct and correctly wired. It reports not-applicable with a reason
rather than green, which is exactly what M2-C-3 requires of a check that cannot
reach its subject. Nothing here is broken.

**The mechanism is that its INPUT is produced by a procedure that never delivers
it.** The reviewer brief has told reviewers since 2026-09-16 to write a verdict
JSON, and it tells them to write it to `/tmp/claude-0/verdicts/`. Five such files
exist there, for M4-P1, M4-P11, M4-P15 and M4-P20, dated 2026-09-16. They were
produced, read by the orchestrator, and never committed. So the artifact exists,
the gate exists, and the step between them was a habit nobody performed.

That is the shape this repository records under T-005 and T-017: a rule that
depends on someone remembering an unenforced step does not survive a busy
session. What makes this instance worse than those is WHERE it sits: it is the
machine check for the condition on which DR-0012 makes merge authority
conditional. For the whole delivery, "the dual review happened" has rested on the
orchestrator asserting it.

## A false reading this entry nearly recorded, kept because the correction is the useful half

The first measurement passed `delivery/review` as the context directory and got:

```
check-dual-review: error (0 review verdicts examined for decorrelation)
delivery/review/charter.yaml does not exist in commit f783465..., so the declared
mode's merge-authority is unknown and no decorrelation verdict can be reached
```

That was read as a second, independent blocker, and a note was nearly written
saying that committing the first verdict document would turn a green pull request
RED for want of a charter. **It is false.** The context directory is `.`, and
`charter.yaml` and `assurance-modes.yaml` have been at the repository root all
along. The `error` was produced by pointing the gate at the wrong directory.

The general shape is worth more than the instance: **a fail-closed gate handed
the wrong argument answers honestly about the wrong question, and its answer
reads exactly like a finding.** The thing that caught it was reading how CI
actually invokes the command (`gates.manifest.json`) instead of guessing the
argument from the corpus path printed in the output.

## What is owed

Commit both reviewers' verdict JSONs to the TOP LEVEL of `delivery/review/` on
the phase branch, with the rest of that phase's evidence, as DR-0031 requires a
pull request to carry. M4-P24 is the first phase where this is due.

## What this does NOT cover, stated because an empty result is not an absence

- **It is not mechanised.** This entry is a record and the fix is still a step in
  a procedure. What IS established is that `merge-preconditions` treats an absent
  verdict as not-applicable by design, which is the captured exit 1 above.
  Whether some gate could be made to REQUIRE the verdicts is an open question,
  not a settled one: the only search run for it was

  ```
  grep -n 'requiredPaths\|mustInclude\|required_files\|requiresPath' src/gates/scope.ts
  ```

  which returned nothing, and four guessed identifiers in one file is exactly the
  wrong-scoped search this project has been bitten by three times. The scope
  gate's own unit label is "changed paths audited" (src/gates/scope.ts:747),
  which is consistent with auditing rather than requiring, and consistency is not
  proof. Treat it as unmeasured.
- **Whether the five existing `/tmp` verdicts would PASS is unmeasured.** They
  were written for merged heads, and the check compares a pair against ONE head.
  Committing them retrospectively is not proposed and has not been tested.
- **It says nothing about the reviews themselves.** Every phase did receive two
  cross-family clean-room reviews; what is missing is the machine-readable form,
  not the review. Reading this entry as "the reviews did not happen" would be
  wrong.
