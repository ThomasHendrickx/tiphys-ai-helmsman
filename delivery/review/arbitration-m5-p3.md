# Arbitration: M5-P3 live review evidence (PR #213), reviewed head

Orchestrator record under DR-0012
(delivery/decisions/DR-0012-delegated-merge-authority.md:14).

Out-of-tree record for the VERDICT COMMIT d74ec42dc6820d4cd6b501477151cd686f38767e, which carries the in-tree record ruling on the REVIEWED head, 3f78dce2ee965672ea55423c3fc9a33dddca1145.
The `merge-preconditions` gate's condition 6 needs a document that names the
head UNDER EVALUATION, which is the verdict commit carrying this file, and a
commit cannot name its own sha. That document is therefore written out of tree
and passed with `--arbitrations`, which is the implementer's open question 1
(delivery/work-history/m5-p3.md) and is left open for a later phase.

## Reviews on the record

- reviews: m5-p3-criteria.json, m5-p3-hazard.json

| document | family | contract | head | verdict |
|---|---|---|---|---|
| `delivery/review/clean-room-M5-P3-opus-criteria.md` | Opus | criteria | c4727e5 | APPROVE, 0 high, 0 medium, 3 low |
| `delivery/review/clean-room-M5-P3-sonnet-hazard.md` | Sonnet | hazard | c4727e5 | FIX-ROUND-NEEDED, 1 medium, 2 low |
| `delivery/review/verification-M5-P3-fix-round-opus.md` | Opus | criteria | 3f78dce | APPROVE, 0 high, 0 medium, 1 low |
| `delivery/review/verification-M5-P3-fix-round-sonnet.md` | Sonnet | hazard | 3f78dce | APPROVE, 0 high, 0 medium, 0 low |
| `delivery/review/m5-p3-criteria.json` | produced-by `anthropic-claude-opus` | criteria | 3f78dce | APPROVE |
| `delivery/review/m5-p3-hazard.json` | produced-by `claude-sonnet-5` | hazard | 3f78dce | APPROVE |

The two JSON files are the first verdicts written under the contract this phase
ships. Both carry the full reviewed head. They were written by the reviewers in
their own worktrees and are committed here unchanged, together, in one commit
that touches only `delivery/`.

## The disagreement, and how it closed

On c4727e5 the Opus criteria review approved and the Sonnet hazard review asked
for a fix round: the symbolic `--head` resolution in
`src/gates/merge-preconditions.ts` had no test (hazard CR-002, medium). Fix
round 1 added real-CLI tests in both review gates, two witnesses with two
mutation sites each, and changed no shipped `src/` code. Both reviewers
re-verified at 3f78dce and each mutation-tested the new tests independently.

## produced-by and model families

The gates compare `produced-by` as a normalised string, not as a family
(src/checks.ts:3738). `anthropic-claude-opus` and `claude-sonnet-5` are
distinct under that comparison, which the Opus verification measured through
the real runner. On policy, one Opus and one Sonnet reviewer is the pairing
DR-0012 names, so no single-family exception is involved.

## Tracked, not fixed here (all low)

- Criteria CR-001: whether the CI job token can read check runs. The workflow
  has no `permissions:` block. It is answered by the CI run on the verdict
  commit; if that run reports HTTP 403 on the check-runs read, add
  `contents: read, checks: read` at job level.
- Criteria CR-003: the composed brief names the verdict path as a template.
- Hazard CR-003: two declared witness paths were never created. The scope gate
  refuses removal of a declaration entry, so they stay declared.
- The two reviewers wrote `produced-by` in different styles, one with the
  vendor prefix. It only matters if the charter ever declares
  `review-families`.

## Carried forward

- From now on every phase review is dispatched under this contract. Each
  reviewer writes `delivery/review/<phase>-<contract>.json` with the full head.
- CI on the verdict commit reports `merge-preconditions` not-applicable
  (in-flight). The merge decision rests on a hand run of the gate after CI
  concludes, with an out-of-tree arbitration naming the verdict commit.
- M5-P5 must keep the delivered-outcome paragraph M5-P2 added to the role
  files.
