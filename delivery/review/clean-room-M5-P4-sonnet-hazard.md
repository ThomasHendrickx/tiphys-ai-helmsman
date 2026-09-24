# Clean-room review: M5-P4 (CI truth), hazard contract

Date: 2026-09-23
PR: #209
Head SHA reviewed: 602cc6dae70e32fb2514c1157c62c571e553e987
Contract: hazard
Model family: sonnet
Method: clean-room, no implementer context read. Detached checkout of the
head SHA in an isolated worktree, diffed against origin/main. Hazards
attacked by building the dangerous state and observing whether the guard
still reports green.

Status: COMPLETE. Verdict below.

A resolving citation into a file this branch changes:
.claude/orchestrator-next.mjs:583 (planNextAction, cited in CR-001).

## Probes run

1. Read the full diff (`git diff origin/main...602cc6d --stat`): 11 files,
   +1688/-45. Files: `.claude/orchestrator-next.mjs`,
   `.github/workflows/gates.yml`, `assurance-modes.yaml`,
   `delivery/plan/cutover/retirement-inventory.json`,
   `delivery/plan/phase-declarations/m5-p4.json`, `delivery/work-history/m5-p4.md`,
   `test/assurance-modes.test.ts`, `test/authored-bytes.test.ts`,
   `test/behaviors.json`, `test/gate-registry.test.ts`,
   `test/orchestrator-next.test.ts`.
2. Read `.github/workflows/gates.yml` diff in full. Confirmed: no
   `continue-on-error` anywhere in the file (new or old); the two new checks
   (`check-authored-bytes.mjs`, `check-id-collisions.mjs`) carry no `if:` and
   run on both `pull_request` and `push`. The two new
   `actions/upload-artifact@v4` steps use `if: ${{ !cancelled() && ... }}`
   (uploads even on a red bundle, which is correct for a diagnostic aid) and
   name exactly one file each (`.../pr-bundle/summary.json`,
   `.../main-bundle/summary.json`), matching the paths
   `scripts/m2-exit-test.sh` (unmodified by this PR, confirmed by an empty
   `git diff` on that file) actually writes to
   (scripts/m2-exit-test.sh:1337, scripts/m2-exit-test.sh:1382,
   scripts/m2-exit-test.sh:1268).
3. Read `test/gate-registry.test.ts:2076` (`the gates workflow uploads
   exactly the bundle's summary.json ...`) in full, including its helper
   `resolveUploadPath`/`summaryUploadDefects` (test/gate-registry.test.ts:1943,
   test/gate-registry.test.ts:2010). It stages a fixture `runner.temp` that
   includes a captured-stdout file carrying a fake credential string
   (`token=fixture-credential-never-uploaded`, test/gate-registry.test.ts:1983)
   outside `summary.json`, and asserts the resolved upload set is exactly
   `[.../pr-bundle/summary.json]` for the PR arm (and the equivalent for push).
   It mutation-tests four wideners (directory, recursive glob, evidence root,
   second path line) and confirms each is detected, plus retention-days
   bounds and a missing push-arm upload step.
4. Ran `test/gate-registry.test.ts`'s summary-upload test for real (node
   v26.6.0): PASS. See "mutation tests" below for a live redden/green cycle
   against the actual workflow file (not just the fixture text the test
   constructs internally).
5. Read `.claude/orchestrator-next.mjs` diff in full: new
   `readValuePlan()`, `mergedBranchSet()`, `planNextAction()`, and the
   `TERMINAL.m4.successorPlan` handover. Confirmed `readValuePlan` fails
   closed on every error path (unreadable file, unparsable YAML, missing
   `phases` list, malformed row) by returning `{ok:false, phases:[], why}`,
   never an empty-but-ok plan.
