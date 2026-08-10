# Clean-room review of M3-P4, CONTRACT A: criteria execution and witness integrity

Reviewed head: `a3ea4890444e8be2f4a1cbf3a37dc1105a9f587f` on branch
`claude/m3-p4-report-and-work-history`. Merge base with `origin/main`:
`c7a7ce97e03fc0788c92b401de92f0f4a7b8ee0d`. The branch had NOT moved when this
review started or finished: `git rev-parse origin/claude/m3-p4-report-and-work-history`
resolved to the same sha both times.

I did not write this code. I fixed nothing. Every row below that says EXECUTED
carries the command I ran and what it returned; every row that says NOT EXECUTED
carries a reason.

**Environment of every measurement in this document**, because a bare number is
an incomplete sentence here: a scratch clone at
`/tmp/.../scratchpad/crA-m3p4` (NOT the main checkout), node **v22.22.2** from
`/opt/node22/bin` (checked with `node --version` in the shell that ran each
command), npm 10.9.7, `dist/` **built** (`npm run build` EXIT 0), `node_modules`
symlinked to the main checkout's and REMOVED before the cleanliness claim below.

**Non-ASCII declaration.** No captured output pasted in this document contained
U+2139, U+2716 or U+2714: every suite figure here was extracted with
`grep -E '^# (tests|pass|fail|skipped|todo)'`, which selects only ASCII summary
lines. Nothing was transliterated and nothing was hand-written.

**Finding id allocation.** The highest `CR-nnnn` in the tree is `CR-1515`
(measured: `grep -rhoE 'CR-[0-9]{3,4}' . | sort -u | sort -n | tail -1`), so this
review allocates from `CR-1520`. No id is reused.

---

## Verdict

**CHANGES REQUIRED**, on one medium finding (CR-1520) whose remediation is a
document edit rather than a code change. Every acceptance criterion I could
execute passed, every schema guard I probed is real, and I supplied by hand the
five witness arms the work history claims and the tests do not take, so the
guards behind those five rows are confirmed rather than left open.

| id | severity | one line |
|---|---|---|
| CR-1520 | **medium** | The work history's witness table claims five "keyword removed (then GREEN)" arms that no test takes. The guards are real (I took all five myself); the table is what overstates |
| CR-1521 | low | VF-1's citation `src/validate.ts:616` describes the MERGE BASE but resolves at HEAD to a line this phase itself changed, where half the sentence is now false |
| CR-1522 | low | `scripts/m2-exit-test.sh:879` is cited for "its own comment"; line 879 is `local dir="${evidence}/pr-bundle"` and the comment begins at line 880 |
| CR-1523 | informational | Criterion 6's literal command is bare `node --test`; the work history discharges it with `npm test` only. I measured the third axis: 537 tests, 535 pass, 2 skipped, EXIT 0 |
| CR-1524 | informational | Criterion 2(e)'s diagnostic names `#/findings/0` and not the missing `counter-experiment`. A real cost of declared deviation 1 that the deviation does not record |
| CR-1525 | informational | The plan's criterion 2c(a), (b) and (c) are ONE schema shape, not three. The structural difference the criterion asks for is supplied by the implementer's own within-kind members, not by the three kinds |

---

## Executed vs not, one row per criterion

