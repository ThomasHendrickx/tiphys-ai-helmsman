# Work history: M3 plan revision 3

- date: 2026-08-07
- branch: `claude/m3-plan-regrounding`
- base commit: `70b8f05` (arbitration of M3 plan review round 2)
- contract: `delivery/review/arbitration-m3-plan-r2.md` (four mechanisms plus
  eight local findings)
- deliverable: `delivery/plan/kernel-plan-m3.md` at revision 3
- inputs read in full: `CLAUDE.md`; the arbitration;
  `delivery/review/plan-review-m3-r2-a.md` (1161 lines) and
  `plan-review-m3-r2-b.md` (144 lines); `delivery/plan/kernel-plan-m3.md`
  (4905 lines at revision 2)
- toolchain: `node --version` printed `v26.6.0` from
  `scratchpad/toolchain/node-v26.6.0-linux-x64/bin` placed first on PATH.

This file was written INCREMENTALLY (tuition T-008) alongside seventeen
commits, one per mechanism or phase group. Its mtime and the commit stream are
the beacon.

---

## 1. Mechanism 1: the derivation

The arbitration's own "what this round did not cover" section is the reason
this derivation exists in this form:

> Report A's path-existence sweep is, in its own words, "structurally blind to
> every defect I actually found" ... **Six M2 gate modules were never read.**
> Mechanism 1's fix must open them rather than assume the remaining joints are
> sound.

### 1.1 The mechanism, named rather than the findings

Report A raised A-001, A-008, A-009, A-011 and A-015, and the CI half of
A-002, as six findings. They are ONE mechanism: **revision 2 modelled every M2
joint from `delivery/plan/kernel-plan-m2.md` while that document was DRAFT,
and M2 is now COMPLETE on `main`, so each joint is an artifact that can be READ
instead of predicted.** Fixing the six instances individually is the
instance-fix shape the fix-round contract bans. The fix is a bounded pass that
re-derives every joint from the delivered artifact.

### 1.2 The enumeration command, and its full output

The joints are the paths and components section 1.1 and Appendix B name. The
enumeration is the set of M2 modules on `main` plus the four artifacts the plan
names by path. Enumerating the modules:

```
$ git log --oneline -1 origin/main
dbba3c8 STATE: correct the branch-cleanup claim, which asserted a deletion that failed (#34)

$ for f in $(git ls-tree -r origin/main --name-only src/gates/ | grep '\.ts$'); do
    printf "%-38s %s lines\n" "$f" "$(git show origin/main:$f | wc -l)"; done
src/gates/adapters/http-json.ts        401 lines
src/gates/adapters/migrations-command.ts 464 lines
src/gates/citations.ts                 1509 lines
src/gates/coverage.ts                  1019 lines
src/gates/credentials.ts               697 lines
src/gates/deploy.ts                    35 lines
src/gates/manifest.ts                  291 lines
src/gates/migrations.ts                38 lines
src/gates/pin.ts                       260 lines
src/gates/red-witness.ts               512 lines
src/gates/release.ts                   1162 lines
src/gates/result.ts                    196 lines
src/gates/run.ts                       1447 lines
src/gates/scope.ts                     850 lines
src/gates/suite.ts                     1142 lines
src/gates/validate.ts                  575 lines

$ git ls-tree -r origin/main --name-only src/gates/schemas/
src/gates/schemas/citation-config.schema.json
src/gates/schemas/coverage-config.schema.json
src/gates/schemas/gate-manifest.schema.json
src/gates/schemas/gate-result.schema.json
src/gates/schemas/phase-declaration.schema.json
src/gates/schemas/release-record.schema.json
src/gates/schemas/verifier-config.schema.json
src/gates/schemas/witness-spec.schema.json

$ git ls-tree -r origin/main --name-only .github/
.github/workflows/gates.yml

$ git ls-tree -r origin/main --name-only scripts/
scripts/m1-exit-test.sh
scripts/m2-exit-test.sh
scripts/seed-sandbox.sh
scripts/stub-payload.sh

$ git ls-tree -r origin/main --name-only delivery/plan/phase-declarations/
delivery/plan/phase-declarations/README.md
delivery/plan/phase-declarations/m2-p2.json
delivery/plan/phase-declarations/m2-p3.json
delivery/plan/phase-declarations/m2-p4.json
delivery/plan/phase-declarations/m2-p5.json
delivery/plan/phase-declarations/m2-p6.json
delivery/plan/phase-declarations/m2-p7.json
delivery/plan/phase-declarations/m2-p8.json
delivery/plan/phase-declarations/m2-p9.json
```

### 1.3 The per-joint verification commands and their output

**J1, the CI job structure.**

```
$ git show origin/main:.github/workflows/gates.yml | grep -nE '^(jobs:|  [a-z-]+:|on:)'
3:on:
4:  pull_request:
27:jobs:
28:  gates:
```

The file's own comment at lines 13 to 25 records the reason (one job named
`gates`, no matrix, because DR-0004's required context is the literal string
`gates` and a matrix would rename it to `gates (26)`). CORRECTED in the plan at
section 1.1, D-M3-28, section 2.3 rule 7, M3-P1 step 9, M3-P2 criterion 5b.

