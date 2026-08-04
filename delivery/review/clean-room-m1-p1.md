# Clean-room review: M1-P1 (npm scaffold, test runner, CI gates)

- Date: 2026-08-04
- PR: #1 (ThomasHendrickx/tiphys-ai-helmsman, claude/m1-p1-scaffold-and-ci into main)
- Head SHA reviewed: d31bac823ba7bcd276b0f215a25fb559fc9736aa
- Base SHA: 82cd715f5ee8761d6b1094de25139e4f8aec571e (plan revision 7)
- Reviewer: clean-room (no visibility into the implementation session, by design)
- Method: diff review of origin/main...origin/claude/m1-p1-scaffold-and-ci against the plan's M1-P1 acceptance criteria as contract, plus independent execution of the criteria in a detached scratch worktree of the head SHA (Node v22.22.2, npm 10.9.7; Node 22.18+ runs TypeScript natively, so all local gates executed; EBADENGINE warnings expected against the ">=26" floor and not a finding; CI on Node 26 is the runtime authority and its result was read from the GitHub check-runs API). Mandated reading completed first: plan header and binding rule, section 3 preamble (C-1 to C-3, test accounting rule, invocation form), full M1-P1 section, section 8 D-17 and D-18, DR-0001, DR-0002, DR-0003, DR-0004, DR-0005, DR-0008.

## Verdict

APPROVE.

All 12 acceptance criteria are met, 11 of them re-executed or re-inspected independently in this review with exit codes captured, and criterion 7 witnessed directly through the GitHub check-runs API (a check named exactly "gates" completed with conclusion success on the head SHA). All three declared deviations were re-verified as necessary, not convenient. Two low-severity findings, neither blocking merge.

Findings: 0 high, 0 medium, 2 low (CR-001, CR-002).

## 1. Criteria as contract

Criterion quotes are abbreviated to their operative clause; the full text is plan section M1-P1.

### Criterion 1: npm ci, npm run build exit 0; npm test exits 0 without prior build, 0 failing, zero unaccounted

MET (executed). In a clean scratch worktree of d31bac8: npm ci exit 0; npm test with dist/ confirmed absent exit 0, node --test reporting tests 2, pass 2, fail 0, cancelled 0, skipped 0 (zero unaccounted); npm run build exit 0. The advisory N >= 2 count holds (2 tests).

### Criterion 2: after npm run build, dist/bin/tiphys.js exists and git status --porcelain is empty

MET (executed). dist/bin/tiphys.js, dist/src/cli.js, dist/src/version.js emitted; git status --porcelain empty after build (dist/ and *.tsbuildinfo ignored; see deviation 3 and finding CR-001). dist/ is not committed anywhere in the diff (D-17).

### Criterion 3: node bin/tiphys.ts version and node dist/bin/tiphys.js version both exit 0 with byte-identical output equal to package.json version

MET (executed). Both exit 0; outputs compared with cmp: byte-identical, "0.0.0" plus newline, matching package.json version 0.0.0.

### Criterion 4: node bin/tiphys.ts no-such-command exits 64 with a usage line on stderr

MET (executed). Exit 64, stderr "usage: tiphys <version>", stdout empty. A bare invocation with no subcommand also exits 64 with usage; the plan specifies only "any unknown subcommand", and treating a missing subcommand identically is the smallest consistent reading (work history key decision 6); accepted.

### Criterion 5: package.json engines ">=26", license "Apache-2.0", files including dist, prepack running the build; LICENSE contains the Apache-2.0 text

MET (inspected and executed). package.json (diff, lines as delivered): "engines": {"node": ">=26"} (DR-0002), "license": "Apache-2.0" (DR-0001), "files": ["dist"], "prepack": "npm run build". LICENSE is 202 lines, pure ASCII, and byte-identical (diff -q) to the canonical https://www.apache.org/licenses/LICENSE-2.0.txt. "private": true is present, matching the plan step 2's "private for now"; it does not impede npm pack (verified under criterion 11) and is the correct guard against accidental publish before DR-0008 is decided.

