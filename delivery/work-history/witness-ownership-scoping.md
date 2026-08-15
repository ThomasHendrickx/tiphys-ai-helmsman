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