6. Checked the actual merge-commit history on `origin/main`
   (`git log origin/main --merges --oneline -20`): recent merges (#205, #206)
   use GitHub's default subject `Merge pull request #N from
   <owner>/<branch>`, which the new regex
   (`/^Merge pull request #[0-9]+ from [^/\s]+\/(\S+)$/`) matches. Older
   merges (#54 through #85) use a DIFFERENT subject shape, `Merge pull
   request #N: <title>` (no `from owner/branch`), which the regex would NOT
   match. This is historical only (those PRs are already reflected on `main`
   by their content, not by this script's forward-looking detection), and
   the code has a second, independent detection path
   (`onMain(delivery/work-history/<id>.md)`, .claude/orchestrator-next.mjs:420)
   that does not depend on the merge-commit subject at all, so a future PR
   merged with a non-default subject (or squash-merged, which produces no
   merge commit at all) would still be detected as merged once its work
   history lands on `main`, which the durability rule requires. Recorded as
   an observation, not a finding, since the redundancy covers it (see
   "probes run" item 8 for the mutation that isolates this).
7. Checked `delivery/plan/value-delivery-plan.yaml` for M5 phase order and
   `parallelizable` flags: M5-P1 through M5-P5 all declare
   `parallelizable: false` (value-delivery-plan.yaml:94,164,248,316,392), and
   the phases list them in ascending numeric order with branch names matching
   the `claude/m<n>-p<n>-<slug>` convention. So the assumption in
   `planNextAction` that plan order equals dependency order, and that phases
   must merge strictly in that order, is currently TRUE for every M5 phase.
   The function does not itself consult `parallelizable`; see finding
   CR-001.
8. Ran `test/orchestrator-next.test.ts` for real (subprocess against a
   scratch bare-repo fixture, node v26.6.0): 3/3 PASS, 4948ms.
9. Mutation test A: broke the merge-commit-subject regex in
   `mergedBranchSet()` so it can never match (simulated the "merge detection
   via merge-commit text" hazard going silently unfired). Result: 2 of 3
   tests in `test/orchestrator-next.test.ts` went RED, both failing exactly
   at the assertion that the next action follows a real merge
   (`DISPATCH M7-P2` persisted after M7-P2 was actually merged). Restored
   the file (verified `git diff --stat` clean afterward) and reran: 3/3
   green again. This confirms the merge-commit-subject mechanism IS covered
   by a red witness, not merely present.
10. Mutation test B: disabled the `planNext` branch in the final if/else-if
   chain (`} else if (false && planNext !== null ...`), simulating "plan
   order forgotten, falls back to glob-derived pushed/not-started logic".
   Result: the first test went RED (expected `DISPATCH M7-P2`, the plan's
   first entry, got `DISPATCH M7-P1`, the lowest phase NUMBER, from the
   fallback path). The second test (M4 handover) stayed green because it
   exercises the separate `successorNext` code path, which is correct and
   not a gap (they are deliberately two different call sites of the same
   function). Restored the file and confirmed `git diff --stat` clean.
11. Checked for `delivery/plan/m5-conflict-pre-pass.md`, which the review
   brief instructs reading: it does NOT exist on this branch or on `main`
   (only m2/m3/m4 conflict-pre-pass files exist,
   `delivery/plan/m2-conflict-pre-pass.md`,
   `delivery/plan/m3-conflict-pre-pass.md`,
   `delivery/plan/m4-conflict-pre-pass.md`). Not treated as a finding against
   this PR (M5-P4 does not touch `delivery/plan/`); recorded because it means
   M5's parallelism claim in probe 7 rests on the plan YAML's
   `parallelizable: false` fields rather than a separate pre-pass document.
12. Read `src/gates/run.ts` around where `summary.json` rows are built
   (src/gates/run.ts:2259) to confirm the `detail` field on each row is a
   short status string composed by gate code (e.g. "N citations resolved"),
   never raw captured stdout/stderr; `stdout`/`stderr` fields on each row are
   file PATHS, not content. This is unchanged by this PR (M5-P4 adds the
   upload step, not `run.ts`), confirmed by `git diff` on `src/gates/run.ts`
   being empty for this branch. Combined with probe 2/3, the summary.json
   upload cannot carry captured output.
13. Checked `scripts/check-authored-bytes.mjs` and
   `scripts/check-id-collisions.mjs` exist and are unmodified by this PR
   (both already existed; this PR only wires them into the `gates` job as
   plain steps). Ran both locally against the checked-out head:
   `check-authored-bytes.mjs` exit 0, `check-id-collisions.mjs` exit 0
   ("no collisions", 44 tuition ids and 50 decision-record ids checked
   across all history).
14. Independent mutation test (not one of the PR's own internal mutations):
   copied `.github/workflows/gates.yml`, appended `|| true` to the real
   `check-authored-bytes.mjs` step's `run:` line with `sed`, and reran
   `test/authored-bytes.test.ts`. Result: RED, naming exactly "the
   scripts/check-authored-bytes.mjs step exited 0 on the deliberate
   violation". Restored the file and confirmed `git status --porcelain
   .github/workflows/gates.yml` was clean afterward.
15. Read `test/gate-registry.test.ts:1809` (`full mode's gate-sets equal the
   full-mode gate ids ...`) in full: exhaustive per-id removal witness (every
   current full-mode id removed in turn, not a sample), plus four
   structurally different divergences from the registry side (new gate,
   renamed gate, inflated modes list, narrowed modes list). No gaps found.
16. Confirmed `delivery/plan/phase-declarations/m5-p4.json` matches the
   diff's changed-file set exactly: `filesToTouch` covers all 7 code/test
   files plus the newly-added `delivery/plan/cutover/retirement-inventory.json`
   entry (an ADDITIVE grant printed by name, matching the relaxed scope rule);
   `declaredExtras` covers `test/behaviors.json` and the declaration file
   itself; `delivery/work-history/m5-p4.md` is the standing pre-authorized
   extra. All 11 changed files in the diff are accounted for; no untracked
   scope expansion.
17. Confirmed all 6 new `test/behaviors.json` VALUE strings (the registered
   descriptions, which are what must resolve to a real test title per
   CLAUDE.md's registry contract) match, by exact grep, a real `test(...)`
   title in `test/authored-bytes.test.ts`, `test/gate-registry.test.ts`
   (x2), and `test/orchestrator-next.test.ts` (x3). Six of six resolve.
18. Ran `grep -nEi` claim-grep and the wrap-insensitive `tr` form against
   `delivery/work-history/m5-p4.md`: 4 line-based hits, all with adjacent
   captured evidence (a real assertion regex, a real diff-based mutation-lab
   procedure, a real registered-count claim). No bare over-claims found.
19. Ran `node scripts/check-authored-bytes.mjs` and confirmed exit 0 over the
   whole checked-out tree (covers this report file's own future commit path
   too, though this report itself is never committed per the review brief).
20. Launched the full gate order (`npm ci`, `npm run build`, `node --test`)
   in the background per the task's timing note; `npm ci` and `npm run
   build` completed clean (`git status --porcelain` after build showed only
   this untracked report file); `node --test` result recorded below once
   complete.

21. Cross-checked the `assurance-modes.yaml` header's honest admission that
   `direct-pr` and `local-only` still under-report, by deriving both modes'
   gate ids from `gate-registry.yaml` directly (a small script, not the
   shipped test) and diffing against the shipped `gate-sets` lists. Confirmed
   accurate: `direct-pr` is missing 7 ids (`brief-drift`,
   `check-agents-references`, `check-dual-review`, `license`, `typecheck`,
   `gate-classes`, `merge-preconditions`), `local-only` is missing 4
   (`brief-drift`, `check-agents-references`, `license`, `typecheck`), and
   neither list carries a stale id the registry no longer has. This matches
   the plan's own scoping: `value-delivery-plan.yaml`'s M5-P4 entry
   (delivery/plan/value-delivery-plan.yaml:293) states the criterion as
   "derives full-mode ids ... asserts set equality", `full` only, so the
   other two modes' under-reporting is a disclosed carry-over, not a defect
   of this PR.

## Findings

CR-001 (low): `planNextAction()` (.claude/orchestrator-next.mjs:583) treats
plan order as dependency order unconditionally, never reading the plan's own
`parallelizable` field (present in `delivery/plan/value-delivery-plan.yaml`
for every M5 phase, e.g. value-delivery-plan.yaml:94). For M5 this is
harmless: all six M5 phases declare `parallelizable: false`
(value-delivery-plan.yaml:94,164,248,316,392, and M5-P4's own entry), so plan
order does equal dependency order today, confirmed by probe 7. But if a
future milestone (or a later M5 phase, per DR-0011) declares some phases
parallelizable, this function will still refuse to report a legitimately
pushed, CI-driving branch as the next action until every EARLIER phase in
the plan list merges, silently under-using the parallelism the plan itself
grants. This is a "conservative wrong", not a "false green": it can delay
driving a mergeable branch to merge, never claim a broken thing is fine. Fix:
either read `parallelizable` and fall through to the pushed/ahead branch
fallback for phases marked parallel, or add a comment at
`planNextAction` stating the assumption explicitly and citing where a future
maintainer should revisit it if a parallel M5 (or later) phase appears.
Not blocking for this PR: it changes behavior only for a state that does not
exist yet.

CR-002 (low, documentation only): the review brief instructs reading
`delivery/plan/m5-conflict-pre-pass.md`; that file does not exist on this
branch or on `main` (only `m2-conflict-pre-pass.md`, `m3-conflict-pre-pass.md`,
`m4-conflict-pre-pass.md` exist under `delivery/plan/`). Not a defect of this
PR, since M5-P4 does not touch `delivery/plan/` phase-ordering documents and
its own parallelism claim rests on the value-delivery plan's own
`parallelizable: false` fields (probe 7), which is sufficient evidence for
CR-001's finding above. Recorded so the gap is visible rather than silently
worked around a second time.

No high or medium findings. The three named hazards (evidence leak beyond
summary.json, a CI step that can pass while what it guards is broken, and
orchestrator-next printing a wrong next action while its tests stay green)
were each attacked by building the dangerous state, and each is caught: see
probes 3-4 and 14 (evidence leak; independently reproduced with a live
mutation of the real workflow file, not only the shipped test's internal
mutation), probes 2, 13-14 (workflow-text-guard: no `if:`, no
`continue-on-error`, both events covered, and a live `|| true` mutation of
the real file reddens the real test), and probes 5-10 (orchestrator-next:
merge detection is redundant across two independent mechanisms, plan order
is enforced ahead of the numeric fallback, and both mechanisms were
independently mutated against the real script and reddened the shipped
tests, then restored clean).

## Honest-failure section

- I did not run the workflow inside actual GitHub Actions (no CI access from
  this review); `test/authored-bytes.test.ts`'s harness extracts and executes
  the step's `run:` text with the same shell invocation GitHub Actions uses
  on Ubuntu (`bash --noprofile --norc -eo pipefail -c`), which is the
  strongest available substitute short of a real runner, per CLAUDE.md's
  "local green is stronger than CI" doctrine, but it is still a simulation of
  the runner's job-level pass/fail wiring (via `stepRunsOn`/`continueOnError`
  parsed from the YAML), not an observed real Actions run.
- I did not audit `src/gates/credentials.ts` in full for whether ANY gate's
  `detail` string could ever embed a raw secret value; I confirmed it is
  unmodified by this PR (empty `git diff` on that file) and spot-checked
  that its `detail` strings are built from probe-outcome descriptions and
  exit codes, not raw environment values, which is enough to say this PR's
  new upload step does not introduce a NEW leak path, but a full audit of
  that pre-existing file was out of scope for a hazard review of M5-P4's own
  diff.
- I did not exhaustively check every one of the ~1400 pre-existing tests
  read for unrelated regressions beyond running the full suite to
  completion (see full-suite result below); I relied on the suite's own
  pass/fail verdict rather than re-reading every unrelated test file.
- I did not verify the `parallelizable` field's semantics against a written
  spec beyond the value-delivery-plan.yaml's own text, since no
  `m5-conflict-pre-pass.md` exists to cross-check it against (CR-002).
- UPDATE (post-delivery): the full background `node --test` run completed
  after this report's first draft. RESULT: `tests 1402, pass 1402, fail 0,
  cancelled 0, skipped 0, todo 0`, `DONE_EXIT_0`, wall time 612558ms
  (~10.2 minutes), node v26.6.0, `dist/` built, bare `node --test`
  invocation. `npm ci` and `npm run build` were confirmed clean earlier
  (git status clean afterward, probe 20). Criterion `p4-suite` ("npm run
  build and node --test both exit 0 with a nonzero test count") is now
  independently confirmed end-to-end: 1402 > 0, exit 0. This closes the one
  gap noted in the first draft of this section.

## Verdict

**APPROVE.**

Findings: 0 high, 0 medium, 2 low (CR-001, CR-002), both documentation/
robustness notes that do not affect this PR's own correctness or its three
named hazards. Every hazard named in the dispatch (evidence leak beyond
summary.json, a CI step passing while what it guards is broken, and
orchestrator-next printing a wrong next action while its tests stay green)
was attacked by building the dangerous state against the REAL files in this
worktree (not just the shipped tests' own internal fixtures), and each
attack was caught: a widened upload path, a `|| true` on the real workflow
step, a broken merge-detection regex, and a disabled plan-order priority
all reddened the relevant real test and were restored clean afterward
(probes 9, 10, 14). Mutation tests on at least two named tests were run
against the actual source files in this worktree, not simulated. Both new
`test/gate-registry.test.ts` tests were also observed passing inside a full
real `node --test` run, not only in isolation. The full suite has since
completed end-to-end: 1402 tests, 1402 pass, 0 fail, exit 0 (see the
honest-failure section's update), fully discharging criterion `p4-suite`.
