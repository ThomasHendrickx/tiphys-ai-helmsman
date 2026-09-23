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
5. **behaviors.** Six appended, three repointed (Deviations).

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
   Admission keeps the strict reader (`runningKernelVersion`), so a gate that
   cannot read its own version errors rather than admits. roles/clean-room-reviewer.md tells the
   reviewer to copy the brief's line into the verdict.
2. **One `since` source**: `RULES_SINCE` in src/stamp.ts, a table in src/
   rather than a schema annotation, because the schema vocabulary is closed
   and an `x-` keyword would need a validator change. `tiphys validate`
   applies a listed rule only when the document is stamped at or after its
   `since`; an unstamped document is held to 0.1.0. A rule not applied is
   PRINTED as a `HISTORY <rule> applies from tiphys-version <v> ...` line,
   never dropped silently.
3. **Admission never relaxed.** `admissionStampProblem` (src/stamp.ts) is
   called by BOTH merge gates, from one function: src/checks.ts
   (partitionByAuditedHead) and src/gates/merge-preconditions.ts
   (readReviewCorpus). Unstamped, malformed, or older than the running
   major.minor: excluded by name, before the head relation. Head-less is
   still checked first, so a head-less document gets the head sentence.
4. **The rest of the brief is kept.** The pulse fixture is unstamped history
   and still validates with no INVALID line (it now also prints HISTORY
   lines for the two rules it is not held to).
5. **Witnesses**, three new specs:
   witness/kernel-0-2-1-stamp-rule-applies-from-its-version.json (members:
   validate.ts applies no gating; `ruleApplies` treats unstamped as in
   force), witness/kernel-0-2-1-stamp-old-excluded-at-check-dual-review.json
   and ...-at-merge-preconditions.json (members: the gate skips the stamp
   check; the old-minor comparison never fires).

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
- **Admission floor is major.minor, as specified**, so this repository's
  fixtures stamp `0.2.0` literally (witness/fixtures/dual-review/). A minor
  bump to 0.3.0 will exclude them and redden the tests that stage them; that
  is the rule working, and the restamp is part of that release. The
  single-family staging reads the version from package.json instead.
- **The kernel's own reviews of THIS branch** must carry
  `tiphys-version: 0.2.0` (the package version, unbumped), or both merge
  gates will exclude them. The composed brief now says so.

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
4. **`tiphys validate` without `--context` exits 1 on every verdict**
   (SKIPPED counts as failure, src/commands/validate.ts:480), on v0.1.0 and
   on main. After this change pulse's history prints no INVALID line and
   the command still exits 1. If the owner's "validation returns false" meant
   the exit code, this change alone does not turn it true.
5. **`final-report.schema.json` requires `delivered-outcome` (M5-P2).**
   Same mechanism, but it is an explicit acceptance criterion of M5-P2
   (p2-final-report-contract), so it is a plan decision and not mine to
   reverse. Pulse has no final reports, so it does not affect the pulse case.
   DR-0055 point 2 would gate it by `since`; I did not, for the reason given
   under the DR-0055 deviations (no admission gate stands behind a final
   report). The orchestrator decides.
8. **Old fixtures break at the next minor.** The stamped fixtures under
   witness/fixtures/dual-review/ carry `0.2.0` literally. At 0.3.0 the
   admission floor excludes them and their tests redden until restamped.
   Deriving the stamp at test time for these files was not attempted; they
   are static YAML fixtures and I left them static.
6. **Unexaminable files.** A file under `delivery/review/` that cannot be
   decoded still makes merge-preconditions error, whatever its age. That
   also judges history; not changed.
7. **Only pulse was examined.** Seven of its 49 verdicts are fixtures; no
   other consumer's history was read.

## Claim grep

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/kernel-0-2-1-history-compat.md
```

Run before this section was written, five hits: line 6 is the owner's rule
quoted; the two `never counts it` hits are a test title (quoted and in the
captured summary); `never-admitted` is a witness file name; `always false`
describes a mutation (`declaresNoHead` returning false), which the witness
run settles. The wrap-insensitive form found the same five (1 `always`,
4 `never`), so no hit was missed by wrapping. The sentences added after it
were written to avoid the listed words.
