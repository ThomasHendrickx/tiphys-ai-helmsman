# Clean-room review: M3-P3, CRITERIA lens

Head: 7b3afbf0f6f6baf458f2adf4e555fbf1232a33be
Reviewer: criteria-lens clean-room (independent of the hazard lens).
Started: 2026-08-09T05:34:54Z

Status: COMPLETE. Verdict: CHANGES REQUIRED (2 high, 4 low). Written
incrementally as work proceeded (T-008 beacon).

## Preflight (re-taken)

```
$ node --version
v26.6.0
$ npm ci            -> exit 0
$ npm run build     -> exit 0
$ git status --porcelain   # after build
?? delivery/review/clean-room-m3-p3-criteria.md      (this report only)
```

## Criterion 1 (re-taken)

```
$ node bin/tiphys.ts validate --type assurance-modes assurance-modes.yaml
SKIPPED charter-mode-enum-matches-modes no context
SKIPPED mode-gate-sets-resolve no context
exit=1
$ node bin/tiphys.ts validate --type assurance-modes --context . assurance-modes.yaml
exit=0
$ node bin/tiphys.ts validate --type role-model-config role-model-config.yaml
exit=0
$ node bin/tiphys.ts validate --type auto --context . assurance-modes.yaml
exit=0
$ node bin/tiphys.ts validate --type auto role-model-config.yaml
exit=0
```

Reproduced exactly as the work history reports. Ruling on the discrepancy is
below (finding CR-001).

## Criterion 2 (re-taken)

`--mode full` prints twelve stage ids in the order step 2 enumerates (intake,
verification-pass, plan, adversarial-plan-review, implement, clean-room-review,
fix-round, fix-round-verification, merge-on-green, deploy-verify,
migration-verify, final-report), exit 0. `--mode direct-pr` exit 0 with a
seven-entry skips list; `--mode local-only` exit 0 with a ten-entry skips list.
`--mode yolo` exits 1 naming the three declared ids. MET.

One capture discrepancy, low: the work history's `--mode full` block shows a
bare `skips:` line; the real output prints `skips:` followed by `  (none)`. The
elision is cosmetic and does not change the criterion.

## Criterion 3, all four sub-cases (re-taken with MY OWN fixtures)

Every fixture below is `assurance-modes.yaml` with exactly one thing changed;
the `diff` against the shipped file is shown for each, so no fixture is taken
on the implementer's word.

### 3(a) undeclared downgrade, TWO structurally different members

```
$ diff assurance-modes.yaml crfix/3a-1.yaml      # direct-pr's whole skips list emptied
160,167c160
<     skips:
<       - verification-pass
...
>     skips: []
$ node bin/tiphys.ts validate --type assurance-modes --context . crfix/3a-1.yaml
INVALID #/modes/1/skips mode direct-pr omits stage adversarial-plan-review, ... (check: mode-no-undeclared-downgrade)
INVALID #/modes/1/skips mode direct-pr omits stage clean-room-review, which mode full runs, and does not declare it in skips (check: mode-no-undeclared-downgrade)
[5 more mode-no-undeclared-downgrade lines]
INVALID #/modes/1/skips mode direct-pr runs implement without adversarial-plan-review and does not declare that stage in skips (R-024) (check: mode-stage-order)
exit=1

$ diff assurance-modes.yaml crfix/3a-2.yaml      # ONE entry removed from direct-pr's skips
163d162
<       - clean-room-review
$ node bin/tiphys.ts validate --type assurance-modes --context . crfix/3a-2.yaml
INVALID #/modes/1/skips mode direct-pr omits stage clean-room-review, which mode full runs, and does not declare it in skips (check: mode-no-undeclared-downgrade)
exit=1
```

MET. Exit 1, pointer names the offending field, `(check: ...)` present, two
members that are structurally different (declare nothing vs declare
almost-everything). The one-line member is the important one: it shows the
check is a set difference and not a blanket rejection.

### 3(b) build before review, TWO members

```
$ diff assurance-modes.yaml crfix/3b-1.yaml      # implement and the review swapped inside full
62d61
<       - adversarial-plan-review
63a63
>       - adversarial-plan-review
$ node bin/tiphys.ts validate --type assurance-modes --context . crfix/3b-1.yaml
INVALID #/modes/0/pipeline mode full places implement at position 3 and adversarial-plan-review at position 4, so building starts before the review (R-024) (check: mode-stage-order)
exit=1

$ diff assurance-modes.yaml crfix/3b-2.yaml      # review dropped from direct-pr's skips (already absent from its pipeline)
162d161
<       - adversarial-plan-review
$ node bin/tiphys.ts validate --type assurance-modes --context . crfix/3b-2.yaml
INVALID #/modes/1/skips mode direct-pr omits stage adversarial-plan-review, ... (check: mode-no-undeclared-downgrade)
INVALID #/modes/1/skips mode direct-pr runs implement without adversarial-plan-review and does not declare that stage in skips (R-024) (check: mode-stage-order)
exit=1
```

MET, two members: the REORDER arm and the DELETE arm reach the same state by
different routes and different code paths inside `modeStageOrder`.

### 3(c) full without fix-round-verification, Kind A

```
$ diff assurance-modes.yaml crfix/3c.yaml
70d69
<       - fix-round-verification
$ node bin/tiphys.ts validate --type assurance-modes --context . crfix/3c.yaml
INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here
INVALID #/modes/0/pipeline array contains no item matching the required shape, and 1 is required
exit=1
```

MET on exit code and on the pointer. LOW residue recorded as CR-005: the
diagnostic names the FIELD (`#/modes/0/pipeline`) but not the required VALUE,
so an author reading it is not told that `fix-round-verification` is the stage
that is missing. That is a property of the generic `contains` renderer in
`src/validate.ts`, not of this phase, and this phase is the first instance to
surface it.

