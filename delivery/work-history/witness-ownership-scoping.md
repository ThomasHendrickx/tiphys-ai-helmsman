# Work history: witness ownership is scoped per MEMBER, not per FILE

- date: 2026-08-15
- branch: `claude/witness-ownership-scoping`, cut from `origin/main` at d5d87f7
- not a plan phase: this is a harness defect fix in shipped `src/`, dispatched
  by the orchestrator after the M3 exit test's stage E1.6 hit it
- files this touches: `src/witness/run.ts`, `src/witness/spec.ts`,
  `src/gates/red-witness.ts`, `scripts/m2-exit-test.sh`,
  `test/witness.test.ts`, `test/behaviors.json`, the two
  `witness/witness-rule-d-*.json` specs, this file

This file is written incrementally from the first minutes of the round, per the
T-008 beacon rule. Sections appear in the order they were established, not in
the order that reads best.

## 1. The mechanism, named as a mechanism

**The red-witness gate derives a spec's phase OWNERSHIP from the spec FILE
appearing in the phase diff, and then applies rule (d)'s
must-intersect-the-diff obligation to EVERY MEMBER of that spec's
`dangerousStates` array. Ownership is file-granular; the obligation it gates is
member-granular. So editing any one member of a multi-member spec imposes the
obligation on every sibling member of the same file, including members the
phase never authored, never modified and never looked at.**

That is the mechanism. The instance that surfaced it (the M3 exit test's E1.6
having to repair one member's `find` text and thereby reddening the two
retention members twelve lines away) is one consequence of it, and fixing only
that instance is what the fix-round contract in CLAUDE.md:333 exists to refuse.

The two halves of the mismatch, quoted from the tree at d5d87f7:

- ownership, file-granular, at `src/gates/red-witness.ts` line 277 AS OF
  d5d87f7. Quoted rather than cited, per CLAUDE.md:155: this branch changes that
  file, so a resolving citation would point at the NEW line 277 and silently
  mean something else. The same treatment applies to every pre-change line
  number in sections 1 and 2.

  ```
  const own = specs.filter((entry) => diff.files.has(entry.repoRelative));
  ```

  `entry.repoRelative` is the spec FILE path, so membership in `own` says
  nothing finer than "some byte of this file changed".

- the obligation, member-granular, at `src/witness/run.ts` line 1251 AS OF
  d5d87f7:

  ```
  if (inputs.phaseOwn) {
    for (let index = 0; index < spec.dangerousStates.length; index += 1) {
  ```

  the loop runs over every member of the array under a condition that was
  decided once for the whole file.

## 2. My own derivation of the call sites

Re-derived rather than inherited from the dispatch brief. Two searches, because
the identifier search alone would only find the rule the brief already named.

### 2.1 Every occurrence of the ownership flag

```
$ cd <worktree> && grep -rn "phaseOwn" . --exclude-dir=node_modules --exclude-dir=.git
./src/gates/red-witness.ts:330:      const inputs: EvaluationInputs = { ...baseInputs, phaseOwn: true };
./src/gates/red-witness.ts:344:      const inputs: EvaluationInputs = { ...baseInputs, phaseOwn: false };
./src/witness/run.ts:96:  phaseOwn: boolean;
./src/witness/run.ts:1251:  if (inputs.phaseOwn) {
./delivery/review/verification-m3-p5-fix-round-2.md:183:  if (inputs.phaseOwn) {
```

Two producers, one type field, one consumer, and one quotation of the consumer
inside a delivery document (not code). This matches the brief's derivation and
was run independently of it.

### 2.2 The surface that could carry the SAME mismatch

The identifier search cannot find a second instance of the mechanism, because a
second instance would not be spelled `phaseOwn`. The mechanism needs two
ingredients: a fact derived at FILE granularity from the diff, and an
obligation applied at MEMBER granularity. So the second search enumerates every
read of `dangerousStates` in `src/`:

```
$ grep -rn "dangerousStates" src/ | grep -v "^src/gates/schemas/"
src/gates/red-witness.ts:280:    entry.spec.dangerousStates.some((member) =>
src/gates/red-witness.ts:292:    for (const member of entry.spec.dangerousStates) {
src/checks.ts:3138:     `dangerousStates`, which is a deliberate defect a test must redden against.
src/witness/spec.ts:20: * states they have been demonstrated red. `dangerousStates` is an ARRAY of
src/witness/spec.ts:61:  dangerousStates: DangerousStateMember[];
src/witness/spec.ts:111:  const members = (document as { dangerousStates?: unknown }).dangerousStates;
src/witness/spec.ts:128:          pointer: `#/dangerousStates/${String(index)}/${field}`,
src/witness/spec.ts:136:          pointer: `#/dangerousStates/${String(index)}/${field}`,
src/witness/spec.ts:207:    dangerousStates: (raw["dangerousStates"] as DangerousStateMember[]).map(
src/witness/run.ts:1170:    for (let index = 0; index < spec.dangerousStates.length; index += 1) {
src/witness/run.ts:1171:      const member = spec.dangerousStates[index] as DangerousStateMember;
src/witness/run.ts:1233:  for (const member of spec.dangerousStates) {
src/witness/run.ts:1252:    for (let index = 0; index < spec.dangerousStates.length; index += 1) {
src/witness/run.ts:1253:      const member = spec.dangerousStates[index] as DangerousStateMember;
src/witness/run.ts:1293:    if (spec.dangerousStates.length < 2) {
src/witness/run.ts:1299:        } must declare at least two structurally different dangerousStates ` +
src/witness/run.ts:1300:          `members and this witness declares ${String(spec.dangerousStates.length)} ` +
src/witness/run.ts:1307:      for (let a = 0; a < spec.dangerousStates.length; a += 1) {
src/witness/run.ts:1308:        for (let b = a + 1; b < spec.dangerousStates.length; b += 1) {
src/witness/run.ts:1309:          const first = spec.dangerousStates[a] as DangerousStateMember;
src/witness/run.ts:1310:          const second = spec.dangerousStates[b] as DangerousStateMember;
src/witness/run.ts:1347:  if (derivation.textAsserting && spec.dangerousStates.length >= 1) {
src/witness/run.ts:1358:    for (let index = 0; index < spec.dangerousStates.length; index += 1) {
src/witness/run.ts:1359:      const member = spec.dangerousStates[index] as DangerousStateMember;
src/witness/run.ts:1465:  for (let index = 0; index < spec.dangerousStates.length; index += 1) {
src/witness/run.ts:1466:    const member = spec.dangerousStates[index] as DangerousStateMember;
```

Run against the tree at d5d87f7, which is the state the audit is about, so the
line numbers above are PRE-CHANGE and are quoted rather than cited.
Twenty-six lines, and the rules audit below covers every one of them that is an
evaluation rather than a declaration, a schema pointer or a comment.

### 2.3 The audit of rules (c), (f) and (g), which the brief required

Every rule that reads `dangerousStates` was read against the two-ingredient
test above. The verdicts, one row per rule, with the reason rather than a bare
yes or no:

| rule | reads members? | reads the diff? | same mismatch? |
|---|---|---|---|
| (a) src/witness/run.ts:1190 | yes, per member | **no** | no: the check is `member.kind === "baseline-ref"` against `spec.class`, entirely spec-internal. With no diff input there is no file-granular fact to mis-scope. |
| (b) src/witness/run.ts:1183 | no | no | no: spec-level, one behavior id. |
| (c) src/witness/run.ts:1219 | no | no | no. This is the one worth stating carefully, because `consumesExternalOutput` is a SPEC-level field: the obligation and the fact are both spec-granular, so the granularities match. The mismatch requires a finer obligation than the fact, and here they are equal. |
| (d) src/witness/run.ts:1272 | yes, per member | yes, via the ownership input | **YES. This is the defect.** |
| (e) src/witness/run.ts:1204 | no | no | no: derived from the named tests' sources against the manifest list. |
| (f) src/witness/run.ts:1253 | yes, unions all members | yes, via `inputs.spawningChangedFiles` | **no, and this is deliberate rather than lucky.** See below. |
| (g) src/witness/run.ts:1320 and src/witness/run.ts:1373 | yes, pairwise and per member | no | no: structural distinctness and text preservation are computed from the spec and from head-state document text. No diff-derived input reaches either half. |

**Rule (f) is the one that looks like the defect and is not, so the reasoning is
written out rather than asserted.** Rule (f) unions the touched files of ALL
members and requires `consumesExternalOutput` if any of them is a changed file
the spawn grep matched. An untouched sibling member therefore CAN raise the
obligation. The difference is what the obligation is a claim about. Rule (d)
asks "did this phase author this member", which is a fact about the SPEC and is
member-granular. Rule (f) asks "does the phase diff change spawning code that
this witness claims to guard", which is a fact about the CODE, and the answer
does not depend on who wrote the member. The evidence that this is the intended
reading rather than a rationalisation is that rule (f) is not gated on
`phaseOwn` at all: it runs identically for STORED witnesses, which by
construction no phase owns (src/gates/red-witness.ts:387 passes an empty owned-member set
and rule (f) at :1231 sits outside that condition). A rule that fires on
witnesses nobody owns is not making an authorship claim.

So rule (d) is the only instance of this mechanism in the tree, and that
statement is scoped by section 4 below rather than offered as a universal.

## 3. The fix

Three edits, and the shape of them is that ownership becomes a SET OF MEMBER
INDICES rather than a boolean about a file.

1. `src/witness/spec.ts` gains `phaseOwnedMemberIndices(headMembers,
   baselineMembers)`, a pure function returning the indices the phase authored.
   A member is owned when no structurally identical member exists at the merge
   base. Matching is a MULTISET consume rather than a set-membership test, so a
   second copy of an existing member is owned, which matters because rule (g)
   is the rule that refuses that copy and it must still see it as new.
   Structural identity is `canonicalMember`, the kind's own fields in a fixed
   order, so reformatting a spec document is not readable as authorship.
   `parseWitnessSpec(body, label)` is split out of `loadWitnessSpec` so a spec
   can be materialised from a git object, which has no working-tree path.
   Definition at src/witness/spec.ts:283.
2. `src/witness/run.ts` replaces `phaseOwn: boolean` with
   `phaseOwnedMembers: ReadonlySet<number>`, and rule (d)'s loop skips any
   index not in it. Consumer at src/witness/run.ts:1291. `PhaseDiff` also gains
   `mergeBaseSha` (src/witness/run.ts:95), because the old side has to be read
   at the revision the `base...head` three-dot diff is actually taken against.
   Reading it at `baseSha` instead would reproduce standing warning 13's
   two-dot misreading: on a branch that has fallen behind, `baseSha` carries
   commits the branch never saw, and a member another phase changed on `main`
   would read as authored by this branch.
3. `src/gates/red-witness.ts` computes the set per own spec in `ownedMembersOf`
   at src/gates/red-witness.ts:295, and passes an EMPTY set for stored
   witnesses, which is the whole of "rule (d) does not apply to a spec this
   phase did not touch".

**The failure direction is chosen deliberately.** A baseline that is absent,
unreadable or invalid yields `undefined`, and every member is then owned. So an
added spec is wholly the phase's, and so is one whose previous version the gate
did not establish. The bad outcome of this derivation is a member wrongly
EXEMPTED, so the unestablished case keeps the obligation rather than dropping
it. **All three arms are measured.** The added-spec arm runs under every
existing rule (d) test (test/witness.test.ts:1554; `adderFixture` puts the spec
in the head files only). The unparseable-baseline and invalid-baseline arms were
unexercised when this section was first written and are forced in section 10,
ARMS B and C, against both the pre-change and post-change trees.

## 4. What my derivation did NOT cover

The reviewer's first check, per CLAUDE.md:362.

1. **It covers `src/` only for the second search.** `grep -rn "dangerousStates"
   src/` excludes `test/`, `scripts/`, `.github/` and `delivery/`. That is
   deliberate for the rules audit (rules (a) to (g) are all in
   `src/witness/run.ts`) and it means a granularity mismatch living in a script
   or a workflow would not appear. `scripts/` was not audited for this shape.
2. **It is an audit of ONE mechanism, not of rule (d) generally.** The two
   ingredients I tested for are "a fact derived at file granularity from the
   diff" and "an obligation applied at member granularity". A rule that is
   wrong for some other reason passes this audit unremarked.
3. **`memberTouchedFiles` was not audited as a source of the same mismatch.**
   It maps a member to files, which is the direction that would matter, but it
   is called from rule (d), rule (f) and the coverage computation, and I checked
   only its callers' granularity rather than its own resolution rules. One
   consequence of its behaviour did surface, in section 7 below, and it surfaced
   by execution rather than by this reading.
4. **Renames.** `computePhaseDiff` passes `--no-renames`
   (src/witness/run.ts:254), so a renamed spec appears as an add plus a delete
   and the added path has no merge-base version. When this section was first
   written that was read from the source; section 10 ARM A now MEASURES it on
   both trees and finds the behaviour unchanged.
5. **The fail-safe arms were designed and not exercised when this section was
   first written.** Section 10 closes that: the rename, invalid-baseline and
   unparseable-baseline arms are now forced against both trees, and the
   `git merge-base` fallback is measured to be unreachable.

## 5. The witness, both directions

Two behaviors, two specs, because the harness counts a repetition red only when
EVERY named test in the spec fails (src/witness/run.ts:908), so one spec naming
both directions was red on the member that reddens only one of them. That was
found by running the gate, not by reading, and it is recorded here because the
first version of this round did exactly that.

| behavior | spec | direction |
|---|---|---|
| `witness-rule-d-scoped-to-authored-members` | witness/witness-rule-d-scoped-to-authored-members.json:1 | an untouched sibling takes no obligation |
| `witness-rule-d-binds-an-added-member` | witness/witness-rule-d-binds-an-added-member.json:1 | an ADDED member still takes it |

### 5.1 The class: three structurally different untouched siblings

Rule (d) has three distinct arms and the fixture exercises all three, so a fix
that quieted one arm could not pass. The fixture's spec EXISTS AT THE BASE with
four members and the head edits exactly one, which is the shape the M3 exit test
hit. Fixture at test/witness.test.ts:1719.

### 5.2 RED, against the dangerous state rather than the absent feature

The dangerous state is the real pre-change code, not a defanged copy of it. A
detached worktree at this branch's head had its three source files restored to
their `d5d87f7` content, leaving the new tests and specs at head:

```
$ git checkout d5d87f7 -- src/witness/run.ts src/witness/spec.ts src/gates/red-witness.ts
$ git diff --stat HEAD
 src/gates/red-witness.ts |  48 +------------------
 src/witness/run.ts       | 100 ++++++++++++++--------------------------
 src/witness/spec.ts      | 117 ++++++++---------------------------------------
 3 files changed, 55 insertions(+), 210 deletions(-)
$ node --test --test-name-pattern '...' test/witness.test.ts
```

Node v26.6.0, bare `node --test` on one test file, no build needed for this
path. Exit 1. Both tests red, and the reason names all three arms separately:

```
x editing one member of a witness spec imposes rule (d) on that member only, not on the untouched siblings sharing its file (452.071673ms)
x a member this phase ADDED to an existing witness spec must still intersect the phase diff (306.769678ms)
i tests 2
i pass 0
i fail 2
i skipped 0

  AssertionError: 1 witness(es) evaluated (1 own, 0 stored re-evaluated in 0ms); witness combo-guard: red: rule (d): declared dangerous state does not intersect the phase diff (member 1, mutation of src/legacy.ts); rule (d): declared dangerous state does not intersect the phase diff (member 2, mutation of src/spare.ts touches no line inside a changed hunk); rule (d): declared dangerous state does not intersect the phase diff (member 3, patch patches/legacy-alt.patch)

  'red' !== 'green'
```

TRANSLITERATION DECLARED, per CLAUDE.md:144. Node's reporter prints U+2716 at the
head of a failing line and U+2139 at the head of a summary line. In every
captured `node --test` block in this document those two codepoints are rendered
`x` and `i`. Counts across the whole file: U+2716 replaced 6 times, U+2139
replaced 16 times. Nothing else in any captured output was altered.

### 5.3 GREEN, same command, same worktree, source at this branch's head

```
v editing one member of a witness spec imposes rule (d) on that member only, not on the untouched siblings sharing its file (2425.566313ms)
v a member this phase ADDED to an existing witness spec must still intersect the phase diff (331.240249ms)
i tests 2
i pass 2
i fail 0
i skipped 0
```

Exit 0. (`v` here is the same declared transliteration applied to U+2714, which
occurs 8 times in this document.)

### 5.4 The CONVERSE, which is the half a one-sided witness would lose

A fix that made rule (d) stop firing altogether would pass 5.2 and destroy the
property. Each declared dangerous state was applied by hand to a detached
worktree at this head, the two named tests run under `--test-reporter tap`, and
the file restored from a copy taken first (never `git checkout --`, warning 8).
`git status --porcelain` was empty after each restore.

| member | mutation | test 1 (siblings exempt) | test 2 (added member binds) |
|---|---|---|---|
| pristine | none | `ok` | `ok` |
| red-witness.ts producer | `phaseOwnedMembers: ownedMembersOf(entry),` -> a set of every index | `not ok` | `not ok` |
| spec.ts `if (baselineMembers === undefined) {` -> `if (true) {` | baseline never consulted | `not ok` | `not ok` |
| spec.ts `if (left > 0) {` -> `if (true) {` | nothing is ever owned | **`ok`** | **`not ok`** |

**The last row is the converse witness.** It is the fix that stops rule (d)
firing at all, it leaves test 1 GREEN, and test 2 is what catches it:

```
not ok 2 - a member this phase ADDED to an existing witness spec must still intersect the phase diff
  error: |-
    1 witness(es) evaluated (1 own, 0 stored re-evaluated in 0ms); every witness red against every declared dangerous state and green at head

    'green' !== 'red'
```

The pre-existing test at test/witness.test.ts:1554 covers the third case, a
wholly ADDED spec, whose members are all owned; it is green at this head.

## 6. Gates

Toolchain for everything below: node v26.6.0 from the scratch prefix,
`node --version` confirmed in the invoking shell. npm 11.18.0.

**Suite, the complete sentence.** Invocation `npm test`; toolchain node
v26.6.0; build state `dist/` present; reported tests 826, pass 826, fail 0,
**skipped 0**, todo 0, cancelled 0; exit 0. The base at `d5d87f7` reports 824
under the identical sentence (recorded by the M3 exit test at
delivery/plan/kernel-plan-m3.md:5213's stage E1.6), so this branch adds exactly
the two tests of section 5 and skips none.

`npm ci` exit 0, `npm run build` exit 0, `git status --porcelain` empty after
the build.

**Registry bundle**, `--mode full --phase witness-ownership-scoping
--base origin/main --head HEAD`. Reported: declared 16, applicable 10, verdict
10, green 10, red 0, not-applicable 6, error 0, vacuous 0. Exit 20, which is
`EXIT_NOT_APPLICABLE` (src/gates/result.ts:67) and is raised by the two REQUIRED
gates that are not applicable, not by any failing gate.

| gate | status | what it reported |
|---|---|---|
| manifest-self-check | green | 8 schema documents plus gates.manifest.json |
| coverage | green | 115 inventory ids |
| credential-scrub | green | 7 sources probed, none resolvable |
| credential-token | not-applicable | `TIPHYS_IMPLEMENTER_TOKEN` unset |
| suite | green | 826 tests, 45 files, pass 826, skipped 0, 753 behaviors resolve |
| citations | not-applicable | no changed path under the gated document trees |
| scope | not-applicable | branch does not match `^(?:claude/m[0-9]+-p[0-9]+-.*)$` |
| deploy | not-applicable | no release-verification.json (structural pre-merge) |
| migrations | not-applicable | no release-verification.json (structural pre-merge) |
| clause-map | green | 74 rows, 0 pending |
| red-witness | green | 6 witnesses (2 own, 4 stored re-evaluated in 14647ms) |
| agent-rules-drift | green | 3 preflight steps, 18 gates |
| brief-drift | green | 18 rows compared |
| check-agents-references | green | 21 references resolved |
| check-dual-review | not-applicable | no review verdicts present yet |
| license | green | 10 production packages |

Two rows need saying rather than leaving to be read.

**`scope` is not-applicable, and the dispatch brief predicted it.** The branch
is deliberately not a phase branch, so the gate has no declaration to audit and
asserts NOTHING about this change's file set. That is the weaker kind of
not-applicable, the same one the M3 exit test recorded as intervention I-3: the
diff it would have audited exists and is unexamined. The two clean-room reviews
are the control that replaces it.

**Without `--phase` the same bundle gives `scope: error: gate scope requires
--phase, which was not supplied`, exit 21.** Measured, both arms, same head.
The `pull_request` arm of CI supplies one (.github/workflows/gates.yml:233
derives it from `github.head_ref` with a sed that leaves a non-phase branch name
unchanged), so that arm takes the not-applicable result rather than the error.
The `push` arm supplies no `--phase` (.github/workflows/gates.yml:240) and
excludes `scope` with `--only` instead (scripts/m2-exit-test.sh:1328), which is
a different route to the same absence and NOT one I measured. So the true
statement is about the pull_request arm, which is the one this branch takes;
T-009's rule that a gate result is evidence only for the configuration it ran
under applies to this paragraph as much as to any other. Anyone re-running this
bundle by hand without `--phase` will see an error that is about the invocation
and not about the head.

**`citations` is not-applicable because `delivery/work-history/` is not on its
precondition list** (the list is `delivery/plan/`, `delivery/verification/`,
`delivery/decisions/`, `delivery/tuition/`, `delivery/requirements/` and
`delivery/STATE.md`). So this document was NOT linted by the citations gate.
That is worth knowing when reading CLAUDE.md:155, which reads as though every
new `delivery/` document is gated. Its citations are written to the `path:line`
form anyway.

## 7. THE BLOCKER, found here, reproduced on pristine main, and FIXED here

**The CI-equivalent run, `scripts/m2-exit-test.sh --bundle pr`, FAILS on this
branch with exit 1. Every gate row in it is green. What fails is its per-phase
green-path demonstration, and the cause is not this change.**

```
gates: declared 12 applicable 7 verdict 7 green 7 red 0 not-applicable 5 error 0 vacuous 0
gates: red-witness: green: 6 witness(es) evaluated (2 own, 4 stored re-evaluated in 14541ms); every witness red against every declared dangerous state and green at head
m2-assert (PR bundle): OK. 12 gate record(s) match section 1.4; ... zero red; zero error; zero vacuous.
m2-green: FAIL with 1 finding(s):
  - [red-witness] green-path demonstration is not a non-vacuous green: status red, units 6
m2-exit-test: FAILED: per-phase green-path evidence failed: a diff-scoped gate could not be shown green on a triggering state (exit 1)
```

The full detail from that run's `result.json`:

```
6 witness(es) evaluated (4 own, 2 stored re-evaluated in 1ms); witness witness-rule-d-binds-an-added-member no longer guards its behavior (named test(s) not found in any test file at the audited head: "a member this phase ADDED to an existing witness spec must still intersect the phase diff"); witness witness-rule-d-scoped-to-authored-members no longer guards its behavior (named test(s) not found in any test file at the audited head: "editing one member of a witness spec imposes rule (d) on that member only, not on the untouched siblings sharing its file")
```

### 7.1 The mechanism of the blocker, which is a DIFFERENT mechanism

`scripts/m2-exit-test.sh:1073` demonstrates `red-witness` green on a real
triggering diff by replaying the merged M2-P2 commit, `--base <sha>^ --head
<sha>`, **in the current working tree**. The gate lists its spec corpus by
walking the working tree's `witness/` directory
(src/gates/red-witness.ts:246) and judges everything else at the AUDITED HEAD.
So the demonstration composes TODAY's witness corpus with a head from M2. Any
spec added since M2-P2 whose members touch a file M2-P2 changed becomes a
triggered STORED witness at that head, and its named tests do not exist there.

The M2-P2 commit is `1b6f0963b62f60ddf183259adb5d3e34ebc9cbee`. It changed
`src/witness/run.ts`, `src/witness/spec.ts` and `src/gates/red-witness.ts`,
which are exactly the three files this change edits and therefore exactly the
files rule (d) requires this change's own witness members to intersect.

### 7.2 Four measurements that isolate it

All four run the same command as the script, `gates run --manifest
gates.manifest.json --only red-witness --base <M2P2>^ --head <M2P2> --phase
m2-p2`, differing only in the tree it runs in.

| # | tree | result |
|---|---|---|
| C0 | pristine `origin/main` at d5d87f7 | **green**, 4 units, 4 own, 0 stored |
| B | this branch's head, the two new witness specs moved aside | **green**, 4 units, 4 own, 0 stored |
| C1 | pristine `origin/main` plus ONE foreign spec mutating `src/witness/spec.ts`, named test PRESENT at the M2-P2 head | **green**, 5 units, 4 own, **1 stored** |
| C2 | the same foreign spec with only its `tests[]` changed to a name that POSTDATES M2-P2 | **red**, 5 units, `zz-control-probe no longer guards its behavior (named test(s) not found in any test file at the audited head)` |

C1 against C2 differ in one field and nothing else, so the discriminator is
established rather than guessed: **the named test's existence at the audited
head.** C0 and B together establish that neither `main` nor this change's source
edit is involved: B is this branch's full source change and it is green.

And the whole PR bundle, this branch's head with the two spec files moved aside:

```
m2-green: red-witness GREEN with 4 unit(s) against M2-P2 merged diff 1b6f0963b62f^..1b6f0963b62f (real history)
m2-green: OK. 3 diff-scoped gate(s) demonstrated green on a triggering state.
m2-exit-test: OK.
ISOLATED M2 PR BUNDLE EXIT=0
```

### 7.3 Why the existing later specs escape, which is an accident

`witness/witness-clone-resolves-dependencies.json` was added after M2-P2 and its
members touch `src/witness/run.ts`, so it should be caught by the same shape. It
is not, and the reason is that its members are `kind: "patch"`.
`memberTouchedFiles` resolves a patch member's files by reading the patch body
AT THE AUDITED HEAD (src/witness/spec.ts:382), and the patch file does not exist
at M2-P2, so it returns an empty list and the spec is never triggered. A
`mutation` member returns `[member.file]` unconditionally and has no such
escape.

**So expressing this round's dangerous states as patches would make the branch
pass, and I did not do that.** It would be choosing a member kind for a reason
unrelated to the witness's quality, it would leave the trap in place for whoever
comes next, and it is the "trade a false red for a blind guard" shape the
dispatch brief forbids.

### 7.4 The consequence, stated plainly

**No new witness spec with a `mutation` member can be added for any behavior of
the red-witness harness itself, because rule (d) requires its members to
intersect the change, the change is necessarily in M2-P2's files, and the
green-path demonstration then reddens.** The repository's red-witness rule
requires a witness for a new behavior; the repository's own exit test currently
refuses the only witness that rule admits here.

### 7.5 The escalation, and the orchestrator's refusal of it

I raised this under DR-0016 as two comparable options and asked. **The
orchestrator declined the escalation and gave its reasoning, which is recorded
here because it corrects my judgement rather than merely overriding it.**

The two options are NOT comparable, and the harness option is not merely
cheaper, it is more FAITHFUL. The demonstration replays M2-P2 as
`--base sha^ --head sha` while walking the present-day working tree for the
corpus. That configuration is MANUFACTURED BY THE DEMONSTRATION and no real run
produces it: in CI, and for any ordinary consumer, the working tree IS the head.
Making the demonstration read the corpus as of the audited head therefore does
not route around the defect; it makes the demonstration reproduce what that
phase's CI actually saw, which is the thing it claims to show.

That is the test DR-0016 states: an analysis yielding a recommendation the
decider would defend means the options were not comparable and there was nothing
to ask. My error was treating "two fixes exist in two different files" as
comparability, when one of them repairs a composition that was never real.

### 7.6 The fix to the demonstration, and its red-green witness

`scripts/m2-exit-test.sh:1073` now creates a detached worktree at the audited
sha and runs the gate there, so the spec corpus, the sources and the named tests
are all read at one revision. The worktree path is ABSOLUTE, because
`git -C <repo>` resolves relative paths against the REPOSITORY and not against
the calling process (CLAUDE.md:921, standing warning 9), and removal is in a
`finally` so a throw cannot leave a worktree registered against the caller's
clone. `git worktree prune` runs on both sides.

**This is on THIS branch and not a separate one.** DR-0031 point 2: the branch's
unit of self-contained value is the witness-ownership fix IN A MERGEABLE STATE,
and this change is what makes it mergeable. Splitting it into a second pull
request is exactly the pattern DR-0031 exists to stop, and it would also produce
the T-019 mirror the same rule names, a paperwork pull request asserting a green
CI-equivalent for code that had not landed.

It is `scripts/`, so one round and no full review contract, but the red-witness
rule still binds and **the C2 fixture of section 7.2 is the red witness.** It is
promoted from a diagnostic to a guard here, and widened to two structurally
different members, because one witness is not a class.

The two triggers, both foreign to this change, staged on a worktree at
`origin/main` (d5d87f7) so nothing about my source edit is involved:

| probe | mutates | named test |
|---|---|---|
| `zz-probe-a` | `src/witness/spec.ts` | "a nested test run does not inherit the suite gate reporter NODE_OPTIONS" |
| `zz-probe-b` | `src/gates/red-witness.ts` | "the scratch clone resolves a dependency that exists only in node_modules, and refuses outright when the audited repository has none" |

Different M2-P2 file, different post-M2-P2 test name. Both arms run the same
generated `m2-green.mjs` against the same tree with the same `--tiphys` build,
so the ONLY variable is the demonstration script.

**RED, the pre-fix demonstration**, exit 1, and both members of the class
redden rather than one:

```
m2-green: FAIL with 1 finding(s):
  - [red-witness] green-path demonstration is not a non-vacuous green: status red, units 6

6 witness(es) evaluated (4 own, 2 stored re-evaluated in 1ms); witness zz-probe-a no longer guards its behavior (named test(s) not found in any test file at the audited head: "a nested test run does not inherit the suite gate reporter NODE_OPTIONS"); witness zz-probe-b no longer guards its behavior (named test(s) not found in any test file at the audited head: "the scratch clone resolves a dependency that exists only in node_modules, and refuses outright when the audited repository has none")
```

**GREEN, the post-fix demonstration**, same tree, same probes, exit 0:

```
m2-green: red-witness GREEN with 4 unit(s) against M2-P2 merged diff 1b6f0963b62f^..1b6f0963b62f (real history), spec corpus read from a worktree checked out at 1b6f0963b62f
m2-green: OK. 3 diff-scoped gate(s) demonstrated green on a triggering state.

4 witness(es) evaluated (4 own, 0 stored re-evaluated in 0ms); every witness red against every declared dangerous state and green at head
```

Four own, zero stored, which is the point: at the M2-P2 head the corpus IS the
four specs M2-P2 added, and the probes are not in it. The probe tree was
untracked-only afterwards (`?? witness/zz-probe-a.json`, `?? witness/zz-probe-b.json`)
and no `red-witness-head-tree` worktree remained registered.

### 7.7 TRACKED FINDING, not acted on: the kernel-side reading

Recorded rather than discarded, so a later reader can reopen it on the merits.

**The finding.** `src/gates/red-witness.ts:246` builds the spec corpus by
walking `witness/` in the tree the gate is RUN FROM, while every other input,
the diff, the sources, the named tests, is read at the AUDITED HEAD. When those
two revisions differ, a spec present in the tree and absent from the head is
re-evaluated as a stored witness and reported "no longer guards its behavior".
A spec absent from the audited head is not part of that head's state, so that
sentence is a claim its evidence does not support. It is T-009's shape one scope
down: a result presented outside the configuration that produced it.

**Why it is TRACKED and not blocking, which is the orchestrator's reason and not
mine.** Under DR-0027 the question is reachability. It reaches a user only if
someone deliberately runs the gate with a head that differs from their working
tree. That is unusual rather than impossible, so it is a real finding and not a
non-finding, and it does not block.

**What a fix would look like, if it is reopened.** Skip re-evaluation of a
stored spec that does not exist at the audited head, with the skip RECORDED
rather than silent. It appears to cost nothing: a spec absent from the head
cannot be something the head is held to, and a spec DELETED by a branch is
already invisible because the listing walks the working tree. I did not build
that and I did not measure it, so both sentences in this paragraph are reasoning
from the source and not results.

**Not done here**, per the orchestrator's instruction: no shipped semantics in
`src/gates/red-witness.ts` or `src/witness/spec.ts` were changed for it.

### 7.8 The re-run at the fixed head

Both bundles, quoted, at the head this section produced.

`scripts/m2-exit-test.sh --no-build --bundle pr --base <origin/main> --head
<HEAD> --phase claude/witness-ownership-scoping`, **exit 0**:

```
gates: declared 12 applicable 7 verdict 7 green 7 red 0 not-applicable 5 error 0 vacuous 0
gates: red-witness: green: 6 witness(es) evaluated (2 own, 4 stored re-evaluated in 13957ms); every witness red against every declared dangerous state and green at head
m2-assert (PR bundle): OK. 12 gate record(s) match section 1.4; ... zero red; zero error; zero vacuous.
m2-green: red-witness GREEN with 4 unit(s) against M2-P2 merged diff 1b6f0963b62f^..1b6f0963b62f (real history), spec corpus read from a worktree checked out at 1b6f0963b62f
m2-green: OK. 3 diff-scoped gate(s) demonstrated green on a triggering state.
m2-exit-test: OK.
```

The registry full-mode bundle at the same head is the table in section 6, re-run
and unchanged.
## 8. The claim grep

Both forms, per CLAUDE.md:369 and the wrap-insensitive supplement.

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/witness-ownership-scoping.md
```

Every hit is listed below with what settles it. Nothing in this document claims
an arm cannot be forced.

Forty-two occurrences in the line-based form and forty-two in the
wrap-insensitive form, so ZERO were hidden by a wrap. Eleven are the grep
command's own pattern quoted just above, fourteen are inside this table and two
are the restatement note under it; all three groups QUOTE the phrases rather
than assert them. That leaves fifteen real occurrences on the thirteen rows below.

| line | phrase | what settles it |
|---|---|---|
| 24 | "never authored, never modified and never looked at" | the RED capture in 5.2, which names three untouched members reddening |
| 177 | "commits the branch never saw" | a restatement of standing warning 13, CLAUDE.md:1002; not a claim about this change |
| 301 | "never `git checkout --`" | a statement about what I did, and `git status --porcelain` was empty after each restore, captured in the 5.4 and 7.6 runs |
| 308 | "baseline never consulted" | the TAP row for that member in 5.4 |
| 312 | "what catches it" | the quoted `not ok 2` block immediately below it |
| 394 | "form anyway" | a statement about how this file is written, checkable by reading it |
| 467 | "the spec is never triggered" | measured: the branch's bundle reports `6 witness(es) evaluated (2 own, 4 stored)` and names the four stored ones, which do not include it |
| 504, 665 | "a composition that was never real" | the orchestrator's reasoning, and it is checkable: in CI the checkout and the audited head are one revision, and 7.2 measures that the manufactured composition is the only state that reddens |
| 580 | "unusual rather than impossible" | deliberately NOT a claim of impossibility; it is the reachability wording that makes the 7.7 finding tracked rather than dismissed |
| 586 | "cannot be something the head is held to" | **NOT settled by a command.** It is reasoning about a fix I did not build, and that paragraph says so in its own last sentence |
| 621 | "an arm cannot be forced" | quoting the rule at CLAUDE.md:378, not asserting anything |
| 731 | "control never reaches the fallback" | the ARM E capture above it: `git diff A...B` exits 128 before the assignment is reached |

An earlier run of this grep produced two restatements now visible in the
document: "cannot be established" became "the gate did not establish" at line
187, and "the CI workflow always supplies one" became a sentence scoped to the
`pull_request` arm. Neither line matches the pattern any more, which is the
mechanism working rather than the phrase being hidden.

## 9. What I could not establish

Collected in one place rather than left in the sections.

1. **That rule (d) is the only place in the repository with this mechanism.**
   Section 4 scopes the derivation: `src/` only for the rules audit, `scripts/`
   unaudited, and the audit tests for one specific two-ingredient shape.
2. ~~The rename case.~~ **CLOSED by measurement**, section 10 ARM A: red on
   both trees with the same reason string, so this change did not alter it.
3. ~~The unreadable and invalid merge-base arms.~~ **CLOSED by measurement**,
   section 10 ARMS B and C. The `git merge-base` fallback at
   src/witness/run.ts:250 is separately established as UNREACHABLE through
   `computePhaseDiff`, which is a finding rather than a closure.
4. ~~Whether the blocker in section 7 should be fixed kernel-side or
   harness-side.~~ **DECIDED by the orchestrator**, section 7.5: the harness
   fix, because the composition the demonstration made was never real. The
   kernel-side reading is recorded as a tracked finding at 7.7.
5. **Anything about the `push` arm of the gates workflow.** Every measurement in
   this document is a local `pull_request`-shaped run. T-009 binds: this document
   is evidence for that configuration and no other.
6. **Anything about macOS.** The macos-smoke job is genuinely CI-only.
7. **The post-merge `push` run on the new `main` head**, which cannot exist
   before the merge and which T-009 requires be watched to completion.

## 10. The arms the round designed and did not exercise, now forced

The orchestrator asked for two of section 9's open items to be closed by
measurement rather than left stated, on the ground that an unexercised
safe-by-design arm is exactly the shape this project has been bitten by. Both
are closed here; items 1, 5 and 6 stay open and are NOT given manufactured
coverage.

One probe drives all of them, and it runs against BOTH trees by importing each
tree's own gate, so the pre-change and post-change answers are produced by the
same fixtures and the same command. Node v26.6.0. The pre-change tree is a
detached worktree at d5d87f7; the post-change tree is this branch.

**ARM D is the control, and it is why the other rows are informative.** It is a
spec valid at the merge base whose two members BOTH pre-exist, so neither is
authored by the phase. If the probe could not see the change at all, ARM D would
read the same on both sides. It does not:

| arm | fixture | PRE-change | POST-change |
|---|---|---|---|
| A | spec file RENAMED, `old-name.json` to `new-name.json`, member 1 outside the diff | red, `member 1, mutation of src/legacy.ts` | **red, identical** |
| B | baseline spec present at the merge base but SCHEMA-INVALID there | red, same reason | **red, identical** |
| C | baseline spec present at the merge base but UNPARSEABLE (not JSON) | red, same reason | **red, identical** |
| D | control: baseline valid, both members pre-existing | red, same reason | **GREEN** |

So the probe demonstrably distinguishes the two trees, and A, B and C being
byte-identical across them is a result rather than a null reading.

**Item 2, the rename case, CLOSED and my change did not alter it.** Section 4
read from the source that `--no-renames` (src/witness/run.ts:254) makes the new
path an addition with no merge-base version, so every member is owned. ARM A
measures that, and measures the pre-change behaviour too: rule (d) reddened the
non-intersecting member on both sides, with the same reason string. The
pre-change route is "the spec file is in the diff, so the whole file is owned";
the post-change route is "`git show <mergeBase>:witness/new-name.json` fails, so
the baseline is undefined and every member is owned". Different reasoning,
identical observable behaviour.

**Item 3, the unreadable and invalid baseline arms, CLOSED.** ARMS B and C force
the two failure paths of `ownedMembersOf` (src/gates/red-witness.ts:295)
separately: B fails at `parseWitnessSpec` because the document is a valid JSON
object that is not a valid spec, C fails at the JSON parse. Both yield
`undefined` and both own every member, so both redden the non-intersecting
member exactly as the pre-change code did. The fail-safe direction is now
exercised rather than asserted.

**The `git merge-base` failure fallback is UNREACHABLE through the gate, and
that is a finding rather than a closure.** ARM E built one repository with two
orphan roots and asked git directly:

```
git merge-base A B      -> exit 1 (no output)
git diff --name-status --no-renames A...B
                        -> exit 128 (fatal: <A>...<B>: no merge base)
```

`computePhaseDiff` takes the same three-dot diff immediately after computing the
merge base, so it returns `ok: false` on the diff and control never reaches the
fallback assignment at src/witness/run.ts:250. I could not construct an input
that reaches it. The line stays, because removing it would leave
`"".trim()` becoming a sha-shaped empty string, which is a worse failure than an
unreachable line, and the comment at src/witness/run.ts:85 now records the
measurement so nobody later reads it as a tested path.

## 11. Fix round 1: the ownership PROJECTION omits load-bearing content

Both clean-room reviews returned FIX-ROUND-NEEDED on deea501. This section is
written as the round runs, not after it.

**THE MECHANISM, and it is one mechanism with several instances.** Ownership is
computed over a PROJECTION of the spec, and content that determines what the
spec asserts lives outside that projection. My claim in section 3 was "a member
a sibling edit dragged into the file's diff is not owned". The delivered
behaviour was "anything whose `dangerousStates` canonical form is unchanged is
not owned", and those are not the same sentence. The gap between them is where
both findings live.

Fixing the two named instances and leaving the projection unexamined is the
shape CLAUDE.md:333 records twelve times in thirteen re-reviewed fix rounds, so
section 11.1 derives the projection over the WHOLE schema before any code moves.

### 11.1 The derivation, part one: every field a witness spec can carry

Derived from `src/gates/schemas/witness-spec.schema.json` and the parser, not
from memory. **The schema sets `additionalProperties: false`, so this list is
COMPLETE rather than a sample**: eight fields, six of them required.

The column that matters is the third. Ownership gates exactly one thing, and
that is checkable rather than asserted:

```
$ grep -rn "phaseOwnedMembers" src/
src/gates/red-witness.ts:368:        phaseOwnedMembers: ownedMembersOf(entry),
src/gates/red-witness.ts:387:        phaseOwnedMembers: new Set<number>(),
src/witness/run.ts:126:  phaseOwnedMembers: ReadonlySet<number>;
src/witness/run.ts:1284:  // The scope is per MEMBER, never per spec file: `inputs.phaseOwnedMembers`
src/witness/run.ts:1291:    if (!inputs.phaseOwnedMembers.has(index)) {
```

Two producers, one field, one comment, ONE consumer, and that consumer is rule
(d). So a field is only a defect of this kind when it determines what rule (d)
is an obligation ON and ownership does not read it. Everything else is read in
full on every run, owned or not.

| field | what reads it | does it determine what rule (d) is about? | read by ownership? | verdict |
|---|---|---|---|---|
| `behavior` | rule (b), src/witness/run.ts:1194 | **YES.** Re-point a spec at a behavior this phase introduced and an older phase's dangerous state becomes this phase's evidence | was NO, **now YES** | **CR-002, FIXED** |
| `tests` | resolved and EXECUTED, src/witness/run.ts:1459 | **YES**, the same move spelled through the named tests | was NO, **now YES** | **CR-002, FIXED** |
| `dangerousStates` | rules (a), (d), (f), (g) and the execution loop | YES, it is the dangerous state itself | yes, through the canonical form, which part two corrects | **CR-001, FIXED** |
| `class` | rules (a) src/witness/run.ts:1201, (e) src/witness/run.ts:1221, (g) src/witness/run.ts:1331 | no. It selects which refusal rules apply. None is ownership-gated, so a class change is evaluated in full whether the spec is owned or not, and rule (e) DERIVES the class from the named tests' sources rather than trusting the declaration | no, deliberately | not an instance |
| `id` | duplicate detection, src/gates/red-witness.ts:263 | no. It is the handle; renaming a spec asserts nothing new | no, deliberately | not an instance |
| `deterministic` | the red threshold, src/witness/run.ts:1517 | no. It sets how many repetitions must be red, for every member of every evaluated spec regardless of ownership | no, deliberately | not an instance |
| `repeats` | the repetition count, src/witness/run.ts:1605 | no, same reason | no, deliberately | not an instance |
| `consumesExternalOutput` | rules (c) src/witness/run.ts:1230 and (f) src/witness/run.ts:1273 | no. Neither rule is ownership-gated | no, deliberately | not an instance |

**No third instance was found at the spec level.** That sentence is scoped by
11.3 rather than offered as a universal.

### 11.2 The derivation, part two: every member kind, and whether its canonical form covers it

`MEMBER_FIELDS_FOR_KIND` at src/witness/spec.ts:101 is the closed list, so this
table is complete too. The question per kind is whether everything that
determines the dangerous state is INSIDE the spec document.

| kind | fields | where the meaning lives | canonical form before | after |
|---|---|---|---|---|
| `mutation` | `file`, `find`, `replace` | ALL INLINE in the document | all three | unchanged, and it was already complete |
| `patch` | `patch` | **OUTSIDE.** The field is a PATH; the dangerous state is the patch FILE'S BODY | the path alone | the path **plus the body's sha256**, read separately at the merge base and at the head |
| `baseline-ref` | `ref` | **OUTSIDE.** A ref names a commit and a ref moves | the ref name alone | unchanged, deliberately, for the two reasons below |

**`baseline-ref` has the same POINTER shape as `patch` and is deliberately left
alone. The brief asked me to ask, so here is the answer with its evidence.**

First, it is moot. Rule (d) skips `baseline-ref` members outright before any
ownership question can matter:

```
    if (!inputs.phaseOwnedMembers.has(index)) {
      continue;
    }
    const member = spec.dangerousStates[index] as DangerousStateMember;
    if (member.kind === "baseline-ref") {
      continue;
    }
```

src/witness/run.ts:1291. Ownership has exactly one consumer and that consumer
discards this kind, so a baseline-ref member's ownership has no observable
effect anywhere today.

Second, and this is the part that would still hold if rule (d) stopped skipping
them: resolving the ref would make a ref that SOMEBODY ELSE moved read as this
phase's authorship. An authorship derivation that attributes another person's
push to the phase under audit is wrong in the direction that produces false
reds, which is the direction section 3 commits against. The right fix, if the
rule ever changes, is the patch one: fold the resolved TREE, not the ref name,
and treat an unresolvable ref as unestablished.

Measured, so nobody has to take the "moot" on trust: the corpus at this head
carries **zero** `baseline-ref` members.

```
$ grep -ho '"kind": "[a-z-]*"' witness/*.json | sort | uniq -c
    313 "kind": "mutation"
      7 "kind": "patch"
```

### 11.3 What this derivation did NOT cover

The reviewer's first check, per CLAUDE.md:362.

1. **It is a derivation over the SCHEMA, not over the parser's tolerance.**
   `parseWitnessSpec` materialises exactly the eight fields and the schema
   refuses everything else, so a ninth field cannot reach the ownership
   comparison. I did not test that by fuzzing the parser; I read the schema's
   `additionalProperties: false` and the field-by-field construction at
   src/witness/spec.ts:196.
2. **`tests` names are themselves pointers, and I did not follow them.** A test
   BODY can be rewritten while its name is unchanged, which changes what the
   named test asserts without changing the spec document. That is outside rule
   (d), which is about the dangerous state against the DIFF, and it is caught
   by execution rather than by any refusal rule, since the harness runs the
   named tests red and green. I did not build a probe for it.
3. **`consumesExternalOutput.captures` are pointers too**, and rule (c) reads
   their content. A capture's body can be rewritten while its path is unchanged,
   which is CR-001's exact shape one rule over. Rule (c) is not ownership-gated
   so it is outside this round's mechanism, but I am naming it because the
   shape is identical and nobody has audited it. **Not fixed, not measured.**
4. **The three arms of rule (d) itself.** I audited what OWNERSHIP reads. I did
   not re-audit whether rule (d)'s own file-level and hunk-level arms are
   correct, beyond adding the hunk-arm witness in 11.7.
5. **`scripts/` and `.github/`**, unchanged from section 4 item 1.
6. **Whether the projection mechanism recurs in a rule other than (d).** The
   `phaseOwnedMembers` grep bounds it for THIS ownership derivation. A different
   rule computing a different projection of the spec would not appear in it.

### 11.4 The fix, and the decision the brief asked me to justify rather than pick

`specClaim` (src/witness/spec.ts:340) is the new comparison, and
`canonicalMember` (src/witness/spec.ts:283) now takes a body reader and returns
`undefined` when the body cannot be read.

**THE CLAIM IS `behavior` AND `tests`, AND NOTHING ELSE. The test I applied to
every field of the closed schema:** does changing THIS FIELD ALONE let a phase
assert something new about its own diff while reusing a dangerous state somebody
else authored? `behavior` yes, `tests` yes, the other six no, with the reason
per field in 11.1. `class` and `id` were the two real candidates and both were
EXCLUDED: including them would buy false reds on class fix-ups and renames while
closing no attack, and neither is unread, since rules (a), (e) and (g) evaluate
`class` on every run and the duplicate check evaluates `id`.

**A claim change owns EVERY member, and the alternative was considered.** There
is no narrower attribution available: a claim is a property of the DOCUMENT, so
it cannot be pinned on one member. If the sentence "these tests guard this
behavior" is this phase's sentence, then every dangerous state offered under it
is this phase's evidence. The cost is real and is stated rather than hidden: a
phase that re-points a spec at a new behavior must make EVERY member of it
intersect its diff, which may mean splitting a spec rather than re-pointing one.
That is the intended pressure.

**`tests` is compared SORTED** (src/witness/spec.ts:341). Reordering the named
tests changes nothing about what is claimed, and treating a reorder as
authorship would be the same positional mistake the member matching already
avoids by comparing canonical forms rather than indices. The hazard review's
FA-2 is the member-level version of that arm and it passed; this keeps the two
consistent.

**Unreadable bodies keep the obligation, on BOTH sides.** A baseline member
whose body cannot be read contributes no entry to the multiset, so it cannot
exempt anything; a head member whose body cannot be read is owned outright. That
is the same conservative direction section 3 chose for an unreadable baseline
SPEC, now applied one level down to a member's body.

### 11.5 Not over-correcting, which the brief called the harder half

The naive fix is "any edit to the spec file owns every member", and that is the
original defect. Three guards, all of them tests rather than intentions:

1. **The round-1 converse witness still reddens.** `a member this phase ADDED to
   an existing witness spec must still intersect the phase diff` and `editing
   one member of a witness spec imposes rule (d) on that member only, not on the
   untouched siblings sharing its file` both pass at this head, and the sweep in
   11.7 shows M16, which is literally the over-correction (`if (true)` on the
   claim comparison, so every member is always owned), reddening the
   merge-base test. Verified rather than assumed, because the brief said that if
   it did not still redden, that would be a finding about my earlier round.
2. **Each new test carries its own negative arm.** The patch test asserts that a
   patch sibling whose body did NOT change stays unowned. The claim test asserts
   that bumping `repeats` authors nothing. Both would fail under a
   whole-file-owns-everything fix.
3. **The one whole-spec trigger is the claim and only the claim.** A sibling
   member edit, a `repeats` bump, a reformat and a rename all still author
   nothing.

### 11.6 The witness, both new classes, red and green

**RED against the DANGEROUS state**, which here is the real pre-fix code at
`deea501`. A detached worktree at deea501 with only `test/witness.test.ts`
replaced by this round's version, so the tests are new and the source is the
reviewed one. Node v26.6.0, bare `node --test` on one file, exit 1:

```
ok 1 - editing one member of a witness spec imposes rule (d) on that member only, not on the untouched siblings sharing its file
ok 2 - a member this phase ADDED to an existing witness spec must still intersect the phase diff
not ok 3 - rewriting a patch member's body is authorship even though its path is unchanged, and an untouched patch sibling stays unowned
not ok 4 - rewriting a witness spec's claim imposes rule (d) on every member, and changing a field that is not the claim imposes nothing
ok 5 - a member whose find or replace text changed is authored here, and a duplicated member is a new member
ok 6 - the ownership baseline is read at the merge base, so a spec another phase changed on the base branch is not authored here
ok 7 - a baseline spec that cannot be established owns every member, whether it fails to parse or fails to validate
```

**Rows 3 and 4 are CR-001 and CR-002 and they redden. Rows 1 and 2 are the
converse witness and they stay green, which is the over-correction guard passing
on the OLD code as well as the new.** Rows 5, 6 and 7 pass on the pre-fix code
too, and that is correct rather than a defect: they guard properties round 1
already had and CR-003 said were unwitnessed, so their dangerous state is a
CORRUPTION of that code, not its absence. That is the sweep in 11.7, and stating
it here is the difference between a witness and a coincidence.

**GREEN, same tests, this head**, `node --test test/witness.test.ts`, node
v26.6.0, `dist/` built: **50 tests, 50 pass, 0 fail, 0 SKIPPED, exit 0.**

**One witness is not a class, for each new class:**

- CR-001, "behaviour-determining content outside the canonical form": the patch
  test carries a body REWRITTEN in place (must be owned) and a sibling patch
  whose body is untouched (must stay unowned), and a separate test carries the
  both-sides-unreadable case. Three structurally different positions on the same
  class, and the derivation in 11.2 explains why `baseline-ref` is not a fourth.
- CR-002, "the claim changed and no obligation followed": two structurally
  different claim edits, `behavior` and `tests`, each asserted separately, plus
  the `repeats` negative arm.

Durable specs, six of them, at `witness/witness-ownership-*.json`, two
structurally different members each. The gate evaluates them:

```
gates: red-witness: green: 12 witness(es) evaluated (8 own, 4 stored re-evaluated in 15245ms); every witness red against every declared dangerous state and green at head
```

**One new behavior has NO durable spec and the reason is mechanical, not an
oversight.** `witness-rule-d-hunk-arm`'s dangerous state is the removal of rule
(d)'s hunk arm, which lives in `src/witness/run.ts`. That module matches
`SPAWN_GREP`, so any spec whose members touch it triggers rule (f)'s capture
obligation and would need a real captured external output. The behavior is
registered, the test exists, and its red and green are in the sweep table below.

**This round broke one of its own earlier witness specs, which is worth
recording because it is the coupling the M3 exit test hit.**
`witness-rule-d-scoped-to-authored-members` member 1 quoted
`if (baselineMembers === undefined) {` verbatim, and this round renamed that
parameter, so the gate reported `member 1, mutation of src/witness/spec.ts
touches no line inside a changed hunk`. Repairing the quotation makes that member
OWNED under this round's own rule, and its untouched sibling stays unowned. The
branch was exercised on itself and behaved as designed.

### 11.7 CR-003 closed: the corruption sweep now catches fifteen of sixteen

The hazard review's method, re-run against this head with its eleven rows plus
five new ones for the logic this round adds. One corruption at a time, applied
IN PLACE, `node --test test/witness.test.ts` run, then the ORIGINAL BYTES
written back from a copy taken first (never `git checkout --`, standing warning
8). Every row reports `clean=true` afterwards. The sweep is
`sweep.mjs` in the round's scratch directory and the raw output is
`fr1-sweep2.txt`.

| id | what it corrupts | round 1 | now |
|---|---|---|---|
| M1 | `phaseOwnedMemberIndices` returns the empty set | caught | caught, 7 failing |
| M2 | `ownedMembersOf` returns the empty set | caught | caught, 7 failing |
| M3 | set membership instead of the MULTISET consume | **SURVIVED** | **caught** |
| M4 | `canonicalMember` drops a mutation's `replace` | **SURVIVED** | **caught** |
| M5 | `canonicalMember` drops a mutation's `find` | **SURVIVED** | **caught** |
| M6 | `canonicalMember` keys a mutation on its FILE alone | **SURVIVED** | **caught** |
| M7 | absent baseline owns NOTHING (fail-open) | caught | caught, 2 failing |
| M8 | rule (d) loses its inside-a-changed-hunk arm | **SURVIVED**, and pre-existing | **caught** |
| M9 | the baseline is read at `baseSha` not `mergeBaseSha` | **SURVIVED** | **caught** |
| M10 | unreadable baseline passed as `[]` rather than `undefined` | **SURVIVED** | **SURVIVES, and cannot be caught** |
| M11 | an unparseable baseline owns nothing | **SURVIVED** | **caught** |
| M12 | `canonicalMember` drops the patch BODY (the CR-001 regression) | n/a | caught |
| M13 | the claim comparison is removed (the CR-002 regression) | n/a | caught |
| M14 | the claim covers `behavior` but not `tests` | n/a | caught |
| M15 | an unreadable patch body is read as unchanged (fail-open) | n/a | caught |
| M16 | the claim comparison always fires, so everything is owned | n/a | caught (the over-correction guard) |

**M10 IS AN EQUIVALENT MUTANT AND NO TEST CAN CATCH IT. Demonstrated rather than
argued**, because "we could not write a test" and "there is nothing to test" are
very different sentences and only one of them is acceptable here:

```
M10 equivalence probe
  baseline undefined      -> [0,1]
  baseline spec, [] members -> [0,1]
  identical: true
```

An empty baseline multiset matches nothing, so every head member is owned, which
is exactly what the `undefined` arm returns. The two forms are the same
function. Writing a test for M10 would mean writing a test that cannot fail,
which is the vacuous-guard shape this project refuses everywhere else.

**M8 is closed even though it was PRE-EXISTING and the reviewer correctly
classed it as not a finding against this branch.** It survived on the base tree
too, so no coverage regressed. It is closed here because this round is about
rule (d)'s scope and an unwitnessed arm of the rule under repair is the cheapest
thing in the file to leave broken. Measured both ways: before the new test, the
corruption left `50 pass, 0 fail`; after it, `not ok 42 - an owned member that
mutates a changed file OUTSIDE every changed hunk is red naming the hunk`.
Flagged as beyond the fix-round brief.

**Scope of the sweep, stated because a wrong scope reads as an absence of
defects.** It runs `node --test test/witness.test.ts` only, one file, not the
full suite. That is the same bound the hazard review declared. A corruption
caught here is caught; a corruption that survived here might still be caught by
another test file, and for M10 that question is moot for the reason above.

### 11.8 An unbriefed change, flagged so a reviewer can strike it

**`makeFixture` in `test/witness.test.ts` has always leaked its scratch
repositories, and this round makes the leak worse.** It became measurable
because the filesystem filled and killed a corruption sweep mid-run:

```
$ ls /tmp | wc -l
189180
$ ls /tmp | sed -E 's/[0-9A-Za-z]{6,}$/<RAND>/' | sort | uniq -c | sort -rn | head -3
  46163 tiphys-release-<RAND>
  28541 wfx-<RAND>
  21138 tiphys-suite-<RAND>
$ df -h /   ->  252G size, 20M available, 100% full
```

`wfx-` is this file's own prefix and 28,541 of the leaked directories are its.
Removing the recognisable test-fixture prefixes freed **18GB** and took the
entry count from 189,180 to 4,932. This round adds eleven more fixture
repositories per suite run, so inheriting the leak silently would have been
making it worse on purpose.

The change is five lines: `makeFixture` registers each directory and a single
`process.on("exit")` removes them. **Cleanup at EXIT rather than per test**,
because `assertCallerClean` reads the fixture repository after each gate run and
a per-test removal would have to be ordered against it; at exit there is nothing
left to order against, so it cannot change any assertion. Measured: `wfx-`
directories in `/tmp` after a full run of the file, 0, where the same run
previously left about twenty.

It is unbriefed. It is in `test/`, it is revertible in one commit, and the
prefixes other than `wfx-` are other test files leaking the same way, which is
NOT fixed here and is a finding rather than a fix.

### 11.9 Gates at the fix-round head

Toolchain node v26.6.0 from the scratch prefix, confirmed in the shell that ran
each command; npm 11.18.0. `origin/main` merged in locally first, per DR-0031.
`npm ci` exit 0, `npm run build` exit 0, `git status --porcelain` empty of
source drift after the build.

**Suite, the complete sentence.** Invocation `npm test`; toolchain node v26.6.0;
build state `dist/` present; reported tests **833, pass 833, fail 0, SKIPPED 0**,
todo 0, cancelled 0; exit 0. Round 1 of this branch reported 826, so the fix
round adds seven tests and skips none. The single-file invocation is quoted
separately because the invocation is a third axis (standing warning 12):
`node --test test/witness.test.ts` gives **50 tests, 50 pass, 0 SKIPPED**.

**Registry bundle**, `--mode full --phase witness-ownership-scoping --base
origin/main --head HEAD`: declared 16, applicable 10, verdict 10, **green 10,
red 0, not-applicable 6, error 0, vacuous 0**. Exit 20, which is
`EXIT_NOT_APPLICABLE` and is raised by the two REQUIRED gates that are not
applicable (`citations`, `scope`), not by any failing gate. Unchanged from
section 6 in every row except `suite` (826 to 833) and `red-witness` (6
witnesses to 12, 2 own to 8).

**The CI-equivalent, which is the one that was red before section 7.6 and is the
one to look at now.** `scripts/m2-exit-test.sh --no-build --bundle pr`, exit 0:

```
gates: declared 12 applicable 7 verdict 7 green 7 red 0 not-applicable 5 error 0 vacuous 0
gates: red-witness: green: 12 witness(es) evaluated (8 own, 4 stored re-evaluated in 16518ms); every witness red against every declared dangerous state and green at head
m2-assert (PR bundle): OK. 12 gate record(s) match section 1.4; ... zero red; zero error; zero vacuous.
m2-green: red-witness GREEN with 4 unit(s) against M2-P2 merged diff 1b6f0963b62f^..1b6f0963b62f (real history), spec corpus read from a worktree checked out at 1b6f0963b62f
m2-green: OK. 3 diff-scoped gate(s) demonstrated green on a triggering state.
m2-exit-test: OK.
```

No `red-witness-head-tree` worktree remained registered afterwards.

### 11.10 What fix round 1 could not establish

Carried forward and added to, rather than restated as closed.

1. **The three items in 11.3**, in particular that
   `consumesExternalOutput.captures` has CR-001's exact pointer shape one rule
   over, is unaudited, and is not fixed here.
2. **Rule (g)'s interaction with the patch-content gap**, which the criteria
   review raised as its own open item and I did not close. `canonicalMember` is
   now content-aware, but rule (g)'s own duplicate-refusal logic at
   src/witness/run.ts:1347 compares patch bodies with its own normalisation and
   was not re-derived against the change.
3. **The other leaked `/tmp` prefixes** in 11.8. Only `wfx-` is fixed; the other
   eleven prefixes belong to test files this round does not touch.
4. **CR-004 and the kernel-side stored-spec question**, both left TRACKED by
   instruction, not by my judgement.
5. **Everything section 9 still lists**: the `push` arm, macOS, and the
   post-merge push run.
6. **Whether a real phase branch could exploit CR-001 or CR-002 end to end.**
   Both reviewers forced them in synthetic fixtures and so did I; nobody built a
   whole pull request that lands.

### 11.11 The claim grep, re-run over the whole document

Both forms, per CLAUDE.md:369 and the wrap-insensitive supplement.
**Sixty-five occurrences line-based and sixty-five wrap-insensitive, so ZERO
were hidden by a wrap.** Eleven are the grep command's own pattern quoted in
section 8, fourteen are inside section 8's table and ten are inside the table
below; all three groups QUOTE phrases in order to settle them, which leaves
thirty real occurrences across the whole document. Section 8's line
numbers are unchanged, because fix round 1 only APPENDED to this document. The
new real occurrences are these:

| line | phrase | what settles it |
|---|---|---|
| 874, 902, 903 | "when the body cannot be read", "it cannot exempt anything" | the M15 row of the sweep table and the test named at 11.6, which forces the both-sides-unreadable case and requires the obligation to survive it |
| 887 | "it cannot be pinned on one member" | a property of the document, not a measurement: a claim is a document-level field, so there is no member to attribute it to. Stated as reasoning, and 11.4 says so |
| 917 | "everything is owned" | the M16 sweep row, which applies exactly that corruption and is caught |
| 942 | "a baseline spec that cannot be established" | a quoted TEST NAME inside captured output, not a claim |
| 990 | "catches fifteen of sixteen" | the sweep table immediately below it, row by row |
| 995 | "never `git checkout --`" | a statement about method; every sweep row reports `clean=true` and `git status --porcelain` on `src/` was empty after the sweep |
| 1011 | "SURVIVES, and cannot be caught" | **the strongest claim in this document**, and it is settled by the equivalence probe printed two paragraphs below it, which shows the two forms returning identical sets. It is a claim about equivalence, not about difficulty |
| 1017 | "always fires" | a description of the M16 mutation, quoted from the sweep source |
| 1052 | "has always leaked" | the `ls /tmp` count and prefix-histogram captures in 11.8 |
| 769, 1162 | "is covered", "cannot be established" | 769 quotes the derivation's own wording about fields covered by other rules, settled by the 11.1 table; 1162 is this table's own heading text |

The one to check hardest is line 1011, because "cannot be caught" is exactly the
shape CLAUDE.md:378 refuses when it is a guess. It is not a guess here: the
probe demonstrates the mutant is behaviourally identical, which is a different
statement from "I did not find a way to catch it". Had the probe shown any
difference, the row would have read "I did not find a test that distinguishes
them".
