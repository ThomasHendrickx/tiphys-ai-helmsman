# Delta verification: M3-P5 fix round 1 (48829d9 -> 85f9fd6)

Verified 2026-08-12. Written incrementally throughout; its mtime was the beacon.

Verifier: delta verifier, did not write the code and did not review the phase before.

## Section 0: disclosure of contract contamination (read this first)

The dispatch brief instructed me not to read the CONTRACT.md section headed
"THE ORCHESTRATOR'S OWN DERIVATION" until I had produced my own derivation.
I read CONTRACT.md in ONE tool call, which returned the whole file, so I saw
the orchestrator's table before running anything. I am recording that rather
than hiding it. Mitigation: every row of my own derivation below is produced by
an EXECUTED command whose output is pasted, not by recall of the table.



## Section A: WHAT THIS VERIFICATION DID NOT COVER

Read this before any finding. A search whose scope is wrong returns an empty
result indistinguishable from an absence of defects.

1. **I did not re-review the phase.** Contract A's ten acceptance criteria were
   not re-walked. Everything here is scoped to the delta 48829d9..85f9fd6,
   which is 8 files, 883 insertions, 4 deletions.
2. **I did not observe ANY CI run.** No `pull_request` arm, no post-merge
   `push` arm, no GitHub API. Every gate result in this report is the LOCAL
   `full` bundle in this container. Under T-009 that is evidence for one
   configuration only, and both CI arms still need their own witness. This is
   the largest single gap in this report.
3. **I did not run the suite on the default toolchain.** Every suite number
   here is node v26.6.0 with `dist/` built. I did not measure node v22.22.2, so
   I cannot say from my own runs how many tests skip there. CLAUDE.md warning
   12 records two, and I did not confirm it at this head.
4. **The `deploy`, `migrations` and `credential-token` gates were
   not-applicable in both of my runs**, so this verification says NOTHING about
   them. They were not exercised, only skipped.
5. **The two `clean-room-checklist` gates were not executed by the runner** and
   I did not perform them by hand.
6. **I did not audit `roles/plan-writer.md` or
   `roles/adversarial-plan-reviewer.md` beyond their frontmatter and the two
   output-contract axes.** Their prose was not read for correctness.
7. **I did not exercise briefs that do not exist.** M3-P6's `implementer` and
   `clean-room-reviewer` briefs, and M3-P9's `AGENTS.md`, are not in this tree.
   The fourth brief I constructed in section 5 is my own fixture, not theirs,
   and proves a property of the harness rather than anything about their
   content.
8. **I could not force one arm of the output-contract check.** The `undefined`
   branch at src/roles.ts:279 (an output whose type is not in `TYPE_TABLE`) is
   reached by my probe P2, but I did not find a way to make the SHIPPED tree
   reach it, because every shipped brief's outputs are registered types. I am
   not claiming that arm is unreachable in the shipped tree; I am saying I did
   not construct a case for it.
9. **My grep for tests depending on the removed reading entry covered `test/`
   and every tracked non-`delivery/` path.** I did not audit `delivery/`
   paperwork for dependencies on the entry, and I did not evaluate whether any
   GENERATED artifact (for instance a future clause-map projection) reads it.
10. **`scope` was measured in a third worktree**, the implementer's, because
    both of mine are detached. I did not verify that worktree's provenance
    beyond its head sha and a clean `git status`.
11. **I did not attempt to falsify the fix round's REASONING about the
    rejected alternatives** beyond checking that reason 2 (the ordering
    assertion) exists. Reasons 1 and 3 are arguments, and I checked their
    factual premises only where a command could settle them.

## Section B: verdict and findings at a glance

**The delta does what it says.** The mechanism is in code and not only in three
edited lists; the derivation reproduces at both heads and agrees with my own
independent one; every red witness I reproduced reddens what it claims to
redden; the removal is correct and nothing depended on the removed entry; the
shared-block edit is strictly additive with the anchor set unchanged; the
MEDIUM is honestly scoped IN THE SHIPPED ARTIFACT and not only in the work
history; and EXIT=20 is the same code for the same reason at both heads.

| id | severity | one line |
|---|---|---|
| D-1 | MEDIUM | the new test's comment claims a forward property the test does not have; falsified by adding a fourth brief and watching the suite stay green |
| D-2 | LOW | the work history quotes the shipped clause with words the clause does not contain |
| D-3 | LOW | reading entries are compared as raw strings, so `validate` and `brief compose` disagree about `./schemas/...` |

No HIGH. Nothing here blocks the merge on its own; D-1 is the one worth fixing
before M3-P6 starts, because M3-P6 is the phase the false claim misleads.

## Section 1: my own derivation of the class, run before reading the fix round's