### 3(d) unresolvable gate set, TWO members, run with --context

```
$ diff assurance-modes.yaml crfix/3d-1.yaml      # a gate id in no registry
92a93
>       - performance-budget
$ node bin/tiphys.ts validate --type assurance-modes --context . crfix/3d-1.yaml
INVALID #/modes/0/gate-sets/14 gate set performance-budget is not declared in gate-registry.yaml (check: mode-gate-sets-resolve)
exit=1

$ diff assurance-modes.yaml crfix/3d-2.yaml      # a REAL gate whose own modes list excludes local-only
214a215
>       - red-witness
$ node bin/tiphys.ts validate --type assurance-modes --context . crfix/3d-2.yaml
INVALID #/modes/2/gate-sets/4 gate set red-witness is declared in gate-registry.yaml and its modes list does not name local-only, so it never runs in this mode (check: mode-gate-sets-resolve)
exit=1
```

MET, and the second member is the one that matters: it is a reference that
RESOLVES and still buys no assurance, which is the hazard as the plan words it.
The `SKIPPED ... no context` half is re-taken under criterion 1 above.

## Criterion 4 (re-taken, and walked further than the work history walked it)

```
$ node bin/tiphys.ts validate --type charter <template with delivery-mode: yolo>
INVALID #/delivery-mode value "yolo" is not one of the permitted values "full", "direct-pr", "local-only"
exit=1
$ node bin/tiphys.ts validate --type charter templates/charter.example.yaml
exit=0
$ node -e '... schemas/charter.schema.json'
delivery-mode: ["full","direct-pr","local-only"]
assurance-tier: ["full","direct-pr","local-only"]
```

First half MET, both directions.

For the DRIFT half I built an isolated sandbox (copy of src/, bin/, schemas/,
gate-registry.yaml, assurance-modes.yaml) so the worktree was never edited, and
walked every arm rather than the two the work history reports:

```
arm 0 CONTROL shipped documents unedited                                  exit=0
arm 1 fourth mode id in the yaml, nothing else changed                    exit=1
      INVALID #/modes/3/id value "shadow" is not one of the permitted values ...
arm 2 fourth mode + assurance-modes schema id enum widened, charter NOT   exit=1
      INVALID #/modes ... declares mode ids [direct-pr, full, local-only, shadow]
        and the assurance-tier enum in <sandbox>/schemas/charter.schema.json is
        [direct-pr, full, local-only]; the two must be equal (check: charter-mode-enum-matches-modes)
      INVALID #/modes ... the delivery-mode enum ... (check: charter-mode-enum-matches-modes)
arm 3 fourth mode + BOTH enums widened                                    exit=1
      INVALID #/modes/3/gate-sets/0 gate set suite ... its modes list does not
        name shadow ... (check: mode-gate-sets-resolve)
arm 6 + gate-registry.yaml's suite gate modes list widened                exit=0
```

