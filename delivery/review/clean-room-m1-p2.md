# Clean-room review: M1-P2 (fleet-home init and doctor CLI)

- Date: 2026-08-04
- PR: #2 (ThomasHendrickx/tiphys-ai-helmsman), branch claude/m1-p2-fleet-init-doctor into main
- Head SHA reviewed: ec91c3e7aaec7b3eeb4ef79eaa1d2282b7479758 (base ab9bc24889baff24e42b2b5fe929f0c530580b28)
- Reviewer stance: clean room. The implementation session was not seen. The diff was reviewed against the plan's M1-P2 acceptance criteria as a contract (delivery/plan/kernel-plan-v1.md revision 7, section 3 preamble and the full M1-P2 section), plus DR-0002, DR-0006, DR-0007, and the declared deviations in the PR body and work history.
- Method: read-only review of the diff (git diff origin/main...origin/claude/m1-p2-fleet-init-doctor) plus execution in a detached scratch worktree at the head SHA. Local environment: Node v22.22.2 (below the DR-0002 floor of 26, expected), git 2.43, gh not installed. Executed: npm ci, npm test, a behaviors.json name-resolution script, every acceptance criterion as direct commands with captured exit codes, four mutation tests, structural greps, and non-ASCII scans. The two floor-gated exit-0 assertions were additionally verified against the PR's actual CI run (job "test (26)" on Node v26.6.0, run 30901598658): 20 tests, 20 pass, 0 skipped, both floor-gated tests listed individually as passing. CI witness is therefore observed, not merely deferred.

