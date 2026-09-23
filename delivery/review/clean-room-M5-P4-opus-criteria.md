# Clean-room review M5-P4 (CI truth), criteria contract

- Date: 2026-09-23
- PR: #209, branch `claude/m5-p4-ci-truth`
- Head reviewed: 602cc6dae70e32fb2514c1157c62c571e553e987 (merge base e81c5e8)
- Contract: criteria
- Model family: opus
- Method:
  - Checked out the head detached in an isolated worktree.
  - Put Node v26.6.0 first on PATH, and checked `node --version` in every
    script shell.
  - Re-executed every criterion rather than reading it.
  - Applied mutations in a separate detached lab worktree of the same head
    (node_modules symlinked). Each mutation was restored from a saved copy,
    and `git status --porcelain` in the lab was empty afterwards.
  - Ran the scope gate in a scratch clone with the phase branch name checked
    out at the reviewed head.
  - Read the CI run for this head through the GitHub tools and REST.

## Verdict

FIX-ROUND-NEEDED. High 0, medium 1, low 2.

- CR-001 (medium): the p4-ci-steps harness runs each step under
  `bash -eo pipefail`. The real runner uses `bash -e {0}` (measured in this
  head's own CI log). So a `| cat` defang passes the harness while the real
  step can no longer fail. This is the workflow-text-guard hazard.

Every other criterion is MET. The fix for CR-001 is small and mechanical, and
is given below.

## Criteria walk

| criterion | verdict | evidence |
|---|---|---|
| p4-ci-steps | MET for the shipped workflow; the guarding harness is NOT faithful (CR-001, medium) | see below |
| p4-summary-artifact | MET, including on a real runner for the pull_request arm; CR-002 (low) | see below |
| p4-mode-complete | MET | see below |
| p4-next-action | MET | see below |
| p4-suite | MET | see Suite |

### p4-ci-steps

`.github/workflows/gates.yml` is changed by the branch, so it is quoted here.
It carries two plain steps in job `gates`, after `npm test`, with no `if:` and
no `continue-on-error`.

The harness in `test/authored-bytes.test.ts` parses the workflow and extracts
each step's `run:` text. It then EXECUTES that text with bash in committed
fixture repositories: once clean, and once with a violation (a NUL byte; a
duplicate T-001). This is execution, not text presence.

The control test is green (exit 0). The implementer's in-test defangs are
`|| true`, step `continue-on-error`, and an `if:` narrowed to one event. My
extra mutations:

| mutant | result |
|---|---|
| job-level `continue-on-error: true` added to `gates` | RED, exit 1 |
| id-collision `run:` replaced by `echo node scripts/check-id-collisions.mjs` (string present, never executed) | RED, exit 1 |
| id-collision `run:` suffixed `; exit 0` | GREEN, correctly. Under `-e` the failing node command exits the shell before `exit 0`, so the real runner would also fail the step. |
| id-collision `run:` suffixed with a pipe to `cat` | **GREEN, INCORRECTLY** (CR-001). The real runner would pass the step. |

Real runner: pull_request run 35834743824 on head 602cc6d, gates job,
conclusion success. The log shows `Run node scripts/check-authored-bytes.mjs`
and `check-id-collisions: no collisions`, so both steps ran in the required
context. The failing arm is NOT observed on a real runner. Only the harness
covers it, and that is what CR-001 is about.

Directly on the head tree: `node scripts/check-authored-bytes.mjs` exit 0, and
`node scripts/check-id-collisions.mjs` exit 0 ("no collisions", next free
T-045 / DR-0052). So the new steps do not redden the clean tree.

### p4-summary-artifact

There are two `actions/upload-artifact@v4` steps, one per arm. Each `path` is
a single file, `${{ runner.temp }}/m2-exit-evidence/{pr,main}-bundle/summary.json`,
with `retention-days: 7`.

- The bundle subdirectories match the harness at scripts/m2-exit-test.sh:1337
  and scripts/m2-exit-test.sh:1382. That file is byte-identical on main and on
  the branch.
- summary.json is written at the root of the evidence directory
  (src/gates/run.ts:2313).
- Its rows carry capture PATHS, not contents (src/gates/run.ts:187).

The test resolves the `path` input against a fixture runner.temp. The control
test is green. My mutations:

| mutant | result |
|---|---|
| push arm path widened to the `main-bundle` directory | RED, the resolver names suite/stdout.txt |
| push arm retention 30 | RED |
| pr arm path to `pr-bundle/*.json` | RED, but only through the text-pin precondition `workflow.includes(prPath)`, not the resolver |
| pr arm path to `pr-bundle/summary*` | RED, same text-pin precondition |
| push arm path to `main-bundle/*.json` | **GREEN** (CR-002) |
| push arm path to `main-bundle/summary.json*` | **GREEN** (CR-002) |

Real runner: the same run uploaded artifact
`gates-summary-pull-request-attempt-1`.

- Artifact id 10739490286, expiring 2026-09-30, so the 7-day retention holds.
- I downloaded it through the REST API (HTTP 200).
- The zip holds exactly one entry, `summary.json` (11788 bytes).
- Its 15 gate rows carry only `stdout` PATHS under
  `/home/runner/work/_temp/m2-exit-evidence/pr-bundle/`, never the capture
  contents.

The push-arm upload cannot be observed before merge. The implementer's
CI-deferral of it is honest.

### p4-mode-complete

`full` now lists 21 ids. A direct node computation prints
`registry full 21 modes full 21 equal true`.

The test derives the expected set from gate-registry.yaml at run time. It
removes every derived id in turn and checks both directions.

My mutation removed `merge-preconditions` from `full`. The implementer's
witnesses used brief-drift and deploy, so this is a different id. Result: RED,
with the message `gate merge-preconditions declares modes [full] in
gate-registry.yaml and is absent from full's gate-sets in assurance-modes.yaml`.

### p4-next-action

Real runs at the head (lab worktree, origin/main e81c5e8):

| invocation | exit | NEXT ACTION lines | DR-0047 / APPROVAL SWEEP hits |
|---|---|---|---|
| `--milestone m5` | 2 | 1: `DRIVE M5-P1 TO MERGE. It is the first phase in delivery/plan/value-delivery-plan.yaml ...` | 0 |
| `--milestone m4` | 2 | 1: `M4 IS CLOSED, all 30 phases merged. DRIVE M5-P1 TO MERGE. ...` | 0 |
| no argument | 2 | 1: milestone M5, same action | 0 |

The action comes from the plan, not a constant. `test/orchestrator-next.test.ts`
uses an M7 fixture plan that lists P2 before P1. It then merges and pushes
branches, and checks that the answer moves.

My mutations:

- Disabling the `ahead > 0` arm in planNextAction (always DISPATCH): RED.
- Making the M4 handover string name `RUN THE DR-0047 FINAL APPROVAL SWEEP`:
  RED.

## Findings

### CR-001 (medium): the CI-step harness emulates a shell the runner does not use

**Claim.** The harness is in `test/authored-bytes.test.ts`, which the branch
changes, so it is quoted. Its comment at line 134 says that GitHub uses
`bash --noprofile --norc -eo pipefail` for a `run:` step with no `shell:`. It
runs the extracted step that way, at line 204. That is the command for an
explicit `shell: bash`. With no `shell:`, the runner uses `bash -e {0}`, which
has no pipefail. Measured in this head's own CI run 35834743824, id-collision
step: `shell: /usr/bin/bash -e {0}`.

**Why it matters.** The plan's workflow-text-guard hazard
(delivery/plan/value-delivery-plan.yaml:305) is "CI appears wired ... while
the step cannot fail the job". This mismatch has exactly that shape.

- Change the step to pipe into `cat` or `tee log`. A pipe to `tee` is a common
  edit.
- The test stays GREEN (exit 0).
- On the real runner, that step would then exit 0 on a real collision.

The red-witness rule (CLAUDE.md:340) requires the test to be red against the
dangerous state, and here it is green. The shipped workflow is correct today,
because it has no pipe. So this is a defect in the guard, not a live CI defect.

**Evidence.**

- `bash -e -c 'false | cat'` exits 0.
- `bash --noprofile --norc -eo pipefail -c 'false | cat'` exits 1.
- Mutation M12 (a pipe to `cat` appended to the id-collision `run:`): harness
  exit 0. The lab was restored afterwards, and its `git status --porcelain`
  was empty.

**Mechanism.** The harness emulates an ASSUMED runtime instead of the measured
one.

**Derivation.** `grep -rn pipefail test/*.ts` gives two hits, both in this
file, at its lines 134 and 204. No other test carries the assumption.

**Not covered by the derivation.** Workflows other than gates.yml, which no
test executes.

**Fix.**

- Execute the step as the runner does, `bash -e {0}`: write the run text to a
  file and run `bash -e <file>`.
- Correct the test comment, and the work-history sentence that repeats the
  wrong default.
- Add the pipe to `cat` as a fourth in-test defang, so a return to pipefail
  reddens.

### CR-002 (low): the summary-upload harness does not redden a glob widening that resolves to the same fixture set

**Claim.** The criterion says "a harness fails if the path is widened". On the
push arm, `main-bundle/*.json` and `main-bundle/summary.json*` are widened
paths, and the test stays green. On the pr arm the same widenings do redden,
but only because of a literal text-pin precondition, not because the resolver
saw a different file set. So the two arms are guarded by different mechanisms.

**Why it matters.** Little today. I checked the real evidence layout. A
`gates run` into a scratch directory left only `summary.json` and per-gate
subdirectories at the top level:

- the run claim `.tiphys-gate-run.json` is removed at the end of the run;
- the atomic stage file is renamed into place.

So neither widening would upload captured output now. But the guard's pass
depends on a hand-written fixture, and it would miss a future top-level file.

**Evidence.** The mutation table above. An `ls` of a real
`gates run --evidence` directory showed `scope/` and `summary.json` only.

**Fix.** Either pin the exact `path` string on BOTH arms, which matches the pr
arm, or reject any glob character in an upload `path` outright. The second is
simpler, and it matches the workflow comment's own "no glob and no directory".

### CR-003 (low): CLAUDE.md goes stale on merge (disclosed by the implementer)

The CLAUDE.md section "A green BUNDLE is not evidence ..." says two things that
stop being true on merge:

- The gates workflow uploads no artifact.
- `grep -rn 'upload-artifact|actions/upload' .github/workflows/` exits 1.

After this merge that grep hits the two new steps. The section itself says its
reading procedure is superseded on that day. CLAUDE.md is not on the
declaration, so the implementer was right not to edit it. It still needs an
owner, the orchestrator or M5-P5, before a reader follows a procedure that is
no longer true. This is the work history's open question 2, restated here so
it is not lost.

## Suite

Node v26.6.0, with `dist/` built by `npm run build` (exit 0). `git status
--porcelain` afterwards showed only this untracked report.

| invocation | tests | pass | fail | skipped | exit |
|---|---|---|---|---|---|
| bare `node --test` from the worktree root | 1402 | 1402 | 0 | 0 | 0 |
| `npm test` | 1400 | 1400 | 0 | 0 | 0 |

- The 2-test difference is the known sandbox fixture (CLAUDE.md standing
  warning 12, third axis).
- The worktree is under /home/user and the interpreter under /tmp/claude-0.
  The EACCES trap from standing warning 1 did not fire in this run.
- CI's suite gate on this head reported 1400 units, read from the downloaded
  summary.json.

## Scope audit

I ran the scope gate in a scratch clone: branch `claude/m5-p4-ci-truth` at
602cc6d, `--phase m5-p4`, base origin/main e81c5e8.

- Result: exit 0, `green: 11 changed path(s) audited`.
- It printed: `DECLARATION AMENDED AT HEAD: 1 entry/entries ADDED ...
  filesToTouch delivery/plan/cutover/retirement-inventory.json`.

My judgment on the added entry: ACCEPT.

- The existing retirement-inventory test forces it for every new top-level
  declaration in orchestrator-next (T-033).
- The diff is 217 lines added and 0 removed.
- `node scripts/check-retirement-inventory.mjs` exits 0, with 307 rows against
  307 anchors.
- The file is not in the plan's files-to-touch, so the arbitration should
  record the amendment.

The work history is a standing extra. `test/behaviors.json` and the
declaration are declared extras.

## Behaviors

All six new `test/behaviors.json` rows resolve. Each title appears exactly
once as `test("<title>"` in `test/*.test.ts`.

## Blast radius

- `assurance-modes.yaml` is consumed by the modes validator and by
  `test/assurance-modes.test.ts`.
  - The test's pinned index `/14` is now derived at run time, which is
    correct.
  - `gates run --mode full` now selects 21 gates.
  - CI runs the harness with `--manifest`, so the CI gate set does not change.
- `.claude/orchestrator-next.mjs` is consumed by the orchestrator loop and the
  hourly Routine. The exit-code contract is unchanged. Real runs are captured
  above.
- `gates.yml` gains two check steps and two upload steps, all in the required
  `gates` job. No job was added, so the required context name is unchanged.

## Probes run

- npm ci exit 0; npm run build exit 0; status clean.
- Bare `node --test` and `npm test`: see Suite.
- check-authored-bytes exit 0; check-id-collisions exit 0;
  check-retirement-inventory exit 0; render-agent-rules-gates --check exit 0.
- Citations gate: not-applicable, exit 21. No changed path is under the
  document globs, as the implementer reported.
- orchestrator-next with `--milestone m5`, with `--milestone m4`, and with no
  argument: exit 2 each, one NEXT ACTION line, 0 DR-0047 hits.
- Full-mode set equality by direct node computation: 21 = 21.
- 13 mutations in total:
  - 9 red, as they should be;
  - 1 correctly green (`; exit 0`);
  - 2 incorrectly green (CR-002);
  - 1 incorrectly green (CR-001).
- CI run 35834743824: gates success, the new steps present in the log, and the
  artifact downloaded and inspected.
- The upload steps' `if:` values match the exit-test steps' event conditions
  (`== 'pull_request'` and `!= 'pull_request'`), plus `!cancelled()`.

## Honest failures

- Not observable before merge: the push-arm upload, and both new steps on the
  push event. Check them on the first post-merge push run (T-009).
- Not observed: the failing arm of each new step on a real runner. That needs
  a violating commit pushed to a branch, which a reviewer does not do.
- Read, not executed: the value-plan read, load and parse failure arms in
  orchestrator-next. The implementer's open item 3 says the same.
- Missing input: the review brief names `delivery/plan/m5-conflict-pre-pass.md`,
  which does not exist on main or on the head. The plan entry says
  `conflicts-with: []`. The implementer flags a possible M5-P5 union merge on
  the inventory as unmeasured. I did not measure it either.
