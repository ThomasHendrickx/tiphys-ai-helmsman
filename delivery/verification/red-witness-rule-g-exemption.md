# The two-member rule is enforced on a strict subset of what it is written as

- date: 2026-08-09
- raised by: the orchestrator, while settling an unexplained gate result during
  M3-P3 fix round 2; measured further by the independent delta verifier
- owner: the orchestrator, NOT M3-P3. `src/witness/run.ts` is on M2-P2's
  declaration, so nothing here is edited by the phase that found it.
- status: OPEN, tracked. No code change is made by this document.

## How it surfaced

M3-P3's fix round 2 reported that the red-witness gate came back RED on rule (g),
a single-member collapse, for a witness spec the implementer believed had carried
the same collision since round 1, when the gate reported GREEN. It said it could
not explain the discrepancy from the evidence it had kept, rather than inventing
a reason. That sentence is what made the rest of this possible.

The orchestrator re-ran the gate at the round-1 head:

```
$ node src/gates/red-witness.ts --base 45722e3 --head dd4e906 ...
red-witness: green (23 witness(es) evaluated (10 own, 13 stored re-evaluated);
every witness red against every declared dangerous state and green at head)
EXIT = 0
```

Round 1's green was real. The gate did not fail.

## Why both results were correct

src/witness/run.ts:1291:

```
const needsClassRules = spec.class === "classification" || derivation.textAsserting;
```

The same-`find` collision check lives inside that branch, at src/witness/run.ts:1307.
`witness/checks-enum-compared-element-wise.json` is `class: "additive"` in BOTH
rounds, so rule (g) was never reached for it in round 1. The delta verifier took
this one step further and pinned the line that changed the outcome:
`test/assurance-modes.test.ts:1597` added a `record.includes(word)` assertion
(deliberately quoted, not cited: that file exists only on M3-P3's unmerged
branch and does not resolve from this tree),
and `deriveTextAssertions` scopes over the WHOLE FILE containing a spec's named
tests rather than the named test's own body, so a `textAsserting` flag flipped
file-wide and rule (g) became reachable.

Two correct gate results, one changed input. No defect in the gate.

## The finding

**CLAUDE.md states the rule with no qualification:**

> A witness for a CLASS must redden under at least TWO structurally different
> members.

**The gate enforces it only for `classification` or text-asserting specs.** An
`additive`, non-text-asserting spec may declare two members that collapse to one
and the gate stays green. The written rule is therefore broader than the enforced
rule, and every agent in this repository is told the broad form.

This is the same family as the four instances already recorded here (T-008's
watchdog testing existence rather than freshness; M3-P1's vendored-suite guard
asserting a file exists; `clause-map` discharging a clause on a substring
occurrence; the control-character grep that could not see NUL). It differs from
all four in one respect worth stating: the guard is not WRONG, it is NARROWER
than its own statement. Nothing it reports is false. What is false is the belief
an agent forms from reading CLAUDE.md and then seeing the gate go green.

## Measured extent

By the delta verifier, over all 43 specs:

- **22 of 43 are exempt** from the two-member rule at the gate.
- **4 of those are single-member.**
- **2 of those 4 have no good excuse** for staying single-member.

So the gap is not theoretical, and it is also not large. Two specs.

## What is NOT established

- Whether the exemption is DEFENSIBLE has not been settled. There is a real
  argument that an `additive` witness, which asserts a behaviour was added rather
  than classifying inputs, needs only one member to be meaningful, and that
  "class" in the CLAUDE.md sentence means the classification case specifically.
  If that argument holds, the fix is to the SENTENCE, not to the gate.
- The two specs without an excuse have not been individually assessed for
  whether their single member is actually sufficient.
- No count here is re-derived by the orchestrator; all four numbers are the delta
  verifier's, published in `delivery/review/verification-m3-p3-fix-rounds.md`.
  They are reported as its measurement, not as an independent one.

## Why it is not being fixed now

`src/witness/run.ts` belongs to M2-P2 and `CLAUDE.md` is the agent-rules file.
Either fix is an orchestrator-side change to shared harness code, which under the
T-009 corollary owes the full fix-round contract, and the correct fix depends on
which of the two readings above is right. Deciding that on the way past, inside
another phase's round, is exactly how PR #27 fixed one arm and left its sibling
twelve lines away.

Recorded in `delivery/STATE.md` as a tracked obligation.
