# M3-P4 fix round 2: independent delta verification

Status: COMPLETE. Written incrementally as a beacon (T-008) by two verifiers: the first died when the container restarted, the second resumed from its salvaged partial in the same worktree and finished the work.

- reviewed head (round 1): a3ea489
- fix round 2 head:        2ed019b  (verified here)
- merge base with main:    c7a7ce9
- delta:                   a3ea489..2ed019b

Verifier: independent delta-verification contract, third contract on this phase.
Started 2026-08-10.

## Log

- Scratch clone created, HEAD pinned at 2ed019b, merge base confirmed c7a7ce9.

## First check: what the round's derivation did NOT cover (contract order)

The delta touches ten files (git diff --stat a3ea489 2ed019b): src/checks.ts,
three schemas, two templates, test/behaviors.json, two test files, and the work
history. Ten commits, 459a670..2ed019b.

Independently enumerated, before reading the round's account, the cross-document
`$ref` set in `schemas/` is EXACTLY three pointers, all from work-history into
report:

    report.schema.json#/$defs/claim
    report.schema.json#/$defs/fixRound
    report.schema.json#/$defs/gateResult

The TRANSITIVE closure from those three adds three more definitions that are
shared across types and that NO cross-document `$ref` names:

    report.schema.json#/$defs/settledBy
    report.schema.json#/$defs/settledByConstruction
    report.schema.json#/$defs/settledByCounterExperiment

Candidate hole under investigation: `sharedDefinitionUsers()` in
test/report-contract.test.ts collects only pointers that do not start with `#/`,
so a definition reached through a chain is invisible to it. Probe pending.

## Resumption note (container restart)

The first verifier died mid-probe when the container restarted. This file is its
salvaged partial, continued by a second verifier in the SAME worktree
(HEAD 2ed019b, branch claude/m3-p4-report-and-work-history, working tree clean
apart from this untracked report). Toolchain re-checked in the resuming shell:
`node --version` gives v22.22.2 via /opt/node22/bin. Nothing above this line was
rewritten.

Resumed 2026-08-10. Work order from here: settle the pending CR-001 transitive
probe first (it is the sharpest lead), then CR-002's "structurally unclosable"
impossibility claim, then the remaining findings, then the gates and suite.

## CR-001: CLOSED at the mechanism the finding named, and a NEW hole one hop out

### The mechanism in my words

A JSON Schema `$ref` copies KEYWORDS into the borrowing document and copies
NOTHING about the derived (Kind B) checks that also guard the same definition.
So a rule moved into a shared `$def` is half-shared: the keyword half travels,
the procedural half stays behind, registered per artifact type and reading a
per-type key. The round's account of this agrees with mine, and it correctly
identified the second, less visible half: the KEY. A check registered for both
types but still reading one hard-coded key is registered and still blind.
`GATE_RESULT_SITES` at src/checks.ts:1653 is the right shape for that, a site
table rather than an added string.

### The finding itself is closed

`report-parity-arithmetic` now declares `alsoTypes: ["work-history"]`
(src/checks.ts:1700) and `guards: ["report.schema.json#/$defs/gateResult"]`
(src/checks.ts:1701), and it reads its counts through `GATE_RESULT_SITES` rather
than one key. Reproduced independently, over all TEN shipped schemas rather than
the three this phase touched: the cross-document `$ref` set is exactly three
pointers, all work-history into report, and the one of them a derived check
guards is `gateResult`, which now runs on both users. That matches the round's
published derivation output line for line.

### NEW FINDING DV-001 (MEDIUM): the guard the round built is ONE HOP DEEP

`sharedDefinitionUsers()` in test/report-contract.test.ts:1181 skips any pointer
beginning `#/`:

    if (reference.startsWith("#/")) continue;

The `users` map it returns is therefore keyed only on definitions named by a
DIRECT cross-document `$ref`. A definition reached through a CHAIN (work-history
-> `report.schema.json#/$defs/claim` -> `#/$defs/settledBy` ->
`#/$defs/settledByConstruction`) never becomes a key, so the hole-finding loop
never examines it. This is CR-001's own shape one level down: the guard written
to catch "sharing does not share the check" enumerates sharing one hop only.

**Independently computed, all ten schemas.** Full transitive reachability finds
32 definitions; the one-hop set finds 3. Exactly three definitions are reached by
MORE THAN ONE artifact type and are invisible to the one-hop set:

    report.schema.json#/$defs/settledBy                    reached-by=[report, work-history]
    report.schema.json#/$defs/settledByConstruction        reached-by=[report, work-history]
    report.schema.json#/$defs/settledByCounterExperiment   reached-by=[report, work-history]

A further 26 definitions are single-type and also absent from the map; a `guards`
entry naming any of them is likewise never examined.

**Question 1, is there a LIVE instance?** No. Only one registered check declares
`guards` at all, and it names `gateResult`:

    $ grep -n 'guards' src/checks.ts
    1701:  guards: ["report.schema.json#/$defs/gateResult"],

So no derived check currently guards any of the three. **The hole is LATENT: a
class the test cannot see, with no member in the shipped tree.** That is why this
is MEDIUM and not HIGH.

**Question 2, can a document of a type the check does not list actually REACH
those definitions? YES, constructed rather than reasoned.** The unmodified
work-history template validates (exit 0); with `exit-code` deleted from the one
`executed-construction` in its `claims[]`:

    $ node bin/tiphys.ts validate --type work-history <scratch>/wh-A.yaml
    INVALID #/claims/1 value does not satisfy the requirements its own shape triggers here
    INVALID #/claims/1 value matches no permitted alternative here
    INVALID #/claims/1/settled-by value matches no permitted alternative here
    INVALID #/claims/1/settled-by/counter-experiment required property counter-experiment is missing
    INVALID #/claims/1/settled-by/executed-construction property executed-construction is not permitted here
    INVALID #/claims/1/settled-by/executed-construction/exit-code required property exit-code is missing
    exit=1

A work-history document reaches `settledBy` AND `settledByConstruction` at
validation time. The reachability is real, only the test's model of it is short.

**Question 3, one control and three members, by mutation of the registry.**
`src/checks.ts` copied pristine, restored by `cp` inside a `trap`, md5 compared
before and after and IDENTICAL (`4f1c9939d17d98d466b72de565842fb2` both times).
Each run adds one probe check `type: "report"` with no `alsoTypes`:

