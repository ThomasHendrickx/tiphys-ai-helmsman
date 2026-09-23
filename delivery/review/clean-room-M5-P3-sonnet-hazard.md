# Clean-room hazard review, M5-P3

Date: 2026-09-23
PR: #213
Head reviewed: c4727e555cda76d2bee4ddb376a1e8f2f9fda6e1
Base: origin/main 28d1c68
Contract: hazard
Model family: Claude Sonnet 5 (claude-sonnet-5)
Method: clean-room, diff plus real gate/CLI execution against fixture branches
in an isolated worktree. Node v26.6.0 first on PATH.

Status: COMPLETE.

## Setup log

- `git fetch origin && git checkout --detach c4727e555cda76d2bee4ddb376a1e8f2f9fda6e1`
  -> `HEAD is now at c4727e5 Merge main into M5-P3`.
- `node --version` -> v26.6.0.
- Read roles/clean-room-reviewer.md AT H (this phase changes it) and
  roles/_shared-dispatch-contract.md, schemas/verdict.schema.json,
  schemas/finding.schema.json in full before touching the hazard classes.

## Declared hazard classes (delivery/plan/value-delivery-plan.yaml)

1. review-gate-never-runs: "The new files exist but the merge path still
   treats their absence as not-applicable." addressed-by p3-missing-is-red.
2. review-of-old-code: "Verdicts for an ancestor authorize shipped bytes
   added after review." addressed-by p3-pair-arms.
3. process-tax-on-paperwork: "The repair forces full dual review onto
   changes that ship no product behavior." addressed-by p3-paperwork-budget.

Plus obvious ones for this component (a gate that certifies review coverage,
consumes CI check-run output it does not own, and gates every future merge):
in-flight/not-applicable reachability, decorrelation (family/framing/
contract) spoofing, symbolic --head, missing GH_TOKEN, paperwork-tier
leaking into src/ changes, false-red (blocking a legitimate merge forever).

## Diff shape

