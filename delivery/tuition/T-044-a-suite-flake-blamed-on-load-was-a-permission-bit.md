# T-044: a suite flake blamed on concurrent load was a permission bit

Discovered 2026-09-18 by the DR-0047 final-sweep criteria reviewer on the
credential group, at head `ad2428b`, while establishing its own suite sentence.
It closes an open item that a fix round had honestly recorded and could not
explain, and it corrects an attribution the orchestrator had already reported
to the owner as settled.

## What was believed

Two things, and both were wrong in the same direction.

The credential-route fix round ran `npm test` four times on the floor toolchain.
Two runs failed, three reported 1305/1305 or 1309/1309 and exit 0. It wrote the
discrepancy down rather than dropping it, said plainly that no claim was being
made about the cause, and named `test/gates.test.ts:3558` as the lead. That
record is at delivery/work-history/credential-route-fixes.md:1118 and it was
correct to stop there. The failing test NAME was lost, because the capture was
piped through `tail -12`.

The orchestrator then met the same red on a `suite` gate, re-ran it on a quiet
container, got 1341/1341 with zero skipped, and **attributed the earlier red to
concurrent load from two agents running their own suites.** That attribution
rested on no measurement of load: no run in the record captured a load average,
a process count, or a second arm with the load removed. It was a plausible story
that fit the observation, and the observation fits several other stories
equally well.

## What was measured

The reviewer's own run at the same head: 1341 tests, 1339 pass, **2 fail**, 0
skipped, exit 1, on node v26.6.0 with `dist/` built, invocation `npm test`. Both
failures pass IN ISOLATION at the same head, same interpreter, same build state,
1 test 1 pass 0 fail 0 skipped each. The two sites:

- test/gates.test.ts:3571, the precondition-command test
- test/watcher.test.ts:1437, "two single passes released together surface one turn-end"

The first of those is inside the region the fix round had named as its lead, so
the lead was right and the name is now captured.

Then the fact that explains it, and it is one `stat`:

| when | `stat -c %a /tmp/claude-0` |
|---|---|
| before the isolated run | **700** |
| after the isolated run | **755** |

`grantTraversalWhenUnderTmp` at test/gates.test.ts:3517 opens the traversal
chain when the REPO is under `/tmp`, and test/gates.test.ts:3536 is where the
unprivileged-uid test calls it. The mode it grants **does not persist across a
seven-minute suite run in this container.** Something reverts `/tmp/claude-0` to
`700` while the suite is still going, and a test that drops to an unprivileged
uid and spawns `process.execPath` then takes `EACCES` on the interpreter's own
path.

This is standing warning 1's trap, `CLAUDE.md`'s longest environment entry,
arriving through a door that entry does not name: the warning describes a clone
under `/tmp` opening traversal INCIDENTALLY and permanently, and the measured
behaviour is that the grant is temporary.

## The mechanism

**An intermittent failure was attributed to the first plausible cause that fit,
and "it passed on a quiet container" was accepted as the control.**

Re-running until green is not a control arm. It cannot distinguish load from a
permission bit from a clock from anything else that varies between runs, because
every one of those also produces "red sometimes, green sometimes". The
orchestrator had a two-arm experiment available and ran a one-arm one.

The reviewer's arm was different in the way that matters: it changed the thing
under suspicion and read the value directly, instead of changing everything at
once and reading the outcome.

## What this costs if it stays unfixed

A red `suite` gate here is currently indistinguishable from a red branch. The
project has already paid once for the sibling shape at CLAUDE.md:1 standing
warning 12, where a red on the default toolchain stopped being proof of a red
branch and the entry notes that this "trains a reader to wave a failure
through". This is the same training, one axis along.

## What is NOT established

Said rather than assumed, because the whole point of this entry is that the
plausible story is not the measured one:

- **What reverts the mode is unknown.** Nobody has shown whether it is a
  container housekeeping process, another test, or the harness.
- **The watcher failure is not explained at all.** It is a different file and a
  different mechanism, and `EACCES` on the interpreter does not obviously reach
  it. It is recorded here because it co-occurred, not because it is the same
  defect.
- **The orchestrator's load hypothesis is not refuted, it is unsupported.** Two
  causes can both be real. What is established is that the permission bit moves
  and that nobody measured load either.

## The rule

An intermittent failure is not explained by a run that passes. Name the variable
you think is responsible, read its value directly on both arms, and if you
cannot, say the cause is unknown and leave the record open. The fix round did
exactly that and was right to; the orchestrator closed it and was wrong to.
