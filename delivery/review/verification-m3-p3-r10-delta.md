# Delta verification: M3-P3 fix round 10

Independent delta verification of `claude/m3-p3-assurance-modes` at head
`676c050`, prior head `b5c01f0`. The verifier did not write the code under
review and has fixed nothing.

This file was created in the first minutes as the beacon T-008 requires and
appended as the work proceeded; this is its final state.

CITATION CONVENTION, stated once. Citations into `src/`, `test/`,
`assurance-modes.yaml`, `schemas/` and `delivery/work-history/m3-p3.md` are
line numbers AT THE HEAD UNDER REVIEW, `676c050`, which is where the content
being reviewed lives; that file set is unmerged, so those lines are not on
`main` yet. Citations into `delivery/review/` resolve on `main`. Citations
written inside backticks are QUOTED rather than asserted, and every one of them
is a citation this report is reporting as WRONG.

## Scope

Round 10 answers V-1 to V-4 of
delivery/review/verification-m3-p3-r9-delta.md:1 and CRB9-02 of
delivery/review/clean-room-m3-p3-r9-criteria.md:1.

## Environment

Fresh worktrees under the scratchpad off the main repository, which was left
on `main` and never mutated. Floor toolchain first on PATH and confirmed in
the shell that ran each command: `node --version` prints `v26.6.0`,
`npm --version` prints `11.18.0`.

| step | exit |
|---|---|
| `npm ci` | 0, no EBADENGINE line |
| `npm run build` | 0 |
| `git status --porcelain` after build | empty |
| `node --test` | 0 |

Suite result, complete sentence (CLAUDE.md warning 12): node v26.6.0, `dist/`
BUILT, invoked as `node --test` from the worktree root: **509 tests, 509 pass,
0 fail, 0 SKIPPED**, exit 0.

## Diff under review

`git diff --stat b5c01f0 676c050` reports eight files: `assurance-modes.yaml`,
`delivery/work-history/m3-p3.md`, `schemas/assurance-modes.schema.json`,
src/checks.ts:401, src/modes.ts:196, test/assurance-modes.test.ts:488,
`test/behaviors.json` and a new
`witness/checks-mode-skips-reference-relative.json`. The executable change is
ONE new loop of eleven lines at src/checks.ts:490; everything else in `src/`
is comment.

## 1. V-1, closed at the mechanism

CONFIRMED. The check now has three parts and, taken together, they pin the
relation exactly rather than bounding it on one side:

- completeness, src/checks.ts:501, non-reference rows only: gives
  `referenceStages \ pipeline(m)` is a subset of `skips(m)`.
- soundness A, src/checks.ts:450, every row, BEFORE the reference is
  resolved: gives `skips(m)` disjoint from `pipeline(m)`.
- soundness B, src/checks.ts:491, every row, after resolution: gives
  `skips(m)` a subset of `referenceStages`.

A and B together give `skips(m)` a subset of `referenceStages \ pipeline(m)`,
and with completeness that is equality. Round 9 shipped only completeness and
A, which left the superset direction open.

Direction A is UNTOUCHED by this round and still sits before the reference
lookup at src/checks.ts:461: the diff hunk header is `@@ -444,6 +467,37 @@`,
that is, pure insertion after `const referenceStages`.

### Both claimed consequences, verified by construction

Fixtures built by the verifier from the shipped document, one edit each,
validated by the real CLI (`node bin/tiphys.ts validate --type
assurance-modes --context . <fixture>`):

| fixture | edit | exit | mode-no-undeclared-downgrade lines |
|---|---|---|---|
| CONTROL, shipped document round-tripped | none | 0 | 0 |
| either side moves: reference drops `deploy-verify` | NO `skips[]` touched | 1 | 2 (direct-pr, local-only) |
| reference not exempt: `full.skips` names `orchestrator-diff-review` | reference row only | 1 | 1, `#/modes/0/skips` |

Both consequences hold.

### B-members round 10 did not name