| probe `guards` | shipped test |
|---|---|
| `report.schema.json#/$defs/claim` (ONE HOP) | **not ok** (control: the test does work at one hop) |
| `report.schema.json#/$defs/settledBy` (chain, 1 extra hop) | ok, green |
| `report.schema.json#/$defs/settledByCounterExperiment` (chain, 2 extra hops) | ok, green |
| `report.schema.json#/$defs/thisDefinitionDoesNotExist` (resolves to nothing) | ok, green |
| no probe at all | ok, green (control) |

The control's failure text names the mechanism exactly:

    + [
    +   'dv2-probe guards report.schema.json#/$defs/claim but does not run on work-history (it runs on report)'
    + ]
    - []

so the one-hop arm is genuinely load-bearing and the green arms above are not
green for some unrelated reason.

The fourth row is a SECOND arm of the same weakness and structurally different
from the first two: nothing asserts that a `guards` pointer resolves to a real
definition. A typo in a future `guards` string is silently unguarded rather than
red, which is the "green and worthless" shape CLAUDE.md records under T-008's
postscript.

**A stale claim rides along with it.** The doc comment on `alsoTypes` at
src/checks.ts:68 says the test "FAILS when a guarded definition is reachable from
a type this check does not list". Reachable is the word, and the table above
shows the test does not test reachability; it tests direct reference. The comment
is true of `gateResult` and overstated as a general sentence.

**What would close it:** build `users` from the transitive closure (resolve
local `#/` pointers within the owning document while walking) rather than from
direct cross-document references, and assert that every `guards` entry appears in
that closure. My `closure.mjs` does the first half in about thirty lines. I am
not fixing anything here; that is the round's call.

## CR-002: the fix is CLOSED and travels; the "structurally unclosable" claim is OVERSTATED

### The mechanism in my words

Where a construct's branch is selected by a token the AUTHOR types, the whole
construct is only as strong as its cheapest branch, because the author chooses.
My name for it and the round's agree. I would add one word the round's version
leaves implicit: the branch selector must be UNCHECKABLE against the world for
this to bite. Where the author's own prose betrays the choice, the branch is
still author-selected but no longer free, and that is precisely the lever the
round used on `claim`.

### The fix itself: CLOSED, and it does travel through the `$ref`

Three structurally different impossibility statements filed as `open-question`,
and two honest restatements as over-rejection controls, all against the shipped
schemas at 2ed019b:

| statement, `kind: open-question` | report | work-history |
|---|---|---|
| `This arm cannot be forced here.` | INVALID #/claims/0, exit 1 | INVALID #/claims/0, exit 1 |
| `There is no way to reach this branch from the CLI.` | INVALID #/claims/0, exit 1 | not run |
| `It is impossible to construct a document that reaches it.` | INVALID #/claims/0, exit 1 | not run |
| `I did not find a way to force this arm.` (control) | exit 0 | exit 0 |
| `I did not audit whether any gate script reaches the registry by another path.` (control) | exit 0 | not run |

Three members, not one spelling of one shape, and the controls are accepted, so
the branch is narrowed rather than refused. The work-history column is the part
worth having: it is CR-001's mechanism seen from the good side, and it is
measured rather than asserted.

### NEW FINDING DV-002 (HIGH): one of the three "unclosable" sites IS closable, by this round's own construction

The round's table says of `#/$defs/verificationFirst`'s `if`/`then` on
`contradicts-plan`: "**YES, AND NOT PREVIOUSLY RECORDED ANYWHERE.** A finding
that does contradict the plan, recorded `false`, escapes the escalation
reference. **Unreachable by keyword or check.**" The prose above the table says
"None of the three is closable inside a schema."

That is false for this site, and the counter-example is the construction this
round wrote one definition away. `verificationFirst` carries a PROSE field,
`finding`, recorded verbatim (R-035). So the site is content-discriminated in
exactly the sense the round's own reading section defines, and the same
negative-lookahead `pattern` that narrowed `claim.statement` narrows it.

Constructed, not argued. `schemas/work-history.schema.json` copied pristine,
mutated, restored by `cp` inside a `trap`, md5 identical before and after
(`f1f503ceca1b5f343b7ba535ca830e97` both times). The `if`/`then` was replaced by
a two-branch `oneOf`: branch 0 is `contradicts-plan: true` owing
`stopped-and-reported` unchanged; branch 1 is `contradicts-plan: false` with a
negative-lookahead `pattern` on `finding`.

**The construction stays inside the declared vocabulary, measured against the
source of truth rather than eyeballed:**

    keywords: $comment, const, minLength, pattern, properties, required, type
    outside AUTHORING_VOCABULARY + ANNOTATION_KEYS: []

**Two structurally different members, two controls, and the shipped template:**

| `verification-first[1].finding`, with `contradicts-plan: false` | pristine | probe |
|---|---|---|
| `This contradicts the plan section 2.3, which names five counts.` | exit 0 | **INVALID #/verification-first/1, exit 1** |
| `The plan requires a fourth derived check here and the code ships three.` | exit 0 | **INVALID #/verification-first/1, exit 1** |
| `The M2-P6 coverage checker exposes no CLI flag reaching parity mode.` (control) | exit 0 | exit 0 |
| `Ajv withholds loadSchema, so a cross-document reference fails to compile until a companion is registered.` (control) | exit 0 | exit 0 |
| the shipped `templates/work-history.example.yaml` unmodified (control) | exit 0 | exit 0 |

The two members fail for different reasons (one names the contradiction, one
states the divergence without the word), so this is a class witness and not two
spellings.

I want to be exact about what this does and does not show, because the round
would be entitled to the same qualification I am giving it. This is a NARROWING,
not a proof procedure: an author who writes neutral prose over a real
contradiction still passes, exactly as the round's own token list still admits an
impossibility phrased in none of its thirteen literals. The round DECLARES that
residue for `claim` and calls the fix partial. The finding here is not that the
site is fully closable; it is that the round applied a remedy at one site,
declared the identical remedy **unreachable** at a sibling site with the identical
shape, and recorded the sibling as an open hole instead. On the round's own
standard for `claim`, this site is narrowable.

