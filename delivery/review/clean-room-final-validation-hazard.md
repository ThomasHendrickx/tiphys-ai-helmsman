# Clean-room review: validation group, hazard contract, final M4 sweep

- subject head: `ad2428b76ef6f53f75b0d7f94c7db50463e077b7`
- group: validation (the validation engine and the shipped schemas)
- paths: src/checks.ts, src/validate.ts, schemas/**, src/gates/schemas/**
- phases whose criteria touch this group: M3-P1, M3-P2, M3-P8, M4-P10, M4-P13,
  M4-P14, M4-P30 (composition with M4-P11, which shares src/checks.ts with
  M4-P10, is also examined: it is the phase most likely to have broken M4-P10's
  criteria without either phase's own review being positioned to see it)
- contract: hazard
- reviewer family: Sonnet 5 (Anthropic)
- status: COMPLETE
- verdict: **FIX-ROUND-NEEDED**, one MEDIUM finding (FIND-02), one LOW finding
  (FIND-01)
- verdict JSON: /tmp/claude-0/final-sweep/verdict-final-validation-hazard.json,
  schema-validated (`tiphys validate --type auto`, zero INVALID lines; exit 1
  is the five context-required checks correctly reporting SKIPPED, explained
  in Escalations), and negative-controlled twice (flipping `verdict` to
  APPROVE beside the medium finding reddens; truncating `head` to a short sha
  reddens on the pattern)

## Setup, verified

Clone at /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-validation-hazard/clone,
detached at ad2428b76ef6f53f75b0d7f94c7db50463e077b7. `node --version` in the
shell running every command below: v26.6.0.

`npm ci`: exit 0, 16 packages added, 1 high severity advisory (dev-only,
unrelated to this group; not investigated further, out of scope for this
sweep's group).

`npm run build`: exit 0. `git status --porcelain` after build: empty (clean).

**Suite result, complete sentence.** Interpreter v26.6.0 (checked in the shell
that ran it). Build state: `dist/` built by `npm run build` immediately before.
Invocation: `npm test`, which runs `node --test "test/**/*.test.ts"` (the CI
and gate-defined invocation, not the wider bare `node --test` from the
repository root that also picks up the tracked `sandbox/` fixture, per the
standing warning on invocation-dependent counts).

```
i tests 1341
i suites 0
i pass 1341
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 706326.631056
[exited with code 0]
```

1341 pass, 0 fail, 0 skipped, exit 0. `git status --porcelain` after the run:
empty. Wall time ~11.8 minutes, consistent with the standing warning that this
suite's wall time is dominated by real-clock lease and witness-gate waits
(`witness.test.ts`, `watcher.test.ts` were still running well after most other
files had finished).

TRANSLITERATION DECLARED: the captured block above replaces Node's test
reporter glyph U+2139 (eight occurrences, the summary line prefix) with the
ASCII letter `i`. Nothing else in that capture, or in any other captured
output in this document, was altered.

## What I tried to break, and what held

1. **`additionalProperties: false` at nested object levels, every shipped
   schema.** Wrote a script that walks every `schemas/*.json` document and
   reports any node with `type: object` and `properties` that has no sibling
   `additionalProperties`. Every hit was an `if`/`then`/`oneOf` narrowing
   subschema (restating a subset of an already-closed object's properties for
   ajv's strictRequired/strictTypes, exactly as `verdict.schema.json`'s own
   `$comment`s describe), never a genuine open object. Then reproduced the
   worked example directly: a verdict document with `findings[0].smuggled-field`
   and `criteria[0].smuggled-criterion-field` added.

   ```
   node bin/tiphys.ts validate --type verdict fixtures/verdict-smuggle.json
   INVALID #/criteria/0/smuggled-criterion-field property smuggled-criterion-field is not permitted here
   INVALID #/findings/0/smuggled-field property smuggled-field is not permitted here
   ```

   HELD. M3-P1 criterion 5's class is not reproducible at this head.

2. **Named pipe at a hand-authored path, both arms (D-M3-27).** `mkfifo` for
   both the file argument and the `--context` directory argument:

   ```
   $ mkfifo fixtures/named-pipe.json
   $ timeout 10 node bin/tiphys.ts validate --type verdict fixtures/named-pipe.json
   tiphys validate: .../named-pipe.json is a named pipe, not a regular file, so it was not opened
   EXIT=1
   $ timeout 10 node bin/tiphys.ts validate --type verdict --context fixtures/named-pipe.json fixtures/verdict-ok.json
   tiphys validate: .../named-pipe.json is a named pipe, not a directory, so it was not opened
   EXIT=1
   ```

   Both returned well inside the 10s timeout; neither blocked. HELD.