| member | shape, and why it is structurally different | exit | result |
|---|---|---|---|
| B-x | NOTHING in the document runs the stage. Round 10's member 0 used `orchestrator-diff-review`, which `local-only` DOES run, so the literal "nothing runs it" sentence was never built | 1 | RED, `#/modes/1/skips` |
| B-w | the REFERENCE names a stage it NEVER ran, so nothing moved out of `pipeline`; round 10's member 3 is an honest downgrade where the stage moved | 1 | RED, `#/modes/0/skips` |
| B-u | the reference drops `implement`, a stage EVERY mode runs, so soundness B should fire on nobody: an over-rejection probe | 0 | GREEN, correct |
| B-v | a FOURTH mode row, so the violating index is not 0, 1 or 2 | 1 | NOT A MEMBER: `#/modes/3/id value "yolo" is not one of the permitted values`. The mode id vocabulary is closed, so a fourth row cannot exist to carry the violation |

## 2. CRB9-02, and a leaner `full`

CONFIRMED, both halves.

Two independently-shaped leaner references were built and both are ACCEPTED:

| fixture | exit | lines |
|---|---|---|
| `full` drops `deploy-verify` and `migration-verify`, both other modes' `skips` adjusted to match | 0 | 0 |
| `full` drops `final-report`, only `local-only` adjusts | 0 | 0 |

So the reference is still expressible as a leaner process; what is refused is
a reference that claims a downgrade in `skips` rather than shortening
`pipeline`.

## 3. The witness, member by member, read by FAILURE TEXT

The four dangerous states in `witness/checks-mode-skips-reference-relative.json`
were applied BY HAND, one at a time, in a lab worktree at the same head; the
target test alone was run
(`node --test --test-name-pattern '<name>' test/assurance-modes.test.ts`, the
pattern before the positional path per CLAUDE.md warning 7); the tree was then
restored by `cp` from a pristine copy taken before any edit, never by
`git checkout --` (T-013), and md5 was printed before, after apply and after
restore, and compared. All four restores returned the tree to
`assurance-modes.yaml` = `671e84a257a873ea3a040375cec69cfc` and
`src/checks.ts` = `8303708bc80d951715697c5b3ca23465`, with
`git status --porcelain` empty.

Control, unmutated: `tests 1, pass 1, fail 0`, exit 0.

| member | kind | test exit | assertion that reddened | right reason? |
|---|---|---|---|---|
| 0 | DATA, `direct-pr.skips` gains `orchestrator-diff-review` | 1 | test/assurance-modes.test.ts:532, "the shipped assurance-modes.yaml must be green on this check", `1 !== 0` | YES |
| 1 | DATA, reference pipeline loses `deploy-verify` | 1 | test/assurance-modes.test.ts:532, same control, `2 !== 0` | YES |
| 2 | CODE, `if (!referenceRunning.has(stage))` becomes `if (false)` | 1 | test/assurance-modes.test.ts:572, `phantomRun.status` `0 !== 1` | YES |
| 3 | CODE, direction B `continue`s past the reference row | 1 | test/assurance-modes.test.ts:634, the `assert.match` for `#/modes/0/skips mode full ...` | YES |

The wrong-reason failure round 10 reports of its own first run
(`array items 0 and 1 are duplicates`) does NOT occur in any of the four. The
mechanical fixes it credits are both present and both load-bearing: the
control assertion is the FIRST statement in the test body
(test/assurance-modes.test.ts:532) so a DATA member reddens on the check
reporting a violation it should not, and both `skips` fixtures are built with a
filter-then-prepend dedupe (test/assurance-modes.test.ts:561 and
test/assurance-modes.test.ts:649) so the fixture stays schema-valid when the
document it is built from has already been mutated.

Members 0 and 1 reddening on the control rather than on their own fixture is
correct and not a weakness: a DATA dangerous state makes the SHIPPED document
dangerous, and the control counts only lines naming this check, so it is
specific to the guard under test. Verified independently by validating the
mutated shipped document directly:

- member 0 applied: exit 1, one line, `mode direct-pr declares stage
  orchestrator-diff-review in skips, but mode full does not run it`.
- member 1 applied: exit 1, two lines, direct-pr and local-only, both for
  `deploy-verify`.

Both are direction-B messages, so the redness is attributable to the loop this
round added and not to some other check.

### Member 3 discriminates, as claimed

Under member 3 the failure text prints the actual output, and it still
contains BOTH non-reference violations
(`#/modes/1/skips mode direct-pr ...` and `#/modes/2/skips mode local-only
...`) while the reference's own row is absent. That is exactly the claim: V-1
stays closed and only the CRB9-02 half reopens. The evidence is in the
assertion's `actual` value, not inferred.

## Log

