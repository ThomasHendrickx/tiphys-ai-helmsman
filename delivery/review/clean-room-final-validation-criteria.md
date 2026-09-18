# Clean-room final sweep, validation group, CRITERIA contract

- head reviewed: `ad2428b76ef6f53f75b0d7f94c7db50463e077b7`
- group: validation (`src/checks.ts`, `src/validate.ts`, `schemas/**`, `src/gates/schemas/**`)
- review-contract: `criteria`; framing: `criteria-contract`
- produced-by: Claude Opus 5 (claude-opus-5), Anthropic Claude family
- phase field in the JSON verdict: `M3-P1` (assigned; this review covers M3-P1,
  M3-P2, M3-P8, M4-P10, M4-P13, M4-P14 and M4-P30, and that deviation from the
  one-head-one-phase shape is declared here rather than discovered)
- verdict: **FIX-ROUND-NEEDED**

## 0. How this review was run

Read-only clone of `/home/user/tiphys-ai-helmsman` at
`/tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-validation-criteria/clone`,
detached at the head above. Nothing was committed or pushed. Every fixture was
built under `/tmp/claude-0/final-sweep/`.

### The suite, as a complete sentence

Interpreter `/tmp/claude-0/n26/bin/node`, **v26.6.0**. Build state: `npm ci`
then `npm run build` both exit 0 and `git status --porcelain` is EMPTY
afterwards, so `dist/` is present. Invocation: `npm test`
(`node --test "test/**/*.test.ts"`), run from the clone above.

```
i tests 1341
i suites 0
i pass 1341
i fail 0
i cancelled 0
i skipped 0
i todo 0
EXIT=0
```

Transliteration note, per the repository's declared resolution: the Node test
reporter's summary glyph U+2139 is rendered `i` above, 7 occurrences. Nothing
else in any captured output in this document was altered. No U+2716 appears
because the final run had no failing test.

**The FIRST run of that same command, at the same head and on the same
toolchain, exited 1, and the cause is environmental, not a branch defect.** It
failed at `test/gates.test.ts:3571` with
`spawnSync node EACCES`. `namei -m /tmp/claude-0/n26/bin/node` showed
`drwx------ claude-0`: the unprivileged uid that
`runCliUnprivileged` (test/gates.test.ts:3530) drops to cannot traverse into
`/tmp/claude-0`, and the gate runner's precondition command is a bare `node`
resolved off my PATH, which points into that directory. This is CLAUDE.md
standing warning 1's scratch-prefix trap, one level in (the interpreter reached
by PATH inside a spawned gate, not `process.execPath`). Re-run alone, the same
test passes:

```
$ node --test --test-name-pattern 'a precondition command exiting nonzero is error, not a skip' test/gates.test.ts
ok ... (1599.350766ms)
i tests 1  i pass 1  i fail 0  i skipped 0
```

and `grantTraversalWhenUnderTmp` had by then left `/tmp/claude-0` at
`drwxr-xr-x`, after which the full suite is 1341/1341. Stated rather than
quietly dropped: a reviewer running from a clone outside `/tmp` would not see
the first failure at all.

## 1. Findings

Severities follow DR-0027: reachability, not the label, is the test. Every
finding below was REPRODUCED against a real staged repository with the shipped
scripts; none is reasoned-only.

### CR-VS-001 (HIGH): `check-dual-review` reports GREEN using verdicts for a head that is not the head under test and need not exist

**Shipped behaviour at risk:** the merge-authority gate. DR-0012 condition 1 is
"two independent clean-room reviews **of the same head**", and M4-P10 exists to
discharge its head clause.

`check-dual-review` takes no head. Its registry entry is
`command: [node, scripts/check-dual-review.mjs, .]` with
`parameters:` absent (gate-registry.yaml, the `check-dual-review` block). The
derived check groups by `(phase, head)` where `head` is read from the verdict
documents themselves (src/checks.ts:3884 `headGroupFor`); nothing compares that
value to the commit the gate is running against, and nothing checks that it
resolves to a commit at all. `src/gates/merge-preconditions.ts:113` shows the
contrasting design: that gate DOES take `--head` and its precondition is "a
committed verdict names this head".

Reproduced. A staged repository whose HEAD is `a308efe294ec...`, carrying two
decorrelated APPROVE verdicts that name head `deadbeef...` (a sha
`git cat-file -t` reports as not an object), with a second commit of entirely
unreviewed work on top:

```
repo HEAD: a308efe294ec8d55ea832243e53aad3eff31312d
verdict head: deadbeefdeadbeefdeadbeefdeadbeefdeadbeef (exists in repo? fatal: git cat-file: could not get object info)
$ node scripts/check-dual-review.mjs --precondition <dir>   # exit 0
$ node scripts/check-dual-review.mjs <dir>
REPORT dual-review-decorrelation 2 verdict(s) for phase M4-P10 at head deadbeef... are distinct on produced-by, framing, review-contract
REPORT verdict-pair-approves 2 verdict(s) for phase M4-P10 at head deadbeef... read APPROVE and carry no finding at medium, high, critical
check-dual-review: green (2 review verdicts examined for decorrelation)
GATE=0
```

The consequence in this repository, and it is imminent rather than theoretical:
the moment an approving verdict pair lands in `delivery/review/` (which T-040
says is the next step, and which this sweep will produce), `check-dual-review`
goes green and STAYS green for every later pull request at every later head,
forever, on evidence about one old commit. A reviewer reading the bundle sees
`check-dual-review: green` and `merge-preconditions: not-applicable` and
concludes condition 1 is machine-checked for this head. It is not. This is
T-009's own mechanism ("a gate result is evidence only for the configuration it
ran under") inside the gate built to carry the merge grant.

Mitigation that exists: `merge-preconditions` is head-anchored. It does not
close this, because it is `applicability: conditional` and reports
not-applicable when no verdict names the head, so the pair "green + not
applicable" is exactly the state a stale corpus produces.

**Concrete fix:** give `check-dual-review` a `--head <sha>` argument, declare
`parameters: [head]` on its registry entry beside `modes`/`events`, select the
group by that head rather than by whatever the documents say, and report
not-applicable WITH A REASON (never green) when no committed verdict names it.
Additionally refuse a declared head that `git cat-file -t <head>` does not
report as `commit` in the context repository; the loader already runs git there.

### CR-VS-002 (MEDIUM): the pair corpus is read one level deep and the falsifier corpus is read recursively, so a REFUSING verdict one directory down is silently dropped

**Shipped behaviour at risk:** the same merge gate, in the fail-open direction.

Two calls, one function, different depth:

- src/checks.ts:3151 `listCommittedTree(contextDirectory, refSha, REVIEW_DIRECTORY, false)` -- the PAIR's corpus, NON-recursive.
- src/checks.ts:3191 `listCommittedTree(contextDirectory, refSha, PAPERWORK_ROOT, true)` -- the single-family falsifiers' corpus, recursive over all of `delivery/`.

So one committed document can be simultaneously inside the corpus that can
contradict a single-family declaration and outside the corpus that can refuse a
merge. The worktree arm (src/checks.ts:3517, `readdirSync`) is also one level,
so the two arms agree with each other and both disagree with the falsifier
corpus.

Reproduced, and the fail direction is the dangerous one. Two APPROVE verdicts at
top level plus a committed THIRD verdict for the same phase and the same head
reading `FIX-ROUND-NEEDED`, placed at `delivery/review/sub/`:

```
$ git ls-files delivery/review
delivery/review/sub/verdict-refusing.yaml
delivery/review/verdict-criteria.yaml
delivery/review/verdict-hazard.yaml
$ node scripts/check-dual-review.mjs <dir>
check-dual-review: 1 registered check(s) named dual-review-decorrelation ran over 2 verdict(s)
check-dual-review: green (2 review verdicts examined for decorrelation)
exit=0
```

A committed review refusing that exact head is not reported as unexaminable, not
counted, not mentioned. `ls-tree` without `-r` yields the sub-tree's NAME, which
`VERDICT_FILE_PATTERN` (`/\.(ya?ml|json)$/i`, src/checks.ts:3030) discards, so
the drop is silent by construction. The check's own comments insist at length
that "a sibling that cannot be keyed must not shrink the set the delegated grant
is read off" (src/checks.ts:3884 onward); a sibling that is never LISTED shrinks
it with no message at all.

Second, cheaper arm of the same defect, also reproduced: with BOTH verdicts in a
per-phase subdirectory, which is the obvious layout and the one this
repository already uses for `delivery/review/evidence/`, the gate reports

```
check-dual-review: 0 verdict document(s) (corpus: delivery/review read from commit 814c80b...)
check-dual-review: not-applicable (0 review verdicts examined for decorrelation)
GATE=20
```

and the operator is told there is nothing to compare while two verdicts sit
committed under the named directory.

**And the shipped script's own comment asserts the opposite of the behaviour.**
scripts/check-dual-review.mjs says the loader "reads every candidate blob of the
whole subtree out of the commit when there is one". It does not. An operator
reading that comment would file verdicts in subdirectories believing they count.

**Concrete fix:** pass `true` at src/checks.ts:3151 so the pair corpus reads the
same depth as the falsifier corpus, and correct the sentence in
scripts/check-dual-review.mjs. If one level is the intended contract instead,
then the non-applicable reason must say so ("read non-recursively") and any
`.yaml`/`.json` blob found deeper under `delivery/review/` must be carried out
as `unexaminable`, so a dropped refusal is visible rather than silent.

### CR-VS-003 (MEDIUM): the decorrelation dimension `produced-by` is a whole-string comparison, so two models of ONE family pass, and the deferral chain that was supposed to close it terminates with no owner

**Shipped behaviour at risk:** DR-0012 condition 1's cross-family requirement,
which is what T-001 exists for.

Reproduced at this head:

```
produced-by: "Claude Opus 5 (claude-opus-5), Anthropic"
produced-by: "Claude Sonnet 5 (claude-sonnet-5), Anthropic"
$ node scripts/check-dual-review.mjs <dir>
REPORT dual-review-decorrelation 2 verdict(s) ... are distinct on produced-by, framing, review-contract
check-dual-review: green (2 review verdicts examined for decorrelation)
exit=0
```

Two reviews from the same model family are certified decorrelated. The
comparison is `canonicalScalar` (src/checks.ts:3675): NFKC, whitespace collapse,
lowercase, then `!==`. There is no family vocabulary anywhere in `src/`
(`grep -n 'canonicaliseFamily\|familyOf\|canonicalFamily' src/checks.ts` returns
nothing).

**What makes this a COMPOSITION finding rather than a restatement of a known
gap.** M4-P10's work history states the gap and assigns it:
delivery/work-history/m4-p10.md:654 says "`produced-by` is still a STRING
comparison, not a family one ... Closing the first is M4-P11's declared scope".
M4-P11 did not close it and says so in its own words: a closed enum of family
names "was rejected: no such vocabulary can be kept current"
(delivery/work-history/m4-p11.md:142). M4-P11 shipped the single-family
EXCEPTION, which is a different question. No later phase picked the deferral up.
So a criterion-era promise was discharged to a phase that declined the
mechanism, and at the final state nobody owns it. Only a sweep over all thirty
phases can see that.

