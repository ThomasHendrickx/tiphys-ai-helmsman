# Adversarial Plan Review r1: Tiphys Kernel Plan v1

- Date: 2026-08-04
- Plan reviewed: delivery/plan/kernel-plan-v1.md (self-declared baseline commit db3d870cd32475935a87184d6b1a82bd6fbf4685; the plan itself is committed as 4341d68)
- Reviewer inputs: the plan, both intake documents, spec-coherence-report.md (SC-001 to SC-013), migration-table.md (115 rows), decision records DR-0001 to DR-0009
- Method: all eight mandatory probes from the process doc section 1d plus the review brief were run: citation audit (sampled every M1 phase citation block plus the SC and DR references), coverage audit (scripted diff of the appendix row set against the migration table, bucket-count verification, per-row milestone cross-check, SC disposition uniqueness, resist-placement and scout-observation resolution), cross-phase conflict hunt, testability audit of every M1 acceptance criterion and the exit test, fix-shape edge-case probing, blocked-by and dispatch integrity, phase 1 feasibility against DR-0002/0003/0004, and conventions (dash scan, language, npm). Mechanical checks were executed with scripts (results in probes-run below), semantic checks by reading every cited target.

## Verdict

FIX-ROUND-NEEDED

One high finding (the teardown guard's unlanded-work check cannot pass the M1 exit test's own step 9 under the current process's squash-merge practice), eight medium, four low. All findings come with concrete plan edits; none requires re-architecting; the phase structure, the SC dispositions, and the appendix survive attack intact.

## Findings

### PR-001

- Severity: high
- Claim in the plan: M1-P4 step 5 rule (b) defines the ship-shape teardown refusal as "refuse if the task branch has commits not contained in the project default branch (unlanded work)". The M1 exit test step 9 then requires: "Merge the PR (owner or orchestrator per current-process merge practice); after gh pr view reports MERGED, tiphys teardown --task m1-exit exits 0" (plan lines 177, 258).
- Why it is wrong: current-process merge practice is squash ("Merge on CI green only. Squash, with a commit message that tells the story", process doc line 158; R-065a makes squash-only the M4 repo config). After a squash merge, the task branch's commits are never ancestors of the default branch: a containment check (git branch --contains, merge-base ancestry) reports them as unlanded forever. Separately, even under a merge commit, the check runs against the local clone's default branch ref, and nothing in P4 or the harness says teardown or the harness fetches before checking, so the local ref is stale at step 9 regardless of merge style. As specified, step 9's "teardown exits 0" is unreachable: the milestone exit test fails on its own guard, which is the canonical state-that-can-never-exit. P4 acceptance criterion 5 hides this: it merges "the branch ... into the default branch in the scratch project" (a true merge, plan line 185), so the tests go green on exactly the path the real flow never takes.
- Evidence: plan lines 177, 185, 256-258; process doc line 158; migration-table.md R-065a (squash-only, M4); blueprint section 13 M1 exit test row.
- Concrete edit: redefine the unlanded-work check in P4 step 5 as landed-or-refuse where landed means any of: (a) the branch's commits are contained in the fetched default branch, or (b) the branch has an empty cumulative diff against the fetched default branch (git cherry or patch-id equivalence, which covers squash merges), and require teardown to fetch the project's default branch before evaluating. Add a P4 acceptance criterion that squash-merges the scratch branch (git merge --squash + commit on the default branch) and asserts teardown then exits 0, and a criterion that teardown still refuses when the fetched default branch lacks the change. Amend exit-test step 9 to note the harness performs the merge with gh pr merge --squash so the squash path is what the milestone witnesses.

### PR-002

- Severity: medium
- Claim in the plan: M1-P1 step 7 creates a "single job named gates (the name DR-0004's ruleset requires) ... on a Node matrix per DR-0002's recommendation" and criterion 6 accepts a workflow that "defines a job whose name is gates" (plan lines 96, 105).
- Why it is wrong: a matrixed job does not produce a status check context named "gates"; it produces one check per matrix leg named "gates (22)", "gates (24)". DR-0004 item 2, executed by the owner right after P1 merges, requires the exact context "gates". The required check then never reports on any subsequent PR, and M1-P2's merge blocks on a check that cannot complete. DR-0004's "if the delivered job name differs, substitute it" note does not save this: the delivered job name IS gates, so the owner has no cue to substitute anything; the mismatch is between job name and matrix-expanded check context. Criterion 6 passes while the thing it guards (the ruleset finding its required check) is broken.
- Evidence: plan lines 96, 105, 111; DR-0004 proposed action 2 and its note; DR-0002 recommendation (matrix 22 and 24).
- Concrete edit: in P1 step 7, run the matrix in a job named test (or similar) and add a fan-in job named gates that needs the matrix job and fails if any leg failed; the required check context stays "gates" and matches DR-0004 verbatim. Extend criterion 6 to assert that a non-matrixed job (or fan-in job) named exactly gates exists and depends on all matrix legs.

### PR-003

- Severity: medium
- Claim in the plan: M1-P1 criterion 1 requires "npm ci then npm test exits 0" and criterion 2 "npm run typecheck exits 0", with files-to-touch enumerating package.json (whose fields are itemized in step 2) and no lockfile (plan lines 91, 98, 100-101).
- Why it is wrong: npm ci refuses to run without a package-lock.json, and package-lock.json is absent from files-to-touch, so criterion 1 is unsatisfiable within the declared file set; an implementer must create an undeclared file, which the plan's own verify-before-editing and scope discipline treat as a deviation. Likewise, typecheck via tsc requires the typescript package, but step 2's package.json field list has no devDependencies entry, and DR-0005's no-build-step recommendation does not make tsc appear out of nowhere in CI.
- Evidence: plan lines 91, 98, 100-101; DR-0005 recommendation (tsc --noEmit --checkJs in CI).
- Concrete edit: add package-lock.json to P1 files-to-touch, add "devDependencies: typescript (pinned)" to the step 2 package.json field list, and note in step 7 that npm ci installs it in CI. No other phase change needed.

### PR-004

- Severity: medium
- Claim in the plan: M1 exit test step 4 says "Clone the toy repo under the fleet's projects area" (plan line 253).
- Why it is wrong: no phase creates or defines a projects area. M1-P2's init creates charter/, decisions/, state/, tasks/, worktrees/, backlog.md, package.json, .gitignore (plan line 121); doctor's layout check does not include projects; section 1.5 places projects/ "on any fleet machine" without saying where relative to the fleet home. If the harness improvises a clone inside the fleet home, the clone is neither tracked cleanly nor ignored (gitignore is "exactly state/ and worktrees/"), leaving the fleet repo permanently dirty with an embedded git repo, undermining the SC-002 durability resolution the same phase implements. A fresh agent executing the exit test cannot resolve "the fleet's projects area" from the plan.
- Evidence: plan lines 44-49 (section 1.5), 121, 129, 253.
- Concrete edit: pick one and write it down: either (a) init creates a projects/ directory inside the fleet home and adds it to the gitignore and to doctor's layout check, or (b) define the projects area as a sibling directory of the fleet home recorded in the fleet package.json (or a fleet config field) and have the exit test read it from there. Update P2 step 2, doctor step 3, criterion 3, and exit-test step 4 to match.

### PR-005

- Severity: medium
- Claim in the plan: M1-P4 acceptance criterion 3: "If pool create fails (duplicate task id), spawn exits nonzero and tasks/<id>/ does not exist afterward (rollback)" (plan line 183).
- Why it is wrong: in the natural duplicate scenario the id is already in use by a live task created by an earlier spawn, so tasks/<id>/ exists and contains that live task's meta.json and brief. A rollback implemented to satisfy this criterion literally (remove tasks/<id>/ on failure) deletes the live task's metadata, which is a destructive regression the criterion actively mandates. Step 4's own rule is right ("a failed step removes what it created"); the criterion contradicts it, because in this failure ordering (pool create is first) the failing spawn created nothing under tasks/.
- Evidence: plan lines 176 (step order: pool create, brief assembly, meta write, executor launch), 183.
- Concrete edit: rewrite criterion 3 as: "If pool create fails (duplicate task id), spawn exits nonzero, the pre-existing tasks/<id>/ contents are byte-identical before and after, and no new files were created by the failing invocation." Add a companion criterion for a later-step failure (executor launch fails) asserting the worktree and tasks/<id>/ created by that invocation are removed.

### PR-006

- Severity: medium
- Claim in the plan: M1-P3 step 1 specifies lock acquire "fails if a live lock exists" with pid-liveness stale detection, and the criteria test sequential contention only (plan lines 146, 153-155).
- Why it is wrong: nothing specifies that acquisition is atomic (O_EXCL create or equivalent), and no criterion exercises concurrent acquire. Two processes that both read "free" (or both read "stale" with --take-over) can both write the lockfile and both believe they hold it, which silently breaks the one-orchestrator-per-fleet invariant the lock exists to enforce. The asymmetry is telling: pool create in the same phase gets an explicit parallel-safety spec (atomic directory creation) and a concurrency criterion (criterion 6); the lock, whose whole job is mutual exclusion, gets neither. Secondary edge in the same fix shape: after a machine reboot, the recorded pid can be reused by an unrelated live process, making a dead lock read "held" forever with takeover refused (a cannot-exit state resolvable only by manual file deletion; acquiredAt is recorded but unused).
- Evidence: plan lines 146, 148 (pool parallel-safety contrast), 153-158.
- Concrete edit: in step 1, specify acquire as atomic create (open with O_EXCL; on EEXIST read and evaluate liveness) and specify takeover as atomic replace (rename over, or unlink-then-exclusive-create with a documented race note). Add a criterion: N concurrent lock acquire invocations against a free lock yield exactly one exit 0 and N-1 nonzero exits, and the lock file contains the winner's pid. Document the pid-reuse limitation in the module docs and have lock status surface acquiredAt so a human takeover decision is informed.

### PR-007

- Severity: medium
- Claim in the plan: DR-0009 appears in the blocked-by list of M1-P3, M1-P4, and M1-P5, P3's grounding says "DR-0009 answered", and section 9's binding rule says phases blocked by a DR "ship nothing until it is decided" (plan lines 144, 164, 192, 216, 328, 340).
- Why it is wrong: DR-0009's own recommendation says "the plan proceeds on option 2 without waiting", and the DR is classified reversible, sizing-only. The plan and the DR give a dispatcher two contradictory instructions: hard-block P3 until the owner answers, or proceed on the BUILD default. A dispatcher following the plan's blocked-by semantics stalls the M1 critical path on a decision the decision record itself says must not stall anything. A phase carrying a blocked-by it does not actually need is the mirror image of the missing-blocked-by defect and equally a dispatch-integrity fault.
- Evidence: plan lines 144, 164, 192, 216, 328 (binding rule), 340 ("sizing only; reversible"); DR-0009 recommendation.
- Concrete edit: remove DR-0009 from the blocked-by fields of P3, P4, P5 and from P3's grounding, replacing it with a dispatch note: "DR-0009 outcome consulted at dispatch; if undecided, proceed as BUILD per D-1; a late option 1 answer after P3 dispatch is ignored." Keep the section 9 row but mark it "consult-at-dispatch, never blocks".

### PR-008

- Severity: medium
- Claim in the plan: M1-P6 acceptance criterion 2 requires that in local mode "the evidence directory afterward contains, for every numbered step of section 4, a file recording the step's command and exit code" (plan line 232).
- Why it is wrong: section 4 steps 6 and 9 are gh operations against the real toy repo (PR opened, gh pr view OPEN, merge, MERGED), and step 1's preconditions include owner action A-1; local mode by its own definition "uses a scratch bare repo as the remote and asserts a pushed branch instead of a PR" and runs with no credentials. A fresh agent cannot produce a truthful evidence file "for every numbered step" in local mode: either the criterion fails, or the harness writes files for steps it did not execute, which is manufactured evidence in a system whose fifth principle is evidence over claims.
- Evidence: plan lines 226, 232, 250-258.
- Concrete edit: add a local-mode step mapping table to P6 step 2 (for example: step 6 evidence is the pushed branch ref in the scratch bare repo; step 9 evidence is the harness's own merge into the bare repo's default branch; steps with no local analogue are recorded as "mode: full-only, skipped in local"), and reword criterion 2 to "for every numbered step of section 4, a file recording either the executed command and exit code or the documented local-mode substitution".

### PR-009

- Severity: medium
- Claim in the plan: M1-P5 defines the watcher heartbeat as doubling "up to a cap" and the liveness guard's stale threshold as "default documented, configurable", with no stated relation between the two (plan lines 201-202).
- Why it is wrong: the beacon is rewritten only on wakes and heartbeats, so on an idle fleet the beacon's age legitimately grows to the backoff cap between writes. If the cap can exceed the stale threshold (nothing forbids it; both are independently configurable), a perfectly healthy watcher is periodically reported "watcher stale" by spawn, teardown, and doctor. A guard that cries wolf on healthy state is a quiet regression of the invariant R-079 names (supervision never SILENTLY disappears): operators learn to ignore the warning, which is the same end state as having no guard. Criteria 4 and 5 test stale and fresh but never the boundary between cap and threshold.
- Evidence: plan lines 201-202, 209-210, 214 (R-079 citation).
- Concrete edit: state the invariant in P5 step 2: the default stale threshold is strictly greater than the backoff cap plus one poll interval, and liveness.js enforces threshold > cap at load (configuration violating it is an error). Add a criterion: with the watcher idle at maximum backoff, the guard reports fresh (no "watcher stale" line) for the entire gap between two consecutive heartbeats.

### PR-010

- Severity: low
- Claim in the plan: M1-P4 step 5 (a) has scout teardown discard dirty scratch changes and proceed once report.md exists, while P3's pool destroy contract "refuses (exit nonzero, reason line) if the worktree has uncommitted changes or untracked files", and P4's files-to-touch hedges only "src/pool.js (edit only if destroy needs a salvage-aware flag)" (plan lines 148, 177, 179).
- Why it is wrong or dangerous: the scout path needs a discard/force capability on pool destroy that P3's contract explicitly forbids and P4's hedge does not name (salvage-aware is the ship path; the scout path needs discard-aware). An implementer honoring P3's contract literally cannot complete the scout teardown; one loosening it without a declared flag weakens the ship-path safety net. This is a cross-phase contract conflict, currently absorbed only by luck of implementer interpretation.
- Evidence: plan lines 148, 177, 179, 186 (criterion 6 requires the dirty scout worktree to be removed).
- Concrete edit: in P3 step 3, give pool destroy an explicit --discard flag (refusal remains the default), documented as reserved for the teardown scout path; in P4 step 5 (a), state that scout teardown calls pool destroy --discard after the report check passes; update P4 files-to-touch to name the flag.

### PR-011

- Severity: low
- Claim in the plan: M1-P6 citations name "R-052b" as one of "the three exit-test behaviors this harness exercises" (plan line 238), and exit-test step 7's refusal is cited to the same row via P4.
- Why it is wrong: R-052b is "a task cannot close without its report/work-history" (the scout carve-out closure rule, migration-table.md section 2 row R-052b). The exit test's teardown refusal (step 7) is the unlanded-work refusal on a ship task; no report is involved. The citation decorates the wrong behavior: the unlanded-work refusal has no R row of its own and comes from the blueprint section 4 teardown contract. A citation that does not support the claim it decorates, per the audit rule.
- Evidence: plan lines 238, 256; migration-table.md row R-052b; blueprint section 4 teardown row.
- Concrete edit: in P6's citations, replace "R-052b" with "blueprint section 4 teardown contract (unlanded-work refusal); R-052b's report-gated scout closure is exercised in P4 criterion 6, not by this harness".

### PR-012

- Severity: low
- Claim in the plan: the SC-002 disposition "Lands in Phase M1-P2: the fleet home is initialized as a private git repository with push discipline" (plan line 60, D-4 at line 312).
- Why it is dangerous: what P2 actually builds is an initial commit plus a doctor WARN when no remote is configured. Nothing in M1 ever commits or pushes post-init fleet changes: task meta, briefs, turn-end files, and any decision records land in tracked-but-uncommitted state, so the fleet repo is perpetually dirty and the durability SC-002 demands (charters, decisions, backlog surviving machine loss) still depends entirely on undocumented operator behavior. The disposition claims more landing than lands; the residue (an actual commit/push discipline, manual or automated) is silently deferred with no named owner or milestone.
- Evidence: plan lines 60, 121-122, 129, 312; spec-coherence-report.md SC-002.
- Concrete edit: add one sentence to the SC-002 row and D-4: "M1 lands the structure (repo, narrowed gitignore, remote WARN); the commit/push discipline for fleet state is an M3 AGENTS.md orchestrator duty (or an M4 hook), tracked as a named M3 item." Add that item to the M3 outline artifact list.

### PR-013

- Severity: low
- Claim in the plan: M1-P4's spawn signature is "tiphys spawn ... [--exec <cmd>]" with the executor seam description saying M1 "ships a subprocess executor" (plan lines 171, 176).
- Why it is wrong: --exec is marked optional but the plan never says what spawn does when it is omitted in M1 (the multiplexer adapter that would make an exec-less spawn meaningful is explicitly M4-era). Also unstated: whether spawn blocks until the payload exits. Exit-test step 6 asserts post-payload facts (pushed branch, PR URL) immediately after "spawn ... exits 0", which is only sound if spawn waits for the subprocess executor to finish; a nonblocking reading makes step 6 racy.
- Evidence: plan lines 171, 176, 255.
- Concrete edit: state in P4 step 4: in M1, --exec is required (spawn without it exits 64 with usage) and the subprocess executor runs the payload to completion before spawn returns, payload exit code recorded in turn-end. Add the missing-exec case to the P4 criteria.

## Probes run

1. Citation audit: re-verified every R row, SC finding, DR, and blueprint/process section cited by the six M1 phases and the exit test against the source documents, plus the M2/M3 outline citations. Every phase literally cites at least one R row (P1: R-048/R-064/R-072/R-097/R-091; P2: R-080/R-095; P3: R-003/R-080; P4: seven rows; P5: R-078/R-079/R-095; P6: R-003/R-052b/R-078). All checked citations support their claims except R-052b in P6 (PR-011). Minor imprecision noted, not raised as a finding: P6 cites "process doc section 7 (evidence over claims)"; evidence-over-claims is blueprint principle 5, though process section 7's honesty rules carry the same substance.
2. Coverage audit: scripted set-diff of appendix rows against migration-table rows: 115 vs 115, identical sets, no duplicates; per-row milestone cross-check between appendix bucket and table milestone column: zero mismatches; claimed counts (M1 11, M2 16, M3 74, M4 13, M5 1, parked 0) reproduced exactly. All 13 SC findings dispositioned exactly once, each landing somewhere real (verified each landing site exists: section 1.5, M1-P2, DR-0005/6/7/8, D-4 to D-8, M2-P4/P5, M3 outline items, M4 paragraph). Spot-checked 20+ appendix rows against the phases/outlines claiming them: all M1 rows appear in their phase's steps or criteria; all 16 M2 rows are named in the M2 outline phase list; all 13 M4 rows and R-026a (M5) are named in section 7; M3 rows land via M3-P1/P2/P3 by name and the M3-P4 catch-all, which the appendix's own outline-level framing permits. The 6 resist-placement rules are each decided (D-9 to D-13) and the 4 scout observations each visibly resolved (appendix closing check verified against the actual plan content). SC-002's landing is real but overstated (PR-012). No orphans found.
3. Cross-phase conflicts: src/cli.js edits (P2 to P6), doctor completion (P2 seam, P5 wiring), gates.yml (P1 create, P6 edit), spawn liveness seam (P4 no-op, P5 wiring) are all declared in conflicts-with and absorbed by sequential ordering. One undeclared contract conflict found: P3 pool destroy refusal vs P4 scout discard (PR-010). The exit test's "projects area" depends on an artifact no phase creates (PR-004).
4. Testability: every M1 criterion checked for pass-while-broken and fresh-agent executability. Findings: P4 criterion 5 witnesses only the merge-commit path while practice is squash (PR-001); P1 criterion 6 passes while the required-check wiring is broken (PR-002); P1 criterion 1 unsatisfiable within declared files (PR-003); P4 criterion 3 mandates destructive rollback (PR-005); P6 criterion 2 unexecutable in local mode as written (PR-008). Local vs full mode split otherwise honest: local mode genuinely witnesses teardown refusal, watcher wake, and teardown-after-merge with a declared pushed-branch substitution for the PR clause; the PR clause itself is witnessed only in full mode, which is what the milestone runs. The exit test depends on no M2/M3 artifact (verified command by command). P6 criterion 5 (deliberate guard break must fail the harness) is a good falsifiability control.
5. Fix-shape edge cases: the canonical classes were hunted per phase. Found: squash-merged ship task can never tear down (PR-001, the state that can never exit); lock TOCTOU and pid-reuse dead states (PR-006); healthy-watcher false-stale from backoff cap vs threshold (PR-009); duplicate-id rollback destroying live task metadata (PR-005). Checked and clean: doctor on an empty-but-healthy fleet correctly passes (absent beacon is WARN, matching exit-test step 2); watcher single-shot exit plus guard warn during long step 7-9 gaps does not change exit codes; spawn rollback ordering otherwise sound; salvage never overrides the unlanded refusal (explicitly tested by P4 criterion 5).
6. Blocked-by and dispatch integrity: DR-0005 blocks all M1 phases and appears in every phase's blocked-by; DR-0007 blocks P2 to P6 and appears in each; A-1 gates P6; D-16 states what happens if the owner decides DR-0005/0007 otherwise (plan revision before dispatch), and DR-0001/0002/0003 divergence is one-line-change scoped. The M1-P1 name field follows open DR-0008's vetoable recommendation, and the section 9 table declares that exception explicitly. One fault: DR-0009 is a hard blocked-by on P3/P4/P5 while its own text says proceed without waiting (PR-007).
7. Phase 1 feasibility: consistent with DR-0002 (engines plus matrix) and DR-0003 (hosted runner); P1 does not assume branch protection exists (DR-0004 items 2 and 3 are correctly sequenced after the P1 merge, and criterion 7 needs only the workflow run, not protection); the new-workflow-runs-on-its-own-PR assumption is sound for pull_request triggers. Faults: matrix vs required-check context (PR-002), missing lockfile and typescript devDependency (PR-003).
8. Conventions: scripted scan of the plan and DR-0005 to DR-0009: zero em dashes, zero en dashes, zero non-ASCII characters; English throughout; npm only (no pnpm/yarn anywhere); acceptance criteria use the falsifiable register (no "works correctly" instances found).

## Honest failures

- GitHub behavior claims (matrix jobs reporting check contexts as "gates (22)" rather than "gates"; npm ci refusing without a lockfile; new workflows running on the PR that introduces them) are asserted from knowledge of the platforms, not demonstrated against live GitHub or npm in this greenfield repo. PR-002 and PR-003 rest on them. If the owner wants, a five-minute scratch-repo probe settles both before the fix round.
- The firstmate source remains absent (same honest failure as the verification report), so the claim that BUILD-from-contract acceptance criteria are achievable at the suggested model tiers could not be checked against any prior implementation.
- No code exists at the baseline, so no citation could be verified against source files; all citation auditing is document-to-document.
- The M3-P4 catch-all ("every M3-bucket row lands in its named brief clause, checklist, template, or policy") was accepted at outline level per the appendix's declared framing; whether all 74 M3 rows genuinely fit the five outlined M3 phases cannot be adjudicated until the M3 plan is written, and this review does not claim to have done so.