Command (my own script, written by me, importing `TYPE_TABLE` from the tree
under test rather than restating it; frontmatter read by a parser of my own so
the derivation does not inherit a bug in the thing it audits):

```
$ node DVP5-mine.mjs <tree>          # node v26.6.0
```

At PREV 48829d9:

```
brief files found in roles/: ["README.md","_shared-dispatch-contract.md","adversarial-plan-reviewer.md","investigator.md","plan-writer.md"]
TYPE_TABLE size: 12
README.md: NO ROLE FRONTMATTER (include-fragment?) -> not a brief
_shared-dispatch-contract.md: NO ROLE FRONTMATTER (include-fragment?) -> not a brief
adversarial-plan-reviewer.md: outputs[0]=finding needs schemas/finding.schema.json onReading=true
investigator.md: outputs[0]=report needs schemas/report.schema.json onReading=false
    mandated-reading = ["roles/_shared-dispatch-contract.md","schemas/finding.schema.json"]
plan-writer.md: outputs[0]=plan needs schemas/plan.schema.json onReading=true
CLASS MEMBERS (violations): 1
unregistered-type outputs skipped: 0
```

At HEAD 85f9fd6: identical except

```
investigator.md: outputs[0]=report needs schemas/report.schema.json onReading=true
    mandated-reading = ["roles/_shared-dispatch-contract.md","schemas/report.schema.json"]
CLASS MEMBERS (violations): 0
```

AGREEMENT: my table matches the orchestrator's CONTRACT.md table row for row
(investigator NO, plan-writer yes, adversarial-plan-reviewer yes), and matches
the fix round's claim that the investigator was the only member at the reviewed
head. One member at PREV, zero at HEAD. No disagreement to report on the
derivation.

Scope of MY derivation, stated because the fix-round contract makes this the
first check: it enumerates `roles/*.md` only. It does not reach briefs that do
not yet exist (M3-P6 adds two, M3-P9 adds `AGENTS.md`), does not reach output
types absent from `TYPE_TABLE`, and does not reach brief BODY prose. Two files
in `roles/` carry no role frontmatter and are correctly not briefs.

## Section 2: progress log (beacon)

- Read CONTRACT.md (contamination disclosed in section 0).
- Diffed 48829d9..85f9fd6: 8 files, 883 insertions, 4 deletions.
- Ran my own derivation at both heads (section 1). Agrees with orchestrator.
- Read the fix round's whole work-history section (m3-p5.md lines 1780 to 2420).
- NEXT: re-run the fix round's own derivation script; adversarial probes of the
  mechanism; the removal; two red-witness reproductions; the forward
  constraint; the MEDIUM's shipped text; suite and bundle at both heads.

## Section 3: the fix round's own derivation script, re-run by me (contract item 1)

