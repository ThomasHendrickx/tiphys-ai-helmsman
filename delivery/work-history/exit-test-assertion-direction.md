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
6. **I had not, WHEN THIS LINE WAS WRITTEN, run either full bundle end to end.**
   Running the PR bundle runs the whole gate set, which runs this repository's
   own suite in a subprocess; test/m2-exit-test.test.ts:38 records that a test
   doing so is re-entered by the suite it invoked. The arms are exercised here
   through the shipped assertion program driven over crafted bundles, and through
   the real resolved expectation documents of both arms.

   **CORRECTED, and the correction is the point of this item rather than a
   footnote to it (CR-H-3).** This exclusion is STALE at HEAD and was left
   standing when the runs landed. Section 9 of this document
   (delivery/work-history/exit-test-assertion-direction.md:862) records BOTH full
   bundles run end to end against the real repository, `HARNESS PR BUNDLE exit=0`
   and `HARNESS MAIN BUNDLE exit=0`, and section 9a records a runner-produced
   bundle as well. The commit order is what produced it: the exclusion was
   written in `77bbcdb` and the runs landed in `4d6cda6`, and nothing revisited
   the first. It understates the work rather than overstating it, so no reader is
   told something was checked that was not; the cost is the opposite, a reviewer
   whose FIRST check is this section (CLAUDE.md:326) is sent looking for evidence
   that is already three sections further down. The residual exclusion is real
   and narrower: neither bundle is run end to end FROM THE SUITE, for the
   re-entrancy reason above, and CI remains the authority for that.

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

FOUR behaviours registered in `test/behaviors.json`, BY NAME, appended, with no
count anywhere asserting over the registry (CLAUDE.md:201):

- `m2-exit-main-absent-list-derived-from-manifest`
- `m2-exit-red-gate-rejected-on-both-bundles`
- `m2-exit-expect-row-admits-only-reachable-statuses`
- `m2-exit-zero-red-reads-rows-not-counts`

Each entry's description is the test's name VERBATIM, which is what "resolves by
name" means to the `suite` gate; writing a prose summary instead is what reddened
it once (section 8).

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
   registry against the merge base, and this branch APPENDS four entries to
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

## 9a. THE CASE THE FIX EXISTS FOR, ON A REAL RUNNER-PRODUCED BUNDLE

Every witness up to here uses a bundle I built. That is legitimate for isolating
a mechanism and it is weaker than it could be, because a synthetic bundle is a
bundle whose shape I chose. The orchestrator also pointed out that CI on this
branch CANNOT exercise the case the fix exists for, since `brief-drift` is not in
`gates.manifest.json` on `main` and no bundle here has an unlisted manifest gate
in it. So the strongest evidence available is a real one, and it is constructible.

**The stand-in is not an analogue, it is the same shape.** `agent-rules-drift` is
a REAL script gate, declared in `gate-registry.yaml`, absent from
`gates.manifest.json`, `required` with NO precondition, and blocked from the
manifest by THIS VERY CIRCULARITY, in writing, at test/gate-registry.test.ts:1014.
It is what `brief-drift` will be: a required, precondition-free script gate added
to the manifest with no expectations row.

### Arm 1: a real GREEN bundle. The default fires and correctly accepts.

Manifest under test: three real manifest gates PLUS `agent-rules-drift`.
Expectations table: the three, and NOT `agent-rules-drift`. Runner: the real one.

```
$ node bin/tiphys.ts gates run --manifest <manifest+drift> --evidence <ev-green>
gates: declared 4 applicable 4 verdict 4 green 4 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
runner exit=0

the record the RUNNER wrote for the unlisted gate:
{ "gate": "agent-rules-drift", "status": "green", "units": 17,
  "detail": "CLAUDE.md's gate block matches gate-registry.yaml row for row (3 preflight step(s), 14 gate(s))" }

PRE-FIX : OK. 4 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.   exit=0
POST-FIX: OK. 4 gate record(s) match section 1.4; 4 gate(s) asserted (3 from an explicit table row, 1 under the default required-green: agent-rules-drift); 0 asserted absent; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.   exit=0
```

The post-fix line names `agent-rules-drift` as asserted under the default, on a
bundle the gate runner produced. The default is not a code path I reasoned about;
it is one that ran.

### Arm 2: the same gate genuinely RED. Pre-fix passes it, post-fix rejects it.

The red is real, not injected: a scratch `git worktree` at the same HEAD, with ONE
rendered row deleted from `CLAUDE.md`'s generated gate block, so the gate's own
script fails on its own terms. My own tree was not modified, and that is a
captured fact rather than an intention: the drift edit was applied to a path
under the scratch worktree, and after removing both scratch worktrees
`git status --porcelain` in my tree printed nothing.

```
$ git worktree remove --force <drifted> && git worktree remove --force <clean>
scratch worktrees removed
$ git status --porcelain
(no output)
```

No `git checkout --` was used anywhere in this round (CLAUDE.md:627).

```
CONTROL, undrifted scratch worktree, identical setup:
  agent-rules-drift: green (17 rendered gate rows compared)
  CLEAN tree gate exit=0
DRIFTED scratch worktree:
  agent-rules-drift: red (17 rendered gate rows compared)
  CLAUDE.md's gate block has drifted from gate-registry.yaml: the registry has a row the file does not: | `clause-map` | ... |
  DRIFTED tree gate exit=1

$ ( cd <drifted> && node <wt>/bin/tiphys.ts gates run --manifest <manifest+drift> --evidence <ev-red> )
gates: declared 4 applicable 4 verdict 4 green 3 red 1 not-applicable 0 error 0 vacuous 0
gates: 1 gate(s) reported red: agent-rules-drift
runner exit=1
   manifest-self-check  green units=8
   credential-scrub     green units=7
   clause-map           green units=34
   agent-rules-drift    red   units=17
  counts.red = 1
```

Same bundle, same table, same manifest, the two assertion programs:

```
=== PRE-FIX assertion program ===
m2-assert (real bundle, agent-rules-drift unlisted): OK. 4 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.
PRE-FIX exit=0

=== POST-FIX assertion program ===
m2-assert (real bundle, agent-rules-drift unlisted): FAIL with 3 finding(s):
  - [agent-rules-drift] expected status green, observed red (CLAUDE.md's gate block has drifted from gate-registry.yaml: the registry has a row the file does not: | `clause-map` | script | required | full, direct-pr | pull_request | clause-map rows checked |. Re-render with node scripts/render-agent-rules-gates.mjs --write) This gate has NO row in the expectations table, so it was asserted under the default for a declared-but-unlisted gate, which is deliberately the STRICT one (required, green). If this gate is legitimately allowed another status, that is a row to add to the table in scripts/m2-exit-test.sh, not a default to loosen.
  - [agent-rules-drift] is a REQUIRED gate but its status is red, not green ...
  - 1 gate(s) reported RED: agent-rules-drift. No expectation in section 1.4 permits a red gate, on either bundle.
POST-FIX exit=1
```