**HIGH** because "unreachable by keyword or check" is an impossibility claim that
CLAUDE.md's claim grep exists to catch, it is written into a SHIPPED schema
`$comment` where the next author will read it as settled, and it is refuted by
construction using this phase's own vocabulary. My honest counterpart sentence:
I did not find a way to make the marker TRUE by schema alone at this site.

### DV-003 (MEDIUM): the second "unclosable" site is half closable

Of `#/$defs/gateResult` the round writes: "`result: red` owes nothing at all: no
exit code, no counts. Structurally open", and the shipped `$comment` says "it
cannot be closed here, because a red run frequently has no counts to give and
demanding them would make the honest failure unwritable".

The COUNTS half of that is right and I did not find a way around it. The EXIT
CODE half is not: a gate that ran and did not pass has a wrapper exit code by
construction, and requiring its presence refuses no honest record.

`schemas/report.schema.json` copied pristine, mutated, restored by `cp` in a
`trap`, md5 identical (`b03fab542231d39a06fbc31c79040773` both times). The
`if`/`then` was replaced by a three-branch `oneOf`: green with the shipped
obligations verbatim, `[red, amber, error]` owing `result` and
`wrapper-exit-code` only, `not-applicable` owing nothing.

    keywords: $comment, const, enum, properties, required, type
    outside the declared vocabulary: []

| extra `gate-results[0]` | pristine | probe |
|---|---|---|
| `result: red`, no exit code | exit 0 | **INVALID #/gate-results/0, exit 1** |
| `result: red`, `wrapper-exit-code: 1` (control) | exit 0 | exit 0 |
| `result: red`, `wrapper-exit-code: 0` (control, the DECLARED-OPEN residue) | exit 0 | exit 0 |
| `result: not-applicable`, nothing else (control) | exit 0 | exit 0 |
| `templates/report.example.yaml` unmodified (control) | exit 0 | exit 0 |
| `templates/work-history.example.yaml` unmodified (control) | exit 0 | exit 0 |

The third row is the one that matters: the declared-open residue (a non-green
result carrying exit code 0) is still accepted, so this narrowing does not close
by accident the thing the schema deliberately leaves open. MEDIUM rather than
HIGH because the counts half of the sentence is correct and the escape is only
partly narrowed.

An honest note on my own probe, since the exit code is not the whole obligation:
requiring the exit code does not stop an author writing `red` to avoid the six
counts. It raises the cheapest branch's price from zero; it does not equalise the
branches.

### The third site: I did not find a way

`#/$defs/enumerableSection`'s `none: true` branch has NO author prose at all
(`additionalProperties: false` over a single boolean), so the pattern lever that
works on the other two has nothing to bite on, and there is no second record in
that document to compare against. **I did not find a way to close it, and I am
not saying it cannot be closed.** One mitigation IS expressible and is not
mentioned: requiring a short prose `why-none` string on the `none: true` branch
would make the cheap branch cost something, which is the mechanism's own remedy
("a branch that requires NOTHING"), though it would not make the marker true.
That is a contract change and rightly not this round's to take unasked.

### Method note against myself

My first attempt at the `verificationFirst` probe let member 2 through, because
my own token list was case-sensitive where the sentence was not. I read the
result rather than the exit code, found the gap was in the fixture and not the
finding, corrected the pattern and retook both arms. Separately, my first
`gateResult` fixtures were malformed YAML and every arm exited 1 for that reason:
`is not valid YAML: Nested mappings are not allowed in compact mappings`. Three
red arms that were evidence of nothing. Recorded because a count of red arms
cannot see this and the exit codes looked exactly like success.

## CR-003: CLOSED, and the declared-open residues survive the fix

Members and controls against the shipped schemas at 2ed019b, an extra
`gate-results[0]` appended to the shipped report template:

| record | result |
|---|---|
| `green`, exit 0, passed 105, **failed 400**, parity balanced | INVALID #/gate-results/0 ... its own shape triggers here; INVALID #/gate-results/0/failed value 400 does not equal the required constant 0. exit 1 |
| `amber`, exit 0, failed 400 (DECLARED-OPEN residue) | exit 0, accepted |
| `error`, exit 0, failed 400 (DECLARED-OPEN residue, second member) | exit 0, accepted |
| `green`, exit 0, passed 505, failed 0 (control) | exit 0 |
| `green`, exit 0, passed 503, **skipped 2** (second declared residue) | exit 0 |

The keyword named in the diagnostic is the `const` on `failed`, so the fix is
where the round says it is, and both declared-open residues are still open, which
is the check that the fix did not overshoot. Note the parity arithmetic BALANCES
in row 1 (105 + 400 = 505 = discovered), so the parity check is not what caught
it; the keyword is.

## CR-005: CLOSED, and my sweep was wider than the round's without changing the answer

The pattern is per-letter two-member classes. Measured directly against
`$defs/universalQuantifier.pattern` at head:

    MATCH   "always" "ALWAYS" "AlWaYs" "Always" "never" "NEVER" "NeVeR"
    MATCH   "every" "EVERY" "EvErY" "all cases" "ALL CASES" "in all" "IN ALL"
    MATCH   "in every case" "IN EVERY CASE"
    nomatch "there is no path that"  "guaranteed"     (the declared residue, correct)
    nomatch "alwayssss" "xalways" "salways" "Nevertheless" "everything"   (word boundary holds)

`in every case` matching confirms the CR-006 correction by measurement.

**On the false-rejection question I widened the scope deliberately, because the
round's instance sweep was two globs (`templates/*.yaml`, `test/fixtures/*.yaml`)
and "validated instance" is a larger set than that.** Over every tracked YAML in
the repository:

    $ git ls-files '*.yaml' '*.yml' | xargs grep -onE '\b(ALWAYS|NEVER|EVERY|ALL CASES|IN ALL)\b'
    .github/workflows/gates.yml:44:EVERY
    assurance-modes.yaml:56:NEVER
    gate-registry.yaml:30:NEVER

