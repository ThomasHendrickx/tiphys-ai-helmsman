# T-013: a killed mutation harness leaves the mutant installed

- id: T-013
- date: 2026-08-09
- discovered by: the M3-P3 round-8 implementer, against its own harness,
  reported unprompted
- severity: high, because it silently invalidates every measurement taken after
  it and leaves no signal that it happened

## What happened

Round 8's mutation harness applies a mutant to `src/checks.ts`, runs a suite,
and restores the pristine file. One run was killed by a harness TIMEOUT while
the mutant was in place. The restore never executed, because the restore lived
on the happy path after the run.

The tree was left carrying the mutated file (md5
`df3c3013cb3be62823fabfaa9d9e0a88`, the nested mutant) with nothing announcing
it. It was found by PRINTING md5, not by noticing anything wrong. Restored by
`cp` from a pristine copy, md5 back to `9697035ed2073c1ee165b5d1e0107cc5`.

## Why this is worse than an ordinary bug

Every measurement taken after that point would have been against a mutant while
appearing to be against the round's own code, and the corruption is
DIRECTIONLESS: it could make a fix look broken, or make a defect look fixed, and
nothing in the output says which. A round that then reported "the witness
reddens" or "the suite is green" would be reporting a true observation of the
wrong tree.

`git status` does show a modified `src/checks.ts`, but a mutation round expects
`src/checks.ts` to be modified, so the one signal available is exactly the
signal that round has trained itself to ignore.

## The mechanism

**A cleanup that lives on the happy path does not run on the unhappy one, and a
timeout is the unhappy path that looks most like success.**

A crash usually announces itself. A kill does not: the harness simply stops, the
caller sees a non-zero exit or a timeout message it was half expecting from a
long-running suite, and the workspace is left in the dangerous state the harness
deliberately installed.

This is the same family this repository keeps recording, arriving from a new
direction. T-008's watchdog tested the wrong property. T-010's grep could not see
the byte it existed for. T-011's witness input decayed. T-012's measurement
covered one axis. Here the guard is a RESTORE, and it is correct, and it simply
does not run.

## What follows, and it is mechanical

1. **A harness that installs a dangerous state must restore from a TRAP, not
   from the happy path.** In shell, `trap ... EXIT`; in any language, the
   equivalent `finally`. Round 8 changed its harness to do this after the
   incident, so a kill can no longer leave a mutant behind.
2. **Print a checksum after every restore, and check it.** This is what turned an
   invisible corruption into a visible one. The round-7 verifier introduced the
   discipline (`cp` from a pristine copy, never `git checkout --`, with `md5sum`
   printed after each restore) and round 8 inherited it; that inheritance is the
   only reason this was caught.
3. **A checksum printed and not compared is decoration.** The value must be
   asserted against the known pristine one, or the print is a line of output
   nobody reads.
4. **Verify the tree is pristine before trusting a measurement**, not only after
   a restore. The expensive failure is a measurement taken on a corrupted tree
   and believed.

## Relationship to the standing `git checkout --` warning

CLAUDE.md's standing warning 8 says there is no safe narrow form of
`git checkout --` in a tree holding uncommitted work. That warning pushed
mutation harnesses here toward `cp` from a pristine copy, which is correct and
is what made restoration cheap and checkable.

T-013 is the other half: having the right restore COMMAND is not the same as
having the restore RUN. Both are needed and only the first was written down.

## What this entry does NOT claim

It does not claim any published number in this project was taken against a
corrupted tree. Round 8 caught this within the same minute and restored before
continuing, and the round-7 verifier independently recorded catching a
structurally similar problem (two harnesses writing one worktree concurrently),
killing that run and discarding it so that no number in its report came from it.
Two rounds in a row caught this class by checksum. That is evidence the
discipline works, not evidence the risk is theoretical.

## Evidence

- `delivery/work-history/m3-p3.md`, fix round 8, where the incident is recorded
  with both md5 values and the harness change that followed.
- `delivery/review/verification-m3-p3-round-7.md`, whose restore discipline
  (`cp` from pristine, `md5sum` after each restore, never `git checkout --`) is
  what round 8 inherited.
