# Clean-room review: M4-P10 (branch claude/m4-p10-verdict-head-and-medium, head 6a5e5af, base 3b40118)

Reviewer: Fable 5.1 (claude-fable-5-1). Framing: EVIDENCE INTEGRITY.
Started 2026-09-16. Written incrementally; this file is the beacon.

## 0. Orientation

- merge-base(origin/main, branch) = 3b40118 (confirmed).
- Branch carries 40 commits; the first 21 (a985a96..6961186) are orchestrator
  paperwork (M4 plan, intake, DRs, probes, pre-pass). Phase work starts at
  c236f41 ("M4-P10 beacon").
- Diff stat: 41 files, +13307 -156. Shipped surface touched: schemas/verdict.schema.json,
  src/checks.ts. Non-shipped: scripts/check-dual-review.mjs, test/**, delivery/**, CLAUDE.md, STATE.md.


## 1. Documents read

- CLAUDE.md (given in full), plan section 4.2.5 (kernel-plan-m4.md:1619-1723 on branch),
  work history (914 lines, all), m4-prototype-probes.md (all), pre-pass, declaration.
- Phase-only commits: c236f41..6a5e5af (19 commits). Phase-only files: declaration,
  work history, schema, checks.ts, check-dual-review.mjs, behaviors.json, 3 tests,
  5 fixtures under witness/fixtures/dual-review/.
- NOTE: branch is cut from `plan/pstack-borrow-review` at 6961186 (orchestrator paperwork),
  not from main; the 21 paperwork commits ride along. The work history states this at its
  header (base: 6961186).

## 2. First check: derivation not-covered statement (fix-round contract item 3)

Work history section 4 ("What the derivation did NOT cover") lists: dist/ (generated),
delivery/ (prose), inline string readers (second grep run and shown empty outside
the constant), and "a reader that reaches the regime through a different concept".
Section 5 has a second not-covered: "I did NOT re-audit every === and includes in
src/checks.ts for the same inversion". Section 8 lists eight further non-coverages.
Assessment pending verification of the greps (below).

## 3. Reproductions so far (all in a fresh clone at 6a5e5af, node v26.6.0 from /home/user/n26-review, dist/ built)

- npm ci exit 0; npm run build exit 0; git status clean after build.
- Claim grep: line-based whole doc 32 lines; wrap-insensitive whole doc 64 occurrences;
  sections 1-9: 9 lines, 9 occurrences. MATCHES the work history's own numbers exactly.
- Passive-form grep: 4 hits, all "is refused" (lines 89, 93, 96, 209); each is adjacent to a
  path:line into src/checks.ts or test/verdict-head.test.ts that I checked. No over-claim.
- Derivation greps (DELEGATED_MERGE_AUTHORITY, "charter.yaml", delegated-under-conditions):
  reproduce byte for byte. Additional reader search for `merge-authority` finds only
  src/modes.ts:135 (a projection, not a regime decision) and the lifted function. Honest.
- Migration greps: both plan greps exit 1; tree-wide grep finds SEVEN documents. Reproduced.
- Plan's grep -c claims (0 for APPROVE/severity/findings/produced-by in the old script): reproduced at 6961186.
- C-1/C-2/C-3: no pid, /proc, kill, detached, unref, log-tail reads in the phase diff.
- CI: zero workflow runs and zero check runs for the branch; no PR exists yet (REST 200, total 0).
- Sibling branch scan: origin/claude/m4-p11-single-family-exception touches every file of this
  phase, and it CONTAINS 6a5e5af (cut from this head), which is the serialisation the plan
  orders. No other m4 branch touches these files.
- Adversarial staging (script in scratchpad/adv.sh):
  A. `severity: Low` in a committed sibling: gate GREEN; schema INVALID. Canonical fold on the
     severity word where the verdict word is compared raw. Same meaning, so not a fail-open,
     but the check makes THREE fixed-word comparisons and the WH's not-covered says "two".
  B. Old head both FIX-ROUND-NEEDED + new head both APPROVE in one directory: RED. B2 with
     old head both APPROVE: GREEN. So a refusing verdict YAML left in delivery/review/ reddens
     the gate forever. Not stated in WH section 8.
  C. `tiphys validate --type verdict --context <dir>` reaches verdict-pair-approves (shipped CLI path).
  D. Three APPROVE verdicts: decorrelation reddens on review-contract (pre-existing), pair REPORTs.
  E/F. Non-string verdict, absent findings: refused. Fail-closed.
  G. Quoted head with trailing space: check folds (green), schema refuses. Direction is fail-closed for grouping.
- Stale citations: scripts/check-dual-review.mjs:85 (WH says "adds the second check id") and
  the captured grep line `scripts/check-dual-review.mjs:212` were true at dae4618/04c3c10 and
  are off by two at head (87 and 214) after 49f8cf6 added two comment lines. Both resolve
  IN RANGE to comment lines, which is the silent case CLAUDE.md 3b warns about.
- test/verdict-head.test.ts preHeadCommit() walks `rev-list --max-count=200 HEAD`; once 200
  commits sit above the newest head-less schema commit it returns undefined and the four
  history-dependent tests FAIL loudly ("git is available but no pre-head commit was found").
  main has 295 commits over ~6 weeks, so this is weeks away, not years. Test-only.

## 4. Suite run, environment note

At the time of my `npm test` there were at least EIGHT other `node --test` runners on this
4-CPU container (other agents' worktrees: m4p2, m4p13, m4p16, m4p20, m4p27rv, two wf_ worktrees),
load average 65. Two failures had already appeared mid-run (coverage-gate "duplicated inventory
id", gate-runner "precondition command exiting nonzero is error"). Failures under this load
are attributed only after re-running them alone; see section 5.

## 5. Stored witness specs no longer apply after the regime lift (static, then measured)

The lift of the regime block into `establishDelegatedRegime` re-indented four lines from
4 spaces to 2. Four STORED witness specs under witness/ carry mutation `find` strings that
were the 4-space versions. Occurrence counts in the head's src/checks.ts:

- dual-review-distinct-model-families.json: `    if (authority !== DELEGATED_MERGE_AUTHORITY) {` = 0
- dual-review-merge-authority-lookalike.json: `    const authorityReading = establishField(mode.mode, "merge-authority");` = 0
- dual-review-requires-two-verdicts.json: `    if (authority !== ...` = 0, and `    if (group.length < 2) {` = 2 (split/join mutates both)
- dual-review-unestablished-merge-authority.json: both members = 0

src/witness/run.ts:798 returns `ok: false, "mutation find text ... does not occur"` for a
zero-occurrence find. src/gates/red-witness.ts:50-53 re-evaluates every stored witness whose
member touches a changed file, and src/checks.ts is changed. The gate is `required` with
precondition diff-touches src/, so it RUNS on this PR. Neither the work history nor the
declaration mentions witness/*.json; the WH says only "I did not run the full gate bundle".
Measurement running: red-witness gate via the registry runner, output in scratchpad/red-witness.log.

## 6. Measurements completed

SUITE, complete sentence: interpreter node v26.6.0 (/home/user/n26-review, under /home/user);
dist/ BUILT immediately before; invocation `npm test`; tree is a GIT CHECKOUT (fresh clone,
detached at 6a5e5af) under the shared scratchpad /tmp/claude-0/...; result
878 tests, 876 pass, 2 fail, 0 skipped, exit 1, duration 1136 s under load average 45-65
with at least eight other agents' suites running.
- fail 1: test/coverage-gate.test.ts "a duplicated inventory id is red naming it": the same
  250 ms regex wall-clock guard the WH names (src/gates/coverage.ts:260), a different test of
  the same file. Alone: 1 pass. Contention, as the WH says.
- fail 2: test/gates.test.ts:3571 "a precondition command exiting nonzero is error ...":
  ERR_MODULE_NOT_FOUND src/cli.ts from an unprivileged child. Alone at head: fail. Alone at
  the BASE 6961186 in a worktree at the same location: fail, identically. The phase touches
  none of src/cli.ts, src/gates/, test/gates.test.ts. This is the CLAUDE.md standing-warning-1
  clone-location axis (my clone is under drwx------ /tmp/claude-0), not the change.
- test/verdict-head.test.ts alone: 29 tests, 29 pass, 0 fail, 0 skipped. Matches the WH.
- The WH's own sentence (877 pass, 1 fail, 0 skipped at 2010de1) is complete on all four
  qualifiers: interpreter, build state, invocation, and "this worktree" = git checkout.
  It quotes commit 2010de1, and 2010de1..6a5e5af changes only the WH and three declaredExtras
  lines in the declaration (verified with git diff --stat).

MUTATIONS (throwaway worktree at 6a5e5af, one test each):
- headGroupFor made to silently DROP an unkeyed sibling (filter shape): member-two test FAILS. Red.
- BLOCKING_SEVERITIES narrowed to [high, critical] in the check only: 2 tests FAIL. Red.
- verdict word compared case-insensitively (Approve accepted): the Approve test FAILS. Red.
So the three guards I attacked are red against their dangerous states, not only against absence.

GATES run locally at 6a5e5af (registry runner, --base origin/main --head HEAD):
citations GREEN (504 resolved at 6a5e5af), clause-map GREEN, coverage GREEN, agent-rules-drift
GREEN, brief-drift GREEN, check-agents-references GREEN, manifest-self-check GREEN.
scope RED: "no phase declaration exists at delivery/plan/phase-declarations/m4-p10.json in the
merge base 3b40118 ... the declaration must be committed to main before the phase branch is
created". This is the known CLAUDE.md/DR-0031 process gap, an orchestrator item, not the
implementer's.

A NEAR-MISS I AM RECORDING AGAINST MYSELF. The scratchpad directory is SHARED with other
agents (91 entries, files from yesterday). Another agent's red-witness run for head 7dcce83
(claude/m4-p26-rollback) had written scratchpad/ev-rw/summary.json at 02:29:55, the same
directory name I chose, and I read it as MY result ("green, 9 own") before noticing the head
sha and the cutover witnesses in it. My own run was still in flight (pid 18487). Green is
scoped to the run that produced it; the head sha in the record is what tells them apart.
Also: I ran `rm -rf scratchpad/m4p10` before cloning; nothing in the scratchpad references a
prior directory of that name, so I believe nothing of another agent's was destroyed, but I
cannot prove a negative there.
