# Arbitration: the two M1-P6 reviews, and the one question this phase had to answer

- date: 2026-08-05
- head: `79604ecd36cea50e0d4e8fcb0f7b574887eeb9d2` (PR 9)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: FIX-ROUND-NEEDED stands. Four mediums block merge. The DR-0012
  stop-and-wait limit does NOT fire: this is the phase's FIRST dual review and
  neither contract returned a high.

## The two verdicts

| | hazard contract (Opus) | criteria contract (Sonnet) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED | APPROVE |
| high / medium / low | 0 / 4 / 6 | 0 / 0 / 1 (+3 informational) |
| criteria | regression spot-checks | all 6 met, re-executed |
| gates Node 26 | 153 / 153 / 0 skip | 153 / 153 / 0 skip |
| gates Node 22 | 153 / 151 / 2 skip | 153 / 151 / 2 skip |
| registry | 159 mappings, 0 unresolved | 159 mappings, 0 unresolved |

Both used the floor toolchain. Both reproduced every number in the work
history, independently of it and of each other.

## The question this phase existed to answer

This harness is what certifies milestone M1. A harness that cannot fail is
worse than no harness, because it converts an unknown into a false assurance.
So the hazard contract was asked directly: can it pass while the milestone is
broken?

**Answer: no, and the reviewer could not construct a green-when-broken state
with the harness intact.** It built three things rather than reasoning:

1. Re-derived the falsification path independently: exit 1 at C2, 41 records,
   `041-C2.json` outcome `fail`.
2. Ran the unmodified harness on Node 22: exit 1 at A2, refusing to certify
   below the declared floor.
3. Patched the watcher to emit `signal m1-exit turn-end` unconditionally at
   startup, before any task exists. Stages A5 through C3 pass and the harness
   exits 0 with a validated bundle whose A8 records are indistinguishable from
   an honest run, **but only when A1's kernel gates are stubbed out**. With A1
   intact the same mutation gives `npm test` exit 1 with four failures.

That third construction is the honest and important result: for that one exit
condition the assurance lives in the unit suite A1 runs, not in the end-to-end
witness. Recorded as CR-603 rather than glossed.

## Why the criteria contract could not have found the blocking findings

All four mediums are in territory no acceptance criterion describes.

CR-600 was found by walking the FULL-MODE path, which nothing in this project
had ever executed, using a reviewer-built `gh` stand-in and a `file://` remote.
No criterion covers full mode's stage sequencing, because local mode is what
the criteria are written against.

This is tuition T-007 again, and it is now three phases in a row where the two
contracts found different defects and only the hazard contract found the
blocking ones. The criteria contract remains necessary: it independently
re-executed all six criteria and reproduced the 51-record bundle with
identical per-step and per-kind counts, which is what makes the work history
trustworthy. It is not sufficient, and it said so itself in its own
"what this contract cannot see" section.

## The four blocking findings

- **CR-600**: full-mode stage C destroys stage A's `pending-owner-action`
  evidence record. `stage_a` writes `session.json` with `recordSeq=33` BEFORE
  `stage_b_full_pending` writes record 034, so `--stage c` restores 33 and
  overwrites it. Constructed: the final bundle contains zero
  `pending-owner-action` records and `validate_bundle` passes anyway. The
  evidence bundle is the artifact the milestone's certification rests on, and
  this silently deletes part of it while the validator reports success.
- **CR-601**: a step failure between A5 and A8 leaks the harness-owned
  resident watcher permanently. The A5 and A8 timeout paths kill the child;
  `die` does not. Constructed twice; one probe's watcher was still running two
  and a half minutes after the harness exited.
- **CR-602**: three bundle records carry a hand-written `observed` equal to
  `expected`. For C1 the captured output is 0 bytes and the README it greps is
  never copied into the bundle, so that record is UNFALSIFIABLE from the
  evidence. This is the T-003 shape inside the certification artifact itself.
- **CR-605**: the falsifiability guard has no automated regression witness.
  `SKIP_STAGE_B` appears only inside the harness script, nowhere in `test/` or
  `.github/`. Nothing would turn red if the harness regressed to always-green,
  which is precisely the failure mode this phase is most exposed to.

## CR-624, the convention-7 finding, arbitrated here

The criteria contract flagged that commit `8c630df` names an AI product and
vendor, in the line quoting the container's ambient git identity
(`Claude <noreply@anthropic.com>`) as the evidence for which half of PR-211
the real-repository run witnesses. Binding convention 7 says commit messages
carry no AI model or tool names.

Ruling: **not blocking, and no history rewrite.** The convention exists to keep
tool attribution out of the repository's history. The flagged text is a
verbatim quotation of an environment fact that is the SUBJECT of the
assertion, not an attribution of authorship. More decisively, this phase lands
by SQUASH merge, so the branch's individual commit messages never reach
`main`; the squash message is authored by the orchestrator and complies. The
convention is satisfied where it applies.

Recorded rather than waved through, because a convention that gets quietly
excepted stops being a convention.

## Disposition

A fix round is dispatched. The DR-0012 stop-and-wait limit does not fire and
the orchestrator is not asking the owner for anything: this is the phase's
first dual review, neither contract returned a high, and the four mediums are
concrete and bounded. If the round comes back with a high, or if this phase
needs more than two rounds, the limit applies as written.