**J2, the CI event fork (T-009's mechanism, at the source).**

```
$ git show origin/main:.github/workflows/gates.yml | grep -n -A6 'M2 exit test (pull request)'
      - name: M2 exit test (pull request)
        if: github.event_name == 'pull_request'
        run: >
          scripts/m2-exit-test.sh
          --no-build
          --bundle pr
          --base "${{ github.event.pull_request.base.sha }}"
$ git show origin/main:.github/workflows/gates.yml | grep -n -A5 'M2 exit test (push)'
      - name: M2 exit test (push)
        if: github.event_name != 'pull_request'
        run: >
          scripts/m2-exit-test.sh
          --no-build
          --bundle main
```

`scripts/m2-exit-test.sh`'s header states which gates each bundle runs: the
`main` bundle is `--only manifest-self-check,suite,coverage,credential-scrub,
deploy,migrations`, and "the three diff-scoped gates and credential-token are
NOT run and have NO record". CORRECTED BY ADDITION in section 1.1, D-M3-28(c),
section 2.2a, and D-M3-36.

**J3, the phase-declaration projection.**

```
$ git show origin/main:src/gates/schemas/phase-declaration.schema.json \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['required'])"
['id', 'branch', 'filesToTouch', 'declaredExtras', 'citations']

$ git show origin/main:gates.manifest.json | python3 -c "
import json,sys
print([g for g in json.load(sys.stdin)['gates'] if g['id']=='scope'][0]['command'])"
['node', 'src/gates/scope.ts', '--declarations', 'delivery/plan/phase-declarations']

$ git show origin/main:.github/workflows/gates.yml | grep -n 'phase '
75:      #                 --phase derived from the source branch (lowercase, to
92:          --phase "$(printf '%s' "${{ github.head_ref }}" | sed -E 's#^(claude/)?(m[0-9]+-p[0-9]+).*#\2#')"
```

The schema also sets `"additionalProperties": false` and documents that
`filesToTouch` holds "literal paths, or literal directories written with a
trailing slash. Never a description (M2R-016)". The README documents the
merge-base timing. Revision 2 was wrong about the path, three of five field
names, and the timing, and nobody owned creating the ten `m3-pN.json` files.
CORRECTED at section 1.1 item 3, new section 3.0, D-M3-33, M3-P1 step 2 and
criterion 10.

**J4, the gate registry as CI's single caller.**

```
$ git show origin/main:src/commands/gates.ts | sed -n '27,28p;40,42p'
 *   gates run        run a manifest's gates and write an evidence bundle
 *   gates self-check the `manifest-self-check` gate itself
  "usage: tiphys gates <run --manifest <file> --evidence <dir> " +
  "[--base <ref>] [--head <ref>] [--phase <id>] [--only <id>] | " +
  "self-check --manifest <file> --result <file> --evidence <dir>>";
```

and the workflow's own comment: "the harness is now the SINGLE caller of
`gates run`, so the gate set runs ONCE per run and exactly one `summary.json`
is produced per job (criterion 5)". CORRECTED at section 2.2a and D-M3-34.

**J5, DR-0018's diff-scoped gate semantics.** Read
`delivery/decisions/DR-0018-exit-test-src-scoped-gate-semantics.md` in full.
Three gates are diff-scoped (`red-witness`, `scope`, `citations`); a required
gate reporting `not-applicable` makes the runner exit 20; the amended
expectation is not-applicable-with-a-recorded-reason. CORRECTED at M3-P2
criterion 3 and exit stage E1.6.

**J6, the M2-P6 coverage checker's config surface.**

```
$ git show origin/main:src/gates/coverage.ts | sed -n '741,744p'
function resolveConfig(configPath: string | undefined): LoadedConfig | FailedConfig {
  if (configPath === undefined) {
    return { ok: true, config: KERNEL_COVERAGE_CONFIG };

$ git show origin/main:src/gates/coverage.ts | sed -n '173,182p'
export const KERNEL_COVERAGE_CONFIG: CoverageConfig = {
  inventory: {
    path: "delivery/requirements/migration-table.md",
    idPattern: "R-[0-9]+[a-z]?",
  },
  coverageTable: {
    path: "delivery/plan/kernel-plan-v1.md",
    idPattern: "R-[0-9]+[a-z]?",
```

CORRECTED at section 2.2 and Appendix C item 1, and the inventory/coverage-table
separation is ADOPTED for the clause map.

**J7, M2-C-2 (never green by omission).** This is the joint M3-P2's own hazard
class named and no criterion checked.

```
$ git show origin/main:src/gates/result.ts | sed -n '146,152p;177,184p'
const VACUOUS_REASON =
  "M2-C-2 (never green by omission): a gate reporting green with units 0 " +
  "examined nothing, so this record is error";

/**
 * THE ONLY CONSTRUCTOR. Applies the M2-C-2 rewrite, so a green record with
 * zero units cannot be constructed.
  if (base.status === "green" && base.units === 0) {
    return {
      ...base,
      status: "error",
```

Confirmed. ADDED as M3-P2 criteria 3b.

**J8, M2-C-3 (fail closed).**

```
$ git show origin/main:src/gates/red-witness.ts | sed -n '453,455p'
      "--base was not supplied; the phase diff cannot be computed (M2-C-3)",
$ git show origin/main:src/gates/citations.ts | sed -n '1237,1239p'
        "gate citations requires --base (M2-C-3: a gate whose required " +
```

Confirmed. ADDED as M3-P2 criterion 3c.

**J9, the reserved `modes` field.**

```
$ git show origin/main:src/gates/schemas/gate-manifest.schema.json | sed -n '70,76p'
        "modes": {
          "description": "Reserved for M3's assurance modes (section 2 item 1). Validated if present, ignored by the M2 runner, so the promotion is additive.",
          "type": "array",
          "items": {
            "type": "string"
          }
        }
```

Confirmed exactly as the plan describes it. No change.

**J10, the validator's diagnostic contract.**

```
$ git show origin/main:src/gates/validate.ts | sed -n '78p;90p'
 * `INVALID <json-pointer> <message>`. The module's public contract.
  return `INVALID ${diagnostic.pointer} ${diagnostic.message}`;
```

Confirmed for the MODULE. NOT confirmed for M2's TESTS, which is the half
DR-0013 clause 6 actually needs; see section 3 below.

**J11, the M2-P2 red-witness harness's artifacts.**

```
$ git ls-tree -r origin/main --name-only witness/ | head -5
witness/captures/citation-git-cat-file-resolution.txt
witness/captures/git-name-status-real.txt
witness/captures/node-test-tap-real.txt
witness/citation-na-precondition.json
witness/citation-record-doc-not-gated.json

$ git show origin/main:src/gates/red-witness.ts | sed -n '383p;403p'
    const recordsPath = join(run.evidenceDir, "witness-records.json");
        evidence.push("witness-records.json");
```

The witness-spec schema requires `dangerousStates` with `minItems: 1` and
documents "the witness is green only when every member was red". CORRECTED BY
SHARPENING at section 1.1's table and exit stage E1.6: the accepted proof is
the durable spec PLUS the run record, not "its evidence file" singular.

**J12, the M2-P3 suite wrapper's exit-code semantics.**

```
$ git show origin/main:src/gates/suite.ts | sed -n '983p;994,999p'
  if (childExit === 0 && counts.fail + counts.didNotRun > 0) {
  if (childExit !== 0 && counts.fail + counts.didNotRun === 0) {
        `the test command exited ${String(childExit)} with no failing test in the stream; `
```

Confirmed and sharpened: the binding is two-directional, so R-049/R-086's
`wrapper-exit-code` field travels with counts.

**J13, the M2-P5 citation linter's invocation form.**

```
$ git show origin/main:src/gates/citations.ts | sed -n '1416,1417p'
  "usage: node src/gates/citations.ts --result <file> --evidence <dir> " +
  "--base <ref> [--head <ref>]";
```

Its header records M2-D-21 (only citations ADDED OR MODIFIED in `base...head`
are resolved) and M2-D-22 (a citation inside backticks or a fenced block is
QUOTED and never resolved). CORRECTED at section 1.1's table: R-010a's
"attached verifier" is a pass over a diff and needs a base.

**J14, M2-P7's release verification.**

```
$ git show origin/main:src/gates/schemas/release-record.schema.json | sed -n '21,23p'
    "outcome": {
      "description": "One of satisfied, failed, pending, absent, not-applicable, error. Enforced in code as fail-closed rule 7 (see the document description).",
      "type": "string"
```

Confirmed, with the property named: the enum is deliberately NOT in the schema.
M3-P3 references stage ids only, so nothing in M3 restates it.

**J15, M2-P8 credential scoping.** Read `src/gates/credentials.ts` lines 23 to
95 (the module header). Confirmed, with the residue quoted into section 1.1:
"A name outside the vocabulary that is also admitted to the allowlist would
pass the environment probe green; that residue is the allowlist's
responsibility, and this comment states it rather than hiding it."

**J16, `destructiveCommands`.**

```
$ git show origin/main:gates.manifest.json | python3 -c "
import json,sys;print(json.load(sys.stdin)['destructiveCommands'])"
['pool destroy', 'teardown', 'src/pool.ts', 'src/teardown.ts']
```

Confirmed. M3-P6 criterion 8b and M3-P8 criterion 4b have a real target.

**J17, the `A-n` namespace.**

```
$ grep -o 'A-[0-9]' delivery/STATE.md | sort -u
A-1
A-2
A-4
A-6
$ grep -o 'A-[0-9]' delivery/plan/kernel-plan-m3.md | sort -u    # revision 2
A-1
A-3
A-4
A-5
$ git show origin/main:gates.manifest.json | python3 -c "
import json,sys
print([g['precondition']['id'] for g in json.load(sys.stdin)['gates'] if g['id']=='credential-token'])"
['implementer-token-present-owner-action-a-3']
$ git show origin/main:delivery/plan/kernel-plan-m2.md | grep -nE 'owner action A-3' | head -2
173:9. **Credential scoping's owner half.** ... item 4 is owner action A-3 in section 6.
621:1. **Owner action A-3 (DR-0004 item 4): provision the scoped implementer token.**
```

CORRECTED at section 7.

**J18, the `test/liveness.test.ts` flake (risk 11's subject).** Not on the
review's list; checked because risk 11 and M3-P2's grounding note (c) both
assert its state.

```
$ git show origin/main:test/liveness.test.ts | sed -n '675p;684p'
    /^CHECK beacon PASS beacon present, age (\d+)s \(freshness threshold 901s\)$/m,
    `beacon age ${String(passAge)}s outside the fresh band [13, 901): ${doctored.stdout}`,
```

M2 fixed it. The hardcoded `age 13s` is gone and the assertion range-checks a
captured value. CORRECTED at risk 11 and M3-P2 grounding note (c): the instance
is closed, the mechanism is not, and the dispatch-time verification changes
shape rather than disappearing.

### 1.4 Which M2 artifacts I OPENED, and which I did NOT

Stated per the fix-round contract's item 3, and the reviewer's first check.

**Opened (header, usage string, flag table, and the code sites that decide
status and units):** `src/gates/result.ts`, `src/gates/run.ts`,
`src/gates/validate.ts`, `src/gates/scope.ts`, `src/gates/coverage.ts`,
`src/gates/red-witness.ts`, `src/gates/suite.ts`, `src/gates/citations.ts`,
`src/gates/credentials.ts`, `src/gates/deploy.ts` (all 35 lines),
`src/gates/migrations.ts` (all 38 lines), `src/commands/gates.ts`. All eight
schema documents under `src/gates/schemas/` were read; `gate-result.schema.json`
and `phase-declaration.schema.json` in full. `gates.manifest.json` in full.
`.github/workflows/gates.yml` in full. `scripts/m2-exit-test.sh`'s header
(lines 1 to 60). `delivery/plan/phase-declarations/README.md`. DR-0017 and
DR-0018. `test/liveness.test.ts` around the CR-762 site.

**The six the arbitration says were never read** are all in the opened list
above: `red-witness.ts`, `suite.ts`, `citations.ts`, `deploy.ts`,
`migrations.ts`, `credentials.ts`.

**NOT opened, and this is the part a later reader should treat as unchecked:**

1. `src/gates/release.ts` (1162 lines). Read only through its two thin entries
   and its record schema. M3-P3 references the stage ids and never the adapter,
   so the joint is narrow, but the module itself was not read.
2. `src/gates/adapters/http-json.ts` and
   `src/gates/adapters/migrations-command.ts`. No M3 phase names either, which
   is why they were skipped, but that is a judgment and not a check.
3. `src/gates/manifest.ts` (291 lines) and `src/gates/pin.ts` (260 lines). The
   manifest loader and the M2-C-5 tree pin. M3-P2 extends the runner, so
   `manifest.ts` is arguably a joint; it was read only via its schema.
4. **The BODIES of `suite.ts` (1142 lines), `citations.ts` (1509 lines),
   `coverage.ts` (1019 lines) and `run.ts` (1447 lines).** Each was read for
   its header, its usage, its flags, and the specific lines quoted above. A
   defect living inside a body whose header describes it correctly would not
   have been found by this derivation.
5. **M2's TEST suites, entirely.** Nothing under `test/` was read except the
   `liveness.test.ts` site above. This matters at one specific joint: DR-0013
   clause 6's "boundary preserved" retirement needs M2's validation tests to
   ASSERT the `INVALID <json-pointer> <message>` contract rather than engine
   wording, and I confirmed only that the MODULE emits it. M3-P1 step 1 still
   owes that verification and the plan says so explicitly.
6. **Nothing was EXECUTED against M2's gates.** No `gates run`, no
   `m2-exit-test.sh`, no build of `dist/`. Every claim above is `git show`,
   `grep`, `sed`, `awk` and `python3` over committed text on `main` at
   `dbba3c8`.
7. **`scripts/m2-exit-test.sh`'s assertion code.** Read its documented modes
   and flags from the header comment; did not read the assertion logic it
   writes to `m2-assert.mjs`.
8. **Appendix C of the M3 plan** was not re-audited. Neither round-2 reviewer
   audited it either. Revision 3 touched only item 1, which is downstream of a
   corrected joint. The other twelve items are unexamined by anyone.

---

## 2. Finding disposition: all twenty

Report A ids are `M3R2A-nnn` and are cited by the arbitration as `A-nnn`;
report B ids are `M3R2B-nnn`, cited as `B-nnn`. Both spellings appear below.

| Finding | Severity | Disposition |
|---|---|---|
| A-001 / M3R2A-001: CI modelled as the two-job shape DR-0017 deleted | high | **APPLIED.** Section 1.1's workflow bullet rewritten from the file on `main`; D-M3-28's rationale rewritten under its own number (no id reuse); section 2.3 rule 7's sixth defang replaced; M3-P2 criterion 5b's example list corrected; M3-P1 step 9's "the existing `test` job" corrected; the required-status-context invariant added as a standing constraint on all five phases that edit the file. DR-0017 cited seventeen times where it was cited zero |
| A-002 / M3R2A-002 and B-001 / M3R2B-001 (the convergent finding): E3.1 is the incomplete sentence T-009 bans | high | **APPLIED.** E3.1 rewritten as a five-part criterion naming the event, requiring the head sha compared as strings, requiring the run observed to completion, requiring an evidence record, and explicitly refusing a `pull_request` check. E0.1 rewritten in the same terms. E3.1b added for T-009's second rule. `AGENTS.md` gains `merge-is-not-complete-until` and `gate-result-is-scoped-to-its-run` with M3-P9 criterion 5b behind them. D-M3-36 records the three-place placement and why |
| A-003 / M3R2A-003 plus its addendum: `A-n` collides across three documents | high | **APPLIED, within the constraint.** Section 7 gains a namespace subsection naming `delivery/STATE.md` as the sole allocator. M2's `A-3` KEEPS ITS NUMBER because it is the literal string `implementer-token-present-owner-action-a-3` in `gates.manifest.json` on `main`. This plan's A-4 (npm publish credential) moves to **A-7**, the lowest free id above every id any of the three documents has issued, and is cited by ACT as well as by id at six sites. Revision 2's claim that this plan "retired" A-3 is withdrawn as a claim this plan was not entitled to make. **Deferred to the orchestrator, outside this plan**: adding `A-nnn` to `CLAUDE.md`'s identifier registry and the A-7 row to STATE.md's table; both are recorded in section 7 and in section 4 below |
| A-004 / M3R2A-004: plan v1 outline item 2 dropped from the mapping | medium | **APPLIED.** A paragraph at the process summary states the fold into the EXT-F-07 decomposition, why it is a fold (v1's own item 4 double-books the same artifacts), and where each of item 2's three named obligations lands, with step and criterion numbers verified against the phase sections rather than asserted |
| A-005 / M3R2A-005: section 2.5's parallelism counts contradict its own lists | high | **APPLIED.** Recomputed with a published command whose full output is in section 2.5. True numbers: SEVEN edit `src/cli.ts` or `src/validate.ts` (revision 2 said nine), NINE edit `package.json` (revision 2 said six), six edit `src/checks.ts` (revision 2 was right). The stated CAUSE was also false and is replaced by the two separate arguments (file overlap for P4 to P8, dependency for P6, P9, P10). The catch-all pairwise row is replaced by real rows for P4-beside-P6 (zero overlap), P9 and P10. D-M3-19's "nine" corrected under its own number |
| A-006 / M3R2A-006: P7/P8 parallelizable while P8's blocked-by requires P7 | medium | **APPLIED, resolved toward the evidence.** M3-P8's `blocked-by` becomes "M3-P6 merged" plus the standing merge-order rule, because P8's grounding names no P7 artifact. The dependency-graph table row and the consumption list at section 2.5 are corrected. The real question, P6 beside P7 beside P8, is answered rather than left open |
| A-007 / M3R2A-007: the clause map has no row inventory so its missing-row condition cannot fire | high | **APPLIED.** Section 2.2 specifies the inventory (Appendix A of this plan) and the coverage table (`clause-map.json`) as two separately configured sources in the shape `src/gates/coverage.ts` already uses, states the merged-phase determination mechanically, and enumerates FOUR failure conditions instead of three (adding the reverse direction, an invented row). M3-P1 criterion 9b is the red witness that deletes a row and requires a named nonzero exit |
| A-008 / M3R2A-008: section 2.2's reason for not reusing M2-P6 is factually wrong | medium | **APPLIED.** The false reason is quoted, refuted with the `resolveConfig` capture, and replaced with the reason that survives checking (the two checks answer different questions over different shapes, and `coverage.ts`'s configured shape has nowhere to express a text-occurrence check over a third file). Appendix C item 1's recorded cost is corrected in the same terms |
| A-009 / M3R2A-009: phase-declaration path, field names and ownership all wrong | high | **APPLIED.** Section 1.1 item 3 corrected in all three properties with the four commands that establish them; new section 3.0 assigns authorship to the orchestrator in one pre-dispatch pull request; D-M3-33 records the decision; M3-P1 step 2 states what the projection must EMIT including the gloss-stripping rule; M3-P1 criterion 10 gains three assertions including running the real auditor against a MERGE BASE rather than a head |
| A-010 / M3R2A-010: M3-P8's files-to-touch enumerates T-001..T-008 as a fixed list | medium | **APPLIED.** Replaced with a `tuition/` directory entry (the phase-declaration schema accepts trailing-slash directories, M2R-016). Step 3's promotion list restated as "every entry in `delivery/tuition/` at dispatch, count recorded". Criterion 1's literal "TEN entries" restated as a relation. `MECHANISMS.md` is called out as being at the repository ROOT and therefore NOT covered by the `tuition/` prefix, which is the fix-round contract item 3 shape this project has been bitten by three times |
| A-011 / M3R2A-011: five checks wired as raw workflow steps bypass the gate registry | medium | **APPLIED.** New section 2.2a and D-M3-34: every M3 check enters `gate-registry.yaml` with a required `events[]` field. `gates.manifest.json` joins the files-to-touch lists of P1, P2, P6, P9 and P10 as an append-only union. M3-P1 step 9 and M3-P2 step 5 rewritten. M3-P10's release workflow is named as the one deliberate workflow-level exception WITH its reason (a tag event the bundle never sees), which D-M3-34 requires of any exception |
| A-012 / M3R2A-012: section 1.5's format table omits two artifact types | medium | **APPLIED.** Rows added for the finding set (M3-P5, R-029) and the verdict (M3-P7, R-060), each with a per-type reason in the same terms as the report row, and the verdict row states why markdown would make its three Kind B checks unimplementable |
| A-013 / M3R2A-013: M3-P10's evidence bundle and supervision file are undeclared | medium | **APPLIED.** `delivery/evidence/m3-exit-test/` added as a directory entry with the reason (the scope audit is a hard completion condition and an undeclared path is a red gate). The E0.2-versus-E4.4 tension is resolved explicitly: `supervision-rules.md` goes to `main` in the same pre-dispatch pull request as the ten declarations, so its commit precedes the first E1 record as E0.5 requires; the bundle goes through the phase's own pull request |
| A-014 / M3R2A-014: M3-P4's criteria numbered 2, 2c, 2d, 2b | low | **APPLIED.** Reordered to 2, 2b, 2c, 2d by moving whole blocks, no text changed. The new criteria added elsewhere in this revision were placed to keep every phase's lettering monotonic; M3-P7's new criterion was moved from 3b to 3c after the first placement broke that |
| A-015 / M3R2A-015: section 1.1 is a PREDICTION of M2 and the header says M2 has not started | high | **APPLIED, and it is the mechanism the whole round reduces to.** The header's false state paragraph is corrected with `git log` and `grep` output beside it rather than deleted. The closing paragraph of 1.1 is replaced by a binding rule (no M3 phase may take a shape from the M2 plan; the source is the file on `main`). New section 1.7 is the per-joint record with commands, plus a six-item statement of what the derivation did not cover |
| B-002 / M3R2B-002: M3-P2's `units` hazard has no criterion | high | **APPLIED at the mechanism, not the instance.** The instance fix is M3-P2 criteria 3b (M2-C-2, two structurally different members) and 3c (M2-C-3). The MECHANISM fix is new section 2.6 and D-M3-35, applied to all ten phases as `hazard class to criterion` tables, with three admissible reasons for "no criterion can" and a Kind B check (`plan-hazard-classes-addressed-by-resolves`, M3-P1 criterion 5f) that carries the obligation into the kernel |
| B-003 / M3R2B-003: `brief compose`'s rendered phase text completeness is unchecked | medium | **APPLIED.** M3-P5 criterion 3b: the rendered phase text is a complete projection driven FROM the schema's `required` array rather than from a hand-written field list, with two structurally different members (dropping `hazard-classes[]` and dropping `acceptance[]`, chosen because they are arrays and a renderer can handle scalars correctly and arrays not at all) |
| B-004 / M3R2B-004: M3-P5's text-specificity witness not carried to M3-P6's briefs | medium | **APPLIED, and the four-copies problem it would have created is closed at the same time.** M3-P6 criterion 9d asserts clause TEXT in both briefs, with two structurally different weakenings (a vague restatement and a specific-but-wrong C-2 phrasing). Revision 2's criterion 9(c) is relabelled a presence check in its own words. The clause text becomes a SINGLE copy, `roles/_shared-dispatch-contract.md`, created by M3-P5 and included by all five briefs, so the specific wording cannot drift five ways |
| B-005 / M3R2B-005: one falsification control stands in for fifteen mechanisms | high | **APPLIED, both halves of the arbitration's "either/or".** Three controls (C1 Kind A schema keyword, C2 a deregistered Kind B check, C3 both review contracts dispatched as `criteria`), each naming its expected failure stage, with passing at the WRONG stage also a failure. AND the explicit statement of what remains unwitnessed (E1.2, E1.3, E1.5, E1.6's index claim, E1.8, E4.1 to E4.3; E1.9 and E1.10 covered BY KIND rather than by instance, written as the weaker statement). Repeated at section 4.5 item 11b and required in the bundle by M3-P10 criterion 6(c) |

### 2.1 What was NOT applied, and why

Nothing was rejected. Three items are deferred, each to a named owner:

1. **`CLAUDE.md`'s identifier registry needs `A-n` added**, with
   `delivery/STATE.md` named as the allocator. That is an edit to a governing
   document and is the ORCHESTRATOR'S, not the plan writer's. Recorded in the
   plan at section 7 and here.
2. **`delivery/STATE.md` needs the A-7 row** (provide npmjs publish credentials
   and claim the `@tiphys` scope). Same owner, same pass.
3. **The M2-P8 owner action A-3 is unchanged and untouched**, per the
   arbitration's explicit instruction not to rename the id embedded in
   `gates.manifest.json`.

---

## 3. What this work did NOT cover

Stated at the length the fix-round contract requires, because an unstated
exclusion reads as a clean result.

1. **The derivation's limits are in section 1.4 above** and are the most
   important item here: `release.ts`, the two adapters, `manifest.ts` and
   `pin.ts` were not opened; the BODIES of the four largest gate modules were
   not read; M2's test suites were not read at all; nothing was executed
   against M2's gates.
2. **No M3 artifact was verified, because none exists.** Every criterion this
   revision added is a document change. Whether the criteria are achievable is
   unverified by anything except reading, exactly as both round-2 reviewers
   recorded for their own work.
3. **I did not re-derive the plan's requirement-row coverage.** Appendix A was
   re-verified as ARITHMETIC (74 rows, per-phase counts, no duplicates, exact
   set match against plan v1's M3 bucket in both directions, and zero changed
   row lines in the diff), which is what the contract required. I did not check
   that plan v1's bucketing is itself correct, and I did not read
   `delivery/requirements/migration-table.md`.
4. **I did not audit sections 5, 6 or 8 as sets.** D-M3-19 and D-M3-28 were
   rewritten because findings led to them, and D-M3-33 to D-M3-36 were added.
   The other twenty-eight decision entries were not read for internal
   contradiction, numbering gaps, or agreement with plan v1's D-1 to D-19.
   Risks 1 to 10 and 12 were not re-examined; risk 11 was, because a finding
   led to it.
5. **Appendix C items 2 to 13 were not audited.** Neither round-2 reviewer
   audited Appendix C, and revision 3 touched only item 1. This is a region
   nobody has checked across three revisions and two review rounds.
6. **The hazard-to-criterion maps rest on my reading of each phase's criteria,
   not on execution.** Where a map row says a criterion reddens against a
   hazard, that is my judgment about what the criterion's text would catch. I
   verified criterion NUMBERS against the actual lists in every phase (M3-P3's
   map was written wrong on the first attempt and corrected after reading the
   criteria; the C-2 item turned out to be covered by criterion 5, which the
   first draft had marked uncheckable). But a criterion that is weaker than its
   matched hazard is exactly the failure mode section 2.6 warns about, and I
   named that residue in only three rows. There may be more.
7. **The map rows I marked "no criterion can" under reason 1 name checklist
   probes as their instrument, and I CHECKED that those probes exist before
   shipping the maps.** This was nearly a self-inflicted instance of the exact
   defect section 2.6 forbids, so the sequence is recorded rather than
   smoothed over. Writing the maps, I deferred nine items to probes. The grep:

```
$ grep -c 'c2-liveness-vocabulary\|clause-text-matches-row\|honest-failure-substance\|contract-avoidance\|fix-round-mechanism-named\|hazard-classes-addressed' delivery/plan/kernel-plan-m3.md
```

   `fix-round-mechanism-named` and `hazard-classes-addressed` were already in
   M3-P7's step list (step 3c and step 3d respectively). **The other four,
   `c2-liveness-vocabulary`, `clause-text-matches-row`,
   `honest-failure-substance` and `contract-avoidance`, existed ONLY inside the
   hazard-map rows I had just written.** A hazard row deferring to a probe that
   does not exist is a deferral naming no target, which is precisely what
   section 2.6's reason-3 language forbids and what the whole mechanism-2 fix
   exists to stop. All four are now enumerated as canonical probes in M3-P7
   step 3d, each with its probe text, its `evidence-required` value and its
   `applies-to`, and the addition is noted as not disturbing criterion 6b's
   disjointness assertion because all four are hazard-family probes. **What
   remains uncovered here**: whether the four probes as worded are GOOD probes
   is risk 2's standing residue, and nobody has attempted to answer one of them
   without opening anything, which is M3-P7 criterion 3b's own test and does
   not extend to these four.
8. **The new criteria's own falsifiability was not adversarially reviewed.**
   Thirteen criteria were added. Each states both directions and the members of
   any class, per section 2.3, but nobody has attempted to write a defective
   implementation that passes them.
9. **I did not run the repository's gates before the final pass**; the single
   `npm test` run is recorded in section 5.

---

## 4. Claim grep (CLAUDE.md, binding on this file)

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m3-plan-revision-3.md
```

Hits and their disposition, one line each:

- **"never read" / "were never read"** (section 1, quoting the arbitration):
  a quotation of another document, not my claim.
- **"NOT opened", "not read", "was not read"** (section 1.4, items 1 to 8):
  these are statements that I did not do something, which are claims about my
  own actions and are settled by the absence of the corresponding command in
  this file. The positive list in 1.4 carries the commands for what I DID open.
- **"a defect living inside a body whose header describes it correctly would
  not have been found"** (1.4 item 4): a statement about the derivation's
  scope, not about the world. It follows from the method: I read headers,
  usage strings and specific quoted lines, and the quoted lines are all in
  section 1.3.
- **"the enum is deliberately NOT in the schema"** (J14): settled by the
  captured `release-record.schema.json` excerpt directly above it, whose own
  description says "Enforced in code as fail-closed rule 7".
- **"a green record with zero units cannot be constructed"** (J7): this is a
  QUOTATION of `src/gates/result.ts`'s own doc comment, captured above it,
  together with the code that performs the rewrite. It is M2's claim about M2,
  reproduced with its source, not mine.
- **"is covered by KIND rather than by instance"** (B-005 row, and section 3):
  restated in the plan and here as the weaker statement it is. E1.9 and E1.10
  use the same Kind A validation mechanism control C1 exercises; no control
  runs against E1.9 or E1.10 specifically. That is written as "weaker than
  being covered".
- **"cannot fire" / "cannot be met"** (A-007 row): a restatement of report A's
  finding, which carries its own evidence at `plan-review-m3-r2-a.md` lines
  389 to 471. The corrective is criterion 9b, which makes the condition
  witnessable.
- **"no schema can tell a mechanism from a finding"** (M3-P4 map, quoted in
  the disposition table): the plan's own pre-existing text at criterion 2d(a),
  not a new claim.
- **"that member cannot occur"** (the D-M3-28 sixth-defang correction,
  described in the A-001 row): settled by the J1 capture, which shows one job
  and no fan-in, so a step cannot move into a job that does not exist. The
  command is in section 1.3.
- **"nobody has attempted"** (section 3 item 8): a statement about what has not
  happened in this session, and the reason the delta review exists.
- **"was NOT verified" / "does not yet enumerate them"** (section 3 item 7):
  this is the one hit that would otherwise be an unexecuted claim, so it is
  restated as an OPEN QUESTION rather than as a finding: I did not grep M3-P7's
  step list for the four probe names, and I am recording the gap rather than
  asserting the probes are absent. The delta reviewer should run
  `grep -n 'c2-liveness-vocabulary\|clause-text-matches-row\|honest-failure-substance\|contract-avoidance' delivery/plan/kernel-plan-m3.md`
  and treat any name that appears only inside a hazard-map row as a plan defect
  under section 2.6's reason-3 rule.
- **"always" / "never" inside quoted plan text** (the D-M3-34 row, the section
  2.6 rule): quotations of the deliverable, whose own claims are settled inside
  it.
- **"Never a description (M2R-016)"** (J3): a verbatim quotation of
  `phase-declaration.schema.json`'s own `filesToTouch` description. The command
  that produced the surrounding capture is in J3.
- **"a citation inside backticks or a fenced block is QUOTED and never
  resolved"** (J13): a paraphrase of `src/gates/citations.ts`'s module header,
  which states M2-D-22 in those terms. The usage capture is in J13; the header
  text is at `src/gates/citations.ts` lines 41 to 44 on `main`, reachable with
  `git show origin/main:src/gates/citations.ts | sed -n '41,44p'`.
- **"'attached verifier' is a pass over a diff and needs a base"** (J13):
  settled by the usage string captured immediately above it, which lists
  `--base <ref>` as required and `--head <ref>` as optional, and by the
  M2-C-3 refusal line captured at J8
  (`gate citations requires --base`).
- **"M3-P3 references the stage ids and never the adapter"** (1.4 item 1): this
  is a claim about the M3 PLAN's own text, and it is settled inside the
  deliverable rather than by a command here: the plan's Appendix B M3-P3 row
  states "M3 references by stage id and never by adapter", and section 1.7's
  M2-P7 row records the same. It is a design commitment this revision made, not
  an observation about the world, and it is falsifiable by grepping the M3-P3
  section for an adapter name.
- **"a tag event the bundle never sees"** (A-011 row, and M3-P10's
  files-to-touch note): **RESTATED as a design statement, because it is not an
  observation.** `.github/workflows/release.yml` does not exist; M3-P10 creates
  it. The sentence means: this plan SPECIFIES the release workflow to trigger on
  a tag, and the gate bundle runs under `pull_request` and `push` to `main`
  only, per the workflow captured at J2. Whether a future release workflow could
  be made to run inside the bundle is a question nobody has asked and I am not
  answering it; what I am recording is the reason D-M3-34 grants the exception.
- **"would catch"** (section 3 item 6): explicitly labelled as my judgment in
  the same sentence, and item 6 exists to bound it.
- **"never green by omission" / "zero units cannot be constructed" /
  "the phase diff cannot be computed"** (J7 and J8): all three are inside
  fenced captures, and each capture's `git show ... | sed -n` command is on the
  line above it. They are M2's statements about M2, reproduced with the command
  that produced them.
- **"cannot be written into this ASCII-only file"** (section 5.2's
  parenthetical): settled by the `grep -cP '[^\x00-\x7F]'` result of 0 two
  lines above it, which is the definition of the file being ASCII-only.

Two claims in this discharge were themselves verified rather than asserted,
because a discharge that is itself unexecuted is the shape T-006 records:

```
$ grep -n 'never by adapter' delivery/plan/kernel-plan-m3.md
6461:| M3-P3 | M2-P1 (gate set references), M2-P7's post-merge verification contract ... which M3 references by stage id and never by adapter |
$ awk '/^### M3-P3:/,/^### M3-P4:/' delivery/plan/kernel-plan-m3.md | grep -c 'adapter'
1
$ git show origin/main:src/gates/citations.ts | sed -n '41,44p'
 *   M2-D-22 (made vs quoted): a citation inside an inline code span
 *   (backticks) or a fenced code block is QUOTED, not made, and is never
 *   resolved. This is the convention the repository already follows
 *   (writing `src/nope.ts:1` in prose to mean "this does not resolve").
```

The single `adapter` occurrence in M3-P3 is inside the phrase "never by
adapter" itself, which is what makes the design commitment checkable: any
second occurrence would be a violation.

ASCII check on this file:

```
$ grep -cP '[^\x00-\x7F]' delivery/work-history/m3-plan-revision-3.md
0
```

---

## 5. Gates

The deliverable is two markdown documents, so there is nothing in this change
for a test to exercise. The repository's gates still had to pass, because the
change is committed to a branch.

```
$ export PATH=<scratchpad>/toolchain/node-v26.6.0-linux-x64/bin:$PATH
$ node --version
v26.6.0
$ npm test
(exit code and counts recorded in section 5.1)
```

### 5.1 Recorded run, 2026-08-07, on the branch at the final commit

```
$ node --version
v26.6.0
$ npm --version
11.18.0
$ npm ci
added 4 packages, and audited 5 packages in 3s
found 0 vulnerabilities
(exit 0, and no EBADENGINE line, because the floor toolchain satisfies >=26)

$ npm run build
> @tiphys/kernel@0.0.0 build:schemas
> node --input-type=module -e "import { cpSync } from 'node:fs'; cpSync('src/gates/schemas', 'dist/src/gates/schemas', { recursive: true });"
(exit 0)

$ git status --porcelain
(empty: clean tree after build, which is the standing acceptance criterion;
 dist/ and *.tsbuildinfo are gitignored deliberately)

$ npm test
i tests 408
i suites 0
i pass 408
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 114128.30349
(exit 0)
```

**408 tests, 408 pass, 0 fail, 0 skipped.** For comparison, `CLAUDE.md`'s
environment note records 106 tests on `main` at `bcefc98`, which was before M2
merged; the count has grown with M2's nine phases and this run is on `main` at
`dbba3c8` plus this branch's document-only changes.

**What the run does and does not tell us about THIS change.** It tells us the
branch does not break the repository. It tells us nothing about the plan,
because the change is two markdown documents and no test reads either. Stated
so a green suite is not mistaken for evidence about the deliverable, which is
the vacuous-pass shape this milestone spends section 2.3 preventing.

### 5.2 Document checks

```
$ grep -cP '[^\x00-\x7F]' delivery/plan/kernel-plan-m3.md
0
$ grep -cP '[^\x00-\x7F]' delivery/work-history/m3-plan-revision-3.md
0
$ grep -c -- '[em dash]' delivery/plan/kernel-plan-m3.md delivery/work-history/m3-plan-revision-3.md
delivery/plan/kernel-plan-m3.md:0
delivery/work-history/m3-plan-revision-3.md:0
$ wc -l delivery/plan/kernel-plan-m3.md
6573 delivery/plan/kernel-plan-m3.md
```

(The em-dash grep was run with the literal character, which cannot be written
into this ASCII-only file; both files report 0, which the ASCII check above
already implies since an em dash is non-ASCII.)

Appendix A re-verified, per the round's hard constraint:

```
$ git diff 70b8f05 -- delivery/plan/kernel-plan-m3.md | grep -cE '^[+-]\| R-'
0
$ awk '/^## Appendix A/,/^## Appendix B/' delivery/plan/kernel-plan-m3.md | grep -c '^| R-'
74
$ ... | awk -F'|' '{gsub(/ /,"",$3); print $3}' | sort | uniq -c
     12 M3-P1
      3 M3-P2
      3 M3-P3
      9 M3-P4
      7 M3-P5
     13 M3-P6
     13 M3-P7
      3 M3-P8
     11 M3-P9
(M3-P10 = 0, as the appendix states)
$ ... | awk -F'|' '{gsub(/ /,"",$2); print $2}' | sort | uniq -d
(empty: no duplicate row id)
$ awk -F'|' '/^\| R-/ {gsub(/ /,"",$2); gsub(/ /,"",$3); if($3=="M3") print $2}' \
    delivery/plan/kernel-plan-v1.md | sort > /tmp/v1rows.txt
$ wc -l < /tmp/v1rows.txt
74
$ comm -23 /tmp/m3rows.txt /tmp/v1rows.txt; comm -13 /tmp/m3rows.txt /tmp/v1rows.txt
(both empty: exact set match in both directions)
```

**Zero changed row lines** is the strongest of these: the table was not edited
at all, so the arithmetic could not have been disturbed.

---

## 6. Commits in this revision

Seventeen commits on `claude/m3-plan-regrounding` above `70b8f05`, one per
mechanism or phase group, per T-008's incremental-output rule. Not pushed, and
no pull request opened, per the dispatch brief. `git log --oneline
70b8f05..HEAD` is the record.