Two of those three ARE validated instances and were outside the round's globs.
The answer is unchanged and I checked why rather than assuming: all three hits
are inside `#` comments, and no schema other than `report.schema.json` references
`universalQuantifier` at all, so no guarded field exists in those kinds:

    assurance-modes      (no universalQuantifier reference)
    gate-registry        (no universalQuantifier reference)
    role-model-config / charter / plan / decision-record / status-line   (same)
    schemas/report.schema.json:172  "analysis": { "$ref": "#/$defs/universalQuantifier" }
    schemas/report.schema.json:210  "note":     { "$ref": "#/$defs/universalQuantifier" }

**ZERO false rejections, confirmed on a wider scope than the round used.** The
round's conclusion is right; its derivation scope was narrower than its sentence,
which is the shape CLAUDE.md's fix-round contract item 3 exists for. Recorded as
an observation, not a finding, because widening the scope does not change the
verdict.

The token count is 129 across 41 files at this head, not 83 across 39. That is
not a discrepancy: the round predicted it in writing ("The count I checked is 83
and it will not stay 83, because this document adds ALL-CAPS tokens of its own as
I write it"), and the round's own 1435 added lines are inside my measurement and
outside its own.

## CR-1520: CLOSED, five arms WRITTEN and each reading a separate schema copy

All five cited lines resolve and each is a distinct removal in its own
`readSchema(...)` copy, so no arm can be green because of a sibling's defang:

| row | site | line at head |
|---|---|---|
| 2(b) member 2 | test/report-contract.test.ts:438 | `const withoutRequired = readSchema("report.schema.json");` |
| 2(d) member 2 | test/work-history.test.ts:281 | `const withoutRequired = readSchema("work-history.schema.json");` |
| 2d(b) member 2 | test/report-contract.test.ts:793 | `const withoutMechanism = readSchema("report.schema.json");` |
| 2d(c) member 1 | test/report-contract.test.ts:816 | `const withoutRequired = readSchema("report.schema.json");` |
| 2e member 2 | test/report-contract.test.ts:925 | `const withoutBoth = readSchema("report.schema.json");` |

The round chose to WRITE the arms rather than relabel the column, and recorded
the rejected alternative. That is the right call and it is the one that makes the
table true by execution.

## The `todo` bucket: CLOSED, and the third arm is the one that matters

`PARITY_BUCKETS` at src/checks.ts:1637 is now
`["passed", "failed", "skipped", "todo", "did-not-run"]`, matching the wrapper's
own identity string at src/gates/suite.ts:350 term for term.

| record | result |
|---|---|
| green, discovered 508 = 504+0+2+1+1 with `todo: 1` | exit 0, the previously unrecordable run is now recordable |
| green, discovered 507 with `todo: 1` (bucket left out of the sum) | `INVALID #/gate-results/0 discovered 507 does not equal passed + failed + skipped + todo + did-not-run = 508 (check: report-parity-arithmetic)`, exit 1 |
| green, `todo` absent | `INVALID #/gate-results/0/todo required property todo is missing`, exit 1 |

The second row is the arm that distinguishes a field that is present from a field
that is COUNTED, and it names the six-term identity in its own captured text.

## `report-no-findings-statement`: CLOSED in BOTH directions

| record | result |
|---|---|
| `findings: []`, no statement | `INVALID #/no-findings-statement findings is empty and no-findings-statement is missing, so the report claims nothing was found without saying why (check: report-no-findings-statement)`, exit 1 |
| `findings: []`, statement present | exit 0 |
| three real findings, statement present (the CONVERSE, beyond the requirement's letter) | `INVALID #/no-findings-statement no-findings-statement is present beside 3 finding(s), so the report contradicts itself (check: report-no-findings-statement)`, exit 1 |

### NEW FINDING DV-004 (LOW): a shipped schema comment claims a derivation that does not exist

schemas/report.schema.json:45 says of this check: "IT IS REGISTERED FOR `report`
ALONE AND THAT IS CORRECT ... the enumeration in test/report-contract.test.ts is
what makes that a checked fact rather than an assertion."

The enumeration checks nothing about it. Its inner loop is

    if (!(check.guards ?? []).includes(pointer)) continue;

at test/report-contract.test.ts:1226, and `report-no-findings-statement` declares
no `guards` at all, so it is skipped on every pointer. `findings` and
`no-findings-statement` are top-level PROPERTIES, never `$defs`, so they cannot
appear in `users` under any circumstances. Nothing else in `test/` derives the
claim either.

The round's own work history is HONEST about this in its non-coverage section:
"it is asserted by hand in the schema comment rather than derived". So the
shipped artifact and the work history contradict each other, and the shipped one
is the one a later author will read. LOW because the registration is in fact
correct; what is wrong is the claim about how it is known.

## The handbacks: judging whether handing them back was RIGHT

### CR-007 (a fourth derived check): handing it back was RIGHT

Verified against the arbitration itself rather than against the round's account
of it. `delivery/review/arbitration-m3-p4-round-1.md` on branch
`claude/review-m3p4-expressible-lie` (commit 4224a7d) says: "D-M3-22 makes an
unlisted derived-check row a plan defect to escalate. I am taking it rather than
deferring because the hole is in the phase's own core purpose ... **Section 2.3's
table is amended to three rows for this phase.**"

Three rows were authorised and three are registered. A fourth would be exactly
the unlisted row D-M3-22 forbids, written by an implementer while executing an
arbitration that had just counted the rows. Both halves of CR-007 are also real:
`verdict` is a free string with no relation to `findings[].severity`, and
`uniqueItems` compares whole objects so two findings sharing an id and differing
elsewhere satisfy it. The round states both accurately and asks rather than
improvises. **Correct handback.**

### The three open branches: handing them back was RIGHT for TWO of the three

The round asks whether M3-P7's probes should carry a row for each. That is a
legitimate question and I would ask it too. But it is asked on the premise that
none of the three is closable here, and DV-002 and DV-003 above show that premise
is wrong for two of them. So the handback is right as a QUESTION and wrong as a
PREMISE, and the orchestrator should read it knowing that the
`contradicts-plan` site is narrowable now and the `gateResult` exit-code half is
too.

The round's own claim-grep section contains the honest form of the sentence:

> I did not find a keyword or a check that reaches any of the three structurally
> open branches, and I am not asserting that none exists; what I can say is that
> each compares a document to something that is not in any document, and this
> repository's checks all compare documents.

That is the right shape and I want to credit it. Two things about it still fail.
First, the flat form survives in three other places, one of them a SHIPPED
artifact: the converse table says "Unreachable by keyword or check", the handback
says "not closable there", and schemas/report.schema.json says "it cannot be
closed here". A hedge in one section does not unwrite an assertion in a schema
comment that the next author will read as settled. Second, the hedge's own
JUSTIFICATION is refuted for `verificationFirst`: the `finding` prose is IN the
document, so this is not a case of comparing a document to something outside it,
and the pattern in DV-002 compares two fields of one object.

### Observation: the CLAUDE.md claim grep cannot see any of these three claims

The mandated token list is
`cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to`.
Run over the round-2 section it returns 53 hits, and the intersection with the
three impossibility claims is EMPTY:

    $ grep -nEi 'unreachable|unclosable|not closable|closable|structurally open|cannot be closed' <round-2 section>
    289: ... Structurally open, because a red run frequently has no counts to give ...
    290: ... Unreachable by keyword or check ...
    295: None of the three is closable inside a schema ...
    618: Three structurally open branches, recorded in the schema comments and not
    619:   closable there ...

    $ <the CLAUDE.md token list> | grep -Ei 'unreachable|closable|structurally open'
    (no output, exit 1)

So the round ran the mandated grep faithfully, and the grep is blind to the
strongest impossibility claims the round makes. This is not a fault of the round.
It is a gap in the mechanism, and it is the T-006 shape one level up: a
mechanical guard whose condition does not cover the property it exists to
protect. `unreachable`, `not closable`, `structurally open` and `unclosable`
would each have caught one. I record it here rather than editing `CLAUDE.md`,
which is not mine to change.

### On the arbitration's open question about CR-002's remedy

The arbitration left this unsettled: "Whether CR-002's remedy is truly inside the
declared vocabulary. The reviewer asserts it; the round must prove it by
construction." **SETTLED AFFIRMATIVELY, and by sweep rather than by inspection of
the one site.** Every keyword used anywhere in `schemas/` was collected and
checked against the vocabulary read from source:

    vocabulary size: 16;  pattern declared: true;  maxItems: false;  not: false;  allOf: false
    none: every keyword in schemas/ is inside the declared vocabulary

So no keyword was widened anywhere in this round, not only at the CR-002 site.
That is a stronger answer than the arbitration asked for.

## Per-finding table, with the mechanism in MY words

| id | mechanism, my wording | verdict | what settles it |
|---|---|---|---|
| CR-001 | A `$ref` copies keywords and copies nothing about the derived checks over the same definition, so a rule moved into a shared `$def` is half-shared, and the unshared half is registered per type AND reads a per-type key | **CLOSED** at the mechanism | `alsoTypes` + `guards` + `GATE_RESULT_SITES`; my own ten-schema enumeration reproduces the round's output; a work-history `gate-evidence` entry now reddens on parity |
| CR-002 | A branch selected by a token the author types is only as strong as its cheapest branch, unless the author's own prose betrays the choice | **CLOSED** for the named construct | three impossibility statements refused as `open-question` on BOTH types, two honest restatements accepted |
| CR-003 | A conditional that pins one field of a record leaves every other field of the same record free to contradict it | **CLOSED** | `green` + `failed: 400` refused naming `#/gate-results/0/failed`, with parity balanced so the keyword is demonstrably what caught it; both declared residues still accepted |
| CR-004 | A residue that names one member of a class reads as if the class had one member | **CLOSED** (documentary) | residue 3 and the schema comment now name the truncated capture and the wrong-command capture |
| CR-005 | An alternation of literals encodes a casing assumption the repository's own house style breaks | **CLOSED** | per-letter classes match all four casings of all five tokens; word boundary holds on five near misses; zero false rejections on a WIDER instance sweep than the round ran |
| CR-006 | A comment asserting what a pattern does, never executed against the pattern | **CLOSED** | `in every case` MATCHES, measured against the shipped pattern string |
| CR-007 | Two document-level relations (`verdict` vs `severity`, id uniqueness) that no keyword reaches | **NOT FIXED, correctly handed back** | the arbitration authorises three derived-check rows and three are registered; a fourth is the unlisted row D-M3-22 forbids |
| CR-1520 | A witness table naming keywords no arm removed: the column was a claim, not a record | **CLOSED by execution** | five arms exist at the five cited lines, each in its own `readSchema` copy |
| CR-1521 / CR-1522 | Born-stale citations: the line exists and does not mean the cited thing | **CLOSED** | all 20 `path:line` citations in the round-2 section resolve, and I read the target line of each |
| `todo` bucket | A record contract that omits a bucket the wrapper reports refuses a legitimate run | **CLOSED** | the third arm: bucket present but left out of the sum reddens, naming the six-term identity |
| `no-findings-statement` | Emptiness of a sibling array is not a keyword property | **CLOSED both directions** | missing statement over empty findings reddens; statement beside three findings reddens; the pair accepted |

New findings raised by this verification:

| id | severity | one line |
|---|---|---|
| DV-001 | MEDIUM | the CR-001 guard enumerates sharing ONE HOP deep, so three multi-type definitions and 26 single-type ones are outside what it can see, and an unresolvable `guards` pointer is silently unchecked. LATENT: no registered check guards any of them today |
| DV-002 | HIGH | "Unreachable by keyword or check" on `#/$defs/verificationFirst` is refuted by construction, using this round's own negative-lookahead pattern and only declared vocabulary; the claim is written into a shipped schema comment |
| DV-003 | MEDIUM | "`result: red` owes nothing at all: no exit code, no counts. Structurally open" is half wrong: the exit-code half is closable inside the vocabulary without closing the declared-open residue |
| DV-004 | LOW | `schemas/report.schema.json` claims the enumeration makes `report-no-findings-statement`'s registration "a checked fact rather than an assertion"; the enumeration skips every check with no `guards`, and the round's own work history says it is asserted by hand |

## What this verification did NOT cover

The reviewer's first check, stated before anything else so it can be checked
first.

- **The COMPANION_TABLE design.** The arbitration records that it is "unreviewed
  by both contracts". It is still unreviewed: I did not audit it either. It is
  the phase's largest design judgement by the implementer's own account and it
  has now passed three contracts untouched.
- **The other seven shipped schemas as CR-002 sites.** I enumerated all ten for
  CR-001's reachability question, but I did NOT enumerate `plan`, `charter`,
  `gate-registry`, `assurance-modes`, `decision-record`, `status-line` or
  `role-model-config` for value-discriminated branches. The round names this as
  its own largest uncovered region and I have not closed it.
- **Whether the classification an author writes is TRUE.** No probe here reaches
  a claim filed under the right kind whose statement is false. That is M3-P7 and
  a reviewer.
- **Schemas outside `schemas/`.** `src/gates/schemas/` was not examined, same
  exclusion the round declares.
- **The token lists themselves.** My DV-002 probe pattern is my own literals and
  its coverage is no better than the round's thirteen; I proved the CONSTRUCTION
  is available, not that any particular token list is sufficient. My own first
  attempt missed a member on capitalisation, which is the residue in miniature.
- **The gate-runner CI arms.** I ran the gates locally under `--mode full` with
  an explicit base, head and phase. I did NOT observe either GitHub Actions arm,
  and under T-009 a local green is evidence only for the configuration that
  produced it. The `push`-event arm on the post-merge `main` head is unobserved
  and remains the orchestrator's duty.
- **`deploy`, `migrations`, `credential-token`.** Conditional gates I did not
  run.
- **Round-1's findings that round 1 itself closed.** I verified the DELTA
  `a3ea489..2ed019b`. Anything closed before `a3ea489` was checked by the two
  clean-room contracts and the arbitration, not by me.
- **Non-schema consumers of `checksFor`.** Same gap the round declares; I did not
  audit whether a gate script reaches the registry by another path.

## The gates, run by me, with the RUNNER's exit code

Run in this worktree, which is on the REAL branch name
`claude/m3-p4-report-and-work-history` (not detached, so no false
not-applicable), `--mode full --base c7a7ce9 --head HEAD --phase m3-p4`.
Toolchain node v22.22.2, `dist/` built, `git status` clean apart from this
untracked report.

| gate | runner exit | verdict | units |
|---|---|---|---|
| `scope` | 0 | green | 18 changed paths audited against `delivery/plan/phase-declarations/m3-p4.json` at merge base c7a7ce9 |
| `clause-map` | 0 | green | 27 rows checked, 47 pending a phase not yet in force |
| `red-witness` | 0 | green | |
| `coverage` | 0 | green | |
| `manifest-self-check` | 0 | green | |
| `credential-scrub` | 0 | green | |
| `agent-rules-drift` | 0 | green | |
| `citations` | 21 | **not-applicable**, and correctly so | 0 |

Scope at 18 paths and clause-map at 27 rows reproduce the orchestrator's
measurement exactly.

**The `citations` not-applicable is TRUE, not the false one the contract warns
about, and I checked rather than assumed.** The runner's own detail says why:

    no changed path under the configured documents globs (18 changed path(s)
    total). The diff-touches precondition is a path prefix and the documents
    config is a glob set, so a changed path under a configured tree that is not
    a configured document reaches here with the precondition met

The precondition fires because `delivery/requirements/clause-map.json` changed;
the gate then finds nothing to resolve because that file is not a `.md` document
and `delivery/work-history/` is deliberately outside the `documents` globs
(src/gates/citations.ts:185). Exit 21 is "no applicable gate", not a failure.

**A method note against my own first pass:** my first gate sweep piped the runner
into `tail` and read `$?`, so I recorded `exit=0` for a run whose real exit was
21. Every number in the table above is the runner's own exit, captured before any
pipe.

## The work history's citations, resolved by me because the gate does not

`delivery/work-history/` is outside the `documents` globs, so nothing checks
these. All twenty `path:line` citations in the round-2 section (work-history
lines 1072 onward) resolve at head, and I read the target line of each rather
than only asserting the file is long enough. Representative:

    wh:1123  src/checks.ts:1653          -> export const GATE_RESULT_SITES: readonly ...
    wh:1241  src/validate.ts:111         -> export const AUTHORING_VOCABULARY: readonly string[] = [
    wh:1558  src/gates/suite.ts:350      -> "identity: pass + fail + skipped + todo + did-not-run == reported";
    wh:1567  src/checks.ts:1637          -> const PARITY_BUCKETS = ["passed", "failed", "skipped", "todo", "did-not-run"] as const;
    wh:2151  test/report-contract.test.ts:1200 -> test("every derived check that guards a shared definition ...

The five CR-1520 rows and the two `src/witness/run.ts` rows resolve likewise. No
born-stale citation found in the round-2 section, which is the failure round 1
recorded and round 2 was specifically told to avoid.

## Both ASCII checks, over the authored set

Exemptions scoped BY PATH, not by judgement: `git ls-files` minus
`delivery/intake/orchestrated-delivery-process.md` and
`test/fixtures/json-schema-test-suite/`. 503 paths.

    $ xargs -a authored.txt grep -raP '[^\x00-\x7F]'                  -> exit 123 (no match)
    $ xargs -a authored.txt grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]'  -> exit 123 (no match)

Both clean, with the load-bearing `-a`. And `git diff --stat a3ea489 2ed019b`
reports no `Bin` file, so every file in the delta has a reviewable diff.

## The FOURTH CR-002 site, the one the round CLOSED rather than recorded

The round closed a fourth site inside the construct the finding named: an
impossibility DOWNGRADED to `kind: universal`, which settles by a
counter-experiment (a SENTENCE) instead of an executed construction. Verified
with two members and two controls:

| `kind: universal`, `settled-by: counter-experiment` | result |
|---|---|
| `This arm cannot be forced here.` | INVALID #/claims/0; `counter-experiment property ... is not permitted here`; `executed-construction required property ... is missing`. exit 1 |
| `There is no way to reach the second branch.` | same three lines, exit 1 |
| `The lease is never held by two holders at once.` (control, a real universal) | exit 0 |
| `Every gate result carries its wrapper exit code.` (control) | exit 0 |

The diagnostic names the settlement form the kind actually owes, so the branch is
selected by `kind` and not by the author, which is the round's own claim about
`$defs/settledBy` and it holds. The control is the round's own example sentence
and it stays cheap, so the seven impossibility tokens were not smuggled into the
universal list. This is a structurally different member from the `open-question`
escape (total escape versus downgrade), so CR-002's class has two witnessed
members and not one shape twice.

## Registry hygiene: verified, not taken on trust

    behaviors at a3ea489: 541 ; at 2ed019b: 552 ; delta: 11

Eleven appended by name, matching the round's claim, and no assertion of the
banned shape was added: the diff of the two changed test files contains no added
`assert.*(....length)` over an append-only registry. The convention-5 rule
(assert BY NAME, never BY COUNT) is respected by this delta.

## The suite, on all three axes, and a fourth axis I created myself

Toolchain node v22.22.2 via `/opt/node22/bin`, checked with `node --version` in
the shell that ran each command. `npm run build` exit 0 and `git status` clean
after it, so `dist/` is present for every run below.

| toolchain | build state | invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|---|---|
| node v22.22.2 | `dist/` built | `npm test` (RUN A, serial) | 546 | 544 | 0 | **2** | 0 |
| node v22.22.2 | `dist/` built | `suite` gate via the runner | 546 | 544 | 0 | **2** | gate green, runner exit 0 |
| node v22.22.2 | `dist/` built | bare `node --test` (RUN C, serial) | 548 | 546 | 0 | **2** | 0 |

**This CONFIRMS the round's `npm test` figure exactly: 546 / 544 / 2.** The two
skips are named rather than counted, from the run's own output:

    ok 136 - doctor in a healthy fleet exits 0 # SKIP local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)
    ok 140 - doctor with gh absent exits 0 under the generic profile # SKIP local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)

Two, and both floor-gated, which is warning 12's documented signature for node 22
with `dist/` built. The nine dist-dependent skips are absent because `dist/` is
built.

The suite GATE reports the same 546 through its own event protocol
(`suite green via tiphys-suite-events-v1 (child node v22.22.2): reported 546
test(s) from 32 file(s) (pass 544, fail 0, skipped 2, todo 0, did-not-run 0)`),
so the gate and `npm test` agree at this head, and the gate additionally
resolves 552 behaviors.

`red-witness` green at 31 witnesses evaluated.

### The fourth axis, and it is MINE not the round's: CONCURRENCY

I produced two suite runs with failures in them and NEITHER is evidence about
this head. Recording both, because a count of failures cannot see this and
because the second one found something worth knowing.

**Contaminated run 1.** I left a detached `npm test` running and started a second
into the same output file. The file holds two interleaved TAP streams, one
summary saying `pass 544 fail 0` and another `pass 543 fail 1`, with a
half-written line (`ition`) where the two writers collided. There is no `not ok`
line in it at all, so the failing test cannot even be named. Discarded, re-run
serially as RUN A.

**Contaminated run 2, which is more interesting.** My bare `node --test` overlapped
the `suite` gate's own child suite, and two tests failed with a NAMED cause:

    not ok 205 - manifest-self-check reports one unit per schema document
      error: manifest-self-check: red (8 schema documents validated)
        .../src/gates/schemas/zz-fixture-temp.schema.json: unsupported schema keyword maxLength at #
        1 !== 0
    not ok 206 - manifest-self-check picks up a schema document dropped into the directory after the fact

Test 206 writes `zz-fixture-temp.schema.json` into the REAL TRACKED directory
`src/gates/schemas/` (test/gates.test.ts:2423) and test 205 enumerates that same
real directory (test/gates.test.ts:2366). Within one process they are ordered;
across two concurrent suite processes over ONE working tree they are not.

**This is NOT a defect in this delta and I checked rather than assumed:**
`test/gates.test.ts` is not among the ten files the delta touches, and its last
two commits are `9bb379b` (M2-P9) and `e1390f3` (M2-P1). It is a pre-existing
property that my concurrency exposed. It is worth the orchestrator's attention
anyway, because "run the suite gate and a suite at the same time" is an ordinary
thing to do and the result is two red tests that point at neither cause. No
leftover file remains: `git status` is clean apart from this untracked report and
`src/gates/schemas/` holds its eight shipped documents.

The lesson I am taking from my own two contaminated runs is the one this
repository already wrote down and I still had to relearn: a suite number is
scoped to the run that produced it, and I now add a fourth thing to name beside
toolchain, build state and invocation, which is **whether anything else was
running against the same tree**.

## Environmental probes, both attempts recorded

The brief names two transients seen three times each in this container. Measured
in this session:

    $ git fetch -q origin main   -> attempt 1 exit 0
    $ git fetch -q origin main   -> attempt 2 exit 0
    $ git commit (in a fresh scratch repo, commit.gpgsign=true globally)
                                 -> attempt 1 exit 0

Neither reproduced. `commit.gpgsign` is `true` in both the local and the global
config, so the signing path WAS exercised and the signing server answered. The
round's own record of four bare-run failures under `signing server returned
status 520` is therefore an accurate report of a transient that was live during
its run and is not live during mine; I can neither confirm nor refute its
specific captures, and I am not treating a green here as evidence against them.
No transient is reported as a defect and no green is reported as an error.

## Did the round fix the MECHANISM or the INSTANCE?

The contract's single question. **The mechanism, in every case, and with room to
spare in two of them.**

The evidence for that, rather than the assertion:

- CR-001's fix is a SITE TABLE (`GATE_RESULT_SITES`), not an added string, and it
  closes the half of the mechanism the finding did not name (the per-type KEY).
  The round then wrote a registered enumeration so the relation is measured on
  every future phase rather than trusted.
- CR-002's derivation found THREE sites the finding never named and CLOSED A
  FOURTH inside the named construct, which the reviewer had raised separately as
  LIE-03c. Both closures travel through the `$ref` into the work history with no
  registration, which is CR-001's mechanism used deliberately rather than tripped
  over.
- CR-003 was fixed as a KEYWORD rather than as the "three lines inside the check"
  the reviewer proposed, explicitly so that the fix would travel through the
  `$ref`. Choosing the check would have re-created CR-001's mechanism in the act
  of fixing CR-003. That is mechanism-level reasoning applied against the
  reviewer's own suggestion, and it is right.
- CR-005 was fixed as per-letter character classes rather than five more
  literals, which also reaches `AlWaYs`, a member no widening by literals would
  have caught.
- CR-1520 was fixed by WRITING the five missing arms rather than by relabelling
  the column, with the rejected alternative recorded.

Against that, the two new findings above are both of the same family and both are
the round's OWN mechanism applied one level further out than the round applied
it: DV-001 is CR-001's shape inside CR-001's guard, and DV-002 is CR-002's remedy
not applied at a site CR-002's own derivation found. Neither is a regression and
neither is a fix at the instance. They are the next hop.

## Verdict

| | |
|---|---|
| Findings claimed closed | eleven, counting the two plan changes |
| CLOSED, verified by construction | ten |
| NOT FIXED, correctly handed back | one (CR-007) |
| Regressions found in the delta | none |
| New findings | four: one HIGH, two MEDIUM, one LOW |

I would not block a merge on DV-001, DV-003 or DV-004. **DV-002 is a HIGH and it
is a HIGH because of where it is written**, not because of what it costs at run
time: an impossibility claim that is false by construction sits in a SHIPPED
schema `$comment` and in the round's converse table, and the next author to look
at `verificationFirst` will read it as settled. The cheapest correction is
textual: restate the three sites in the hedged form the round already used in its
own claim-grep section, and delete the sentence "each compares a document to
something that is not in any document" for the `verificationFirst` row, where it
is false. Whether to ALSO take the narrowing is a contract question and belongs
with the orchestrator, not with me and not with the implementer.

## The three-axis suite record: CONFIRMED, both numbers

The round reports `npm test` 546 / 544 / **2 skipped** and bare `node --test`
548 / 546 / **2 skipped**. Both reproduce exactly, each on a run with nothing
else touching the tree:

    RUN A  npm test              exit 0   # tests 546  # pass 544  # fail 0  # skipped 2  # todo 0
    RUN C  bare node --test      exit 0   # tests 548  # pass 546  # fail 0  # skipped 2  # todo 0
           (0 lines matching '^not ok' in RUN C)

**CONFIRMED, not contradicted.** The two-test difference is
`sandbox/test/greet.test.js`, a tracked fixture at the repository root that
`package.json`'s test script (`node --test "test/**/*.test.ts"`) excludes by its
glob and that a bare invocation from the root picks up. The two skips are the same
two floor-gated `doctor` tests on both axes.

A note on how I nearly misread my own result: the shell wrapper around RUN C
reported "failed with exit code 1", because the last command in the chain was
`grep -c '^not ok'`, which exits 1 when it counts zero. The SUITE exited 0. Read
the text, not the exit code, and that rule applies to the harness around the
measurement as much as to the measurement.

## The claim grep, run over THIS report

    $ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' \
        delivery/review/verification-m3-p4-fix-round.md

Every hit falls into one of four classes, and the two that are load-bearing
claims are settled here with the command that settles them.

**Class 1, QUOTED TEST SUBJECTS.** The sentences `This arm cannot be forced
here.`, `There is no way to reach this branch from the CLI.`, `It is impossible
to construct a document that reaches it.`, `The lease is never held by two
holders at once.` and the ALL-CAPS token lists are the DATA under test. They are
not assertions by me. This report is dense with these tokens because they are the
round's subject matter, which is a reason to read each hit rather than to skip
the grep.

**Class 2, QUOTATIONS OF THE ROUND OR OF CLAUDE.md.** "it cannot be closed here",
"not closable there", "assert BY NAME, never BY COUNT" and the grep's own token
list are quoted so they can be examined; they are the round's claims and the
repository's rule, attributed in place.

**Class 3, CAPTURED OUTPUT.** The `MATCH`/`nomatch` table, the
`git ls-files ... grep` output naming `assurance-modes.yaml:56:NEVER`, and the
skip lines are program output, reproduced.

**Class 4, MY OWN CLAIMS. Two of them, both settled:**

- **"a definition reached through a chain never becomes a key, so the
  hole-finding loop never examines it"** (DV-001). SETTLED by execution, not by
  reading. `src/checks.ts` mutated under a `trap`, md5 identical before and
  after (`4f1c9939d17d98d466b72de565842fb2`), one probe check per run:

      guards report.schema.json#/$defs/claim                     -> not ok 1  (control: the loop DOES work at one hop)
      guards report.schema.json#/$defs/settledBy                 -> ok 1      (green: not examined)
      guards report.schema.json#/$defs/settledByCounterExperiment -> ok 1      (green: not examined)
      guards report.schema.json#/$defs/thisDefinitionDoesNotExist -> ok 1      (green: not examined)
      no probe at all                                            -> ok 1      (control)

  The one-hop control failing is what makes the three greens mean "not examined"
  rather than "nothing was wrong".

- **"`findings` and `no-findings-statement` are top-level PROPERTIES, never
  `$defs`, so they cannot appear in `users`"** (DV-004). SETTLED by the
  enumeration's own output: `users` is built only from `$ref` string VALUES
  (test/report-contract.test.ts:1170 collects `key === "$ref"`), and the full
  printed key set at this head is exactly three pointers, all
  `report.schema.json#/$defs/...`. No property name appears in it, and none can,
  because a property name is never the value of a `$ref`. Restated as the
  narrower true sentence: nothing in `users` is a property name, therefore the
  loop over `users` never reaches `report-no-findings-statement`, which is
  independently confirmed by that check declaring no `guards` at all
  (src/checks.ts has exactly one `guards:` line, naming `gateResult`).

**One hit I am restating rather than settling**, because it is an impossibility
claim of my own and I will not make the mistake I am reporting: I wrote that I
"did not find a way" to close the `enumerableSection` site and that I am "not
saying it cannot be closed". That is the honest form and it stays in that form.
I ran no exhaustive search over the sixteen keywords; I looked for a prose field
to anchor a pattern on, found none, and stopped. Someone else may find one.

## Beacon and provenance

Written incrementally from the first minutes into
`delivery/review/verification-m3-p4-fix-round.md` in the worktree at
`<scratch>/dv-m3p4`, HEAD `2ed019b`, branch
`claude/m3-p4-report-and-work-history`, working tree clean throughout apart from
this untracked file. The first 40 lines are the previous verifier's salvaged
partial, unedited; everything from "Resumption note" onward is mine. Every
source file mutated for a probe was copied pristine first, restored by `cp`
inside a `trap`, and its md5 printed and COMPARED after restoration; all three
compared identical. No `git checkout --` was used at any point. Both ASCII checks
pass over this file and all 24 of its `path:line` citations resolve at head.
