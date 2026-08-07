# Clean-room HAZARD review, M2-P5 citation linter

Contract: second review of the dual pair. Hazard-class attack (T-007): find
what the acceptance criteria CANNOT describe. Findings numbered from CR-1015.

Subject: branch `claude/m2-p5-citation-linter`
head `30d295c024166b75ace9421a77591664e62d220a` (verified `git rev-parse HEAD`).

## VERDICT: FIX-ROUND-NEEDED

Three HIGH findings. The decisive one needs no interpretation: **the gate this
phase delivers exits RED on the head that delivers it.**

## Environment

- Floor toolchain `node v26.6.0`, `npm 11.18.0`.
- `npm ci` exit 0, `npm run build` exit 0, `git status --porcelain` empty after.
- `npm test` 222 tests, 216 pass, 6 fail, 0 skipped. Failures reconciled below.
- True phase diff (against `git merge-base origin/main HEAD` = `4c9bfbc`) is
  exactly six files, all on the files-to-touch list plus the two standing
  pre-authorized extras. **Scope audit PASSES.**
- Authored files are pure ASCII (`grep -rP '[^\x00-\x7F]'` exit 1 on all four);
  zero em dashes. The binding claim grep was run by the implementer
  (work history line 648).

Suite failures: `gates.test.ts` "workflow's gate bundle step" and
"manifest-self-check reports one unit per schema document" are the two declared
cross-phase failures. The four watcher/liveness failures are real-clock flakes:
`test/liveness.test.ts` and `test/watcher.test.ts` are NOT in this branch's
diff, the three watcher failures cleared on serial re-run, and
`doctor and the guard return one verdict about one beacon` passed 3/3 at the
merge base and 2/3 at the phase head under `--test-concurrency 1`. Not this
phase's defects.

---

# FINDINGS

## CR-1015 (HIGH) The delivered gate is RED on the head under review

```
$ node src/gates/citations.ts --result r1.json --evidence . --base origin/main
citations: red (22 citations resolved)
exit=1
```

Record (`status: "red"`, `units: 22`, evidence `["delivery/work-history/m2-p5.md"]`):

```
delivery/work-history/m2-p5.md: README.md:226 cites a file that does not exist (README.md);
delivery/work-history/m2-p5.md: stub-payload.sh:114-119 matches no declared root (local or external);
delivery/work-history/m2-p5.md: run.ts:171 matches no declared root (local or external);
delivery/work-history/m2-p5.md: liveness.test.ts:671 matches no declared root (local or external);
delivery/work-history/m2-p5.md: src/nope.ts:1 cites a file that does not exist (src/nope.ts);
delivery/work-history/m2-p5.md: src/nope.ts:1 cites a file that does not exist (src/nope.ts)
```

Independently reproduced in a clone with `--base HEAD~1` (p13-schema.sh control
and "restored" rows): same six, same exit 1.

**Mechanism, not instance.** A citation-shaped string that a document QUOTES is
indistinguishable, to `extractCitations` (citations.ts:376), from a citation the
document MAKES. Plan step 5 orders this phase to "**report** stale citations
without editing any other document"; the report is prose; the prose contains the
stale citations; the gate reds on the report. Every string above sits in
`delivery/work-history/m2-p5.md:319,327,334,335,350` -- the paragraphs that
discharge criterion 7.

There is no quoting or escaping convention anywhere in the grammar, so the class
is closed under nothing: every future `delivery/review/**` and
`delivery/verification/**` document that quotes a bad citation reds the same
way, and both globs are in `citationRequired`.

Plan section 1.4 row 79 states the PR bundle expectation for `citations` is
**green**; M2-P9 criterion 2 asserts "seven required gates green". Neither can
hold on this head.

**Why it was not caught.** The implementer ran the one-shot inventory and the
unit tests. The work history contains no run of the standing diff-scoped gate
against the phase's own base. Its inventory table records
`delivery/work-history/m2-p5.md (this file, at the time of the run)  6  6  0  0`
-- see CR-1027, that row is now false.

## CR-1016 (HIGH) 72% of the merged corpus fails CI the moment a PR touches it