It also runs the other way, and is worth one sentence: falsifier 1 of the
single-family exception counts "two or more distinct canonicalised `produced-by`
values" as two families, so a genuinely single-family project that names two of
its own models is refused the exception it is entitled to.

**Concrete fix:** either (a) add an explicit family field to
`schemas/verdict.schema.json` and compare THAT (`produced-by` stays the free
string), or (b) if no vocabulary can be maintained, say so in the gate's own
green line: change the REPORT to "distinct on the `produced-by` STRING, which is
not a family comparison", so a bundle-level green cannot be read as a
cross-family assertion. Silence here is what makes the green misleading.

### CR-VS-004 (LOW): `MESSAGE_BY_KEYWORD` is dead code that three comments describe as load-bearing, and its contents contradict `AUTHORING_VOCABULARY` in both directions

src/validate.ts:321 declares `const MESSAGE_BY_KEYWORD = new Set<string>([...])`
and nothing ever reads it:

```
$ grep -rn 'MESSAGE_BY_KEYWORD' --include=*.ts --include=*.mjs . | grep -v node_modules | grep -v '^./dist'
./src/validate.ts:27   (comment)
./src/validate.ts:109  (comment)
./src/validate.ts:321  (the declaration)
```

The module header at src/validate.ts:27 says a keyword reaching `renderAjvError`
"without an entry in `MESSAGE_BY_KEYWORD` is a Tiphys DEFECT and is reported as
one". The refusal is real, but it is the `default:` arm of the switch at
src/validate.ts:489, not this set. src/validate.ts:109 says every vocabulary
entry "therefore also has an entry in `MESSAGE_BY_KEYWORD`", and that sentence
is false in both directions today: `$ref`, `items`, `properties` and `then` are
in `AUTHORING_VOCABULARY` and absent from the set; `minimum`, `maximum` and
`maxItems` are in the set and absent from the vocabulary. Nothing asserts the
relation, because the set is unreferenced.

The BEHAVIOUR is correctly guarded elsewhere and I verified it, so this is LOW
rather than MEDIUM: `test/schemas.test.ts:265` derives its coverage from
`AUTHORING_VOCABULARY` and exercises the real renderer, and a keyword outside
the vocabulary produces the defect line rather than Ajv wording:

```
$ multipleOf probe -> ["INVALID # internal defect: no Tiphys diagnostic is defined for schema keyword multipleOf"]
```

**Concrete fix:** delete `MESSAGE_BY_KEYWORD` and the two comments that cite it,
OR make it load-bearing by deriving the switch's covered set from it and adding a
test that `AUTHORING_VOCABULARY` is a subset. Leaving a dead set that the file's
own documentation calls the contract is how the next reader edits the wrong
thing.

### CR-VS-005 (LOW): two of the four `addressed-by` arms resolve nothing, and section 2.6's own "this is not a loophole" rests on a check the kernel does not ship

`schemas/plan.schema.json` admits four shapes for a hazard class's
`addressed-by`:
`^(criterion .+|judgment-property-of-prose: .+|state-not-entered: .+|later-phase: M[0-9]+-P[0-9]+)$`.
`plan-hazard-classes-addressed-by-resolves` (src/checks.ts:233) resolves the
first and the last only. Measured, all four against `templates/plan.example.yaml`:

```
addressed-by: "criterion 99"                          -> exit 1, named
addressed-by: "later-phase: M9-P99"                   -> exit 1, named
addressed-by: "state-not-entered: M999"               -> exit 0
addressed-by: "judgment-property-of-prose: no-such-probe" -> exit 0
```

M3-P1 criterion 5f asks for exactly two members (a criterion id and a phase id)
and both hold, so this is NOT a criterion failure. It is a residue: kernel plan
M3 section 2.6 reason 1 argues the prose escape "is not a loophole, because the
probe id is itself checkable", and nothing in `src/` checks it. A downstream
project can discharge every hazard class with
`judgment-property-of-prose: anything` at exit 0, which is the
documented-an-obligation-instead-of-creating-one shape the check exists against,
surviving in two of its four arms. The shipped `templates/plan.example.yaml`
itself carries `state-not-entered: M10` where the plan declares only `M9-P1`.

**Concrete fix:** resolve `judgment-property-of-prose: <id>` against the
checklist's `probes[].id` (the machinery exists: `gate-probes-resolve`,
src/checks.ts:2074), and either resolve `state-not-entered:` against a declared
milestone list or state in the schema `$comment` that these two arms are
unresolvable by design, so the plan's "it is checkable" sentence is not left
standing against code that does not check it.

### CR-VS-006 (LOW): an operator-facing sentence is ungrammatical because it is fed the wrong describer

scripts/check-dual-review.mjs:541 builds
`` `no verdict document is ${describeVerdictCorpusSource(run.source)}, ...` ``.
`describeVerdictCorpusSource` (src/checks.ts:3074) returns a PARENTHETICAL
(`(corpus: ... read from commit ...)`), while its sibling
`describeContextDocumentSource` (src/checks.ts:3090) returns the phrase form
(`in commit ...`) the sentence was written for. Observed verbatim at this head
against the repository itself:

```
no verdict document is (corpus: delivery/review read from commit ad2428b7..., resolved from HEAD), so there is no pair of reviews to compare
```

**Concrete fix:** use `describeContextDocumentSource`, or reword to
`no verdict document was found ${describeVerdictCorpusSource(...)}`.

## 2. The criterion walk

"RAN" means a command executed at this head in this clone. "READ" means source
or artifact inspection with a citation. Anything I could not reach is reported
as not reached with the reason.

### 2.1 M3-P1 (schemas, validator, plan/charter/decision/status-line contracts)

Plan section: delivery/plan/kernel-plan-m3.md:1405, criteria at
delivery/plan/kernel-plan-m3.md:1781.

| # | criterion (abridged) | met now? | what I ran or read |
|---|---|---|---|
| 1 | `npm ci`, `npm run build` exit 0, `git status --porcelain` empty, `npm test` exits 0 with zero failing | **MET** | section 0. `git status --porcelain` empty after build; 1341 pass, 0 fail, 0 skipped, exit 0 |
| 2 | `validate --type plan/charter/decision-record` and `--type auto` exit 0 on the templates | **MET** | RAN all six: `plan typed exit=0 / auto exit=0`, same for `charter` and `decision-record` |
| 3 | four Kind A dangerous instances rejected naming the pointer | **MET** | RAN. (a) `INVALID #/phases/0/acceptance array has 0 items...` (b) `INVALID #/escalation-contract required property escalation-contract is missing` (c) `INVALID #/decided value "" is shorter than the required minimum length 1` (d) `INVALID #/run required property run is missing`; all exit 1 |
| 4 | each of the four accepted when its guarding keyword is removed, rejected when restored | **NOT REACHED at this head** | the witness is a schema mutation the phase captured and reverted; I did not re-mutate `schemas/` in a read-only review. The forward half of each pair is RAN above. Reason recorded rather than claimed |
| 4b | `plan-verification-first-present` names its check; `plan-dispatchable` both directions | **PARTIAL, MET for `plan-dispatchable`** | RAN: `dispatchable: false` / `not dispatchable because these phases carry an unfilled fill-in: M9-P1` printed on the shipped template; the deregistration half is a Kind B mutation I did not perform |
| 4c | a cross-document check with no `--context` prints `SKIPPED <id> no context` and exits nonzero; with `--context` exits 0 | **MET** | RAN on `tuition/T-001.yaml`: `SKIPPED mechanism-rule-evidence-resolves no context` / `SKIPPED tuition-target-exists no context`, exit 1; with `--context .` exit 0 |
| 5 | one misspelled property rejected, at the TOP level and at a nested level >= 2 deep | **MET, both members** | RAN. top: `INVALID #/statusx property statusx is not permitted here`; nested: `INVALID #/phases/0/fill-inn property fill-inn is not permitted here` |
| 5b | charter `release-verification` reservation, all directions | **MET** | RAN all four: absent -> `INVALID #/release-verification required property release-verification is missing`; `{mode: none}` -> `INVALID #/release-verification/reason required property reason is missing`; `{mode: none, reason}` -> exit 0; `{mode: vercel, endpoint}` -> `INVALID #/release-verification/mode value "vercel" is not one of the permitted values "none", "reserved"` |
| 5c | `stop-for[]` default entry shipped in the charter template | **MET (presence only, as the criterion itself says)** | READ `templates/charter.example.yaml`; the criterion labels itself a presence assertion over prose |
| 5d | named-pipe refusal for the file argument AND for `--context`, without blocking | **MET, both** | RAN with a real `mkfifo` under `timeout 20`: `... is a named pipe, not a regular file, so it was not opened` (exit 1) and `... is a named pipe, not a directory, so it was not opened` (exit 1). Neither blocked |
| 5e | `hazard-classes: []` rejected; one entry accepted | **MET** | RAN: `INVALID #/phases/0/hazard-classes array has 0 items, fewer than the required minimum 1` |
| 5f | `addressed-by` resolves, TWO structurally different members | **MET** | RAN. criterion arm: `INVALID .../addressed-by criterion 99 is not an acceptance criterion of phase M9-P1 (check: plan-hazard-classes-addressed-by-resolves)`; phase arm: `deferred to phase M9-P99, which this plan does not contain`. See CR-VS-005 for the two arms the criterion does not cover |
| 6 | `status emit` appends one line and updates `current.json` | **NOT REACHED** | I did not build a fleet home in this read-only clone; the command's subject is outside this group's paths |
| 7 | C-1 witness: `status show` ignores a corrupted stream | **NOT REACHED** | same reason as 6 |
| 8 | `status emit --state progress` exits nonzero naming the enum | **NOT REACHED** | same reason as 6 |
| 9 / 9b | clause-map check, missing row and invented row | **NOT REACHED as a mutation; the forward half RAN** | `node src/gates/coverage.ts` exits 0 with `units 115` (see M4-P13 criterion 1). The deletion/invention arms are mutations of tracked requirement data |
| 10 | `plan project` emits a declaration the real scope auditor accepts | **NOT REACHED** | I did not stage a git repository whose MERGE BASE carries the declaration; the schema half is READ: `src/gates/schemas/phase-declaration.schema.json` is `additionalProperties: false` over exactly `{id, branch, filesToTouch, declaredExtras, citations}` plus M4-P14's optional `gateClasses` |
| 11 | `npm pack` lists `schemas/` and `templates/` and no `delivery/` | **MET** | RAN `npm pack --dry-run --json`: 207 entries, `schemas/` 21, `templates/` 7, `roles/` 7, `tuition/` 17, **`delivery/` 0**. All 8 `src/gates/schemas/*.json` are present as `dist/src/gates/schemas/*` |
| 12 | a throwing subcommand prints one line, exits 1 or 64, no stack frame | **MET, both instances** | RAN. malformed YAML: `tiphys validate: ... is not valid YAML: Unexpected : in flow sequence`, exit 1, `grep -c "    at "` = **0**. Valid YAML that is not a mapping: `INVALID # expected type object but found array`, exit 1, stack frames **0** |
| 13 | `grep -rP '[^\x00-\x7F]'` over touched files reports nothing | **MET** | RAN `node scripts/check-authored-bytes.mjs`, exit 0 |

