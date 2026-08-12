# Clean-room review: is the new witness itself a witness?

Branch `claude/exit-test-harness-assertion-direction` at `fdb3120` (draft PR #109).
Reviewer worktree: detached at fdb3120. Started, beacon created.

Status: IN PROGRESS. Appending after each defang.

## Confirmations

- `git rev-parse claude/exit-test-harness-assertion-direction` = fdb3120692f4178e213c40a6439a742effe24466 (exit 0)
- `origin/claude/exit-test-harness-assertion-direction` = same sha (exit 0)

## Log

(appending)

## Setup (verified before any defang)

- Reviewer worktrees: `CRVAC` (report), `CRVAC-lab` (mutations), `CRVAC-snap` (pristine copies for restore; no `git checkout --` is used anywhere).
- Toolchain: node v26.6.0 from the scratch prefix, `node --version` checked in the running shell.
- `npm run build` exit 0 in the lab worktree, `git status --short` empty afterwards.
- BASELINE, unmutated: `node --test --test-name-pattern "a RED gate is rejected on BOTH bundles" test/m2-exit-test.test.ts` -> exit 0, tests 1, pass 1, fail 0, skipped 0.

### Harness sha256 (claim: production code unchanged by the fix round)

| rev | sha256 of scripts/m2-exit-test.sh |
|---|---|
| bb8f656 (merge base) | 33760f463cbf9ecd0499b9be738b5cebcac701d8ce5bc0ddeb96e119b90f2859 |
| 21509d1 (pre-fix-round) | 9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138 |
| fdb3120 (head) | 9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138 |

CONFIRMED identical 21509d1 -> fdb3120. `git diff --stat 21509d1 HEAD` does not list scripts/m2-exit-test.sh.

### The two arms' tables (real manifest, 11 gates)

- pr, gates: manifest-self-check, red-witness, suite, scope, citations, coverage, clause-map, credential-scrub, deploy, migrations, credential-token; absent []. LAST (= probe `dropped`) is credential-token.
- main, gates: manifest-self-check, suite, coverage, credential-scrub, deploy, migrations; absent [credential-token, citations, scope, clause-map, red-witness]. LAST is migrations.

Both `dropped` values are manifest ids, which is what probe-2 needs.

## Defangs

### Lab method

The test aborts at its first failed assertion, so a whole-test exit code cannot
say which probe on which arm survived a defang. I built a driver that replicates
the test's probe construction line for line (same `harnessCopy`, same
`writeBundle`, same `printExpect`, same shipped `m2-assert.mjs` obtained from
`--self-test`) and runs EVERY case on BOTH arms unconditionally, printing each
one's exit code, its itemised-finding count, and its FOREIGN count under the
test's own derived `defaultSpecReason`. `foreign > 0` is exactly what the test's
`assert.deepEqual(foreign, [])` rejects, so `foreign` in these tables is the
test's own verdict, computed the same way.

Derived reason, printed by the driver from the shipped harness:
`This gate has NO row in the expectations table, so it was asserted under the`

### D0 BASELINE (no mutation), both arms, every case

| arm | case | exit | findings | foreign | names its gate | zero-red fired | sec8 fired |
|---|---|---|---|---|---|---|---|
| pr | healthy CONTROL | 0 | 0 | 0 | - | no | no |
| pr | member-1 | 1 | 3 | 1 | - | YES | no |
| pr | member-2 | 1 | 3 | 1 | - | YES | no |
| pr | member-3 | 1 | 1 | 1 | - | YES | no |
| pr | probe-1-rows-leg | 1 | 2 | **0** | yes | no | no |
| pr | probe-2-manifest-leg | 1 | 1 | **0** | yes | no | no |
| pr | probe-3-manifest-gate-na | 1 | 2 | **0** | yes | no | no |
| main | healthy CONTROL | 0 | 0 | 0 | - | no | no |
| main | member-1 | 1 | 3 | 3 | - | YES | YES |
| main | member-2 | 1 | 3 | 1 | - | YES | no |
| main | member-3 | 1 | 1 | 1 | - | YES | no |
| main | probe-1-rows-leg | 1 | 2 | **0** | yes | no | no |
| main | probe-2-manifest-leg | 1 | 1 | **0** | yes | no | no |
| main | probe-3-manifest-gate-na | 1 | 2 | **0** | yes | no | no |
| main | absent-gate-not-applicable | 1 | 2 | 2 | - | no | YES |
| main | absent-gate-green | 1 | 2 | 2 | - | no | YES |