Measured over the real tree with the delivered `inventoryDeliveryTree`
(p12-blast.mjs):

```
configured documents present : 92
RED if edited (>=1 unresolved): 12  (13%)
total unresolved citations    : 97
zero-local-citation documents : 54  -> gate self-declares not-applicable
                                    -> required gate -> aggregate exit 20
```

The 54 include **every** `DR-nnnn` decision record, **every** `T-nnn` tuition
entry, `delivery/plan/kernel-plan-v1.md` (the owner-approved plan), every
arbitration record, and four M1 work histories. `delivery/decisions/` is in the
manifest's own `diff-touches` path list, so raising a decision record fails CI.
CLAUDE.md requires paperwork to reach `main` through a PR.

Witnessed end to end through `tiphys gates run` (p11-runner.sh), not inferred:

| construction | gate | aggregate |
|---|---|---|
| (a) diff touches ONLY `delivery/STATE.md` | red, units 2 | **exit 1** |
| (b) diff touches no configured document | not-applicable | **exit 20** `required gate(s) not applicable: citations` |
| (c) diff touches a document with one resolvable citation | green, units 1 | exit 0 |
| (d) `citationRequired` document with zero citations | red, units 0 | exit 1 |

Row (a) is the mechanism: `delivery/STATE.md` was edited with a citation-free
line, and the gate red on `liveness.test.ts:671`, **pre-existing content the PR
did not touch**. M2-D-10 narrowed the SCOPE to the diff, but the diff selects
whole FILES and `lintDocumentBody` lints the whole body, so merged history
reddens anyway. The plan's declared hazard, "a whole-corpus scope that reddens
merged history", is present in the diff-scoped design; the narrowing did not
obtain the property it was for.

Row (b) is distinct from the work history's cross-phase Finding A, which
attributes the push-bundle failure to an absent `--base`. Here `--base` IS
supplied and the aggregate still exits 20.

## CR-1017 (HIGH) `--head` selects the file list and is ignored for content

`gitChangedDocuments` diffs `base...head` (citations.ts:657) but the lint loop
reads `join(options.cwd, relativePath)` (citations.ts:794) -- the WORKING TREE.
Both directions constructed (p16-head.sh):

```
REV1(broken) = a review citing src/does-not-exist-anywhere.ts:1
REV2(fixed)  = the same review citing src/fleet.ts:1

A: --head REV2, tree at REV2      -> green, exit 0
B: --head REV1, tree at REV2      -> green, exit 0   <-- told to judge REV1, judged REV2
C: --head REV1, tree at REV1      -> red,   exit 1   <-- REV1's true state
```

B is a GREEN verdict on a revision that is RED.

This defeats the module's own documented second call site (R-025,
citations.ts:85-92: "typically with `--base` naming the plan's prior reviewed
revision and `--head` its current one"): a plan reviewer following that text
gets an answer about whatever happens to be checked out.

It also falsifies the module's own CI instruction (citations.ts:96-103): an
EXPLICIT `--head` on `pull_request` events is prescribed because "the default
checkout SHA there is a synthetic merge commit". On such an event the working
tree IS the merge commit, so passing `--head <pr sha>` changes the file list and
still lints the merge commit's content. The stated mitigation does not do what
it says (the T-006 shape: a claim about the world, unexecuted).

## CR-1018 (MEDIUM) A citation resolves GREEN against a file outside the checkout

`classifyPathAgainstRoots` (citations.ts:345) matches globs against the RAW
citation string; `resolveCitation` reads `join(repoRoot, token.path)`
(citations.ts:451), which NORMALIZES `..`. They are different functions of the
same input, which is exactly MECHANISMS.md's "a regex over a file and the
consuming program's evaluation of that file are DIFFERENT FUNCTIONS" row.

Three structurally different members, all against a real file placed one level
above a scratch checkout (probeA.mjs):

```
src/../../outside.md:3            classify -> {"kind":"local","root":"kernel"}
                                  resolve  -> {"kind":"resolved", ... "(10 line(s))"}
delivery/../../outside.md:3       classify -> local/kernel   resolve -> resolved
src/a/b/../../../../outside.md:3  classify -> local/kernel   resolve -> resolved

control: src/outside.md:3 -> unresolved "cites a file that does not exist"
```

