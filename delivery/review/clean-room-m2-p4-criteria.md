# CR review: M2-P4 scope auditor (branch claude/m2-p4-scope-auditor)

Status: STARTED
Workdir: /home/user/tiphys-ai-helmsman/.claude/worktrees/agent-ad458cf2c4361e29d

## Log
- Begin: verifying head sha, reading CLAUDE.md and plan section.
- Head verified: 2118f68a28e941937efaf08ae5b73dc20e4265dd == requested sha. Checked out (detached) in worktree.
- Read plan section M2-P4 (delivery/plan/kernel-plan-m2.md lines 332-360), section 1.4 (gate table, lines 69-100), M2-C-3 (line 64), M2-P1 criterion 5/9 (line 230, 323, 234), risk item 5 (line 570).
- Read delivery/work-history/m2-p4.md in full (587 lines).
- Key finding candidate for item 7: plan line 230 (M2-P1 criterion 5) states generically "A `required` gate whose precondition is unmet is `not-applicable` and the runner exits nonzero naming it". Scope is registered `required` with `branch-matches` precondition (section 1.4 line 78). A paperwork branch (not matching `claude/m[0-9]+-p[0-9]+-*`) makes scope's precondition unmet -> not-applicable -> per line 230 the runner (and hence the whole PR bundle) exits nonzero. Section 4 risk item (line 570) already flags this residual property design-wise but plan does not reconcile the "required" registration with the "paperwork branches need not-applicable to be tolerated" statement. To investigate further against delivered runner code.
- Next: read src/gates/scope.ts, schema, test file, gates.manifest.json entry, phase-declarations, behaviors.json diff, phase-declarations/m2-p4.json vs standalone.

## Scope audit (item 5 of contract) - VERIFIED
- Merge-base(origin/main, HEAD) = 4c9bfbcbd63a1668ab6697fba0460514edb52602, matches work-history claim.
- git diff --name-status 4c9bfbc HEAD == exactly: A delivery/work-history/m2-p4.md, M gates.manifest.json, A src/gates/schemas/phase-declaration.schema.json, A src/gates/scope.ts, M test/behaviors.json, A test/scope-gate.test.ts
- Declaration m2-p4.json filesToTouch: src/gates/scope.ts, src/gates/schemas/phase-declaration.schema.json, test/scope-gate.test.ts, gates.manifest.json, test/behaviors.json. declaredExtras: [].
- EXACT MATCH: diff = declaration filesToTouch + two standing extras (test/behaviors.json already in decl list; delivery/work-history/m2-p4.md is the standing extra). No undeclared files. PASS.