| criterion | executed? | command and result |
|---|---|---|
| 1. `tiphys validate` exits 0 on each new example | **EXECUTED** | `node bin/tiphys.ts validate --type <t> templates/<t>.example.yaml` for `report`, `final-report`, `work-history`: **EXIT 0** each; the same three under `--type auto`: **EXIT 0** each. Six runs, six zeros |
| 1. the FOURTH example | **EXECUTED AS FAR AS IT EXISTS** | There is no fourth validatable instance. `templates/warnings.md` is markdown by the plan's own justified exception at delivery/plan/kernel-plan-m3.md:569 and has no schema. Declared as deviation 3 in the work history and I agree with the disposition |
| 2(a) green requires the wrapper exit code | **EXECUTED** | Through the real CLI: absent exit code **EXIT 1**, `INVALID #/gate-results/0/wrapper-exit-code required property wrapper-exit-code is missing`; second member `wrapper-exit-code: 1` **EXIT 1**, `value 1 does not equal the required constant 0`. Keyword-removal arm present in the test (test/report-contract.test.ts:198) |
| 2(b) environmental claim requires evidence | **EXECUTED** | `evidence: []` **EXIT 1**, `array has 0 items, fewer than the required minimum 1`. Second member (`evidence` absent) **EXIT 1**, `required property evidence is missing`. See CR-1520: the second member's removal arm is claimed and not taken; I took it (result below) |
| 2(c) incident requires exposure window | **EXECUTED** | **EXIT 1**, `INVALID #/honest-failures/0/exposure-window required property exposure-window is missing`. Removal arm present (test/report-contract.test.ts:438) |
| 2(d) contradiction requires a stop | **EXECUTED** | **EXIT 1**, `INVALID #/verification-first/0/stopped-and-reported required property stopped-and-reported is missing`. Removal arm present (test/work-history.test.ts:227). Second member's removal arm claimed and not taken; I took it |
| 2(e) universal claim requires a counter-experiment | **EXECUTED** | `analysis` carrying `always` **EXIT 1**, `INVALID #/findings/0 value matches no permitted alternative here`. Removal arm on `$defs.finding.oneOf` present (test/report-contract.test.ts:485). See CR-1524 on the diagnostic's wording |
| 2(f) unpinned finding labelled | **EXECUTED** | **EXIT 1**, `INVALID #/findings/0/pinned-evidence required property pinned-evidence is missing`. Removal arm present (test/report-contract.test.ts:524) |
| 2b(a) parity arithmetic, Kind B | **EXECUTED** | **EXIT 1**, `INVALID #/gate-results/0 discovered 600 does not equal passed + failed + skipped + did-not-run = 507 (check: report-parity-arithmetic)`. The `(check: <id>)` suffix the criterion demands is present. Deregister/re-register arm present (test/report-contract.test.ts:283) |
| 2b(b) final-report parity, Kind B | **EXECUTED** | **EXIT 1**, `INVALID #/inputs/2 finding V-3 has no row in input-findings, so the table has a hole (check: final-report-finding-parity)`. Deregister/re-register arm present (test/report-contract.test.ts:333) |
| 2c(a),(b),(c) three claim kinds need a construction | **EXECUTED (impossibility through the CLI; all three through the suite)** | `kind: impossibility` with no settlement **EXIT 1** naming `#/claims/0/settled-by`. The suite runs the same three-member block for `impossibility`, `coverage` and `remedy` (test/report-contract.test.ts:584). See CR-1525 |
| 2c(d) the kind enum is closed | **EXECUTED** | `kind: note` **EXIT 1**, and the diagnostic NAMES the vocabulary: `value "note" is not one of the permitted values "universal", "impossibility", "coverage", "remedy", "open-question"` |
| 2c(e) the PAIR, in opposite directions | **EXECUTED, BOTH DIRECTIONS** | `open-question` with no `settled-by`: **EXIT 0**. The same entry carrying an `executed-construction`: **EXIT 1**, `executed-construction property executed-construction is not permitted here` |
| 2d(a) mechanism-vs-finding NOT claimed | **EXECUTED AS AN AUDIT** | The plan says (a) is explicitly not claimed. I grepped the work history and the schema for a contrary claim and found none: the schema's `$comment` says `NO SCHEMA CAN TELL A MECHANISM FROM A FINDING` and the work history's residue 1 says the same. **No finding.** The criteria table row reads "MET by not claiming it", which is the honest form |
| 2d(b) fix round requires `not-covered` | **EXECUTED** | **EXIT 1**, `INVALID #/fix-round/not-covered required property not-covered is missing`. Removal arm present (test/report-contract.test.ts:751). Second member (`mechanism`) claimed and not taken; I took it |
| 2d(c) derivation output absent or empty | **EXECUTED, BOTH MEMBERS** | empty: **EXIT 1** on both `pattern \S` and `minimum length 1`; absent: **EXIT 1**, `required property output is missing`. Removal arm present for the EMPTY member only; the ABSENT member's arm is claimed and not taken; I took it |
| 2d(d) the template carries real multi-line output | **EXECUTED** | `node --test test/report-contract.test.ts` EXIT 0, 22 tests, and I read the assertion: at least three non-empty lines, every one matching `^[a-z/.-]+\.ts:[0-9]+:`, over `templates/report.example.yaml`'s own `fix-round.derivation.output` |
| 2e the empty-string class, three members | **EXECUTED, ALL THREE** | m1 top-level `no-findings-statement: ""` **EXIT 1**; m2 array-element `deviations[0].why: ""` **EXIT 1**; m3 whitespace block scalar `exposure-window: "\n  "` **EXIT 1** on the PATTERN only, which is the arm that shows the two keywords are not redundant. Cross-document member `fix-round[0].not-covered: ""` in a work history **EXIT 1** through the REPORT schema's keyword |
| 2e, the `minLength`-removed direction | **EXECUTED for m1, m2', m3; TAKEN BY ME for m2** | See CR-1520 |
| 3. the fixture is a verbatim capture | **EXECUTED** | The recorded head `9fd800a597993b4d947d57b7367ac8e14c808b22` IS a real commit on this branch (`git cat-file -t` returns `commit`; it is "M3-P4: open the work history beacon"). `counts.mapping` is byte-identical to `MAPPING_STATEMENT` at src/gates/suite.ts:346. The wrapper's own identity holds over the capture: 505 + 0 + 2 + 0 + 0 == 507. `stdout.txt` and `counts.json` agree. The report example's gate result IS those five numbers |
| 4. the M2-P6 coverage checker in parity mode | **EXECUTED INDEPENDENTLY of the phase's test** | I called the unmodified `checkFindingOutcomeParity` (src/gates/coverage.ts:599) from a subprocess of my own: shipped template **EXIT 0**, `{"ok":true,"checked":6,...}`; a copy with `input-findings[2]` removed **EXIT 1**, `{"ok":false,"checked":6,"missing":["V-3"],...}`. The orphaned id is named, which is what the criterion asks |
| 5. `templates/warnings.md` reaches `brief.md` | **EXECUTED** | `node --test test/work-history.test.ts` EXIT 0, 6 tests, 6 pass, 0 skipped. I read the test: it runs a real `tiphys init` plus a real `tiphys spawn` against a real scratch git clone, copies the shipped template byte for byte, and asserts `brief.includes(template)` for the WHOLE text plus a separate assertion on the tail (`GIT_AUTHOR_`) so a truncating consumer cannot pass |
| 6. `node --test` exits 0 | **EXECUTED ON ALL THREE AXES** | See the suite section below |
| 6. clause map resolves this phase's NINE rows | **EXECUTED** | Diffed the registry against the merge base: **exactly 9 rows added**, all `"phase": "M3-P4"`: R-035, R-049, R-052a, R-057a, R-083a, R-085, R-086, R-088, R-089a. The gate: green, **27 rows checked, 47 pending a phase not yet in force** |
| 6. earlier mappings still resolve | **EXECUTED** | Same gate run: 27 rows checked is 18 (base) + 9 (this phase) and the gate is green over all of them, so the 18 earlier rows still resolve |

