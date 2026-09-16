# My harness fix reddened another phase's checker, and neither branch's CI could
# see it

Measured 2026-09-16, in the local union of M4-P23 with `main` after the
harness-and-measurements pull request landed.

## What happened

M4-P23 ships `scripts/check-retirement-inventory.mjs`, which derives rule
anchors from three roots and requires every anchor to have a row in a 280-row
inventory. One of those roots is `.claude/orchestrator-next.mjs`.

The harness pull request rewrote part of that file: it added `gitTry`,
`gitCount`, `branchNames`, `hardErrors`, `WORKTREES`, `unreplicated`, `watched`
and two more top-level declarations, and it REMOVED the `SCRATCH` constant.

Each addition is a new anchor with no row. The removal leaves a row pointing at
nothing. The union reports:

    retirement-inventory: 280 row(s) against 288 derived rule anchor(s)
    UNRESOLVED next-script:scratch: no rule with this id is extractable
    UNRESOLVED next-script:gittry: rule at .claude/orchestrator-next.mjs:144 has NO row
    ... 10 unresolved item(s)

Three tests in `test/retirement-inventory.test.ts` fail on it.

## Neither branch was wrong, and neither branch's CI could have caught it

The harness branch was green: it does not contain the checker. M4-P23 was green:
it does not contain the harness change. The defect exists only in the union, and
it appeared the first time the two were put together.

That is precisely the case DR-0031 records: "Merging `main` in locally and
running the union is not a weaker substitute: it is what found two failures in
M3-P6 that neither branch's CI could see." It has now found a third.

**The local union test is the only thing that caught this**, and it caught it
before a pull request existed, which is the whole point of running it first.

## The finding that outlives the fix

The immediate repair is small and belongs to M4-P23: add nine rows, retarget or
retire one. Its inventory JSON is already on its declaration.

The finding is larger. **The inventory couples every future change to those
three roots to an inventory update.** A checker that requires an exhaustive row
set over files that are still being edited is a serialisation point of the same
kind as `src/cli.ts`: not a defect, because a trip wire that reddens when the
catalogue goes stale is exactly what a retirement inventory is for, but a cost
that should be named rather than rediscovered by whoever next edits
`.claude/orchestrator-next.mjs`, `AGENTS.md` or `CLAUDE.md`.

Worth deciding, by whoever owns M4-P23: whether the inventory's anchor
extraction should treat a harness script's function declarations as rules at
all. Nine of the ten unresolved items are ordinary JavaScript functions in a
file that is not a kernel deliverable and not shipped in the package.

## What this does NOT establish

It does not say the checker is wrong. It says the catalogue went stale, which is
the checker working. Nothing here measures how often those three roots change,
so "serialisation point" is an inference from one instance rather than a
measured rate. And the fourth failure in the same run, in
`test/coverage-gate.test.ts`, is the separate and already-recorded wall-clock
budget at src/gates/coverage.ts:235; it is not part of this.
