# Arbitration: M3-P1 dual clean-room review

- date: 2026-08-08
- phase: M3-P1 (schema foundation, Ajv validator, status line, clause map)
- head reviewed: `3979557`, PR #39
- reports: `clean-room-m3-p1-criteria.md` (Opus family, 601 lines),
  `clean-room-m3-p1-hazard.md` (Sonnet family, 748 lines)
- verdict of both: CHANGES REQUIRED
- combined: 13 findings, 7 high, 3 medium, 3 low

## Disagreements to arbitrate: NONE

The two reports do not conflict on any finding. They were given deliberately
different contracts and the result is complementary: the criteria reviewer
walked and executed every acceptance criterion, the hazard reviewer attacked
the places the criteria do not describe. Two findings overlap (both reviewers
independently found the `suite` and `red-witness` gates red), and that
agreement is the strongest signal in the round.

So this document does the other half of an arbitration's job: it groups 13
findings into the MECHANISMS behind them, per the fix-round contract, and
assigns each to the party that owns it.

## What the reviewers CONFIRMED, recorded because it is load-bearing

Both reviewers attacked these and both found them sound. This matters more than
usual, because M3-P1 is the contract nine later phases are written against.

- **The step-1 HALT checks hold.** M2's validator emits
  `INVALID <json-pointer> <message>` with deterministic ordering, and M2's
  TESTS assert that contract rather than engine wording. Confirmed by both.
- **The engine retirement is a real swap, not a rewrite of M2's tests.**
  `git diff --stat origin/main -- test/gates.test.ts` is EMPTY and M2's 42
  tests pass through Ajv. This was the phase's single largest risk and it is
  discharged.
- **Every DR-0013 Ajv policy verified keyword by keyword against the decision**,
  each falsified by mutation. No input mutation across four kinds, checked with
  an independent deep-equal probe. Deterministic ordering: one distinct
  ordering in ten runs.
- **All four schemas close `additionalProperties` at all 22 nested levels.**
- Real `mkfifo` refusals (D-M3-27), `$ref` handling, and vacuous-green
  protection held under direct attack.
- The criteria reviewer additionally DISCHARGED DR-0013 criterion 13's scratch
  install, which the phase had left deferred. It passes.

## Mechanism 1: a registration written as a paraphrase instead of the literal

**Findings: A-005 (high), and the round the orchestrator had already sent.**

35 of the phase's 46 behavior registrations do not resolve. Every value in
`test/behaviors.json` was written as a PARAPHRASE of what the test does rather
than the literal `test("...")` string. Example, confirmed:

```
registry: "each shipped example validates under its named type and exits 0"
test:     "each shipped example validates under its named type and under --type auto"
```

`npm test` cannot catch this; only `src/gates/suite.ts` does, which is why the
suite passed 446/446 while criterion 1 failed.

**Ruling: ACCEPTED, fix at the mechanism.** Reconcile ALL 35 by a command whose
output is published, never by eye. Where the registry name and the test name
describe DIFFERENT claims ("exits 0" is not "under `--type auto`"), the
divergence is itself the finding: decide which is right and say why, because a
registry that documents a behavior nobody tests is worse than an empty one.

## Mechanism 2: a witness member that lands where no named test executes

**Findings: A-006 (high), and the round already sent.**

8 of 13 new witness specs carry a member reporting "no named test reaches this
arm". The mutation lands on a line the named test never executes, so the test
stays green against the dangerous state and guards nothing. This is the
red-witness rule working exactly as designed, and it is the T-003 shape: a
witness that is green, registered and worthless.

**Ruling: ACCEPTED.** For each, either point the member at a line the named test
actually reaches, or extend the test to reach the arm. **Weakening a member to
something trivially reachable is forbidden** and will be treated as a finding in
the next round.

## Mechanism 3: a guard whose condition does not test the property that matters

**Findings: A-001 (high), A-004 (high), B-006 (high).**

Three instances, one mechanism, and it is the mechanism this repository has
already paid for twice (T-008's own postscript: the first watchdog tested
whether a file EXISTED).

- **A-001.** The vendored JSON Schema Test Suite executes ZERO cases for 7 of
  16 declared keywords (`additionalProperties`, `contains`, `minItems`,
  `minLength`, `properties`, `required`, `uniqueItems`), because the skip
  predicate drops any group whose schema lacks a sibling `type` under Ajv
  `strictTypes`. The guard meant to catch this asserts only that a FILE EXISTS.
  So the phase's headline external-conformance evidence covers less than half
  the vocabulary it claims, and nothing said so.
- **A-004.** Criterion 12's second direction does not hold: deleting the step-8b
  handler leaves both named invocations byte-identical, because both are caught
  inside `cmdValidate` and never reach `bin/tiphys.ts`. The reviewer found the
  missing witness rather than only reporting the gap: `tiphys status show`
  outside a fleet home produces 7 stack frames without the handler and 0 with
  it.
- **B-006.** `scripts/m2-exit-test.sh`'s PR and main expectation tables have no
  `clause-map` row, so a red clause-map produces ZERO findings in the assertion
  while a different red gate in the same run correctly produces one. Verified
  end to end. M3's only per-phase orphan check is currently unenforced by CI.

