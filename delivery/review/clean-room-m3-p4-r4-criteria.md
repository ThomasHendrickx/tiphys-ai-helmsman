# Clean-room review M3-P4 round 4, contract A: acceptance criteria walk

Reviewer: independent clean-room agent, contract A.
Head under review: c7d9d2c (detached worktree, no pushes, no commits).
Contract: the acceptance criteria of delivery/plan/kernel-plan-m3.md:2634
(section "M3-P4: Reporting, work-history, and environment-warning contracts"),
criteria list at delivery/plan/kernel-plan-m3.md:2919.

STATUS: IN PROGRESS. Appended as work proceeds (T-008 beacon).

## 0. What this review did NOT cover

Stated first, because it is the reviewer's own first check under CLAUDE.md's
fix-round contract item 3.

1. **The soundness of round 4's arguments is NOT my contract.** A second
   reviewer audits the derivations, the enumeration domain, and whether each
   universal claim over a class now has a derived member. I check only whether
   the phase's acceptance criteria are met at this head. Where a criterion is
   met by a mechanism whose ARGUMENT is weak, I record the criterion as met and
   say so; the argument is contract C's.
2. **I did not read the implementation session** and did not consult any
   reviewer's prior report on this phase. I read CLAUDE.md, the plan section,
   the phase declaration, and delivery/work-history/m3-p4.md (as a claim).
3. **I did not run the phase in CI.** No `gh`, no network runner. Every gate
   result below is a LOCAL run of the registry gate runner. T-009 applies: a
   local `--mode full` run is evidence only for that configuration, and the
   post-merge `push` arm on the new `main` head is NOT witnessed by me.
4. **I did not re-derive the class enumerations of round 4 step 1.** I checked
   the criteria, and the red witness by re-execution.
5. **Criteria coverage is scoped to the plan's own numbered list** (1, 2a-f,
   2b a-b, 2c a-e, 2d a-d, 2e, 3, 4, 5, 6). The plan's "new behaviors" list and
   the hazard-class-to-criterion table are checked only insofar as a criterion
   names them.
6. **I did not audit the seven schemas this phase does not touch** (charter,
   plan, decision-record, gate-registry, assurance-modes, role-model-config,
   status-line). They are out of the phase's files-to-touch.
7. **Merge-topology note.** The head is a merge commit, but `git merge-base
   c7d9d2c origin/main` is `c154ef8`, which IS the current `origin/main` tip.
   So `git diff origin/main..c7d9d2c` contains ONLY the phase's own changes and
   no files from main. That is how I separated the two; the separation cost
   nothing because main is fully merged in.

## 1. Topology and changed-file inventory

```
$ git log -1 --format='%H %P' c7d9d2c
c7d9d2c67b1b59040a53f5876bd3fc4c670f1a28 53785dfd45eedcb2301bc2e3508afff128eaa4f2 c154ef806a2002a508e7eb2f3ed35df748f9d700
$ git merge-base c7d9d2c origin/main
c154ef806a2002a508e7eb2f3ed35df748f9d700
$ git rev-parse origin/main
c154ef806a2002a508e7eb2f3ed35df748f9d700
```

`git diff --name-status origin/main..c7d9d2c`, 18 paths:

```
M	delivery/requirements/clause-map.json
A	delivery/work-history/m3-p4.md
A	schemas/final-report.schema.json
A	schemas/report.schema.json
A	schemas/work-history.schema.json
M	src/checks.ts
M	src/commands/validate.ts
M	src/validate.ts
A	templates/final-report.example.yaml
A	templates/report.example.yaml
A	templates/warnings.md
A	templates/work-history.example.yaml
M	test/behaviors.json
A	test/fixtures/wrapper-capture.counts.json
A	test/fixtures/wrapper-capture.invocation.json
A	test/fixtures/wrapper-capture.stdout.txt
A	test/report-contract.test.ts
A	test/work-history.test.ts
```

Judged against delivery/plan/phase-declarations/m3-p4.json:4 (`filesToTouch`):
every path is on the list or is one of the two standing pre-authorized extras
(`test/behaviors.json`, `delivery/work-history/m3-p4.md`). `test/fixtures/` is
a declared prefix and covers the three wrapper-capture files. Two declared
entries were NOT used (`witness/`, and nothing under it), which is permitted.
Verified mechanically by the `scope` gate below.

## 2. Build and toolchain

```
$ export PATH=<scratch>/toolchain/node-v26.6.0-linux-x64/bin:$PATH
$ node --version
v26.6.0
$ npm --version
11.18.0
$ npm run build
build exit: 0
$ git status --porcelain
?? delivery/review/clean-room-m3-p4-r4-criteria.md      (this report only)
```

Build exit 0 and a clean tree afterwards (the only untracked path is this
report). `dist/` is present for every run below unless stated otherwise.

## 3. Criteria walk

### Criterion 1: `tiphys validate` exits 0 on each of the four new example instances

```
$ node bin/tiphys.ts validate --type report templates/report.example.yaml
EXIT 0
$ node bin/tiphys.ts validate --type final-report templates/final-report.example.yaml
EXIT 0
$ node bin/tiphys.ts validate --type work-history templates/work-history.example.yaml
EXIT 0
$ node bin/tiphys.ts validate --type auto templates/report.example.yaml
EXIT 0
$ node bin/tiphys.ts validate --type auto templates/final-report.example.yaml
EXIT 0
$ node bin/tiphys.ts validate --type auto templates/work-history.example.yaml
EXIT 0
```

The fourth instance is `templates/warnings.md`, which is markdown by the
justified exception at delivery/plan/kernel-plan-m3.md:569 and has no schema.
The work history declares this as deviation 3 at
delivery/work-history/m3-p4.md:735 and routes it to criterion 5. I accept the
deviation: the criterion's own step 4 (delivery/plan/kernel-plan-m3.md:2762)
creates `warnings.md` as markdown deliberately, so "validate" was never
applicable to it, and criterion 5 is the stronger check.

