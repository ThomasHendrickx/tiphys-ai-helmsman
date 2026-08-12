# Clean-room review: assertion-direction fix, vacuity contract

Subject: branch `claude/exit-test-harness-assertion-direction` at `21509d1`, draft PR #109, base `main` at `255baf9`.
Merge base: `bb8f656`.
Reviewer worktree: `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/CRV-head` (detached at 21509d1).
Contract: ONE question. The change ADDS a check that claims to assert over the bundle's rows.
Does it actually read the rows, and can it ever pass when it should fail?

Rules read in full first: CLAUDE.md:1 (whole file).

STATUS: IN PROGRESS. This file is the beacon; each defang is appended as it completes.

## Log

- (start) worktree created, reading `scripts/m2-exit-test.sh` diff.

## Measured facts first (so nothing is inherited)

Toolchain for every run below: `/tmp/claude-0/.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin/node`, `node --version` = v26.6.0, verified in the same shell.

The number in circulation is wrong, and here is the measurement. At `21509d1` AND at
`origin/main` (`255baf9`), `gates.manifest.json` declares ELEVEN gate ids:

```
manifest-self-check coverage credential-scrub credential-token suite citations
scope deploy migrations clause-map red-witness
```

`scripts/m2-exit-test.sh --print-expect pr green` at 21509d1 emits a table naming all
ELEVEN and `"absent": []`. So the manifest-to-table gap on the PR arm is ZERO, and
"12 manifest gates, exactly one absent from the table" is false of both `main` and this head.
`--print-expect main` emits 6 table rows and a DERIVED absent list of 5
(credential-token, citations, scope, clause-map, red-witness); 6 + 5 = 11, so the main
arm's derived complement is exact.

## Lab

The shipped assertion program is a single-quoted heredoc, `scripts/m2-exit-test.sh:417` to
`scripts/m2-exit-test.sh:737`, so it is byte-literal. It was extracted verbatim
(`sed -n '418,736p'`, 319 lines) to `CRV-lab/m2-assert.mjs` and driven directly.
The expectation documents are the REAL ones, produced by the shipped
`--print-expect pr green` / `--print-expect main` hooks, not replicas.

Three defanged variants, each produced by a scripted single-anchor replacement that
ABORTS if the anchor is not found (so a silent no-op defang is impossible):

- `v-nored.mjs`: the new zero-red block deleted.
- `v-tableonly.mjs`: the derivation collapsed to `[...explicitById.keys()]`, i.e. the
  ORIGINAL table-driven direction.
- `v-both.mjs`: both, i.e. the pre-fix program.

Control, all three variants against the honest PR baseline bundle: EXIT=0, EXIT=0, EXIT=0.
So redness below is attributable to the defang target, not to the surgery.

Baselines (both green, so every defang has a green control):
- PR arm, 11 rows: `m2-assert (PR bundle): OK. ... 11 gate(s) asserted (11 from an explicit table row, 0 under the default required-green); 0 asserted absent; ... zero red; zero error; zero vacuous.` EXIT=0
- main arm, 6 rows: `m2-assert (main bundle): OK. ... 6 gate(s) asserted (6 from an explicit table row, 0 ...); 5 asserted absent: credential-token, citations, scope, clause-map, red-witness; ...` EXIT=0

## Defang 1: the ROWS side, a red row the expectation does not name

Input corrupted: a twelfth row `{"id":"phantom-gate","status":"red"}` appended to each
baseline bundle, counts recomputed honestly. `phantom-gate` is in NEITHER the manifest
NOR the table, so it is the exact shape the finding describes.

| arm | program | EXIT |
|---|---|---|
| PR | pristine | **1** (3 findings: default-spec status, default-spec required-green, zero-red) |
| PR | `v-nored` (zero-red deleted) | **1** (2 findings, from the derivation) |
| PR | `v-tableonly` (derivation collapsed) | **1** (1 finding, from zero-red) |
| PR | `v-both` (pre-fix) | **0** OK, "12 gate record(s) match section 1.4; 11 gate(s) asserted" |
| main | pristine | **1** (same 3 findings) |
| main | `v-both` (pre-fix) | **0** OK, "7 gate record(s) ... 6 gate(s) asserted" |