The three probes are non-vacuous at baseline on BOTH arms: they exit nonzero,
they print itemised findings, and every one of those findings carries the
default-spec reason (foreign 0). Members 1 to 3 are over-determined exactly as
the round says (foreign > 0, zero-red fired), and the main-arm absent probes are
correctly attributed to section 8 rather than to the derivation.

### D1 kill the ROWS leg of the union

Input corrupted: `scripts/m2-exit-test.sh`, the union spread at scripts/m2-exit-test.sh:515,
`[...manifestIds, ...rows.map((row) => row?.id), ...explicitById.keys()]` ->
`[...manifestIds, ...explicitById.keys()]`.

| arm | probe-1-rows-leg | probe-2-manifest-leg | probe-3-manifest-gate-na |
|---|---|---|---|
| pr | **exit 0** (killed) | exit 1, foreign 0 | exit 1, foreign 0 |
| main | **exit 0** (killed) | exit 1, foreign 0 | exit 1, foreign 0 |

Whole-test run under the same mutation: `node --test --test-name-pattern "a RED gate
is rejected on BOTH bundles"` exit 1, failing at test/m2-exit-test.test.ts:1441 on the
pr arm's probe-1. Verdict: probe-1 is a real witness for the rows leg on BOTH arms;
probes 2 and 3 are unaffected, so the legs are not one path wearing two hats.

### D2 kill the MANIFEST leg of the union

Input corrupted: same line -> `[...rows.map((row) => row?.id), ...explicitById.keys()]`.

| arm | probe-1-rows-leg | probe-2-manifest-leg | probe-3-manifest-gate-na |
|---|---|---|---|
| pr | exit 1, foreign 0 | **exit 0** (killed) | exit 1, foreign 0 |
| main | exit 1, foreign 0 | **exit 0** (killed) | exit 1, foreign 0 |

Verdict: the exact opposite of D1, on both arms. Orthogonality of the two legs is
REPRODUCED, and it holds on the main arm as well as the pr arm.

Note probe-3 survives BOTH D1 and D2. It is a third member of the same class rather
than a third leg: with the manifest leg gone its id still reaches the expected set
through its own bundle row, and with the rows leg gone it still reaches it through
the manifest. So probe-3 is over-determined WITHIN the derivation. That is not a
defect (its findings still carry the default-spec reason, so it is not
over-determined across checks), but it means the round's "one probe per leg" claim
is carried by probes 1 and 2 only.

### D3 kill the EXPLICIT-TABLE leg of the union: NOTHING MOVES

Input corrupted: same line -> `[...manifestIds, ...rows.map((row) => row?.id)]`.

Every one of the sixteen cases above is BYTE-IDENTICAL to the D0 baseline on both
arms: same exit codes, same finding counts, same foreign counts. The target test
passes unchanged.

This is the THIRD LEG. Full-suite result under this mutation recorded below.

#### D3 continued: the explicit leg is NOT dead code, and NOTHING guards it

Full suite under D3 (explicit leg deleted): `npm test`, node v26.6.0, `dist/` built,
run from the lab worktree root: **594 tests, 594 pass, 0 fail, 0 skipped, exit 0**,
identical to the unmutated baseline (also 594/594/0/0, exit 0). The entire
repository is blind to the deletion.

To show the leg carries real behaviour I built the one shape only it can assert:
an expectations-table row naming a gate that is in NEITHER `gates.manifest.json`
NOR the bundle. Same shipped `m2-assert.mjs`, same bundle, both arms:

| harness | pr | main |
|---|---|---|
| baseline (leg present) | exit **1**, `- [gate-the-table-names-and-nothing-else] no record in the bundle for a gate the table lists (expected green)` | exit **1**, same finding |
| D3 (leg deleted) | exit **0**, `OK. 11 gate record(s) ... 11 gate(s) asserted` | exit **0**, `OK. 6 gate record(s) ...` |

So deleting it silently restores the ORIGINAL defect in its mirror direction: a
gate the table names that produced no record is asserted by nothing. The reported
OK line cannot see it either, because `derivedIds` is unchanged.

**FINDING CR-V-1 (MEDIUM).** See the findings section.

### D5 the reason string is LIVE, not a second copy

