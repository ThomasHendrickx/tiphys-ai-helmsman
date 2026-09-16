# Delta verification: M4-P10 fix round 2

Subject: branch claude/m4-p10-verdict-head-and-medium
Reviewed delta: a6db78d94b61e812526f22a5a2d751e45c003fe5..c1b9a088739afc0d49258e8022f51be492bacf92

STATUS: IN PROGRESS. This file is written incrementally; its mtime is the beacon.

## Plan

1. Read the three prior review documents in full.
2. FIRST CHECK: does the work history state what its derivation did NOT cover?
   Run the derivation command myself. Widen it in a direction the author excluded.
3. Per original finding: name the mechanism, enumerate other call sites,
   reproduce at a6db78d and show gone at c1b9a08.
4. Attack the round: red witnesses (defang them), guards that cannot go red,
   counts pinned over append-only registries, the claim grep in both forms,
   the four-part suite sentence, C-1/C-2/C-3.
5. DR-0027 reachability for every HIGH or MEDIUM.

Load average at start: see the suite section below.

## 1. FIRST CHECK: the derivation, run and then widened

The round's own not-covered statement exists and is long (work history section
13.5, seven numbered items). Item 6 publishes a command and its output:

```
$ grep -rn '"kind"]' --include=*.ts --include=*.mjs src bin scripts
src/checks.ts:158        (step) => asRecord(step)?.["kind"] === "verification-first",
src/gates/manifest.ts:181    const kind = precondition["kind"];
```

and draws a conclusion from it: "TWO OTHER RAW `kind` READS EXIST IN THE TREE
AND I LEFT BOTH ALONE", then "Neither is a document selected out of
`delivery/review/`. ... In both, a failed reading shrinks nothing that a merge
predicate then approves over".

**I ran the command. It does not print two rows. It prints seven, at both
heads.** Verbatim, in my clone at `c1b9a08`:

```
$ grep -rn '"kind"\]' --include=*.ts --include=*.mjs src bin scripts
src/gates/manifest.ts:181:    const kind = precondition["kind"];
src/checks.ts:158:        (step) => asRecord(step)?.["kind"] === "verification-first",
src/checks.ts:2947: * had its OWN selection rule, a raw `value["kind"] !== "verdict"`, which is a
src/witness/spec.ts:120:    const kind = member["kind"];
src/commands/validate.ts:208:  const kind = (instance as Record<string, unknown>)["kind"];
src/commands/doctor.ts:471:    if (document["kind"] !== "charter") {
scripts/check-dual-review.mjs:198:       `value["kind"] !== "verdict"`, and two readers of one fact diverged in
```

And at the dispatched head, so this is not an artefact of the round's own edits:

```
$ git --no-pager grep -n '"kind"\]' 470f788 -- 'src/*.ts' 'src/**/*.ts' 'bin/*' 'scripts/*'
470f788:scripts/check-dual-review.mjs:201:      value["kind"] !== "verdict"
470f788:src/checks.ts:158:        (step) => asRecord(step)?.["kind"] === "verification-first",
470f788:src/commands/doctor.ts:471:    if (document["kind"] !== "charter") {
470f788:src/commands/validate.ts:208:  const kind = (instance as Record<string, unknown>)["kind"];
470f788:src/gates/manifest.ts:181:    const kind = precondition["kind"];
470f788:src/witness/spec.ts:120:    const kind = member["kind"];
```

Three rows were omitted from the published output: `src/commands/doctor.ts:471`,
`src/commands/validate.ts:208` and `src/witness/spec.ts:120`. Two comment lines
were also omitted, which is harmless. The three code rows are not.

I checked each of the three:

| site | what it does with an unreadable `kind` | verdict |
|---|---|---|
| `src/commands/validate.ts:208` (`resolveAutoType`) | returns `undefined`, which the command turns into a USAGE error | CLEAR, fail-closed and documented at its own definition |
| `src/witness/spec.ts:120` (`memberKindDiagnostics`) | `continue`, skipping the required-field diagnostics for that member | benign: the schema's own enum for `kind` reddens the member independently, and no predicate reports affirmatively over the shrunk set |
| `src/commands/doctor.ts:471` (`checkRetention`) | `continue`, and the check then reports `PASS` over the charters that remain | **A LIVE INSTANCE OF THE SAME MECHANISM.** Measured below. |