### Criterion 6: gates.yml matrix job test with exactly one Node version 26, non-matrixed job named exactly gates needing test and failing when any leg fails, per-ref concurrency with cancel-in-progress true, triggers pull_request and push to the default branch

MET (inspected, .github/workflows/gates.yml). strategy.matrix.node is exactly [26]; runs-on ubuntu-latest (DR-0003); steps npm ci, npm run build, npm test in gate order. Job gates is non-matrixed, has needs: test, if: always(), and a single step that exits 1 unless needs.test.result == "success". Concurrency group gates-${{ github.ref }} with cancel-in-progress: true. Triggers: pull_request (unrestricted) and push to main.

Silent-green analysis (the needs + if: always() trap, examined skeptically):

- Without if: always(), a failed test leg would leave gates skipped, and a skipped check can satisfy branch protection. The always() is present, so gates runs regardless of the test job's outcome.
- The step then gates on the literal string comparison needs.test.result != "success": a failed leg gives "failure", a cancelled run gives "cancelled", a skipped test job would give "skipped"; every non-success value exits 1. There is no path to a green "gates" check without the matrix leg succeeding.
- needs.<id>.result for a matrix job is the aggregate over legs (any failed leg makes the aggregate failure), so the fan-in stays correct if the matrix ever grows.
- Check-name contract: the job has no name: override, so its check run is named by job id. Confirmed live via the check-runs API on the head SHA: exactly two check runs exist, "gates" (success) and "test (26)" (success). The "(26)" suffix on the matrix leg confirms that a matrixed job named gates would have reported "gates (26)" and never satisfied DR-0004's required context "gates"; the non-matrixed fan-in is what makes the context stable, exactly as PR-002 intended.
- The workflow-level name: gates does not leak into check-run names; no ambiguity.
- Cancellation via the concurrency group cancels the whole run; a cancelled "gates" is not green, and the superseding run reports fresh on the new SHA. With the ruleset's strict_required_status_checks_policy true (DR-0004), the check must pass on the latest commit. No silent-green path found.

### Criterion 7: the phase PR shows the gates check completed successfully

