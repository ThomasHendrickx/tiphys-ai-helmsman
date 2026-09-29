# DR-0063: the review tier follows the diff

- id: DR-0063
- status: DECIDED by the owner, 2026-09-29 (blueprint "review and rule economy", D3)
- in force: 2026-09-29

## Decision

Two tiers, chosen by what the diff touches.

| tier | when | review |
|---|---|---|
| `pair` | the diff touches the project's declared runtime set | two hazard reviews on distinct observed model families, or under the declared single-vendor exception. The orchestrator arbitrates disagreements. An unresolved high or medium blocks. |
| `single` | everything else | one hazard review on the cheaper tier. No arbitration. One fix round. A finding blocks only if it makes a shipped artefact wrong. |

There is no `none` tier.

The runtime set is declared by the project (DR-0029: the project owns the
predicate). The kernel ships the mechanism. A project with no declaration is
all `pair` (fail closed).

This repository's runtime set: `src/`, `bin/`, `plugin/`, `schemas/`, plus
`package.json`, `package-lock.json` or `plugin/package.json` when any key other
than a version field changes. The workspace's own pin on `@tiphys/kernel`
counts as a version field. Shipped prose (`roles/`, `AGENTS.md`, `templates/`,
`checklists/`, `tuition/`) is `single`.

The clean-room reviewer's model tier follows the review tier: strongest for
`pair`, cheaper for `single`.

## Owner's words

> Yes, this one is driving me crazy and really costing me tokens that deliver
> no value (so money spend on no value)

## Supersedes or narrows

- Replaces DR-0027's three-row table.
- Narrows DR-0012 condition 1
  (delivery/decisions/DR-0012-delegated-merge-authority.md:22): two reviews are
  owed only for `pair`.
- Keeps DR-0035: every change is reviewed, one round minimum.

## Consequences

- A version-only bump (the 0.2.2 case, PR #224) is `single`: one review, no
  arbitration.
- `tierOfPath` and `REVIEW_BUDGET_ROWS` in `src/gates/merge-preconditions.ts`
  stop hardcoding kernel paths and read the project's declaration.