- Worktrees created, beacon opened.
- Environment, suite, diff, sections 1 to 3 verified and written.
- Continuing: V-2/V-3/V-4, documentation accuracy, DR-0022, gates, the
  `mode-gate-sets-resolve` open question.

## 4. V-2, V-3, V-4 re-derived

### V-2 counts: CONFIRMED, all three numbers

Re-derived from git by the verifier, not read from the record. Method: at each
ref, parse every `witness/*.json` spec, take every `dangerousStates` entry of
kind `mutation`, and keep those whose `file` is outside `src/`, `test/` and
`bin/`.

| ref | spec files | dangerous states | mutation members | outside src/test/bin | in N specs |
|---|---|---|---|---|---|
| merge base `3c60acb` | 33 | 63 | 56 | **2** | 2 |
| prior head `b5c01f0` | 56 | 116 | 109 | **8** | 5 |
| head `676c050` | 57 | 120 | 113 | **10** | 6 |

- Round 9's DATA members are `checks-mode-skips-sound` members 0 and 1 and
  `modes-execution-status-derived` member 2, all `assurance-modes.yaml`:
  **three, not four.** CONFIRMED.
- Prior non-code states, that is the 8 at `b5c01f0` less round 9's own 3:
  **five, in three specs** (`schemas-closed-vocabulary-disclosed` x3,
  `status-state-vocabulary-closed` x1, `status-state-vocabulary-single-source`
  x1). CONFIRMED.
- Of those five, **two predate the phase**, being the only two present at the
  merge base. CONFIRMED.

Seven further members are of kind `patch` and carry no `file`; the count is
identical at all three refs, so they do not disturb the arithmetic either way.

### V-3: CONFIRMED closed

The strong claim is gone from the shipped source. `git grep -n -i "can only
make a sample"` at `676c050` returns four lines and none of them asserts it:
test/assurance-modes.test.ts:3325 QUOTES the old sentence in order to
say it contradicted the measurement printed above it, and the three work-history
hits are inside the round-9 section, which already restated it under its own
claim grep.

The replacement argument is sound and does not need the absolute: every sample
is a real execution of the real workload, so a minimum under budget means some
real run came in under budget. The measurement it cites is real: the table at
test/assurance-modes.test.ts:3307 gives loaded bullet min 0.25 ms against
quiet bullet min 0.28 ms, which is the cell that contradicted the old sentence.

### V-4: CONFIRMED closed

`delivery/review/clean-room-m3-p3-r8-criteria.md:318` is a BLANK line, which is
what round 9 cited. The four replacements resolve to their subject matter:

| citation | line's subject |
|---|---|
| :217 | CR-002's heading |
| :220 | the mechanism sentence ("It never asks the converse") |
| :228 | member 1 |
| :250 | member 2 |
| :266 | member 3 |
| :283 | the narrower fix shape round 9 implemented |

## 5. The round-9 documentation it corrected: CONFIRMED accurate

`schemas/assurance-modes.schema.json`, `assurance-modes.yaml` and both source
comments now describe three parts, and each part is the code. The two
historical claims they make were checked at the PRIOR head rather than taken on
trust, in a worktree at `b5c01f0` restored by `cp` from a pristine copy with
md5 compared (`04d39076684bc8e2524dc97dcb22a48c` before and after):

| claim | at b5c01f0 | at 676c050 |
|---|---|---|
| `direct-pr` gaining `orchestrator-diff-review` validates at exit 0 and inflates the count | exit **0**; `mode show --mode direct-pr` prints "It declares **8** skipped stage(s)" against a shipped 7 | exit **1**, one direction-B line |
| a `full` whose stage MOVED from `pipeline` into `skips` validates at exit 0 and `mode show` prints the un-downgraded sentence above a `skips: deploy-verify` row | exit **0**; the sentence is output line 2 and `skips:` is output line 17, so **fifteen lines** below it, exactly as claimed | exit **1**, three lines, the reference's own row first |

## 6. DR-0022: CONFIRMED, sixth independent derivation

Both trees from `git archive` in a lab outside the repository, removed on a
trap (`CLEANUP done, LAB present after=NO`). No staged copy was read. Run at
the HEAD `676c050`, which no earlier party measured; round 9 measured
`b5c01f0`.

