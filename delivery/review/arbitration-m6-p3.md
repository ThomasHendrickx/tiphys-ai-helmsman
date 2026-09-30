# M6-P3 arbitration, round 0 (head d584639)

Review A (hazard-deletion-first): FIX-ROUND-NEEDED, 1 medium, 4 low.
Review B was held until after the fix, so both reviews judge one head and
review B runs once (cheaper than a full review before and after the fix).

Fixed in round 1: CR-M6P3A-01 (duplicate mode id shadows by first match; the
reader refuses duplicates, with a derivation over every id-keyed first-match
read), CR-M6P3A-02 (brief compose with no project registry refuses),
CR-M6P3A-03 (empty env-grep allowlist).

No change: CR-M6P3A-04 (the stale `$comment` text goes in M6-P4's schema
diet); CR-M6P3A-05 (comment-only edits in src files P3 does not otherwise
change, each would cost a witness).

## Round 1 (head 89260f4)

Review B (hazard-runner-first): FIX-ROUND-NEEDED, 1 medium, 3 low. Review A's
delta of fix round 1 is in progress at the same head.

Fixed in round 2: CR-M6P3B-01 (registry text spliced with a replacement
string, so `$` patterns corrupt the composed gate list; derivation over every
string-replacement site built from document content), CR-M6P3B-03 (the
diff-touches precondition without `-z --no-renames`).

No change: CR-M6P3B-02 (no test asserts which gates each CI arm runs; low),
CR-M6P3B-04 (the precondition script is deleted in M6-P5).

After round 2, both reviewers verify the final head with a short delta.

## Round 1, review A delta

Review A verified fix round 1 at 89260f4: APPROVE. A-01 to A-03 cleared; new low A-06 (validate no longer refuses duplicate checklist probe ids, plan phase ids and same-arm gate ids; every first-match reader refuses at use time): no change, recorded.
