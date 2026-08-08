# Clean-room review: M3-P1, reviewer A (coverage and execution)

- head: `3979557`
- worktree: `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/wt-m3p1-cr-a`
- toolchain: node v26.6.0 (floor), npm 11.18.0, verified in the shell that runs
  every command below.
- contract: the plan's acceptance criteria in `delivery/plan/kernel-plan-m3.md`
  section M3-P1 (lines 1405-2048), including the DR-0013 validator block, walked
  and EXECUTED. Not the implementer's account of them. The work history is read
  last.
- sibling reviewer B covers hazards and adversarial construction.

Appended incrementally as the walk proceeds (T-008).

## Log

- `npm ci` exit 0, 10 packages, 0 vulnerabilities, no EBADENGINE line.
- Plan section read in full before any source file.
- `npm run build` exit 0; `git status --porcelain` afterwards names only this
  review file.
- `npm test` from a tree with `dist/` and `*.tsbuildinfo` removed: exit 0,
  tests 446, pass 437, fail 0, skipped 9. All nine skips are the pre-existing
  M2 `dist/ is absent; run npm run build first` guards, enumerated from the TAP
  reporter, so they are accounted for rather than unexplained.

---

## CR-M3P1-A-001 (high): the official-suite criterion is vacuous for seven of the sixteen declared vocabulary keywords

- location: `test/schema-suite.test.ts:88-93` (the skip-on-compile-failure arm)
  and `test/schema-suite.test.ts:139-162` (the guard that is supposed to stop it)
- mechanism (not the finding): **a case-selection predicate that drops a case
  for a property of the SCHEMA rather than of the keyword under test, guarded by
  a coverage assertion that measures FILE PRESENCE instead of CASES EXECUTED.**
  The suite writes its schemas as `{"properties": {...}}` with no sibling
  `type`; Ajv `strictTypes` refuses to compile that; the harness therefore
  records a skip and moves on. Because the suite writes nearly every
  object/array/string keyword file that way, whole keywords disappear from the
  run. The exact-count assertion (`executed === 200`) catches DRIFT from today's
  number but cannot see that today's number already covers nothing for seven
  keywords, and the second test only asserts `readdirSync(suiteDir)` contains a
  filename, which is true for a file whose every group is skipped.
- what the plan requires: criterion 11 and DR-0013 criterion 11, "Applicable
  cases from the official JSON Schema Test Suite pass for **every keyword in the
  declared vocabulary**". Seven keywords have zero executed cases, so for those
  seven the suite proves nothing and the assertion that says otherwise is green.
- evidence: re-derived with the test's own `skipReason` predicate and the same
  `compileSchema` export, counted per vendored file:

```
$ node scratchpad/percount.ts
VOCAB: ["$ref","additionalProperties","const","contains","enum","if","items","minItems","minLength","oneOf","pattern","properties","required","then","type","uniqueItems"]
additionalProperties.json      groups_total=  9 groups_run=  0 groups_skipped=  9 cases_executed=   0
const.json                     groups_total= 17 groups_run= 17 groups_skipped=  0 cases_executed=  54
contains.json                  groups_total=  7 groups_run=  0 groups_skipped=  7 cases_executed=   0
enum.json                      groups_total= 15 groups_run= 14 groups_skipped=  1 cases_executed=  45
if-then-else.json              groups_total= 12 groups_run=  4 groups_skipped=  8 cases_executed=   8
items.json                     groups_total= 10 groups_run=  1 groups_skipped=  9 cases_executed=   3
minItems.json                  groups_total=  2 groups_run=  0 groups_skipped=  2 cases_executed=   0
minLength.json                 groups_total=  2 groups_run=  0 groups_skipped=  2 cases_executed=   0
oneOf.json                     groups_total= 11 groups_run=  7 groups_skipped=  4 cases_executed=  11
pattern.json                   groups_total=  3 groups_run=  1 groups_skipped=  2 cases_executed=   3
properties.json                groups_total=  6 groups_run=  0 groups_skipped=  6 cases_executed=   0
ref.json                       groups_total= 36 groups_run=  7 groups_skipped= 29 cases_executed=  13
required.json                  groups_total=  5 groups_run=  0 groups_skipped=  5 cases_executed=   0
type.json                      groups_total= 11 groups_run=  8 groups_skipped=  3 cases_executed=  63
uniqueItems.json               groups_total=  6 groups_run=  0 groups_skipped=  6 cases_executed=   0
```

  Zero executed cases: `additionalProperties`, `contains`, `minItems`,
  `minLength`, `properties`, `required`, `uniqueItems`. That is 7 of 16.
  The suite run prints the same class itself as
  `# JSON Schema Test Suite: 200 cases executed, 93 groups skipped`, with lines
  such as
  `# skipped minItems.json: minItems validation: the schema did not compile under the decided policies: strict mode: missing type "array" for keyword "minItems" at "#" (strictTypes)`.