Verdict: MET in substance. The check fires in BOTH directions, names BOTH files
and BOTH charter fields, and the removed-mode direction is reachable with no
schema edit at all. Two things the work history does not say, recorded because
a later reader will hit them (CR-006, low): the criterion's literal green arm
("updating the enum returns exit 0") needs FOUR coordinated edits, not one, and
a fifth (`schemas/gate-registry.schema.json`'s own `modes` item enum) before
`gate-registry.yaml` itself validates again. `charter-mode-enum-matches-modes`
guards exactly one of those four couplings; the registry copy is bound by
`test/gate-registry.test.ts` per the schema's own `$comment`.

## Criteria 4b, 4c, 4d (re-taken: EIGHT arms, each defanged independently)

Sandbox as above. For each dangerous instance: RED with the shipped schema,
DEFANGED by deleting exactly the one keyword the plan names, RESTORED. A
witness is VALID only if red -> green -> red.

| Arm | Dangerous instance | Defang | RED | DEFANGED | RESTORED |
|---|---|---|---|---|---|
| 4b-1 | `conditions: []` under delegated authority | `minItems` on conditions | exit 1 | exit 0 | exit 1 |
| 4b-2 | `granted-by` removed | drop from `required` | exit 1 | exit 0 | exit 1 |
| 4c-1 | `full` with no `escalation-bounds` | drop from the full rule's `required` | exit 1 | exit 0 | exit 1 |
| 4c-2 | bounds present, `on-exceeded` absent | drop from `escalationBounds.required` | exit 1 | exit 0 | exit 1 |
| 4c-3 | `on-exceeded: stop-and-wait` | remove the `onExceeded` enum | exit 1 | exit 0 | exit 1 |
| 4d-1 | one review contract | `minItems: 2` removed | exit 1 | exit 0 | exit 1 |
| 4d-2 | two contracts both `criteria` | `uniqueItems` removed | exit 1 | exit 0 | exit 1 |
| 4d-3 | `review-contracts` absent | drop from `required` | exit 1 | exit 0 | exit 1 |

All eight VALID. Every defang went green ON ITS OWN, which is the specific
property the work history claims it fixed (a duplicated keyword would have kept
rejecting and left a witness red for the wrong reason). I confirm that fix.

Shipped values, read directly out of `assurance-modes.yaml`:
`merge-authority: delegated-under-conditions`, `granted-by: DR-0012`,
`max-fix-rounds-after-review: 2`, `recurrence-of-high-in-one-component: 1`,
`on-exceeded: fresh-implementer-and-third-contract`,
`review-contracts: [criteria, hazard]`.

4b MET. 4c MET, INCLUDING the `on-exceeded` half added at revision 2, all three
of its members. 4d MET.

## Criterion 5 (re-taken)

```
$ grep -nEi "pid|kill|daemon|background" assurance-modes.yaml schemas/assurance-modes.schema.json
grep exit=1        (1 = no match)
```

MET, and MET HONESTLY, which is the half the brief asked me to judge. The
registered test (`test/assurance-modes.test.ts:999`) does two things, not one:
it asserts the scan is empty over both files, AND it asserts the scan is NOT
VACUOUS by showing each of the four tokens found in a synthetic stage line
carrying it. A scan that always returned nothing would produce the same green,
and this test would have caught that. That is the correct answer to "a guard
whose condition does not test the property that matters".

Does the phase overstate it? No. The residue is stated in FOUR places
independently: the plan's own hazard map, `assurance-modes.yaml`'s header, the
schema's `stageId` `$comment`, and the test body, each saying in substance "a
stage whose completion were liveness-detected without using any of the four
words would pass it". The work history's does-not-prove list repeats it. I find
no sentence anywhere in the phase's artifacts that claims more than a
fixed-token presence scan.

One low residue of my own, folded into CR-007: `LIVENESS_TOKENS` is built as
`["p" + "id", "ki" + "ll", "dae" + "mon", "back" + "ground"]`, so the four
tokens are invisible to a grep of the test file itself. Harmless here, and the
same invisible-to-derivation class as CR-001 one notch down.

## Criterion 4c's honesty (the concession the brief asked me to judge)

Claim under test: the escalation bound is DATA the M3-P9 brief cites, not an
enforcement engine, and nothing in M3 counts fix rounds. Does the phase claim
more?

```
$ grep -ran "escalation-bounds\|escalationBounds\|review-contracts\|reviewContracts\|role-model-config\|roleModelConfig" src/ bin/ scripts/ | grep -v "\.test\."
src/modes.ts:70:  reviewContracts?: string[];
src/modes.ts:71:  escalationBounds?: Record<string, unknown>;
src/modes.ts:132:      reviewContracts: optionalStrings(record, "review-contracts"),
src/modes.ts:133:      escalationBounds: asRecord(record["escalation-bounds"]),
src/modes.ts:170:  section("review-contracts", mode.reviewContracts);
src/modes.ts:171:  if (mode.escalationBounds !== undefined) {
src/modes.ts:172:    lines.push("escalation-bounds:");
src/modes.ts:173:    for (const key of Object.keys(mode.escalationBounds).sort()) {
src/modes.ts:174:      lines.push(`  ${key}: ${String(mode.escalationBounds[key])}`);
src/commands/validate.ts:67:  ["role-model-config", "role-model-config.schema.json"],
```

Every one of the ten sites is a DECODE or a PRINT. Nothing compares a bound to
anything, nothing counts a round, nothing classifies a component, and
`role-model-config.yaml` has no reader at all beyond the `--type` row that lets
it be validated. The phase does not claim more: the `$comment` on
`escalationBounds`, the comment at the field in `assurance-modes.yaml`, and
does-not-prove items 1 and 4 all say so in the same words. VERDICT: honest. Note
this grep needed `-a`; see CR-001 for why.

## Criterion 6 (re-taken)

```
$ node --version
v26.6.0
$ node --test
tests 489  pass 489  fail 0  cancelled 0  skipped 0  todo 0
NODE_TEST_EXIT=0
```

489 tests, zero failing, ZERO SKIPPED (the floor-gated tests run on this
toolchain). The clause map, from my own gate run below: `18 rows checked, 56
pending a phase not yet in force`, which is M3-P1's twelve plus M3-P2's three
plus this phase's three (`R-024` and `R-096` on `assurance-modes.yaml`, `R-075`
on `role-model-config.yaml`, read from the diff). Earlier mappings still
resolve. MET.

## Registrations are the LITERAL test name (the M3-P1 class)

The check `npm test` cannot perform. Sixteen behavior ids were appended; I
compared each registry VALUE against every `test("...")` literal in
`test/assurance-modes.test.ts` character for character:

```
$ node -e '<extract every test() literal; compare with test/behaviors.json>'
test() literals found: 16
exact matches: 16/16; mismatches: 0
--- test() names NOT in the added registry set ---
(none)
```

CLEAN. Sixteen for sixteen, and no test in the file is unregistered. M3-P1 had
35 of 46 fail this.

## Every witness member lands on a line a NAMED TEST executes

The M3-P1 class where eight members reddened nothing. I re-took all nine
members myself: apply the mutation exactly as `witness/*.json` declares it, then
run ONLY the named test with `--test-name-pattern` BEFORE the positional path.

```
## spec checks-charter-mode-enum-drift  behavior=charter-mode-enum-drift-detected
   BASELINE named test exit=0
   member 0 (src/checks.ts): exit=1  -> NAMED TEST WENT RED
   member 1 (src/checks.ts): exit=1  -> NAMED TEST WENT RED
## spec checks-mode-downgrade-registered  behavior=mode-undeclared-downgrade-rejected
   member 0 (src/checks.ts): exit=1  -> NAMED TEST WENT RED
   member 1 (src/checks.ts): exit=1  -> NAMED TEST WENT RED
## spec mode-show-resolves-the-named-mode  behavior=mode-show-full-stage-order
   member 0 (src/cli.ts):          exit=1  -> NAMED TEST WENT RED
   member 1 (src/commands/mode.ts):exit=1  -> NAMED TEST WENT RED
   member 2 (src/modes.ts):        exit=1  -> NAMED TEST WENT RED
## spec modes-type-registered  behavior=modes-validate
   member 0 (src/commands/validate.ts): exit=1 -> NAMED TEST WENT RED
   member 1 (src/commands/validate.ts): exit=1 -> NAMED TEST WENT RED
```

