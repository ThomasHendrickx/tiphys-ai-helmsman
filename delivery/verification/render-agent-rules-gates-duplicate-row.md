# `render-agent-rules-gates.mjs` prints a false diagnosis for a duplicated row

- date: 2026-08-12
- author: orchestrator
- subject: the carried-forward report that `scripts/render-agent-rules-gates.mjs`
  shares the generate-and-compare defect class found in its sibling, and
  "prints an actively FALSE sentence under defang". That report came from the
  M3-P6 implementer, was out of that phase's scope, and had never been checked.
- verdict: **CONFIRMED, by construction, with a control arm. Severity LOW.**
  The exit code is correct; only the diagnostic message is false.
- measured at: `origin/main` c75152b, node v26.6.0.

## Why this was checked now rather than carried further

T-009's corollary is that where behaviour forks, both arms need a witness, and
that one witnessed arm beside one unwitnessed arm is the shape that has already
cost this project a second pull request (PR #27 fixed one arm, PR #30 paid for
the sibling twelve lines away). A carried-forward report naming a sibling
script is that shape exactly, and it was sitting unowned.

The claim was also a CLAIM, in the sense the claim grep exists to catch. "It
prints an actively false sentence" is a statement about the world that had
never been executed. It is now.

## The mechanism

The function under discussion is defined at
scripts/render-agent-rules-gates.mjs:193 and the fallthrough branch that
carries the false sentence is scripts/render-agent-rules-gates.mjs:207.

`describeDrift` compares two blocks by building a `Set` of each block's lines
and reporting lines present in one set and absent from the other. When the two
sets are equal but the texts differ, it falls through to a single hard-coded
sentence:

    the two blocks differ only in blank-line placement or line order

**A `Set` cannot see a DUPLICATE.** Duplicating a line leaves both sets
unchanged, so the set difference is empty, the fallthrough fires, and the
program asserts a cause that is not the cause. The difference is neither
blank-line placement nor line order.

The general shape: **a fallthrough branch that names a specific cause is a
claim, and it is only true if the branches above it are exhaustive.** Here they
are not, because a set difference does not partition the ways two line
sequences can differ. It misses duplication and it misses multiplicity
generally.

## The probe, with its control arm

The mutation duplicates one existing gate row, byte for byte, inside the
generated block of a COPY of `CLAUDE.md`. Nothing in the repository was
modified; `--agent-rules <path>` points the checker at the copy.

```
duplicating line 256: | `manifest-self-check` | script | required | full, direct-p
=== CONTROL (unmutated copy) ===
agent-rules-drift: green (17 rendered gate rows compared)
../probe-render/control.md's gate block matches gate-registry.yaml row for row (3 preflight step(s), 14 gate(s))
CONTROL_EXIT=0
=== MUTANT (one gate row duplicated) ===
agent-rules-drift: red (17 rendered gate rows compared)
../probe-render/dup.md's gate block has drifted from gate-registry.yaml: the two blocks differ only in blank-line placement or line order. Re-render with node scripts/render-agent-rules-gates.mjs --write
MUTANT_EXIT=1
```

The control arm is what makes the mutant arm mean anything: an unmutated copy
is green at exit 0, so the red is attributable to the duplication and not to
the copying, the path, or the toolchain.

## What is and is not wrong here

**The gate is NOT broken.** It goes red, at exit 1, on a block that has drifted.
Whatever a reader does next, they will re-render and the drift will go away.
That is why this is LOW and not higher.

**The diagnosis is false.** A maintainer told the blocks "differ only in
blank-line placement or line order" will look for whitespace and ordering, and
will not find them, because the cause is a repeated row. The cost is a confused
reader, not a missed defect.

This is the same family as the M3-P6 finding F-B3 against the sibling script,
which was tracked with the same reasoning: exit code correct, message wrong.
Two live instances of one mechanism is what makes it a mechanism rather than a
typo.

## The derivation, and what it did NOT cover

The enumeration was run over the whole tree at both refs, not over a directory
chosen by reasoning:

```
git grep -n 'function describeDrift' origin/main -- .
  delivery/work-history/m3-p3.md:3340
  scripts/render-agent-rules-gates.mjs:193

git grep -n 'function describeDrift' origin/claude/m3-p6-delivery-role-briefs -- .
  delivery/work-history/m3-p3.md:3340
  delivery/work-history/m3-p6.md:1752
  scripts/check-brief-drift.mjs:155
  scripts/render-agent-rules-gates.mjs:193
```

So there are **two live implementations**, one on `main` and a second arriving
with M3-P6. The other hits are prose inside work histories and are not
executable.

Not covered, stated rather than left to be assumed:

- **The second live instance was NOT successfully probed, and the attempt
  measured NOTHING.** `scripts/check-brief-drift.mjs` was copied out of the
  branch to a scratch directory and run there; it failed with
  `ERR_MODULE_NOT_FOUND` on BOTH the control and the mutant arm, because
  copying it away from the tree broke its relative imports. Two arms failing
  identically for a reason unrelated to the mutation is a measurement of
  nothing, and it is recorded here rather than quietly dropped, because a
  reader who saw only "both arms exit 1" could mistake it for a result. The
  control arm is what exposed it. The probe must be re-run IN PLACE in a
  worktree of that branch.
- **Whether the sibling shares the defect is therefore UNKNOWN from this
  document.** It is likely, since the M3-P6 review already recorded F-B3
  against it and the functions appear to be near-duplicates, but likely is not
  measured and this document does not assert it.
- **No other multiplicity case was probed.** Duplication is one way for two
  line sequences to have equal sets and unequal text; a line appearing three
  times against two, or two different lines swapping counts, are others. Only
  the single duplicate was constructed.
- **Nothing here is a fix, and no fix is proposed.** The remedy is a change to
  a script on `main`, which is a change like any other and owes its own branch,
  witness and review. It is NOT folded into M3-P6, whose scope does not include
  it.

## Disposition

Recorded as a finding against `main`, unowned, LOW. It does not block M3-P6 and
it does not block the exit-test harness fix. It is written down so the
carried-forward note stops being a claim nobody has executed, which is the
state it was in when this check started.
