# Work history: DR-0047 final approval sweep, gates and validation fix round

Branch: `claude/sweep-fix-gates-validation`. Base: `origin/main` at
ad2428b76ef6f53f75b0d7f94c7db50463e077b7.

This is one implementer's share of the SINGLE BATCHED FIX ROUND that closes the
DR-0047 final approval sweep. Two other implementers worked in parallel on
disjoint file sets. The files touched here are src/checks.ts:1,
scripts/check-dual-review.mjs:1, src/gates/gate-classes.ts:1, src/validate.ts:1,
the root `gate-registry.yaml`, `test/**` and this document.

## 0. The suite, as a complete sentence

Interpreter `/tmp/claude-0/n26/bin/node`, **v26.6.0**, checked with
`node --version` in the shell that ran the command. Build state: `npm ci` then
`npm run build` both exit 0 and `git status --porcelain` names only the files
this round edits. Invocation: `npm test`, which `package.json` defines as
`node --test "test/**/*.test.ts"`.

```
i tests 1353
i suites 0
i pass 1353
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 468938.61679
NPM_TEST_EXIT=0
```

Transliteration note, per the repository's declared resolution: the Node test
reporter's summary glyph U+2139 is rendered `i` above, 8 occurrences. Nothing
else in any captured output in this document was altered. No U+2716 appears
because the final run had no failing test.

**THE BASELINE WAS MEASURED HERE RATHER THAN QUOTED, and one intermediate run
disagreed with the arithmetic until it was.** A detached worktree at
ad2428b76ef6f53f75b0d7f94c7db50463e077b7, same interpreter, `npm run build`
first, same invocation, reports 1341 tests, 1341 pass, 0 fail, 0 skipped, exit 0.
This round adds 12 tests, all in test/dual-review-head-anchor.test.ts:1, and
1341 + 12 is 1353, which is the number above. An earlier run of this branch
reported 1352, and the cause is recorded rather than averaged away: that run was
taken BEFORE the twelfth test (the behaviour-registration check) was appended to
the same file. The two runs' passing-test NAMES were diffed rather than their
totals compared, which is what established that nothing had been removed:

```
ONLY IN BASELINE:                      (empty)
ONLY IN FIXED:   11 rows, all of them test/dual-review-head-anchor.test.ts:1
```

The skipped count is ZERO on both runs, so no test was converted into a skip by
this round.

**A KNOWN LOCAL FAILURE THAT IS NOT THIS ROUND'S, and it was hit here.** The
first full run exited 1 at test/gates.test.ts:3558 with `ERR_MODULE_NOT_FOUND`
for `src/cli.ts`. `namei -m` on the clone showed `drwx------ claude-0`, so the
unprivileged uid `runCliUnprivileged` drops to could not traverse into the
scratchpad. That is T-029, fully diagnosed at
delivery/tuition/T-029-the-precondition-test-flakes-only-here.md:1. Granted and
restored explicitly around each suite run:

```
chmod o+rx /tmp/claude-0     # before
chmod 700  /tmp/claude-0     # after
```

With traversal granted, `node --test test/gates.test.ts` alone reports 54 tests,
54 pass, 0 fail, 0 skipped, and the full suite is the 1353 above.

## 1. The MECHANISM behind each finding

The fix-round contract asks for the mechanism, not the instance. There are three
mechanisms here and five findings.

### M1. A gate whose verdict is about evidence the caller supplied, with no check that the evidence is about the thing being audited

Findings CR-VS-001 (HIGH) and, one scope out, CR-FS-GATES-01 (MEDIUM).

`check-dual-review` grouped review verdicts by the head THE VERDICT DOCUMENTS
THEMSELVES DECLARE (src/checks.ts:3912 reads it, src/checks.ts:3955 groups on
it), and nothing compared that value to the commit the gate was running against
or established that it named a commit at all. The document under review chose
its own subject.