and the selection is exactly one test, not zero:

```
$ node --test --test-name-pattern '^mode show prints full.s twelve stage ids in order and a non-empty skips list for the other two modes$' test/assurance-modes.test.ts
tests 1  pass 1  fail 0  skipped 0
exit=0
```

Nine for nine. Each member's `find` string was present in the file (no
stale-mutation members) and every file was restored byte-identically
afterwards; `git checkout --` was used nowhere.

## Mutation testing of the headline features (twenty-two mutations)

M3-P2's review found that deleting its whole `--mode` filter left 470 tests
green. I applied the same treatment to this phase's headline additions: the
derived checks, `mode show`, the type-table rows, and the shipped data. Each
mutation was applied to a file restored from a byte copy afterwards, and the
verdict is the run's exit code.

Batch 1, DELETIONS (`test/assurance-modes.test.ts test/checks.test.ts test/schemas.test.ts`):

| Mutation | Result |
|---|---|
| `charterModeEnumMatchesModes` removed from the registry array | RED, caught |
| `modeGateSetsResolve` removed | RED, caught |
| `modeNoUndeclaredDowngrade` removed | RED, caught |
| `modeStageOrder` removed | RED, caught |
| the `mode` subcommand removed from `src/cli.ts` | RED, caught |
| the `assurance-modes` row removed from `TYPE_TABLE` | RED, caught |
| the `role-model-config` row removed from `TYPE_TABLE` | RED, caught |
| `full`'s `on-exceeded` flipped to `escalate-to-owner` in the shipped yaml | RED, caught |
| `full`'s two review contracts made two copies of `criteria` | RED, caught |
| a liveness word planted in `assurance-modes.yaml` | RED, caught |
| `direct-pr`'s `skips` emptied in the shipped yaml | RED, caught |

Batch 2, LOGIC mutations (the harder class: the check stays registered and lies):

| Mutation | Result |
|---|---|
| L1 `renderMode` SORTS the pipeline instead of printing declared order | RED, caught |
| L2 `renderMode` omits the `skips` section entirely | RED, caught |
| L3 `mode-no-undeclared-downgrade` narrowed to one stage id | RED, caught |
| L4 the same check returns EMPTY when the reference mode is absent | RED, caught |
| L5 `mode-gate-sets-resolve` checks EXISTENCE only, dropping the modes-list half | RED, caught |
| L6 `mode-stage-order` drops the DELETED-review arm, keeping only reordering | RED, caught |
| L7 `charter-mode-enum-matches-modes` watches `delivery-mode` only | RED, caught |
| L8 the same check watches `assurance-tier` only | RED, caught |
| L9 `mode-gate-sets-resolve` passes silently when the registry cannot be read | RED, caught |
| L10 `charter-mode-enum-matches-modes` `requiresContext` flipped to false | RED, caught |
| L11 `mode-gate-sets-resolve` `requiresContext` flipped to false | RED, caught |

**Twenty-two applied mutations, twenty-two caught, zero survivors.** L5, L6, L7,
L8 and L9 are the five I expected to survive, because each is a check that stays
registered, keeps reporting, and quietly stops covering half its rule; all five
redden. Every file was byte-identical to its backup afterwards (`cmp` on six and
three files respectively, all identical).

## Gates: the PR bundle, run by me, with the GATE PROCESS's own exit code

First attempt, in the detached review worktree, was RED and it was MY artifact,
not the phase's: a detached HEAD has no branch name, so
`scope-branch-is-a-phase-branch` was unmet and the scope gate came back
not-applicable, which m2-assert correctly rejects. Recorded here because "the
gate went red" is worthless without saying what configuration produced it
(T-009).