## Read src/gates/scope.ts in full (561 lines). Notes:
- Standalone script, exports main(argv), computed-URL invokedDirectly guard (warning 4 pattern) - matches work-history claim.
- Declaration read via `git show <mergeBaseSha>:<path>` (object DB, never working tree) -- this is the anti-widening mechanism.
- git diff computed as `git diff --name-status <mergeBase> <head>`, NEVER against --base directly. Renames produce two TouchedPath entries (old+new). Deletions: one entry.
- FINDING CANDIDATE (regex typo, not among the 3 declared deviations): plan text (kernel-plan-m2.md line 345) states the pattern literally as `claude/m[0-9]+-p[0-9]+-*` (regex source, meant to be anchored ^(?:...)$  per run.ts branch-matches code at line 469). Tested empirically: `new RegExp("^(?:claude/m[0-9]+-p[0-9]+-*)$").test("claude/m2-p4-scope-auditor")` = FALSE (plan's literal string never matches any real phase branch as a regex, only branches ending in many hyphens). Delivered gates.manifest.json uses `claude/m[0-9]+-p[0-9]+-.*` (dot added) which DOES match (tested TRUE). This is a necessary, correct fix of an evident plan-text regex typo, but it is UNDECLARED as a deviation anywhere in delivery/work-history/m2-p4.md (grepped, not found). Candidate finding: LOW, recommend recording as 4th deviation.

## Independent mutation testing (item 3 of contract)
### Anti-widening (criterion 5), reproduced independently, NOT trusting work-history
Built own scratch repo (m9-p1), independent of implementer's fixtures:
- BASE=452c8f3b..., declares filesToTouch=[src/a.ts]. HEAD widens declaration on head branch to add src/c.ts and touches it.
- Ran REAL src/gates/scope.ts (unmodified): RED naming both the widened-but-undeclared-at-mergebase declaration file itself AND src/c.ts. Recorded declarationSha256 = 64054a29c2ebd00b7c185e8cc67aaf1dec12a77522e4adde65c93862247226dd.
- Independently computed: `git show <mergeBaseSha>:path | sha256sum` = 64054a29c2ebd00b7c185e8cc67aaf1dec12a77522e4adde65c93862247226dd. EXACT MATCH, computed by me, not copied from implementer's evidence.
- Control (HEAD1, no widening, only declared file touched): GREEN, units 1. Confirms both directions.

### Mutation 1 (implementer's own defang, re-run by me): read declaration from head instead of merge base
- Edited src/gates/scope.ts line 439 in place (`loadDeclarationAtMergeBase(cwd, head, ...)`), reran against my OWN scratch scenario (not the implementer's fixture): result flipped correctly to reflect the dangerous state -- src/c.ts NO LONGER flagged (silently permitted by the widened head declaration), sha256 became 6e2ad635568478fc224771d47be42632028d0a7853ac6b3ee663b940f08958b6 (the HEAD blob's hash, not the merge-base blob's). Confirms the mechanism is real, not just the implementer's own narrated narrative. Reverted; `git diff --stat src/gates/scope.ts` empty after revert.

### Mutation 2 (NOT run by implementer): break rename-counts-both-paths
- Built a SEPARATE scratch scenario (m9-p2) the implementer's own suite does not exercise: renaming an UNDECLARED source path (src/other.ts) into a DECLARED destination name (src/a.ts), i.e. the old-path side of a rename carries the violation, not the new-path side.
- Baseline (real, unmodified scope.ts): RED naming src/other.ts correctly (both diff sides audited independently: `git diff --name-status` shows `R100 src/other.ts src/a.ts`; TouchedPath entries for BOTH names are pushed by computeTouchedPaths, confirmed by reading lines 240-251).
- This is a witness for a DIFFERENT structural member of the "rename/deletion counted on one side only" hazard class than the implementer's own tests (their tests cover declared-to-undeclared and declared-to-declared renames; mine covers undeclared-to-declared, the direction where a naive "only check the new path" implementation would silently pass). Confirms the class is closed on a second, independently-constructed member, not just the one the implementer built.
- APPLIED THE DEFANG MYSELF: edited computeTouchedPaths (lines 249-250) to push only newPath, not oldPath. Reran against my scratch-rename scenario: flipped to GREEN, units 1 (src/other.ts, the undeclared old path, silently dropped). Reverted (git diff --stat src/gates/scope.ts empty after); reran `node --test test/scope-gate.test.ts`: 12/12 still green after revert. RED-WITNESS DEMONSTRATED against the DANGEROUS state for a hazard-class member the implementer's own suite does not cover.

## ITEM 7 (orchestrator question): reproduced LIVE with the real manifest and real runner
- `.github/workflows/gates.yml` read directly: neither the pull_request step nor the push step passes `--phase` at all today. Confirms work-history's claim verbatim.
- `src/gates/run.ts` requiredParameters(): branch-matches unconditionally requires --phase (line 373-375), confirmed by reading.
- `src/gates/run.ts` decideAggregate() (lines 929-958): precedence is error > red > vacuity(counts.verdict==0) > requiredNotApplicable (EXIT_NOT_APPLICABLE=20). A required gate's not-applicable ONLY fails the bundle if nothing worse happened AND at least one other gate reached a real verdict (else the vacuity rule fires instead, exit 21).
- LIVE REPRODUCTION (real gates.manifest.json, real bin/tiphys.ts, this checkout in detached HEAD so branch name = "HEAD", simulating a non-matching/paperwork branch):
  `node bin/tiphys.ts gates run --manifest gates.manifest.json --evidence /tmp/self-audit-evidence2 --base 4c9bfbcbd63... --head HEAD --phase m2-p4`
  Output: `gates: declared 2 applicable 1 verdict 1 green 1 red 0 not-applicable 1 error 0 vacuous 0` / `gates: required gate(s) not applicable: scope` / EXIT CODE 20.
  This is a REAL, mechanically captured reproduction (not inferred from text) of exactly the scenario item 7 describes: once --phase is wired into CI (the separate, already-known gap) and scope is required with branch-matches, every non-phase-branch (paperwork) PR bundle will exit nonzero (20) purely because scope is structurally inapplicable to it, even though every other required gate is green.
- Also confirmed independently (M2-P1's own delivered test, re-run by me): "a required gate with an unmet precondition is not-applicable and fails the run, conditional does not" (test/gates.test.ts:398) passes, generically proving the required-vs-conditional distinction as designed.
- Precedent already in the SAME plan: `deploy` and `migrations` are classified `conditional` specifically BECAUSE their not-applicable outcome is STRUCTURAL (100% of pre-merge bundles, section 1.4 note). `scope`'s not-applicable outcome on a paperwork branch is equally structural (paperwork branches are a permanent, plan-acknowledged category per CLAUDE.md's delivery protocol and per this plan's own risk item 5), yet `scope` is classified `required`. This is an internal inconsistency in the PLAN's own classification rule, not a bug in the runner (which behaves exactly as M2-P1 criterion 5 specifies) or in this phase's registration (which matches section 1.4's table verbatim, "required").
- RECOMMENDATION for the orchestrator/arbitration: reclassify `scope`'s applicability to `conditional` in gates.manifest.json and correct section 1.4's table plus M2-P4 step 6 text to match, mirroring the deploy/migrations precedent already in the same document. This changes nothing about phase-branch auditing: a genuine RED (undeclared touch) on a phase branch still fails the bundle regardless of applicability, because counts.red>0 outranks the not-applicable branch in decideAggregate's precedence (verified by reading the function). The only behavior change is that a structurally-inapplicable paperwork branch no longer forces a nonzero exit. This is a plan/runner reconciliation question, not a phase-M2-P4-implementation defect; M2-P4's own code and registration are internally consistent with the plan as written.
- Separately (not this item, but adjacent and worth carrying forward): even before reaching the applicability question, --phase is not wired into gates.yml at all today, so `scope` currently reports `error` (not not-applicable) on literally every PR/push once merged, which is the already-documented, already out-of-this-phase's-scope CI-wiring gap (matches work-history and the pre-registered known cross-phase failure test/gates.test.ts:1289).

## COORDINATOR UPDATE received mid-review
- Hazard contract already returned FIX-ROUND-NEEDED with HIGH CR-1045: the auditor forwards --phase/--base/--head unvalidated and never reads declaration.branch/id, so the audited party picks the yardstick. Schema-count cross-phase failure (test/gates.test.ts:2378) has since been fixed on main; P4 branch will absorb at fix time, so that failure is NOT counted as a live blocker in my own verdict (still real on THIS head as reviewed, per contract, but resolved upstream).
- INDEPENDENTLY CORROBORATED CR-1045 before reading the coordinator note (grepped scope.ts: zero references to `declaration.branch` or `declaration.id` anywhere in the file). Built a decisive live reproduction, distinct from the anti-widening property (criterion 5 only tests editing the SAME phase's declaration; this is swapping to a DIFFERENT, unmodified, validly merge-base-committed declaration):
  - scratch repo, TWO valid declarations at the merge base: m9-p3.json (filesToTouch=[src/restricted-only.ts]) and m9-p4.json (filesToTouch=[src/restricted-only.ts, src/anything.ts]).
  - ONE real branch/diff (claude/m9-p3-restricted), touching BOTH files.
  - `--phase m9-p3` (the branch's own correct declaration): RED naming src/anything.ts. Correct.
  - IDENTICAL base/head, only `--phase m9-p4` changed: GREEN, same diff, same branch, same merge base. The SAME undeclared touch that was RED a moment ago is now silently permitted because the caller named a different, more permissive, already-committed declaration file.
  - Root cause confirmed by reading: (1) scope.ts never checks declaration.branch against the actual current branch; (2) scope.ts never checks declaration.id against the supplied --phase; (3) the runner's own branch-matches precondition pattern (`claude/m[0-9]+-p[0-9]+-.*`) does not use the `{phase}` token substitution the runner supports (verified in src/gates/run.ts line 466: `pattern.split("{phase}").join(...)`), so the precondition only proves "this is SOME phase-shaped branch", never "this is the phase branch --phase claims to be". Both layers (gate and runner) leave the binding between actual branch and audited declaration entirely on the caller's honesty.
  - This makes CI-wiring (or any local invocation) the sole guarantor that --phase is ever the RIGHT phase for the branch actually checked out, which is exactly the property the anti-widening mechanism was built to NOT have to rely on caller honesty for. SEVERITY: HIGH, matches CR-1045, independently reproduced, not merely trusted from the hazard contract.

## FINAL VERDICT: FIX-ROUND-NEEDED (aligned with, and independently corroborating, the hazard contract's CR-1045)

STATUS: COMPLETE. Final message delivered to caller with full findings table, criteria walk, mutation table, deviation judgments, item-7 analysis. Tree left clean at reviewed sha 2118f68a28e941937efaf08ae5b73dc20e4265dd, git status --porcelain empty.