#### DR-0013's fourteen validator criteria (the block at delivery/plan/kernel-plan-m3.md:1985)

| # | criterion | met now? | evidence |
|---|---|---|---|
| 1 | a valid instance of each shipped schema exits 0 | **MET** | RAN over the five templates plus 15 tuition entries plus `gate-registry.yaml` plus `charter.yaml`, all exit 0 |
| 2 | every vocabulary keyword has a positive AND a negative test | **MET** | READ test/schemas.test.ts:265: the missing set is DERIVED from `AUTHORING_VOCABULARY`, not from a hand list, and each case asserts the exact rejection line through `validateToLines`. Suite green |
| 3 | `oneOf`, `if`/`then`, `contains` each carry a discriminating test | **MET** | READ test/schemas.test.ts (the discrimination test), suite green; and RAN the shipped instances: `if`/`then` fires on `{mode: none}` with no reason, `oneOf` on `{mode: vercel}` |
| 4 | an unknown keyword fails COMPILATION naming the keyword | **MET** | RAN: `INVALID # schema keyword nosuchkeyword is not in this validator's vocabulary` |
| 5 | an invalid schema fails meta-schema validation | **MET** | RAN (`required: "not-an-array"`): `INVALID # schema is not a valid JSON Schema document` + `INVALID #/required expected type array but found string`, with pointers INTO the schema |
| 6 | input is not coerced, defaulted, stripped or mutated | **MET** | RAN: instance deep-unchanged after validation (`c6 mutated: false`); `{n:"5"}` against `type: integer` reports `expected type integer but found string` rather than coercing, and `{"n":"5"}` afterwards |
| 7 | an unresolved local `$ref` and a REMOTE `$ref` each fail closed | **MET, both** | RAN: `schema reference #/$defs/nope does not resolve`; `schema reference https://example.com/x.json is remote, and this validator never loads remote schemas` |
| 8 | `INVALID <pointer> <message>` with stable ordering, no Ajv wording | **MET** | RAN with `required: ["z","a","m"]` on `{}`: output is `#/a`, `#/m`, `#/z` -- document order restored by the final sort, not by Ajv's traversal. An out-of-vocabulary keyword yields `internal defect: no Tiphys diagnostic is defined for schema keyword multipleOf`, which carries no Ajv wording (captured above) |
| 9 | malformed YAML gives one diagnostic and a nonzero exit, no stack trace | **MET** | RAN, see M3-P1 criterion 12 |
| 10 | M2's validation tests re-run UNCHANGED and pass | **NOT REACHED as a diff** | the suite is green at this head; I did not diff `test/` against the M2 merge base, and say so rather than imply it |
| 11 | applicable JSON Schema Test Suite cases pass, with the revision and exclusions recorded | **MET** | `test/schema-suite.test.ts` and `test/fixtures/json-schema-test-suite/**` are present and the suite is green at 1341/1341 |
| 12 | `npm ci`, `npm run build`, `node --test`, `npm pack` all exit 0 | **MET** | section 0 plus `npm pack --dry-run` exit 0 |
| 13 | the packed package contains the shipped schemas | **MET** | the 207-entry listing above; 20 `schemas/*.schema.json` + README, and 8 `dist/src/gates/schemas/*.schema.json` |
| 14 | the production dependency and license inventory names ajv, yaml and transitives | **NOT REACHED** | a work-history obligation of that phase, not a property of this head's code |

#### The `additionalProperties` sweep, which is the criterion-5 property one level up

I walked every object level of all 20 `schemas/*.schema.json` and all 8
`src/gates/schemas/*.schema.json` looking for a level carrying `properties`
without `additionalProperties: false`. 57 levels matched, and **55 of them are
`if`/`then`/`oneOf` applicator subschemas where closing the object would be
actively wrong** (it would forbid the sibling properties). The two real ones are
both DECLARED with a reason in the schema's own `$comment`:

- `schemas/cutover-state.schema.json` root and `$defs/switchRecord`,
  `additionalProperties: true`, because M4-P26's rollback preserves document
  keys it does not own (the `$comment` says so and names test/cutover.test.ts:974);
- `src/gates/schemas/release-record.schema.json` `properties/resolved`, open
  because "everything else is platform vocabulary the adapter may record".

I also probed the composition hazard that closes the object from the other side:
a property declared only inside an `if`/`then`/`oneOf` branch of a closed object
would make that branch unsatisfiable (a keyword present and never reached).
**Zero instances**: every branch-declared and branch-required property is also
declared at its sibling level. That held.

### 2.2 M3-P2 (canonical gate registry)

Plan section: delivery/plan/kernel-plan-m3.md:2050, criteria at
delivery/plan/kernel-plan-m3.md:2196. Only the schema-side criteria are in this
group.

| # | criterion | met now? | evidence |
|---|---|---|---|
| 1 | `validate --type gate-registry gate-registry.yaml` exits 0 | **MET** | RAN, exit 0 |
| 2 | `verified-by: clean-room-checklist` with no `probe` exits 1 naming the entry | **MET** | RAN on a copy with `probe` deleted from `unit-tests-for-changed-service-methods`: `INVALID #/gates/19/probe required property probe is missing`, exit 1. Forward direction (the shipped registry) exits 0 |
| 3 / 3b / 3c | full-mode runner behaviour, M2-C-2 and M2-C-3 surviving the promotion | **NOT REACHED** | these are gate-runner properties, outside this group's paths; partially observed in passing (a required gate with a missing parameter reported `error: gate gate-classes requires --phase, which was not supplied`, which is M2-C-3's shape) |
| 4 | a `deploy` gate with no precondition is rejected by the schema `required` list | **MET** | RAN: `INVALID #/gates/7/precondition required property precondition is missing`, exit 1 |
| 5 / 5b | render-agent-rules drift check and its event arm | **NOT REACHED** | script and workflow behaviour, outside this group |
| 6 | `CLAUDE.md`'s gate section is the rendered block | **READ, holds** | the block is present and the file says a hand edit fails `--check` |

### 2.3 M3-P8 (tuition flow and the mechanism index)

Plan section: delivery/plan/kernel-plan-m3.md:3985, criteria at
delivery/plan/kernel-plan-m3.md:4257.

| # | criterion | met now? | evidence |
|---|---|---|---|
| 1 | `validate --type tuition` on every promoted entry exits 0, and `--type mechanism-index` exits 0 | **MET WITH A DECLARED CORRECTION** | as literally written it is NOT reachable: both types carry context-requiring checks, so without `--context` the command prints `SKIPPED ... no context` and exits 1. RAN with `--context .`: **15 entries, 0 failures**, and `mechanism-index` exit 0. The count relation holds: 15 kernel-relevant entries in `delivery/tuition/`-derived `tuition/`, plus `mechanism-index.yaml` and `README.md` = 17 files, matching CLAUDE.md's measured 17 |
| 2 | Kind A: `kernel-relevant: true` with empty `structural-consequence[]`, and a `mechanisms[]` rule with empty `evidence[]` | **MET, both** | RAN: `INVALID #/structural-consequence array has 0 items, fewer than the required minimum 1`; `INVALID #/mechanisms/0/evidence array has 0 items, fewer than the required minimum 1` |
| 3 | Kind B: `tuition-target-exists` and `mechanism-rule-evidence-resolves` each refuse, carrying `(check: <id>)` | **MET, both** | RAN: `INVALID #/structural-consequence/0/target structural consequence is marked applied and its target src/does-not-exist-anywhere.ts does not exist (check: tuition-target-exists)`; `INVALID #/mechanisms/0/evidence/0 evidence names delivery/verification/there-is-no-such-file.md, which does not exist (check: mechanism-rule-evidence-resolves)`. The deregistration half is a Kind B mutation I did not perform |
| 4 | `tuition index --check` exits 0; drift makes it nonzero | **MET (forward half)** | RAN: exit 0, `15 mechanism(s) projected from 15 entr(ies); the committed index matches` |
| 4b | `destructive-git-operation` carries a resolving `machine-readable-form` | **PARTIAL** | the index validates at exit 0 with the check active, which exercises the field's resolution; the rename arm is a mutation I did not perform |
| 4c | no interim `MECHANISMS.md` row is dropped | **MET via the suite** | `test/fixtures/mechanisms-interim.md` is tracked and the suite is green |
| 4d | `MECHANISMS.md` is gone and no shipped artifact names it | **MET** | RAN: `ls MECHANISMS.md` -> No such file; `grep -rl 'MECHANISMS\.md' roles/ schemas/ tuition/ AGENTS.md` -> no hits |
| 5 | the generated index carries a `claim-file` entry whose evidence resolves | **MET (forward half)** | READ `tuition/T-005.yaml`'s `mechanisms[0]` ("Claim file (mutual exclusion by O_EXCL)") and RAN the index validation at exit 0 with `mechanism-rule-evidence-resolves` active |
| 6 | `brief compose --role implementer` names the index | **NOT REACHED** | brief composition is outside this group's paths |
| 7 | `tuition list --kernel-relevant` exits 0 and prints exactly the true entries; `tuition add` on an invalid entry writes nothing | **MET (first half)** | RAN: exit 0, 15 rows, T-001 .. T-022. The `add` half is a write I did not perform in a read-only review |
| 8 | `doctor` retention check, both directions | **NOT REACHED** | I did not build a fleet home; see M4-P30 |

**One report-text observation, not a finding.** `tuition-target-exists` prints
`REPORT tuition-target-exists 2 applied target(s) resolved` on the same run that
reports one of those two targets as not existing. `resolved` there counts
targets whose TREE is present in this context (src/checks.ts:2582 onward), not
targets that exist. The verdict is still red, so nothing fails open; the word is
overloaded in an operator-facing line.

### 2.4 M4-P10 (the verdict head, the medium escalation, the first non-vacuous dual review)

Plan section: delivery/plan/kernel-plan-m4.md:1619, criteria at
delivery/plan/kernel-plan-m4.md:1691.

