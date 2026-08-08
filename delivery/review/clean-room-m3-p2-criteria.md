# M3-P2 clean-room review (criteria): STARTING 16:19:22

Reviewer: clean-room A (coverage and execution). Worktree
`/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/wt-m3p2-cr-a`,
detached at PR head `ee7042b`.

Toolchain, captured in the shell that runs every command below:

```
$ node --version
v26.6.0
$ npm --version
11.18.0
$ npm ci   # tail
found 0 vulnerabilities
exit 0
```

Diff shape against `origin/main` (28 files, 3815 insertions, 24 deletions);
the changed source files are `src/gates/run.ts` (+240/-?),
`src/commands/gates.ts` (+65/-?), `src/commands/validate.ts` (+5).

## Log

### Baseline gates, floor toolchain, PR head `ee7042b`

```
$ npm run build ; echo BUILD_EXIT=$?
BUILD_EXIT=0
$ git status --porcelain      # after build
?? delivery/review/clean-room-m3-p2-criteria.md      (this report only; tsbuildinfo/dist gitignored)
$ npm test
i tests 468
i suites 0
i pass 468
i fail 0
i cancelled 0
i skipped 0
i todo 0
TEST_EXIT=0
```

Criterion 7's first half holds: `node --test` exits 0, 0 failing, 0 skipped.

### Criterion 1 and the `auto` resolver (step 6)

```
$ node bin/tiphys.ts validate --type gate-registry gate-registry.yaml ; echo EXIT=$?
EXIT=0
$ node bin/tiphys.ts validate --type auto gate-registry.yaml ; echo AUTO_EXIT=$?
AUTO_EXIT=0
```

VERIFIED. `src/commands/validate.ts:56-60` adds the single `TYPE_TABLE` row, and
because the `auto` resolver keys off the document's own `kind` field, one row
serves both paths, exactly as the comment claims.

### Criterion 8 of the dispatch brief: the real PR bundle

Run on a CLONE of the repository (`.../scratchpad/cra-clone`) checked out on a
real branch `claude/m3-p2-gate-registry` at `ee7042b`, because the review
worktree is DETACHED and the `scope` gate's `branch-matches` precondition can
never be met on a detached HEAD. That is a property of my harness, not of the
change, and it is why every run below is in the clone.

```
$ scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase m3-p2 /tmp/ev-pr
gates: declared 11 applicable 7 verdict 7 green 7 red 0 not-applicable 4 error 0 vacuous 0
gates: required gate(s) not applicable: citations
m2-assert (PR bundle): OK. 11 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.
m2-green: OK. 3 diff-scoped gate(s) demonstrated green on a triggering state.
m2-exit-test: OK. evidence in /tmp/ev-pr
M2EXIT=0
```

VERIFIED, exit 0, `m2-assert (PR bundle): OK` present.

### Criterion 3, and the projection claim (dispatch item 3)

Run in the clone, on the phase branch, `--base` = the merge base
`bd47464` (= `origin/main`, an ancestor of the head).

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --evidence /tmp/ev-full --base bd47464 --head HEAD --phase m3-p2
gates: run 29af0c36bf064d2f769832c8
gates: 2 registry gate(s) declared verified-by clean-room-checklist and NOT executed by this runner: unit-tests-for-changed-service-methods (probe unit-tests-for-changed-service-methods), fixtures-for-changed-component-states (probe fixtures-for-changed-component-states)
gates: registry gate-registry.yaml mode full
gates: declared 12 applicable 8 verdict 8 green 8 red 0 not-applicable 4 error 0 vacuous 0
gates: required gate(s) not applicable: citations
REGISTRY_FULL_EXIT=20
```

Per-gate rows read from `summary.json` (id, status, units):

```
manifest-self-check green 8     credential-token not-applicable 0
coverage            green 115   citations        not-applicable 0
credential-scrub    green 7     deploy           not-applicable 0
suite               green 468   migrations       not-applicable 0
scope               green 28
clause-map          green 15
red-witness         green 4
agent-rules-drift   green 17
```

Zero green with units 0; zero `error`; zero `vacuous`; every not-applicable
carries a `precondition {id, met:false, reason, evidence}` block (checked in
each `result.json`). SC-011 holds on the registry path.

THE PROJECTION CLAIM, tested by A/B rather than by reading the diff. The same
arguments through `--manifest gates.manifest.json`:

```
$ node bin/tiphys.ts gates run --manifest gates.manifest.json --evidence /tmp/ev-man \
    --base bd47464 --head HEAD --phase m3-p2
gates: declared 11 applicable 7 verdict 7 green 7 red 0 not-applicable 4 error 0 vacuous 0
gates: required gate(s) not applicable: citations
MANIFEST_EXIT=20