`lintDocumentBody` over a body carrying one traversal citation and one real one
returns `resolved: 2, unresolvedDetails: []`.

Consequences: the gate's verdict depends on content OUTSIDE the checkout, so it
is not reproducible between a runner and a developer machine, which is precisely
the determinism the `externalRoots` mechanism exists to provide (module header,
citations.ts:36-43); and each escaped citation inflates `units`, the number
M2-C-2 exists to make honest.

Note the inconsistency that shows the grammar was not designed against this:
`../outside.md:1` and `/etc/passwd.md:1` are not extracted AT ALL (the
lookbehind `(?<![A-Za-z0-9_./-])` and the first-char class block them), so the
plainest traversal is invisible while the disguised one is green.

## CR-1019 (MEDIUM) A malformed content-hash suffix is silently dropped, and the citation passes

The hash group `(?:@sha256:([0-9a-f]{64}))?` is OPTIONAL. When the suffix is
present but does not match, the group simply does not participate and the token
degrades to a hash-free citation, which then resolves green. Two structurally
different members (probeB.mjs):

```
src/ten.ts:1@sha256:AAAA...(64 uppercase)  -> token {raw:"src/ten.ts:1", hash:undefined} -> RESOLVED
src/ten.ts:1@sha256:aaa...(63 lowercase)   -> token {raw:"src/ten.ts:1", hash:undefined} -> RESOLVED
```

Criterion 3 is defeated by a typo. Worse, it is defeated SILENTLY: the reported
`raw` is `src/ten.ts:1`, so nothing in the record hints that a content pin was
written and skipped. The gate claims a stronger property (content pinned) than
it checked. `@sha1:`, `@md5:` and a truncated digest behave identically.

## CR-1020 (MEDIUM) The vacuous guard is defeated by a self-citation

The guard tests `lint.total === 0` (citations.ts:826) -- tokens EXTRACTED, not
units RESOLVED. Any token satisfies it. Constructed through the CLI against real
`citationRequired` documents (p19-vacuous.sh):

```
H0 truly empty citationRequired document       exit=1  red             units=0
H1 ONE external (firstmate) citation only      exit=20 not-applicable  units=0
H3 a citation to the document ITSELF           exit=0  GREEN           units=1
```

H3 is the whole gate, green, on a `delivery/review/**` document whose entire
content is `delivery/review/vac-probe.md:1 is this line.` It verifies nothing
and reports one assurance unit. This is the plan's declared hazard "a document
with zero citations reading as clean", reached in one line, and it is the
"document that is itself a citation-shaped string" attack.

H1 is the second member: a review citing only firstmate paths verifies nothing,
is NOT red, and reaches `not-applicable`. It fails the bundle only because the
manifest happens to say `required`; declared `conditional` it would exit 0. A
guard whose correctness depends on an unrelated applicability setting is the
MECHANISMS.md "a guard's own failure path" row.

## CR-1021 (MEDIUM) The vanish race turns a RED into a GREEN and the record overstates work done

The `continue` at citations.ts:809-812 carries the comment "Raced away between
the diff and the read; not this gate's failure." Two members (p14, p15):

```
F2  a document contributing 1 citation removed after the diff
    -> green, units 3, detail "linted 3 changed document(s)", evidence lists all 3
       (only 2 were opened)
F2b a citationRequired zero-citation document removed after the diff
    control (present) -> RED   "zzz-empty.md is citationRequired and carries zero citations"
    vanished          -> GREEN units 1, evidence STILL lists zzz-empty.md
F3  ALL documents removed after the diff
    -> not-applicable, detail "3 changed document(s) linted ... nothing needed checking"
       (self-contradictory; zero were linted)
```

`changedDocuments.length` in the detail is the count the DIFF named, never the
count read. The record asserts documents were linted that were never opened,
in the artifact CLAUDE.md says a later reviewer trusts. The comment's claim that
this is benign is falsified by F2b: it converts red to green.

Reachability: the diff is computed over COMMITS and the read is from the WORKING
TREE, so any tree/ref disagreement reaches it -- which is the same root cause as
CR-1017 and is routine at the R-025 second call site.