```
NODE=v26.6.0
HEAD_FULL=676c0509b1e5396adee35ca1367ca03eb9469896
BASE_FULL=18c335a2fc4be0ff68bbff8528416fd82146349f
BASELINE commonmark occurrences in src/checks.ts (expect 0): 0
HEAD     commonmark occurrences in src/checks.ts (expect >0): 15
HEAD     records=20 total-units=504   HEAD_EXIT=0
BASELINE records=20 total-units=504   BASE_EXIT=0
DIFF_EXIT=0  DIFF_LINES=0
e5c0dfd22c3b3f9215b88200d2804352  DV10-units-head.json
e5c0dfd22c3b3f9215b88200d2804352  DV10-units-base.json
```

The commonmark counts are a negative control that the two trees really are the
two different implementations the criterion is about.

## Log

- Sections 4, 5, 6 verified and written. Gate runs and the work history next.

## 7. Gates, re-run independently at `676c050`

Round 10 ran its bundle at `c5278f3`, the CODE commit. T-009 says a gate result
is evidence only for the configuration that produced it, so every number below
is a fresh run at `676c050`, the head that will merge, in a scratch CLONE with
the branch checked out under its real name.

The detached-worktree trap was avoided by construction and the avoidance was
verified rather than assumed:

```
BRANCH=claude/m3-p3-assurance-modes
matches phase pattern: true
MERGE-BASE=3c60acbee541711aca2b046269aa35a03f22bb8e
```

| gate | own exit | status | units / detail |
|---|---|---|---|
| `npm ci` | 0 | - | no EBADENGINE line on the floor toolchain |
| `npm run build` | 0 | - | `git status --porcelain` empty afterwards |
| `node --test` | 0 | - | 509 tests, 509 pass, 0 skipped |
| `manifest-self-check` | 0 | green | 8 schema documents validated |
| `coverage` | 0 | green | 115 inventory ids checked |
| `credential-scrub` | 0 | green | 7 sources probed, none resolvable |
| `credential-token` | 0 | not-applicable | `TIPHYS_IMPLEMENTER_TOKEN` unset (owner action A-3) |
| `citations` | 0 | **not-applicable** | "no changed path under the configured documents globs (43 changed path(s) total)" |
| `scope` | **0** | **green** | 43 changed paths audited against `delivery/plan/phase-declarations/m3-p3.json` at the merge base |
| `deploy` | 0 | not-applicable | structural pre-merge, `release-verification.json` absent |
| `migrations` | 0 | not-applicable | structural pre-merge |
| `clause-map` | 0 | green | 18 rows checked, 56 pending a phase not yet in force |
| `agent-rules-drift` | 0 | green | CLAUDE.md's block matches the registry row for row |
| `suite` | 0 | green | 507 tests from 30 files, pass 507, fail 0, skipped 0 |
| `red-witness` | 0 | green | 37 witnesses (24 own, 13 stored), every one red against every declared dangerous state and green at head |

The bundled group returns exit 20 ("required gate(s) not applicable: citations"),
which round 9 already established as pre-existing; the scope gate's exit is 0
and it is GREEN with 43 units, not a false not-applicable.

The new witness's own record, read from `witness-records.json` rather than from
the summary line:

| member | rate | headGreen |
|---|---|---|
| 0 (DATA, `assurance-modes.yaml`) | `{"red":2,"total":2}` | true |
| 1 (DATA, `assurance-modes.yaml`) | `{"red":2,"total":2}` | true |
| 2 (CODE, `src/checks.ts`) | `{"red":2,"total":2}` | true |
| 3 (CODE, `src/checks.ts`) | `{"red":2,"total":2}` | true |

Both ASCII checks, run with the load-bearing `-a`, over 434 tracked files minus
the two path-scoped exemptions: `NONASCII_HITS=0`, `CONTROLCHAR_HITS=0`. The
control check was demonstrated live against a one-byte NUL fixture (`with -a:
DETECTED`, `without -a: MISSED`), and `git diff --stat b5c01f0 676c050` reports
no `Bin` file.

## Findings

| id | severity | one line |
|---|---|---|
| V-1 | LOW | two citations round 10 ADDED are stale by exactly round 10's own insertion, which is the class of the V-4 it was fixing |
| V-2 | LOW | the claim grep's own accounting is wrong: four hits in the shipped section, not three, and the hit the record names is not one of them |
| V-3 | LOW | assurance-modes.yaml:18 says `mode-gate-sets-resolve` "keeps the two files from drifting apart", which round 10's own probe measured to be false, in a comment block round 10 edited |