**The widened search found something the narrow one did not.** Section 2 is the
measurement.

## 2. NF-2 (the widened search): the same mechanism, live, in a shipped command

`src/commands/doctor.ts` is BYTE-IDENTICAL on `origin/main` and at this head
(`git diff --stat origin/main c1b9a08 -- src/commands/doctor.ts` prints
nothing), so the citation below resolves and this is PRE-EXISTING rather than
introduced by the round.

src/commands/doctor.ts:471 reads `if (document["kind"] !== "charter") { continue; }`
inside a loop over `readdirSync(charter/)`. It is the round's own mechanism
verbatim: a raw, uncanonicalised read of a document's own declared TYPE, whose
failure is folded into the determinate negative "this is not a charter", so the
document leaves the set that `checkRetention` then reports affirmatively over.

**MEASURED, not inferred.** A fleet created by `tiphys init`, one good charter
declaring three retention paths that exist, and a SECOND charter declaring a
retention path that does NOT exist:

```
$ node bin/tiphys.ts init <fleet>
$ <charter/charter.yaml: kind: charter, three real retention paths>
$ <charter/second.yaml:  retention: work-history: notes/does-not-exist>
```

| `second.yaml`'s `kind:` line | `CHECK retention` |
|---|---|
| `kind: charter` (CONTROL) | `FAIL .../second.yaml declares retention path notes/does-not-exist, which does not exist` |
| `kind:` then `  - charter` (a one-element list) | `PASS 3 declared retention path(s) present and tracked` |
| `kind: Charter` (case only) | `PASS 3 declared retention path(s) present and tracked` |
| `kind: "char<U+200B>ter"` (invisible character) | `PASS 3 declared retention path(s) present and tracked` |

Full run for the list arm, `DOCTOR_EXIT=0`, `second.yaml` named nowhere:

```
CHECK retention PASS 3 declared retention path(s) present and tracked
CHECK kernel-artifacts PASS ...
DOCTOR_EXIT=0
```

Three structurally different members, one control. This is the SAME class the
round closed for `delivery/review/`, one directory over, and it reaches
`tiphys doctor`, a user-visible command in shipped `src/`.

**Two consequences, stated separately because they have different dispositions.**

1. The CODE defect is pre-existing, is on `main` today, and is in a file this
   phase does not declare and must not touch (touching it would redden `scope`
   further). **TRACKED, not blocking**, the same disposition this branch already
   gives the four pre-existing AMBIGUOUS-2 witness members.
2. The WORK HISTORY's section 13.5 item 6 states, as a measurement, that the
   command finds two other raw `kind` reads and that "In both, a failed reading
   shrinks nothing that a merge predicate then approves over". The command finds
   five, and one of the three that were not printed does exactly that. The
   defect is in `delivery/`, so under DR-0027 it does not block, but it is the
   fix-round contract's item 2 ("publish the derivation ... its full output. Not
   a summary of it") not being met at the one derivation a reader can re-run.

**Why "the one a reader can re-run" is the sharp part.** The round's other four
derivations are scripts under `lab/` (`derive-doors.mjs`, `probe-doors.mjs`,
`derive-verdict-checks.mjs`, `witness-drift.mjs`). `git ls-files lab` prints
nothing and the directory does not exist in the tree, so no later reader can
re-run any of them. The single derivation that is a plain shell command, and
therefore the only one I could reproduce independently, is the one whose
published output does not match what it prints.

## 3. The original blocking finding (NF-1), reproduced open and then closed

**The mechanism**, restated in my own words before checking anything: a
candidate document is removed from the set a merge predicate then reports
affirmatively over, on the strength of a reading of its own declared type that
FAILED, and the failure is reported as the determinate answer "this is not one
of those". That is the round's own sentence and I agree with it.