3. **The verdict-pair-approves / dual-review-decorrelation mechanism
   (M4-P10, composed with M4-P11), against a REAL git corpus rather than a
   single-document fixture.** Built a scratch git repository with a committed
   `delivery/review/` carrying two verdicts for the same phase and head, one
   with an unresolved `severity: medium` finding:

   ```
   INVALID # value does not satisfy the requirements its own shape triggers here
   INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"
   ```

   (schema-level catch, criterion 4). Then cleared that document's own finding
   and validated it again with its sibling still carrying the medium finding
   committed alongside it:

   ```
   INVALID #/findings/0/severity .../r1.json carries finding f1 at severity medium
     for phase TEST-P1 at head 111...1, and a delegated grant is not satisfied
     while a review carries an unresolved finding at medium, high, critical
     (check: verdict-pair-approves)
   INVALID #/review-contract review-contract value criteria occurs in 2 of the 2
     verdicts for phase TEST-P1 ..., so the reviews are not decorrelated on
     review-contract (check: dual-review-decorrelation)
   ```

   This is the cross-document form of DR-0012 condition 2: the document being
   validated (r2.json) carries no medium finding of its own, and the check
   still refuses because its COMMITTED SIBLING does. That is the "PAIR" property
   working, not merely the instance's own fields. HELD.

4. **Two verdicts for DIFFERENT heads in one directory, criterion 3's other
   direction.** Same corpus, r2's `head` changed to a second commit sha, r1
   cleared to a clean APPROVE:

   ```
   INVALID #/phase only 1 verdict document(s) exist under delivery/review for
     phase TEST-P1 at head 111...1, and a delegated grant requires two
     independent clean-room reviews of the exact head (check: dual-review-decorrelation)
   INVALID #/verdict only 1 verdict document(s) exist ... (check: verdict-pair-approves)
   ```

   Two verdicts differing only in `head` were NOT compared as a pair; each
   formed a group of one and both checks refused on group size rather than
   silently approving. HELD, matches the plan's stated RED WITNESS
   (`HEAD~1` behaviour) inverted to demonstrate the fixed behaviour is what
   ships.

5. **The disk-vs-commit split (the mechanism named in the task brief as
   "shipped once here").** Read `readContextDocumentAt`, `resolveCorpusSource`,
   `contextDocumentPresentAt`, `establishDelegatedRegime` and
   `singleFamilyException` end to end. Every reader that feeds a merge
   precondition now takes a `VerdictCorpusSource` resolved ONCE by the caller
   (`resolveCorpusSource`) and threads it through; `singleFamilyException`
   explicitly pins the declaration read to `loaded.source.refSha` rather than
   re-resolving `HEAD` (src/checks.ts:4416-4430, comment names this as the
   structural half of M4-P11 fix round 1). The one remaining disk read
   (`treeDeclaresReviewFamilies`, src/checks.ts:4217) is deliberately
   disk-scoped and used ONLY to distinguish "no declaration" from "declared but
   uncommitted", which is documented as intentional and cannot be used to
   forge a passing exception (it can only ever turn an `absent` into an
   `error`, never into a `declared`). HELD; the disk-vs-commit split the
   M4-P10 comment block describes as having recurred three times before being
   fixed (src/checks.ts:3352-3378) does not reproduce here: every regime and
   declaration read on the merge-precondition path resolves through the one
   `VerdictCorpusSource`.

## Findings

### FIND-02 (medium): `uniqueItems` is a live, shipped authoring keyword absent from the one document that is supposed to declare the whole vocabulary, since day one

- files: schemas/README.md (missing), src/validate.ts:111-128 (source of truth),
  five shipped schemas that use it
- `src/validate.ts`'s `AUTHORING_VOCABULARY` (src/validate.ts:111-128) lists
  SIXTEEN keywords, and the module's own header comment says this list is
  "documented in `schemas/README.md`" (src/validate.ts:104-105). `schemas/
  README.md`'s "declared authoring vocabulary" table (DR-0013 clause 7, the
  file's own words: "This list is what a Tiphys schema is allowed to USE, so
  a keyword outside it is a deliberate, documented expansion rather than an
  accident") lists exactly FIFTEEN: `type`, `required`, `properties`,
  `additionalProperties`, `enum`, `const`, `items`, `minItems`, `minLength`,
  `pattern`, `$ref`, `oneOf`, `if`/`then` (one row, two keywords), `contains`.
  `uniqueItems` is not a row anywhere in the file.
- REPRODUCED mechanically (not eyeballed): extracted both lists with a small
  script and diffed them.

  ```
  AUTHORING_VOCABULARY (16): [ '$ref','additionalProperties','const','contains',
    'enum','if','items','minItems','minLength','oneOf','pattern','properties',
    'required','then','type','uniqueItems' ]
  README rows (documented, 15 after correcting for the if/then combined row):
    type, required, properties, additionalProperties, enum, const, items,
    minItems, minLength, pattern, $ref, oneOf, if, then, contains
  in vocab, not in README: uniqueItems
  ```