**A genuinely broken REAL gate, in a REAL runner-produced bundle, passed the exit
test before this change and fails it after.** The runner's own exit code was 1
and the assertion program returned 0, which is the defect in one line: the
harness records the runner's exit and does not act on it (`.github/workflows/
gates.yml:98` says so), so the assertion program was the only thing deciding, and
it was not looking.

Note the units: 17 on a red row. This is not a vacuous or skipped gate that the
existing zero-vacuous check would have caught. It examined seventeen rows, found
a real drift, said so, and was ignored.

## 9b. A TRUNCATING EDIT ON THIS FILE, and its blast radius

Recorded as an event rather than left in a commit subject.

WHAT HAPPENED. Writing the closing sections, I replaced the tail of this file
with a python `s[s.index("## 8. Suite"):]` slice. Sections 8 onward were the
target, but two later sections had been APPENDED after section 8 in earlier
commits (the post-merge gate runs, and the end-to-end harness runs). The slice
took them too. About 276 lines went in one edit.

HOW I NOTICED. Not by reading. The line count went from 973 to 819 across an
edit that only added material, and I checked `grep -n '^## '` because the
arithmetic was wrong. Recovered whole from `git show HEAD~1:<file>` and spliced
back with the two headings renumbered, which is only possible because the
sections had been COMMITTED as they were written. That is the beacon rule paying
for itself in the most literal way available: the durability discipline the
orchestrator pressed me on twice is what made a self-inflicted truncation a
five-minute repair instead of a rewrite from memory.

COULD IT HAVE HIT ANYTHING ELSE? Checked rather than assumed, because a
truncating edit that could hit several files is worth a check.

```
$ git log --format='%h %s' origin/main..HEAD --name-only
```

The replace-to-end pattern was used on ONE path, this work history, in five
commits. Every edit to a CODE file went through exact-string replacement or a
bounded python replace carrying an `assert old in s` guard, which fails loudly
rather than truncating. Positively verified rather than argued:

```
$ git diff --numstat origin/main...HEAD
1096  0  delivery/work-history/exit-test-assertion-direction.md
264  92  scripts/m2-exit-test.sh
4     1  test/behaviors.json
20    9  test/gate-registry.test.ts
458   3  test/m2-exit-test.test.ts
```

The deletion counts are the tell, and they are small and accounted for: 92 in
the harness is the two expectation blocks moved above argument parsing plus the
rewritten loop, 9 in gate-registry is the replaced `--only` scraper, 3 in the
exit-test tests is the three `manifest = fileURLToPath(...)` lines. No file shows
a deletion count consistent with a lost tail. Tails intact
(`scripts/m2-exit-test.sh` still ends `exit 0`, both test files end `});`,
`test/behaviors.json` parses, `bash -n` exit 0), and the full suite is green,
which a truncated source would not be.

## 9c. PRE-EMPTING THE SECOND REVIEW CONTRACT: does the check I ADDED read the rows?

The orchestrator flagged that a second reviewer will ask one question about this
fix: does the check I added actually read the rows, or can it pass when it should
fail. That is my own finding turned on my own work, it is the right question, and
it deserves an answer with a witness rather than a reassurance.

**The question is sharper than it looks, because a near-miss was already sitting
in the file.** scripts/m2-exit-test.sh:459 computes
`red: rows.filter(r => r.status === "red").length` and compares it with
`summary.counts.red`. That LOOKS like a zero-red check and is not: it asserts
only that the summary is self-consistent, so a bundle honestly reporting three
reds passes it. A guard whose condition does not test the property that matters
is green and worthless, and this one had been in place the whole time the defect
was live.

So the state that separates a row-reading check from a count-reading one is a
summary whose `counts.red` is 0 while a row says `red`. A count reader passes it;
a row reader cannot. That is now a committed test,
`m2-exit-zero-red-reads-rows-not-counts`, and it asserts on WHICH finding is
produced (`1 gate(s) reported RED: suite`), because a counts/rows mismatch also
trips the recount check and passing for the right reason is the whole point. Its
expectation names the gate and admits red, so neither the derived expected set
nor the required-green rule can be what rejects it.

Red-witnessed against the near-miss shape itself, by rewriting the check to read
the count instead of the rows:

```
### green as written
(*) the zero-red check reads the bundle's ROWS, not the summary's own red count ... (599.052114ms)
### DEFANG: make zero-red read the COUNT instead of the rows (the near-miss shape)
(x) the zero-red check reads the bundle's ROWS, not the summary's own red count ... (667.373322ms)
```

Every check this change adds now has a defang that reddens it, and they are
listed together so a reviewer can re-run them rather than take my word:

| check added | defang that reddens it | witnessed by |
|---|---|---|
| derived expected set (manifest leg) | collapse the union to the explicit table | member 4 (no red row involved) |
| derived expected set (rows leg) | same | member 2 |
| global zero-red | `redRows = []` | member 3 |
| global zero-red reads ROWS not counts | `redRows` built from `summary.counts.red` | the test above |
| derived main-arm absent list | hand-write the old five-id list | both arms of the absent guard |
| no row admits an unreachable status | widen `clause-map` to admit N/A; widen `suite` to admit red | two members |

## 10. The complete suite sentence

A bare "N pass, exit 0" is an incomplete sentence in this repository
(CLAUDE.md:642). All three axes measured at this head, on a clean tree after
`npm run build`:

| toolchain | build state | invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|---|---|
| node v26.6.0 (fetched floor) | `dist/` built | `npm test` | 594 | 594 | 0 | **0** | 0 |
| node v26.6.0 (fetched floor) | `dist/` built | bare `node --test` | 596 | 596 | 0 | **0** | 0 |
| node v22.22.2 (default, `bash -lc`) | `dist/` built | `npm test` | 594 | 592 | 0 | **2** | 0 |

The three numbers are consistent with the deltas CLAUDE.md:677 records and not
averaged: the bare invocation adds the two `sandbox/test/greet.test.js` fixtures
that `package.json`'s test pattern excludes, and the default toolchain skips the
two floor-gated `doctor` tests. Both deltas are 2, and they are different pairs.

Baseline for comparison, measured on this branch before any change (node
v26.6.0, `dist/` built, `npm test`): 590 tests, 590 pass, 0 skipped. The
difference is exactly the four tests this change adds.

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

---

# FIX ROUND 1: the main-arm witness was vacuous (CR-V01)

Status: IN PROGRESS. This section is the beacon. It is appended after each
command whose output it cites, before the next command runs.

Implementer: fix-round 1 on branch `claude/exit-test-harness-assertion-direction`,
starting from `21509d1`. Toolchain for every run below is the fetched floor
toolchain, node v26.6.0, and `node --version` is checked in the shell that runs
each command.

## FR1.0 Inputs

Two clean-room reviews were dispatched on `21509d1` and both died mid-walk. Their
PARTIAL reports were salvaged, uncommitted-by-them and carrying NO VERDICT, onto
branch `claude/reviews-harness-salvage`:

- `delivery/review/clean-room-harness-assertion-direction-vacuity.md` (contract H-B)
- `delivery/review/clean-room-harness-assertion-direction-fixround.md` (contract H-A)

They are not review outcomes and are not treated as such here. One finding in the
first is fully evidenced and is the subject of this round: CR-V01, the main-arm
half of the round's own headline witness test is vacuous. Three LOW findings in
the second (CR-H-1, CR-H-2, CR-H-3) are dispositioned in section FR1.7.

The test at issue is test/m2-exit-test.test.ts:1212, "a RED gate is rejected on
BOTH bundles under three structurally different shapes".

## FR1.1 The MECHANISM (fix-round contract item 1)

The INSTANCE is "five main-arm members of test/m2-exit-test.test.ts:1212 do not
discriminate". The dispatch brief offered a mechanism ("every one of them carries
a RED ROW"). I measured it and it is FALSE for two of the five, so I state a
different and stronger one.

**MECHANISM: a probe witnesses a check only when that check is its UNIQUE
rejecter. This test establishes uniqueness by excluding the competing rejecters
it NAMES IN ADVANCE, and the set of competing rejecters is a function of the ARM.
Naming one arm's competitors and then running both arms leaves the other arm's
competitor unexcluded, and the probe silently degrades from a witness into a
tautology.**

Concretely: the test's derivation-only probes carry
`assert.doesNotMatch(output, /reported RED/)`, which stood at line 1394 of
`test/m2-exit-test.test.ts` AT `21509d1` and is DELETED by this round, so it is
quoted here rather than cited (a citation must resolve at the audited head, and
this one no longer can). It excludes ONE competitor, the global zero-red check. On the PR arm zero-red
is the only competitor and the exclusion is sufficient. On the MAIN arm a
DIFFERENT competitor exists, section 8's declared-absent check
(scripts/m2-exit-test.sh:692), it is not named, and it rejects both main-arm
probes on its own.

The brief's proposed mechanism is refuted by measurement in FR1.2: main-arm
members 4 and 5 carry NO red row, and are still non-discriminating, because their
rejecter is section 8 rather than zero-red. A fix that only removed red rows
would therefore have left the main arm exactly as vacuous as it was.

The fix must consequently do TWO things, and doing only the first is what would
make this a fix of the instance:

1. add main-arm probes whose unique rejecter IS the derivation (FR1.3);
2. replace the hand-named exclusion with a MECHANICAL uniqueness assertion that
   does not require anticipating the competitor set at all (FR1.4).

## FR1.2 The derivation (fix-round contract item 2), part 1: every member classified

Lab: `$SCRATCH/FR1-lab`. The assertion program is not a replica, it is the
shipped one, extracted by the harness's own `--self-test` hook from
scripts/m2-exit-test.sh:417 and sha256-verified:

```
$ sha256sum harness-evidence/m2-assert.mjs
c06fdf264b35e2d6767a915fec5615a23e967bebee51b36b71940c03abd6b531  harness-evidence/m2-assert.mjs
```

That is the same hash the salvaged contract-H-A reviewer recorded for the
post-fix program, so my extraction and its extraction agree.

The expectation documents are the REAL ones, produced by the shipped
`--print-expect` hook against a manifest of the real `gates.manifest.json` plus
one extra gate, exactly as `harnessCopy` (test/m2-exit-test.test.ts:1147) builds
it. Manifest gate count in the lab: 12 (11 real + `fixture-gate-with-no-table-row`).

Defang variants, each produced by an anchored single replacement that ABORTS
unless the anchor occurs EXACTLY once, and each `node --check`ed. The abort is
not an assertion about the tool, it is exercised in FR1.11 in both directions
(zero matches and many), each exiting 2 and writing no file:

| variant | anchor replaced | sha256 |
|---|---|---|
| `v-tableonly` | the whole union collapsed to `[...explicitById.keys()]` | `8d2cc914855fc58931f3bbb4abd9f5d2bee27ecadf834bf808a02a2c916b549b` |
| `v-nored` | `rows.filter((r) => r.status === "red")` becomes `[]` | `a9cb5f83ce995b8c5fae9eb434270af1f59a8a883d2e69f75650c02dfefd0f38` |
| `v-nosec8` | `for (const id of expect.absent ?? [])` becomes `for (const id of [])` | `09c71afd8ddbeb5a000376f59b888b62c9422312cab5fbb4b2dd4674269f4491` |

`v-tableonly` is the mutation this change must be witnessed against: the
derivation collapsed back to the hand-written table, which is the pre-fix
direction.

Command: `node drive.mjs`, which replicates the member construction of
test/m2-exit-test.test.ts:1212 and its `writeBundle`
(test/m2-exit-test.test.ts:1101) against those real documents. FULL output:

```
| arm | member | pristine | v-tableonly | v-nored | v-nosec8 |
|---|---|---|---|---|---|
| pr | control-healthy | 0 | 0 | 0 | 0 |
| pr | member-1 | 1 | 1 | 1 | 1 |
| pr | member-2 | 1 | 1 | 1 | 1 |
| pr | member-3 | 1 | 1 | 0 | 1 |
| pr | member-4 | 1 | 0 | 1 | 1 |
| pr | member-5 | 1 | 0 | 1 | 1 |
| pr | probe-X | 1 | 0 | 1 | 1 |
| main | control-healthy | 0 | 0 | 0 | 0 |
| main | member-1 | 1 | 1 | 1 | 1 |
| main | member-2 | 1 | 1 | 1 | 1 |
| main | member-3 | 1 | 1 | 0 | 1 |
| main | member-4 | 1 | 1 | 1 | 0 |
| main | member-5 | 1 | 1 | 1 | 0 |
| main | probe-X | 1 | 0 | 1 | 1 |
```

CR-V01 is CONFIRMED, independently of the salvaged review: every one of the five
main-arm members exits 1 under `v-tableonly`, so not one of them can see the
derivation disappear. The replica is cross-checked against the real test in FR1.5.

Now the classification that produces the mechanism, rather than restating the
instance. For each member, the finding list the PRISTINE program produced (a
member is a witness for a check only if that check is the ONLY entry in its
finding list):

| arm | member | rejected by |
|---|---|---|
| pr | member-1 | derivation (2 findings) AND zero-red |
| pr | member-2 | derivation (2 findings) AND zero-red |
| pr | member-3 | zero-red ALONE |
| pr | member-4 | derivation ALONE (2 findings) |
| pr | member-5 | derivation ALONE (1 finding) |
| main | member-1 | zero-red AND section 8 (2 findings) |
| main | member-2 | derivation (2 findings) AND zero-red |
| main | member-3 | zero-red ALONE |
| main | member-4 | section 8 ALONE (2 findings) |
| main | member-5 | section 8 ALONE (2 findings) |

Two things the brief's proposed mechanism does not predict and this one does:

- main member-2 DOES reach the derivation (its output carries the default-spec
  findings verbatim) and still fails to discriminate, because zero-red rejects it
  too. Reaching the check is not witnessing it.
- main members 4 and 5 carry NO red row at all. Their rejecter is section 8,
  which is why `v-nosec8` turns BOTH green together (exit 0 and exit 0), which is
  the salvaged reviewer's same-code-path observation reproduced.

## FR1.3 The derivation, part 2: two probes, and PROOF they differ

Probe X is the salvaged reviewer's constructed repair. I reproduced it rather
than assuming it (row `pr | probe-X` and `main | probe-X` above): pristine 1,
`v-tableonly` 0, on BOTH arms.

One witness is not a class (CLAUDE.md:380), so a second member is required, and
"structurally different" has to be MEASURED rather than asserted. The union at
scripts/m2-exit-test.sh:515 is a spread of THREE sources, so the two legs a
derivation probe can enter by are the MANIFEST leg and the ROWS leg. I built one
probe per leg and then defanged the legs SEPARATELY:

- `v-norows`: the union becomes `[...manifestIds, ...explicitById.keys()]`.
- `v-nomanifest`: the union becomes `[...rows.map((row) => row?.id), ...explicitById.keys()]`.

Probe X (ROWS leg): a gate declared in NEITHER the manifest NOR the table,
present only as a bundle row, reporting `not-applicable` with a valid evaluated
precondition, so section 4 is satisfied and no red, error or vacuous row exists
anywhere in the bundle.

Probe Y (MANIFEST leg): a gate this arm DOES run, with its expectations-table row
removed AND its record removed. Its id is reachable from `manifestIds` only: it
is not in the derived absent list, and with no record it is not in
`rows.map(...)` either.

Command: `node drive2.mjs`. FULL output:

```
| arm | probe | pristine | v-tableonly | v-norows | v-nomanifest | v-nored | v-nosec8 |
|---|---|---|---|---|---|---|---|
| pr | probe-X-rows-leg | 1 | 0 | 0 | 1 | 1 | 1 |
| pr | probe-Y-manifest-leg(credential-token) | 1 | 0 | 1 | 0 | 1 | 1 |
| main | probe-X-rows-leg | 1 | 0 | 0 | 1 | 1 | 1 |
| main | probe-Y-manifest-leg(migrations) | 1 | 0 | 1 | 0 | 1 | 1 |
```

That table is an ORTHOGONALITY PROOF, not a claim: Probe X dies when the ROWS leg
is removed and SURVIVES removal of the manifest leg; Probe Y does the exact
opposite. The salvaged reviewer's complaint about the old members 4 and 5 was
that they looked different and were one code path; these two are demonstrated to
be two, by a defang that separates them. Neither is affected by `v-nored` or
`v-nosec8`, so neither has a competing rejecter on either arm.

## FR1.4 The mechanical uniqueness assertion

Every finding either probe produces carries the default-spec reason string
(scripts/m2-exit-test.sh:509), measured:

```
### pr/probe-X-rows-leg
    findings: 2  ALL carry the default-spec signature: true
