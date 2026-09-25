# Arbitration: kernel 0.2.2 release bump (PR #224), reviewed head

Orchestrator record under DR-0012
(delivery/decisions/DR-0012-delegated-merge-authority.md:22).

This record rules on the REVIEWED head, e48499bc4b9f654cc43537feb38690931dee15bb.
The condition-6 document naming the verdict commit is written out of tree.

- reviews: kernel-0-2-2-release-bump-criteria.json, kernel-0-2-2-release-bump-hazard.json

| document | family | contract | head | verdict |
|---|---|---|---|---|
| `delivery/review/clean-room-kernel-0-2-2-release-bump-criteria.md` | Sonnet | criteria | e48499b | APPROVE, no finding |
| `delivery/review/clean-room-kernel-0-2-2-release-bump-hazard.md` | Fable | hazard | e48499b | APPROVE, one low |

The owner approved publishing 0.2.2 on 2026-09-25, as the DR-0059 follow-up
that ships `tiphys init --project`. The bump has the same five-file shape as
the 0.2.1 bump (#218). Accepted residue, low: the stored witness filename still
says 0-2-1 while its find text follows the stamp to 0.2.2, as in #218.

The verdict commit carrying this file touches only `delivery/review/`.