Verdict: the defect is real and the fix closes it on BOTH arms, and it is closed
REDUNDANTLY: zero-red and the derivation each catch this member alone. Note the pre-fix
OK line printing "12 gate record(s) match section 1.4" while asserting 11 is the original
defect speaking in its own words.

## Defang 1b: the ROWS side EMPTIED (the vacuity probe)

| input | expect doc | manifest | EXIT | what fired |
|---|---|---|---|---|
| `gates: []` | real PR | real (11) | **1**, 11 findings | "no record in the bundle for a gate the table lists" |
| `gates: []` | real main | real (11) | **1**, 6 findings | same |
| `gates: []` | real PR | manifest with `gates: []` | **1**, 11 findings | table half of the union still anchors it |
| `gates: []` | table with `gates: [], absent: []` | real (11) | **1**, 11 findings | MANIFEST half of the union anchors it, message names the strict default |
| `gates: {}` (not an array) | real PR | real (11) | **1**, 11 findings | `Array.isArray` guard falls back to `[]`, then the union catches it |
| `gates: []` | EMPTY table | EMPTY manifest | **0** OK, "0 gate record(s) ... 0 gate(s) asserted" | nothing left to anchor on |

So the new direction does NOT pass vacuously over an empty bundle: the union is anchored
on TWO independent inputs and either one alone reddens an empty bundle. The only pass over
nothing needs all three inputs empty at once. Reachability of that: both expectation
documents are hard-coded string constants in the shipped script (`PR_EXPECT_JSON` names 11
gates and `"absent": []` literally, `MAIN_EXPECT_JSON` names 6), so an empty table is not
producible by the harness at all, at any manifest. Recorded as an observation below, not a
finding.

## Defang 2: the EXPECTATION side EMPTIED

Row 4 of the table above IS this defang, and it is the discriminating one. Expectation
`{"label":"empty table","gates":[],"absent":[]}` against the real 11-gate manifest and an
empty bundle: EXIT=1 with ELEVEN findings, each reading

```
[manifest-self-check] gates.manifest.json declares this gate and the bundle carries NO
record for it, and the table does not list it as absent from this bundle; a declared gate
that produced no record is a gate that did not run. This gate has NO row in the
expectations table, so it was asserted under the default ... (required, green).
```

A check comparing the table to itself would print OK here. It does not. The expected set
is genuinely derived from an input other than the table.

## Defang 3: attack the DEFAULT, isolated from zero-red

To prove the default is load-bearing and not decorative, it has to be the ONLY thing
between a bad row and a pass. Two independent members:

**3a, a status zero-red cannot see.** A twelfth manifest gate `future-gate` with NO table
row, reporting `not-applicable` with a perfectly valid evaluated precondition
(`{id, met:false, reason}`), so section 4's not-applicable checks are satisfied and zero-red,
zero-error and zero-vacuous are all silent. PR arm, 12-gate manifest:

| program | EXIT |
|---|---|
| pristine | **1** ("expected status green, observed not-applicable" + "is a REQUIRED gate but its status is not-applicable") |
| `v-nored` (zero-red deleted, so the default is all that is left) | **1**, same 2 findings |
| `v-tableonly` (derivation collapsed) | **0** OK, "12 gate record(s) match section 1.4; 11 gate(s) asserted" |

**3b, a red row with zero-red removed.** Defang 1 above, `v-nored` column: EXIT=1 from the
derivation alone.

The default fires, and it is strictly STRONGER than zero-red: 3a is a bad row zero-red is
blind to by construction.

## Defang 3c: does a PERMISSIVE default hide in the union (declared-absent)?

`absentIds` is the one subtraction in the union, so it is the only place a gate can leave
the asserted set. Two facts, both measured.

The PR arm has NO absent escape hatch: `PR_EXPECT_JSON` carries `"absent": []` as a literal,
so on that arm `absentIds` is empty by construction and every manifest id and every reported
row id is asserted.

