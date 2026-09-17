# DR-0045: the orchestrator may open, validate and merge pull requests

- status: **DECIDED** by the owner, 2026-09-16
- relates to: DR-0012 (delegated merge authority), DR-0027 (what gets reviewed),
  DR-0031 (a pull request is a unit of self-contained value)

## The decision, in the owner's words

> "you have permission to open PR's validate them and merge when validated (all
> gates green)"

Asked because the orchestrator's harness instructions forbid opening a pull
request unless the owner asks, while this repository's process requires one for
anything to reach `main`. Twelve phase branches and the paperwork branch were
finished or nearly so with zero pull requests open, and the block was
procedural rather than technical.

## What it grants, and what it does NOT

**Granted:** open a pull request, validate it, and merge it when all gates are
green. No further permission is needed per pull request.

**NOT granted, and reading it that way would be wrong:**

- **It does not waive review.** The owner's word is "validated", and what
  validation means here is already written down: DR-0012 requires two
  independent clean-room reviews of the same head with no unresolved high or
  medium finding, DR-0027 narrows which phases need the full contract and which
  get one recorded round, and DR-0035 sets the fix-round tiers. A green gate
  bundle is one of those conditions and not a substitute for the others.
- **It does not change what "green" means.** A green BUNDLE is not evidence a
  particular gate asserted anything (T-009), and a merge is not complete until
  the post-merge `push` run on the new `main` head is observed green, not the
  pull-request check on the branch.
- **It does not retire "never merge your own work" for CODE.** The orchestrator
  writes no feature code, so what it merges is other agents' work reviewed by
  other agents. The paperwork branch is the one case where the orchestrator
  merges its own writing, and DR-0027 already settles that: `delivery/**`,
  `CLAUDE.md` and `.claude/**` take no review round and are landed.

## How it is exercised

1. **Local green first.** DR-0031 clause 3: CI enforces that `main` stays green
   and is not how you find out whether you are. Establish it locally, and if CI
   reports something that was not already known locally, that is a defect in the
   local procedure rather than a normal outcome.
2. **One pull request per unit of self-contained value**, carrying all its
   evidence, in both directions: no evidence for code that is not in it, and no
   code that its evidence does not cover.
3. **Merge order is dependency order.** For M4 that is: the paperwork first,
   because every phase's scope gate reads a declaration from the merge base;
   then each phase after it has merged `main` forward; and M4-P10 before
   M4-P11. Verified end to end at
   delivery/plan/m4-merge-sequence-verified.md:1.
4. **Observe the post-merge run**, not only the branch check.

## What this record does NOT settle

- **Whether a pull request that goes red in CI may be merged after an
  orchestrator judgement that the failure is environmental.** It may not, and
  nothing here creates that latitude; the wall-clock `coverage` defect is the
  obvious temptation and it is a REAL red until the gate is fixed.
- **What happens when the two-fix-round limit is reached with findings open.**
  DR-0027 says it merges with them recorded or is abandoned, and this grant does
  not decide which.
- **Branch deletion after merge**, which this container cannot do at all. The
  owner has said they will run a cleanup script, so no `A-n` id is needed.
