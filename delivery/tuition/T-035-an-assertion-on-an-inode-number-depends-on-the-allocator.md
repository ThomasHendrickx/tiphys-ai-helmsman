# An assertion that a file got a NEW INODE depends on the filesystem not
# recycling the old number, which no filesystem promises

Found 2026-09-16 by CI, on a pull request that did not touch the file. Recorded
because the test is on `main`, it can redden any pull request at any time, and
the two assertions beside it already prove the property it was added for.

## What happened

Pull request #160 (M4-P23) went red on the `gates` workflow. The failing step was
the M1 exit test in local mode, and inside it:

```
test at test/cutover.test.ts:1025:1
x publishing the cutover state replaces the destination rather than writing through it
  AssertionError: the destination must be a new inode, which an in-place write does not produce
    actual: 9182995, expected: 9182995, operator: notStrictEqual
```

Nothing in that pull request touches `test/cutover.test.ts`, `src/cutover.ts`, or
anything either of them reads. The phase changed ten paths and none of them is in
that neighbourhood.

**The same run proves it is nondeterministic rather than head-dependent.** Step 6
of the same job ran `npm test` at the same commit on the same runner and reported
1031 tests, 1029 pass, 0 fail, 2 skipped. Step 15 ran the identical suite through
the M1 exit-test harness minutes later and reported 1031 tests, 1028 pass, 1 fail.
One commit, one runner, two runs, two answers.

## The mechanism, which is not "a flake"

The test does this:

1. writes `cutover.json` and records `statSync(destination).ino`;
2. `rmSync(destination)`, which drops the last link and FREES that inode;
3. symlinks a decoy over the name;
4. calls `publishCutoverState`, which writes a random temp file and renames it
   over the name;
5. asserts the new file's inode is not equal to the recorded one.

Step 2 frees the inode. From that moment the number is the filesystem's to hand
out again, and an inode number is not an identity that survives deletion. The
assertion is therefore a claim about the ALLOCATOR, not about the code under
test. When the allocator happens to reuse it, a correct implementation fails the
test.

**The implementation is not at fault and that was checked rather than assumed.**
`publishCutoverState` at src/cutover.ts:253 opens a random temp path with `wx`,
writes, fsyncs, closes, and `renameSync`s onto the destination. It is a genuine
replace. The two assertions ABOVE the inode one are the ones that witness that:
the destination is no longer a symbolic link, and the decoy is byte-identical, so
nothing was written through. Those hold. Only the third can fail, and it can fail
while everything it claims to protect is true.

## Measured, and the measurement is partial in a way worth stating

In this container, inode reuse after a delete is not rare; it is the rule. 200
trials per arm, one variable:

| arm | inode reused |
|---|---|
| write, record, unlink, write again | **200 / 200** |
| the same with an open descriptor held on the original | **0 / 200** |

That is the fix and its control in one table. A POSIX inode is not freed while
any descriptor still refers to it, so holding one across the delete makes the
number un-recyclable and the assertion sound.

**The test's OWN sequence resists it, and that is why it looks like a flake
rather than a bug.** Mirroring the test exactly, including the intervening
`symlinkSync`, gave 0 reuse in 400 trials with and without the hold. The symlink
consumes the freed number first. That is the whole reason the assertion passes
almost always and the reason it is nevertheless unsound: whether the symlink gets
that particular number is the allocator's business, not the test's.

**Reproduced, at the rate the shape predicts.** Adding ONE churn to that
sequence, replacing the symlink once before the publish, is enough to put the
freed number back within reach:

| arm (test sequence plus one churn) | dangerous state reached |
|---|---|
| without a held descriptor | **2 / 300** |
| with a held descriptor | **0 / 300** |

Two in three hundred is not a weak result here, it is the CORRECT one: a defect
that fired once across many CI runs should reproduce at about that rate, and a
fixture that reddened half the time would be evidence I had changed the
mechanism rather than reached it.

So the witness has two structurally different members, which is what this
repository requires of a class: the isolated allocator probe, where reuse is the
rule at 200/200, and the test's own sequence under churn at 2/300. Both go to
zero with the hold. Beside them sits the CI capture, which is real output from
the program under test rather than a hand-written string.

## The fix, and why it is not a removal

The assertion is kept and made sound: the test opens a descriptor on the original
destination before deleting it and closes it at the end. Nothing else changes.

Deleting the assertion would also have gone green, and it is the move this
repository forbids. It is worth naming why the forbidden move was tempting here:
the assertion is redundant, the two beside it are stronger, and removal is one
line. That is exactly the argument that gets a real guard deleted, and the
difference between this case and that one is not visible from the diff.

## The shape, which is the repository's own, one layer along

The usual form here is a guard whose condition does not test the property it
claims, and which is therefore green and worthless. This is the mirror: a guard
whose condition does not test the property it claims, and which is therefore
RED and worthless. It reddens on something true about the allocator instead of
something true about the code.

Both come from the same place, which is writing an assertion about a proxy
instead of about the property. "A new inode" is a proxy for "replaced rather than
written through". The direct tests were already there, one line above.

## What this does NOT establish

The inode half IS audited, and the class has exactly one member. The derivation,
run over `test/`, `src/`, `bin/` and `scripts/`:

```
$ grep -rn '\.ino\b' test/ src/ bin/ scripts/
test/cutover.test.ts:1033:    const inodeBefore = statSync(destination).ino;
test/cutover.test.ts:1049:      statSync(destination).ino,
```

Two hits, both in the test this entry is about. Nothing else in the repository
reads an inode number at all.

**What that derivation did NOT cover.** It searched four trees and matched the
literal `.ino`, so it would miss a destructured `const { ino } = statSync(...)`
and it does not reach `delivery/`, `sandbox/`, `witness/`, `node_modules/` or
`dist/`. It also says nothing about the wider family. A separate pass over
`mtimeMs`, `birthtime` and `.dev` found about twenty hits, all in the pin and
suite-gate witnesses, and they are a different shape: they assert that a
controlled rewrite DID or did NOT change a timestamp, which is a statement about
an operation that just happened rather than about an identity surviving a delete.
`test/pin.test.ts:256` asserting equality across a no-op is sound for the same
reason. I read them rather than grepping a verdict out of them, and I did not
re-run them under a mutation to confirm the reading.

Nor does it establish how often this will recur on CI. One occurrence is one
occurrence. The fix removes the dependence rather than reducing a rate, which is
why no rate is quoted.
