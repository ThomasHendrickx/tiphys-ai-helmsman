# Work history: exit-test assertion direction (orchestrator-side harness hotfix)

Branch: `claude/exit-test-harness-assertion-direction`, cut from `origin/main`
at `3ff2023`. The branch name deliberately does NOT match
`^claude/m[0-9]+-p[0-9]+-`: that pattern makes the scope auditor derive a phase
id and demand a phase declaration (CLAUDE.md:450).

This is NOT an M3 phase. It is an orchestrator-side hotfix to shared harness
code, which under T-009's corollary IS a fix round and owes the full fix-round
contract at CLAUDE.md:297.

STATUS: COMPLETE. Written incrementally as a beacon (T-008 rule 1,
CLAUDE.md:375), so the captures below landed as they were taken rather than
being reconstructed at the end.

## 1. The mechanism (fix-round contract item 1)

NOT the finding. The finding is "the `brief-drift` gate has no row in
`PR_EXPECT_JSON`". Fixing that alone leaves the defect in place.

THE MECHANISM: **the assertion program in `scripts/m2-exit-test.sh` iterates the
hand-written EXPECTATION and keys into the bundle's rows, so a row the
expectation does not name is never asserted on, whatever its status.**

The relation is constrained in one direction only. Every gate the TABLE names
must have an acceptable row; a row the table does not name is unconstrained. A
red gate absent from the table therefore passes the exit test in silence.

Two things settle that rather than one, because the first alone would be a
reading. STRUCTURALLY, the only loop over expectations is
`for (const spec of expect.gates ?? [])` at line 325 of the pre-change file, and
the enumeration of every global row-driven check is the table below.
EMPIRICALLY, six probes in section 6 drive the pre-fix program over bundles
carrying a RED gate and it exits 0 on every one, on both arms.

This is the fourth occurrence in this project of one shape: a check that
constrains a relation in one direction while its own documentation claims both.

### Verification of the orchestrator's pre-dispatch claims

The dispatch brief gave a derivation and told me to VERIFY rather than trust it.
One claim did not reproduce as stated, and the correction matters.

Claimed: "12 gates in `gates.manifest.json`; exactly one, `brief-drift`, is
absent from `PR_EXPECT_JSON`."

Measured on `main` at `3ff2023`, parsing both files and differencing the id sets
in BOTH directions:

```
$ node -e '
const fs=require("node:fs");
const m=JSON.parse(fs.readFileSync("gates.manifest.json","utf8"));
const ids=m.gates.map(g=>g.id);
console.log("manifest gate count:", ids.length);
...'
manifest gate count: 11
manifest ids: ["manifest-self-check","coverage","credential-scrub","credential-token","suite","citations","scope","deploy","migrations","clause-map","red-witness"]
--- PR_EXPECT_JSON
  table ids: ["manifest-self-check","red-witness","suite","scope","citations","coverage","clause-map","credential-scrub","deploy","migrations","credential-token"]
  absent  : []
  manifest NOT in table (gates+absent): []
  manifest NOT in table (gates only)  : []
  table NOT in manifest: []
--- MAIN_EXPECT_JSON
  table ids: ["manifest-self-check","suite","coverage","credential-scrub","deploy","migrations"]
  absent  : ["red-witness","citations","scope","credential-token","clause-map"]
  manifest NOT in table (gates+absent): []
  manifest NOT in table (gates only)  : ["credential-token","citations","scope","clause-map","red-witness"]
  table NOT in manifest: []
```

So on `main` TODAY there are ELEVEN manifest gates and the gap is ZERO on both
arms. The "12 gates, one missing" measurement was taken against the M3-P6
branch, not `main`. Confirmed:

```
$ git show origin/claude/m3-p6-delivery-role-briefs:gates.manifest.json | node -e '...'
m3-p6 manifest count: 12
["manifest-self-check","coverage","credential-scrub","credential-token","suite","citations","scope","deploy","migrations","clause-map","red-witness","brief-drift"]
```

The correction does not weaken the case, it sharpens it. The defect is not that
a row is missing today; today nothing is missing. The defect is that NOTHING
WOULD NOTICE if one were, and `brief-drift` is the instance already queued to
prove it at PR #105.

### The mechanism is already recorded twice, in the present tense

Two documents on `main` state the mechanism as a live fact, and nothing checked
either statement.

`.github/workflows/gates.yml`, beside the `agent-rules-drift` step:

```
      #   1. The push arm cannot reach it otherwise. scripts/m2-exit-test.sh
      #      runs the main bundle with a HARD-CODED `--only` list of six gate
      #      ids; a gate outside that list is never run on a push to main. That
      #      script is owned by M2-P9 and is not on this phase's files-to-touch
      #      list, so this phase cannot extend the list.
      #   2. A red would not fail CI otherwise. run_pr_bundle records the
      #      runner's exit code but does not act on it; the assertion program
      #      decides, and it only examines gates named in its expectations
      #      table, which is in the same out-of-scope script. That is exactly
      #      the defect PR #44 fixed for the clause-map gate.
```

That is at .github/workflows/gates.yml:93 and it names BOTH families of the
main arm and identifies a THIRD prior instance, `clause-map` at PR #44.

`test/gate-registry.test.ts:1014` carries the same thing as a declared
divergence with a written reason:

```
const REGISTRY_ONLY_SCRIPT_GATES: ReadonlyMap<string, string> = new Map([
  [
    "agent-rules-drift",
    "M3-P2 declares it per D-M3-34, but CI invokes the runner with --manifest, " +
      "so what executes it in CI is a step in .github/workflows/gates.yml. " +
      "Adding it to gates.manifest.json needs an expectation row in " +
      "scripts/m2-exit-test.sh, which is not on this phase's declaration.",
  ],
]);
```

