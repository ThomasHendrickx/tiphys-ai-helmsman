# Arbitration: kernel 0.2.1 history compatibility (PR #216), reviewed head

Orchestrator record under DR-0012
(delivery/decisions/DR-0012-delegated-merge-authority.md:22).

This record rules on the REVIEWED head, 281d8925f06dbb81cca16fd32d7199e600908c23.
The `merge-preconditions` condition-6 document names the verdict commit, so it
is written out of tree and passed with `--arbitrations`, as for M5-P3 and M5-P5.

## Reviews on the record

- reviews: kernel-0-2-1-history-compat-criteria.json, kernel-0-2-1-history-compat-hazard.json

| round | document | family | contract | head | verdict |
|---|---|---|---|---|---|
| 0 | `delivery/review/clean-room-kernel-0-2-1-opus-criteria.md` | Opus | criteria | first review head | FIX-ROUND-NEEDED, CR-001 medium, CR-002 to CR-006 low |
| 0 | `delivery/review/clean-room-kernel-0-2-1-sonnet-hazard.md` | Sonnet | hazard | first review head | FIX-ROUND-NEEDED, CR-KH-001 and CR-KH-002 low |
| 1 | same criteria document, "Re-verification at 1e48bff" | Opus | criteria | 1e48bff | APPROVE, CR-007 low |
| 1 | same hazard document, "Re-verification at 1e48bff" | Sonnet | hazard | 1e48bff | FIX-ROUND-NEEDED, CR-KH-003 high |
| 2 | same criteria document, "Re-verification at 281d892" | Opus | criteria | 281d892 | APPROVE, CR-008 low |
| 2 | same hazard document, "Re-verification at 281d892" | Sonnet | hazard | 281d892 | APPROVE, no finding |
| final | `delivery/review/kernel-0-2-1-history-compat-criteria.json` | produced-by `claude-opus-5-5` | criteria | 281d892 | APPROVE |
| final | `delivery/review/kernel-0-2-1-history-compat-hazard.json` | produced-by `claude-sonnet-5` | hazard | 281d892 | APPROVE |

Each review document is cumulative: every round appends a section, so the two
markdown files carry all three rounds.

## How it went

Round 0 found that pulse's real head-less history was refused beside an
anchored pair (CR-001). Fix round 1 excluded a head-less same-phase sibling as
history. Its re-verification found the mechanism behind CR-KH-003 (high) and
CR-007 (low): the exemption was keyed on the document's SHAPE (no `head`),
which a document written today can also have, so a fresh head-less verdict
carrying a high finding went green beside a clean pair.

Fix round 2 keys the exemption on PROVENANCE instead. A head-less sibling is
history only if its blob at the audited commit equals its blob at the merge
base. One the change adds or changes is refused, naming its verdict and
blocking findings. `tiphys validate` requires `head` from 0.2.0 on through
RULES_SINCE, while admission still ignores the stamp (DR-0055 correction).
The orchestrator chose this design and recorded why in the fix-round brief:
a rule refusing any head-less sibling with a blocking finding would refuse
pulse's real history (29 of 42 head-less pulse verdicts carry one), which
DR-0054 forbids.

The high did not recur. Both reviewers approve 281d892.

## Residue accepted (all low or stated residuals)

- CR-008 (low): the behavior row `validate-verdict-head-required-from-0-2-0`
  has no witness spec and the work history does not say so. The criteria
  reviewer reddened the test by exact title under two different mutations
  and recorded that run in its re-verification section, which discharges the
  red-witness rule for this head. Adding the spec is a follow-up, not a
  merge blocker, because it would change the reviewed head.
- Stated residual: a head-less blocker already present at the base is still
  treated as history. Its REPORT line names the verdict and findings.
- Stated residual: the bare `check-dual-review` without `--base` still
  excludes on shape. The workflow step is informational, and the enforcing
  arm (`merge-preconditions`) gets `--base` through the gate runner.
- Not tested live this round, read-verified by the hazard reviewer: a
  symlinked sibling, an unresolvable merge base, a moving `--base` ref, a
  sibling that arrives through a merge of `main`.

## Merge notes

- The verdict commit carrying this file touches only `delivery/review/`.
- The version stays 0.2.0 on this branch. The bump to 0.2.1 and the publish
  follow the merge (owner approved publishing 0.2.1 once green).
