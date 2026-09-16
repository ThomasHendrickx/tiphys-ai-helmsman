# M4-P2 has needed four rounds, and the reason is worth separating from the
# usual one

Recorded 2026-09-16 under DR-0016's notification requirement.

## The count

| round | what it fixed | how it was found |
|---|---|---|
| 1 | the original clean-room findings | two clean-room reviews |
| 2 | a launch-failed left the worktree behind on macOS | the macos-smoke CI job |
| 3 | a member of round 2's own class survived in the same file it fixed | the round-2 delta verification |
| 4 (owed) | a captured-contract test whose SETUP assumes Linux /tmp semantics | the macos-smoke CI job, again |

DR-0012 caps a phase at two rounds: the stop-and-wait clause is at
delivery/decisions/DR-0012-delegated-merge-authority.md:34. Round 3 was
dispatched to a FRESH implementer under DR-0016, whose substitute for stopping is
named at delivery/decisions/DR-0016-escalation-threshold.md:70
as a fresh implementer plus a third review contract, and which
delivery/decisions/DR-0016-escalation-threshold.md:132
records as the half this project measured as working. Round 4 is now owed.

## Why this is NOT the shape DR-0016 escalates for

DR-0016 escalates when the fresh-implementer round ALSO fails, on the theory that
something different has to happen. That is not what occurred.

Round 3 did what it was asked and did it well: it closed the blocking finding,
widened the search across three spellings the previous derivation had not
enumerated, and found ZERO further instances, which is a real negative result.

The round-4 defect is in ROUND 2's test, and CI could not report it until now.
The pull request sat `mergeable_state=dirty` for roughly forty-five minutes,
and GitHub does not run pull_request workflows on a branch it cannot merge. So
the failure existed, unreported, across rounds 3 and its verification. Nothing
about the fresh implementer failed; the feedback channel was closed.

**That is the finding worth carrying: a conflicted pull request is not merely
unmergeable, it is UNTESTED, and the absence of a red is not evidence.**

## The round-4 defect itself

`test/spawn.test.ts`, "a launch-failed rolls the worktree back through a
symlinked fleet root and through a symlinked worktrees directory", asserts a
captured contract that git reports the canonical worktree path.

On macOS the probe is built under `mkdtemp` in `tmpdir()`, which is
`/var/folders/...`, and `/var` is itself a symlink to `/private/var`. Git
correctly reports `/private/var/folders/.../canonical-probe/clone`. The test's
SETUP assumed Linux `/tmp` semantics, where the constructed symlink and the
resolved path differ, so on macOS there is no difference left for the contract
check to observe and it reports false.

The irony is exact and worth stating: the test exists to support a fix for a
macOS symlink defect, and it fails on macOS because its own fixture does not
account for macOS symlinks.

## Why the phase is not being narrowed to get green

The obvious move is to drop the platform-fragile test and land the rest. It is
rejected. The macOS rollback fix is a real defect fix that must stay, and the
test is the only thing asserting the contract it rests on. Removing a test to
reach green is the one move this repository forbids outright, and scoping it into
a follow-up phase is the same move with a longer name.

## The cost, stated plainly

M4-P2 holds `src/spawn.ts`. M4-P3 and M4-P4 wait on that file; M4-P5, M4-P6 and
M4-P7 wait on the adapter seam those three build. So five phases wait behind a
phase on its fourth round. Every round has found a real defect, which is the
argument for continuing; the chain is the argument for not continuing
indefinitely. If round 4 does not close it, the phase goes to the owner rather
than to a fifth round.
