# Clean-room review, M3-P5, contract A: the acceptance-criteria walk

Reviewer: clean-room agent, contract A (acceptance criteria). I did not read the
implementation session; the work history was read as a CLAIM and every claim
below that I repeat was re-executed.
Head under review: 48829d99eaa78b3ed64953f5ee5c65f85c84d0e3
Worktree: a detached checkout of that head, `npm ci`ed by me (see the
environment note). Toolchain: node v26.6.0, npm 11.18.0, verified with
`node --version` in the shell that ran each command.
This file was created in the first minutes and appended as work proceeded
(T-008 `incremental-output`).

## VERDICT

**APPROVE.**

- 10 acceptance criteria walked (the plan numbers them 1, 2, 3, 3b, 4, 5, 6,
  6b, 6c, 7; the phase's own summary table calls them "nine" and lists ten).
- **MET: 10. PARTIALLY MET: 0. NOT MET: 0.**
- Findings: **none**. No high, no medium, no low.
- Every criterion was EXECUTED, not read. Every both-directions criterion was
  driven in both directions by me, with my own fixtures where fixtures were
  needed, and every removal witness was followed by a restoration witness.

Two things I tried to turn into findings and could not, recorded so the
arbitrator can see the attempts rather than only the result: the criterion 5
`if`/`then` to `oneOf` deviation (declared, with its diagnostic cost disclosed
in the work history unprompted) and the report-schema comment ordering (the
superseded sentence precedes its correction inside one `$comment`, which is the
same annotate-not-rewrite discipline criterion 4 requires elsewhere and is
clearly marked). Neither survived as a defect.

## Section 0: WHAT THIS REVIEW DID NOT COVER

The arbitrator reads this before any finding, so it is first.

1. **I did not run the CI arms.** Every result here is from THIS container. T-009
   binds: a gate result is evidence only for the configuration it ran under, and
   the complete sentence names the event and the head sha. I ran the gate runner
   locally at head 48829d9 with `--base origin/main`. I did NOT observe the
   `pull_request` run, and I did NOT observe the post-merge `push` run on the new
   `main` head, which T-009 rule 1 says the phase does not close without. Both are
   outside what I can reach.
2. **I did not review the implementation for correctness beyond the criteria.**
   This is contract A. I read `src/roles.ts`, `src/commands/brief.ts` and
   `src/commands/validate.ts` only where a criterion pointed at them. A design or
   correctness defect that no acceptance criterion reaches is the other
   contract's, and the hazard-class table itself says two hazard items are
   reachable by NO criterion (a clause whose text says the opposite of its row,
   and a `mandated-reading` list that omits the document a role needs). I did not
   attempt either, because neither is computable and both are explicitly assigned
   elsewhere (M3-P7's `clause-text-matches-row` probe).
3. **I did not judge whether the three briefs' PROSE is good.** Criterion 6b's
   grep half is the only text-content assertion in scope and I checked exactly
   that. Whether `roles/plan-writer.md` gives a plan writer what they need is a
   judgment no command settles and I did not substitute my taste for it.
4. **My behavior-resolution check used EXACT string equality against the reporter
   lines of ONE `npm test` run.** It would not catch a behavior whose registered
   name matches a test that exists but is `skipped` or `todo` in another
   configuration. Mitigated but not eliminated by the run reporting 0 skipped and
   0 todo.
5. **My count-pinning scan was a grep plus a reading of the two tests M3-P4's
   medium named.** It is a search, and a search whose scope is wrong returns an
   empty result indistinguishable from an absence of defects. Specifically NOT
   covered: assertions that pin a count indirectly (a hard-coded array the test
   then compares by length), and any count pin in `scripts/`, `src/gates/` or
   `.github/`, none of which this phase changes.
6. **I did not verify the union accounting for `gates.manifest.json`,
   `delivery/STATE.md` or any file this phase does not change.** I computed the
   set of both-sides-modified files (three) and verified those three. A file
   changed on only one side cannot conflict and was not examined.
7. **I did not run the two `clean-room-checklist` gates.** The runner reports
   them as declared and NOT executed by it
   (`unit-tests-for-changed-service-methods`,
   `fixtures-for-changed-component-states`). They are a human checklist and are
   outside this contract.
8. **The `citations` gate did not run on this branch and I did not force it to.**
   It reports `not-applicable`, 0 units, because no changed path falls under the
   configured DOCUMENTS globs even though the diff-touches precondition is met
   via `delivery/requirements/clause-map.json`. So no citation in
   `delivery/work-history/m3-p5.md` was machine-resolved by me. I hand-checked
   only the three `roles/investigator.md:NN` citations the report-schema
   correction depends on.
9. **The environment differed from the one described to me.** The worktree's
   `node_modules` symlink pointed at an EMPTY directory, so I installed my own.
   If the implementers' evidence was produced against a different dependency
   tree, my run is not a byte-for-byte replication of theirs. The lockfile is the
   same (`npm ci`), so this is a small risk, but it is not zero and it is stated.

## Running log

- Worktree confirmed clean at 48829d9.

## Environment note, recorded because it changes what "verified" means here

The worktree's `node_modules` was a SYMLINK to `/home/user/tiphys-ai-helmsman/node_modules`,
and that directory is EMPTY (0 entries). The first `npm run build` therefore
failed with TS2688 (`Cannot find type definition file for 'node'`) and TS2878.
That is an environment fault, not a defect in the phase. Replaced the symlink
with a real directory and ran `npm ci` (exit 0, 14 packages, NO EBADENGINE line,
node v26.6.0 / npm 11.18.0). All results below are from that state.

Gate-list steps, at 48829d9:

| step | command | exit | note |
|---|---|---|---|
| 1 | `npm ci` | 0 | 14 packages added, no EBADENGINE |
| 2 | `npm run build` | 0 | `git status --porcelain` afterwards shows ONLY this review file (untracked) |
| 3 | suite | see below | |

## Merge shape

Merge base of HEAD with `origin/main` is 52fe657, which IS the current
`origin/main` tip, so the branch has fully absorbed main. The phase merge is
591838d (parents 4e4a824 phase-side, 52fe657 main-side); their merge base is
a7d5686.

### Suite, the complete sentence

Toolchain node v26.6.0 (verified in the shell that ran it), build state `dist/`
BUILT, invocation `npm test` (which is `node --test "test/**/*.test.ts"`).

```
i tests 586
i suites 0
i pass 586
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 171114.631515
npm test exit=0
```

TRANSLITERATION DECLARED (CLAUDE.md rule 3): the eight summary lines above are
verbatim captured output except that the leading U+2139 INFORMATION SOURCE
glyph, 8 occurrences, is rendered as `i`. Nothing else in any captured output in
this document was changed. There were zero U+2716 lines to transliterate because
there were zero failures.

Matches the dispatch's stated reference of 586/586/0.

Note for a later reader: the run also prints many lines beginning
`# skipped <file>.json: ...`. Those are the VENDORED JSON-Schema-test-suite
fixtures a test reports as deliberately-excluded cases; they are not `node --test`
skips, and the reporter's own `skipped` counter is 0.

### Union accounting, verified rather than accepted

The merge is 591838d. Parents: 4e4a824 (phase) and 52fe657 (main). Merge base
a7d5686. Three files were modified on BOTH sides since the base, computed as
`comm -12` over the two name-only diffs:

```
delivery/requirements/clause-map.json
src/commands/validate.ts
test/behaviors.json
```

**`test/behaviors.json`. The implementers' arithmetic is CORRECT.** Measured by
set operations on the behavior ids, not by line counts:

| rev | behaviors |
|---|---|
| base a7d5686 | 513 |
| phase 4e4a824 | 534 (+21 over base) |
| main 52fe657 | 568 (+55 over base) |
| merge 591838d | **589** |
| HEAD 48829d9 | 590 |

589 = 513 + 21 + 55. `merge \ (phase union main)` is EMPTY and
`(phase union main) \ merge` is EMPTY, so it is a true union with no id
invented and none dropped. HEAD adds exactly one id over the merge,
`investigator-report-requires-repro`, which is criterion 6's behavior added
after the merge. Script and full output:
delivery/review/clean-room-m3-p5-criteria.md:1 is this file; the script is at
the evidence path named in section 0.

**`delivery/requirements/clause-map.json`. Also correct.** It is an OBJECT keyed
by requirement id, so "rows" means keys:

| rev | keys |
|---|---|
| base a7d5686 | 18 |
| phase 4e4a824 | 25 (+7: R-004, R-005, R-006, R-010a, R-015a, R-029, R-092) |
| main 52fe657 | 27 (+9: R-035, R-049, R-052a, R-057a, R-083a, R-085, R-086, R-088, R-089a) |
| merge 591838d | **34** |
| HEAD | 34 |

34 = 18 + 7 + 9, symmetric difference against the union EMPTY in both
directions. I also compared VALUES, not just keys: no key present in the base
had its value mutated by the merge, and every phase-side and main-side key's
value at the merge is byte-identical (by JSON stringification) to the value on
the side that introduced it. So the union is verified at value level, not only
at key level.

**`src/commands/validate.ts`, the THIRD conflict, which the implementers'
"three conflicts" claim covers but the two numeric accountings do not.** Checked
by diffing the merge result against the MAIN parent and comparing that to the
phase side's own base-to-phase diff. The merge-vs-main diff is exactly the
phase-side change (the two imports, the `role-brief` and `finding` TYPE_TABLE
rows, `validateRoleBrief`, and the `if (type === "role-brief")` early return),
and main's `report`/`final-report`/`work-history` rows, `COMPANION_TABLE` and
`companionsFor` all survive in place. Union verified.

## Criterion 6, the newly delivered one, WALKED IN BOTH DIRECTIONS PLUS THE THREE MUST-NOT-BREAK CASES

Fixtures written by me, not taken from the branch. All five run through the
shipped CLI at HEAD.

| fixture | what it is | exit | output |
|---|---|---|---|
| `verdict-no-repro.yaml` | `role: investigator`, verdict present, NO `repro` | **1** | two INVALID lines, the second `INVALID #/repro required property repro is missing` |
| `verdict-with-repro.yaml` | same document plus a branch-1 `repro` | **0** | (silent) |
| `base-noverdict.yaml` | `role: investigator`, NO verdict at all | **0** | (silent) |
| `verdict-r092.yaml` | verdict plus a branch-2 NON-REPRODUCTION record | **0** | (silent) |
| `templates/report.example.yaml` | the shipped example (`role: implementer`, verdict, no repro) | **0** | (silent) |

Captured:

```
=========== base-noverdict
exit=0
=========== verdict-no-repro
INVALID # value does not satisfy the requirements its own shape triggers here
INVALID #/repro required property repro is missing
exit=1
=========== verdict-with-repro
exit=0
=========== verdict-r092
exit=0
=========== shipped example
exit=0
```

**Criterion 6: MET.** The refusal direction names `repro` explicitly, which is
what the criterion asks for and what a bare `oneOf` would not have given. The
acceptance direction works. And the three cases that must NOT break do not: the
honest non-reproduction record (R-092, branch 2) is writable, the
not-yet-concluded investigator report is writable, and the shipped example still
validates. The failure this repository fears most, a schema under which the true
record is unwritable while a fabricated one passes, is NOT present here: I
constructed the true record and it validated.

Residue I checked and confirm is real (the schema states it itself, so this is
not a finding): nothing forces `exit-code` nonzero, so
`repro: {command, exit-code: 0, ...}` validates while claiming to be red. The
schema's own `$defs/repro` `$comment` names this, names why (`not` and numeric
bounds are outside the declared authoring vocabulary), and hands it to M3-P7's
checklist. Declared, not hidden.

## Criterion 1: MET

```
=== investigator
exit=0
=== plan-writer
exit=0
=== adversarial-plan-reviewer
exit=0
```
(`node bin/tiphys.ts validate --type role-brief roles/<id>.md`, three roles.)

## Criterion 2: MET, both directions, and it is a DIFFERENT state from criterion 6c

Mutated `roles/plan-writer.md`'s fourth `mandated-reading` entry to
`roles/no-such-mandated-reading.md` (restored from the pristine snapshot
afterwards; `git status --porcelain` clean).

```
### Criterion 2, MISSING direction
ls: cannot access 'roles/no-such-mandated-reading.md': No such file or directory
tiphys brief compose: mandated-reading path roles/no-such-mandated-reading.md does not exist (looked for .../roles/no-such-mandated-reading.md)
exit=1

### Criterion 2, PRESENT direction: create a regular file at that same path
exit=0
```

## Criterion 3: MET, both directions

`node bin/tiphys.ts brief compose --role plan-writer --phase templates/plan.example.yaml --phase-id M9-P1`
exits 0 and emits 228 lines. ORDER verified by line number in the output:

| landmark | line |
|---|---|
| `## Mandated reading, in order` + its four resolved paths | 7 to 13 |
| `# Brief body` then `# Plan writer` | 33, 35 |
| `# Phase M9-P1` and the rendered phase | 163 to 228 |

Negative direction:

```
tiphys brief compose: templates/plan.example.yaml declares no phase with id M9-P99
exit=1
```
The id is named.

## Criterion 3b: MET, driven from the schema, two structurally different members

The test derives its field list from `schemas/plan.schema.json`'s
`$defs.phase.required` at run time (test/brief-compose.test.ts:232), not from a
hand-written list, which is what the criterion demands. I confirmed all 15
required names render as `### <field>` sections in the composed output.

RED WITNESS, forced by me by editing `PHASE_FIELD_ORDER` in src/roles.ts:319
and restoring from the pristine snapshot:

| member | composed output lines | test verdict |
|---|---|---|
| baseline | 228 | 3 pass, 0 fail |
| drop `hazard-classes[]` (array of objects) | **220**, and `grep -c hazard-classes` = 0 | RED: `the rendered phase drops required field(s): hazard-classes` |
| drop `acceptance[]` (array) | **222** | RED: `the rendered phase drops required field(s): acceptance` |
| restored | 228 | 3 pass, 0 fail |

Both members shrink the composed output and redden the schema-driven test, so
the "renderer silently drops a field" hazard is genuinely reached, and it is
reached by two structurally different members as section 2.3 rule 6 requires.

## Criterion 4: MET, with a red witness on BOTH halves

Inspection: `roles/adversarial-plan-reviewer.md:5` (frontmatter `sees`),
`roles/adversarial-plan-reviewer.md:53` and
`roles/adversarial-plan-reviewer.md:55` all carry the string
"the input report, the plan, and the code", and
delivery/intake/orchestrated-delivery-process.md:20 now carries the same string
with a `[^sc-001]` marker. The footnote quotes the original
"The plan + the code, nothing else" and cites SC-001, section 1d, blueprint
section 6, and D-14.

Registered test: `the reviewer's settled visibility string occurs in both the
role brief and the process document's role table` (test/roles.test.ts:300).
Forced red twice by me:

```
### red witness A: revert the process doc's row to the old wording
AssertionError: the process document's role-table row does not state the settled visibility: | **Adversarial plan reviewer** | One review | The plan + the code, nothing else | Edits anything |
### red witness B: strip the footnote's quotation of the original wording
AssertionError: the SC-001 footnote does not quote the original wording
### restored: 1 pass, 0 fail
```

Witness B matters: it is the annotation-not-rewrite property, and the test does
guard it, so "annotated" is checked and not merely claimed.

## Criterion 5: MET, all three dangerous instances, each witnessed by keyword removal AND restoration

Instances written by me, validated through the shipped CLI:

| instance | shipped schema | guarding keyword REMOVED | RESTORED |
|---|---|---|---|
| (a) `severity: high` finding, no `concrete-edit` | exit 1, `INVALID #/findings/0/concrete-edit required property concrete-edit is missing` | exit **0** (defanged) | exit 1 |
| (b) `findings: []` and no `no-findings-statement` | exit 1, `INVALID # value matches no permitted alternative here` | exit **0** (defanged) | exit 1 |
| (c) no `produced-by` | exit 1, `INVALID #/produced-by required property produced-by is missing` | exit **0** (defanged) | exit 1 |

Keywords removed were, in order: `concrete-edit` from `$defs.finding.required`;
`minItems` from the first `oneOf` branch's `findings`; `produced-by` from the
top-level `required`.

Acceptances also checked: a well-formed set with findings exits 0, and a
well-formed EMPTY set carrying a statement exits 0, so the guard does not make
the honest empty review unwritable. And the reverse of (b), a
`no-findings-statement` sitting BESIDE real findings, is refused (exit 1),
which the criterion's prose implies and does not spell out.

DEVIATION, declared by the implementers and confirmed by me as declared, not
hidden: criterion 5(b) asks for `if`/`then` on `minItems`; the shipped shape is
a two-branch `oneOf`. The work history probes and records why
(delivery/work-history/m3-p5.md:51 onward), with captured Ajv compile output
showing a `oneOf` branch carrying `required` must also declare the property.
The obligation the criterion states is enforced either way, and I proved that by
executing both directions rather than reading the argument.

I then tried to turn the deviation's cost into a finding and could not, which is
worth recording because it is the review going the other way. The visible cost is
the diagnostic: `value matches no permitted alternative here` does NOT name
`no-findings-statement`, where an `if`/`then` would have. The work history states
exactly that, unprompted, at delivery/work-history/m3-p5.md:665: "The 5(b)
diagnostic names the alternation rather than the missing property ... an
`if`/`then` form would have named `no-findings-statement`. It is a worse message
for a correct rejection, and it is stated here rather than left for a reviewer to
notice." So it is disclosed, not hidden, and there is no finding.

I also re-derived the impossibility claim independently rather than accepting it.
The declared authoring vocabulary is the fifteen keywords
`$ref additionalProperties const contains enum if items minItems minLength oneOf
pattern properties required then type uniqueItems`. `not`, `maxItems` and `else`
are all absent. The obligation is "empty implies a required sibling"; with no
`not`, no `maxItems` and no `else`, there is no `if` subschema in this vocabulary
that MATCHES emptiness and no way to attach the obligation to the complement of a
`minItems` condition. The implementers' narrower sentence ("within this closed
vocabulary I found no `if`/`then` form expressing it ... whether some `if` form
exists that I did not find is open", delivery/work-history/m3-p5.md:517) is the
correctly hedged form, and it survives the claim grep.

## Criterion 6b: MET, both directions, two structurally different members

The clause round trip is enforced by `tiphys validate --type role-brief`, which
reads the INCLUDE-EXPANDED body. Forced red twice, restoring from the pristine
snapshot each time:

```
### member 1: delete the brief-LOCAL clause heading "## clause R-004: ..." from roles/investigator.md
INVALID #/clauses/0 clause id R-004 is declared in frontmatter and has no body heading anchor, so the clause is orphaned
exit=1
### restore
exit=0

### member 2: delete "## clause incremental-output: ..." from the SHARED file
-- investigator   INVALID #/clauses/4 clause id incremental-output ... orphaned   exit=1
-- plan-writer    INVALID #/clauses/2 clause id incremental-output ... orphaned   exit=1
-- adversarial-plan-reviewer  INVALID #/clauses/1 ... orphaned                    exit=1
### restore shared
-- investigator exit=0 / plan-writer exit=0 / adversarial-plan-reviewer exit=0
```

The two members are structurally different in the way that matters here: one
clause lives in the brief's own body, the other only in the included shared
block, and the second proves the round trip expands the include rather than
reading the file alone. All three briefs redden on the shared deletion, so the
single-copy design is doing what criterion 6b's revision-3 half asks for.

Second half of 6b, the text-specificity grep. It is registered
(test/roles.test.ts:257) and it asserts four phrases that are things an agent can
do or fail to do (`within the FIRST MINUTES`, `append to it as you go`,
`modification time is your beacon`, `PARTIAL RESULT`) against BOTH the shared
source AND each of the three COMPOSED briefs' stdout. So a brief that inlined a
softened copy fails here as well as failing the round trip. I read the shared
clause text at roles/_shared-dispatch-contract.md:17 onward and it does name the
rule, not the sentiment: it says create the artifact in the first minutes, append
as you go, mtime is the beacon, and a death leaves a partial result. It also
carries the measured cost (nine hours eleven minutes).

## Criterion 6c: MET, both directions, bounded, and DISTINCT from criterion 2

Staged with a real `mkfifo` at a `mandated-reading` path (the SAME path used for
criterion 2, so the two states are compared directly rather than by argument):

```
prw-r--r-- 1 root root 0 roles/no-such-mandated-reading.md
exit=1  elapsed_ms=231
tiphys brief compose: mandated-reading path roles/no-such-mandated-reading.md: .../roles/no-such-mandated-reading.md is a named pipe, not a regular file, so it was not opened
### regular file at the same path
exit=0
```

It names the path AND the observed entry type, it does not block (231 ms under a
20 s `timeout`, which did not fire), and the diagnostic is textually DIFFERENT
from the missing-path diagnostic in criterion 2, so the two states are
distinguishable by a reader of the output and not only by the code. That is the
distinction M1-P5 paid four rounds for and it is preserved here.

## Criterion 7 and the registry discipline

Suite: 586 tests, 586 pass, 0 fail, 0 skipped, exit 0 (full capture above). Zero
unaccounted tests: `skipped`, `cancelled` and `todo` are all 0.

Clause map, the seven rows: the `clause-map` gate run against this branch:

```
gates: registry gate-registry.yaml mode full
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
exit=0
```
(`--only clause-map --base origin/main --head HEAD`.)

**Every registered behavior RESOLVES BY NAME.** Not asserted, computed. I
extracted the 586 reported test names from the `npm test` capture by regex on the
reporter's own lines, and checked each of the 590 entries of `test/behaviors.json`
(an id-to-test-name map) against that set by EXACT string equality:

```
reported test names: 586
behaviors: 590 UNRESOLVED: 0
```
(590 behaviors over 586 names because several behaviors share a test name.)

**NO ASSERTION PINS A COUNT OVER A GROWING SET, checked rather than assumed.**
This was a medium on M3-P4 and this phase touches the same `schemas/` directory,
so I looked for it specifically.

- The three new test files contain ZERO numeric equality assertions over any
  `.length` or `.size`. Every integer literal in an `assert.*` call in
  test/roles.test.ts, test/brief-compose.test.ts and test/finding-schema.test.ts
  is an EXIT CODE (0, 64) and nothing else. Grep and full output in the evidence
  directory.
- This phase EDITED NO EXISTING TEST. The only pre-existing test-tree file it
  touched is `test/behaviors.json`, the append-only registry. That is itself the
  evidence that the existing `schemas/`-enumerating tests are name-driven and not
  count-driven: adding `finding.schema.json`, `role-brief.schema.json` and a new
  `$defs/repro` + `$defs/investigatorRole` to `report.schema.json` required no
  edit to test/report-contract.test.ts, test/schemas.test.ts or
  test/schema-suite.test.ts, all of which walk that directory with `readdirSync`.
- I read the two enumerating tests M3-P4's medium was raised against
  (test/report-contract.test.ts:1280 and :1352). Both now assert by NAME
  (`assert.deepEqual` over named pointer strings) and the surviving `assert.ok(
  schemas.size >= 3)` is a FLOOR, not a pin, so it cannot redden on growth.
- One exact-list assertion does exist in this phase's new code:
  test/roles.test.ts:204 pins the shared block's anchors to exactly
  `["incremental-output", "beacon-is-not-a-claim"]`. I considered raising it and
  decided it is CORRECT rather than a defect: `roles/_shared-dispatch-contract.md`
  is not an append-only registry, it is a two-clause contract the plan says M3-P6
  includes "and does not edit", and the file's own text says a phase needing it
  changed must escalate rather than edit. A test that reddens when that file grows
  is enforcing the escalation, which is the intended behaviour. Recorded here so
  the judgment is visible rather than silent.

## Scope: MET, against the AMENDED declaration read from the merge base

`git show origin/main:delivery/plan/phase-declarations/m3-p5.json` carries
`schemas/report.schema.json` (the mid-phase amendment) and
`"branch": "claude/m3-p5-authoring-role-briefs"`, which is the branch the head
sits on. 30 paths changed against `origin/main`; matching each against the 20
declaration entries (with `witness/` as a directory prefix) plus the two standing
pre-authorized extras (`test/behaviors.json`, `delivery/work-history/m3-p5.md`):

```
changed: 30 unmatched: 0
```

Nothing outside the declaration was touched. Note `src/validate.ts` is DECLARED
and was NOT changed, which is allowed (the audit is one-directional).

## The M3-P4 comment correction: TRUE, and it does not contradict the file

`schemas/report.schema.json`'s `verdict` `$comment` as M3-P4 shipped it said "an
investigation report has no verdict". If that were true the new top-level
`if` (which fires on role investigator AND a verdict) could never fire, so the
correction is load-bearing rather than cosmetic. The correction's three citations
all resolve at the lines it names:

| citation | actual line content |
|---|---|
| roles/investigator.md:31 | "reported. You produce a root-cause verdict with evidence, and you change" |
| roles/investigator.md:17 | "- report" (the sole entry under `outputs:`) |
| roles/investigator.md:10 | "- Declares a cause it did not reproduce without saying so" (under `never:`) |

Contradiction check inside the file: the correction leaves the superseded
sentence in place and then names it as untrue, which is the same annotate-rather-
than-rewrite discipline criterion 4 applies to the intake document, and it is
explicitly flagged ("M3-P5 CORRECTION, made here rather than in a new comment
because a reader arriving at this field must not be told the old thing"). The
field remains OPTIONAL, and I proved by execution that the not-yet-concluded
investigator report still validates, so the corrected comment and the shipped
keywords agree. I found no other statement in `schemas/report.schema.json` that
the correction contradicts.

## Cross-checks I ran that no criterion asks for

**Authored bytes, BOTH checks, with the load-bearing `-a` (T-010).** Over the 30
paths this branch changes, minus the path-scoped intake exemption for the
non-ASCII arm:

```
non-ASCII:            (empty list, xargs rc=123 = grep found nothing)
control characters:   (empty list, xargs rc=123 = grep found nothing)
```
Additionally: the diff adds ZERO non-ASCII bytes to
`delivery/intake/orchestrated-delivery-process.md` itself (checked by grepping
the `+` lines of that file's diff), so the exemption is not being widened by this
phase. And `git diff --stat origin/main..HEAD` reports NO file as `Bin`, so every
changed source file has a reviewable diff.

**The claim grep, re-run by me on the finished 1779-line work history.** 28 hits
at HEAD. The work history contains TWO claim-grep sections
(delivery/work-history/m3-p5.md:482 and delivery/work-history/m3-p5.md:994) plus
a third settlement by the second implementer over the lines that session added
(delivery/work-history/m3-p5.md:1651). I walked the hits that fall after the
second implementer's handover line and none is an unsettled strong claim: the two
at :1214 and :1227 are QUOTATIONS of the forbidden sentence "this arm cannot be
forced" being used as a negative example and as staged fixture text, :1050 and
:1266 are descriptive, and :1618 is a measured statement about the suite count
with the measurement beside it.

**Package surface.** `package.json` adds `roles` to `files`, and
`npm pack --dry-run` confirms all four `roles/*.md` plus
`schemas/finding.schema.json` and `schemas/role-brief.schema.json` are in the
tarball, so `brief compose --role` can resolve from an installed kernel rather
than only from a checkout.

**`--type auto`.** A finding document resolves through `auto` (exit 0), which is
what the TYPE_TABLE comment claims. A role brief does NOT (exit 1, "is not valid
YAML: Source contains multiple documents"), which is also what the comment
claims and why `role-brief` has to be named explicitly. Both claims checked
rather than read.

**Declared residue of criterion 6, exercised.** A report with `role: lnvestigator`
(one letter wrong) and a verdict and no repro validates, exit 0. The schema's own
`if` comment names this residue in advance and hands it to M3-P7's checklist, so
this is disclosure confirmed, not a finding.

**Criterion 6's witness spec** (`witness/investigator-report-requires-repro.json`)
carries TWO structurally different dangerous states, not one: emptying
`then.required` (the obligation vanishes) and shrinking branch 1 of `$defs/repro`
to `required: ["command"]` (the obligation survives but a hollow repro satisfies
it). That is the section 2.3 rule 6 shape and it is satisfied.

## The gate bundle, run by me at this head

`node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full
--evidence <dir> --base origin/main --head HEAD`, on branch
`claude/m3-p5-authoring-role-briefs` (which already existed at this exact sha, so
naming it moved nothing):

| gate | status | units |
|---|---|---|
| agent-rules-drift | green | 17 rendered gate rows compared |
| citations | not-applicable | 0 (no changed path under the documents globs) |
| clause-map | green | **34** clause-map rows checked, 40 pending a phase not yet in force |
| coverage | green | 115 finding ids checked |
| credential-scrub | green | 7 credential sources probed |
| credential-token | not-applicable | 0 (precondition A-3 unmet) |
| deploy | not-applicable | 0 (structural) |
| manifest-self-check | green | 8 schema documents validated |
| migrations | not-applicable | 0 (structural) |
| red-witness | green | **15** witnesses evaluated (10 own, 5 stored), `uncoveredSources: []` |
| scope | see below | |
| suite | green | **586** tests reported |

`scope` reported ERROR on that invocation with detail
`gate scope requires --phase, which was not supplied`. That is MY invocation's
fault, not the branch's: I omitted `--phase`. Re-run with it:

```
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
exit=0
```
```
"gate": "scope", "status": "green", "units": 30,
"detail": "30 changed path(s) audited against declaration
 delivery/plan/phase-declarations/m3-p5.json at merge base
 52fe657aff6e939fc245a813e6727fa5e6d5b2a6
 (sha256 caf333f561919a123a3a918f788952f9c7869fabd5ea64c2ffdf9789eed0a75e)
 (1 declared path(s) not touched: src/validate.ts)"
```

That line is the direct answer to the dispatch's scope question: the gate reads
the declaration FROM THE MERGE BASE, that base is `origin/main` at 52fe657 which
is where the amendment landed, and 30 of 30 changed paths audit clean.

The `red-witness` gate's own records independently reproduce the criterion 3b
experiment I ran by hand: `witness/brief-compose-acceptance-rendered.json` mutates
`src/roles.ts` by deleting `  "acceptance",\n` and records
`"red": true, "failedNamedTests": ["brief compose renders the named phase's
acceptance array"]`. My hand-run and the gate agree.

## Adversarial extension of criterion 6c, which no criterion asked for

Criterion 6c covers ONE path `brief compose` opens. "One witness is not a class",
so I staged a real `mkfifo` at every OTHER path this phase's two commands open,
each under a 15 s `timeout` that never fired:

| non-regular file staged at | command | exit | elapsed | diagnostic names the type? |
|---|---|---|---|---|
| a `mandated-reading` entry (criterion 6c itself) | `brief compose` | 1 | 231 ms | yes, "is a named pipe" |
| `--phase` (the plan file) | `brief compose` | 1 | 211 ms | yes |
| `--out` (the output file) | `brief compose` | 1 | 207 ms | yes |
| `roles/<id>.md` (the role brief itself) | `brief compose` | 1 | 163 ms | yes |
| `roles/<id>.md` | `validate --type role-brief` | 1 | 167 ms | yes |
| the `$include` target `roles/_shared-dispatch-contract.md` | `brief compose` | 1 | 235 ms | yes |
| the `$include` target | `validate --type role-brief` | 1 | 289 ms | yes, and it names the INCLUDING file too |

Seven paths, seven refusals, all bounded, none blocking. The MECHANISM
("reading a path whose type has not been established", MECHANISMS.md) is closed
across this phase's whole surface and not only at the instance the criterion
named. That is the fix-round contract's rule 1 applied by the implementers
without being asked, and it is the strongest single thing I found in this phase.

## No cross-contamination from the report-schema change

The new TOP-LEVEL `if`/`then` on `report.schema.json` could in principle reach
`work-history`, which compiles report.schema.json as a declared COMPANION. It
does not: companion registration resolves `$ref`s and does not apply the
companion's top-level keywords, and `work-history.schema.json` has
`additionalProperties: false` with no `role` and no `verdict` property at all.
Checked by execution, not by argument: all six shipped examples still validate
through `--type auto`, exit 0 each (charter, decision-record, final-report, plan,
report, work-history).

## Two things I tried to make findings and could not

**Criterion 5's `if`/`then` to `oneOf` deviation.** Written up under criterion 5
above. Declared, derived from the closed vocabulary, cost disclosed by the
implementers themselves. I re-derived the impossibility independently. Not a
finding.

**The report-schema `$comment` ordering.** The `verdict` comment still OPENS with
the superseded sentence ("an investigation report has no verdict") and corrects it
in the third sentence of the same comment. I considered raising this as a low,
because the correction's own words are "a reader arriving at this field must not
be told the old thing". I decided against it: the correction is inside the same
comment string a reader necessarily reads, it QUOTES the superseded sentence and
names it untrue, and preserving the superseded wording beside its correction is
exactly the annotate-rather-than-rewrite discipline criterion 4 requires of the
intake edit. Raising it would be manufacturing a finding. Recorded so the
judgment is auditable rather than invisible.

## Closing state of the worktree

Every mutation I made was restored from a pristine snapshot taken before any
experiment (`cp`, never `git checkout --`, per standing warning 8). Final
`git status --porcelain`:

```
?? delivery/review/clean-room-m3-p5-criteria.md
```

Only this review file. Nothing committed, nothing pushed, no branch moved
(`claude/m3-p5-authoring-role-briefs` already pointed at 48829d9 before I named
it, verified against its reflog).

Evidence directory:
`/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/p5-cr-a-ev`
holds every capture referenced above, including the two union-accounting scripts,
the raw `npm test` output, all fixtures I wrote, and the full gate evidence trees.

## Postscript: the phase's own contribution, counted

For the record, since the dispatch quoted "21 behaviors and 9 witness specs from
a previous implementer, and more were added":

- Behaviors: the phase side added **21** over the merge base a7d5686 (513 to
  534), and the second implementer added **1** more after the merge
  (`investigator-report-requires-repro`), for **22** from this phase. HEAD carries
  590 total.
- Witness specs: **10** files under `witness/` are added by this branch, which is
  exactly the `10 own` the `red-witness` gate reports, so 9 from the predecessor
  plus 1 for criterion 6. `uncoveredSources` is empty, meaning no changed test
  file spawns a witness obligation that has no spec.

Both numbers are consistent with the branch and with the gate, and I derived them
from git rather than from the work history.