## CR-1022 (MEDIUM) Criterion 5's ambiguity check catches only identical glob strings

`findAmbiguousGlobs` (citations.ts:255) keys a map on the glob STRING. Measured
(probeD.mjs):

```
identical glob under external+local  -> [{"glob":"bin/fm-*.sh","roots":["firstmate","kernel"]}]   (caught)
external "src/gates/*.ts" + local "src/**"
  findAmbiguousGlobs                 -> []                                                        (NOT caught)
  classifyPathAgainstRoots("src/gates/run.ts") -> {"kind":"external","root":"other"}
```

So the realistic ambiguity -- two DIFFERENT globs claiming one path -- is
resolved by first-match order with no error, and every citation into
`src/gates/` silently becomes `unverifiable-external`, which is not counted and
not checked. A config slip silently disables the gate over a subtree, and
because external citations contribute no units the run degrades to
`not-applicable`, never to red.

The code comment defending the narrow reading (citations.ts:240-249) says the
general question "has no decidable general answer for arbitrary glob pairs".
That is true of glob-INTERSECTION and irrelevant: the question that needs
answering is "does THIS concrete path match globs under more than one root",
which is decidable by not returning on the first match. The counterfactual is
one loop, which is the fix-round contract's "a COMMAND or a DECLARED SCOPE,
never a judgment call".

Note the DEFAULT config already carries an overlapping pair: local `bin/**` and
external `bin/fm-*.sh` both claim `bin/fm-lock.sh`. It resolves correctly today
only because external roots are ordered first.

## CR-1023 (LOW) Fabricated tokens: a red naming a citation the document does not contain

