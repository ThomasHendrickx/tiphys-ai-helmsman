# Clean-room hazard review, M3-P1, head 3979557

Reviewer: hazard-lens clean room (independent from criteria-walking review).
Contract: where can this phase pass every criterion it declares and still be
broken. Findings numbered CR-M3P1-B-nnn.

Status: COMPLETE. Six findings (CR-M3P1-B-001 through CR-M3P1-B-006), each
constructed and run against the real code, reverted, and verified clean.
See "## Verdict" for the summary and severity counts.

## Setup log

- Worktree: /tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/wt-m3p1-cr-b
- Head: 3979557
- node --version: v26.6.0 (floor toolchain first on PATH, confirmed)
- Read T-003, T-006, T-007, T-008, T-009, CLAUDE.md, and the M3-P1 plan section
  (kernel-plan-m3.md, search `^### M3-P1:`) before touching the work history.
- `npm ci` exit 0, `npm run build` exit 0, `git status --porcelain` empty
  after build.
- Read `src/validate.ts`, `src/checks.ts`, `src/commands/validate.ts`,
  `src/status.ts`, `src/commands/status.ts`, `src/plan.ts`,
  `scripts/check-clause-map.mjs`, all four `schemas/*.json`, before reading
  the work history, per the hazard-reviewer contract (find it myself first).
- Read `delivery/work-history/m3-p1.md` last.

---

## CR-M3P1-B-001 (high): the plan projector's gloss-stripper silently
collapses a real, legitimate file path into a directory-wide scope grant
whenever the path contains a parenthesis

**Location**: `src/plan.ts`, `stripGloss` (lines 54-65), consumed by
`projectPhase` for both `files-to-touch` and `extras`.

**Mechanism, not the finding.** `stripGloss` treats the FIRST occurrence of
the ASCII character `(` anywhere in the string as the start of a
human-authored gloss and discards everything from there to the end:

```js
const parenthesis = text.indexOf("(");
if (parenthesis !== -1) {
  text = text.slice(0, parenthesis).trim();
}
```

The docstring says "Anything after the first TOP-LEVEL `(` is a gloss", which
implies some accounting for nesting or position; the implementation has none.
It cannot distinguish "a gloss that happens to start with `(`" from "a real
path that happens to contain `(`". Parenthesized directory names are not
exotic: Next.js "route groups" (`src/app/(marketing)/page.tsx`) are a
mainstream, current convention for exactly the kind of project this kernel is
built to orchestrate delivery for.

**Why this is dangerous rather than cosmetic.** The projector's output feeds
the M2-P4 scope auditor (`src/gates/scope.ts`), and the auditor treats a
trailing-slash entry as a DIRECTORY PREFIX, matching every file beneath it
tree-wide (`src/gates/scope.ts:477`,
`entry.endsWith("/") ? path.startsWith(entry) : path === entry`). A plan that
declares two specific files under a route-group directory is projected into a
declaration that grants the auditor's blessing to the ENTIRE containing
directory, silently, because the truncation lands on a slash.

**The defective-but-passing scenario.** A plan phase declares
`files-to-touch: ["src/app/(marketing)/page.tsx", "src/app/(marketing)/layout.tsx"]`,
two specific files. `tiphys plan project` emits a declaration the scope
auditor accepts (criterion 10 passes: the auditor runs against it and exits
0). Criterion 10c (the only test of gloss-stripping) passes too, because its
fixture is `` `src/cli.ts` (edit only if step 4 requires it) ``, a path with
NO embedded parenthesis, so the naive truncation happens to do the right
thing there. Every declared acceptance criterion for this phase is green.
What actually ships is a scope declaration of `src/app/`, a directory-wide
grant, in place of the two files the plan author actually named, the exact
silent widening M2-P4's scope audit exists to prevent, produced by the tool
that is supposed to keep the declaration and the plan from drifting.

**Evidence.**

```
$ node probe5.mjs   # see body below, run from repo root, reverted (new file, not committed)
"src/app/"
"src/app/"
"src/cli.ts"
{
  "ok": true,
  "declaration": {
    "id": "M9-P9",
    "branch": "claude/m9-p9-x",
    "filesToTouch": [
      "src/app/",
      "src/app/"
    ],
    "declaredExtras": [],
    "citations": []
  },
  "filename": "m9-p9.json"
}
```

probe5.mjs body:

```js
import { stripGloss, projectPhase } from "./src/plan.ts";
console.log(JSON.stringify(stripGloss("src/app/(marketing)/page.tsx")));
console.log(JSON.stringify(stripGloss("src/app/(marketing)/page.tsx (edit only if needed)")));
console.log(JSON.stringify(stripGloss("`src/cli.ts` (edit only if step 4 requires it)")));
const plan = { phases: [{ id: "M9-P9", branch: "claude/m9-p9-x",
  "files-to-touch": ["src/app/(marketing)/page.tsx", "src/app/(marketing)/layout.tsx"],
  extras: [], citations: [] }] };
console.log(JSON.stringify(projectPhase(plan, "M9-P9"), null, 2));
```