Input corrupted: the whole first chunk of `DEFAULT_SPEC_WHY` reworded to a sentinel
with no word in common. Whole test: **exit 0** (still green). Driver confirms the
test's derived value tracked it: `DERIVED defaultSpecReason: "REWORDED SENTINEL
ALPHA the table does not name this gate and so it took the"`, and all three probes
still exit 1 with foreign 0 on both arms. A hard-coded literal would have gone red
here. `grep -rn "NO row in the expectations table" test/ src/` returns NOTHING; the
only two occurrences of `DEFAULT_SPEC_WHY` in the test file are the regex itself and
its failure message. **The brief's item-1 concern does not hold: the derivation is live.**

### D6 rewording a chunk the regex does NOT capture

The regex captures only the FIRST of the four concatenated string chunks. Rewording
the SECOND chunk entirely: whole test **exit 0**. Correct rather than a hole: the
captured substring is still present in every default-spec finding, so the
`includes()` test still discriminates.

### D7 break the derivation itself

Input corrupted: `const DEFAULT_SPEC_WHY` renamed to `DEFAULT_SPEC_EXPLANATION`
(both the declaration and its use), so the regex finds nothing.
Whole test: **exit 1**, `AssertionError: could not derive DEFAULT_SPEC_WHY from the
harness; the uniqueness check below would be vacuous without it, so this is a hard
failure rather than a fallback` at test/m2-exit-test.test.ts:1250. The guard on the
guard fires. Correct: no silent fallback.

### D8 stop appending the reason to findings

Input corrupted: `const why = explicit ? "" : DEFAULT_SPEC_WHY;` -> `const why = "";`.
Whole test: **exit 1**, at the pr arm's probe-1: "was rejected by 2 check(s) OTHER
than the derived expected set". So the `foreign` assertion is demonstrably capable
of firing rather than being a permanently-empty deepEqual.

### D9 does the guard on the guard check that the string DISCRIMINATES?

The uniqueness predicate is `line.includes(defaultSpecReason)` where
`defaultSpecReason` is the FIRST of the four concatenated chunks of
`DEFAULT_SPEC_WHY` (scripts/m2-exit-test.sh:509), the regex at
test/m2-exit-test.test.ts:1249 capturing only up to the first closing quote.
The guard asserts the string is DERIVABLE (D7), never that it SEPARATES.

Measured. I added an over-determined control (probe-1 plus a red row) and read
its foreign count under two harnesses:

| harness | derived reason | probe-1 foreign | over-determined control foreign | whole test |
|---|---|---|---|---|
| baseline | `This gate has NO row in the expectations table, so it was asserted under the` | 0 | **3** (both arms) | exit 0 |
| first chunk reworded to `" gate"` | `gate` | 0 | **1** (both arms) | exit 0 |

Rewording the reason to a single common word absorbs the zero-red finding
(`1 gate(s) reported RED: ...` contains "gate") and the whole test stays green.
A shorter degenerate value would absorb all of them. Recorded as observation O-1;
it needs a perverse edit, so it is stated with numbers rather than raised.

### D10 drop the absent-list filter -- CAUGHT

scripts/m2-exit-test.sh:516, `absentIds.has(id) ||` removed. main healthy CONTROL
goes exit 0 -> **exit 1 with 6 findings**, so the test reddens. Guarded.

### D11 drop the dedup -- NOT caught, and harmless

scripts/m2-exit-test.sh:516, `|| expectedIds.includes(id)` removed. probe-3 goes
from 2 findings to 4 (each id asserted twice), everything else identical, whole
test **exit 0**. No behavioural loss (the assertions are idempotent); only the OK
line's `expectedIds.length` is inflated, and no test reads it
(`grep -rn "gate(s) asserted" test/` returns nothing). Observation O-3, no action.

## Empty inputs (brief item 3)

Shipped `m2-assert.mjs`, hand-built degenerate inputs:

| case | exit |
|---|---|
| E1 zero rows, REAL manifest, REAL pr table | **1**, FAIL with 11 findings |
| E2 zero rows, manifest `{gates:[]}`, empty table | **0**, `OK. 0 gate record(s) ... 0 gate(s) asserted` |
| E3 zero rows, manifest key renamed `gates`->`checks`, empty table | **0**, same OK line |
| E4 `summary.json` with NO `gates` key, empty manifest, empty table | **0**, same OK line |
| E5 zero rows, manifest key renamed, REAL pr table | **1**, FAIL with 11 findings |
| E6 manifest `gates` an OBJECT not an array, empty table | **0**, same OK line |

