# Work history: CI single-job rework (DR-0017)

## What and why

Owner decision DR-0017 (2026-08-06) collapses the CI workflow from two jobs (a
matrix `test` job plus a non-matrix `gates` fan-in that only asserted the matrix
succeeded) to ONE job named `gates`. The two-job shape needed a second runner
acquisition per run for the fan-in, and under runner contention the fan-in
starved in the queue and was cancelled, turning correct heads red. Commit
c4e253d changed `.github/workflows/gates.yml` to the single-job shape and added
the decision record. This work completes the change: it reworks the M1-P6
falsifiability-guard tests that were built around the two-job structure so they
guard the SAME real property under the single-job shape, with a red-witness.

The real property is unchanged: a failing falsifiability-guard step must reach
the REQUIRED status check. Under one job named `gates` that IS the required
context, so the chain is SHORTER, not gone. The guard step runs inside the
required job; its failure is the required check's failure directly, with no
cross-job result to relay.

## Mechanism (not the finding)

FINDING (what the reviewer would name): two tests in
`test/exit-test-local.test.ts` fail with `no job named test in gates.yml`.

MECHANISM (what is actually fixed): tests coupled to the two-job CI workflow
structure. Any assertion that names the `test` matrix job, the `gates` fan-in's
`needs: test`, the fan-in's `needs.test.result != "success"` / `exit 1` step,
or `gates.if == always()` is coupled to a shape DR-0017 removed. The fix is to
re-express each link under the single job, not to repoint the one job lookup the
error message happened to name.

## Derivation: every call site of the mechanism

Command run at the repo root:

```
grep -rnE 'workflowJob\(|test \(26\)|matrix|fan-in|needs: test|"test" job|node: *$' test/ src/ scripts/ delivery/plan
```

Full output (captured):

```
test/exit-test-local.test.ts:316: *     is INSIDE the `test` job, and the `gates` fan-in names that job in
test/exit-test-local.test.ts:347: *   d. Actions' `needs` semantics themselves. Tier 2 asserts the fan-in
test/exit-test-local.test.ts:374: *     from the `gates` fan-in's `needs`;
test/exit-test-local.test.ts:456:function workflowJob(name: string): Block {
test/exit-test-local.test.ts:544:  // nothing about the job whose result the fan-in consumes. "Extract the
test/exit-test-local.test.ts:558: * for a sequence: `needs: test`, `needs: [test, lint]`, and a block
test/exit-test-local.test.ts:561: * CR-724 F3: round 3 matched /^\s{4}needs: test$/ and therefore reddened
test/exit-test-local.test.ts:562: * `needs: [test, lint]`, an edit that makes the fan-in consume MORE jobs
test/exit-test-local.test.ts:669:  const { script: stepScript } = workflowStep(workflowJob("test"), "falsifiability guard");
test/exit-test-local.test.ts:794:  //   5. the fan-in job consumes THAT job's result       (tier 2, CR-720)
test/exit-test-local.test.ts:800:  const testJob = workflowJob("test");
test/exit-test-local.test.ts:801:  const gatesJob = workflowJob("gates");
test/exit-test-local.test.ts:886:  // 5. The fan-in job names the job the guard is in. workflowStep has
test/exit-test-local.test.ts:895:  // 5b. And the fan-in still fails when that job did not succeed. These
test/exit-test-local.test.ts:909:  // 5c. CR-721: the fan-in's OWN step was checked by nothing. A step-level
test/exit-test-local.test.ts:910:  //     `if: false` there leaves `needs: test`, the `!= "success"`
test/exit-test-local.test.ts:914:  const fanIn = workflowStep(gatesJob, "fail unless every matrix leg succeeded");
test/exit-test-local.test.ts:915:  refuseKeys(fanIn.keys, REFUSED_STEP_KEYS, "the gates fan-in step");
test/exit-test-local.test.ts:917:  // 5d. The fan-in job legitimately carries `if: always()`; that is what
test/exit-test-local.test.ts:927:      "always() is what makes the fan-in run after a failed test job; any other " +
test/gates.test.ts:1224: * `if: false`, a quoted YAML key, and the step moved into a job the fan-in
delivery/plan/kernel-plan-m2.md:31: (matrix job `test`, fan-in job `gates`)
delivery/plan/kernel-plan-m2.md:126: (six confirmed instances narrative)
delivery/plan/kernel-plan-m2.md:239: (check-run contexts test (26) and gates)
delivery/plan/kernel-plan-m2.md:528: (containment/scope narrative)
delivery/plan/kernel-plan-m2.md:608: (M2-D-17 six-instances narrative)
delivery/plan/kernel-plan-m3.md:76: (gates.yml with test matrix job and gates fan-in)
delivery/plan/kernel-plan-m3.md:77:  fan-in job.
delivery/plan/kernel-plan-v1.md:119: (M1-P6 step 8 workflow spec)
delivery/plan/kernel-plan-v1.md:128: (M1-P6 criterion 6 workflow spec)
```