Nothing MEDIUM or HIGH. V-1 to V-4 of the round-9 delta verification and CRB9-02
are all CLOSED, at the mechanism and not at the instance.

## V-1 (LOW): two citations round 10 added were computed against the PRIOR head

**The mechanism, not the instance.** A `path:LINE` citation is a COORDINATE into
a file. When the SAME COMMIT edits that file, every citation written before the
edit is stale at the head that ships it. This is not "a typo in a line number":
it is a class, and the class is defined by "citation into a file this commit
touches, not re-resolved after the touch".

**The two instances**, both in the comment of the new test:

| citing site | citation | line's text at `b5c01f0` | line's text at `676c050` |
|---|---|---|---|
| test/assurance-modes.test.ts:512 | `src/modes.ts:221` | `if (mode.id === UNDOWNGRADED_MODE_ID) {` | ` * kernel's own document is the process the tiphys PROJECT follows for its own` |
| test/assurance-modes.test.ts:516 | `test/assurance-modes.test.ts:2119` | "`full` declares NO skipped stage. Without this assertion a data edit" | `    const indentedPath = writeDocument(` |

The offsets are exactly the round's own insertions and that is the proof it is
mechanical rather than coincidental: `src/modes.ts` gained 13 lines at the hunk
`@@ -196,12 +196,25 @@`, and 221 + 13 = 234, which at the head is
`if (mode.id === UNDOWNGRADED_MODE_ID) {`, the line the sentence means.
`test/assurance-modes.test.ts` gained 5 + 209 = 214 lines before that point, and
2119 + 214 = 2333, which at the head is the comment sentence "`full` declares NO
skipped stage", the assertion itself being at test/assurance-modes.test.ts:2337.

At the head a reader following the first lands on prose about what the comment
deliberately does NOT say, and the second lands inside a different test about
DR-9999 quoting, which asserts nothing about `full`.

**Reproduction, with its own exit code:**

```
$ cd <worktree at 676c050>
$ sed -n '221p' src/modes.ts
 * kernel's own document is the process the tiphys PROJECT follows for its own
$ sed -n '234p' src/modes.ts
  if (mode.id === UNDOWNGRADED_MODE_ID) {
$ sed -n '2119p' test/assurance-modes.test.ts
    const indentedPath = writeDocument(
$ sed -n '2337p' test/assurance-modes.test.ts
    assert.deepEqual(
$ echo $?
0
```

**The derivation, published rather than summarised.** Every citation token on a
line the round-10 diff ADDS, resolved at `676c050`:

```
$ git diff -U0 b5c01f0 676c050 | <collect added lines> | <extract path:line> | <resolve at HEAD>
Added lines in the round-10 diff: 979
Total citation tokens on added lines: 28
```

Of the 28: 9 name `delivery/review/clean-room-m3-p3-r8-criteria.md`, which is
absent from the branch and present on `origin/main` with md5
`3658bd0d6be22536567e55b9e9663396` at both `e2e3a81` and `cfa7517`, where every
one of them resolves to its stated subject (checked line by line, section 4);
17 resolve correctly at the head, including all thirteen in the round-10 work
history, which were derived AT the head; and 2 do not, both in the test comment.

**What the derivation did NOT cover.**

- It resolves a citation to a LINE OF TEXT. It cannot judge whether that text
  supports the sentence citing it. Every one of the 17 "correct" rows was read
  by eye; that reading is judgment, not measurement.
- It covers only citations on ADDED lines. A citation on an unchanged line that
  this round's edits invalidated is a different class, reported as O-1 below.
- It covers tracked text files with the extensions the citation grammar
  recognises. A citation inside a binary or an untracked file is invisible to it.
- It does not run the `citations` gate's own resolver; it is an independent
  re-implementation, so a disagreement between the two would show up as my
  error as readily as theirs.

**No gate can catch this, and that is measured rather than assumed.** The
`citations` gate's `documents` list at src/gates/citations.ts:238 is
`delivery/plan/**`, `delivery/verification/**`, `delivery/decisions/**`,
`delivery/tuition/**`, `delivery/requirements/**/*.md` and `delivery/STATE.md`.
`delivery/review/` and `delivery/work-history/` were REMOVED deliberately
(src/gates/citations.ts:180), and source comments in `test/**` were never in it.
On this diff the gate is not-applicable outright. So a citation in a `.ts`
comment has no gate at all, which is why this is the ninth round in ten whose
new defect a verifier found and no gate did.