Two things follow. (a) The real expectations table is the floor that stops the
vacuous pass, so the shipped harness is safe: `PR_EXPECT_JSON`
(scripts/m2-exit-test.sh:186) and `MAIN_EXPECT_JSON` (scripts/m2-exit-test.sh:239)
are non-empty shell literals and cannot be empty. (b) `manifestIds` degrades to
`[]` SILENTLY whenever `manifestRead.value.gates` is not an array
(scripts/m2-exit-test.sh:501), and nothing asserts `manifestIds.length > 0` or
`expectedIds.length > 0`. The program enforces "green with no units examined is
vacuous (M2-C-2)" on every gate it inspects and exempts itself.

And E5 composes with D3: **with the explicit leg deleted, E5 flips from exit 1 to
exit 0** (`OK. 0 gate record(s) ... 0 gate(s) asserted`). The unwitnessed third leg
is the only thing between a silently-empty manifest leg and a total vacuous pass.

## Both arms are built identically (brief item 4)

At 21509d1 the `derivationOnly` array was a `runsUnlisted ? [...] : [...]` ternary,
so the two arms ran DIFFERENT probes. At fdb3120 it is one unconditional array;
the only surviving `if (!runsUnlisted)` sits AFTER the probe loop and guards the
separately-labelled section-8 probes. Verified by grep over the block.

I then diffed what actually reaches the assertion, as each probe's delta from its
own arm's healthy bundle and table:

| probe | rows added | rows removed | table rows removed |
|---|---|---|---|
| probe-1 | `<NOWHERE>:not-applicable` | none | none |
| probe-2 | none | `<DROPPED>` | `<DROPPED>` |
| probe-3 | `<DROPPED>:not-applicable` | (status change) | `<DROPPED>` |

IDENTICAL on both arms (the driver compares the normalised deltas and prints
`RECIPE DELTAS IDENTICAL ACROSS ARMS: true`). The arm-specific bindings are
`<DROPPED>` = credential-token (pr) and migrations (main); on BOTH arms it is a
manifest id and NOT in that arm's absent list, which is what probe-2 and probe-3
need. `<NOWHERE>` is in neither manifest nor absent list on either arm, which is
what probe-1 needs. So the identity is real, not superficial.

One asymmetry worth recording rather than hiding: on the main arm `<DROPPED>` is
migrations, whose table expectation is already `not-applicable`, so probe-3's row
status is unchanged from healthy there while on the pr arm it changes green ->
not-applicable. Both arms still produce 2 findings, both default-spec, so the probe
means the same thing on both.

## Do the round's own two red witnesses discriminate? (brief item 5)

They are indeed ONE assertion (`assert.deepEqual(foreign, [])`,
test/m2-exit-test.test.ts:1454) fed two different competitors. That is the right
shape only if no competitor escapes it, so I enumerated EVERY rejecting check in
the assertion program and over-determined probe-1 with each, on both arms:

| # | competitor | pr exit / findings / foreign | main exit / findings / foreign | test catches it |
|---|---|---|---|---|
| U0 | none (control) | 1 / 2 / 0 | 1 / 2 / 0 | correctly NO |
| U1 | zero-red (the round's witness 1) | 1 / 5 / 1 | 1 / 5 / 1 | YES |
| U2 | section 8 declared-absent (witness 2) | n/a on this arm | 1 / 4 / 2 | YES |
| U3 | section 7 recount mismatch | 1 / 3 / 1 | 1 / 3 / 1 | YES |
| U4 | duplicate record for one gate | 1 / 3 / 1 | 1 / 3 / 1 | YES |
| U5 | zero-error | 1 / 5 / 1 | 1 / 5 / 1 | YES |
| U6 | zero-vacuous | 1 / 3 / 1 | 1 / 3 / 1 | YES |
| U7 | green with zero units (M2-C-2) | 1 / 3 / 1 | 1 / 3 / 1 | YES |
| U8 | section 9 manifestSha256 mismatch | 1 / 3 / 1 | 1 / 3 / 1 | YES |
| U9 | unparseable summary (exits before any itemised finding) | 1 / **0** / 0 | 1 / **0** / 0 | YES, via `findings.length > 0` |
| U10 | section 4 N/A with no result record | 1 / 5 / 1 | 1 / 5 / 1 | YES |

Every competitor is caught, including eight the round never named and the one
(U9) that produces no itemised finding at all and is caught by the OTHER half of
the assertion. So the two named witnesses are the same code path, and that is
FINE here: the code path is the thing being witnessed, and it is demonstrably
sensitive to every member of the competitor set on both arms.

Why it holds structurally: `why` is appended only when `explicit` is falsy
(scripts/m2-exit-test.sh:533), and an id with no explicit spec can only have
entered `expectedIds` through the manifest or rows legs. `DEFAULT_SPEC_WHY` occurs
exactly twice in the harness (declaration and that one use), so
"a finding carrying the reason" and "a finding from the derived expected set" are
the same set, not merely correlated.

## The two claims I was told to attack

**"No production code changed."** VERIFIED. sha256 of scripts/m2-exit-test.sh is
identical at 21509d1 and fdb3120 (table above) and the file is absent from
`git diff --stat 21509d1 HEAD`. And a witness-only fix IS the right fix here,
because CR-V01 was a defect in the witness, not in the program. The bound is real
and the branch states it: no CI bundle contains an unlisted manifest gate, so
`gates` run 31602409424 being green on fdb3120 is evidence that the TEST passes,
never that the derivation works. The lab work above is the evidence for the
derivation, and it is positive on both arms.

**The refuted mechanism.** The implementer was right to refuse "every member
carries a red row" (members 1 to 3 do; probes 1 to 3 do not, measured in D0), and
the substitute (a probe witnesses a check only when that check is its UNIQUE
rejecter, competitor set a function of the ARM) is correct. The fix IMPLEMENTS it
rather than stating it, and implements something STRONGER: by keying uniqueness on
the harness's own default-spec reason it never enumerates the competitor set at
all, so the arm-dependence that broke the previous version cannot recur, and
competitors added later are covered for free. U3 to U8 and U10 are competitors
nobody enumerated and all ten are caught on both arms.

## Findings

### CR-V-1 (MEDIUM): the union has THREE sources, two are witnessed, and the new mechanism cannot witness the third

Two inputs: `scripts/m2-exit-test.sh` (the union at scripts/m2-exit-test.sh:515)
and the whole test suite at fdb3120.

Defang that should have reddened something: delete `...explicitById.keys()` from
the union, leaving `[...manifestIds, ...rows.map((row) => row?.id)]`.

Captured exit codes:

- target test, `node --test --test-name-pattern "a RED gate is rejected on BOTH bundles"`: **exit 0** (all sixteen driver cases byte-identical to baseline on both arms)
- full suite, `npm test`, node v26.6.0, `dist/` built: **exit 0**, 594 tests, 594 pass, 0 fail, 0 skipped, identical to the unmutated baseline

Not dead code: the shape only this leg asserts (an expectations-table row naming a
gate that is in neither the manifest nor the bundle) goes from exit 1 with
`- [gate-the-table-names-and-nothing-else] no record in the bundle for a gate the
table lists (expected green)` to exit **0** with `OK. 11 gate record(s) ...`, on
BOTH arms. That is the original assertion-direction defect restored in its mirror
direction: the table names a gate, no record exists, nothing complains.

Composition that raises this above bookkeeping: with the leg deleted, case E5
(real table, manifest whose `gates` key is not an array) flips from exit 1 to exit
0 with `0 gate(s) asserted`. The leg is the last thing standing between a silently
degraded manifest and a total vacuous pass.

Why the round's mechanism cannot close it: a finding for an explicit-table id
never carries `DEFAULT_SPEC_WHY` (scripts/m2-exit-test.sh:533), so a probe for this
leg would have `foreign > 0` and the test's own `assert.deepEqual(foreign, [])`
would reject it as over-determined. The uniqueness mechanism is keyed to the
default spec and is therefore structurally blind to the explicit leg. The round
does not say this.

The work history's open item states the problem in the wrong TENSE:
delivery/work-history/exit-test-assertion-direction.md:2050 says "A third spread
into that union WOULD be unwitnessed and nothing would say so". There are three
spreads today and the third IS unwitnessed, now, and nothing says so.

Honest scoping: the leg is pre-existing behaviour this branch did not weaken, and
at HEAD it is redundant, because the pr table's 11 ids and the manifest's 11 ids
are the same set and main's 6 + 5 absent are the same 11. It becomes load-bearing
the moment a gate leaves gates.manifest.json while its table row stays, which is a
plausible edit and the exact direction R-094 work is heading.

Recommended disposition, which I would defend: fix it in this round. It is one
more entry beside the three probes, with uniqueness keyed on the OTHER message
rather than on the default-spec reason, since that probe produces exactly one
finding and nothing else (measured, both arms). No pinned count is involved, so
the CLAUDE.md:201 objection that stopped the implementer does not apply to this
form. An orchestrator could defensibly instead record it as a follow-up on the
grounds that the behaviour is correct at HEAD; I set it MEDIUM because the branch's
whole subject is this union and one third of it is unguarded.

### CR-V-2 (LOW): the assertion program exempts itself from M2-C-2

Two inputs: a manifest whose `gates` is not an array, and an expectations document
with no gates.

`manifestIds` becomes `[]` with no error (scripts/m2-exit-test.sh:501), and there
is no floor on `expectedIds.length`. Cases E2, E3, E4 and E6 above all exit **0**
printing `OK. 0 gate record(s) match section 1.4; 0 gate(s) asserted`. The same
program fails any gate that is `green with units 0` as "vacuous (M2-C-2)".

Not reachable through the shipped harness, measured: both arms' expectation tables
are non-empty shell literals, so E1 and E5 (real table) are correctly rejected.
That is why this is LOW. The cheap closure is a single line refusing to exit 0 with
`expectedIds.length === 0`.

### Observations, not findings

- O-1: the guard on the guard checks derivability, not discrimination. D9 above,
  with counts.
- O-2: probe-3 survives both D1 and D2, so it is a third MEMBER of the class, not a
  third leg. The test's own comment already says the leg claim rests on probes 1
  and 2, so nothing is misstated.
- O-3: dropping the union's dedup is undetected and harmless. D11 above.

## Answer to the single question

**The new witness IS a witness. Vacuity has not moved into the three probes.**

On BOTH arms, all three probes exit nonzero, print itemised findings, and every one
of those findings carries the harness's own default-spec reason (foreign 0). The
reason is derived live, not copied: rewording it wholesale keeps the test green
with the new value (D5), breaking the derivation reddens it (D7), and stopping the
append reddens it (D8). The two legs are orthogonal and it is REPRODUCED on the
main arm as well as the pr arm (D1, D2). Every competing check in the program, the
two the round named and eight it did not, is caught by the uniqueness assertion on
both arms (U1 to U10).

Vacuity has NOT moved to where the brief expected it. It sits one step to the side,
in the third source of the same union, which no probe on either arm and no test in
the repository touches (CR-V-1).

**Verdict: APPROVE, with CR-V-1 (MEDIUM) and CR-V-2 (LOW) to dispose of.**

## Complete suite sentence

Head fdb3120, in a detached reviewer worktree, tree clean (`git status --short`
empty), `scripts/m2-exit-test.sh` and `test/m2-exit-test.test.ts` sha256-verified
equal to their pristine snapshots after every defang.

| toolchain | build state | invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|---|---|
| node v26.6.0 (scratch prefix, `node --version` checked in the running shell) | `dist/` built, `npm run build` exit 0, clean `git status` after | `npm test` | 594 | 594 | 0 | **0** | 0 |
| node v26.6.0, same | `dist/` built, same | bare `node --test` from the repository root | 596 | 596 | 0 | **0** | 0 |

The two-test gap is the documented one: `sandbox/test/greet.test.js`, excluded by
`package.json`'s `test` script pattern and therefore by the `suite` gate. 594 is
what CI and the gate mean; 596 is what gate-list step 3 literally asks for.

## What I ran and what I did NOT run

Ran: the two suite invocations above; the target test under six harness mutations;
a driver replicating the test's probes across both arms under six mutations; the
explicit-leg load-bearing probe; six empty-input probes; eleven competitor probes
on both arms; the arm-delta diff; `npm run build`.

Did NOT run: any gate from gate-registry.yaml (no `tiphys gates run` at all, so I
report NOTHING about citations, scope, clause-map, red-witness, coverage,
credential-scrub, manifest-self-check or agent-rules-drift on this head);
`scripts/check-authored-bytes.mjs` over the tree (my report is untracked, so the
script's `git ls-files` scope would not see it; I checked my own file separately,
result below); the default (v22) toolchain; any CI run; the fix-round contract
walk, which the second reviewer holds.

I did not open, comment on or modify PR #109, and I committed nothing to
`claude/exit-test-harness-assertion-direction`. All mutations were made in a
throwaway worktree and restored by copying from a snapshot; no `git checkout --`
was used anywhere.
