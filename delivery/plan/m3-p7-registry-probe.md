# M3-P7 pre-dispatch: no registry over-assertion, established by execution

- date: 2026-08-12
- author: orchestrator
- purpose: binding convention 5 says a test over an append-only registry asserts
  BY NAME and never BY COUNT, and that **a phase which extends such a registry
  may have to edit the TEST that over-asserts on it, so that test belongs on the
  phase's declaration.** M3-P7 extends two of them. This settles, before
  dispatch, whether its declaration needs a test added to it.
- answer: **NO. M3-P7's declaration needs no amendment on this account.**
- measured at: `origin/main` bb8f656, node v26.6.0, `dist/` built.

## Why this was run at all, and why a grep was not enough

The M3-P6 pre-dispatch check MISSED the registry-to-`CLAUDE.md` coupling, and
the lesson written against the orchestrator at the time was that **a probe list
chosen by reasoning is a screen, and a screen's misses are found by execution**
(delivery/plan/m3-registry-implies-claude-md.md:66).

A grep was run first and came back clean, and it is recorded here as
INSUFFICIENT rather than as the answer: no test pins a count over the clause
map, and test/checks.test.ts:425 carries M3-P2's comment recording that the old
`Object.keys(map).length === 12` assertion was replaced with a by-name check
because it "is a property of the registry on the day M3-P1 merged and of no day
after it".

That is the same shape of evidence that failed for M3-P6. So it was executed.

## The control arm, which is what makes the rest mean anything

```
NODE v26.6.0  HEAD bb8f656
BUILD_EXIT=0
=== CONTROL: unmutated, npm test ===
tests 590
pass 590
fail 0
skipped 0
CONTROL_EXIT=0
```

Complete sentence, all three axes: node v26.6.0, `dist/` BUILT, invocation
`npm test`, 590 tests, 590 pass, **0 skipped**.

## Mutation 1, which was INVALID, and is recorded because it nearly became a finding

Appended `R-999` to the clause map and one fabricated row to
`test/behaviors.json`. Four clause-map tests reddened, `MUTATION_EXIT=1`.

**That is not an over-assertion.** One of the four failing tests is named
"a map entry naming a row absent from the inventory makes the check red naming
the invented row". `R-999` is invented, so the check did exactly what it exists
to do. **The mutation was not a member of the class under test**, which is the
wrong-scope trap wearing a different hat: a red from a mutation that could never
be legitimate says nothing about a mutation that could.

Reporting this as a finding would have cost a declaration amendment nobody
needs. It was caught by reading the failing test NAMES, which the first capture
attempt failed to produce because the grep pattern did not match this reporter's
output format.

## Mutation 2, faithful: two real, in-inventory, currently-unmapped M3-P7 ids

Derived rather than chosen: all thirteen requirement ids M3-P7's declaration
cites are currently absent from the clause map, so appending rows for them is
exactly what the phase will do.

```
M3-P7 cites 13 requirement ids
  already in the clause map: []
  NOT yet mapped (these are what M3-P7 will append): ["R-026b","R-027","R-028a",
    "R-050b","R-053","R-054","R-055","R-056a","R-057b","R-059","R-060","R-066","R-093"]
clause map currently has 34 rows
```

Appended `R-026b` and `R-053` with phase `M3-P7`. All four clause-map tests
reddened again, and the gate said why:

```
CLAUSE-MAP R-026b names artifact checklists/clean-room.yaml, which does not exist
CLAUSE-MAP R-053 names artifact schemas/checklist.schema.json, which does not exist
clause-map: red (36 clause-map rows checked)
```

**Also not an over-assertion.** The rows name artifacts M3-P7 has not created
yet, and M3-P7 adds them in the SAME commit as the rows. The mutation is
premature rather than representative.

## The finding, stated as what was actually observed

**The gate's row count is DERIVED, not pinned: 34 rows before, 36 after.** That
is the property convention 5 asks for, observed at run time rather than inferred
from a comment claiming it.

Both mutations reddened for a NAMED cause, and neither cause was a count or an
exact-set assertion. So the negative result is a derived negative rather than an
empty result from a search that was looking in the wrong place.

## What this does NOT cover

- **`test/behaviors.json` was not tested faithfully.** Mutation 1's fabricated
  behaviour row was invalid for the same reason `R-999` was, and mutation 2
  dropped it. A faithful behaviours mutation needs a row naming a test that
  actually exists, and that was not run. The by-name rule for that registry
  rests on the same convention-5 reading and on the grep, not on execution.
- **It does not test `witness/` or `package.json`**, the other two shared paths
  in the M3-P6 x M3-P7 intersection. Both are add-a-file or union-shaped and
  neither has a plausible count assertion, which is REASONING and is exactly the
  screen this document is otherwise arguing against.
- **It says nothing about M3-P8 or M3-P9**, whose declarations cite different
  requirement ids and different artifacts.
- **It was run at `bb8f656`, not at the head M3-P7 will branch from.** If
  M3-P6's merge changes the clause map or the tests over it, this is stale and
  the cheap re-check is the same two mutations.