Confirmed the auditor's own prefix rule with:
```
$ grep -n "endsWith(\"/\")" src/gates/scope.ts
477:  return allowed.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));
```

`git status --porcelain` was empty before and after (`probe5.mjs` is an
untracked scratch file in this reviewer's worktree, not part of the diff
under review, and is removed before this report is finalized).

**Recommendation.** `stripGloss` must only strip a gloss that begins after a
recognizable end-of-path boundary (e.g. the closing backtick, or whitespace
following a backtick-quoted path), never the first raw `(` in unquoted text.
At minimum, require the plan's `files-to-touch` authoring convention to
backtick-quote every path (already done in every real example in this repo)
and change `stripGloss` to strip only text after a closing backtick, falling
back to "no gloss" rather than "everything after the first paren" when the
entry is not backtick-quoted. Add a criterion-10c member using a path that
itself contains a parenthesis, so this class has a red witness.

---

## CR-M3P1-B-002 (high): Ajv's own wording reaches the public diagnostic
contract through the schema-compilation-failure path, which the suite never
checks for leak-freedom

**Location**: `src/validate.ts`, `compileSchema` / `singleLineReason` /
`DIAGNOSTIC_MESSAGES.uncompilable`.

**Mechanism, not the finding.** `compileSchema` wraps `makeAjv().compile()`
in a try/catch and on failure returns `singleLineReason(error)`, which is
`error.message` from the THROWN AJV EXCEPTION, whitespace-collapsed but
otherwise verbatim. That string is then rendered through
`DIAGNOSTIC_MESSAGES.uncompilable`, `` `schema could not be compiled: ${reason}` ``,
and printed on stdout by `cmdValidate`. Nothing in this path rewrites Ajv's
own sentence into Tiphys-authored wording; the leak-prevention machinery
(`MESSAGE_BY_KEYWORD`, `renderAjvError`, the `untranslated` fallback) exists
only for the RUNTIME VALIDATION path (`validateInstance`'s per-error loop),
never for the COMPILE-TIME failure path. DR-0013 clause 5 states "Ajv is an
internal implementation detail... its wording is never a public contract"
without carving out an exception for compile failures, and criterion 8
requires "no Ajv-authored wording reaches either stream" with the same
scope.

**This is not a corner case within this phase's own compile-failure
surface**: criteria 4 (unknown keyword fails compilation), 5 (invalid schema
fails meta-schema validation), and 7's unresolved/remote-$ref arms ALL route
through this exact same `uncompilable` path. Every one of them is a place
DR-0013 explicitly asks for Tiphys-owned wording and none of them get it.

**The defective-but-passing scenario.** `test/validate.test.ts`'s own
criterion-8 test declares an `AJV_WORDING` negative list ("Ajv's own
sentences, taken from the library's error output... If any of these reaches a
Tiphys stream, Ajv's wording has become a public contract") and asserts that
list's absence, but only against output from the RUNTIME VALIDATION path (a
`spawnSync` run against a decision-record fixture). The criterion 4 and
criterion 5 tests, which exercise the COMPILE-failure path, assert the
OPPOSITE: they regex-match the raw Ajv exception text as proof the right
keyword was named (`assert.match(reason, /mustBeShouty/)`,
`assert.match(reason, /schema is invalid/)`). No test anywhere asserts that
the compile-failure diagnostic is FREE of Ajv's own sentences. A future
schema in this phase, or any of the next nine M3 phases that reuses this
exact validator module, ships with a typo'd keyword; its "unknown keyword
fails compilation, naming the keyword" acceptance criterion is satisfied
(the keyword name IS in the message) while Ajv's own surrounding sentence
rides along for free, undetected, forever, because the test that would catch
it checks the wrong code path.

**Evidence**, run against this phase's own shipped `schemas/plan.schema.json`
through the real CLI, reverted (`git status --porcelain` clean before and
after; file restored from a saved copy, `git diff schemas/plan.schema.json`
empty):

```
$ cp schemas/plan.schema.json /tmp/plan.schema.json.bak
$ python3 -c "
import json
with open('schemas/plan.schema.json') as f: s = json.load(f)
s['mustBeShouty'] = True
with open('schemas/plan.schema.json','w') as f: json.dump(s, f, indent=2)
"
$ node bin/tiphys.ts validate --type plan templates/plan.example.yaml
INVALID # schema could not be compiled: strict mode: unknown keyword: "mustBeShouty"
$ echo $?
1
$ cp /tmp/plan.schema.json.bak schemas/plan.schema.json
$ git diff --stat schemas/plan.schema.json
(empty)
```

`"strict mode: unknown keyword:"` is Ajv's own internal phrasing (produced by
Ajv's strict-mode reporter, not by any string literal in `src/validate.ts`).

A second, independent member, invoked directly at the module level (no CLI
edit needed, so no revert required) to show the same path leaks Ajv's
META-SCHEMA validation text too, and that this text is LITERALLY one of the
phrases `test/validate.test.ts`'s own `AJV_WORDING` list treats as forbidden:

```
$ cat probe3.mjs
import { compileSchema } from "./src/validate.ts";
console.log(JSON.stringify(compileSchema({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  type: "nonsense"
})));
$ node probe3.mjs
{"ok":false,"reason":"schema is invalid: data/type must be equal to one of the allowed values, data/type must be array, data/type must match a schema in anyOf"}
```

Compare to `test/validate.test.ts`'s own list of forbidden Ajv sentences:
`"must be equal to one of the allowed values"`, `"must match a schema in anyOf"`
,  both present verbatim in the string above, and this exact string is what
`tiphys validate` would print to stdout for any future Tiphys schema that
fails meta-schema validation, unguarded by any test.

A related, weaker-but-real instance already surfaced and was captured (not by
me) inside this phase's own work history, section 1.9: a Node
`ERR_MODULE_NOT_FOUND` exception's raw text
(`"Cannot find module 'ajv/dist/2020.js'"`) reached the same `uncompilable`
diagnostic in a real relocated-tree test run. That instance is a different
underlying exception but the same mechanism: `uncompilable` treats whatever
`error.message` it is handed as fit to print, with no boundary.

**Recommendation.** Give `compileSchema`'s failure path the same treatment
`renderAjvError` gives the validation path: classify the THROWN error by a
small set of recognized Ajv exception shapes (unknown/misused keyword,
invalid schema, unresolved/remote `$ref`) and render each as Tiphys-owned
wording naming only the extracted keyword/pointer, falling back to a generic
"internal defect: schema failed to compile" (never the raw message) for
anything unrecognized. Add a member to the `AJV_WORDING`-style negative
assertion that runs it against the COMPILE-failure path specifically (a
schema with an unknown keyword, and a schema failing meta-schema
validation), through the real CLI, both streams.

---

## CR-M3P1-B-003 (medium): duplicate `acceptance[].id` values let
`hazard-classes[].addressed-by: "criterion N"` resolve to a decoy, defeating
the T-007 completeness guarantee this exact field was built for

**Location**: `schemas/plan.schema.json` (`$defs/phase/properties/acceptance`,
no uniqueness constraint on `.id` across the array),
`src/checks.ts` `planHazardClassesAddressedByResolves` (builds a `Set` of
criterion ids, so membership is checked, not uniqueness or the specific
criterion object).

**Mechanism.** `addressed-by: "criterion 2"` is considered resolved when ANY
acceptance-array entry in the same phase has `id: "2"`. The schema does not
require `acceptance[].id` to be unique (no `uniqueItems`, no pattern
distinguishing them), and the derived check collapses all ids into a `Set`
before testing membership, so it cannot tell "the one true criterion 2" from
"any of several entries that happen to be numbered 2."

**The defective-but-passing scenario.** A phase section is edited (copy-paste
or a later editing pass that renumbers criteria and misses one) so that TWO
acceptance entries both carry `id: "2"`, one the real, implemented,
red-witnessed criterion; the other unrelated prose that nothing checks. A
hazard class's `addressed-by: "criterion 2"` is written intending to point at
the decoy, or the real one is later deleted and only the decoy with the same
id survives. `tiphys validate` and the `plan-hazard-classes-addressed-by-resolves`
check both report green: the id "2" resolves, full stop. This is exactly the
shape T-007 and D-M3-32/D-M3-35 exist to prevent one level up (a hazard class
documented as addressed while nothing actually reachable addresses it), now
reproduced inside the very mechanism built to prevent it.

**Evidence**, constructed and run against the real CLI, no repository files
touched (fixture written to a scratch tmp directory):

```
$ cat probe4.mjs
... (loads templates/plan.example.yaml, appends a SECOND acceptance entry
     with id "2" and prose "UNRELATED: this criterion was never implemented
     or checked by anything; it is a decoy sharing the id of a real one.",
     appends a hazard-classes entry {id: H3, addressed-by: "criterion 2"},
     writes to a scratch file, runs `bin/tiphys.ts validate --type plan`)
$ node probe4.mjs
status 0
stdout:
dispatchable: false
not dispatchable because these phases carry an unfilled fill-in: M9-P1
stderr:
```

Exit 0. No diagnostic names the collision. The plan validates and the
completeness check reports green with a hazard class whose stated remedy is
ambiguous between a real criterion and a criterion that does nothing.

**Recommendation.** Add a Kind A `uniqueItems`-equivalent (JSON Schema's
`uniqueItems` compares whole objects, not one field, so this needs either a
derived check or restructuring `acceptance` as an object keyed by id) or, at
minimum, extend `plan-hazard-classes-addressed-by-resolves` to ALSO flag a
duplicate `acceptance[].id` within a phase as its own violation, independent
of whether any `addressed-by` currently references it, the underlying
integrity problem (two criteria, one id) exists whether or not a hazard class
happens to point at it yet.

---

## CR-M3P1-B-004 (low): `schemas/README.md`-adjacent provenance record is
internally self-contradictory about `uniqueItems`

**Location**: `test/fixtures/json-schema-test-suite/PROVENANCE.md`.

**What.** The "What was copied" list omits `uniqueItems` from the thirteen
keywords it names, and the "What was NOT copied, and why" list explicitly
places `uniqueItems` in the excluded set ("Every keyword file outside the
declared vocabulary (maxLength, **uniqueItems**, dependentRequired,
format,...)"). But `uniqueItems` IS in `AUTHORING_VOCABULARY`
(`src/validate.ts`), `uniqueItems.json` IS physically vendored
(`test/fixtures/json-schema-test-suite/uniqueItems.json` exists), and it IS
exercised by both schema-suite tests (the second of which,
`every keyword in the declared vocabulary has vendored suite coverage`,
would fail if the file were absent). The prose record of what this phase did
does not match what it actually did, in the specific direction T-006 warns
about (a claim about the world, here "this keyword was excluded", stated
without having been checked against the artifact the claim is about).

**Evidence.**
```
$ ls test/fixtures/json-schema-test-suite/ | grep uniqueItems
uniqueItems.json
$ grep -n "uniqueItems" src/validate.ts
  "uniqueItems",
$ grep -n "uniqueItems" test/fixtures/json-schema-test-suite/PROVENANCE.md
- Every keyword file outside the declared vocabulary (maxLength, uniqueItems,
```

**Why this matters at low rather than higher severity**: it is purely a
documentation inconsistency. The suite file is present and used; nothing
functional is skipped. It is reported because a provenance record whose own
prose is wrong about what it did is precisely the artifact class this
project's tuition warns readers not to trust unchecked, and a later phase
author skimming this file to decide whether `uniqueItems` needs suite
coverage would be told the opposite of the truth.

**Recommendation.** Correct the two lists in `PROVENANCE.md`.

---

## CR-M3P1-B-005 (low): `check-clause-map.mjs --evidence <dir>` is accepted,
documented in `usage()`, and never used

**Location**: `scripts/check-clause-map.mjs`, `parseArgs` /  `main`.

**What.** `--evidence <dir>` is a recognized flag (rejecting anything else
with "unknown option"), stored into `options.evidence`, and printed in
`usage()`. It is never read again; `emit()` always constructs its
`GateResult` with `evidence: []` regardless of what `--evidence` was given.
An operator who passes `--evidence <dir>` expecting the gate's evidence
directory convention (the way every other kernel gate subprocess in this
repository accepts one) gets silent no-op behavior rather than a usage error
or real effect.

**Evidence.**
```
$ grep -n "evidence" scripts/check-clause-map.mjs
103:    "[--map <path>] [--result <path>] [--evidence <dir>]"
112:    evidence: undefined,
117:    if (!["--inventory", "--map", "--result", "--evidence"].includes(flag)) {
214:    evidence: [],
```
No other occurrence. `options.evidence` is written once and never read.

**Recommendation.** Either wire `--evidence` to write the check's stdout
narrative into that directory (matching the convention `evidence: []` is
otherwise silently declining), or remove the flag from `usage()` and
`parseArgs` until it does something, so the interface does not promise a
capability the implementation does not have.

---

## CR-M3P1-B-006 (high, CONFIRMED with a real end-to-end run): the M2
exit-test harness's PR-bundle expectation table has no entry for the new
`clause-map` gate, so a RED clause-map does not fail the harness

**Location**: `scripts/m2-exit-test.sh`, `PR_EXPECT_JSON` and
`MAIN_EXPECT_JSON` (around line 826 onward).

**Mechanism.** `run_pr_bundle` invokes `gates run` with the FULL manifest (no
`--only` filter), so `clause-map` (added to `gates.manifest.json` by this
phase, `applicability: "required"`) genuinely executes and produces a row in
`summary.json`. But `m2-assert.mjs` (the inline script at `ASSERT_EOF`) only
evaluates a gate against `PR_EXPECT_JSON.gates[]`, and `clause-map` is not in
that list. Its per-gate assertions (presence, required-implies-green,
green-implies-units>0) therefore never run for `clause-map`. The two blanket
checks that DO run over every row regardless of the expect list only catch
`status === "error"` or `vacuous === true` (clauses 5 and 6 in the assertion
script), neither is true of an ordinary RED clause-map (a genuinely detected
missing row, invented row, or dangling artifact/clause reference), which is
exactly the status this check exists to produce when it is doing its job.
`run_pr_bundle` also explicitly ignores `gates run`'s own process exit code
("The runner exit code is recorded but does NOT decide the outcome: the
assertion code below is what evaluates the bundle"), so nothing else in the
harness catches it either.

`run_main_bundle`'s `--only` list (`manifest-self-check`, `suite`, `coverage`,
`credential-scrub`, `deploy`, `migrations`) also omits `clause-map`, so on a
push to `main` the check does not even run, and `clause-map` is absent from
`MAIN_EXPECT_JSON`'s `absent[]` list too, so nothing asserts that either.
Neither of the harness's two event arms gives `clause-map` a real verdict.

**The defective-but-passing scenario**: this phase's own criterion 9 fixture
(delete one row from `delivery/requirements/clause-map.json`) is exactly the
state I used above to prove `check-clause-map.mjs` itself correctly reports
red. That red row would ride inside a `gates run --manifest ... --phase
m3-p1` invocation done by the CI-equivalent PR bundle, appear in
`summary.json` as `{"id":"clause-map","status":"red",...}`, and
`m2-assert.mjs` would still print `OK` and exit 0, because nothing in its
table names `clause-map`. **A phase whose clause-map row set is broken can
still pass the CI job the repository's branch protection requires**, which is
the exact orphan-row hazard section 2.2 exists to close, defeated one layer
up at the harness that is supposed to enforce every required gate.

**Evidence, static.**
```
$ grep -n "clause-map" scripts/m2-exit-test.sh
(no output, the string does not occur anywhere in the harness)
```

**Evidence, a real end-to-end run of the actual PR-bundle harness**, with
`R-011` deleted from `delivery/requirements/clause-map.json` (the same
fixture already shown above to make `check-clause-map.mjs` alone report red
and exit 1):

```
$ scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase m3-p1 <evidence-dir>
...
gates: run 604ec821bc747295d6dc1d2e
gates: declared 11 applicable 6 verdict 6 green 3 red 3 not-applicable 5 error 0 vacuous 0
gates: 3 gate(s) reported red: suite, clause-map, red-witness
m2-assert (PR bundle): FAIL with 4 finding(s):
  - [red-witness] expected status green or not-applicable, observed red (...)
  - [suite] expected status green, observed red (...)
  - [suite] is a REQUIRED gate but its status is red, not green
  - [scope] expected status green, observed not-applicable (...)
m2-exit-test: FAILED: the PR bundle does not match section 1.4's PR-bundle column (assertion exit 1)
```

The `summary.json` row for the gate itself, read directly from the produced
evidence:

```json
{
  "id": "clause-map",
  "status": "red",
  "units": 11,
  "unitLabel": "clause-map rows checked",
  "vacuous": false,
  "applicable": true,
  "detail": "R-011 is owned by M3-P1, which is in force, and has no clause-map entry"
}
```

`clause-map` is one of the three gates `gates run` itself reports red
(`gates: 3 gate(s) reported red: suite, clause-map, red-witness`), yet it is
ABSENT from all four of `m2-assert.mjs`'s FAIL findings. Compare with
`suite`, the other gate that is genuinely red in this run: it appears in the
findings TWICE (once per named unresolved behavior, once for "is a REQUIRED
gate but its status is red, not green"), because `suite` IS listed in
`PR_EXPECT_JSON`. `clause-map` is not, and gets no such line: it is silently
absorbed. **This run happens to fail overall for reasons unrelated to
clause-map** (this reviewer's worktree is a detached-HEAD copy rather than a
real `claude/m3-p1-...` checkout, which is what makes `scope` report
not-applicable and is the most likely cause of `suite`'s and `red-witness`'s
unrelated failures here, a real PR run on the actual phase branch would not
carry that artifact). That is exactly why this evidence is clean: it proves
the ABSENCE mechanism (clause-map's red status generates no finding) on a run
where OTHER gates' red statuses correctly DO generate findings, in the same
`summary.json`, evaluated by the same assertion pass. On a real PR run where
`suite`, `scope` and `red-witness` are all green (the normal case) and only
`clause-map` is red, `m2-assert.mjs` would print `OK` and exit 0, and the
GitHub-required `gates` job would go green.

`delivery/requirements/clause-map.json` restored from the saved copy
immediately after capturing this evidence; confirmed:
```
$ git status --porcelain -- delivery/requirements/clause-map.json
(empty)
```
Full worktree `git status --porcelain` is otherwise unchanged from this
report's own untracked scratch files (this report itself; the `probe*.mjs`
scripts used above have since been deleted).

**Recommendation.** Add `clause-map` to `PR_EXPECT_JSON` in
`scripts/m2-exit-test.sh` with `expect: "green"`, `required: true`, and
either add it to `MAIN_EXPECT_JSON.gates[]` too or, if it is meant to be
diff-scoped-equivalent and skipped on push, add it to `MAIN_EXPECT_JSON.absent[]`
so its absence there is asserted rather than merely unnoticed. Since this
file is outside M3-P1's declared `files-to-touch` and the plan did not ask
this phase to touch it, this may be a plan-level gap rather than an
implementation one, either way, the state that ships if this phase merges
unchanged is a required completeness gate whose failures do not fail CI, and
it should not wait for a hazard reviewer in a future phase to notice by
accident.

---

## Verdict

**CHANGES REQUIRED.**

- High: 3 (CR-M3P1-B-001, CR-M3P1-B-002, CR-M3P1-B-006)
- Medium: 1 (CR-M3P1-B-003)
- Low: 2 (CR-M3P1-B-004, CR-M3P1-B-005)

None of these six findings is visible to a review that walks only the
phase's own declared acceptance criteria: three of the four schemas'
mutation probes were rejected correctly (the schemas themselves are tight),
and every stated criterion in the M3-P1 plan section that I checked against
a live run passed as claimed. All six findings live in the gap the plan's
own hazard-class paragraph names: a mechanism that satisfies every criterion
describing INTENDED behavior while remaining exploitable through a path the
criteria do not describe. CR-M3P1-B-001 and CR-M3P1-B-006 are both
"a criterion is satisfied by the letter while the property behind it is
false" (the diagnostic looks Tiphys-authored because it contains the
expected substring; the CI job looks green because the checked gates are
green): the same shape CLAUDE.md's fix-round contract names as "the fix
addressed the instance the reviewer named, when the defect was the
mechanism," reproduced here as a first-build shape rather than a fix-round
one. CR-M3P1-B-002 is T-007's own lesson (a completeness field can be
satisfied without being true) reproduced one level inside the very
mechanism M3-P1 built to prevent it.

None of the six required breaking anything that stayed broken: every
mutation to a tracked file (`schemas/plan.schema.json`,
`delivery/requirements/clause-map.json`) was restored and confirmed by
`git status --porcelain`/`git diff --stat` being empty before moving on.

---

## Attacks I ran that found nothing

- Plausible-but-wrong instances of all four schemas (17 mutations: wrong
  types that could coerce, missing nested required fields, empty arrays
  where `minItems` should bite, extra properties at 1, 2 and 3 levels of
  nesting), 16 of 17 correctly rejected with the right pointer. The schemas
  are not permissive; the one gap found is CR-M3P1-B-003, a cross-field
  uniqueness property no single-document schema keyword can express, not a
  missing keyword.
- Full `additionalProperties: false` audit, every object level in all four
  schemas (22 levels total), none omitted. The two `if`/`then` sub-schemas
  that do not set it are correctly unclosed by design (they layer a
  conjunctive constraint on an already-closed object) and I confirmed this
  is not a hidden opening rather than assuming it from the comment.
- Ajv mutation/coercion policy (`coerceTypes`, `useDefaults`,
  `removeAdditional`), confirmed off, and confirmed no observable mutation
  across the shipped test cases plus my own duplicate-id and type-coercion
  probes, via `structuredClone` before/after comparison.
- Local `$ref` resolution, unresolved `$ref`, and remote `$ref`, all three
  behave as DR-0013 requires (local resolves, the other two fail closed with
  no network reachable at all, since there is no `loadSchema`).
- Derived-check reachability, `checksFor("plan")` correctly returns all
  three registered plan checks by exact type-string match; none is
  registered under a type string that has no `TYPE_TABLE` entry (which would
  make it permanently unreachable through the CLI).
- The `plan-verification-first-present` and `plan-dispatchable` checks, both
  directions (deregister/re-register), behave exactly as their own tests
  claim; I did not find a way to make either pass vacuously.
- Named-pipe refusal (D-M3-27) for both the file argument and `--context`,
  both directions (FIFO refused, regular file/directory at the same path
  accepted), reproduced independently, bounded time, no block.
- Vacuous-green protection on the clause-map gate (`makeGateResult`'s
  M2-C-2 rewrite), holds even when the inventory parses to zero rows
  (simulated with a non-table markdown file), forcing `error`/`vacuous`
  rather than a false `green`.
- YAML decode vs. schema-validation staging, and the no-stack-trace
  guarantee for both a syntactically broken file and a validly-parsed
  non-mapping document, both hold, through the real CLI, both streams.
- Attempted to make `--evidence` on `check-clause-map.mjs` do something
  dangerous (path traversal, write outside its directory), it does
  nothing at all (CR-M3P1-B-005, low, not a hazard).

---

## What I did NOT cover

- **`test/schema-suite.test.ts` internals beyond reading them**: I read the
  suite-skip logic and the provenance file (finding CR-M3P1-B-004 there) but
  did not independently re-run the vendored JSON Schema Test Suite cases
  against a hand-modified engine to confirm the 200-case count and the
  skip reasons are individually accurate; I trusted the printed skip list's
  shape after reading the skip-selection code, not by re-deriving all 93
  skips by hand.
- **`src/gates/manifest.ts` and `src/gates/run.ts` beyond the specific
  `applicability`/`exitCodeForStatus` reading needed for CR-M3P1-B-006**: I
  did not audit the full gate-runner module for other event-conditional or
  precondition-conditional branches unrelated to this phase's own new gate.
- **The `--result`/evidence-directory write path of `check-clause-map.mjs`
  for a hostile `--result` path** (a FIFO or symlink at `--result`): I
  confirmed it goes through `refuseOpenForWrite` by reading the code but did
  not construct a live FIFO-at-`--result` reproduction the way I did for
  `tiphys validate`'s file argument and `--context`.
- **A clean install of the packed tarball in a scratch directory**
  (criterion 13's second half), the phase's own work history already
  marks this HALF DONE and CI-deferred with a reason; I did not attempt it
  either, since it needs registry-backed `npm install <tarball>` and is not
  where this phase's hazard class points.
- **`.github/workflows/gates.yml` itself** beyond reading the two-step
  event split already documented there, I did not simulate a real GitHub
  Actions run of either event; CR-M3P1-B-006 is demonstrated by running the
  underlying harness script directly, which is what CI itself invokes, not
  by running the workflow.
- **The full JSON Schema Draft 2020-12 keyword surface outside the declared
  sixteen-keyword `AUTHORING_VOCABULARY`**: I did not try to smuggle a
  vocabulary-external keyword (e.g. `patternProperties`, `not`,
  `dependentRequired`) into a schema to see whether strict mode's rejection
  is as absolute as claimed beyond the two members already tested by the
  shipped suite; I read the Ajv `strict: true` configuration and trust its
  documented behavior for the general case, verified only for the specific
  keywords I tried.
- **Concurrency**: `tiphys status emit` under concurrent invocations
  (two processes appending to `stream.jsonl` and racing to rename
  `current.json`), not attempted. The module doc claims atomic
  rename-based writes; I did not construct a race to confirm no
  interleaving corrupts `current.json`, and this phase's plan does not
  claim concurrent-safety as an acceptance criterion, so it is outside what
  I checked rather than a gap I found and set aside.
- **The `red-witness`, `suite`, and `scope` gates' unrelated red statuses
  observed during the CR-M3P1-B-006 live run**: not investigated. They are
  most plausibly artifacts of running from a detached-HEAD reviewer
  worktree copy rather than the real phase branch (`scope`'s own reported
  reason names exactly this), but I did not chase them down, since doing so
  is outside this review's hazard-hunt scope and the CR-M3P1-B-006 evidence
  does not depend on their cause.

---

## `additionalProperties: false` audit, every object level, all four schemas

Walked programmatically (every JSON node with `"type": "object"` and a
`properties` key, across all four schema files) and cross-checked by hand.
Levels found, and their status:

- `plan.schema.json`: root (#), `report-code-disagreement[]` items,
  `decisions[]` items, `parked[]` items, `$defs/phase` (the phase object
  itself), `phase.steps[]` items, `phase.acceptance[]` items,
  `phase.hazard-classes[]` items, `phase.fill-in`. **All nine close.**
  (`open-questions[]`, `conflicts-with[]`, `citations[]`,
  `files-to-touch[]`, `extras[]` are string arrays with no nested object, so
  they have no level to close.)
- `charter.schema.json`: root, `identity`, `yolo-permissions`,
  `irreversible-decisions`, `escalation-contract`, `release-verification`
  (plus its two `oneOf` branches), `retention`. **All eight close.**
- `decision-record.schema.json`: root, `options[]` items. **Both close.**
  The `if`/`then` conditional sub-schemas do NOT set `additionalProperties`,
  and correctly so: they express a conjunctive constraint layered on top of
  an already-closed root object, not a redefinition of it; setting it there
  would be redundant, not protective. Verified this is not a hidden opening
  by confirming the root's `additionalProperties: false` still governs (an
  extra top-level property is rejected regardless of `if`/`then`, see the
  `status-extra-top`-style probe results below for the equivalent charter
  case).
- `status-line.schema.json`: root only (no nested objects). **Closes.**

**No level omitted.** This hazard did not reproduce anywhere in the four
schemas as shipped.

---

## Mutation probes: plausible-but-wrong instances against all four schemas

Run via a scratch script (`probe.mjs`, not committed) calling
`validateInstance` directly against each shipped schema and a hand-mutated
copy of the matching `templates/*.example.yaml`. All seventeen mutations were
REJECTED with a diagnostic naming the right pointer, except the one that
became CR-M3P1-B-003 above (duplicate `acceptance[].id`):

```
[plan-coerce-bool-string] 1 diagnostic: parallelizable expected boolean, found string
[plan-duplicate-acceptance-id] 0 diagnostics  <-- CR-M3P1-B-003
[plan-hazard-classes-empty] 1 diagnostic: minItems
[plan-nested-typo-acceptance] 1 diagnostic: additionalProperties (2 levels deep)
[plan-typo-added-key-hazard] 1 diagnostic: additionalProperties (3 levels deep)
[plan-step-missing-text] 1 diagnostic: required
[plan-fillin-coerce] 1 diagnostic: type
[charter-missing-enabled] 1 diagnostic: required
[charter-empty-auth] 1 diagnostic: minLength
[charter-release-verification-extra] 2 diagnostics: oneOf + additionalProperties
[charter-release-verification-invented-adapter] 3 diagnostics: oneOf + additionalProperties + enum
[dr-decided-empty] 2 diagnostics: if/then + minLength
[dr-missing-consequence] 1 diagnostic: required
[dr-vetoable-number] 1 diagnostic: type (integer vs boolean, no coercion)
[status-missing-run] 1 diagnostic: required
[status-extra-top] 1 diagnostic: additionalProperties
[status-empty-ref] 1 diagnostic: minLength
```

---

## Other attacks constructed and run: FIFO paths, vacuous-green, derived-check
reachability

- **D-M3-27 / named-pipe class**: reproduced the shipped test's own claim
  independently rather than trusting it. `mkfifo` at the file argument: the
  command refused within the process's own return (no `timeout` wrapper
  needed at the shell level; the guard in `readOperatorPath` returns before
  any blocking read) naming the path and "not a regular file". Same for
  `--context` pointed at a FIFO. Both directions (FIFO refused, regular
  file/directory at the same path accepted) hold. This matches
  `test/validate.test.ts`'s own bounded-time test, independently confirmed
  rather than assumed correct because it is registered.
- **Vacuous green on the clause-map check**: an inventory file with zero
  parseable rows and an empty coverage map both feed `evaluate()` `checked:
  0`, which `makeGateResult`'s M2-C-2 rewrite forces to `error` with
  `vacuous: true` even though the check's own logic would otherwise report
  `green` (zero problems). Confirmed live:
  ```
  $ node scripts/check-clause-map.mjs --inventory /tmp/.../empty-inventory.md --map /tmp/.../empty-map.json
  clause-map: error (0 clause-map rows checked)
  M2-C-2 (never green by omission): a gate reporting green with units 0 examined nothing...
  $ echo $?
  21
  ```
  This mechanism holds even for the specific "all rows pending, none in
  force" case, which is the state M3-P1 itself started from before this
  phase's four schemas existed as anchors.
- **Derived-check reachability**: `checksFor(type)` filters the registry by
  exact `type` string match; `plan-dispatchable`,
  `plan-hazard-classes-addressed-by-resolves`, and
  `plan-verification-first-present` are all registered with `type: "plan"`
  and all three run against every `--type plan` and `--type auto`-resolved
  plan validation, confirmed by running `tiphys validate --type plan
  templates/plan.example.yaml` and observing all three checks' effect
  (the `dispatchable:` report line proves `plan-dispatchable` ran; a clean
  exit proves the other two found nothing to reject on the shipped example).
  No check is registered with a `type` that does not match any `TYPE_TABLE`
  entry (which would make it permanently unreachable through the CLI); I
  checked this by reading the full registry rather than testing it
  negatively, since the registry is short and closed.
- **Ajv instantiation vs. DR-0013's list**: `makeAjv()` sets `strict: true,
  allErrors: true, validateSchema: true, coerceTypes: false, useDefaults:
  false, removeAdditional: false`, no `loadSchema`. Matches the decision
  record's clause 4 list verbatim; independently confirmed the no-mutation
  half of this by running the shipped mutation test cases plus my own
  duplicate-style probes above and diffing input before/after by
  `structuredClone` equality (all passed, no divergence found).

