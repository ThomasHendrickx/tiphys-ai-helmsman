# Clean-room review of M3-P4, CONTRACT B: can a false claim still be expressed?

Reviewer: clean-room agent, contract B (expressible lie).
Head under review: `a3ea489` on `claude/m3-p4-report-and-work-history`.
Merge base with `main`: `c7a7ce9`.
Date: 2026-08-10.

**The branch had NOT moved when this review finished.** `git rev-parse --short
origin/claude/m3-p4-report-and-work-history` printed `a3ea489` and
`git rev-parse --short HEAD` printed `a3ea489`, in the same command, after a
fetch taken at the end of the review.

**VERDICT: CHANGES REQUIRED.** Two high findings, two medium, three low, two
informational. The full list is at the end.

## What this review is and is not

Contract B does not execute the acceptance criteria and does not audit whether
the implementer did what the plan said. A sibling reviewer holds that contract
and duplicating it would waste the pair. This review asks one question: given
the shipped schemas and derived checks, **what dishonest record still exits 0?**

So a finding here is not "a criterion was missed". Several findings below sit on
criteria that are MET as lettered, and say so. The defect in those cases is that
the shipped contract's own authoring guidance, which is what a role brief will
point an agent at, states a coverage the code does not have.

## Method, and the two disciplines this project has paid for

**Toolchain.** node v22.22.2, from `/opt/node22/bin`, checked with
`node --version` in the shell that ran every command below. Every validation was
run from source with `node bin/tiphys.ts validate`, not from `dist/`.

**Mutation discipline: NOT EXERCISED, and that is the point.** This review
mutated nothing. Every probe is a fresh YAML instance written OUTSIDE the
repository tree, under a scratchpad `lies/` directory, and handed to the
validator by absolute path. There was therefore no pristine copy to restore and
no `trap` to arm. The property that discipline protects was checked directly
instead, at the end of the run:

```
$ git status --porcelain
?? delivery/review/clean-room-m3-p4-expressible-lie.md
?? node_modules

$ for s in report final-report work-history; do
    a=$(md5sum "schemas/$s.schema.json" | cut -d' ' -f1)
    b=$(git show "a3ea489:schemas/$s.schema.json" | md5sum | cut -d' ' -f1)
    printf '%-28s tree=%s head=%s %s\n' "$s.schema.json" "$a" "$b" \
      "$([ "$a" = "$b" ] && echo IDENTICAL || echo DIFFERENT)"
  done
report.schema.json           tree=f55215ce0b6a5c4cb25baa12387d6c7c head=f55215ce0b6a5c4cb25baa12387d6c7c IDENTICAL
final-report.schema.json     tree=d2e95bbe317f20218dd2336d05e874ce head=d2e95bbe317f20218dd2336d05e874ce IDENTICAL
work-history.schema.json     tree=b1c92934feb390a912058bd95e0903bb head=b1c92934feb390a912058bd95e0903bb IDENTICAL
src/checks.ts                tree=b9fd3fc1c3a898a32510f759aa104e83 head=b9fd3fc1c3a898a32510f759aa104e83 IDENTICAL
src/validate.ts              tree=4e1747a67b1b4be2f9100f7f6bb20604 head=4e1747a67b1b4be2f9100f7f6bb20604 IDENTICAL
src/commands/validate.ts     tree=00651d114917ddb1485edc5532cb7053 head=00651d114917ddb1485edc5532cb7053 IDENTICAL
```

The `node_modules` entry is a symlink this review created to the main
checkout's install; it is untracked and no tracked file differs from the head.

**Rejections are published beside acceptances.** Thirty-seven records were
constructed and eleven were refused, nine of them written as controls precisely
so the refusals would be on the record. They are what makes the accepted records
credible: without them, an "exit 0" could mean the validator was not running.

---

## HAZARD 1: a required field satisfied by an EMPTY STRING

**Criterion 2e holds, and it holds MECHANICALLY, not by the judgment the plan
worried about.** This is the one hazard where I found nothing.

The plan admits at delivery/plan/kernel-plan-m3.md:2925 that the field inventory
is "a judgment made once at authoring time". I enumerated every string subschema
in all three documents rather than diffing against the work history's list,
because a list is exactly what the plan says not to trust.

The enumerator walks every node of each schema document and reports every
subschema with `"type": "string"`, flagging any that carries none of
`minLength`, `pattern`, `enum`, `const`:

```
$ cat enumerate-strings.mjs
import { readFileSync } from "node:fs";
const files = process.argv.slice(2);
const rows = [];
function walk(node, path, file) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}/${i}`, file)); return; }
  if (node.type === "string") {
    const guarded = node.minLength !== undefined || node.pattern !== undefined ||
      node.enum !== undefined || node.const !== undefined;
    rows.push({ file, path, minLength: node.minLength, pattern: node.pattern,
      enum: node.enum ? "yes" : undefined, const: node.const, guarded });
  }
  for (const [k, v] of Object.entries(node)) walk(v, `${path}/${k}`, file);
}
for (const f of files) walk(JSON.parse(readFileSync(f, "utf8")), "#", f);
let unguarded = 0;
for (const r of rows) {
  const tag = r.const !== undefined ? `const=${r.const}` : r.enum ? "enum" :
    (r.minLength !== undefined || r.pattern !== undefined)
      ? `minLength=${r.minLength} pattern=${JSON.stringify(r.pattern)}`
      : "*** NO minLength, NO pattern, NO enum, NO const ***";
  if (!r.guarded) unguarded += 1;
  console.log(`${r.file.split("/").pop().padEnd(28)} ${r.path.padEnd(72)} ${tag}`);
}
console.log(`\nTOTAL string subschemas: ${rows.length}`);
console.log(`UNGUARDED (no minLength, no pattern, no enum, no const): ${unguarded}`);
```

Full output, all 76 rows:

```
report.schema.json           #/properties/kind                                                        const=report
report.schema.json           #/properties/role                                                        minLength=1 pattern="\\S"
report.schema.json           #/properties/task                                                        minLength=1 pattern="\\S"
report.schema.json           #/properties/verdict                                                     minLength=1 pattern="\\S"
report.schema.json           #/properties/no-findings-statement                                       minLength=1 pattern="\\S"
report.schema.json           #/$defs/nonEmptyText                                                     minLength=1 pattern="\\S"
report.schema.json           #/$defs/universalQuantifier                                              minLength=undefined pattern="\\b([Aa]lways|[Nn]ever|[Ee]very|[Aa]ll cases|[Ii]n all)\\b"
report.schema.json           #/$defs/finding/properties/id                                            minLength=1 pattern="^[A-Za-z][A-Za-z0-9]*-[0-9]+[a-z]?$"
report.schema.json           #/$defs/finding/properties/severity                                      enum
report.schema.json           #/$defs/finding/properties/analysis                                      minLength=1 pattern="\\S"
report.schema.json           #/$defs/finding/properties/outcome                                       minLength=1 pattern="\\S"
report.schema.json           #/$defs/finding/properties/pinned-evidence                               minLength=1 pattern="\\S"
report.schema.json           #/$defs/finding/properties/counter-experiment                            minLength=1 pattern="\\S"
report.schema.json           #/$defs/finding/then/properties/pinned-evidence                          minLength=1 pattern="\\S"
report.schema.json           #/$defs/finding/oneOf/0/properties/analysis                              minLength=undefined pattern="^(?:(?!\\b([Aa]lways|[Nn]ever|[Ee]very|[Aa]ll cases|[Ii]n all)\\b)[\\s\\S])*$"
report.schema.json           #/$defs/finding/oneOf/1/properties/counter-experiment                    minLength=1 pattern="\\S"
report.schema.json           #/$defs/evidence/oneOf/0/properties/path                                 minLength=1 pattern="\\S"
report.schema.json           #/$defs/evidence/oneOf/0/properties/lines                                minLength=undefined pattern="^[0-9]+(-[0-9]+)?$"
report.schema.json           #/$defs/evidence/oneOf/0/properties/note                                 minLength=1 pattern="\\S"
report.schema.json           #/$defs/evidence/oneOf/0/properties/counter-experiment                   minLength=1 pattern="\\S"
report.schema.json           #/$defs/evidence/oneOf/1/properties/path                                 minLength=1 pattern="\\S"
report.schema.json           #/$defs/evidence/oneOf/1/properties/command                              minLength=1 pattern="\\S"
report.schema.json           #/$defs/evidence/oneOf/1/properties/note                                 minLength=1 pattern="\\S"
report.schema.json           #/$defs/evidence/oneOf/1/properties/counter-experiment                   minLength=1 pattern="\\S"
report.schema.json           #/$defs/evidence/then/properties/counter-experiment                      minLength=1 pattern="\\S"
report.schema.json           #/$defs/claim/properties/id                                              minLength=1 pattern="\\S"
report.schema.json           #/$defs/claim/properties/kind                                            enum
report.schema.json           #/$defs/claim/properties/statement                                       minLength=1 pattern="\\S"
report.schema.json           #/$defs/claim/if/properties/kind                                         enum
report.schema.json           #/$defs/claim/oneOf/0/properties/id                                      minLength=1 pattern="\\S"
report.schema.json           #/$defs/claim/oneOf/0/properties/kind                                    const=universal
report.schema.json           #/$defs/claim/oneOf/0/properties/statement                               minLength=1 pattern="\\S"
report.schema.json           #/$defs/claim/oneOf/1/properties/id                                      minLength=1 pattern="\\S"
report.schema.json           #/$defs/claim/oneOf/1/properties/kind                                    enum
report.schema.json           #/$defs/claim/oneOf/1/properties/statement                               minLength=1 pattern="\\S"
report.schema.json           #/$defs/claim/oneOf/2/properties/id                                      minLength=1 pattern="\\S"
report.schema.json           #/$defs/claim/oneOf/2/properties/kind                                    const=open-question
report.schema.json           #/$defs/claim/oneOf/2/properties/statement                               minLength=1 pattern="\\S"
report.schema.json           #/$defs/settledByCounterExperiment/properties/counter-experiment         minLength=1 pattern="\\S"
report.schema.json           #/$defs/settledByConstruction/properties/executed-construction/properties/command minLength=1 pattern="\\S"
report.schema.json           #/$defs/settledByConstruction/properties/executed-construction/properties/output minLength=1 pattern="\\S"
report.schema.json           #/$defs/fixRound/properties/mechanism                                    minLength=1 pattern="\\S"
report.schema.json           #/$defs/fixRound/properties/derivation/properties/command                minLength=1 pattern="\\S"
report.schema.json           #/$defs/fixRound/properties/derivation/properties/output                 minLength=1 pattern="\\S"
report.schema.json           #/$defs/fixRound/properties/not-covered                                  minLength=1 pattern="\\S"
report.schema.json           #/$defs/deviation/properties/plan-clause                                 minLength=1 pattern="\\S"
report.schema.json           #/$defs/deviation/properties/why                                         minLength=1 pattern="\\S"
report.schema.json           #/$defs/honestFailure/properties/cause                                   minLength=1 pattern="\\S"
report.schema.json           #/$defs/honestFailure/properties/exposure-window                         minLength=1 pattern="\\S"
report.schema.json           #/$defs/honestFailure/properties/structural-fix                          minLength=1 pattern="\\S"
report.schema.json           #/$defs/environmentalClaim/properties/claim                              minLength=1 pattern="\\S"
report.schema.json           #/$defs/gateResult/properties/gate                                       minLength=1 pattern="\\S"
report.schema.json           #/$defs/gateResult/properties/result                                     enum
final-report.schema.json     #/properties/kind                                                        const=final-report
final-report.schema.json     #/properties/subject                                                     minLength=1 pattern="\\S"
final-report.schema.json     #/properties/inputs/items                                                minLength=1 pattern="\\S"
final-report.schema.json     #/properties/input-findings/items/properties/id                          minLength=1 pattern="\\S"
final-report.schema.json     #/properties/input-findings/items/properties/outcome                     minLength=1 pattern="\\S"
final-report.schema.json     #/$defs/enumerableSection/oneOf/1/properties/entries/items/properties/id minLength=1 pattern="\\S"
final-report.schema.json     #/$defs/enumerableSection/oneOf/1/properties/entries/items/properties/statement minLength=1 pattern="\\S"
final-report.schema.json     #/$defs/enumerableSection/oneOf/1/properties/entries/items/properties/owner minLength=1 pattern="\\S"
work-history.schema.json     #/properties/kind                                                        const=work-history
work-history.schema.json     #/properties/phase                                                       minLength=1 pattern="\\S"
work-history.schema.json     #/properties/prompt                                                      minLength=1 pattern="\\S"
work-history.schema.json     #/properties/files-touched/items                                         minLength=1 pattern="\\S"
work-history.schema.json     #/properties/per-step-commits/items/properties/sha                       minLength=undefined pattern="^[0-9a-f]{7,40}$"
work-history.schema.json     #/properties/per-step-commits/items/properties/subject                   minLength=1 pattern="\\S"
work-history.schema.json     #/properties/key-decisions/items/properties/decision                     minLength=1 pattern="\\S"
work-history.schema.json     #/properties/key-decisions/items/properties/why                          minLength=1 pattern="\\S"
work-history.schema.json     #/properties/deviations/items/properties/plan-clause                     minLength=1 pattern="\\S"
work-history.schema.json     #/properties/deviations/items/properties/why                             minLength=1 pattern="\\S"
work-history.schema.json     #/properties/environment-warnings/items/properties/warning               minLength=1 pattern="\\S"
work-history.schema.json     #/properties/environment-warnings/items/properties/evidence              minLength=1 pattern="\\S"
work-history.schema.json     #/$defs/verificationFirst/properties/finding                             minLength=1 pattern="\\S"
work-history.schema.json     #/$defs/verificationFirst/properties/stopped-and-reported                minLength=1 pattern="\\S"
work-history.schema.json     #/$defs/verificationFirst/then/properties/stopped-and-reported           minLength=1 pattern="\\S"

