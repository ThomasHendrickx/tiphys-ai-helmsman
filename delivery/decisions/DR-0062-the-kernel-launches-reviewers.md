# DR-0062: the kernel launches reviewers and records what it observed

- id: DR-0062
- status: DECIDED by the owner, 2026-09-29 (blueprint "review and rule economy", D2)
- in force: 2026-09-29

## Decision

The kernel dispatches every review and records the model the harness actually
served (the plugin's model-resolution record). Reviewer identity, reviewed head
and model family come from kernel records, never from fields the reviewer
writes.

The merge gate reads APPROVE and findings from the verdict. It reads the count
of reviews, the reviewed head and family distinctness from kernel records.

## Owner's words

> Yes

## Supersedes or narrows

- Supersedes the `produced-by` comparison: a verdict's self-reported
  `produced-by`, framing and review-contract fields no longer decide
  decorrelation. The derived check `dual-review-decorrelation` and the
  `check-dual-review` gate go with it.
- Narrows DR-0012 condition 1
  (delivery/decisions/DR-0012-delegated-merge-authority.md:22): "different
  model families" is judged on the family the kernel observed.

## Consequences

- Two Claude models are one family. A Claude-only pair merges under the
  declared single-vendor exception (DR-0038). That is the correct state, not a
  regression.
- A review the kernel did not launch has no kernel record, so it does not
  count toward the pair.
- When the kernel launches a review it stores the run's reported cost and
  token usage in the task record. No dashboards, no aggregation. (The
  blueprint marked this optional for owner confirmation and left it in.)
