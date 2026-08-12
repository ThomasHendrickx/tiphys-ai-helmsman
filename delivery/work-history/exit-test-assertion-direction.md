# Work history: exit-test assertion direction (orchestrator-side harness hotfix)

Branch: `claude/exit-test-harness-assertion-direction`, cut from `origin/main`
at `3ff2023`. The branch name deliberately does NOT match
`^claude/m[0-9]+-p[0-9]+-`: that pattern makes the scope auditor derive a phase
id and demand a phase declaration (CLAUDE.md:450).

This is NOT an M3 phase. It is an orchestrator-side hotfix to shared harness
code, which under T-009's corollary IS a fix round and owes the full fix-round
contract at CLAUDE.md:297.

STATUS: IN PROGRESS. Written incrementally as a beacon (T-008 rule 1,
CLAUDE.md:375). Raw captures land here before they are polished.

## 1. The mechanism (fix-round contract item 1)

NOT the finding. The finding is "the `brief-drift` gate has no row in
`PR_EXPECT_JSON`". Fixing that alone leaves the defect in place.

THE MECHANISM: **the assertion program in `scripts/m2-exit-test.sh` iterates the
hand-written EXPECTATION and keys into the bundle's rows, so a row the
expectation does not name is never asserted on, whatever its status.**

The relation is constrained in one direction only. Every gate the TABLE names
must have an acceptable row; a row the table does not name is unconstrained. A
red gate absent from the table therefore passes the exit test in silence.

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
typo'd id in the table would become inert instead of red. It requires this
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
the same patterns in the sibling file. `scripts/m1-exit-test.sh` carries no
expectation table, never invokes the gate runner and never reads a bundle
summary, so it cannot carry this mechanism.

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

## 7. Suite

Baseline before any change, at `3ff2023` with the fix branch's beacon commit
only: node v26.6.0 (the fetched floor toolchain), `dist/` BUILT, invocation
`npm test`: exit 0, 590 tests, 590 pass, 0 fail, **0 skipped**.