### Things the contract told me to check specifically

| item | result |
|---|---|
| the `scope` gate's FALSE not-applicable in a detached worktree | **AVOIDED AND MEASURED.** Branch checked out under its real name; `/^claude\/m[0-9]+-p[0-9]+-/` matches it (`true`). Gate run with `--phase m3-p4` and `--base $(git merge-base HEAD origin/main)`: **green, units 18, unitLabel "changed paths audited"**, detail names the declaration read at merge base `c7a7ce9` with sha256 `6ace3c08...`. Not not-applicable |
| the phase declaration amended on its own branch | **NO.** `git diff --stat c7a7ce9..a3ea489 -- delivery/plan/phase-declarations/m3-p4.json` is empty |
| a count pinned over an append-only registry | **NO.** test/checks.test.ts:452 builds the expected clause-map count from `Object.keys(map).length` at run time. The only pinned counts I found in the test tree are test/checks.test.ts:564's `74` rows and `12` M3-P1 rows, which are over the PLAN's Appendix A (a fixed authored document), not over an append-only registry, and are pre-existing |
| a witness that has silently stopped witnessing (T-011) | **STRUCTURALLY GUARDED, and I read the guard.** A stale `find` is not silent: src/witness/run.ts:752 returns `ok: false` with `mutation find text ... does not occur in <file>`, and the gate turns a non-green stored evaluation into a reason (src/gates/red-witness.ts:350). This phase adds ZERO own witness specs, so the exposure is the 31 stored ones, all of which the gate re-proved red |
| a witness red for the WRONG REASON | **HUNTED BY READING EVERY FAILURE TEXT, not the exit code.** I ran nineteen dangerous instances through the real CLI and read all thirty-one diagnostic lines they produced (printed in full in my capture). Every one names the property under test. None is a uniqueness error, a compilation refusal or an unrelated `required`. Separately, the tests themselves assert with `assert.deepEqual` on the EXACT diagnostic list rather than on a match or a length, which is the strongest available form of this protection |

---

## The suite, on all three axes, with the SKIPPED count beside the pass count

One head, one toolchain, one build state, two invocations:

| toolchain | build state | invocation | tests | pass | fail | **skipped** | exit |
|---|---|---|---|---|---|---|---|
| node v22.22.2 | `dist/` built | `npm test` | 535 | 533 | 0 | **2** | 0 |
| node v22.22.2 | `dist/` built | bare `node --test` from the repository root | 537 | 535 | 0 | **2** | 0 |

The two-test gap is NAMED, not inferred. I diffed the passing-test names between
the two logs:

```
greet rejects an empty name
greet returns a greeting for a name
```

which is `sandbox/test/greet.test.js`, exactly the tracked sandbox fixture
CLAUDE.md's warning 12 predicts, excluded by `package.json`'s
`node --test "test/**/*.test.ts"`.

The two SKIPPED are also named rather than assumed:

```
ok 136 - doctor in a healthy fleet exits 0 # SKIP local Node v22.22.2 is below the kernel floor >=26
ok 140 - doctor with gh absent exits 0 under the generic profile # SKIP local Node v22.22.2 is below the kernel floor >=26
```

Two, not nine, which is the floor axis and not the build-state axis, and matches
what the work history claims. **I did not fetch a node 26 toolchain**; the work
history did, and reports 535/535/0 skipped there. I did not re-verify that arm
(see "What this review did NOT cover").

New test files, run standalone: `test/report-contract.test.ts` 22 tests 22 pass
0 skipped EXIT 0; `test/work-history.test.ts` 6 tests 6 pass 0 skipped EXIT 0.
22 + 6 == 28, which equals the number of behaviors this phase appends (measured
below), so no registered behavior is a name without a test.

Registry hygiene, measured against the merge base rather than asserted:
`test/behaviors.json` 513 -> 541, **28 added, 0 removed, 0 reordered**. All 20
names the plan lists are present; the 8 extras cover criteria 1, 3, 4, 2d(d) and
the T-012 timing guard. `delivery/requirements/clause-map.json` 18 -> 27, 9
added, 0 removed.

Working tree, with the `node_modules` symlink REMOVED first (a symlink is
untracked and `node_modules/` in `.gitignore` is a directory-only pattern, so it
would otherwise have polluted this claim):

```
$ git status --short
?? delivery/review/clean-room-m3-p4-criteria.md
```

which is this file and nothing else. `dist/` is ignored at `.gitignore:2`.

Both ASCII checks, over the 18 changed paths and then repo-wide over
`git ls-files` minus the two path-scoped exemptions (503 files):

```
grep -raP '[^\x00-\x7F]'                  EXIT 1, 0 lines
grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]'  EXIT 1, 0 lines
```

`git diff --stat c7a7ce9..a3ea489` reports no file as `Bin`.

---

## CR-1520 (MEDIUM): five rows of the witness table claim an arm no test takes

**The claim.** `delivery/work-history/m3-p4.md` lines 336 to 361 are a table
whose third column is headed **"keyword removed (then GREEN)"**. Twenty-four
rows sit under it. Five of them name a keyword that no test in this phase
removes.

**The derivation, in full rather than summarised.** I read both test files end to
end and cross-checked every `readSchema(...)` / `delete` site against every table
row. The enumerating command:

```
$ grep -n 'readSchema(' test/report-contract.test.ts
```

returns 20 sites. Three are not arms (the helper definition at :91 and the two
default parameters at :108 and :115), leaving 17 defang arms, of which one
(:979) is the final-report section. The same command over
`test/work-history.test.ts` returns 10 sites, of which 3 are defang arms (:227,
:281, :322) and the rest are the helper, its defaults, the no-companion
dangerous state and the shared-definition reads. Mapping each arm to the row it
discharges leaves these five rows with no arm:

| work-history line | row | dangerous instance | claimed keyword | arm in the tests? |
|---|---|---|---|---|
| 341 | 2(b) second member | `evidence` absent entirely | `required` entry | **NO.** test/report-contract.test.ts:411 asserts red and the test ends at :423 |
| 344 | 2(d) second member | `contradicts-plan` absent | `required` entry | **NO.** test/work-history.test.ts:248 asserts the instance is STILL red under the if/then-defanged schema, which is a different and weaker property |
| 354 | 2d(b) second member | `fix-round` with no `mechanism` | `required` entry | **NO.** test/report-contract.test.ts:762 asserts red; the test ends at :767 |
| 355 | 2d(c) member 1 | `derivation.output` absent | `required` entry | **NO.** The only defang in that test (test/report-contract.test.ts:790) removes `minLength` and `pattern` and is asserted against the EMPTY instance, not the absent one |
| 358 | 2e member 2 | `deviations[0].why: ""` | `minLength` and `pattern` | **NO.** test/report-contract.test.ts:856 asserts red only |

**What the derivation did NOT cover.** I did not audit the equivalent tables in
earlier phases' work histories; my scope is M3-P4's. I did not check whether a
defang for these keywords exists in any test file OUTSIDE the two this phase
adds; the mapping above is over `test/report-contract.test.ts` and
`test/work-history.test.ts` only, and a pre-existing arm elsewhere would not be
this phase's witness in any case.

**Why this is not merely cosmetic.** This is the phase whose declared subject is
what a false claim is allowed to look like. The repository rule is that a work
history is the artifact a later reviewer trusts and is never softened, and the
claim grep exists to catch exactly an unbacked assertion. The grep's pattern
does not scan a table row, so nothing mechanical could see this: I am the check,
which is the same position the citations gate leaves me in for this file.