## V-2 (LOW): the claim grep's own accounting is wrong

CLAUDE.md makes the claim grep mandatory precisely because a mechanical check
beats a reminder. The round runs it and reports the result, and the report does
not match the section it shipped.

```
$ sed -n '7835,$p' delivery/work-history/m3-p3.md > r10-section.md
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' r10-section.md
43:MECHANISM: "It never asks the converse: is every stage in `skips[]` actually
241:gate exists and that its `modes` list names the mode. It never iterates the
493:red, so a scope gate that never actually audited anything would have been
540:"never iterates the registry", restated as what I read and what the probe
$ echo $?
0
```

Four hits, not three. The record at delivery/work-history/m3-p3.md:8370 says
"three hits" and names them as a quotation, "the `mode show` sentence" and the
open question. The `mode show` sentence is NOT a hit of this grep; the two hits
the record omits are line 493, a hypothetical about the scope gate, and line
540, the accounting paragraph's own self-reference.

**The substance is unharmed and that is stated plainly**: all four hits are
either a verbatim quotation carrying its own citation, a hypothetical, an
already-restated open question, or self-reference, so no unsettled absolute
ships. What is wrong is the report of the mechanism's output, and this is the
same shape as the V-2 it was correcting: a count in a work history that does not
survive being re-derived. Round 10's own draft section under the scratchpad
yields 4 as well, so the discrepancy is not an artefact of the final edits.

## V-3 (LOW): the shipped document still claims the gate-set drift is prevented

Four lines above the `skips` paragraph round 10 rewrote, the same comment block
says:

```
$ sed -n '18,21p' assurance-modes.yaml
#   gate-sets        derived from gate-registry.yaml: each mode selects exactly
#                    the gates whose own `modes` list names it. That is a
#                    mechanical derivation, and `mode-gate-sets-resolve` is what
#                    keeps the two files from drifting apart.
$ echo $?
0
```

"EXACTLY" is an equality and "keeps the two files from drifting apart" is a
claim about the check. Round 10 measured, in the same commit, that one direction
of that drift is unchecked (delivery/work-history/m3-p3.md:8075). So the
document asserts a property the round's own evidence says is not enforced, in a
comment block the round was editing.

This is not a request to fix the check, which is out of scope and correctly
left alone. It is the SENTENCE that is wrong, and "a guard narrower than its own
description" is the defect this phase has now produced three times: CR-002's
schema `$comment`, round 9's "BOTH directions", and this.

The check's own docstring at src/checks.ts:576 is honest by contrast: it
describes only the forward direction and does not claim the converse. The
document overclaims where the code does not.

## O-1 (observation, PRE-EXISTING, not a finding against round 10): citation drift at large

The wider derivation, run before it was narrowed: 2036 citation tokens in
tracked text files at the head, 139 pointing into a file round 10 changed, and
**88** whose target line's TEXT differs between `b5c01f0` and `676c050`. Two of
those 88 are V-1. The other 86 are citations written by earlier rounds into
files that many rounds have since edited, in `delivery/review/` and
`delivery/work-history/`, and the citations gate excludes both trees by an
explicit recorded decision (src/gates/citations.ts:180) on the ground that a
historical record's refs "were valid when authored and drift as the code moves".

That decision is coherent and I am not disputing it. It is recorded here because
the 88 is the size of the drift, nobody has measured it before, and it bounds how
much a reader can trust a `path:line` in a record: at this head, roughly two
thirds of the citations into recently-churned files no longer point at the text
they were written against. The `@sha256:` pin the citation grammar already
supports is the mechanism that would make a record's citation self-verifying.

## O-2: `mode-gate-sets-resolve`, the third occurrence, confirmed

Round 10 probed this and left it alone as instructed. **The measurement is
CONFIRMED, by a structurally different probe than theirs**, which matters
because a one-directional check can be missed from one side.

Round 10 removed a gate id from `full`'s `gate-sets` while the registry still
declared `modes: [full]`. I did the reverse: I left the modes document untouched
and ADDED a mode to a registry gate.

