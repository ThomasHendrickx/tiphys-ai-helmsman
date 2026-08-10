# R-094's CI half: measured, and CLAUDE.md's remedy is wrong

- date: 2026-08-10
- author: the orchestrator
- status: NOT dispatched. Scoped, and the scope is roughly four times what the
  rules file says. The hazard is GUARDED, so the urgency is low.

## Why this was measured now

M3-P3 is stopped waiting on the owner, so this was the first window in the
milestone with no phase round in flight. The item had been deferred three times
with the same reason each time (changing shared harness mid-round is risky), and
an indefinite wait removes that reason. Before dispatching it, the gap was
measured rather than taken from CLAUDE.md's description of it. That was the
right order, because the description is wrong.

## What is actually true

CLAUDE.md says the CI half of R-094 is not delivered, that
`scripts/m2-exit-test.sh` invokes the runner with `--manifest` on both arms, and
that "`--registry` occurs nowhere in it or in the workflow". **All of that is
confirmed.** `--registry` appears nowhere in the harness, and the only
occurrences in `.github/workflows/gates.yml` are a comment and a step NAME.

Measured divergence between the two files:

```
manifest gates: 11
registry gates: 14
IN REGISTRY BUT NOT MANIFEST: agent-rules-drift,
                              unit-tests-for-changed-service-methods,
                              fixtures-for-changed-component-states
IN MANIFEST BUT NOT REGISTRY: (none)
```

Two of those three are `verified-by: clean-room-checklist`, which the runner
declares and deliberately does not execute; the runner says so on every run. So
the real divergence is ONE gate, `agent-rules-drift`, and it does run in CI, via
a direct workflow step with no `if:`, on both events. It was observed running and
passing on this session's `CLAUDE.md` edits.

**So no gate is silently not running today.**

## The hazard is GUARDED, and the guard is good

CLAUDE.md claims `test/gate-registry.test.ts` asserts the divergence in both
directions so that a new registry-only script gate reddens rather than silently
not running. **That claim is TRUE**, and it was checked rather than believed.

The test filters the registry to `verified-by: script` gates absent from the
manifest and asserts the result equals an allowlist, `REGISTRY_ONLY_SCRIPT_GATES`,
which carries a recorded REASON per entry. A new registry-only script gate is not
in that allowlist, so the assertion fails. The test also pins the covering
workflow step and asserts it has no `if:`, so it cannot silently become
single-arm, which is T-009's shape.

## THE FINDING: the remedy CLAUDE.md states would go RED

CLAUDE.md says: "Closing it is an edit to `scripts/m2-exit-test.sh`".

An implementer who did exactly that would redden the suite, because the same test
PINS THE CURRENT STATE AND THE PROSE THAT DESCRIBES IT:

```
assert.equal(harness.includes("--registry"), false,
  "scripts/m2-exit-test.sh now uses --registry");
assert.equal(workflow.includes("gates run --registry"), false,
  ".github/workflows/gates.yml now makes a registry run");
assert.ok(harness.includes("--manifest \"${MANIFEST}\""),
  "the harness no longer passes --manifest");
```

Its own comment explains why: both `gate-registry.yaml`'s header and CLAUDE.md's
gate section state IN THE PRESENT TENSE that CI reads the manifest and not the
registry, and "a document asserting a present-tense fact that nothing checks is
tuition T-006".

So the guard is deliberate and correct, and the rules file's one-line remedy is
incomplete. The real change is coordinated across at least five places:

1. `scripts/m2-exit-test.sh`, to pass `--registry` and to carry an expectation
   row for every gate that becomes newly-run.
2. `.github/workflows/gates.yml`, on BOTH event arms.
3. `test/gate-registry.test.ts`, inverting the three pins above and emptying or
   re-justifying `REGISTRY_ONLY_SCRIPT_GATES`.
4. `gate-registry.yaml`'s header prose.
5. CLAUDE.md's gate section prose, which the same test reads.

Plus the newly-run gates' expectation rows, since `agent-rules-drift` entering
the manifest is what the allowlist's own recorded reason says it needs.

**This is a fix round under CLAUDE.md's own rule that an orchestrator-side change
to shared harness code owes the full fix-round contract, and it is a source
change, so DR-0012 requires two clean-room reviews.** It is not a one-line edit
and should never have been carried as one.

## Recommendation

**Do not dispatch it now, and not because of the phase stop.** Two reasons:

- The hazard is guarded. Nothing silently fails today, and a new registry-only
  script gate reddens. The value of closing it is tidiness plus removing a
  standing divergence, not risk reduction.
- It touches the harness that gates every other phase, and M3-P4 through M3-P10
  have not run yet. Changing the thing that measures everything, immediately
  before seven phases use it, buys tidiness at the cost of blast radius.

The natural home is a phase whose declaration already covers the harness, or a
deliberate harness round between milestones. Recorded here so the next session
inherits the real scope rather than the one-line version.

## Correction owed to CLAUDE.md

Its gate section should say the remedy is a coordinated five-file change with two
reviews, not an edit to one script, and should note that the pinning test will
redden until the prose is updated with it. That edit is not made here because
CLAUDE.md's own text is read by `test/gate-registry.test.ts`, so changing it is
part of the same coordinated change rather than a free correction. Recording the
inaccuracy without being able to fix it in isolation is the honest position, and
is why this document exists rather than a one-line commit.

## What this did NOT measure

- Whether the expectation rows in `scripts/m2-exit-test.sh` would need more than
  a mechanical addition for the newly-run gates. Not opened.
- Whether any gate behaves differently under `--registry` than under
  `--manifest` beyond which set is selected. The runner takes both paths, but no
  differential run was made.
- The two `clean-room-checklist` gates are assumed to stay non-executed. That is
  what the runner prints, and it was not tested against a modified registry.