**Why it is medium and not high: the guards are all real, and I proved it.** I
took all five arms myself, in memory, against schema files whose md5 I captured
before and verified after (`md5sum -c` returned `OK` for
`schemas/report.schema.json` and `schemas/work-history.schema.json`, so nothing
on disk was mutated):

```
(A) environmentalClaim.required['evidence'] removed
   RED:      ["INVALID #/environmental-claims/0/evidence required property evidence is missing"]
   DEFANGED: []
   RESTORED: ["INVALID #/environmental-claims/0/evidence required property evidence is missing"]
(B) fixRound.required['mechanism'] removed
   RED:      ["INVALID #/fix-round/mechanism required property mechanism is missing"]
   DEFANGED: []
   RESTORED: ["INVALID #/fix-round/mechanism required property mechanism is missing"]
(C) fixRound.derivation.required['output'] removed
   RED:      ["INVALID #/fix-round/derivation/output required property output is missing"]
   DEFANGED: []
   RESTORED: ["INVALID #/fix-round/derivation/output required property output is missing"]
(D) verificationFirst.required['contradicts-plan'] removed
   RED:      ["INVALID #/verification-first/1/contradicts-plan required property contradicts-plan is missing"]
   DEFANGED: []
   RESTORED: ["INVALID #/verification-first/1/contradicts-plan required property contradicts-plan is missing"]
(E) deviation.properties.why minLength+pattern removed
   RED:      ["INVALID #/deviations/0/why value \"\" does not match the required pattern \\S",
              "INVALID #/deviations/0/why value \"\" is shorter than the required minimum length 1"]
   DEFANGED: []
   RESTORED: (the same two lines)
```

So no guard is missing and no criterion is unmet by its own letter. Criterion 2
demands removal-and-restoration per criterion LETTER, and every letter (a) to
(f) has one. Criterion 2e demands both directions per MEMBER, and its
array-element member is discharged by the cross-document
`fix-round[0].not-covered` arm at test/work-history.test.ts:281, which is also an
array-element scalar and is the stronger of the two because it defangs the
companion document.

**The alternative reading, stated so the orchestrator can weigh it.** The third
column could be read as "the keyword that guards this row" rather than "the
keyword this row's arm removed". If that is what was meant, the column HEADER is
wrong rather than the rows. Either way the artifact does not let a reader tell
which rows were executed from which were identified, and in a witness table that
distinction is the entire content.

**Remediation, and it is cheap.** Either split the column into "guarding
keyword" and "removal arm taken (yes/no)", or add the five arms to the two test
files. I have supplied the evidence for all five above, so this need not be a
code fix round.

---

## CR-1521 (LOW): a base-state claim citing a head line the phase itself moved

`delivery/work-history/m3-p4.md:47` reads:

> As shipped at c7a7ce9, `compileSchema` builds a FRESH Ajv per schema document
> and adds nothing else to it (src/validate.ts:616)

The citation resolves. At this head, `src/validate.ts:616` is `const ajv =
makeAjv();`, which supports the first half. It does not support the second half:
lines 617 to 619 at this head are

```
    for (const companion of companions) {
      ajv.addSchema(companion);
    }
```

so at the cited line's own head the Ajv demonstrably does have something else
added to it. The sentence is true of the merge base and the citation is to the
head. Measured: at `c7a7ce9` the same statement sits at line 574 and
`compileSchema`'s signature at line 568, which is where the citation originally
pointed before the phase's own citation pass re-pointed it. The re-point moved
it to a different construct AND into code the phase itself wrote.

This is the born-stale class the contract sends me after, in its subtler form: not
a citation that fails to resolve, but one whose resolution refutes half of what
it is cited for. Remediation: cite the base (`git show c7a7ce9:src/validate.ts`
line 568) or say in the sentence that the head no longer reads that way.

## CR-1522 (LOW): a citation to a comment that is not at the cited line

`delivery/work-history/m3-p4.md:203` reads:

> the harness records the runner's exit code without letting it decide the
> outcome, stated in its own comment at scripts/m2-exit-test.sh:879

Line 879 is `  local dir="${evidence}/pr-bundle"`. The comment it means begins at
line 880 and runs to 885. The claim itself is TRUE and the comment does say what
is claimed; the pointer is off by one and lands on a non-comment line. This is
the failure mode the phase's own citation pass names ("a checker that only asked
does this line exist would have passed all three"), surviving that pass in one
place.

## CR-1523 (INFORMATIONAL): the third suite axis was not the one measured

Criterion 6's literal text is "`node --test` exits 0". The work history's
three-axis table names the invocation `npm test` and stops there, which is the
INVOCATION axis declared but the criterion's own command not run. I ran it: bare
`node --test` from the repository root gives 537 tests, 535 pass, 0 fail, 2
skipped, EXIT 0, and I named the two extra tests above. Both sentences are true
of different commands. No defect; the record is now complete.