git diff origin/main...HEAD --stat shows the central file is
src/gates/merge-preconditions.ts (805 changed lines), plus
scripts/check-dual-review.mjs (193), roles/clean-room-reviewer.md (52),
test/merge-preconditions.test.ts (new, 257), test/dual-review.test.ts (428),
witness/*.json (new fixtures). src/checks.ts is UNCHANGED by this phase
(git diff origin/main...HEAD --stat -- src/ shows only
src/gates/merge-preconditions.ts). So the ancestry-admission mechanism
(relateDeclaredHead, partitionByAuditedHead, evidence-only-ancestor) that
guards review-of-old-code is PRE-EXISTING infrastructure this phase composes
by calling `readReviewCorpus` -> `relateDeclaredHead` per admitted verdict
(src/gates/merge-preconditions.ts:1231). I read it to confirm the composition
is real rather than assuming.

## Hazard probe 1: review-gate-never-runs

Read src/gates/merge-preconditions.ts:1381-1452 (the `--base` order) and
:1498-1547 (the corpus fallback without `--base`). With `--base`, a dual-tier
change with review.forHead.length < REQUIRED_VERDICTS (2) is RED via
selectionRow (merge-preconditions.ts:1258, "red below two admitted verdicts")
BEFORE any network call, so an absent verdict is never read as
not-applicable on a shipped-tree change. Confirmed the registry actually
supplies `--base`: gate-registry.yaml diff adds `parameters: [base, head,
phase]` to the merge-preconditions entry and gates.manifest.json mirrors it
(both read via `git diff origin/main...HEAD`).

CROSS-CHECKED THE ENFORCEMENT PATH IN CI, because a registry parameter is not
by itself proof the gate is actually invoked with it. scripts/m2-exit-test.sh
line 226 declares `{"id": "merge-preconditions", "expect":
"green|not-applicable", "required": false}` for the PR bundle. "required:
false" LOOKS like a bypass at first read. Read the assertion loop
(scripts/m2-exit-test.sh:738-795): line 757 `if (!allow.includes(row.status))
fail(...)` runs UNCONDITIONALLY, regardless of `required`; `allow` here is
exactly `["green","not-applicable"]`, so a RED merge-preconditions record
still fails the harness. `required: false` only exempts the gate from the
separate "must be green, not not-applicable" rule at line 764, which is
correct given the honest not-applicable arm the phase's own comment explains
(no verdict yet exists at the moment the harness runs against a fresh phase
branch). CLEARED: this is not a false-green route. This was my strongest
initial suspicion and it did not hold up under reading the actual assertion
code rather than the row's `required` label alone.

## Hazard probe 1b: the OTHER "dual-review" workflow step still uses OLD
## semantics (CR-001 candidate, see findings)

.github/workflows/gates.yml has a step "Dual-review decorrelation (M3-P9)"
(around line 211) that is UNCHANGED by this diff (git diff
origin/main...HEAD -- .github/workflows/gates.yml shows only the M2-exit-test
step touched). That step runs
`node scripts/check-dual-review.mjs --precondition .` with NO `--base` and NO
`--review-budget`, so it still asks the OLD question ("is there any verdict
document") and its else-branch prints "not applicable, no verdict document
... there is no pair of reviews to compare" without failing the step. This
step is a SEPARATE job step from the "M2 exit test" step that runs
merge-preconditions via the manifest runner. Read gate-registry.yaml's own
new comment on the check-dual-review entry: "CI's enforcing arm is
`merge-preconditions`, which is in gates.manifest.json" -- so the implementer
is aware check-dual-review is not the enforcing arm and says so. Given
merge-preconditions independently re-derives the review budget and reads the
corpus itself (does not depend on check-dual-review's verdict), this looks
like accepted, documented redundancy rather than a live gap: a missing-review
shipped change is still caught by merge-preconditions=red regardless of what
the decorrelation step prints. Recorded as a LOW finding below because the
step's own printed sentence is now misleading/stale by omission (it still
reads as though "not applicable" is the whole story) and a future reader
could mistake it for the enforcing gate. Filed as CR-001.

Also checked whether "required: false" for merge-preconditions in
scripts/m2-exit-test.sh:226 is itself a bypass, since that was my initial
read. It is not: the assertion loop at scripts/m2-exit-test.sh:757 (the
allow-list check) runs unconditionally on every declared gate; the allowed
statuses for merge-preconditions are exactly green and not-applicable, so a
red record still fails the harness. required: false only exempts the gate
from the separate "must be green, not not-applicable" rule at line 764. Read
this before concluding anything, not assumed from the label.

## Hazard probe 2: review-of-old-code (live fixture, real command)

Built a fixture repository at /tmp/claude-0/.../scratchpad/m5p3-fixture,
outside the reviewed tree:
  base f0fda9e726cd20f1a2adf41cc4621914b27c74cf (src/a.ts v1)
  reviewed 05643ea233f38715faf89e61f10389ededfcf219 (src/a.ts v2; the commit
    the verdicts will claim to review)
  then a further commit adding src/b.ts (unreviewed shipped content), and a
    commit adding charter.yaml, assurance-modes.yaml and two APPROVE verdicts
    (distinct families/framings/contracts) both naming head 05643ea..., giving
    audited head eadcf10d290c355fec7ec7a69688f7924502238d.

Ran the real gate:
  node src/gates/merge-preconditions.ts --result <out> --head eadcf10d290c355fec7ec7a69688f7924502238d
    --phase m5-p3-fixture --base f0fda9e726cd20f1a2adf41cc4621914b27c74cf --context <fixture>

Result: merge-preconditions: red (1 merge preconditions evaluated), exit 1.
verdict-selection row: "0 of 2 are admitted and 2 missing", both verdicts
listed as EXCLUDED with the sentence "is an ancestor of the commit under audit
..., but 3 path(s) outside delivery/ differ between them (assurance-modes.yaml,
charter.yaml, src/b.ts), so shipped work no verdict reviewed is riding in on a
review of something else". CONFIRMED: an ancestor verdict does not authorize
shipped bytes added after it. This exercises relateDeclaredHead and
partitionByAuditedHead in src/checks.ts:4243-4398, which is PRE-EXISTING
infrastructure (unchanged by this phase's diff) that merge-preconditions.ts
now composes via readReviewCorpus (merge-preconditions.ts:1231).

CONTROL RUN: recommitted the same two verdicts naming the AUDITED head
directly (no ancestry gap), giving head 5abdb6cb3ee4fb47a23facad871feba022952e14.
Reran the same command: result reached the network-probe stage and errored
there ("no repository could be established", exit 21), which is the expected
fail-closed behavior for a fixture with no git remote. It is not the
review-of-old-code arm, and reaching that stage (rather than stopping at
verdict-selection) confirms the review layer PASSED when the gap holds no
shipped content. This is the necessary structural contrast: the SAME two
verdicts, same declared head, pass when the gap is delivery-only and fail
when it is not.

CORRELATED-PAIR CONTROL: from the same committed-at-audited-head state,
changed one verdict's produced-by from family-b to family-a (same family) and
reran: merge-preconditions: red (4 merge preconditions evaluated),
verdict-selection GREEN (2 admitted, 0 excluded), condition-1 RED
("produced-by value family-a occurs in 2 of the 2 verdicts ... not
decorrelated on produced-by"), condition-2 and condition-3 green, exit 1.
This is a second structurally different member of the same review-pair-arms
class (decorrelation rather than ancestry).

## Hazard probe 3: process-tax-on-paperwork (mutation test)

Read REVIEW_BUDGET_ROWS and tierOfPath (src/gates/merge-preconditions.ts:863-902):
an unlisted path defaults to "dual" (fail closed); classifyReviewBudget takes
the WORST tier across every changed path (line 998), so a rename disguising a
src/ deletion as a delivery/ addition still forces dual tier because the
diff is taken with rename detection off, keeping the deletion visible as a
separate path.

Mutation test: temporarily removed "delivery/" from the none-tier row's
paths array (kept CLAUDE.md and .claude/), saved a copy of the original file
first, then ran:
  node --test --test-name-pattern "a delivery-only change is not forced through the two-verdict rule and names its tier" test/dual-review.test.ts
Result: FAILED red. Captured assertion:
  actual: 'red', expected: 'not-applicable'
  "check-dual-review: red: INVALID #/verdicts the diff ... changes 1 path(s),
  1 of them in the dual-review tier (delivery/notes/state.md) ... 0 of 2 are
  admitted and 2 missing."
Reverted the file (copied the saved original back) and confirmed the diff
against the original printed nothing (clean restore) and the tree showed
only this review's own untracked report files afterward.

## Hazard probe 4: in-flight not-applicable arm (mutation test)

Read inFlightCheckRuns (merge-preconditions.ts:465-482): filters check runs
by BOTH name equals context AND head_sha equals head (case-insensitive) AND
status not completed. Concern from the brief: "a run for another head" being
read as this head's in-flight CI.

Mutation test: removed the head_sha equality clause from the filter (kept
the name and status clauses), saved the original file first, then ran:
  node --test --test-name-pattern "an in-flight gates run for a different head is not counted as this head's CI in flight" test/merge-preconditions.test.ts
Result: FAILED red. Captured assertion:
  actual: 'not-applicable', expected: 'not-applicable', operator: 'notStrictEqual'
i.e. the test asserts the status is NOT not-applicable, and after the
mutation it WAS not-applicable, so the assertion failed exactly as intended:
the mutant produces the false "not applicable" the head-scoping filter
exists to prevent. Reverted; confirmed the file matched the original again,
then reran the same test to confirm it passed green (captured: 1 pass, 0
fail).

## Hazard probe 5: missing GH_TOKEN

Read requestJson (merge-preconditions.ts:292-313) and the M5-P3 comment
block above it: with no --token-env value, no Authorization header is sent.
The comment records a real measurement dated 2026-09-23: an unauthenticated
request from this container answered HTTP 403 "API rate limit exceeded",
which becomes error via readJsonBody's status check
(merge-preconditions.ts:333). Fail-closed, never a silent green. Confirmed
--token-env is declared in both gate-registry.yaml and gates.manifest.json
(--token-env GH_TOKEN in the command array, both files' diffs read above)
and that .github/workflows/gates.yml's "M2 exit test (pull request)" step
sets GH_TOKEN from github.token (read above). Did not re-run this arm live
(would need a real reachable GitHub API and no production credential should
be exercised from a review sandbox); relied on the code path, the comment's
dated measurement, and confirming the declaration is wired through both
registry files and the workflow.

## Hazard probe 6: symbolic --head

Read resolveHeadFlag (merge-preconditions.ts:1329-1344) and its comment,
which documents a real prior defect: the old code lowercased the flag
outright, turning the runner's own documented invocation --head HEAD into
the literal string "head", which named no commit. Searched for automated
coverage of the function name and of the literal flag pair in the test
tree: no match anywhere under test/ for either.

Ran the real CLI by hand against the fixture with the literal --head HEAD
(no explicit sha): the gate correctly resolved to the fixture's real HEAD sha
(0320f070c6a6939e8674a976c64b1761849a323d) and reproduced the identical
row-for-row output of the explicit-sha run from hazard probe 2's
correlated-pair control. So the mechanism WORKS as designed today, but
NOTHING in the shipped test suite exercises it, which is exactly the shape
the red-witness rule and the fix-round contract's derivation requirement
exist to catch: a documented historical bug fix with zero regression
coverage. Filed as CR-002 (medium): the failure mode of a regression here is
most likely fail-closed (resolveHeadFlag falls back to returning the raw
lowercased value on failure, which then fails to match any commit
downstream), so this is not itself a false-green candidate, but a missing
witness for a fix the review brief specifically asked to have probed.

## Scope and declaration audit

- src/checks.ts and src/gates/scope.ts are BYTE-IDENTICAL to origin/main
  (no diff output for either path), confirming criterion p3-scope-unchanged.
- Every changed path is either in delivery/plan/phase-declarations/m5-p3.json's
  filesToTouch/declaredExtras, or is delivery/work-history/m5-p3.md, which
  CLAUDE.md names as a standing pre-authorized extra. Verified by diffing the
  full changed-path list against the declaration's JSON with a short script;
  the one path not covered by filesToTouch/declaredExtras was
  delivery/work-history/m5-p3.md, the standing extra, so nothing is actually
  ungranted.
- delivery/plan/phase-declarations/m5-p3.json lists two witness paths that do
  not exist on disk: witness/m5-p3-merge-preconditions-missing-is-red-runner.json
  and witness/m5-p3-review-pair-arms.json (confirmed with a direct listing,
  both not found; confirmed the real witness/ diff lists 14 files, neither
  of these two among them). Filed as CR-003 (low): a stale, over-broad scope
  grant, not a live hazard since scope only checks changed files are ON the
  list, not that every list entry was used.

## test/behaviors.json audit

17 new "m5-p3-*" entries. Spot-checked several by grep, then scripted a full
check over test/; the one apparent miss on the first automated pass
("--token-env sends the named variable's value...") was a false alarm from
shell quoting of the apostrophe, not a real gap: confirmed by a direct grep
finding it at test/merge-preconditions.test.ts:1404. All 17 resolve to real
test titles.

## Suite and build

Toolchain: node v26.6.0 (node --version confirmed in the same shell),
scratch toolchain directory first on PATH.
  npm ci: exit 0 (16 packages already largely present).
  npm run build: exit 0; the tree afterward showed only this review's own
    untracked report file (dist/ not committed, clean tree).
  node --test (bare invocation, repository root, dist/ built): 1441 tests,
    1441 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo, exit 0.
Per standing warning 12, this is the bare node --test invocation rather than
npm test, and toolchain, build state and invocation are all named per that
warning's requirement.

## Validator run

  node bin/tiphys.ts validate --type verdict delivery/review/m5-p3-hazard.json
Output (no --context, as instructed):
  SKIPPED dual-review-decorrelation no context
  SKIPPED verdict-criteria-complete no context
  SKIPPED verdict-deviations-judged no context
  SKIPPED verdict-hazard-classes-addressed no context
  SKIPPED verdict-pair-approves no context
Exit code: 1.
Read src/checks.ts:16 and src/checks.ts:5864: "SKIPPED check-id no context"
is DELIBERATE fail-closed behavior for a Kind B check run without
--context, and the command exits nonzero specifically so an operator cannot
mistake "could not check" for "checked and clean". ZERO "INVALID" lines were
printed, which is the finished-file bar the role brief states (the validator
reports no INVALID line). So the document is schema-valid; the nonzero exit
is the designed no-context signal, not a validation failure.

## Probes run (including those that found nothing)

- review-gate-never-runs: cleared, live fixture plus code read of the --base
  order and of scripts/m2-exit-test.sh's assertion loop.
- review-of-old-code: cleared, live fixture with real exclusion, a control
  run, and a correlated-pair control.
- process-tax-on-paperwork: cleared, red-witness mutation test.
- in-flight arm reachable for wrong head: cleared, red-witness mutation test.
- missing GH_TOKEN: cleared by code and comment reading and registry wiring
  check; not re-run live against a real GitHub API (see honest failures).
- symbolic --head: mechanism WORKS (verified live) but UNGUARDED (CR-002).
- paperwork tier leaking to src/ or witness/ changes: found nothing; every
  unlisted path (including the new witness/ tree) defaults to dual, fail
  closed, confirmed by code reading and by the same mutation test above.
- two verdicts from one family: cleared, live fixture (correlated-pair
  control in probe 2).
- verdict for an old head whose gap adds shipped bytes: cleared, live
  fixture (probe 2's primary run).
- verdict whose head is not an ancestor of the shipped head at all
  (unrelated or descendant): NOT independently re-run live; relied on
  reading relateDeclaredHead's five-outcome classification
  (src/checks.ts:4150-4165) and describeOffHeadVerdicts' per-route sentences
  (src/checks.ts:4404-4437), which are pre-existing and unchanged by this
  phase.
- the check-dual-review direct workflow step retaining old semantics: found
  and filed (CR-001), confirmed not a live enforcement gap because
  merge-preconditions independently re-derives the budget and corpus.
- scope declaration grant additions: found two stale unused entries
  (CR-003), no removal of any existing grant, additive-only as required.

## Honest failures / what I could not check

- Did not exercise merge-preconditions' network-dependent conditions
  (condition-4 CI-green, the ruleset/branch-protection row) against a real
  GitHub repository from this sandbox; relied on reading the code, the
  phase's own captured-fixture tests
  (witness/captures/m5-p3-github-check-runs-in-flight.json,
  witness/captures/m5-p3-git-review-budget.json) and their names resolving
  in test/behaviors.json, rather than re-running them against a live API
  myself.
- Did not re-run test/merge-preconditions.test.ts's or
  test/dual-review.test.ts's full suites as a second, independent execution
  beyond the whole-repository node --test run reported above; did not
  separately re-verify every one of the 17 m5-p3 behaviors with its own
  targeted mutation, only two (paperwork-budget tier, in-flight
  head-scoping), which is the contract's stated floor rather than
  exhaustive coverage.
- Did not attempt to force a genuinely unresolvable --head value (a string
  that is neither a sha nor a valid ref) through the CLI to see the exact
  downstream error shape; inferred from resolveHeadFlag's fallback (returns
  the value lowercased on failure) that this fails closed rather than
  succeeding falsely, but did not capture that arm's output.
- Did not verify the live GitHub repository's branch-protection ruleset
  itself (judgeRulesets, R-064/R-065a) against its current configuration;
  this is data about the repository, not about this diff, and orthogonal to
  the M5-P3 hazard classes.

## Resolving citation

src/gates/merge-preconditions.ts:1231 is the readReviewCorpus call site that
composes the pre-existing relateDeclaredHead ancestry check; this file is
part of the reviewed branch's own diff, so this citation resolves against
the checked-out head H rather than against origin/main.
delivery/plan/value-delivery-plan.yaml:167 (the M5-P3 phase entry, including
its hazard-classes block) is unchanged between origin/main and this branch,
so it resolves identically on either side.

## Verdict

FIX-ROUND-NEEDED. One medium finding (CR-002: the symbolic --head fix has no
regression test), two low findings (CR-001: a stale informational workflow
step message; CR-003: two unused entries in the scope declaration grant).
None of the three declared hazard classes (review-gate-never-runs,
review-of-old-code, process-tax-on-paperwork) produced a finding: all three
were probed with real, live commands against fixture branches, not merely
read, and held. The medium finding is a coverage gap on a documented,
currently-working fix, not a demonstrated live defect; the phase's core
mechanism, the merge gate that decides whether a merge had its reviews, is
sound against every hazard I could construct.