TOTAL string subschemas: 76
UNGUARDED (no minLength, no pattern, no enum, no const): 0
```

**Difference against the work history's inventory: none that matters.** Three
rows carry a `pattern` and no `minLength` (`universalQuantifier`,
`evidence.lines`, `per-step-commits.sha`), and in all three the pattern is
anchored or non-empty-requiring, so the empty string is already refused. Every
other free-text row carries both keywords.

Two controls confirm the keywords are doing work and that BOTH are needed:

```
$ node bin/tiphys.ts validate --type auto lie04e-empty.yaml      # output: ""
INVALID #/fix-round/derivation/output value "" does not match the required pattern \S
INVALID #/fix-round/derivation/output value "" is shorter than the required minimum length 1
exit=1

$ node bin/tiphys.ts validate --type auto lie04f2-whitespace.yaml  # spaces and newlines
INVALID #/fix-round/derivation/output value "   \n   " does not match the required pattern \S
INVALID #/fix-round/mechanism value "   " does not match the required pattern \S
INVALID #/fix-round/not-covered value "  " does not match the required pattern \S
exit=1
```

The second is the case `minLength` alone would pass, and the pattern catches it.
**Hazard 1 is closed. No finding.**

The scope of that claim: it covers every subschema declaring `"type": "string"`.
It does NOT cover a property that is declared with no `type` at all, of which
there are none among the leaf fields, nor a property that is not declared, of
which there are none because `additionalProperties: false` is set at every object
level in all three documents.

---

## HAZARD 2: parity arithmetic that balances while a row is lost

### CR-001 (HIGH). `report-parity-arithmetic` never runs on a work history, while the shared definition and the work history's own converse table both say it does.

This is the repository's recurring defect shape exactly: a relation stated
redundantly, one containment enforced, shipped data satisfying both so the hole
stays latent, and documentation saying the drift is closed.

The work-history schema does not restate the gate-result contract; it reaches
the report schema's own definition at schemas/work-history.schema.json:89. That
sharing is real at the KEYWORD level and I verified it (control CR-001-C2
below). It is NOT real at the DERIVED CHECK level, because the check is
registered for one artifact type:

```
$ grep -n 'id: "report-parity-arithmetic"' -A 3 src/checks.ts
1624:  id: "report-parity-arithmetic",
1625-  type: "report",
1626-  requiresContext: false,
1627-  run(instance: unknown): CheckOutcome {

$ grep -n 'type: "report"\|type: "final-report"\|type: "work-history"' src/checks.ts
1625:  type: "report",
1719:  type: "final-report",
```

There is no derived check of type `work-history` in the registry, and
`runChecks` selects by type at src/checks.ts:1836. The check also reads the key
`gate-results`, while a work history stores its counts under `gate-evidence`, so
even a type change alone would not reach it.

**The lie, LIE-01.** A work history recording a green suite that discovered 9999
tests and ran one:

```yaml
kind: work-history
phase: M9-P9
prompt: |
  Deliver the thing.
files-touched: [src/thing.ts]
per-step-commits:
  - sha: "abcdef1"
    subject: "do the thing"
key-decisions:
  - decision: did the thing
    why: it was asked for
verification-first:
  - finding: nothing contradicted the plan
    contradicts-plan: false
deviations: []
gate-evidence:
  - gate: suite
    result: green
    wrapper-exit-code: 0
    discovered: 9999
    passed: 1
    failed: 0
    skipped: 0
    did-not-run: 0
claims: []
environment-warnings: []
```

```
$ node bin/tiphys.ts validate --type auto lie01-wh-parity.yaml
$ echo $?
0
```

**CONTROL CR-001-C1, the same counts in a report:**

```
$ node bin/tiphys.ts validate --type auto lie01c-report-parity.yaml
INVALID #/gate-results/0 discovered 9999 does not equal passed + failed + skipped + did-not-run = 1 (check: report-parity-arithmetic)
exit=1
```

**CONTROL CR-001-C2, the KEYWORD half of the sharing does work.** An
impossibility claim with no construction, in a work history, is rejected through
the report schema's definition:

```
$ node bin/tiphys.ts validate --type auto lie13a-wh-imposs-no-constr.yaml
INVALID #/claims/0 value does not satisfy the requirements its own shape triggers here
INVALID #/claims/0 value matches no permitted alternative here
INVALID #/claims/0/settled-by required property settled-by is missing
exit=1
```

So the sharing is half-shared, and nothing on the branch says so:

- The shared `$defs/gateResult` comment at schemas/report.schema.json:411 says
  "`discovered` is checked against the four buckets by the derived check
  `report-parity-arithmetic`". That comment is the authoring guidance a
  work-history author reads, because it is the definition their document
  resolves into, and for their document the sentence is not true.
- The work history's converse table at delivery/work-history/m3-p4.md:551 records
  the parity relation as "**CLOSED.** The check tests equality, and both
  directions are witnessed". Both directions of the ARITHMETIC are indeed
  witnessed, in reports. The document-scope direction was never asked.
- `grep -n "gate-evidence" delivery/work-history/m3-p4.md` returns nothing. The
  residues list at delivery/work-history/m3-p4.md:561 onward, which is otherwise
  unusually thorough, does not carry this one.

R-048 is the silently-dropped-tests requirement, and CLAUDE.md names the work
history as the artifact a later reviewer trusts. The one artifact type where a
dropped test matters most is the one where the guard does not run.

**Remedy shape (not prescriptive):** either register a sibling check for type
`work-history` over `gate-evidence`, or, if D-M3-22 makes a new registry row a
plan question, state the gap in the shared `$comment` and correct the converse
table row. The second is not optional either way, because a false sentence in
the shared definition is the thing that keeps the hole latent.

### CR-002 is under hazard 3.

### CR-003 (MEDIUM). A gate result may be `green`, with `wrapper-exit-code: 0`, and report 400 failures.

`$defs/gateResult`'s `if`/`then` requires a `green` to carry
`wrapper-exit-code: 0` and all five counts. Nothing couples `result: green` to
`failed`.

**LIE-02c:**

```yaml
gate-results:
  - gate: suite
    result: green
    wrapper-exit-code: 0
    discovered: 507
    passed: 107
    failed: 400
    skipped: 0
    did-not-run: 0
```

```
$ node bin/tiphys.ts validate --type auto lie02c-green-with-failures.yaml
$ echo $?
0
```

The arithmetic balances, so `report-parity-arithmetic` is satisfied, and the
record is internally contradictory on its face. This is R-086's false all-green
claim in the one form the phase did not close: the coupling that WAS built binds
green to the exit code, and the record simply says something else two lines
below.

The converse table asks the green/exit-code relation in both directions and
records the permissive direction as a deliberate decision. It never asks the
green/failed relation at all. The remedy is three lines inside the check that
already reads these five siblings.

### What the parity check DOES reach, and the residue that is correctly disclosed

Two lies balance and still hide a loss, and both are honest residues rather than
findings, because the work history states the reason.

**LIE-02, a balanced loss.** The real captured run at this head is 507
discovered, 505 passed, 2 skipped. Dropping the two skipped from BOTH sides
balances perfectly:

```yaml
gate-results:
  - gate: suite
    result: green
    wrapper-exit-code: 0
    discovered: 505
    passed: 505
    failed: 0
    skipped: 0
    did-not-run: 0
```

`exit=0`. Nothing anchors `discovered` to what the wrapper actually discovered,
so an author who drops a row from both sides is invisible to an
internal-consistency check by construction. The check's own doc comment says
this in terms ("it sees one in a run that claims a count"), and the work history
records the missing anchor at delivery/work-history/m3-p4.md:539. Correctly
disclosed, no finding.

**LIE-02b, the `todo` bucket laundered into `did-not-run`.** `exit=0`. Residue 6
at delivery/work-history/m3-p4.md:595 names the missing sixth field and hands it
back as a plan question. Correctly disclosed, no finding.

---

## HAZARD 3: a `claims[].kind` enum that is not really closed

### The literal enum IS closed, and the diagnostic names the vocabulary.

**CONTROL CR-002-C1:**

```
$ node bin/tiphys.ts validate --type auto lie03e-open-enum.yaml   # kind: note
INVALID #/claims/0 value matches no permitted alternative here
INVALID #/claims/0/kind value "note" is not one of the permitted values "universal", "impossibility", "coverage", "remedy", "open-question"
exit=1
```

Criterion 2c(d) is MET. The hazard is not.

### CR-002 (HIGH). `kind: open-question` is an unchecked escape hatch for every other kind, and the shipped schema comment says it is not.

The plan's hazard row names "a claims section whose `kind` enum is OPEN, so an
impossibility claim is filed as a note". The operative property is that an
impossibility claim escapes its construction requirement. Closing the enum
closes the route through an INVENTED kind. It does not close the route through a
kind that is inside the enum and that the schema does not question, and
`open-question` is exactly that kind: it is the one branch that owes nothing.

Nothing constrains the relation between `kind` and `statement`. The
`universalQuantifier` pattern that the phase built and applied to
`finding.analysis` and to `evidence[].note` is NOT applied to `claim.statement`
at any of the three claim branches. The classification is author-declared and
unchecked.

I filed the same impossibility four ways. All four exit 0.

**LIE-03a, an impossibility filed as `open-question`, no settlement:**

```yaml
claims:
  - id: X-1
    kind: open-question
    statement: >-
      This arm cannot be forced here. There is no path that reaches it, and no
      construction exists that would.
```

`exit=0`.

**LIE-03b, the same with three of the repository's own claim-grep tokens:**

```yaml
claims:
  - id: X-2
    kind: open-question
    statement: >-
      The lease is never taken twice; it is impossible for two holders to
      coexist, and this always holds.
```

`exit=0`. This statement carries `never`, `impossible` and `always`, and the
schema's own quantifier pattern would have matched two of them had it been
applied here.

**LIE-03c, an impossibility filed as `universal`, settled by a sentence:**

```yaml
claims:
  - id: X-3
    kind: universal
    statement: It is impossible to force the ENOENT arm here; every attempt fails.
    settled-by:
      counter-experiment: I thought about it and concluded there is nothing to try.
```

`exit=0`. `settledByCounterExperiment` requires one non-empty string and nothing
else, so routing an impossibility through `universal` converts an
executed-construction requirement into a sentence.

**LIE-03d, an impossibility with a construction of `true`:**

```yaml
claims:
  - id: X-4
    kind: impossibility
    statement: There is no way to make this path fail.
    settled-by:
      executed-construction:
        command: "true"
        exit-code: 0
        output: "n/a"
```

`exit=0`.

**LIE-13b, the same escape inside a work history**, so the hole travels through
the shared definition: `exit=0`.

**Why this is HIGH and not a disclosed residue.** The shared claim definition at
schemas/report.schema.json:220 ends with this sentence:

> `open-question` is the honest restatement and is deliberately CHEAP: 'I did
> not find a way to force this arm' needs nothing, and 'this arm cannot be
> forced here' needs a construction.

I can read that two ways and I will state both. Read as a claim about the two
STATEMENTS, it is false: LIE-03a is verbatim the second sentence, filed as
`open-question`, and it needs nothing. Read as a shorthand label for two KINDS,
it is true but circular, since the kind is whatever the author typed. The
sentence is the guidance a role brief will point an author at, and the design
goal CLAUDE.md states for this section is to make the difference between "I did
not find a way" and "there is no way" a FIELD rather than a habit. As shipped it
is still a habit, and the guidance reads as though it is not.

The converse table at delivery/work-history/m3-p4.md:558 asks only whether an
`open-question` may carry a settlement, and records that as CLOSED. The opposite
misdeclaration, a settled claim filed as open, is the one the plan's hazard
names, and it is not asked anywhere on the branch.

**A remedy exists inside the declared authoring vocabulary**, which is why this
is a finding rather than a residue. `pattern` is in the vocabulary
(schemas/README.md:50), and the negative-lookahead construction is already
used at `#/$defs/finding/oneOf/0/properties/analysis`. The same construction on
the `open-question` branch's `statement` would refuse an assertive impossibility
filed as open. At minimum, the sentence quoted above must be corrected and the
residue stated.

---

## HAZARD 4: a `fix-round.derivation` that accepts a summary

All three forms the contract asked me to try validate. The first is disclosed;
the other two are not named anywhere.

**LIE-04a, a one-line plausible summary:**

```yaml
fix-round:
  mechanism: reading a path whose type has not been established
  derivation:
    command: "grep -rn readFileSync src/"
    output: "11 call sites found, all reviewed and safe."
  not-covered: test/ and scripts/ were excluded.
```

`exit=0`.

**LIE-04b, a truncated capture:**

```yaml
  derivation:
    command: "grep -rn readFileSync src/"
    output: |
      src/a.ts:12:  readFileSync(p)
      ... (remaining 10 sites elided for brevity)
  not-covered: none
```

`exit=0`.

**LIE-04c, the output of the WRONG command:**

```yaml
  derivation:
    command: "grep -rn readFileSync src/"
    output: |
      On branch claude/m3-p4-report-and-work-history
      nothing to commit, working tree clean
  not-covered: nothing was excluded.
```

`exit=0`.

**LIE-04d, single characters throughout:** `mechanism: "x"`, `command: "x"`,
`output: "."`, `not-covered: "."`. `exit=0`.

**CONTROLS CR-004-C1 and C2:** empty output and whitespace-only output are both
rejected, quoted in full under hazard 1 above.

### CR-004 (LOW). Residue 3 names the summary case and not the truncation or the wrong-command case.

Residue 3 at delivery/work-history/m3-p4.md:579 is accurate about what
`minLength` and `pattern` reach, and criterion 2d(d)'s template assertion is a
correctly narrowed claim. But the residue is written as one case, "a summary in
`derivation.output` instead of full output", and the plan's hazard row is written
the same way. A capture that is REAL but truncated, and a capture that is real
but of a DIFFERENT command, are two more members of the same class, and a reader
of the residue would not know they were considered. The remedy is a sentence.

I did not find a keyword in the declared vocabulary that reaches any of the
three, and I am not asserting that none exists.

---

## HAZARD 5: an honest record more expensive to write than a dishonest one

**THIS SECTION IS A JUDGMENT AND IS LABELLED AS ONE.** The plan states at
delivery/plan/kernel-plan-m3.md:2700 that no criterion can reach it, because it
is a property of a ratio between two authoring costs and not of any instance. I
agree with that, and I did not construct a measurement of the ratio.

What I did measure is one adjacent quantity: the cheapest record each contract
accepts, against the honest record the phase shipped.

```
$ for f in lie07-minimum-report.yaml templates/report.example.yaml \
           lie07b-minimum-wh.yaml templates/work-history.example.yaml \
           lie07c-minimum-fr.yaml templates/final-report.example.yaml; do
    printf '%-52s %5s lines %7s bytes\n' "$(basename $f)" "$(wc -l < $f)" "$(wc -c < $f)"
  done
lie07-minimum-report.yaml                                9 lines     140 bytes
report.example.yaml                                    235 lines   10072 bytes
lie07b-minimum-wh.yaml                                  11 lines     187 bytes
work-history.example.yaml                              184 lines    8548 bytes
lie07c-minimum-fr.yaml                                   8 lines     182 bytes
final-report.example.yaml                               80 lines    2760 bytes
```

All three minimum instances exit 0. The report minimum is every required key
present with an empty array:

```yaml
kind: report
role: implementer
task: x
findings: []
claims: []
deviations: []
honest-failures: []
environmental-claims: []
gate-results: []
```

**The judgment.** The schemas price PRESENCE and, in two places, price
NON-EMPTINESS of a nested array (`finding.evidence` and
`environmentalClaim.evidence`, both `minItems: 1`). They put no price on
omission at the top level. An author who found three defects pays roughly ten
kilobytes to say so and 140 bytes to say nothing, and both exit 0. That
asymmetry is not something a criterion could have removed, and I am not filing
it as a finding.

Two observations that qualify it in the phase's favour, and one against.

In favour: the phase did pay the honest cost in the open, which is the partial
instrument the plan named, and the templates are filled with this repository's
real records rather than placeholders. And a cheap `findings: []` is the HONEST
record for a role that found nothing, so a schema that priced it would be
punishing the truthful case.

Against: the one guard designed specifically to price silence,
`no-findings-statement`, is optional in exactly the situation it exists for.
LIE-09, a review report with `findings: []` and no statement, exits 0. The
implementer disclosed this as residue 5 at delivery/work-history/m3-p4.md:588 and
escalated it under D-M3-22 rather than writing an unlisted check, which is the
correct handling. I record it here as the concrete form the hazard takes in this
contract, and as an argument for the escalation being answered rather than
filed.

---

## The converse of every relation this phase constrains

The contract instructed me to construct the converse of each relation. I did.
Two are genuinely bidirectional and deserve saying so.

### `final-report-finding-parity` is bidirectional, and its third direction is covered too.

**CONTROL, orphan:**
```
INVALID #/inputs/1 finding CR-002 has no row in input-findings, so the table has a hole (check: final-report-finding-parity)
exit=1
```
**CONTROL, phantom:**
```
INVALID #/input-findings/1 input-findings names CR-999, which is not in inputs, so the coverage is phantom (check: final-report-finding-parity)
exit=1
```
The duplicate direction is in the code at the same site and is asserted by the
phase's own tests. This is the check the contract flagged as the obvious
one-directional candidate, and it is not one. Credit where it is due.

The residue is stated in the check's own doc comment: a finding dropped from
BOTH arrays is invisible. **LIE-05a**, a final report with `inputs: []` and
`input-findings: []` and four `none: true` markers, exits 0. Disclosed, no
finding.

**LIE-05b**, three inputs each mapped to an outcome of `"x"`, exits 0. Structural
completeness with no content; the same class as residue 4 and not separately
filed.

### `enumerableSection` closes both directions.

**CONTROL:** `none: true` carrying real `entries` is rejected with
`INVALID #/decisions-owed value matches no permitted alternative here`, exit 1.
`none: false` with an empty `entries` is refused by `minItems: 1`. The two-branch
`oneOf` does what its comment claims.

### The `claims-definition-shared-with-work-history` relation is half-shared.

Covered as CR-001. The keyword half is shared and tested by identity; the
derived-check half is not shared and nothing says so.

---

## The universal-quantifier pattern

### CR-005 (MEDIUM). ALL-CAPS universals bypass the pattern entirely, and this repository writes universals in ALL CAPS.

The alternation at schemas/report.schema.json:94 is
`\b([Aa]lways|[Nn]ever|[Ee]very|[Aa]ll cases|[Ii]n all)\b`. It admits the
lowercase and the sentence-initial capital of each token and nothing else.

```
$ node -e '
const p=/\b([Aa]lways|[Nn]ever|[Ee]very|[Aa]ll cases|[Ii]n all)\b/u;
for (const s of ["in every case","there is no path that","guaranteed","ALWAYS","NEVER","EVERY","All cases","ALL CASES","in all","IN ALL"]) console.log(JSON.stringify(s), p.test(s));'
"in every case" true
"there is no path that" false
"guaranteed" false
"ALWAYS" false
"NEVER" false
"EVERY" false
"All cases" true
"ALL CASES" false
"in all" true
"IN ALL" false
```

End to end, through the validator, on a finding with no `counter-experiment`:

| `analysis` | exit |
|---|---|
| `This arm can never be reached.` | **1** (control, correctly rejected) |
| `This holds in every case.` | **1** (see CR-006) |
| `This holds in every one of them.` | **1** |
| `This arm can NEVER be reached.` | **0** |
| `The lease is ALWAYS held by exactly one holder.` | **0** |
| `In ALL CASES this holds.` | **0** |
| `There is no path that reaches it.` | 0 (disclosed, residue 7) |
| `This is guaranteed.` | 0 (disclosed, residue 7) |
| `This cannot be forced here; it is impossible, and there is no way to reach it.` | 0 |

The control line is what makes the rest credible: the guard is armed and it is
the CASE that defeats it.

Why this is not the same thing as the disclosed vocabulary residue: residue 7 is
about tokens OUTSIDE the five. This is about the five themselves, written in the
register this project actually uses for emphasis.

```
$ git ls-files 'delivery/**/*.md' 'schemas/*.json' CLAUDE.md \
    | xargs grep -ohE '\b(ALWAYS|NEVER|EVERY|ALL CASES|IN ALL)\b' | sort | uniq -c | sort -rn
     39 EVERY
     35 NEVER
      9 ALWAYS

$ git ls-files 'delivery/**/*.md' 'schemas/*.json' CLAUDE.md \
    | xargs grep -lE '\b(ALWAYS|NEVER|EVERY|ALL CASES|IN ALL)\b' | wc -l
39
```

83 occurrences across 39 tracked files, including the schemas under review and
this phase's own work history. An agent writing an emphatic universal in this
codebase's house style writes it in the one case the pattern does not see. The
remedy is one character of regex flag semantics or five more alternatives.

The same bypass applies to `evidence[].note`, which carries the same `if`/`then`.
**LIE-12**, a note reading `this branch is NEVER taken under any input` with no
`counter-experiment`, exits 0.

### CR-006 (LOW). Residue 7 and the schema comment both name `in every case` as a token that passes. It does not.

schemas/report.schema.json:92 says "a universal claim written without any of
these five tokens (`in every case`, `there is no path that`, `guaranteed`)
passes", and delivery/work-history/m3-p4.md:604 repeats it. Measured above,
`in every case` is caught, by `[Ee]very` under a word boundary. The error is in
the safe direction, the guard reaches further than claimed, but it is a false
statement about the guard's behaviour in the document that teaches authors how
the guard behaves, and one of the two other examples given in the same
parenthesis is correct, so a reader has no way to tell which to trust.

---

## Other expressible records, filed lower

### CR-007 (LOW). A review report may carry `verdict: APPROVE` over two unresolved high findings, and two different findings may share one id.

**LIE-08:**

```yaml
kind: report
role: clean-room-reviewer
task: review the phase branch
verdict: APPROVE
findings:
  - id: CR-001
    severity: high
    ...
    outcome: unresolved
  - id: CR-001
    severity: high
    analysis: a second, different defect filed under the same id
    outcome: unresolved
```

`exit=0`.

DR-0012 conditions merge on two reviews that "both APPROVE with no unresolved
high or medium finding". This is the machine-readable form of a review, and it
cannot support that condition: `verdict` is a free string with no relation to
`findings[].severity`, and finding ids are not unique. The duplicate-id half is
the same shape M2-P6 paid for at CR-985, quoted in this phase's own
`final-report-finding-parity` doc comment, where a duplicated id defeated two
checks at once. `uniqueItems` is not in the declared vocabulary but a derived
check is the established answer, and the same one already counts ids for the
final report.

Neither property is asked by any criterion, so this is a gap in the contract's
reach rather than a missed criterion.

### CR-008 (INFORMATIONAL). No check resolves `evidence[].path`, so a finding may cite a file that does not exist at a line that does not exist, with a fabricated exit code.

**LIE-06f:**

```yaml
findings:
  - id: CR-002
    severity: high
    source-pinned: true
    pinned-evidence: origin/main at 0000000000000000000000000000000000000000
    evidence:
      - path: src/there-is-no-such-file.ts
        lines: "999999"
        note: the defect is on this line
      - path: src/also-not-real.ts
        command: node src/also-not-real.ts
        exit-code: 0
        note: it exited 0
```

`exit=0`. **LIE-11**, an environmental excuse whose evidence is a fabricated
`exit-code: 0` against a nonexistent path, also exits 0, and it satisfies R-085's
`minItems: 1` while being worth nothing.

The `evidence` shape's own comment claims only that "`path` alone is a
rejection", which is true and is what I verified. Path RESOLUTION is a
filesystem property, so Kind B, and no derived check in the repository does it
today. The machinery exists: `requiresContext` and `--context <dir>` are built
for exactly this and are used by three other checks. I am filing this as
informational because nothing in the plan asks for it, and I am recording it
because the `citations` gate exists at repository level for markdown and there is
no equivalent for the YAML artifacts that are meant to replace that prose.

### CR-009 (INFORMATIONAL, judgment). Hazard 5, recorded above.

---

## Every record I constructed

| id | what it claims | type | exit | disposition |
|---|---|---|---|---|
| LIE-01 | work history, 9999 discovered, 1 passed, green | work-history | **0** | CR-001 |
| LIE-01-C1 | same counts in a report | report | 1 | control |
| LIE-02 | 505/505 balanced, 2 real tests dropped from both sides | report | **0** | disclosed residue |
| LIE-02b | `todo` bucket laundered into `did-not-run` | report | **0** | disclosed residue 6 |
| LIE-02c | green, exit 0, 400 failed, parity balanced | report | **0** | CR-003 |
| LIE-03a | impossibility filed as `open-question` | report | **0** | CR-002 |
| LIE-03b | never/impossible/always filed as `open-question` | report | **0** | CR-002 |
| LIE-03c | impossibility filed as `universal`, settled by a sentence | report | **0** | CR-002 |
| LIE-03d | impossibility settled by `true` with output `n/a` | report | **0** | CR-002 |
| LIE-03e | `kind: note` | report | 1 | control, enum closed |
| LIE-04a | derivation output is a one-line summary | report | **0** | disclosed residue 3 |
| LIE-04b | derivation output is truncated | report | **0** | CR-004 |
| LIE-04c | derivation output is of the WRONG command | report | **0** | CR-004 |
| LIE-04d | mechanism `x`, output `.`, not-covered `.` | report | **0** | disclosed residue |
| LIE-04e | derivation output empty | report | 1 | control |
| LIE-04f2 | mechanism, output and not-covered whitespace-only | report | 1 | control, pattern is load-bearing |
| LIE-05a | final report with zero inputs and zero rows | final-report | **0** | disclosed residue |
| LIE-05b | three inputs, every outcome `"x"` | final-report | **0** | noted, not filed |
| LIE-05c | orphaned input id | final-report | 1 | control |
| LIE-05d | phantom `input-findings` row | final-report | 1 | control |
| LIE-05e | `none: true` sitting on real entries | final-report | 1 | control |
| LIE-06a | analysis says `never`, no counter-experiment | report | 1 | control |
| LIE-06b | analysis says `NEVER` | report | **0** | CR-005 |
| LIE-06c | analysis says `ALWAYS` | report | **0** | CR-005 |
| LIE-06d | `guaranteed` + `in every case` + `there is no path that` | report | 1 | CR-006 |
| LIE-06e | `cannot be` + `impossible` + `no way to` | report | **0** | disclosed residue 7 |
| LIE-06f | evidence citing nonexistent files and lines | report | **0** | CR-008 |
| LIE-07 | minimum validating report, 140 bytes | report | **0** | hazard 5 judgment |
| LIE-07b | minimum validating work history, 187 bytes | work-history | **0** | hazard 5 judgment |
| LIE-07c | minimum validating final report, 182 bytes | final-report | **0** | hazard 5 judgment |
| LIE-08 | `verdict: APPROVE` over two unresolved highs sharing one id | report | **0** | CR-007 |
| LIE-09 | zero findings, no `no-findings-statement` | report | **0** | disclosed residue 5 |
| LIE-10 | environmental claim with empty `evidence[]` | report | 1 | control |
| LIE-11 | environmental excuse with fabricated evidence | report | **0** | CR-008 |
| LIE-12 | evidence note says `NEVER`, no counter-experiment | report | **0** | CR-005 |
| LIE-13a | work-history impossibility with no construction | work-history | 1 | control, keyword sharing works |
| LIE-13b | work-history impossibility filed as `open-question` | work-history | **0** | CR-002 |

Counted mechanically off this table:
`grep -c '^| LIE-'` gives **37** records, `grep '^| LIE-' | grep -c '| 1 |'` gives
**11** rejected, and the remaining **26** exit 0. Nine of the eleven rejections
were written as controls; LIE-06d and LIE-13a were written as lies and were
refused, which is the contract working.

---

## What this review did NOT cover

The reviewer's first check is this section, so it is written to be checkable.

1. **The acceptance criteria.** Not walked. Contract A holds that. I read the
   criteria only to tell a disclosed residue from an undisclosed one, and I did
   not verify a single "MET" row in the work history's criteria table.
2. **Witness integrity.** I did not deregister a check, remove a keyword, or
   re-run any of the phase's red witnesses. Every claim about a guard above is
   from an instance I wrote, not from the phase's own test.
3. **The test suite.** I did not run `node --test`, `npm run build`, or any
   gate. No number in this report is a suite count. The 507/505/2 figures quoted
   inside LIE-02 come from the phase's own shipped template and are used only as
   the shape of a plausible lie, not as a measurement I am making.
4. **`templates/warnings.md` and the brief assembly path.** Not examined at all.
   R-083a's template half is outside the expressible-lie question as I scoped it,
   and a lie expressible in a warnings template is a real gap in this review.
5. **`delivery/requirements/clause-map.json` and `test/behaviors.json`.** Read
   only for the diff stat. I did not check whether the new rows are correct, or
   whether any behavior registration over-asserts by count.
6. **The five schemas this phase did not touch.** `plan`, `charter`,
   `decision-record`, `status-line`, `gate-registry`, `assurance-modes` and
   `role-model-config` were not attacked. A claim of mine about "all three
   schemas" always names the three this phase ships.
7. **Prose delivery documents.** I did not attack the markdown work history at
   delivery/work-history/m3-p4.md as a document to be validated, because it is
   not one; I read it only to establish what the branch DISCLOSES. Residue 8 in
   it records that `delivery/work-history/` is outside the citations gate's
   globs, and I did not verify that.
8. **YAML decoding.** I did not attack the decode stage: anchors, aliases,
   merge keys, duplicate keys, tags, or a document whose YAML meaning differs
   from its apparent text. A lie expressible through YAML rather than through the
   schema would not appear in this report. This is the largest unexamined
   surface I am aware of.
9. **Ajv keyword semantics.** I trusted the validator. If `pattern` or `oneOf`
   behaves differently under the shipped Ajv configuration from the direct
   `RegExp` probe I ran, I would not have seen it, except where I ran both, which
   was only for the quantifier alternation.
10. **CI.** I ran nothing on a runner and observed no workflow. Under T-009 that
    means this review is evidence for one configuration: node v22.22.2, from
    source, in this container.

---

## Findings

| id | severity | one line |
|---|---|---|
| CR-001 | **HIGH** | `report-parity-arithmetic` never runs on a work history, while the shared `gateResult` comment and the branch's converse table both say the relation is closed |
| CR-002 | **HIGH** | `kind: open-question` accepts any statement with no settlement, so every other claim kind has a free escape, and the shared claim comment states the opposite |
| CR-003 | MEDIUM | a gate result may be `green` with `wrapper-exit-code: 0` and `failed: 400`; parity balances and the record contradicts itself |
| CR-005 | MEDIUM | ALL-CAPS universals bypass the quantifier pattern entirely, in a codebase whose 39 tracked files carry 83 of them |
| CR-004 | LOW | residue 3 names the summary case only; truncated and wrong-command captures also validate and are not named |
| CR-006 | LOW | the schema comment and residue 7 both say `in every case` passes the pattern; measured, it does not |
| CR-007 | LOW | `verdict: APPROVE` over unresolved high findings validates, and two findings may share one id, so this artifact cannot support DR-0012's condition |
| CR-008 | INFORMATIONAL | no check resolves `evidence[].path`; a finding may cite a nonexistent file at a nonexistent line with a fabricated exit code |
| CR-009 | INFORMATIONAL | hazard 5, the authoring-cost asymmetry, assessed as a judgment: the plan's disclaimer is confirmed, and the one guard that prices silence is optional in the case it exists for |

**VERDICT: CHANGES REQUIRED.**

The phase is, in most respects, unusually careful work: the converse table is
real, `final-report-finding-parity` is genuinely bidirectional where the contract
predicted it would not be, the empty-string inventory survives a mechanical
enumeration with zero unguarded fields, and the residue list is longer and more
honest than most. CR-001 and CR-002 are not carelessness; they are the same
shape the repository keeps re-buying, which is a guard whose documentation is
wider than the guard. In a phase whose subject is the contract for false claims,
a shipped comment that overstates what the contract catches is the defect that
matters most, because every later role brief inherits it.

---

## The claim grep, over this report

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/review/clean-room-m3-p4-expressible-lie.md
```

Every hit falls into one of four groups, and each is settled here.

1. **Quoted material.** Hits inside the schema comment I quote, inside the LIE
   bodies I authored as false statements, and inside the regex probe's token
   list. These are the objects of study, not assertions by me. The LIE bodies
   are deliberately false; that is their purpose.
2. **Statements settled by an adjacent captured command.** "The literal enum is
   closed" is settled by control CR-002-C1's captured diagnostic. "The keyword
   half of the sharing works" is settled by control CR-001-C2. "`in every case`
   is caught" is settled by the `node -e` probe printing `true`, and by the
   validator exiting 1. "Both keywords are needed" is settled by the two
   whitespace controls. "Hazard 1 is closed" is settled by the enumeration
   printing `UNGUARDED: 0`, with its scope stated in the paragraph beneath it.
3. **Statements about what I did not do.** Every sentence in the not-covered
   section. These are reports of my own scope and need no command.
4. **Open questions, restated as such.** Three, and they are restated rather
   than settled:
   - I did not find a keyword in the declared authoring vocabulary that
     distinguishes full captured output from a summary, a truncation, or the
     output of a different command. I am not asserting none exists.
   - I did not find a way to make `report-parity-arithmetic` observe a work
     history's `gate-evidence[]` through any existing registration. I did not
     read every consumer of `runChecks`, so a caller that re-types the document
     could exist and I would not have seen it.
   - I did not find a route by which the ALL-CAPS bypass is closed elsewhere,
     for example by a lint over authored YAML. I did not look outside
     `src/checks.ts` and the three schemas for one.

Applying this phase's own contract to this report, in its own vocabulary: every
sentence in group 4 is `kind: open-question`, and I have filed none of them as
`kind: impossibility`, because I ran no construction that would settle them.
