# DR-0049: repair the cutover-entry trigger before M5, outside the plan

- id: DR-0049
- status: DECIDED
- decided-by: owner
- date: 2026-09-22
- supersedes: nothing
- relates-to: DR-0042, DR-0031

## The question

The approved M5 plan's first phase, M5-P1, must pass `p1-trigger`: the
cutover-entry checker exits 0 with all four arms satisfied. Measured at `main`
head `f7b7d8e`, three of the four arms failed on defects in shipped code, and
M5-P1 declares only three documents, so it could not fix them. The plan's
binding rule forbids making what is not written there. Evidence in
delivery/verification/m5-plan-readiness.md:1.

The orchestrator recommended adding a repair phase to the plan.

## The decision

The owner, in their words: "Ok than we do a pre M5 change outside of the plan.
Then we now make the fix so M5 can start. Result overrules the process."

So the repair ships as ONE pre-M5 change on a non-phase branch
(`claude/m5-plan-readiness-y2jjo5`), not as a new plan phase. It carries the
fix, its red-then-green witnesses, the readiness record and this decision in
one pull request (DR-0031). The only plan edit is the `p1-trigger` wording,
which now names the `--fleet` argument the checker needs.

## What this does not decide

- It does not relax review for the change. The pull request still needs the
  gates green, and merge authority is whatever DR-0012 grants for its head.
- It is not a standing permission to change code outside a plan. It covers this
  repair only.