set difference over (id, status, units):
only in registry: [ 'agent-rules-drift green 17' ]
only in manifest: []
```

The registry run is the manifest run PLUS exactly the one new script gate,
same statuses and same unit counts, same exit code. That is the strongest
form of "everything after the projection is the M2 runner untouched" I can
produce, and it holds.

### CR-M3P2-A-001 (low): criterion 3's first sentence, "exits 0", is not reachable on this head, and the plan's prediction that `citations` is green for M3-P2 is wrong

- severity: low
- location: `delivery/plan/kernel-plan-m3.md` criterion 3 (the sentence "exits 0"
  and the parenthesis "which for M3-P2 is true of `citations` and `scope`");
  observed at `src/gates/citations.ts:232-239` and
  `/tmp/ev-full/citations/result.json`.
- what (mechanism): the criterion predicts a gate's status from the REGISTRY's
  precondition (`diff-touches delivery/requirements/` etc.) while the gate has a
  SECOND, narrower applicability test of its own (a glob set, `delivery/**/*.md`
  plus `delivery/STATE.md`). This phase's only `delivery/requirements/` change is
  `clause-map.json`, a `.json`, and its other delivery change is
  `delivery/work-history/m3-p2.md`, which is not in the glob set at all. So the
  registry precondition is met, the gate declines, and a REQUIRED gate reporting
  not-applicable is exit 20 by design. Predicting a diff-scoped gate's status
  from the outer precondition alone is the mechanism; it will mispredict for any
  phase whose delivery edits are JSON or live outside the six configured trees.
- evidence:

```
$ cat /tmp/ev-full/citations/result.json | head
  "status": "not-applicable",
  "precondition": { "id": "citations-diff-touches-a-configured-document", "met": false,
    "reason": "no changed path under the configured documents globs (28 changed path(s) total). ..." }
$ node bin/tiphys.ts gates run --manifest gates.manifest.json ...   # same head, M2 path
MANIFEST_EXIT=20
```

- why it is LOW and not high: it is NOT caused by the promotion. The M2
  manifest path returns the identical status and the identical exit 20 on the
  same head (captured above), and DR-0018 clause 2 already rules that the
  authority for pass/fail is the exit HARNESS, not the runner's exit code; the
  harness run is green (`m2-assert (PR bundle): OK`). The criterion's own
  revision-3 table explicitly admits a diff-scoped gate as `not-applicable`
  "carrying its precondition id and the recorded evaluation", which is exactly
  what happened. The residue is that criterion 3's leading sentence and its
  table contradict each other, and a reader taking the leading sentence at face
  value would record a green that nobody can reproduce.
- recommendation: no code change. Amend criterion 3's leading sentence to
  "exits 0, or exits 20 solely because a diff-scoped required gate is
  not-applicable with a recorded evaluation (DR-0018)", and drop the "true of
  citations" parenthesis. Record the observed exit 20 rather than an unqualified
  "exits 0" wherever this criterion is reported as walked.

### Criteria 3b and 3c: constructed independently, not read from the implementer's tests

CRITERION 3b. I wrote my own fixture gate that AUTHORS ITS OWN RECORD claiming
`status: green` with `units: 0` (`/tmp/cra-3b/vacuous-gate.mjs`, a subprocess
writing the file named by `--result`, which is the M2-D-07 shape), and my own
minimal registry declaring it in `modes: [full, local-only]`. Four runs, the two
selection paths crossed with the two directions:

```
MODE=full       UNITS=0  EXIT=21  record: vacuous-fixture error units=0 vacuous=true
   detail: "M2-C-2 (never green by omission): a gate reporting green with units 0
            examined nothing, so this record is error; the gate reported: ..."
MODE=full       UNITS=1  EXIT=0   record: vacuous-fixture green units=1 vacuous=undefined
MODE=local-only UNITS=0  EXIT=21  record: vacuous-fixture error units=0 vacuous=true
MODE=local-only UNITS=1  EXIT=0   record: vacuous-fixture green units=1 vacuous=undefined
```

VERIFIED. M2-C-2 survives the promotion on BOTH selection paths, in both
directions, and the assertion is on the record the runner INGESTED, not on a
constructor being called. Constructing "a gate that examines zero units under
the NEW registry path" and finding it CANNOT report green is the dispatch's
item 1 and it holds.

CRITERION 3c. Against the REAL shipped registry and the real `suite` gate,
which declares `parameters: [base]`:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --evidence /tmp/ev-3c-a --only suite            # no --base
gates: declared 1 applicable 0 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 0
gates: 1 gate(s) reported error: suite
EXIT=21
suite error units=0 | gate suite requires --base, which was not supplied

$ ... --only suite --base bd47464                    # other direction
EXIT=0
suite green units=468
```

