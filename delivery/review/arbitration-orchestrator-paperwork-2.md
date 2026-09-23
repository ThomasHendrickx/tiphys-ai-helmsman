# Arbitration: orchestrator paperwork 2 (DR-0053, DR-0054, M5-P3 merge evidence)

Orchestrator record under DR-0012
(delivery/decisions/DR-0012-delegated-merge-authority.md:22). A docs-only pull
request under `delivery/` needs one clean-room review.

## Review on the record

| document | family | head | verdict |
|---|---|---|---|
| `delivery/review/clean-room-orchestrator-paperwork-2.md` | Sonnet | 126aaa0 | FIX-ROUND-NEEDED, 1 medium, 2 low |

The review reproduced DR-0053's 7-versus-49 table exactly against the 49 real
pulse verdicts under kernels 0.1.0 and 0.2.0.

## Findings and what was done

- CR-001 (medium): the pending 0.2.1 publish go-ahead had no home in
  `delivery/STATE.md`. Fixed: the M5 standing section now carries an "Owner
  decisions open" list naming it. It is a decision, not an `A-n` action,
  because the orchestrator holds the publish access; so no `A-n` id is
  allocated.
- CR-002 (low): the standing section showed M5-P3 in flight after it merged.
  Fixed in the same edit, with the #213 push run.
- CR-003 (low): DR-0054 cited src/checks.ts:4924, two lines above the sentence
  it supports. Fixed to src/checks.ts:4926.

The fix round changes only these three places. They are mechanical and each
is checkable by reading the diff, so no second review is dispatched.