- why HIGH and not cosmetic: four of the seven are the keywords this phase's own
  criteria stand on. `additionalProperties` carries criterion 5 (the
  typo-rejection class), `minItems` carries criterion 5e (`hazard-classes: []`),
  `required` carries criteria 3b, 3c and 5f, and `contains` is one of the three
  keywords DR-0013 criterion 3 singles out by name. The plan's own hazard table
  lists "a derived check registered but never reached, so a cross-document rule
  passes by not running"; this is that shape applied to the external suite, with
  two assertions in place that read as though they prevent it.
- recommendation: make the coverage assertion measure the property that matters,
  i.e. assert executed-cases-per-keyword > 0 for every keyword in
  `AUTHORING_VOCABULARY`, then close the seven holes. The natural closure is to
  compile the VENDORED SUITE with `strictTypes` relaxed for that run only, with
  the reason recorded in `PROVENANCE.md`, since `strictTypes` is a policy about
  what Tiphys may AUTHOR, not about what Ajv must UNDERSTAND. Whichever closure
  is chosen, the per-keyword positive-count assertion is the part that stops
  this recurring. Red witness for the fix: emptying one keyword file must redden
  the named test.

## CR-M3P1-A-002 (medium): `PROVENANCE.md` contradicts what was vendored

- location: `test/fixtures/json-schema-test-suite/PROVENANCE.md:22-25`
- mechanism: a provenance record maintained by hand beside a directory listing
  with no test tying the two together, so the record describes an earlier state
  of the directory.
- what: "What was NOT copied, and why" names `uniqueItems` as a keyword
  "outside the declared vocabulary". `uniqueItems` IS in `AUTHORING_VOCABULARY`
  and `uniqueItems.json` IS vendored. The "What was copied" list enumerates
  fourteen names; fifteen files are present.
- evidence:

```
$ ls test/fixtures/json-schema-test-suite/*.json | wc -l
15
VOCAB: [... , "uniqueItems"]                       # from src/validate.ts
$ grep -n uniqueItems test/fixtures/json-schema-test-suite/PROVENANCE.md
23:- Every keyword file outside the declared vocabulary (maxLength, uniqueItems,
```

- recommendation: correct the record and make the "one file per declared
  keyword" claim an assertion rather than prose. The existing filename test is
  most of the way there and needs the reverse direction as well.

## CR-M3P1-A-003 (medium): `test/status.test.ts` is a binary file to git, so it has no reviewable diff

- location: `test/status.test.ts:141`
- mechanism: literal control bytes embedded in source instead of escape
  sequences, which flips git's binary heuristic for the whole file.
- what: the file carries one raw NUL and one raw SOH byte inside the criterion-7
  "unparseable bytes" fixture string. Git renders the file as
  `Bin 0 -> 9332 bytes` and produces no textual diff, for this phase and for
  every future edit. In a process whose merge authority (DR-0012) rests on two
  independent clean-room reviews of a diff, a test file with no diff is a file
  no reviewer can review by the normal route. It passes criterion 13 because the
  ASCII gate's class does not match those two bytes.
- evidence:

```
$ git diff --stat origin/main -- test/ | grep status
 test/status.test.ts                                |  Bin 0 -> 9332 bytes
$ file test/status.test.ts
test/status.test.ts: data
byte histogram of the file, non-printable bytes only:
    0 (0x00) x1
    1 (0x01) x1
the single line carrying them, control bytes rendered:
  line 141:       "<NUL><SOH> not json at all\n{\"half\": ",
```

- recommendation: express those two bytes as JS escapes. The string is
  byte-identical at runtime, the behavior under test is unchanged, the file
  becomes text and the diff becomes reviewable. Separately, consider widening
  the criterion-13 gate to reject C0 controls other than tab and newline, since
  as written it does not catch this.

## CR-M3P1-A-004 (high): the step-8b top-level handler has no red witness, because criterion 12's two named invocations never reach it

- location: `bin/tiphys.ts:31-41` (the handler), `test/validate.test.ts:340-376`
  (the test registered as `cli-errors-have-no-stack-trace`), criterion 12 of the
  plan.
- mechanism (not the finding): **a witness aimed at the OUTPUT SHAPE
  ("no stack frame on either stream") rather than at the COMPONENT that produces
  it, so the witness is satisfied by any code path that happens to be clean and
  is blind to whether the component under test ran at all.** Both invocations
  criterion 12 names are caught and rendered INSIDE `src/commands/validate.ts`
  and return an exit code, so control never reaches the `catch` in
  `bin/tiphys.ts`. Deleting the handler entirely changes nothing about either.