### pr/probe-Y-manifest-leg(credential-token)
    findings: 1  ALL carry the default-spec signature: true
### main/probe-X-rows-leg
    findings: 2  ALL carry the default-spec signature: true
### main/probe-Y-manifest-leg(migrations)
    findings: 1  ALL carry the default-spec signature: true
```

So the test can assert uniqueness MECHANICALLY: parse every `  - ` finding line
the program printed and require that they are ALL default-spec findings. That
assertion needs no advance knowledge of the competitor set, so it does not have
the arm-blindness that produced this defect. `doesNotMatch(/reported RED/)`
excludes one competitor a human thought of; "every finding is a derivation
finding" excludes all of them, including ones added later.

## FR1.5 The replica CROSS-CHECKED against the real test

FR1.2 and FR1.3 are driven by a replica of the member construction, so the
replica itself has to be checked or it is exactly the "a replica silently stops
matching" hazard this branch's own design argument names. It is checked by
defanging the SHIPPED harness and running the REAL test, twice, each defang
predicting a DIFFERENT first failure.

The harness was snapshotted with `cp` and restored with `cp`; no `git checkout --`
was used anywhere in this round (CLAUDE.md:659). Pristine sha256
`9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138`, verified
before and after every defang.

Cross-check 1, harness defanged with `v-tableonly`. Replica predicts pr members 1
to 3 still rejected and pr member-4 the first survivor:

```
$ node --test --test-name-pattern 'RED gate is rejected on BOTH bundles' test/m2-exit-test.test.ts
TEST EXIT=1
  AssertionError [ERR_ASSERTION]: [pr] a manifest gate with no table row reporting
  not-applicable must be REJECTED: ... m2-assert (PR bundle): OK. 12 gate record(s) match
  section 1.4; 11 gate(s) asserted (11 from an explicit table row, 0 under the default
  required-green); ...
