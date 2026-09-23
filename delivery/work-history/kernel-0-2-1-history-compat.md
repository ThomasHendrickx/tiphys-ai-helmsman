# Work history: kernel 0.2.1, old history validates again

Branch: claude/kernel-0-2-1-history-compat, cut from origin/main at 6dc5b06.
Not a phase branch (the phase pattern test prints false).

Owner rule (DR-0054): Tiphys judges current and future work, never history.

## Log

- Branch created from origin/main 6dc5b06. Reading mandated material next.
- Read DR-0053 and DR-0054 (on origin/claude/m5-orchestrator-paperwork-2,
  not copied), DR-0012, DR-0038, DR-0047, CLAUDE.md.
- Toolchain for every command below unless stated: node v26.6.0 at
  /tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin,
  `npm ci` exit 0, `npm run build` exit 0.

## Reproduction of the defect

The 49 pulse verdicts (`delivery/review/*-criteria*.yaml`, `*-hazard*.yaml`
in /home/user/pulse at d4e491b) were copied to scratch and each run through
`node bin/tiphys.ts validate --type verdict <file>` with no context.

| kernel | files with at least one INVALID line |
|---|---|
| v0.1.0 (tag, scratch worktree, its own `npm ci`) | 7 |
| origin/main 6dc5b06 | 49 |

Diagnostic counts on main (a file can carry several):

| diagnostic | files |
|---|---|
| `INVALID #/head required property head is missing` | 49 |
| `INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"` with `INVALID # value does not satisfy the requirements its own shape triggers here` | 10 |
| the seven v0.1.0 failures (below) | 7 |

The seven that were already invalid under v0.1.0 are the same seven on main:
m3-p14-hazard-round2, m3-p14-hazard, m3-p2-hazard, m3-p3-hazard-round3,
m3-p3-hazard-round4, m3-p6-hazard, m3-p7-hazard. Each declares
`kind: finding`, not `kind: verdict`, and has the shape of a findings list
rather than a verdict: no `phase`, `framing`, `review-contract`, `criteria`
or `deviations-judged`, and every finding carries `concrete-edit` where the
verdict schema names the field `concrete-fix`. They are not verdicts written
to an older verdict schema; they are a different document type validated as
a verdict. They are not forced green here. Note that `kind: finding` means
the gates' corpus loader skips them as non-verdicts (readVerdictKind), so
they do not affect any merge gate either.

The ten APPROVE rejections are: m1-p1-criteria, m1-p2-criteria,
m3-p11-criteria-round2, m3-p13-criteria-round2, m3-p13-hazard-round2,
m3-p18-criteria-round2, m3-p2-criteria, m3-p3-criteria-round4,
m3-p7-criteria, m3-p7-hazard-round2.

A pre-existing fact that is NOT this defect and is recorded so the owner's
"validation returns false" is not over-read: `tiphys validate --type verdict`
with no `--context` exits 1 on EVERY verdict, on v0.1.0 and on main alike,
because the context-requiring derived checks print `SKIPPED ... no context`
and a skipped check is a failure by design (src/commands/validate.ts:480).
Measured on main with a head added to a pulse verdict: no INVALID line,
five SKIPPED lines, rc=1. So after this change the pulse history carries no
INVALID line, and the command still exits 1 without a context. See open
questions.

Severities in the ten (grep of `severity:` per file): every one reads
`verdict: APPROVE` beside at least one `medium` finding and no `high` or
`critical` finding. So all ten satisfied v0.1.0's escalation rule
([high, critical]) and are rejected only by M4-P10's widening to medium.

## The mechanism

Named as the fix-round contract asks, not as the finding: **an admission rule
for CURRENT work (is this document evidence toward a merge now?) was written
where it also judges HISTORY (is this document well formed?)**. Three
instances were found, each by the derivation below, not by the brief's list:

1. The verdict schema required `head` (M4-P10). Every document written
   before the field existed is malformed by construction.
2. The verdict schema's escalation rule was widened from [high, critical] to
   [medium, high, critical] (M4-P10) so the schema would carry DR-0012
   condition 2. Condition 2 bars a MERGE; it does not make an APPROVE that
   records a medium finding self-contradictory. Ten pulse documents.
3. The review-families falsifiers (DR-0038) read every verdict committed
   under `delivery/` in all history, so a declaration added late is
   contradicted by reviews written before anyone declared anything.

And one gate-side consequence of instance 1: `check-dual-review` KEPT a
head-less verdict in its corpus as "unkeyed" so the derived check would
refuse it. Once the schema permits absence, that turns every future run on a
consumer with head-less history into a red run about history. That is the
same mechanism at the gate, and it is fixed there (exclusion by name).

## Derivation

Every call site of the corpus loaders and of every function that decides
whether a verdict is admitted, run at HEAD after the change:

```
grep -rn "loadCommittedVerdicts(\|loadPaperworkVerdicts(\|readReviewFamilies(\|singleFamilyException(\|partitionByAuditedHead(\|headGroupFor(\|headKeyOf(\|relateDeclaredHead(\|declaresNoHead(\|scopeToDeclaration(" src scripts --include=*.ts --include=*.mjs
```

Full output:

```
src/gates/merge-preconditions.ts:1187:  const families = readReviewFamilies(contextDirectory);
src/gates/merge-preconditions.ts:1191:  const corpus = loadCommittedVerdicts(contextDirectory, source);
src/gates/merge-preconditions.ts:1239:    if (declaresNoHead(entry.record)) {
src/gates/merge-preconditions.ts:1244:    const relation = relateDeclaredHead(contextDirectory, declared, head);
src/checks.ts:3180:export function loadCommittedVerdicts(
src/checks.ts:3224:function loadPaperworkVerdicts(
src/checks.ts:3911:function headKeyOf(record: Record<string, unknown> | undefined, where: string): HeadKey {
src/checks.ts:3947:function headGroupFor(
src/checks.ts:3979:    const key = headKeyOf(candidate.record, candidate.path);
src/checks.ts:4186:export function declaresNoHead(record: Record<string, unknown> | undefined): boolean {
src/checks.ts:4266:export function relateDeclaredHead(
src/checks.ts:4395:export function partitionByAuditedHead(
src/checks.ts:4421:    if (declaresNoHead(candidate.record)) {
src/checks.ts:4425:    const key = headKeyOf(candidate.record, candidate.path);
src/checks.ts:4431:    const relation = relateDeclaredHead(contextDirectory, key.value, auditedHead);
src/checks.ts:4820:export function readReviewFamilies(
src/checks.ts:5064:function scopeToDeclaration(
src/checks.ts:5168:export function singleFamilyException(
src/checks.ts:5187:  const reading = readReviewFamilies(contextDirectory, declarationRef);
src/checks.ts:5212:      ? loadPaperworkVerdicts(contextDirectory, loaded.source.ref, loaded.source.refSha)
src/checks.ts:5236:      ? scopeToDeclaration(contextDirectory, paperwork.source.refSha, paperwork.verdicts)
src/checks.ts:5457:    const committed = loadCommittedVerdicts(contextDirectory, source);
src/checks.ts:5477:    const exception = singleFamilyException(contextDirectory, committed);
src/checks.ts:5506:    const ownHead = headKeyOf(verdict, "this verdict");
src/checks.ts:5514:    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
src/checks.ts:5763:    const ownHead = headKeyOf(verdict, "this verdict");
src/checks.ts:5772:    const committed = loadCommittedVerdicts(contextDirectory, source);
src/checks.ts:5779:    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
scripts/check-dual-review.mjs:276:  const loaded = loadCommittedVerdicts(directory);
scripts/check-dual-review.mjs:291:      ? partitionByAuditedHead(directory, loaded.verdicts, anchor.head)
scripts/check-dual-review.mjs:407:  const familyReading = readReviewFamilies(directory);
```