```
$ node bin/tiphys.ts validate --type assurance-modes --context $CTX assurance-modes.yaml
exit=0                       # CONTROL, untouched registry copy

# registry gate `deploy` gains mode `local-only`; the modes document is untouched
$ node bin/tiphys.ts validate --type assurance-modes --context $CTX assurance-modes.yaml
exit=0                       # ACCEPTED. The reverse direction is unchecked.

# CONTRAST, the direction that IS checked: registry gate `suite` drops `local-only`
$ node bin/tiphys.ts validate --type assurance-modes --context $CTX assurance-modes.yaml
INVALID #/modes/2/gate-sets/2 gate set suite is declared in .../gate-registry.yaml
  and its modes list does not name local-only, so it never runs in this mode
  (check: mode-gate-sets-resolve)
exit=1
```

The shipped data is currently an exact transpose in both directions, derived
rather than eyeballed: 0 forward violations and 0 reverse violations across
3 modes and 14 gates. So the hole is LATENT, which is exactly the condition
under which `skips[]` sat for nine rounds.

**Same mechanism, not a lookalike.** My reasons, and the one honest difference:

- The relation is stated redundantly in two places and the document defines one
  side as derived from the other with the word "exactly" (assurance-modes.yaml:18),
  precisely as `skips` is defined with "AND NOTHING ELSE" (assurance-modes.yaml:22).
- The check enforces one containment of an intended equality, which is the V-1
  mechanism verbatim.
- The shipped data satisfies both containments, so no test and no gate reddens.
- The documentation claims the drift is prevented (V-3 above), which is the
  round-9 failure one level up.

The difference, stated because it is real and it affects severity rather than
classification: the two sides of `skips` live in ONE document, and the unchecked
direction let a document OVERSTATE its downgrades and let the reference
contradict itself in `tiphys mode show`. The two sides of `gate-sets` live in
TWO documents, and the unchecked direction makes the modes document UNDER-report
gates the registry says run in that mode. `mode show` is the only consumer
(src/modes.ts:298), so the consequence today is a false description rather than
a false assurance claim. I did not fix it and I did not write a witness for it.

## What I did NOT cover, and why

Read this first, per the fix-round contract.

- **CI: NEITHER ARM OBSERVED.** I have no run id for the `pull_request` arm and
  none for the post-merge `push` arm. Every number in this document is evidence
  for a LOCAL run at `676c050` on node v26.6.0 with `dist/` built, and for
  nothing else. T-009's two rules are both undischarged by anything here, and so
  is DR-0012 condition 4.
- **`role-model-config.yaml` was not audited at all**, for the one-directional
  shape or anything else. This is the third consecutive party to say so.
- **Only `mode-gate-sets-resolve` was probed by EXECUTION.** I enumerated all
  ten exported `DerivedCheck`s at src/checks.ts:87 onward and classified them by
  READING: `charter-mode-enum-matches-modes` uses `sameStringList`
  (src/checks.ts:309), a genuine element-wise equality, so it is not the shape;
  `mode-ids-are-unique` and `role-ids-are-unique` are uniqueness;
  `mode-stage-order` is ordering; `mode-conditions-quote-granted-by` is quoting;
  the three `plan-*` checks are pointer resolution, not set equality. That
  classification is judgment applied to source, NOT measurement, and a check
  that hides a set comparison behind a helper would survive it.
- **I did not re-walk the phase's acceptance criteria.** This is a delta over
  one fix round, not a re-verification of M3-P3.
- **I did not judge the 86 historical stale citations individually.** I measured
  that their target text moved; whether each is now misleading needs a reader.
- **Cost was not measured**, matching the round's own statement.
- **The two `clean-room-checklist` gates were not executed**, the runner
  declaring them out of its scope, and I ran no `direct-pr` or `local-only`
  bundle.
- **The npm package contents were not inspected**, and neither was anything
  under `dist/` beyond its presence changing the skip count.
- **The `sandbox/test/greet.test.js` invocation axis** was confirmed as the
  already-recorded O-1 of round 9 (509 under `node --test` against 507 under
  `npm test`, the difference being that fixture) and not re-investigated.

## Verdict

V-1, V-2, V-3, V-4 and CRB9-02 are CLOSED. V-1 in particular is closed at the
MECHANISM: the three parts together pin `skips[]` to an equality rather than
bounding it, both claimed consequences hold by construction, and two further
B-members of my own construction redden while an over-rejection probe and two
leaner-`full` documents stay green.

