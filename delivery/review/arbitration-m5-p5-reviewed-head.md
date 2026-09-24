# Arbitration: M5-P5 context diet (PR #215), reviewed head

Orchestrator record under DR-0012
(delivery/decisions/DR-0012-delegated-merge-authority.md:22) and DR-0016.

This record rules on the REVIEWED head, c1be4a89e9a537b3afa0ba59597afdcda6248d94.
The `merge-preconditions` condition-6 document names the verdict commit, so it
is written out of tree and passed with `--arbitrations`, as for M5-P3.

## Reviews on the record

- reviews: m5-p5-criteria.json, m5-p5-hazard.json

| round | document | family | contract | head | verdict |
|---|---|---|---|---|---|
| 0 | `delivery/review/clean-room-M5-P5-opus-criteria.md` | Opus | criteria | 681efcd | FIX-ROUND-NEEDED, 1 medium, 5 low |
| 0 | `delivery/review/clean-room-M5-P5-sonnet-hazard.md` | Sonnet | hazard | 681efcd | FIX-ROUND-NEEDED, 1 high |
| 1 | `delivery/review/verification-M5-P5-fix-round-opus.md` | Opus | criteria | ecab915 | FIX-ROUND-NEEDED, 3 medium, 2 low |
| 1 | `delivery/review/verification-M5-P5-fix-round-sonnet.md` | Sonnet | hazard | ecab915 | FIX-ROUND-NEEDED, 2 high |
| fresh | `delivery/review/verification-M5-P5-fresh-round-sonnet-criteria.md` | Sonnet | criteria | d353faf, then c1be4a8 | APPROVE, then APPROVE with no finding |
| fresh | `delivery/review/clean-room-M5-P5-fable-hazard.md` | Fable | hazard | d353faf, then c1be4a8 | FIX-ROUND-NEEDED, 2 medium, then APPROVE with 5 accepted low |
| final | `delivery/review/m5-p5-criteria.json` | produced-by `claude-sonnet-5` | criteria | c1be4a8 | APPROVE |
| final | `delivery/review/m5-p5-hazard.json` | produced-by `claude-fable-5-1` | hazard | c1be4a8 | APPROVE |

## How it went

Round 0 and fix round 1 failed on one mechanism: the guards against losing a
binding rule tested that text existed, not that it was still binding. A high
finding recurred in the same component, so under DR-0012 and DR-0016 the
implementer was replaced and a third review contract was dispatched (Fable, a
family new to the phase, on the hazard side).

The fresh implementer changed the approach from a denylist of non-binding
labels to an allowlist over the document's structure plus a committed heading
register. The recurring high did not recur. The Fable review found two
mediums, and the owner chose one last short round kept simple (DR-0056, on the
orchestrator paperwork branch). Both were closed by tripwires, and both
reviewers approve c1be4a8.

## Residue accepted by the owner (all low)

Fable CR-003 (fence-length half), CR-004 (text added after 6dc5b06 is
protected by diff review only), CR-005 (disclaimer word list), CR-006
(disposition relatedness), CR-008 (stable-section message, A-14 exemption
does not expire). Each is listed in the work history. Round-0 CR-005 is
pre-existing on main and left for a later paperwork pass.

## Merge notes

- M5-P1 conflicts with this branch in delivery/STATE.md only. A-14 lands at
  the marker after A-10, and `OPEN_ACTION_EXEMPT` then drops `A-14`.
- The verdict commit carrying this file touches only `delivery/review/`.