```

Cross-check 2, harness defanged with `v-nosec8`. Replica predicts the PR arm
entirely unaffected and main member-4 the first survivor:

```
TEST EXIT=1
  AssertionError [ERR_ASSERTION]: [main] a gate the derived absent list covers must not carry
  a record on this bundle; ... m2-assert (main bundle): OK. 7 gate record(s) match section
  1.4; 6 gate(s) asserted ...; 6 asserted absent: credential-token, citations, scope,
  clause-map, red-witness, fixture-gate-with-no-table-row; ...
```

Both predictions hold, on both arms, so the replica is validated rather than
trusted.

## FR1.6 The change, and its red witnesses

The change is confined to test/m2-exit-test.test.ts and the one behaviors row
that names its title. **No production code changed**: the harness sha256 is
identical before and after this round. The defect was in the WITNESS, not in the
thing witnessed, which is why the fix is a test change and why it must itself be
witnessed.

Three things changed in that test:

1. The arm-conditional `derivationOnly` block is replaced by THREE probes built
   IDENTICALLY on both arms, so an arm can no longer end up with a probe set that
   asserts nothing. Probe 1 enters the expected set by the ROWS leg, probe 2 by
   the MANIFEST leg, probe 3 is the `brief-drift` shape (a manifest gate with no
   table row reporting not-applicable) which either leg reaches.
2. `assert.doesNotMatch(output, /reported RED/)` is replaced by a MECHANICAL
   uniqueness assertion: every itemised finding the program printed must carry
   the harness's own default-spec reason. That excludes every competing rejecter
   rather than the one a human anticipated.
3. The default-spec reason is DERIVED from the shipped harness by regex over its
   source rather than copied into the test, and failing to derive it is a hard
   failure. A reword of that message therefore reddens loudly instead of quietly
   making the uniqueness assertion vacuous.

The main-arm coverage the old members 4 and 5 genuinely provided (section 8's
declared-absent check) is KEPT, as a separately labelled pair of probes that
assert on the declared-absent message. It is not deleted, it is stopped from
being miscredited as a derivation witness.

### Red witness 1: the main arm, before and after, against the DANGEROUS state

The dangerous state is `v-tableonly`, the derivation collapsed back to the
hand-written table. Both test files were restricted to the main arm alone by one
anchored replacement (`["pr", "main"]` becomes `["main"]`), so the pr arm cannot
mask the result. OLD is the test at `21509d1` (sha256
`3fddb074ff06d0cb11e7278e32f8af5d40e70500a8620f0e0dd1efef32d3da29`), NEW is this
round's (sha256 `b08a0838195a6dc4cff673b6465e773c1abdef9cb59041092c096c3b16225dd4`).

```
| case                               | harness    | EXIT | 
|---|---|---|
| OLD-mainonly-pristine              | pristine   | 0 |
| OLD-mainonly-vtableonly            | tableonly  | 0 |
| NEW-mainonly-pristine              | pristine   | 0 |
| NEW-mainonly-vtableonly            | tableonly  | 1 |
| NEW-mainonly-vnorows               | norows     | 1 |
| NEW-mainonly-vnomanifest           | nomanifest | 1 |
```

Row 2 is CR-V01 stated as an exit code: the old test's main arm is GREEN with the
derivation removed. Row 4 is the fix. Rows 5 and 6 are the class: the main arm
now reddens under EACH leg separately, not only under the whole union.

The three failures, quoted from the runs:

```
NEW-mainonly-vtableonly
  AssertionError [ERR_ASSERTION]: [main] a bundle row for a gate declared in NEITHER the
  manifest nor the table, reporting not-applicable with a valid evaluated precondition, must
  be REJECTED under the strict default: its id reaches the expected set through the ROWS leg
  of the union, and nothing else in the bundle is wrong: m2-ass...

NEW-mainonly-vnorows
  AssertionError [ERR_ASSERTION]: [main] a bundle row for a gate declared in NEITHER the
  manifest nor the table, ... through the ROWS leg of the union, ...

NEW-mainonly-vnomanifest
  AssertionError [ERR_ASSERTION]: [main] a gate this bundle RUNS whose table row is gone and
  which produced NO record must be REJECTED: its id reaches the expected set through the
  MANIFEST leg alone, since with no record it is in no row and with no table row it is in no
  explicit spec: m2-assert (main bundle): OK. 5 gate record(s)...