## CR-1524 (INFORMATIONAL): deviation 1 has a diagnostic cost it does not record

Criterion 2 asks each rejection to exit 1 "naming the offending pointer". Every
one does. But criterion 2(e)'s is the only rejection in the set whose diagnostic
does not also name the FIELD:

```
2e-universal-always  EXIT 1
    INVALID #/findings/0 value matches no permitted alternative here
```

against, for example, the claim rule, where the schema's own `$comment` at
schemas/report.schema.json:243 says the `if`/`then` "exists beside the `oneOf`
below so that the diagnostic NAMES `settled-by`". The finding object cannot do
that because its one `if`/`then` slot is spent on T-004's coupling, which is
exactly declared deviation 1. The criterion is MET on its letter (the pointer is
named). The work history's deviation 1 records the FORM change and not this
consequence, and a reader hitting the diagnostic in anger will not know why it is
less helpful than its neighbours.

## CR-1525 (INFORMATIONAL): 2c(a), (b) and (c) are one shape, not three

The plan says "Three structurally different members of the claim class are
witnessed across (a), (b) and (c)". In the shipped schema, `impossibility`,
`coverage` and `remedy` are the same `oneOf` branch under one three-value enum
(schemas/report.schema.json:271 to 285), guarded by the same keywords and
rejected by the same code path. They are three spellings of one shape, which is
the thing "one witness is not a class" warns against.