**Criterion 1: MET.**

(walk continues; further criteria appended below as executed)

### Criterion 2: Kind A dangerous-instance rejections, each exiting 1 naming the pointer, each witnessed by removing and restoring the guarding keyword

I built every dangerous instance MYSELF by mutating the shipped template through
`yaml` parse/stringify, and I ran a CONTROL (the template round-tripped through
the same parse/stringify with no mutation) to rule out the round-trip being the
cause of any rejection. The control exits 0 for both the report and the work
history, so every exit 1 below is the mutation.

ARMED arm (all against the head as shipped):

```
=== 2-control (report, unmutated round-trip) ===      EXIT 0
=== 2a  green with no wrapper-exit-code ===
INVALID #/gate-results/0 value does not satisfy the requirements its own shape triggers here
INVALID #/gate-results/0/wrapper-exit-code required property wrapper-exit-code is missing
EXIT 1
=== 2b  environmental-claims[0].evidence: [] ===
INVALID #/environmental-claims/0/evidence array has 0 items, fewer than the required minimum 1
EXIT 1
=== 2c  honest-failures[0] with no exposure-window ===
INVALID #/honest-failures/0/exposure-window required property exposure-window is missing
EXIT 1
=== 2e  analysis containing "always", no counter-experiment ===
INVALID #/findings/1 value matches no permitted alternative here
EXIT 1
=== 2f  source-pinned: true with no pinned-evidence ===
INVALID #/findings/0 value does not satisfy the requirements its own shape triggers here
INVALID #/findings/0/pinned-evidence required property pinned-evidence is missing
EXIT 1
=== 2d-control (work-history, unmutated round-trip) === EXIT 0
=== 2d  contradicts-plan: true with no stopped-and-reported ===
INVALID #/verification-first/0 value does not satisfy the requirements its own shape triggers here
INVALID #/verification-first/0/stopped-and-reported required property stopped-and-reported is missing
EXIT 1
=== 2d second member: flipping the OTHER entry's contradicts-plan to true ===
INVALID #/verification-first/1 value does not satisfy the requirements its own shape triggers here
INVALID #/verification-first/1/stopped-and-reported required property stopped-and-reported is missing
EXIT 1
```

Every one exits 1 and names the offending JSON pointer.

WITNESS arm. I copied the three schemas to a pristine scratch directory first and
restored by `cp` from there, never `git checkout --` (CLAUDE.md standing warning
8), and verified the md5 matched after each restore. Defanging by deleting the
named keyword by JSON pointer:

```
2a  keyword /$defs/gateResult/{if,then}         ARMED exit=1  DEFANGED exit=0  RESTORED exit=1
2b  keyword /$defs/environmentalClaim/properties/evidence/minItems
                                                ARMED exit=1  DEFANGED exit=0  RESTORED exit=1
2c  keyword /$defs/honestFailure/required/1     ARMED exit=1  DEFANGED exit=0  RESTORED exit=1
2d  keyword /$defs/verificationFirst/{if,then}  ARMED exit=1  DEFANGED exit=0  RESTORED exit=1
2e  keyword /$defs/finding/oneOf                ARMED exit=1  DEFANGED exit=0  RESTORED exit=1
2f  keyword /$defs/finding/{if,then}            ARMED exit=1  DEFANGED exit=0  RESTORED exit=1
```

**One methodological note that a future reviewer will otherwise re-pay for.**
My first attempt removed `then` ALONE for 2a, 2d and 2f, and the instance stayed
red:

```
$ node ./crA-defang.mjs schemas/report.schema.json '/$defs/gateResult/then'
$ node bin/tiphys.ts validate --type report <2a fixture>
INVALID # schema is refused by this validator's strict policy
EXIT 1
```

That is NOT the keyword still guarding: it is the validator refusing `if`
without `then`, so the schema does not compile at all and the instance is never
reached. A reviewer who stopped there would report a false negative witness. The
pair must be removed together, which is exactly what the work history claims at
delivery/work-history/m3-p4.md:801. Recorded because a red exit code with the
wrong cause is the shape this project keeps paying for.