I staged the two shipped decorrelated APPROVE fixtures plus one third document
derived from a shipped fixture by named edits (`verdict: FIX-ROUND-NEEDED`,
`produced-by: family-c`, `framing: third-framing`,
`review-contract: third-contract`), so the only thing that can redden when it is
admitted is its refusing verdict. Then I ran the SHIPPED script at both heads.
Staging directories are rendered `<dir>`; nothing else in any capture below is
altered.

| the third (refusing) document's `kind:` | a6db78d (before) | c1b9a08 (after) |
|---|---|---|
| a one-element YAML list | `green (2 ... examined)`, exit 0, file named nowhere | `error (0 ...)`, exit 21, `... declares a kind field that could not be read as a word (it is a list)` |
| a string carrying U+200B | `green (2 ... examined)`, exit 0, file named nowhere | `error (0 ...)`, exit 21, `... (it is U+200B at position 4)` |
| `kind: Verdict` (case only) | `red`, but `(2 review verdicts examined)` over a group of THREE | `red`, `(3 review verdicts examined)`, and the third is printed as a `verdict FIX-ROUND-NEEDED` line |
| NO `kind` key at all (control) | `green (2 ...)`, exit 0 | `green (2 ...)`, exit 0 |
| undeformed refusing verdict (control) | `red (3 ...)`, exit 1 | `red (3 ...)`, exit 1 |

**NF-1 is CLOSED, at the mechanism and not at the instance.** The reviewer named
one shape (a one-element list). The round fixed the READER, so seven other
shapes moved with it, and it closed the SECOND reader (the script's own
selection rule) at the same time, which is where the `units` divergence in row
three lived and which no review had named.

**The worst arm is closed too, and the round does not claim it.** `--precondition`
decides whether the gate RUNS at all. With the only document in the directory
carrying an unreadable `kind`:

```
--- a6db78d --- check-dual-review: 0 verdict document(s) under <dir>/delivery/review
                exit=1        (do not run me: a not-applicable reached by not looking)
--- c1b9a08 --- check-dual-review: 0 verdict document(s) under <dir>/delivery/review,
                and 1 candidate(s) that could not be examined
                exit=0        (applicable; evaluate then errors)
```

and the no-`kind` control still exits 1 at the new head, so the precondition did
not become "any file makes me applicable".

## 4. Attacking the round

### A. Red witnesses, defanged by me rather than read

Three defangs, each applied by hand to a throwaway worktree at `c1b9a08`, each
built before running. Transliteration for every `node --test` capture in this
section is declared at the end of it.

**Defang 1: the collapse restored in `readVerdictKind` only** (the `unusable` /
`uncanonical` arm made unreachable). Both halves of the fix use this reader, so
this is the mechanism put back.

```
x a sibling whose kind is a one-element list makes the gate error instead of reporting the pair clean
x a sibling whose kind is an invisible character makes the gate error instead of reporting the pair clean
x the two unreadable-kind members fail through different readers and say so differently
v a sibling that declares no kind at all is still skipped, and the pair still approves
v the gate runner and the derived check select the same documents, so a kind differing only in case is counted
i tests 5   i pass 2   i fail 3
```

**Defang 2: the SCRIPT's own pre-round selection rule restored verbatim,
`src/checks.ts` left fixed.** This is the "two readers of one fact" half on its
own, and it has its own witness:

```
x a sibling whose kind is a one-element list makes the gate error instead of reporting the pair clean
x a sibling whose kind is an invisible character makes the gate error instead of reporting the pair clean
v the two unreadable-kind members fail through different readers and say so differently
v a sibling that declares no kind at all is still skipped, and the pair still approves
x the gate runner and the derived check select the same documents, so a kind differing only in case is counted
i tests 5   i pass 2   i fail 3
```

**Defang 3: the repointed stored witness member applied by hand**
(`dual-review-kind-case-still-counts` member 0, which puts the raw
case-sensitive comparison back inside `readVerdictKind`).

