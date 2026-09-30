# M6-P2 arbitration, round 0 (head e898e4e)

Reviews: m6-p2-hazard-a.json (fable, FIX-ROUND-NEEDED: 1 high, 1 medium, 4 low)
and m6-p2-hazard-b.json (opus, FIX-ROUND-NEEDED: 2 medium, 4 low).

Agreement: both found that a `single` change is satisfied by an earlier
phase's verdict admitted by ancestry (A-01 high, B-01 medium). The only
disagreement is severity; both severities block, so it is fixed.

Fixed in round 1: A-01/B-01 (exclude verdicts whose head is at or behind the
merge base), B-02/A-02 (refuse declaration entries that cannot match),
A-06/B-03 (red tests for the single refusal and five fail-closed arms), B-04
(criteria contract requires criteria[]), A-03/B-05 (lockfile and pin edges).

Deferred with an owner phase: the phase match on verdicts and the unread
`tier-by-review-tier` (P5); the single-family zero-dimension compare (P5);
DR-0012 condition 3 quoted in assurance-modes.yaml and the retirement
script (P3).

No change: shipped configuration outside the runtime set (A-05). DR-0063 lists
the set in the owner's words.

# M6-P2 arbitration, round 1 (head 773ced60c700c460e2fe995a62e76a88c99761f0)

Both reviewers re-reviewed the fix-round delta and APPROVE:
m6-p2-hazard-a.json (fable) and m6-p2-hazard-b.json (opus). No high or
medium finding stands. They agree on the remaining lows, and those go to
M6-P5, which rewrites this gate's admission:

- A-07 / B-08: declaration entries that are typos still read as valid (a
  prefix entry naming a file, a directory that does not exist, a backslash).
- A-08 / B-09: the charter and manifest read-failure branches have no test.
- B-07: no phase match on verdicts (P5 moves identity to kernel records).
- B-06: carried items with their named phase (P3 or P5).

Both reviewers are one vendor. DR-0062 counts that as one family, so this
pair merges under the single-vendor exception it describes. The gate that
checks families from kernel records lands in M6-P5; until then the merge gate
compares the self-reported model strings.
