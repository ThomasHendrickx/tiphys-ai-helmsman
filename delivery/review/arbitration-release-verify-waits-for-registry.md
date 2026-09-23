# Arbitration: release verification waits for the registry (PR #211)

Orchestrator record for the merge decision under DR-0012
(delivery/decisions/DR-0012-delegated-merge-authority.md:14): two reviews on
different model families, CI green on the exact head, and the scope audit
passing.

## Reviews on the record

| document | family | head | verdict |
|---|---|---|---|
| `delivery/review/clean-room-release-verify-wait-opus.md` | Opus | pre-fix | FIX-ROUND-NEEDED (1 medium, 3 low) |
| `delivery/review/clean-room-release-verify-wait-sonnet.md` | Sonnet | pre-fix | FIX-ROUND-NEEDED (2 medium) |
| `delivery/review/verification-release-verify-fix-round-opus.md` | Opus | 5de114c (code 90e7b7e) | APPROVE, 0 high, 0 medium, 3 low |
| `delivery/review/verification-release-verify-fix-round-sonnet.md` | Sonnet | 5de114c (code 90e7b7e) | APPROVE, 0 high, 0 medium, 1 low |

Both delta verifications re-attacked every original finding against the real
script and reported each one closed. There is no disagreement to arbitrate.

## What changed after the reviewed head, and why it needs no new review

One change to shipped bytes: the comment block in `scripts/release-verify.sh`
under "WHAT SERVED MEANS HERE", item 1. It applies DV-001 from the Opus delta
verification, which found that the comment described the mechanism wrongly.
The comment said `npm install` reads the abbreviated packument. The reviewer
measured on npm 11.18.0, through a logging proxy, that install reads the full
packument and the tarball. The replacement text is the one the reviewer gave.

It is comment-only. The derivation, run on the working tree before commit:

```
git diff -U0 scripts/release-verify.sh | grep '^[+-]' | grep -v '^[+-]#' | grep -v '^+++\|^---'
```

It printed nothing: every added and removed line starts with `#`. Every
witness mutation find text still occurs in its target file (719 members
checked, 0 missing), so no witness spec was invalidated by the edit.

The work history's line quoting the old comment is a captured grep output
from an earlier round, and it is left as captured rather than rewritten.

## Tracked, not fixed here (all low)

- DV-002 (Opus): a mutation that kills only the direct child, not the process
  group, leaves the suite green. Real npm on the runners has no wrapper
  grandchild, so this is defence in depth. The test shape is in the report.
- DV-003 (Opus): on a stalled socket the NOT SERVED line says
  `last npm error: none`, because npm's `--fetch-timeout` equals the wrapper's
  bound. Optional: set it a few seconds lower.
- Sonnet low: an empty `RELEASE_VERIFY_WAIT_SECONDS` falls back to the 900s
  default instead of being refused, while an empty `--wait-seconds` is refused.
  The fallback is the conservative default, never an unbounded value.
- The registry-mode `npm install` step is not wrapped in `bounded_run`. npm's
  own 5-minute fetch timeout and 2 retries still apply. Stated as an open item
  in the work history.
- Disclosed residue, reproduced by Sonnet: a grandchild that leaves the process
  group with `setsid` survives the group kill. It holds no pipe the script
  waits on, and the whole-run bound held in every measurement.

## CI on the reviewed head

Run 35853273549 on 5de114c failed one test outside this PR's diff:
test/cutover.test.ts:2005, "criterion 7: the fleet tree changed across
status". The PR comment of 2026-09-23 records why it is not this PR's: the
test passed in the `push` run on `main` at 8558dca, and it passed 20 of 20
isolated runs on 5de114c on node v26.6.0. Its cause is not established. The
run on the head carrying this record is the one the merge depends on.