What each site got:

| site | 0.2.0 on history | 0.2.1 |
|---|---|---|
| merge-preconditions.ts:1239 (readReviewCorpus) | head-less reached `relateDeclaredHead("")`, excluded as "declares head , which does not resolve" | excluded by name as "declares no head" before any relation |
| checks.ts:4421 (partitionByAuditedHead, used by check-dual-review.mjs:291) | kept as unkeyed and refused: red on every run for a consumer with head-less history | excluded by name as off-head, not admitted |
| checks.ts:5236 (singleFamilyException, reached from check-dual-review.mjs:407 and the derived check at checks.ts:5477) | whole-history corpus | only verdicts committed at or after the first declaration commit |
| checks.ts:5506, 5514, 5763, 5779 (the two derived checks' own head and group) | unchanged | unchanged, deliberately: see open question 1 |
| merge-preconditions.ts:1187, checks.ts:5187 (readReviewFamilies) | reads the declaration only | unchanged: reading the declaration is not judging history |

The schema side was derived separately, because a schema is not a call site:

```
git diff --stat v0.1.0 origin/main -- schemas/     # 9 files, 622 insertions, 5 deletions
grep -rn '"required"' schemas/*.json               # every required list
```

Of the nine changed schemas, two REMOVE acceptance from documents 0.1.0
accepted: `verdict.schema.json` (instances 1 and 2) and
`final-report.schema.json`, which now requires `delivered-outcome` (M5-P2).
The rest are additive: new optional charter fields, new document types, and
one description string in `assurance-modes.schema.json`. `final-report` is
NOT changed here: see open question 5.

What the derivation did NOT cover:

- `test/` and `witness/`: tests that asserted the old behaviour were found by
  running the suite, not by grep. Eleven failed after the implementation and
  were rewritten or repointed (see Deviations).
- The CLI's `validate --context` path reaches the derived checks
  (checks.ts:5506, 5763), which are on the list, but I did not enumerate
  every CLI command that can call the validator with a context.
- Consumers other than pulse. The fixture is seven of pulse's 49 documents;
  no other consumer's history was examined.
- Non-verdict document types: only their schema drift since v0.1.0 was read,
  not their gate readers.

## Decisions

- **Head absent is history; head present and wrong is still malformed.**
  `declaresNoHead` is true only when the key is absent (src/checks.ts:4186).
  An abbreviated or uppercase head keeps the old refusal (schema pattern, and
  unkeyed at the gate), because a document that stated its head wrongly was
  written after the rule existed.
- **Medium moved, it was not dropped.** The schema's escalation enum is back
  to [high, critical], the M3-P7 shape rule. `verdict-pair-approves` keeps
  BLOCKING_SEVERITIES [medium, high, critical], so a merge with an unresolved
  medium finding is refused as before. The brief's rule was "if it is a
  merge-admission rule, move it to the gate". DR-0012 condition 2 bars a
  merge, so it is an admission rule. The gate already enforced it, so the
  move is a removal from the schema plus a test that the gate still refuses
  (test/verdict-head.test.ts, "a verdict carrying a blocking finding reddens
  the pair predicate, which since 0.2.1 is the only layer that refuses
  medium").
- **"Committed before the declaration" is decided by blob content, not by
  path or date.** A verdict is history when its exact blob was under
  `delivery/` in a parent of the first commit whose charter carries
  `review-families`. Edited after the declaration: read. Renamed without an
  edit: not read. Dates are author-writable and are not used. At a shallow
  boundary git reports no parents, so every verdict is read: stricter, not
  looser.
- **The declaration commit's parent is the REAL parent.** Measured before
  relying on it, in a scratch repository with a commit between the history
  and the declaration that touches neither: the path-limited
  `git log --full-history --format=%H %P -- ./charter.yaml` printed the real
  parent, not the previous commit that touched the charter. Pinned by the
  capture's `charter-history` entry, whose declaration line names
  `<unrelated>`, not `<history>`.

## Criteria walk

1. **head optional, merge gates exclude head-less by name, test red if the
   gate-side check is removed.** Schema: `head` out of `required`. Gates:
   src/checks.ts:4421 and src/gates/merge-preconditions.ts:1239. Tests in
   test/history-compat.test.ts: "a dual-tier change whose only reviews
   declare no head is red at check-dual-review, and each is excluded by name"
   and "merge-preconditions excludes a verdict that declares no head by name
   and never counts it toward the two reviews". The dangerous state is an
   APPROVING, fully decorrelated pair with its head lines removed. Each test
   carries a control: the same pair WITH heads is green at check-dual-review
   and reaches the network condition at merge-preconditions. So red in the
   head-less arm is the exclusion working, not some unrelated refusal. The
   first test also runs a real pulse pair (m1-p1). Red witness:
   witness/kernel-0-2-1-headless-verdict-never-admitted.json, three
   mutations (admit in checks.ts, admit in merge-preconditions.ts,
   `declaresNoHead` always false). Result under Gates.
2. **conditional APPROVE rule.** An admission rule, moved (Decisions). Which
   of the ten pulse documents are malformed under 0.2.1: none of them. All
   ten are APPROVE beside a medium finding with no high or critical finding
   (Severities, above).
3. **falsifiers read only from the declaration commit.** Tests: "committed
   history naming several families before review-families was declared does
   not contradict the declaration" (three real pulse families before the
   declaration; not-applicable by declaration, exit 20), "a second family
   committed after review-families was declared still contradicts it" (red,
   exit 1), and "a history verdict edited after review-families was declared
   is current work and is read again" (red, exit 1). Red witness:
   witness/kernel-0-2-1-review-families-scoped-to-declaration.json.
4. **fixture.** test/fixtures/pulse-0.1.0-verdicts/ holds seven documents
   copied byte for byte from pulse d4e491b, chosen ASCII (five of pulse's 49
   carry non-ASCII bytes and were not chosen): three APPROVE-with-medium
   (m1-p1-criteria, m3-p18-criteria-round2, m3-p3-criteria-round4), two
   APPROVE with low findings only (m1-p1-hazard, m3-p18-hazard-round2), one
   FIX-ROUND-NEEDED (m3-p14-criteria-round2). None carries a head. The
   seventh, m3-p3-hazard-round4, is one of the seven already invalid under
   v0.1.0, kept as a control that must STAY invalid. The test checks the
   bytes are printable ASCII itself. Red on main and green on the branch:
   the two runs are below. The seven already-invalid documents are described
   under Reproduction and are not forced green. Red witness for the schema
   half: witness/kernel-0-2-1-history-well-formed.json (head re-required;
   medium re-added to the enum).
5. **behaviors.** Eleven appended (six for the brief, five for DR-0055),
   three repointed (Deviations).

### The new tests, red on main and green on the branch

