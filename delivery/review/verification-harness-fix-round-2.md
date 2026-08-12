# Delta verification: harness assertion-direction fix round 2

Instrument: delta verifier. Not an implementer, not a clean-room reviewer.
Nothing is fixed here, no pull request is opened, nothing is merged.

Subject: branch `claude/exit-test-harness-assertion-direction`, delta
fdb3120..9b7752d, against the two clean-room reviews that reviewed fdb3120.

Verifier worktree: a fresh detached worktree at 9b7752d with its own
`npm ci` (exit 0), plus a second detached worktree used as a mutation lab.
Toolchain: node v26.6.0 from the scratch prefix, checked in the shell that
ran each command.

Status: IN PROGRESS. This document is written incrementally and committed
after each command whose output it cites.

## 1. What this verification did NOT cover

(to be completed; see final section)

## 2. Verdict

(pending)

## 3. The delta, confirmed independently

```
$ git diff --stat fdb3120 9b7752d
 .../work-history/exit-test-assertion-direction.md  | 1182 ++++++++++++++++++++
 scripts/m2-exit-test.sh                            |   22 +
 test/behaviors.json                                |    4 +-
 test/m2-exit-test.test.ts                          |  242 +++-
 4 files changed, 1442 insertions(+), 8 deletions(-)

$ git diff --numstat 16a3ec6 9b7752d
117	0	delivery/work-history/exit-test-assertion-direction.md
```

CONFIRMED: `16a3ec6..9b7752d` is documentation-only, 117 lines added, 0 removed,
one file, inside `delivery/`. The code delta is entirely `fdb3120..16a3ec6`.

The premise both clean-room reviews rested on is VOID, measured:

```
$ git show fdb3120:scripts/m2-exit-test.sh | sha256sum
9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138  -
$ git show 9b7752d:scripts/m2-exit-test.sh | sha256sum
4b607dd9696485e5ef5e68838b99d596e532f516db2aa2012630873a14b9d452  -
```

My own working copy at HEAD hashes to `4b607dd9...` and the test file to
`5bb732f77ce3e0a3a9665e59eec3f70be55e26eec9d093297e07d8c53ae2cb19`, which are
the two pristine snapshot hashes the round records at
delivery/work-history/exit-test-assertion-direction.md:2554. Independently
reproduced, so the round's snapshots are the bytes on the branch.

## 4. CENTRAL CLAIM 1: does `probe-4-explicit-table-leg` discriminate?

The round's evidence (FR2.4) is a table of whole-test exit codes. The test
aborts at its first failed assertion, so that table can establish at most which
probe failed FIRST under each defang. It cannot show what the later probes did.
Three of its twelve cells are therefore unmeasured.

I measured the complete matrix instead. Method: the test was INSTRUMENTED in
place (one anchored single replacement, aborting unless the anchor occurs
exactly once) so the probe loop REPORTS per probe instead of asserting, and the
loop runs to completion under every harness state. Four harness states
(pristine plus one leg deleted at a time, each an anchored single replacement)
times four probes times two arms. Restored from the saved pristine bytes after
the run; no `git checkout --` anywhere.

Defanger negative control first, so a silently missing anchor cannot read as a
clean result:

```
$ node HDV-defang.mjs scripts/m2-exit-test.sh /dev/null 'this anchor does not occur anywhere at all' 'x'
ANCHOR NOT UNIQUE (0 occurrences), aborting: this anchor does not occur anywhere at all
EXIT=2
```

The matrix. Cell is the assertion program's exit status for that probe;
`0` means the probe was ACCEPTED, i.e. that probe no longer witnesses anything.
Identical on the `pr` arm and the `main` arm, so one table serves both.

| probe | pristine | `-rows` | `-manifestIds` | `-explicitById` |
|---|---|---|---|---|
| probe-1-rows-leg | 1 | **0** | 1 | 1 |
| probe-2-manifest-leg | 1 | 1 | **0** | 1 |
| probe-3-manifest-gate-not-applicable | 1 | 1 | 1 | 1 |
| probe-4-explicit-table-leg | 1 | 1 | 1 | **0** |

CONTROL: every cell of the pristine column is 1, so no probe is trivially
accepted; and the three `0` cells are the only accepted cells anywhere, so no
defang collapses the whole family.

**Claim 1 is UPHELD for probe-4.** Deleting `...explicitById.keys()` and nothing
else turns probe-4 green while probes 1, 2 and 3 stay red, and deleting either
other leg leaves probe-4 red. Its unique rejecter is the explicit leg. It does
not merely look different.

The verbatim finding lines show what fires, and they are not the same branch for
every probe:

```
probe-1  [fixture-gate-declared-nowhere] expected status green, observed not-applicable ...
         [fixture-gate-declared-nowhere] is a REQUIRED gate but its status is not-applicable, not green ...
probe-2  [credential-token] gates.manifest.json declares this gate and the bundle carries NO record for it ...
probe-3  [credential-token] expected status green, observed not-applicable ...
         [credential-token] is a REQUIRED gate but its status is not-applicable, not green ...
probe-4  [fixture-gate-only-the-table-names] no record in the bundle for a gate the table lists (expected green)
```

Two things fall out of the matrix that the round's own evidence could not show,
and one of them is a finding. See DV-1 and DV-2 in section 8.

## 5. CENTRAL CLAIM 3: the 22 lines of new production code, read as new code

Both new checks are reachable ALONE, verified by defanging each one and
re-running a five-case fixture set through the extracted assertion program:

```
                       pristine   check A removed   check B removed
CONTROL-wellformed        0             0                 0
A gates is an object      1             0                 1
B everything empty        1             1                 0
D gates key missing       1             0                 1
```

CONTROL is exit 0 in every column, so neither check is always-red and the
driver's fixtures are accepted at all. Removing A frees case A while case B
stays rejected; removing B frees case B while case A stays rejected. **The
round's claim that each is witnessed alone by a member the other cannot reject
is UPHELD.**

What the two checks CANNOT reject is finding DV-3, and it is the same silent
degradation, in the same leg, under a third input.
