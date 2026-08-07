# Clean-room HAZARD review: M2-P4 (scope auditor)

Contract: second of dual review. Find what the acceptance criteria CANNOT
describe (T-007). Findings numbered from CR-1045.

Subject: branch `claude/m2-p4-scope-auditor` @ 2118f68a28e941937efaf08ae5b73dc20e4265dd
Verified checked out: `git rev-parse HEAD` = 2118f68a28e941937efaf08ae5b73dc20e4265dd
Merge base with origin/main: 4c9bfbcbd63a1668ab6697fba0460514edb52602
Diff: 6 files, +2002/-1 (work-history, gates.manifest.json, schema, scope.ts,
behaviors.json, test/scope-gate.test.ts)

Status: IN PROGRESS.

## Reading done

- CLAUDE.md, MECHANISMS.md
- delivery/plan/kernel-plan-m2.md M2-P4 section (lines 332-360)
- src/gates/scope.ts (561 lines), src/gates/schemas/phase-declaration.schema.json
- gates.manifest.json `scope` entry
- src/gates/run.ts (runner: requiredParameters, evaluatePrecondition,
  runOneGate argv construction), src/gates/result.ts makeGateResult
- delivery/plan/phase-declarations/*.json (8 real declarations + README)

## Early structural observations (to be confirmed by construction)

O-1. `PhaseDeclaration.branch` and `.id` are loaded and schema-validated but
NEVER read by src/gates/scope.ts. The only consumer of `--phase` is the
declaration FILENAME and the work-history standing extra. The manifest's
precondition pattern `claude/m[0-9]+-p[0-9]+-.*` does NOT interpolate
`{phase}` (contrast src/gates/run.ts:466, which supports the token). So the
precondition proves only "I am on SOME phase branch", never "I am on THIS
phase's branch". Candidate finding: the audited party selects which
declaration governs it.

O-2. `isAllowed` (scope.ts:346-348) does unbounded `startsWith` prefix
matching for trailing-slash entries. No test in test/scope-gate.test.ts
exercises a directory entry at all, though two real declarations carry one
(`witness/` in m2-p2.json, `test/fixtures/release/` in m2-p7.json).

O-3. `computeTouchedPaths` splits on TAB and takes fields[1]/fields[2]. No
`-z`, no `--no-renames`, no `core.quotePath` pinning. Needs construction.

O-4. Empty diff -> units 0 -> `makeGateResult` rewrites green+0 to
error+vacuous (result.ts:179). So `--base <head>` is error, not silent green.
To confirm by construction.

## Log

- [t0] beacon written, REVIEW-OUT.md created.
- [t1] source read; building attack harness.

## CONFIRMED FINDINGS (as of t2)

### CR-1045 HIGH: the audited party chooses which declaration governs it
`src/gates/scope.ts:481-482` builds `allowed` from the declaration named by
`--phase` alone. `declaration.branch` (schema-required, `src/gates/schemas/
phase-declaration.schema.json:15-19`) and `declaration.id` are loaded and
schema-validated and then NEVER READ. The manifest precondition pattern
(`gates.manifest.json:32`) is `claude/m[0-9]+-p[0-9]+-.*`, with no `{phase}`
token, so it proves only "some phase branch". Witness against the REAL
declarations on main: on branch `claude/m2-p4-scope-auditor`, a diff editing
`.github/workflows/gates.yml` + `scripts/m2-exit-test.sh` is RED with
`--phase m2-p4` and GREEN (exit 0, 2 units) with `--phase m2-p9`.

### CR-1046 HIGH: --base is attacker-chosen, so the merge base can land on the audited branch
`resolveMergeBase` (scope.ts:178-200) computes `merge-base(--base, --head)`
and reads the declaration there. Nothing constrains `--base` to a trunk ref.
Witness, real declarations: self-widen `m2-p4.json` on the branch in commit
1, touch the newly self-authorized paths in commit 2, run `--base HEAD~1`:
GREEN, with `declarationSha256 ee40f6d874f5...` = the BRANCH's widened blob,
not main's `7cd0bc70c09e...`. The honest `--base main` run is RED on all
three paths including the declaration edit itself.
This falsifies the module comment at scope.ts:40-52 ("an implementer's own
edit to the declaration on the branch being audited cannot change what this
run considers authorized").

## Attacks that FAILED to defeat the gate (correct behaviour, captured)
A3 rename chain, A4 delete+recreate, A5 case-only, A6 directory prefix
depth/siblings, A7 trailing-slash mismatch, A8 declaration absent at merge
base (RED, not crash), A9 copy detection C100, A10 mode-only chmod,
A11 symlink + submodule gitlink, A12 ./ prefix and trailing space (fail
CLOSED), A13 --base==head (vacuous error), A14 quoted/tab/non-ASCII paths
(git always escapes control chars even with core.quotePath=false, so the
TAB split cannot be spoofed), A15 declaration path is a tree (error),
A16/R3 --phase traversal (RED), A17 rename undeclared->declared,
A18/A18b mkfifo at the declaration path and at the declarations directory
(no block; git show reads the object DB).

## Integration probes
I1 non-matching branch -> scope not-applicable, runner exits 20 naming it.
I2 three parameter directions: --base / --head / --phase each absent =>
   status error, applicable false, never not-applicable (M2-C-3 held).
I3 real end-to-end on the real branch: exit 0, scope green, 6 units.
I4 self-audit that SHOULD fail: undeclared file added -> red naming it.
I6 the emitted record validates clean against `validateResultDocument`.

## FINAL (t3)

VERDICT: FIX-ROUND-NEEDED.

Gates on the floor toolchain (v26.6.0 / npm 11.18.0):
npm ci exit 0, npm run build exit 0, clean `git status` after build,
npm test exit 1: 213 tests, 208 pass, 5 fail, 0 skipped.
The 5 = the 2 declared cross-phase (gates.test.ts:1289 -> assert at :1339,
21 !== 0; gates.test.ts:2361 -> assert at :2382, 2 !== 3) + 3 declared
real-clock flakes. Serial re-run of liveness+watcher: 40 tests, 40 pass,
0 fail. test/scope-gate.test.ts alone: 12 tests, 12 pass.

### CR-1045 HIGH (mechanism): every input that selects the yardstick is
supplied by the audited party and is never cross-checked against the branch.
Witnesses (three structurally different members):
 W1 --phase   real declarations, branch claude/m2-p4-scope-auditor, diff =
    {.github/workflows/gates.yml, scripts/m2-exit-test.sh}:
    --phase m2-p4 -> RED (exit 1); --phase m2-p9 -> GREEN (exit 0, 2 units).
 W2 --base    self-widen m2-p4.json on the branch, then touch the paths:
    --base main -> RED (3 paths); --base HEAD~1 -> GREEN, declarationSha256
    ee40f6d874f5... (the branch blob) instead of main's 7cd0bc70c09e...
 W3 --head    honest --head HEAD -> RED naming undeclared.ts;
    --head HEAD~1 -> GREEN (the last commit is simply not measured).
Derivation (scope.ts only, stated scope):
  flags at scope.ts:418-423 = declarations,result,evidence,base,head,phase.
  Pinned by gates.manifest.json:20-25 -> declarations. Supplied by the
  runner -> result, evidence. Forwarded verbatim from the caller
  (run.ts:703-706, gates.ts:89-94) -> base, head, phase.
  `grep -n 'declaration\.(id|branch|...)' src/gates/scope.ts` -> only
  filesToTouch and declaredExtras (:482, :488). `declaration.branch` and
  `declaration.id` have ZERO reads. `currentBranch` (:266) is called once,
  at :453, for a detail STRING only.
NOT covered by this derivation: bin/tiphys.ts, the M1 modules, and any
future CI/M2-P9 wiring (does not exist yet).

### CR-1046 MEDIUM: the module comment and the work history assert the
closed property that W2 falsifies. scope.ts:40-52; work-history/m2-p4.md
:444-447 ("Closed by reading the declaration through git show
<mergeBaseSha>:<path>"); and :526-531, where the binding claim grep
certifies that line as "a structural fact about this phase's own code".
It is true only when the merge base is not on the audited branch, which is
a property of --base, not of the code.

### CR-1047 MEDIUM: the gate's own failure path is an uncaught throw.
`declarationSchema()` throws at scope.ts:138 and :147; the only call site is
:334, reached from main() at :439, and neither main() nor the entry at
:554-558 has a try/catch. Three arms constructed against a copied
installation, all identical: schema absent -> exit 1, NO record; schema
carrying a keyword outside the closed set (oneOf) -> exit 1, NO record;
named pipe at the schema path -> exit 1, NO record (the M2-C-6 refusal text
IS produced, then thrown). Exit 1 is EXIT_RED. Standalone (the invocation
this module documents at :30-38 and the one the work history's own evidence
uses) a crash is indistinguishable from a verdict. Under `tiphys gates run`
the ingest degrades it to error. This is CR-801 recurring: M2-P1 built the
outer backstop for exactly this at src/commands/gates.ts:259-282.

### CR-1048 MEDIUM: the new schema document is outside manifest-self-check.
`schemaDocumentPaths()` (src/gates/manifest.ts:121-127) is a hardcoded pair;
`tiphys gates self-check` reports units 2 and names only gate-manifest and
gate-result. phase-declaration.schema.json is therefore never validated
against the closed keyword set, which is what makes CR-1047's arm B a
runtime crash instead of a self-check red. This is the declared-known
failure at gates.test.ts:2361, and the substantive fix is to REGISTER the
schema, not to relax the test. M2-P4 cannot do it (src/gates/manifest.ts is
not on its declaration).

### CR-1049 LOW: a dirty tree is invisible and undisclosed.
With `A undeclared-staged.ts` in the index and an untracked
`undeclared-uncommitted.ts` on disk, the gate reports GREEN (1 unit) and the
record says nothing about tree state. Correct for a pushed PR head; a false
assurance for the local self-audit evidence the process relies on today.

### CR-1050 LOW: duplicate value flags silently last-win.
`--phase m2-p4 --phase m2-p9` -> GREEN against m2-p9.json. parseFlags
(:97-113) overwrites. A trailing positional IS rejected (exit 64).

### CR-1051 INFO: scope can never reach a verdict in CI as wired.
.github/workflows/gates.yml:59-66 passes --base/--head and never --phase,
and the checkout is shallow. `scope` is applicability required, so the
bundle is exit 21. This is the declared-known gates.test.ts:1289 failure;
the consolidated fix needs BOTH --phase and fetch-depth: 0.

### POSITIVE, hand back to the implementer
The declared derivation gap on DECLARATION_ABSENT_PATTERNS[1] is now closed
with real captured output: with the declaration present on disk and absent
at the merge base, git emits
`fatal: path '...' exists on disk, but not in '<sha>'` (exit 128) and the
gate classifies it as missing -> RED. It can be pinned as a test.