- what: the phase claims to close the seam `delivery/STATE.md` carries forward
  ("clean presentation of a load-time configuration error ... a seam no M1 phase
  owns"). The handler is really there and really works. But nothing in the suite
  reddens if it is removed, so from the next phase onward it can be deleted,
  reordered, or have its `catch` narrowed and CI stays green. Criterion 12
  states the requirement explicitly and in these words: "removing the step 8b
  handler makes the same invocation print a stack trace, captured and reverted
  (D-M3-21, **both directions**)". The second direction does not hold for either
  named invocation.
- evidence, mutation test of the registered behavior (mutation applied, test
  run, mutation reverted, `git diff --stat -- bin/tiphys.ts` empty afterwards):

```
$ # bin/tiphys.ts reduced to the pre-phase four-line form (handler deleted)
$ node --test --test-name-pattern='no stack frame' test/validate.test.ts
test exit under mutation: 0
[ok] malformed YAML and a non-mapping document each give one diagnostic line, a nonzero exit and no stack frame (586.862833ms)
```

  and the same two invocations run by hand with the handler deleted:

```
$ node bin/tiphys.ts validate --type plan scratchpad/c12/bad.yaml
exit=1
tiphys validate: .../bad.yaml is not valid YAML: Flow sequence in block collection must be sufficiently indented and end with a ]
stack frames: 0
$ node bin/tiphys.ts validate --type plan scratchpad/c12/seq.yaml
INVALID # expected type object but found array
exit=1
stack frames: 0
```

- the fix is one line away, and I found the witness so it is not a research
  task. `tiphys status show` outside a fleet home DOES reach the handler:

```
$ # handler DELETED
$ node bin/tiphys.ts status show ; echo exit=$?
exit=1
file:///.../src/fleet.ts:86
    throw new Error(
          ^
Error: not a fleet home: /... is missing charter/, decisions/, state/, tasks/, worktrees/, projects/, backlog.md
    at loadFleet (file:///.../src/fleet.ts:86:11)
stackframes=7

$ # handler RESTORED
$ node bin/tiphys.ts status show ; echo exit=$?
exit=1
tiphys: not a fleet home: /... is missing charter/, decisions/, state/, tasks/, worktrees/, projects/, backlog.md
stackframes=0
$ git diff --stat -- bin/tiphys.ts     # empty: reverted
```

- recommendation: add that invocation (or any other throw that escapes a
  subcommand) to the test registered as `cli-errors-have-no-stack-trace`, and
  record the handler-deleted capture above in the work history as criterion 12's
  second direction. Keep the two existing members: they witness the YAML
  decode-stage diagnostic (DR-0013 YAML clauses 3 and 4), which is a real and
  different property. They are simply not witnesses for D-M3-21.

## Mutation testing: what DOES guard its behavior

Each mutation was applied to the source, the NAMED test was run alone with
`--test-name-pattern` preceding the positional path, and the file was restored
from a byte copy taken before the edit (never `git checkout --`, per the
standing warning). `git status --porcelain` after the whole set names only this
review file.

| Mutation | Named test | Result |
|---|---|---|
| `src/validate.ts` `coerceTypes: false` -> `true` | validation does not coerce, default, strip or otherwise mutate the input | RED |
| `src/validate.ts` `useDefaults: false` -> `true` | same | RED |
| `src/validate.ts` `removeAdditional: false` -> `"all"` | same | RED |
| `src/validate.ts` `strict: true` -> `false` | an unknown schema keyword fails compilation ... names the keyword | RED |
| `src/validate.ts` `validateSchema: true` -> `false` | a schema that is itself invalid fails meta-schema validation | RED |
| `schemas/plan.schema.json` every `minItems: 1` -> `0` | a phase with an empty hazard-classes array is rejected ... | RED |
| `src/checks.ts` drop `planVerificationFirstPresent` from the registry | an unverified claim whose owning phase has no verification-first step ... | RED |
| `src/checks.ts` `failed:` stops counting `skippedLines` | a derived check that requires a context it was not given is SKIPPED ... | RED |
| `src/plan.ts` `stripGloss` made the identity function | a files-to-touch entry carrying a parenthetical gloss projects to the bare path | RED |
| `src/plan.ts` a sixth key `extra` added to the emitted declaration | the projection ... emits exactly the five camelCase keys, and a sixth key is rejected | RED |
| `src/plan.ts` projection filename stops lowercasing the phase id | the real scope auditor accepts a generated declaration from its merge base ... | RED |
| `scripts/check-clause-map.mjs` missing-row message defanged | deleting a map entry for a row whose phase is in force ... | RED |
| `bin/tiphys.ts` step-8b handler deleted | malformed YAML and a non-mapping document ... no stack frame | **GREEN, see CR-M3P1-A-004** |

## CR-M3P1-A-005 (high): 35 of this phase's 46 behavior registrations do not resolve, and the `suite` gate is RED on this head

- location: `test/behaviors.json:416-461`
- mechanism (not the finding): **the registry's VALUE was written as a
  description of what the test does rather than as the literal string the test
  runner reports, and the check that catches it is a different run from the one
  the phase was measured against.** `npm test` never resolves behavior names;
  only `src/gates/suite.ts` does, from the TAP stream. So the phase can be
  locally green in the run that was watched and red in the run that decides.
  This is T-009 exactly: "a gate result is evidence only for the configuration
  it ran under", and the complete sentence here names the runner.
- what the plan requires: criterion 1, verbatim, "`test/behaviors.json` maps
  every behavior named below to a test present in the run while every previously
  registered mapping still resolves by name". Thirty-five do not.
- evidence, derived independently (parse every `test("...")` literal out of
  `test/*.test.ts`, then look up every behaviors.json value):

```
$ node -e '...enumerate test() names from test/*.test.ts, diff against behaviors.json values...'
behaviors total: 460
UNRESOLVED: 35
  validate-valid-instance  ->  each shipped example validates under its named type and exits 0
  validate-additional-properties  ->  a misspelled property is rejected naming it, at the top level and at a nested level two deep
  validate-auto-type  ->  --type auto resolves from the kind field and is a usage error when there is none
  ... (32 more) ...
  vocabulary-has-suite-coverage  ->  every keyword in the declared vocabulary has a vendored suite file
```

  and reproduced through the project's own gate:

```
$ node src/gates/suite.ts --result ev/suite.json --evidence ev --base origin/main --head HEAD \
    --pin-root src --pin-root bin --pin-root test
suite: red (446 tests reported)
35 finding(s): behavior validate-valid-instance does not resolve: no reported test is named
"each shipped example validates under its named type and exits 0"; ... and 25 more
EXIT=1
```

  and confirmed on the PR head in CI, run 31243412876, head
  `3979557e11a5c590f046cd95edf39a05ad8db724`, event `pull_request`, conclusion
  **failure**:

```
gates: declared 11 applicable 7 verdict 7 green 5 red 2 not-applicable 4 error 0 vacuous 0
gates: 2 gate(s) reported red: suite, red-witness
m2-assert (PR bundle): FAIL with 3 finding(s):
  - [suite] expected status green, observed red (35 finding(s): ...)
  - [suite] is a REQUIRED gate but its status is red, not green
m2-exit-test: FAILED: the PR bundle does not match section 1.4's PR-bundle column (assertion exit 1)
```

  Every one of the 35 is a near-miss paraphrase, e.g. the registered
  "each shipped example validates under its named type and exits 0" against the
  real `test/validate.test.ts:449` name "each shipped example validates under its
  named type and under `--type auto`". Eleven of the 46 happen to match.
- recommendation: replace each value with the exact `test("...")` string. Do it
  by DERIVATION, not by hand: emit the names from the TAP stream and diff, which
  is the same command the gate runs, so a second near-miss is impossible rather
  than unlikely. Then re-run `src/gates/suite.ts` and paste its green output into
  the work history, because `npm test` green is not evidence for this criterion.

## CR-M3P1-A-006 (high): the `red-witness` gate is RED on this head; eight of the thirteen new witness specs carry a member no named test reaches

- location: `witness/*.json` (the thirteen specs added by this phase)
- mechanism: **a witness spec whose `tests[]` list and whose `dangerousStates[]`
  list were assembled separately, so a member mutates an arm that the tests it
  names never execute.** The project's own gate calls this "no named test reaches
  this arm", and it is the CLAUDE.md rule "a witness for a CLASS must redden
  under at least TWO structurally different members of it" failing at the member
  level.
- evidence, CI run 31243412876 on head `3979557`, the gate's own detail:

```
- [red-witness] expected status green or not-applicable, observed red
  (13 witness(es) evaluated (13 own, 0 stored re-evaluated in 0ms);
   witness checks-derived-registry: red: member 0 (src/checks.ts line 116) ... member 1 (line 223)
   witness cli-top-level-error-handler: red: member 0 (bin/tiphys.ts line 35)
   witness gates-validator-engine-retired: red: member 0 (line 524) ... member 1 (line 518)
   witness plan-projection-closed-set: red: member 0 (src/plan.ts lines 117, 118) ... member 1 (line 128)
   witness status-c1-current-only: red: member 0 (src/status.ts line 112)
   witness status-state-vocabulary-closed: red: member 0 (src/commands/status.ts line 128)
   witness validate-diagnostic-contract: red: member 0 (src/validate.ts line 227) ... member 1 (line 566)
   witness validate-unknown-keyword-compilation: red: member 1 (src/validate.ts line 472)
   witness validate-yaml-decode-stage: red: member 1 (bin/tiphys.ts line 39))
```

- I verified the `cli-top-level-error-handler` case by hand, applying the
  spec's OWN member 0 text (`"} catch (error) {"` replaced by
  `"} finally { } if (false) { const error: unknown = undefined;"`) and running
  its OWN named test:

```
member 1 applied
...
try {
  process.exitCode = await run(process.argv.slice(2));
} finally { } if (false) { const error: unknown = undefined;
  ...
}
=== named test under witness member 1 ===
[ok] malformed YAML and a non-mapping document each give one diagnostic line, a nonzero exit and no stack frame (784.488188ms)
$ git diff --stat -- bin/tiphys.ts     # empty: reverted
```

  So this is not a harness artefact: the declared dangerous state really does
  leave the named test green. CR-M3P1-A-004 is the same defect seen from the
  criterion side, and the two should be fixed together.
- recommendation: for each of the eight, pair every member with a test that
  actually executes the mutated arm (for several, one already exists in the
  phase and is simply not listed in that spec's `tests[]`). The gate names the
  file and line for every member, so the derivation is already published; the
  work owed is to walk all of them rather than the ones a reviewer names, per
  the fix-round contract.

## CR-M3P1-A-007 (low): criterion 13 as written is not met, and the deviation needs a ruling rather than a reviewer's shrug

- location: `test/fixtures/json-schema-test-suite/{pattern,additionalProperties,const,if-then-else,ref}.json`
- what: criterion 13 says "`grep -rP '[^\x00-\x7F]'` over the touched files
  reports nothing". Five touched files report. The work history declares this
  (deviation 7) and explicitly hands the call to the reviewer.
- evidence:

```
$ git diff --name-only origin/main | while read f; do [ -f "$f" ] && grep -lP '[^\x00-\x7F]' "$f"; done
test/fixtures/json-schema-test-suite/additionalProperties.json
test/fixtures/json-schema-test-suite/const.json
test/fixtures/json-schema-test-suite/if-then-else.json
test/fixtures/json-schema-test-suite/pattern.json
test/fixtures/json-schema-test-suite/ref.json
```

- my ruling, so the phase is not left holding an open question: the deviation is
  correct on the merits. Those bytes ARE the thing under test, and editing a
  vendored external suite would make the word "official" in criterion 11 false.
  But "the reviewer decides" is not a durable answer for a repository convention
  (CLAUDE.md binding convention 3). What is owed is a one-line scope statement
  recorded where the convention lives: the ASCII rule covers AUTHORED files, and
  `test/fixtures/json-schema-test-suite/` is vendored and exempt. Without it the
  next phase's reviewer re-litigates it and the phase after that widens it.
- worth stating because it is a real risk rather than a nit: there is no ASCII
  gate. The eleven registered gates are `manifest-self-check, coverage,
  credential-scrub, credential-token, suite, citations, scope, deploy,
  migrations, clause-map, red-witness`. Criterion 13 is enforced by a human
  running a grep, which is the shape CLAUDE.md records twice as not surviving.

## What I could discharge that the phase left CI-deferred

DR-0013 criterion 13's second half ("a clean install in a scratch directory
resolves both runtime dependencies") is recorded in the work history as NOT
PERFORMED. I performed it, and it passes:

```
$ npm pack --pack-destination scratchpad/packtest
tiphys-kernel-0.0.0.tgz
$ cd scratchpad/packtest && npm init -y && npm install ./tiphys-kernel-0.0.0.tgz
found 0 vulnerabilities
$ ls node_modules
@tiphys  ajv  fast-deep-equal  fast-uri  json-schema-traverse  require-from-string  yaml
$ ls node_modules/@tiphys/kernel/schemas
README.md charter.schema.json decision-record.schema.json plan.schema.json status-line.schema.json
$ ls node_modules/@tiphys/kernel/templates
charter.example.yaml decision-record.example.yaml plan.example.yaml
$ node -e 'console.log(require.resolve("ajv/package.json"), require.resolve("yaml/package.json"))'
.../packtest/node_modules/ajv/package.json .../packtest/node_modules/yaml/package.json
```

The production dependency and license inventory (DR-0013 criterion 14),
re-derived independently of the work history:

```
ajv: 8.20.0 MIT
yaml: 2.9.0 ISC
fast-deep-equal: 3.1.3 MIT
fast-uri: 3.1.5 BSD-3-Clause
json-schema-traverse: 1.0.0 MIT
require-from-string: 2.0.2 MIT
```

## The two step-1 HALT checks, verified independently of the implementer's account

Both hold, so the DR-0013 engine retirement is an engine swap and not a rewrite
of M2's tests. This was the check most able to stop the phase, so it is stated
with its sources.

- **(a) M2's validator as DELIVERED emits `INVALID <json-pointer> <message>`
  with deterministic ordering.** `git show origin/main:src/gates/validate.ts`
  line 90 is the format function, and the module header states the ordering rule
  ("the collected list is then sorted by (pointer, message) with ASCII
  lexicographic comparison. The final sort is what makes the order a property of
  the CONTRACT rather than of the traversal"). It is asserted on `main`, not only
  documented: `origin/main:test/gates.test.ts:775`, "three simultaneous
  violations produce the same three INVALID lines in the same order across ten
  runs", with the three expected lines written out literally.
- **(b) M2's own validation tests assert THAT contract, not engine wording.**
  The asserted strings on `main` are the `DIAGNOSTIC_MESSAGES` table's outputs
  (`required property id is missing`, `expected type array but found string`,
  `value "mostly-fine" is not one of the permitted values ...`), which
  `src/gates/validate.ts` on `main` declares in its header to be "THE MESSAGE
  CONTRACT ... not this engine's wording", for the stated purpose of giving a
  replacement engine one table to map onto. No walker-shaped or Ajv-shaped
  wording appears in the assertions.
- **The mechanical guard, clean:**

```
$ git diff --stat origin/main -- test/gates.test.ts
$ echo $?
0
```

  Empty. M2's validation tests are re-run unchanged and pass through Ajv:

```
$ node --test test/gates.test.ts
tests 42 / pass 42 / fail 0 / skipped 0     EXIT=0
```

  and the module really does route through the new engine:
  `src/gates/validate.ts:42-45` imports `sortDiagnostics` and `validateInstance`
  from `../validate.ts`, the Ajv module.

## Criteria walk

Every row is a command I ran in this worktree, not a command I read about.

| Criterion | Verdict | Command / evidence |
|---|---|---|
| 1 `npm ci`, build, clean status | VERIFIED | `npm ci` 0; `npm run build` 0; `git status --porcelain` names only this review file |
| 1 `npm test` without a prior build | VERIFIED | `rm -rf dist *.tsbuildinfo && npm test`: 446 tests, 437 pass, 0 fail, 9 skipped; all 9 enumerated from the TAP reporter and all are the pre-existing `dist/ is absent` guards |
| 1 behaviors resolve by name | **FAILED** | 35 unresolved; `src/gates/suite.ts` red locally and in CI. CR-M3P1-A-005 |
| 2 four types validate, named and `auto` | VERIFIED | `validate --type {plan,charter,decision-record}` and `--type auto` all 0; `--type status-line` and `--type auto` on a real emitted `current.json` both 0 |
| 3 four DANGEROUS fixtures rejected naming the pointer | VERIFIED | all four exit 1 at `#/phases/0/acceptance`, `#/escalation-contract`, `#/decided`, `#/run` |
| 4 Kind A witness, defang and restore, all four | VERIFIED | acceptance `minItems` 1->0: 0 then 1; charter `required` minus `escalation-contract`: 0 then 1; decision `then.required` + `minLength` removed: 0 then 1; status-line `required` minus `run`: 0 then 1. `git status` clean after |
| 4b Kind B both directions | VERIFIED | fixture carries `(check: plan-verification-first-present)`; deregistering the check reddens the named test; `dispatchable: false` / `true` both observed |
| 4c missing context is loud | VERIFIED, with a declared residue | mutating `runChecks`'s `failed` to ignore skips reddens the named test. Residue: no SHIPPED check sets `requiresContext`, so the arm is witnessed at the registry rather than through the command. The work history declares this; `src/commands/validate.ts:239` is `return checks.failed ? 1 : 0`, so the CLI half is correct by inspection but unexecuted |
| 5 `additionalProperties: false`, two structurally different members | VERIFIED, four members | top-level `staus`; `#/phases/0/intnt` (2 deep); `#/phases/0/steps/0/txt` (3 deep); `#/phases/0/fill-in/filed` (4 deep). Plus an exhaustive walk of all four schemas: every object level carrying `properties` sets `additionalProperties: false` except four `if`/`then` applicators, where setting it would be wrong |
| 5b release-verification reserved, all directions | VERIFIED | absent -> names the field; `{mode: none}` -> names `reason`; `{mode: none, reason}` -> 0; `{mode: vercel, endpoint}` -> names `endpoint` and the `mode` enum |
| 5c `stop-for[]` default shipped | VERIFIED | `templates/charter.example.yaml:37` |
| 5d named-pipe refusal, both paths, both directions | VERIFIED | real `mkfifo` at the file argument: exit 1 naming the path and "is a named pipe, not a regular file", no hang under `timeout 15`; regular file at the same path: 0. Same pair for `--context` |
| 5e `hazard-classes` minItems, both directions | VERIFIED | `[]` -> `INVALID #/phases/0/hazard-classes array has 0 items ...`; one entry -> 0; `minItems` mutation reddens the named test |
| 5f `addressed-by` resolves, two structurally different members | VERIFIED | `criterion 99` -> `(check: plan-hazard-classes-addressed-by-resolves)`; `later-phase: M9-P7` -> "deferred to phase M9-P7, which this plan does not contain", same check; `later-phase: M9-P1` -> 0; missing field named by `required` |
| 6 `status emit` | VERIFIED | exit 0, exactly one stream line, `current.json` parses with `state: phase-change` |
| 7 C-1, corrupt stream | VERIFIED | stream overwritten with NUL/SOH garbage; `status show` exits 0 and prints `phase-change` |
| 8 state vocabulary closed | VERIFIED | `--state progress` exits 1 naming the five permitted values; stream line count unchanged |
| 9 clause-map over twelve rows, both directions | VERIFIED | green over 12 rows; `R-084`->`R-XXX` in `schemas/status-line.schema.json` -> red naming the row AND the artifact; restored -> 0. Zero-row map -> red with `units 0` |
| 9b missing row / invented row | VERIFIED | deleting the `R-084` map entry -> "R-084 is owned by M3-P1, which is in force, and has no clause-map entry", exit 1; restored -> 0; `R-999` added -> "R-999 has a clause-map entry and is not in the inventory", exit 1 |
| 10 projection feeds the REAL auditor | VERIFIED | exactly the five camelCase keys; a sixth key reddens the named test; `` `src/cli.ts` (edit only if step 4 requires it) `` projects to `src/cli.ts`; removing the filename lowercasing reddens the real-auditor test, which spawns `node src/gates/scope.ts --declarations delivery/plan/phase-declarations` against a scratch repo whose MERGE BASE carries the declaration |
| 11 `npm pack` | VERIFIED | 113 entries, 5 under `schemas/`, 3 under `templates/`, 0 under `delivery/`, 0 `node_modules` |
| 12 no stack frame, direction 1 | VERIFIED | malformed YAML: exit 1, one line, 0 stack frames; non-mapping: exit 1, `INVALID # expected type object but found array`, 0 stack frames |
| 12 direction 2, handler removed | **FAILED** | deleting the handler leaves both invocations byte-identical and the named test green. CR-M3P1-A-004 |
| 13 ASCII over touched files | FAILED, declared | five vendored suite files. CR-M3P1-A-007 |
| DR-0013 1 valid instance validates | VERIFIED | as criterion 2 |
| DR-0013 2 positive and negative per keyword | VERIFIED | the named test checks its case list against `AUTHORING_VOCABULARY`, so a keyword with no case fails |
| DR-0013 3 `oneOf`, `if`/`then`, `contains` discriminate | VERIFIED in the kernel's own tests | but the EXTERNAL suite executes zero `contains` cases: CR-M3P1-A-001 |
| DR-0013 4 unknown keyword fails compilation naming it | VERIFIED | `compileSchema({type:"object",notAKeyword:3})` -> `{"ok":false,"reason":"strict mode: unknown keyword: \"notAKeyword\""}`; `strict: false` reddens the named test |
| DR-0013 5 invalid schema fails meta-schema validation | VERIFIED | `{type:"object",required:"not-an-array"}` -> `schema is invalid: data/required must be array`; `validateSchema: false` reddens the named test |
| DR-0013 6 no mutation, one case per kind | VERIFIED independently | my own probe, four kinds, `deepEqual` against a `structuredClone` taken before: none mutated. All three policy mutations redden the named test |
| DR-0013 7 `$ref` local resolves, unresolved and remote fail closed | VERIFIED | local -> `ok:true`; `https://example.com/x.json` -> `can't resolve reference ... from id #`; `#/$defs/nope` -> same shape; no network |
| DR-0013 8 exact diagnostic text, stable ordering, no Ajv wording | VERIFIED | ten runs over a four-violation instance gave ONE distinct ordering; every rendered line is Tiphys-authored |
| DR-0013 9 malformed YAML | VERIFIED | as criterion 12 direction 1 |
| DR-0013 10 M2 tests re-run UNCHANGED | VERIFIED | `git diff --stat origin/main -- test/gates.test.ts` EMPTY; `node --test test/gates.test.ts` 42/42 after build |
| DR-0013 11 official suite passes per keyword | **FAILED** | 7 of 16 keywords execute zero cases. CR-M3P1-A-001 |
| DR-0013 12 `npm ci`, build, `node --test`, `npm pack` all 0 | **FAILED** | all four exit 0 locally, but the phase's own gates (`suite`, `red-witness`) are red on this head, so the bundle the plan measures does not pass. CR-M3P1-A-005, CR-M3P1-A-006 |
| DR-0013 13 packed schemas + scratch install | VERIFIED, including the half the phase deferred | see above |
| DR-0013 14 dependency and license inventory | VERIFIED | six production packages, re-derived above, matching the pins |
| Step-1 HALT check (a) | VERIFIED | see above |
| Step-1 HALT check (b) | VERIFIED | see above |

## Verdict

**CHANGES REQUIRED.**

- high: 4 (CR-M3P1-A-001, 004, 005, 006)
- medium: 2 (CR-M3P1-A-002, 003)
- low: 1 (CR-M3P1-A-007)

The engine work is genuinely good, and I tried hard to break it. Every DR-0013
policy is instantiated exactly as decided and I could not falsify one; the
diagnostic contract is deterministic and Tiphys-owned; the M2 boundary is
preserved with its tests byte-identical and green; the named-pipe class, the
projection, the clause map and the status line all behave as their criteria say,
in both directions, under my own commands. Nine of ten source mutations reddened
the test that names the behavior.

What blocks merge is not the engine. It is that the phase is red on its own
gates at this head, in two shapes this repository has written rules about: a
registry of behavior names that resolves only against a run nobody executed
(T-009), and witnesses whose declared dangerous states do not reach the tests
they name (the red-witness rule). CR-M3P1-A-001 is the same family one level
out: an external-suite criterion reporting 200 green cases while seven of
sixteen keywords execute none.

Two things make this a short fix round rather than a long one. The work history
already names four of these as not-done rather than claiming them, including
criterion 12's second direction and the un-run suite gate, so nothing here
contradicts what was reported. And every finding has a mechanical derivation
attached: the behaviors fix is a diff against the TAP name list, the witness fix
is the gate's own per-member file-and-line output, and CR-M3P1-A-004's missing
witness is one invocation I have already found and captured. The round should
name the MECHANISM in each case (a registry value that is a paraphrase; a member
that mutates an arm its tests do not execute; a selection predicate that drops
cases for a property of the schema rather than of the keyword) and publish the
enumeration rather than fixing the instances I listed.

## What I did NOT cover

Specific, because an empty result from a wrong scope is indistinguishable from
an absence of defects.

1. **I did not run the `red-witness` gate myself.** Thirteen specs times two
   members times two repetitions times a ~140s suite is hours. I relied on the
   CI run for the aggregate and verified ONE member by hand
   (`cli-top-level-error-handler` member 0). The other seven red specs stand on
   CI's authority, not mine. A fix round claiming a spec is fixed needs the
   gate, not a reading.
2. **I did not run the `citations` or `scope` gates, and I did not do a scope
   audit.** Sixty-six files changed; I checked only that `test/gates.test.ts` is
   untouched. Whether the other sixty-five are on this phase's files-to-touch
   list is UNREVIEWED by me. The work history records E-1 as blocking the scope
   gate and I did not verify that claim either.
3. **I did not review the three escalations on their merits.** E-1, E-2 (step
   10b's `src/gates/schemas/` relocation, not done) and E-3 are read but not
   independently derived. I did not attempt E-2's compatibility-shim route,
   which the work history itself flags as unmeasured.
4. **I did not read `schemas/plan.schema.json` clause by clause against R-011,
   R-012, R-014, R-016 to R-019, R-021, R-022, R-063, R-084, R-090.** The
   clause-map check only verifies each id OCCURS in its artifact, a substring
   test that a comment satisfies. So "the schema actually expresses the
   requirement" is unverified by me and only weakly verified by the gate.
5. **I did not exercise the `--context` walk on a deep or hostile tree**, only a
   named pipe and an empty directory, because no shipped check consumes a
   context and there was nothing to drive it with.
6. **I did not test schema `$id` collisions, concurrent validation, or any
   performance property.**
7. **I did not verify the vendored suite files are byte-identical to upstream
   revision `15fe552d`.** I checked the provenance prose and found it wrong
   about `uniqueItems` (CR-M3P1-A-002); I did not fetch upstream to diff. A
   vendored suite that had been quietly edited would look exactly like this
   review's result.
8. **I did not reconcile the work history's own numbers with mine.** It records
   445 tests where I measure 446, consistent with a later commit adding one; I
   did not confirm that and it is not a finding.
9. **Everything above ran on the floor toolchain (node v26.6.0) in a Linux
   container.** T-009 applies to me too: these are evidence for that
   configuration. The `push`-event arm on `main` has not been observed at all,
   and the only `pull_request` arm observed is CI run 31243412876, which failed.



---

Transcription note: the two captured `node --test` lines above originally
carried the reporter glyph U+2714; it is transcribed here as `[ok]` so this
file stays pure ASCII (CLAUDE.md binding convention 3). Nothing else in the
captured output was altered.