Main: a detached scratch worktree of origin/main at 6dc5b06, with only
test/history-compat.test.ts, test/fixtures/pulse-0.1.0-verdicts/ and the
capture copied in. Node v26.6.0, `node --test test/history-compat.test.ts`,
exit 1. Summary, transliterated (U+2716 rendered `x`, 7 times; U+2139
rendered `i`, 7 times; nothing else changed):

```
x every representative 0.1.0-era pulse verdict validates with no INVALID line against the shipped schema (416.658274ms)
x a 0.1.0-era document that is not a verdict stays invalid, for the reasons it was invalid under 0.1.0 (355.422299ms)
x a dual-tier change whose only reviews declare no head is red at check-dual-review, and each is excluded by name (2660.393143ms)
x merge-preconditions excludes a verdict that declares no head by name and never counts it toward the two reviews (2633.474139ms)
x committed history naming several families before review-families was declared does not contradict the declaration (1662.672474ms)
x a second family committed after review-families was declared still contradicts it (1604.478174ms)
x a history verdict edited after review-families was declared is current work and is read again (1578.617119ms)
i tests 7
i suites 0
i pass 0
i fail 7
i cancelled 0
i skipped 0
i todo 0
```

The first failure on main names the defect itself:

```
AssertionError [ERR_ASSERTION]: m1-p1-criteria.yaml is not well formed
+ [
+   'INVALID # value does not satisfy the requirements its own shape triggers here',
+   'INVALID #/head required property head is missing',
+   'INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"'
+ ]
- []
```

The control test fails on main only because main also prints
`INVALID #/head required property head is missing` for it, which the test
refuses. Its other INVALID lines are the same on both sides.

Branch, same file, same toolchain, at b69f438: 7 tests, 7 pass, 0 fail,
0 skipped, exit 0.

## Red witnesses

Five specs, one per group of tests, because the gate requires EVERY named
test to redden under EVERY member. The first attempt (three specs, b69f438)
was red for exactly that: a member that admits head-less verdicts in
checks.ts leaves the merge-preconditions test green, which is correct
behaviour of the test and a wrong grouping of the spec. It was also red on
rule (d) for the schema: re-adding `"head"` to `required` restores a line the
branch DELETED, and a pure deletion leaves no line in a changed hunk for a
mutation to match, so that member is a patch
(witness/patches/kernel-0-2-1-verdict-head-required-again.patch).

| spec | tests | members |
|---|---|---|
| kernel-0-2-1-headless-verdict-never-admitted | check-dual-review head-less test | admit in partitionByAuditedHead; `declaresNoHead` returns false |
| kernel-0-2-1-headless-verdict-never-admitted-merge-preconditions | merge-preconditions head-less test | admit in readReviewCorpus; `declaresNoHead` returns false |
| kernel-0-2-1-review-families-scoped-to-declaration | history-not-read test | falsifiers read the whole corpus; every verdict with a blob id treated as history |
| kernel-0-2-1-review-families-later-verdicts-read | later-family and edited-history tests | every verdict with a blob id treated as history; the "before" tree read at the audited commit instead of the parent |
| kernel-0-2-1-history-well-formed | pulse well-formed test | head re-required (patch); medium re-added to the escalation enum |

The members that touch src/checks.ts and src/gates/merge-preconditions.ts
(both spawn git) carry consumesExternalOutput with
witness/captures/kernel-0-2-1-history-git.json. That capture's commands are
re-run by the named tests on the staged repositories, and git's live output
must equal it before the gate's verdict is asserted.

## Deviations

- **Three behavior rows repointed, not appended.** `verdict-head-required`,
  `verdict-approve-with-medium-finding-rejected` and
  `verdict-pair-blocking-finding-refused` named tests whose assertion was the
  0.2.0 rule this change withdraws. The ids are kept (they are cited by
  test/verdict-head.test.ts's by-name registration test) and point at the
  test that now carries the property: the head clause at the gate, the medium
  refusal at the gate, the pair predicate as the only medium refusal. This
  edits existing rows of an append-only registry; it is declared here so a
  reviewer can refuse it. The alternative, new ids plus rows pointing at
  deleted titles, would leave three rows that resolve to nothing.
- **Test titles changed** in test/verdict-head.test.ts for the same reason
  (a title stating "head is required" would be false).
- **Staging change in test/single-family-exception.test.ts** (`addHead`):
  the two real-corpus arms read this repository's own M3 verdicts, which
  predate `head`. Under 0.2.1 those are excluded as history, so the arms now
  stage them as CURRENT reviews of the staged commit by inserting a head
  line. The produced-by strings compared are still the real ones.
- **Commit messages** carry no attribution trailer naming a model, because
  CLAUDE.md rule 7 forbids model or tool names in commit messages and the
  project rules take precedence over the session's default trailer.

## Scope addition: the kernel version stamp (DR-0055)

Added mid-task by the coordinator for the owner. The design as given, and
what was built:

1. **Verdicts gain optional `tiphys-version`** (schemas/verdict.schema.json,
   semver with no leading zeros, the grammar src/stamp.ts parses). Writers
   stamped: the composed brief (a `tiphys-version:` header line) and the
   gate bundle's `summary.json` (both summary constructors in
   src/gates/run.ts). Both read the version through `ownVersionForStamp`
   (src/stamp.ts), which returns nothing when no package.json is found above
   the running module; the writer then omits the field rather than invent a
   value. That arm exists because the first full run after the stamp landed
   had 13 failures, most of them tests that stage a partial kernel with no
   package.json (brief-compose, clean-room-brief, implementer-brief, two
   summary tests in test/gates.test.ts), where the strict reader threw. An
   omitted stamp reads as history at every reader, which is the safe side.
   (SUPERSEDED, see "Admission does not read the stamp" below: admission
   kept a strict reader, `runningKernelVersion`; both were removed.)
   roles/clean-room-reviewer.md tells the reviewer to copy the brief's line
   into the verdict; since the admission round it says the stamp is
   recommended, not required.
2. **One `since` source**: `RULES_SINCE` in src/stamp.ts, a table in src/
   rather than a schema annotation, because the schema vocabulary is closed
   and an `x-` keyword would need a validator change. `tiphys validate`
   applies a listed rule only when the document is stamped at or after its
   `since`; an unstamped document is held to 0.1.0. A rule not applied is
   PRINTED as a `HISTORY <rule> applies from tiphys-version <v> ...` line,
   never dropped silently.
3. **SUPERSEDED by the admission round below; kept as the record of what
   the first draft did.** `admissionStampProblem` (src/stamp.ts) was
   called by BOTH merge gates, from one function: src/checks.ts
   (partitionByAuditedHead) and src/gates/merge-preconditions.ts
   (readReviewCorpus). Unstamped, malformed, or older than the running
   major.minor: excluded by name, before the head relation. Head-less was
   checked first, so a head-less document got the head sentence. The
   function, its caller blocks and the `stamp-not-admissible` exclusion kind
   are removed.
4. **The rest of the brief is kept.** The pulse fixture is unstamped history
   and still validates with no INVALID line (it now also prints HISTORY
   lines for the two rules it is not held to).
5. **Witnesses**, three new specs:
   witness/kernel-0-2-1-stamp-rule-applies-from-its-version.json (members:
   validate.ts applies no gating; `ruleApplies` treats unstamped as in
   force), and two stamp-exclusion specs at the merge gates that the
   admission round deleted (named there).

### Fix round inside the scope addition: a pointer is a place, not a rule

