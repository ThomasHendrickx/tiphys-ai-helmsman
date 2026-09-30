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

## Round 2, review B delta (head b63cb44)

Review B verified fix round 2 at b63cb44: CR-M6P3B-01 and 03 cleared, each
with its fix mutated away and its named test red. 02 and 04 stay as recorded
lows. New medium CR-M6P3B-05: src/witness/run.ts lists changed files without
`-z`, so an unwitnessed non-ASCII `src/` file leaves `red-witness` green
(exit 0), where the same file with an ASCII name is red.

Ruling: fixed in round 3, in this phase. The code predates M6-P3 (byte
identical at a726478), but it is the mechanism round 2 named, and round 2's
own derivation listed the site. The fix-round contract fixes the mechanism,
so every site of it belongs to the round that named it. This is the second
fix round after the first dual review (completed at 89260f4), inside
DR-0012's limit of two.

Not graded, recorded: `lab/apply-member.mjs:56` interprets `$` patterns in a
replacement string. Older than this phase, not shipped, and no witness
member uses a `$` pattern.

Review A's second delta waits for round 3, so it judges the final head once.