So I made a fresh clone, put `origin/main` at the true remote head
(`45722e3`, not the local repo's stale `main` at `c2e2009`), and checked the
branch out under its real name:

```
$ git rev-parse origin/main ; git merge-base origin/main HEAD
45722e3117f8915cd2e45659a8e267a4ae873975
45722e3117f8915cd2e45659a8e267a4ae873975
$ git rev-parse --abbrev-ref HEAD ; git rev-parse HEAD
claude/m3-p3-assurance-modes
7b3afbf0f6f6baf458f2adf4e555fbf1232a33be

$ bash scripts/m2-exit-test.sh --bundle pr --base origin/main --head HEAD --phase m3-p3 <evidence> > gates2.log 2>&1 ; echo "GATE_SCRIPT_EXIT=$?"
GATE_SCRIPT_EXIT=0
```

The exit code above is the SCRIPT PROCESS's own: the redirect is on the command
and `echo $?` is the next statement, so no pipeline status can substitute for
it. Log:

```
gates: run 0b059ad2fb0909c288237dde
gates: declared 11 applicable 7 verdict 7 green 7 red 0 not-applicable 4 error 0 vacuous 0
gates: required gate(s) not applicable: citations
m2-assert (PR bundle): OK. 11 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.
m2-green: red-witness GREEN with 4 unit(s) against M2-P2 merged diff 1b6f0963b62f^..1b6f0963b62f (real history)
m2-green: scope GREEN with 2 unit(s) against scratch repo
m2-green: citations GREEN with 1 unit(s) against scratch repo
m2-exit-test: OK.
```

Per gate, from `summary.json`:

| Gate | Status | Units | Why, where not green |
|---|---|---|---|
| `manifest-self-check` | green | 8 | |
| `coverage` | green | 115 | |
| `credential-scrub` | green | 7 | |
| `credential-token` | not-applicable | 0 | precondition `implementer-token-present-owner-action-a-3` unmet (no token in this container) |
| `suite` | green | 487 | pass 487, fail 0, skipped 0, todo 0, did-not-run 0, child node v26.6.0 |
| `citations` | not-applicable | 0 | the gate RAN and self-reported not-applicable: no changed path under the documents GLOB set (the precondition is a path PREFIX and is met by `delivery/requirements/clause-map.json`; the glob set is narrower) |
| `scope` | green | 21 | 21 paths audited against `delivery/plan/phase-declarations/m3-p3.json` at merge base 45722e3 |
| `deploy` | not-applicable | 0 | structural in any pre-merge bundle |
| `migrations` | not-applicable | 0 | structural in any pre-merge bundle |
| `clause-map` | green | 18 | 18 rows checked, 56 pending a phase not yet in force |
| `red-witness` | green | 11 | 4 own, 7 stored re-evaluated; every witness red against every declared dangerous state and green at head |

And the registry-only gate the bundle does not run (the open half of R-094),
executed directly:

```
$ node scripts/render-agent-rules-gates.mjs --check
agent-rules-drift: green (17 rendered gate rows compared)
CLAUDE.md's gate block matches gate-registry.yaml row for row (3 preflight step(s), 14 gate(s))
exit=0
```

Preflight, on the floor toolchain, in the review worktree:
`node --version` v26.6.0; `npm ci` exit 0; `npm run build` exit 0;
`git status --porcelain` after the build shows only this report file.

**Every gate is green or not-applicable for a structural reason. No gate is
red.** CR-001 below is NOT a gate failure; no gate in this repository tests for
it, which is the point of the finding.

## Rulings the brief asked for

### The criterion 1 discrepancy: THE PLAN IS WRONG

The implementer reports that criterion 1's literal command has no `--context`
and exits 1, while the hazard-to-criterion map requires the same check to be
context-requiring so it cannot pass by not being run, and it took the
hazard-covering reading and asserted both forms.

**Ruling: the PLAN is wrong. The phase's reading is right and the
implementation is right.** The evidence is three lines of the plan itself and
one measurement.

1. `delivery/plan/kernel-plan-m3.md:946` is a STANDING RULE of the whole plan,
   not an M3-P3 sentence: "a derived check that needs a context it was not given
   reports `SKIPPED <check-id> no context` and the command exits nonzero, so a
   cross-document rule can never pass by not being run."
2. The same phase's step 2 REQUIRES a cross-document check for this type:
   "Gate-set references resolve through Kind B check `mode-gate-sets-resolve`,
   which reads `gate-registry.yaml` from `--context`."
3. Line 2370's hazard map restates the standing rule for this exact check.

So criterion 1 (line 2521) contradicts lines 946, 2370, and its own step 2. It
is not a contradiction the implementer created and it is not one the
implementer could resolve in code without breaking something the plan requires:
the only ways to make the literal command exit 0 are to make the two checks
context-optional (the vacuous-pass shape M3-P1 criterion 4c exists to forbid)
or to default `--context` to the instance's directory (a change to a shipped
command's semantics, not on this phase's plan, which would also make the
standing rule unreachable through the CLI).

The measurement that explains how the contradiction got written:

```
$ grep -an "requiresContext" src/checks.ts
88:  requiresContext: false,
143:  requiresContext: false,
192:  requiresContext: false,
358:  requiresContext: false,
414:  requiresContext: false,
466:  requiresContext: true,      <- mode-gate-sets-resolve       (NEW, this phase)
546:  requiresContext: true,      <- charter-mode-enum-matches-modes (NEW, this phase)
```

**These are the first two `requiresContext: true` checks in the repository.**
Every pre-existing check is false, so every previously written criterion 1 of
the form "`tiphys validate --type X <file>` exits 0" was true, and the
convention held right up to the moment this phase's step 2 broke it. Confirmed
against a merged type:

```
$ node bin/tiphys.ts validate --type gate-registry gate-registry.yaml
exit=0                     # no --context needed; no cross-document check exists for it
```

Recorded as CR-003, low, with the exact amendment named. The implementer's D3
is the correct handling: it declared the contradiction, took the
hazard-covering half, asserted BOTH forms with registered tests, and softened
nothing.

### `full`'s merge authority is `delegated-under-conditions`, not blueprint section 8's `owner`

**Justified, and not a weakening.** It is what the plan's own criteria force,
not a preference:

- criterion 4b's green arm is "the same mode carrying DR-0012's six conditions
  and its record reference exits 0", and criterion 4c REQUIRES `full` to carry
  DR-0012's own two limits. A mode carrying DR-0012's bounds while declaring an
  authority regime DR-0012 replaced is internally incoherent, and incoherence in
  this artifact is the hazard class the phase is named after.
- DR-0015 removed the owner from the merge path for this project entirely.
  `owner` would record a regime this project has left.
- It is not a downgrade in the other direction either: `delegated-under-conditions`
  is the ONLY value the schema makes expensive, because it alone drags in a
  non-empty `conditions[]` and a `granted-by` record reference (witnessed red in
  both directions above). `owner` costs nothing to declare.
- The other two rows are blueprint section 8 verbatim (`direct-pr: owner`,
  `local-only: owner-approves-orchestrator-merges`), so exactly one row departs
  and it is the one this project actually runs.
- The departure is written at the field in `assurance-modes.yaml`, in the
  schema's `$comment`, in D5, and in does-not-prove item 7. A reader who has
  only the blueprint is told where to look.

### The thirteenth stage id `orchestrator-diff-review`

**Justified, and the safer of the two options.** Blueprint section 8's
local-only row literally reads "implement, orchestrator diff review, local
fast-forward". The plan enumerates twelve stages for `full` and nowhere declares
the stage vocabulary closed at twelve. The alternative the implementer names,
describing local-only as `[implement, merge-on-green]`, would delete a review
from a declared mode's pipeline, which is the hazard this phase exists to
prevent rather than a smaller version of it.

