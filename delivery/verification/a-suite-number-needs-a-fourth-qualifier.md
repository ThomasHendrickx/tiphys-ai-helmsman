# A suite number needs a fourth qualifier: whether the tree is a git repository

- date: 2026-09-16
- found by: M4-P19's clean-room reviewer, while reproducing the branch's suite
  result on both sides.
- status: a real fourth axis, measured. `CLAUDE.md` standing warning 12 names
  three and this is a fourth.

## The three axes already recorded

Standing warning 12 establishes that a suite result is an incomplete sentence
without all of: the INTERPRETER, the BUILD STATE (`dist/` present or absent),
and the INVOCATION (`npm test` versus a bare `node --test`). Each skips or adds
a different set of tests, and the repository has paid three times for an
unexplained count difference.

## The fourth, measured

One head, one interpreter, one build state, one invocation. The only variable is
HOW THE TREE WAS OBTAINED:

| tree | result |
|---|---|
| a real `git clone` / checkout | 863 tests, 863 pass, 0 fail, 0 skipped, exit 0 |
| a `git archive` copy of the same head | 863 tests, 850 pass, **13 fail**, exit 1 |

All thirteen failures are git exit-128 artifacts of the absent `.git` directory.
The tests are not wrong and the head is not wrong: thirteen tests create scratch
git repositories or interrogate the enclosing one, and a tree with no `.git` is
a different environment from a checkout of the identical bytes.

## Why this matters here and not only in principle

**The orchestrator creates exactly this shape routinely.** Every salvage in this
session produced a `git bundle` plus a patch; every scratch lab in the probes
was a copy of a tree. An agent handed one of those and asked to "run the suite"
gets thirteen failures that have nothing to do with the code, and the failure
signature (git exit 128) is plausible enough to be attributed to the change
under test.

It compounds the axis this milestone already hit: `src/gates/coverage.ts` uses a
wall-clock budget that reddens under load
(delivery/verification/wall-clock-budgets-are-load-dependent.md:1). So a bare
"N pass" from an agent can now differ from another agent's by interpreter, by
build state, by invocation, by machine load, and by whether the directory is a
repository. **Five axes, and two of them are properties of the orchestrator's
own behaviour rather than of the branch.**

## The complete sentence, restated

A suite result is evidence only when it names all five:

1. the interpreter and its version;
2. whether `dist/` was built;
3. the exact invocation;
4. the pass count AND the skipped count;
5. **whether the tree is a git checkout**, and if the answer is no, that the
   git-dependent failures were identified as such.

Load should be quoted whenever a `coverage-gate` failure appears.

## The amendment owed

`CLAUDE.md` standing warning 12 should gain the fourth axis. It is not applied
here because `CLAUDE.md` belongs to M4-P23 until that phase merges, per
delivery/plan/m4-conflict-pre-pass.md:1. This is the second amendment now queued
behind that phase; the first is the claim grep's vocabulary
(delivery/verification/the-claim-grep-catches-one-passive-assertion-and-misses-seven.md:1).

## What is not established

- Which thirteen tests they are. The reviewer reported the count and the cause
  class, not the list, and no one has enumerated them.
- Whether a shallow clone (`--depth 1`), which HAS a `.git`, behaves like a full
  checkout for all thirteen. The probes used shallow clones throughout and did
  not report this failure, which is suggestive and is not a measurement.
