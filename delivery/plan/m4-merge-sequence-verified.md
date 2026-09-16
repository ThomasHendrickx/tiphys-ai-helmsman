# The whole merge sequence, simulated end to end before opening anything

- date: 2026-09-16
- method: a throwaway `git clone` in which `origin/main` was moved to the state
  it will have once the paperwork lands, NOT a worktree of the real repository
- why it exists: DR-0031 clause 3. CI enforces that `main` stays green and is not
  how you find out whether you are. This is the finding-out. The sequence has no
  precedent here: zero M4 phases are merged and zero pull requests are open,
  measured.

## The result

**Eleven of twelve phases pass the scope gate**, and the twelfth passes once one
ordering constraint is honoured. Zero remain unexplained.

| phase | scope after the sequence | changed paths audited |
|---|---|---|
| m4-p1 | **green** | 48 |
| m4-p2 | **green** | 18 |
| m4-p10 | **green** | 15 |
| m4-p13 | **green** | 7 |
| m4-p15 | **green** | 5 |
| m4-p16 | **green** | 16 |
| m4-p19 | **green** | 10 |
| m4-p20 | **green** | 8 |
| m4-p23 | **green** | 9 |
| m4-p26 | **green** | 30 |
| m4-p27 | **green** | 8 |
| m4-p11 | **green ONLY after M4-P10 merges** | 7 |

## The sequence that produces it

1. The paperwork branch lands on `main`, carrying all twelve phase declarations.
2. Each phase branch merges `main` in. This is not optional: a commit added to
   `main` after a branch was cut is not in that branch's merge base, and the gate
   reads the declaration from the merge base.
3. `M4-P10` merges before `M4-P11`.

Step 3 is not a new rule. Binding convention 5 states it: "MERGE order is always
dependency order even when work order is concurrent". M4-P11 was cut from
M4-P10. What is new is knowing
WHICH pair it binds, and why: without it, M4-P11 carries
`delivery/work-history/m4-p10.md` in its diff and the gate correctly calls that
a path outside its declared scope. With M4-P10 on `main` first, that file is no
longer part of M4-P11's change and the count drops to 7.

## Two defects this found before any pull request existed

**A stale declaration would have produced a merge conflict.** The batch carried
`m4-p2.json` as it stood when the twelve were collected. M4-P2's fix round then
added five witness paths and two captures to its own copy. Landing the stale one
conflicts on that file for M4-P1 and M4-P2 both. Every other phase was checked
the same way by comparing hashes; m4-p2 was the only stale one, and it is
refreshed.

**The gate refuses a substituted trunk, so there was no shortcut.** It resolves
its trunk at src/gates/scope.ts:85, preferring `origin/main` and falling back to
a local `main`. Pointing
`--base` at the plan branch is rejected: "merge base ... is not an ancestor of
the configured trunk origin/main". The gate resolves its trunk as `origin/main`
with a fallback to a local `main`, so an honest simulation has to move
`origin/main` itself, which is only safe in a clone.

## The mistake made while doing this, recorded because it nearly cost work

The first attempt ran the merges inside the REAL repository's worktrees. A
worktree shares the object store and the refs with the repository, so those
merges were real: three phase branches (`m4-p13`, `m4-p16`, `m4-p20`) gained a
merge commit that nobody asked for. Nothing reached `origin`, and all three were
reset to their pushed state with `git rev-list --count <branch> --not --remotes`
confirming zero afterwards.

**A simulation belongs in a clone.** A worktree is not a sandbox; it is the same
repository with a different working directory.

## What this does NOT establish

- **Only the `scope` gate was run.** Nothing here says the other gates pass after
  the sequence, and `coverage` and `suite` are wall-clock sensitive on a loaded
  box, so they need a quiet machine rather than this lab.
- **The merges were clean in the lab; they may not be later.** Every branch moves
  when its fix round or review lands, and this result is a snapshot at
  `e3ddbff`. Re-run before opening if the branches move.
- **It says nothing about review state.** A green scope gate is one condition of
  many; the reviews, re-reviews and fix rounds each phase still owes are tracked
  separately by `.claude/merge-ready.mjs`.
- **M4-P11's red was the only one found, not the only one possible.** The other
  eleven were audited against their own declarations at one head each. A phase
  whose branch changes again can acquire a new undeclared path.