One consequence I checked rather than assumed: `orchestrator-diff-review` is in
no other mode's `skips[]`, because `mode-no-undeclared-downgrade` measures every
mode against `full`'s pipeline and this stage is not in it. That asymmetry is
correct: `full` omitting a stage local-only runs is not a downgrade of `full`.
The check is one-directional by design and stays so.

### `role-model-config` gained an optional `strongest-for`

**Justified.** The plan's own step 3 quotes R-075's phase-class-scoped rule
("strongest for money-path and architecture phases ... cheaper for mechanical
phases") in the same sentence that lists the fields, and a flat `tier` cannot
express it: the `implementer` row is the one whose tier is a function of the
phase. The field is optional, its item vocabulary is CLOSED
(`money-path`, `architecture`, `investigation`, `review`), and nothing reads it.
Adding a field the plan's field list does not enumerate is a real deviation and
D8 declares it as one, which is the right handling.

### One behavior beyond the plan's fifteen

**Justified.** `role-model-config-tiers-by-risk` is the only assertion anywhere
about WHICH roles took which tier; criterion 1 only says the document validates
and the schema permits `cheaper` on any role. Adding an assertion is not scope
creep, and CLAUDE.md requires every new behavior to be registered, so leaving it
unregistered was not an option. I verified its registration is the literal test
name (16/16 above) and that it is a real test, not a tautology: it pins six role
ids, three strongest-tier roles, both review roles' family constraints, and the
implementer's phase-class half.

## Findings

### CR-001 (HIGH): `src/checks.ts` carries two literal NUL bytes, and all three guards that should have caught it are green

**Instance.** `src/checks.ts` line 586, introduced by this phase's only source
commit `e82a0e0`:

```
$ node -e 'const b=require("fs").readFileSync("src/checks.ts","latin1");
  b.split("\n").forEach((l,i)=>{ if(l.indexOf(String.fromCharCode(0))>=0)
    console.log("line "+(i+1)+": "+JSON.stringify(l).replace(/\\u0000/g,"<NUL>")); });'
line 586: "      if (enumerated.join(\"<NUL>\") !== declaredIds.join(\"<NUL>\")) {"
```

Two raw `0x00` bytes at file offsets 23895 and 23921, used as the `join()`
separator. `origin/main`'s `src/checks.ts` has zero:

```
$ git show origin/main:src/checks.ts | node -e '<count 0x00>'
origin/main src/checks.ts NUL count: 0 bytes 13267
```

**Mechanism, which is what the fix round owes and it is not "one bad line".**
A control character needed AS DATA was written as a LITERAL BYTE in source
instead of as an escape. CLAUDE.md forbids exactly this by name, in the entry
written after `test/status.test.ts` reached a pull request carrying raw NUL and
SOH: "Control characters a test genuinely needs AS DATA belong in escapes, never
as literal bytes in source." The separator is a fine engineering choice; writing
it as `"\\0"` (the two-character escape, not the byte) is behaviourally identical and costs nothing.

**Three consequences, each independent, and all three of the project's guards
are green on this head.**

1. *`grep` classifies the file as binary and prints nothing.* I hit this myself
   while reviewing, before I was looking for it:

   ```
   $ grep -n "charterModeEnumMatchesModes" src/checks.ts
   grep: src/checks.ts: binary file matches
   $ grep -an "charterModeEnumMatchesModes" src/checks.ts | head -3
   543:export const charterModeEnumMatchesModes: DerivedCheck = {
   602:  charterModeEnumMatchesModes,
   ```

   Every derivation grep over `src/` now silently returns nothing from this
   file. That is item 2 of the fix-round contract ("publish the derivation, the
   exact command that enumerates every call site") rendered unsound for the
   largest file this phase touches, and it is the shape CLAUDE.md warns about
   three times: a search whose scope is silently wrong returns an empty result
   indistinguishable from an absence of defects. The work history's own settling
   command `grep -rn "readModes\|MODES_FILENAME" src/ bin/ scripts/` is one of
   those greps.

2. *`git diff --stat | grep -c 'Bin'` is 0 and worthless here.* The NUL sits at
   byte 23895, past git's binary-sniff window, so git treats the file as text:

   ```
   $ git diff --numstat origin/main...HEAD -- src/checks.ts
   335	0	src/checks.ts
   $ git diff --stat origin/main...HEAD -- src/checks.ts
   src/checks.ts | 335 +++++++++++++++++++++++++++++++++++++++
   ```

   The work history runs that exact check and concludes "no file of this phase
   is reported as `Bin` by `git diff --stat`, so every one has a reviewable
   diff". The first clause is true; the second does not follow, and here it is
   false in a worse way than `Bin` would have been. The diff line renders as

   ```
   +      if (enumerated.join("<NUL>") !== declaredIds.join("<NUL>")) {
   ```

   which a terminal, a browser and a diff viewer all display as `join("")` or
   `join(" ")`. An unreviewable diff announces itself; this one silently tells
   the reviewer the separator is an empty string or a space.

3. *CLAUDE.md's control-character check cannot see NUL at all.* See CR-002.

**Reproduction and fix.** The fix is one edit with no behaviour change: replace
the two literal bytes with `"\\0"` (the two-character escape, not the byte) (or pick a separator that is not a control
character, both operands are validated mode ids matching a lowercase-hyphen
pattern, so a space, a comma or a newline separate them just as safely). The mechanism-level fix, which is what this repository's own rules
ask for, is a REGISTERED TEST that scans every tracked file byte-wise for
control characters and non-ASCII with the two path-scoped exemptions, because
the grep CLAUDE.md prescribes provably cannot do it (CR-002) and nothing else
in the repository looks. `manifest-self-check`, `suite`, `scope`, `red-witness`
and `agent-rules-drift` were all green on this head.

Severity HIGH rather than medium for one reason: the defect's cost is not the
line, it is that every future derivation grep over `src/checks.ts` returns a
false empty, and `src/checks.ts` is the file every later M3 phase extends
(M3R-001 registers each new phase's checks there).

### CR-002 (HIGH): the control-character check CLAUDE.md prescribes is blind to NUL, the character it was written for

**Mechanism.** `grep -P` hands each line to PCRE as a NUL-terminated C string,
so a NUL inside the line is never presented to the pattern. The character class
`[\x00-\x08\x0B\x0C\x0E-\x1F]` therefore matches every control character in its
range EXCEPT `\x00`. Two structurally different members, because one witness is
not a class:

```
$ printf 'hello\x00world\n' > has-nul.txt
$ printf 'hello\x01world\n' > has-soh.txt
$ printf 'hello world\n'    > clean.txt

$ grep -rlP '[\x00-\x08\x0B\x0C\x0E-\x1F]' .        # the CLAUDE.md check, verbatim
./has-soh.txt
exit=0                                               # SOH found, NUL MISSED

$ grep -rlP '\x00' .
exit=1                                               # NUL not found even when it is the whole pattern

$ grep -rlP '\x00' --text .
./has-nul.txt                                        # --text is what makes it visible
exit=0

$ grep --version | head -1
grep (GNU grep) 3.11
```

and the byte-wise ground truth, so the experiment is not itself the guard under
test:

```
$ node -e '<count bytes <32 excluding tab/LF/CR>'
has-nul.txt 1
has-soh.txt 1
clean.txt 0
```

This is the fifth recorded instance in this repository of "a guard whose
condition does not test the property that matters is green and worthless", and
it is the sharpest one yet: CLAUDE.md's entry describing the NUL/SOH incident
prescribes, as the remedy, a command that cannot detect the NUL half of it.
Every "both ASCII checks print nothing" report on every branch since that entry
was written has been true and, for NUL, uninformative.

**Scope: it is a CLASS, with a member already on `main`.** A byte-wise scan of
all 399 tracked files minus the two path-scoped exemptions:

```
$ node -e '<byte-wise scan of git ls-files minus the two exemptions>'
delivery/review/arbitration-m3-p1.md ctrl=1 @8727=0x0 nonascii=0
src/checks.ts                        ctrl=2 @23895=0x0,@23921=0x0 nonascii=0
files with ctrl or non-ascii: 2 of 399
```

`delivery/review/arbitration-m3-p1.md` is NOT in this phase's diff; it is
already on `main` and has been passing the check since it landed. So the
mechanism has produced two members already and the check has never seen either.

**What I did NOT establish:** whether other `grep -P` invocations in the
repository's scripts and gates are affected the same way. I did not audit
`scripts/**` or `src/gates/**` for `-P` character-class usage; that search
belongs to whoever fixes this.

Recommended fix (mechanism, not instance): replace the prescribed command in
CLAUDE.md with one that cannot have this blind spot, and back it with a
registered test rather than a convention. Either add `--text`/`-a` to both
greps, or, better, make it a byte-wise scan in the suite so it is a gate rather
than a habit. Filed as HIGH because it is the guard the repository's own
standing rule depends on, and because it is now demonstrably letting real
instances through.

### CR-003 (LOW): criterion 1 as worded contradicts the plan's own standing rule; the plan needs a one-line amendment

Full ruling above. Mechanism: this phase ships the repository's first
`requiresContext: true` checks, and the convention every earlier criterion 1 was
written against ("`tiphys validate --type X <file>` exits 0") silently stops
holding for a type that has a cross-document check. That is a property of the
TYPE, so it will recur for every later phase that adds one, which is why the
amendment should be to the criterion template and not only to this line.

```
$ node bin/tiphys.ts validate --type assurance-modes assurance-modes.yaml
SKIPPED charter-mode-enum-matches-modes no context
SKIPPED mode-gate-sets-resolve no context
exit=1
$ node bin/tiphys.ts validate --type assurance-modes --context . assurance-modes.yaml
exit=0
```

Amendment: `delivery/plan/kernel-plan-m3.md:2521` gains `--context .`, with a
sentence naming line 946 as the reason. No code change. Low, and a tracked item
under DR-0012 condition 2 rather than a blocker, because both forms are asserted
by registered tests and nothing was softened.

### CR-004 (LOW): the `contains` diagnostic names the field but not the required value

```
$ node bin/tiphys.ts validate --type assurance-modes --context . <full with fix-round-verification removed>
INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here
INVALID #/modes/0/pipeline array contains no item matching the required shape, and 1 is required
exit=1
```

Criterion 3(c) says the rejection must name the offending field, and
`#/modes/0/pipeline` does. But an author reading this is not told that
`fix-round-verification` is the stage that is missing, and this is the exact
stage T-003 made structural. Mechanism: the generic `contains` renderer in
`src/validate.ts` reports the KEYWORD's failure without projecting the
subschema's `const`. It is not this phase's code and this phase is the first
instance to surface it, which is why it is low and reported rather than fixed
here. Everywhere else the phase's messages are exemplary, including the two
`mode-gate-sets-resolve` messages that distinguish "not declared" from "declared
and this mode is not in its modes list".

### CR-005 (LOW): criterion 4's green arm needs four coordinated edits, and the work history reports it as one

The work history and the behavior description both say "updating the enum
returns exit 0". Walked end to end (arms 0 to 6 above), adding a fourth mode
requires: the yaml, `schemas/assurance-modes.schema.json`'s `id` enum,
`schemas/charter.schema.json`'s two enums, and `gate-registry.yaml`'s per-gate
`modes` list, before `tiphys validate --type assurance-modes` returns 0; and a
fifth (`schemas/gate-registry.schema.json`'s own `modes` item enum) before
`gate-registry.yaml` itself validates again. Mechanism: the mode vocabulary is
duplicated in FOUR places and `charter-mode-enum-matches-modes` binds one of
them. That is what the plan asked for and it is not a defect in the check; the
defect is a work-history sentence that will send the next author looking for a
one-line edit. Low, fix by amending the sentence.

### CR-006 (LOW): capture fidelity in the work history

The `mode show --mode full` block ends at a bare `skips:` line. The real output
is:

```
skips:
  (none)
```

The elision is cosmetic and changes no verdict, but this project's standard is
that a captured block IS the output. Related, same class, one notch smaller:
`LIVENESS_TOKENS` is written as `["p" + "id", "ki" + "ll", ...]`, which makes
the four tokens invisible to a grep of the test file. Both are low; both are the
same habit as CR-001's mechanism (a source file that does not contain what it
appears to contain).

## Verdict

**CHANGES REQUIRED.**

Two high findings, four low. Nothing in the phase's ACCEPTANCE CRITERIA is
unmet: all twelve are MET, every witness is real, twenty-two of twenty-two
mutations are caught, sixteen of sixteen registrations are literal, nine of nine
witness members redden the named test, and the whole PR bundle is green with the
gate process's own exit code 0. On the criteria contract alone this would be an
APPROVE, and it is the strongest phase I have reviewed in this repository by the
mutation measure.

The two high findings are both about the same thing and neither is visible to
any gate: this head carries literal NUL bytes in the source file every later M3
phase will extend, and the check this repository wrote specifically to prevent
that cannot see them. CR-001 is a one-line fix; CR-002 is a mechanism fix that
belongs to the orchestrator, not to this phase, but CR-001 must not merge on the
strength of a guard that CR-002 proves does not work.

Recommended disposition: fix CR-001 in this phase (replace the two literal bytes
with `"\\0"` (the two-character escape, not the byte)); take CR-002 as an orchestrator-side item with a registered
byte-wise test, and note that it also has a member already on `main`; record
CR-003 as a plan amendment; record CR-004, CR-005 and CR-006 as tracked low
items with reasons.

## What this review did NOT cover

Read this first. A search whose scope is wrong returns an empty result that is
indistinguishable from an absence of defects.

1. **The hazard lens's territory.** By contract I did not read
   `delivery/review/clean-room-m3-p3-hazard.md` and did not work outward from
   the phase's declared hazard classes. My starting question was the twelve
   acceptance criteria. T-007's whole point is that this leaves a blind spot
   whose shape I cannot describe from inside it.
2. **CI itself.** Everything here ran in this container on a local clone. I
   observed no GitHub Actions run, neither the `pull_request` arm nor the
   post-merge `push` arm on the new `main` head. T-009's rule that a gate result
   is evidence only for the configuration that produced it applies to my run
   too: my configuration is "local clone, branch `claude/m3-p3-assurance-modes`,
   base `origin/main` at 45722e3, node v26.6.0". I did NOT run the `main`
   bundle, which is the arm T-009 measured red for four hours while every PR
   check was green.
3. **`direct-pr` and `local-only` by execution.** Nothing executes them and I
   did not build anything that does. My evidence for both modes is validation
   and `tiphys mode show`, exactly as the plan's honest-scope note says.
4. **Prose fidelity of the mode definitions against their cited sources.** I
   checked that `full`'s twelve stages match step 2 and that the three
   `declared-by` strings name blueprint section 8 rows. I did NOT open
   `delivery/intake/orchestrated-delivery-v1.md` section 8 or the process
   document's section 9 item 3 and compare word for word, so a stage misnamed
   consistently in both the plan and the artifact would pass me.
5. **The other `grep -P` sites.** CR-002 establishes the blind spot for the two
   commands CLAUDE.md prescribes. I did NOT audit `scripts/**` or
   `src/gates/**` for other `-P` character-class uses that could carry the same
   hole.
6. **The gate runner, the suite gate and the red-witness gate as programs.** I
   ran them and read their output and their per-gate records. I did not read
   their implementations except for `src/gates/red-witness.ts:287` and `:310`
   (the coverage rule) and `src/gates/scope.ts`'s branch and declaration checks,
   which I read only far enough to explain my first red run.
7. **`role-model-config.schema.json` beyond `$defs.roleBinding`.** I read the
   role, tier, `strongest-for`, `charter-override` and `review-model-family`
   definitions and the shipped data. I did not walk its `additionalProperties`
   discipline at every level or build a misspelled-property fixture for it;
   `manifest-self-check` covers the keyword vocabulary and it is green.
8. **The work history's settling commands, individually.** I re-ran the claim
   grep (15 hits at this head, unchanged in shape from what the file reports)
   and re-took every witness and every criterion. I did not re-execute each of
   the four settling captures in its claim-grep section; I re-derived three of
   them independently (`readModes` callers, the `requiresContext` inventory, the
   red-witness coverage lines) and reached the same answers.
9. **`package.json`'s `files` entry as shipped.** I read the diff (two lines
   added) but did not run `npm pack` to confirm both documents land in the
   tarball, nor that `src/modes.ts`'s `packageRoot()` walk finds
   `assurance-modes.yaml` from an INSTALLED layout rather than from the
   repository. `mode show` is proven from the repository only.
10. **Non-ASCII in this report.** I wrote it; I did not run the repository's own
    ASCII checks over it, and per CR-002 one of those checks would not tell me
    much anyway.
