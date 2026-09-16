# The scope gate is red for every M4 phase, and the fix has two steps not one

- date: 2026-09-16
- found by: `.claude/merge-ready.mjs`, on its first run, against M4-P15
- status: a fourth blocker on the M4 merge path, alongside the root charter, the
  single-family review exception, and the absent verdict documents. It blocks
  all twelve phases rather than any one of them.

## The measurement

Run against M4-P2 at its own head, in a worktree that really has that branch
checked out, with the phase supplied:

```
gates: declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0 error 0 vacuous 0
gates: scope: red: branch claude/m4-p2-async-launch (phase m4-p2) matches the phase
  pattern but no phase declaration exists at
  delivery/plan/phase-declarations/m4-p2.json in the merge base
  3b401182301361700ffa0fd4b2ae099993b3d733 of --base origin/main and --head HEAD;
  the declaration must be committed to main before the phase branch is created
```

Zero M4 declarations are on `origin/main`. Eleven of the twelve exist on their
own branches, where the gate cannot see them, and M4-P11's implementer has not
written one yet. So this is not a defect in M4-P2; the same red is waiting for
every phase.

Two failed attempts are recorded because each one teaches the gate's contract:

- Running it from the main clone against `--head origin/claude/m4-p2-...` is
  refused, because the working tree had a different commit checked out and the
  gate will not audit a diff whose right-hand side is not what is really there.
- Running it in a DETACHED worktree at the same commit reports not-applicable,
  because the precondition reads the checked-out BRANCH NAME and `HEAD` does not
  match the phase pattern. The gate needs the branch, not the commit.

## Why landing the declarations on main is not sufficient on its own

The obvious reading is "commit the eleven to main and the red clears". It does
not, and the arithmetic says so before any gate is run:

```
$ git merge-base origin/main claude/m4-p2-async-launch
3b401182...
$ git merge-base claude/m4-declarations-to-main claude/m4-p2-async-launch
3b401182...          # unchanged: the declarations branch is main plus one commit,
                     # and m4-p2 was cut from main, so they still meet at main
```

A commit added to `main` after a branch was cut is not in that branch's merge
base. The base itself is computed at src/gates/scope.ts:245, which shells out to
`git merge-base <base> <head>`, and the declaration is then read out of that
commit's tree, so it stays invisible however many times it is committed to
`main`.

What moves the merge base is the phase branch MERGING main in. Measured on a
throwaway copy of M4-P2:

```
merge base now: 4ed31c5f   (was 3b401182)
m4-p2.json visible there: YES
all eleven visible there: 11
```

So the fix is two steps, and the second is per-branch:

1. `claude/m4-declarations-to-main` lands the eleven declarations on `main`, one
   pull request for eleven phases rather than eleven cycles of sixteen minutes,
   which is the batched shape DR-0031 asks for. Its name deliberately does not
   match `^claude/m[0-9]+-p[0-9]+-`, because a non-phase branch that does derive
   a phase id and red the gate, which this repository has paid for twice.
2. Every phase branch then merges `main` in, which moves its merge base forward
   past that commit. Until a branch does step 2, its scope gate stays red no
   matter what `main` contains.

## What this derivation did NOT cover

- **Whether the gate then goes GREEN, as opposed to merely finding the
  declaration.** Only the merge-base visibility is proven. The changed-files
  audit against each declaration's own files-to-touch list is a separate
  question and is not answered here. A phase whose implementer touched a file
  it did not declare will still be red, correctly, and that is a per-phase
  finding rather than this blocker.
- **M4-P11**, which has no declaration to land. A second, smaller batch follows
  once its implementer writes one; holding the eleven for it would help nobody.
- **The timing of step 2.** It is deliberately NOT done yet. Eleven clean-room
  reviewers are reading `git diff 3b40118...<branch>` right now, and merging
  main into a branch mid-review changes the diff underneath them. Step 2 waits
  until the reviews return.
- **The other eleven gates.** Only `scope` was run. This says nothing about
  whether any of them is red, and several are wall-clock sensitive on a box
  that was at load 69 while this was measured.