VERIFIED. `error` naming the missing flag, never `not-applicable`, never green.
Note `applicable 0` with `error 1`: the missing parameter is decided BEFORE
applicability, which is the fail-closed ordering M2-C-3 wants.

### Criteria 2, 4 and the `events` requirement: Kind A, both directions, mine

```
$ node bin/tiphys.ts validate --type gate-registry test/fixtures/gate-registry-checklist-no-probe.yaml
INVALID #/gates/0 value does not satisfy the requirements its own shape triggers here
INVALID #/gates/0/probe required property probe is missing            EXIT=1
$ ... gate-registry-deploy-no-precondition.yaml
INVALID #/gates/0/precondition required property precondition is missing  EXIT=1
$ ... gate-registry-no-events.yaml
INVALID #/gates/0/events required property events is missing          EXIT=1
```

Other direction, each fixture with the one missing key supplied (my patches,
written to /tmp/cra-c4/): all three EXIT=0.

Guarding-keyword removal (Kind A) done as a MUTATION OF THE SHIPPED SCHEMA FILE,
not only on an in-test copy, and the named test observed red:

```
### MUTATION: schema probe requirement removed   (test/gate-registry.test.ts, pattern "no probe")
i pass 0
i fail 1
```

VERIFIED for criteria 2 and 4 and for `gate-registry-events-field-required`.

### Criterion 5: the drift check, both directions, on the real files

```
$ node scripts/render-agent-rules-gates.mjs --check
agent-rules-drift: green (17 rendered gate rows compared)
CLAUDE.md's gate block matches gate-registry.yaml row for row (3 preflight step(s), 14 gate(s))
EXIT=0

# add `cra-probe-gate` to gate-registry.yaml, do NOT re-render
$ node bin/tiphys.ts validate --type gate-registry gate-registry.yaml   -> 0  (still a valid registry)
$ node scripts/render-agent-rules-gates.mjs --check
agent-rules-drift: red (18 rendered gate rows compared)
CLAUDE.md's gate block has drifted from gate-registry.yaml: the registry has a row the
file does not: | `cra-probe-gate` | script | required | full | pull_request | probe units |.
Re-render with node scripts/render-agent-rules-gates.mjs --write
CHECK_EXIT=1

$ node scripts/render-agent-rules-gates.mjs --write ; node ... --check
WRITE_EXIT=0 ; CHECK_EXIT=0 ; CLAUDE.md now carries the `cra-probe-gate` row
```

VERIFIED, and the drift message NAMES the added gate. The renderer DERIVES from
the registry: a registry-only edit reddens it, which is the hazard-table row
"a renderer that read the block would stay green there". Restored afterwards;
`git status --porcelain` clean.

### Criterion 5b: I extracted the workflow step and EXECUTED it myself

I wrote my own extractor (`/tmp/cra-5b/extract.mjs`): it finds the step whose
`- name:` matches the drift check in `.github/workflows/gates.yml`, HONOURS the
step-level `if:` against a supplied event name, and runs the `run:` script with
`bash -c` in a stub tree (`gate-registry.yaml`, `CLAUDE.md`, `scripts/`, `src/`).

```
A. clean stub, undefanged, pull_request   STEP_EXIT=0   (agent-rules-drift: green 17)
B. clean stub, undefanged, push           STEP_EXIT=0   BOTH ARMS, T-009
C. DRIFTED stub, undefanged, pull_request STEP_EXIT=1   (agent-rules-drift: red 18)
D. DRIFTED stub, undefanged, push         STEP_EXIT=1
DEFANG 1  `... --check || true`           STEP_EXIT=0 on the DRIFTED stub
DEFANG 2  step-level `if: false`          STEP_EXIT=0, step never ran
DEFANG 3  `if: github.event_name == 'pull_request'`
             pull_request arm             STEP_EXIT=1
             push arm                     STEP_EXIT=0, step never ran  <- T-009's exact shape
```

VERIFIED. THREE structurally different defangs, each of which makes a drifted
registry pass, and the undefanged step is red on BOTH events. The event-arm
half of the criterion is discharged by defang 3, which is the only one of the
three that a text assertion over the workflow file could not possibly see.

Mutation of the renderer itself (`process.exit(main(...))` -> `main(...); process.exit(0)`)
reddens `gate-drift-check-wired-executably`:

```
### MUTATION: renderer --check always exits 0    i pass 0  i fail 1
```

