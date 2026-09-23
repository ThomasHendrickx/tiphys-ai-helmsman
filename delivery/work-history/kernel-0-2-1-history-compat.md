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
