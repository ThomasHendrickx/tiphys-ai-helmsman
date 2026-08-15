# Work history: witness ownership is scoped per MEMBER, not per FILE

- date: 2026-08-15
- branch: `claude/witness-ownership-scoping`, cut from `origin/main` at d5d87f7
- not a plan phase: this is a harness defect fix in shipped `src/`, dispatched
  by the orchestrator after the M3 exit test's stage E1.6 hit it
- files this touches: `src/witness/run.ts`, `src/witness/spec.ts`,
  `src/gates/red-witness.ts`, `test/witness.test.ts`, `test/behaviors.json`,
  `witness/witness-ownership-is-per-member.json`, this file

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
that instance is what the fix-round contract in CLAUDE.md:379 exists to refuse.

The two halves of the mismatch, quoted from the tree at d5d87f7:

- ownership, file-granular, src/gates/red-witness.ts:277:

  ```
  const own = specs.filter((entry) => diff.files.has(entry.repoRelative));
  ```

  `entry.repoRelative` is the spec FILE path, so membership in `own` says
  nothing finer than "some byte of this file changed".

- the obligation, member-granular, src/witness/run.ts:1251:

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
src/witness/run.ts:1170:    for (let index = 0; index < spec.dangerousStates.length; index += 1)
src/witness/run.ts:1233:  for (const member of spec.dangerousStates) {
src/witness/run.ts:1252:    for (let index = 0; index < spec.dangerousStates.length; index += 1)
src/witness/run.ts:1293:    if (spec.dangerousStates.length < 2) {
src/witness/run.ts:1307:      for (let a = 0; a < spec.dangerousStates.length; a += 1) {
src/witness/run.ts:1347:  if (derivation.textAsserting && spec.dangerousStates.length >= 1) {
src/witness/run.ts:1358:    for (let index = 0; index < spec.dangerousStates.length; index += 1)
src/witness/run.ts:1465:  for (let index = 0; index < spec.dangerousStates.length; index += 1) {
```

(the four `for (let ... )` lines are truncated at the closing brace here only
to keep the table narrow; the full lines are in the tree at the cited numbers)

### 2.3 The audit of rules (c), (f) and (g), which the brief required

Every rule that reads `dangerousStates` was read against the two-ingredient
test above. The verdicts, one row per rule, with the reason rather than a bare
yes or no:

| rule | reads members? | reads the diff? | same mismatch? |
|---|---|---|---|
| (a) src/witness/run.ts:1170 | yes, per member | **no** | no: the check is `member.kind === "baseline-ref"` against `spec.class`, entirely spec-internal. With no diff input there is no file-granular fact to mis-scope. |
| (b) src/witness/run.ts:1162 | no | no | no: spec-level, one behavior id. |
| (c) src/witness/run.ts:1198 | no | no | no. This is the one worth stating carefully, because `consumesExternalOutput` is a SPEC-level field: the obligation and the fact are both spec-granular, so the granularities match. The mismatch requires a finer obligation than the fact, and here they are equal. |
| (d) src/witness/run.ts:1251 | yes, per member | yes, via `inputs.phaseOwn` | **YES. This is the defect.** |
| (e) src/witness/run.ts:1186 | no | no | no: derived from the named tests' sources against the manifest list. |
| (f) src/witness/run.ts:1231 | yes, unions all members | yes, via `inputs.spawningChangedFiles` | **no, and this is deliberate rather than lucky.** See below. |
| (g) src/witness/run.ts:1290 and :1347 | yes, pairwise and per member | no | no: structural distinctness and text preservation are computed from the spec and from head-state document text. No diff-derived input reaches either half. |

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
construction no phase owns (src/gates/red-witness.ts:344 sets `phaseOwn: false`
and rule (f) at :1231 sits outside that condition). A rule that fires on
witnesses nobody owns is not making an authorship claim.

So rule (d) is the only instance of this mechanism in the tree, and that
statement is scoped by section 4 below rather than offered as a universal.