Found by the red-witness gate at 8acf44b (local run, evidence in the
session scratch, ev-rw3):

```
gates: red-witness: red: 99 witness(es) evaluated (8 own, 91 stored re-evaluated in 983076ms); witness kernel-0-2-1-history-well-formed: red: member 0 (patch witness/patches/kernel-0-2-1-verdict-head-required-again.patch): red in 0 of 2 repetitions where deterministic true requires every repetition red
```

**Finding:** re-adding `head` to `required` no longer reddens the pulse
well-formed test. **Mechanism:** the first since-table named a schema rule by
the INSTANCE pointer its diagnostics carry (`#/head`) and dropped every
diagnostic at or below it. An instance pointer names a place in the document,
and several rules can report at one place (`required`, `type`, `pattern`,
`additionalProperties` all report `#/head`). So gating one rule gated every
rule at that place, and history escaped rules nobody had listed.

**Fix:** a schema row now names the rule by the SCHEMA location of its one
keyword (`schemaPath: "/properties/head/pattern"`, src/stamp.ts), and
`tiphys validate` validates against a copy of the schema with exactly that
keyword removed (`withoutKeywords`, src/commands/validate.ts). A path that
does not resolve throws, so a stale row fails loudly instead of gating
nothing. The compile cache is keyed by schema object identity with a fresh
Ajv per compile (src/validate.ts:615), so the copy compiles without
colliding with the full schema.

