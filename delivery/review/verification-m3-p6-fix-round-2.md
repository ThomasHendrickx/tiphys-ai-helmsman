# Delta verification: M3-P6 fix round 2 (`2a89757..4619bf8`)

Status: IN PROGRESS (this file is appended to as each command completes; it is
the agent's beacon under the T-008 dispatch contract at CLAUDE.md:355).

Instrument: STRUCTURAL delta verification, not a criteria walk and not a
re-review of the phase. The measured basis is the fix-round contract at
CLAUDE.md:297: twelve of thirteen re-reviewed M1 fix rounds produced a new
finding attributable to the round itself.

## 0. Scope, and what this report does NOT cover

The reviewer's first check is item 3 of the fix-round contract
(CLAUDE.md:326), so this section is written first and is not a postscript.

COVERED: the six files in the delta `2a89757..4619bf8`, the central claim that
the removed row-and-field check was redundant, the witness arithmetic at
src/witness/run.ts:886, the two registries the delta touches, and the CI run on
the head.

NOT COVERED, and why:

1. **The phase itself.** The criteria walk, the role-brief content, the six
   sections of roles/implementer.md, the composed dispatch block. Two
   clean-room reviews already covered head `16bab6f` and this instrument is
   structural over the delta only. A defect present at `2a89757` and unchanged
   by this round is outside this report by construction.
2. **`delivery/work-history/m3-p6.md` as prose.** 1077 added lines. I read the
   round-2 sections and ran the claim grep over the whole file, but I did not
   re-derive every measurement it records from round 1 or earlier.
3. **`scripts/render-agent-rules-gates.mjs`.** The round's own mechanism-index
   row (tuition/mechanism-index.yaml:222) records this sibling as carrying the
   same defect UNFIXED. I confirmed the round declared it rather than fixing
   it; I did not audit that script, and it is a standing open item, not a
   finding of this round.
4. **The `full` gate bundle beyond the gates I ran.** I ran the PR bundle and
   the red-witness gate. I did not run `scripts/m2-exit-test.sh` in full mode,
   which CLAUDE.md:615 records as not runnable in this container.
5. **Non-determinism.** Every probe below was run once unless stated. The
   witness runner's own `repeats: 2` is the only repetition discipline I
   relied on.
6. **Windows/macOS portability of the new script paths.** Not exercised.

## 1. The head, and that the delta is the one I was given

```
$ git rev-list --count 2a89757..4619bf8
16
$ git diff --stat 2a89757..4619bf8
 delivery/work-history/m3-p6.md                 | 1077 ++++++++++++++++++++++++
 scripts/check-brief-drift.mjs                  |  143 ++++
 test/behaviors.json                            |    5 +-
 test/implementer-brief.test.ts                 |  270 ++++++
 tuition/mechanism-index.yaml                   |   35 +
 witness/implementer-brief-gate-list-drift.json |    3 +-
 6 files changed, 1531 insertions(+), 2 deletions(-)
```

exit 0 for both. Sixteen commits, six files, matching the dispatch exactly.
The head had NOT moved when I fetched it: `origin/claude/m3-p6-delivery-role-briefs`
resolved to `4619bf8`.

## Log

(appended as work proceeds)
