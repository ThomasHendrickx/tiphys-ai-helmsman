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
  `declaresNoHead` is true only when the key is absent (src/checks.ts:4220).
  An abbreviated or uppercase head keeps the old refusal (schema pattern, and
  unkeyed at the gate), because a document that stated its head wrongly was
  written after the rule existed. **Superseded in part by the DR-0055 round,
  corrected in fix round 1 (criteria review CR-003):** for an UNSTAMPED
  document `validate` now lifts the schema pattern (`verdict-head-full-sha`
  prints a HISTORY line), so only the gate half still refuses. Pulse's
  0.2.0-written verdicts are unstamped, so `validate` accepts an abbreviated
  head on them, and both merge gates still refuse it.
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
   src/checks.ts:4456 and src/gates/merge-preconditions.ts:1239. Tests in
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
src/stamp.ts:204:export function rulesNotYetInForce(type: string, stamp: StampReading): RuleSince[] {
src/stamp.ts:205:  return RULES_SINCE.filter((rule) => rule.type === type && !ruleApplies(rule, stamp));
src/validate.ts:770:     subschema's own schemaPath, which is the subsidiary's path minus the
src/checks.ts:6172:   * decided by src/stamp.ts's RULES_SINCE. They are not run and not counted
src/commands/validate.ts:30:import { describeRuleNotInForce, readStamp, rulesNotYetInForce } from "../stamp.ts";
src/commands/validate.ts:467:     src/stamp.ts's RULES_SINCE are in force for it; an unstamped document is
src/commands/validate.ts:472:  const notInForce = rulesNotYetInForce(resolvedType, stamp);
src/commands/validate.ts:474:  const gatedSchemaPaths = notInForce.flatMap((rule) => (rule.schemaPath === undefined ? [] : [rule.schemaPath]));
src/commands/validate.ts:509: * resolve to a keyword is an internal defect and throws: RULES_SINCE naming a
src/commands/validate.ts:512:function withoutKeywords(schema: SchemaDocument, schemaPaths: readonly string[]): SchemaDocument {
src/commands/validate.ts:513:  if (schemaPaths.length === 0) {
src/commands/validate.ts:517:  for (const schemaPath of schemaPaths) {
src/commands/validate.ts:518:    const segments = schemaPath
src/commands/validate.ts:534:      throw new Error(`internal defect: RULES_SINCE names schema keyword ${schemaPath}, which this schema does not hold`);
```

One consumer lifts rules: src/commands/validate.ts. The check-id rows go to
`runChecks` (src/checks.ts:6172), and a registered id names one check, so
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

### Gates at 0636e03 (after the rulings and the admission round)

Node v26.6.0 (scratch toolchain), `npm run build` exit 0, `git status`
clean after build. `npm test`: 1457 tests, 1457 pass, 0 fail, 0 skipped,
0 cancelled, 0 todo, exit 0. `node scripts/check-authored-bytes.mjs` exit 0.
`node scripts/render-agent-rules-gates.mjs --check` exit 0 (24 rows).
`bash scripts/m2-exit-test.sh --base origin/main --head HEAD --phase
claude/kernel-0-2-1-history-compat --bundle pr --no-build <dir>`:

```
gates: declared 15 applicable 10 verdict 10 green 9 red 1 not-applicable 5 error 0 vacuous 0
gates: suite: green: ... reported 1457 test(s) from 70 file(s) (pass 1457, fail 0, skipped 0, todo 0, did-not-run 0); ... 1331 behavior(s) resolve; merge base b16f20008ef9
gates: citations: green: linted 2 changed document(s) at 0636e03...: 1 citation(s) resolved, 0 self-citation(s), 0 unverifiable-external
gates: red-witness: green: 104 witness(es) evaluated (12 own, 92 stored re-evaluated in 950378ms); every witness red against every declared dangerous state and green at head
gates: merge-preconditions: red: ... 0 of 2 are admitted and 2 missing ...
```

(Lines shortened with `...`; nothing else altered.) The one red is
merge-preconditions, expected: no reviews of this branch exist yet. scope is
not-applicable because this is not a phase branch; deploy and migrations are
structurally not-applicable pre-merge; credential-token has no token.
This paragraph is committed after that run, so the pushed head is one
documentation commit past 0636e03.

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
src/checks.ts:2074: * prints `SKIPPED gate-probes-resolve no context` and exits nonzero. A
src/checks.ts:2570: * running the validator without `--context` prints `SKIPPED
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
| src/commands/validate.ts:510 (per-type validate) | exits on `checks.violated` |
| src/commands/validate.ts:399 (role-brief) | UNCHANGED: `role-brief` has no context-requiring check (`grep -rn 'requiresContext: true' -B3 src` lists assurance-modes, checklist, verdict, tuition only), so `failed` equals `violated` there; changing it would also have broken stored witness role-brief-output-contract-refused, whose find text is that line and whose other member is in src/roles.ts, which this branch does not change (rule (d)) |
| src/commands/mode.ts:126, src/commands/checklist.ts:113 | UNCHANGED: both always pass a context (`dirname(read.path)`, `packageRoot()`), so no check can be skipped there |
| src/checks.ts:16 header | rewritten to state the 0.2.1 behaviour and cite the plan criterion it amends; the per-check comments (now at src/checks.ts:632, :2075, :2571) still say "exits nonzero" and are stale (not edited, to keep this round's diff to the sites that decide behaviour) |
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
src/stamp.ts:215:        ? `this document's ${STAMP_FIELD} ${stamp.value} is not a version`
src/stamp.ts:216:        : `this document carries no ${STAMP_FIELD}, so it is pre-stamp history held to the 0.1.0 rules`;
src/stamp.ts:217:  return `HISTORY ${rule.id} applies from ${STAMP_FIELD} ${rule.since} (${rule.statement}); ${document}`;
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

## Fix round 1 (reviews of b57bd7c)

Inputs: the criteria review (FIX-ROUND-NEEDED, one medium CR-001 and five
lows CR-002 to CR-006) and the hazard review (APPROVE, two lows CR-KH-001
and CR-KH-002). Both were read in full; neither is committed here, by
instruction. All runs below are node v26.6.0.

### CR-001 (medium): the mechanism

The finding: `headGroupFor` reddens both merge gates when a same-phase
sibling verdict has no `head`. Pulse has that case: paused M3-P3 verdicts
with no head, and a dispatch plan that resumes that review.

The mechanism: **history is judged at admission through grouping.** Round 0
made the corpus readers (`partitionByAuditedHead`, `readReviewCorpus`) treat
a verdict that declares no head as history, excluded by name. The derived
checks do not read the corpus through those readers. They group the
committed verdicts again, by (phase, head), in `headGroupFor`, and that
grouping still called a head-less sibling "unkeyed", which is a refusal.
So a verdict one layer called history, the next layer refused.

The fix makes the grouping use the same predicate as the readers:
`declaresNoHead` (src/checks.ts:4225, key absent only). A same-phase
sibling for which it is true goes to a new `headless` list
(src/checks.ts:4013), is never a member and never a refusal, and both
derived checks print it by name as a REPORT line. A sibling whose head is
PRESENT and unusable (abbreviated, uppercase, not a string) still goes to
`unkeyed` through `headKeyOf` (src/checks.ts:4017) and still refuses.

### Derivation

Every admission-path site that groups or refuses on a missing head:

```
grep -rnE 'headGroupFor\(|headKeyOf\(|declaresNoHead\(|establishField\([^)]*"head"|"head" in |no-head' src scripts bin --include=*.ts --include=*.mjs
```

Full output on the final tree (exit 0):

```
src/gates/merge-preconditions.ts:1239:    if (declaresNoHead(entry.record)) {
src/gates/merge-preconditions.ts:1240:      excluded.push({ path: entry.path, declared: "", relation: { kind: "no-head" } });
src/checks.ts:3920:function headKeyOf(record: Record<string, unknown> | undefined, where: string): HeadKey {
src/checks.ts:3921:  const reading = establishField(record, "head");
src/checks.ts:3980:function headGroupFor(
src/checks.ts:4013:    if (declaresNoHead(candidate.record)) {
src/checks.ts:4017:    const key = headKeyOf(candidate.record, candidate.path);
src/checks.ts:4210:  | { kind: "no-head" };
src/checks.ts:4225:export function declaresNoHead(record: Record<string, unknown> | undefined): boolean {
src/checks.ts:4226:  return record === undefined || !("head" in record);
src/checks.ts:4460:    if (declaresNoHead(candidate.record)) {
src/checks.ts:4461:      offHead.push({ path: candidate.path, declared: "", relation: { kind: "no-head" } });
src/checks.ts:4471:    const key = headKeyOf(candidate.record, candidate.path);
src/checks.ts:4500:      if (entry.relation.kind === "no-head") {
src/checks.ts:5552:    const ownHead = headKeyOf(verdict, "this verdict");
src/checks.ts:5560:    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
src/checks.ts:5813:    const ownHead = headKeyOf(verdict, "this verdict");
src/checks.ts:5829:    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
scripts/check-dual-review.mjs:261: * as `no-head` and it arrives here in `offHead`, never admitted.
scripts/check-dual-review.mjs:622:      (found.offHead ?? []).length > 0 && (found.offHead ?? []).every((entry) => entry.relation.kind === "no-head"),
```

Reading the rows. The three readers of a SIBLING's head are
merge-preconditions.ts:1239, checks.ts:4013 (this fix) and checks.ts:4460;
all three now call `declaresNoHead` before `headKeyOf`. checks.ts:4017 and
:4471 are the present-head path, which keeps the refusal. checks.ts:5552 and
:5813 read the verdict's OWN head, not a sibling's (see below).
check-dual-review.mjs:622 is the CR-006 line added in this round and reads
the result of checks.ts:4460. A second grep, for `["head"]` and `.head` in
the same files, found only display uses: merge-preconditions.ts:1246 builds a
`declared` string after the no-head exclusion, and check-dual-review.mjs
prints `anchor.head` in lines.

What the derivation did NOT cover:

- **checks.ts:5552 and :5813, the instance's OWN head.** `tiphys validate
  --context` on a head-less verdict still refuses it through the derived
  checks. That is open question 3, unchanged: a merge question asked of one
  history document by an explicit command.
- **Lexical only.** A head read through a computed key or a helper not named
  in the pattern would be missed.
- **Kernel only.** `plugin/` and every consumer other than pulse were not
  searched.

### Test, red at b57bd7c and green after

Test: "a same-phase sibling verdict with no head is history: a real pulse
M3-P3 round-4 review beside an anchored approving pair is excluded by name and
both merge gates clear the review conditions, while a sibling whose head is
present and unusable still reddens both" (test/history-compat.test.ts, behavior
`admission-headless-sibling-is-history`). It stages pulse's
m3-p3-criteria-round4.yaml byte for byte beside the anchored approving pair,
re-phased to M3-P3. Arm 1: check-dual-review green with a REPORT line naming
the sibling for both checks; merge-preconditions reaches its repository
condition with no `condition-1=red` or `condition-2=red`. Arm 2, the control:
the same sibling with a present, abbreviated head reddens both gates with
`INVALID #/head ... declares head <7 hex>, which is not forty lowercase
hexadecimal digits`. The abbreviated head is written QUOTED: the full
suite on the merged tree failed this test once, because that run's reviewed
sha began `0259038`, which YAML reads as a number, so the gate refused it
with `declares head as a number` instead (still a refusal, a different
message). Unquoted, the arm fails whenever the seven characters parse as a
number, about one run in 27 for all-decimal alone. After quoting, the test
passed three consecutive runs. Both arms compare git's live name list with a new real
capture, `budget-name-list-m3-p3-sibling` in
witness/captures/kernel-0-2-1-history-git.json (git 2.43.0).

Before the fix (src/checks.ts as at b57bd7c): 1 test, 0 pass, 1 fail, and the
gate printed four lines of this form, two per check:

```
INVALID #/head delivery/review/m3-p3-criteria-round4.yaml declares no head, so the reviews cannot be grouped by the head they reviewed, and a delegated grant is not satisfied by a review that does not say what it reviewed (check: dual-review-decorrelation) [delivery/review/m3-p3-resumed-criteria.yaml]
```

After: 1 test, 1 pass, 0 fail. The related files (history-compat,
verdict-head, dual-review, checks, single-family-exception,
dual-review-head-anchor) after the fix: 151 tests, 151 pass, 0 fail,
0 skipped.

A second red run, against a whole b57bd7c tree (`git archive b57bd7c` into
the scratchpad, this round's test file copied in), for all four new tests of
this round:

```
validate-not-in-force-line-names-stamp b57bd7c exit=1 pass=0 fail=1 AssertionError [ERR_ASSERTION]: null:
validate-not-in-force-line-names-stamp fix-round exit=0 pass=1 fail=0
rules-since-malformed-since-is-internal-defect b57bd7c exit=1 pass=0 fail=1 AssertionError [ERR_ASSERTION]: Missing expected exception: {}
rules-since-malformed-since-is-internal-defect fix-round exit=0 pass=1 fail=0
check-dual-review-headless-only-warns-without-base b57bd7c exit=1 pass=0 fail=1 AssertionError [ERR_ASSERTION]: no warning:
check-dual-review-headless-only-warns-without-base fix-round exit=0 pass=1 fail=0
admission-headless-sibling-is-history b57bd7c exit=1 pass=0 fail=1 AssertionError [ERR_ASSERTION]: gates: run 0d5b09600378b719123a8622
admission-headless-sibling-is-history fix-round exit=0 pass=1 fail=0
```

### Witnesses, every member tried by hand

Method: copy the file out, apply the member (a mutation, or `git apply` of a
patch), run the one test by `--test-name-pattern`, copy back, run again.
Printed as (exit, pass, fail).

| witness | members | HEAD | each member | restored |
|---|---|---|---|---|
| kernel-0-2-1-headless-sibling-is-history | 3 (headless pushed to unkeyed; `headless` never returned; REPORT line made generic) | (0,1,0) | (1,0,1) each | (0,1,0) |
| kernel-0-2-1-validate-not-in-force-line | 3 (write removed; stamped phrase; unstamped phrase) | (0,1,0) | (1,0,1) each | (0,1,0) |
| kernel-0-2-1-rules-since-malformed-is-defect | 2 (throw only for a malformed stamp; early return before the since check) | (0,1,0) | (1,0,1) each | (0,1,0) |
| kernel-0-2-1-headless-only-warns-without-base | 2 (predicate false; warning dropped from the detail) | (0,1,0) | (1,0,1) each | (0,1,0) |
| kernel-0-2-1-stamp-written-by-brief-and-summary | 2 (M5: `ownVersionForStamp` returns undefined; the brief's stamp line removed) | (0,1,0) | (1,0,1) each | (0,1,0) |
| kernel-0-2-1-final-report-template-stamped | 2 (M6: template stamped 0.1.0; schema stamp pattern narrowed to 0.1.0) | (0,1,0) | (1,0,1) each | (0,1,0) |
| kernel-0-2-1-pulse-non-verdict-stays-invalid | 2 patches (M8: `kind` const dropped; `framing` no longer required) | (0,1,0) | (1,0,1) each | (0,1,0) |
| kernel-0-2-1-approve-with-medium-well-formed | 2 (schema escalation back to medium; patch removing medium from the severity vocabulary) | (0,1,0) | (1,0,1) each | (0,1,0) |

The headless-sibling witness sits in src/checks.ts, which spawns, so it
declares `consumesExternalOutput` citing the git capture the test compares.
The five CR-005 specs keep their members out of src/checks.ts for that
reason, and use patches where the target line is outside a changed hunk
(rule (d) is file-level for a patch, line-level for a mutation).

**One CR-005 row has no spec: `verdict-pair-blocking-finding-refused`.** Its
behavior lives only in src/checks.ts (`BLOCKING_SEVERITIES`, src/checks.ts:5689,
not in a changed hunk). A member there takes rule (f)'s capture obligation,
and the test (test/verdict-head.test.ts) consumes no captured external output
to cite. So this row's red demonstration is recorded here instead, as the
review allowed:

```
HEAD (0, '1', '0')
mutated export const BLOCKING_SEVERITIES: readonly string[ (1, '0', '1')
mutated     if (BLOCKING_SEVERITIES.includes(severity.valu (1, '0', '1')
RESTORED (0, '1', '0')
```

The first mutation drops `medium` from `BLOCKING_SEVERITIES`; the second
replaces the severity test with `if (false)`.

### The lows

- **CR-002, criterion 4c.** Recorded as an amendment section in
  delivery/decisions/DR-0053-kernel-0-2-0-rejects-verdicts-written-under-0-1-0.md:94:
  what changed, why (the owner's report and DR-0054), that
  `ChecksRun.failed` is kept, the reviewer's consumer search, and a
  release-note line.
- **CR-003, stale text.** Corrected: the validate.ts comment above
  `readStamp` (the gates do not read the stamp), the per-check comments of
  `modeGateSetsResolve`, `gateProbesResolve` and `tuitionTargetExists`, the
  `runChecks` header, and the Decisions bullet above (superseded for
  unstamped documents). Found while deriving CR-001, the same kind of stale
  text in the `head` `$comment` of schemas/verdict.schema.json, which said
  `headGroupFor` refuses a head-less sibling; corrected to the new behaviour.
- **CR-004, DR-0055.** Taken from origin/claude/m5-orchestrator-paperwork-3
  at 60c434f with `git show <ref>:<path>`; the only difference is the
  correction section to point 3.
- **CR-005.** Seven of the eight rows above; the eighth recorded above.
- **CR-006, the bare step without `--base`.** Fixed, small. When every
  excluded verdict declares no head, the not-applicable detail and evidence
  now carry `HEADLESS_ONLY_WARNING` (scripts/check-dual-review.mjs), which
  says the script computed no review budget and names `--base`. Test: "the
  bare check-dual-review script without --base, on a corpus whose every
  verdict declares no head, is not-applicable with a warning that names
  --base, and the same corpus with one anchored verdict carries no warning".
  Its control arm is red (measured), because the anchored verdict alone
  reaches the derived checks, which refuse a group of one; the warning is
  absent there.
- **CR-KH-002, the malformed `since`.** `ruleApplies` now parses `since`
  FIRST, for every document, and throws `internal defect: RULES_SINCE entry
  <id> has since "<value>", which is not a kernel version (major.minor.patch)`.
  Before, the cast hid the case, and an unstamped document never reached the
  comparison, so the defect showed only for stamped documents. The test
  asserts the throw for no stamp, 0.1.0, the current version and a malformed
  stamp, and that every shipped row applies to a current stamp.
- **CR-KH-001, a check gated out by stamp.** `validate` now prints
  `NOT IN FORCE <check> for <stamp>` after the check lines, for example
  `NOT IN FORCE verdict-pair-approves for tiphys-version 0.1.0`, and
  `for no tiphys-version` when unstamped. **The finding's premise was only
  partly reproduced.** At b57bd7c the same 0.1.0-stamped document already
  printed a HISTORY line naming the check; it did not print anything beside
  the SKIPPED lines. Captured with the b57bd7c tree:

  ```
  exit=0
  HISTORY verdict-head-full-sha applies from tiphys-version 0.2.0 (a present head is the full forty-character lowercase sha (M4-P10)); this document is stamped tiphys-version 0.1.0
  HISTORY verdict-pair-approves applies from tiphys-version 0.2.0 (the committed pair for the head both approve with no blocking finding (M4-P10)); this document is stamped tiphys-version 0.1.0
  SKIPPED dual-review-decorrelation no context
  SKIPPED verdict-criteria-complete no context
  SKIPPED verdict-deviations-judged no context
  SKIPPED verdict-hazard-classes-addressed no context
  ```

  The fix-round tree prints the same seven lines plus
  `NOT IN FORCE verdict-pair-approves for tiphys-version 0.1.0`, still exit 0.

### Citations re-pointed

This round inserted lines into src/checks.ts, src/stamp.ts and
src/commands/validate.ts, so `path:line` citations written against b57bd7c
earlier in this file would have resolved silently to other lines. Each was
mapped from b57bd7c to the new tree by a line diff (difflib, scratch
fr1-remap.py): 18 moved by an exact line match, 2 (both src/checks.ts:633,
inside a rewritten comment) moved to the start of the rewritten block, and
21 did not move. Citations inside backticks were left alone.

### What this round did not do

- It did not change checks.ts:5552 and :5813 (open question 3).
- It did not add a spec for `verdict-pair-blocking-finding-refused` (above).
- It did not re-examine any consumer other than pulse.

<!-- fix-round-2 -->
## Fix round 2 (re-verifications of 1e48bff)

Inputs: the hazard re-verification (FIX-ROUND-NEEDED, one new high,
CR-KH-003) and the criteria re-verification (APPROVE, one new low, CR-007).
The orchestrator ruled they are one mechanism and fixed the design; this
round implements it and does not reopen DR-0054 or DR-0055. All runs are
node v26.6.0 (the scratch toolchain, `node --version` printed `v26.6.0`).

### The mechanism

`headGroupFor` decided "this sibling is history" from the document's SHAPE
alone (`declaresNoHead`), never from WHEN it was written. Shape is not
provenance: a verdict written today that omits `head` got the exemption
DR-0054 grants to documents that predate the field. CR-KH-003: two clean
APPROVE verdicts at the audited head plus a freshly committed head-less
FIX-ROUND-NEEDED verdict with a high finding, and check-dual-review was green
at exit 0. CR-007: the same exemption let a stamped current review omit the
field and still validate.

The general form: **an exemption for history, keyed on a property the
present can also have.** The fix keys it on a property only the past has:
the same bytes at the merge base.

### Pulse checked first: a "head-less with a blocking finding refuses" rule would judge history

Read with the yaml package over every file in /home/user/pulse/delivery/review
(scratch fr2-pulse.mjs):

```
verdicts=42 headless=42 headless-with-blocking-finding=29 headless-not-APPROVE=19
```

The M3-P3 files the CR-001 test stages:

```
m3-p3-criteria-round3.yaml phase=M3-P3 head=NO verdict=APPROVE blocking=[]
m3-p3-criteria-round4.yaml phase=M3-P3 head=NO verdict=APPROVE blocking=[CR4-M3P3-01(medium)]
```

(m3-p3-hazard-round3.yaml and m3-p3-hazard-round4.yaml are not `kind:
verdict`.) So 29 of pulse's 42 committed verdicts carry a finding at medium
or above, round4 among them. A shape rule keyed on findings would refuse
pulse's paused M3-P3 phase again, which is what CR-001 fixed and DR-0054
forbids. The survey is why provenance, not content, is the discriminator,
and no such rule was added.

### What changed

1. **Provenance decides history** (src/checks.ts:4109). With a base, a
   head-less same-phase sibling is excluded as history only when
   `git rev-parse --verify --quiet <rev>:./<path>` gives the same blob at the
   audited commit and at the merge base (src/checks.ts:4158). One the change
   ADDS or CHANGES goes to `unkeyed` and is a violation in both
   `dual-review-decorrelation` and `verdict-pair-approves`, naming the path,
   ADDS or CHANGES, the merge base, the verdict, every blocking finding with
   its severity, and the remedy (src/checks.ts:4168). The provenance is
   established once per run (src/checks.ts:3990): `unchecked` with no base,
   `error` when a base was given and the merge base could not be found or the
   corpus came from the working tree. `error` refuses every head-less sibling,
   because "could not tell" must not shrink the group.
2. **The base is threaded through.** `DerivedCheck.run` takes an optional
   `{ base }`. merge-preconditions passes `flags.base`
   (src/gates/merge-preconditions.ts:810); check-dual-review passes
   `--base` (scripts/check-dual-review.mjs:527).
3. **No base: the exclusion stays and says so.** The REPORT line
   (src/checks.ts:4067) reads "is excluded as history (DR-0054) on its SHAPE
   ALONE: provenance was NOT checked, because no base was given ... it reads
   verdict X, blocking finding(s) ID (severity)". The at-base line reads "is
   unchanged since the merge base <sha>, so it is history (DR-0054)" and names
   the verdict and findings too (src/checks.ts:4036 builds that phrase).
4. **`tiphys validate` requires `head` from 0.2.0 on** (CR-007, option 1).
   `head` is back in the schema's `required`, and a new RULES_SINCE row,
   `verdict-head-required` (src/stamp.ts:153), lifts exactly that entry for a
   document stamped before 0.2.0 or not stamped. A stamped 0.2.0 head-less
   verdict now prints `INVALID #/head required property head is missing` and
   exits nonzero; an unstamped one prints the HISTORY line and no INVALID.
   Admission still does not read the stamp (DR-0055 correction, unchanged).
5. **The header sentence is corrected.** "the fail-open worry above does not
   apply to it" is gone; the `headGroupFor` header (src/checks.ts:4089 to
   src/checks.ts:4108) now states the provenance rule, the no-base arm and
   the residual. The `partitionByAuditedHead` exclusion wording no longer
   asserts "is history"; it says the merge checks decide that from provenance
   (src/checks.ts:4660).

### A defect the control arm found in this round's own first draft

The first run of the control (pulse's round4 committed at the base, unchanged)
was green at check-dual-review and RED at merge-preconditions, condition 1:

```
condition-1 (...) red -- #/head /tmp/tiphys-history-compat-gate-1coNUV/delivery/review/m3-p3-criteria-round4.yaml declares no head, and the change under audit ADDS it (merge base cad1676...)
```

The corpus loader returns `join(contextDirectory, <path>)`, so the path is
ABSOLUTE when the context directory is (merge-preconditions resolves it) and
relative when it is not (the script was given a relative one). `rev:./<abs>`
is never found, so every sibling read as ADDED at one gate only. `blobAt` now
takes the path back to the context directory first (src/checks.ts:4026), and
that line is a member of the history witness below: reverting it reddens
the control test (member 3 in the trial output). Without the control arm
this would have shipped as a refusal of pulse's real history at the gate
that carries the merge grant.

### Derivation

Every site that decides history or excludes a verdict from a group, before
and after. Command (run from the worktree root):

```
grep -rnE 'headless|declaresNoHead\(|headGroupFor\(|excluded by name|is history|no-head' src scripts bin --include=*.ts --include=*.mjs | cut -c1-200
```

Before the fix (at 1e48bff's code, 37 lines):

```
src/gates/merge-preconditions.ts:1239:    if (declaresNoHead(entry.record)) {
src/gates/merge-preconditions.ts:1240:      excluded.push({ path: entry.path, declared: "", relation: { kind: "no-head" } });
src/checks.ts:3943:   * by path. History, excluded by name and never a member; the caller prints
src/checks.ts:3946:  headless: string[];
src/checks.ts:3950:function headlessSiblingReport(checkId: string, path: string, phase: string, headKey: string): string {
src/checks.ts:3951:  return `REPORT ${checkId} ${path} declares no head, so it is history (DR-0054): excluded by name from the group for phase ${phase} at head ${headKey}, never counted toward it and 
src/checks.ts:3968: * MAKES. A sibling that declares NO head key is history, written before
src/checks.ts:3973: * M3-P3. So it is EXCLUDED BY NAME (`headless`, printed by every caller) and
src/checks.ts:3980:function headGroupFor(
src/checks.ts:3987:  const headless: string[] = [];
src/checks.ts:4013:    if (declaresNoHead(candidate.record)) {
src/checks.ts:4014:      headless.push(candidate.path);
src/checks.ts:4026:  return { members, unkeyed, headless };
src/checks.ts:4210:  | { kind: "no-head" };
src/checks.ts:4225:export function declaresNoHead(record: Record<string, unknown> | undefined): boolean {
src/checks.ts:4460:    if (declaresNoHead(candidate.record)) {
src/checks.ts:4461:      offHead.push({ path: candidate.path, declared: "", relation: { kind: "no-head" } });
src/checks.ts:4500:      if (entry.relation.kind === "no-head") {
src/checks.ts:4503:          `toward a merge; a verdict written before the field existed is history (DR-0054) and ${tail}`
src/checks.ts:5560:    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
src/checks.ts:5653:    const headlessReports = grouped.headless.map((path) =>
src/checks.ts:5654:      headlessSiblingReport("dual-review-decorrelation", path, phase, headKey),
src/checks.ts:5664:            [...exceptionReports, ...headlessReports]
src/checks.ts:5667:              ...headlessReports,
src/checks.ts:5829:    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
src/checks.ts:5867:    const headlessReports = grouped.headless.map((path) =>
src/checks.ts:5868:      headlessSiblingReport("verdict-pair-approves", path, phase, headKey),
src/checks.ts:5874:          ? headlessReports
src/checks.ts:5876:              ...headlessReports,
scripts/check-dual-review.mjs:261: * as `no-head` and it arrives here in `offHead`, never admitted.
scripts/check-dual-review.mjs:619:       corpus is history only, and without --base this run cannot tell a
scripts/check-dual-review.mjs:621:    headlessOnly:
scripts/check-dual-review.mjs:622:      (found.offHead ?? []).length > 0 && (found.offHead ?? []).every((entry) => entry.relation.kind === "no-head"),
scripts/check-dual-review.mjs:911:        (run.headlessOnly === true ? `; ${HEADLESS_ONLY_WARNING}` : ""),
scripts/check-dual-review.mjs:916:        ...(run.headlessOnly === true ? [HEADLESS_ONLY_WARNING] : []),
scripts/check-cutover-entry.mjs:929: *   2. A path git cannot date (untracked, no commit in this history, no git, no
scripts/check-cutover-entry.mjs:1045:      reason: `no commit in this history records a change to ${relativePath}`,
```

After the fix (40 lines):

```
src/gates/merge-preconditions.ts:1242:    if (declaresNoHead(entry.record)) {
src/gates/merge-preconditions.ts:1243:      excluded.push({ path: entry.path, declared: "", relation: { kind: "no-head" } });
src/checks.ts:3962:  headless: HeadlessSibling[];
src/checks.ts:3982: * then refused, because "could not tell whether this is history" must not
src/checks.ts:4067:function headlessSiblingReport(checkId: string, sibling: HeadlessSibling, phase: string, headKey: string): string {
src/checks.ts:4070:      ? `is unchanged since the merge base ${sibling.ground.mergeBase}, so it is history (DR-0054)`
src/checks.ts:4072:  return `REPORT ${checkId} ${sibling.path} declares no head and ${ground}: excluded by name from the group for phase ${phase} at head ${headKey}, never counted toward it and never 
src/checks.ts:4089: * MAKES. A sibling that declares NO head key is history, written before
src/checks.ts:4094: * M3-P3. So it is EXCLUDED BY NAME (`headless`, printed by every caller) and
src/checks.ts:4100: * head-less sibling is history ONLY when the same bytes exist at the merge
src/checks.ts:4109:function headGroupFor(
src/checks.ts:4118:  const headless: HeadlessSibling[] = [];
src/checks.ts:4144:    if (declaresNoHead(candidate.record)) {
src/checks.ts:4146:        headless.push({ path: candidate.path, record: candidate.record, ground: { kind: "unchecked" } });
src/checks.ts:4159:        headless.push({
src/checks.ts:4181:  return { members, unkeyed, headless };
src/checks.ts:4365:  | { kind: "no-head" };
src/checks.ts:4382:export function declaresNoHead(record: Record<string, unknown> | undefined): boolean {
src/checks.ts:4617:    if (declaresNoHead(candidate.record)) {
src/checks.ts:4618:      offHead.push({ path: candidate.path, declared: "", relation: { kind: "no-head" } });
src/checks.ts:4657:      if (entry.relation.kind === "no-head") {
src/checks.ts:4660:          `toward a merge, and ${tail}; whether it is history (DR-0054) or current work is decided by the ` +
src/checks.ts:5718:    const grouped = headGroupFor(
src/checks.ts:5817:    const headlessReports = grouped.headless.map((sibling) =>
src/checks.ts:5818:      headlessSiblingReport("dual-review-decorrelation", sibling, phase, headKey),
src/checks.ts:5828:            [...exceptionReports, ...headlessReports]
src/checks.ts:5831:              ...headlessReports,
src/checks.ts:5993:    const grouped = headGroupFor(
src/checks.ts:6037:    const headlessReports = grouped.headless.map((sibling) =>
src/checks.ts:6038:      headlessSiblingReport("verdict-pair-approves", sibling, phase, headKey),
src/checks.ts:6044:          ? headlessReports
src/checks.ts:6046:              ...headlessReports,
scripts/check-dual-review.mjs:261: * as `no-head` and it arrives here in `offHead`, never admitted.
scripts/check-dual-review.mjs:621:       corpus is history only, and without --base this run cannot tell a
scripts/check-dual-review.mjs:623:    headlessOnly:
scripts/check-dual-review.mjs:624:      (found.offHead ?? []).length > 0 && (found.offHead ?? []).every((entry) => entry.relation.kind === "no-head"),
scripts/check-dual-review.mjs:913:        (run.headlessOnly === true ? `; ${HEADLESS_ONLY_WARNING}` : ""),
scripts/check-dual-review.mjs:918:        ...(run.headlessOnly === true ? [HEADLESS_ONLY_WARNING] : []),
scripts/check-cutover-entry.mjs:929: *   2. A path git cannot date (untracked, no commit in this history, no git, no
scripts/check-cutover-entry.mjs:1045:      reason: `no commit in this history records a change to ${relativePath}`,
```

Classified. Three kinds of site, and only one exempts:

- **Exempts a head-less sibling from a group** (the mechanism): the
  `headGroupFor` branch at src/checks.ts:4144, reached from exactly two
  callers, src/checks.ts:5718 (`dual-review-decorrelation`) and
  src/checks.ts:5993 (`verdict-pair-approves`). Both now pass a provenance.
  Fixed.
- **Refuses to admit a head-less verdict** (fail-closed, not the mechanism):
  src/gates/merge-preconditions.ts:1242 and src/checks.ts:4617 put it in
  `excluded` / `offHead`, never counted toward the two reviews. Only the
  wording at src/checks.ts:4660 changed.
- **Warns** (not the mechanism): the `headlessOnly` warning in
  scripts/check-dual-review.mjs:623 fires only when no verdict is admitted;
  the CR-006 test (test/history-compat.test.ts:419) asserts that corpus is
  not-applicable, not green.
- scripts/check-cutover-entry.mjs:929 and :1045 are grep noise ("history" of
  a file's commits).

A second derivation, for who reaches the checks and whether a base can arrive:

```
grep -rnE '(check|entry|derived|c)\.run\(' src scripts bin plugin/src --include=*.ts --include=*.mjs | cut -c1-200
src/gates/merge-preconditions.ts:810:      const outcome = check.run(verdict.record, contextDirectory, { base });
src/checks.ts:6350:    const outcome = check.run(instance, contextDirectory);
scripts/check-dual-review.mjs:527:      const outcome = check.run(instance, directory, { base: options.base });
```

The third, `runChecks`, is `tiphys validate --context`, which has no base
flag: it runs the checks unchecked and its REPORT line says provenance was
not checked. It is not a merge gate.

### What the derivation did not cover

- **Only `src`, `scripts`, `bin`** (and `plugin/src` for the second grep). A
  separate grep over plugin, .claude, templates, roles and schemas printed
  only two unrelated "the log is history" comments in plugin/src/hooks
  (tool-call-observer.ts and project-write-block.ts) and their plugin/dist
  copies. `test/` was not classified as sites: two test files name
  `headGroupFor` or `declaresNoHead`, and they are the tests below.
- **A reader that decides "history" without any of these words.** The
  review-families falsifiers (`firstDeclarationCommit`, `singleFamilyException`)
  already date history by commit (fix round 1, CR-004) and use no shape test;
  I read that code and did not re-derive it here. Any other exemption spelled
  differently would be missed by this grep.
- **Provenance through renames.** The blob comparison is per path. A head-less
  verdict renamed in the change is ADDED at its new path and is refused. I
  did not treat a pure rename as history; that is the fail-closed direction
  and is stated rather than tested.

### Residual, stated and not fixed

A head-less verdict with a blocking finding that is ALREADY ON THE BASE is
still history, excluded by name from the group. If one reached `main`
before this round (written after the field existed but merged without it),
the gates keep excluding it. The REPORT line names its verdict and blocking
findings, so it is visible, never silent. Closing that needs a date for
"before the field existed", which DR-0054 does not give.

The no-base arm is the same exemption on shape alone: a consumer who wires
check-dual-review by hand without `--base` still gets CR-KH-003's green, now
with a line saying provenance was not checked and naming the high finding.
This repository's own workflow has such a step: .github/workflows/gates.yml
runs `node scripts/check-dual-review.mjs .` with no `--base` (its line 225,
labelled informational), so on CR-KH-003's shape that step reads green with
the provenance line. The enforcing arm is merge-preconditions, which
scripts/m2-exit-test.sh runs through the gate runner with `--base`; the gate
runner forwards `--base` to both gates, which is how every refusal in the
tests below was produced.

### Tests, red at 1e48bff and green after

Scratch fr2-base-red.py extracts 1e48bff with `git archive`, copies in this
round's test files and the capture, and runs each test by exact name in both
trees. `ARM` selects one member of the class and `ARMS_ONLY` stops before the
no-base arm, in a copy of the test file only. Captured:

```
(a) added, high | 1e48bff exit=1 pass=0 fail=1 AssertionError [ERR_ASSERTION]: (a) added with a high finding: gates: run e2809490b4cb3473ae709ebb
(a) added, high | fix-round-2 exit=0 pass=1 fail=0 
(b) at base, changed | 1e48bff exit=1 pass=0 fail=1 AssertionError [ERR_ASSERTION]: (b) at the base, changed to FIX-ROUND-NEEDED: gates: run cdeab39565ead229e414976e
(b) at base, changed | fix-round-2 exit=0 pass=1 fail=0 
whole test | 1e48bff exit=1 pass=0 fail=1 AssertionError [ERR_ASSERTION]: (a) added with a high finding: gates: run 1c2f05a90e80b7bce4684c7e
whole test | fix-round-2 exit=0 pass=1 fail=0 
control, at base unchanged | 1e48bff exit=1 pass=0 fail=1 AssertionError [ERR_ASSERTION]: dual-review-decorrelation did not name the excluded sibling:
control, at base unchanged | fix-round-2 exit=0 pass=1 fail=0 
validate stamped head-less | 1e48bff exit=1 pass=0 fail=1 AssertionError [ERR_ASSERTION]: HISTORY verdict-head-full-sha applies from tiphys-version 0.2.0 (a present head is the full forty-character lowercase sha (M4-P10)); this document carries no tiphys-version, so it is pre-stamp history held to the 0.1.0 rules
validate stamped head-less | fix-round-2 exit=0 pass=1 fail=0 
```

At 1e48bff both members are the dangerous state itself, green at the gate
that carries the merge grant (same run, `grep -aE "!==|check-dual-review"`):

```
  gates: check-dual-review: green: 2 verdict(s) for the commit under audit 52b75bb... examined by 1 registered check(s) named dual-review-decorrelation and 1 named verdict-pair-approves; no decorrelation violation and the pair approves; 2 of 2 v
  'green' !== 'red'
```

(the same two lines for member (b), commit f04b02b...). The control is red at
1e48bff only on the REPORT wording, as it should be: it was history there too.

The tests:

- test/history-compat.test.ts:1050, new: members (a) and (b), each red at
  both gates with the ADDS or CHANGES refusal once per check (condition 1
  and condition 2 named separately at merge-preconditions), and the no-base
  arm, green with the "provenance was NOT checked" line naming
  `verdict FIX-ROUND-NEEDED, blocking finding(s) CR4-M3P3-01 (high)`.
- test/history-compat.test.ts:972, retitled: the control, pulse's round4
  committed AT THE BASE byte for byte (the staging's new `atBase` option,
  test/history-compat.test.ts:239), both gates clear the review conditions,
  the REPORT line names the merge base, `verdict APPROVE, blocking
  finding(s) CR4-M3P3-01 (medium)`. The abbreviated-head arm is unchanged.
- test/verdict-head.test.ts:337, :363 and :434: the schema requires `head`
  and the RULES_SINCE row exists; validate's three arms (unstamped head-less
  valid with a HISTORY line, stamped 0.2.0 head-less INVALID and nonzero,
  abbreviated refused); the history document validates against the shipped
  schema as validate applies it, RULES_SINCE's entry lifted.

Every git output the new arms consume is compared with a real capture before
either gate is trusted. Three captures were added to
witness/captures/kernel-0-2-1-history-git.json, by scratch fr2-capture.py
against scratch repositories laid out as the test stages them, git 2.43.0:
`budget-name-list-m3-p3-resumed` (the diff name list when round4 is at the
base), `sibling-blob-at-base` (exit 0, `33aa03f31bf8a5bbe85ddb72cfdcbb9d800b2b71`,
which `git hash-object` gives for pulse's file) and
`sibling-blob-absent-at-base` (exit 1, nothing printed).

Behavior rows: `admission-headless-sibling-provenance-decides-history` and
`validate-verdict-head-required-from-0-2-0` added;
`admission-headless-sibling-is-history` now names the retitled test.

### Witnesses, every member tried by hand

New: witness/kernel-0-2-1-headless-sibling-provenance.json, three members
of one class ("a head-less sibling the change wrote is treated as history"),
each structurally different: the blob comparison dropped (`atHead !==
undefined`), provenance never established (`base === undefined || base !==
""`), and the base read at the wrong revision (`provenance.refSha`). Updated:
witness/kernel-0-2-1-headless-sibling-is-history.json (member 0 now refuses
history through the comparison, member 2 finds the new REPORT text, member 3
is the absolute-path fix), witness/kernel-0-2-1-history-well-formed.json
(member 0 was a patch that put `head` back in `required`; that is now the
shipped state, so it is a mutation of the RULES_SINCE row's entry and the
patch file is deleted), and
witness/merge-preconditions-composed-check-violations-are-red.json (its find
is the `check.run` call, which now passes `{ base }`). Every mutation find
in witness/ was re-checked for presence by scratch fr2-finds.py; the three
stale finds above were the only ones this round made stale.

Scratch try-members3.py, each member applied, the named test run, restored:

```
kernel-0-2-1-headless-sibling-provenance HEAD (0, '1', '0')
kernel-0-2-1-headless-sibling-provenance member 0 (1, '0', '1')
kernel-0-2-1-headless-sibling-provenance member 1 (1, '0', '1')
kernel-0-2-1-headless-sibling-provenance member 2 (1, '0', '1')
kernel-0-2-1-headless-sibling-provenance RESTORED (0, '1', '0')
kernel-0-2-1-headless-sibling-is-history HEAD (0, '1', '0')
kernel-0-2-1-headless-sibling-is-history member 0 (1, '0', '1')
kernel-0-2-1-headless-sibling-is-history member 1 (1, '0', '1')
kernel-0-2-1-headless-sibling-is-history member 2 (1, '0', '1')
kernel-0-2-1-headless-sibling-is-history member 3 (1, '0', '1')
kernel-0-2-1-headless-sibling-is-history RESTORED (0, '1', '0')
kernel-0-2-1-history-well-formed HEAD (0, '1', '0')
kernel-0-2-1-history-well-formed member 0 (1, '0', '1')
kernel-0-2-1-history-well-formed member 1 (1, '0', '1')
kernel-0-2-1-history-well-formed RESTORED (0, '1', '0')
```

(tuples are exit, pass, fail).

**A stale PATCH that fr2-finds.py did not look for.** fr2-finds.py checked
mutation finds only, and a patch's presence. The first bundle run (below)
put red-witness at `error`: witness/patches/kernel-0-2-1-verdict-framing-not-required.patch
no longer applied, because its context line `"phase",` is now followed by
`"head",` in `required`. The hunk header and context were moved one line
(`@@ -12,7 +12,6 @@`, context `"head",`); the removed line is still
`"framing",`. scratch fr2-patchfix.py then ran `git apply --check` on all 13
files in witness/patches and printed only `checked 13`. Hand trial after:

```
kernel-0-2-1-pulse-non-verdict-stays-invalid HEAD (0, '1', '0')
kernel-0-2-1-pulse-non-verdict-stays-invalid member 0 (1, '0', '1')
kernel-0-2-1-pulse-non-verdict-stays-invalid member 1 (1, '0', '1')
kernel-0-2-1-pulse-non-verdict-stays-invalid RESTORED (0, '1', '0')
```

### Gates for fix round 2

All on node v26.6.0, origin/main at 3eeccb9 (unmoved, fetched after the
runs, so no merge was owed).

At ffb786d, scratch run-green9.sh: `npm run build` exit 0 with `git status
--short` printing nothing after it; `npm test` exit 0, 1484 tests, 1484 pass,
0 fail, 0 skipped (dist built); check-authored-bytes exit 0;
render-agent-rules-gates --check exit 0 (24 rows). The PR bundle
(`scripts/m2-exit-test.sh --base origin/main --head HEAD --bundle pr`):
`declared 15 applicable 10 verdict 9 green 8 red 1 not-applicable 5 error 1`.
Red was merge-preconditions, the expected red for a branch whose two reviews
of this head do not exist yet ("A missing review is RED"). Error was
red-witness, the stale patch recorded above. The suite gate reported
`1484 test(s) from 70 file(s) (pass 1484, fail 0, skipped 0)`.

At e55af6f (the patch repair), the red-witness gate alone:

```
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: red-witness: green: 113 witness(es) evaluated (22 own, 91 stored re-evaluated in 892862ms); every witness red against every declared dangerous state and green at head
```

The citations gate at ffb786d: green, 4 citation(s) resolved in 2 changed
document(s). The affected test files (scratch run-affected.sh, 12 files
including test/history-compat.test.ts and test/verdict-head.test.ts): 260
tests, 260 pass, 0 fail, 0 skipped; test/history-compat.test.ts alone: 21
tests, 21 pass, 0 skipped.

<!-- fix-round-3 -->
## Fix round 3 (CI run 35946757118 on f39daae, test isolation only)

The coordinator's brief: CI's `pull_request` run 35946757118 (gates job
107466376655) on f39daae failed ONE test of 1484 (1483 pass, 1 fail, 0
skipped, step "Run npm test"): the second, no-git arm of "a corpus-scoped
refusal names the source that corpus was read from, on both arms"
(test/single-family-exception.test.ts:1265 now; line 1244 at f39daae). It
removes `.git` from a staged directory and expects "read from the WORKING
TREE". CI printed instead:

```
check-dual-review: error (0 review verdicts examined for decorrelation)
/tmp/tiphys-single-family-QRfyjc/assurance-modes.yaml does not exist in commit 3cb63cca05296ea360172c6a15e0b7048629eef8, resolved from HEAD, so the declared mode's merge-authority is unknown and no decorrelation verdict can be reached; a merge check that cannot determine the regime reports error, never green
```

No source file changed in this round. Only tests, one capture, one witness
spec and the behaviors row.

### The mechanism

**A test asserts what the code does when NO repository is found, from a
directory under os.tmpdir(), and relies on no repository existing ABOVE
os.tmpdir().** Git discovery walks from the working directory up to the
filesystem root, and it accepts either a directory holding `.git` or a
directory that is itself a git directory. So a repository at or above the
scratch root turns each such arm into a read of THAT repository's HEAD.
`resolveCorpusSource` (src/checks.ts:3511) runs `git rev-parse HEAD^{commit}`
in the context directory and falls back to the working tree only when that
fails; `gitIn` (src/checks.ts:4967) spawns git with the inherited environment.
The finding is one test; the mechanism is the missing ceiling, and it is not
specific to the removed-`.git` shape.

### Who created the ancestor: NOT FOUND

I did not find the creator. The evidence for the ancestor-repository reading,
and against the alternatives:

- CI checked out f39daae (the log's `git log -1` prints f39daaea...).
- 3cb63cc is in no repository this project owns: the GitHub `get_commit`
  call returned "No commit found for SHA", and `git cat-file -t 3cb63cc`
  failed in the local clone. A commit sha covers its timestamp, so it was a
  commit made during or near that run by something.
- The CI log has no stray "Initialized empty Git repository in /tmp/" line.
- An inotify watcher (scratch fr3-watch.py) on `/` and `/tmp`, which are the
  only ancestors of a `/tmp/tiphys-*` scratch directory, watching for the
  creation of `.git`, `HEAD`, `objects`, `refs`, `config`, `index` or
  `description`, logged ZERO such creations during two full local suites:
  `npm test` (1484 tests, 1484 pass, 0 fail, 0 skipped) and
  `node --test --test-concurrency=8 "test/**/*.test.ts"` (the same counts).
  Its only event was my own probe `touch /tmp/HEAD` before the runs.
- No test runs git with `cwd: tmpdir()`, and no test, source or script reads
  `process.env.CI` or a `GITHUB_*` name, so there is no CI-only code path.
- CI runs as `runner`, locally I run as root, and CI's git is 2.55.0 against
  2.43.0 here. Neither was reproduced.

**One fact the ancestor reading does not explain, stated rather than
smoothed.** The CI message names `assurance-modes.yaml`, and
`missingRegimeDocument` (src/checks.ts:4902) probes the two regime documents in
the order of `REGIME_DOCUMENTS` (src/checks.ts:4881): `charter.yaml` first. So in
CI `3cb63cc:./charter.yaml` WAS a blob and `3cb63cc:./assurance-modes.yaml` was
not. Measured with git 2.43.0 (scratch fr3-bare.sh, fr3-bareshape.sh,
fr3-gitdir.sh, and the red runs below), four shapes:

| shape above the staged directory | first missing document printed |
|---|---|
| a repository with `.git` at the scratch root | `charter.yaml` (fr3-red.txt, member 0) |
| a bare repository | neither probe resolves: "relative path syntax can't be used outside working tree", so `charter.yaml` |
| a non-bare git directory laid into the parent (no `.git`) | the same as bare, so `charter.yaml` |
| an inherited `GIT_DIR` naming a repository whose root holds `charter.yaml` only | `assurance-modes.yaml`: `blob` for charter, "exists on disk, but not in 'HEAD'" for modes, exactly CI's shape |

The GIT_DIR row is the only one that reproduces CI's exact message here, and
**GIT_CEILING_DIRECTORIES does not stop GIT_DIR** (fr3-gitdir.txt: the same
commit resolves with the ceiling set). But nothing in the single-family file or
in scripts/check-dual-review.mjs sets `GIT_DIR`: `grep -n process.env` on both
prints only the ceiling lines and the two identity spreads, and node's test
runner gives each file its own process. A repository whose HEAD tree held
`tiphys-single-family-QRfyjc/charter.yaml` and not its `assurance-modes.yaml`
would also give CI's message; `stage()` writes `assurance-modes.yaml` BEFORE
`charter.yaml`, so a snapshot of the scratch root taken mid-staging would miss
the other one. And git 2.55.0 may resolve `<rev>:./path` outside a work tree
differently from 2.43.0, which I could not test. So the exact shape of CI's
ancestor is OPEN, and what this round proves is the class below.

### Derivation

**By execution, which is the primary derivation**, because a grep for removed
`.git` finds only one of the six files (below). scratch fr3-ancestor-suite.sh
runs the whole suite (`npm test`, node v26.6.0, `dist/` built) with
`TMPDIR=$S/fr3-anc/tmp`, where `$S/fr3-anc` is a real repository with one
commit (arm `anc`), and the control with `TMPDIR=$S/fr3-ctl/tmp` in a plain
directory (arm `ctl`). The probe line proves the state: from the `anc` scratch
root `git rev-parse --show-toplevel HEAD` printed the ancestor and ea2688b
(`probe=0`); from the `ctl` one it printed "fatal: not a git repository" (`probe=128`).

| arm, at f39daae | tests | pass | fail | skipped |
|---|---|---|---|---|
| `anc` | 1484 | 1418 | 66 | 0 |
| `ctl` | 1484 | 1482 | 2 | 0 |

The two control failures are the known traversal traps of running a scratch
toolchain under `/tmp/claude-0` (standing warning 1). scratch fr3-fails.py
diffs the failing-test lists (file:line and title, parsed from the reporter's
"failing tests" block; titles cut at about 110 characters by the script),
full output:

```
control failures:
  test/doctor.test.ts:2321 CHECK worktrees reports an unlistable pool as FAIL instead of letting the run abort
  test/gates.test.ts:3582 a precondition command exiting nonzero is error, not a skip, whenever a path-shaped argv element cannot be ope
ancestor-only failures: 64 (ancestor total 66)
  test/dual-review.test.ts: 20
  test/exit-test-local.test.ts: 1
  test/kernel-charter.test.ts: 3
  test/merge-preconditions.test.ts: 12
  test/single-family-exception.test.ts: 1
  test/verdict-head.test.ts: 27
  test/dual-review.test.ts:191 two verdicts for one head with distinct produced-by and framing exit 0
  test/dual-review.test.ts:203 two verdicts sharing a produced-by model family exit nonzero naming the duplicated value
  test/dual-review.test.ts:215 two verdicts sharing a framing exit nonzero naming the duplicated value
  test/dual-review.test.ts:229 one verdict for a head exits nonzero saying a delegated grant needs two
  test/dual-review.test.ts:259 a mode whose merge-authority is owner exits 0 on the very pair that reddens under a delegated grant
  test/dual-review.test.ts:290 deregistering dual-review-decorrelation makes the shared-family fixture pass, and restoring it makes it fail again
  test/dual-review.test.ts:351 two verdicts whose produced-by and framing both differ and whose review-contract is the same exit nonzero
  test/dual-review.test.ts:373 the same pair with one criteria contract and one hazard contract exits 0
  test/dual-review.test.ts:431 a verdict that states no produced-by is refused rather than read as distinct from the other
  test/dual-review.test.ts:458 two verdicts whose produced-by differs only by surrounding whitespace are not distinct
  test/dual-review.test.ts:524 a lookalike or invisible character in produced-by does not make a shared model family distinct
  test/dual-review.test.ts:561 a compatibility variant of a model family is folded onto it rather than refused
  test/dual-review.test.ts:583 a lookalike character in merge-authority does not turn a delegated grant into no grant
  test/dual-review.test.ts:620 a verdict whose kind is written in another case still counts toward the group it correlates with
  test/dual-review.test.ts:660 a mode that states no merge-authority is refused rather than reported as not a delegated grant
  test/dual-review.test.ts:684 a directory with no verdict document reports not-applicable with a reason rather than green
  test/dual-review.test.ts:700 the precondition arm answers only whether a verdict document exists, and against this repository it acts on the count it
  test/dual-review.test.ts:735 the merge-path caller refuses a directory that declares no regime, rather than treating the grant as absent
  test/dual-review.test.ts:762 a charter that is PRESENT and wrong is a violation, which an absent one deliberately is not
  test/dual-review.test.ts:813 a verdict that is not among the committed reviews cannot be cleared by the pair that is
  test/exit-test-local.test.ts:1085 the stub payload refuses a bad mode and a working directory that is not a worktree
  test/kernel-charter.test.ts:139 with a committed pair of verdicts the root charter is what lets the check reach a verdict
  test/kernel-charter.test.ts:158 removing the root charter from that same context makes the merge check error rather than green
  test/kernel-charter.test.ts:178 a root charter that is present and unusable fails loudly, and two different members do
  test/merge-preconditions.test.ts:521 the merge-preconditions gate reports one row per DR-0012 condition plus the branch-protection encoding and the verdict s
  test/merge-preconditions.test.ts:575 an unreachable API makes the gate report error with units zero and a reason naming the failure, where a catch-and-contin
  test/merge-preconditions.test.ts:633 condition 4 is green only when the check run's head sha equals the head under evaluation and red when the newest green r
  test/merge-preconditions.test.ts:686 condition 5 is red when the scope record reads red and red with a different reason when no record exists, and the gate w
  test/merge-preconditions.test.ts:739 condition 6 is red for an arbitration document that names only one verdict and red for one naming a different head, and 
  test/merge-preconditions.test.ts:820 an empty body from the ruleset API makes the gate report error rather than a default, where a mutant that defaults to pr
  test/merge-preconditions.test.ts:866 the branch-protection row is red against a disabled ruleset and red against one whose required status checks do not name
  test/merge-preconditions.test.ts:932 R-065a is reported as data on the green arm and never turns the branch-protection row red
  test/merge-preconditions.test.ts:959 a head no committed verdict names is not-applicable with an evaluated unmet precondition rather than green
  test/merge-preconditions.test.ts:994 deregistering the composed dual-review check makes its condition error rather than green, so a condition with no check b
  test/merge-preconditions.test.ts:1029 a pair of verdicts in which one refuses the merge reddens condition 2 while condition 1 stays green
  test/merge-preconditions.test.ts:1091 condition 4 is red when the API returns real check runs for this head and none of them is the required status check
  test/single-family-exception.test.ts:1244 a corpus-scoped refusal names the source that corpus was read from, on both arms
  test/verdict-head.test.ts:636 two verdicts carrying the SAME head are one group of two and the gate reports it green
  test/verdict-head.test.ts:649 two verdicts carrying DIFFERENT heads are two groups of one and the condition is not reported satisfied
  test/verdict-head.test.ts:708 RED WITNESS, criterion 3, member two: a sibling whose head cannot be read is refused, not silently dropped
  test/verdict-head.test.ts:735 an abbreviated head is refused rather than becoming a second group of one
  test/verdict-head.test.ts:759 an upper-case head is ONE key with its lower-case spelling, which is the other direction of the same hazard
  test/verdict-head.test.ts:799 a pair in which ONE verdict reads FIX-ROUND-NEEDED reddens verdict-pair-approves
  test/verdict-head.test.ts:842 the SHIPPED gate reddens that same both-refusing pair, which is what the pre-change green measures against
  test/verdict-head.test.ts:863 a verdict carrying a blocking finding reddens the pair predicate, which since 0.2.1 is the only layer that refuses mediu
  test/verdict-head.test.ts:888 a verdict spelled Approve is refused rather than read as an authorisation
  test/verdict-head.test.ts:914 a severity outside the four-word vocabulary is refused rather than treated as non-blocking
  test/verdict-head.test.ts:935 a low finding does NOT redden the pair predicate, which is the control the two refusals need
  test/verdict-head.test.ts:950 deregistering verdict-pair-approves makes the one-refusing pair pass, and restoring it makes it fail again
  test/verdict-head.test.ts:999 the gate prints each verdict's value, head and produced-by, not only how many it examined
  test/verdict-head.test.ts:1024 the two registered-check counts are printed separately, so one absent guard is not hidden by the other
  test/verdict-head.test.ts:1044 under an owner-authority mode neither check violates, and both say why rather than passing silently
  test/verdict-head.test.ts:1151 a sibling whose YAML does not decode makes the gate error instead of reporting the pair clean
  test/verdict-head.test.ts:1180 a sibling that cannot be read at all makes the gate error instead of reporting the pair clean
  test/verdict-head.test.ts:1209 a verdict sibling that states no phase is reported rather than silently left out of the group
  test/verdict-head.test.ts:1235 the phase-less sibling is reported through `tiphys validate` too, where only one instance is checked
  test/verdict-head.test.ts:1310 a sibling whose kind is a one-element list makes the gate error instead of reporting the pair clean
  test/verdict-head.test.ts:1310 a sibling whose kind is an invisible character makes the gate error instead of reporting the pair clean
  test/verdict-head.test.ts:1345 the two unreadable-kind members fail through different readers and say so differently
  test/verdict-head.test.ts:1362 a sibling that declares no kind at all is still skipped, and the pair still approves
  test/verdict-head.test.ts:1382 the gate runner and the derived check select the same documents, so a kind differing only in case is counted
  test/verdict-head.test.ts:1397 the precondition reports a directory whose only review document is unexaminable as APPLICABLE
  test/verdict-head.test.ts:1428 an empty review directory is still NOT-APPLICABLE, which is the control the four arms above need
  test/verdict-head.test.ts:1445 a prose review and a non-verdict document in the same directory are still skipped silently
```

Line numbers there are f39daae's. test/history-compat.test.ts, this PR's
other new test file, is not in the list, and neither is any witness or capture
script of mine: they run from the scratchpad and name every path absolutely.

**Statically, as a cross-check**, the shape the brief named:

```
grep -rnE 'rmSync\(join\([^)]*"\.git"|not a git (repository|worktree)|WORKING TREE because' test --include=*.ts
test/single-family-exception.test.ts:1296:  rmSync(join(noGit, ".git"), { recursive: true, force: true });
test/single-family-exception.test.ts:1300:    /\(corpus: delivery\/review read from the WORKING TREE because/,
test/resume.test.ts:336:test("resume in a directory that is not a git repository exits 1, names .git and creates nothing", (t) => {
test/resume.test.ts:366:  rmSync(join(clone, ".git"), { recursive: true });
test/resume.test.ts:389:  assert.equal(before, after, "resume rehydrated a directory that is not a git repository");
test/resume.test.ts:441:  rmSync(join(decapitated, ".git"), { recursive: true });
test/exit-test-local.test.ts:1126:    assert.match(notAWorktree.stderr, /is not a git worktree/);
test/next.test.ts:596:    // A project directory that is not a git repository at all: no base ref
```

It finds two of the six victim files. The other four stage directories that
were NEVER repositories, which no grep for a removed `.git` can see; that is
why execution is the derivation. The resume and next sites passed in the `anc`
arm: resume decides on `existsSync(.git)` itself, and test/next.test.ts:596 asks
for "not the top level of its own git repository", which an ancestor does not
change.

**For the creator, statically**: every site that makes a git directory by a
route other than a plain `init` of a fresh scratch directory, or names a git
dir. Command and full output, `test/fixtures/` excluded:

```
grep -rnE 'cwd: *(os\.)?tmpdir\(\)|--bare|--separate-git-dir|"clone"|--git-dir|GIT_DIR' test src scripts bin plugin --include=*.ts --include=*.mjs --include=*.js --include=*.sh | grep -v '^test/fixtures/'
test/payload-credentials.test.ts:198:  git(tmp, ["clone", "--quiet", upstream, clone]);
test/cutover.test.ts:101:    git(root, ["init", "-q", "--bare", bare]);
test/cutover.test.ts:2709:    git(root, ["init", "-q", "--bare", bare]);
test/sweep-exclusion-sync.test.ts:158:    ["-C", remote, ...GIT_FLAGS, "init", "--bare", "--initial-branch=main", "--quiet"],
test/sweep-exclusion-sync.test.ts:237:  assert.equal(git(root, ["clone", "--quiet", remote, homeB]).status, 0);
test/sweep-exclusion-sync.test.ts:262:  assert.equal(git(root, ["clone", "--quiet", remote, homeC]).status, 0);
test/sweep-exclusion-sync.test.ts:479:  assert.equal(git(root, ["clone", "--quiet", remote, homeB]).status, 0);
test/sweep-exclusion-sync.test.ts:862:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/doctor.test.ts:1199:  git(lab, ["init", "--bare", "--quiet", "--initial-branch=main", remote]);
test/doctor.test.ts:2032:  git(lab, ["init", "--bare", "--quiet", "--initial-branch=main", remote]);
test/adapter-load.test.ts:124:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/sync.test.ts:140:  const bare = spawnSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", remote], {
test/resume.test.ts:196:  const clone = join(root, "clone");
test/resume.test.ts:197:  const result = gitIn(root, ["clone", "--quiet", origin, clone]);
test/work-history.test.ts:622:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/exit-test-local.test.ts:936:    git(["init", "--bare", "--quiet", "--initial-branch=main", bare], {
test/exit-test-local.test.ts:962:    const clone = join(root, "clone");
test/exit-test-local.test.ts:963:    git(["clone", "--quiet", remote, clone], { cwd: root, env });
test/exit-test-local.test.ts:982:    git(["init", "--bare", "--quiet", "--initial-branch=main", bare], {
test/exit-test-local.test.ts:990:    const clone = join(root, "clone");
test/exit-test-local.test.ts:991:    git(["clone", "--quiet", remote, clone], { cwd: root, env });
test/exit-test-local.test.ts:1033:  git(["init", "--bare", "--quiet", "--initial-branch=main", bare], {
test/exit-test-local.test.ts:1042:  git(["clone", "--quiet", remote, project], { cwd: root, env });
test/spawn.test.ts:141:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/spawn.test.ts:1420:      const probeClone = join(linkDir, "clone");
test/spawn.test.ts:1421:      gitOk(live.tmp, ["clone", "--quiet", live.upstream, probeClone]);
test/spawn.test.ts:2084:    ["-C", remote, ...REGISTER_GIT_FLAGS, "init", "--bare", "--initial-branch=main", "--quiet"],
test/spawn.test.ts:2126:    ["-C", root, ...REGISTER_GIT_FLAGS, "clone", "--quiet", remote, target],
test/spawn.test.ts:2339:  registerGitOk(root, ["clone", "--quiet", upstream, projectClone]);
test/spawn.test.ts:2437:  registerGitOk(root, ["clone", "--quiet", upstream, projectClone]);
test/license-gate.test.ts:2514:  assert.equal(labGit(root, ["init", "--bare", "--initial-branch=main", remote]).status, 0);
test/status.test.ts:344:    const cloned = spawnSync("git", ["clone", "--quiet", root, clone], { encoding: "utf8" });
test/init.test.ts:80:  const clone = join(root, "clone");
test/init.test.ts:81:  const cloned = gitIn(root, ["clone", "--quiet", origin, clone], {
test/liveness.test.ts:224:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/credentials-gate.test.ts:231:  git(tmp, ["clone", "--quiet", upstream, clone]);
test/cross-environment-lock.test.ts:152:    ["-C", remote, ...GIT_FLAGS, "init", "--bare", "--initial-branch=main", "--quiet"],
test/cross-environment-lock.test.ts:195:    ["-C", root, ...GIT_FLAGS, "clone", "--quiet", remote, target],
test/plugin-adapter.test.ts:385:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/plugin-hooks.test.ts:842:  const bare = spawnSync("git", ["init", "--bare", "-q", remote], { encoding: "utf8" });
test/watcher.test.ts:936:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/orchestrator-next.test.ts:76:  git(origin, ["init", "-q", "--bare", "-b", "main"]);
test/project-write-block.test.ts:287:    assert.equal(git(fleet, ["clone", "-q", upstream, project]).status, 0);
test/project-write-block.test.ts:1029:    assert.equal(git(fleet, ["clone", "-q", upstream, project]).status, 0);
test/next.test.ts:539:    git(parent, ["clone", "--quiet", "--bare", repo, remote]);
test/next.test.ts:761:    git(parent, ["clone", "--quiet", upstream, join(fleet.projects, "cloned")]);
test/next.test.ts:767:    git(parent, ["clone", "--quiet", upstream, elsewhere]);
test/next.test.ts:846:    git(parent, ["clone", "--quiet", upstream, askew]);
test/cutover-entry.test.ts:614:    () => probe.assertReadOnlyGit(["clone", "https://example.invalid/x.git", "/tmp/nope"]),
test/cutover-entry.test.ts:618:    probe.assertReadOnlyGit(["clone", "--depth", "1", "https://example.invalid/x.git", "/tmp/ok"]),
test/cutover-entry.test.ts:756:  assert.equal(git(base, ["clone", "--bare", "--quiet", seed, bare]).status, 0);
test/cutover-entry.test.ts:1231:  const clone = join(cloneParent, "clone");
test/cutover-entry.test.ts:1232:  fixtureGit(cloneParent, ["clone", "--quiet", source, clone]);
test/cutover-entry.test.ts:1589: * `GIT_DIR` relocates the repository git answers about, so arm d's commit-order
test/cutover-entry.test.ts:1595:test("an inherited GIT_DIR does not relocate the repository arm d dates", () => {
test/cutover-entry.test.ts:1610:    const run = runCheckerWithEnv(root, { GIT_DIR: join(elsewhere, ".git") });
test/cutover-entry.test.ts:1614:      `an inherited GIT_DIR must not change which repository is read, got: ${armD}\n${run.text}`,
test/cutover-entry.test.ts:1632:    GIT_DIR: process.env.GIT_DIR,
test/cutover-entry.test.ts:1638:    process.env.GIT_DIR = "/nowhere/.git";
test/cutover-entry.test.ts:1650:      assert.equal(built.GIT_DIR, undefined);
test/cutover-entry.test.ts:1667:    assert.equal(probe.gitChildEnv().GIT_DIR, undefined);
test/cutover-entry.test.ts:1824:    "clone",
test/cross-environment.test.ts:261:    ["-C", remote, ...GIT_FLAGS, "init", "--bare", "--initial-branch=main", "--quiet"],
test/cross-environment.test.ts:288:    ["-C", root, ...GIT_FLAGS, "clone", "--quiet", remote, target],
test/pool.test.ts:146:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/pool.test.ts:1497:const OBJECT_TRANSFER_VERBS = new Set(["clone", "fetch", "pull", "push"]);
test/witness.test.ts:2526:  git(local, "clone", "-q", upstream, localRepo);
test/witness.test.ts:2590:    "clone",
test/teardown.test.ts:152:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/teardown.test.ts:776:  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
test/teardown.test.ts:1475:    ["-C", remote, ...REGISTER_GIT_FLAGS, "init", "--bare", "--initial-branch=main", "--quiet"],
test/teardown.test.ts:1517:    ["-C", root, ...REGISTER_GIT_FLAGS, "clone", "--quiet", remote, target],
test/teardown.test.ts:1724:  registerGitOk(root, ["clone", "--quiet", upstream, projectClone]);
test/teardown.test.ts:1857:  registerGitOk(root, ["clone", "--quiet", upstream, projectClone]);
src/witness/run.ts:984:  const cloned = gitIn(scratchRoot, ["clone", "--quiet", repoRoot, dir]);
scripts/m1-exit-test.sh:496:    git init --bare --quiet --initial-branch=main "${toy_remote_path}"
scripts/m1-exit-test.sh:536:  git init --bare --quiet --initial-branch=main "${fleet_remote_path}"
scripts/probe-pilot-readonly.mjs:117:  if (operation === "clone") {
scripts/probe-pilot-readonly.mjs:138: * inherited `GIT_DIR` make a read-only probe report on a repository that is not
scripts/check-cutover-entry.mjs:199: *   every `GIT_*`           NOT carried. `GIT_DIR`, `GIT_WORK_TREE`,
scripts/rehearse-cutover-rollback.mjs:194:  git(root, ["init", "-q", "--bare", bare]);
scripts/probe-cas-ref.mjs:194:  gitOrThrow(remote, ["init", "--bare", "--initial-branch=main", "--quiet"]);
scripts/probe-cas-ref.mjs:209:    gitOrThrow(absRoot, ["clone", "--quiet", remote, target]);
```

I read the target of every cwd-relative bare init in that list
(test/orchestrator-next.test.ts:76, the five `makeBareRemote` helpers, and
scripts/probe-cas-ref.mjs:194): each is a named subdirectory of a fresh scratch root,
never os.tmpdir() itself. The two cutover-entry `/tmp/nope` and `/tmp/ok`
paths are clone TARGETS below `/tmp`, not ancestors of anything.
The only `process.env.GIT_DIR` write
(test/cutover-entry.test.ts:1638) is in that file's own process. The earlier
147-line list of plain `init` sites (scratch fr3-init-sites.txt) targets named
scratch directories in the same way; it is not reproduced here because the
watcher above measured the property those sites could break, directly, over
two full suites.

### The fix

In each of the six victim files, right after the imports, a block that sets
`process.env["GIT_CEILING_DIRECTORIES"]` to os.tmpdir() (its real path and its
spelling), keeping any ceiling already inherited and dropping empty entries
(an empty entry has its own meaning to git). Every child the file spawns
inherits it: test/dual-review.test.ts:58, test/exit-test-local.test.ts:36,
test/kernel-charter.test.ts:71, test/merge-preconditions.test.ts:77,
test/single-family-exception.test.ts:76, test/verdict-head.test.ts:77.
test/exit-test-local.test.ts:151 also puts the ceiling back into
`identityLessEnv`, which strips every `GIT_*` name before it spawns; that
victim is the one the process-level line alone does not reach.

The ceiling stops git moving up INTO os.tmpdir(), so a repository a test
stages INSIDE it is still found, including from a nested context. Measured and
recorded as witness/captures/kernel-0-2-1-git-ceiling.json (git 2.43.0):

| probe | status | stdout |
|---|---|---|
| no ceiling, from `<lab>/ctx` (plain) | 0 | `<lab>` |
| ceiling `<lab>`, from `<lab>/ctx` | 128 | (stderr "fatal: not a git repository (or any of the parent directories): .git") |
| ceiling `<lab>`, from `<lab>/ctx/deeper`, `ctx` now a repository | 0 | `<lab>/ctx` |

After the fix, the same `anc` arm (scratch fr3-suite-anc-after.log): 1484
tests, 1482 pass, 2 fail, 0 skipped, and fr3-fails.py printed:

```
control failures:
  test/doctor.test.ts:2321 CHECK worktrees reports an unlistable pool as FAIL instead of letting the run abort
  test/gates.test.ts:3582 a precondition command exiting nonzero is error, not a skip, whenever a path-shaped argv element cannot be ope
ancestor-only failures: 0 (ancestor total 2)
```

64 to 0; the 2 remaining are the control's own two.

### Red witness

test/git-ceiling.test.ts:154, registered as
`test-no-repository-arms-ceiling-at-tmpdir`, spec
witness/kernel-0-2-1-no-repository-arms-ceiling.json. It first re-runs the
three capture probes live and compares status, stdout and stderr with the
record (test/git-ceiling.test.ts:180). Then, for TWO ancestor shapes (a
repository with `.git`, and a git directory laid into the parent, built by
test/git-ceiling.test.ts:85), it checks that HEAD really resolves from the
nested scratch root, and runs one victim of each structurally different shape
in a nested `node --test` with `TMPDIR` inside the ancestor and no inherited
`GIT_*`, `NODE_OPTIONS` or `NODE_TEST*` name (test/git-ceiling.test.ts:118):

- removed `.git`: the single-family arm CI failed;
- never a repository: dual-review "two verdicts sharing a produced-by model
  family exit nonzero naming the duplicated value";
- `GIT_*` stripped from the child: exit-test-local "the stub payload refuses a
  bad mode and a working directory that is not a worktree".

Three members, each neutralising one file's ceiling line (`void GIT_CEILING;`).
Hand trial (scratch try-members3.py), node v26.6.0:

```
kernel-0-2-1-no-repository-arms-ceiling HEAD (0, '1', '0')
kernel-0-2-1-no-repository-arms-ceiling member 0 (1, '0', '1')
kernel-0-2-1-no-repository-arms-ceiling member 1 (1, '0', '1')
kernel-0-2-1-no-repository-arms-ceiling member 2 (1, '0', '1')
kernel-0-2-1-no-repository-arms-ceiling RESTORED (0, '1', '0')
```

What each member's red said (scratch fr3-red.py, excerpts of the nested run's
real output; ancestor and scratch names are mkdtemp's):

```
removed .git (single-family-exception.test.ts) failed under a repository with a .git directory:
  .../tiphys-single-family-a8fzER/charter.yaml does not exist in commit 85dd1dc69dcf1894a9705a7e9bc8ab97d95c625f, resolved from HEAD, ...
never a repository (dual-review.test.ts) failed under a repository with a .git directory:
  .../tiphys-dual-review-eOk1LU/charter.yaml does not exist in commit 7a0535af6a2934ea2a78bd2bc47e007effe5211c, resolved from HEAD, ...
GIT_* stripped from the child environment (exit-test-local.test.ts) failed under a repository with a .git directory:
  The input did not match the regular expression /is not a git worktree/. Input:
```

The witness stops at the first ancestor shape that reddens, so the second
shape was measured on its own (scratch fr3-gitdir-red.py, the same nested
invocation under a git directory laid into the parent):

```
test/single-family-exception.test.ts ceiling neutralised: (1, '0', '1', ["<anc>/tmp/tiphys-single-family-Ifl43g/charter.yaml does not exist in commit 484bebb6..., resolved from HEAD, ..."])
test/single-family-exception.test.ts ceiling restored:    (0, '1', '0', [])
test/dual-review.test.ts ceiling neutralised: (1, '0', '1', ["<anc>/tmp/tiphys-dual-review-5SWoS9/charter.yaml does not exist in commit 484bebb6..., resolved from HEAD, ..."])
test/dual-review.test.ts ceiling restored:    (0, '1', '0', [])
test/exit-test-local.test.ts ceiling neutralised: (1, '0', '1', ['The input did not match the regular expression /is not a git worktree/. Input:'])
test/exit-test-local.test.ts ceiling restored:    (0, '1', '0', [])
```

(Output trimmed after "resolved from HEAD" and the sha shortened to eight
characters in that block only, marked with `...`; nothing else changed.)

### What this round did NOT cover

- **CI's exact ancestor.** Not found and not reproduced (above). The fix is
  proven against discovery of an ancestor in both shapes discovery accepts. It
  is NOT proven against an inherited `GIT_DIR`, the one shape that reproduces
  CI's exact message here, because the ceiling does not stop `GIT_DIR`
  (measured). No path that sets it in these test processes was found.
- **git 2.55.0**, CI's version. Every measurement here is git 2.43.0. The
  witness re-runs the capture live, so a different ceiling behaviour on CI's
  git reddens that test there rather than passing unobserved.
- **The runner image and uid.** Nothing outside this repository's code was
  examined: the runner's `/tmp`, other jobs, or processes outside the test
  run.
- **Test files other than the six.** The execution derivation covers the
  suite as it is at f39daae plus this round's file. A future test that asserts
  "no repository" from under os.tmpdir() gets no ceiling unless it sets one;
  nothing enforces that.
- **scripts/check-cutover-entry.mjs** builds its git environment from an
  allowlist that drops every `GIT_*` name, `GIT_CEILING_DIRECTORIES` included
  by name (scripts/check-cutover-entry.mjs:199), so a ceiling a test sets does
  not reach its git. Its no-git test passed in the `anc` arm; I did not change
  the script.
- **Test pollution of os.tmpdir() found on the way, not changed**:
  test/authored-bytes.test.ts:74 writes the FILE
  `/tmp/tiphys-authored-bytes-outside`, not a repository, directly under
  os.tmpdir().

### Gates for fix round 3

To be filled from the runs at the committed head.

## Open questions

1. **RESOLVED in fix round 1 (CR-001).** Was: **`headGroupFor` is unchanged.** In the derived checks, a same-phase
   sibling with no usable head still reddens the group. A consumer that
   REVIEWS AGAIN a phase whose old verdicts lack a head will see that red.
   Kept fail-closed; not measured against pulse, because pulse has no such
   case today. The criteria review found that pulse DOES have it (paused
   M3-P3 verdicts); the grouping now excludes a head-less sibling by name.
2. **ADDRESSED in fix round 1 (CR-006): the arm now warns.** Was: **No `--base` arm is weaker than 0.2.0.** The bare `check-dual-review`
   workflow step, without `--base`, reads a corpus of ONLY head-less verdicts
   as not-applicable, each named. 0.2.0 read it as red. With `--base` (which
   the gate runner supplies) a dual-tier change is red, as the tests show.
3. **`validate --context` with the merge checks** still refuses a head-less
   verdict through the derived checks (src/checks.ts:5552 and src/checks.ts:5813 at fix round 1). That is a merge
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
9. **RESOLVED in fix round 1 (CR-002): recorded in DR-0053.** Was: **Criterion 4c is amended by an orchestrator ruling, not by an owner
   record.** delivery/plan/kernel-plan-m3.md:1809 requires a nonzero exit for
   a skipped cross-document check; 0.2.1 exits 0. Whether that needs a
   decision record (DR-0016: it is reversible) is the orchestrator's call.
10. **RESOLVED in fix round 1 (CR-003).** Was: **Stale per-check comments** at src/checks.ts:632, :2075 and :2571 still
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

12. **Fix round 2 residual, stated not fixed.** A head-less verdict with a
   blocking finding that is already on the base is still history at both
   merge gates, and the bare script without `--base` still excludes on shape.
   Both print the verdict and blocking findings on the REPORT line. Whether
   a date for "before the field existed" should close the first is for the
   orchestrator; DR-0054 gives none.

13. **Fix round 3: what CI's ancestor was is open.** CI printed
   `assurance-modes.yaml` as the first missing regime document, so its
   `./charter.yaml` probe found a blob. Of the shapes measured here with git
   2.43.0, only an inherited `GIT_DIR` reproduces that, and the ceiling does
   not stop `GIT_DIR`. No code path that sets it in these test processes was
   found. Whether to also strip `GIT_DIR` and `GIT_WORK_TREE` in the six files,
   without a known source to witness against, is for the orchestrator.

## Claim grep

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/kernel-0-2-1-history-compat.md
```

Re-run after fix round 2, before this list was rewritten. Hits by line,
and what settles each:

- 6: the owner's rule, quoted.
- 218 and 267: `never counts it`, a test title (quoted, and in the captured
  summary). The test is the settlement: green on the branch, red on main.
- 224, 313, 314: `never-admitted`, a witness file name.
- 226, 762, 763: describe mutations (`always false`, "exit 1 whenever",
  "always exit 0"); the red-witness run settles each.
- 376: HISTORY lines are "never dropped silently": the stamp-rule test
  asserts the HISTORY line is printed for both unstamped and 0.1.0 stamps.
- 677: the plan's own rationale, quoted.
- 680: "a skipped check is never reported as a pass": the skipped-only test
  asserts at least one `SKIPPED <id> no context` line and no INVALID line.
- 714: AGENTS.md:527's command is `tiphys validate --type verdict --context
  <project> <verdict>`; the `--context` is in the text itself.
- 736: mode.ts and checklist.ts "always pass a context": src/commands/mode.ts:126
  passes `dirname(read.path)`, and src/commands/checklist.ts:142-149 assigns
  `context = packageRoot()` before either `invalidityLines` call.
- 795: "0.2.0 never asked for one": `git show origin/main:schemas/verdict.schema.json
  | grep -c tiphys-version` printed 0 at b16f200, whose package.json says
  0.2.0.
- 894, 915, 926, 927, 928: a test title and a witness file name; the hand
  trial printed with them settles each (members red, HEAD green).
- 963: a head-less sibling "is never a member and never a refusal": the
  fix-round test's arm 1 asserts check-dual-review green with the REPORT line
  naming the sibling, and merge-preconditions with no condition-1 or
  condition-2 red.
- 997: a line of the derivation's captured output.
- 1040: "whenever", in the flake note: the arm fails when the seven
  characters parse as a number; measured once (the `0259038` run), and the
  rate is arithmetic, (10/16)^7 for all-decimal.
- 1050: captured gate output (the red before the fix).
- 1081: describes a mutation; the hand trial on the same row settles it.
- 1144: "an unstamped document never reached the comparison" at b57bd7c: the
  new test is red there with `Missing expected exception: {}`, the `{}` being
  the unstamped record (captured above).
- 2071 (1636 before fix round 3): "needs a", inside open question 9, which is a question.
- 2083 (1648 before fix round 3): "cannot be decoded" describes an input (an undecodable file), not a
  claim about the code.
- 2107 (1664 before fix round 3): the grep command itself.

Fix round 2's section:

- 1197: the old code "never" read when a sibling was written: the
  before-derivation shows the whole branch was `declaresNoHead` then
  `headless.push(candidate.path)` (src/checks.ts:4013 and :4014 at 1e48bff),
  and the 1e48bff run above is green on both members.
- 1282: `rev:./<absolute path>` "is never found": the captured
  condition-1 line above (ADDS, for a file committed at the base) is that
  failure, and the control test is green only with the fix (member 3 of the
  history witness reddens it).
- 1394: `excluded` / `offHead` "never counted": the existing test
  "merge-preconditions excludes a verdict that declares no head by name and
  never counts it toward the two reviews" asserts `0 of 2 are admitted`.
- 1440: an at-base head-less blocker is "never silent": the
  control test asserts its REPORT line with the merge base, verdict and
  blocking finding, and the no-base arm asserts the provenance line.
- 1521: "provenance never established" describes a mutation; the
  hand trial (member 1) settles it.
- 997, 1303, 1306, 1330, 1349, 1375: lines of the derivation's
  captured grep output, unedited.

Fix round 3's section (re-run after it was written; lines 1602 to 2033):

- 1614: CI's captured output ("never green" is the check's own sentence).
- 1710, 1737, 1749, 1757, 1771, 1941: test titles inside the captured
  fr3-fails.py output, unedited.
- 1803: "no grep for a removed `.git` can see" the never-a-repository victims:
  the static grep printed just above finds two of the six victim files, and
  the other four are in the execution list only.
- 1903: each cwd-relative bare init targets a subdirectory, "never
  os.tmpdir() itself": test/orchestrator-next.test.ts:71 makes `origin` as
  `join(dir, "origin.git")` under a fresh mkdtemp, the five `makeBareRemote`
  helpers make `join(root, name)`, and scripts/probe-cas-ref.mjs:192 makes
  `join(absRoot, "remote.git")`.
- 1961 and 1983: "never a repository" is the victim shape's name, and 1983 is
  captured output.

Occurrences, counted the same way in both forms after this section was
written: `grep -oEi '<the same phrases>' <file> | wc -l` printed 90, and the
wrap-insensitive `tr '\n' ' ' < <file> | grep -oEi ... | wc -l` printed 90.
Equal, so no hit was missed by wrapping. The hits after line 2107 are this section quoting the ones above it.