```

### Red witness 2: the new uniqueness assertion is itself load-bearing

A guard whose condition does not test the property that matters is green and
worthless (CLAUDE.md:116), so the new uniqueness assertion needs its own witness,
and one witness is not a class. Two structurally different over-determinations,
each an anchored one-line edit to the TEST against the PRISTINE harness, so only
the uniqueness assertion can speak:

- U1, competitor = the global ZERO-RED check: an extra red row added to probe 1.
- U2, competitor = SECTION 8's declared-absent check: probe 1 rebuilt around the
  absent gate, which reconstructs the ORIGINAL CR-V01 defect shape (this is
  literally the old main-arm member 4) inside the new probe.

```
### U1 EXIT=1
AssertionError [ERR_ASSERTION]: [main] probe-1-rows-leg was rejected by 1 check(s) OTHER than
the derived expected set, so the derivation is not its unique rejecter and collapsing the
derivation back to the hand-written table would leave this probe red anyway:   - 1 gate(s)
reported RED: fixture-extra-red. No expectation in section 1.4 permits a red gate, on either
bundle.

### U2 EXIT=1
AssertionError [ERR_ASSERTION]: [main] probe-1-rows-leg was rejected by 2 check(s) OTHER than
the derived expected set, ...:   - [fixture-gate-with-no-table-row] expected to be ABSENT from
this bundle (not run) but has a summary record |   - [fixture-gate-with-no-table-row] expected
```

U2 is the important one: the guard added this round catches, by exit code and by
name, the exact defect that reached a pull request. The old guard did not, and
`doesNotMatch(/reported RED/)` is green against U2 because U2 carries no red row.

Test file restored from the pristine copy after every variant, sha256 re-verified
each time.

## FR1.7 Disposition of the three LOW findings from the salvaged contract-H-A review

### CR-H-1 (LOW): two documents assert, in the present tense, the blocker this change removes

ACCEPTED AND FIXED, not deferred. The salvaged reviewer proposed disposing of it
as an open-items line on the ground that editing the workflow would widen this
branch's surface. I disagree and I state why rather than skipping it silently:
both sentences are FALSE at HEAD, both are exactly what the next agent reads when
deciding whether a registry-only gate can be promoted, and this branch is what
made them false. CLAUDE.md's own repeated finding (T-005, T-006) is that a stale
written statement outlives the memory of the change that invalidated it and that
the answer is a mechanism, not a note in a section nobody re-reads. Both edits are
comment or message text with no behavioural effect, and the surface they add is
one file, .github/workflows/gates.yml:98.

The half of each statement that is now false was measured with the REAL gate id
rather than argued. A manifest carrying `agent-rules-drift` with NO row added to
the expectations table, driven through the shipped `--print-expect pr green` and
the shipped assertion program:

```
--- does the PR table name agent-rules-drift?  0
--- is it in the main arm's DERIVED absent list?  agent-rules-drift
--- agent-rules-drift green: EXIT=0
    m2-assert (PR bundle): OK. 12 gate record(s) match section 1.4; 12 gate(s) asserted
    (11 from an explicit table row, 1 under the default required-green: agent-rules-drift)
--- agent-rules-drift red: EXIT=1
    m2-assert (PR bundle): FAIL with 3 finding(s):
      - [agent-rules-drift] expected status green, observed red This gate has NO row in the
        expectations table, so it was asserted under the default for a declared-but-unlist...
--- agent-rules-drift not-applicable: EXIT=1
    m2-assert (PR bundle): FAIL with 2 finding(s):
      - [agent-rules-drift] expected status green, observed not-applicable ...