Verdict: APPROVE. Four findings, all low severity, none blocking. All nine acceptance criteria are met (seven witnessed locally with exit codes, the two exit-0 halves witnessed in the PR's Node 26 CI log). All four mutations were caught by exactly the named tests. All three declared deviations are judged necessary, with one minor declaration undercount (CR-104).

## 1. Acceptance criteria as contract

Criterion numbering follows the plan's M1-P2 section. "Executed" means run by this reviewer in the scratch worktree at ec91c3e.

1. "tiphys init <empty tmp dir> exits 0 and creates charter/, decisions/, state/, tasks/, worktrees/, projects/, backlog.md, package.json, .gitignore, and a .git directory with at least one commit." MET. Executed: init exit 0, all nine entries present, git rev-list --count HEAD = 1. Implementation: src/commands/init.ts.
2. "A second tiphys init on the same directory exits nonzero and stderr contains 'already initialized'." MET. Executed: exit 1, stderr "tiphys init: <dir> is already initialized".
3. "git check-ignore state/anything, worktrees/anything, projects/anything all exit 0; decisions/anything and charter/anything both exit 1." MET. Executed: exactly those exit codes. FLEET_IGNORED in src/fleet.ts is exactly ["state/", "worktrees/", "projects/"], matching the plan's "ignoring exactly" wording (SC-002, D-4, PR-004).
4. "tiphys doctor in a healthy fleet home exits 0 and stdout contains one 'CHECK <name>' line per check listed in step 3, none of them FAIL." MET (exit-0 half witnessed in CI). Executed locally: exactly eight CHECK lines (node, git, gh, layout, remote, lock, beacon, identity), covering step 3's seven checks plus the mandated identity addition; locally CHECK node FAIL v22.22.2 and exit 1, which is the correct below-floor verdict. Proxy: with the scratch worktree's engines floor temporarily lowered to ">=22", the same fleet produced CHECK node PASS and exit 0. CI: the test "doctor in a healthy fleet exits 0" ran and passed on Node 26.6.0 (job log inspected).
5. "After deleting decisions/, tiphys doctor exits nonzero and stdout contains 'CHECK layout FAIL' naming decisions." MET. Executed: exit 1, line "CHECK layout FAIL missing decisions/".
6. "tiphys doctor in a directory that is not a fleet home exits nonzero." MET. Executed: exit 1 in a bare temp directory.
7. Empty HOME plus GIT_CONFIG_GLOBAL/GIT_CONFIG_SYSTEM at nonexistent paths: "init exits 0, the bootstrap commit exists with the documented deterministic machine identity as both author and committer, and no global git config file was created or modified." MET. Executed with HOME set to an empty temp dir and ambient GIT_AUTHOR_*/GIT_COMMITTER_* unset: init exit 0; git log -1 shows "Tiphys Fleet|fleet@tiphys.invalid|Tiphys Fleet|fleet@tiphys.invalid"; the GIT_CONFIG_GLOBAL path was not created and HOME stayed empty. The identity is set as command-scoped env vars on the commit invocation only (src/commands/init.ts, the commit step's env block), per EXT-F-02 Option B.
8. gh promotion in both directions: MET (generic exit-0 half witnessed in CI). Executed on this gh-free machine: generic doctor prints "CHECK gh WARN gh not found on PATH, PR modes unavailable"; doctor --for full exits 1 with "CHECK gh FAIL ... (required for profile full)" and "CHECK remote FAIL ... (required for profile full)". CI: "doctor with gh absent exits 0 under the generic profile" ran and passed on Node 26 (the test builds a deterministic gh-free PATH from a temp bin dir with a git symlink, so it does not depend on the runner's ambient gh).
9. Test accounting: MET. npm test at head: 20 tests, 18 pass, 2 skipped with the recorded reason "local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)", 0 fail, zero unaccounted. A name-resolution script confirmed all 20 test/behaviors.json mappings (including both P1 entries, version-output and unknown-subcommand-exit) resolve to test titles present in the run; nothing previously registered was removed.

Floor-gating honesty (the skeptical check the two floor-gated criteria require): the skip predicate in test/doctor.test.ts is purely `nodeMajor >= 26` computed from process.version; the skip value is `false` on Node 26, and .github/workflows/gates.yml runs the matrix on exactly Node 26 with npm test. The CI job log for this PR's head shows both tests executed and passing with "skipped 0". The skip is not a false witness.

## 2. Test honesty (mutation results)

Each mutation applied in the scratch worktree, suite run, then reverted (worktree clean afterward):

1. Layout check neutered (missingLayoutEntries forced to return empty): "doctor after deleting decisions reports CHECK layout FAIL naming the missing entry" and "doctor outside a fleet home exits nonzero" both went red (18 pass, 2 fail).
2. Promotion rule flipped (promote only conditions NOT in the profile list): all three promotion tests went red ("doctor --for full promotes gh-missing to FAIL", "doctor --for full promotes remote-missing to FAIL", "doctor --for watch promotes beacon-absent to FAIL"), plus the two generic-profile tests that assert no unexpected FAIL (13 pass, 5 fail).
3. Identity env scoping removed from the bootstrap commit step: "init bootstrap commit uses the machine identity without global git config" went red (17 pass, 1 fail).
4. decisions/ added to FLEET_IGNORED: "init gitignore tracks durable areas and ignores ephemera" went red (17 pass, 1 fail).

Every mutation was caught by exactly the test(s) whose registered behavior it broke. The deliberate-failure witness claimed in the work history (renaming a registered test breaks the registry check by name) is consistent with the resolution script's behavior.

## 3. Declared deviations, judged one by one

1. test/behaviors.json edited though absent from files-to-touch: NECESSARY, omission is clerical. The plan's section 3 test accounting rule states test/behaviors.json is "created by M1-P1 and appended by every phase", P1 step 6 states "every later phase appends its own mappings", and P2 criterion 9 requires the new mappings to be present. Three separate plan clauses mandate the edit; the files-to-touch list simply forgot it. This is not scope creep. The plan should add test/behaviors.json to every remaining M1 phase's files-to-touch list at the next revision (the P3 through P6 lists have the same clerical gap).
2. .gitkeep files in charter/, decisions/, tasks/ inside created fleet homes: NECESSARY. git cannot track an empty directory; without a tracked entry the durable directories would vanish on any clone of the fleet repo, defeating exactly the durability SC-002/D-4 establish. Verified: git ls-files in a created fleet shows charter/.gitkeep, decisions/.gitkeep, tasks/.gitkeep tracked, and only those plus backlog.md, package.json, .gitignore. The ignored ephemera correctly get no keep file.
3. Extra registered tests beyond criteria-named behaviors: LEGITIMATE. The accounting rule sets a floor ("at least one identified test per named behavior"), not a ceiling; all extras are registered and none displaces a prior mapping. One accounting nit: the declaration says four extras but a fifth exists (CR-104).

## 4. Scope audit

Changed files (git diff --name-only, 8 files): src/fleet.ts, src/commands/init.ts, src/commands/doctor.ts, test/init.test.ts, test/doctor.test.ts (the five files-to-create), src/cli.ts (the listed edit, dispatch registration only), test/behaviors.json (declared deviation 1), delivery/work-history/m1-p2.md (permitted work history). Nothing else: no workflow change, no package.json or lockfile change, no CLAUDE.md change, no tsconfig change. No scope findings.

## 5. Blast radius

- P3 lock path: src/fleet.ts LOCK_FILE = state/orchestrator.lock, byte-identical to the path fixed in the plan's M1-P3 step 1. Doctor's lock check requires only holderId and expiresAt and tolerates P3's full lease shape ({holderId, hostname, acquiredAt, expiresAt}); forward compatible.
- P5 beacon path: BEACON_FILE = state/watcher.beacon, matching M1-P5 step 1 and convention FM-043. The beacon WARN detail is the exact PR-206 wording ("watcher not running or not scheduled"), and the freshness threshold is explicitly deferred to the P5 liveness guard in both the code comment and the PASS detail.
- Durability split: init's .gitignore is exactly state/, worktrees/, projects/; decisions/ and charter/ are tracked (and actually clone-durable via .gitkeep). Matches SC-002/D-4 exactly. Observed consequence, plan-consistent: a fresh clone of a fleet repo lacks the three ignored directories and doctor reports layout FAIL there; how doctor reports a post-reclaim fleet is the named M4 residue in section 3's obligation split, so P2 correctly does not paper over it.
- EXT-F-02 Option B coexistence: the identity check WARNs (condition identity-unset) and no M1 profile promotes it (PROFILES in src/commands/doctor.ts contains no identity-unset), so a fleet needing no user git identity never FAILs identity on a clean machine; witnessed on the CI runner, where user.name is unset and the healthy-fleet doctor still exited 0. The WARN detail names the machine identity and states it is not required, per the plan's wording.
- C-1: no P2 doctor check reads task currency at all; no event or status log is read anywhere in the diff; the module docs in doctor.ts and fleet.ts record the meta.json-plus-turn-end rule for future checks. No violation and no pre-commitment against it.
- C-2: doctor's lock and beacon checks are file reads only. Structural grep over src/fleet.ts, src/commands/init.ts, src/commands/doctor.ts for process.kill, /proc, signal, and pid: no matches.

## 6. Substrate neutrality (DR-0007)

init and doctor are pure filesystem and git child processes. No process probing, no resident anything, no daemonizing, no behavior conditioned on machine persistence. The only environment-sensitive inputs are process.version (the mandated node check), PATH tool lookups (the mandated git/gh checks), and cwd files. The tool checks spawn git --version and gh --version as subprocesses with exit codes, which is availability checking, not process probing. Identical behavior on a persistent machine and a throwaway session beyond what the checks legitimately report.

## 7. Conventions

- No em dashes, no non-ASCII: LC_ALL=C non-ASCII grep over all eight changed files is clean. English only throughout. npm only (no pnpm/yarn references).
- Exit-code contract consistent with P1: usage errors exit 64 via the shared EX_USAGE (init with missing/extra args, doctor with an unknown flag or unknown profile, all executed and confirmed 64); operational failures exit 1; doctor exits 0 only with no FAIL.
- Plain JSON state per D-3/DR-0006: behaviors.json entries are plain JSON; no schema library was introduced.

## 8. Findings

- CR-101 (low, correctness edge): doctor's lock check PASSes a lease whose expiresAt is present but not a parseable timestamp. Executed: a lease {"holderId":"h1","expiresAt":"banana"} yields "CHECK lock PASS lease held by h1, expires banana". Step 3's "FAIL if corrupt" arguably covers an uninterpretable expiry, and the "(expired)" annotation silently cannot trigger. Fix: in src/commands/doctor.ts checkLock, FAIL when Date.parse(lease.expiresAt) is NaN. Non-blocking: M1-P3 is the only writer of this file and writes valid timestamps.
- CR-102 (low, latent): checkNode's range parser /^>=\s*(\d+)/ silently truncates a future floor like ">=26.1.0" to major 26, so Node 26.0.0 would PASS incorrectly; this contradicts the work history's own claim that parsing "FAILs on anything it cannot interpret". Fix: anchor the regex to the exact ">=<major>" form (reject trailing content) or compare the full version, and FAIL otherwise. Non-blocking: the kernel's actual engines value is ">=26", which is handled correctly.
- CR-103 (low, robustness): tiphys init pointed at an existing regular file crashes with an unhandled ENOTDIR stack trace (exit 1, correct direction, ugly surface). Relatedly, a git-step failure mid-init leaves a partial fleet directory that init thereafter reports as "already initialized" and cannot repair. Fix: stat the target and refuse non-directories with a one-line message; optionally have the failure message note the partial state. Non-blocking: exit codes are nonzero in all these paths.
- CR-104 (low, declaration accuracy): the work history (deviation 3) and PR body declare four extra registered tests, but five exist beyond the criteria-named behaviors: the declared four plus "init without a directory argument exits 64" (init-usage-error). The test is registered and harmless (it extends P1's usage contract to init), so the accounting rule is satisfied; only the deviation declaration undercounts. Fix: one-line work-history amendment listing it.

No high or medium findings.

## 9. Honesty section (what this review could not witness locally)

- The exit-0 forms of criteria 4 and 8 cannot pass on this machine (Node 22 makes doctor's node check FAIL, correctly). They were verified three ways: the skip predicate is version-only and false on Node 26; the PR's actual CI job log on Node 26.6.0 shows both tests executed and passing with 0 skips; and a local proxy with the scratch worktree's engines floor lowered to ">=22" produced the full exit-0, no-FAIL doctor run. This is as close to witnessed as the environment allows; the CI log is the formal witness.
- The gh PASS branch (gh present on PATH) was never asserted anywhere: locally gh is absent, and no test pins "CHECK gh PASS" on a gh-bearing runner. The CI healthy-fleet run implies it (ubuntu-latest ships gh and no gh FAIL appeared), but no explicit assertion exists. Not a criterion, so recorded here rather than as a finding.
- The work history's narrative claims (per-step commits, deliberate-failure witness execution) were checked for consistency with the branch's commit list and the registry script's observable behavior, but the implementation session itself was not observed; that is the point of a clean-room review.