- `uniqueItems` IS live and load-bearing, not dead code: it is used in five
  shipped schemas (`grep -rl uniqueItems schemas/*.json` names
  `assurance-modes.schema.json`, `checklist.schema.json`,
  `final-report.schema.json`, `gate-registry.schema.json`,
  `role-model-config.schema.json`), it has its own message
  (`DIAGNOSTIC_MESSAGES.uniqueItems`, src/validate.ts:194), its own
  translation case (src/validate.ts:447-455), and its own positive/negative
  fixture in `test/schemas.test.ts:187-195`, which the file's own
  meta-test (`test/schemas.test.ts:267`, "every keyword in the declared
  authoring vocabulary has both a positive and a negative test") asserts BY
  DERIVING FROM `AUTHORING_VOCABULARY`, never from the README. That
  meta-test is exactly the mechanism this project uses everywhere else to
  keep a derived document honest (the CLAUDE.md gates block, brief-drift),
  and it was never pointed at this pair.
- provenance, so this is not attributed to guesswork: `git log -S'"uniqueItems",'
  -- src/validate.ts` names exactly one commit, `1c82521` ("M3-P1: schema
  foundation..."), and `git show 1c82521:schemas/README.md | grep uniqueItems`
  returns nothing. The keyword was added to the engine, the tests and the
  README's own surrounding structure in the SAME phase that first wrote
  `schemas/README.md`, and the README row was never added, at M3-P1's own
  merge, thirteen findings and a delta verification notwithstanding. It has
  not been touched since across M3 and M4.
- reachability (DR-0027): `schemas/README.md` ships (`schemas/` is a listed
  M3 shipped deliverable, CLAUDE.md's "Where things live" section). Its own
  stated purpose, and the purpose src/validate.ts's header comment ascribes
  to it, is to be the one place a schema author (inside this project or in a
  future project consuming the kernel) reads to learn what they may put in a
  Tiphys schema. A reader following that document is told a narrower
  vocabulary than the one actually enforced and shipped in five schemas
  already. This is the exact SHAPE of drift this project has hard gates
  against everywhere else it occurs (rendered `CLAUDE.md` gate block,
  `brief-drift`) and it is unprotected here because nothing ever pointed a
  drift check at this one pair of artifacts.
- concrete fix: add a `uniqueItems` row to `schemas/README.md`'s vocabulary
  table (the shortest fix), and, to stop this recurring the way the CLAUDE.md
  block's own history shows a hand-maintained list eventually will, add a
  test asserting the README's table of backtick-quoted keyword names equals
  `AUTHORING_VOCABULARY` as a set, the same shape `test/schemas.test.ts:267`
  already uses for the code-side half of this same contract.

### FIND-01 (low): stale comment describing the pre-M4-P10 escalation rule

- file: src/checks.ts, around line 2503-2505
- The comment on `verdictFindingReferencesResolve` reads: "The verdict schema
  ships exactly ONE rule that can force a verdict off APPROVE: a `findings[]`
  set containing a `high` or `critical` entry must carry FIX-ROUND-NEEDED."
  M4-P10 widened that root `if`/`then` to `[medium, high, critical]`
  (schemas/verdict.schema.json's own `$comment` on the root `if`, and
  src/checks.ts:4574 correctly says so in the SIBLING check's comment). This
  comment was not updated with it.
- reachability: comment only. `verdictFindingReferencesResolve`'s own body
  (src/checks.ts:2528-2553) does not read `severity` at all, so the stale
  text has no behavioral consequence; the escalation rule itself is correctly
  `[medium, high, critical]` at the schema and is correctly exercised in
  finding 3 above.
- concrete fix: reword the sentence to "a `findings[]` set containing a
  `medium`, `high` or `critical` entry", matching src/checks.ts:4574's wording,
  or delete the enumeration and point at `BLOCKING_SEVERITIES` by name so a
  future widening cannot leave this copy behind again.

## Hazard tables walked, phase by phase

For each hazard item, what would have reddened, and whether it does at this
head. "MET" means I reproduced the guarding behaviour myself (see the numbered
list above for the commands); "not re-derived" means I read the mechanism and
found it structurally intact but did not build a fresh fixture for that exact
row, because the row is the same mechanism as one I did reproduce.

**M3-P1** (schemas/, src/validate.ts, the validator):

| Hazard item | Reddens against | This head |
|---|---|---|
| permissive schema, invalid fixtures are syntax errors not plausible instances | criteria 3-4 | MET: additionalProperties sweep found no gap outside if/then narrowing; smuggled-field fixture reproduced the refusal (list item 1 above) |
| `additionalProperties: false` omitted at one nested level | criterion 5 | MET, same evidence |
| a derived check registered but never reached | criterion 4c | MET: `SKIPPED <id> no context` with nonzero exit reproduced against a real verdict document with no `--context` (dual-review-decorrelation, verdict-criteria-complete, verdict-deviations-judged, verdict-hazard-classes-addressed, verdict-pair-approves all printed and exit was 1) |
| Ajv policy differing from DR-0013 (coercion, default-insertion) | DR-0013 4, 6 | not re-derived this sweep; src/validate.ts's own header states the Ajv instantiation options and test/validate.test.ts (part of the 1341 green) exercises them; no code path in this module constructs Ajv with any option other than the documented set (read, not fixture-tested this round) |
| Ajv wording leaking into a public contract | DR-0013 8 | not re-derived; `DIAGNOSTIC_MESSAGES`/`untranslated`/`uncompilable` in src/validate.ts are structured so that every reachable Ajv error either has a named translation or an explicitly Tiphys-authored fallback sentence (read, not fixture-tested this round) |
| named pipe at a hand-authored path | criterion 5d | MET, both arms, list item 2 above |
| **`schemas/README.md` documents a narrower vocabulary than the engine enforces and five shipped schemas use** | not a hazard-table row in the plan text (day-one gap, never named) | **NOT MET, see FIND-02** |

**M4-P10** (verdict head, medium escalation, first non-vacuous dual review),
composed with **M4-P11** (single-family exception, edits the same functions):

| Hazard item | Reddens against | This head |
|---|---|---|
| `head` optional, directory convention survives | criterion 2 | MET: schema requires `head`, pattern `^[0-9a-f]{40}$`; a document lacking it fails schema validation (read + the schema text itself, not re-fixtured this round since list items 3-4 already exercise the head-bearing path end to end) |
| two spellings of one head read as two, or the reverse | criterion 3 | MET: `headKeyOf` refuses an abbreviated sha outright (src/checks.ts:3856-3861) and folds case through `establishField`; list item 4 reproduced the "different heads never compared" direction directly against a real corpus |
| medium widening in the schema only | criterion 4 | MET, list item 3 |
| medium widening in the check only | criterion 5 | MET, list item 3 (`verdict-pair-approves` fired on the real corpus, not merely the schema) |
| a check that counts verdicts and never reads them | criterion 6 | MET: `blockingFindings` reads `severity` per finding, not a count (src/checks.ts:5063-5120), and list item 3's reproduction shows the VALUE being read, not merely counted |
| a verdict pair for different heads compared as a pair | criterion 3 | MET, list item 4 |
| gate never running non-vacuously | criterion 7 | not re-derived this sweep: I did not run `scripts/check-dual-review.mjs` against this repository's own `delivery/review/` directory to confirm the gate's real committed pair for M4-P10 itself still reports green with `units: 2`; this is a gap, named in "what I did not reach" below |
| disk-vs-commit split reopened by M4-P11 touching the same functions | not in either phase's own table; this is the composition question my brief exists to ask | MET: `singleFamilyException` pins to `loaded.source.refSha` rather than re-resolving `HEAD` (src/checks.ts:4416-4430), and `establishDelegatedRegime` uses `readContextDocumentAt`/`contextDocumentPresentAt` throughout, never a bare disk read, for every regime decision both checks share |

**M3-P8** (tuition flow, mechanism index):

| Hazard item | This head |
|---|---|
| `kernel-relevant: true` with no `structural-consequence` validates | MET refused: reproduced directly (list item above the findings section) |
| `tuition-target-exists` registered for `tuition` only, leaving the projected `mechanism-index` unchecked | MET: `mechanismRuleEvidenceResolves` carries `alsoTypes: ["mechanism-index"]` (src/checks.ts:2694-2697), so the shared-definition asymmetry T-018 describes does not apply here |
| a citation resolvable in this repository but not in an installed package silently passing or silently failing | MET (read, not fixture-tested this round): `unresolvableCitationTree` reports rather than either silently passing or hard-failing, with the measured pre-fix defect (16 INVALID lines from a pristine `npm pack`) recorded in the check's own comment as the reproduction that motivated it |

**M3-P2, M4-P13, M4-P14** (gate registry promotion, migration re-disposition,
gate class vocabulary): the load-bearing mechanics of these three phases
(SC-011 precondition semantics, M2-C-2/M2-C-3, the registry-to-CLAUDE.md
render, the gate-class declaration check) live in `src/gates/run.ts`,
`src/gates/scope.ts` and `scripts/render-agent-rules-gates.mjs`, none of which
are in this group's paths; the `final-sweep` scratch directory already carries
a separate `clean-room-final-gates-*` pair, which is where that mechanism
belongs. What IS in this group from these three phases is the schema files
they touch (`schemas/gate-registry.schema.json`,
`schemas/assurance-modes.schema.json`) and I audited those for
`additionalProperties` completeness along with every other shipped schema
(list item 1); no gap found. M4-P30's one touch to this group
(`schemas/assurance-modes.schema.json`'s `max-fix-rounds-after-review`
description) is a corrected description string; current text read and it no
longer says "so two" (confirmed by reading the file at this head, not quoted
verbatim here because it is not disputed).

## What I did not reach

1. **`scripts/check-dual-review.mjs` against this repository's own
   `delivery/review/` directory for M4-P10's own two real verdicts**, which
   would settle M4-P10 criterion 7 (the gate's first non-vacuous run) directly
   rather than through the mechanism I built a scratch fixture for. I verified
   the MECHANISM behaves correctly on a constructed corpus; I did not verify
   the REAL corpus still produces `units: 2` and green at this head. Reason:
   time budget went to the composition question (M4-P10/M4-P11 disk-vs-commit
   reopening) and to FIND-02, which is scoped wider (all of M3-P1 onward)
   than a single phase's own gate run.
2. **Ajv instantiation options and the Ajv-wording-leak guard** (DR-0013 4, 6,
   8): read, not independently fixture-tested this round. `test/validate.test.ts`
   is part of the 1341 green tests and covers this ground; I did not add a
   fresh mutation of my own against it.
3. **`src/gates/schemas/*.json`** (the M2-era schemas validated by the
   SEPARATE minimal engine in `src/gates/validate.ts`): I confirmed the two
   engines are DELIBERATELY separate (DR-0013 clause 6 retires the M2 engine's
   role for M3+ artifact types but M2's own gate-config schemas keep using it,
   per src/gates/validate.ts's own header) and I did not run the M2 engine's
   equivalent additionalProperties/keyword-closure audit against
   `src/gates/schemas/*.json`. Given the M2 engine's CLOSED KEYWORD SET is
   enforced at schema COMPILATION (unknown keyword is a load error, per its
   header), the failure mode this group's other schemas are vulnerable to
   (silent keyword drop) is structurally harder to reach there, but I have not
   proven that with a fixture.
4. **Whether `AUTHORING_VOCABULARY` vs `MESSAGE_BY_KEYWORD` (src/validate.ts
   lines 111 and 321) ever diverges in the other direction** (a keyword the
   engine can translate but that no schema is allowed to author, beyond the
   two already-known reserved ones, `maximum`/`maxItems`, which the file's own
   comments explain are reserved rather than dead). I read this and consider
   it explained rather than a gap, but I did not write a test asserting it.

## Criteria walked

| id | quote | evidence | met |
|---|---|---|---|
| c-additionalProperties | "`additionalProperties: false` omitted at ONE nested object level" (delivery/plan/kernel-plan-m3.md:1451, M3-P1 hazard table) | script walk of every schemas/*.json node + smuggled-field fixture, both quoted above | true |
| c-named-pipe | "a named pipe at a hand-authored path handed to `validate`" (delivery/plan/kernel-plan-m3.md:1460) | mkfifo reproduction, both the file and `--context` arms, list item 2 | true |
| c-head-pair | "Two verdicts in one directory carrying DIFFERENT `head` values are not compared as a pair" (delivery/plan/kernel-plan-m4.md:1696-1701, M4-P10 criterion 3) | scratch git corpus, list item 4 | true |
| c-medium-escalation | "A verdict reading `APPROVE` beside a finding at `severity: medium` fails validation" (delivery/plan/kernel-plan-m4.md:1702-1705, M4-P10 criterion 4) | scratch git corpus, list item 3, both the single-document schema form and the cross-document `verdict-pair-approves` form | true |
| c-disk-commit-split | the declaration and the falsifiers' corpus must come "out of ONE TREE by construction" (src/checks.ts:4420-4423, M4-P11 fix round 1 comment) | read `singleFamilyException`, `establishDelegatedRegime`, `readContextDocumentAt`, `resolveCorpusSource` end to end; all regime and declaration reads for both merge-precondition checks go through the one resolved `VerdictCorpusSource` | true |
| c-tuition-conditional | "an entry with `kernel-relevant: true` must carry at least one `structural-consequence`" (schemas/tuition.schema.json's own `$comment`) | fixture reproduction, findings section | true |
| c-suite-green | "node --test exits 0 and reports N tests, N > 0" (CLAUDE.md's falsifiable-acceptance-criteria rule) | full suite run, quoted above: 1341/1341, 0 skipped, exit 0 | true |
| c-readme-vocabulary | "documented in `schemas/README.md`" (src/validate.ts:105, describing `AUTHORING_VOCABULARY`) | mechanical diff of the two lists, provenance via `git log -S`, FIND-02 | **false** |
| c-comment-accuracy | (no external quote; internal self-consistency of src/checks.ts's own comments against the schema they describe) | FIND-01 | **false**, low severity |

## Deviations judged

Empty by construction for this document, and the reason is stated rather than
left as a silent zero: `deviations-judged[]` judges declarations one
IMPLEMENTER made in ONE phase's work history against that phase's plan
intent. This document is a final-state sweep over seven phases' worth of
composed code, not a single-phase review with one work history in front of
it, so there is no single `deviations[]` list to walk. Per-phase deviations
were judged at the time by that phase's own two clean-room reviews, which are
not re-litigated here (DR-0047 does not reopen a decided per-phase review; it
adds one more pass over the composed result).

## Escalations

1. **The hazard-classes-addressed field is populated below using class labels
   I derived from each phase's own plan-text hazard-class prose, not resolved
   against a machine-readable `plan.yaml`'s `hazard-classes[].id` values.**
   `verdict-hazard-classes-addressed` (Kind B) would need `--context` pointed
   at a single phase's resolved plan and work history, and this document
   reviews seven phases against one schema-mandated `phase` field. I ran my
   own document through `tiphys validate --type verdict` WITHOUT `--context`
   for this reason; the five context-requiring checks report `SKIPPED ...
   no context` and the exit code is nonzero for that reason alone, not
   because of a defect in the checks themselves (their SKIPPED-plus-nonzero
   behaviour is itself criterion 4c of M3-P1 and I confirmed it fires
   correctly against a real verdict document above). Recording this rather
   than silently working around it, per the instruction not to invent a
   criterion walk not actually done.
2. **I did not settle M4-P10 criterion 7 against the real repository corpus**
   (see "what I did not reach" item 1). This is a gap in MY coverage, not a
   claimed defect.
3. **The `git log -S` provenance for FIND-02 is a single grep-shaped command
   against one exact string (`"uniqueItems",` with the trailing comma as it
   appears in the array literal).** I did not additionally search for an
   earlier, differently-formatted addition of the same keyword that a
   reformatting commit might have since obscured. Given the file's `git blame`
   shows M3-P1 as the file's own founding commit for this array, there is no
   earlier commit this search could have missed.

## Verdict JSON, validated and negative-controlled

Verdict written to /tmp/claude-0/final-sweep/verdict-final-validation-hazard.json.

```
$ node bin/tiphys.ts validate --type auto verdict-final-validation-hazard.json
SKIPPED dual-review-decorrelation no context
SKIPPED verdict-criteria-complete no context
SKIPPED verdict-deviations-judged no context
SKIPPED verdict-hazard-classes-addressed no context
SKIPPED verdict-pair-approves no context
EXIT=1
```

Zero `INVALID` lines: the document is schema-valid. The five SKIPPED lines
and the resulting exit 1 are the context-required Kind B checks correctly
declining to run without `--context`, exactly the behaviour criterion 4c of
M3-P1 asks for and that I reproduced independently above; they are not a
defect in this document.

Negative controls, both fired correctly (the instrument can go red):

```
$ # flip verdict to APPROVE while FIND-02 stays at severity: medium
INVALID # value does not satisfy the requirements its own shape triggers here
INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"

$ # truncate head to a short sha
INVALID #/head value "ad2428b" does not match the required pattern ^[0-9a-f]{40}$
```

## Summary

Verdict: **FIX-ROUND-NEEDED**. One MEDIUM finding (FIND-02: `schemas/README.md`
has documented an incomplete authoring vocabulary since the phase that wrote
it, missing `uniqueItems`, which is live in five shipped schemas and is the
one document DR-0013 clause 7 and the engine's own header comment both point
to as authoritative). One LOW finding (FIND-01: a stale comment in
src/checks.ts describing the pre-M4-P10 escalation severities).

Everything else I tried to break in this group held, including the
composition question the sweep exists to ask: whether M4-P11's edits to the
same functions M4-P10 shipped reopened the disk-vs-commit split this file's
own comments record as having been fixed three times before. It has not been
reopened; every merge-precondition read on this path resolves through one
shared `VerdictCorpusSource`. An APPROVE with zero findings would have been a
failed review by this brief's own standard; this review is not that, and
both findings are reproduced rather than asserted, with a concrete fix each.

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
  "produced-by": "Anthropic Claude Sonnet 5",
  "framing": "evidence-integrity",
  "review-contract": "hazard",
  "findings": [
    {
      "id": "FIND-02",
      "severity": "medium",
      "evidence": [
        "src/validate.ts:104-105 (module header) states AUTHORING_VOCABULARY is documented in schemas/README.md",
        "src/validate.ts:111-128, AUTHORING_VOCABULARY has 16 entries including uniqueItems",
        "schemas/README.md's declared authoring vocabulary table (read at this head) has 15 rows and no uniqueItems row",
        "grep -rl uniqueItems schemas/*.json names assurance-modes.schema.json, checklist.schema.json, final-report.schema.json, gate-registry.schema.json, role-model-config.schema.json (5 shipped schemas use it)",
        "test/schemas.test.ts:187-195 carries uniqueItems' positive/negative fixture, and test/schemas.test.ts:267's meta-test derives coverage from AUTHORING_VOCABULARY, never from schemas/README.md",
        "git log -S'\"uniqueItems\",' -- src/validate.ts names exactly one commit, 1c82521 (M3-P1's own merge)",
        "git show 1c82521:schemas/README.md | grep uniqueItems returns nothing, so the row was never added at M3-P1 and has not been added since"
      ],
      "concrete-fix": "Add a uniqueItems row to schemas/README.md's authoring-vocabulary table now, and add a test asserting the README table's keyword set equals AUTHORING_VOCABULARY (the same shape test/schemas.test.ts:267 already uses for the code-side half of this contract), so a future keyword addition cannot leave this file behind again.",
      "analysis": "src/validate.ts's own header comment asserts this file is the documentation for AUTHORING_VOCABULARY, and DR-0013 clause 7 (quoted in the README's own text) frames every vocabulary member as requiring a documented, deliberate entry here. This has been false since the phase that wrote both files, survived that phase's own dual clean-room review and delta verification, and has not been touched since across M3 and M4. It reaches a shipped artifact directly: schemas/README.md ships as part of the schemas/ directory and is the one place a schema author is pointed to for the true vocabulary."
    },
    {
      "id": "FIND-01",
      "severity": "low",
      "evidence": [
        "src/checks.ts around line 2503-2505 (verdictFindingReferencesResolve's header comment): 'The verdict schema ships exactly ONE rule that can force a verdict off APPROVE: a findings[] set containing a high or critical entry must carry FIX-ROUND-NEEDED.'",
        "schemas/verdict.schema.json's own $comment on the root if widened the escalation contains-enum from [high, critical] to [medium, high, critical] (M4-P10)",
        "src/checks.ts:4574 (the sibling check's comment, dualReviewDecorrelation) correctly states the widening",
        "verdictFindingReferencesResolve's run() body, src/checks.ts:2528-2553, does not read severity at all, so the stale text has no behavioral consequence"
      ],
      "concrete-fix": "Reword the sentence at src/checks.ts:2503-2505 to name medium, high or critical, matching src/checks.ts:4574's wording, or replace the literal enumeration with a reference to BLOCKING_SEVERITIES by name."
    }
  ],
  "criteria": [
    {
      "id": "c-additionalProperties",
      "quote": "additionalProperties: false omitted at ONE nested object level",
      "evidence": [
        "script walk of every schemas/*.json node for type:object+properties with no sibling additionalProperties: every hit was an if/then/oneOf narrowing subschema, never a genuine open object",
        "fixture verdict-smuggle.json with findings[0].smuggled-field and criteria[0].smuggled-criterion-field: both refused, INVALID lines quoted in the review markdown"
      ],
      "met": true
    },
    {
      "id": "c-named-pipe",
      "quote": "a named pipe at a hand-authored path handed to validate",
      "evidence": [
        "mkfifo fixtures/named-pipe.json; timeout 10 node bin/tiphys.ts validate --type verdict fixtures/named-pipe.json -> refused in well under 10s, exit 1",
        "same fifo passed as --context: refused as 'not a directory', exit 1, well under 10s"
      ],
      "met": true
    },
    {
      "id": "c-head-pair",
      "quote": "Two verdicts in one directory carrying DIFFERENT head values are not compared as a pair",
      "evidence": [
        "scratch git corpus with r1 (head 111...1) and r2 (head 222...2), both otherwise clean APPROVE: validating r1 reports 'only 1 verdict document(s) exist ... for phase TEST-P1 at head 111...1' from both dual-review-decorrelation and verdict-pair-approves"
      ],
      "met": true
    },
    {
      "id": "c-medium-escalation",
      "quote": "A verdict reading APPROVE beside a finding at severity: medium fails validation",
      "evidence": [
        "single-document schema form: verdict-ok.json with a medium finding and verdict APPROVE fails with 'value does not satisfy the requirements its own shape triggers here' and 'value APPROVE is not one of the permitted values FIX-ROUND-NEEDED'",
        "cross-document form: r2.json (clean APPROVE, no findings of its own) committed alongside r1.json (medium finding) for the same phase/head fails verdict-pair-approves naming r1.json's finding explicitly"
      ],
      "met": true
    },
    {
      "id": "c-disk-commit-split",
      "quote": "a declaration and the evidence that refutes it come out of ONE TREE by construction (src/checks.ts:4420-4423)",
      "evidence": [
        "read singleFamilyException (src/checks.ts:4412-4450): declarationRef is loaded.source.refSha when source.kind is commit, never a fresh HEAD re-resolution",
        "read establishDelegatedRegime (src/checks.ts:3965-4040+): every regime/charter/modes read goes through readContextDocumentAt/contextDocumentPresentAt with the shared resolved source, never a bare disk read",
        "the one disk read, treeDeclaresReviewFamilies (src/checks.ts:4217-4224), only feeds the absent/error branches of ReviewFamiliesReading, never the declared branch"
      ],
      "met": true
    },
    {
      "id": "c-tuition-conditional",
      "quote": "an entry with kernel-relevant: true must carry at least one structural-consequence (schemas/tuition.schema.json's own $comment)",
      "evidence": [
        "fixture tuition-bad.json: kernel-relevant true, no structural-consequence -> 'required property structural-consequence is missing', exit 1"
      ],
      "met": true
    },
    {
      "id": "c-suite-green",
      "quote": "node --test exits 0 and reports N tests, N > 0 (CLAUDE.md's falsifiable-acceptance-criteria rule)",
      "evidence": [
        "npm test (node v26.6.0, dist/ built, npm test invocation): 1341 tests, 1341 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo, exit 0, duration_ms 706326.631056; git status --porcelain empty afterward"
      ],
      "met": true
    },
    {
      "id": "c-readme-vocabulary",
      "quote": "documented in schemas/README.md (src/validate.ts:105, describing AUTHORING_VOCABULARY)",
      "evidence": [
        "mechanical extraction and diff: AUTHORING_VOCABULARY has 16 entries, schemas/README.md's table documents 15 (missing uniqueItems)",
        "git log -S'\"uniqueItems\",' -- src/validate.ts and git show of that commit's schemas/README.md: never documented, since M3-P1's own merge"
      ],
      "met": false
    },
    {
      "id": "c-comment-accuracy",
      "quote": "internal consistency of src/checks.ts's own comments against the schema behaviour they describe",
      "evidence": [
        "src/checks.ts:2503-2505 still says the escalation fires on high or critical; src/checks.ts:4574 and schemas/verdict.schema.json's root if both correctly say medium, high, critical"
      ],
      "met": false
    }
  ],
  "deviations-judged": [],
  "hazard-classes-addressed": [
    {
      "class-id": "m3-p1-permissive-schema-or-omitted-additionalProperties",
      "probed": "Programmatic walk of every schemas/*.json node for a type:object node with properties and no sibling additionalProperties; direct fixture reproduction of a smuggled nested field being refused.",
      "cleared-because": "No gap found outside if/then/oneOf narrowing subschemas, which do not relax the base object's closure; the smuggled-field fixture was refused at both a top-level-adjacent and a two-deep nested pointer."
    },
    {
      "class-id": "m3-p1-named-pipe-blocks-validate",
      "probed": "Real mkfifo for both the file argument and the --context directory argument, run under a 10s timeout.",
      "cleared-because": "Both arms refused immediately naming the path and the observed type, well inside the timeout; neither blocked."
    },
    {
      "class-id": "m4-p10-merge-precondition-reads-as-checked-and-is-not",
      "probed": "Built a scratch git repository with a committed delivery/review/ carrying two verdicts for one phase and head, one with a committed sibling medium finding, and a second scenario with two verdicts differing only in head; validated both cross-document behaviours directly through the shipped CLI.",
      "cleared-because": "The pair mechanism correctly refused on the sibling's medium finding even though the document being validated carried none of its own, and correctly refused to compare two different-head verdicts as a pair, each forming its own group of one."
    },
    {
      "class-id": "m4-p11-exception-mechanism-reopens-the-disk-vs-commit-split",
      "probed": "Read singleFamilyException, establishDelegatedRegime, readContextDocumentAt, contextDocumentPresentAt and resolveCorpusSource end to end, tracing every charter/modes/declaration read on the merge-precondition path back to one resolved VerdictCorpusSource per invocation.",
      "cleared-because": "Every regime and declaration read for both verdict-pair-approves and dual-review-decorrelation goes through the shared resolved source; the one remaining disk read is structurally confined to the absent/error branches and cannot produce a declared exception."
    },
    {
      "class-id": "m3-p8-tuition-kernel-relevant-with-no-structural-consequence",
      "probed": "Direct fixture: kernel-relevant true with structural-consequence omitted.",
      "cleared-because": "Schema-level if/then refused the fixture, naming the missing property."
    },
    {
      "class-id": "shipped-vocabulary-documentation-drift",
      "probed": "Mechanical diff of src/validate.ts's AUTHORING_VOCABULARY against schemas/README.md's declared-vocabulary table, cross-checked with git log -S provenance on the array literal and a direct read of the keyword's five shipped schema usages.",
      "finding": "FIND-02"
    },
    {
      "class-id": "internal-comment-accuracy-of-escalation-rule-description",
      "probed": "Read every comment in src/checks.ts naming the verdict schema's escalation severities and cross-checked each against the shipped schema text and the sibling check's own comment.",
      "finding": "FIND-01"
    }
  ]
}

```