The witness is sound and, unusually for this phase, its own worst failure mode
was found and fixed by the round that wrote it: all four members redden for the
right reason, verified by reading the failure text rather than the exit code,
and the `array items 0 and 1 are duplicates` failure does not recur.

Three LOW findings, none of them in the executable change. Two are documentation
accuracy in the round's own new text; the third is a sentence the round left
standing that its own evidence contradicts.

## The claim grep over THIS document, with its output and each hit settled

The contract binds the verifier too, and V-2 above is a finding about
mis-reporting this mechanism, so the output is pasted rather than counted.

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' \
    delivery/review/verification-m3-p3-r10-delta.md
27:  ... the main repository, which was left on `main` and never mutated ...
90:  ... the literal "nothing runs it" sentence was never built ...
91:  ... the REFERENCE names a stage it NEVER ran ...
117: ... restored by `cp` ... never by `git checkout --` ...
224: ... "It never asks the converse" ...
412: ... source comments in `test/**` were never in it ...
425-429: the quoted grep command and its own four-line output
517: ... so it never runs in this mode ... (quoted CLI output)
570: ... whether each is now misleading needs a reader ...
$ echo $?
0
```

Nine sites. Three are quotations carrying their own citation or captured
output (224, 425-429, 517) and one is a grep artefact on "needs a" (570).
The five that are my own assertions:

**27, "never mutated".** RESTATED, because the flat form is false. The main
repository's WORKING TREE and HEAD were untouched; three worktrees and one
branch were added, which is what the publication instruction requires and is a
write to `.git`. Measured after all work:

```
$ cd /home/user/tiphys-ai-helmsman
$ git rev-parse --short HEAD ; git branch --show-current
cfa7517
main
$ git status --porcelain ; echo "STATUS_LINES=$(git status --porcelain | wc -l)"
STATUS_LINES=0
$ git worktree list | grep DV10
  .../DV10-head    676c050 (detached HEAD)
  .../DV10-lab     676c050 (detached HEAD)
  .../DV10-prev    b5c01f0 (detached HEAD)
  .../DV10-report  e2e3a81 [claude/verify-m3p3-r10]
```

No branch matching `^claude/m[0-9]+-p[0-9]+-` was created, so the scope auditor
has nothing to demand a declaration for.

**90 and 91, about what round 10 did and did not build.** Settled by the
document itself rather than by reading the witness's intent:

```
$ node -e '<parse assurance-modes.yaml, print pipeline membership>'
full       runs orchestrator-diff-review: false
direct-pr  runs orchestrator-diff-review: false
local-only runs orchestrator-diff-review: true
```

So round 10's member 0 names a stage that `local-only` DOES run, and my B-x is
the strictly stronger case where nothing runs it. And `full` never ran
`orchestrator-diff-review`, so B-w is a phantom rather than a moved stage.

**117, "never by `git checkout --`".** One hit, and it is the header comment
saying so:

```
$ grep -rn 'git checkout --' scratchpad/DV10-*.sh scratchpad/DV10-*.mjs
DV10-member.sh:4:# (T-013: never `git checkout --`) and COMPARE md5 before and after.
```

That is the ONLY occurrence: no invocation. Restores are two `cp` calls from
`DV10-pristine/`, and the DR-0022 lab carries one `trap` line and printed
`CLEANUP done, LAB present after=NO`.

**412, "source comments in `test/**` were never in it".** Settled by the
config immediately above it: the `documents` list at src/gates/citations.ts:238
contains six entries, all of them under `delivery/`, and no entry matches
`test/` or `src/`. I did not trace the gate's runtime path, so this is read from
the declared default config, which a caller-supplied config could override.

## What this verification itself did

Four worktrees and one scratch clone under the scratchpad; the main repository
left on `main` with an empty `git status`. Every mutation of a tracked file
happened in `DV10-lab` or `DV10-prev`, was restored by `cp` from a pristine copy
taken beforehand, and the md5 was printed before, after and after the restore
and compared each time. The DR-0022 lab lived outside every repository and
removed itself on a trap.

Nothing was transliterated. Every captured excerpt in this document comes from
`tiphys`, `git`, `grep`, `md5sum`, `sed` or `node`'s `AssertionError` text, none
of which emitted a non-ASCII byte here; the `node --test` reporter's U+2139 and
U+2716 marks are in the raw TAP files under the scratchpad and are not quoted
above. Both ASCII checks over this file return zero hits.