**Derivation** (every consumer of the since-table, which is where a rule is
identified; the `error.schemaPath` and `containsConst` hits in
src/validate.ts are Ajv's own field and are filtered out):

```
grep -rn 'RULES_SINCE\|rulesNotYetInForce\|ruleApplies\|schemaPath' src bin scripts --include=*.ts --include=*.mjs | grep -v 'error.schemaPath\|\.schemaPath\.endsWith\|containsConst'
src/stamp.ts:14: *    is what the owner asked for. `RULES_SINCE` below is the only place a
src/stamp.ts:28: * release ever does add a rule, its `RULES_SINCE` entry still gates SHAPE by the
src/stamp.ts:116: * (`schemaPath`, a JSON pointer into the schema document); a derived check by
src/stamp.ts:150:  schemaPath?: string;
src/stamp.ts:156:export const RULES_SINCE: readonly RuleSince[] = [
src/stamp.ts:161:    schemaPath: "/properties/head/pattern",
src/stamp.ts:174:export function ruleApplies(rule: RuleSince, stamp: StampReading): boolean {
src/stamp.ts:186:export function rulesNotYetInForce(type: string, stamp: StampReading): RuleSince[] {
src/stamp.ts:187:  return RULES_SINCE.filter((rule) => rule.type === type && !ruleApplies(rule, stamp));
src/validate.ts:770:     subschema's own schemaPath, which is the subsidiary's path minus the
src/checks.ts:6127:   * decided by src/stamp.ts's RULES_SINCE. They are not run and not counted
src/commands/validate.ts:30:import { describeRuleNotInForce, readStamp, rulesNotYetInForce } from "../stamp.ts";
src/commands/validate.ts:467:     src/stamp.ts's RULES_SINCE are in force for it; an unstamped document is
src/commands/validate.ts:472:  const notInForce = rulesNotYetInForce(resolvedType, stamp);
src/commands/validate.ts:474:  const gatedSchemaPaths = notInForce.flatMap((rule) => (rule.schemaPath === undefined ? [] : [rule.schemaPath]));
src/commands/validate.ts:502: * resolve to a keyword is an internal defect and throws: RULES_SINCE naming a
src/commands/validate.ts:505:function withoutKeywords(schema: SchemaDocument, schemaPaths: readonly string[]): SchemaDocument {
src/commands/validate.ts:506:  if (schemaPaths.length === 0) {
src/commands/validate.ts:510:  for (const schemaPath of schemaPaths) {
src/commands/validate.ts:511:    const segments = schemaPath
src/commands/validate.ts:527:      throw new Error(`internal defect: RULES_SINCE names schema keyword ${schemaPath}, which this schema does not hold`);
```

One consumer lifts rules: src/commands/validate.ts. The check-id rows go to
`runChecks` (src/checks.ts:6127), and a registered id names one check, so
that half does not have this over-reach. Not covered: `test/`, which uses
the table only through the CLI, and the admission path, which reads the
stamp for the whole document and gates no individual rule.

**Test:** "a rule not in force for a document's stamp is removed alone:
every other rule at the same place still applies to history". An unstamped
verdict whose head is the number 12345 must print the HISTORY line AND an
`INVALID #/head` line (the `type` rule). Red against 8acf44b's pointer-keyed
code (a scratch worktree at 8acf44b with only this test file copied in,
`node --test --test-name-pattern='removed alone' test/history-compat.test.ts`,
exit 1, 1 test, 0 pass, 1 fail, 0 skipped), failing on its second assertion:
`the type rule at #/head was lifted with the pattern rule:` followed by only
the two HISTORY lines. Green on the branch. Witness:
witness/kernel-0-2-1-stamp-gates-one-keyword.json, two members: the old
place-keyed filter put back after validation, and `withoutKeywords` removing
every keyword at the node instead of the one named.

The first gate run at 464c825 (inside m2-exit-test) refused this spec on rule
(d): member 0's find text began at `    companionsFor(resolvedType),`, a line
main already had, so it touched no changed hunk. Member 0 now starts at the
changed `    withoutKeywords(schema, gatedSchemaPaths),` line and replaces
the call with the old form (the whole schema, then the `#/head` filter).
Before re-running the gate each member was applied by hand, one at a time,
with the file restored after each (scratch try-members.py): member 0 exit 1,
member 1 exit 1, restored exit 0. The head-required patch was also applied by
hand to the pulse test: 0 pass, 1 fail, the one INVALID line being
`INVALID #/head required property head is missing`, which is the red the
gate had stopped seeing. Reverted with `git apply -R`.

### Rules the table holds, and the ones it deliberately does not

| rule | since | gated |
|---|---|---|
| verdict `head` is forty lowercase hex when present (schema, `#/head`) | 0.2.0 | yes |
| `verdict-pair-approves` derived check | 0.2.0 | yes |
| verdict `head` required, medium escalation | (withdrawn in 0.2.1) | no row: not rules any more |
| `dual-review-decorrelation` | 0.1.0 | no: existed at 0.1.0; its 0.2.0 head clause is not separable by id |
| `final-report` `delivered-outcome` required (M5-P2) | would be 0.2.1 | NO, deviation below |
| `model-resolution-subject-echo` | 0.2.0 | no: its type did not exist at 0.1.0, so no history can fail it |

How the list was derived: `git diff v0.1.0 HEAD -- schemas/` (above) for
schema rules, and the registered check ids at v0.1.0 against HEAD:

```
git show v0.1.0:src/checks.ts | grep -n 'id: "'    # 21 ids
grep -n 'id: "' src/checks.ts                      # 23 ids
```

The second command printed 23 ids; the two not in the first are
`verdict-pair-approves` and `model-resolution-subject-echo`.

### Writers, enumerated

```
grep -rn "writeFileSync(\|writeFile(\|appendFileSync(" src --include=*.ts
```

It printed 58 lines (full output kept in the session scratch, not pasted:
it is every file write in src/, locks and barriers included). Classified:

- **Stamped**: src/commands/brief.ts:560 (the composed brief), and
  src/gates/run.ts `summary.json` (both `RunSummary` constructors).
- **Not stamped, and why**: every per-gate `result.json`
  (`renderGateResult`, eleven call sites) is validated by
  src/gates/schemas/gate-result.schema.json and read back by the runner; the
  bundle's summary.json in the same evidence directory carries the stamp for
  the run, so stamping each record would change a shipped schema for no new
  fact. src/brief.ts:80 copies a CALLER's brief plus warnings into a task,
  so it carries whatever stamp the composed brief carried. The rest are
  state, not documents: locks, barriers, leases, status streams, pool and
  spawn records, fleet init files, witness mutation scratch.

### Deviations from the design as given

- **`final-report` delivered-outcome is NOT since-gated.** A final report has
  no admission gate behind it, so an unstamped report would escape the rule
  with nothing to catch it: the stamp would relax a rule with no backstop,
  which is what point 3 of the design exists to prevent for verdicts. It is
  also an explicit M5-P2 acceptance criterion. Left for the orchestrator.
- **`dual-review-decorrelation`'s head clause is not since-gated**, so
  `tiphys validate --context` on a head-less history verdict still refuses
  it through that check. The check existed at 0.1.0 and only its head clause
  is 0.2.0; gating a part of a check needs the check itself to read the
  stamp. Open question 3 below.
- **SUPERSEDED: admission floor was major.minor.** Withdrawn with the
  admission requirement. The fixtures under witness/fixtures/dual-review/
  still carry `0.2.0`, which is now inert at admission.
- **SUPERSEDED: the kernel's own reviews of this branch had to carry
  `tiphys-version: 0.2.0`.** No longer needed; an unstamped review with a
  head is admitted when it meets the rules. The brief recommends the stamp.

## Gates

All measured at 4ec78dc on node v26.6.0 (scratch toolchain), `npm ci` and
`npm run build` exit 0, `git status` clean after the build.

- **Suite, standalone**, at 8acf44b: `npm test`, exit 0, 1452 tests, 1452
  pass, 0 fail, 0 skipped, dist built. The one test added after it is in the
  bundle run below.
- **Suite, inside the bundle** at 4ec78dc (the `suite` gate, which runs
  `npm test`): 1453 tests from 70 files, 1453 pass, 0 fail, 0 skipped,
  1327 behaviors resolve.
- **m2-exit-test, PR bundle**:
  `bash scripts/m2-exit-test.sh --base origin/main --head HEAD --phase claude/kernel-0-2-1-history-compat --bundle pr --no-build <scratch>/ev-m2exit`.
  The `--phase` value is what the workflow's sed yields for this branch name.
  Printed `declared 15 applicable 9 verdict 9 green 8 red 1 not-applicable 6
  error 0 vacuous 0`, exit 1. The one red is `merge-preconditions`: 0 of 2
  approving decorrelated verdicts admitted for 4ec78dc, because this branch
  has not been reviewed yet. That red is the gate doing its job and clears
  only with the two reviews (stamped `tiphys-version: 0.2.0`, see the DR-0055
  deviations). Green: manifest-self-check (8), coverage (115),
  credential-scrub (7), suite (1453), clause-map (74), red-witness (100
  witnesses: 9 own, 91 stored), brief-drift (21), typecheck (454).
  Not-applicable: credential-token, citations, scope, gate-classes (the
  branch is not a phase branch, or the diff touches no document in scope),
  deploy, migrations (structural pre-merge).
  The bundle's own summary.json carries `"tiphys-version": "0.2.0"`, which
  is the stamp writer working on a real run.
- **Earlier red-witness runs**, kept because each found something: at
  8acf44b, red on kernel-0-2-1-history-well-formed (the pointer defect,
  fix round above); at 464c825, red on rule (d) for the new spec (member
  retargeted, above).
- `node scripts/check-authored-bytes.mjs` exit 0;
  `node scripts/render-agent-rules-gates.mjs --check` exit 0 (24 rows);
  `node scripts/check-id-collisions.mjs` exit 0.
- `git merge-tree --write-tree origin/main HEAD` at 4ec78dc against
  origin/main b16f200: exit 0, tree 7b21e25. Since the merge base 6dc5b06
  main changed seven paths, all paperwork: delivery/STATE.md, DR-0053,
  DR-0054, one M5-P3 evidence file and three review or arbitration files.
  `comm -12` of that list against the branch's own changed paths printed
  nothing, so no file is changed on both sides.

Commits: 87f9e4c beacon, ffd14f9 reproduction, ec3016c implementation,
606e1f9 test updates, b69f438 new tests, fixtures, witnesses, behaviors,
8c127e6 and c7c6f9f work history, 97156e2 witness split, 2512f74 the
DR-0055 stamp, 8acf44b tolerant stamp writers, 464c825 keyword-keyed gating,
4ec78dc witness retarget.

## Round after the orchestrator's rulings

The orchestrator accepted DR-0055 deviations 1, 3, 4, 5 and 6 as they stand,
and ruled differently on two points. Both are done in this round.

Housekeeping first, as instructed: origin/main b16f200 merged with a merge
commit (1a1f830); then exactly two files taken from
origin/claude/m5-orchestrator-paperwork-3 at 1770cd5 with
`git show <ref>:<path> > <path>`: DR-0055 (new) and DR-0053 (its "Owner
answer, 2026-09-23" section, six lines added). STATE.md was not taken. The
package version is unchanged at 0.2.0.

### Ruling 1: the final-report `delivered-outcome` rule is gated by stamp

`delivered-outcome` joined `required` in M5-P2 (5662d74, #207), before the
0.2.0 bump (cb5de0d, #208), so the rule's version is 0.2.0:

```
git log --oneline -S'"delivered-outcome"' -- schemas/final-report.schema.json
5662d74 M5-P2: carry charter intent into briefs and require a delivered outcome (#207)
git log --oneline -S'"version": "0.2.0"' -- package.json
cb5de0d Bump the kernel to 0.2.0 for release (#208)
```

The rule is one ENTRY of an array keyword, not a keyword, and lifting all of
`required` would lift eight rules that existed at 0.1.0. So a table row may
now name an `entry` beside its `schemaPath` (src/stamp.ts), and
`withoutKeywords` (src/commands/validate.ts) removes only that entry, and
throws when it is absent. Row: `final-report-delivered-outcome-required`,
`schemaPath: "/required"`, `entry: "delivered-outcome"`, since 0.2.0.

For the stamp to exist on a final report at all, schemas/final-report.schema.json
gains an optional `tiphys-version` property with the verdict's grammar
(`additionalProperties: false` would otherwise refuse it). New work stays held
to the rule: the orchestrator writes a final report from
templates/final-report.example.yaml, and that template now carries
`tiphys-version: 0.2.0`, with a test that it equals package.json's version,
so a version bump without a restamp reddens rather than silently exempting
every report written from the template.

Tests (test/history-compat.test.ts):

- "a final report written before delivered-outcome existed validates as
  history, and one stamped 0.2.0 or later still needs it". Three arms:
  unstamped without the field: no INVALID, the HISTORY line printed, exit 0;
  unstamped without `decisions-owed` as well: INVALID naming it, exit 1 (only
  the one entry was lifted); stamped 0.2.0 and stamped the package version
  without the field: INVALID naming `delivered-outcome`, exit 1.
- "the shipped final-report template is stamped with the running kernel
  version and validates".

Witness witness/kernel-0-2-1-final-report-delivered-outcome-since.json,
three members: the row's type renamed so it gates nothing (the old report is
rejected again), the row's `entry` removed so all of `required` is lifted,
and `withoutKeywords` emptying the array instead of removing the one entry.

### Ruling 2: `tiphys validate` exits 0 when only SKIPPED checks failed

**This reverses a written plan criterion, and I am recording that rather
than letting it pass unremarked.** M3's criterion 4c,
delivery/plan/kernel-plan-m3.md:1809, reads: "A cross-document derived check
invoked without `--context` prints `SKIPPED <check-id> no context` and the
command exits nonzero". The plan's rationale at
delivery/plan/kernel-plan-m3.md:947 is "so a cross-document rule can never
pass by not being run". The ruling was explicit and the change is
reversible, so it is implemented. The SKIPPED lines are still printed, by
check id, so a skipped check is never reported as a pass. Whether this needs
its own owner decision record, since it amends an owner-approved plan
criterion, is open question 9.

Derivation, run BEFORE the change, of everything that depends on the old
exit or on the flag behind it. The src/scripts/roles/workflow half:

```
grep -rn 'runChecks(\|\.failed\b\|SKIPPED\|no context' src bin scripts roles schemas .github AGENTS.md CLAUDE.md
```

Its hits that are about the derived-check exit (the others were the
`no context directory was supplied` messages inside individual checks, the
test-suite "SKIPPED count" wording in CLAUDE.md and roles/implementer.md,
and unrelated uses of the word in src/roles.ts, src/commands/doctor.ts and
scripts/check-retirement-inventory.mjs):

```
src/checks.ts:16: * `SKIPPED <check-id> no context` and the command exits nonzero. That is the
src/checks.ts:629: * prints `SKIPPED mode-gate-sets-resolve no context` and exits nonzero. That
src/checks.ts:2071: * prints `SKIPPED gate-probes-resolve no context` and exits nonzero. A
src/checks.ts:2566: * running the validator without `--context` prints `SKIPPED
src/commands/mode.ts:126:  const checks = runChecks(MODES_TYPE, read.raw, dirname(read.path));
src/commands/mode.ts:127:  if (lines.length > 0 || checks.failed) {
src/commands/validate.ts:395:  const checks = runChecks("role-brief", decoded.value, context);
src/commands/validate.ts:399:  return roundTrip.lines.length > 0 || outputContract.length > 0 || checks.failed
src/commands/validate.ts:491:  const checks = runChecks(resolvedType, decoded.value, context, gatedChecks);
src/commands/validate.ts:495:  return checks.failed ? 1 : 0;
src/commands/checklist.ts:113:  const checks = runChecks(CHECKLIST_TYPE, checklist.raw, context);
src/commands/checklist.ts:114:  return schemaLines.length > 0 || checks.failed ? [...schemaLines, ...checks.lines] : [];
```

plus two text sites: roles/clean-room-reviewer.md:59 ("reports no `INVALID`
line", the M5-P3 reviewer contract) and AGENTS.md:527 (`validate --context`,
which always supplies a context and so is unaffected). The test half:

```
grep -rn 'SKIPPED\|no context' test --include=*.ts
```

23 hits before the change, of which these depend on the exit or the flag:
test/assurance-modes.test.ts:160-169 and :900-905 (asserted exit 1 with no
context), test/checks.test.ts:175-208, test/checklists.test.ts:593-597 and
test/verdict-schema.test.ts:557-559 (assert `failed: true` at the registry),
test/dual-review.test.ts:136-146 and :343-345, test/verdict-head.test.ts:386-391,
test/clean-room-brief.test.ts:580-585 and test/implementer-brief.test.ts:902-907
(comments explaining an exit 1). The rest are the word used for skipped
TESTS (license-gate, model-resolution, gate-registry, cross-environment).

What each site got:

| site | change |
|---|---|
| src/checks.ts `ChecksRun` | new `violated` field (a violation, skips excluded); `failed` kept as it was, so the three registry tests asserting `failed: true` on a skip still hold |
| src/commands/validate.ts:503 (per-type validate) | exits on `checks.violated` |
| src/commands/validate.ts:399 (role-brief) | UNCHANGED: `role-brief` has no context-requiring check (`grep -rn 'requiresContext: true' -B3 src` lists assurance-modes, checklist, verdict, tuition only), so `failed` equals `violated` there; changing it would also have broken stored witness role-brief-output-contract-refused, whose find text is that line and whose other member is in src/roles.ts, which this branch does not change (rule (d)) |
| src/commands/mode.ts:126, src/commands/checklist.ts:113 | UNCHANGED: both always pass a context (`dirname(read.path)`, `packageRoot()`), so no check can be skipped there |
| src/checks.ts:16 header | rewritten to state the 0.2.1 behaviour and cite the plan criterion it amends; the per-check comments (now at src/checks.ts:633, :2075, :2571) still say "exits nonzero" and are stale (not edited, to keep this round's diff to the sites that decide behaviour) |
| test/assurance-modes.test.ts:904 | now asserts exit 0 and the SKIPPED line |
| test/dual-review.test.ts:139 | now also asserts exit 0 |
| test/checks.test.ts | asserts `violated: false` beside `failed: true` |
| the other test comments | reworded, no assertion change |
| roles/clean-room-reviewer.md:59 | "reports no INVALID line and exits 0", and what a SKIPPED line means |

Not covered by the derivation: `plugin/` (its own tsconfig; it calls no
`runChecks`, measured with the same grep over `plugin/src`), and any
consumer's CI that reads validate's exit code, which this repository cannot
see.

Tests:

- "a verdict whose only non-pass results are SKIPPED checks exits 0, and
  each skip is still printed by name": the real pulse m1-p1-hazard verdict,
  no context: no INVALID, at least one SKIPPED line, exit 0.
- "a verdict with a real INVALID line still exits 1 without a context,
  whether the schema or a derived check found it": the same verdict with a
  hazard class pointed at a missing finding (CR-007 to CR-999), which the
  context-free check `verdict-finding-references-resolve` refuses, among
  SKIPPED lines: exit 1; and with `review-contract: improvised`: schema
  INVALID, exit 1.

Witnesses: witness/kernel-0-2-1-validate-skipped-only-exits-0.json (exit on
`failed` again; exit 1 whenever a SKIPPED line is present) and
witness/kernel-0-2-1-validate-invalid-still-exits-1.json (always exit 0;
a violation masked when skips are present). All members are in
src/commands/validate.ts, which spawns nothing, so rule (f) does not ask for
a capture and none is claimed.

### Every member tried by hand before the gate

Scratch try-members2.py applies each member alone, runs the named test with
`--test-name-pattern`, and restores the file. Output (exit, pass, fail):

```
final-report-delivered-outcome-since HEAD      (0, 1, 0)
  member 0 (1, 0, 1)   member 1 (1, 0, 1)   member 2 (1, 0, 1)
validate-skipped-only-exits-0 HEAD             (0, 1, 0)
  member 0 (1, 0, 1)   member 1 (1, 0, 1)
validate-invalid-still-exits-1 HEAD            (0, 1, 0)
  member 0 (1, 0, 1)   member 1 (1, 0, 1)
stamp-gates-one-keyword HEAD                   (0, 1, 0)
  member 0 (1, 0, 1)   member 1 (1, 0, 1)
```

`git status` afterwards showed only this round's intended edits. A scan of
every witness spec's mutation `find` text against the tree
(scratch check-finds.py) prints six specs whose find matches more than
once; the same six are stored witnesses untouched by this branch, and none
of them is in a file this round changes except src/checks.ts
(checklist-duplicate-probe-id-guard, dual-review-absent-dimension-refuses),
whose matched text this round did not edit.

## Admission does not read the stamp (the orchestrator's second message)

The owner reported pulse running real work on 0.2.0, with reviewers writing
verdicts that carry `head` and no `tiphys-version`, because 0.2.0 never asked
for one. The first 0.2.1 draft excluded any verdict without a current stamp,
so a project upgrading mid-phase would lose its in-flight reviews: the 0.2.0
break again, one release later.

**Mechanism.** The same one this branch exists for, in its mirror form:
a rule about how CURRENT work is written (carry the stamp) placed where it
also judges work written before the rule existed. The fix is the one the
orchestrator specified: admission ignores the stamp and applies every rule
it holds to every verdict, stamped or not. The stamp decides only which
schema rules `tiphys validate` applies, for history. The safety property is
kept by construction, not by a comparison: nothing on the admission path
reads the stamp, so no stamp value can excuse a verdict from a rule.

### Derivation

Every reader and writer of the stamp, after the change:

```
grep -rnE 'admissionStampProblem|runningKernelVersion|stamp-not-admissible|readStamp|STAMP_FIELD|ownVersionForStamp' src bin scripts test roles schemas templates AGENTS.md
src/stamp.ts:31:export const STAMP_FIELD = "tiphys-version";
src/stamp.ts:68:export function ownVersionForStamp(): string | undefined {
src/stamp.ts:87:export function readStamp(record: unknown): StampReading {
src/stamp.ts:91:  if (!(STAMP_FIELD in record)) {
src/stamp.ts:94:  const value = (record as Record<string, unknown>)[STAMP_FIELD];
src/stamp.ts:195:      ? `this document is stamped ${STAMP_FIELD} ${stamp.version.text}`
src/stamp.ts:197:        ? `this document's ${STAMP_FIELD} ${stamp.value} is not a version`
src/stamp.ts:198:        : `this document carries no ${STAMP_FIELD}, so it is pre-stamp history held to the 0.1.0 rules`;
src/stamp.ts:199:  return `HISTORY ${rule.id} applies from ${STAMP_FIELD} ${rule.since} (${rule.statement}); ${document}`;
src/gates/run.ts:1:import { STAMP_FIELD, ownVersionForStamp } from "../stamp.ts";
src/gates/run.ts:51:  const version = ownVersionForStamp();
src/gates/run.ts:52:  return version === undefined ? {} : { [STAMP_FIELD]: version };
src/commands/validate.ts:30:import { describeRuleNotInForce, readStamp, rulesNotYetInForce } from "../stamp.ts";
src/commands/validate.ts:471:  const stamp = readStamp(decoded.value);
src/commands/brief.ts:37:import { STAMP_FIELD, ownVersionForStamp } from "../stamp.ts";
src/commands/brief.ts:403:  const stampVersion = ownVersionForStamp();
src/commands/brief.ts:413:    ...(stampVersion === undefined ? [] : [`${STAMP_FIELD}: ${stampVersion}`]),
exit=0
```

So the one remaining reader is `validate`; the other two sites are writers
(the brief header and summary.json). Before the change the same grep also
listed `admissionStampProblem` and `runningKernelVersion` in src/checks.ts
and src/gates/merge-preconditions.ts, the two admission sites; both are gone.
A second grep over the two admission files and the workflow script for the
literal field name or the word `stamp`:

```
grep -rnE 'tiphys-version|stamp' src/checks.ts src/gates/merge-preconditions.ts scripts/check-dual-review.mjs
src/checks.ts:4431:       gate applies is applied to every verdict, stamped or not, so an old or
src/checks.ts:4432:       missing stamp can neither exclude a verdict nor excuse one from a rule.
src/checks.ts:4433:       A 0.2.0 verdict, which carries a head and no stamp, is admitted exactly
src/checks.ts:4434:       when it meets the rules. The stamp decides only which schema rules
src/checks.ts:6118:   * KERNEL 0.2.1 (DR-0055): checks not in force for this document's stamp,
src/checks.ts:6119:   * decided by src/stamp.ts's RULES_SINCE. They are not run and not counted
src/gates/merge-preconditions.ts:1243:    /* KERNEL 0.2.1 (DR-0055): admission does not read the stamp, exactly as
src/gates/merge-preconditions.ts:1245:       stamp. Every rule here applies to every verdict, stamped or not. */
```

All comments. src/checks.ts:6118 is the `notInForce` parameter of
`runChecks`, which only validate.ts:472 fills; the gates call `runChecks`
without it, so every derived check is in force at admission.

**Not covered.** The grep is lexical: a site reading the stamp through a
computed key would not appear. I read both admission loops in full instead
of relying on it. Consumers outside this repository (pulse's own scripts)
were not examined. The corpus is not schema-validated at either gate (open
question 11), so "every current rule" at admission is the gate predicates:
head present, head relation to the audited head, the pair approving with no
unresolved high or medium, and decorrelation.

### Changes

- src/stamp.ts: `runningKernelVersion` and `admissionStampProblem` removed;
  header point 2 rewritten to say the gates do not read the stamp.
- src/checks.ts: the `stamp-not-admissible` exclusion kind, its describe
  branch and the stamp block in `partitionByAuditedHead` removed; a comment
  states the rule.
- src/gates/merge-preconditions.ts: the stamp block in `readReviewCorpus`
  removed; same comment.
- schemas/verdict.schema.json: the `tiphys-version` $comment now says it is
  not read at admission and is recommended, not required.
- roles/clean-room-reviewer.md: the stamp paragraph says the same; the
  brief still tells the reviewer to copy the line.

### Tests

Two stamp-exclusion tests in test/history-compat.test.ts are replaced:

- "a real-shaped 0.2.0 verdict pair, with a head and no stamp, is admitted by
  check-dual-review and merge-preconditions, and so is the same pair stamped
  old or current". It loops over no stamp, `0.1.0` and the running version.
  For the unstamped case it first asserts each staged verdict has a
  forty-hex `head:` line and no `tiphys-version:` line, which is the 0.2.0
  shape. check-dual-review must be green. merge-preconditions must reach its
  network condition, `no repository could be established` (the fixture has
  no remote), and must not report `admitted and N missing`, so the review
  conditions are cleared.
- "an old-stamped verdict that breaks a current rule is excluded by name for
  the rule it breaks, never for its stamp, at check-dual-review and
  merge-preconditions". The pair is stamped `0.1.0` and has no head. Both
  gates are red, name `<file> declares no head` for each file, and print no
  `tiphys-version` text in the detail or the selection row.

Both call `assertGitMatchesCapture` on the staged repository, which is the
external-output capture the red-witness gate requires for a member in a
spawning file. test/behaviors.json rows `stamp-old-excluded-at-*` are
replaced in place by `admission-ignores-stamp-admits-0-2-0-verdict` and
`admission-applies-current-rules-to-old-stamp`.

### Witnesses

The two stamp-exclusion specs are deleted with `git rm`
(witness/kernel-0-2-1-stamp-old-excluded-at-check-dual-review.json and
...-at-merge-preconditions.json); their find text no longer exists. Two new
specs, each with one member per gate so both gates are covered:

- witness/kernel-0-2-1-admission-requires-no-stamp.json: admission starts
  requiring a stamp, `declaresNoHead(x) || !("tiphys-version" in x)`, in
  src/checks.ts and in src/gates/merge-preconditions.ts.
- witness/kernel-0-2-1-admission-never-honours-old-stamp.json: admission
  starts honouring a stamp, `declaresNoHead(x) && !("tiphys-version" in x)`,
  so a stamped head-less verdict escapes the head rule, in both files.

Hand trial, scratch try-members2.py (applies one member, runs the named
test with node v26.6.0, restores the file). Tuples are (exit, pass, fail):

```
kernel-0-2-1-admission-requires-no-stamp HEAD a real-shaped 0.2.0 verdict pair, with a head and  (0, '1', '0')
kernel-0-2-1-admission-requires-no-stamp member 0 a real-shaped 0.2.0 verdict pair, with a head and  (1, '0', '1')
kernel-0-2-1-admission-requires-no-stamp member 1 a real-shaped 0.2.0 verdict pair, with a head and  (1, '0', '1')
kernel-0-2-1-admission-never-honours-old-stamp HEAD an old-stamped verdict that breaks a current rule  (0, '1', '0')
kernel-0-2-1-admission-never-honours-old-stamp member 0 an old-stamped verdict that breaks a current rule  (1, '0', '1')
kernel-0-2-1-admission-never-honours-old-stamp member 1 an old-stamped verdict that breaks a current rule  (1, '0', '1')
```

Every member red, HEAD green. The gate's own run is under Gates.

### What this supersedes

Point 3 of the DR-0055 section, the major.minor floor and "reviews of this
branch must carry 0.2.0" under its deviations, and open question 8 are
marked superseded or resolved in place rather than deleted.

## Open questions

1. **`headGroupFor` is unchanged.** In the derived checks, a same-phase
   sibling with no usable head still reddens the group. A consumer that
   REVIEWS AGAIN a phase whose old verdicts lack a head will see that red.
   Kept fail-closed; not measured against pulse, because pulse has no such
   case today.
2. **No `--base` arm is weaker than 0.2.0.** The bare `check-dual-review`
   workflow step, without `--base`, reads a corpus of ONLY head-less verdicts
   as not-applicable, each named. 0.2.0 read it as red. With `--base` (which
   the gate runner supplies) a dual-tier change is red, as the tests show.
3. **`validate --context` with the merge checks** still refuses a head-less
   verdict through the derived checks (checks.ts:5506, 5763). That is a merge
   question asked of history by an explicit command; I left it. Under DR-0055
   this is the `dual-review-decorrelation` deviation above: gating its head
   clause by stamp needs the check to read the stamp itself, and the table
   gates whole checks only.
4. **RESOLVED in the round after the rulings.** Was: `tiphys validate` without `--context` exits 1 on every verdict
   (SKIPPED counts as failure, src/commands/validate.ts:480), on v0.1.0 and
   on main. After this change pulse's history prints no INVALID line and
   the command still exits 1. If the owner's "validation returns false" meant
   the exit code, this change alone does not turn it true.
5. **RESOLVED in the round after the rulings (gated by stamp).** Was: `final-report.schema.json` requires `delivered-outcome` (M5-P2).
   Same mechanism, but it is an explicit acceptance criterion of M5-P2
   (p2-final-report-contract), so it is a plan decision and not mine to
   reverse. Pulse has no final reports, so it does not affect the pulse case.
   DR-0055 point 2 would gate it by `since`; I did not, for the reason given
   under the DR-0055 deviations (no admission gate stands behind a final
   report). The orchestrator decides.
8. **RESOLVED by the admission round.** Was: the stamped fixtures under
   witness/fixtures/dual-review/ would be excluded at 0.3.0 by the admission
   floor. Admission no longer reads the stamp, so they are not.
9. **Criterion 4c is amended by an orchestrator ruling, not by an owner
   record.** delivery/plan/kernel-plan-m3.md:1809 requires a nonzero exit for
   a skipped cross-document check; 0.2.1 exits 0. Whether that needs a
   decision record (DR-0016: it is reversible) is the orchestrator's call.
10. **Stale per-check comments** at src/checks.ts:633, :2075 and :2571 still
   say a skipped check "exits nonzero", and the `runChecks` header says a
   skip makes "the run FAIL" (true of `ChecksRun.failed`, which is kept; no
   longer true of the validate exit).
11. **Neither merge gate schema-validates the corpus it admits.**
   `partitionByAuditedHead` and `readReviewCorpus` decode YAML and apply
   their own predicates; they do not run the verdict schema. So "every
   current rule" at admission means those predicates, not the schema. This
   is pre-existing and unchanged; whether admission should also run the
   current schema is for the orchestrator.
6. **Unexaminable files.** A file under `delivery/review/` that cannot be
   decoded still makes merge-preconditions error, whatever its age. That
   also judges history; not changed.
7. **Only pulse was examined.** Seven of its 49 verdicts are fixtures; no
   other consumer's history was read.

## Claim grep

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/kernel-0-2-1-history-compat.md
```

Re-run after the admission round, before this list was rewritten. Hits by
line, and what settles each:

- 6: the owner's rule, quoted.
- 213 and 262: `never counts it`, a test title (quoted, and in the captured
  summary). The test is the settlement: green on the branch, red on main.
- 219, 308, 309: `never-admitted`, a witness file name.
- 221, 733, 734: describe mutations (`always false`, "exit 1 whenever",
  "always exit 0"); the red-witness run settles each.
- 371: HISTORY lines are "never dropped silently": the stamp-rule test
  asserts the HISTORY line is printed for both unstamped and 0.1.0 stamps.
- 648: the plan's own rationale, quoted.
- 651: "a skipped check is never reported as a pass": the skipped-only test
  asserts at least one `SKIPPED <id> no context` line and no INVALID line.
- 685: AGENTS.md:527's command is `tiphys validate --type verdict --context
  <project> <verdict>`; the `--context` is in the text itself.
- 707: mode.ts and checklist.ts "always pass a context": src/commands/mode.ts:126
  passes `dirname(read.path)`, and src/commands/checklist.ts:142-149 assigns
  `context = packageRoot()` before either `invalidityLines` call.
- 766: "0.2.0 never asked for one": `git show origin/main:schemas/verdict.schema.json
  | grep -c tiphys-version` printed 0 at b16f200, whose package.json says
  0.2.0.
- 865, 886, 897, 898, 899: a test title and a witness file name; the hand
  trial printed with them settles each (members red, HEAD green).
- 944: "needs a", inside open question 9, which is a question.
- 956: "cannot be decoded" describes an input (an undecodable file), not a
  claim about the code.
- 965: the grep command itself.

Occurrences, counted the same way in both forms after this section was
written: `grep -oEi '<the same phrases>' <file> | wc -l` printed 44, and the
wrap-insensitive `tr '\n' ' ' < <file> | grep -oEi ... | wc -l` printed 44.
Equal, so no hit was missed by wrapping. The hits after line 965 are this
section quoting the ones above it.
