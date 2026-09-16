# The M4 merge order, and what each phase is actually waiting on

Written 2026-09-16 while PR #150 was in CI. Supersedes the earlier sequence note
only in its ordering; the scope findings live in
delivery/plan/m4-scope-clears-after-150.md.

## The single blocker that covers all twelve

Every M4 phase branch is red on `scope` for the same reason: its phase
declaration is on the branch and not in the MERGE BASE. PR #150 lands the twelve
declarations on `main`, and each branch then merges `main` forward so its merge
base moves past that commit. Two steps, in that order, and neither works alone.

## What each phase is waiting on, beyond that

| phase | review state | waiting on |
|---|---|---|
| m4-p13 | both APPROVE | the declaration only |
| m4-p16 | both approve, all findings LOW and tracked | the declaration only |
| m4-p20 | both APPROVE | the declaration only |
| m4-p15 | one review in flight | that review |
| m4-p1 | FIX-ROUND-NEEDED, one HIGH | a fix round, but see below |
| m4-p2 | fix round done | delta verification |
| m4-p10 | fix round done | delta verification |
| m4-p11 | fix round done | delta verification |
| m4-p19 | fix round done | delta verification |
| m4-p23 | fix round done | delta verification |
| m4-p26 | fix round done | delta verification |
| m4-p27 | fix round done | delta verification |

M4-P1's HIGH is the scope gate itself, red twice over: no declaration in the
merge base, and, hidden behind that, twenty-seven undeclared paths inherited
from the unmerged planning corpus the branch was cut from. Both halves dissolve
when that corpus reaches `main`. Its remaining fix round is small and is about
one mechanism: a claim whose supporting command was run at a different head, or
over a different path set, than the claim covers. Six fixture files carry
UNDECLARED transliteration, which CLAUDE.md calls indistinguishable from
fabricated evidence after the fact, and that is the part worth the round.

## Merge order

Dependency order, which is the merge order even where the work order was
concurrent (binding convention 5):

1. PR #150, the declarations and the plan.
2. m4-p13, m4-p16, m4-p20. Review-clear, so they go as soon as the declaration
   lands, and they go FIRST so the fast path is not held behind the slow one.
3. m4-p15, when its review returns.
4. **m4-p10 BEFORE m4-p11.** This is the one real dependency in the milestone
   and it is not a preference.
5. m4-p1, m4-p2, m4-p19, m4-p23, m4-p26, m4-p27 in any order, as each delta
   verification returns.

## What is on the critical path, and it is not CI

The `gates` workflow declares `concurrency: gates-${{ github.ref }}`, so
different branches run CI CONCURRENTLY. Twelve pull requests do not cost twelve
sequential CI cycles.

The real serialisation is the review capacity: the owner has set a cap of two
agents at a time, seven delta verifications and one fix round remain, so that
queue is roughly four batches deep and it is what the milestone is waiting on.
CI hides behind it. So the ordering above is chosen to keep the three
review-clear phases moving while the queue drains, rather than batching
everything for one big landing.

## What is NOT established

Whether `main` requires a branch to be up to date before merging. The branch
protection endpoint answers 403 to this container, so it cannot be read; it will
be discovered at the first merge. If it is required, each merge invalidates the
next branch's CI run and the twelve become sequential after all. That is the one
assumption in this document that could change its shape, and it is named here
rather than left to be discovered.

## The load correlation, measured on one head rather than inferred

The budget itself is a constant: src/gates/coverage.ts:235 declares
`REGEX_EXEC_TIMEOUT_MS = 250`, and it is handed to a `vm.Script` as a WALL CLOCK
timeout. So the check is not measuring backtracking, it is measuring how busy
the machine is while a trivial pattern runs.

The `suite` gate reddened on M4-P13 at head 413ba49 with two failing tests, and
the reflex reading is "the machine is busy". That reading is banned here: a red
is not attributable to the environment on a judgement.

Measured, same head, same clone, same toolchain (node v26.6.0), changing only
the load:

| arm | load at start | result |
|---|---|---|
| `gates run --only` the full bundle | 14.75 | `suite` RED, 2 failing tests |
| the same command again | 8.02 | `suite` GREEN, 851 of 851 |
| bare `npm test` | 8.74 rising to 15.86 | 851 pass, 0 fail, exit 0 |
| the two named tests ALONE | 5.26 | 1 pass each, 0 fail |
| `npm test` on the BASE, main at 85deb36 | 5.44 rising to 8.67 | 849 pass, 0 fail, exit 0 |

So the same command at the same head returns both answers, which is what makes
it non-determinism rather than a branch defect.

One arm is worth naming because it is the strongest of them and it is not the
load arm. **One of the two failing tests is in test/gates.test.ts, which this
branch does not change at all.** `git diff --name-only origin/main...HEAD`
returns seven paths and that is not among them, and node's test runner runs each
file in its own process, so a change confined to `test/coverage-gate.test.ts`
cannot reach it.

What this does NOT establish: the base arm ran at load 8.67 and the red happened
at 14.75, so it did not reproduce the conditions and it is NOT evidence that
main reddens under load 15. It is reported as the weaker thing it is. The
conclusion rests on the same-head non-determinism and on the untouched-file
failure, not on the base arm.

## Two things measured while merging, both worth carrying

### The append-only union resolver ran in production and it was needed

Merging `main` forward into M4-P15 after two phases had landed produced exactly
the conflict predicted: `test/behaviors.json` and nothing else. The resolver
took it as a union with zero removals and zero value collisions, and the merge
completed with no hand-editing. That is the first production use; before it, the
same conflict was resolved by hand every time.

### A test that reports a missing file which is present, and it has now flaked twice

`test/gates.test.ts`, "a precondition command exiting nonzero is error, not a
skip, whenever a path-shaped argv element cannot be opened", failed in the
orchestrator's clone during the M4-P13 bundle and again during the M4-P15 suite.
It has never failed in CI.

The second failure is the informative one, because the error is self-refuting:

    Error [ERR_MODULE_NOT_FOUND]: Cannot find module
    '/tmp/claude-0/fwd/src/task.ts' imported from
    /tmp/claude-0/fwd/src/commands/brief.ts

Checked immediately afterwards, at the same head and with a clean
`git status --porcelain`: the file EXISTS on disk, is tracked, is in the HEAD
tree, and is on `main`. A subprocess did not see a file that was there.

The test's own assertion text already classifies this shape correctly, which is
why it is recorded rather than chased: it says the run "did not reach a verdict,
which is an environment failure rather than a wrong verdict".

Re-run at the same head: that test alone passes, and the full suite reports 873
of 873 with 0 failed and 0 skipped.

What is NOT established: the cause. Nothing here shows whether it is a
filesystem race in this container, a module-resolution cache, or concurrent
load, and "flake" is not a root cause in this repository. It is registered so
that the next person who sees it does not spend a round re-deriving that the
file exists. Two occurrences, both in the same clone under load, zero in CI.