### CR-M3P2-A-002 (medium): `--mode` selection has no red witness; deleting the mode filter outright leaves the whole suite green

- severity: medium
- location: `src/gates/run.ts:388` (`const inMode = document.gates.filter((entry) => entry.modes.includes(mode));`)
  and `test/gate-registry.test.ts:483-541`.
- what (mechanism): every test that exercises `--mode` builds its fixture
  registry with `modes: [mode]`, i.e. the gate under test is a member of the
  mode being selected. A selection filter can only be witnessed by a gate that
  must be EXCLUDED, and no test in the repository has one. The mechanism is
  general: a witness for a filter needs a negative member, and this phase's
  witnesses are all positive members. `modes[]` "made live" is the phase's
  headline addition (step 2, and M3-P3 is declared to consume it), so the one
  new selection behaviour the phase introduces is the one with no guard.
- evidence, the mutation and its full result:

```
$ node -e '...replace("const inMode = document.gates.filter((entry) => entry.modes.includes(mode));",
                      "const inMode = document.gates;")...'    # --mode now selects EVERYTHING
$ node --test test/gate-registry.test.ts
i tests 10   i pass 10   i fail 0
$ node --test
i tests 470  i pass 470  i fail 0
```

Under that mutation `tiphys gates run --registry gate-registry.yaml --mode local-only`
would run all fourteen entries instead of four, and nothing anywhere is red.
Contrast the four mutations that ARE caught (each `i pass 0  i fail 1`):
the M2-C-2 ingest rewrite, the renderer's exit code, the schema's `probe`
requirement, and the manifest/registry parity field comparison.

- what the derivation did NOT cover: I mutated the filter expression only. I did
  not enumerate every other statement in `loadRegistry` for coverage; a further
  unguarded statement there is possible and I did not look for one.
- recommendation: add one registered behaviour whose fixture registry declares
  TWO gates, one in the selected mode and one not, and assert the excluded gate
  has no record and no evidence directory. That is a negative member and it is
  the missing half of section 2.3 rule 6 for this criterion. Both directions are
  free: swap which gate carries the mode.

### CR-M3P2-A-003 (medium): `gate-registry.yaml` states a runtime behaviour for the two checklist entries that no code performs

- severity: medium
- location: `gate-registry.yaml`, the `$comment` on
  `unit-tests-for-changed-service-methods` (and by reference the one on
  `fixtures-for-changed-component-states`); `src/gates/run.ts:381-393`.
- what (mechanism): the entry's own prose says "until `checklists/clean-room.yaml`
  exists the precondition is evaluated and unmet and this entry reports
  not-applicable, which is SC-011's shape and not a silent skip." The runner
  filters `verified-by: clean-room-checklist` entries OUT of the projection
  before any precondition is evaluated; they never reach `runOneGate`, so their
  precondition is never evaluated, no `result.json` is written, no status
  exists, and `summary.json.counts.declared` does not include them. The
  mechanism is a document describing behaviour that lives in a different module,
  which is the same shape as a text assertion about a workflow step: the prose
  and the code can diverge with nothing red.
- evidence:

```
$ ls /tmp/ev-full
agent-rules-drift  citations  clause-map  coverage  credential-scrub
credential-token   deploy     manifest-self-check   migrations
red-witness        scope      suite       summary.json
$ find /tmp/ev-full /tmp/ev-dp -iname '*unit-tests*' -o -iname '*fixtures-for*'
(no output)
$ node -e 'console.log(JSON.stringify(require("/tmp/ev-full/summary.json").declaredByChecklist))'
[{"id":"unit-tests-for-changed-service-methods","probe":"...","applicability":"conditional"},
 {"id":"fixtures-for-changed-component-states","probe":"...","applicability":"conditional"}]
```

The `declaredByChecklist` row carries id, probe and applicability, and NO
precondition and NO status. The runner's own stdout is accurate ("declared
verified-by clean-room-checklist and NOT executed by this runner"); it is the
registry's prose that is not.

- why it matters rather than being a wording nit: this file is the canonical
  artifact, CLAUDE.md renders these two rows into the agent-rules gate table,
  and M3-P7 will be written against this description. "Evaluated and unmet" and
  "not run at all" are exactly the distinction criterion 3c exists to protect,
  asserted in the wrong direction in the document that defines the gate.