The lookbehind excludes `[A-Za-z0-9_./-]` but not `:`, `\`, or non-ASCII, so
matching resumes mid-path and invents a token. Three members:

```
src/wei:rd.ts:2   -> token raw "rd.ts:2"    -> red "rd.ts:2 matches no declared root"
src\\ten.ts:3     -> token raw "ten.ts:3"   -> red "ten.ts:3 matches no declared root"
src/<U+0441>li.ts:1 -> token raw "li.ts:1"  -> red "li.ts:1 matches no declared root"
```

The diagnostic names a string that appears nowhere in the document as a
citation, so the reported red is unactionable. The third member matters for the
declared hazard class specifically: the repository is ASCII-only but the gate
walks CONFIGURED trees that need not be.

## CR-1024 (LOW) Silent truncation of malformed ranges

`src/ten.ts:3-` -> `src/ten.ts:3` resolved. `src/ten.ts:3.5` -> `src/ten.ts:3`
resolved. `src/lf.ts:2<U+2011>2` (non-breaking hyphen) -> `src/lf.ts:2`
resolved. A malformed citation is accepted as a narrower well-formed one, and
the reported `raw` shows the truncated form, so the record hides it.

## CR-1025 (LOW) Leading zeros accepted

`src/ten.ts:007` -> line 7, resolved. `src/ten.ts:0003-0005` -> 3-5, resolved.
`Number()` normalizes; the grammar documented in the module header does not
say this is a recognized form.

## CR-1026 (LOW) Content hashes are line-ending dependent, undocumented

Same four-line file as LF and as CRLF: line count identical (4), hash differs.
An LF-computed pin reds on a CRLF checkout with "content hash mismatch", which
reads as citation drift rather than as a normalization difference. Nothing in
the module or the repository states a normalization requirement.

## CR-1027 (LOW) The work history's inventory row for its own file is false as committed

Recorded (work history, inventory table):

```
delivery/work-history/m2-p5.md (this file, at the time of the run)   6      6      0      0
```

Measured now against the committed file (p20-row.mjs):

```
delivery/work-history/m2-p5.md: total=28 resolved=22 unresolved=6 external=0
```

This is the evidence that would have surfaced CR-1015 and it is stale by
construction: it was captured before the paragraphs that plant the offending
strings were written. The row is not marked as a snapshot that the file's later
content invalidates.

---

# ATTACK TABLE

| # | Hazard | Construction | Outcome |
|---|---|---|---|
| 1 | path under two declared roots, guessed | identical glob under external+local root | REFUSED correctly, error names the glob |
| 2 | " | two DIFFERENT globs claiming `src/gates/run.ts` | **DEFEATED** silently, first-match order wins (CR-1022) |
| 3 | " | traversal `src/../../x.md` | **DEFEATED**, classified local, read outside the checkout (CR-1018) |
| 4 | zero-citation document reading as clean | truly empty `citationRequired` doc | RED correctly |
| 5 | " | doc citing ITSELF | **DEFEATED**, green with units 1 (CR-1020) |
| 6 | " | doc citing only an external root | **DEFEATED** as a guard: not-applicable, not red (CR-1020) |
| 7 | external root match list implied | removing the firstmate root | reds as unmatched; criterion 4 holds |
| 8 | whole-corpus scope reddens merged history | edit only `delivery/STATE.md` | **DEFEATED**, red on untouched pre-existing content (CR-1016) |
| 9 | " | inventory over the real 92-document corpus | **DEFEATED**, 66/92 fail CI if touched (CR-1016) |
| 10 | non-regular entry in the walked tree (CR-520) | FIFO in `delivery/plan/` | REFUSED, names path + type, no block |
| 11 | " | unix socket | REFUSED, names path + type |
| 12 | " | self-referential symlink | REFUSED, ELOOP named |
| 13 | " | symlink to a directory | REFUSED, "is a directory" |
| 14 | " | dangling symlink | skipped as absent, correct |
| 15 | " | real directory named `*.md` | recursed, correct |
| 16 | " | FIFO as a CITED TARGET | read-error naming path + type |
| 17 | " | FIFO as a diff-named document | error record, units partial, status error, no block |
| 18 | symlink escaping the repository | symlink cited target -> outside file | resolved (follows the link; committed content, informational) |
| 19 | traversal / absolute citation | `../x.md:1`, `/etc/x.md:1` | not extracted at all, silently invisible |
| 20 | grammar: `path:0`, `0-0` | | unresolved correctly |
| 21 | grammar: reversed range `9-2`, `3-0` | | unresolved correctly, before any read |
| 22 | grammar: `1-1` | | resolved correctly |
| 23 | grammar: leading zeros | `:007`, `:0003-0005` | accepted silently (CR-1025) |
| 24 | grammar: colon in path | `src/wei:rd.ts:2` | **fabricated token**, spurious red (CR-1023) |
| 25 | grammar: malformed hash suffix | 64-char uppercase, 63-char lowercase | **DEFEATED**, suffix dropped, green (CR-1019) |
| 26 | grammar: truncating forms | `:3-`, `:3.5`, U+2011 hyphen | silently narrowed (CR-1024) |
| 27 | grammar: huge line number | `:99999999999999999999` | unresolved correctly |
| 28 | CRLF vs LF | same file both ways | line count same, hash differs (CR-1026) |
| 29 | document that is itself a citation string | the phase's own work history | **DEFEATED**, gate red on its own PR (CR-1015) |
| 30 | unicode lookalikes in paths | Cyrillic `<U+0441>` in `src/  li.ts` | fabricated token, spurious red (CR-1023) |
| 31 | unicode: fullwidth colon | `src/lf.ts   2` | not extracted (safe) |
| 32 | very large document (bounded) | 5.6 MB, 200 000 citations | extract 300 ms, lint 5569 ms, terminates |
| 33 | deep path vs `**` backtracking | 200-deep path vs `**/**/**/**/**/**/**/**/x.ts` | 8 ms, no blow-up |
| 34 | concurrent modification mid-run | document deleted between diff and read | **DEFEATED**, red -> green (CR-1021) |
| 35 | " | all documents deleted | self-contradictory not-applicable record (CR-1021) |
| 36 | config as a non-regular file | schema document as FIFO | error 21 naming path + type |
| 37 | " | schema document as a directory | error 21 naming path + type |
| 38 | config absent | schema document removed | error 21 "missing from this installation" |
| 39 | config malformed | schema document not JSON | error 21 |
| 40 | config out of keyword set | `oneOf` injected | error 21 "unsupported schema keyword oneOf at #/properties/version" |
| 41 | config fails schema validation | 6 mutations (missing version, empty roots, empty match, bad name pattern, extra property, wrong type) | all error, each naming the cause, never a default |
| 42 | orphan `citationRequired` glob | glob absent from `documents` | error naming the glob |
| 43 | `--head` honoured? | `--head REV1` with tree at REV2 | **DEFEATED**, green on a red revision (CR-1017) |

# INTEGRATION PROBES (M2-P1 surface)

| probe | result |
|---|---|
| well-formed `GateResult` through the delivered constructor | PASS. Five emitted records (red, green, error x2, not-applicable) validated against `src/gates/schemas/gate-result.schema.json` through the delivered `validate.ts`: all VALID, zero diagnostics. `units` coercion and the M2-C-2 rewrite are inherited, not re-implemented. |
| `tiphys gates run` with the appended manifest entry | RUNS. Gate is spawned, record ingested, counts correct, precondition evaluated. But see CR-1016: three of four realistic diff shapes fail the aggregate. |
| `--base` absent is error | PASS. `status: "error"`, exit 21, detail names M2-C-3 explicitly. Checked inside `runCitationsGate` independently of the runner, so the R-025 call site is covered too. |
| CLI usage errors | PASS. `--result`/`--evidence` missing -> exit 64 EX_USAGE; unknown flag -> exit 64. A bad `--base` ref -> error 21 carrying git's real stderr. |
| failure mid-walk leaves a coherent record | PASS for the type-refusal path: FIFO as the MIDDLE of three documents -> `status: "error"`, `units: 2` (partial, honest), `evidence: ["delivery/review/mmm-probe.md"]`, detail names path and type, no block. FAILS for the vanish path: see CR-1021. |
| criterion 9 boundedness | PASS. `test/citation-gate.test.ts:566-609` uses a real `mkfifo`, a 10 s harness timeout, and asserts `signal === null`, so a block reports as a signal rather than as a wait. Correct red-witness shape against the dangerous state. |

# ATTACKS ATTEMPTED BUT NOT CONSTRUCTED

- **Truly interleaved content modification during a single `readFileSync`.**
  Not constructed. `readRegularFileIfPresent` is one probe plus one synchronous
  read; forcing an interleaving inside it needs instrumentation of the module,
  which would no longer be the delivered code. I constructed the reachable
  members of the same class instead (deletion between diff and read, CR-1021),
  which is where the observable damage is. The remaining unconstructed member,
  a file appended to mid-run turning an out-of-range citation into an
  in-range one, is inherent to any filesystem linter and I make no claim about
  whether it can be forced here.
- **The config document itself supplied as a non-regular file.** Not
  constructible: the gate has no config-file flag. `DEFAULT_CITATION_CONFIG`
  is a source constant and `CitationsGateOptions.config` is a code parameter,
  so the only configuration path on disk is the SCHEMA document, which I
  attacked instead (six members, all handled). Worth stating in the work
  history: the plan's phrase "committed configuration" is satisfied by a
  TypeScript constant, not a config file, so the "narrowing them is a
  scope-audited change" property is obtained by source review rather than by
  any mechanism.
- **`gh`-mediated PR-bundle observation.** Not attempted; `gh` is unusable in
  this container per CLAUDE.md warning 6. All aggregate behaviour above was
  measured through `tiphys gates run` locally instead.

# WHAT THIS REVIEW DID NOT COVER

- `.github/workflows/gates.yml` wiring: not in this branch's diff and owned by
  M2-P1/M2-P9. The `fetch-depth: 0` and explicit-`--head` requirements the
  module states (citations.ts:96-103) were not verified against any workflow
  file, and CR-1017 means the second of them would not work as described.
- The 21 tests in `test/citation-gate.test.ts` were run (exit 0 alone) but not
  individually red-witnessed by defanging the implementation; the criteria
  reviewer's contract covers that. My attacks were against the code's behaviour
  directly.
- Cross-phase interaction with M2-P2/P4's future manifest entries beyond what
  the work history already derives.
- Windows path semantics; every construction was on Linux.