```
member 0: find occurs 1 time(s) in src/checks.ts   ->   applied
BUILD_UNDER_MUTATION=0
x a verdict whose kind is written in another case still counts toward the group it correlates with
i tests 2   i pass 1   i fail 1
```

It reddens the test the spec declares it guards, and the build still exits 0
under the mutation, so it DEFANGS rather than breaks. That is the repoint
verified independently, not read off the work history.

**ARE THE TWO MEMBERS OF THE CLASS GENUINELY DIFFERENT?** Yes, and I checked the
claim rather than accepting it. The list member returns from `establishField`
through the non-string arm and never reaches `canonicalScalar`; the U+200B
member is a string and is refused inside `canonicalScalar`. The two produce
different sentences (`it is a list` versus `it is U+200B at position 4`), a
third test asserts they DIFFER, and defang 1 reddens all three while defang 2
reddens only the two that go through the script. Two structurally different
members, not one defect witnessed twice.

**THE CONTROL IS THE HALF THAT MATTERS AND IT HOLDS.** `a sibling that declares
no kind at all is still skipped` is green under every defang above and green at
head. Without it, a "fix" that refused every non-verdict YAML would pass all the
other tests. The line is drawn at the PRESENCE OF THE KEY, and that is argued at
the reader's own definition rather than left implicit.

**TRANSLITERATION DECLARED for the three captures above.** They are real
`node --test` output, and the reporter's glyphs were replaced so this file stays
pure ASCII: U+2716 rendered `x` (10 occurrences), U+2714 rendered `v`
(5 occurrences), U+2139 rendered `i` (6 occurrences). Per-test durations and the
runner's other counter lines were cut. Nothing else in any capture was changed.

### B. A guard that cannot go red

I looked for a new check that passes for a reason unrelated to its property.

- The two member tests assert an exit code of exactly 21 AND a message naming
  the file AND `doesNotMatch(/the pair approves/)`, so a crash for an unrelated
  reason does not satisfy them. Defangs 1 and 2 redden them.
- The `members-differ` test would be green if BOTH members printed nothing, so I
  checked: it first asserts the message matched at all (`line !== null`) before
  comparing. Defang 1 reddens it.
- The divergence test asserts the UNITS COUNT (`3 review verdicts examined`),
  which is the only place the runner-versus-check divergence was ever visible;
  asserting only the status would have been green before the round, which is the
  trap the round names and avoids.

### C. A count pinned over an append-only registry

`test/behaviors.json` gains five keys and loses none
(`git diff` on it shows five added lines and one line re-terminated). The
registry test asserts each id with `hasOwnProperty` over a literal list of
names; `grep -rn "behaviors" test/*.ts | grep -iE "length|\.size|count"` returns
nothing, so no test in the tree pins a total over it. `gates.manifest.json` and
`delivery/requirements/clause-map.json` are untouched by the delta.

### D. The claim grep, both forms

Over the whole work history: 86 matching lines, 174 occurrences line-based, 174
occurrences wrap-insensitive. **The gap is ZERO**, so no hit phrase straddles a
hard wrap anywhere in the file.