```

So an expectation row is not what a manifest gate requires any more, and
required-green is the right expectation for this gate specifically. Both comments
are rewritten to say the narrower thing that is still true: `agent-rules-drift` is
NOT in `gates.manifest.json`, so the runner never runs it and it produces no
bundle row, and neither leg of the derivation can reach a gate that has no row and
no manifest entry. The workflow step remains what executes it. Reason 1 of the
workflow comment (the hard-coded `--only` list on the push arm) was re-checked and
is unchanged and still true.

### CR-H-2 (LOW, observation): the expectations-row test hand-writes the two scope resolutions

ACCEPTED AND FIXED. The reviewer filed it as an observation; I treat it as a
defect because the branch's own design argument is that "a replica is the thing
that silently stops matching", and the test was carrying a two-string replica of
`resolve_scope_expect` (scripts/m2-exit-test.sh:108) while a pure hook for it was
already shipped and already used at test/m2-exit-test.test.ts:834.

Both resolutions are now derived through that hook, from a phase-branch input and
a non-phase input, and asserted DIFFERENT from each other, so a resolver collapsed
to a single value cannot leave the test quietly covering one case twice instead of
two.

What this does NOT cover, stated rather than implied: it derives the two
resolutions the phase-vs-non-phase distinction produces, and it does not enumerate
every string the function could ever return. A third resolution added later would
not be picked up by this test. That is unchanged from before and is bounded by the
row-driven zero-red check at run time, which is the reviewer's own argument and I
reproduce rather than repeat it: main member-3 in FR1.2 is rejected by zero-red
ALONE even under a table row that names the gate, marks it `required:false` and
lists red among its permitted alternates.

### CR-H-3 (LOW): one exclusion in the not-covered section is STALE at HEAD

ACCEPTED AND FIXED IN PLACE, at
delivery/work-history/exit-test-assertion-direction.md:492. Item 6 of section 4
said "I did not run either full bundle end to end", which is false at HEAD because
section 9 records both. The item is rewritten to say what it was true of (the
moment it was written), to point at the sections that superseded it, and to state
the residual exclusion that IS still true and is narrower: neither bundle is run
end to end FROM THE SUITE, for the re-entrancy reason, and CI remains the
authority there.

The reviewer's related MINOR is also fixed: section 7 said "Two behaviours
registered" and listed four, and section 8 said "APPENDS two entries". Both now
say four. The prose counts were stale from incremental writing: the list held
TWO ids when the sentence was written (`git show 5563b42:<work history> | grep -c
"^- .m2-exit-"` gives 2) and four at HEAD. All four resolve BY NAME at HEAD,
checked mechanically rather than by eye, in FR1.11.

## FR1.8 The complete suite sentence

Three axes, all named (CLAUDE.md:686, CLAUDE.md:708, CLAUDE.md:721).

TOOLCHAIN node v26.6.0 (the fetched floor toolchain, `node --version` checked in
the same shell), BUILD STATE `dist/` present, built by `npm run build` exit 0 with
a clean `git status` for tracked build output afterwards.

| invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|
| `npm test` | 594 | 594 | 0 | **0** | 0 |
| bare `node --test` from the repository root | 596 | 596 | 0 | **0** | 0 |

The two-test delta is the `sandbox/test/greet.test.js` fixture that
`package.json`'s `test` script pattern excludes, already recorded at
CLAUDE.md:731 and reproduced at `21509d1` by this branch's previous round and by
the salvaged contract-H-A reviewer. 594 is what CI and the `suite` gate mean.

The totals are UNCHANGED from `21509d1` (594 and 596), which is expected: this
round changed assertions inside existing `test()` blocks and renamed one; it added
and removed no `test()` block.

## FR1.9 The derivation, part 3: every other site of the same mechanism

The mechanism is "uniqueness of rejecter established by naming the anticipated
competitor". Its call sites are wherever a test drives the shipped assertion
program (a program with SIX independent rejecting checks, so over-determination is
possible) and then claims the rejection came from a particular one.

Enumeration command and FULL output:

```
$ git grep -n 'm2-assert' -- . | grep -v '^delivery/'
scripts/m2-exit-test.sh:41:#       once, below, to <evidence-dir>/m2-assert.mjs and reused) over two
scripts/m2-exit-test.sh:102:#   DR-0018 diff-scoped handling in m2-assert.mjs). A run is a phase-branch run
scripts/m2-exit-test.sh:140:# gate asserted. m2-assert.mjs DERIVES the set of gates it asserts on (see its
scripts/m2-exit-test.sh:175:#     (the diffScoped handling in m2-assert.mjs, unchanged).
scripts/m2-exit-test.sh:416:ASSERT="${evidence}/m2-assert.mjs"
scripts/m2-exit-test.sh:432:  console.error("m2-assert: --summary --evidence --expect --manifest are all required");
scripts/m2-exit-test.sh:456:  console.error(`m2-assert: ${expectRead.reason}`);
scripts/m2-exit-test.sh:466:  console.error(`m2-assert (${label}): FAIL: ${summaryRead.reason}`);
scripts/m2-exit-test.sh:498:  console.error(`m2-assert (${label}): FAIL: ${manifestRead.reason}`);
scripts/m2-exit-test.sh:720:  console.error(`m2-assert (${label}): FAIL with ${failures.length} finding(s):`);
scripts/m2-exit-test.sh:730:console.log(`m2-assert (${label}): OK. ${rows.length} gate record(s) match section 1.4; ` +
test/citation-gate.test.ts:1231:      // with precondition undefined, which is exactly what m2-assert rejects.
test/m2-exit-test.test.ts:143: * the harness's own m2-assert.mjs directly. `withPrecondition` controls whether
test/m2-exit-test.test.ts:325:    // Obtain the exact m2-assert.mjs the harness writes (it is emitted before any
test/m2-exit-test.test.ts:329:    const assertProg = join(harnessEvidence, "m2-assert.mjs");
test/m2-exit-test.test.ts:330:    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");
test/m2-exit-test.test.ts:840:/** Run the harness's shipped m2-assert.mjs over a bundle against an expect doc. */
test/m2-exit-test.test.ts:904:    const assertProg = join(harnessEvidence, "m2-assert.mjs");
test/m2-exit-test.test.ts:905:    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");
test/m2-exit-test.test.ts:1018:    const assertProg = join(harnessEvidence, "m2-assert.mjs");
test/m2-exit-test.test.ts:1019:    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");
test/m2-exit-test.test.ts:1238:    const assertProg = join(harnessEvidence, "m2-assert.mjs");
test/m2-exit-test.test.ts:1239:    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");
test/m2-exit-test.test.ts:1636:    const assertProg = join(harnessEvidence, "m2-assert.mjs");
test/m2-exit-test.test.ts:1637:    assert.ok(existsSync(assertProg), "the harness did not emit m2-assert.mjs");
```

Resolved to the `test()` blocks that actually INVOKE it, with the hit count per
block:

```
test/m2-exit-test.test.ts:310   hits=4  the assertion code accepts a diff-scoped gate that is not-applicable with an evaluated pre...
test/m2-exit-test.test.ts:865   hits=5  the PR bundle requires scope green: the harness assertion code rejects a scope not-applica...
test/m2-exit-test.test.ts:970   hits=5  the PR bundle accepts a scope not-applicable on a non-phase run and resolves scope differe...
test/m2-exit-test.test.ts:1212  hits=3  a RED gate is rejected on BOTH bundles ...
test/m2-exit-test.test.ts:1585  hits=3  the zero-red check reads the bundle's ROWS, not the summary's own red count, ...
```

`test/citation-gate.test.ts:1231` is a COMMENT mentioning the program, not an
invocation, so five blocks, not six.

Each was then read for the claim it makes, because over-determination is only a
defect where the claim is "rejected BY check C" rather than "rejected":

| block | claim it makes | uniqueness needed | how it is established | verdict |
|---|---|---|---|---|
| 310 (counterfactual 1) | rejected, and the rejection names the gate | no | `match(/red-witness/)` | SOUND, asserts exactly what it claims |
| 310 (counterfactual 2) | rejected (the test asserts an error row is rejected rather than accepted as diff-scoped) | no | exit code only | SOUND, it is an outcome claim, not a mechanism claim |
| 865 | rejected, and the rejection names `[scope]` | no | `match(/\[scope\]/)` | SOUND |
| 970 | accepted (an acceptance arm) | n/a | exit 0 | SOUND |
| 1212 | rejected BY the derived expected set | YES | was `doesNotMatch(/reported RED/)` | THE DEFECT, fixed here |
| 1585 | rejected BY a check that read the ROW | YES | `match(/1 gate\(s\) reported RED: suite/)`, the exact message | SOUND, it names the check positively |

The syntactic signature of the mechanism (an exclusion carrying the weight of a
uniqueness claim) was also grepped for directly:

```
$ grep -n "doesNotMatch" test/m2-exit-test.test.ts
test/m2-exit-test.test.ts:253:    assert.doesNotMatch(
test/m2-exit-test.test.ts:494:    assert.doesNotMatch(
test/m2-exit-test.test.ts:750:    assert.doesNotMatch(
test/m2-exit-test.test.ts:953:    assert.doesNotMatch(
test/m2-exit-test.test.ts:959:    assert.doesNotMatch(
```

Read individually: 253 excludes one failure mode and is IMMEDIATELY PAIRED with a
positive `assert.match` naming what did happen, which is the sound form and is the
form this round adopts; 494, 750, 953 and 959 are source-text and YAML assertions
over file contents, not probes over the assertion program, so the mechanism does
not apply to them.

**Conclusion of the derivation: block 1212 was the only live instance.** 1585 is
the same hazard already handled correctly, and it is worth naming because it shows
the sound form existed twenty lines of file away from the defect and was not
applied there.

## FR1.10 What this derivation did NOT cover (fix-round contract item 3)

Read this first (CLAUDE.md:326).

1. **The enumeration is by the LITERAL token `m2-assert`.** A test that obtained
   the assertion program by a computed path, or that re-implemented its checks
   rather than running it, would not appear. Bounded, not proved, by the harness
   writing exactly one literal name (scripts/m2-exit-test.sh:416) and by every
   invoking block above reaching it through the same `--self-test` hook. I did not
   search for re-implementations.
2. **`delivery/**` is excluded from the enumeration** (the `grep -v '^delivery/'`
   is in the published command). Those are documents, not call sites. The cost is
   that a prose claim in another delivery document repeating the vacuous-witness
   reasoning would not be found; CR-H-1 is one such stale-prose case and was found
   by a reviewer reading, not by a grep.
3. **The five invoking blocks were audited for THIS mechanism only**, uniqueness
   of rejecter. They were not re-audited for other over-assertion or
   under-assertion families. A block can be sound on uniqueness and wrong about
   something else.
4. **The lab replicates the member CONSTRUCTION rather than importing it.** It is
   cross-checked against the real test in FR1.5 by two defangs with different
   predicted first failures, and both predictions held, so the replica is
   validated for the shapes exercised. It is not proof that the replica matches
   the test in every respect, only in the respects those two defangs discriminate.
5. **The union has exactly two legs TODAY.** Probes 1 and 2 are one per leg
   (scripts/m2-exit-test.sh:515). If a third source were spread into that union,
   nothing in this test would notice that it has no probe. I did not add a guard
   over the number of legs, because a count over a source line is the kind of
   pinned assertion CLAUDE.md:201 warns against, and I could not find a
   non-pinning form. Recorded as an open question rather than as a closed one.
6. **The `defaultSpecReason` regex is over the harness SOURCE.** It derives the
   first quoted segment of `DEFAULT_SPEC_WHY`. If that constant were rewritten as
   a template literal or built by concatenation starting from a variable, the
   regex would not match and the test fails HARD by design, which is the intended
   direction; but I did not enumerate the ways it could be rewritten.
7. **I did not run either full bundle end to end IN THIS ROUND.** Section 9 and 9a
   of this document record those runs at `21509d1`, and the harness is
   byte-identical here (sha256
   `9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138`, and
   `git diff 21509d1..HEAD -- scripts/m2-exit-test.sh` is EMPTY), so those runs
   still describe the shipped program. They do not describe the tests, which is
   what this round changed, and the tests are covered by the suite instead.
8. **The `.github/workflows/gates.yml` edit is comment text and is UNRUN here.**
   No local run exercises that workflow. Its correctness rests on the measurement
   in FR1.7 plus the file being a comment; CI is the authority that the workflow
   still parses.

## FR1.11 The claim grep, and what settles each hit

Run in BOTH forms over the fix-round section of this document (from the
`# FIX ROUND 1` header to the end), because a claim split across a line wrap is
invisible to the line-based form.

Line-based:

```
$ sed -n '<fix-round section>' delivery/work-history/exit-test-assertion-direction.md \
    | grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to'
1401: unless the anchor occurs EXACTLY once, so a silent no-op defang is impossible,
1663: derivation back to the hand-written table would leave this probe red anyway:   - 1 gate(s)
1673: U2 is the important one: the guard added this round catches, by exit code and by
1718: NOT in `gates.manifest.json`, so the runner never runs it and it produces no
1759: say four. The list and the registry were always correct; only the prose counts
1842: | 310 (counterfactual 2) | rejected (an error row never passes as diff-scoped) | no | exit code only | SOUND, it is an outcome claim, not a mechanism claim |
```

Wrap-insensitive (the same pattern over the section with newlines collapsed to
spaces, reporting only matches that SPAN a wrap and so could not appear above):

```
(wrap-spanning hits above; line-based hits reported separately)
```

Zero wrap-spanning hits. Disposition of the six line-based hits:

**1401, "impossible".** RESTATED, and then measured rather than asserted. The
anchored-replacement tool is exercised in both failure directions:

```
$ node mkvariant.mjs harness-evidence/m2-assert.mjs /tmp/never.mjs 'this anchor does not occur' 'x'
ANCHOR NOT UNIQUE (0 occurrences), aborting: this anchor does not occur
EXIT=2
$ ls /tmp/never.mjs
ls: cannot access '/tmp/never.mjs': No such file or directory

$ node mkvariant.mjs harness-evidence/m2-assert.mjs /tmp/never2.mjs 'const ' 'const '
ANCHOR NOT UNIQUE (53 occurrences), aborting: const
EXIT=2
```

Zero matches and 53 matches both exit 2 and write no output file, so a defang that
matched nothing cannot be mistaken for one that matched. That is the property the
sentence needed and it is now the sentence.

**1663, "anyway".** Not my prose. It is inside CAPTURED OUTPUT, the assertion
message the new uniqueness check prints, quoted verbatim from the U1 run. Left
exactly as the program emitted it.

**1673, "catches".** Settled by the capture immediately above it: U2's
`EXIT=1` and the assertion text naming `2 check(s) OTHER than the derived expected
set`, with the two section-8 findings quoted. U2 is the old main-arm member 4
rebuilt inside the new probe, so "the exact defect that reached a pull request" is
the literal construction, not an analogy.

**1718, "never runs it".** Settled by measurement:

```
$ grep -c 'agent-rules-drift' gates.manifest.json
0
$ grep -n 'agent-rules-drift' gate-registry.yaml
16:#   does not run in CI, and `agent-rules-drift` is exactly that case: it runs
186:  - id: agent-rules-drift
```

The gate is declared in the registry and absent from the manifest, and the harness
passes `--manifest gates.manifest.json` on both arms (`grep -c -- '--registry'
scripts/m2-exit-test.sh` is 0, re-checked at HEAD), so the runner is never given
it to run. Scoped honestly: this is a statement about the harness as invoked
today, not a proof that no other path could run it.

**1759, "always correct".** RESTATED, because it was a claim about history I had
not checked. Checked now:

```
$ git show 5563b42:delivery/work-history/exit-test-assertion-direction.md | grep -c '^- `m2-exit-'
2
```

The list held two ids when the "Two behaviours registered" sentence was written,
so the sentence was true then and stale later. All four resolve BY NAME at HEAD:

```
RESOLVES m2-exit-main-absent-list-derived-from-manifest
RESOLVES m2-exit-red-gate-rejected-on-both-bundles
RESOLVES m2-exit-expect-row-admits-only-reachable-statuses
RESOLVES m2-exit-zero-red-reads-rows-not-counts
total behaviors: 598 (reported for context only; no test asserts this number)
```

`m2-exit-red-gate-rejected-on-both-bundles` keeps its id and its row is UPDATED,
not appended: this round renames the test it points at, and the id was introduced
on this unmerged branch, so the registry's append-only rule against `main` is not
touched. No count is pinned anywhere.

**1842, "never passes".** RESTATED as what the test asserts rather than as a
property of the program.

## FR1.12 Files changed, and the position on scope

```
$ git diff --name-only origin/main...HEAD
.github/workflows/gates.yml
delivery/work-history/exit-test-assertion-direction.md
scripts/m2-exit-test.sh
test/behaviors.json
test/gate-registry.test.ts
test/m2-exit-test.test.ts
```

`scripts/m2-exit-test.sh` appears because of the previous round; this round did
not touch it, and `git diff --stat 21509d1..HEAD -- scripts/m2-exit-test.sh` is
EMPTY. **No production code changed in this round.** The defect was in the
witness, not in the thing witnessed.

`.github/workflows/gates.yml` is NEW to the changed set at this round, added by
CR-H-1's fix, and it is comment text only. Nothing in the diff is reported `Bin`
by `git diff --stat`, so every changed file has a reviewable diff.

`node scripts/check-authored-bytes.mjs` exits 0 with the tree equal to the index
(staged first, since it exits 2 without checking otherwise).

## FR1.13 Open, and explicitly NOT closed by me

1. **The union's leg count has no guard** (FR1.10 item 5). Two legs today, one
   probe each. A third spread into that union would be unwitnessed and nothing
   would say so. I could not find a form of guard that is not a pinned count over
   a source line, which CLAUDE.md:201 warns against, so I am raising it rather
   than improvising one.
2. **Promoting `agent-rules-drift` into `gates.manifest.json`** is now unblocked
   on the harness side (FR1.7), and is NOT done here. It changes what CI runs and
   it is the open half of R-094, which is tracked with the orchestrator.
3. **The two salvaged clean-room reviews carry NO verdict.** They died mid-walk.
   This round answers the one fully evidenced finding in the first and the three
   LOW findings in the second; it is not a substitute for a completed review of
   this head, and neither salvaged document should be read as one.

## FR1.14 Gate runs, including one RED that is reported rather than averaged away

Toolchain node v26.6.0, `dist/` built, run from the branch worktree at the fix
round's head, `--base origin/main --head HEAD`.

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only red-witness --only agent-rules-drift --only manifest-self-check \
    --only clause-map --only coverage --only credential-scrub --only scope \
    --evidence <ev> --base origin/main --head HEAD
gates: declared 7 applicable 5 verdict 5 green 5 red 0 not-applicable 1 error 1 vacuous 0
gates: 1 gate(s) reported error: scope
EXIT=21
```

Per gate:

| gate | status | units | detail |
|---|---|---|---|
| `red-witness` | not-applicable | 0 | precondition `red-witness-diff` evaluated and unmet: no changed path under `src/`, `bin/` |
| `agent-rules-drift` | green | 17 | CLAUDE.md's gate block matches gate-registry.yaml row for row (3 preflight steps, 14 gates) |
| `manifest-self-check` | green | 8 | validated 8 schema documents against the closed keyword set |
| `clause-map` | green | 34 | 34 rows checked, 40 pending a phase not yet in force |
| `coverage` | green | 115 | 115 inventory ids checked |
| `credential-scrub` | green | 7 | no pull-request-capable credential resolvable from any of the 7 probed sources |
| `scope` | ERROR | 0 | `gate scope requires --phase, which was not supplied` |

`scope` erroring is PRE-EXISTING on this branch and not introduced here: it is
already recorded as open item 2 of section 8, and it is the consequence of this
being a non-phase branch, which is itself required by CLAUDE.md's branch-naming
rule (only a phase's own implementation branch may match the phase pattern).

`citations` is not-applicable at this head:

```
detail: precondition citations-diff-touches-documents evaluated and unmet: no changed
path under delivery/plan/, delivery/verification/, delivery/decisions/,
delivery/tuition/, delivery/requirements/, delivery/STATE.md
```

`delivery/work-history/` is not in that precondition's path list, so the gate does
not machine-check this document's citations. They were therefore checked BY HAND
instead, and the check found real errors rather than confirming a hope: every
`path.ext:LINE` token in this fix-round section was extracted and resolved against
the working tree, 54 of them, and NINE were wrong. Six `CLAUDE.md` citations
pointed at a NEWER copy of that file than the one on this branch (this branch was
cut before `main` advanced), and one pointed at
`test/m2-exit-test.test.ts` line 1394, a line this round DELETES. All are
corrected: the six now resolve to their intended content on this branch's
`CLAUDE.md`, and the deleted line is QUOTED rather than cited, because a citation
has to resolve at the audited head and that one no longer can. Re-run after the
correction: 54 citations, zero unresolved.

### The `suite` gate went RED once, and the cause is named rather than averaged

```
run 1: status=red units=594
  detail: 1 finding(s): failing test: "a resident watcher keeps running and backs off
  with growing beacon gaps" (test/watcher.test.ts)

run 2: status=green units=594
  detail: suite green via tiphys-suite-events-v1 (child node v26.6.0): reported 594
  test(s) from 36 file(s) (pass 594, fail 0, skipped 0, todo 0, did-not-run 0);
  discovered 36 file(s) walking test for .test.ts; 598 behavior(s) resolve;
  merge base bb8f6564cce6
```

Same head, same toolchain, same command, opposite verdicts. This repository has
paid three times for an unexplained suite discrepancy (CLAUDE.md:721), so it is
measured rather than shrugged at:

```
$ git diff --name-only origin/main...HEAD -- test/watcher.test.ts
(empty: the file is UNTOUCHED by this branch)
$ git log --oneline -1 -- test/watcher.test.ts
8cadeac Fix real-clock test flakes: liveness exact-age bands and watcher duplicate-not-drop (#26)
$ node --test --test-name-pattern 'a resident watcher keeps running and backs off with growing beacon gaps' test/watcher.test.ts
run 1 EXIT=0  pass 1  fail 0
run 2 EXIT=0  pass 1  fail 0
run 3 EXIT=0  pass 1  fail 0
```

The failing test is in a file this branch does not touch, its last change was
itself a real-clock flake fix, and it passes three times out of three in
isolation. Two direct `npm test` runs at this head also reported 594 pass and 0
fail. CLAUDE.md:684 records that suite wall time grows with real-clock lease
waits, and the gate run adds load.

So the conclusion I am willing to defend is: a pre-existing real-clock flake in an
UNTOUCHED file, surfaced under the extra load of a gate run. What I am NOT
claiming, because I did not establish it: that this flake is rare, that it cannot
recur in CI, or that no change of mine influenced scheduling. One red is reported
here in full so that a reviewer seeing it in CI recognises it rather than
attributing it to this round, and so that it is not quietly dropped from the
record if CI happens to be green.

## FR1.15 The red witnesses RE-RUN against the final file

The witness table in FR1.6 was taken against the test file as it stood BEFORE
CR-H-2's fix (sha256 `b08a0838195a6dc4cff673b6465e773c1abdef9cb59041092c096c3b16225dd4`).
CR-H-2 then edited a different `test()` block in the same file, so the file that
ships is not byte-identical to the file those witnesses ran against. A witness
that does not describe the shipped state is the shape this whole round is about,
so it was re-run rather than argued about.

Final file sha256 `45ac51ee6fba57c4d7d5e912542ec75dedebd07877dd889cf1d288746dc6080d`,
restricted to the main arm by the same single anchored replacement:

```
FINAL test, main arm only, harness=pristine    EXIT=0
FINAL test, main arm only, harness=tableonly   EXIT=1
FINAL test, main arm only, harness=norows      EXIT=1
FINAL test, main arm only, harness=nomanifest  EXIT=1
```

Identical to FR1.6 rows 3 to 6. Green control green, and the main arm reddens
under the whole-union collapse and under each leg separately. Harness and test
both restored from their pristine copies afterwards and sha256-verified:
harness `9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138`, test
`45ac51ee6fba57c4d7d5e912542ec75dedebd07877dd889cf1d288746dc6080d`, and
`git status --short` empty.

What this does NOT re-run: the U1 and U2 witnesses for the uniqueness assertion
itself (FR1.6, red witness 2). Those were taken against the pre-CR-H-2 file. The
uniqueness assertion's own code is byte-identical between the two files (CR-H-2
touched only the expectations-row test, a different `test()` block), so the risk
is bounded, but I did not re-run them and I am not claiming I did.

# FIX ROUND 2 (round 2 of the harness assertion-direction change)

Started from `fdb3120692f4178e213c40a6439a742effe24466`, confirmed as the tip of
`origin/claude/exit-test-harness-assertion-direction` before any work:

```
$ git rev-parse origin/claude/exit-test-harness-assertion-direction
fdb3120692f4178e213c40a6439a742effe24466
$ git rev-parse HEAD
fdb3120692f4178e213c40a6439a742effe24466
```

Own worktree, detached at that sha, created fresh rather than inherited from the
previous round's agent (the earlier worktree held the branch ref and was clean,
`git status --porcelain` empty, so nothing was salvaged from it and nothing was
taken from it). Toolchain node v26.6.0 from the scratch prefix, `node --version`
checked in the shell that ran each command. `npm ci` exit 0.

This section is appended after each command whose output it cites, before the
next command runs. Its mtime is the beacon for this round.

## FR2.0 What this round has to close

Two clean-room reviews of `fdb3120` both APPROVE. Four findings between them:

| id | severity | source | what |
|---|---|---|---|
| CR-V-1 | MEDIUM | vacuity audit | the union at scripts/m2-exit-test.sh:515 spreads THREE sources; the third (`explicitById.keys()`) can be deleted with the entire suite green |
| CR-V-2 | LOW | vacuity audit | the assertion program exempts ITSELF from M2-C-2: it can exit 0 having asserted zero gates |
| CR-FR-1 | LOW | criteria contract | the round's derivation missed a sixth live call site (test/m2-exit-test.test.ts:272) and its stated exclusions do not describe how it was missed |
| CR-FR-2 | LOW | criteria contract | the leg-count open item's stated reason misapplies CLAUDE.md:201; a BY-NAME guard exists and the reviewer red-witnessed a prototype |