So `agent-rules-drift` is a SECOND gate already blocked by this exact
circularity, and `clause-map` (PR #44) was a third. Three instances, one
mechanism.

### The call sites of the mechanism, in the file

Measured against `scripts/m2-exit-test.sh` at `3ff2023` (pre-change line
numbers):

| line | construct | direction |
|---|---|---|
| 325 | `for (const spec of expect.gates ?? [])` | table-driven: the defect |
| 385 | `for (const row of rows)` | row-driven, but `continue`s unless status is `not-applicable` |
| 429 | `rows.filter((r) => r.status === "error")` | row-driven, global |
| 433 | `rows.filter((r) => r.vacuous === true)` | row-driven, global |
| 446 | `red: rows.filter((r) => r.status === "red").length` | a COUNT compared with `summary.counts`, asserting nothing about whether red is acceptable |

There was no global assertion that a bundle carries zero RED rows. Line 446
looks like one and is not: it only checks that the summary's own red count
agrees with a recount of the rows, so a bundle reporting `red: 3` and carrying
three red rows is self-consistent and passes.

### BOTH ARMS (T-009: the unwitnessed arm is the one that broke)

- PR arm: `PR_EXPECT_JSON` (was line 829), consumed by `run_pr_bundle` (was 878).
- MAIN arm: `MAIN_EXPECT_JSON` (was 847), consumed by `run_main_bundle` (was
  923), whose gate set is a HAND-WRITTEN `--only` list of six ids (was 944-945).

The main arm carries the family TWICE, because the six ids were written out in
two places that had to stay complementary by hand:

1. the expectation can miss a row for a gate the bundle DID run, and
2. the `absent` list can miss a gate the bundle did NOT run, so its
   non-execution is asserted by nothing either.

Today `--only` (6) and `absent` (5) partition the 11-gate manifest exactly. Add
a twelfth gate and it lands in NEITHER.

## 2. The design choice

### Chosen: derive the expected set, default a declared-but-unlisted gate to REQUIRED-GREEN

The set of gates the assertion program asserts on is now the union of

- every gate id `gates.manifest.json` declares (what CI is CONFIGURED to run),
- every gate id the bundle actually reported (what it DID run),
- every gate id the table names explicitly,

minus the ids the table declares ABSENT for that bundle. A member the table
names uses its explicit spec; a member it does not name gets the STRICT default,
`required: true, expect: "green"`.

A table row therefore changes meaning: it is now a RELAXATION, never the thing
that makes a gate asserted.

And the main arm's `absent` list is DERIVED as (manifest ids) minus
(`MAIN_ONLY_GATES`), so the second copy of the six-id set is gone and a new
manifest gate is asserted absent from the main bundle at once.

### The alternative I rejected, and why

**Rejected: FAIL on a manifest gate with no explicit row.** It forces
explicitness, which is the property this repository normally prefers, and it is
genuinely blocked here. The ordering is circular and BOTH orders fail:

1. `brief-drift` is not in `gates.manifest.json` on `main` today (measured
   above: 11 gates, no `brief-drift`). It arrives with M3-P6, in review at PR
   #105 and not yet merged.
2. Under the strict-fail rule on `main`, M3-P6's merge would add `brief-drift`
   to the manifest with no table row and correctly redden M3-P6's own PR.
3. M3-P6 could not fix that. Verified rather than assumed:

```
$ git grep -n 'm2-exit-test' -- delivery/plan/phase-declarations/
delivery/plan/phase-declarations/m2-p9.json:5:    "scripts/m2-exit-test.sh",
delivery/plan/phase-declarations/m2-p9.json:6:    "test/m2-exit-test.test.ts",
delivery/plan/phase-declarations/m2-p9.json:13:    "delivery/evidence/m2-exit-test/"
delivery/plan/phase-declarations/m3-p10.json:17:    "delivery/evidence/m2-exit-test/",
```

   `scripts/m2-exit-test.sh` appears on `m2-p9.json` only. M3-P6's own
   declaration lists no such path (its `filesToTouch` is `roles/*`,
   `scripts/check-brief-drift.mjs`, `MECHANISMS.md`, `gates.manifest.json`,
   `gate-registry.yaml`, `CLAUDE.md` and so on). Touching the harness there is a
   scope-gate red.
4. The mirror order fails too. Adding a `brief-drift` expectation row to `main`
   BEFORE the gate exists trips the pre-existing check at
   scripts/m2-exit-test.sh:328, "no record in the bundle for a gate the table
   lists".

So under that alternative the row and the gate would have to land together, and
they cannot. This is not hypothetical: it is the same circularity that has
already stranded `agent-rules-drift` in the registry-only divergence quoted
above.

**A third shape I considered and rejected: keep strict-fail but make a table
row for a gate absent from the manifest INERT**, so a `brief-drift` row could be
pre-landed on `main` now and start biting when the gate arrives. Rejected on
evidence, for three reasons. It WEAKENS the existing check at
scripts/m2-exit-test.sh:328, which today catches a gate the table names that
produced no record, a real detection of a gate that silently failed to run; a
typo'd id in the table would become inert instead of red. Settled by driving the
PRE-fix program over a two-gate table and a one-row bundle:

```
$ node <pre-fix m2-assert.mjs> --summary <bundle>/summary.json --evidence <bundle> \
    --expect <table naming scope AND citations> --manifest <two-gate manifest>
m2-assert (named but missing): FAIL with 1 finding(s):
  - [citations] no record in the bundle for a gate the table lists (expected green)
PRE-FIX exit=1
``` It requires this
branch to predict a future gate's id exactly. And it does not remove the
circularity, it only moves it: the phase after next adds gate X, forgets the
row, and gets a red it cannot fix.

The chosen shape has the failure mode that a new gate legitimately allowed a
non-green status gets a red on the PR that introduces it. That is the RIGHT
direction of failure (loud, self-describing, with the message naming the row to
add) as against the current silent non-assertion, and the message says so
verbatim. For the live case it does not arise at all: `brief-drift` is declared
`applicability: "required"` with NO precondition, so required-green is exactly
correct for it.

```
$ git show origin/claude/m3-p6-delivery-role-briefs:gates.manifest.json | node -e '...brief-drift...'
{
  "id": "brief-drift",
  "command": [ "node", "scripts/check-brief-drift.mjs", "--check" ],
  "unitLabel": "generated brief gate rows compared",
  "applicability": "required"
}
```

### The main arm's `--only` list: NOT derived, and why

The brief asked me to consider deriving the main bundle's `--only` list from the
manifest and to say plainly what changes if I do. I did not derive it, and the
reason is measured rather than preferred.

```
$ node -e 'const m=JSON.parse(require("node:fs").readFileSync("gates.manifest.json","utf8"));
for(const g of m.gates){console.log([g.id.padEnd(22),(g.applicability||"?").padEnd(12),"pre="+(g.precondition?g.precondition.kind+"/"+g.precondition.id:"none")].join(" "))}'
manifest-self-check    required     pre=none
coverage               required     pre=file-exists/coverage-inventory-exists
credential-scrub       required     pre=none
credential-token       conditional  pre=command-exit-zero/implementer-token-present-owner-action-a-3
suite                  required     pre=none
citations              required     pre=diff-touches/citations-diff-touches-documents
scope                  required     pre=branch-matches/scope-branch-is-a-phase-branch
deploy                 conditional  pre=file-exists/deploy-release-verification-declared (...)
migrations             conditional  pre=file-exists/migrations-release-verification-declared (...)
clause-map             required     pre=none
red-witness            required     pre=diff-touches/red-witness-diff
```

`clause-map` is `required` with NO precondition and is nonetheless deliberately
EXCLUDED from the main bundle. So no rule over applicability or preconditions
reproduces the six-id set; it is a policy choice about what a push to `main` is
worth paying for, and deriving it would WIDEN what the main bundle runs (it
would pull in the three diff-scoped gates and `credential-token`, which on a
push with no `--head` and no `--phase` do not have a defined green path). The
brief said not to widen silently, and I have not widened it at all.

What I derived instead is the COMPLEMENT: the `absent` list. That changes no
gate's execution and closes the second family member.

## 3. The derivation (fix-round contract item 2)

The exact command enumerating every site that reads a gate-run bundle summary,
and its full output:

```
$ git grep -ln 'summary\.json' -- .
.github/workflows/gates.yml
delivery/STATE.md
delivery/decisions/DR-0018-exit-test-src-scoped-gate-semantics.md
delivery/evidence/m2-exit-test/README.md
delivery/evidence/m2-exit-test/main-bundle.out
delivery/evidence/m2-exit-test/pr-bundle.out
delivery/plan/kernel-plan-m2.md
delivery/plan/kernel-plan-m3.md
delivery/review/clean-room-citations-scope-hazard.md
delivery/review/clean-room-m2-p1-criteria.md
delivery/review/clean-room-m2-p1-hazard.md
delivery/review/clean-room-m2-p1-round2-hazard.md
delivery/review/clean-room-m2-p1-round3-criteria.md
delivery/review/clean-room-m2-p1-round3-hazard.md
delivery/review/clean-room-m2-p4-round2-hazard.md
delivery/review/clean-room-m2-p6-hazard.md
delivery/review/clean-room-m3-p1-hazard.md
delivery/review/clean-room-m3-p2-criteria.md
delivery/review/clean-room-m3-p2-hazard.md
delivery/review/clean-room-m3-p3-criteria.md
delivery/review/clean-room-m3-p3-r9-criteria.md
delivery/review/evidence/clean-room-m3-p3-r8-criteria/units-baseline-18c335a.json
delivery/review/evidence/clean-room-m3-p3-r9-criteria/units-baseline-18c335a.json
delivery/review/evidence/clean-room-m3-p3-r8-criteria/units-head-108eed0.json
delivery/review/evidence/clean-room-m3-p3-r9-criteria/units-head-b5c01f0.json
delivery/review/plan-review-m2-r1.md
delivery/review/verification-m3-p2-fix-round.md
delivery/work-history/m2-p1.md
delivery/work-history/m2-p6.md
delivery/work-history/m2-p9.md
delivery/work-history/m3-p1.md
delivery/work-history/m3-p2.md
delivery/work-history/m3-plan-revision-3.md
scripts/m2-exit-test.sh
src/commands/gates.ts
src/gates/run.ts
test/coverage-gate.test.ts
test/gate-registry.test.ts
test/gates.test.ts
test/m2-exit-test.test.ts
test/scope-gate.test.ts
witness/gate-registry-checklist-not-executed.json
witness/gate-registry-mode-excludes.json
```

Executable sites, after removing the `delivery/**` prose and the two `witness/`
fixtures: `scripts/m2-exit-test.sh` (the CERTIFIER, the defect),
`src/gates/run.ts` and `src/commands/gates.ts` (the PRODUCERS), and five test
files.

### The positive control

An empty grep is the wrong-scope trap this project has been bitten by three
times (CLAUDE.md:316), so the claim that `scripts/m1-exit-test.sh` is out of
scope was controlled rather than asserted:

```
$ for p in EXPECT 'summary\.gates' rowById; do printf '%-16s m1=%s m2=%s\n' "$p" \
    "$(git grep -c "$p" -- scripts/m1-exit-test.sh 2>/dev/null || echo 0)" \
    "$(git grep -c "$p" -- scripts/m2-exit-test.sh 2>/dev/null || echo 0)"; done
EXPECT           m1=0 m2=scripts/m2-exit-test.sh:9
summary\.gates   m1=0 m2=scripts/m2-exit-test.sh:1
rowById          m1=0 m2=scripts/m2-exit-test.sh:3
```

Three patterns, 0/0/0 in `m1-exit-test.sh` against 9/1/3 in `m2-exit-test.sh`.
The zeroes are a real absence, not a mis-scoped search: the same command finds
the same patterns in the sibling file.

**I FIRST WROTE THAT `m1-exit-test.sh` "never invokes the gate runner", AND THE
CLAIM GREP CAUGHT IT AS FALSE.** It does invoke the CLI, at
scripts/m1-exit-test.sh:147 and about fifteen call sites after it. The precise
measurement:

```
$ grep -nE '\bgates\b' scripts/m1-exit-test.sh
54:# task whose branch never landed. That guard is itself guarded: the gates
$ grep -cE '\bgates\b' scripts/m2-exit-test.sh
49
$ wc -l scripts/m1-exit-test.sh
1285
```

The corrected statement: `scripts/m1-exit-test.sh` invokes the CLI for `init`,
`doctor`, `lock`, `watch`, `spawn` and `teardown`, and NEVER for the `gates`
subcommand; its single occurrence of the word "gates" is prose in a comment. It
therefore produces no bundle summary and holds no expectation table, so it
cannot carry this mechanism. The 1285-line count is there so "one hit" reads as
a real result rather than an empty file.

### The five test files, audited (this is what the brief's derivation did NOT
### cover, and it was handed to me)

```
$ for f in test/coverage-gate.test.ts test/gate-registry.test.ts test/gates.test.ts test/scope-gate.test.ts; do
    echo "=== $f ==="; grep -n 'summary\.json\|summary\.gates\|\.gates\.find\|\.gates\.filter\|rowById\|for (const .* of .*gates' "$f"; done
=== test/coverage-gate.test.ts ===
185:      readFileSync(join(evidenceDir, "summary.json"), "utf8"),
187:    const coverageRow = summary.gates.find((row) => row.id === "coverage");
=== test/gate-registry.test.ts ===
264:  const summary = JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as {
267:  const row = summary.gates.find((entry) => entry["id"] === gateId) as Record<string, unknown>;
302:  for (const entry of manifest.gates) {
420:  for (const gate of registry.gates) {
434:  const drift = registry.gates.find((gate) => gate.id === "agent-rules-drift");
448:    readFileSync(join(fixturesDir, "gate-runner-capture.summary.json"), "utf8"),
980:      const summary = JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as {
984:      const ids = summary.gates.map((row) => row.id);
1085:    const summary = JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as {
1102:        summary.gates.some((row) => row.id === id),
=== test/gates.test.ts ===
192:  return JSON.parse(readFileSync(join(evidence, "summary.json"), "utf8")) as Summary;
292:    const errorRecords = summary.gates.filter((g) => g.status === "error");
1599:      assert.equal(summary.gates[0]?.applicable, false);
1668:    for (const row of mixedSummary.gates) {
2008:    assert.equal(summary.gates.length, 1);
2732:      !existsSync(join(thief, "summary.json")),
=== test/scope-gate.test.ts ===
485:  return JSON.parse(readFileSync(join(evidenceDir, "summary.json"), "utf8")) as {
553:    const scopeRow1 = summary1.gates.find((row) => row.id === "scope");
577:    const scopeRow2 = summary2.gates.find((row) => row.id === "scope");
598:    const scopeRow3 = summary3.gates.find((row) => row.id === "scope");
```

The shape needs four things together: a hand-written expectation, a keyed
lookup into rows, no global row-driven check, AND a bundle whose row set the
checker does not control. Verdicts:

- `test/scope-gate.test.ts` writes its own single-gate `scope-only-manifest.json`
  (test/scope-gate.test.ts:492), so its bundle has exactly one row and a single
  keyed lookup is complete coverage. NOT the shape.
- `test/gates.test.ts` uses fixture manifests it writes, and its one global loop
  at test/gates.test.ts:1668 is ROW-driven (`for (const row of
  mixedSummary.gates)`), the correct direction. NOT the shape.
- `test/gate-registry.test.ts` compares SETS with `deepEqual` on sorted arrays
  derived at run time (test/gate-registry.test.ts:1043 and
  test/gate-registry.test.ts:1095). A `deepEqual` between two sets is
  bidirectional by construction: an unexpected member reddens as loudly as a
  missing one. NOT the shape, and it is the pattern the fix imitates.
- `test/coverage-gate.test.ts:187` is the one that shares the STRUCTURE. It runs
  the real `gates.manifest.json` over the real repository
  (test/coverage-gate.test.ts:178), producing an eleven-row bundle, and asserts
  on the `coverage` row only; the other ten rows are unasserted. But its
  CONTRACT is "the coverage gate reports green with N units", not "this bundle
  is acceptable". It is a unit test of one gate, not a certifier, and a red
  `suite` row there is not what it exists to catch. Same structure, different
  contract, so not a defect.

None of the five is a bundle CERTIFIER, which is the role in which the
one-directional relation becomes a hole. `scripts/m2-exit-test.sh` is the only
certifier in the repository.

OBSERVATION, out of scope and NOT acted on, reported for the orchestrator:
test/coverage-gate.test.ts:190 pins `assert.equal(coverageRow?.units, 115)`, a
COUNT over the coverage inventory. If that inventory is append-only, this is the
by-count-not-by-name shape CLAUDE.md:201 forbids, and it will redden on whichever
future phase appends to the inventory. I have not touched it: it is a different
mechanism and it is not on this branch's business.

## 4. What the derivation did NOT cover (fix-round contract item 3)

The reviewer's FIRST check (CLAUDE.md:326).

1. **The `git grep -ln 'summary\.json'` search is by LITERAL FILENAME.** A site
   that reads a bundle summary through a variable or a joined path fragment
   (`join(dir, name)` where `name` is computed) would not appear. I did not
   enumerate those. What bounds the risk is that the runner WRITES the file at
   one literal name in `src/gates/run.ts`, so a reader has to name it or
   reconstruct it, and I found no reconstruction. This is not a proof of
   absence.
2. **`delivery/**` prose and the two `witness/**` fixtures were excluded** from
   the executable audit. They are documents and recorded evidence, not code that
   certifies a bundle. `witness/gate-registry-checklist-not-executed.json` and
   `witness/gate-registry-mode-excludes.json` are red-witness records, read by
   the `red-witness` gate rather than by anything asserting over a bundle.
3. **The five test files were audited for the assertion-DIRECTION shape only.**
   I did not audit them for other over-assertion families (by-count assertions,
   pinned row presence, over-broad text matching), except where one fell into my
   lap, which is the `units, 115` observation above. That is a separate sweep and
   it is not this branch's.
4. **Other consumers of a gate result that are not the bundle summary.** The
   per-gate `result.json` files are read in several places; I scoped to the
   SUMMARY because the summary is what the certifier certifies. A one-directional
   relation over per-gate records is a possible sibling I did not enumerate.
5. **`gate-registry.yaml` as a second declaration source.** CLAUDE.md:233 records
   that R-094 is half-delivered: `scripts/m2-exit-test.sh` invokes the runner
   with `--manifest` on both arms and `--registry` appears nowhere in it, so a
   registry-only gate does not run in CI at all. My derived expected set is over
   the MANIFEST, which is what actually runs. A registry-only gate is still not
   run and still not asserted, and closing that is the other half of R-094,
   tracked separately. I have deliberately NOT introduced `--registry` into the
   harness: test/gate-registry.test.ts:1056 asserts it is absent, and that
   assertion is correct until R-094's CI half is done as its own piece of work.
6. **I did not run either full bundle end to end.** Running the PR bundle runs
   the whole gate set, which runs this repository's own suite in a subprocess;
   test/m2-exit-test.test.ts:38 records that a test doing so is re-entered by the
   suite it invoked. The arms are exercised here through the shipped assertion
   program driven over crafted bundles, and through the real resolved
   expectation documents of both arms. CI is what runs the bundles.

## 5. The change

`scripts/m2-exit-test.sh`:

- The two expectation constants moved ABOVE argument parsing (they are pure
  constants) so a new `--print-expect pr|main` internal entry point can emit a
  fully resolved expectations document without an evidence directory and without
  running a gate. Same shape and same reason as the pre-existing
  `--resolve-scope-expect` hook at scripts/m2-exit-test.sh:115: it gives a test
  a handle on the REAL table of each arm instead of a hand-copied replica, and a
  replica is the thing that silently stops matching.
- `MAIN_ONLY_GATES` declares the main bundle's six gate ids ONCE.
  `run_main_bundle` builds the runner's repeated `--only` flags from it, and
  `main_absent_json` derives the expectation's `absent` list from it as the
  manifest complement. The second hand-written copy of the set is gone.
- `m2-assert.mjs` derives the set of gates it asserts on (manifest ids, union
  bundle row ids, union explicit table ids, minus the declared-absent ids) and
  applies the strict default to any member the table does not name.
- A global ZERO-RED check joins the existing global zero-error and zero-vacuous
  checks. All three are row-driven, so they hold for a row no table, manifest or
  derivation ever considered.

## 6. Red witnesses

The rule (CLAUDE.md:284): a test counts only if demonstrated RED without the
behaviour and GREEN with it, red against the DANGEROUS state rather than merely
against the absent feature; and a witness for a CLASS must redden under at least
TWO structurally different members of it (CLAUDE.md:348).

### The lab, and why it is shaped this way

The assertion program is written by the harness to `<evidence>/m2-assert.mjs`
before any mode branch, so a `--self-test` run leaves it on disk whatever the
outcome. Both the PRE-fix program (extracted from `origin/main`'s harness,
verbatim) and the POST-fix program (from this branch) are extracted that way and
driven over the SAME crafted bundles.

Each program is driven against ITS OWN arm's expectation document, which is the
honest comparison: the harness as it was against the harness as it is. My first
attempt fed the pre-fix program my NEW derived table, which made the pre-fix
main arm look like it already caught the defect; the correction is `probe2`,
and it changed the main-arm pre-fix result from exit 1 to exit 0. Recording that
because the wrong version was momentarily convincing.

The manifest under test is M3-P6's twelve-gate one (`brief-drift` included),
read from `origin/claude/m3-p6-delivery-role-briefs`, because that is the live
case: the gate that arrives at PR #105.

### CONTROL FIRST, and it caught a lab bug

The control ran before any dangerous state, and it failed for a reason that had
nothing to do with the subject: `run.sh` derived its own directory from `$0`,
which under `source` is the shell, so every path resolved under `/bin` and BOTH
programs exited 1. That is precisely the wrong-scope trap CLAUDE.md:316 records,
and without the control it would have read as "the pre-fix program already
rejects this". Recorded rather than quietly fixed.

Corrected, the controls are green on both arms and on both programs, so nothing
below is an always-red assertion:

```
control-pr-briefdrift-GREEN                    arm=pr    PRE-FIX exit=0   POST-FIX exit=0
   post: m2-assert (PR bundle): OK. 12 gate record(s) match section 1.4; 12 gate(s) asserted (11 from an explicit table row, 1 under the default required-green: brief-drift); 0 asserted absent; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.
control-main-12gate-fair                       arm=main  PRE-FIX exit=0   POST-FIX exit=0
   post: m2-assert (main bundle): OK. 6 gate record(s) match section 1.4; 6 gate(s) asserted (6 from an explicit table row, 0 under the default required-green); 6 asserted absent: credential-token, citations, scope, clause-map, red-witness, brief-drift; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.
```

The second line is also the M3-P6 ordering evidence: with the twelve-gate
manifest, `brief-drift` defaults to required-green on the PR arm and is derived
into the main arm's absent list, with no edit to M3-P6 and no edit to any table.

### The three members, both arms, captured exit codes

| member | what makes it structurally different | caught by |
|---|---|---|
| 1 | declared in `gates.manifest.json`, no table row | the MANIFEST leg of the union, and zero-red |
| 2 | in NEITHER manifest nor table, present only as a bundle row | the ROWS leg of the union, and zero-red |
| 3 | NAMED in the table, `required: false`, alternates admit red | zero-red ALONE |

Member 3 is the one that isolates zero-red: neither leg of the union helps,
because the gate has an explicit spec that permits its status. Post-fix it
produces exactly ONE finding, which is that check and nothing else.

```
m1-pr-briefdrift-RED                           arm=pr    PRE-FIX exit=0   POST-FIX exit=1
m1-main-briefdrift-RED-fair                    arm=main  PRE-FIX exit=0   POST-FIX exit=1
m2-pr-undeclared-row-RED                       arm=pr    PRE-FIX exit=0   POST-FIX exit=1
m2-main-undeclared-row-RED                     arm=main  PRE-FIX exit=0   POST-FIX exit=1
m3-pr-optional-gate-admits-RED                 arm=pr    PRE-FIX exit=0   POST-FIX exit=1
m3-main-optional-gate-admits-RED               arm=main  PRE-FIX exit=0   POST-FIX exit=1
```

Six probes, six times pre-fix exit 0 against a bundle carrying a RED gate. That
is the defect, measured, on both arms.

Full captured output of four of them:

```
########## m1-pr-briefdrift-RED
--- PRE-FIX ---
m2-assert (PR bundle): OK. 12 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.
--- POST-FIX ---
m2-assert (PR bundle): FAIL with 3 finding(s):
  - [brief-drift] expected status green, observed red This gate has NO row in the expectations table, so it was asserted under the default for a declared-but-unlisted gate, which is deliberately the STRICT one (required, green). If this gate is legitimately allowed another status, that is a row to add to the table in scripts/m2-exit-test.sh, not a default to loosen.
  - [brief-drift] is a REQUIRED gate but its status is red, not green This gate has NO row in the expectations table, so it was asserted under the default for a declared-but-unlisted gate, which is deliberately the STRICT one (required, green). If this gate is legitimately allowed another status, that is a row to add to the table in scripts/m2-exit-test.sh, not a default to loosen.
  - 1 gate(s) reported RED: brief-drift. No expectation in section 1.4 permits a red gate, on either bundle.

########## m1-main-briefdrift-RED-fair
--- PRE-FIX ---
m2-assert (main bundle): OK. 7 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.
--- POST-FIX ---
m2-assert (main bundle): FAIL with 3 finding(s):
  - 1 gate(s) reported RED: brief-drift. No expectation in section 1.4 permits a red gate, on either bundle.
  - [brief-drift] expected to be ABSENT from this bundle (not run) but has a summary record
  - [brief-drift] expected to be ABSENT from this bundle (not run) but has a result.json on disk

########## m2-pr-undeclared-row-RED
--- PRE-FIX ---
m2-assert (PR bundle): OK. 13 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.
--- POST-FIX ---
m2-assert (PR bundle): FAIL with 3 finding(s):
  - [totally-undeclared-gate] expected status green, observed red This gate has NO row in the expectations table, so it was asserted under the default for a declared-but-unlisted gate, which is deliberately the STRICT one (required, green). If this gate is legitimately allowed another status, that is a row to add to the table in scripts/m2-exit-test.sh, not a default to loosen.
  - [totally-undeclared-gate] is a REQUIRED gate but its status is red, not green This gate has NO row in the expectations table, so it was asserted under the default for a declared-but-unlisted gate, which is deliberately the STRICT one (required, green). If this gate is legitimately allowed another status, that is a row to add to the table in scripts/m2-exit-test.sh, not a default to loosen.
  - 1 gate(s) reported RED: totally-undeclared-gate. No expectation in section 1.4 permits a red gate, on either bundle.

########## m3-pr-optional-gate-admits-RED
--- PRE-FIX ---
m2-assert (PR bundle (deploy required:false, alternates admit red)): OK. 12 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.
--- POST-FIX ---
m2-assert (PR bundle (deploy required:false, alternates admit red)): FAIL with 1 finding(s):
  - 1 gate(s) reported RED: deploy. No expectation in section 1.4 permits a red gate, on either bundle.
```

### A member that did NOT redden, recorded because a null result is evidence

My first attempt at member 3 widened the alternates of `coverage`, which is
`required: true`. Both programs rejected it (exit 1 both sides), because the
pre-existing required-green rule at scripts/m2-exit-test.sh:396 catches it
regardless of the alternates. So the hole for a NAMED gate is specifically the
`required: false` one, and `deploy`, `migrations` and `credential-token` are the
three rows that carry `required: false` today. That is why member 3 uses
`deploy` and not `coverage`, and it is a narrower claim than "a named gate can
hide a red".

```
m2-pr-named-alternates-admit-red               arm=pr    PRE-FIX exit=1   POST-FIX exit=1
   pre : m2-assert (...): FAIL with 1 finding(s):   - [coverage] is a REQUIRED gate but its status is red, not green
```

### The committed guards, and the mutation test that found a hole in them

The lab above is evidence, not a guard. The permanent guards are two tests in
test/m2-exit-test.test.ts:1182, and they were mutation-tested rather than
trusted.

**The first defang was WORTHLESS and is recorded as such.** Restoring the whole
pre-fix harness reddened both guards, but with
`m2-exit-test: unknown option "--print-expect"`: red against the ABSENT FEATURE,
not against the DANGEROUS STATE, which is exactly what the stronger red-witness
form at CLAUDE.md:289 forbids. It proved nothing. The real defangs are surgical:
each removes ONE mechanism and leaves the rest, including the hook.

**The second round found a real hole.** With the derived union collapsed back to
the hand-written table alone (DEFANG A, the pre-fix direction), BOTH guards
stayed GREEN:

```
=================== DEFANG A: expected set = the hand-written table only (the pre-fix direction)
(*) the main bundle's absent list is DERIVED from the manifest ... (45.237052ms)
(*) a RED gate is rejected on BOTH bundles under three structurally different shapes ... (1005.986057ms)
```

(The two `(*)` marks are PASS marks; see the transliteration note at the end.)

The cause is the one this repository keeps paying for, one level up from where I
was looking. Members 1, 2 and 3 all carry a RED row, so the global zero-red
backstop satisfied every one of them on its own, and the DERIVATION was guarded
by nothing. Two mechanisms, one witness between them.

The fix is members 4 and 5, which carry NO red row and are therefore only ever
rejected by the derivation: a manifest gate with no table row reporting
not-applicable, and one with no record at all. Each asserts that the rejection
did NOT come from zero-red (`assert.doesNotMatch(output, /reported RED/)`), so
the isolation cannot silently lapse again.

With those added, all three surgical defangs redden, each through a DIFFERENT
assertion, which is what makes the two mechanisms independently guarded:

| defang | what it removes | result | which assertion reddened |
|---|---|---|---|
| A | the derived union collapses to the explicit table | RED | member 4: "a manifest gate with no table row reporting not-applicable must be REJECTED" |
| B | the global zero-red check never fires | RED | member 3: "a RED gate must be rejected even when the table names it, marks it required:false and lists red among its permitted alternates" |
| C | the main arm's absent list is hand-written again | RED | both guards: "the derived absent list is [...]. A gate in neither list is asserted by nothing on this arm" |

Captured, defang A after the fix (contrast with the green above):

```
=================== DEFANG A: expected set collapses to the hand-written table only (the pre-fix direction)
(x) a RED gate is rejected on BOTH bundles under three structurally different shapes ... (816.8135ms)
  AssertionError [ERR_ASSERTION]: [pr] a manifest gate with no table row reporting not-applicable must be REJECTED: it is asserted under the default required-green, and accepting it is how a silently skipped gate reads as legitimately N/A: m2-assert (PR bundle): OK. 12 gate record(s) match section 1.4; 11 gate(s) asserted (11 from an explicit table row, 0 under the default required-green); 0 asserted absent; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.
```

Defang procedure note: `git checkout --` was NOT used at any point, per
CLAUDE.md:627. Each defang is a plain write over the file and each restore is
`git show HEAD:scripts/m2-exit-test.sh > scripts/m2-exit-test.sh`, with
`git status --porcelain` empty afterwards each time.

### Consequences of the fix that fell on EXISTING tests

Three tests that already existed went red on the first run of the change, and
the cause is a real coupling rather than an accident:

- test/m2-exit-test.test.ts:332, test/m2-exit-test.test.ts:906 and
  test/m2-exit-test.test.ts:1020 handed the assertion program the repository's
  REAL eleven-gate `gates.manifest.json` beside a bundle carrying ONE row. That
  was only ever coherent because the manifest argument was INERT: it was read
  solely to recompute `summary.manifestSha256`, and those crafted summaries set
  no such field. Making the manifest load-bearing turns the pairing into ten
  genuinely missing records.

  Each now declares a manifest describing the bundle it actually built, via a
  new `manifestFor` helper. This is the coupling CLAUDE.md:214 names: work that
  extends a registry may have to edit the test that over-asserts on it.

## 7. The registry

Two behaviours registered in `test/behaviors.json`, BY NAME, appended, with no
count anywhere asserting over the registry (CLAUDE.md:201):

- `m2-exit-main-absent-list-derived-from-manifest`
- `m2-exit-red-gate-rejected-on-both-bundles`

## 8. Gate runs after merging origin/main at bb8f656

Merged `origin/main` (bb8f656) into the branch because `git diff --name-only
origin/main..HEAD` was showing five files I never touched: the branch was cut at
3ff2023 and main had advanced by one commit (#106). After the merge the changed
set is exactly my five files:

```
$ git diff --name-only origin/main...HEAD
delivery/work-history/exit-test-assertion-direction.md
scripts/m2-exit-test.sh
test/behaviors.json
test/gate-registry.test.ts
test/m2-exit-test.test.ts
```

Preflight after the merge, all captured:

```
$ npm run build                                   exit=0, git status clean
$ node scripts/render-agent-rules-gates.mjs --check exit=0
   agent-rules-drift: green (17 rendered gate rows compared)
$ git add -A && node scripts/check-authored-bytes.mjs exit=0
$ node -e '/^claude\/m[0-9]+-p[0-9]+-/.test(branch)'  false  (correct: non-phase branch)
```

Gate runs, raw:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only citations --evidence <scratch> --base origin/main --head HEAD
gates: declared 1 applicable 0 verdict 0 green 0 red 0 not-applicable 1 error 0 vacuous 0
exit=21
  citations/result.json: not-applicable, "precondition citations-diff-touches-documents
  evaluated and unmet: no changed path under delivery/plan/, delivery/verification/,
  delivery/decisions/, delivery/tuition/, delivery/requirements/, delivery/STATE.md"
```

citations is legitimately not-applicable here: `delivery/work-history/` is not in
its trigger list. Exit 21 is the runner's "no applicable gate" code, not a red.

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode local-only \
    --evidence <scratch>
gates: declared 4 applicable 3 verdict 3 green 3 red 0 not-applicable 0 error 1 vacuous 0
gates: 1 gate(s) reported error: suite
exit=21
  suite/result.json: error, "gate suite requires --base, which was not supplied"

$ ... same, with --base origin/main
gates: declared 4 applicable 4 verdict 4 green 3 red 1 not-applicable 0 error 0 vacuous 0
gates: 1 gate(s) reported red: suite
exit=1

$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --evidence <scratch> --base origin/main --head HEAD
gates: declared 12 applicable 6 verdict 6 green 5 red 1 not-applicable 5 error 1 vacuous 0
gates: 1 gate(s) reported error: scope
exit=21
```

TWO OPEN ITEMS, being investigated now, NOT yet explained:

1. `suite` RED under `--base origin/main`. The suite gate compares the behaviors
   registry against the merge base, and this branch APPENDS two entries to
   `test/behaviors.json`, so a red here may be the registry comparison rather
   than a failing test. `npm test` itself is exit 0 with 593 pass and 0 skipped.
2. `scope` ERROR rather than not-applicable. Expected not-applicable on a
   non-phase branch (branch-matches unmet). An error is a different thing and
   must be read, not assumed.

Neither is called settled until its result record has been read.

### Both open items closed

1. `suite` RED was MY defect, not a pre-existing one. The behaviors registry
   requires each entry's description to be the test's name VERBATIM ("resolves by
   name", CLAUDE.md:280), and I had written prose summaries instead:

   ```
   suite/result.json: red | 2 finding(s): behavior
   m2-exit-main-absent-list-derived-from-manifest does not resolve: no reported
   test is named "the main bundle expectation derives its absent list from the
   manifest, so a newly declared gate it does not run is asserted absent"; ...
   ```

   Fixed by setting all three descriptions to the exact test names. Re-run:

   ```
   $ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode local-only \
       --evidence <scratch> --base origin/main
   gates: declared 4 applicable 4 verdict 4 green 4 red 0 not-applicable 0 error 0 vacuous 0
   gates: every applicable gate is green
   exit=0
   ```

2. `scope` ERROR was MY invocation, not a defect: `gate scope requires --phase,
   which was not supplied`. CI supplies one, derived from the head ref by the
   workflow's sed, which for a non-phase branch passes the branch through
   unchanged. Reproducing that:

   ```
   $ PHASE=$(printf '%s' "$BR" | sed -E 's#^(claude/)?(m[0-9]+-p[0-9]+).*#\2#')
   claude/exit-test-harness-assertion-direction
   $ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
       --evidence <scratch> --base origin/main --head HEAD --phase "$PHASE"
   gates: declared 12 applicable 6 verdict 6 green 6 red 0 not-applicable 6 error 0 vacuous 0
   gates: required gate(s) not applicable: citations, scope, red-witness
   exit=20
     manifest-self-check green    credential-token  not-applicable
     coverage            green    citations         not-applicable
     credential-scrub    green    scope             not-applicable
     suite               green    deploy            not-applicable
     clause-map          green    migrations        not-applicable
     agent-rules-drift   green    red-witness       not-applicable
   ```

   Zero red, zero error. The three not-applicable required gates are the
   diff-scoped ones and each is legitimately unmet on this branch: `scope`
   because the branch is deliberately non-phase, `citations` because
   `delivery/work-history/` is not in its trigger list, `red-witness` because the
   diff touches no `src/` or `bin/` path. Runner exit 20 is "required gate(s) not
   applicable"; the harness's assertion program is what decides that, and under
   DR-0018 it accepts each of the three with an evaluated, unmet precondition.

## 9. The REAL harness, both bundles, end to end

The integration check: the shipped harness, the real repository, both changes
live, no lab. BOTH arms, because T-009.

```
$ scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD \
    --phase claude/exit-test-harness-assertion-direction <evidence>
HARNESS PR BUNDLE exit=0
m2-assert (PR bundle): OK. 11 gate record(s) match section 1.4; 11 gate(s) asserted (11 from an explicit table row, 0 under the default required-green); 0 asserted absent; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.
m2-green: red-witness GREEN with 4 unit(s) against M2-P2 merged diff 1b6f0963b62f^..1b6f0963b62f (real history)
m2-green: scope GREEN with 2 unit(s) against scratch repo: declaration governs claude/m2-p4-scope-auditor, diff touches only src/a.ts and src/b.ts
m2-green: citations GREEN with 1 unit(s) against scratch repo: changed delivery/plan/fixture.md cites src/target.ts:1 which resolves
m2-green: OK. 3 diff-scoped gate(s) demonstrated green on a triggering state.
m2-exit-test: OK. evidence in <evidence>

$ scripts/m2-exit-test.sh --no-build --bundle main <evidence>
HARNESS MAIN BUNDLE exit=0
m2-assert (main bundle): OK. 6 gate record(s) match section 1.4; 6 gate(s) asserted (6 from an explicit table row, 0 under the default required-green); 5 asserted absent: credential-token, citations, scope, clause-map, red-witness; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.
m2-exit-test: OK. evidence in <evidence>
```

### THE ORCHESTRATOR'S TEST OF WHETHER I CHANGED MORE THAN THE MECHANISM

The brief's follow-up said: on `main` today all eleven manifest gates are in the
PR table, so the derive-from-manifest design must change NOTHING on `main`, and
if the implementation makes `main` behave differently that is a signal of scope
creep. Two lines above settle it:

- PR arm: `11 gate(s) asserted (11 from an explicit table row, 0 under the
  default required-green); 0 asserted absent`. NOTHING defaulted.
- Main arm: `6 gate(s) asserted (6 from an explicit table row, 0 under the
  default required-green); 5 asserted absent`. NOTHING defaulted, and the five
  derived absent ids are the same five the hand-written list held, as a SET
  (`["credential-token","citations","scope","clause-map","red-witness"]` against
  the old `["red-witness","citations","scope","credential-token","clause-map"]`,
  which differ only in order).

And the runner invocation the harness records is byte-identical to the pre-fix
one, which is the direct evidence that the main bundle was not widened:

```
"command": "node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence main-bundle --base main --only manifest-self-check --only suite --only coverage --only credential-scrub --only deploy --only migrations"
```

Same six ids, same order, generated from `MAIN_ONLY_GATES` instead of written
out. Behaviour on `main` today is unchanged, measured on both arms.

### PREVENTIVE, NOT CORRECTIVE, on the main arm, and why I did not just document it

The brief's follow-up also recorded that the main arm's two hand-written copies
currently AGREE (`MAIN table NOT in --only: []`), so there is no live divergence
to repair and the work there is preventive. That matches my own measurement
above: `--only` (6) and `absent` (5) partition the eleven-gate manifest exactly.
It was offered as defensible to leave the duplication and document it instead.

I did not, and the reason is that the hazard is not speculative, it is SCHEDULED.
`brief-drift` is a twelfth manifest gate sitting in review at PR #105, and the
moment it merges it lands in NEITHER copy. A comment saying "keep these two in
sync" is the class of guard this repository has recorded failing twice (T-005,
T-006: a rule that depends on remembering does not survive a busy session), and
the counterfactual here is a COMMAND rather than a judgment, which
CLAUDE.md:306 says is exactly when to make it mechanical. Deriving the
complement costs one shell function and removes the possibility rather than
documenting it.

What I did NOT do is derive the `--only` list itself, for the measured reason in
section 2: `clause-map` is `required` with no precondition and is still
deliberately excluded, so no rule reproduces the six-id set, and deriving it
would widen what a push to `main` runs.

### THE EXTRACTION PHANTOM, avoided by construction

The brief's follow-up warned that a lazy regex over the `--only` list picks up
the words "is" and "to" out of prose in the surrounding comments, and that a diff
against those phantoms would look like a finding. My extractions cannot pick
them up: the tables are read by `JSON.parse` of the block, and the gate set is
read from `MAIN_ONLY_GATES="..."` anchored at line start with a quoted value.

This is more than luck, because a reader in the repository WAS doing it the
scrapeable way. test/gate-registry.test.ts:406 derived the push arm by matching
`/--only ([a-z0-9-]+)/g` over a slice of the harness text. My change removed the
literal flags it was scraping and the test went red, which is how I found it (see
below). Its replacement reads the single `MAIN_ONLY_GATES` declaration, which is
both phantom-proof and strictly closer to that test's own stated intent of
"DERIVED, NOT ASSIGNED".

### THE ADJACENT DEFECT: are the per-gate `expect` strings CORRECT?

The brief's follow-up explicitly did not check whether a row PRESENT carries the
RIGHT expectation, said it is inside the mechanism's blast radius, and left the
scope call to me. I put it IN scope and checked it, rather than excluding it.

Every row of every arm, cross-checked against the manifest entry it names
(both resolutions of the per-run scope placeholder):

```
=== pr(phase)                                        === main
  manifest-self-check  expect=green            req=true    manifest-self-check  expect=green          req=true
  red-witness          expect=green|not-applicable req=true suite              expect=green          req=true
  suite                expect=green            req=true    coverage            expect=green          req=true  <== (see below)
  scope                expect=green            req=true    credential-scrub    expect=green          req=true
  citations            expect=green|not-applicable req=true deploy             expect=not-applicable req=false
  coverage             expect=green            req=true  <== (see below)
  clause-map           expect=green            req=true    migrations          expect=not-applicable req=false
  credential-scrub     expect=green            req=true
  deploy               expect=not-applicable   req=false
  migrations           expect=not-applicable   req=false
  credential-token     expect=green|not-applicable req=false
=== pr(non-phase): identical except scope expect=green|not-applicable
```

RESULT: no defect. Every `required` flag agrees with the manifest's
`applicability`, no row admits `red` or `error`, and every row admitting
`not-applicable` names a gate that HAS a precondition and so can legitimately
report it.

The one row the cross-check flagged, `coverage`, is correct and deliberately
STRICTER than its precondition permits. Its precondition is a file-exists on
delivery/requirements/migration-table.md:1, which `git ls-files --error-unmatch`
confirms is tracked at this head, so the precondition is met on any checkout
that carries that file; a not-applicable `coverage` would mean the inventory had
gone missing, and failing on that is right. I have not established that the file
can never be moved or renamed, only that `expect: green` is the correct row while
it is tracked. Asserting the converse
direction would redden a correct row, so the new guard asserts one direction
only and says so.

That check is now permanent, as
`m2-exit-expect-row-admits-only-reachable-statuses`, red-witnessed under two
structurally different members: widening a no-precondition gate's row
(`clause-map`) to admit not-applicable, and widening a row (`suite`) to admit
red. Both redden; the test is green as written.

### A SITE MY OWN DERIVATION MISSED, found by execution rather than by grep

Recorded because a missed site is exactly what section 4 is for, and this one was
NOT in my `git grep -ln 'summary\.json'` enumeration.

test/gate-registry.test.ts:406 reads the main bundle's gate set out of the
harness, to derive which registry entries should declare `events: [push]`. It
does not read a bundle summary, so no search for `summary.json` could ever have
found it; it surfaced only when the full suite went red after my change. That is
the fourth reader of this gate set, and it is the same lesson as CLAUDE.md:206:
a site no grep could see was found only by execution.

Its fix is one line of intent-preserving change, red-witnessed: renaming
`MAIN_ONLY_GATES` in the harness makes it fail loudly with "scripts/
m2-exit-test.sh no longer declares MAIN_ONLY_GATES", rather than silently
deriving an empty set. Verified: 13 tests, 13 pass with the declaration present;
the named test red without it.

## 10. The complete suite sentence

A bare "N pass, exit 0" is an incomplete sentence in this repository
(CLAUDE.md:642). All three axes measured at this head, on a clean tree after
`npm run build`:

| toolchain | build state | invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|---|---|
| node v26.6.0 (fetched floor) | `dist/` built | `npm test` | 593 | 593 | 0 | **0** | 0 |
| node v26.6.0 (fetched floor) | `dist/` built | bare `node --test` | 595 | 595 | 0 | **0** | 0 |
| node v22.22.2 (default, `bash -lc`) | `dist/` built | `npm test` | 593 | 591 | 0 | **2** | 0 |

The three numbers are consistent with the deltas CLAUDE.md:677 records and not
averaged: the bare invocation adds the two `sandbox/test/greet.test.js` fixtures
that `package.json`'s test pattern excludes, and the default toolchain skips the
two floor-gated `doctor` tests. Both deltas are 2, and they are different pairs.

Baseline for comparison, measured on this branch before any change (node
v26.6.0, `dist/` built, `npm test`): 590 tests, 590 pass, 0 skipped. The
difference is exactly the three tests this change adds.

`npm ci` exit 0; `npm run build` exit 0 with `git status --porcelain` empty
afterwards; `node scripts/check-authored-bytes.mjs` exit 0 (run with the tree
staged, since it exits 2 without checking on a dirty tree and that reads like a
pass); `node scripts/render-agent-rules-gates.mjs --check` exit 0.

## 11. Files changed, and the scope position

```
$ git diff --name-only origin/main...HEAD
delivery/work-history/exit-test-assertion-direction.md
scripts/m2-exit-test.sh
test/behaviors.json
test/gate-registry.test.ts
test/m2-exit-test.test.ts
```

The branch is deliberately NOT a phase branch, so the scope gate derives no
phase id and reports not-applicable with an evaluated, unmet precondition
(captured in section on gate runs). Three of the five files are the two standing
pre-authorized extras plus the harness itself;
`test/gate-registry.test.ts` is the fourth reader described above, edited because
this change removed the literal text it was scraping. Named here rather than left
for a reviewer to notice.

## 12. The claim grep

Run in BOTH forms before submitting, per the dispatch brief: the line-based form
from CLAUDE.md:338, and a wrap-insensitive form that flattens whitespace first,
because a claim split across a line break is invisible to the first.

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/exit-test-assertion-direction.md
$ tr '\n' ' ' < <same file> | tr -s ' ' | grep -oEi '.{70}(cannot be|impossible|...).{70}'
```

The second form found nothing the first missed on this document, but it is
recorded as run because a null result from an unrun check is not a null result.

Disposition of every hit: four are verbatim quotations of other files (the
workflow comment, the gate-registry test's divergence map) and are marked as
quotes; five carry an adjacent captured command in the same section; and the
remaining ones were CHANGED:

- **"m1-exit-test.sh never invokes the gate runner" was FALSE** and is corrected
  in section 3 with the measurement that falsified it. It invokes the CLI at
  fifteen-odd call sites; what it never invokes is the `gates` subcommand.
- **"so it always holds"** about the coverage precondition is restated as a claim
  about the current head rather than about the future.
- **"a row the table does not name is never asserted on"** now names both what
  settles it structurally and what settles it empirically, instead of standing
  as a bare universal.

## 13. Open, and explicitly NOT closed by me

- test/coverage-gate.test.ts:190 pins `assert.equal(coverageRow?.units, 115)`, a
  COUNT over the coverage inventory. If that inventory is append-only this is the
  by-count-not-by-name shape CLAUDE.md:201 forbids. Different mechanism, not
  touched, reported for the orchestrator.
- The other half of R-094 (CLAUDE.md:233): a gate declared only in
  `gate-registry.yaml` still does not run in CI, because the harness passes
  `--manifest` on both arms. My derived set is over the MANIFEST, which is what
  runs. Closing that is a separate edit, and test/gate-registry.test.ts:1056
  asserts `--registry` is absent from the harness, so it is not something to do
  incidentally here.
- Whether the main bundle SHOULD run `brief-drift` (and `agent-rules-drift`) is a
  policy question about the push arm's cost, not an assertion-direction question.
  I did not widen `MAIN_ONLY_GATES`. What changed is that whatever it does not
  run is now asserted absent.