Over section 13 alone: 14 matching lines, 54 occurrences line-based, 54
wrap-insensitive. Both numbers reproduce the work history's own section 13.18
exactly. Of the 14 lines, 7 are the capture in 13.18 quoting the other 7, and of
those 7: two are the grep commands themselves, two are inside captured output (a
`comm` result naming a test from `main`), two are the disposition table quoting
the phrases it disposes, and one is the substantive claim ("a walker whose
transitive arm has never fired is the shape of a search that cannot report a
hit"), which is settled by the control run printed immediately below it. No hit
is an unsettled over-claim.

### E. The suite sentence, all four axes

**Interpreter** node v26.6.0 at `/home/user/n26-review/bin/node`, which is NOT
under `/tmp/claude-0` (CLAUDE.md standing warning 1's EACCES trap). **Build
state** `dist/` built immediately before, `npm run build` exit 0, `git status
--porcelain` clean afterwards apart from this report. **Invocation** `npm test`,
which excludes the tracked `sandbox/` fixture a bare `node --test` picks up.
**Tree** a fresh clone, detached at `c1b9a08`.

```
i tests 890   i suites 0   i pass 890   i fail 0
i cancelled 0   i skipped 0   i todo 0   i duration_ms 277359.509736
SUITE_EXIT=0
```

**890 tests, 890 pass, 0 fail, 0 SKIPPED, exit 0.** `/proc/loadavg` before
`4.98 4.78 7.46`, after `6.19 7.00 7.85`. This reproduces the work history's own
number exactly, and 890 is 885 (the round-1 head's total) plus the five tests
this round adds. Transliteration declared: U+2139 rendered `i` (8 occurrences),
and the per-test `v` lines were cut; nothing else changed.

I did not need to establish a base result for a failure, because there was no
failure. The container default toolchain was NOT used, for the reason CLAUDE.md
records since 2026-08-20.

### F. C-1, C-2, C-3

```
$ git diff a6db78d..c1b9a08 -- src/ scripts/ test/ bin/ witness/ \
  | grep -nEi '\bpid\b|process\.kill|/proc/|unref\(|\.detached|tail -f|tail -n|kill\('
(no output, exit 1)
```

No pid, no process liveness, no signals, no `/proc`, no log-tail read, no
backgrounding anywhere in the delta's code.

## 5. The SECOND widening: every consumer of the reading, not just the two loaders

The work history's not-covered item 2 bounds both derivations to "the path from
`delivery/review/` to the two merge predicates and nothing else". I widened
there deliberately: `establishField` is the function whose four outcomes the
mechanism collapses, so I enumerated every one of its consumers and read what
each does with a reading that is not `established`.

```
$ grep -rn "establishField(" --include=*.ts --include=*.mjs src bin scripts
```

Thirteen lines, one of them the definition. The twelve consumers:

| consumer | what a non-established reading becomes |
|---|---|
| `readVerdictKind` (`kind`) | THE FIX: `unreadable` diagnostic, or `other` for absent |
| `decorrelationTriple` (each dimension) | rendered `<absent>` / `<unusable>` / `<uncanonical>`, kept distinct from a value |
| `headKeyOf` (`head`) | a keyed refusal message |
| `headGroupFor` (`phase`) | pushed onto `unkeyed`; only a phase MISMATCH is a silent skip, which is the correct determinate negative |
| `establishDelegatedRegime` (`delivery-mode`) | violation |
| `establishDelegatedRegime` (`merge-authority`) | violation |
| `dualReviewDecorrelation` (`phase`) | violation |
| the dimension loop (`produced-by`, `framing`, `review-contract`) | violation |
| `verdictPairApproves` (`phase`) | violation |
| `verdictPairApproves` (`verdict`) | violation |
| `blockingFindings` (`severity`) | violation |
| `blockingFindings` (`id`) | a fallback LABEL (`at index N`), never a drop |

**Every one is fail-closed and none is a second instance of the mechanism.** The
widening in this direction adds nothing, which is a measurement rather than an
assumption, and it is the direction the round excluded.

One pre-existing note, recorded because I checked it and it is not a finding
against this round: `decorrelationTriple` renders every non-established reading
as its OUTCOME WORD, so two verdicts whose dimensions fail in the same way
compare equal on the identity test at `src/checks.ts:3753`, QUOTED because this
branch changes that file. That direction is
mildly permissive rather than fail-closed, it is named as such at the
canonicalisation rules' own definition, and it is unchanged by this delta.

## 6. What the round broke

I looked for the round's own recurrence of the mechanism it cites, because the
round itself found one (it moved source text that a fifth stored witness member
anchored on).

I re-derived the whole witness surface rather than the four the round names, at
this head, over every `witness/*.json` mutation member against the file it
points at:

```
mutation members: 327, non-mutation: 7, off-count: 4
  witness/checklist-duplicate-probe-id-guard.json      member 0  src/checks.ts            2
  witness/doctor-kernel-artifacts-resolution.json      member 0  src/commands/doctor.ts   2
  witness/role-brief-set-derived-not-listed.json       member 0  test/roles.test.ts       2
  witness/witness-ownership-baseline-is-the-merge-base.json member 0 src/gates/red-witness.ts 2
```

All four count 2 on `origin/main` as well (checked by reading each spec and each
target out of `origin/main` and counting there), so all four are pre-existing and
none is in a file this branch changes. **Zero broken members and zero newly
blunted members are attributable to this round.** The repointed member counts
exactly 1 and defangs correctly (section 4A, defang 3).

Nothing else in the delta breaks: `test/behaviors.json` gains keys and loses
none, the phase declaration gains one path, `asRecord` still excludes arrays so
a top-level list document is still the determinate negative it was, and the
precondition arm moved in the fail-closed direction with its control intact.

## 7. Findings

### NF-1 (the round-1 blocking MEDIUM): CLOSED

Reproduced open at `a6db78d` and gone at `c1b9a08`, by my own fixtures, on three
arms plus two controls plus the precondition arm (section 3). Closed at the
MECHANISM: one exported reader with three outcomes, used by both selection
sites, so the divergence between the runner's count and the check's set closed
with it. Eight document shapes moved, not the one the reviewer named.

### NF-2 (MEDIUM, NOT BLOCKING, TRACKED): the published derivation's output is not what its command prints, and the omitted rows include a live instance of the same mechanism

**Evidence.** Work history section 13.5 item 6 publishes
`grep -rn '"kind"\]' --include=*.ts --include=*.mjs src bin scripts` with two
rows of output and concludes "TWO OTHER RAW `kind` READS EXIST IN THE TREE" and
"In both, a failed reading shrinks nothing that a merge predicate then approves
over". The command prints seven rows at both heads (section 1). Three code rows
were omitted. One of them, src/commands/doctor.ts:471, is the mechanism live in
a shipped command: three structurally different unreadable `kind` values on a
second charter each produce `CHECK retention PASS 3 declared retention path(s)
present and tracked` and `DOCTOR_EXIT=0` while that charter declares a retention
path that does not exist, and the `kind: charter` control produces
`CHECK retention FAIL ... which does not exist` (section 2).

**REACHABILITY, stated plainly as DR-0027 requires.** The CODE defect reaches
shipped `src/` and the user-visible command `tiphys doctor`. It is nonetheless
**NOT BLOCKING**, for a reason I can name rather than a severity label: the file
is byte-identical on `origin/main` and at this head, so merging this branch does
not introduce it and refusing the merge does not remove it; and it is not on
this phase's files-to-touch, so fixing it here would widen the diff into a file
the phase has no business changing. It belongs in a follow-up phase with its own
declaration. The DOCUMENT defect (the false enumeration) is confined to
`delivery/`, which does not block.

**What would close it.** Two separate actions. (1) Replace section 13.5 item 6's
output with what the command prints, and restate the conclusion for five sites
rather than two: three lines in a file already on this phase's declaration, no
CI cycle of its own if it rides the merge. (2) Raise a follow-up phase for
`src/commands/doctor.ts`'s charter selection, since `readVerdictKind` is now the
exported shape that a `readCharterKind` would copy.

### NF-3 (LOW, NOT BLOCKING, TRACKED): four of the five derivations cannot be re-run

`lab/derive-doors.mjs`, `lab/probe-doors.mjs`, `lab/derive-verdict-checks.mjs`
and `lab/witness-drift.mjs` are cited by name throughout section 13 and are not
in the tree: `git ls-files lab` prints nothing and the directory does not exist.
Their outputs are pasted, which is better than nothing, but no later reader can
re-derive them or widen them. The one derivation that IS a plain shell command,
and therefore the only one I could reproduce, is the one whose published output
turned out wrong; that is not a coincidence a reviewer should let pass without
saying so. Confined to `delivery/`, so it does not block.

### Carried forward unchanged, both still correctly open

- The `scope` gate is red because the branch was cut from
  `plan/pstack-borrow-review` and the merge base carries no phase declaration. A
  known DR-0031 process gap, an orchestrator item, confined to `delivery/`.
  TRACKED, as round 1 and both clean-room reviews already concluded.
- `preHeadCommit()`'s 200-commit walk stays unfixed. Test-only. TRACKED.

## 8. Verdict

**APPROVE.**

Every finding above is TRACKED. None is blocking under DR-0027: NF-2's code half
is pre-existing and byte-identical on `origin/main`, NF-2's document half and
NF-3 are confined to `delivery/`, and the two carried-forward items were already
tracked before this round began.

**What I tried to break, and how it held.** I restored the collapse inside the
exported reader and three of the five new tests reddened with the control still
green; I restored the script's own pre-round selection rule with the reader left
fixed and three reddened, a different three; I applied the repointed stored
witness member by hand and the test it declares it guards reddened while the
build still exited 0. I re-derived every one of the 327 witness mutation members
rather than the five the round names, and found only the four pre-existing
ambiguous members that are also ambiguous on `origin/main`. I enumerated all
twelve consumers of `establishField` rather than the three functions the round
bounded itself to, and every one is fail-closed. I ran the claim grep in both
forms over the whole document and over section 13 and reproduced the round's own
numbers exactly, with a wrap gap of zero. The suite is 890/890/0 fail/0 skipped
on the floor toolchain with `dist/` built under `npm test`.

**The one thing that did not hold is section 1**, and it is why this document
spends its first page there: the round's own reviewer-facing first check, the
not-covered statement, is long and specific and one of its seven items publishes
output that its own command does not produce. The mechanism the round closed for
`delivery/review/` is still open one directory over, in a shipped command, and
the document says it is not.

## 8b. Gates I ran myself, at my own commit

Not quoted from the work history. Run at the commit that carries this document,
`--mode full --base origin/main --head HEAD`, node v26.6.0.

```
gates: citations: green: linted 16 changed document(s) at 3bea9289304e73c1c148e83c2be80f4684bc61db:
  504 citation(s) resolved, 0 self-citation(s), 0 unverifiable-external
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
```

```
gates: red-witness: green: 39 witness(es) evaluated (5 own, 34 stored
  re-evaluated in 369523ms); every witness red against every declared dangerous
  state and green at head
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
RW_EXIT=0
```

`5 own` is the five `witness/*.json` specs this branch changes, which is the
repoint of section 4A defang 3 confirmed by the gate rather than by my hand
application alone. `/proc/loadavg` before the red-witness run `0.11 2.60 5.69`,
after `13.36 8.89 7.24`; the run itself is not wall-clock sensitive in the way
`coverage` is, and it was green regardless.

I did not run the whole bundle. `scope` is red for the reason in section 7 and
`check-dual-review` is not-applicable on this repository (`ls delivery/review`
is 202 files and `grep -Eic "\.(ya?ml|json)$"` over that listing prints 0,
which I checked rather than took from the work history).

## 9. Citations in this document

`git diff --name-only origin/main...origin/claude/m4-p10-verdict-head-and-medium`
lists 49 files, including `src/checks.ts`, `scripts/check-dual-review.mjs`,
`test/verdict-head.test.ts`, `test/behaviors.json`, `CLAUDE.md`, the five
`witness/dual-review-*.json` specs, the work history and this file. Every
citation into any of those is inside backticks or inside a fenced block, which
the citations gate treats as QUOTED (M2-D-22), and deliberately does not
resolve.

Four citations resolve, and all four are into files this branch does not touch,
checked against that same diff: src/commands/doctor.ts:471 (the raw charter
selection this document's NF-2 is about), src/commands/validate.ts:208 and
src/witness/spec.ts:120 (the two sibling sites I cleared), and
src/gates/manifest.ts:181 (the one the round did print).