The implementer's own construction is what saves it, and it is worth naming
because it is better than the plan's: within EACH kind, three members redden and
they are guarded by THREE DIFFERENT keywords (the claim's `then` for "no
settlement", the claim's `oneOf` for "settlement of the wrong shape", and
`settledByConstruction`'s own `required` for "construction with no output"). The
work history records at line 376 that the third was discovered by taking the arm
and watching it stay red, not by assuming. That is a genuine class witness. **No
change requested**; recorded so a later reader does not credit the wrong
decomposition.

---

## The citation resolution pass, published rather than summarised

`delivery/work-history/` is outside the `citations` gate's `documents` globs
(src/gates/citations.ts:232, which lists five `delivery/**` trees plus
`delivery/STATE.md` and neither `work-history` nor `review`), so nothing in this
repository checks this file's citations and I am the only check. The rationale
for the exclusion (src/gates/citations.ts:180) covers DRIFT and does not cover
born-stale.

I extracted every `path:line` token from `delivery/work-history/m3-p4.md`
OUTSIDE backticks and outside fenced blocks, resolved each against THIS head, and
printed the line so that "the line exists" and "the line means it" are two
answers. Result: **31 tokens, 0 unresolvable**, which matches the work history's
own claim of `tokens=31 unresolvable=0`. Two of the 31 resolve to a line that
does not mean the cited thing (CR-1521 and CR-1522). The other 29 do; the ones
worth showing because they carry weight:

| cited | line at head | verdict |
|---|---|---|
| delivery/plan/kernel-plan-m3.md:921 | `### 2.3 Two kinds of check, and what the red-witness rule demands of each` | means it |
| src/validate.ts:535 | `/* No loadSchema: an unresolved remote reference fails compilation` | means it |
| src/validate.ts:688 | `const remote = /^[a-z][a-z0-9+.-]*:/i.test(reference);` | means it |
| src/gates/coverage.ts:599 | `export function checkFindingOutcomeParity(` | means it |
| src/gates/coverage.ts:706 | `const VALUE_FLAGS = ["--result", "--evidence", "--config"];` | means it, and it is why deviation 2 exists |
| src/commands/validate.ts:93 | `export const COMPANION_TABLE: ReadonlyMap<string, readonly string[]> = new Map([` | means it |
| src/checks.ts:1623 / :1717 / :1774 | the two check definitions and the registry array | mean it |
| src/gates/run.ts:1191 | `} else if (requiredNotApplicable.length > 0) {` with `exitCode = EXIT_NOT_APPLICABLE;` on the next line | means it: this is why the runner exits 20 |
| src/gates/citations.ts:232 | `documents: [` heading exactly the six globs described | means it |
| scripts/m2-exit-test.sh:836 | `{"id": "citations", "expect": "green|not-applicable", "required": true, "diffScoped": true},` | means it |
| scripts/m2-exit-test.sh:353 | `if (spec.diffScoped === true && row.status === "not-applicable") {` | means it |
| schemas/README.md:39 | `| Keyword | Note |`, the vocabulary table's header | means it, just barely: it is the table's first line rather than a row |
| test/checks.test.ts:452 | the run-time-derived clause-map count | means it, and it is the evidence for the registry-hygiene claim |
| test/report-contract.test.ts:251 | the exact `discovered 507 ... = 902` assertion C-4 quotes | means it |
| src/validate.ts:111 | `export const AUTHORING_VOCABULARY: readonly string[] = [` | means it. I counted: **16 entries, and `maxItems` is not among them**, so residue 5 and handback 2 are correct |
| src/gates/suite.ts:346 | `export const MAPPING_STATEMENT =`, whose value through :350 ends `identity: pass + fail + skipped + todo + did-not-run == reported` | means it |
| delivery/plan/kernel-plan-m3.md:569 | the justified-exception row for `warnings.md` | means it, and it is what makes deviation 3 correct |

One further imprecision not worth a finding: `src/validate.ts:600` is cited for
"`compileSchema`, `validateInstance` and `validateToLines` take an optional
`companions` list". Line 600 is inside the doc comment that documents the
companion cache key; the signature is at 606 to 609. The citation lands in the
right block for the right reason.

## The work history's own claims, re-derived rather than believed

The work history files claims C-1 to C-8 in the form this phase ships. I
re-executed the two that are settled by construction or counter-experiment and
that I could reach:

**C-3 (impossibility), reproduced exactly:**

```
$ node --input-type=module -e "import {compileSchema} from './src/validate.ts'; ... compileSchema(s)"
INVALID # schema reference report.schema.json#/$defs/gateResult does not resolve
$ (the same with compileSchema(s, [reportSchema]))
compiled
```

**C-6 (universal), re-run as the counter-experiment it names**, with my own walk
rather than the implementer's:

```
minLength sites: 62 without an adjacent pattern: 0
EXIT 0
```

Same two numbers. The claim holds and the experiment that would falsify it is
the one that was run.

I ran the claim grep over the work history myself:

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m3-p4.md
```

22 hits, the same count the work history reports. I read every one. Each is
either a quoted check message (`parity cannot be computed`), a literal token
under test (`always`, `never`, `every` in the tables describing the pattern), a
claim with an adjacent captured command, or an explicitly OPEN row. The one I
looked hardest at, line 569 ("the round cannot be REPORTED without a
`not-covered` and a NON-EMPTY `derivation.output`"), is settled by two arms I
executed myself: both exit 1 through the real CLI. The narrowing from "a full
one" to "a NON-EMPTY one" is the correct weakening and I confirmed the schema
reaches no further: `minLength` plus `pattern: \S` reaches absent and empty, and
a one-line summary satisfies both.

## Residues and handbacks: audited, not re-litigated

The work history hands four things back and states eight residues. I checked the
two that are load-bearing for whether this phase is honest about its own reach:

- **Residue 6, the `todo` bucket.** Confirmed real and correctly handed back
  rather than improvised. The captured wrapper's own counts carry
  `"todo": 0` beside five other buckets, and its `MAPPING_STATEMENT` at
  src/gates/suite.ts:346 states a SIX-term identity, while the plan's step 1
  names five count fields and `$defs.gateResult` ships exactly those five.
  **Settled by construction rather than by reasoning.** I built the honest
  record of a run that reported 507 with `todo: 3` (so pass 502, fail 0,
  skipped 2, did-not-run 0) and validated it:

  ```
  schema:        []
  derived check: ["INVALID #/gate-results/0 discovered 507 does not equal
                  passed + failed + skipped + did-not-run = 504
                  (check: report-parity-arithmetic)"]  failed: true
  ```

  and the alternative, recording the sixth bucket where it belongs:

  ```
  with a todo field: ["INVALID #/gate-results/0/todo property todo is not
                      permitted here"]
  ```

  So both roads are closed today and the gap is exactly as described.
  Inventing a sixth field would have been an implementer improvising on a plan
  silence; it was not done. Correct call.
- **Residue 5 / handback 2, the missing `no-findings-statement`.** Confirmed by
  printing the vocabulary rather than by reading about it:

  ```
  $ node --input-type=module -e "import {AUTHORING_VOCABULARY} from './src/validate.ts'; ..."
  16 ["$ref","additionalProperties","const","contains","enum","if","items",
      "minItems","minLength","oneOf","pattern","properties","required","then",
      "type","uniqueItems"]
  ```

  Sixteen entries. There is no `maxItems`, no `not`, no `allOf` and no
  `maxProperties`, which are the four keywords I would have reached for to say
  "this array is empty", so I did not find a way to make the field
  conditionally required inside the declared vocabulary either. A third derived
  check would be a new row in the plan's section 2.3 table. The escalation
  rather than the quiet script is the behaviour D-M3-22 asks for.

## What this review did NOT cover

The reviewer's first check on this report is this section, so it is specific.

1. **The adversarial-instance contract.** I did not systematically hunt for a
   FALSE CLAIM the schema accepts. That is contract B's obligation under T-007
   and duplicating it was forbidden. Nothing in my report should be read as
   evidence that no such instance exists; I looked for none.
2. **CI, on either arm.** I ran no GitHub Actions run and read no job steps. I
   report no CI conclusion, green or otherwise. T-009's post-merge `push` run on
   the new `main` head remains owed and unobserved, and it is also the only
   instrument that settles the work history's own C-8.
3. **`scripts/m2-exit-test.sh` itself.** Not run. It needs `gh` and a real
   runner. My reading of it (lines 353, 836, 879) is a reading of source, not an
   execution, exactly as the work history says of its own.
4. **The node 26 floor toolchain.** Not fetched. I measured only node v22.22.2,
   so the work history's 535/535/0-skipped figure on v26.6.0 is inherited from
   its capture and is not independently witnessed here. The two skips I saw are
   consistent with it.
5. **The `red-witness`, `suite`, `coverage`, `credential-*`, `manifest-self-check`,
   `agent-rules-drift`, `deploy` and `migrations` gates.** Not run by me. I ran
   only `scope` and `clause-map` from the registry, plus the full suite. The
   orchestrator's red-witness measurement at `bdff6b2` is inherited; I verified
   only that `bdff6b2..a3ea489` changes exactly one file
   (`delivery/work-history/m3-p4.md`, 882 insertions, 8 deletions) and no source,
   so a witness result taken at `bdff6b2` is transferable to `a3ea489`. That is
   an argument, not a re-run.
6. **The three schemas as documents.** I read `schemas/report.schema.json` in
   full and `schemas/work-history.schema.json` and
   `schemas/final-report.schema.json` only where a criterion or a witness
   reached them. I did not audit the final-report schema's `enumerableSection`
   beyond the one criterion that exercises it.
7. **The four shipped templates' CONTENT.** I checked that the report example's
   gate result equals the captured run and that its `fix-round.derivation.output`
   is multi-line and grep-shaped. I did not verify that every other command
   quoted inside the templates was actually run at the exit code claimed. The
   work history asserts this and names two figures it corrected; I did not
   re-derive them.
8. **`templates/warnings.md`'s content against CLAUDE.md's standing warnings.**
   I verified only that the file reaches a brief verbatim and tail-intact. I did
   not check that its twelve warnings are the right twelve or that they match
   the repository rules file.
9. **Earlier phases' work histories and witness tables.** CR-1520's derivation is
   scoped to M3-P4's two new test files and M3-P4's own table. If the same table
   convention is used elsewhere with the same ambiguity, this review did not
   look.
10. **Performance beyond the one pattern.** I did not re-run the T-012 timing
    measurement at any subject length. I read the test and confirmed its subject
    is a near-miss placed in `analysis` (the guarded field) rather than in a
    field the pattern never sees, which is the specific error the work history
    records having made and fixed.

## The claim grep, run over THIS report

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/review/clean-room-m3-p4-criteria.md
```

14 hits. Every one is a quotation of the artifact under review (the `note`
fixture's statement "This arm cannot be forced here.", the residue sentences,
the derived check's own message `parity cannot be computed`), a token being
discussed as data (`always`, `never` in the universal-quantifier rows), or a
claim of my own that carries its captured construction in the same paragraph:
the `todo > 0` sentence and the `no-findings-statement` sentence were both
rewritten after this grep, the first to carry the constructed instance and its
two diagnostics, the second to print the vocabulary and to say "I did not find a
way" rather than "no keyword can". Three further sentences of mine that could be
read as closing a question, restated here as the open questions they are:

- I did not find a way for a stale witness `find` string to pass silently, given
  src/witness/run.ts:752. I did not attempt to construct one, so this is a
  reading of the guard and not a demonstration that none exists.
- I did not find a count pinned over an append-only registry in the test tree. My
  search was `grep -rnE` over `test/*.ts` for row and behavior count shapes plus
  a read of test/checks.test.ts:440 to :470 and :539 to :564. A count expressed
  in a form my patterns do not match would not have appeared.
- I did not find a diagnostic among the nineteen I executed that was red for the
  wrong reason. Nineteen instances is not the whole space of dangerous instances
  and I did not enumerate that space; contract B holds that obligation.

---

## Verdict: CHANGES REQUIRED

One medium (CR-1520) and two low (CR-1521, CR-1522), all three in
`delivery/work-history/m3-p4.md` and none in the shipped kernel. Every
acceptance criterion I could execute is MET on its own letter, every schema
guard I probed is real, the scope and clause-map gates are green under the real
branch name, the suite is green on both invocations with the skips named, and
both ASCII checks are clean repo-wide.

The work history is, by a distance, the most careful one this reviewer has read
in this repository: it declares its deviations, states its residues, hands back
two plan questions rather than improvising them, runs its own citation pass and
reports four citations it got wrong. CR-1520 is a defect in exactly that
artifact's most load-bearing table, which is why it is medium rather than low,
and why the fix is worth taking before merge rather than after.