Script: `p5fix1-evidence/derive-output-schema-reading.mjs` (uncommitted, kept in
the round's evidence directory). Re-run by me, node v26.6.0, at BOTH heads.

At HEAD 85f9fd6 it printed `briefs examined: 5  holes: 0` and `EXIT=0`.
At PREV 48829d9 it printed `briefs examined: 5  holes: 1` and `EXIT=1`, with

```
roles/investigator.md
  outputs:          ["report"]
  mandated-reading: ["roles/_shared-dispatch-contract.md","schemas/finding.schema.json"]
  output report -> schemas/report.schema.json: ABSENT from mandated-reading  <== HOLE
  reads schemas/finding.schema.json: governs type finding, which this role does NOT declare as an output
  body prose names report.schema.json: NO
```

REPRODUCES. Both directions, both exit codes, and the class result matches my
own independent script. One byte-level caveat, stated because a re-runner will
see it: the block the work history publishes as its STEP 1 derivation carries no
`body prose names ...` lines, because that run predates the extension the work
history describes two sections later. The retained artifact
`p5fix1-evidence/derivation-before.txt` is 22 lines and
`derivation-before-2axis.txt` is 23. The published step-1 output is therefore an
earlier version of the script's output, which the work history says in prose
("the same script was extended"). The class verdict is unaffected.

## Section 4: the forward constraint (contract item 5)

```
$ git diff --numstat 48829d9 85f9fd6 -- roles/_shared-dispatch-contract.md
27	0	roles/_shared-dispatch-contract.md
$ git diff 48829d9 85f9fd6 -- roles/_shared-dispatch-contract.md | grep -n '^-[^-]'
rc=1
```

27 insertions, ZERO deletions, and no removed line anywhere in the hunk. The
edit is strictly additive at the line level.

All five pinned phrases, whitespace-flattened, at both heads:

```
--- dv-p5-prev                       --- dv-p5-head
PRESENT "within the FIRST MINUTES"        PRESENT
PRESENT "modification time is your beacon" PRESENT
PRESENT "NEWEST MODIFICATION TIME"        PRESENT
PRESENT "never existence and"             PRESENT
PRESENT "never completion"                PRESENT
```

Clause anchor set, computed with the tree's own `clauseAnchors`:

```
dv-p5-prev: ["incremental-output","beacon-is-not-a-claim"]
dv-p5-head: ["incremental-output","beacon-is-not-a-claim"]
```

UNCHANGED. Both new paragraphs sit inside the `incremental-output` section
(head lines 29 to 66) and the next heading is at line 68, so `clauseSection`
still bounds them inside that clause. Confirmed: the round's two new pinned
phrases are asserted against `clauseSection(shared, "incremental-output")` at
test/roles.test.ts:346 and flattened at test/roles.test.ts:330, so the
line-wrapped phrase "modification time is your beacon" is matched correctly by
the TEST.

## Section 5: the mechanism, adversarially (contract item 2)

Every probe run with `node bin/tiphys.ts validate --type role-brief <staged>`
at HEAD, node v26.6.0, against a copy of `roles/` in a scratch directory so the
tree was not touched. Control first.

| probe | result | EXIT |
|---|---|---|
| P0 control, staged brief unmodified | (no output) | 0 |
| P1 declared output's schema removed from mandated-reading | `INVALID #/outputs/0 output type report is governed by schemas/report.schema.json, which is not on mandated-reading, ...` | 1 |
| P2 second output naming an UNREGISTERED type | (no output) | 0 |
| P3 right schema PLUS two wrong ones (`finding`, `charter`) on the list | (no output) | 0 |
| P4 `outputs` key absent entirely | `INVALID #/outputs required property outputs is missing` | 1 |
| P5 `outputs: []` | `INVALID #/outputs array has 0 items, fewer than the required minimum 1` | 1 |

Each residue claim CONFIRMED rather than accepted:

- "An `outputs` entry naming a type NO schema is registered for is SKIPPED
  rather than refused" (src/roles.ts:257). TRUE, P2, exit 0.
- "It reaches the FRONTMATTER only" (src/roles.ts:261). TRUE, P3: a
  mandated-reading list that resolves but carries the WRONG documents alongside
  the right one is accepted. The check is a SUPERSET test, not an exact-set
  test, so nothing refuses a misdirecting extra entry. That is the same shape
  as the original defect (the investigator was pointed at
  `schemas/finding.schema.json`), and it is caught only if the RIGHT one is
  also absent. Stated at the definition site in substance, so this is not a
  hidden residue, but a reader should know the check would NOT have fired on
  the reviewed defect had the correct entry merely been added beside the wrong
  one. The round did remove the wrong entry, so the shipped artifact is clean.
- "a brief with no `outputs` at all": the question does not reach the new check
  at all. `schemas/role-brief.schema.json` makes `outputs` required with
  `minItems: 1` (P4, P5), so the schema refuses it first.

### FINDING D-1 (MEDIUM): the new test's own comment claims a forward property it does not have, and I falsified it by execution

Quoted claim, test/roles.test.ts:151:

```
 * DERIVED AT RUN TIME FROM `TYPE_TABLE` AND FROM EACH BRIEF, never from a
 * list written here. A brief added later, or an output type registered later,
 * is covered by this assertion without it being edited, ... it asserts BY NAME
 * and never by count, and it names nothing this file chose.
```

The output-TYPE half is true: the test imports `TYPE_TABLE` (test/roles.test.ts:43)
rather than restating it. The BRIEF-SET half is false. The test iterates
`AUTHORING_ROLES`, a hand-written array at test/roles.test.ts:49:

```
const AUTHORING_ROLES = ["investigator", "plan-writer", "adversarial-plan-reviewer"];
```

so the assertion names exactly the three roles this file chose, and a brief
added later is NOT covered without editing it. No test anywhere enumerates
`roles/` from disk:

```
$ grep -rn "roles" test/*.ts | grep -i "readdir\|glob\|\*\.md"
rc=1
```

FALSIFIED BY EXECUTION rather than by reading. In a copy of the tree at HEAD
(`git archive HEAD | tar -x`, node_modules and dist symlinked) I added a fourth
brief `roles/implementer.md` declaring `outputs: [work-history]` with
`schemas/work-history.schema.json` absent from its mandated reading, which is
exactly the class:

```
$ node bin/tiphys.ts validate --type role-brief roles/implementer.md
INVALID #/outputs/0 output type work-history is governed by schemas/work-history.schema.json, which is not on mandated-reading, so this brief never tells its agent where the contract for its own output is written
EXIT=1

$ node --test test/roles.test.ts
EXIT=0
```

Control, same lab, before adding the file: `tests 9, pass 9, fail 0, skipped 0`,
EXIT=0. So the CHECK reddens on a later brief and the SUITE does not.

WHAT THIS DOES AND DOES NOT UNDERMINE, because the distinction is the whole
severity. The src/roles.ts claim "M3-P6 ships two more briefs; this runs on
them the day they land, with nobody having to remember it" (src/roles.ts:230)
SURVIVES, because M3-P6's own acceptance criterion 1 at
delivery/plan/kernel-plan-m3.md:3420 reads "`tiphys validate --type role-brief`
exits 0 on both briefs", so validate is invoked on them by the plan and the
check fires there. What does not survive is the TEST comment's claim, and it is
the M3-P4 shape this project has paid five rounds for: a claim stronger than
what the change delivers, written in the one place a later reader consults to
decide whether they must edit the list. A M3-P6 implementer who reads that
comment has been told they need not add their briefs to `AUTHORING_ROLES`.

RECOMMENDED, and it is small: either derive `AUTHORING_ROLES` from
`readdirSync(rolesDir)` filtered to files with role frontmatter (which would
make the comment true), or correct the comment to say that the TYPE half is
derived and the brief set is a list this file maintains. I do not assert which
is right; either closes it.

TRANSLITERATION DECLARED (CLAUDE.md rule 3) for every captured `node --test`
block in this report: U+2139 INFORMATION SOURCE is rendered `i` and U+2714
HEAVY CHECK MARK is rendered `OK`. Counts are given at each block. Nothing else
in any captured output was changed.

## Section 6: the red witnesses (contract item 4)

Reproduced by hand in a SEPARATE copy of the tree
(`git archive HEAD | tar -x`, `node_modules` and `dist` symlinked), so
`dv-p5-head` was not modified by any defang. Settled rather than asserted: after
the build and after every probe in this report, `git status --porcelain` in
`dv-p5-head` printed nothing (rc=0), and the lab's three defanged files were
md5-compared back to HEAD's at the end (`LAB BYTES IDENTICAL TO HEAD`, below).
A pristine copy of every file was taken with
`cp` before each defang and restored by copying back (standing warning 8).
Transliteration in the blocks below: U+2716 rendered `x` (3), U+2139 rendered
`i` (11). Nothing else changed.

CONTROL, lab pristine:

```
$ node --test test/roles.test.ts
i tests 9  i pass 9  i fail 0  i skipped 0     EXIT=0
```

**MEMBER B, the one the contract singled out** ("leaves detection printing and
removes only its effect on the exit code"). Defang: at
src/commands/validate.ts:307 the return drops the `outputContract.length > 0`
disjunct. The specific claim, checked directly rather than inferred from the
red test:

```
$ node bin/tiphys.ts validate --type role-brief <staged holed brief>
INVALID #/outputs/0 output type report is governed by schemas/report.schema.json, which is not on mandated-reading, so this brief never tells its agent where the contract for its own output is written
EXIT=0
```

The diagnostic STILL PRINTS and the exit code is 0. That is the green-and-
worthless shape, and the witness catches it:

```
$ node --test test/roles.test.ts
x validate --type role-brief refuses a brief that does not read the schema of an output it declares, in two structurally different shapes
  AssertionError [ERR_ASSERTION]: a brief reading no contract for its own output validated
i tests 9  i pass 8  i fail 1                  EXIT=1
```

CONFIRMED, exactly as claimed.

**MEMBER C**, the shipped defect restored (`schemas/report.schema.json` swapped
back to `schemas/finding.schema.json` in the investigator's reading list):

```
$ node --test test/roles.test.ts                EXIT=1
x every authoring brief puts the schema of every output type it declares on its mandated-reading list
  AssertionError [ERR_ASSERTION]: investigator declares output report, whose contract is schemas/report.schema.json, and does not read it
```

CONFIRMED. And STRONGER than the round claimed: member C also reddens the
criterion-1 test, which the work history did not quote:

```
  AssertionError [ERR_ASSERTION]: investigator: INVALID #/outputs/0 output type report is governed by schemas/report.schema.json, which is not on mandated-reading, ...
```

so the shipped defect is now caught by two independent assertions, not one.
Under-claimed, not over-claimed.

**THE FOURTH DEFANG**, aimed at the witness rather than the code (the loop is
crippled to `index < 1`, walking only the first declared output):

```
$ node --test test/roles.test.ts                EXIT=1
  AssertionError [ERR_ASSERTION]: a brief satisfying only its first output validated
i fail 1
```

CONFIRMED: it reddens on member TWO's assertion and would have passed member
one, so the second member is load-bearing. This satisfies "one witness is not a
class": two structurally different members, and a defang proving they are not
redundant.

RESTORED, and the lab's bytes verified identical to HEAD afterwards:

```
$ node --test test/roles.test.ts
i tests 9  i pass 9  i fail 0  i skipped 0     EXIT=0
$ diff <(md5sum src/commands/validate.ts src/roles.ts roles/investigator.md) <(cd dv-p5-head && md5sum ...)
LAB BYTES IDENTICAL TO HEAD
```

## Section 7: the removal of schemas/finding.schema.json (contract item 3)

I searched WIDER than the fix round did (it searched two test files; I searched
every tracked file at PREV).

```
$ git grep -n "finding\.schema\.json" -- . | grep -v "^delivery/"
roles/adversarial-plan-reviewer.md:13:  - schemas/finding.schema.json
roles/adversarial-plan-reviewer.md:28:by `schemas/finding.schema.json`: a verdict, the model family that produced the
roles/investigator.md:13:  - schemas/finding.schema.json
schemas/finding.schema.json:3:  "$id": "https://tiphys.dev/schemas/finding.schema.json",
src/commands/validate.ts:87:  ["finding", "finding.schema.json"],
test/finding-schema.test.ts:38:const schemaPath = join(repoRoot, "schemas", "finding.schema.json");
```

The only test hit is test/finding-schema.test.ts:38, which reads the schema
file directly to test the SCHEMA; it does not read the investigator's brief and
is unaffected by the removal. Nothing else outside `delivery/` depended on the
entry.

The fix round declared as NOT covered "any assertion that reaches the reading
list without naming a filename, for instance one comparing whole frontmatter
objects. Neither was searched." I searched that region:

```
$ git grep -n "mandated-reading\|mandatedReading\|Mandated reading" -- test/
```

The only assertion that reads a brief's reading list as a LIST is
test/brief-compose.test.ts:125, and it derives `declared` from the brief file
itself and deep-equals it against the composed output, so it tracks whatever
the list contains and cannot depend on any particular entry. No frontmatter
deep-equality assertion exists. The fix round's stated gap is real and, having
searched it, EMPTY.

Governance, checked independently rather than taken from the round's grep:

```
$ grep -o '"\$ref": *"[^"]*"' schemas/report.schema.json | grep -v '"#'
rc=1
```

`schemas/report.schema.json` has ZERO external `$ref`s: every reference is a
local `#/$defs/...` pointer, including `findings` -> `#/$defs/finding` at
schemas/report.schema.json:56. So the top-level finding-set document governs
nothing an investigator writes, and the removal is correct.

INCIDENTAL CONFIRMATION of the round's rejected-alternative reason 2 (an
injected reading entry would break criterion 3's ordering assertion): that
assertion is a `deepEqual` of the composed list against the frontmatter list
(test/brief-compose.test.ts:133), so an injected entry would appear in one and
not the other. The reason is real, not decorative.

## Section 8: the MEDIUM's honesty (contract item 6)

The question the contract poses is whether the shipped ARTIFACT says it is not
a lock, or whether only the work history does. Measured on the COMPOSED briefs,
which is what a dispatched agent receives, whitespace-flattened:

```
investigator               honest-limit=1 not-a-lock=1 teeth-are-watchdog=1 trigger=1 consequence=1 stale=dead=1  (296 lines)
plan-writer                honest-limit=1 not-a-lock=1 teeth-are-watchdog=1 trigger=1 consequence=1 stale=dead=1  (255 lines)
adversarial-plan-reviewer  honest-limit=1 not-a-lock=1 teeth-are-watchdog=1 trigger=1 consequence=1 stale=dead=1  (241 lines)
```

and at PREV, the same six probes against the composed investigator brief return
`0 0 0 0 0` for the five that exist at HEAD.

So the honesty is IN THE ARTIFACT, not only in the work history.
roles/_shared-dispatch-contract.md:61 to :66 says to the reader "Nothing here
forces the append", "not to make the omission impossible" and "The teeth are
the watchdog ... so a dispatch made without one leaves this clause with none".
This is NOT the M3-P4 shape. The change is correctly described by its own text
as an instruction with a trigger and a stated price, and the artifact does not
claim to be a mechanism.

The reviewer's own pre-fix demonstration also reproduces exactly:

```
PREV  composed investigator: 251 lines, grep -c report.schema.json -> 0
HEAD  composed investigator: 296 lines, grep -c report.schema.json -> 2
                                        grep -c finding.schema.json -> 1
```

The 251 matches the orchestrator's CONTRACT.md measurement to the line. The one
remaining `finding.schema.json` occurrence at HEAD is the new prose paragraph
that says explicitly it is NOT this role's contract, which is the round
correcting a reader of an older composed brief rather than a leftover.

### FINDING D-2 (LOW): the work history puts words in quotation marks that the shipped clause does not contain

delivery/work-history/m3-p5.md:2179 quotes the clause as

```
("Nothing here forces the append ... the kernel's contribution is
to make the absence VISIBLE and the consequence real, not to make the omission
impossible")
```

The shipped sentence, at roles/_shared-dispatch-contract.md:62, is "and what
the kernel adds is to make the absence VISIBLE ...".

```
$ node -e '<substring test>' roles/_shared-dispatch-contract.md
quoted string present in shipped clause: false
actual shipped wording present:          true
```

The MEANING is identical and nothing is overstated, so this is LOW. It is
reported rather than waved through because in this repository a string inside
quotation marks in a work history is read as a capture of the artifact, and the
distinction between quoted-and-exact and paraphrased-in-quotes is the same
distinction T-010 and the red-witness rule are built on. Fix is one word.

## Section 9: the suite, all three axes with the SKIPPED count (contract item 7, first half)

Measured by me at HEAD 85f9fd6. Toolchain node v26.6.0 (checked with
`node --version` in the shell that ran each command), build state: `dist/`
BUILT (`npm run build` exit 0, `git status --porcelain` empty afterwards).
Transliteration in this section: U+2139 rendered `i` (16 across the two blocks).

| invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|
| `npm test` (what the `suite` gate runs) | 588 | 588 | 0 | **0** | 0 |
| bare `node --test` from the repository root | 590 | 590 | 0 | **0** | 0 |

```
$ npm test
i tests 588  i suites 0  i pass 588  i fail 0  i cancelled 0  i skipped 0  i todo 0
EXIT=0

$ node --test
i tests 590  i suites 0  i pass 590  i fail 0  i cancelled 0  i skipped 0  i todo 0
EXIT=0
```

Both figures the fix round reported are CONFIRMED, and the two-test gap is
named rather than inferred:

```
$ grep -c "greet " <npm test output>     -> 0
$ grep   "greet " <bare output>
OK greet returns a greeting for a name (0.778057ms)
OK greet rejects an empty name (0.429004ms)
```

which is exactly the `sandbox/test/greet.test.js` pair CLAUDE.md warning 12
records. The many `# skipped <file>.json:` lines in both runs are the vendored
JSON-Schema-Test-Suite's deliberately excluded cases and are NOT `node --test`
skips; the reporter's own counter is 0 on both invocations.

## Section 10: the witness record

`witness/role-brief-output-contract-refused.json` declares two dangerous states,
a mutation in src/roles.ts (`if (!declared.has(wanted)) {` -> `if (false) {`)
and a mutation in src/commands/validate.ts (the exit-code disjunct), which are
members A and B. I reproduced B by hand above; the `red-witness` gate result is
in section 11.

### FINDING D-3 (LOW): the check compares reading entries as raw strings, so `validate` and `brief compose` disagree about an equivalent path form

The check tests `declared.has("schemas/" + file)` (src/roles.ts:275 and :282),
a raw string-set membership. Resolution in `resolveMandatedReading` is
`join(root, declared)` (src/roles.ts:346), which normalises. So a brief writing
the same document as `./schemas/report.schema.json` composes cleanly and is
refused by the validator:

```
$ node bin/tiphys.ts brief compose --role investigator --phase templates/plan.example.yaml --phase-id M9-P1
compose EXIT=0                       (the path resolves; the brief composes)
$ node bin/tiphys.ts validate --type role-brief roles/investigator.md
INVALID #/outputs/0 output type report is governed by schemas/report.schema.json, which is not on mandated-reading, so this brief never tells its agent where the contract for its own output is written
EXIT=1
```

Why this is worth a line rather than nothing: the round's REASON 1 for
rejecting the injection alternative was that it would make
"`tiphys validate --type role-brief` (which reads the file) and
`tiphys brief compose` ... hold two different opinions about one property. This
repository has paid repeatedly for exactly that shape"
(delivery/work-history/m3-p5.md:2048). The chosen implementation reaches the
same shape by another route. It is LOW and not higher because the divergence is
FAIL-SAFE: validate is the stricter of the two, so the outcome is a false
REFUSAL an author fixes by deleting two characters. The case I constructed
produces a refusal and not an acceptance; I did NOT find a path-form variation
that makes the check ACCEPT a brief missing its output's schema, and I am not
claiming none exists. No brief in the tree is in the `./` form:

```
$ git grep -n "  - \./" -- roles/
rc=1
``` I am not asserting the check
should normalise; I am recording that the argument the round used against the
alternative applies, in weaker form, to what it built.

### Confirmed residue, NOT a finding: the check is satisfied by a string, and the missing document is caught elsewhere

```
$ mv schemas/report.schema.json <away>
$ node bin/tiphys.ts validate --type role-brief roles/investigator.md
EXIT=0
$ node bin/tiphys.ts brief compose --role investigator ...
tiphys brief compose: mandated-reading path schemas/report.schema.json does not exist (looked for .../schemas/report.schema.json)
compose EXIT=1
```

So `validate --type role-brief` accepts a brief naming a schema document that
is not on disk. That is the division of labour
`schemas/role-brief.schema.json:5` states ("IT CANNOT SEE THE FILESYSTEM ...
resolved by `tiphys brief compose`"), and compose does refuse it, naming the
path. The residue is real and it is closed by a different command, so it is
recorded here rather than raised. The fix round's "WHAT IT DOES NOT REACH" list
does not name it; it did not need to, because the schema comment does.

## Section 11: the gate bundle at BOTH heads (contract item 7, second half)

The contract's warning is right that "exit 20, not a regression" needs its own
evidence. I ran the full local bundle at each head myself:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --evidence <dir> --base origin/main --head HEAD --phase m3-p5
```

| gate | PREV 48829d9 | HEAD 85f9fd6 |
|---|---|---|
| agent-rules-drift | green 17 | green 17 |
| citations | **not-applicable 0** | **not-applicable 0** |
| clause-map | green 34 | green 34 |
| coverage | green 115 | green 115 |
| credential-scrub | green 7 | green 7 |
| credential-token | not-applicable 0 | not-applicable 0 |
| deploy | not-applicable 0 | not-applicable 0 |
| manifest-self-check | green 8 | green 8 |
| migrations | not-applicable 0 | not-applicable 0 |
| red-witness | green **15** | green **16** |
| suite | green **586** | green **588** |
| scope | see below | see below |

```
PREV: gates: declared 12 applicable 7 verdict 7 green 7 red 0 not-applicable 5 error 0 vacuous 0
PREV: gates: required gate(s) not applicable: citations, scope
PREV GATES EXIT=20

HEAD: gates: declared 12 applicable 7 verdict 7 green 7 red 0 not-applicable 5 error 0 vacuous 0
HEAD: gates: required gate(s) not applicable: citations, scope
HEAD GATES EXIT=20
```

**EXIT=20 AT BOTH HEADS, AND THE REASON IS THE SAME REASON, quoted from each
run's own `citations/result.json` rather than asserted:**

```
PREV: "no changed path under the configured documents globs (30 changed path(s) total). ..."
HEAD: "no changed path under the configured documents globs (31 changed path(s) total). ..."
```

Byte-identical apart from the path count, and the one extra path at HEAD is
`witness/role-brief-output-contract-refused.json`, which the HEAD evidence list
carries and the PREV list does not. So the fix round's claim that EXIT=20 is
"the SAME code and the SAME reason as the handback bundle at 48829d9" is
CONFIRMED, and it is confirmed by measuring both arms rather than by reasoning
from one.

MY RUNS DIFFER FROM THE ROUND'S IN ONE GATE, AND IT IS MY ENVIRONMENT, NOT A
REGRESSION. Both of my worktrees are DETACHED, so `scope` reports:

```
"precondition scope-branch-is-a-phase-branch evaluated and unmet: branch HEAD does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$"
```

which is the CLAUDE.md branch-names-are-load-bearing rule seen from the other
side. That is why my bundles read 7 applicable / 5 not-applicable where the
round's read 8 / 4. Settled by running `scope` on the real phase branch (the
existing worktree at `claude/m3-p5-authoring-role-briefs`, HEAD 85f9fd6,
`git status --porcelain` empty before and after):

```
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
status: green  units: 31
detail: 31 changed path(s) audited against declaration delivery/plan/phase-declarations/m3-p5.json at merge base 52fe657a... (1 declared path(s) not touched: src/validate.ts)
```

`scope` green, 31 units, 0 unmatched. The round's claim reproduces.

RED-WITNESS, checked in its own record rather than from the summary line:

```
detail: 16 witness(es) evaluated (11 own, 5 stored re-evaluated in 94745ms); every witness red against every declared dangerous state and green at head
uncoveredSources: []
```

and the new witness at `evaluations/10`:

```
"witness": "role-brief-output-contract-refused",  "status": "green",
members[0] mutation of src/roles.ts   -> runs: exit 1 red, exit 1 red, exit 0 green-at-head
```

so the gate reproduced the defangs independently of what I reproduced by hand,
with `repeats: 2` per member.

## Section 12: bytes, and my own report's hygiene

```
$ git diff --stat 48829d9 85f9fd6
 8 files changed, 883 insertions(+), 4 deletions(-)
```

No file reported as `Bin`, so every changed source file has a reviewable diff.

## Section 13: this report's own hygiene

Both authored-byte checks, with the load-bearing `-a` (T-010), over the eight
changed paths of the delta and over this report itself:

```
$ git diff --name-only 48829d9 85f9fd6 | xargs grep -raP '[^\x00-\x7F]'
non-ascii rc=123
$ git diff --name-only 48829d9 85f9fd6 | xargs grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]'
control  rc=123
$ grep -raP '[^\x00-\x7F]' delivery/review/verification-m3-p5-fix-round.md
non-ascii rc=1
$ grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]' delivery/review/verification-m3-p5-fix-round.md
control  rc=1
```

`xargs` rc=123 is grep finding nothing in every file; rc=1 is grep finding
nothing in one file. `git diff --stat` reports no file as `Bin`.

TRANSLITERATION, DECLARED ONCE FOR THE WHOLE REPORT (CLAUDE.md rule 3). Every
captured `node --test` block above had U+2139 INFORMATION SOURCE rendered `i`,
U+2714 HEAVY CHECK MARK rendered `OK`, and U+2716 HEAVY MULTIPLICATION X
rendered `x`. Counts across the whole report: U+2139 x 27, U+2714 x 4,
U+2716 x 4. Nothing else in any captured output was changed, and no captured
output in this report was written from memory.

THE CLAIM GREP, run over this report before handing back:

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' <this file>
```

FOURTEEN hits, enumerated rather than summarised, because a count is not a
disposition:

- Nine are verbatim quotations of captured CLI output or of the artifacts under
  review: the two pinned-phrase lines, the four lines of the test comment I am
  falsifying, and three copies of the validator's own diagnostic message.
- Two are quotations of the shipped clause text under examination in section 8.
- Three are this paragraph and the grep command it quotes.
- Two carry their settling command adjacent: "the witness catches it", followed
  immediately by the red run; and "`dv-p5-head` was not modified", followed by
  the `git status --porcelain` rc=0 and the md5 comparison.

Two sentences were RESTATED rather than defended. The claim that the path-form
divergence produces no acceptance is now "I did not find a path-form variation
that makes the check ACCEPT ... and I am not claiming none exists". And the
unforced `undefined` arm of the check is carried in the not-covered list as
item 8 rather than written anywhere as a settled absence.

MY CITATION FORM, checked rather than assumed. This report cites files that do
not exist in the worktree it is written in (it branches off `main`, and M3-P5's
deliverables are unmerged). That is safe here and it is not luck: the
`citations` gate's `documents` set omits `delivery/review/**` entirely
(src/gates/citations.ts:232 onward, with the reasoning at
src/gates/citations.ts:184), so a review record's refs are not resolved against
head. The existing delivery/review/verification-m3-p4-fix-round.md on `main`
carries 25 bare `path:line` refs for the same reason. The gate's precondition
paths likewise do not include `delivery/review/`, so a PR carrying only this
file leaves `citations` not-applicable.

## Section 14: agreement and disagreement with the orchestrator

Stated because the contract asks for it. Disclosure of contamination is in
section 0.

- On the DERIVATION we AGREE, row for row: one class member at 48829d9
  (investigator), zero at 85f9fd6, plan-writer and adversarial-plan-reviewer
  clean at both. My script and the round's script and the orchestrator's table
  all say the same thing, and mine was written independently.
- On the MEDIUM's framing the orchestrator was RIGHT and the round agreed with
  it: the pre-fix block already told the reader a watchdog reads the mtime
  (roles/_shared-dispatch-contract.md:21 at both heads), so the gap was the
  TRIGGER and the CONSEQUENCE, not the fact of being watched. Confirmed at both
  heads.
- On "251 lines, grep -c report.schema.json -> 0" the orchestrator's pre-fix
  measurement reproduces EXACTLY (251 and 0 by `wc -l` and `grep -c`).
- One point where the round's own published evidence is weaker than its claim,
  and neither the round nor the orchestrator noticed: the round says "Three
  phrases must survive verbatim. Checked before writing rather than after" and
  publishes a grep whose output is TWO lines. `modification time is your
  beacon` spans a line break at roles/_shared-dispatch-contract.md:20 to :21,
  so it matches no single line and the published command did not confirm it:

```
$ grep -n "modification time is your beacon" roles/_shared-dispatch-contract.md
rc=1
```

  The CLAIM is nonetheless TRUE (section 4 confirms all five phrases survive
  whitespace-flattened) and the TEST pins it correctly because
  test/roles.test.ts:330 flattens before comparing. So this is an evidence gap
  and not a defect, and it is recorded rather than raised as a finding: a grep
  for three alternated patterns that returns two lines was read as confirming
  three. That is the same family as T-010, one level down.

## Section 15: what I recommend

APPROVE the delta. The HIGH is fixed at the mechanism and not at the instance,
and the MEDIUM is honestly delivered as what it is. Before M3-P6 is dispatched,
fix D-1 (three lines) so that the phase which inherits the claim is not
misled by it. D-2 and D-3 are optional.