(The delivery/plan lines are abbreviated here; the verbatim capture is in
`scratchpad/ci-single-job/impl/WORK.md`.)

Every executable call site in `test/exit-test-local.test.ts` was reworked. The
non-test hits are addressed under "what the derivation did NOT cover" below.

## What the derivation did NOT cover

- `test/gates.test.ts:1224` is a comment: a historical narrative of the six
  M1-P6 confirmed defang instances ("the step moved into a job the fan-in does
  not need"). Its `bundleStepCommands()` extractor scans for `- name: M2 gate
  bundle ` regardless of job, so it is NOT coupled to job structure and does not
  break. Verified indirectly: the full suite (which includes gates.test.ts) is
  220 pass / 0 fail. Left as accurate history, not rewritten.

- `delivery/plan/kernel-plan-v1.md`, `kernel-plan-m2.md`, `kernel-plan-m3.md`
  describe the two-job shape. These are OWNER-APPROVED plan documents recording
  the historical plan; DR-0017 supersedes them and an agent does not edit
  approved plan text. None is executable, so nothing breaks. NOT modified by
  design.

- The grep scope was `test/ src/ scripts/ delivery/plan`. It did NOT search
  `delivery/review/`, `delivery/work-history/`, `delivery/verification/`, or
  `.claude/skills/`. Those are historical paperwork, not executable, and any
  two-job references there are past-tense records that remain true as history.

- `src/` and `scripts/` produced no coupling hits (the `matrix`/`node:` arms
  matched nothing there); the matrix block itself was already deleted in
  c4e253d.

## The rework

`test/exit-test-local.test.ts`:

1. TIER-1 behavioural test (`the gates falsifiability guard fails the job when
   the harness cannot fail`): only the job lookup changed,
   `workflowJob("test")` -> `workflowJob("gates")`. All behavioural assertions
   (execute the extracted script against stub harnesses) are untouched.

2. TIER-2/3 structural test (`the falsifiability guard sits inside the job the
   required check consumes`): rebuilt for one job. KEPT: the unfiltered
   `pull_request:` trigger assertions; the guard step exists exactly once and is
   inside `gates` (via `workflowStep(workflowJob("gates"), ...)`, whose
   containment check is the single-job replacement for the old `needs:` link);
   `refuseKeys` on the guard step; the file-wide custom-`shell` template check.
   CHANGED: `refuseKeys` on the `gates` job now refuses BOTH `if` and
   `continue-on-error` with no allow-list, because the required job must carry
   no `if:` at all now. REMOVED (each with an in-code comment saying why it no
   longer applies): the `needsOf(gatesJob).includes("test")` link, the
   `needs.test.result != "success"` / `exit 1` fan-in assertions, the
   `workflowStep(gatesJob, "fail unless every matrix leg succeeded")` refuseKeys,
   and the `gates.if == always()` pin.

3. `needsOf` helper deleted (it read the fan-in's `needs:`; nothing references
   it under one job). Replaced by an explanatory comment so no reader re-adds a
   link the single-job shape does not have.

4. Block comment updated: the tier descriptions, the "WHAT IS NOT GUARDED"
   list, the live-check `gh run view --job` hint, and the "WHAT REDDENS THIS
   TEST ON PURPOSE" list now describe the single-job reality.

`test/behaviors.json`: no change. Both touched behaviors keep stable keys; their
descriptions are verbatim copies of the (unchanged) `test()` titles and still
resolve by name. No behavior wording changed, so the append-only registry is
untouched.

## Red-witness

Each structural assertion kept or added was demonstrated RED against a
deliberately-defanged single-job workflow and GREEN against the correct one.
Method: `gates.yml` copied out (sha256
`dc0cc9c4275f754c57b4cf268232a9a668ca33a6712fb6c0cbdd086e2d8a087f`), mutated in
place, the single test run by name, the red assertion captured, then restored
from the copy (`cp`, never `git checkout --`), sha256 re-verified identical, and
re-run GREEN. Harness and full captured output:
`scratchpad/ci-single-job/impl/witness.sh`, `mutate.py`, `WORK.md`.

| # | Defang | Test | Red assertion (captured) |
|---|---|---|---|
| a | guard step moved out of `gates` into a second job | tier 2 | the "falsifiability guard" step is not inside the job this test was asked about (step lines 100-138, job lines 28-96). A guard in a job that is not the required check gates nothing. |
| b1 | `if: false` on the guard step | tier 2 | the falsifiability guard step declares if: "false". An `if:` there can stop the guard's failure ever being evaluated. |
| b2 | `continue-on-error: true` on the guard step | tier 2 | the falsifiability guard step declares continue-on-error: "true". A `continue-on-error:` there stops a failure failing anything. |
| c1 | `if: always()` on the `gates` job | tier 2 | the gates job declares if: "always()". An `if:` there can stop the guard's failure ever being evaluated. |
| c2 | `continue-on-error: true` on the `gates` job | tier 2 | the gates job declares continue-on-error: "true". A `continue-on-error:` there stops a failure failing anything. |
| d | filtered `pull_request:` (`paths-ignore: ['**']`) | tier 2 | the pull_request: trigger is filtered by "    paths-ignore:"; a filter such as paths-ignore or types can leave the trigger present while no pull request produces a run (CR-723). |
| e | witness line changed | tier 1 | the guard no longer prints "falsifiability guard witnessed at C2" on its success path, which is the only per-run evidence that the step actually executed in CI. |
| f | custom `shell: bash -c "exit 0" {0}` on the guard step | tier 2 | gates.yml line 97 sets a custom shell command template ("bash -c \"exit 0\" {0}"). A template decides whether the step's script runs at all. |

Class witnesses have TWO structurally different members each: refused STEP keys
(b1 `if`, b2 `continue-on-error`) and refused JOB keys (c1 `if`, c2
`continue-on-error`). Witness c1 in particular proves the removed 5d property:
`if: always()`, which the old fan-in job legitimately required, now reddens on
the single `gates` job, confirming the job must carry no `if:` at all.

After all eight, `gates.yml` is byte-identical to c4e253d
(`git diff --stat .github/workflows/gates.yml` empty); only the test file is
modified.

## Gates (floor toolchain, node v26.6.0 at the scratch prefix)

- `npm ci`: exit 0.
- `npm run build`: exit 0; `git status` after build shows ONLY
  `test/exit-test-local.test.ts` (dist/ and *.tsbuildinfo gitignored).
- `npm test`: exit 0; tests 220, pass 220, fail 0, skipped 0, todo 0.

## Scope

`git diff --name-status origin/main...HEAD`:

- M `.github/workflows/gates.yml` (c4e253d)
- A `delivery/decisions/DR-0017-single-job-ci.md` (c4e253d)
- M `test/exit-test-local.test.ts` (this work)
- A `delivery/work-history/ci-single-job.md` (this work)

No `test/behaviors.json` change (no behavior wording changed). No stray files.

## Claim grep

`grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/ci-single-job.md`
is run before submission; every hit carries an adjacent captured command or is a
statement of fact settled by a run above. The word "always" appears only inside
`if: always()`, the literal YAML value under discussion (witness c1), not as a
claim about the world.