On the main arm `absentIds` is DERIVED by the shipped `main_absent_json`. Driven for real
against a 12-gate manifest through the shipped `--print-expect main` hook (a scratch repo
root holding only the script and the 12-gate manifest, so the real code path runs):
`"absent": ["credential-token","citations","scope","clause-map","red-witness","future-gate"]`,
6 items, 6 + 6 = 12. The derivation does not fall behind the manifest.

A gate on that absent list is excluded from `expectedIds`, so the question is what still
asserts it. Section 8 does, and it holds under every defang:

| main-arm bundle, 12-gate manifest | program | EXIT |
|---|---|---|
| `future-gate` not run at all | pristine | **0** (correct: the main arm runs a subset by policy) |
| `future-gate` present and RED | pristine | **1** (zero-red + no-record + no-result.json) |
| `future-gate` present and RED | `v-nored` | **1** (section 8 alone) |
| `future-gate` present and RED | `v-both` (pre-fix) | **1** (section 8 alone) |
| `future-gate` present and GREEN | pristine | **1** (section 8) |

So a gate that lands in declared-absent is NOT asserted by nothing: if it produced any
record at all, section 8 reddens whatever its status. The residual permissiveness is that a
newly declared manifest gate is silently asserted NOT-RUN on the main arm. That is the
pre-existing, explicitly documented policy (`MAIN_ONLY_GATES` is hand-written on purpose
because `clause-map`'s exclusion is not derivable), it is unchanged by this PR, and the PR
arm's strict default is the compensating control. Observation, not a finding.

## The implementer's first pre-empted claim: does zero-red read ROWS or COUNTS?

Reproduced in both directions, isolated so that only zero-red can speak (derivation
collapsed AND the recount check disabled, both by anchored replacement):

Input: the PR baseline plus a red `phantom-gate` row, with `summary.counts.red` LIED to 0.
Verified in the built bundle: `phantom row status: red | counts.red: 0`.

| zero-red implementation | EXIT | output |
|---|---|---|
| as shipped, `rows.filter(r => r.status === "red")` | **1** | `1 gate(s) reported RED: phantom-gate.` |
| defanged to `summary.counts.red` | **0** | `OK. 12 gate record(s) ... zero red; zero error; zero vacuous.` |

Against the PRISTINE shipped program the same bundle gives EXIT=1 with 4 findings,
including both the zero-red finding and `recomputed count red=1 does not equal
summary.json red=0`. The claim holds: the check reads the rows.

## The implementer's second pre-empted claim: do members 4 and 5 discriminate?

They do on the PR arm. They do NOT on the main arm, and that is finding CR-V01 below.

Replicating the test's own main-arm members in the lab (same rows, same lax table, the real
`--print-expect main` document against a 12-gate manifest) and running each against the
pristine program and against `v-tableonly` (the derivation collapsed back to the
hand-written table, which is the mutation the implementer says they ran):

| main-arm member | pristine | derivation COLLAPSED |
|---|---|---|
| 1, unlisted manifest gate RED | 1 | **1** |
| 2, gate declared nowhere, RED row | 1 | **1** |
| 3, table-named gate RED under a lax row | 1 | **1** |
| 4, unlisted gate `not-applicable` | 1 | **1** |
| 5, unlisted gate `green` | 1 | **1** |

Every one of the five survives the collapse, so the main-arm half of that test cannot see
the derivation disappear. Members 4 and 5 are also the SAME code path as each other there:
removing section 8 (`for (const id of expect.absent ?? [])`, pre-existing code) turns BOTH
green together, EXIT=0 and EXIT=0, with identical output.

A witness for the main arm does exist and is one row away. Probe X: a row for a gate
declared in NEITHER the manifest NOR the table, reporting `not-applicable` with a valid
evaluated precondition, so no red row exists anywhere in the bundle:

| probe X, main arm | EXIT |
|---|---|
| pristine | **1**, `[fixture-gate-declared-nowhere] expected status green, observed not-applicable ... asserted under the default` |
| derivation collapsed | **0**, `OK. 7 gate record(s) ...` |