- recommendation: restate the `$comment` to what the runner does ("this entry is
  reported as declared-and-not-executed until M3-P7 supplies the probe; its
  precondition is carried for the checklist runner that will evaluate it"), or
  make the runner evaluate the precondition and emit a real not-applicable
  record for checklist entries. Either closes it; the first is in scope for a
  fix round, the second is not.

### CR-M3P2-A-004 (low): criterion 2's "naming the entry id" is discharged by a JSON pointer, not by the id

- severity: low
- location: `test/gate-registry.test.ts:286-293`; observed output above.
- what: the diagnostic is `INVALID #/gates/0/probe required property probe is
  missing`. It names the ARRAY INDEX. On a fourteen-entry registry a reader gets
  `#/gates/9` and must count rows to find the entry. The test is honest about
  this (it resolves the pointer and asserts `instance.gates[0].id`), and DR-0013
  fixes the `INVALID <pointer> <message>` contract, so this is a plan-vs-contract
  mismatch rather than a defect.
- recommendation: none required. If the orchestrator wants the criterion read
  literally, the fix is in the diagnostic formatter and is out of this phase's
  scope; record the deviation instead.

### CR-M3P2-A-005 (medium): the registry and CLAUDE.md both state that CI runs the registry through the gate runner; nothing in CI does

- severity: medium
- location: `gate-registry.yaml` lines 4-6 ("CI reads it through the gate runner
  (`tiphys gates run --registry gate-registry.yaml --mode <mode>`)") and
  `CLAUDE.md` in the new gate-section preamble ("CI runs it through
  `tiphys gates run --registry gate-registry.yaml --mode <mode>`").
- what (mechanism): the only caller of `gates run` in CI is
  `scripts/m2-exit-test.sh`, and it passes `--manifest "${repo_root}/gates.manifest.json"`
  on both bundles. `--registry` appears in no workflow, no script, and no
  package script. The gate SET CI executes is still the M2 manifest; the
  registry is consumed by CI only through the one `agent-rules-drift` workflow
  step, which renders from it. So R-094's "single source consumed by CI" is true
  of the CLAUDE.md rendering and false of the gate run, and the two canonical
  documents assert the false half.
- evidence:

```
$ grep -rn -- '--registry' --include='*.sh' --include='*.yml' .   # excluding node_modules, delivery/, scripts/render-*
(no hit outside scripts/render-agent-rules-gates.mjs and test/)
$ grep -n 'gates run' scripts/m2-exit-test.sh
891:  ( cd "${repo_root}" && node "${TIPHYS}" gates run \
942:  ( cd "${repo_root}" && node "${TIPHYS}" gates run \
897: command "node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence pr-bundle ..."
949: command "node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence main-bundle --base ${base} --only manifest-self-check --only suite --only coverage --only credential-scrub --only deploy --only migrations"
$ node -e 'console.log(require("./gates.manifest.json").gates.some(g=>g.id==="agent-rules-drift"))'
false
```

- the implementer's claim in dispatch item 7 is VERIFIED and, if anything,
  understated. `run_main_bundle`'s `--only` list IS hard-coded to six ids, so
  the registry entry could not run on `push`; and because the harness runs the
  MANIFEST, and `agent-rules-drift` is not in the manifest, the entry could not
  run on `pull_request` either. The workflow step is what makes the check able
  to fail, and I confirmed by execution that it does (criterion 5b above).
- what DOES bind the two documents, and I checked it rather than assuming: the
  registered test `gate-registry-validates` compares every manifest gate against
  its registry entry field for field. Mutating `gates.manifest.json`'s `coverage`
  unitLabel reddens it (`i pass 0  i fail 1`), and `node --test` runs on both CI
  arms. So manifest/registry divergence IS caught; the false sentence is about
  which document CI RUNS, not about them drifting apart.
- recommendation: correct both sentences to what is true today ("CI runs its
  gate bundle from `gates.manifest.json`; this registry is the canonical
  declaration and is the source `CLAUDE.md`'s gate block is rendered from. The
  `--registry` runner path exists and is exercised by the suite; switching the
  CI bundle to it needs an expectation row and an `--only` entry in
  `scripts/m2-exit-test.sh`, which this phase may not touch"). That is a
  documentation fix inside this phase's own files, and it preserves the
  escalation the work history already raises.

### CR-M3P2-A-006 (medium): the work history's criterion-3 walk and its PR-bundle evidence are for a superseded head; on the head under review both come out differently

- severity: medium
- location: `delivery/work-history/m3-p2.md:401-466` (criterion 3) and
  `:868-906` (the real PR bundle).
- what (mechanism): both blocks were captured while `scope` was RED against a
  merge base whose phase declaration lacked `test/checks.test.ts`. The
  orchestrator then amended the declaration on `main`, which is where the scope
  gate reads it from, so the recorded evidence is a measurement of a merge base
  that no longer exists. The mechanism is that a gate reading its input from the
  MERGE BASE has evidence with a shelf life, and a work history that records the
  run without recording that dependency reads as current.
- evidence, the same two commands on the head under review:

```
work history, criterion 3:   green 7 red 1 ... 1 gate(s) reported red: scope    EXIT=1
mine,        criterion 3:    green 8 red 0 ... required gate(s) not applicable: citations   EXIT=20

work history, PR bundle:     m2-assert (PR bundle): FAIL with 1 finding(s) [scope]   BUNDLE EXIT=1
mine,        PR bundle:      m2-assert (PR bundle): OK. 11 gate record(s) match section 1.4  EXIT=0
```

The change is in the right direction (the blocker is resolved), and the work
history's stated blocker is now closed, so this is an accuracy defect rather
than a hidden failure. But CLAUDE.md's durability rule makes the work history
the artifact a later reviewer trusts, and as written it asserts a red gate on a
head where that gate is green, and reports `scope` red where the actual unmet
row is `citations`.
- recommendation: re-record both blocks against the current head (my captures
  above are reusable verbatim), and add one line naming the dependency: the
  scope gate reads the declaration from the MERGE BASE, so its evidence is
  scoped to the merge base sha it was taken against.

### Criterion 6 and the remaining checks

Criterion 6, by inspection of `CLAUDE.md`'s `## Gates` section: the section is
now a registry pointer, a `BEGIN/END GENERATED GATE LIST` block, and no
hand-maintained gate list. VERIFIED, and criterion 5's execution above is the
half that makes the claim mechanical rather than visual.

One LOW observation, not raised as a numbered finding because nothing depends on
it: the `Notes:` paragraph immediately AFTER `<!-- END GENERATED GATE LIST -->`
restates two of the three preflight notes ("sources are TypeScript run natively
via Node type stripping", "the build (tsc -b) is the type gate and emits dist/,
which is never committed") in hand-maintained prose. It is not a gate list, so
criterion 6 holds, but it is the same content as `preflight[1].note` and
`preflight[2].note` outside the drift check's reach.

Conventions and hygiene, on the head under review:

```
$ grep -rlP '[^\x00-\x7F]' $(git ls-files | grep -v '^delivery/intake/orchestrated-delivery-process.md$' | grep -v '^test/fixtures/json-schema-test-suite/')
exit 1 (no file)
$ grep -rlP '[\x00-\x08\x0B\x0C\x0E-\x1F]' <same 380 files>
exit 1 (no file)
$ git diff --name-only origin/main...HEAD | xargs grep -l -- (em dash)
exit 1 (no file)
$ git diff --stat origin/main...HEAD | grep -i 'Bin '
no binary-classified source files
```

Behaviors, resolved BY LITERAL TITLE against a TAP run of the whole suite:

```
OK  gate-registry-validates
OK  gate-registry-probe-required
OK  gate-registry-precondition-required
OK  gate-registry-not-applicable-not-green
OK  agent-rules-gate-drift-detected
OK  gate-drift-check-wired-executably
OK  gate-registry-zero-units-green-becomes-error
OK  gate-registry-missing-parameter-is-error-not-na
OK  gate-registry-events-field-required
OK  gate-registry-diff-scoped-na-accepted-with-reason
unresolved: 0
TOTAL behaviors.json entries not resolving to a literal title in this run: 0
```

All ten declared new behaviors are present, and the whole registry of 472
behaviour names resolves.

Clause map: three new rows (`R-043`, `R-044`, `R-094`), all pointing at
`gate-registry.yaml` under phase `M3-P2`; the `clause-map` gate is green with 15
rows checked in every bundle above.

Workflow constraint (DR-0017, DR-0004): `.github/workflows/gates.yml` has
exactly one job, named `gates`, and no `strategy`/`matrix` key anywhere. The
phase's edit is 29 added lines, all of them one step plus its comment.

The three pre-edit verifications (dispatch item 2), checked independently:

- (a) STRUCTURAL. `deploy` and `migrations` carry `kind: file-exists` on
  `release-verification.json`; that path is in ZERO tracked files and is
  produced only by `src/gates/release.ts` at release time. The precondition
  block, including its long structural id text, is carried BYTE-FOR-BYTE from
  `gates.manifest.json` (I diffed the two objects), so the structural claim is
  M2's own citing observation O-3, not this phase's invention.
- (b) RESERVED SHAPE MATCHES. `src/gates/schemas/gate-manifest.schema.json`
  declares `modes` as `{"type":"array","items":{"type":"string"}}` with the
  comment "Validated if present, ignored by the M2 runner, so the promotion is
  additive". "Ignored" verified by search: no read of `entry.modes` exists
  outside the M3-P2 projection; `src/gates/manifest.ts:71` merely declares the
  optional field. So step 1's escalation clause was correctly not triggered.
  Note the registry NARROWS the item type to a three-value enum; the projection
  is re-validated against the M2 schema, which accepts the narrower value, so
  the superset claim survives.
- (c) SC-011 BINDING. Verified by execution (criterion 3) and by mutation:
  changing the runner's unmet-precondition arm from `not-applicable` to `green`
  reddens `gate-registry-not-applicable-not-green` (`i pass 0  i fail 1`).

## Criteria walk

Every row was RE-RUN by me on the PR head. "Command" is the one that settles
the row; all of them are captured in full above.

| Criterion | Result | Command |
|---|---|---|
| 1. `validate --type gate-registry` exits 0 | VERIFIED | `node bin/tiphys.ts validate --type gate-registry gate-registry.yaml` -> 0; `--type auto` -> 0 |
| 2. checklist entry without `probe` exits 1 naming the entry; with `probe` exits 0 | VERIFIED (both directions); see CR-M3P2-A-004 on "naming the entry" | `node bin/tiphys.ts validate --type gate-registry test/fixtures/gate-registry-checklist-no-probe.yaml` -> 1, `/tmp/cra-c4/checklist-no-probe.yaml` -> 0 |
| 3. registry run `--mode full`, report accounts for every gate, zero green with unmet precondition | VERIFIED against the revision-3 table; the leading "exits 0" is NOT reproducible, see CR-M3P2-A-001 | `node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --evidence /tmp/ev-full --base bd47464 --head HEAD --phase m3-p2` -> 20, 8 green / 4 N/A / 0 error / 0 vacuous, 12 executed + 2 declaredByChecklist = 14 entries |
| 3b. M2-C-2 survives, two selection paths, both directions | VERIFIED with MY OWN fixture gate | `CRA_UNITS=0/1 node bin/tiphys.ts gates run --registry /tmp/cra-3b/reg-full.yaml --mode full\|local-only ...` -> 21 / 0, record `error` + `vacuous:true` on both zero-units runs |
| 3c. M2-C-3 survives: missing parameter is `error`, never N/A, never green | VERIFIED both directions, against the real `suite` gate | `... --only suite` (no `--base`) -> 21, `suite error units=0 \| gate suite requires --base, which was not supplied`; with `--base` -> 0, green 468 |
| 4. Kind A: conditional gate with no precondition rejected; keyword removed and restored | VERIFIED, and the removal done on the SHIPPED schema file, not only in-test | fixture -> 1; `/tmp/cra-c4/deploy-no-precondition.yaml` -> 0; schema mutation -> named test `i pass 0 i fail 1` |
| 5. `--check` exits 0; registry-only edit exits nonzero naming the gate; re-render exits 0 | VERIFIED | `node scripts/render-agent-rules-gates.mjs --check` 0 -> 1 (naming `cra-probe-gate`) -> `--write` -> 0 |
| 5b. drift check wired as a BEHAVIOUR, both event arms, two structurally different defangs | VERIFIED, with THREE defangs of my own | `node /tmp/cra-5b/extract.mjs <workflow> <stub> <event>`: clean 0/0, drifted 1/1, `\|\| true` 0, `if: false` 0, `if: event_name == 'pull_request'` -> 1 on PR and 0 on push |
| 6. `CLAUDE.md` gate section is the rendered block plus the pointer, no hand-maintained gate list | VERIFIED by inspection plus criterion 5 | `sed -n '/^## Gates/,/^## Red-witness/p' CLAUDE.md` |
| 7. `node --test` exits 0, 0 failing, 0 unaccounted; behaviors and clause map resolve | VERIFIED | `npm test` -> 468 tests / 468 pass / 0 fail / 0 skipped; TAP literal-title resolution -> 0 unresolved; clause-map gate green 15 |
| dispatch 8. real PR bundle | VERIFIED | `scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase m3-p2 /tmp/ev-pr` -> 0, `m2-assert (PR bundle): OK` |
| gates: `npm ci`, `npm run build`, `node --test` | VERIFIED, clean `git status` after build | all exit 0 on v26.6.0 / npm 11.18.0 |

Mutation results, gathered (each is `node --test --test-name-pattern <p> test/gate-registry.test.ts`):

| Mutation in `src/`, `schemas/` or the manifest | Named test |
|---|---|
| M2-C-2 ingest rewrite condition disabled (`run.ts`) | RED (`pass 0 fail 1`) |
| unmet precondition reports `green` instead of `not-applicable` (`run.ts`) | RED (`pass 0 fail 1`) |
| renderer `--check` always exits 0 (`render-agent-rules-gates.mjs`) | RED (`pass 0 fail 1`) |
| `probe` removed from the schema's `then.required` | RED (`pass 0 fail 1`) |
| `gates.manifest.json` `coverage.unitLabel` changed | RED (`pass 0 fail 1`) |
| **mode filter deleted: `--mode` selects every entry** | **GREEN, whole suite 470/470** (CR-M3P2-A-002) |

Every mutation was reverted and `git status --porcelain` was empty afterwards
(checked after each one; the clone's working tree is clean and the review
worktree carries only this report).

## Verdict

**CHANGES REQUIRED.**

- high: 0
- medium: 4 (CR-M3P2-A-002 the unwitnessed `--mode` filter; CR-M3P2-A-003 the
  registry's false statement about the checklist entries' precondition;
  CR-M3P2-A-005 the registry's and `CLAUDE.md`'s false statement that CI runs
  the registry; CR-M3P2-A-006 the superseded criterion-3 and PR-bundle evidence
  in the work history)
- low: 2 (CR-M3P2-A-001 criterion 3's unsatisfiable "exits 0";
  CR-M3P2-A-004 "naming the entry id" discharged by a JSON pointer)

None of the four mediums is a defect in what the registry DOES. Every
substantive property the phase exists to protect held under my own
construction: M2-C-2 and M2-C-3 both survive the promotion on both selection
paths, SC-011 holds on the registry path, the drift check is a real behaviour
that three different defangs can be caught by, the workflow is still one job
named `gates` with no matrix, and the registry run is provably the manifest run
plus one gate. Three of the four mediums are statements in shipped artifacts
that do not match the code, and this repository's own history is that a
document asserting behaviour it does not have is how a real defect stays
hidden; the fourth is a missing negative member in a witness. All four are
cheap: one test, three paragraphs.

The engineering here is unusually careful. The A/B against the manifest, the
`declaredByChecklist` reporting rather than silent dropping, the second
validation of the projection against the M2 schema, and the fail-closed refusal
of an undeclared mode are all things a weaker promotion would have skipped, and
I tried to break each of them and could not.

## What I did NOT cover

Specific, so an empty result here is not read as an absence of defects.

1. **The `push` arm of real CI.** Everything above is a local run or an
   extracted-and-executed step. I did not observe a GitHub Actions run on either
   event. T-009's rule binds this report too: my evidence is scoped to a local
   Node 26.6.0 configuration, not to `ubuntu-latest` on Node 26. The post-merge
   `push` run on the new `main` head is still owed.
2. **`deploy` and `migrations` were not exercised**, only observed
   not-applicable. I verified the STRUCTURAL claim's provenance (carried
   byte-for-byte from M2, citing O-3) and that `release-verification.json` is
   produced by nothing in the repository. I did not construct a state where
   either gate runs.
3. **The two checklist entries were not exercised** and cannot be until M3-P7
   supplies `checklists/clean-room.yaml`. I verified they produce no record and
   no evidence directory; I did not verify that any probe with either id will be
   satisfiable.
4. **`scripts/m2-exit-test.sh` was read for its two bundle definitions and its
   `--only` list only.** I did not audit its assertion program. My
   `m2-assert (PR bundle): OK` therefore inherits whatever that program's own
   blind spots are.
5. **Mutation coverage is six mutations, not a survey.** I chose them to map
   onto criteria (M2-C-2, SC-011, the renderer, the schema, manifest parity,
   mode selection). I did not enumerate the statements of `loadRegistry`, nor
   mutate anything in `src/commands/gates.ts`'s flag parsing beyond exercising
   the two refusals (`--manifest` with `--registry`, `--mode` without
   `--registry`) by hand. A further unguarded statement in either file is
   possible and I did not look for one.
6. **The hazard class is the other reviewer's contract**, not mine. I walked the
   hazard-to-criterion table only far enough to run the criteria it points at
   (3, 3b, 3c, 4, 5, 5b). I did not independently derive whether the table is
   complete.
7. **The scope audit** was run as part of the bundle (`scope` green, 28 changed
   paths audited) and I did not separately re-derive the files-to-touch list
   against the declaration by hand.
8. **`--mode direct-pr` and `--mode local-only` on the real registry** were run
   once each and their per-gate rows recorded; I did not assert an expected
   table for either the way criterion 3 does for `full`, because the plan
   defines one only for `full`.
9. **My harness is a CLONE, not the review worktree**, because the phase branch
   is checked out in another worktree and `scope` cannot be met on a detached
   HEAD. The clone shares history and content byte for byte (`git rev-parse HEAD`
   equal), but its `origin` is a local path, so any behaviour that depends on the
   remote URL was not exercised as CI would exercise it.

FINISHED.