The asymmetry that makes the fix sound is stated at src/checks.ts:4029 onward:
the AUDITED head comes from the RUN (the gate runner's `--head`, from the
pull-request event, or the commit the context's own HEAD resolves to), and the
DECLARED head comes from a document an agent under review wrote. One is a fact
about the run and the other is a claim in the evidence, so the claim is measured
against the fact instead of replacing it.

CR-FS-GATES-01 is the same mechanism one scope out: `gate-classes` reads a
phase's DECLARATION and prints `review: asserted by check-dual-review`, which is
a claim about a run that the declaration cannot make.

### M2. One function, two callers, grown apart, so a document can be inside the corpus that can accuse and outside the corpus that can refuse

Finding CR-VS-002 (MEDIUM).

`listCommittedTree` took a `recursive` flag and its two callers passed different
values: the PAIR corpus was listed one level deep and the FALSIFIER corpus was
listed over the whole subtree. Depth was a property of which caller reached the
function rather than of the function's contract.

### M3. A comment or a green line that describes a mechanism the code does not have

Findings CR-VS-003 (MEDIUM), the validation-hazard FIND-02 half that is
reachable from src/validate.ts:1, and CR-VS-004 (LOW). Also CR-VS-006 (LOW),
which is the same shape in miniature: a sentence built from the wrong describer.

Three instances, one shape. `produced-by` decorrelation printed "are distinct on
produced-by", which reads as a cross-family assertion and is a canonicalised
STRING compare. `src/validate.ts`'s header said a `MESSAGE_BY_KEYWORD` set was
the contract that refuses an untranslated keyword, and nothing read that set.
`src/validate.ts`'s vocabulary comment said the list is "documented in
`schemas/README.md`", which reads as a guarantee that the two agree.

## 2. The DERIVATION

The exact command and its full output are in section 6. What follows is what it
covers and what it found.

### M1's derivation

Every value a check in `src/checks.ts` reads out of a document arrives through
one function, `establishField`. So the enumeration is every `establishField`
call site, plus every place in the same file where a document-derived value
reaches git or the filesystem, plus the same question one scope out: every gate
in the registry, its declared `parameters`, and every source file that parses
`--head`.

Fifteen `establishField` call sites. Classified:

| site | value read | is it used as a fact about the RUN? |
|---|---|---|
| src/checks.ts:3003 | `kind` | no, the document's own type |
| src/checks.ts:3869 | a decorrelation dimension | no, a document property compared to another document's |
| src/checks.ts:3912 | `head` | **YES. This is CR-VS-001 and it is fixed here** |
| src/checks.ts:3968 | `phase` | **YES, and it is NOT fixed here. See the residue below** |
| src/checks.ts:4271 | `delivery-mode` | no, the project's own declaration, read from the commit |
| src/checks.ts:4319 | `merge-authority` | no, same |
| src/checks.ts:4563 | `review-families` reason | no, same |
| src/checks.ts:4588 | a declared family entry | no, same |
| src/checks.ts:4738 | `produced-by` | no, a document property |
| src/checks.ts:4879 | `phase` | **YES, same residue** |
| src/checks.ts:5068 | a decorrelation dimension | no |
| src/checks.ts:5221 | `phase` | **YES, same residue** |
| src/checks.ts:5284 | `verdict` | no, a document property |
| src/checks.ts:5361 | finding `severity` | no |
| src/checks.ts:5369 | finding `id` | no |

**THE RESIDUE THE DERIVATION FOUND AND THIS ROUND DID NOT CLOSE, named rather
than left to be discovered.** `phase` is the other half of the group key and it
is read only from the documents. `check-dual-review` declares no `phase`
parameter, so nothing compares the phase a verdict claims to the phase the run
is about. What makes it a smaller hole than `head` was, rather than an equal one
skipped: after this round the group is also keyed on the audited COMMIT, so a
verdict has to name the exact commit under audit before its phase matters at
all, and a verdict naming this commit while claiming another phase is a document
somebody wrote about this commit. Closing it is a second registry parameter and
a comparison, and it belongs with whoever owns the phase-id contract; it is
recorded here and in the escalations rather than done silently.

One scope out, the derivation compared every gate's declared `parameters`
against the run identifiers its command actually parses. Two gates parse
`--head` and declare no parameter for it:

- `citations` (src/gates/citations.ts:1465 parses it). Its precondition is kind
  `diff-touches`, and `requiredParameters` (src/gates/run.ts:671) adds `base`
  for that kind and not `head`. The gate then falls back to
  src/gates/citations.ts:1243, `options.head ?? "HEAD"`. EXAMINED AND JUDGED
  SOUND: the fallback is the same one this round gives `check-dual-review`, and
  the commit it lands on is the checkout's, which is a fact about the run.
- `deploy` (src/gates/release.ts:930 parses it). EXAMINED AND JUDGED NOT THIS
  MECHANISM: it takes no identifier out of a reviewed document.

### M2's derivation

Two call sites of `listCommittedTree`, both now at the same depth:
src/checks.ts:3203 (the pair corpus, changed by this round) and
src/checks.ts:3247 (the falsifiers' corpus, unchanged). The WORKTREE arm is a
third reader of the same corpus and was also one level deep; it is changed at
src/checks.ts:3605, because an arm that read a different depth would make WHICH
ARM RAN decide whether a refusing verdict counts.

### M3's derivation

The comment half is not mechanically enumerable by grep, so the scope is stated
instead: every comment in `src/validate.ts` and `src/checks.ts` that names a
constant or a document as "the contract" was read, and the three instances above
are the ones where the named thing does not do the job. That scope does NOT
cover the other twenty source files, and section 3 says so.

## 3. WHAT THE DERIVATION DID NOT COVER

The reviewer's first check.

1. **Only `src/checks.ts` was enumerated for M1.** Other modules read documents
   (`src/gates/release.ts`, `src/gates/merge-preconditions.ts`,
   `src/gates/scope.ts`). The one-scope-out pass in section 6 covers them at the
   PARAMETER level, which catches a gate that consumes a run identifier without
   declaring it, and does not catch a gate that reads an identifier out of a
   document it loads itself. `merge-preconditions` is the one most likely to
   carry the same shape and it is the one gate that already takes `--head`.
2. **The WORKTREE arm of `check-dual-review` is not head-anchored, by design,
   and that is a hole this round leaves open.** With no resolvable git ref and
   no `--head` there is no commit to anchor to, so the gate keeps its previous
   behaviour and SAYS SO in every line it prints (the `unanchored` sentence at
   scripts/check-dual-review.mjs:572). A context that is not a git repository
   can therefore still produce a green over verdicts naming anything. It is
   narrower than it sounds, because DR-0012 condition 1 requires the reviews to
   be COMMITTED and this arm is reached only when nothing is, but it is a hole
   and it is not closed.
3. **The `phase` residue above.** Enumerated, not fixed.
4. **`schemas/README.md` was not touched**, because it is outside this round's
   declared files. The `uniqueItems` row FIND-02 asks for is not added here. See
   findings disposition and escalations.
5. **The comment sweep for M3 covered two files**, named in section 2.
6. **No CI arm was exercised.** Everything here ran locally on the
   floor-satisfying toolchain. The `pull_request` arm of
   `.github/workflows/gates.yml` runs `check-dual-review` as a direct step, and
   that file is outside this round's declared files, so the interaction between
   the new anchored precondition and that step is reasoned about from the file's
   text and from local runs of the same two commands, not observed in CI.
7. **`npm pack` was not run**, so nothing here establishes what the packed
   package contains after this change.

## 4. The red witnesses

Each is red against the DANGEROUS STATE, not against an absent feature, and
every assertion consumes REAL CAPTURED OUTPUT of the shipped script rather than
a hand-written string. The captures below are verbatim; the full files are
`redprobe-baseline.txt` and `redprobe-fixed.txt` in the round's scratch
directory, and the probe that produced them stages the same repositories the
test file stages.

The probe tree for the RED column is a detached worktree at
ad2428b76ef6f53f75b0d7f94c7db50463e077b7, so the red column is the shipped code
at the reviewed head and not a defanged copy of the new code.

### CR-VS-001: two structurally different members of one class

They fail by DIFFERENT ROUTES, which is what makes them two members rather than
one shape twice: member one fails at RESOLUTION, member two fails at
COMPARISON, and the two print different sentences.

**MEMBER ONE, RESOLUTION.** Two decorrelated APPROVE verdicts naming a sha that
is not an object, in a repository whose HEAD is a real commit.

RED, at ad2428b:

```
--- MEMBER 1 (RESOLUTION): verdicts declare deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
    git cat-file -t deadbeefdeadbeefdeadbeefdeadbeefdeadbeef -> exit 128: fatal: git cat-file: could not get object info
    repository HEAD: c90b7369bdc7e35400b5312c562244a76e83a071
    GATE exit=0 status=green
    | REPORT dual-review-decorrelation 2 verdict(s) for phase M3-P9 at head deadbeefdeadbeefdeadbeefdeadbeefdeadbeef are distinct on produced-by, framing, review-contract
    | check-dual-review: green (2 review verdicts examined for decorrelation)
```

GREEN, on this branch:

```
    GATE exit=20 status=not-applicable
    | no verdict document was found (corpus: delivery/review read from commit 795875da..., resolved from HEAD) for the commit under audit 795875da... (from HEAD, resolved in /tmp/redprobe-k8Oq4U), so there is no pair of reviews to compare; 2 committed verdict document(s) review other work and are NOT evidence about this commit: .../decorrelated-criteria.yaml declares head deadbeefdeadbeefdeadbeefdeadbeefdeadbeef, which does not resolve to a commit in this repository at all, so it is evidence about an object nobody can produce ...
```

**MEMBER TWO, COMPARISON.** The same pair, naming a REAL commit of the same
repository, with a further commit of work no verdict mentions on top. This is
the state the finding calls imminent: an approving pair lands, and every later
head carries it.

RED, at ad2428b:

```
--- MEMBER 2 (COMPARISON): verdicts declare 52a069fd..., audited head is 524220a6...
    GATE exit=0 status=green
    | REPORT dual-review-decorrelation 2 verdict(s) for phase M3-P9 at head 52a069fd... are distinct on produced-by, framing, review-contract
    | check-dual-review: green (2 review verdicts examined for decorrelation)
```

GREEN, on this branch:

```
    GATE exit=20 status=not-applicable
    | ... .../decorrelated-criteria.yaml declares head 04500fdf..., which is a commit in this repository and is not the commit under audit fba944d7..., so it is a review of other work and is not evidence about this head
```

**THE GREEN CONTROL, which the two members need.** Without it, not-applicable
would be indistinguishable from a gate that can no longer go green at all, which
is the T-008 shape one status along. A decorrelated approving pair that names
the commit under audit, run with `--head` naming it:

```
GATE exit=0 status=green units=2
detail: 2 verdict(s) for the commit under audit <sha> (from --head <sha>) examined by 1 registered check(s) named dual-review-decorrelation and 1 named verdict-pair-approves; no decorrelation violation and the pair approves
```

**THE THIRD ROUTE, about the CALLER rather than the evidence.** `--head` naming
a commit the repository does not have is `error` (exit 21), never
not-applicable and never green, because nothing was evaluated (M2-C-3). Its
precondition arm exits 0 so the gate runs and reports that error rather than
having the workflow print "not applicable" over it.

### CR-VS-002: two structurally different members of one class

**MEMBER ONE, the whole pair one directory down.** RED, at ad2428b:

```
--- CR-VS-002 MEMBER 1: both verdicts under delivery/review/sub/
    git ls-files -> delivery/review/sub/decorrelated-criteria.yaml , delivery/review/sub/decorrelated-hazard.yaml
    GATE exit=20 status=not-applicable
    | check-dual-review: not-applicable (0 review verdicts examined for decorrelation)
    PRECONDITION exit=1: check-dual-review: 0 verdict document(s) (corpus: delivery/review read from commit 8f339525..., resolved from HEAD)
```

Two committed verdicts that `git ls-files` lists, reported as zero. GREEN, on
this branch, with the audited head naming the reviewed commit: `status=green`,
`units=2`.

**MEMBER TWO, the fail-open direction.** Two APPROVE verdicts at the top level
plus a committed third review of the same phase and the same head reading
FIX-ROUND-NEEDED at `delivery/review/sub/`. RED, at ad2428b:

```
--- CR-VS-002 MEMBER 2: two APPROVE at top level, a FIX-ROUND-NEEDED one level down
    git ls-files -> delivery/review/decorrelated-criteria.yaml , delivery/review/decorrelated-hazard.yaml , delivery/review/sub/refusing.yaml
    GATE exit=0 status=green
    | REPORT verdict-pair-approves 2 verdict(s) for phase M3-P9 at head 282cb8d4... read APPROVE and carry no finding at medium, high, critical
    | check-dual-review: green (2 review verdicts examined for decorrelation)
```

The refusal is neither counted nor mentioned. GREEN, on this branch:

```
    GATE exit=1 status=red
    | check-dual-review: 3 verdict document(s) for the commit under audit fb638034... (from --head fb638034...)
    | INVALID #/verdict .../delivery/review/sub/refusing.yaml reads FIX-ROUND-NEEDED for phase M3-P9 at head fb638034..., so the pair does not approve this head and the delegated grant's condition 2 is not met (check: verdict-pair-approves)
    | check-dual-review: red (3 review verdicts examined for decorrelation)
```

The two members are structurally different: one is "the corpus is empty when it
is not", the other is "the corpus is complete when it is not", and they land on
opposite statuses.

### CR-VS-003, CR-VS-006, CR-FS-GATES-01

These three are DISCLOSURE changes, so their witnesses assert on the sentence
the shipped command prints.

- CR-VS-003: the green report now carries "produced-by was compared as a
  canonicalised STRING and not as a model FAMILY", asserted against the script's
  real stdout.
- CR-VS-006: the not-applicable detail begins "no verdict document was found
  (corpus: ". The shipped sentence at ad2428b is visible verbatim in the RED
  capture above: `no verdict document is (corpus: delivery/review read from
  commit ...)`, which is the parenthetical describer fed to a sentence written
  for the phrase-form one.
- CR-FS-GATES-01 has TWO arms, because a note that printed on every green
  declaration would be noise. A declaration satisfying `review` with
  `check-dual-review` (conditional in the registry) gets the note; one
  satisfying it with `citations` (required) does not. The applicability both
  arms turn on is read out of the registry by the test rather than written into
  it, so a later change of applicability moves the test with the registry.

## 5. Findings disposition

| finding | disposition |
|---|---|
| CR-VS-001 (HIGH) | FIXED. `--head` on both arms of scripts/check-dual-review.mjs:148, `parameters: [head]` on the registry entry, anchoring at src/checks.ts:4072, partition at src/checks.ts:4145, and the excluded documents printed by src/checks.ts:4175 |
| CR-VS-002 (MEDIUM) | FIXED, both arms. src/checks.ts:3203 for the commit arm, src/checks.ts:3605 for the worktree arm, and the script's own comment is now true of the code rather than the code being left wrong |
| CR-VS-003 (MEDIUM) | **REFUSED IN PART, and the refused part is the enum.** See below |
| CR-VS-004 (LOW) | FIXED. `MESSAGE_BY_KEYWORD` is deleted and the two comments that called it the contract now name the `default:` arm of `renderAjvError`'s switch, which is what actually refuses |
| CR-VS-006 (LOW) | FIXED |
| validation-hazard FIND-02 (MEDIUM) | **FIXED IN PART, and the part that is not is named.** See below |
| CR-FS-GATES-01 (MEDIUM) | FIXED by disclosure, which is the trade the module already makes for declared escapes. Judged rather than adopted: see below |
| CR-VS-005 (LOW) | NOT IN THIS ROUND'S FILES. `schemas/plan.schema.json` and the checklist resolution both sit outside the declared set; escalated |
| validation-hazard FIND-01 (LOW) | FIXED as part of CR-VS-004's comment pass? NO. See below |

**CR-VS-003, the refusal and its reason.** The reviewer offers two fixes: (a) a
family field in the verdict schema, or (b) say on the green line that
`produced-by` was a string compare. (a) is REFUSED here. M4-P11 declined a
closed family vocabulary in its own words at
delivery/work-history/m4-p11.md:142, "a closed enum of family names was
rejected: no such vocabulary can be kept current", and that reason still holds:
a list of model families in a shipped kernel goes stale without anything
noticing, which is the drift shape this repository already pays for elsewhere.
Shipping the enum that phase rejected would reopen a settled judgment through a
fix round. (b) is DONE, at src/checks.ts:2937. **What would close it**, named
rather than left open: a `produced-by-family` field in the verdict schema,
required, compared instead of the free string, with the vocabulary OPEN so any
two distinct values decorrelate and no list has to be kept current. That is a
schema change and a decision record, both outside this round's files, and it is
in the escalations.

**FIND-02, what is fixed and what is not.** The reviewer's shortest fix is a
`uniqueItems` row in `schemas/README.md`, and `schemas/` is outside this round's
declared files, so that row is NOT added. What IS fixed is the claim in the file
that is mine: src/validate.ts:138's comment said the vocabulary is "documented
in `schemas/README.md`", which reads as a guarantee that the two agree. It now
says that this array is the source of truth, that the document renders it for a
human reader, and that the two were measured disagreeing by one row. A reader of
the comment is no longer told something false. The drift itself is open and is
escalated.

**FIND-01 is NOT fixed here and saying so is the point.** It is a stale comment
at src/checks.ts around line 2503 describing the pre-M4-P10 escalation rule. It
is inside a file this round edits, so it is not a scope refusal; it was left
because this round's changes are in three other regions of the same file and
editing a fourth region for a comment-only defect widens the diff a reviewer has
to read for no behavioural gain. That is a judgment, it is recorded here so it
is not silently dropped, and it is in the escalations.

**CR-FS-GATES-01, judged rather than adopted.** The reviewer proposes disclosure
and offers a stronger alternative: refuse a class satisfied only by a gate that
is not `required` in some mode. The stronger form is REFUSED. Measured at this
head, all 17 phase declarations carrying `gateClasses` satisfy `review` with
exactly `{"gates":["check-dual-review"]}`, so refusing would redden seventeen
landed declarations over a property this command cannot measure, and
`gate-classes` reads a declaration rather than a run. Disclosure is what the
module already does for declared escapes. The note is placed as a TRAILING
sentence rather than inside the per-class clause, which is why every committed
capture of this gate's detail is still a PREFIX of the new one and the existing
witnesses still assert what they were taken to assert.

## 6. The derivation command and its full output

The script is `derive.sh` in the round's scratch directory and is reproduced in
full here so it can be re-run.

```
#!/bin/sh
# THE MECHANISM: a check that takes an IDENTIFIER OUT OF A DOCUMENT and then
# uses it as a fact about the RUN (the repository, the filesystem, the commit
# being audited) without measuring it against the run.
set -e
echo "### D1a  every establishField call site in src/checks.ts"
grep -n 'establishField(' src/checks.ts | grep -v '^3758:function'
echo
echo "### D1b  every place a document-derived value reaches git or the filesystem"
grep -n 'gitIn(\[' src/checks.ts
grep -n 'readdirSync(\|readOperatorPath(\|classifyEntry(\|readFileSync(' src/checks.ts
echo
echo "### D2  every gate, against what its registry entry declares"
node --input-type=module -e '
import { readFileSync } from "node:fs";
const yaml = await import("yaml");
const reg = yaml.parse(readFileSync("gate-registry.yaml", "utf8"));
for (const g of reg.gates) {
  const cmd = (g.command ?? []).join(" ");
  const decl = (g.parameters ?? []).join(",") || "(none)";
  console.log([g.id.padEnd(38), ("parameters: " + decl).padEnd(30), cmd].join(" "));
}
'
echo
echo "### D3  every source file that parses --head"
grep -rn '"--head"' src/ scripts/ bin/ --include=*.ts --include=*.mjs
echo
echo "### D4  every call site of the one listing function"
grep -n 'listCommittedTree(' src/checks.ts
```

Its full output, run against this branch:

```
### D1a  every establishField call site in src/checks.ts
3003:  const reading = establishField(record, "kind");
3869:    const reading = establishField(record, dimension);
3912:  const reading = establishField(record, "head");
3968:    const phaseReading = establishField(candidate.record, "phase");
4271:  const modeReading = establishField(asRecord(charter.value), "delivery-mode");
4319:  const authorityReading = establishField(mode.mode, "merge-authority");
4563:  const reasonReading = establishField(declaration, "reason");
4588:    const reading = establishField({ entry }, "entry");
4738:    const value = establishField(candidate.record, "produced-by");
4879:    const phaseReading = establishField(verdict, "phase");
5068:        const reading = establishField(candidate.record, dimension);
5221:    const phaseReading = establishField(verdict, "phase");
5284:      const reading = establishField(candidate.record, "verdict");
5361:    const severity = establishField(finding, "severity");
5369:    const id = establishField(finding, "id");

### D1b  every place a document-derived value reaches git or the filesystem
--- git invocations in src/checks.ts (gitIn call sites) ---
3305:  const typed = gitIn(["cat-file", "-t", `${refSha}:./${directory}`], contextDirectory);
3318:    const commitReadable = gitIn(["cat-file", "-t", refSha], contextDirectory);
3386:    const shown = gitIn(["show", `${refSha}:./${path}`], contextDirectory);
3444:  const shown = gitIn(["show", `${source.refSha}:./${relativePath}`], contextDirectory);
3492:  const resolved = gitIn(["rev-parse", `${ref}^{commit}`], contextDirectory);
4509:  const resolved = gitIn(["rev-parse", `${ref}^{commit}`], contextDirectory);
4524:  const shown = gitIn(["show", `${refSha}:${relativePath}`], contextDirectory);
--- filesystem reads in src/checks.ts ---
396:  const read = readOperatorPath(path);
1556:          entries = readdirSync(path);
1578:        const read = readOperatorPath(matches[0] as string);
2629:      if (classifyEntry(join(contextDirectory, target)).kind === "absent") {
2736:          if (classifyEntry(join(contextDirectory, path)).kind === "absent") {
2875:  return classifyEntry(join(contextDirectory, tree)).kind === "absent" ? tree : undefined;
3471:    return classifyEntry(join(contextDirectory, relativePath)).kind !== "absent";
3589:  const entry = classifyEntry(directory);
3605:    names = readdirSync(directory, { recursive: true }).map((name) => String(name));
3622:    const read = readOperatorPath(path);

### D2  the same mechanism one level out: every gate whose command consumes
###     a run identifier, against what its registry entry declares
manifest-self-check                    parameters: (none)             node bin/tiphys.ts gates self-check --manifest gates.manifest.json
coverage                               parameters: (none)             node src/gates/coverage.ts
credential-scrub                       parameters: (none)             node src/gates/credentials.ts credential-scrub
credential-token                       parameters: (none)             node src/gates/credentials.ts credential-token
suite                                  parameters: base               node src/gates/suite.ts --pin-root src --pin-root bin --pin-root test
citations                              parameters: (none)             node src/gates/citations.ts
scope                                  parameters: base,head          node src/gates/scope.ts --declarations delivery/plan/phase-declarations
deploy                                 parameters: (none)             node src/gates/deploy.ts
migrations                             parameters: (none)             node src/gates/migrations.ts
clause-map                             parameters: (none)             node scripts/check-clause-map.mjs
red-witness                            parameters: base,head          node src/gates/red-witness.ts
agent-rules-drift                      parameters: (none)             node scripts/render-agent-rules-gates.mjs --check
brief-drift                            parameters: (none)             node scripts/check-brief-drift.mjs --check
check-agents-references                parameters: (none)             node scripts/check-agents-references.mjs
check-dual-review                      parameters: head               node scripts/check-dual-review.mjs .
license                                parameters: (none)             node scripts/license-gate.mjs
typecheck                              parameters: (none)             node src/gates/gate-classes.ts typecheck --project tsconfig.src.json --project tsconfig.test.json --project plugin/tsconfig.json
gate-classes                           parameters: phase              node src/gates/gate-classes.ts gate-classes --declarations delivery/plan/phase-declarations --registry gate-registry.yaml
merge-preconditions                    parameters: head,phase         node src/gates/merge-preconditions.ts
unit-tests-for-changed-service-methods parameters: (none)
fixtures-for-changed-component-states  parameters: (none)

### D3  every source file that parses --head / --phase / --base, so a gate
###     that CAN take a run identifier but is not declared to is visible
src/gates/citations.ts:1465:const VALUE_FLAGS = ["--result", "--evidence", "--base", "--head"];
src/gates/scope.ts:159:  "--head",
src/gates/merge-preconditions.ts:135:  "--head",
src/gates/suite.ts:574:        "--head",
src/gates/suite.ts:592:    } else if (flag === "--head") {
src/gates/red-witness.ts:89:    ["--head", "head"],
src/gates/release.ts:930:  const names = ["--result", "--evidence", "--base", "--phase", "--head"];
src/commands/gates.ts:77:  "--head",
src/commands/gates.ts:112:    } else if (flag === "--head") {
scripts/check-dual-review.mjs:148:    if (argument === "--head") {

### D4  the depth mechanism: every call site of the one listing function,
###     and every directory listing in the corpus loaders
3203:  const listed = listCommittedTree(contextDirectory, refSha, REVIEW_DIRECTORY, true);
3247:  const listed = listCommittedTree(contextDirectory, refSha, PAPERWORK_ROOT, true);
3299:function listCommittedTree(
```

The `check-dual-review` row of D2 reads `parameters: head` because the output
above was taken AFTER the registry edit. Before it, that cell read `(none)`, and
that cell is the finding.

## 7. Tests changed, and why each change is staging rather than defanging

Four existing test sites moved. None of them weakens an assertion; each restores
the variable the test was written to isolate.

1. **test/single-family-exception.test.ts**, the `stage` helper. Every staged
   context now creates an empty `reviewed` commit FIRST, retargets each staged
   verdict's `head` at it, and commits the verdicts on top. That is the real
   workflow's shape: a review names the commit it read, and committing the
   review produces a different commit. The two runners then pass `--head` naming
   the reviewed commit, which is what the gate runner does from the
   pull-request event. Without this the file's arms would assert about an empty
   corpus, because the shipped fixtures name a commit of THIS repository that no
   staged one has. A fixture with no `head:` line is left alone, because this
   repository's own two real verdicts predate M4-P10's required `head` and two
   arms are about exactly that state.
2. **The same file's worktree arm** passes `anchor: false`, because that arm
   deletes `.git` and a `--head` naming a commit in a directory that is not a
   repository is a different subject from the sentence that arm exercises.
3. **The same file's bundle arm** declares `parameters: ["head"]` on its own
   manifest entry and passes `--head` to the runner, mirroring the registry.
4. **test/gates.test.ts**, the consumer-package-tree arm, passes `--head HEAD`.
   A gate missing a declared parameter is `error` BEFORE its precondition is
   evaluated, and that arm's subject is the precondition, so supplying the flag
   keeps the variable under test the one the test names. The value is never
   dereferenced by the runner; the child is what would resolve it, and in that
   fixture the child does not exist, which is the point.

All 30 tests in test/single-family-exception.test.ts:1 and all 54 in
test/gates.test.ts:1 pass after these changes.

## 8. The claim grep

Run in both binding forms before pushing, because this document is hard-wrapped
prose and a phrase straddling a wrap is invisible to the first:

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/gates-validation.md
tr '\n' ' ' < delivery/work-history/gates-validation.md | grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to'
```

The output of both, and the settling command or restatement for every hit, is in
section 9.

## 9. Claim-grep hits and what settles each

**REFERRED TO BY SENTENCE, NOT BY LINE NUMBER, and the reason is mechanical.**
This section is itself part of the file the grep reads, so quoting its own line
numbers makes the numbers wrong the moment the section is edited. Two other
parts of this file also match every pattern by construction: the two grep
COMMANDS quoted in section 8, and this section quoting the phrases it settles.

**The wrap-insensitive form found NO prose hit the line-based form missed**, and
that is measured rather than assumed. Both were run; the line-based one names
one hit in section 3 ("catches a gate that consumes a run identifier"), two in
section 4 ("never not-applicable and never green"), one in section 7 ("the value
is never dereferenced by the runner"), the two command lines of section 8, and
this section's own quotations. The wrap-insensitive form returns the same set of
distinct phrases with no phrase appearing only there, which is what a straddled
wrap would look like.

The prose hits, and what settles each:

- **"never not-applicable and never green"**, of the third refusal route in
  section 4. Settled by the captures in that section: the recorded statuses are
  `GATE exit=20 status=not-applicable` and `GATE exit=21 status=error`, and the
  control arm's `GATE exit=0 status=green` is what makes the claim falsifiable
  rather than a guard that cannot go red.
- **M4-P11's reason quoted in section 5**, that no vocabulary of model family
  names can be kept current. It is a QUOTATION of that phase's own recorded
  words at delivery/work-history/m4-p11.md:142, not a claim made here, and the
  quotation is reproduced verbatim rather than paraphrased so a reader can check
  it against the source.
- **"nothing ever read that set"**, of `MESSAGE_BY_KEYWORD` in section 1.
  Settled by:

  ```
  grep -rn 'MESSAGE_BY_KEYWORD' src/ test/ scripts/ schemas/
  src/validate.ts:33: * It said the refusal came from a `MESSAGE_BY_KEYWORD` set. That set existed,
  src/validate.ts:135: * also has an entry in `MESSAGE_BY_KEYWORD`", which was false in both
  ```

  Two hits after this round, both inside comments that describe the deletion.
  Before it the same command returned three, being the declaration and two
  comments, which is the reviewer's own count.
- **"the value is never dereferenced by the runner"**, in section 7. Settled by
  reading the one place the runner uses a parameter: src/gates/run.ts:1526
  pushes `--${name}` and `options[name]` onto the child's argv and does nothing
  else with it, and src/gates/run.ts:1402 only tests whether it is `undefined`.
  So the resolution happens in the child, which in that fixture does not exist.
- **"catches a gate that consumes a run identifier without declaring it"**, in
  section 3. Settled by the D2 and D3 blocks of section 6, which print every
  gate's declared `parameters` beside its command and every source file that
  parses `--head`. Reading the two together is what surfaced `citations` and
  `deploy`, and both are dispositioned in section 2.

Two further sentences make claims the grep does not match, recorded here rather
than left implicit. "gate-classes cannot measure a fact about a run" is settled
by the two commands quoted in that module's header, one exiting 0 green and the
other exiting 1 with `0 verdict document(s)` at one head. "The residue is not
closed" and "not fixed here", of section 3, are OPEN QUESTIONS and are in the
escalations.

## 10. Bytes and citations

```
node scripts/check-authored-bytes.mjs
```

exits 0. Every citation in this document is `path.ext:LINE` outside backticks;
the root `gate-registry.yaml` is QUOTED rather than cited, because the citation
gate's declared roots at src/gates/citations.ts:201 admit only `*.md` and
`*.json` at the top level, so a root-level `.yaml` line reference reddens with
"matches no declared root" however correct the line number is.