| # | criterion | met now? | evidence |
|---|---|---|---|
| 1 | `node --test test/verdict-head.test.ts` exits 0, N > 0 | **MET** | covered by the full suite, 1341/1341, 0 skipped |
| 2 | validate exits 1 naming `head` without one and 0 with one | **MET** | RAN against the two committed pre-M4-P10 verdicts: `INVALID #/head required property head is missing`, exit 1. A `head`-carrying verdict validates at exit 0 (my own fixtures throughout section 1) |
| 3 | two DIFFERENT heads are two groups of one; the SAME head is one group of two | **MET** | RAN. Same head, two verdicts: `2 verdict(s) for phase M4-P10 at head ad2428b7... are distinct on ...`, green. One verdict alone: `INVALID #/phase only 1 verdict document(s) exist ... and a delegated grant requires two independent clean-room reviews of the exact head`, red |
| 4 | APPROVE beside `severity: medium` fails validation naming `verdict` | **MET** | RAN: `INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"` plus the composite `if`/`then` line, exit 1 |
| 5 | a pair with ONE `FIX-ROUND-NEEDED` reddens `verdict-pair-approves` | **MET, and stronger** | RAN. A pair carrying a medium finding: `INVALID #/findings/0/severity ... a delegated grant is not satisfied while a review carries an unresolved finding at medium, high, critical (check: verdict-pair-approves)`, gate red exit 1. A three-verdict group with one refusal also reddens |
| 6 | deregistering `verdict-pair-approves` makes the criterion-5 fixture pass | **NOT REACHED** | a Kind B deregistration I did not perform; `test/verdict-head.test.ts` carries it and the suite is green |
| 7 | `check-dual-review` against this phase's own `delivery/review/` reports GREEN with `units` 2 | **NOT MET at this head** | RAN at `ad2428b7...`: `check-dual-review: not-applicable (0 review verdicts examined for decorrelation)`, exit 20; `git ls-files 'delivery/review/*.json'` -> 10 (all under `delivery/review/evidence/`), `'delivery/review/*.yaml'` -> **0**. delivery/work-history/m4-p10.md:551 declares it NOT DISCHARGEABLE by that phase, honestly and in advance, and T-040 records the state. **Its second stated blocker is now GONE**: a root `charter.yaml` exists at this head, and I demonstrated the criterion's mechanism works by staging two conforming verdicts beside the repository's own `charter.yaml` and `assurance-modes.yaml`: `check-dual-review: green (2 review verdicts examined for decorrelation)` with both verdict values printed. So what remains is that nobody has committed a pair, not that the gate cannot run |

**Composition note on criterion 7, for the orchestrator.** Because the mechanism
now works, committing a verdict pair flips `check-dual-review` from
not-applicable to APPLICABLE on every later pull request. Read together with
CR-VS-001 that is not an improvement by itself: the gate will then be GREEN for
every later head on the strength of this sweep's verdicts. Fix CR-VS-001 in the
same pull request that lands the verdicts, or the first non-vacuous run of this
gate is also its first false one.

### 2.5 M4-P13 (the migration-table re-disposition)

Plan section: delivery/plan/kernel-plan-m4.md:2075, criteria at
delivery/plan/kernel-plan-m4.md:2204.

| # | criterion | met now? | evidence |
|---|---|---|---|
| 1 | `node src/gates/coverage.ts` exits 0 with `units: 115` and the exact detail string | **MET, byte for byte** | RAN. `units: 115`; `detail: 115 inventory id(s) checked; per-kind: decision 6, milestone 98, phase 11; per-milestone: M1 11, M2 16, M3 74, M4 5, M5 3, decision 6` -- identical to the criterion's text |
| 2 | the six pinned assertions replaced by ONE `assert.deepEqual` over `{totalInventoryIds, perKind, perMilestone}` | **MET** | READ test/coverage-gate.test.ts:175-180 (one object literal carrying `totalInventoryIds: 115`); RAN `node --test test/coverage-gate.test.ts`: 21 tests, 21 pass, 0 fail, **0 skipped**, exit 0 |
| 3 | a new test compares Appendix A buckets against the migration table's Milestone cells for all 115 rows, with a declared exemption list | **MET** | RAN; the test is present and green: `a migration-table cell that disagrees with its Appendix A bucket is named, for a row this phase moved and for one it never touched, while the coverage gate stays green under both` |
| 4 | `node scripts/check-authored-bytes.mjs` exits 0 | **MET** | RAN, exit 0 |
| 5 | the `citations` gate green with a nonzero unit count from a COMMITTED head | **MET, with a declared substitution** | RAN with `--base origin/main --head HEAD` the gate is legitimately `not-applicable` (HEAD *is* main, so no delivery document changed) and its precondition is printed and evaluated. RAN with `--base HEAD~1 --head HEAD`: `citations: green: linted 2 changed document(s) at ad2428b7...: 12 citation(s) resolved`, `units: 12`, `vacuous: false`, exit 0. The criterion's own base is not reproducible at the final state and the substitution is named rather than hidden |
| 6 | the disposition table committed with thirteen rows and a reason each | **READ, holds** | delivery/plan/kernel-plan-m4.md carries it |

### 2.6 M4-P14 (the gate class vocabulary)

Plan section: delivery/plan/kernel-plan-m4.md:2239, criteria at
delivery/plan/kernel-plan-m4.md:2318.

| # | criterion | met now? | evidence |
|---|---|---|---|
| 1 | a declaration with no class declaration is RED naming the phase and the missing classes | **MET** | RAN against a copy of the real `m4-p14.json` with `gateClasses` deleted: exit 1, `gate-classes: red (3 declared gate classes checked)`, `phase M4-P14 fails 3 of 3 required gate class(es) ...: correctness: MISSING ...; scope: MISSING ...; review: MISSING ...` |
| 2 | `not-applicable` with no reason is RED and with a reason green; `not-yet-establishable` without an establishing phase is RED and with one green | **MET, both members, four arms** | RAN. absent reason -> `review: not-applicable with no recorded reason; the reason is what makes it data rather than silence`, exit 1. Empty-string reason -> the SAME refusal, exit 1. With a reason -> exit 0 and the escape is PRINTED on the green arm. `not-yet-establishable` with no `establishedBy` -> `an IOU with no due date is a waiver, which DR-0029 does not grant`, exit 1. With `M5-P1` -> exit 0 |
| 3 | the `typecheck` gate reports green with units derived from the compiler | **NOT REACHED** | outside this group's paths |
| 4 | render-agent-rules and brief-drift `--check` exit 0 | **NOT REACHED** | script behaviour, outside this group |
| 5 | `npm ci && npm run build && npm test` exits 0 with the full sentence quoted | **MET** | section 0 |
| 6 | `git status` clean after `npm run build` | **MET** | RAN, `git status --porcelain` empty |

**Two probes beyond the criteria, both HELD.** A class naming a gate id the
registry does not declare is refused
(`names gate id(s) no-such-gate that this repository's gate registry does not
declare, so nothing runs for this class`), and `{"gates": []}` is refused as
`declares neither a gate nor a status, which is the SILENT nothing DR-0029
exists to refuse`. `establishedBy` is not a free string either: `later`, `never`
and `x` are each refused as `not a phase id of the form M<n>-P<n>`. The schema
deliberately does NOT encode the semantics
(src/gates/schemas/phase-declaration.schema.json says why: a schema rejection
would surface as `error`, which M2-C-3 reserves for a check that could not reach
a verdict) and the check carries them; the two halves agree at this head.

### 2.7 M4-P30 (the kernel's fleet-home bring-up)

Specification: delivery/plan/kernel-plan-m4.md:2436 (still titled M4-P15; only
the id moved, delivery/plan/kernel-plan-m4.md:3871).

| # | criterion | met now? | evidence |
|---|---|---|---|
| 1 | `validate --type charter <fleet>/charter/kernel-charter.yaml` exits 0, and a mechanically produced negative copy exits nonzero naming the deleted property | **MET, with a declared substitution on the positive arm** | RAN the NEGATIVE arm against the committed fixture at this head: `node bin/tiphys.ts validate --type charter delivery/evidence/m4-fleet-bringup/charter-negative-no-escalation-contract.yaml` -> exit 1, `INVALID #/escalation-contract required property escalation-contract is missing`. The positive arm's subject lives in the separate fleet repository, which is not present in this clone (`git ls-files | grep kernel-charter` returns only `test/kernel-charter.test.ts`), so I substituted this repository's own root `charter.yaml`: exit 0. The substitution is named rather than passed off as the fleet run |
| 2 | `tiphys init` against the real remote, ref pushed | **NOT REACHED** | I did not push to the fleet remote from this read-only clone |
| 3 | `doctor --for full` recorded with its exit code, whatever it is | **NOT REACHED** | same |
| 4 | `doctor --for full` exits 0 with zero FAIL lines | **NOT REACHED** | same |
| 5 | the blindness witness, both arms, `retention WARN` before and `retention FAIL` after | **NOT REACHED** | same. READ the mechanism section of delivery/work-history/m4-p30.md, which names it correctly as the guard-whose-condition-does-not-test-what-matters shape |
| 6 | the second member: a charter with no `kind: charter` stays a DISTINCT condition | **NOT REACHED** | same |
| 7 | `lock acquire` / `lock status` | **NOT REACHED** | outside this group |
| 8 | `npm ci && npm run build && npm test` exits 0 with the full sentence | **MET** | section 0 |
| 9 | every captured command carries its interpreter and directory | **READ** | delivery/evidence/m4-fleet-bringup/bringup.md carries the table; I did not audit all eighteen records |

## 3. What I tried to break, and what HELD

Reported because an APPROVE or a FIX-ROUND-NEEDED with no account of the
attacks is not a review.

- **Every object level of every shipped schema, against a smuggled field.** 28
  schema documents walked programmatically. Every closed object is closed; the
  two open ones are declared with reasons in their own `$comment`. HELD.
- **A branch-only property under a closed object** (the vacuous-branch shape: a
  `oneOf` branch that can never be satisfied because the root forbids the
  property it requires). Zero instances across all 28. HELD.
- **The validator's refusal surface.** Unknown keyword, invalid schema document,
  unresolved local `$ref`, remote `$ref`, uncompilable pattern, untranslated
  keyword, coercion, defaulting, input mutation, diagnostic ordering. All ten
  refuse, and none leaks an Ajv sentence. HELD.
- **Blocking reads on operator-supplied paths.** A real `mkfifo` at the file
  argument and at `--context`, under `timeout 20`. Both refused, naming the path
  and the observed type, neither blocked. HELD.
- **The dual-review pair, six ways.** One verdict alone (red, both checks). Two
  verdicts at different heads (two groups of one, red). A pair carrying a medium
  finding (red at BOTH the schema layer and the check layer). A three-verdict
  group with a refusal (red). A third verdict sharing a framing (red). A head
  spelled as a YAML number (red, named). All HELD.
- **Cross-document completeness.** A verdict omitting one acceptance criterion,
  omitting one hazard class, omitting one declared deviation, and naming a
  finding id that `findings[]` does not declare. All four refuse with the check
  id in the line. HELD.
- **The gate-class escapes.** Absent reason, empty-string reason, missing
  establishing phase, unregistered gate id, empty `gates` list, junk
  `establishedBy`. All six refuse. HELD.
- **What did NOT hold** is CR-VS-001 (head-agnostic green), CR-VS-002 (a refusal
  one directory down is silently dropped, and the pair corpus disagrees with the
  falsifier corpus about depth) and CR-VS-003 (same-family pair certified
  decorrelated).

## 4. Tuition shapes I looked for again in this group

- **T-001 (cross-model review catches)**: PRESENT AGAIN as CR-VS-003. The
  kernel's own decorrelation check cannot tell two Claude models apart.
- **T-007 (criteria cannot contain the defect)**: the reason CR-VS-001 and
  CR-VS-002 are here at all. Every M4-P10 criterion except 7 is MET and the gate
  is still head-agnostic, because no criterion asked "against which head".
- **T-008 / SC-011 (a guard that cannot go red)**: probed hard and mostly HELD.
  The context-absent arms of every derived check fail closed
  (`no context directory was supplied`), `SKIPPED <id> no context` exits nonzero,
  and `units 0` is refused. The one place the shape survives is CR-VS-002's
  silent drop.
- **T-009 (green is scoped to the run that produced it)**: this is exactly
  CR-VS-001, one scope down: a gate-level green that is evidence about a
  different commit.
- **T-018 (two checks catching the same input make each other unwitnessable)**:
  probed on the medium-finding path, where the schema `if`/`then` and
  `verdict-pair-approves` both catch it. Both were demonstrated refusing
  INDEPENDENTLY (schema through `validate`, check through the gate over a
  document the gate did not schema-validate: the APPROVE-beside-medium fixture in
  section 2.4 criterion 5 is schema-INVALID and the gate read it and reddened on
  its own predicate). HELD.
- **T-034 (a union script compared two sides where the rule needs three)**: the
  nearest relative of CR-VS-002, and the reason I looked at corpus depth.
- **T-042 (a refusal predicate that cannot see an absent value)**: probed by
  EXECUTION, eight arms, one variable changed each time (`produced-by` on one
  member of an otherwise-green committed pair). All eight exit 1, and each gets
  its OWN sentence rather than being folded into the comparison:

  | `produced-by` | gate exit | the sentence |
  |---|---|---|
  | key omitted | 1 | `declares no produced-by` |
  | `null` | 1 | `declares produced-by as null, which names no value` |
  | `""` | 1 | `... as an empty string, which names no value` |
  | `"   "` | 1 | `... as only whitespace, which names no value` |
  | `[a, b]` | 1 | `... as a list, which names no value` |
  | `{a: b}` | 1 | `... as a map, which names no value` |
  | `5` | 1 | `... as a number, which names no value` |
  | `"Cl<U+0430>ude Opus 5"` | 1 | `declares produced-by using the character U+0430 at position 3, which is outside the printable ASCII a governance identifier is compared as` |

  HELD, and it is the best-hardened code in this group. Note the last row
  against CR-VS-003: the check refuses a Cyrillic `a` inside a family name and
  accepts two genuinely different members of one family.

## 5. What I did NOT cover

- Every Kind A red witness that requires MUTATING a shipped schema and reverting
  it, and every Kind B witness that requires DEREGISTERING a check. I ran the
  forward half of each and said so per row. A read-only reviewer restoring a
  mutated `schemas/` is the T-013 shape (a killed mutation harness leaves the
  mutant installed), and I preferred an honest gap.
- The fleet-home half of M3-P8 criterion 8 and all of M4-P30 criteria 2 to 7:
  they need a fleet home and a real remote.
- `src/checks.ts` regions outside the checks my phases own: the assurance-mode
  checks (M3-P3), the report/final-report parity checks, the CommonMark
  quotable-units machinery (src/checks.ts:1000-1512) and
  `model-resolution-subject-echo`. They are in the file, not in my phases'
  criteria, and I did not want to report a skim as a walk.
- The 1341-test suite's per-test semantics. I ran it and read the tests that
  carry the criteria above; I did not audit the rest.

## 6. The instrument, checked against itself

`/tmp/claude-0/final-sweep/verdict-final-validation-criteria.json` was validated
with the kernel's own validator at this head.

```
$ node bin/tiphys.ts validate --type auto /tmp/claude-0/final-sweep/verdict-final-validation-criteria.json
SKIPPED dual-review-decorrelation no context
SKIPPED verdict-criteria-complete no context
SKIPPED verdict-deviations-judged no context
SKIPPED verdict-hazard-classes-addressed no context
SKIPPED verdict-pair-approves no context
exit=1
```

**That nonzero exit is the shipped contract, not a rejection of the document**,
and it is exactly M3-P1 criterion 4c: a cross-document check with no `--context`
must announce itself and exit nonzero rather than pass by not running. ZERO
`INVALID` lines were produced. The schema layer alone, called directly against
`schemas/verdict.schema.json`, reports `SCHEMA DIAGNOSTICS: NONE (valid)`.

### The negative control, nine arms

A validator that cannot go red has said nothing about my document. Nine
mutations of this verdict, each one variable:

| mutation | the schema's answer |
|---|---|
| `verdict` flipped to `APPROVE` while a `high` finding stands | `INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"` |
| `head` abbreviated to 7 hex | `INVALID #/head value "ad2428b" does not match the required pattern ^[0-9a-f]{40}$` |
| `review-contract` set to a third value | `INVALID #/review-contract value "hazard-and-criteria" is not one of the permitted values "criteria", "hazard"` |
| `framing` removed | `INVALID #/framing required property framing is missing` |
| a finding stripped of `concrete-fix` | `INVALID #/findings/0/concrete-fix required property concrete-fix is missing` |
| a smuggled `produced_by` field added | `INVALID #/produced_by property produced_by is not permitted here` |
| a criterion walk with empty `evidence` | `INVALID #/criteria/0/evidence array has 0 items, fewer than the required minimum 1` |
| `severity` outside the vocabulary | `INVALID #/findings/0/severity value "blocker" is not one of the permitted values "low", "medium", "high", "critical"` |
| `review-contract: hazard` with no `hazard-classes-addressed` | `INVALID # value matches no permitted alternative here` |

All nine red. The first one is the interesting arm for this review: it is the
M4-P10 widening in force against my own document, refusing an APPROVE beside my
own HIGH finding.

## 7. Assigned fields, declared

- `review-contract: criteria`, `framing: criteria-contract`,
  `produced-by` naming the Anthropic Claude family: assigned by the dispatch,
  not chosen, so `check-dual-review` can compare this verdict with the other
  reviewer's on all three dimensions.
- `phase: M3-P1` is assigned because the schema takes one phase and this review
  spans seven. The phases actually covered are M3-P1, M3-P2, M3-P8, M4-P10,
  M4-P13, M4-P14 and M4-P30, and the criterion ids in the JSON are prefixed with
  the phase each belongs to so the walk stays auditable.
- `head: ad2428b76ef6f53f75b0d7f94c7db50463e077b7`, forty lowercase hex, copied
  exactly.
- I ran the contract I was assigned. Nothing was swapped.

## 8. Verdict

**FIX-ROUND-NEEDED.** One HIGH (CR-VS-001) and two MEDIUM (CR-VS-002,
CR-VS-003), all reproduced against staged repositories with the shipped scripts,
all reaching a shipped artifact and a real merge decision, which is the DR-0027
test. Three LOW recorded.

The criteria themselves are in good shape: of the criteria I could reach across
seven phases, every one holds at this head except M4-P10 criterion 7, which its
own work history declared undischargeable in advance and which T-040 records.
The findings are not criterion failures. They are the gap T-007 names: the
merge-authority gate satisfies every criterion written for it and is still
head-agnostic, still drops a refusal filed one directory down, and still cannot
tell two models of one family apart, because no criterion asked those three
questions.

## The JSON verdict, embedded rather than landed

This verdict reads FIX-ROUND-NEEDED, so the pair is not a dual APPROVE and nothing from
this group is landed at the TOP LEVEL of `delivery/review/`, where
`check-dual-review` reads its corpus non-recursively.

```json
{
  "kind": "verdict",
  "phase": "M3-P1",
  "head": "ad2428b76ef6f53f75b0d7f94c7db50463e077b7",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "Claude Opus 5 (claude-opus-5), Anthropic Claude family, running the criteria contract as a clean-room reviewer",
  "framing": "criteria-contract",
  "review-contract": "criteria",
  "findings": [
    {
      "id": "CR-VS-001",
      "severity": "high",
      "evidence": [
        "gate-registry.yaml declares check-dual-review as command: [node, scripts/check-dual-review.mjs, .] with no parameters list, so the gate is never given a head",
        "src/checks.ts:3884 headGroupFor groups siblings by the head each verdict declares; nothing compares that value to the commit the gate runs against",
        "src/gates/merge-preconditions.ts:113 shows the contrasting design: that gate takes --head and its precondition is that a committed verdict names this head",
        "REPRODUCED: staged repo HEAD a308efe294ec8d55ea832243e53aad3eff31312d, two decorrelated APPROVE verdicts naming head deadbeefdeadbeefdeadbeefdeadbeefdeadbeef, git cat-file -t on that sha reports 'could not get object info'; node scripts/check-dual-review.mjs <dir> printed 'check-dual-review: green (2 review verdicts examined for decorrelation)' and exited 0, with a second commit of unreviewed work on top",
        "node scripts/check-dual-review.mjs --precondition <dir> exited 0 on the same directory, so the gate is APPLICABLE and green rather than skipped"
      ],
      "concrete-fix": "Give check-dual-review a --head <sha> argument, declare parameters: [head] on its gate-registry.yaml entry, select the (phase, head) group by the passed head rather than by whatever the documents declare, and report not-applicable with a reason (never green) when no committed verdict names it. Additionally refuse a declared head that git cat-file -t <head> does not report as 'commit' in the context repository; loadCommittedVerdicts already runs git there.",
      "analysis": "This is T-009's mechanism inside the gate that carries DR-0012's merge grant: a gate result is evidence only for the configuration it ran under, and here the configuration is a commit the gate was never told about. It is latent today because delivery/review carries zero verdicts (T-040), and it activates the moment a verdict pair lands, which is the next step this sweep produces. merge-preconditions is head-anchored but conditional, so the observable state after a stale pair is 'check-dual-review green, merge-preconditions not-applicable', which reads as condition 1 being machine-checked when it is not."
    },
    {
      "id": "CR-VS-002",
      "severity": "medium",
      "evidence": [
        "src/checks.ts:3151 loadCommittedVerdicts calls listCommittedTree(contextDirectory, refSha, REVIEW_DIRECTORY, false), non-recursive",
        "src/checks.ts:3191 loadPaperworkVerdicts calls listCommittedTree(contextDirectory, refSha, PAPERWORK_ROOT, true), recursive",
        "src/checks.ts:3030 VERDICT_FILE_PATTERN is /\\.(ya?ml|json)$/i, so the sub-tree NAME that a non-recursive ls-tree returns is discarded and the drop is silent",
        "REPRODUCED: two APPROVE verdicts at delivery/review/ plus a committed third verdict for the same phase and the same head reading FIX-ROUND-NEEDED at delivery/review/sub/verdict-refusing.yaml; node scripts/check-dual-review.mjs <dir> printed '1 registered check(s) named dual-review-decorrelation ran over 2 verdict(s)' and 'check-dual-review: green', exit 0, with no mention of the third document",
        "REPRODUCED, second arm: with BOTH verdicts under delivery/review/m4-p10/, the gate printed 'check-dual-review: 0 verdict document(s)' and 'check-dual-review: not-applicable (0 review verdicts examined for decorrelation)', exit 20, while git ls-files delivery/review listed both files",
        "scripts/check-dual-review.mjs states in its own comment that the loader 'reads every candidate blob of the whole subtree out of the commit when there is one', which is false for this corpus"
      ],
      "concrete-fix": "Pass true at src/checks.ts:3151 so the pair corpus reads the same depth as the falsifier corpus, and correct the sentence in scripts/check-dual-review.mjs. If one level is the intended contract instead, then the not-applicable reason must say 'read non-recursively' and every .yaml/.json blob found deeper under delivery/review/ must be carried out as unexaminable, so a dropped refusal is visible rather than silent.",
      "analysis": "One function, two callers, different depth, and the two corpora belong to the same gate. A committed document can therefore be inside the corpus that can contradict a single-family declaration and outside the corpus that can refuse a merge. The failing direction is the one that drops a refusal, and the check's own comments argue at length that a sibling which cannot be keyed must not shrink the set the delegated grant is read off; a sibling that is never listed shrinks it with no message at all."
    },
    {
      "id": "CR-VS-003",
      "severity": "medium",
      "evidence": [
        "src/checks.ts:3675 canonicalScalar is the whole comparison for produced-by: NFKC, whitespace collapse, lowercase, then string inequality",
        "grep -n 'canonicaliseFamily|familyOf|canonicalFamily' src/checks.ts returns no hits, so no family vocabulary is shipped",
        "REPRODUCED: produced-by 'Claude Opus 5 (claude-opus-5), Anthropic' against 'Claude Sonnet 5 (claude-sonnet-5), Anthropic' gave 'REPORT dual-review-decorrelation 2 verdict(s) for phase M4-P10 at head ad2428b7... are distinct on produced-by, framing, review-contract' and 'check-dual-review: green', exit 0",
        "delivery/work-history/m4-p10.md:654 records the gap and assigns it: 'produced-by is still a STRING comparison, not a family one ... Closing the first is M4-P11's declared scope'",
        "delivery/work-history/m4-p11.md:142 declines the mechanism: 'A closed enum of family names was rejected: no such vocabulary can be kept current', and M4-P11 shipped the single-family exception instead",
        "charter.yaml at this head declares no review-families, so the exception arm is absent and the strict cross-family rule is the one in force"
      ],
      "concrete-fix": "Either add an explicit family field to schemas/verdict.schema.json and compare that field for decorrelation while produced-by stays the free string, or, if no vocabulary can be maintained, change the green REPORT line to read 'distinct on the produced-by STRING, which is not a family comparison', so a bundle-level green cannot be read as a cross-family assertion.",
      "analysis": "This is T-001 present again inside the check built for T-001. It is a composition finding rather than a restatement of a known residue: the deferral chain M4-P10 to M4-P11 terminates with M4-P11 declining the mechanism and no later phase picking it up, which no per-phase review could see. It also runs the other way, because falsifier 1 of the single-family exception counts two distinct canonicalised produced-by values as two families, so a genuinely single-family project naming two of its own models is refused the exception it is entitled to."
    },
    {
      "id": "CR-VS-004",
      "severity": "low",
      "evidence": [
        "src/validate.ts:321 declares const MESSAGE_BY_KEYWORD = new Set<string>([...]) and grep -rn MESSAGE_BY_KEYWORD over src, test and scripts returns only that line and two comments at src/validate.ts:27 and src/validate.ts:109",
        "src/validate.ts:27 states that a keyword reaching renderAjvError without an entry in MESSAGE_BY_KEYWORD is reported as a defect; the refusal is actually the default arm of the switch at src/validate.ts:489",
        "src/validate.ts:109 states every vocabulary entry also has an entry in the set; $ref, items, properties and then are in AUTHORING_VOCABULARY and absent from the set, and minimum, maximum and maxItems are in the set and absent from the vocabulary",
        "The behaviour is guarded elsewhere and was executed: test/schemas.test.ts:265 derives its missing set from AUTHORING_VOCABULARY, and an out-of-vocabulary keyword produced 'INVALID # internal defect: no Tiphys diagnostic is defined for schema keyword multipleOf'"
      ],
      "concrete-fix": "Delete MESSAGE_BY_KEYWORD and the two comments that cite it, or make it load-bearing by deriving the switch's covered set from it and adding a test asserting AUTHORING_VOCABULARY is a subset of it.",
      "analysis": "Low because the property is genuinely guarded by the derived vocabulary test, so nothing fails open. It is reported because the module's own documentation names a dead set as the contract in three places, which is how the next editor changes the wrong thing."
    },
    {
      "id": "CR-VS-005",
      "severity": "low",
      "evidence": [
        "schemas/plan.schema.json admits ^(criterion .+|judgment-property-of-prose: .+|state-not-entered: .+|later-phase: M[0-9]+-P[0-9]+)$ for hazard-classes[].addressed-by",
        "src/checks.ts:233 planHazardClassesAddressedByResolves handles only the criterion and later-phase arms",
        "RAN against templates/plan.example.yaml: addressed-by 'criterion 99' exits 1 named, 'later-phase: M9-P99' exits 1 named, 'state-not-entered: M999' exits 0, 'judgment-property-of-prose: no-such-probe' exits 0",
        "templates/plan.example.yaml itself carries state-not-entered: M10 while the example plan declares only phase M9-P1",
        "kernel plan M3 section 2.6 argues the prose escape 'is not a loophole, because the probe id is itself checkable', and no shipped check resolves it"
      ],
      "concrete-fix": "Resolve judgment-property-of-prose: <id> against the checklist's probes[].id using the machinery gate-probes-resolve already has at src/checks.ts:2074, and either resolve state-not-entered: against a declared milestone list or state in the schema $comment that these two arms are unresolvable by design, so the plan's checkability sentence is not left standing against code that does not check it.",
      "analysis": "Not a criterion failure: M3-P1 criterion 5f asks for exactly two structurally different members and both were reproduced. It is a residue with a real downstream path, because a consuming project can discharge every declared hazard class with judgment-property-of-prose: anything at exit 0, which is the documented-an-obligation-instead-of-creating-one shape the check exists against, surviving in two of its four arms."
    },
    {
      "id": "CR-VS-006",
      "severity": "low",
      "evidence": [
        "scripts/check-dual-review.mjs:541 builds the string 'no verdict document is ${describeVerdictCorpusSource(run.source)}, so there is no pair of reviews to compare'",
        "src/checks.ts:3074 describeVerdictCorpusSource returns a parenthetical beginning '(corpus: ', while its sibling src/checks.ts:3090 describeContextDocumentSource returns the phrase form 'in commit ...' the sentence was written for",
        "OBSERVED at this head against the repository itself: 'no verdict document is (corpus: delivery/review read from commit ad2428b76ef6f53f75b0d7f94c7db50463e077b7, resolved from HEAD), so there is no pair of reviews to compare'"
      ],
      "concrete-fix": "Use describeContextDocumentSource in that sentence, or reword it to 'no verdict document was found ${describeVerdictCorpusSource(run.source)}'.",
      "analysis": "Cosmetic, and reported only because it is the sentence an operator reads on the not-applicable arm of the merge-authority gate, which is the arm CR-VS-002's second reproduction also lands on."
    }
  ],
  "criteria": [
    {
      "id": "M3-P1:2",
      "quote": "tiphys validate --type plan templates/plan.example.yaml exits 0, and the same for charter, decision-record, and a status-line record. tiphys validate --type auto on each example exits 0.",
      "evidence": [
        "RAN all six invocations at head ad2428b7: plan typed exit=0, plan auto exit=0, charter typed exit=0, charter auto exit=0, decision-record typed exit=0, decision-record auto exit=0"
      ],
      "met": true
    },
    {
      "id": "M3-P1:3",
      "quote": "Kind A DANGEROUS-instance rejection, each fixture exiting 1 with a message naming the offending pointer: (a) a plan whose phase has acceptance: []; (b) a charter with every other field present and no escalation-contract; (c) a decision record with status: decided and an empty decided; (d) a status-line record with state: done and no run.",
      "evidence": [
        "(a) INVALID #/phases/0/acceptance array has 0 items, fewer than the required minimum 1, exit 1",
        "(b) INVALID #/escalation-contract required property escalation-contract is missing, exit 1",
        "(c) INVALID #/decided value \"\" is shorter than the required minimum length 1, exit 1",
        "(d) INVALID #/run required property run is missing, exit 1"
      ],
      "met": true
    },
    {
      "id": "M3-P1:4",
      "quote": "Each of the four fixtures in criterion 3 is accepted when the single schema keyword guarding it is removed, and rejected when it is restored; both runs are captured in the work history and the schema is reverted.",
      "evidence": [
        "NOT REACHED. The witness requires mutating a shipped schema in schemas/ and reverting it. I ran the forward half of all four (criterion M3-P1:3 above) and declined the mutation in a read-only review, because a mutation harness that dies mid-round leaves the mutant installed (T-013)."
      ],
      "met": false
    },
    {
      "id": "M3-P1:4c",
      "quote": "A cross-document derived check invoked without --context prints SKIPPED <check-id> no context and the command exits nonzero; the same invocation with --context exits 0 on a valid instance (both directions).",
      "evidence": [
        "RAN on tuition/T-001.yaml without --context: SKIPPED mechanism-rule-evidence-resolves no context; SKIPPED tuition-target-exists no context; exit 1",
        "RAN the same file with --context .: REPORT tuition-target-exists 1 applied target(s) resolved; exit 0"
      ],
      "met": true
    },
    {
      "id": "M3-P1:5",
      "quote": "An instance identical to a valid example except for one misspelled property name exits 1 and the message names that property. Two structurally different members: one misspelling at the document's TOP level and one at a nested object level at least two deep.",
      "evidence": [
        "top level: INVALID #/statusx property statusx is not permitted here, exit 1",
        "nested, two deep: INVALID #/phases/0/fill-inn property fill-inn is not permitted here, exit 1",
        "Package-wide check of the same property: all 20 schemas/*.schema.json and all 8 src/gates/schemas/*.schema.json walked programmatically; every object level with properties either sets additionalProperties: false or is an if/then/oneOf applicator where closing it would be wrong, except two levels that declare additionalProperties: true with a reason in their own $comment (schemas/cutover-state.schema.json root and $defs/switchRecord, and src/gates/schemas/release-record.schema.json properties/resolved)"
      ],
      "met": true
    },
    {
      "id": "M3-P1:5b",
      "quote": "Charter release-verification reservation, all directions. A charter with no release-verification field exits 1 naming the field; one with {mode: none} and no reason exits 1 naming reason; one with {mode: none, reason: \"...\"} exits 0; one with {mode: vercel, endpoint: \"...\"} exits 1 naming the offending property.",
      "evidence": [
        "absent: INVALID #/release-verification required property release-verification is missing, exit 1",
        "{mode: none}: INVALID #/release-verification/reason required property reason is missing, exit 1",
        "{mode: none, reason}: exit 0",
        "{mode: vercel, endpoint}: INVALID #/release-verification/endpoint property endpoint is not permitted here and INVALID #/release-verification/mode value \"vercel\" is not one of the permitted values \"none\", \"reserved\", exit 1"
      ],
      "met": true
    },
    {
      "id": "M3-P1:5d",
      "quote": "Path-type refusal, both directions. With a named pipe staged by a real mkfifo at the path handed to tiphys validate <file>, the command exits nonzero within a bounded time naming the path and the observed entry type, and does NOT block. The same pair is witnessed for the --context directory.",
      "evidence": [
        "real mkfifo at the file argument under timeout 20: tiphys validate: /tmp/claude-0/final-sweep/fx/fifo.yaml is a named pipe, not a regular file, so it was not opened; exit 1, did not block",
        "real mkfifo at --context under timeout 20: tiphys validate: /tmp/claude-0/final-sweep/fx/ctxfifo is a named pipe, not a directory, so it was not opened; exit 1, did not block",
        "the regular-file direction is criterion M3-P1:2, exit 0"
      ],
      "met": true
    },
    {
      "id": "M3-P1:5f",
      "quote": "hazard-classes[].addressed-by resolves, both directions. Two structurally different members: one item whose addressed-by names a criterion id that does not exist, and one whose addressed-by is a reason form naming a phase id that does not exist in the plan.",
      "evidence": [
        "member 1: INVALID #/phases/0/hazard-classes/0/addressed-by criterion 99 is not an acceptance criterion of phase M9-P1 (check: plan-hazard-classes-addressed-by-resolves), exit 1",
        "member 2: INVALID #/phases/0/hazard-classes/1/addressed-by deferred to phase M9-P99, which this plan does not contain (check: plan-hazard-classes-addressed-by-resolves), exit 1",
        "the forward direction, templates/plan.example.yaml unmodified, exits 0",
        "the two arms the criterion does not name are reported separately as finding CR-VS-005"
      ],
      "met": true
    },
    {
      "id": "M3-P1:11",
      "quote": "npm pack produces a tarball whose listing contains schemas/ and templates/ entries and contains no delivery/ entry.",
      "evidence": [
        "RAN npm pack --dry-run --json: 207 entries; schemas/ 21, templates/ 7, roles/ 7, tuition/ 17, delivery/ 0",
        "all 8 src/gates/schemas/*.schema.json are present in the pack as dist/src/gates/schemas/*, so no shipped gate reads a schema the package omits"
      ],
      "met": true
    },
    {
      "id": "M3-P1:12",
      "quote": "A subcommand made to throw (a malformed YAML artifact handed to tiphys validate, and a plan file that is valid YAML but not a mapping) prints one diagnostic line and exits 1 or 64, and stderr contains no stack frame (grep -c \"    at \" equals 0).",
      "evidence": [
        "malformed YAML: tiphys validate: <path> is not valid YAML: Unexpected : in flow sequence; exit 1; grep -c \"    at \" over stdout and stderr equals 0",
        "valid YAML that is not a mapping: INVALID # expected type object but found array; exit 1; grep -c \"    at \" equals 0"
      ],
      "met": true
    },
    {
      "id": "M3-P1:13",
      "quote": "grep -rP '[^\\x00-\\x7F]' over the touched files reports nothing.",
      "evidence": [
        "RAN node scripts/check-authored-bytes.mjs at head ad2428b7, exit 0"
      ],
      "met": true
    },
    {
      "id": "DR-0013:4",
      "quote": "An unknown schema keyword fails schema COMPILATION, before any instance is validated, and the failure names the keyword.",
      "evidence": [
        "RAN through src/validate.ts validateToLines with {type: object, nosuchkeyword: 1}: INVALID # schema keyword nosuchkeyword is not in this validator's vocabulary"
      ],
      "met": true
    },
    {
      "id": "DR-0013:5",
      "quote": "A schema that is itself invalid fails meta-schema validation.",
      "evidence": [
        "RAN with required: \"not-an-array\": INVALID # schema is not a valid JSON Schema document and INVALID #/required expected type array but found string, the second carrying a pointer INTO the schema"
      ],
      "met": true
    },
    {
      "id": "DR-0013:6",
      "quote": "Input is not coerced, defaulted, stripped or otherwise mutated: assert the validated value is deep-equal to the input, for a case of each kind.",
      "evidence": [
        "RAN: the instance object was byte-identical by JSON.stringify before and after validation against a schema declaring an undeclared-property failure",
        "RAN the coercion case: {n: \"5\"} against {n: {type: integer}} reports INVALID #/n expected type integer but found string, and the instance afterwards is still {\"n\":\"5\"}"
      ],
      "met": true
    },
    {
      "id": "DR-0013:7",
      "quote": "Local $ref resolves; an unresolved reference and a REMOTE reference each fail closed rather than being silently skipped or fetched.",
      "evidence": [
        "unresolved local: INVALID # schema reference #/$defs/nope does not resolve",
        "remote: INVALID # schema reference https://example.com/x.json is remote, and this validator never loads remote schemas",
        "the resolving direction is exercised by schemas/work-history.schema.json's companion refs into schemas/report.schema.json, which validate at exit 0 in the suite"
      ],
      "met": true
    },
    {
      "id": "DR-0013:8",
      "quote": "Ajv errors are converted into INVALID <json-pointer> <message> with stable ordering. Assert the exact diagnostic text, and assert that no Ajv-authored wording reaches stdout or stderr.",
      "evidence": [
        "RAN with required: [\"z\",\"a\",\"m\"] against {}: the three lines come out as #/a, #/m, #/z, so the order is the contract's final sort and not Ajv's traversal",
        "RAN an out-of-vocabulary keyword (multipleOf): INVALID # internal defect: no Tiphys diagnostic is defined for schema keyword multipleOf, which carries no Ajv wording"
      ],
      "met": true
    },
    {
      "id": "DR-0013:10",
      "quote": "Every existing M2 gate manifest and result retains its PRIOR pass/fail behaviour through the new engine. This is a regression contract: the M2 validation tests are re-run unchanged, not rewritten.",
      "evidence": [
        "NOT REACHED as a diff. The full suite is green at this head (1341 pass, 0 fail, 0 skipped, node v26.6.0, dist/ built, npm test), but I did not diff test/ against the M2 merge base, so I cannot say the M2 tests are UNCHANGED, only that they pass."
      ],
      "met": false
    },
    {
      "id": "M3-P2:1",
      "quote": "tiphys validate --type gate-registry gate-registry.yaml exits 0.",
      "evidence": [
        "RAN at head ad2428b7, exit 0, no output"
      ],
      "met": true
    },
    {
      "id": "M3-P2:2",
      "quote": "A registry entry with verified-by: clean-room-checklist and no probe exits 1 naming the entry id; the same entry with a probe exits 0 (both directions).",
      "evidence": [
        "probe deleted from unit-tests-for-changed-service-methods: INVALID #/gates/19/probe required property probe is missing, exit 1",
        "the shipped registry, probe present: exit 0"
      ],
      "met": true
    },
    {
      "id": "M3-P2:4",
      "quote": "Kind A DANGEROUS-instance witness: a registry whose deploy gate declares no precondition is rejected by the schema required list.",
      "evidence": [
        "precondition deleted from the deploy gate: INVALID #/gates/7/precondition required property precondition is missing, exit 1",
        "the keyword-removal half of the witness was not performed, for the reason recorded under M3-P1:4"
      ],
      "met": true
    },
    {
      "id": "M3-P8:1",
      "quote": "tiphys validate --type tuition exits 0 on every promoted entry plus the two tickets, and tiphys validate --type mechanism-index tuition/mechanism-index.yaml exits 0.",
      "evidence": [
        "MET WITH A DECLARED CORRECTION. As written the command exits 1 for every entry, because both types carry context-requiring checks and the CLI prints SKIPPED <id> no context and exits nonzero, which is M3-P1 criterion 4c working",
        "RAN with --context .: 15 entries validated, 0 failures; mechanism-index exit 0",
        "the count relation holds: tuition/ carries 15 entry files plus mechanism-index.yaml plus README.md, which is the 17 CLAUDE.md records"
      ],
      "met": true
    },
    {
      "id": "M3-P8:2",
      "quote": "Kind A DANGEROUS-instance rejections: (a) an entry with kernel-relevant: true and an empty structural-consequence[] exits 1 naming the field; (b) a mechanisms[] entry with a rule and an empty evidence[] exits 1 naming the field.",
      "evidence": [
        "(a) INVALID #/structural-consequence array has 0 items, fewer than the required minimum 1, exit 1",
        "(b) INVALID #/mechanisms/0/evidence array has 0 items, fewer than the required minimum 1, exit 1"
      ],
      "met": true
    },
    {
      "id": "M3-P8:3",
      "quote": "Kind B rejections, each carrying (check: <id>): (a) an entry whose structural-consequence[].status is applied and whose target path does not exist exits 1 naming the path, check tuition-target-exists; (b) a mechanisms[] rule whose evidence reference names a file that does not exist exits 1 naming the reference, check mechanism-rule-evidence-resolves.",
      "evidence": [
        "(a) INVALID #/structural-consequence/0/target structural consequence is marked applied and its target src/does-not-exist-anywhere.ts does not exist (check: tuition-target-exists), exit 1",
        "(b) INVALID #/mechanisms/0/evidence/0 evidence names delivery/verification/there-is-no-such-file.md, which does not exist (check: mechanism-rule-evidence-resolves), exit 1",
        "the deregistration half of each witness was not performed, for the reason recorded under M3-P1:4"
      ],
      "met": true
    },
    {
      "id": "M3-P8:4",
      "quote": "tiphys tuition index --check exits 0 against the committed index.",
      "evidence": [
        "RAN: exit 0, 15 mechanism(s) projected from 15 entr(ies); the committed index matches"
      ],
      "met": true
    },
    {
      "id": "M3-P8:4d",
      "quote": "MECHANISMS.md is gone and its readers are redirected: the file is absent, and no shipped artifact contains the string MECHANISMS.md.",
      "evidence": [
        "ls MECHANISMS.md: No such file or directory",
        "grep -rl 'MECHANISMS\\.md' roles/ schemas/ tuition/ AGENTS.md returns no hits"
      ],
      "met": true
    },
    {
      "id": "M3-P8:7",
      "quote": "tiphys tuition list --kernel-relevant exits 0 and prints exactly the entries whose kernel-relevant is true.",
      "evidence": [
        "RAN: exit 0, 15 rows printed, T-001 through T-022, each with its date and target count",
        "the tuition add half was not exercised, because it is a write and this review is read-only"
      ],
      "met": true
    },
    {
      "id": "M4-P10:2",
      "quote": "tiphys validate --type verdict <doc> exits 1 naming head for a document with no head, and exits 0 for the same document with one.",
      "evidence": [
        "RAN against the two committed pre-M4-P10 verdicts at delivery/evidence/m3-exit-test/e1/e1-7/: INVALID #/head required property head is missing, exit 1 for both",
        "a head-carrying verdict validates at exit 0, exercised throughout this review's fixtures"
      ],
      "met": true
    },
    {
      "id": "M4-P10:3",
      "quote": "Two verdicts in one directory carrying DIFFERENT head values are not compared as a pair: check-dual-review reports them as two groups of one and does not report the condition satisfied. Two verdicts carrying the SAME head are one group of two.",
      "evidence": [
        "same head: REPORT dual-review-decorrelation 2 verdict(s) for phase M4-P10 at head ad2428b7... are distinct on produced-by, framing, review-contract; check-dual-review: green, exit 0",
        "a group of one: INVALID #/phase only 1 verdict document(s) exist under delivery/review for phase M4-P10 at head ad2428b7..., and a delegated grant requires two independent clean-room reviews of the exact head (check: dual-review-decorrelation), exit 1, and the sibling refusal from verdict-pair-approves on the same run",
        "this criterion is MET and finding CR-VS-001 is about a different property: that the head the group is formed on is never compared to the head under test"
      ],
      "met": true
    },
    {
      "id": "M4-P10:4",
      "quote": "A verdict reading APPROVE beside a finding at severity: medium fails validation naming verdict.",
      "evidence": [
        "RAN: INVALID # value does not satisfy the requirements its own shape triggers here and INVALID #/verdict value \"APPROVE\" is not one of the permitted values \"FIX-ROUND-NEEDED\", exit 1"
      ],
      "met": true
    },
    {
      "id": "M4-P10:5",
      "quote": "A verdict PAIR in which one verdict reads FIX-ROUND-NEEDED reddens verdict-pair-approves.",
      "evidence": [
        "RAN the medium-finding form: INVALID #/findings/0/severity <path> carries finding CR-001 at severity medium for phase M4-P10 at head ad2428b7..., and a delegated grant is not satisfied while a review carries an unresolved finding at medium, high, critical (check: verdict-pair-approves); gate red, exit 1",
        "RAN a three-verdict group containing one FIX-ROUND-NEEDED: red, exit 1",
        "the deregistration witness (criterion 6) was not performed and is reported as not reached"
      ],
      "met": true
    },
    {
      "id": "M4-P10:7",
      "quote": "check-dual-review run against this phase's own delivery/review/ directory reports GREEN with units 2 and prints both verdict values. This is the gate's first non-vacuous run in the project's history.",
      "evidence": [
        "NOT MET at head ad2428b7. RAN node scripts/check-dual-review.mjs . : check-dual-review: not-applicable (0 review verdicts examined for decorrelation), exit 20; and --precondition . exits 1 with 0 verdict document(s)",
        "git ls-files 'delivery/review/*.json' returns 10, all under delivery/review/evidence/; git ls-files 'delivery/review/*.yaml' returns 0",
        "delivery/work-history/m4-p10.md:551 declares the criterion NOT DISCHARGEABLE by that phase, with two measured reasons, and T-040 records the resulting state",
        "the SECOND of those two reasons is now resolved: a root charter.yaml exists at this head. I demonstrated the mechanism works by staging two conforming verdicts beside the repository's own charter.yaml and assurance-modes.yaml, giving check-dual-review: green (2 review verdicts examined for decorrelation) with both verdict values printed, exit 0. What remains unmet is that no verdict pair has been committed"
      ],
      "met": false
    },
    {
      "id": "M4-P13:1",
      "quote": "node src/gates/coverage.ts --result <d>/result.json --evidence <d> exits 0 and result.json carries \"units\": 115 and a detail of exactly: 115 inventory id(s) checked; per-kind: decision 6, milestone 98, phase 11; per-milestone: M1 11, M2 16, M3 74, M4 5, M5 3, decision 6",
      "evidence": [
        "RAN at head ad2428b7, exit 0. units: 115. detail: 115 inventory id(s) checked; per-kind: decision 6, milestone 98, phase 11; per-milestone: M1 11, M2 16, M3 74, M4 5, M5 3, decision 6 -- identical to the criterion's text"
      ],
      "met": true
    },
    {
      "id": "M4-P13:2",
      "quote": "The six pinned assertions are REPLACED by ONE assert.deepEqual against one literal object carrying totalInventoryIds, perKind and perMilestone. node --test test/coverage-gate.test.ts exits 0 and reports N tests with N > 0, zero fail, and the SKIPPED count quoted.",
      "evidence": [
        "READ test/coverage-gate.test.ts:175-180: one object literal carrying totalInventoryIds: 115 alongside perKind and perMilestone",
        "RAN node --test test/coverage-gate.test.ts on node v26.6.0 with dist/ built: 21 tests, 21 pass, 0 fail, 0 skipped, 0 todo, exit 0"
      ],
      "met": true
    },
    {
      "id": "M4-P13:3",
      "quote": "A new test asserts, for all 115 rows, that the bucket in Appendix A equals the Milestone cell in the migration table for every row whose bucket is a bare M[0-9]+, and names every row where they differ.",
      "evidence": [
        "RAN; the test is present and passing: 'a migration-table cell that disagrees with its Appendix A bucket is named, for a row this phase moved and for one it never touched, while the coverage gate stays green under both'"
      ],
      "met": true
    },
    {
      "id": "M4-P13:4",
      "quote": "node scripts/check-authored-bytes.mjs exits 0.",
      "evidence": [
        "RAN at head ad2428b7, exit 0"
      ],
      "met": true
    },
    {
      "id": "M4-P13:5",
      "quote": "node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --only citations --evidence <d> --base origin/main --head HEAD exits 0 with the citations gate green and a nonzero unit count, run from a COMMITTED head and not from a staged tree.",
      "evidence": [
        "RAN with the criterion's own base: the gate is legitimately not-applicable, because HEAD is origin/main at the final state, so no delivery document changed. The precondition is evaluated and printed: 'precondition citations-diff-touches-documents evaluated and unmet'",
        "RAN with --base HEAD~1 --head HEAD at the same committed head: citations: green: linted 2 changed document(s) at ad2428b7...: 12 citation(s) resolved, 0 self-citation(s), 0 unverifiable-external; summary.json records units 12, vacuous false, applicable true; exit 0",
        "the substitution of the base is declared rather than hidden; the criterion's own base is not reproducible at a final state that IS the base"
      ],
      "met": true
    },
    {
      "id": "M4-P14:1",
      "quote": "A phase declaration carrying no class declaration at all is RED, and the detail names the phase id and the missing classes.",
      "evidence": [
        "RAN against a copy of the real delivery/plan/phase-declarations/m4-p14.json with gateClasses deleted: exit 1, gate-classes: red (3 declared gate classes checked), 'phase M4-P14 fails 3 of 3 required gate class(es) ...: correctness: MISSING, the declaration names no disposition for this required class; scope: MISSING ...; review: MISSING ...'",
        "the forward direction, the real declaration unmodified, exits 0 and PRINTS each class's satisfier"
      ],
      "met": true
    },
    {
      "id": "M4-P14:2",
      "quote": "A phase declaring a class not-applicable with an empty or absent reason is RED; the same declaration with a reason is green. A phase declaring a class not-yet-establishable without naming an establishing phase id is RED; with one, green. These are the TWO structurally different members.",
      "evidence": [
        "absent reason: 'review: not-applicable with no recorded reason; the reason is what makes it data rather than silence', exit 1",
        "empty-string reason: the same refusal, exit 1",
        "with a reason: exit 0, and the escape is printed on the green arm as '1 class(es) satisfied by a DECLARED ESCAPE rather than a gate, which a reviewer signs off rather than the gate refusing: review'",
        "not-yet-establishable with no establishedBy: 'an IOU with no due date is a waiver, which DR-0029 does not grant', exit 1; with establishedBy M5-P1: exit 0",
        "three probes beyond the criterion also refuse: an unregistered gate id, an empty gates list, and an establishedBy that is not of the form M<n>-P<n>"
      ],
      "met": true
    },
    {
      "id": "M4-P14:6",
      "quote": "git status is clean after npm run build.",
      "evidence": [
        "RAN npm ci then npm run build on node v26.6.0; git status --porcelain produced no output"
      ],
      "met": true
    },
    {
      "id": "M4-P30:1",
      "quote": "tiphys validate --type charter <fleet>/charter/kernel-charter.yaml exits 0, and a mechanically produced negative copy (one required key deleted, nothing else changed) exits nonzero with stderr naming the deleted property.",
      "evidence": [
        "NEGATIVE arm RAN at this head against the committed fixture: node bin/tiphys.ts validate --type charter delivery/evidence/m4-fleet-bringup/charter-negative-no-escalation-contract.yaml gives INVALID #/escalation-contract required property escalation-contract is missing, exit 1",
        "POSITIVE arm SUBSTITUTED and declared: the fleet's kernel-charter.yaml lives in the separate fleet repository and is not in this clone (git ls-files | grep kernel-charter returns only test/kernel-charter.test.ts). I validated this repository's own root charter.yaml instead: exit 0. That is a substitute subject and is named as one"
      ],
      "met": true
    },
    {
      "id": "M4-P30:2",
      "quote": "Against the real remote, tiphys init exits 0, the fleet's initial commit pushes to ThomasHendrickx/tiphys-ai-helmsman-fleet with exit 0, and git ls-remote origin shows the pushed ref.",
      "evidence": [
        "NOT REACHED. I did not push to the fleet remote from this read-only clone, and criteria 3 through 7 of the same section have the same reason: they act on a fleet home this review did not create."
      ],
      "met": false
    },
    {
      "id": "M4-P30:8",
      "quote": "npm ci && npm run build && npm test exits 0, with interpreter, build state, invocation, pass count and skipped count quoted.",
      "evidence": [
        "Interpreter /tmp/claude-0/n26/bin/node v26.6.0; build state dist/ built and git status --porcelain empty afterwards; invocation npm test, which is node --test \"test/**/*.test.ts\"; 1341 tests, 1341 pass, 0 fail, 0 skipped, 0 todo, exit 0",
        "the FIRST run of the same command exited 1 at test/gates.test.ts:3571 with spawnSync node EACCES, diagnosed by namei -m as /tmp/claude-0 being drwx------ so the unprivileged uid could not traverse to the scratch interpreter; the same test alone passes (1 test, 1 pass, 0 fail, 0 skipped) and the full re-run is clean. CLAUDE.md standing warning 1's scratch-prefix trap, not a branch defect"
      ],
      "met": true
    }
  ],
  "deviations-judged": []
}

```