MET (witnessed, CI's evidence read directly). GET /commits/d31bac8.../check-runs on the head SHA returns "gates" status completed, conclusion success (and "test (26)" completed success). This is the live PR run, not a local simulation.

### Criterion 8: bin/, schemas/, roles/, tuition/ each contain at least one tracked file

MET (executed). git ls-files counts: bin 1 (tiphys.ts), schemas 1, roles 1, tuition 1 (one-line READMEs each stating which milestone fills them, per step 7).

### Criterion 9: both tsconfigs set erasableSyntaxOnly, rewriteRelativeImportExtensions, verbatimModuleSyntax true; test config sets noEmit true and references the src config

MET (inspected). tsconfig.src.json: composite true, outDir dist, module and moduleResolution nodenext, target es2024, strict true, and all three mandated flags true. tsconfig.test.json: noEmit true, references [{"path": "./tsconfig.src.json"}], same three flags true, strict true. Both add "types": ["node"] (declared deviation 2, assessed below). The build script is tsc -b over both configs, per step 2 and PR-101. Relative imports in bin/tiphys.ts and src/cli.ts use .ts extensions (D-18).

### Criterion 10: a deliberate type error in test/ fails npm run build; likewise in src/; captured in work history and reverted

MET (executed independently, and recorded in the work history as required). Reproduced in the scratch worktree: appending a type-broken const to test/cli.test.ts made npm run build exit 1; same in src/version.ts made it exit 2; clean rebuild after reverts exit 0 with empty porcelain. The work history records the same demonstrations with the TS2322 error lines. The test/ type-check boundary (PR-101) has a real witness: the noEmit test project is genuinely type-checked by tsc -b.

### Criterion 11: npm pack tarball installs into a temporary prefix, and the installed tiphys version prints exactly the package.json version

MET (executed). npm pack exit 0 (prepack ran the build); tarball contents: package/package.json, package/LICENSE, package/dist/** (plus dist/tsconfig.src.tsbuildinfo, finding CR-001). npm install of the tarball into a temp prefix exit 0; <prefix>/node_modules/.bin/tiphys is a symlink to ../@tiphys/kernel/dist/bin/tiphys.js which carries the execute bit (rwxr-xr-x, derived from the shebang); running it printed 0.0.0 and exited 0. Shebang, execute bit, files allowlist, and bin wiring all witnessed, and the version walk-up resolved the correct package.json from under node_modules (see blast radius).

### Criterion 12: test/behaviors.json exists, is valid JSON, and maps each named behavior to a test name present in the node --test run

MET (executed). Valid JSON; two mappings, version-output and unknown-subcommand-exit, each matching a test title verbatim in test/cli.test.ts and present in the run (tests 2). These are exactly the two behaviors step 6 names. See finding CR-002 on enforcement.

## 2. Test honesty

Mutation checks executed in the scratch worktree:

- Exit-code flip: changing return EX_USAGE to return 65 in src/cli.ts made npm test fail (1 of 2 tests failing, the unknown-subcommand test). The exit-64 contract is genuinely asserted, not decorative.
- Version flip: replacing the version output path made npm test fail. The version test reads package.json itself and compares stdout byte-for-byte including the trailing newline, so it tracks the real version field rather than a hard-coded string; it cannot rot when the version bumps.
- The unknown-subcommand test also asserts stdout is empty and stderr matches /^usage: tiphys /, so usage leaking to stdout would be caught.
- behaviors.json maps to real, verbatim test titles. A renamed test would break the mapping but nothing executable in this PR would notice (node --test stays green); see CR-002. Per the plan this is acceptable: full discovery parity is explicitly the M2 wrapper's job (R-048), and criterion 12 requires only existence and accuracy, which hold.

## 3. Deviations, one by one

The implementer declared three deviations in the PR body and work history. Each was re-verified for necessity in the scratch worktree.

### Deviation 1: @types/node 26.1.2 as exact-pinned devDependency

ACCEPTED (necessity verified). The plan's step 2 enumerates only typescript as a devDependency, but the mandated strict NodeNext build references process, node:fs, node:path, node:url, node:child_process, node:test, node:assert throughout the mandated files; without Node type definitions tsc fails with TS2591 on the first process reference (reproduced, see deviation 2). This is a gap in the plan's letter, not implementer convenience. The exact pin matches PR-003's pinning discipline for typescript; the 26.x line matches the decided Node 26 floor (DR-0002); the lockfile carries it plus its single transitive (undici-types). No conflict found: it is a devDependency, absent from the publish tarball, and cannot leak to consumers. No missed ripple identified.

### Deviation 2: "types": ["node"] in both tsconfigs

ACCEPTED (necessity verified empirically by this review). Removing the entry from both configs and rebuilding at the pinned typescript 7.0.2 fails with TS2591 "Cannot find name 'process'" whose own message text prescribes exactly this fix ("add 'node' to the types field in your tsconfig"). So deviation 1 is ineffective without deviation 2 under the pinned compiler. It belongs in both configs: bin/ and src/ use process and node:fs, test/ uses node:test, node:assert, node:child_process; either config without it fails. Criterion 9's inspected flag list is intact; this is an addition, not a modification. Ripple to note (not a finding, already recorded as the implementer's environment warning 3): "types": ["node"] disables @types auto-inclusion, so any future phase adding another @types package must extend the array in the config that needs it; future implementers inherit this through the work history.

### Deviation 3: *.tsbuildinfo in .gitignore

ACCEPTED (necessity verified). tsc -b writes tsconfig.test.tsbuildinfo at the repo root (the noEmit test project has no outDir, so the buildinfo lands beside the tsconfig); reproduced: after a build the file exists and only the ignore entry keeps criterion 2's porcelain empty. The ignore hides nothing the plan's criteria rely on: it is incremental-build metadata, squarely the class of generated artifact D-17 wants out of the repo, and the drift surface D-17 reasons about (committed generated output) is not created by ignoring it. The coverage/ entry is within the plan's own "coverage output" phrasing, not really a deviation. One ripple the implementer caught but did not fix: the src project's buildinfo lands inside dist/ and therefore ships in the tarball; escalated as finding CR-001.

## 4. Scope audit

The diff touches exactly 17 files: the 16 files on the plan's files-to-touch list (package.json, package-lock.json, tsconfig.src.json, tsconfig.test.json, LICENSE, bin/tiphys.ts, src/cli.ts, src/version.ts, test/cli.test.ts, test/behaviors.json, schemas/README.md, roles/README.md, tuition/README.md, .github/workflows/gates.yml, .gitignore, CLAUDE.md) plus delivery/work-history/m1-p1.md, the single permitted delivery/ write. Nothing else changed; no deletions; no edits to existing delivery/ documents. The lockfile's content is exactly the two pinned devDependencies, typescript's platform-specific optional native packages, and undici-types; nothing unexplained. Scope is clean.

The work history itself is in scope and reads as an honest record: greenfield verification (step 1) recorded as required; per-step commits listed and matching the branch's actual 8 commits; gate evidence with exit codes; deviations declared rather than smuggled; environment warnings recorded for future phases, including two (default branch not yet main; tsbuildinfo in tarball) that are genuinely useful downstream.

## 5. Blast radius

- "gates" name contract (DR-0004): the delivered check-run name is exactly "gates" (confirmed live via API), matching the ruleset context in DR-0004's proposed owner action 2 verbatim; no substitution note is needed when the owner runs it. The fan-in keeps the context stable if the matrix ever changes. Until the owner executes DR-0004 items 1 to 3 (scheduled right after this PR merges), nothing requires "gates" and main is unguarded; that is a known, owner-scheduled gap, not a finding of this PR. The work history correctly flags that the repository's default branch currently points at the orchestration branch; DR-0004 item 1 fixes that, and the workflow's pull_request trigger covers PR checks regardless, with push: main correct for the intended default.
- M3 publishing inheritance: files ["dist"] plus prepack means every publish is a fresh build shipping compiled output, LICENSE, and package.json only, which is the right skeleton for M3; the one blemish is the tsbuildinfo in dist (CR-001). "private": true is set (plan: "private for now") and blocks accidental npm publish while DR-0008 is open; npm pack still works, so criterion 11's witnessing is unimpeded (verified). M3's release phase must flip private and finalize the name per DR-0008; both are one-line changes, as the plan intends.
- CLI usage contract: EX_USAGE = 64 is a named exported constant with a single dispatch table (Map) in src/cli.ts; later phases register subcommands in one place and inherit the exit-64 unknown-subcommand behavior and the auto-generated usage line (sorted command names). Missing subcommand equals unknown subcommand (exit 64), a contract later phases inherit; consistent and documented.
- Version walk-up: src/version.ts walks up from the running module's directory to the first package.json. Verified in all three depths that matter: src/ under type stripping, dist/src/ compiled, and node_modules/@tiphys/kernel/dist/src/ when installed as a dependency (criterion 11's prefix install printed 0.0.0, i.e. it found the kernel's own package.json, and it cannot escape the package root under node_modules because the package root is hit first). dist/ contains no package.json, so the compiled walk cannot short-circuit wrongly.
- CLAUDE.md: faithfully reproduces the six binding conventions of plan section 1.4 and the three-gate list (npm ci, npm run build, node --test), names itself the agent-rules single source until the M3 gate registry, and cites D-17/D-18 for the dist and type-stripping mechanics. It binds future implementers to exactly what the plan says; no invented rules, no omissions.

## 6. Constraints and conventions

- C-1 (single current-state authority), C-2 (no pid identity), C-3 (no auto-backgrounding): nothing in P1 touches state files, locks, logs, or watchers; grep over the delivered sources shows no process probing, no pid usage, no log-tail pattern, no state file. Nothing pre-commits a violation; the dispatch-table design leaves later phases free to comply.
- No em dashes and no non-ASCII in any authored file: verified by byte scan over all 16 authored files plus the work history; clean. LICENSE is canonical text and exempt (and is pure ASCII anyway).
- English only: yes. npm only: yes (package-lock.json v3, no other package-manager artifacts, CLAUDE.md restates the rule).
- Falsifiable-criteria register: the work history reports in the mandated register (exit codes, test counts).

## 7. Findings

### CR-001 (low): published tarball ships dist/tsconfig.src.tsbuildinfo

The src project is composite, so tsc writes its buildinfo into outDir (dist/), and files ["dist"] sweeps it into the npm tarball (witnessed: package/dist/tsconfig.src.tsbuildinfo, ~52 KB of incremental-build metadata carrying absolute-ish file lists). Harmless at runtime but publish-hygiene noise and a determinism blemish M3 inherits. The implementer flagged it (environment warning 4) but left it. Not blocking: the package is private and unpublishable until M3. Concrete fix, any time before M3 first publish: set "tsBuildInfoFile": "./tsconfig.src.tsbuildinfo" (repo root, already covered by the *.tsbuildinfo ignore) in tsconfig.src.json, or add "!dist/*.tsbuildinfo" to the files array. One line either way; suggest folding into the M3 release phase's checklist so it is not lost.

### CR-002 (low): behavior-to-test mapping has no executable guard until M2

test/behaviors.json is accurate today (verified by script against the live node --test run), but nothing committed in this PR would catch a renamed or deleted test title in a later phase; node --test stays green and the mapping rots silently. This is plan-compliant (full discovery parity is explicitly the M2 wrapper's job, R-048; criterion 12 requires only existence and accuracy), so no change is required in this PR. Concrete fix: none here; the mitigation is procedural and lands on reviewers, so recording it: every M1 phase review from P2 to P6 must re-verify the mapping by name against the actual test run (as this review did), until the M2-P2 wrapper automates it. If the orchestrator prefers an executable guard earlier, a trivial accounting test in M1-P2 would close it, but that is added scope requiring plan sanction, not something this PR owes.

## 8. Honesty: what this review could not verify

- Node 26 semantics: all local execution ran on Node v22.22.2 (type stripping available since 22.18). Node-26-specific behavior was not locally exercised; the authority is the CI leg "test (26)", which is green on the head SHA (check-runs API), so the gap is covered by CI's witness rather than mine.
- The glob-quoting protection (PR-106, top-level test files surviving the arrival of test subdirectories) is untestable with a single test file; the pattern is quoted in package.json as mandated, and Node performs the globbing, but the failure mode it guards against cannot manifest yet.
- Fan-in behavior for cancelled and skipped legs is reasoned from GitHub Actions documented semantics (needs.<id>.result values and if: always()), not induced live; the success path and the check-name contract were witnessed live, the failure paths were not (inducing them would require pushing to the PR, which this review must not do).
- The DR-0004 ruleset is not yet created (owner action after merge), so "required check gates satisfied by the ruleset" is verified only to the extent that the delivered check name matches the ruleset JSON in DR-0004 verbatim.
- The work history's claimed local gate evidence (its exit codes) was not taken on trust: every claim that could be re-executed was re-executed and none diverged.

## Summary

| Criterion | Status | Evidence |
|---|---|---|
| 1 ci/build/test green, no prior build | MET | executed, exits 0/0/0, 2 tests, 0 unaccounted |
| 2 dist emitted, porcelain clean | MET | executed |
| 3 source/dist version parity | MET | executed, cmp byte-identical |
| 4 unknown subcommand exit 64 + usage | MET | executed |
| 5 package.json fields, LICENSE | MET | inspected; LICENSE byte-identical to canonical |
| 6 gates.yml shape | MET | inspected, silent-green analysis clean |
| 7 gates check green on PR | MET | check-runs API: "gates" success on d31bac8 |
| 8 four dirs tracked | MET | executed, 1 file each |
| 9 tsconfig flags | MET | inspected |
| 10 type-error witnesses | MET | re-executed, exits 1 and 2 |
| 11 pack/install/run | MET | executed end to end |
| 12 behaviors.json | MET | executed, mappings resolve |

Verdict: APPROVE. Findings: CR-001 (low), CR-002 (low), both non-blocking with named landing spots. Deviations 1 to 3: all accepted, necessity independently reproduced.