**Ruling: ALL THREE ACCEPTED.** A-001 and A-004 are the phase's. **B-006 is NOT
the phase's**: `scripts/m2-exit-test.sh` is not on M3-P1's declaration, so
fixing it there would be a scope violation. It is an orchestrator-side harness
fix and owes the full fix-round contract, per the T-009 corollary.

## Mechanism 4: the projection widens the scope the auditor is meant to bound

**Finding: B-001 (high).**

`src/plan.ts`'s `stripGloss` truncates a `files-to-touch` entry at its FIRST
`(`, not at a trailing human gloss. Reproduced directly by the orchestrator:

```
"src/app/(marketing)/page.tsx"  ->  "src/app/"
"src/(lib)/util.ts"             ->  "src/"
"src/cli.ts (edit)"             ->  "src/cli.ts"      (the intended case)
```

`src/gates/scope.ts:477` treats a trailing slash as a DIRECTORY PREFIX GRANT.
So a single declared file silently becomes an entire tree, in the projection
that feeds the gate whose entire purpose is preventing scope widening. The
second case is worse than the reviewer's own example: it grants all of `src/`.

**Ruling: ACCEPTED, high.** Strip only a TRAILING parenthetical, and only when
what precedes it is a plausible path. Red-witness it with at least two
structurally different members, one of which must be a path containing a
legitimate interior `(`.

## Mechanism 5: a contract boundary that leaks on the arm nobody tested

**Finding: B-002 (high).**

`src/validate.ts` prints raw Ajv exception text on the schema-COMPILATION
failure path, including wording the suite's own forbidden-phrase list names.
The leak-freedom test covers only the runtime-validation path, while criteria
4, 5 and 7 all route through compilation. DR-0013 clause 6's "boundary
preserved" would be false at the moment it was acted on.

**Ruling: ACCEPTED.** Route compilation failures through the same diagnostic
contract, and extend the leak-freedom assertion to BOTH arms. This is T-009's
shape one layer down: one witnessed arm and one unwitnessed arm, and the
unwitnessed one is the one that broke.

## Mechanism 6: a test file that cannot be reviewed

**Finding: A-medium, raised here to HIGH by the orchestrator.**

`test/status.test.ts` contains raw NUL and SOH bytes, so git classifies it as
binary. Confirmed:

```
$ git diff --stat origin/main -- test/status.test.ts
 test/status.test.ts | Bin 0 -> 9332 bytes
 1 file changed, 0 insertions(+), 0 deletions(-)
```

**The file has no reviewable diff at all.** Both reviewers read the working
copy, but no PR reviewer and no future `git log -p` reader can see what
changed. It also violates binding convention 3 (ASCII only), which the phase's
own criterion 13 was supposed to enforce and which the ASCII check reported as
failing only on vendored fixtures.

**Ruling: ACCEPTED and RAISED to high.** The reviewer graded it medium as a
hygiene issue; the orchestrator grades it high because it defeats the review
contract itself, and because it means criterion 13's deviation report was
incomplete: it named the vendored suite files and not this one. Control
characters that a test genuinely needs as DATA belong in escapes (a backslash-x-zero-zero sequence),
never as literal bytes in the source.

## Remaining findings, accepted as written

- **B-003 (medium).** Duplicate `acceptance[].id` values let
  `hazard-classes[].addressed-by` resolve to an unrelated decoy criterion,
  defeating T-007's completeness guarantee one level inside the mechanism built
  to enforce it. Uniqueness must be enforced by the schema or by a derived
  check.
- **A-medium.** `PROVENANCE.md` contradicts what was actually vendored.
- **B-low.** A stale `PROVENANCE.md` claim about `uniqueItems` (same document as
  above; fix together).
- **B-low.** A dead `--evidence` flag on `check-clause-map.mjs`.

## Assignment

| Owner | Findings |
|---|---|
| the M3-P1 implementer, fix round | mechanisms 1, 2, 4, 5, 6; A-001, A-004; B-003; both PROVENANCE items; the dead flag |
| the orchestrator | B-006 only (`scripts/m2-exit-test.sh` is not on the phase's declaration) |

## Stopping rule

DR-0012's limit is more than two fix rounds after the first dual review, or a
high-severity finding recurring in the same component across rounds. This is
round one after the first dual review. The limit has NOT fired. If the next
round does not come back clean, DR-0016 applies: a fresh implementer plus a
third review contract is dispatched immediately and the owner is notified
asynchronously, rather than the phase waiting on the owner.

## What this round did NOT cover

- Neither reviewer executed the phase against a REAL consuming project; both
  worked in the kernel repository. The schemas' fitness for an actual charter
  is unproven and cannot be proven before M4's pilot.
- The criteria reviewer's mutation testing covered ten source mutations, nine of
  which reddened the named test. It is a sample, not an exhaustive pass.
- Neither reviewer audited the vendored JSON Schema Test Suite fixtures for
  fidelity to upstream beyond the recorded revision.