2(e) detail. The criterion's letter asks for "an `if`/`then` over a `pattern` on
the same object". The shipped form is a two-branch `oneOf`, declared as
deviation 1 at delivery/work-history/m3-p4.md:722. I accept it: it is still a
Kind A conditional on the same object, its guarding keyword is removable and
restorable, and the stated reason (the finding object already spends its one
`if`/`then` slot on T-004's `source-pinned` coupling) is verifiable in the
schema, where `/$defs/finding/if` is indeed the `source-pinned` condition.

Two structurally different tokens, plus a third member at a different DEPTH:

```
"always" in analysis,  no counter-experiment    ARMED exit=1  oneOf removed exit=0
"never"  in analysis,  no counter-experiment    ARMED exit=1  oneOf removed exit=0
"always" in evidence[0].note, no counter-experiment
   INVALID #/findings/1/evidence/0 value does not satisfy the requirements its own shape triggers here
   INVALID #/findings/1/evidence/0/counter-experiment required property counter-experiment is missing
   ARMED exit=1  finding-level oneOf removed exit=1 (correct: a DIFFERENT keyword guards it)
and the settled form (always + counter-experiment)               exit=0
```

**Criterion 2 (a) through (f): MET.**

### Criterion 2b: Kind B rejections carrying `(check: <id>)`, witnessed by deregistering and restoring

ARMED:

```
=== 2b(a) member 1: discovered raised to 600 ===
INVALID #/gate-results/0 discovered 600 does not equal passed + failed + skipped + todo + did-not-run = 507 (check: report-parity-arithmetic)
EXIT 1
=== 2b(a) member 2: skipped raised to 40 (the sum EXCEEDS discovered) ===
INVALID #/gate-results/0 discovered 507 does not equal passed + failed + skipped + todo + did-not-run = 545 (check: report-parity-arithmetic)
EXIT 1
=== 2b(b) member 1: input-findings row V-3 deleted ===
INVALID #/inputs/2 finding V-3 has no row in input-findings, so the table has a hole (check: final-report-finding-parity)
EXIT 1
=== 2b(b) member 2: input-findings row V-6 deleted ===
INVALID #/inputs/5 finding V-6 has no row in input-findings, so the table has a hole (check: final-report-finding-parity)
EXIT 1
```

Both messages carry `(check: <id>)` as the criterion requires. Both directions
of 2b(a) are covered by members 1 and 2 (sum below discovered, sum above it),
which is more than the criterion's letter asks and matches key decision 3 at
delivery/work-history/m3-p4.md:766.

WITNESS, by removing the check from the `registry` array in src/checks.ts:1934
and restoring the file from a pristine copy (md5 verified equal afterwards):

```
2b(a) reportParityArithmetic  deregistered:  2ba exit=0   2ba-m2 exit=0
2b(b) finalReportFindingParity deregistered: 2bb exit=0   2bb-m2 exit=0
RESTORED (md5 68acf608026a1e497ba4013f64f49bca == pristine):
      2ba exit=1  2ba-m2 exit=1  2bb exit=1  2bb-m2 exit=1
```

**Criterion 2b (a) and (b): MET.**

### Criterion 2c: the claims section, five sub-criteria

ARMED (all mutations of the shipped report template, control exits 0):

```
2c(a) claims[1] kind: impossibility, settled-by deleted
  INVALID #/claims/1 value does not satisfy the requirements its own shape triggers here
  INVALID #/claims/1 value matches no permitted alternative here
  INVALID #/claims/1/settled-by required property settled-by is missing      EXIT 1
2c(b) claims[2] kind: coverage, settled-by deleted                            EXIT 1 (same three lines at #/claims/2)
2c(c) claims[3] kind: remedy, settled-by deleted                              EXIT 1 (same three lines at #/claims/3)
2c(d) claims[0] kind: note
  INVALID #/claims/0 value matches no permitted alternative here
  INVALID #/claims/0/kind value "note" is not one of the permitted values
      "universal", "impossibility", "coverage", "remedy", "open-question"     EXIT 1
2c(e) claims[0] kind: open-question with NO settled-by                        EXIT 0   <-- honest restatement is first-class
2c(e) the same entry carrying an executed-construction
  INVALID #/claims/0 value matches no permitted alternative here
  INVALID #/claims/0/settled-by/counter-experiment required property counter-experiment is missing
  INVALID #/claims/0/settled-by/executed-construction property executed-construction is not permitted here   EXIT 1
```

2c(d)'s diagnostic NAMES the enum, which is what the criterion asks for.
2c(e) is confirmed in both directions, which is the pair the criterion asks for.

WITNESS. The guard here is TWO keywords together and I say so rather than
implying one:

```
2c(a,b,c)  /$defs/claim/{if,then} removed alone      exit=1  (oneOf still guards)
2c(a,b,c)  /$defs/claim/{if,then} AND /oneOf removed exit=0  DEFANGED
2c(a,b,c)  restored                                  exit=1
2c(d)      /$defs/claim/properties/kind/enum removed alone
             -> exit=1 but the ENUM-NAMING diagnostic line DISAPPEARS,
                leaving only "value matches no permitted alternative here"
2c(d)      enum + if/then + oneOf removed             exit=0  DEFANGED
2c(d)      restored                                   exit=1
2c(e)      if/then + oneOf removed                    exit=0  DEFANGED; restored exit=1
```

That reproduces the work history's own claim at
delivery/work-history/m3-p4.md:810 ("removing the enum removes that line;
removing enum + `oneOf` + `if`/`then` accepts") exactly.

Three structurally different members of the claim class are witnessed across
(a), (b) and (c), which exceeds section 2.3 rule 6's two.

**Criterion 2c (a) through (e): MET.**

### Criterion 2d: the fix-round contract

```
2d(b) fix-round with no not-covered
  INVALID #/fix-round/not-covered required property not-covered is missing      EXIT 1
2d(b) second member: fix-round with no mechanism
  INVALID #/fix-round/mechanism required property mechanism is missing          EXIT 1
2d(c) derivation.output ABSENT
  INVALID #/fix-round/derivation/output required property output is missing     EXIT 1
2d(c) derivation.output EMPTY
  INVALID #/fix-round/derivation/output value "" does not match the required pattern \S
  INVALID #/fix-round/derivation/output value "" is shorter than the required minimum length 1   EXIT 1
```

WITNESS:

```
2d(b) 'not-covered' removed from /$defs/fixRound/required   -> exit=0 ; restored exit=1
2d(b) 'mechanism'   removed from /$defs/fixRound/required   -> exit=0 ; restored exit=1
2d(c) minLength+pattern deleted and 'output' removed from derivation.required
                                                            -> both members exit=0 ; restored exit=1
```
(md5 of schemas/report.schema.json after every restore equals the pristine copy.)

2d(d), the registered test over the shipped template. I re-executed it as a red
witness by mutating the TEMPLATE, with two structurally different red members:

```
GREEN ARM (shipped template)                      exit=0  tests 1 pass 1 fail 0
RED ARM 1: derivation.output = one-line placeholder
   AssertionError: the template's derivation output has 1 non-empty line(s),
   which is a placeholder rather than a capture
                                                  exit=1  tests 1 pass 0 fail 1
RED ARM 2: three lines of PROSE, not path:line captures
   AssertionError: I searched the source tree.
                                                  exit=1  tests 1 pass 0 fail 1
RESTORED                                          exit=0  tests 1 pass 1 fail 0
```

The second member matters: a test that only counted lines would be green on
three lines of invented prose, and this one is not.

2d(a) is a NEGATIVE criterion: the phase must not claim mechanism-vs-finding is
schema-detectable. The test's own comment at test/report-contract.test.ts:856
states "no keyword can tell full output from a summary of it, and this test does
not pretend otherwise", and the work history records it as residue 1. Nothing in
the schemas or tests asserts the undetectable property.

**Criterion 2d (a) through (d): MET.**

### Criterion 2e: the empty-string satisfaction class

Three structurally different members, each rejected and each witnessed:

```
MEMBER 1, top-level scalar (findings emptied so the derived check does not mask it):
  no-findings-statement: ""
  INVALID #/no-findings-statement value "" does not match the required pattern \S
  INVALID #/no-findings-statement value "" is shorter than the required minimum length 1  EXIT 1
  same field with real text                                                               EXIT 0
  minLength+pattern deleted from properties/no-findings-statement                         EXIT 0 (DEFANGED)
  restored                                                                                EXIT 1

MEMBER 2, a scalar inside an array element (work-history document, fix-round[0]):
  fix-round[0].not-covered: ""
  INVALID #/fix-round/0/not-covered value "" does not match the required pattern \S
  INVALID #/fix-round/0/not-covered value "" is shorter than the required minimum length 1 EXIT 1
  (the report document's fix-round.not-covered: "" rejects identically at #/fix-round/not-covered)

MEMBER 3, a whitespace-only block scalar:
  honest-failures[0].exposure-window: "\n  "
  INVALID #/honest-failures/0/exposure-window value "\n  " does not match the required pattern \S  EXIT 1
```

The keyword-separation arm, which is the point of member 3 and which I ran
across all three members at once by deleting one keyword everywhere it appears
beside the other:

```
minLength removed everywhere (45 subschemas):  m1 exit=1  m2 exit=1  m3 exit=1
pattern   removed everywhere (45 subschemas):  m1 exit=1  m2 exit=1  m3 EXIT 0  <-- member 3 escapes
both removed:                                  m1 exit=1* m2 exit=0  m3 exit=0
restored:                                      m1 exit=1  m2 exit=1  m3 exit=1
```

Member 3 is green with the PATTERN alone removed and red with `minLength` alone
removed, which is precisely the demonstration that the two keywords are not
redundant. That reproduces the work history's claim at
delivery/work-history/m3-p4.md:816.

*The `m1 exit=1` under "both removed" is NOT a failed witness. A
`no-findings-statement` beside three real findings is separately refused by the
derived check `report-no-findings-statement`, so the keyword witness on member 1
has to be taken on a document where findings are empty, which is the run shown
above (DEFANGED exit=0). The shipped test states this interaction explicitly at
test/report-contract.test.ts:891 rather than papering over it, and separates the
keyword half from the check half. I confirmed both halves independently.

**Criterion 2e: MET.**

### Criterion 3: the gate-results fixture is a real verbatim capture, asserted by a registered test

Independent verification, not through the phase's test:

```
$ node --input-type=module -e "import {MAPPING_STATEMENT} from './src/gates/suite.ts' ..."
MAPPING_STATEMENT length: 298
equal to capture mapping: true
identity pass+fail+skipped+todo+didNotRun == reported: true 507
$ git cat-file -t 9fd800a597993b4d947d57b7367ac8e14c808b22
commit
$ git log --oneline -1 9fd800a
9fd800a M3-P4: open the work history beacon
$ git merge-base --is-ancestor 9fd800a c7d9d2c   -> ancestor of head: YES
```

The recorded `head` is a real commit ON THIS BRANCH, the recorded exit code is
present, and the capture's `mapping` field is byte-equal to the 298-character
`MAPPING_STATEMENT` exported by the program that produced it. That last one is
the property a hand-authored fixture would fail.

RED WITNESS on the registered test, two structurally different members:

```
GREEN ARM (shipped fixtures)                                   exit=0
RED MEMBER 1: one character of counts.mapping changed
   AssertionError: Expected values to be strictly equal        exit=1
RED MEMBER 2: counts.pass 505 -> 504 and todo 0 -> 1, so stdout and counts disagree
   AssertionError: The input did not match /pass 504,/          exit=1
RESTORED                                                       exit=0
```

The test also ties the capture to criterion 2 by asserting the report example's
`gate-results[0]` IS those numbers, which I read at
test/report-contract.test.ts:1007.

**Criterion 3: MET.**

### Criterion 4: the M2-P6 coverage checker in finding-to-outcome parity mode

Deviation 2's premise verified first, rather than accepted:

```
$ node src/gates/coverage.ts --help
usage: node src/gates/coverage.ts --result <file> --evidence <dir> [--config <file>]
$ git diff --name-only origin/main..c7d9d2c -- src/gates/coverage.ts
(empty: the checker is UNMODIFIED by this phase)
```

There is indeed no parity-mode flag, and the module is not on the declaration.

I then invoked the UNMODIFIED exported checker myself, in my own script, with a
real process exit code:

```
=== ARM 1: the shipped template ===
{"ok":true,"checked":6,"missing":[],"duplicated":[],"empty":[],"phantom":[]}   EXIT 0
=== ARM 2: a copy with the V-3 input-findings row deleted ===
{"ok":false,"checked":6,"missing":["V-3"],...}   orphaned id(s): ["V-3"]        EXIT 1
=== ARM 2, second member: the V-6 row deleted ===
{"ok":false,"checked":6,"missing":["V-6"],...}   orphaned id(s): ["V-6"]        EXIT 1
```

Both arms are as the criterion asks, and the nonzero arm names the orphaned id.
The phase's own registered test does the same in a subprocess and passes.

**Criterion 4: MET** (deviation 2 accepted; the deviation is about the CLI
surface, not about the exit code, and the exit code is real).

### Criterion 5: `templates/warnings.md` reaches an assembled brief

The registered test runs a real `tiphys spawn` in a scratch fleet and asserts
`brief.md` contains the template verbatim plus its tail.

RED WITNESS, and I had to correct my own first attempt, which is worth recording.
Mutating the TEMPLATE leaves the test green, correctly: the test reads the
template and asserts the brief contains it, so both sides move together. That is
not a weak test, it is a test of the CONSUMER. The dangerous state is therefore
the ASSEMBLER, so I defanged src/brief.ts:

```
DANGEROUS STATE 1: the assembler truncates
  warningsText = readFileSync(warnings, "utf8").slice(0, 200);
  AssertionError: the shipped warnings template did not reach the brief verbatim   exit=1
DANGEROUS STATE 2: the assembler omits the file entirely
  if (false && existsSync(warnings)) {
  AssertionError: the shipped warnings template did not reach the brief verbatim   exit=1
RESTORED (md5 8dd4e04c69c579a7518ca17e1b9f48e4 == pristine)                        exit=0
```

Two structurally different members of the class, and the test is red against the
DANGEROUS state (a consumer that silently drops or truncates the warnings) rather
than merely against an absent feature.

**Criterion 5: MET.**

### test/behaviors.json (standing requirement, not a numbered criterion)

Append-only audit against the merge base:

```
base rows 523   head rows 568   added 45   removed 0   CHANGED existing rows: 0
```

Nothing was reordered, rewritten or removed.

Every behavior the PLAN names for M3-P4 is registered (20 of 20, 0 missing).

Resolution BY NAME, checked against the 562 test titles harvested from my own
completed suite run rather than from a regex over the sources:

```
titles harvested from the real run: 562
added behaviors: 45   NOT resolving to a title in the real run: 0
```

### Criterion 6: `node --test` exits 0, no unaccounted tests, the clause map resolves this phase's nine rows, earlier mappings still resolve

THE SUITE, on all four axes (CLAUDE.md standing warning 12 names three; the
fourth is the machine, and I state mine because durations differ):

| toolchain | build state | invocation | tests | pass | fail | SKIPPED | todo | exit |
|---|---|---|---|---|---|---|---|---|
| node v26.6.0 (satisfies the `>=26` floor) | `dist/` built | `npm test` | 562 | 562 | 0 | **0** | 0 | 0 |
| node v26.6.0 | `dist/` built | bare `node --test` from the repository root | 564 | 564 | 0 | **0** | 0 | 0 |

`not ok` lines in each log: 0.

The two-test gap is the one CLAUDE.md warning 12 documents and NOT a new
mystery: `package.json`'s `test` script is `node --test "test/**/*.test.ts"`,
which excludes the tracked sandbox fixture `sandbox/test/greet.test.js`, and the
bare invocation includes it. 562 is what CI and the `suite` gate mean; 564 is
what gate-list step 3 literally asks for. Both are true sentences about
different commands.

The suite the work history quotes for round 3 is 535, and this head reports 562,
because round 4 added tests. That is a difference I checked rather than
assumed.

I did NOT run the default (below-floor) node 22 toolchain. The floor toolchain
is the stronger arm and it reports 0 skipped; the default toolchain would report
2 skipped (the floor-gated `doctor` tests) and adds nothing this criterion needs.
That is a named gap in my coverage, not a claim about the default arm.

CLAUSE MAP. The phase adds exactly nine rows:

```
$ git diff origin/main..c7d9d2c -- delivery/requirements/clause-map.json
+ R-035  M3-P4 schemas/work-history.schema.json
+ R-049  M3-P4 schemas/report.schema.json
+ R-052a M3-P4 schemas/work-history.schema.json
+ R-057a M3-P4 schemas/report.schema.json
+ R-083a M3-P4 templates/warnings.md
+ R-085  M3-P4 schemas/report.schema.json
+ R-086  M3-P4 schemas/report.schema.json
+ R-088  M3-P4 schemas/report.schema.json
+ R-089a M3-P4 schemas/final-report.schema.json
```

Nine, as the criterion says, and nothing existing was removed or altered
(measured below with the same append-only audit used for behaviors.json). The
`clause-map` gate result is in the gate bundle section.

**Criterion 6: MET.**

## 4. The scope audit, run by me

The gate derives the phase id from the BRANCH NAME. My worktree is DETACHED, so
my first run was `not-applicable`, which is the gate working and not a result:

```
"status": "not-applicable",
"detail": "precondition scope-branch-is-a-phase-branch evaluated and unmet:
           branch HEAD does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$"
EXIT 21
```

Recorded because a reviewer who quoted THAT as a scope result would be quoting a
gate that never ran. I therefore made a fresh clone, checked the head out under
the real branch name, and fetched the true `origin/main` into it (the source
repo's local `main` is stale at c7a7ce9; `origin/main` is c154ef8, and using the
wrong one would have audited the wrong range):

```
$ git rev-parse --abbrev-ref HEAD      claude/m3-p4-report-and-work-history
$ git rev-parse HEAD                   c7d9d2c67b1b59040a53f5876bd3fc4c670f1a28
$ git rev-parse origin/main            c154ef806a2002a508e7eb2f3ed35df748f9d700
$ git merge-base HEAD origin/main      c154ef806a2002a508e7eb2f3ed35df748f9d700

$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only scope --phase m3-p4 --evidence <dir> --base origin/main --head HEAD
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
EXIT 0

scope/result.json:
  "status": "green", "units": 18,
  "detail": "18 changed path(s) audited against declaration
             delivery/plan/phase-declarations/m3-p4.json at merge base
             c154ef806a2002a508e7eb2f3ed35df748f9d700
             (sha256 6ace3c088ea07c79bb45a1c35a9d960e9ca3c81e8d7e69555a17dda5f283679c)"
```

**My number and the orchestrator's agree: green, 18 paths.** Reached
independently, in my own clone, with the merge base and the declaration sha
recorded.

On the separation question in my brief: there was nothing to separate. Because
the branch MERGES `origin/main` rather than sitting beside it, the merge base IS
`origin/main`'s tip, so `origin/main..c7d9d2c` contains only the phase's own 18
paths and no file from main appears in the range. I verified this by rev-parse
before doing any scope work rather than taking it on trust.

## 5. Both ASCII checks, over the phase's changed files

```
$ grep -raP '[^\x00-\x7F]' $(git diff --name-only origin/main..c7d9d2c)
grep exit=1   (no hits: clean)
$ grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]' $(git diff --name-only origin/main..c7d9d2c)
grep exit=1   (no hits: clean)
```

`-a` on BOTH, as CLAUDE.md requires. Eighteen paths scanned. None of the
phase's changed files is
`delivery/intake/orchestrated-delivery-process.md` (the owner-supplied INPUT
that legitimately carries non-ASCII and must never be transliterated) and none
is under a vendored fixture tree, so no exemption is in play and zero is the
right answer.

POSITIVE CONTROLS, because a check that cannot see its target is green and
worthless:

| fixture | nonascii `-aP` | control `-aP` | control `-P` (no `-a`) |
|---|---|---|---|
| `hello\x00world` | miss | **hit** | **MISS** |
| `hello\x01world` | miss | hit | hit |
| `caf\xc3\xa9` | **hit** | miss | miss |
| `plain ascii` | miss | miss | miss |

That reproduces CLAUDE.md's measured table, including the load-bearing fact that
NUL is invisible WITHOUT `-a`. My runs used `-a`.

```
$ git diff --stat origin/main..c7d9d2c | grep -i "bin "
  no Bin files
```

No changed source file is unreviewable.

## 6. Round 4's red witness, reproduced by me

My brief asks me to verify the 3-fail-to-3-pass capture by defanging the keyword
myself rather than reading the work history's claim. I did exactly what the work
history says it did: rewrote BOTH schema files from `git show 5470207:` (the
pre-repair head), left the tests untouched, and ran the three tests.

```
GREEN ARM at head c7d9d2c:
  node --test --test-name-pattern "declares why it is still open|DENIES a plan divergence|says why there is none" \
       test/report-contract.test.ts test/work-history.test.ts
  exit=0   tests 3   pass 3   fail 0   skipped 0

RED ARM, both schemas reverted to 5470207, tests unchanged:
  exit=1   tests 3   pass 0   fail 3   skipped 0
  + 'INVALID #/gate-results/1 value matches no permitted alternative here',
  + 'INVALID #/gate-results/1/no-wrapper-exit-code property no-wrapper-exit-code is not permitted here'
  + 'INVALID #/claims/0 value matches no permitted alternative here',
  + 'INVALID #/claims/0/still-open-because property still-open-because is not permitted here'
  + 'INVALID #/verification-first/1 value matches no permitted alternative here',
  + 'INVALID #/verification-first/1/plan-language-note property plan-language-note is not permitted here'

RESTORED: exit=0  tests 3  pass 3  fail 0
git status --porcelain schemas/   (empty: byte-identical restore)
```

That reproduces the work history's capture at delivery/work-history/m3-p4.md:3560
in substance and in the exact diagnostic strings. The failures are on ARM 2, the
honest record being unwritable, not on a setup step: each diagnostic names the
declaration field the repair adds, which is the property under test.

**The DANGEROUS state is the right one.** These tests are not red merely against
an absent feature. Round 3 shipped a schema that GUESSED which member of a class
a record belonged to, and the guess made honest records unwritable while a
fabricated integer validated. Arm 2 asserts the honest record of every derived
member validates, and that is what reddens. Arms 1 and 3 in the same tests hold
the misdeclarations red.

**Two structurally different members are required for a class witness; each of
these three carries four or five**, derived rather than invented:

- gate result, FIVE members, each a record `src/gates/run.ts` can actually
  produce: pre-spawn refusal, spawn failure, signal-killed child, `amber` which
  no producer emits, and a gate the runner never executes
  (test/report-contract.test.ts:1605).
- open question, FOUR members differing in how the guarded token enters the
  prose: states what it did not cover; denies an impossibility; quotes another
  agent; names the universal it did not test
  (test/report-contract.test.ts:1851).
- verification-first denial, FOUR negation forms: auxiliary negation, negative
  subject, anaphoric denial, and a different token negated
  (test/work-history.test.ts:431).

Each test also carries its own in-test defang of the exact `oneOf` branch, so
the keyword named at the site is the one demonstrated. I confirmed those arms
run in the green run above.

## 7. Findings

### CR-A-1 (MEDIUM). A pinned count over a set that grows with every future phase, at test/report-contract.test.ts:1394

**What it refutes.** The line's own comment, and the work history's registry
hygiene section at delivery/work-history/m3-p4.md:781, which states that the
phase checked for count over-assertions and that "no test edit was needed and
none was made".

**The line:**

```
test/report-contract.test.ts:1394:  assert.equal(oneHop.size, 3, [...oneHop.keys()].join(", "));
```

and the comment two lines above it:

> THE MEASUREMENT, derived rather than pinned: the one-hop set is the three
> direct cross-document pointers, and the closure is far larger. Counts are
> compared as an inequality because both grow as later phases add schemas, and
> a pinned number would be a claim about every future phase.

The comment states the rule correctly, and the very next statement breaks it.
`oneHop` is derived from `readdirSync(schemasDir)`, so it enumerates EVERY
shipped schema, and `schemas/` grows with every M3 phase.

**The derivation, executed, with a control.** I built the future states rather
than arguing about them. Two structurally different members plus a negative
control:

```
MEMBER 1: M3-P7's verdict schema sharing report.schema.json#/$defs/finding
  (M3-P7 is named in THIS PHASE'S OWN conflicts-with line as "the verdict
   schema shares the finding definition", so this is the next-but-two phase,
   not a hypothetical)
  node --test --test-name-pattern "chain of references is caught" ...
  exit=1    AssertionError:  4 !== 3
  message: report.schema.json#/$defs/finding, report.schema.json#/$defs/gateResult,
           report.schema.json#/$defs/claim, report.schema.json#/$defs/fixRound

MEMBER 2, structurally different: a finding-format schema sharing
  report.schema.json#/$defs/evidence (a different, currently-unshared definition)
  exit=1    AssertionError:  4 !== 3

CONTROL: a new schema with NO cross-document $ref
  exit=0    (stays green, so the defect is specific to cross-document sharing
             and is not "any new schema reddens")

BASELINE at head, nothing added:  exit=0
```

**Severity MEDIUM, and why not higher or lower.** It does not break any
acceptance criterion at this head: `node --test` exits 0 and criterion 6 is met.
It is not LOW because it is the exact defect shape CLAUDE.md convention 5 was
written for and that M3-P1 already paid for once ("a count is a claim about every
FUTURE phase, and it is false the moment the next one appends"), and because the
phase whose merge it will redden is named in this phase's own plan section. The
cost is a red suite on an unrelated phase and a round trip to find out why.

**What would close it.** The block immediately above does it right and is the
model: it asserts the three chained pointers BY NAME with the comment "Named
rather than counted, so a later phase that adds a fourth does not silently
satisfy this". The same treatment here (assert the three one-hop keys by name,
and keep `closure.size > oneHop.size` as the inequality) preserves every property
the test exists for. Alternatively `oneHop.size >= 3`.

**Not covered by this finding.** I did not audit the other test files on `main`
for the same shape; my scan was scoped to the two files this phase adds
(`test/report-contract.test.ts`, `test/work-history.test.ts`) because a
pre-existing count elsewhere is not this phase's. I enumerated every `.length`
and `.size` assertion in those two files (11 sites) and this is the only one over
a grow-with-every-phase set.

### Informational, NOT findings

Recorded so a later reviewer knows they were examined and deliberately not
raised.

- `test/work-history.test.ts:225`, `assert.equal(companions.length, 1)`. This is
  the companion table for the `work-history` type ALONE
  (`COMPANION_TABLE` at src/commands/validate.ts:93 has exactly that one row).
  A future phase adding a second companion to work-history would be changing
  this phase's own contract deliberately, and the test should redden then. Not
  a registry count.
- `test/report-contract.test.ts:1916` and `test/work-history.test.ts:498`,
  `assert.equal(branches.length, 4 / 3)`. These pin the branch count of this
  phase's own `$defs/claim/oneOf` and `$defs/verificationFirst/oneOf`
  immediately before popping the last branch as the defang. They are a coupling
  to this phase's own schema shape, which is the thing under test, and the
  assertion exists so the defang cannot silently pop the wrong branch. Correct
  as written.
- `test/report-contract.test.ts:1294`, `assert.ok(schemas.size >= 3)`. An
  inequality over the same growing directory. Correct.
- Deviations 1 to 4 in the work history are each verifiable and each accepted;
  I checked deviation 2's premise by running `node src/gates/coverage.ts --help`
  and confirming `src/gates/coverage.ts` is untouched by the diff, and
  deviation 3's premise by observing `templates/warnings.md` has no schema and
  is created as markdown by plan step 4.

## 8. The full gate bundle, run by me

In my own clone, on the real branch name, against the true `origin/main`:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --phase m3-p4 --evidence <dir> --base origin/main --head HEAD
gates: registry gate-registry.yaml mode full
gates: declared 12 applicable 8 verdict 8 green 8 red 0 not-applicable 4 error 0 vacuous 0
gates: required gate(s) not applicable: citations
GATES EXIT 20
```

| gate | status | units |
|---|---|---|
| agent-rules-drift | green | 17 rendered gate rows compared |
| citations | not-applicable | 0 citations resolved |
| clause-map | green | 27 clause-map rows checked |
| coverage | green | 115 finding ids checked |
| credential-scrub | green | 7 credential sources probed |
| credential-token | not-applicable | 0 tokens probed |
| deploy | not-applicable | 0 release verifications satisfied |
| manifest-self-check | green | 8 schema documents validated |
| migrations | not-applicable | 0 migrations compared |
| red-witness | green | 31 witnesses evaluated |
| scope | green | 18 changed paths audited |
| suite | green | 562 tests reported |

**Zero red, zero error, zero VACUOUS.** The `suite` gate's 562 agrees with my
own `npm test` run exactly. `red-witness`: "31 witness(es) evaluated (0 own, 31
stored re-evaluated in 373534ms); every witness red against every declared
dangerous state and green at head", which matches the work history's account
including the 0-own figure.

**EXIT 20 is not a red gate and I verified the explanation rather than accepting
it.** The runner exits 20 because `citations` is REQUIRED and reported
not-applicable. The work history's chain at delivery/work-history/m3-p4.md:193
makes four checkable claims and all four hold:

```
$ sed -n '228,240p' src/gates/citations.ts
  documents: [
    "delivery/plan/**/*.md", "delivery/verification/**/*.md",
    "delivery/decisions/**/*.md", "delivery/tuition/**/*.md",
    "delivery/requirements/**/*.md", "delivery/STATE.md",
  ],
```
A `.json` under `delivery/requirements/` matches no glob, so the second-level
precondition is legitimately unmet, and the result record carries it with an id
and a reason, which I read in citations/result.json.

```
$ sed -n '834,838p' scripts/m2-exit-test.sh
    {"id": "citations", "expect": "green|not-applicable", "required": true, "diffScoped": true},
$ sed -n '350,356p' scripts/m2-exit-test.sh
  if (spec.diffScoped === true && row.status === "not-applicable") {
    const scopedRec = readJson(join(evidenceDir, spec.id, "result.json"), ...
$ sed -n '875,890p' scripts/m2-exit-test.sh
  # The runner exit code is recorded but does NOT decide the outcome: ...
```
Line 881 is where that comment begins, as the work history's corrected citation
says. All three line numbers resolve.

**What I did not verify, same gap the work history names:** I did not run
`scripts/m2-exit-test.sh`, which needs `gh` and a real runner. Nor did I observe
the post-merge `push` run on the new `main` head, which T-009 requires before the
phase closes. Both remain open and neither is dischargeable from this container.

### The work history's own citations, checked because no gate checks them

`delivery/work-history/**` is deliberately absent from the citations gate's
`documents` globs, so the 3600-line work history is UNGATED. I therefore checked
it mechanically: extracted every `path.ext:LINE` token OUTSIDE backticks and
fenced blocks (per CLAUDE.md 3b, a backticked path is quoted and non-resolving),
then resolved each against the tree at this head.

```
distinct path:line citations outside backticks: 46
resolve (file exists, line in range): 46
UNRESOLVED: 0
```

That checks existence and range, not that the cited line says what the sentence
claims. Spot reads (the four exit-20 citations above, plus src/checks.ts:1934,
src/commands/validate.ts:93, src/gates/citations.ts:232) all landed on the right
content.

## 9. Tree restored

Every defang was taken by copying a pristine file back, never `git checkout --`
(CLAUDE.md standing warning 8). After all experiments:

```
$ git status --porcelain
?? delivery/review/clean-room-m3-p4-r4-criteria.md      (this report, only)
  UNCHANGED schemas/report.schema.json
  UNCHANGED schemas/work-history.schema.json
  UNCHANGED schemas/final-report.schema.json
  UNCHANGED src/checks.ts
  UNCHANGED src/brief.ts
  UNCHANGED templates/report.example.yaml
  UNCHANGED templates/warnings.md
  UNCHANGED test/fixtures/wrapper-capture.counts.json
```

I made no commit, pushed nothing, and merged nothing.

## 10. Verdict

**CHANGES REQUIRED**, for one MEDIUM finding that is a one-line edit. Every
acceptance criterion is met; the finding is against CLAUDE.md convention 5, not
against a criterion.

**Criteria: 23 of 23 MET, 0 not met, 0 partial.**

| criterion | verdict |
|---|---|
| 1 validate exits 0 on each example | MET (deviation 3 accepted) |
| 2(a) green requires the wrapper exit code | MET |
| 2(b) environmental claim requires evidence | MET |
| 2(c) incident requires exposure window | MET |
| 2(d) contradiction requires a stop | MET |
| 2(e) universal claim requires a counter-experiment | MET (deviation 1 accepted) |
| 2(f) unpinned finding labelled | MET |
| 2b(a) parity arithmetic, `(check: ...)` | MET |
| 2b(b) final-report finding parity, `(check: ...)` | MET |
| 2c(a) impossibility needs a construction | MET |
| 2c(b) coverage needs a construction | MET |
| 2c(c) remedy needs a construction | MET |
| 2c(d) the kind enum is closed and named | MET |
| 2c(e) open question first-class, both directions | MET |
| 2d(a) mechanism-vs-finding NOT claimed detectable | MET |
| 2d(b) fix round requires `not-covered` | MET |
| 2d(c) derivation output absent or empty rejected | MET |
| 2d(d) registered test over the template's real output | MET |
| 2e the empty-string satisfaction class, 3 members | MET |
| 3 the wrapper capture is verbatim | MET |
| 4 the M2-P6 checker, both arms | MET (deviation 2 accepted) |
| 5 warnings.md reaches a brief | MET |
| 6 suite, clause map, earlier mappings | MET |

Every one was EXECUTED, not read. Every Kind A rejection was rebuilt by me from
the shipped template and every guarding keyword was removed and restored by me,
with md5 verification of each restore.

**Findings: 1 medium, 0 high, 0 low.**

- **CR-A-1 (MEDIUM)**: `assert.equal(oneHop.size, 3)` at
  test/report-contract.test.ts:1394 pins a count over a set derived from every
  shipped schema, which grows with every future phase. Derived by execution with
  two structurally different members and a negative control; it reddens the
  moment a later phase ships a schema with a cross-document `$ref`, and M3-P7 is
  named in THIS PHASE'S OWN `conflicts-with` as doing exactly that. It refutes
  the work history's registry-hygiene claim at
  delivery/work-history/m3-p4.md:781 that no count over-assertion was found. The
  fix is the one the block six lines above already uses: assert the three keys by
  name.

**What I could not cover** is in section 0 and repeated here in short: the
soundness of round 4's ARGUMENTS (contract C's), CI on a real runner, the
post-merge `push` run T-009 requires, the default node 22 toolchain arm, the
seven schemas this phase does not touch, and the semantic correctness of the
work history's 46 citations beyond existence, range and seven spot reads.

## 11. The claim grep, run over this report

CLAUDE.md binds it on work histories; I ran it on my own review because the same
failure mode applies to a reviewer.

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' \
    delivery/review/clean-room-m3-p4-r4-criteria.md
```

Fourteen hits. Every one is either quoted fixture data (the `always` and `never`
tokens in the criterion 2e instances), a quotation from the phase's own source
(`a gate the runner never executes`, from test/report-contract.test.ts:1627), a
criterion label, or a procedural statement about what I did rather than a claim
about the world. Two are substantive and both carry an adjacent captured
command that settles them:

- "the schema does not compile at all and the instance is never reached" is
  settled by the captured `INVALID # schema is refused by this validator's
  strict policy` immediately above it.
- "quoting THAT as a scope result would be quoting a gate that never ran" is
  settled by the captured `result.json` showing `"status": "not-applicable"`,
  `"units": 0` and the unmet precondition immediately above it.

This report's own checks: both ASCII greps with `-a` return no hits, no em
dashes, and its 24 substantive `path:line` citations all resolve at this head.

END OF REPORT.
