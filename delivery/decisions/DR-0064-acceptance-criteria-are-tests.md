# DR-0064: acceptance criteria are tests

- id: DR-0064
- status: DECIDED by the owner, 2026-09-29 (blueprint "review and rule economy", D4)
- in force: 2026-09-29. An experiment: see Consequences.

## Decision

Each acceptance criterion names the test(s) or command that proves it (`check`).
The kernel runs them: the suite gate, and red-witness where code changes.

A criterion that cannot be a test is allowed. It is marked
`not-testable: <reason>` and goes into the hazard reviewer's brief.

The criteria review contract is dropped. Full mode's review contracts become
`[hazard]`.

## Owner's words

> Something to be said that if it cant be a test, is it even an AC. But lets
> make the change and see what we learn. Better to test and adapt than assume
> and stay where we are.

## Supersedes or narrows

- Supersedes T-007's two-contract rule
  (delivery/tuition/T-007-criteria-cannot-contain-the-defect.md:63).
- Supersedes DR-0012 condition 3
  (delivery/decisions/DR-0012-delegated-merge-authority.md:24).

## Consequences

- The plan schema rejects a criterion with neither `check` nor `not-testable`.
- The kernel maps each criterion's `check` to suite results. That replaces the
  `verdict-criteria-complete` check and prevents a criterion reported met with
  nothing proving it.
- Every final report states the `not-testable` count per phase, so the owner
  can adapt the rule from data.
