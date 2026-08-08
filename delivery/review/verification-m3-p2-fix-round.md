# M3-P2 fix-round-1 delta verification

- started: 2026-08-08 17:49:32
- verdict: APPROVE (see below)

## Setup

- Worktree: detached at `fa60bb3`, base compared `ee7042b..fa60bb3` (diffstat: 11 files, 861 insertions, 46 deletions).
- Node: `v26.6.0` (floor toolchain first on PATH), confirmed via `node --version`.
- `npm ci`: exit 0, 10 packages added, 0 vulnerabilities.
- `npm run build`: exit 0. `git status --porcelain` after build shows only my own untracked report file; no stray build artifacts.
- Contract documents fetched from `origin/main` (they are not reachable from the phase branch's own history; the review/arbitration commits landed on `main` via PR #49 while this branch's fix round continues from `ee7042b`/PR #48):
  - `delivery/review/arbitration-m3-p2.md`
  - `delivery/review/clean-room-m3-p2-criteria.md` (Opus family, CR-M3P2-A-00x)
  - `delivery/review/clean-room-m3-p2-hazard.md` (Sonnet family, CR-M3P2-B-00x)
- Findings to close, per arbitration: Mechanism 1 = A-005+B-001 (high) and A-003+B-002 (medium); Mechanism 2 = A-002 (medium); Mechanism 3 = A-006 (medium). Two lows (A-004, and criterion-3's unsatisfiable "exits 0") ruled as documented deviations, not defects to fix.
- `test/gate-registry.test.ts` alone: 13 tests, 13 pass, 0 fail, in ~8.3s (verified directly).
- Full `node --test` is running in the background (it exceeded a 2-minute timeout twice when run in the foreground; this matches CLAUDE.md warning 11, real-clock lease waits growing suite wall time, not necessarily a defect). Result to follow.
- Note on this report's own ASCII compliance: `node --test`'s default reporter emits two non-ASCII glyphs (an info-circle marker and a heavy-X marker). Every captured occurrence below is transliterated to `i` and `[x]` respectively so this authored file passes CLAUDE.md's own ASCII and control-character checks; no other character in any quoted output was altered.

## Progress note: environment artifact, not a fix-round defect

Running `scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase m3-p2 /tmp/ev-pr-verify` in THIS detached worktree fails on `scope`:

```
gates: declared 11 applicable 6 verdict 6 green 6 red 0 not-applicable 5 error 0 vacuous 0
gates: required gate(s) not applicable: citations, scope
m2-assert (PR bundle): FAIL with 1 finding(s):
  - [scope] expected status green, observed not-applicable (precondition scope-branch-is-a-phase-branch evaluated and unmet: branch HEAD does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$)
```

This is an artifact of the verification setup, not a defect in the fix round. `src/gates/run.ts:678-690`'s `branch-matches` precondition calls `git rev-parse --abbrev-ref HEAD` directly (`src/gates/run.ts:684`), which returns the literal string `HEAD` in a detached checkout regardless of `--phase`. `git worktree list` shows the actual named branch `claude/m3-p2-gate-registry` is checked out in the sibling worktree `.../scratchpad/wt-m3p2` at the same commit `fa60bb3`; `git checkout claude/m3-p2-gate-registry` here fails with `fatal: 'claude/m3-p2-gate-registry' is already used by worktree at .../wt-m3p2` (exit 128), confirming there is no way to get a real branch-name checkout in this worktree. This is exactly the same shape the M3-P1 delta verifier recorded (`delivery/review/verification-m3-p1-fix-round.md:379-391`, its own detached-worktree `scope: not-applicable` cross-checked against the implementer's real-branch `scope: green`).

Cross-check against the implementer's own captured real-branch run (`delivery/work-history/m3-p2.md:1510-1519`):
```
$ scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase m3-p2 <evidence>
BUNDLE EXIT=0
m2-assert (PR bundle): OK. 11 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.
```
declared 11 applicable 7 verdict 7 green 7 (one MORE applicable/green than my detached run, exactly `scope`), not-applicable 4 (one FEWER than my run's 5, again exactly `scope`). Every other count is identical between my detached run and the real-branch run, so `scope` (not-applicable here vs green on the real branch) is the ONLY delta, and it is explained entirely by the detached checkout, never `red`. Treating this as an open item for "what I did NOT cover" below rather than a finding.

Continuing with mechanism verification.

## Independent re-derivations (executed directly, not read from the work history)

### M2-C-2 holds on BOTH selection paths (own fixture, not the phase's tests)

Built a standalone one-gate registry and matching M2 manifest, both pointing at a fixture script that writes `{"status":"green","units":0}` to its `--result` path:

```
$ node bin/tiphys.ts gates run --registry /tmp/verify-zero-units/registry.json --mode full --evidence /tmp/ev-zero-units-verify2
gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 1
EXIT: 21
detail: "M2-C-2 (never green by omission): a gate reporting green with units 0 examined nothing, so this record is error; ..."
vacuous: true

$ node bin/tiphys.ts gates run --manifest /tmp/verify-zero-units/manifest.json --evidence /tmp/ev-zero-units-manifest
gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 1
EXIT: 21
detail: identical M2-C-2 rewrite
```

Both paths reject a vacuous green identically, independently of `test/gate-registry.test.ts`'s own witness. CLOSED, both directions.

### The A/B, re-derived independently on the shipped head (fa60bb3)

Ran (sequentially, not concurrently -- see the concurrency note below) both selection paths on the same head, same base:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --evidence /tmp/ev-registry-full2 --base origin/main --head HEAD --phase m3-p2
gates: declared 12 applicable 7 verdict 7 green 7 red 0 not-applicable 5 error 0 vacuous 0

$ node bin/tiphys.ts gates run --manifest gates.manifest.json --evidence /tmp/ev-manifest-full2 --base origin/main --head HEAD --phase m3-p2
gates: declared 11 applicable 6 verdict 6 green 6 red 0 not-applicable 5 error 0 vacuous 0
```

Row-for-row comparison of `summary.json` from each (script, not eyeballed):

```
registry ids: [agent-rules-drift, citations, clause-map, coverage, credential-scrub,
  credential-token, deploy, manifest-self-check, migrations, red-witness, scope, suite]
manifest ids: [citations, clause-map, coverage, credential-scrub, credential-token,
  deploy, manifest-self-check, migrations, red-witness, scope, suite]
only in registry: [ 'agent-rules-drift' ]
only in manifest: []
mismatches (shared ids): []
```

Identical status and units for every id the two share, plus exactly `agent-rules-drift`. This independently reproduces the arbitration's "strongest single result" (arbitration-m3-p2.md line 34-39) on the fix-round head, not just on `ee7042b`. CLOSED.

**Concurrency note, not a fix-round defect.** A first attempt ran the registry-mode and manifest-mode `full` gate runs CONCURRENTLY in this same worktree. Both spawn the `suite` gate, which is `node --test` over the whole repo; one run's copy of `test/gates.test.ts`'s "manifest-self-check picks up a schema document dropped into the directory after the fact" writes a temp fixture schema file into the shared `src/gates/schemas/` tree mid-test, and the concurrently-running OTHER process's own schema-enumeration gate observed the transient extra file, reporting `suite: red` in the registry run only. Re-run sequentially, both runs are clean (see above). This is a self-inflicted artifact of running two full local suites against one working tree at once, not a defect in the shipped code; `git status --porcelain src/gates/schemas/` was clean both before and after, confirming the fixture file's own cleanup ran correctly and no residue was left.

### One job, no matrix

```
$ grep -n '^jobs:' -A3 .github/workflows/gates.yml
jobs:
  gates:
```
Single job named `gates`, no `strategy: matrix:` anywhere in the file (checked by reading `.github/workflows/gates.yml` in full). CLOSED, unchanged from the dual review's own finding.

## Full suite result

```
$ node --test
i tests 473
i pass 473
i fail 0
i cancelled 0
i skipped 0
```
473/473 (was 470 pre-round + 3 new tests = 473, matching the round's claimed additions). `git status --porcelain` after the full run was clean except this report file.

## Mechanism 1: both sweeps re-run, dispositions checked

Re-ran the exact published derivation, both commands, verbatim, against the shipped head:

```
$ git diff --name-only origin/main...HEAD | grep -vE '^(test/fixtures/|witness/captures/|delivery/work-history/)'
```
Identical 15-file list to the one published (plus the two new witness JSON files this round itself adds, which is expected since the round touched them).

```
$ grep -nEi '\b(CI|workflow|gates\.yml|m2-exit-test|pull_request|push arm|both arms|both CI)\b' CLAUDE.md gate-registry.yaml schemas/gate-registry.schema.json scripts/render-agent-rules-gates.mjs src/gates/run.ts src/commands/gates.ts src/commands/validate.ts
```
No hit reasserts the false present-tense claim. Every CI-related sentence in `CLAUDE.md` and `gate-registry.yaml` on the shipped head now states the BRIEFS-delivered / CI-not-yet split explicitly (`CLAUDE.md:150-164`, `gate-registry.yaml:4-19`). No new false claim introduced by the round's own rewording.

```
$ grep -nEi '\b(runs|reads|reports|evaluates|is evaluated|are evaluated|is run|are run|executes|selects|consumes|turns .* red)\b' gate-registry.yaml schemas/gate-registry.schema.json CLAUDE.md
```
The corrected checklist-entry comment (`gate-registry.yaml:216-221`, "the runner selects it out before any precondition is reached and reports it on stdout ... as declared and not executed ... not something this runner evaluates") is verified TRUE against the runner's own behaviour (see the `declaredByChecklist` execution below). No remaining false present-tense claim found.

**Disposition table cross-check (delivery/work-history/m3-p2.md:1306-1324), the four "true and kept" rows:**
- `gate-registry.yaml:15` "a gate whose precondition is unmet reports not-applicable and never green" -- confirmed true by `test/gate-registry.test.ts`'s own `gate-registry-not-applicable-not-green` test (in the 473 passing) and by my own independent zero-units and precondition runs above.
- `gate-registry.yaml:132,144` (deploy/migrations structural precondition ids) -- confirmed present verbatim in the shipped `gate-registry.yaml` and reproduced not-applicable-for-the-structural-reason in every one of my own registry-full and manifest-full runs above.
- `schemas/gate-registry.schema.json:214` (SC-011 carried over) -- confirmed present verbatim (`grep -n 'SC-011, carried over' schemas/gate-registry.schema.json` hits at line 214) and matches the shipped `not-applicable`/`never green` behaviour.
- "every other sweep hit... not authored by this phase" -- spot-checked several (`CLAUDE.md:319-334` T-009 section, `src/commands/gates.ts:31`) and confirmed by reading they predate this phase and are not part of its diff.

No under-reported hit found in either sweep; both counts and dispositions match what the work history published.

## Mechanism 2: the mode-exclusion witness, verified by mutation, both members of the class

Backed up `src/gates/run.ts`, applied each of the witness's two `dangerousStates` in turn, ran only the named test, then restored the file from the backup (never `git checkout --`), confirmed byte-identical to the pre-mutation file each time.

**Member 1, filter deleted entirely** (`const inMode = document.gates;`):
```
[x] a gate declaring only another mode is EXCLUDED from the run, with no row, no record and no evidence directory
  AssertionError: mode full selected in-this-mode, in-another-mode
  actual: [ 'in-this-mode', 'in-another-mode' ]  expected: [ 'in-this-mode' ]
```

**Member 2, filter present but condition does not test membership** (`selectsMode` body replaced with `entry.modes.length > 0`):
```
[x] a gate declaring only another mode is EXCLUDED from the run, with no row, no record and no evidence directory
  AssertionError: mode full selected in-this-mode, in-another-mode
  actual: [ 'in-this-mode', 'in-another-mode' ]  expected: [ 'in-this-mode' ]
```

Both structurally different mutations redden the SAME named test (not two different tests each catching one), which satisfies "one witness is not a class": the class has two members and both are demonstrated dangerous. `diff /tmp/backup-mutation/run.ts.orig src/gates/run.ts` after each restore: identical. CLOSED.

## Mechanism 2 sibling: the clean-room-checklist entries, verified by mutation, both members

Same method against `.filter((entry) => entry["verified-by"] === "script")` and `.filter((entry) => entry["verified-by"] === "clean-room-checklist")` in `src/gates/run.ts` (the two `dangerousStates` in `witness/gate-registry-checklist-not-executed.json`):

**Member 1** (`.filter(() => true)` on the script-entry filter, so checklist entries are ALSO projected as runnable and hit the M2 manifest schema, which requires `command`):
```
[x] a clean-room-checklist entry is reported as declared and not executed...
  INVALID #/gates/12/command required property command is missing
  INVALID #/gates/13/command required property command is missing
  21 !== 0
```

**Member 2** (`.filter(() => false)` on the clean-room-checklist filter, so `declaredByChecklist` comes back empty):
```
[x] a clean-room-checklist entry is reported as declared and not executed...
  AssertionError: the run does not account for every clean-room-checklist entry the mode selects
  actual: []  expected: [ 'fixtures-for-changed-component-states', 'unit-tests-for-changed-service-methods' ]
```

Two structurally different failure shapes (a schema-validation error vs. a content assertion) on the same named test. CLOSED, both directions.

## Mechanism 3: stale evidence

`delivery/work-history/m3-p2.md:403-409` and `:878` are both marked `SUPERSEDED BY FIX ROUND 1` in place at the top of each stale section, each naming which run supersedes it, matching the arbitration's ruling exactly (correct in place, not deleted). The replacing run at `:1447-1456` (criterion 3) and `:1510-1519` (PR bundle) was independently reproduced above: my own registry-full run (`/tmp/ev-registry-full2/summary.json`) matches the published re-run's per-gate units EXACTLY (manifest-self-check 8, coverage 115, credential-scrub 7, suite 471, clause-map 15, red-witness 6, agent-rules-drift 17) with `scope` as the sole, explained (detached-worktree) exception. CLOSED.

## The two CHECKABLE claims

### `gate-registry-ci-divergence-declared`

**Making CI read the registry reddens it.** Added a real `--registry gate-registry.yaml` flag into `scripts/m2-exit-test.sh`'s PR-bundle `gates run` invocation:
```
[x] every registry gate CI does not run is a declared divergence...
  AssertionError: scripts/m2-exit-test.sh now uses --registry
  true !== false
```
Reverted (copy from backup, not `git checkout --`); `diff` confirms byte-identical restore.

**The reverse-direction guard, verified by adding a registry-only gate with NO reason.** Inserted a new `script`-verified entry `registry-only-gate-no-reason` into `gate-registry.yaml` with no corresponding `gates.manifest.json` entry and no entry in `REGISTRY_ONLY_SCRIPT_GATES`:
```
[x] every registry gate CI does not run is a declared divergence...
  AssertionError: a script gate is declared in gate-registry.yaml and absent from gates.manifest.json with no recorded reason...
  actual: [ 'agent-rules-drift', 'registry-only-gate-no-reason' ]
  expected: [ 'agent-rules-drift' ]
```
Reverted; `diff` confirms byte-identical restore of both `gate-registry.yaml` and `CLAUDE.md` (untouched). **Not a count-based assertion**: the test does `assert.deepEqual(registryOnly.sort(), [...REGISTRY_ONLY_SCRIPT_GATES.keys()].sort(), ...)`, which names the exact id set, not a length -- my run's failure message names `registry-only-gate-no-reason` explicitly, confirming it is not merely counting. CLOSED, both the check and the reverse-direction guard.

### `gate-registry-checklist-entry-not-executed`

Verified directly against the runner (not through the test), on the shipped `gate-registry.yaml`:
```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full ... 
gates: 2 registry gate(s) declared verified-by clean-room-checklist and NOT executed by this runner: unit-tests-for-changed-service-methods (probe unit-tests-for-changed-service-methods), fixtures-for-changed-component-states (probe fixtures-for-changed-component-states)
```
`summary.json.declaredByChecklist` carries exactly the two ids with their probe ids and `applicability: conditional`, and NEITHER id appears in `summary.gates` (no row) nor has an `evidence/<id>/` directory (checked with `ls`). Matches the claim exactly: no summary row, no evidence directory, no record, present in `declaredByChecklist` with its probe id. CLOSED.

## The claim grep

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m3-p2.md
```
Ran and read the full output (67 hits across the whole file, spanning both round 1 and this fix round). The fix round's own new section (`## Fix round 1: the claim grep, re-run and settled`, lines 1611-1675) dispositions every new hit:
- Three (`1266, 1279, 1321`) are quoted sweep-output/table lines, not new claims -- confirmed by reading: they are literal `grep` output embedded in Mechanism 1's own derivation section.
- `1443` ("cannot be mistaken for the shipped state") is RESTATED to a true, weaker claim (a banner cannot stop misreading; each stale section is labelled instead) -- read and confirmed the restatement is present at `:1443` in context.
- `1604` ("catches a new registry-only gate") is settled BY EXECUTION in the work history itself (the same add-a-gate-with-no-reason experiment I independently reproduced above) rather than left as a bare claim.
- `1605` is restated as a stated non-coverage limit, not an assertion about the world.
- Remaining hits are verbatim quotations of shipped prose already carrying their own disposition in the table above them.
No hit found that asserts an untested absolute without an adjacent settling command. CLOSED.

## New-defect hunt over the 861 inserted lines

Read every hunk of `git diff ee7042b..fa60bb3` (already reproduced above) file by file. No new production-code branch was added outside `selectsMode` (a pure extraction, behaviour-preserving, confirmed by the full suite staying green and by my own re-derivation of the A/B). The two new tests and two new witness specs are the only new executable surface; both were red-witnessed above under two structurally different mutations each. The prose edits (`CLAUDE.md`, `gate-registry.yaml` header and comments, `schemas/gate-registry.schema.json` `$comment`, `scripts/render-agent-rules-gates.mjs` header) are documentation-only and were cross-checked against the runner's real behaviour above; none asserts anything the runner does not do. No new defect found in the delta.

## Mechanism closure table

| # | Mechanism | Status | Command proving it |
|---|---|---|---|
| 1 | False present-tense CI/checklist prose (A-005+B-001 high, A-003+B-002 medium) | **CLOSED** | Both sweeps re-run verbatim, zero remaining false hit; the two "true and kept" claims (`declaredByChecklist` behaviour, SC-011 carryover) verified by direct CLI execution above |
| 2 | `--mode` filter had no exclusion witness (A-002 medium) | **CLOSED** | Both `dangerousStates` members of `witness/gate-registry-mode-excludes.json` independently mutated and reddened the same named test; sibling checklist-entry gap (`witness/gate-registry-checklist-not-executed.json`) also independently reddened, both members |
| 3 | Stale evidence recorded against a superseded merge base (A-006 medium) | **CLOSED** | Both stale sections marked SUPERSEDED in place; replacing run independently reproduced, per-gate units match exactly except `scope` (explained, detached-worktree-only) |
| low | Criterion 3's "exits 0" unsatisfiable (A-001-equivalent) | **CLOSED** (documented as plan defect, not fixed in code, per arbitration ruling) | A/B on manifest path reproduces identical exit 20/citations-not-applicable independently |
| low | JSON-pointer vs entry-id naming (A-004) | **CLOSED** (ruled no defect, DR-0013 scope) | unchanged from dual review, not re-litigated per task scope |
| -- | `--registry`-would-redden claim (checkable) | **CLOSED** | `--registry` inserted into harness, named test reddens; reverted |
| -- | Reverse-direction divergence guard (no-reason gate) | **CLOSED**, confirmed NOT count-based | registry-only gate with no reason added, test reddens naming it; reverted |
| -- | M2-C-2 on both selection paths | **CLOSED** | independent zero-units fixture on both `--registry` and `--manifest`, both rewrite to error/vacuous, exit 21 |
| -- | A/B row-for-row identity plus `agent-rules-drift` | **CLOSED** | independently re-derived on shipped head, zero mismatches |
| -- | One job, no matrix | **CLOSED** | read `.github/workflows/gates.yml` in full |

No item is PARTIALLY CLOSED or NOT CLOSED. No item is NEWLY BROKEN.

## Verdict

**APPROVE.**

Findings from this delta review: 0 high, 0 medium, 0 low. Every mechanism the arbitration required this round to close was independently re-verified by execution, not by reading the work history's claims at face value: two structurally different mutations reddened each witness, the two new "made checkable" tests were confirmed to fail under exactly the condition they claim to catch (and confirmed not to be count-based, addressing CLAUDE.md's specific ban on counting append-only registries), the A/B and M2-C-2 regression checks were rebuilt from scratch rather than re-run from the phase's own fixtures, and the full suite is 473/473 with a clean `git status --porcelain` after build.

This is fit to merge on the substance verified here. The one open item is the `scope` gate's real-branch behaviour, which this detached worktree cannot witness directly (see below) but which is cross-checked against the implementer's own real-branch capture and against the identical, previously-accepted pattern from the M3-P1 delta review.

## What I did NOT cover

1. **`scope` gate green from a REAL `claude/m3-p2-gate-registry` branch checkout, independently, in THIS review.** My worktree is detached HEAD by task design; the actual named branch is checked out in a sibling worktree (`.../scratchpad/wt-m3p2`) and `git checkout claude/m3-p2-gate-registry` here fails (exit 128, "already used by worktree"). I cross-checked my own `scope: not-applicable` (never `red`) against the implementer's own captured `scope: green` real-branch run and confirmed every OTHER count between the two runs is identical, but I did not personally drive a real-branch checkout to green.
2. **The `push` CI arm.** Neither this round nor my review ran the workflow's `push`-to-`main` event for real; the drift step's presence on both arms was checked by reading the workflow YAML and by the extracted-step test, not by triggering an actual GitHub Actions run.
3. **Registry entries other than `agent-rules-drift` being unreachable by both CI bundles**, beyond the one declared divergence. The round itself states this is now ASSERTED (pinned to one entry) rather than freshly audited from scratch this round; I did not re-audit the full registry against both bundle definitions independently, only confirmed the one declared entry and its guard.
4. **A real consuming project outside this kernel repository.** Everything, including my own re-derivations, was measured inside `tiphys-ai-helmsman` itself.
5. **The parts of M3-P2 the dual review already covered and the arbitration did not ask this round to touch** (e.g., criteria 1, 2, 4, 5, 6, 8 in general) -- per the task's scope instruction, I did not re-review these beyond the specific regression checks (M2-C-2/M2-C-3, the A/B, the one-job workflow) the task explicitly asked me to re-verify.
6. **`test/checks.test.ts` and other files touched only incidentally by the underlying phase (not by this fix round's own diff)** were read where the sweep's own disposition table cited them but not exhaustively re-audited beyond that.
